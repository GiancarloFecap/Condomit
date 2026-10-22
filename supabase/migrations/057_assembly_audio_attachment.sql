BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_attach_assembly_transcript_audio_056(
  target_transcript_id BIGINT,
  audio_path_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := LOWER(COALESCE(public.condomit_auth_email(), ''));
  transcript_row public.assembly_transcripts%ROWTYPE;
  saved public.assembly_transcripts%ROWTYPE;
  owner_prefix TEXT;
BEGIN
  IF auth.uid() IS NULL OR caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO transcript_row FROM public.assembly_transcripts
  WHERE id = target_transcript_id AND LOWER(participant_email) = caller_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trecho não encontrado para este participante.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = transcript_row.assembly_id
      AND public.condomit_user_belongs_to_cep(sa.cep)
  ) THEN
    RAISE EXCEPTION 'Acesso à assembleia não permitido.' USING ERRCODE = '42501';
  END IF;
  owner_prefix := transcript_row.assembly_id::TEXT || '/trechos/' || auth.uid()::TEXT || '/';
  IF audio_path_value IS NULL OR LENGTH(audio_path_value) > 240
    OR LEFT(audio_path_value, LENGTH(owner_prefix)) <> owner_prefix
    OR audio_path_value !~ '\.(wav|webm|mp4)$' THEN
    RAISE EXCEPTION 'Referência de áudio inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'condomit-assembly-recordings'
      AND name = audio_path_value
  ) THEN
    RAISE EXCEPTION 'Arquivo de áudio não encontrado.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.assembly_transcripts SET audio_storage_path = audio_path_value
  WHERE id = target_transcript_id AND LOWER(participant_email) = caller_email
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_attach_assembly_transcript_audio_056(BIGINT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_attach_assembly_transcript_audio_056(BIGINT,TEXT) TO authenticated;

COMMIT;
