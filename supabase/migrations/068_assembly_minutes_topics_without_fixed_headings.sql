BEGIN;

-- Atas organizadas por assunto já não têm os títulos fixos exigidos pela 067.
-- A validação continua no banco; o síndico deve registrar manifestações antes da aprovação.
CREATE OR REPLACE FUNCTION public.condomit_check_official_minutes_speech_067()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $condomit$
DECLARE
  content TEXT := BTRIM(COALESCE(NEW.body,''));
BEGIN
  IF NEW.status IS DISTINCT FROM 'aprovada' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.assembly_transcripts t
    WHERE t.assembly_id = NEW.assembly_id
      AND t.transcript_source = 'recording_video_deepgram'
      AND LENGTH(BTRIM(COALESCE(t.transcript,''))) >= 8
  ) THEN
    IF LENGTH(content) < 180
       OR content ILIKE '%síntese narrativa das manifestações está pendente%'
       OR content ILIKE '%não foi possível consolidar as manifestações%'
       OR content ILIKE '%nenhuma manifestação disponível%'
       OR NOT (content ~* '(o|a)[[:space:]]+(síndico|síndica|morador|moradora|participante|irmão|irmã|tio|tia)[[:space:]]+')
    THEN
      RAISE EXCEPTION 'Revise a ata em discurso indireto, atribua as falas e registre os assuntos discutidos antes de aprová-la.' USING ERRCODE='22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT NULLIF(BTRIM(t.participant_name),'') AS name
        FROM public.assembly_transcripts t
        WHERE t.assembly_id = NEW.assembly_id
          AND t.transcript_source = 'recording_video_deepgram'
          AND LENGTH(BTRIM(COALESCE(t.transcript,''))) >= 20
          AND t.participant_email IS NOT NULL
          AND t.participant_email NOT ILIKE '%@condomit.invalid'
          AND t.participant_name !~* '^Falante [0-9]+'
      ) known
      WHERE known.name IS NOT NULL
        AND POSITION(LOWER(known.name) IN LOWER(content)) = 0
    ) THEN
      RAISE EXCEPTION 'Há manifestações atribuídas a moradores cujo nome não consta na ata. Confira todos os participantes antes da aprovação.' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$condomit$;

-- O gatilho existente assembly_minutes_speech_complete_067 continua ativo.
COMMIT;
