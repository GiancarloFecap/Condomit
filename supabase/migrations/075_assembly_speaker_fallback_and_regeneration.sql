BEGIN;

ALTER TABLE public.assembly_auto_minutes_jobs
  ADD COLUMN IF NOT EXISTS manual_request_at TIMESTAMPTZ;

-- Mantém as decisões revisadas manualmente e aceita a associação residual apenas
-- quando restar uma voz e um participante com evidência real de áudio, não por palpite.
CREATE OR REPLACE FUNCTION public.condomit_auto_identify_deepgram_075(target_recording_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
  baseline INTEGER := 0;
  added INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Identificação automática restrita ao servidor.' USING ERRCODE='42501';
  END IF;

  baseline := public.condomit_auto_identify_deepgram_074(target_recording_id);

  WITH unmatched AS (
    SELECT DISTINCT t.assembly_id,
      (SUBSTRING(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER AS speaker_index
    FROM public.assembly_transcripts t
    WHERE t.recording_id=target_recording_id
      AND t.transcript_source='recording_video_deepgram'
      AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
      AND NOT EXISTS (SELECT 1 FROM public.assembly_deepgram_speakers s
        WHERE s.recording_id=target_recording_id AND s.speaker_index=(SUBSTRING(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER
          AND s.participant_email IS NOT NULL)
  ), eligible AS (
    SELECT DISTINCT u.assembly_id,lower(btrim(a.user_email)) AS email
    FROM unmatched u JOIN public.assembly_attendance a ON a.assembly_id=u.assembly_id
    WHERE a.user_email IS NOT NULL AND btrim(a.user_email)<>''
      AND NOT EXISTS (SELECT 1 FROM public.assembly_deepgram_speakers s
        WHERE s.recording_id=target_recording_id AND lower(s.participant_email)=lower(btrim(a.user_email)))
      AND EXISTS (SELECT 1 FROM public.assembly_speech_activity activity
        WHERE activity.assembly_id=u.assembly_id AND lower(activity.participant_email)=lower(btrim(a.user_email)))
  ), unique_residual AS (
    SELECT u.assembly_id,u.speaker_index,e.email FROM unmatched u
    JOIN eligible e USING(assembly_id)
    WHERE (SELECT count(*) FROM unmatched)=1 AND (SELECT count(*) FROM eligible)=1
  ), intervals AS (
    SELECT t.assembly_id,t.spoken_at AS begins,
      t.spoken_at+make_interval(secs=>GREATEST(0,COALESCE(t.end_seconds,0)-COALESCE(t.start_seconds,0))) AS ends,
      (SUBSTRING(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER AS speaker_index
    FROM public.assembly_transcripts t
    WHERE t.recording_id=target_recording_id AND t.transcript_source='recording_video_deepgram'
      AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
  ), scores AS (
    SELECT u.speaker_index,u.email,
      (SELECT COALESCE(SUM(GREATEST(0,EXTRACT(EPOCH FROM LEAST(i.ends,a.ended_at)-GREATEST(i.begins,a.started_at)))),0)
       FROM intervals i JOIN public.assembly_speech_activity a
         ON a.assembly_id=u.assembly_id AND lower(a.participant_email)=u.email
         AND a.started_at<i.ends AND a.ended_at>i.begins
       WHERE i.speaker_index=u.speaker_index) AS seconds_matched,
      (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM i.ends-i.begins)),0)
       FROM intervals i WHERE i.assembly_id=u.assembly_id AND i.speaker_index=u.speaker_index) AS total_seconds
    FROM unique_residual u
  ), accepted AS (
    SELECT speaker_index,email,LEAST(1,seconds_matched/NULLIF(total_seconds,0))::NUMERIC(5,4) AS confidence
    FROM scores WHERE seconds_matched >= 2.5 AND total_seconds>=4 AND seconds_matched>=total_seconds*0.16
  )
  INSERT INTO public.assembly_deepgram_speakers
    (recording_id,speaker_index,participant_email,assignment_source,confidence,updated_at)
  SELECT target_recording_id,speaker_index,email,'speech_activity',confidence,NOW()
  FROM accepted
  ON CONFLICT (recording_id,speaker_index) DO UPDATE SET
    participant_email=EXCLUDED.participant_email,
    assignment_source='speech_activity',confidence=EXCLUDED.confidence,updated_at=NOW()
  WHERE public.assembly_deepgram_speakers.assignment_source <> 'reviewed'
    AND public.assembly_deepgram_speakers.participant_email IS NULL;

  GET DIAGNOSTICS added=ROW_COUNT;
  PERFORM public.condomit_refresh_deepgram_names_064(target_recording_id);
  RETURN baseline+added;
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_auto_identify_deepgram_075(BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_auto_identify_deepgram_075(BIGINT) TO service_role;

COMMIT;
