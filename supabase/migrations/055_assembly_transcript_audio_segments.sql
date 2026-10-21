BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/wav', 'audio/x-wav']::TEXT[]
WHERE id = 'condomit-assembly-recordings';

ALTER TABLE public.assembly_transcripts
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT;

CREATE INDEX IF NOT EXISTS idx_assembly_transcripts_audio_055
  ON public.assembly_transcripts(assembly_id)
  WHERE audio_storage_path IS NOT NULL;

DROP POLICY IF EXISTS condomit_transcript_audio_insert_055 ON storage.objects;
CREATE POLICY condomit_transcript_audio_insert_055 ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'condomit-assembly-recordings'
  AND (storage.foldername(name))[2] = 'trechos'
  AND (storage.foldername(name))[3] = auth.uid()::TEXT
  AND COALESCE((storage.foldername(name))[1], '') ~ '^[0-9]{1,18}$'
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = (storage.foldername(name))[1]::BIGINT
      AND public.condomit_user_belongs_to_cep(sa.cep)
      AND sa.status IN ('agendada', 'em_andamento')
  )
  AND name ~ '\.(wav|webm|mp4)$'
);

DROP POLICY IF EXISTS condomit_transcript_audio_delete_055 ON storage.objects;
CREATE POLICY condomit_transcript_audio_delete_055 ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'condomit-assembly-recordings'
  AND (storage.foldername(name))[2] = 'trechos'
  AND (storage.foldername(name))[3] = auth.uid()::TEXT
);

CREATE OR REPLACE FUNCTION public.condomit_append_assembly_transcript_audio_055(
  target_assembly_id BIGINT,
  transcript_text TEXT,
  participant_identity_value TEXT,
  transcript_source_value TEXT,
  confidence_value NUMERIC,
  audio_path_value TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  saved JSONB;
  object_row storage.objects%ROWTYPE;
  prefix TEXT := target_assembly_id::TEXT || '/trechos/' || auth.uid()::TEXT || '/';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  IF audio_path_value IS NULL OR LEFT(audio_path_value, LENGTH(prefix)) <> prefix
    OR audio_path_value !~ '\.(wav|webm|mp4)$'
    OR LENGTH(audio_path_value) > 240 THEN
    RAISE EXCEPTION 'Referência de áudio inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO object_row FROM storage.objects
  WHERE bucket_id = 'condomit-assembly-recordings'
    AND name = audio_path_value LIMIT 1;
  IF NOT FOUND OR COALESCE((object_row.metadata->>'size')::BIGINT, 0) <= 0
    OR COALESCE((object_row.metadata->>'size')::BIGINT, 0) > 10000000 THEN
    RAISE EXCEPTION 'Áudio inexistente ou com tamanho inválido.' USING ERRCODE = '22023';
  END IF;

  saved := public.condomit_append_assembly_transcript(
    target_assembly_id, transcript_text, participant_identity_value,
    transcript_source_value, confidence_value
  );

  UPDATE public.assembly_transcripts
  SET audio_storage_path = audio_path_value
  WHERE id = (saved->>'id')::BIGINT AND assembly_id = target_assembly_id
    AND LOWER(participant_email) = LOWER(public.condomit_auth_email());

  RETURN saved || jsonb_build_object('audio_storage_path', audio_path_value);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_append_assembly_transcript_audio_055(BIGINT,TEXT,TEXT,TEXT,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_append_assembly_transcript_audio_055(BIGINT,TEXT,TEXT,TEXT,NUMERIC,TEXT) TO authenticated;

COMMIT;
