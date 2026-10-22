BEGIN;
ALTER TABLE public.assembly_recordings DROP CONSTRAINT IF EXISTS assembly_recordings_transcription_status_check;
ALTER TABLE public.assembly_recordings ADD CONSTRAINT assembly_recordings_transcription_status_check CHECK (transcription_status IN ('pendente', 'enfileirado', 'processando', 'concluido', 'falhou'));
ALTER TABLE public.assembly_recordings
  ADD COLUMN IF NOT EXISTS transcription_file_name TEXT,
  ADD COLUMN IF NOT EXISTS transcription_file_uri TEXT,
  ADD COLUMN IF NOT EXISTS transcription_cursor_seconds NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcription_total_seconds NUMERIC(12,2);
COMMIT;
