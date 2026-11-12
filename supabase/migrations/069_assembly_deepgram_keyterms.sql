BEGIN;

-- Auditoria associada à gravação e ao respectivo processamento Deepgram.
ALTER TABLE public.assembly_recordings
  ADD COLUMN IF NOT EXISTS deepgram_keyterm_audit JSONB;
ALTER TABLE public.assembly_deepgram_jobs
  ADD COLUMN IF NOT EXISTS keyterms_sent JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS keyterm_audit JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS model_used TEXT,
  ADD COLUMN IF NOT EXISTS fallback_to_nova2 BOOLEAN NOT NULL DEFAULT FALSE;

-- As correções são apenas sugestões para a redação da ata; a transcrição original permanece intocada.
CREATE TABLE IF NOT EXISTS public.assembly_minutes_correction_audit (
  assembly_id BIGINT PRIMARY KEY REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  observacoes_revisao JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assembly_minutes_correction_audit_array_check CHECK(jsonb_typeof(observacoes_revisao) = 'array')
);
ALTER TABLE public.assembly_minutes_correction_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assembly_minutes_correction_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_minutes_correction_audit TO service_role;

ALTER TABLE public.assembly_minutes_drafts
  ADD COLUMN IF NOT EXISTS observacoes_revisao JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE OR REPLACE FUNCTION public.condomit_fill_minutes_review_notes_069()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  SELECT a.observacoes_revisao INTO NEW.observacoes_revisao
  FROM public.assembly_minutes_correction_audit a
  WHERE a.assembly_id = NEW.assembly_id;
  IF NOT FOUND THEN
    NEW.observacoes_revisao := COALESCE(NEW.observacoes_revisao, '[]'::JSONB);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assembly_minutes_review_notes_069 ON public.assembly_minutes_drafts;
CREATE TRIGGER assembly_minutes_review_notes_069
BEFORE INSERT OR UPDATE OF body, status ON public.assembly_minutes_drafts
FOR EACH ROW EXECUTE FUNCTION public.condomit_fill_minutes_review_notes_069();

COMMIT;
