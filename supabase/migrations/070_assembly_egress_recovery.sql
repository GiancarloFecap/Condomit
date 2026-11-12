BEGIN;

ALTER TABLE public.scheduled_assemblies
  ADD COLUMN IF NOT EXISTS recording_end_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recording_end_requested_by TEXT;

CREATE TABLE IF NOT EXISTS public.assembly_egress_diagnostics (
  recording_id BIGINT PRIMARY KEY REFERENCES public.assembly_recordings(id) ON DELETE CASCADE,
  remote_status TEXT,
  error_code INTEGER,
  error_message TEXT,
  details TEXT,
  backup_storage_used BOOLEAN NOT NULL DEFAULT FALSE,
  backup_location TEXT,
  backup_manifest TEXT,
  last_checked_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  recovery_status TEXT NOT NULL DEFAULT 'sem_backup'
    CHECK (recovery_status IN ('sem_backup','pendente','processando','falhou','concluido')),
  recovery_attempts INTEGER NOT NULL DEFAULT 0,
  recovery_error TEXT,
  last_recovery_at TIMESTAMPTZ
);
ALTER TABLE public.assembly_egress_diagnostics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.assembly_egress_diagnostics FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assembly_egress_diagnostics TO service_role;

-- A consulta antiga encerrava assembleias antes de pedir o fechamento do Egress.
-- Uma gravação pendente impede o encerramento automático até o arquivo ser tratado.
CREATE OR REPLACE FUNCTION public.condomit_close_stale_assemblies()
RETURNS TABLE(assembly_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT sa.id, EXISTS (
      SELECT 1 FROM public.assembly_attendance aa
      WHERE aa.assembly_id=sa.id AND LOWER(COALESCE(aa.presence_status,''))='presente'
      AND COALESCE(aa.last_heartbeat_at,aa.updated_at,aa.joined_at)>=NOW()-INTERVAL '2 minutes'
    ) AS active_attendee
    FROM public.scheduled_assemblies sa
    WHERE LOWER(COALESCE(sa.status,'')) IN ('agendada','em_andamento')
      AND (sa.date::DATE+sa.start_time::TIME) <= ((NOW() AT TIME ZONE 'America/Sao_Paulo')-INTERVAL '30 minutes')
      AND (sa.last_presence_check_at IS NULL OR sa.last_presence_check_at <= NOW()-INTERVAL '30 minutes')
  ), protected AS (
    SELECT e.id, e.active_attendee,
      EXISTS (SELECT 1 FROM public.assembly_recordings r WHERE r.assembly_id=e.id
        AND r.status IN ('pendente','gravando')) AS has_unfinished_egress
    FROM eligible e
  ), closing AS (
    UPDATE public.scheduled_assemblies sa SET status='encerrada', ended_at=COALESCE(sa.ended_at,NOW()),
      updated_at=NOW(),last_presence_check_at=NOW()
    FROM protected p WHERE sa.id=p.id AND NOT p.active_attendee AND NOT p.has_unfinished_egress
    RETURNING sa.id
  ), checking AS (
    UPDATE public.scheduled_assemblies sa SET last_presence_check_at=NOW(),updated_at=NOW()
    FROM protected p WHERE sa.id=p.id AND (p.active_attendee OR p.has_unfinished_egress)
    RETURNING sa.id
  ) SELECT closing.id FROM closing;
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_close_stale_assemblies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_close_stale_assemblies() TO service_role;
COMMIT;
