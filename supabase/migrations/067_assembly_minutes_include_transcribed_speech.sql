BEGIN;

CREATE OR REPLACE FUNCTION public.condomit_check_official_minutes_speech_067()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $condomit$
DECLARE
  section_text TEXT;
BEGIN
  IF NEW.status IS DISTINCT FROM 'aprovada' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assembly_transcripts AS t
    WHERE t.assembly_id = NEW.assembly_id
      AND t.transcript_source = 'recording_video_deepgram'
      AND LENGTH(BTRIM(COALESCE(t.transcript, ''))) >= 8
  ) THEN
    IF POSITION('MANIFESTAÇÕES DOS PARTICIPANTES' IN UPPER(COALESCE(NEW.body, ''))) = 0
       OR POSITION('DELIBERAÇÕES E VOTAÇÕES' IN UPPER(COALESCE(NEW.body, ''))) = 0 THEN
      RAISE EXCEPTION 'A ata deve incluir as manifestações dos participantes em discurso indireto antes da aprovação.' USING ERRCODE = '22023';
    END IF;

    section_text := SPLIT_PART(
      SPLIT_PART(UPPER(NEW.body), 'MANIFESTAÇÕES DOS PARTICIPANTES', 2),
      'DELIBERAÇÕES E VOTAÇÕES', 1
    );
    IF LENGTH(BTRIM(section_text)) < 45
       OR section_text LIKE '%SÍNTESE NARRATIVA DAS MANIFESTAÇÕES ESTÁ PENDENTE%'
       OR section_text LIKE '%NÃO FOI POSSÍVEL CONSOLIDAR AS MANIFESTAÇÕES%'
       OR section_text LIKE '%NENHUMA MANIFESTAÇÃO DISPONÍVEL%' THEN
      RAISE EXCEPTION 'Revise e registre as falas transcritas no texto da ata antes de aprová-la.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$condomit$;

DROP TRIGGER IF EXISTS assembly_minutes_speech_complete_067 ON public.assembly_minutes_drafts;
CREATE TRIGGER assembly_minutes_speech_complete_067
BEFORE INSERT OR UPDATE OF body, status ON public.assembly_minutes_drafts
FOR EACH ROW
EXECUTE FUNCTION public.condomit_check_official_minutes_speech_067();

REVOKE ALL ON FUNCTION public.condomit_check_official_minutes_speech_067() FROM PUBLIC, anon, authenticated;

COMMIT;
