CREATE OR REPLACE FUNCTION public.condomit_start_assembly_agenda_058(target_assembly_id BIGINT, target_agenda_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  assembly_row public.scheduled_assemblies%ROWTYPE;
  agenda_row public.assembly_agenda_items%ROWTYPE;
  caller TEXT := LOWER(COALESCE(public.condomit_auth_email(), ''));
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  closed_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR caller = '' THEN
    RAISE EXCEPTION 'Entre na sua conta para gerenciar a pauta.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO assembly_row FROM public.scheduled_assemblies WHERE id = target_assembly_id FOR UPDATE;
  IF NOT FOUND OR NOT public.condomit_user_belongs_to_cep(assembly_row.cep) THEN
    RAISE EXCEPTION 'Assembleia inexistente ou de outro condomínio.' USING ERRCODE = '42501';
  END IF;
  IF caller_role NOT IN ('sindico','síndico','admin') AND LOWER(COALESCE(assembly_row.created_by,'')) <> caller THEN
    RAISE EXCEPTION 'Somente o síndico ou organizador pode iniciar uma pauta.' USING ERRCODE = '42501';
  END IF;
  IF assembly_row.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'A assembleia precisa estar em andamento.';
  END IF;
  SELECT * INTO agenda_row FROM public.assembly_agenda_items
  WHERE id = target_agenda_id AND assembly_id = target_assembly_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta pauta não pertence à assembleia.';
  END IF;
  IF agenda_row.status <> 'nao_iniciada' THEN
    RAISE EXCEPTION 'Esta pauta já foi iniciada ou concluída.';
  END IF;
  UPDATE public.assembly_agenda_items
  SET status = 'concluida', updated_at = now()
  WHERE assembly_id = target_assembly_id AND status IN ('em_discussao','em_votacao');
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  UPDATE public.assembly_agenda_items
  SET status = 'em_discussao', updated_at = now()
  WHERE id = target_agenda_id AND assembly_id = target_assembly_id;
  RETURN jsonb_build_object('ok', true, 'agenda_item_id', target_agenda_id, 'previous_closed', closed_count);
END;
$$;
REVOKE ALL ON FUNCTION public.condomit_start_assembly_agenda_058(BIGINT,BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.condomit_start_assembly_agenda_058(BIGINT,BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_validate_poll_agenda_058()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.agenda_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.assembly_agenda_items
    WHERE id = NEW.agenda_item_id AND assembly_id = NEW.assembly_id AND cep = NEW.cep
  ) THEN
    RAISE EXCEPTION 'A pauta vinculada não pertence à assembleia.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS condomit_poll_agenda_check_058 ON public.assembly_polls;
CREATE TRIGGER condomit_poll_agenda_check_058
BEFORE INSERT OR UPDATE OF agenda_item_id,assembly_id,cep
ON public.assembly_polls
FOR EACH ROW EXECUTE FUNCTION public.condomit_validate_poll_agenda_058();
