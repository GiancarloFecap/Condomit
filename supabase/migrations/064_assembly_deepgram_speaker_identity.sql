BEGIN;

CREATE TABLE IF NOT EXISTS public.assembly_deepgram_speakers (
  recording_id BIGINT NOT NULL REFERENCES public.assembly_recordings(id) ON DELETE CASCADE,
  speaker_index INTEGER NOT NULL CHECK (speaker_index BETWEEN 0 AND 9999),
  participant_email TEXT,
  assignment_source TEXT NOT NULL CHECK (assignment_source IN ('speech_activity', 'reviewed')),
  confidence NUMERIC(5,4),
  assigned_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (recording_id, speaker_index)
);

ALTER TABLE public.assembly_deepgram_speakers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assembly_deepgram_speakers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.assembly_deepgram_speakers TO service_role;
GRANT SELECT ON public.assembly_deepgram_speakers TO authenticated;
DROP POLICY IF EXISTS assembly_deepgram_speakers_select_064 ON public.assembly_deepgram_speakers;
CREATE POLICY assembly_deepgram_speakers_select_064 ON public.assembly_deepgram_speakers
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.assembly_recordings ar
    JOIN public.scheduled_assemblies sa ON sa.id = ar.assembly_id
    WHERE ar.id = public.assembly_deepgram_speakers.recording_id AND public.condomit_user_belongs_to_cep(sa.cep)
  )
);

CREATE OR REPLACE FUNCTION public.condomit_tag_deepgram_speaker_064()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  speaker_number INTEGER;
BEGIN
  IF NEW.transcript_source IS DISTINCT FROM 'recording_video_deepgram' THEN RETURN NEW; END IF;
  IF NEW.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$' THEN RETURN NEW; END IF;
  IF NEW.participant_name ~ '^Falante ([1-9][0-9]{0,4})$' THEN
    speaker_number := (substring(NEW.participant_name FROM '^Falante ([1-9][0-9]{0,4})$'))::INTEGER - 1;
    IF speaker_number BETWEEN 0 AND 9999 THEN
      NEW.participant_identity := '__deepgram_speaker__:' || speaker_number::TEXT;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assembly_deepgram_speaker_identity_064 ON public.assembly_transcripts;
CREATE TRIGGER assembly_deepgram_speaker_identity_064
BEFORE INSERT ON public.assembly_transcripts
FOR EACH ROW EXECUTE FUNCTION public.condomit_tag_deepgram_speaker_064();

UPDATE public.assembly_transcripts
SET participant_identity = '__deepgram_speaker__:' ||
  ((substring(participant_name FROM '^Falante ([1-9][0-9]{0,4})$'))::INTEGER - 1)::TEXT
WHERE transcript_source = 'recording_video_deepgram'
  AND participant_identity IS NULL
  AND participant_name ~ '^Falante ([1-9][0-9]{0,4})$';

CREATE OR REPLACE FUNCTION public.condomit_refresh_deepgram_names_064(target_recording_id BIGINT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.assembly_transcripts t
  SET participant_email = COALESCE(s.participant_email, 'transcricao-video@condomit.invalid'),
      participant_name = CASE
        WHEN s.participant_email IS NULL THEN 'Participante não identificado'
        ELSE COALESCE(
          (SELECT NULLIF(BTRIM(u.name), '') FROM public.users u
           WHERE LOWER(u.email) = LOWER(s.participant_email) LIMIT 1),
          (SELECT NULLIF(BTRIM(a.participant_name), '') FROM public.assembly_attendance a
           WHERE a.assembly_id = t.assembly_id
             AND LOWER(a.user_email) = LOWER(s.participant_email) LIMIT 1),
          s.participant_email
        )
      END,
      participant_role = CASE WHEN s.participant_email IS NULL THEN 'não identificado'
        ELSE COALESCE((SELECT LOWER(u.user_type) FROM public.users u
          WHERE LOWER(u.email) = LOWER(s.participant_email) LIMIT 1), 'morador') END
  FROM public.assembly_deepgram_speakers s
  WHERE t.recording_id = target_recording_id
    AND t.transcript_source = 'recording_video_deepgram'
    AND t.participant_identity = '__deepgram_speaker__:' || s.speaker_index::TEXT
    AND s.recording_id = t.recording_id;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_refresh_deepgram_names_064(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_refresh_deepgram_names_064(BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.condomit_auto_identify_deepgram_064(target_recording_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  saved_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), 'service_role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Não autorizado.' USING ERRCODE='42501';
  END IF;
  WITH segments AS (
    SELECT t.assembly_id, t.recording_id, t.spoken_at,
      t.spoken_at + (GREATEST(0, COALESCE(t.end_seconds,0)-COALESCE(t.start_seconds,0)) * INTERVAL '1 second') AS segment_end,
      (substring(t.participant_identity FROM '^__deepgram_speaker__:([0-9]{1,4})$'))::INTEGER AS speaker_index
    FROM public.assembly_transcripts t
    WHERE t.recording_id = target_recording_id
      AND t.transcript_source = 'recording_video_deepgram'
      AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
  ),
  totals AS (
    SELECT speaker_index, SUM(EXTRACT(EPOCH FROM segment_end - spoken_at)) AS total_seconds
    FROM segments GROUP BY speaker_index
  ),
  scores AS (
    SELECT t.speaker_index, LOWER(a.participant_email) AS participant_email,
      SUM(GREATEST(0, EXTRACT(EPOCH FROM (
        LEAST(t.segment_end, a.ended_at) - GREATEST(t.spoken_at, a.started_at)
      )))) AS matched_seconds
    FROM segments t
    JOIN public.assembly_speech_activity a
      ON a.assembly_id = t.assembly_id
      AND a.started_at < t.segment_end AND a.ended_at > t.spoken_at
    GROUP BY t.speaker_index, LOWER(a.participant_email)
  ),
  ranked AS (
    SELECT scores.*, totals.total_seconds,
      ROW_NUMBER() OVER (PARTITION BY scores.speaker_index ORDER BY matched_seconds DESC, participant_email) AS rank_number,
      LEAD(matched_seconds, 1, 0) OVER (PARTITION BY scores.speaker_index ORDER BY matched_seconds DESC, participant_email) AS other_seconds
    FROM scores JOIN totals USING (speaker_index)
  ),
  confident AS (
    SELECT speaker_index, participant_email,
      LEAST(1, matched_seconds / NULLIF(total_seconds, 0))::NUMERIC(5,4) AS confidence
    FROM ranked WHERE rank_number = 1 AND matched_seconds >= 6
      AND total_seconds >= 8 AND matched_seconds >= total_seconds * 0.65
      AND (other_seconds = 0 OR matched_seconds >= other_seconds * 2.5)
  )
  INSERT INTO public.assembly_deepgram_speakers
    (recording_id, speaker_index, participant_email, assignment_source, confidence, updated_at)
  SELECT target_recording_id, speaker_index, participant_email, 'speech_activity', confidence, NOW()
  FROM confident
  ON CONFLICT (recording_id, speaker_index) DO UPDATE
    SET participant_email = EXCLUDED.participant_email,
        assignment_source = EXCLUDED.assignment_source,
        confidence = EXCLUDED.confidence, updated_at = NOW()
  WHERE public.assembly_deepgram_speakers.assignment_source <> 'reviewed';
  GET DIAGNOSTICS saved_count = ROW_COUNT;
  PERFORM public.condomit_refresh_deepgram_names_064(target_recording_id);
  RETURN saved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_auto_identify_deepgram_064(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_auto_identify_deepgram_064(BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.condomit_assign_deepgram_speaker_064(
  target_recording_id BIGINT, target_speaker_index INTEGER, selected_participant_email TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  assembly_cep TEXT;
  assembly_id_value BIGINT;
  caller_role TEXT;
  chosen_email TEXT := LOWER(NULLIF(BTRIM(COALESCE(selected_participant_email, '')), ''));
  chosen_name TEXT;
  saved_row public.assembly_deepgram_speakers%ROWTYPE;
BEGIN
  IF target_speaker_index IS NULL OR target_speaker_index NOT BETWEEN 0 AND 9999 THEN
    RAISE EXCEPTION 'Identificador de voz inválido.' USING ERRCODE='22023';
  END IF;
  SELECT a.assembly_id, sa.cep INTO assembly_id_value, assembly_cep
  FROM public.assembly_recordings a
  JOIN public.scheduled_assemblies sa ON sa.id = a.assembly_id
  WHERE a.id = target_recording_id AND a.status = 'concluido' AND a.transcription_model = 'deepgram:nova-3';
  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(assembly_cep) THEN
    RAISE EXCEPTION 'Gravação não autorizada.' USING ERRCODE='42501';
  END IF;
  SELECT LOWER(u.user_type) INTO caller_role FROM public.users u WHERE LOWER(u.email) = caller_email LIMIT 1;
  IF COALESCE(caller_role, '') NOT IN ('sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Somente síndico ou administrador pode validar a autoria da fala.' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assembly_minutes_drafts d
      WHERE d.assembly_id = assembly_id_value AND d.status = 'aprovada') THEN
    RAISE EXCEPTION 'A ata já foi aprovada; revise a aprovação antes de alterar a autoria.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.assembly_transcripts t
      WHERE t.recording_id = target_recording_id
        AND t.participant_identity = '__deepgram_speaker__:' || target_speaker_index::TEXT) THEN
    RAISE EXCEPTION 'A voz não foi localizada na gravação.' USING ERRCODE='22023';
  END IF;
  IF chosen_email IS NOT NULL THEN
    SELECT COALESCE(NULLIF(BTRIM(u.name), ''), NULLIF(BTRIM(a.participant_name), ''), chosen_email)
    INTO chosen_name
    FROM public.assembly_attendance a
    LEFT JOIN public.users u ON LOWER(u.email) = LOWER(a.user_email)
    WHERE a.assembly_id = assembly_id_value AND LOWER(a.user_email) = chosen_email LIMIT 1;
    IF chosen_name IS NULL THEN
      SELECT COALESCE(NULLIF(BTRIM(u.name), ''), NULLIF(BTRIM(s.participant_name), ''), chosen_email)
      INTO chosen_name
      FROM public.assembly_speech_activity s
      LEFT JOIN public.users u ON LOWER(u.email) = LOWER(s.participant_email)
      WHERE s.assembly_id = assembly_id_value AND LOWER(s.participant_email) = chosen_email LIMIT 1;
    END IF;
    IF chosen_name IS NULL THEN
      RAISE EXCEPTION 'Selecione uma pessoa que tenha participado da assembleia.' USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.assembly_deepgram_speakers
    (recording_id, speaker_index, participant_email, assignment_source, confidence, assigned_by, updated_at)
  VALUES (target_recording_id, target_speaker_index, chosen_email, 'reviewed', NULL, caller_email, NOW())
  ON CONFLICT (recording_id, speaker_index) DO UPDATE SET
    participant_email = EXCLUDED.participant_email,
    assignment_source = 'reviewed', confidence = NULL,
    assigned_by = EXCLUDED.assigned_by, updated_at = NOW()
  RETURNING * INTO saved_row;
  PERFORM public.condomit_refresh_deepgram_names_064(target_recording_id);
  RETURN jsonb_build_object('recording_id', saved_row.recording_id, 'speaker_index', saved_row.speaker_index,
    'participant_email', chosen_email, 'participant_name', chosen_name, 'source', 'reviewed');
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_assign_deepgram_speaker_064(BIGINT, INTEGER, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condomit_assign_deepgram_speaker_064(BIGINT, INTEGER, TEXT) TO authenticated;

DO $$
DECLARE
  stored_recording RECORD;
BEGIN
  FOR stored_recording IN
    SELECT DISTINCT t.recording_id AS id
    FROM public.assembly_transcripts t
    JOIN public.assembly_recordings r ON r.id = t.recording_id
    WHERE t.transcript_source = 'recording_video_deepgram'
      AND r.transcription_model = 'deepgram:nova-3'
      AND r.transcription_status = 'concluido'
      AND t.participant_identity ~ '^__deepgram_speaker__:[0-9]{1,4}$'
  LOOP
    PERFORM public.condomit_auto_identify_deepgram_064(stored_recording.id);
  END LOOP;
END $$;

COMMIT;
