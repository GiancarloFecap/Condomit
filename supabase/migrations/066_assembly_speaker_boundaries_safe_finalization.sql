BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_finalize_assembly(target_assembly_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  assembly_row public.scheduled_assemblies%ROWTYPE;
  finished_time TIME := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::TIME;
BEGIN
  IF caller_email = '' OR caller_role NOT IN ('sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode finalizar uma assembleia.' USING ERRCODE = '42501';
  END IF;

  SELECT sa.* INTO assembly_row
  FROM public.scheduled_assemblies sa
  WHERE sa.id = target_assembly_id
  FOR UPDATE;

  IF assembly_row.id IS NULL THEN
    RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.condomit_user_belongs_to_cep(assembly_row.cep::TEXT) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  IF LOWER(COALESCE(assembly_row.status, '')) IN ('encerrada','finalizada','completed','cancelada','cancelled') THEN
    RETURN jsonb_build_object('id', assembly_row.id, 'status', assembly_row.status, 'end_time', assembly_row.end_time, 'already_finished', TRUE);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assembly_recordings r
    WHERE r.assembly_id = target_assembly_id
      AND r.status IN ('pendente', 'gravando')
  ) THEN
    RAISE EXCEPTION 'A gravação está ativa. Finalize a assembleia pela ação segura do servidor para preservar o vídeo.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.scheduled_assemblies
  SET status = 'encerrada', end_time = finished_time, ended_at = NOW(), updated_at = NOW()
  WHERE id = target_assembly_id
  RETURNING * INTO assembly_row;

  RETURN jsonb_build_object(
    'id', assembly_row.id,
    'cep', assembly_row.cep,
    'status', assembly_row.status,
    'end_time', assembly_row.end_time,
    'finalized_by', caller_email,
    'already_finished', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_finalize_assembly(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_finalize_assembly(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_auto_identify_deepgram_065(target_recording_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved_count INTEGER := 0;
BEGIN
  DELETE FROM public.assembly_deepgram_speakers s
  WHERE s.recording_id = target_recording_id
    AND s.assignment_source = 'speech_activity';
  UPDATE public.assembly_transcripts t SET
    participant_email = 'transcricao-video@condomit.invalid',
    participant_name = 'Participante não identificado',
    participant_role = 'não identificado'
  WHERE t.recording_id = target_recording_id
    AND t.transcript_source = 'recording_video_deepgram'
    AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.assembly_deepgram_speakers s
      WHERE s.recording_id = t.recording_id
        AND s.speaker_index = (SUBSTRING(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER
        AND s.assignment_source = 'reviewed'
    );
  WITH pieces AS (
    SELECT t.assembly_id, t.recording_id,
      t.spoken_at - INTERVAL '0.20 second' AS begins,
      t.spoken_at + (GREATEST(0,COALESCE(t.end_seconds,0)-COALESCE(t.start_seconds,0))+0.20)*INTERVAL '1 second' AS ends,
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
      AND overlap_seconds>=total_seconds*0.78
      AND (runner_up=0 OR overlap_seconds>=runner_up*4)
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

COMMIT;
