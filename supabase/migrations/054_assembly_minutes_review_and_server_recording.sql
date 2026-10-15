BEGIN;

-- A sequência é local a cada CEP, não usa o ID global da assembleia.
CREATE TABLE IF NOT EXISTS public.assembly_minutes_numbers (
  assembly_id BIGINT PRIMARY KEY REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  cep_digits TEXT NOT NULL CHECK (cep_digits ~ '^[0-9]{8}$'),
  minutes_number INTEGER NOT NULL CHECK (minutes_number > 0),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cep_digits, minutes_number)
);

WITH chronological AS (
  SELECT id AS assembly_id, regexp_replace(cep, '[^0-9]', '', 'g') AS cep_digits,
         ROW_NUMBER() OVER (
           PARTITION BY regexp_replace(cep, '[^0-9]', '', 'g')
           ORDER BY date ASC NULLS LAST, COALESCE(ended_at, created_at) ASC NULLS LAST, id ASC
         )::INTEGER AS minutes_number
  FROM public.scheduled_assemblies
  WHERE LOWER(COALESCE(status, '')) = 'encerrada'
)
INSERT INTO public.assembly_minutes_numbers (assembly_id, cep_digits, minutes_number)
SELECT assembly_id, cep_digits, minutes_number FROM chronological
WHERE cep_digits ~ '^[0-9]{8}$'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.condomit_number_completed_assembly_054()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE digits TEXT; new_num INTEGER;
BEGIN
  IF LOWER(COALESCE(NEW.status,'')) <> 'encerrada' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.assembly_minutes_numbers WHERE assembly_id=NEW.id) THEN RETURN NEW; END IF;
  digits := regexp_replace(COALESCE(NEW.cep,''),'[^0-9]','','g');
  IF digits !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'CEP inválido para numeração da ata.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('condomit-minutes-' || digits));
  SELECT COALESCE(MAX(minutes_number),0)+1 INTO new_num
  FROM public.assembly_minutes_numbers WHERE cep_digits=digits;
  INSERT INTO public.assembly_minutes_numbers(assembly_id,cep_digits,minutes_number)
  VALUES(NEW.id,digits,new_num) ON CONFLICT (assembly_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS condomit_number_completed_assembly_054 ON public.scheduled_assemblies;
CREATE TRIGGER condomit_number_completed_assembly_054 AFTER INSERT OR UPDATE OF status
ON public.scheduled_assemblies FOR EACH ROW
EXECUTE FUNCTION public.condomit_number_completed_assembly_054();

CREATE TABLE IF NOT EXISTS public.assembly_minutes_drafts (
  assembly_id BIGINT PRIMARY KEY REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  cep TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 30 AND 100000),
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','aprovada')),
  reviewed_by TEXT,
  approved_at TIMESTAMPTZ,
  saved_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assembly_minutes_drafts_cep ON public.assembly_minutes_drafts(cep);
ALTER TABLE public.assembly_minutes_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_minutes_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS condomit_minutes_numbers_read_054 ON public.assembly_minutes_numbers;
CREATE POLICY condomit_minutes_numbers_read_054 ON public.assembly_minutes_numbers
FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id=assembly_id AND public.condomit_user_belongs_to_cep(sa.cep))
);
DROP POLICY IF EXISTS condomit_minutes_drafts_read_054 ON public.assembly_minutes_drafts;
CREATE POLICY condomit_minutes_drafts_read_054 ON public.assembly_minutes_drafts
FOR SELECT TO authenticated USING(public.condomit_user_belongs_to_cep(cep));
REVOKE INSERT, UPDATE, DELETE ON public.assembly_minutes_drafts FROM anon,authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.assembly_minutes_numbers FROM anon,authenticated;
GRANT SELECT ON public.assembly_minutes_drafts TO authenticated;
GRANT SELECT ON public.assembly_minutes_numbers TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_review_assembly_minutes_054(
  target_assembly_id BIGINT, reviewed_text TEXT, approve_document BOOLEAN DEFAULT FALSE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.scheduled_assemblies%ROWTYPE;
  caller TEXT := LOWER(COALESCE(public.condomit_auth_email(),''));
  saved public.assembly_minutes_drafts%ROWTYPE;
BEGIN
  IF caller = '' OR LOWER(COALESCE(public.condomit_current_user_role(),'')) NOT IN ('sindico','síndico','admin') THEN
    RAISE EXCEPTION 'A revisão é restrita ao síndico autenticado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO item FROM public.scheduled_assemblies WHERE id=target_assembly_id;
  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(item.cep) THEN
    RAISE EXCEPTION 'Assembleia de outro condomínio ou inexistente.' USING ERRCODE='42501';
  END IF;
  IF approve_document AND item.status <> 'encerrada' THEN
    RAISE EXCEPTION 'A ata só pode ser aprovada após o encerramento da assembleia.';
  END IF;
  IF length(TRIM(COALESCE(reviewed_text,''))) < 30 THEN
    RAISE EXCEPTION 'A ata revisada precisa de conteúdo.';
  END IF;
  INSERT INTO public.assembly_minutes_drafts(assembly_id,cep,body,status,reviewed_by,approved_at,saved_by)
  VALUES(item.id,item.cep,TRIM(reviewed_text),
    CASE WHEN approve_document THEN 'aprovada' ELSE 'rascunho' END,
    CASE WHEN approve_document THEN caller ELSE NULL END,
    CASE WHEN approve_document THEN NOW() ELSE NULL END,caller)
  ON CONFLICT (assembly_id) DO UPDATE SET body=EXCLUDED.body,status=EXCLUDED.status,
    reviewed_by=EXCLUDED.reviewed_by, approved_at=EXCLUDED.approved_at,
    saved_by=caller,updated_at=NOW()
  RETURNING * INTO saved;
  IF NOT approve_document THEN
    DELETE FROM public.assembly_minutes_signatures WHERE assembly_id=item.id;
  END IF;
  RETURN to_jsonb(saved);
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_review_assembly_minutes_054(BIGINT,TEXT,BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_review_assembly_minutes_054(BIGINT,TEXT,BOOLEAN) TO authenticated;

-- Evita assinatura de uma transcrição/minuta ainda não aprovada.
CREATE OR REPLACE FUNCTION public.condomit_require_approved_minutes_054()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.assembly_minutes_drafts
    WHERE assembly_id=NEW.assembly_id AND status='aprovada') THEN
    RAISE EXCEPTION 'Revise e aprove a ata antes de assinar.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS condomit_require_approved_minutes_054 ON public.assembly_minutes_signatures;
CREATE TRIGGER condomit_require_approved_minutes_054 BEFORE INSERT OR UPDATE
ON public.assembly_minutes_signatures FOR EACH ROW
EXECUTE FUNCTION public.condomit_require_approved_minutes_054();

-- A gravação passa a ser enviada diretamente pelo LiveKit Egress (S3 compatível).
-- NULL significa sem limite configurado por bucket: limites da infraestrutura ainda se aplicam.
UPDATE storage.buckets SET file_size_limit=NULL
WHERE id='condomit-assembly-recordings';
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY assembly_id ORDER BY created_at DESC, id DESC) AS n
  FROM public.assembly_recordings WHERE status IN ('pendente','gravando')
)
UPDATE public.assembly_recordings r SET status='falhou'
WHERE r.id IN (SELECT id FROM ranked WHERE n>1);
CREATE UNIQUE INDEX IF NOT EXISTS idx_condomit_one_active_egress_054
ON public.assembly_recordings(assembly_id) WHERE status IN ('pendente','gravando');


CREATE TABLE IF NOT EXISTS public.assembly_signed_documents (
  id BIGSERIAL PRIMARY KEY,
  assembly_id BIGINT NOT NULL REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  cep TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  external_validation_status TEXT NOT NULL DEFAULT 'pendente' CHECK (external_validation_status IN ('pendente','validada','rejeitada'))
);
ALTER TABLE public.assembly_signed_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.assembly_signed_documents TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.assembly_signed_documents_id_seq TO authenticated;
DROP POLICY IF EXISTS condomit_assembly_signed_read_054 ON public.assembly_signed_documents;
CREATE POLICY condomit_assembly_signed_read_054 ON public.assembly_signed_documents
FOR SELECT TO authenticated USING (public.condomit_user_belongs_to_cep(cep));
DROP POLICY IF EXISTS condomit_assembly_signed_insert_054 ON public.assembly_signed_documents;
CREATE POLICY condomit_assembly_signed_insert_054 ON public.assembly_signed_documents
FOR INSERT TO authenticated WITH CHECK (
  LOWER(COALESCE(public.condomit_current_user_role(),'')) IN ('sindico','síndico','admin')
  AND LOWER(COALESCE(public.condomit_auth_email(),''))=LOWER(uploaded_by)
  AND public.condomit_user_belongs_to_cep(cep)
  AND EXISTS(SELECT 1 FROM public.scheduled_assemblies s
             WHERE s.id=assembly_id AND public.condomit_same_cep(s.cep,cep))
  AND storage_path LIKE assembly_id::TEXT || '/%.pdf'
);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('condomit-assembly-documents','condomit-assembly-documents',FALSE,52428800,ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS condomit_signed_pdf_upload_054 ON storage.objects;
CREATE POLICY condomit_signed_pdf_upload_054 ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='condomit-assembly-documents' AND
  LOWER(COALESCE(public.condomit_current_user_role(),'')) IN ('sindico','síndico','admin')
  AND EXISTS (SELECT 1 FROM public.scheduled_assemblies s
    WHERE (storage.foldername(name))[1] ~ '^[0-9]+$'
      AND s.id=((storage.foldername(name))[1])::BIGINT
      AND public.condomit_user_belongs_to_cep(s.cep))
);
DROP POLICY IF EXISTS condomit_signed_pdf_read_054 ON storage.objects;
CREATE POLICY condomit_signed_pdf_read_054 ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='condomit-assembly-documents' AND
  EXISTS (SELECT 1 FROM public.scheduled_assemblies s
    WHERE (storage.foldername(name))[1] ~ '^[0-9]+$'
      AND s.id=((storage.foldername(name))[1])::BIGINT
      AND public.condomit_user_belongs_to_cep(s.cep))
);


-- Permite concluir a transcrição das últimas falas enquanto a sala permanece em gravação.
CREATE OR REPLACE FUNCTION public.condomit_append_assembly_transcript(
  target_assembly_id BIGINT,
  transcript_text TEXT,
  participant_identity_value TEXT DEFAULT NULL,
  transcript_source_value TEXT DEFAULT 'browser',
  confidence_value NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_name TEXT;
  caller_role TEXT;
  assembly_row public.scheduled_assemblies%ROWTYPE;
  saved_row public.assembly_transcripts%ROWTYPE;
BEGIN
  IF caller_email = '' THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  IF NULLIF(TRIM(COALESCE(transcript_text, '')), '') IS NULL THEN RAISE EXCEPTION 'Transcrição vazia.' USING ERRCODE = '22023'; END IF;

  SELECT sa.* INTO assembly_row FROM public.scheduled_assemblies sa WHERE sa.id = target_assembly_id LIMIT 1;
  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(assembly_row.cep) THEN
    RAISE EXCEPTION 'Assembleia não encontrada neste condomínio.' USING ERRCODE = '42501';
  END IF;
  IF LOWER(COALESCE(assembly_row.status, '')) NOT IN ('agendada', 'em_andamento') AND NOT (
    LOWER(COALESCE(assembly_row.status,'')) = 'encerrada'
    AND (
      COALESCE(assembly_row.ended_at,NOW()) >= NOW() - INTERVAL '3 minutes'
      OR EXISTS (SELECT 1 FROM public.assembly_recordings r
                 WHERE r.assembly_id=assembly_row.id AND r.status='gravando')
    )
  ) THEN
    RAISE EXCEPTION 'A assembleia não está disponível para transcrição.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(u.name, ''), u.email), LOWER(COALESCE(u.user_type, 'morador'))
  INTO caller_name, caller_role FROM public.users u WHERE LOWER(COALESCE(u.email, '')) = caller_email LIMIT 1;

  INSERT INTO public.assembly_transcripts (
    assembly_id, cep, participant_email, participant_name, participant_role,
    participant_identity, transcript, source, spoken_at, confidence, transcript_source
  ) VALUES (
    assembly_row.id, assembly_row.cep, caller_email, COALESCE(caller_name, caller_email),
    COALESCE(caller_role, 'morador'), NULLIF(TRIM(COALESCE(participant_identity_value, '')), ''),
    TRIM(transcript_text), LEFT(COALESCE(NULLIF(TRIM(transcript_source_value), ''), 'browser'), 50), NOW(),
    CASE WHEN confidence_value BETWEEN 0 AND 1 THEN confidence_value ELSE NULL END,
    LEFT(COALESCE(NULLIF(TRIM(transcript_source_value), ''), 'browser'), 50)
  ) RETURNING * INTO saved_row;
  RETURN to_jsonb(saved_row);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_append_assembly_transcript(BIGINT,TEXT,TEXT,TEXT,NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_append_assembly_transcript(BIGINT,TEXT,TEXT,TEXT,NUMERIC) TO authenticated;
COMMIT;
