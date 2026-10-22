BEGIN;
ALTER TABLE public.assembly_recordings
  ADD COLUMN IF NOT EXISTS transcription_status TEXT NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS transcription_error TEXT,
  ADD COLUMN IF NOT EXISTS transcription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcription_finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcription_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcription_model TEXT;
ALTER TABLE public.assembly_recordings DROP CONSTRAINT IF EXISTS assembly_recordings_transcription_status_check;
ALTER TABLE public.assembly_recordings ADD CONSTRAINT assembly_recordings_transcription_status_check CHECK (transcription_status IN ('pendente','processando','concluido','falhou'));
ALTER TABLE public.assembly_transcripts
  ADD COLUMN IF NOT EXISTS recording_id BIGINT REFERENCES public.assembly_recordings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_seconds NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS end_seconds NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS idx_assembly_transcripts_recording_time_061 ON public.assembly_transcripts(recording_id, start_seconds);
CREATE INDEX IF NOT EXISTS idx_assembly_recordings_transcription_061 ON public.assembly_recordings(transcription_status, status, created_at);
COMMIT;
