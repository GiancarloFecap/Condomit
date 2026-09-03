-- Condomit 0.66.0 - gravações privadas da assembleia + metadados de transcrição auditável

ALTER TABLE public.assembly_transcripts
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS transcript_source TEXT DEFAULT 'browser';

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
  IF LOWER(COALESCE(assembly_row.status, '')) NOT IN ('agendada', 'em_andamento') THEN
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

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('condomit-assembly-recordings','condomit-assembly-recordings',FALSE,1073741824,
  ARRAY['video/webm','video/mp4','audio/webm']::text[])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "condomit_assembly_recordings_upload" ON storage.objects;
CREATE POLICY "condomit_assembly_recordings_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='condomit-assembly-recordings'
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = NULLIF((storage.foldername(name))[1], '')::BIGINT
      AND LOWER(COALESCE(sa.created_by,'')) = LOWER(COALESCE(auth.email(),''))
  )
);

DROP POLICY IF EXISTS "condomit_assembly_recordings_read" ON storage.objects;
CREATE POLICY "condomit_assembly_recordings_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='condomit-assembly-recordings'
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = NULLIF((storage.foldername(name))[1], '')::BIGINT
      AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

DROP POLICY IF EXISTS "condomit_assembly_recordings_delete" ON storage.objects;
CREATE POLICY "condomit_assembly_recordings_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='condomit-assembly-recordings'
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = NULLIF((storage.foldername(name))[1], '')::BIGINT
      AND LOWER(COALESCE(sa.created_by,'')) = LOWER(COALESCE(auth.email(),''))
  )
);
