-- ============================================================
-- CONDOMIT - MIGRACAO 045
-- Conta administrativa fixa para alternancia de perfil.
-- Somente contato.condomit@gmail.com pode alternar entre
-- morador, sindico e porteiro e utilizar este acesso sem cobranca.
-- ============================================================
BEGIN;

-- Revoga o antigo marcador de demonstracao de contas aleatorias.
UPDATE public.users
SET demo_access = (LOWER(BTRIM(COALESCE(email, ''))) = 'contato.condomit@gmail.com')
WHERE COALESCE(demo_access, FALSE) = TRUE
   OR LOWER(BTRIM(COALESCE(email, ''))) = 'contato.condomit@gmail.com';

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

  UPDATE public.users
  SET user_type = role_value,
      demo_access = TRUE
  WHERE LOWER(BTRIM(COALESCE(email, ''))) = caller_email;

  RETURN role_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_get_billing_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
  caller_role TEXT := public.condomit_current_user_role();
  is_admin_switch_account BOOLEAN := FALSE;
  last_payment RECORD;
  paid_at TIMESTAMPTZ;
  due_at TIMESTAMPTZ;
  is_active BOOLEAN := FALSE;
BEGIN
  IF caller_email = '' THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;

  is_admin_switch_account := caller_email = 'contato.condomit@gmail.com';

  IF is_admin_switch_account THEN
    RETURN jsonb_build_object(
      'cep', caller_cep,
      'status', 'admin',
      'can_use', TRUE,
      'role', caller_role,
      'payment_id', NULL,
      'plan_id', NULL,
      'plan_name', 'Premium',
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', NULL,
      'demo_access', TRUE
    );
  END IF;

  IF caller_cep IS NULL OR BTRIM(caller_cep) = '' THEN
    RETURN jsonb_build_object(
      'cep', NULL, 'status', 'no_condominium', 'can_use', TRUE, 'role', caller_role,
      'payment_id', NULL, 'plan_id', NULL, 'plan_name', NULL,
      'last_paid_at', NULL, 'due_at', NULL, 'days_remaining', NULL
    );
  END IF;

  SELECT p.id, p.plano_id, pl.nome AS plan_name, p.data_pagamento, p.email, p.valor_pago, p.codigo_transacao
  INTO last_payment
  FROM public.pagamento p
  LEFT JOIN public.plano pl ON pl.id = p.plano_id
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, caller_cep)
  ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC
  LIMIT 1;

  IF last_payment.id IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep, 'status', 'unpaid', 'can_use', FALSE, 'role', caller_role,
      'payment_id', NULL, 'plan_id', NULL, 'plan_name', NULL,
      'last_paid_at', NULL, 'due_at', NULL, 'days_remaining', 0
    );
  END IF;

  paid_at := last_payment.data_pagamento;
  IF paid_at IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep, 'status', 'overdue', 'can_use', FALSE, 'role', caller_role,
      'payment_id', last_payment.id, 'plan_id', last_payment.plano_id, 'plan_name', last_payment.plan_name,
      'last_paid_at', NULL, 'due_at', NULL, 'days_remaining', 0
    );
  END IF;

  due_at := paid_at + INTERVAL '1 month';
  is_active := NOW() < due_at;
  RETURN jsonb_build_object(
    'cep', caller_cep,
    'status', CASE WHEN is_active THEN 'active' ELSE 'overdue' END,
    'can_use', is_active,
    'role', caller_role,
    'payment_id', last_payment.id,
    'plan_id', last_payment.plano_id,
    'plan_name', last_payment.plan_name,
    'last_paid_at', paid_at,
    'due_at', due_at,
    'days_remaining', CASE WHEN is_active THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (due_at - NOW())) / 86400.0)::INT) ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_enforce_porter_plan_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_role TEXT;
  member_email TEXT := LOWER(BTRIM(COALESCE(NEW.user_email, '')));
  last_payment RECORD;
  active_until TIMESTAMPTZ;
BEGIN
  SELECT LOWER(BTRIM(COALESCE(u.user_type, '')))
    INTO member_role
  FROM public.users u
  WHERE LOWER(BTRIM(COALESCE(u.email, ''))) = member_email
  LIMIT 1;

  IF member_email = 'contato.condomit@gmail.com' OR member_role <> 'porteiro' THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.data_pagamento, pl.nome AS plan_name
  INTO last_payment
  FROM public.pagamento p
  LEFT JOIN public.plano pl ON pl.id = p.plano_id
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, NEW.condominium_id::TEXT)
  ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC
  LIMIT 1;

  IF last_payment.id IS NULL OR last_payment.data_pagamento IS NULL THEN
    RAISE EXCEPTION 'O acesso de porteiro requer um condomínio com plano Pro ou Premium ativo.' USING ERRCODE = '42501';
  END IF;

  active_until := last_payment.data_pagamento + INTERVAL '1 month';
  IF NOW() >= active_until THEN
    RAISE EXCEPTION 'A mensalidade do condomínio está vencida. Regularize o pagamento para liberar o porteiro.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    LOWER(BTRIM(COALESCE(last_payment.plan_name, ''))) LIKE '%pro%'
    OR LOWER(BTRIM(COALESCE(last_payment.plan_name, ''))) LIKE '%premium%'
  ) THEN
    RAISE EXCEPTION 'Porteiros estão disponíveis somente nos planos Pro e Premium.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_demo_switch_role(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_demo_switch_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_get_billing_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
