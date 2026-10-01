-- Condomit v0.71.1
-- 1) Transcrição oficial gerada a partir da gravação
-- 2) Proprietário de item em Achados e Perdidos pode alterar o próprio status

BEGIN;

-- ---------------------------------------------------------------------------
-- ACHADOS E PERDIDOS: autor do registro também pode atualizar o próprio item.
-- Síndico/admin continuam podendo administrar itens do condomínio.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lost_and_found_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lost_and_found_items_update_policy ON public.lost_and_found_items;
DROP POLICY IF EXISTS condomit_lost_found_update_042 ON public.lost_and_found_items;

CREATE POLICY condomit_lost_found_update_042
ON public.lost_and_found_items
FOR UPDATE TO authenticated
USING (
  (
    LOWER(COALESCE(created_by, '')) = public.condomit_auth_email()
    AND public.condomit_user_belongs_to_cep(cep)
  )
  OR (
    public.condomit_user_belongs_to_cep(cep)
    AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  )
)
WITH CHECK (
  (
    LOWER(COALESCE(created_by, '')) = public.condomit_auth_email()
    AND public.condomit_user_belongs_to_cep(cep)
  )
  OR (
    public.condomit_user_belongs_to_cep(cep)
    AND LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  )
);

-- ---------------------------------------------------------------------------
-- TRANSCRIÇÃO DA GRAVAÇÃO
--
-- O cliente envia apenas trechos já filtrados pelo processamento do vídeo.
-- Esta função:
-- - só permite síndico/admin do mesmo condomínio;
-- - valida que o participante atribuído realmente pertence ao condomínio;
-- - substitui apenas transcrições automáticas originadas da gravação;
-- - aceita assembleia já encerrada, pois o texto é produzido após finalizar vídeo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_replace_recording_transcripts_042(
  target_assembly_id BIGINT,
  transcript_entries JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  assembly_row public.scheduled_assemblies%ROWTYPE;
  entry JSONB;
  entry_email TEXT;
  entry_name TEXT;
  entry_role TEXT;
  entry_identity TEXT;
  entry_text TEXT;
  entry_spoken_at TIMESTAMPTZ;
  saved_count INTEGER := 0;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='42501';
  END IF;

  SELECT *
  INTO assembly_row
  FROM public.scheduled_assemblies
  WHERE id = target_assembly_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE='22023';
  END IF;

  IF NOT public.condomit_user_belongs_to_cep(assembly_row.cep) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE='42501';
  END IF;

  IF caller_role NOT IN ('sindico','síndico','admin') THEN
    RAISE EXCEPTION 'Somente síndico/administrador pode registrar a transcrição oficial da gravação.' USING ERRCODE='42501';
  END IF;

  IF transcript_entries IS NULL OR jsonb_typeof(transcript_entries) <> 'array' THEN
    RAISE EXCEPTION 'Lista de transcrição inválida.' USING ERRCODE='22023';
  END IF;

  DELETE FROM public.assembly_transcripts
  WHERE assembly_id = target_assembly_id
    AND LOWER(COALESCE(transcript_source, source, '')) IN (
      'recording_whisper_local',
      'recording_video_whisper'
    );

  FOR entry IN SELECT value FROM jsonb_array_elements(transcript_entries)
  LOOP
    entry_email := LOWER(BTRIM(COALESCE(entry->>'participant_email', '')));
    entry_name := BTRIM(COALESCE(entry->>'participant_name', ''));
    entry_role := LOWER(BTRIM(COALESCE(entry->>'participant_role', 'morador')));
    entry_identity := BTRIM(COALESCE(entry->>'participant_identity', ''));
    entry_text := BTRIM(COALESCE(entry->>'transcript', ''));

    BEGIN
      entry_spoken_at := NULLIF(BTRIM(COALESCE(entry->>'spoken_at', '')), '')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      entry_spoken_at := NULL;
    END;

    IF entry_email = '' OR entry_text = '' OR CHAR_LENGTH(entry_text) > 4000 THEN
      CONTINUE;
    END IF;

    -- Não aceita atribuição de fala a alguém fora do condomínio.
    IF NOT EXISTS (
      SELECT 1
      FROM public.condomit_user_condo_ceps(entry_email) c
      WHERE public.condomit_same_cep(c.cep, assembly_row.cep)
    ) THEN
      CONTINUE;
    END IF;

    -- Prefere os dados reais da tabela users aos valores do navegador.
    SELECT
      COALESCE(NULLIF(BTRIM(u.name), ''), entry_name, entry_email),
      LOWER(COALESCE(NULLIF(BTRIM(u.user_type), ''), entry_role, 'morador'))
    INTO entry_name, entry_role
    FROM public.users u
    WHERE LOWER(COALESCE(u.email, '')) = entry_email
    LIMIT 1;

    INSERT INTO public.assembly_transcripts (
      assembly_id,
      cep,
      participant_email,
      participant_name,
      participant_role,
      participant_identity,
      transcript,
      source,
      spoken_at,
      confidence,
      transcript_source
    ) VALUES (
      assembly_row.id,
      assembly_row.cep,
      entry_email,
      COALESCE(NULLIF(entry_name, ''), entry_email),
      COALESCE(NULLIF(entry_role, ''), 'morador'),
      NULLIF(entry_identity, ''),
      entry_text,
      'recording_video_whisper',
      COALESCE(entry_spoken_at, NOW()),
      NULL,
      'recording_video_whisper'
    );

    saved_count := saved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'assembly_id', target_assembly_id,
    'saved_count', saved_count,
    'source', 'recording_video_whisper'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_replace_recording_transcripts_042(BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_replace_recording_transcripts_042(BIGINT, JSONB) TO authenticated;

COMMIT;
