BEGIN;

ALTER TABLE public.assembly_egress_diagnostics
  ADD COLUMN IF NOT EXISTS recovery_uploaded_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_total_bytes BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.condomit_prevent_unverified_assembly_end_071()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE
  expected BOOLEAN;
  invalid_recording BOOLEAN;
BEGIN
  IF NEW.status NOT IN ('encerrada','finalizada','completed','concluida','concluída','cancelada')
    OR OLD.status IN ('encerrada','finalizada','completed','concluida','concluída','cancelada') THEN RETURN NEW; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.assembly_recordings r WHERE r.assembly_id = NEW.id
  ) OR COALESCE(OLD.is_recording,FALSE) OR OLD.recording_end_requested_at IS NOT NULL
  INTO expected;
  IF NOT expected THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assembly_recordings r WHERE r.assembly_id=NEW.id) THEN
    RAISE EXCEPTION 'Não é possível encerrar: gravação esperada, mas não registrada.' USING ERRCODE='23514';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.assembly_recordings r
    WHERE r.assembly_id = NEW.id AND (
      r.status <> 'concluido'
      OR COALESCE(r.file_size_bytes,0) <= 0
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'condomit-assembly-recordings'
        AND o.name = REPLACE(r.recording_url,'storage://condomit-assembly-recordings/','')
        AND o.name LIKE NEW.id::TEXT || '/%.mp4'
        AND COALESCE((o.metadata->>'size')::BIGINT,0) = r.file_size_bytes
      )
    )
  ) INTO invalid_recording;
  IF invalid_recording THEN
    RAISE EXCEPTION 'Gravação pendente ou falhou: a assembleia não pode ser encerrada antes de confirmar o MP4 no Storage.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS condomit_prevent_unverified_assembly_end_071 ON public.scheduled_assemblies;
CREATE TRIGGER condomit_prevent_unverified_assembly_end_071
  BEFORE UPDATE OF status ON public.scheduled_assemblies
  FOR EACH ROW EXECUTE FUNCTION public.condomit_prevent_unverified_assembly_end_071();
REVOKE ALL ON FUNCTION public.condomit_prevent_unverified_assembly_end_071() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.condomit_close_stale_assemblies()
RETURNS TABLE(assembly_id BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH eligible AS (
    SELECT sa.id, EXISTS (
      SELECT 1 FROM public.assembly_attendance aa
      WHERE aa.assembly_id=sa.id
        AND LOWER(COALESCE(aa.presence_status,''))='presente'
        AND COALESCE(aa.last_heartbeat_at,aa.updated_at,aa.joined_at)>=NOW()-INTERVAL '2 minutes'
    ) AS active_attendee
    FROM public.scheduled_assemblies sa
    WHERE LOWER(COALESCE(sa.status,'')) IN ('agendada','em_andamento')
      AND (sa.date::DATE+sa.start_time::TIME) <= ((NOW() AT TIME ZONE 'America/Sao_Paulo')-INTERVAL '30 minutes')
      AND (sa.last_presence_check_at IS NULL OR sa.last_presence_check_at <= NOW()-INTERVAL '30 minutes')
  ), protected AS (
    SELECT e.id,e.active_attendee,
      EXISTS (SELECT 1 FROM public.assembly_recordings r WHERE r.assembly_id=e.id) AS has_recording,
      EXISTS (
        SELECT 1 FROM public.assembly_recordings r WHERE r.assembly_id=e.id AND (
          r.status<>'concluido' OR COALESCE(r.file_size_bytes,0)<=0 OR NOT EXISTS (
            SELECT 1 FROM storage.objects o WHERE o.bucket_id='condomit-assembly-recordings'
              AND o.name=REPLACE(r.recording_url,'storage://condomit-assembly-recordings/','')
              AND COALESCE((o.metadata->>'size')::BIGINT,0)=r.file_size_bytes
          )
        )
      ) AS has_incomplete,
      (COALESCE(sa.is_recording,FALSE) OR sa.recording_end_requested_at IS NOT NULL) AS expected_recording
    FROM eligible e JOIN public.scheduled_assemblies sa ON sa.id=e.id
  ), closing AS (
    UPDATE public.scheduled_assemblies sa
    SET status='encerrada', ended_at=COALESCE(sa.ended_at,NOW()), updated_at=NOW(),last_presence_check_at=NOW()
    FROM protected p WHERE sa.id=p.id AND NOT p.active_attendee AND NOT p.has_incomplete
      AND (NOT p.expected_recording OR p.has_recording)
    RETURNING sa.id
  ), checking AS (
    UPDATE public.scheduled_assemblies sa SET last_presence_check_at=NOW(),updated_at=NOW()
    FROM protected p WHERE sa.id=p.id AND (p.active_attendee OR p.has_incomplete OR (p.expected_recording AND NOT p.has_recording))
    RETURNING sa.id
  ) SELECT closing.id FROM closing;
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_close_stale_assemblies() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_close_stale_assemblies() TO service_role;
COMMIT;
