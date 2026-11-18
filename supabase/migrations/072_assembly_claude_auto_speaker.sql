BEGIN;

-- Revalida automaticamente as vozes no callback e antes da redação da ata.
-- O detector do Deepgram separa as vozes, mas a associação a uma pessoa requer
-- intervalos de atividade de microfone da mesma assembleia.
CREATE OR REPLACE FUNCTION public.condomit_auto_identify_deepgram_072(target_recording_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  assigned INTEGER := 0;
  additional INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Processamento restrito ao servidor.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assembly_recordings r
    WHERE r.id = target_recording_id AND r.status = 'concluido'
      AND r.transcription_status = 'concluido') THEN
    RETURN 0;
  END IF;

  assigned := public.condomit_auto_identify_deepgram_065(target_recording_id);

  -- Casos curtos: somente se quase toda a fala corresponder ao MESMO microfone
  -- e nenhum outro participante disputar a atribuição.
  WITH segments AS (
    SELECT t.assembly_id, t.recording_id,
      (substring(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER AS speaker_index,
      t.spoken_at AS starts_at,
      t.spoken_at + make_interval(secs=>GREATEST(0,COALESCE(t.end_seconds,0)-COALESCE(t.start_seconds,0))) AS ends_at
    FROM public.assembly_transcripts t
    WHERE t.recording_id=target_recording_id
      AND t.transcript_source='recording_video_deepgram'
      AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
  ), totals AS (
    SELECT speaker_index, SUM(EXTRACT(EPOCH FROM ends_at-starts_at)) AS total_seconds
    FROM segments GROUP BY speaker_index
  ), candidates AS (
    SELECT s.speaker_index, LOWER(TRIM(a.participant_email)) AS email,
      SUM(GREATEST(0,EXTRACT(EPOCH FROM
        LEAST(s.ends_at,a.ended_at) - GREATEST(s.starts_at,a.started_at)))) AS overlap_seconds
    FROM segments s
    JOIN public.assembly_speech_activity a ON a.assembly_id=s.assembly_id
      AND a.started_at < s.ends_at AND a.ended_at > s.starts_at
    WHERE a.participant_email IS NOT NULL AND TRIM(a.participant_email) <> ''
    GROUP BY s.speaker_index, LOWER(TRIM(a.participant_email))
  ), ranked AS (
    SELECT c.*, t.total_seconds,
      ROW_NUMBER() OVER (PARTITION BY c.speaker_index ORDER BY c.overlap_seconds DESC,c.email) AS rank_speaker,
      LEAD(c.overlap_seconds,1,0) OVER (PARTITION BY c.speaker_index ORDER BY c.overlap_seconds DESC,c.email) AS second_score
    FROM candidates c JOIN totals t USING(speaker_index)
  ), reliable AS (
    SELECT r.speaker_index,r.email,
      LEAST(1,r.overlap_seconds / NULLIF(r.total_seconds,0))::NUMERIC(5,4) AS confidence
    FROM ranked r
    WHERE r.rank_speaker=1 AND r.total_seconds >= 2.5 AND r.overlap_seconds >= 2
      AND r.overlap_seconds >= r.total_seconds * 0.85
      AND (r.second_score = 0 OR r.overlap_seconds >= r.second_score * 4)
      AND NOT EXISTS (SELECT 1 FROM public.assembly_deepgram_speakers existing
        WHERE existing.recording_id=target_recording_id AND existing.speaker_index <> r.speaker_index
          AND LOWER(COALESCE(existing.participant_email,''))=r.email)
  ), unique_winners AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY email ORDER BY confidence DESC, speaker_index) AS row_num
    FROM reliable
  )
  INSERT INTO public.assembly_deepgram_speakers
    (recording_id,speaker_index,participant_email,assignment_source,confidence,updated_at)
  SELECT target_recording_id,speaker_index,email,'speech_activity',confidence,NOW()
  FROM unique_winners WHERE row_num=1
  ON CONFLICT (recording_id,speaker_index) DO UPDATE
    SET participant_email=EXCLUDED.participant_email,
        assignment_source='speech_activity',confidence=EXCLUDED.confidence,updated_at=NOW()
  WHERE public.assembly_deepgram_speakers.assignment_source <> 'reviewed'
    AND public.assembly_deepgram_speakers.participant_email IS NULL;

  GET DIAGNOSTICS additional = ROW_COUNT;
  PERFORM public.condomit_refresh_deepgram_names_064(target_recording_id);
  RETURN assigned + additional;
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_auto_identify_deepgram_072(BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_auto_identify_deepgram_072(BIGINT) TO service_role;

COMMIT;
