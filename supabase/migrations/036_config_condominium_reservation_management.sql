-- ============================================================
-- CONDOMIT 0.56.0
-- Configurações: reservas/áreas comuns e edição do condomínio.
-- ============================================================

-- Todos os membros do condomínio podem consultar a agenda de reservas.
DROP FUNCTION IF EXISTS public.condomit_list_condominium_reservations_036();
CREATE OR REPLACE FUNCTION public.condomit_list_condominium_reservations_036()
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'email', LOWER(COALESCE(r.email, '')),
    'resident_name', COALESCE(NULLIF(BTRIM(u.name), ''), 'Morador'),
    'nome_local', r.nome_local,
    'data_reserva', r.data_reserva,
    'horario_inicio', r.horario_inicio,
    'horario_fim', r.horario_fim,
    'status', r.status
  )
  FROM public.reserva r
  LEFT JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(r.email, ''))
  WHERE EXISTS (
    SELECT 1
    FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
      AND public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
  )
  OR EXISTS (
    SELECT 1
    FROM public.users legacy
    WHERE LOWER(COALESCE(legacy.email, '')) = LOWER(COALESCE(r.email, ''))
      AND public.condomit_same_cep(
        COALESCE(legacy.condominium->>'cep', legacy.condominium->>'condominium_id', legacy.condominium->>'condominiumId', ''),
        caller_cep
      )
  )
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_list_condominium_reservations_036() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_list_condominium_reservations_036() TO authenticated;

-- Retorna os dados atuais do condomínio e a lista de espaços reserváveis.
DROP FUNCTION IF EXISTS public.condomit_get_condominium_settings_036();
CREATE OR REPLACE FUNCTION public.condomit_get_condominium_settings_036()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_cep TEXT := public.condomit_current_user_cep();
  result JSONB;
BEGIN
  IF public.condomit_auth_email() = '' OR caller_cep IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(c)
    INTO result
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep::TEXT, caller_cep)
  LIMIT 1;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_get_condominium_settings_036() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_get_condominium_settings_036() TO authenticated;

-- Apenas síndico pode alterar a lista de espaços.
DROP FUNCTION IF EXISTS public.condomit_set_condominium_spaces_036(JSONB);
CREATE OR REPLACE FUNCTION public.condomit_set_condominium_spaces_036(target_spaces JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_cep TEXT := public.condomit_current_user_cep();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  normalized JSONB := '[]'::JSONB;
  item JSONB;
  item_name TEXT;
  item_desc TEXT;
  item_capacity INTEGER;
BEGIN
  IF public.condomit_auth_email() = '' OR caller_cep IS NULL OR caller_role NOT IN ('sindico','síndico','admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode gerenciar os espaços do condomínio.' USING ERRCODE='42501';
  END IF;

  IF target_spaces IS NULL OR jsonb_typeof(target_spaces) <> 'array' THEN
    RAISE EXCEPTION 'A lista de espaços é inválida.' USING ERRCODE='22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(target_spaces)
  LOOP
    item_name := NULLIF(BTRIM(COALESCE(item->>'name', '')), '');
    IF item_name IS NULL THEN
      RAISE EXCEPTION 'Todo espaço deve ter um nome.' USING ERRCODE='22023';
    END IF;
    IF CHAR_LENGTH(item_name) > 120 THEN
      RAISE EXCEPTION 'O nome do espaço é muito longo.' USING ERRCODE='22023';
    END IF;

    item_desc := NULLIF(BTRIM(COALESCE(item->>'description', '')), '');
    BEGIN
      item_capacity := NULLIF(item->>'capacity', '')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
      item_capacity := NULL;
    END;
    IF item_capacity IS NOT NULL AND item_capacity < 1 THEN
      RAISE EXCEPTION 'A capacidade deve ser maior que zero.' USING ERRCODE='22023';
    END IF;

    normalized := normalized || jsonb_build_array(jsonb_build_object(
      'name', item_name,
      'capacity', item_capacity,
      'description', item_desc
    ));
  END LOOP;

  UPDATE public.condominiums c
  SET condominium_spaces = normalized
  WHERE public.condomit_same_cep(c.cep::TEXT, caller_cep);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condomínio não encontrado.' USING ERRCODE='P0002';
  END IF;

  RETURN normalized;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_set_condominium_spaces_036(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_set_condominium_spaces_036(JSONB) TO authenticated;

-- Edição administrativa dos principais dados do condomínio.
DROP FUNCTION IF EXISTS public.condomit_update_current_condominium_036(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);
CREATE OR REPLACE FUNCTION public.condomit_update_current_condominium_036(
  target_name TEXT,
  target_address TEXT,
  target_address_number TEXT,
  target_complement TEXT,
  target_neighborhood TEXT,
  target_city TEXT,
  target_state TEXT,
  target_total_apartments INTEGER,
  target_total_blocks INTEGER,
  target_cnpj TEXT,
  target_municipal_registration TEXT,
  target_email TEXT,
  target_phone TEXT,
  target_logo_url TEXT,
  target_logo_storage_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_cep TEXT := public.condomit_current_user_cep();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  updated public.condominiums%ROWTYPE;
BEGIN
  IF public.condomit_auth_email() = '' OR caller_cep IS NULL OR caller_role NOT IN ('sindico','síndico','admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode editar as informações do condomínio.' USING ERRCODE='42501';
  END IF;

  IF NULLIF(BTRIM(COALESCE(target_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do condomínio.' USING ERRCODE='22023';
  END IF;
  IF COALESCE(target_total_apartments, 0) < 1 THEN
    RAISE EXCEPTION 'O total de apartamentos deve ser maior que zero.' USING ERRCODE='22023';
  END IF;
  IF COALESCE(target_total_blocks, 0) < 0 THEN
    RAISE EXCEPTION 'O total de blocos não pode ser negativo.' USING ERRCODE='22023';
  END IF;

  UPDATE public.condominiums c
  SET condominium_name = BTRIM(target_name),
      address = NULLIF(BTRIM(COALESCE(target_address, '')), ''),
      address_number = NULLIF(BTRIM(COALESCE(target_address_number, '')), ''),
      complement = NULLIF(BTRIM(COALESCE(target_complement, '')), ''),
      neighborhood = NULLIF(BTRIM(COALESCE(target_neighborhood, '')), ''),
      city = NULLIF(BTRIM(COALESCE(target_city, '')), ''),
      state = NULLIF(BTRIM(COALESCE(target_state, '')), ''),
      total_apartments = target_total_apartments,
      total_blocks = target_total_blocks,
      cnpj = NULLIF(BTRIM(COALESCE(target_cnpj, '')), ''),
      municipal_registration = NULLIF(BTRIM(COALESCE(target_municipal_registration, '')), ''),
      condominium_email = NULLIF(BTRIM(COALESCE(target_email, '')), ''),
      condominium_phone = NULLIF(BTRIM(COALESCE(target_phone, '')), ''),
      logo_url = NULLIF(BTRIM(COALESCE(target_logo_url, '')), ''),
      logo_storage_path = NULLIF(BTRIM(COALESCE(target_logo_storage_path, '')), '')
  WHERE public.condomit_same_cep(c.cep::TEXT, caller_cep)
  RETURNING c.* INTO updated;

  IF updated.cep IS NULL THEN
    RAISE EXCEPTION 'Condomínio não encontrado.' USING ERRCODE='P0002';
  END IF;

  RETURN to_jsonb(updated);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_update_current_condominium_036(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_update_current_condominium_036(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;
