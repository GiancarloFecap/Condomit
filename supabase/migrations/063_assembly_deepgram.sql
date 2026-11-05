BEGIN;

CREATE TABLE IF NOT EXISTS public.assembly_deepgram_jobs (
  recording_id BIGINT PRIMARY KEY REFERENCES public.assembly_recordings(id) ON DELETE CASCADE,
  callback_token_hash TEXT NOT NULL CHECK (callback_token_hash ~ '^[0-9a-f]{64}$'),
  request_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.assembly_deepgram_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assembly_deepgram_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_deepgram_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.condomit_finish_deepgram_063(
  target_recording_id BIGINT,
  callback_token_hash_value TEXT,
  callback_request_id TEXT,
  transcript_segments JSONB,
  duration_seconds_value DOUBLE PRECISION DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job public.assembly_deepgram_jobs%ROWTYPE;
  recording public.assembly_recordings%ROWTYPE;
  item JSONB;
  condo_cep TEXT;
  segment_start DOUBLE PRECISION;
  segment_end DOUBLE PRECISION;
  segment_text TEXT;
  segment_speaker TEXT;
  segment_confidence DOUBLE PRECISION;
  baseline TIMESTAMPTZ;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Não autorizado.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(transcript_segments) IS DISTINCT FROM 'array' OR jsonb_array_length(transcript_segments) > 20000 THEN
    RAISE EXCEPTION 'Lista de trechos inválida.';
  END IF;
  SELECT * INTO job FROM public.assembly_deepgram_jobs WHERE recording_id = target_recording_id FOR UPDATE;
  IF NOT FOUND OR job.callback_token_hash IS DISTINCT FROM callback_token_hash_value THEN
    RETURN 'ignored';
  END IF;
  IF job.request_id IS NOT NULL AND callback_request_id IS DISTINCT FROM job.request_id THEN
    RETURN 'ignored';
  END IF;
  SELECT * INTO recording FROM public.assembly_recordings WHERE id = target_recording_id FOR UPDATE;
  IF NOT FOUND OR recording.status <> 'concluido' OR recording.transcription_model <> 'deepgram:nova-3' THEN
    RETURN 'ignored';
  END IF;
  IF job.completed_at IS NOT NULL AND recording.transcription_status = 'concluido' THEN
    RETURN 'duplicate';
  END IF;
  IF recording.transcription_status NOT IN ('processando', 'enfileirado') THEN
    RETURN 'ignored';
  END IF;
  SELECT cep INTO condo_cep FROM public.scheduled_assemblies WHERE id = recording.assembly_id;
  IF condo_cep IS NULL THEN
    RAISE EXCEPTION 'Condomínio da gravação não encontrado.';
  END IF;
  baseline := COALESCE(recording.started_at, recording.created_at, NOW());
  DELETE FROM public.assembly_transcripts
  WHERE recording_id = target_recording_id
    AND transcript_source IN ('recording_video_deepgram', 'recording_video_whisper', 'recording_gemini');
  FOR item IN SELECT value FROM jsonb_array_elements(transcript_segments) AS source(value)
  LOOP
    segment_text := btrim(COALESCE(item->>'text', ''));
    IF length(segment_text) = 0 THEN CONTINUE; END IF;
    IF length(segment_text) > 4000 THEN RAISE EXCEPTION 'Trecho excede 4000 caracteres.'; END IF;
    segment_start := GREATEST(0, COALESCE((item->>'start')::DOUBLE PRECISION, 0));
    segment_end := GREATEST(segment_start, COALESCE((item->>'end')::DOUBLE PRECISION, segment_start));
    IF segment_start > 86400 OR segment_end > 86400 THEN RAISE EXCEPTION 'Intervalo inválido.'; END IF;
    segment_speaker := CASE
      WHEN (item->>'speaker') ~ '^[0-9]{1,4}$' THEN 'Falante ' || ((item->>'speaker')::INTEGER + 1)
      ELSE 'Falante não identificado'
    END;
    segment_confidence := CASE
      WHEN (item->>'confidence') ~ '^(0(\.[0-9]+)?|1(\.0+)?)$' THEN (item->>'confidence')::DOUBLE PRECISION
      ELSE NULL
    END;
    INSERT INTO public.assembly_transcripts (
      assembly_id, recording_id, cep, participant_email, participant_name,
      participant_role, participant_identity, transcript, source, transcript_source,
      spoken_at, start_seconds, end_seconds, confidence
    ) VALUES (
      recording.assembly_id, recording.id, condo_cep,
      'transcricao-video@condomit.invalid', segment_speaker,
      'não identificado', NULL, segment_text, 'recording_video_deepgram', 'recording_video_deepgram',
      baseline + make_interval(secs => segment_start), segment_start, segment_end, segment_confidence
    );
  END LOOP;
  UPDATE public.assembly_recordings SET
    transcription_status = 'concluido', transcription_error = NULL,
    transcription_finished_at = NOW(), transcription_attempts = 0,
    transcription_model = 'deepgram:nova-3',
    transcription_cursor_seconds = COALESCE(duration_seconds_value, duration_seconds, 0),
    transcription_total_seconds = COALESCE(duration_seconds_value, duration_seconds, 0)
  WHERE id = target_recording_id;
  UPDATE public.assembly_deepgram_jobs SET completed_at = NOW() WHERE recording_id = target_recording_id;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_finish_deepgram_063(BIGINT, TEXT, TEXT, JSONB, DOUBLE PRECISION)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_finish_deepgram_063(BIGINT, TEXT, TEXT, JSONB, DOUBLE PRECISION) TO service_role;

COMMIT;
