-- ============================================================
-- CONDOMIT - MIGRACAO 051
-- Isencao por CONDOMINIO administrativo (nao so pelo e-mail ADM).
-- Somente o condominio tecnico da conta fixa, 99999-999, recebe
-- acesso Premium sem mensalidade. Outros condominios continuam
-- sujeitos ao pagamento e as regras normais de assinatura.
-- ============================================================
BEGIN;

-- Lista de isencoes mantida exclusivamente por migracoes administrativas.
-- Nunca usar demo_access de public.users para conceder gratuidade a
-- um condominio: a permissao deve estar vinculada ao CEP aprovado.
CREATE TABLE IF NOT EXISTS public.condomit_billing_exempt_condominiums (
  cep TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.condomit_billing_exempt_condominiums ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.condomit_billing_exempt_condominiums FROM PUBLIC, anon, authenticated;

INSERT INTO public.condomit_billing_exempt_condominiums (cep, reason)
VALUES ('99999999', 'Condominio tecnico da conta administrativa fixa Condomit')
ON CONFLICT (cep) DO UPDATE SET reason = EXCLUDED.reason;

CREATE OR REPLACE FUNCTION public.condomit_is_billing_exempt_cep(target_cep TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.condomit_billing_exempt_condominiums e
    WHERE e.cep = REGEXP_REPLACE(COALESCE(target_cep, ''), '[^0-9]', '', 'g')
      AND LENGTH(e.cep) = 8
  );
$$;
REVOKE ALL ON FUNCTION public.condomit_is_billing_exempt_cep(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_is_billing_exempt_cep(TEXT) TO authenticated;

-- 050 buscava o CEP apenas via JOIN com condominiums. O registro
-- tecnico do ADM pode existir somente como vinculo e JSON de perfil.
-- Priorizar o condominio ATIVO no perfil, desde que haja vinculo real
-- em user_condominiums; nao confiar apenas em JSON editavel.
CREATE OR REPLACE FUNCTION public.condomit_current_user_cep()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  preferred_cep TEXT;
  result_cep TEXT;
BEGIN
  IF caller_email = '' THEN RETURN NULL; END IF;
  IF caller_email = 'contato.condomit@gmail.com' THEN
    RETURN '99999-999';
  END IF;

  SELECT COALESCE(
    u.condominium ->> 'cep',
    u.condominium ->> 'condominium_id',
    u.condominium ->> 'condominium_cep'
  ) INTO preferred_cep
  FROM public.users u
  WHERE LOWER(BTRIM(COALESCE(u.email, ''))) = caller_email
  LIMIT 1;

  IF NULLIF(BTRIM(COALESCE(preferred_cep, '')), '') IS NOT NULL THEN
    SELECT uc.condominium_id::TEXT INTO result_cep
    FROM public.user_condominiums uc
    WHERE LOWER(BTRIM(COALESCE(uc.user_email, ''))) = caller_email
      AND public.condomit_same_cep(uc.condominium_id::TEXT, preferred_cep)
    LIMIT 1;
    IF result_cep IS NOT NULL THEN RETURN result_cep; END IF;
  END IF;

  -- Fluxo tradicional para condominios reais cadastrados.
  SELECT c.cep INTO result_cep
  FROM public.user_condominiums uc
  JOIN public.condominiums c
    ON public.condomit_same_cep(c.cep::TEXT, uc.condominium_id::TEXT)
  WHERE LOWER(BTRIM(COALESCE(uc.user_email, ''))) = caller_email
  LIMIT 1;
  IF result_cep IS NOT NULL THEN RETURN result_cep; END IF;

  -- Condominio tecnico: nao exige linha em condominiums, mas exige
  -- vinculo autenticado no banco; nao se baseia so em CEP local.
  SELECT uc.condominium_id::TEXT INTO result_cep
  FROM public.user_condominiums uc
  WHERE LOWER(BTRIM(COALESCE(uc.user_email, ''))) = caller_email
    AND public.condomit_is_billing_exempt_cep(uc.condominium_id::TEXT)
  LIMIT 1;
  IF result_cep IS NOT NULL THEN RETURN result_cep; END IF;

  -- Compatibilidade com cadastro anterior para condominios reais.
  SELECT c.cep INTO result_cep
  FROM public.users u
  JOIN public.condominiums c
    ON public.condomit_same_cep(
      c.cep::TEXT,
      COALESCE(u.condominium ->> 'cep',
               u.condominium ->> 'condominium_id',
               u.condominium ->> 'condominium_cep')
    )
  WHERE LOWER(BTRIM(COALESCE(u.email, ''))) = caller_email
    AND NOT public.condomit_is_billing_exempt_cep(c.cep::TEXT)
  LIMIT 1;
  RETURN result_cep;
END;
$$;

-- Cobrança e pacote Premium determinados exclusivamente pelo banco.
-- Um morador ou porteiro vinculado ao condominio tecnico recebe a
-- mesma isencao do ADM, sem ganhar permissão de trocar de perfil.
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
  is_admin_account BOOLEAN := FALSE;
  last_payment RECORD;
  paid_at TIMESTAMPTZ;
  due_at TIMESTAMPTZ;
  is_active BOOLEAN := FALSE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  is_admin_account := caller_email = 'contato.condomit@gmail.com';
  IF is_admin_account OR public.condomit_is_billing_exempt_cep(caller_cep) THEN
    RETURN jsonb_build_object(
      'cep', caller_cep,
      'status', 'exempt',
      'billing_exempt', TRUE,
      'can_use', TRUE,
      'role', caller_role,
      'payment_id', NULL,
      'plan_id', NULL,
      'plan_name', 'Premium',
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', NULL,
      'demo_access', is_admin_account
    );
  END IF;

  IF caller_cep IS NULL OR BTRIM(caller_cep) = '' THEN
    RETURN jsonb_build_object(
      'cep', NULL, 'status', 'no_condominium', 'can_use', TRUE,
      'role', caller_role, 'payment_id', NULL, 'plan_id', NULL,
      'plan_name', NULL, 'last_paid_at', NULL,
      'due_at', NULL, 'days_remaining', NULL, 'billing_exempt', FALSE
    );
  END IF;

  SELECT p.id, p.plano_id, pl.nome AS plan_name, p.data_pagamento
  INTO last_payment
  FROM public.pagamento p
  LEFT JOIN public.plano pl ON pl.id = p.plano_id
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, caller_cep)
  ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC
  LIMIT 1;

  IF last_payment.id IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep, 'status', 'unpaid', 'can_use', FALSE,
      'role', caller_role, 'payment_id', NULL, 'plan_id', NULL,
      'plan_name', NULL, 'last_paid_at', NULL,
      'due_at', NULL, 'days_remaining', 0, 'billing_exempt', FALSE
    );
  END IF;

  paid_at := last_payment.data_pagamento;
  IF paid_at IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep, 'status', 'overdue', 'can_use', FALSE,
      'role', caller_role, 'payment_id', last_payment.id,
      'plan_id', last_payment.plano_id, 'plan_name', last_payment.plan_name,
      'last_paid_at', NULL, 'due_at', NULL,
      'days_remaining', 0, 'billing_exempt', FALSE
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
    'days_remaining', CASE WHEN is_active THEN
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (due_at - NOW())) / 86400.0)::INT)
      ELSE 0 END,
    'billing_exempt', FALSE
  );
END;
$$;

-- Também liberar o ingresso de porteiros no condominio administrativo;
-- do contrário, o trigger continuaria exigindo um pagamento Pro/Premium.
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
  IF public.condomit_is_billing_exempt_cep(NEW.condominium_id::TEXT) THEN
    RETURN NEW;
  END IF;

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

-- Acesso à tabela de isencoes é exclusivamente pelo código SQL acima.
REVOKE ALL ON FUNCTION public.condomit_get_billing_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_get_billing_status() TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
