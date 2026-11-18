BEGIN;

CREATE TABLE IF NOT EXISTS public.assembly_auto_minutes_jobs (
  assembly_id BIGINT PRIMARY KEY REFERENCES public.scheduled_assemblies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','processando','falhou','concluido','bloqueado')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  generated_body TEXT,
  saved_to_draft BOOLEAN NOT NULL DEFAULT FALSE,
  source_hash TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assembly_auto_minutes_jobs_status_073
  ON public.assembly_auto_minutes_jobs(status, next_retry_at);

ALTER TABLE public.assembly_auto_minutes_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assembly_auto_minutes_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assembly_auto_minutes_jobs TO authenticated;
GRANT ALL ON TABLE public.assembly_auto_minutes_jobs TO service_role;

DROP POLICY IF EXISTS assembly_auto_minutes_jobs_read_073 ON public.assembly_auto_minutes_jobs;
CREATE POLICY assembly_auto_minutes_jobs_read_073
ON public.assembly_auto_minutes_jobs FOR SELECT TO authenticated
USING (
  LOWER(COALESCE(public.condomit_current_user_role(), '')) IN ('sindico','síndico','admin')
  AND EXISTS (
    SELECT 1 FROM public.scheduled_assemblies sa
    WHERE sa.id = assembly_auto_minutes_jobs.assembly_id
      AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

COMMIT;
