-- ============================================================
-- CONDOMIT - MIGRACAO 050
-- Garante o perfil publico da conta administrativa fixa e evita
-- que diferencas de schemas legados bloqueiem o login do ADM.
-- ============================================================
BEGIN;

-- Metadados tecnicos usados somente pela conta administrativa. Eles existem
-- para satisfazer schemas antigos em que phone/cpf eram obrigatorios.
DO $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'name', 'Administrador Condomit',
        'phone', '11999999990',
        'cpf', '99999999050',
        'user_type', COALESCE(NULLIF(raw_user_meta_data ->> 'user_type', ''), 'sindico'),
        'type', COALESCE(NULLIF(raw_user_meta_data ->> 'type', ''), 'sindico'),
        'demo_access', TRUE,
        'admin_profile_switch', TRUE
      ),
      updated_at = NOW()
  WHERE LOWER(BTRIM(COALESCE(email, ''))) = 'contato.condomit@gmail.com';
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_ensure_fixed_admin_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_email CONSTANT TEXT := 'contato.condomit@gmail.com';
  admin_phone CONSTANT TEXT := '11999999990';
  admin_cpf CONSTANT TEXT := '99999999050';
  admin_condominium JSONB := jsonb_build_object(
    'name', 'Condomit',
    'condominium_name', 'Condomit',
    'cep', '99999-999',
    'condominium_id', '99999-999'
  );
  existing_email TEXT;
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'reason', 'public.users inexistente');
  END IF;

  SELECT u.email
  INTO existing_email
  FROM public.users u
  WHERE LOWER(BTRIM(COALESCE(u.email, ''))) = admin_email
  LIMIT 1;

  IF existing_email IS NULL THEN
    INSERT INTO public.users (
      email,
      name,
      phone,
      cpf,
      user_type,
      condominium,
      demo_access
    )
    VALUES (
      admin_email,
      'Administrador Condomit',
      admin_phone,
      admin_cpf,
      'sindico',
      admin_condominium,
      TRUE
    );
  ELSE
    UPDATE public.users
    SET name = COALESCE(NULLIF(BTRIM(name), ''), 'Administrador Condomit'),
        phone = COALESCE(NULLIF(BTRIM(phone), ''), admin_phone),
        cpf = COALESCE(NULLIF(BTRIM(cpf), ''), admin_cpf),
        user_type = COALESCE(NULLIF(BTRIM(user_type), ''), 'sindico'),
        condominium = COALESCE(condominium, admin_condominium),
        demo_access = TRUE
    WHERE LOWER(BTRIM(COALESCE(email, ''))) = admin_email;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'email', admin_email);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Condomit: perfil ADM nao materializado em public.users: [%] %', SQLSTATE, SQLERRM;
    RETURN jsonb_build_object(
      'ok', FALSE,
      'email', admin_email,
      'code', SQLSTATE,
      'error', SQLERRM
    );
END;
$$;

-- Materializa o perfil agora. A migration nao e abortada se existir alguma
-- diferenca adicional no schema; o backend possui fallback exclusivo do ADM.
DO $$
DECLARE
  result JSONB;
BEGIN
  result := public.condomit_ensure_fixed_admin_profile();
  IF COALESCE((result ->> 'ok')::BOOLEAN, FALSE) = FALSE THEN
    RAISE WARNING 'Condomit: backfill ADM retornou %', result::TEXT;
  END IF;
END;
$$;

-- Para a conta administrativa, a fonte do tipo selecionado passa a ser o
-- metadata do usuario autenticado. Assim a troca funciona mesmo em bancos
-- legados onde public.users ainda esteja sendo reparada.
CREATE OR REPLACE FUNCTION public.condomit_current_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  resolved_role TEXT;
BEGIN
  IF caller_email = 'contato.condomit@gmail.com' THEN
    SELECT LOWER(BTRIM(COALESCE(
      au.raw_user_meta_data ->> 'user_type',
      au.raw_user_meta_data ->> 'type',
      'sindico'
    )))
    INTO resolved_role
    FROM auth.users au
    WHERE au.id = auth.uid()
    LIMIT 1;

    IF resolved_role IN ('morador', 'sindico', 'porteiro') THEN
      RETURN resolved_role;
    END IF;
    RETURN 'sindico';
  END IF;

  SELECT LOWER(COALESCE(u.user_type, ''))
  INTO resolved_role
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  RETURN COALESCE(resolved_role, '');
END;
$$;

-- O ADM usa um CEP tecnico apenas para manter os fluxos de interface e RPCs
-- consistentes. Ele continua sem representar um morador real do condominio.
CREATE OR REPLACE FUNCTION public.condomit_current_user_cep()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  result_cep TEXT;
BEGIN
  IF caller_email = '' THEN
    RETURN NULL;
  END IF;

  IF caller_email = 'contato.condomit@gmail.com' THEN
    RETURN '99999-999';
  END IF;

  SELECT c.cep
  INTO result_cep
  FROM public.user_condominiums uc
  JOIN public.condominiums c
    ON public.condomit_same_cep(c.cep::TEXT, uc.condominium_id::TEXT)
  WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
  LIMIT 1;

  IF result_cep IS NOT NULL THEN
    RETURN result_cep;
  END IF;

  SELECT c.cep
  INTO result_cep
  FROM public.users u
  JOIN public.condominiums c
    ON public.condomit_same_cep(
      c.cep::TEXT,
      COALESCE(
        u.condominium ->> 'cep',
        u.condominium ->> 'condominium_id',
        u.condominium ->> 'condominium_cep'
      )
    )
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  RETURN result_cep;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_demo_switch_role(target_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  role_value TEXT := LOWER(BTRIM(COALESCE(target_role, '')));
BEGIN
  IF role_value = 'síndico' THEN role_value := 'sindico'; END IF;
  IF role_value NOT IN ('morador', 'sindico', 'porteiro') THEN
    RAISE EXCEPTION 'Tipo de usuário inválido.' USING ERRCODE = '22023';
  END IF;

  IF caller_email <> 'contato.condomit@gmail.com' THEN
    RAISE EXCEPTION 'Alternância disponível apenas para a conta administrativa autorizada.' USING ERRCODE = '42501';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'user_type', role_value,
        'type', role_value,
        'demo_access', TRUE,
        'admin_profile_switch', TRUE
      ),
      updated_at = NOW()
  WHERE id = auth.uid()
    AND LOWER(BTRIM(COALESCE(email, ''))) = caller_email;

  -- Mantem public.users sincronizada quando o perfil estiver disponivel.
  UPDATE public.users
  SET user_type = role_value,
      demo_access = TRUE
  WHERE LOWER(BTRIM(COALESCE(email, ''))) = caller_email;

  RETURN role_value;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_ensure_fixed_admin_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_demo_switch_role(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
