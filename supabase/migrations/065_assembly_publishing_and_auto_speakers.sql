BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_assembly_details_visible_065(target_assembly_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  meeting_status TEXT;
  meeting_cep TEXT;
  role_name TEXT;
BEGIN
  IF target_assembly_id IS NULL OR auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT LOWER(COALESCE(a.status, '')), a.cep INTO meeting_status, meeting_cep
  FROM public.scheduled_assemblies a WHERE a.id = target_assembly_id;
  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(meeting_cep) THEN RETURN FALSE; END IF;
  role_name := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  IF role_name IN ('sindico', 'síndico', 'admin') THEN RETURN TRUE; END IF;
  IF meeting_status NOT IN ('encerrada', 'finalizada', 'completed', 'concluida', 'concluída', 'cancelada', 'cancelled', 'canceled') THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.assembly_minutes_drafts d
    JOIN public.assembly_minutes_signatures s ON s.assembly_id = d.assembly_id
    WHERE d.assembly_id = target_assembly_id AND d.status = 'aprovada'
      AND d.approved_at IS NOT NULL AND s.signed_at >= d.approved_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_assembly_details_visible_065(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condomit_assembly_details_visible_065(BIGINT) TO authenticated, service_role;

DO $$
DECLARE
  tbl TEXT;
  target TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'scheduled_assemblies', 'assembly_agenda_items', 'assembly_attendance',
    'assembly_chat_messages', 'assembly_documents', 'assembly_event_logs',
    'assembly_minutes_drafts', 'assembly_minutes_numbers', 'assembly_minutes_signatures',
    'assembly_participant_confirmations', 'assembly_polls', 'assembly_post_comments',
    'assembly_post_comment_votes', 'assembly_recordings', 'assembly_signed_documents',
    'assembly_speaking_requests', 'assembly_speech_activity', 'assembly_tasks',
    'assembly_transcripts', 'assembly_votes'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN CONTINUE; END IF;
    target := FORMAT('public.condomit_assembly_details_visible_065(%I.%s)',tbl,CASE WHEN tbl='scheduled_assemblies' THEN 'id' ELSE 'assembly_id' END);
    EXECUTE FORMAT('DROP POLICY IF EXISTS condomit_details_publish_select_065 ON public.%I', tbl);
    EXECUTE FORMAT('CREATE POLICY condomit_details_publish_select_065 ON public.%I AS RESTRICTIVE FOR SELECT TO PUBLIC USING (%s)',tbl,target);
  END LOOP;
  IF to_regclass('public.assembly_poll_options') IS NOT NULL THEN
    DROP POLICY IF EXISTS condomit_details_publish_select_065 ON public.assembly_poll_options;
    CREATE POLICY condomit_details_publish_select_065 ON public.assembly_poll_options
    AS RESTRICTIVE FOR SELECT TO PUBLIC USING (
      EXISTS (SELECT 1 FROM public.assembly_polls p WHERE p.id = assembly_poll_options.poll_id
        AND public.condomit_assembly_details_visible_065(p.assembly_id))
    );
  END IF;
  IF to_regclass('public.assembly_deepgram_speakers') IS NOT NULL THEN
    DROP POLICY IF EXISTS condomit_details_publish_select_065 ON public.assembly_deepgram_speakers;
    CREATE POLICY condomit_details_publish_select_065 ON public.assembly_deepgram_speakers
    AS RESTRICTIVE FOR SELECT TO PUBLIC USING (
      EXISTS (SELECT 1 FROM public.assembly_recordings r WHERE r.id = assembly_deepgram_speakers.recording_id
        AND public.condomit_assembly_details_visible_065(r.assembly_id))
    );
  END IF;
END $$;

DROP POLICY IF EXISTS condomit_details_publish_storage_065 ON storage.objects;
CREATE POLICY condomit_details_publish_storage_065 ON storage.objects
AS RESTRICTIVE FOR SELECT TO PUBLIC USING (
  bucket_id NOT IN ('condomit-assembly-recordings', 'condomit-assembly-documents')
  OR (
    (storage.foldername(name))[1] ~ '^[0-9]{1,18}$'
    AND public.condomit_assembly_details_visible_065(
      CASE WHEN (storage.foldername(name))[1] ~ '^[0-9]{1,18}$'
        THEN (storage.foldername(name))[1]::BIGINT ELSE NULL END
    )
  )
);

CREATE OR REPLACE FUNCTION public.condomit_assembly_poll_results(target_assembly_id BIGINT)
RETURNS TABLE(poll_id BIGINT, option_id BIGINT, vote_count BIGINT, current_user_voted BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ap.id, apo.id,
    (SELECT COUNT(*)::BIGINT FROM public.assembly_votes v WHERE v.poll_id = ap.id AND v.option_id = apo.id),
    EXISTS (SELECT 1 FROM public.assembly_votes mine WHERE mine.poll_id = ap.id
      AND LOWER(COALESCE(mine.user_email,'')) = public.condomit_auth_email())
  FROM public.assembly_polls ap
  JOIN public.assembly_poll_options apo ON apo.poll_id = ap.id
  WHERE ap.assembly_id = target_assembly_id
    AND public.condomit_assembly_details_visible_065(target_assembly_id)
    AND (EXISTS (SELECT 1 FROM public.scheduled_assemblies sa WHERE sa.id=target_assembly_id
      AND LOWER(COALESCE(sa.status,''))='encerrada')
      OR COALESCE(ap.show_results_immediately,FALSE)
      OR LOWER(COALESCE(ap.status,''))='encerrada'
      OR (ap.end_at IS NOT NULL AND ap.end_at <= NOW())
      OR LOWER(COALESCE(ap.created_by,''))=public.condomit_auth_email())
  ORDER BY ap.id, apo.display_order, apo.id;
$$;

CREATE OR REPLACE FUNCTION public.condomit_assembly_comment_profiles(target_assembly_id BIGINT)
RETURNS TABLE(email TEXT, name TEXT, profile_photo TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.condomit_assembly_details_visible_065(target_assembly_id) THEN
    RAISE EXCEPTION 'Os detalhes da assembleia ainda não foram publicados.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT DISTINCT u.email::TEXT,
    COALESCE(NULLIF(BTRIM(u.name),''),u.email)::TEXT, u.profile_photo::TEXT
  FROM public.assembly_post_comments c
  JOIN public.users u ON LOWER(COALESCE(u.email,'')) = LOWER(COALESCE(c.user_email,''))
  JOIN public.scheduled_assemblies sa ON sa.id = c.assembly_id
  WHERE c.assembly_id = target_assembly_id
    AND public.condomit_same_cep(c.cep::TEXT,sa.cep::TEXT)
  ORDER BY 2;
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_assembly_comment_profiles(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condomit_assembly_comment_profiles(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_auto_identify_deepgram_065(target_recording_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved_count INTEGER := 0;
BEGIN
  WITH pieces AS (
    SELECT t.assembly_id, t.recording_id,
      t.spoken_at - INTERVAL '1 second' AS begins,
      t.spoken_at + (GREATEST(0,COALESCE(t.end_seconds,0)-COALESCE(t.start_seconds,0))+1)*INTERVAL '1 second' AS ends,
      (SUBSTRING(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER speaker_index
    FROM public.assembly_transcripts t
    WHERE t.recording_id = target_recording_id AND t.transcript_source='recording_video_deepgram'
      AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
  ),
  totals AS (
    SELECT speaker_index, SUM(EXTRACT(EPOCH FROM ends-begins)) AS total_seconds
    FROM pieces GROUP BY speaker_index
  ),
  candidate AS (
    SELECT p.speaker_index, LOWER(BTRIM(a.participant_email)) AS email,
      SUM(GREATEST(0,EXTRACT(EPOCH FROM LEAST(p.ends,a.ended_at)-GREATEST(p.begins,a.started_at)))) AS overlap_seconds
    FROM pieces p JOIN public.assembly_speech_activity a
      ON a.assembly_id=p.assembly_id AND a.started_at < p.ends AND a.ended_at > p.begins
    WHERE a.participant_email IS NOT NULL AND BTRIM(a.participant_email) <> ''
    GROUP BY p.speaker_index,LOWER(BTRIM(a.participant_email))
  ),
  ranked AS (
    SELECT c.*, t.total_seconds,
      ROW_NUMBER() OVER (PARTITION BY c.speaker_index ORDER BY c.overlap_seconds DESC,c.email) n,
      LEAD(c.overlap_seconds,1,0) OVER (PARTITION BY c.speaker_index ORDER BY c.overlap_seconds DESC,c.email) runner_up
    FROM candidate c JOIN totals t USING(speaker_index)
  ),
  reliable AS (
    SELECT speaker_index,email,LEAST(1,overlap_seconds/NULLIF(total_seconds,0))::NUMERIC(5,4) confidence
    FROM ranked WHERE n=1 AND overlap_seconds>=4 AND total_seconds>=5
      AND overlap_seconds>=total_seconds*0.68
      AND (runner_up=0 OR overlap_seconds>=runner_up*3)
  ),
  unique_winners AS (
    SELECT *,ROW_NUMBER() OVER (PARTITION BY email ORDER BY confidence DESC,speaker_index) win
    FROM reliable
  )
  INSERT INTO public.assembly_deepgram_speakers
    (recording_id,speaker_index,participant_email,assignment_source,confidence,updated_at)
  SELECT target_recording_id,speaker_index,email,'speech_activity',confidence,NOW()
  FROM unique_winners WHERE win=1
  ON CONFLICT (recording_id,speaker_index) DO UPDATE SET
    participant_email=EXCLUDED.participant_email,assignment_source='speech_activity',
    confidence=EXCLUDED.confidence,updated_at=NOW()
  WHERE public.assembly_deepgram_speakers.assignment_source <> 'reviewed';
  GET DIAGNOSTICS saved_count = ROW_COUNT;
  PERFORM public.condomit_refresh_deepgram_names_064(target_recording_id);
  RETURN saved_count;
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_auto_identify_deepgram_065(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_auto_identify_deepgram_065(BIGINT) TO service_role;

DO $$
DECLARE existing_recording RECORD;
BEGIN
  FOR existing_recording IN
    SELECT r.id FROM public.assembly_recordings r
    WHERE r.transcription_model='deepgram:nova-3' AND r.transcription_status='concluido'
      AND EXISTS (SELECT 1 FROM public.assembly_transcripts t WHERE t.recording_id=r.id
        AND t.transcript_source='recording_video_deepgram')
  LOOP
    PERFORM public.condomit_auto_identify_deepgram_065(existing_recording.id);
  END LOOP;
END $$;

COMMIT;
