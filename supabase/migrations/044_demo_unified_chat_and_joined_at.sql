-- ============================================================
-- CONDOMIT - MIGRACAO 044
-- Acesso de demonstração, chat unificado e data de entrada.
-- ============================================================
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS demo_access BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_condominiums
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.users.demo_access IS
  'Conta temporária de demonstração: ignora cobrança e permite alternar o perfil.';
COMMENT ON COLUMN public.user_condominiums.joined_at IS
  'Data em que o usuário passou a fazer parte do condomínio.';

-- Contatos que cada usuário decidiu manter na barra lateral do chat.
CREATE TABLE IF NOT EXISTS public.condomit_chat_saved_contacts (
  owner_email TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  cep TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_email, contact_email, cep),
  CONSTRAINT condomit_chat_saved_contacts_distinct CHECK (LOWER(owner_email) <> LOWER(contact_email))
);

CREATE INDEX IF NOT EXISTS idx_condomit_chat_saved_owner
  ON public.condomit_chat_saved_contacts (LOWER(owner_email), cep, created_at DESC);

ALTER TABLE public.condomit_chat_saved_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS condomit_chat_saved_contacts_select ON public.condomit_chat_saved_contacts;
CREATE POLICY condomit_chat_saved_contacts_select
ON public.condomit_chat_saved_contacts
FOR SELECT TO authenticated
USING (LOWER(owner_email) = public.condomit_auth_email());

DROP POLICY IF EXISTS condomit_chat_saved_contacts_insert ON public.condomit_chat_saved_contacts;
CREATE POLICY condomit_chat_saved_contacts_insert
ON public.condomit_chat_saved_contacts
FOR INSERT TO authenticated
WITH CHECK (LOWER(owner_email) = public.condomit_auth_email());

DROP POLICY IF EXISTS condomit_chat_saved_contacts_delete ON public.condomit_chat_saved_contacts;
CREATE POLICY condomit_chat_saved_contacts_delete
ON public.condomit_chat_saved_contacts
FOR DELETE TO authenticated
USING (LOWER(owner_email) = public.condomit_auth_email());

CREATE OR REPLACE FUNCTION public.condomit_chat_save_contact(other_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
  target_email TEXT := LOWER(BTRIM(COALESCE(other_email, '')));
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;
  IF target_email = '' OR target_email = caller_email
     OR NOT public.condomit_email_belongs_to_cep(target_email, caller_cep) THEN
    RAISE EXCEPTION 'Contato inválido para este condomínio.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.condomit_chat_saved_contacts(owner_email, contact_email, cep)
  VALUES (caller_email, target_email, caller_cep)
  ON CONFLICT (owner_email, contact_email, cep) DO NOTHING;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_chat_remove_contact(other_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
BEGIN
  DELETE FROM public.condomit_chat_saved_contacts
  WHERE LOWER(owner_email) = caller_email
    AND LOWER(contact_email) = LOWER(BTRIM(COALESCE(other_email, '')))
    AND public.condomit_same_cep(cep, caller_cep);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_chat_list_saved_contacts()
RETURNS TABLE (
  email TEXT,
  name TEXT,
  phone TEXT,
  user_type TEXT,
  profile_photo TEXT,
  apartment TEXT,
  block TEXT,
  cep TEXT,
  saved_at TIMESTAMPTZ
)
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
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (LOWER(u.email))
    u.email::TEXT,
    COALESCE(NULLIF(u.name, ''), u.email)::TEXT,
    COALESCE(u.phone, '')::TEXT,
    u.user_type::TEXT,
    u.profile_photo::TEXT,
    COALESCE(uc.apartment::TEXT, '')::TEXT,
    COALESCE(uc.block::TEXT, '')::TEXT,
    caller_cep::TEXT,
    sc.created_at
  FROM public.condomit_chat_saved_contacts sc
  JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(sc.contact_email, ''))
  LEFT JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
   AND public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
  WHERE LOWER(sc.owner_email) = caller_email
    AND public.condomit_same_cep(sc.cep, caller_cep)
    AND public.condomit_email_belongs_to_cep(u.email, caller_cep)
  ORDER BY LOWER(u.email), sc.created_at DESC, COALESCE(uc.block::TEXT, ''), COALESCE(uc.apartment::TEXT, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_chat_clear_conversation(other_email TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
  target_email TEXT := LOWER(BTRIM(COALESCE(other_email, '')));
  affected INTEGER := 0;
BEGIN
  IF caller_email = '' OR caller_cep IS NULL OR target_email = '' THEN
    RAISE EXCEPTION 'Conversa inválida.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.condominium_chat_messages m
  WHERE public.condomit_same_cep(m.cep, caller_cep)
    AND (
      (LOWER(m.sender_email) = caller_email AND LOWER(m.recipient_email) = target_email)
      OR (LOWER(m.sender_email) = target_email AND LOWER(m.recipient_email) = caller_email)
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_chat_delete_conversation(other_email TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected INTEGER;
BEGIN
  affected := public.condomit_chat_clear_conversation(other_email);
  PERFORM public.condomit_chat_remove_contact(other_email);
  RETURN affected;
END;
$$;

-- Lista de moradores incluindo a data real do vínculo.
CREATE OR REPLACE FUNCTION public.condomit_list_condo_residents_v2()
RETURNS TABLE (
  email TEXT,
  name TEXT,
  phone TEXT,
  user_type TEXT,
  profile_photo TEXT,
  apartment TEXT,
  block TEXT,
  cep TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF public.condomit_auth_email() = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  IF current_cep IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT ON (LOWER(u.email))
    u.email::TEXT,
    COALESCE(NULLIF(u.name, ''), u.email)::TEXT,
    COALESCE(u.phone, '')::TEXT,
    u.user_type::TEXT,
    u.profile_photo::TEXT,
    COALESCE(uc.apartment::TEXT, '')::TEXT,
    COALESCE(uc.block::TEXT, '')::TEXT,
    current_cep::TEXT,
    uc.joined_at
  FROM public.user_condominiums uc
  JOIN public.users u ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(uc.user_email, ''))
  WHERE public.condomit_same_cep(uc.condominium_id::TEXT, current_cep)
    AND LOWER(COALESCE(u.user_type, '')) = 'morador'
  ORDER BY LOWER(u.email), uc.joined_at DESC, COALESCE(uc.block::TEXT, ''), COALESCE(uc.apartment::TEXT, '');
END;
$$;

-- Alternância de papel disponível somente para a conta de demonstração atual.
CREATE OR REPLACE FUNCTION public.condomit_demo_switch_role(target_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  role_value TEXT := LOWER(BTRIM(COALESCE(target_role, '')));
  allowed_demo BOOLEAN := FALSE;
BEGIN
  IF role_value = 'síndico' THEN role_value := 'sindico'; END IF;
  IF role_value NOT IN ('morador', 'sindico', 'porteiro') THEN
    RAISE EXCEPTION 'Tipo de usuário inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(u.demo_access, FALSE)
  INTO allowed_demo
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  IF caller_email = '' OR NOT allowed_demo THEN
    RAISE EXCEPTION 'Alternância disponível apenas no acesso de demonstração.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.users SET user_type = role_value
  WHERE LOWER(COALESCE(email, '')) = caller_email;
  RETURN role_value;
END;
$$;

-- Demonstrações não precisam de mensalidade ativa.
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
  is_demo BOOLEAN := FALSE;
  last_payment RECORD;
  paid_at TIMESTAMPTZ;
  due_at TIMESTAMPTZ;
  is_active BOOLEAN := FALSE;
BEGIN
  IF caller_email = '' THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(demo_access, FALSE) INTO is_demo
  FROM public.users WHERE LOWER(COALESCE(email, '')) = caller_email LIMIT 1;

  IF is_demo THEN
    RETURN jsonb_build_object(
      'cep', caller_cep, 'status', 'demo', 'can_use', TRUE, 'role', caller_role,
      'payment_id', NULL, 'plan_id', NULL, 'plan_name', 'Premium',
      'last_paid_at', NULL, 'due_at', NULL, 'days_remaining', NULL, 'demo_access', TRUE
    );
  END IF;

  IF caller_cep IS NULL OR BTRIM(caller_cep) = '' THEN
    RETURN jsonb_build_object('cep', NULL,'status','no_condominium','can_use',TRUE,'role',caller_role,
      'payment_id',NULL,'plan_id',NULL,'plan_name',NULL,'last_paid_at',NULL,'due_at',NULL,'days_remaining',NULL);
  END IF;

  SELECT p.id,p.plano_id,pl.nome AS plan_name,p.data_pagamento,p.email,p.valor_pago,p.codigo_transacao
  INTO last_payment
  FROM public.pagamento p
  LEFT JOIN public.plano pl ON pl.id = p.plano_id
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, caller_cep)
  ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC LIMIT 1;

  IF last_payment.id IS NULL THEN
    RETURN jsonb_build_object('cep',caller_cep,'status','unpaid','can_use',FALSE,'role',caller_role,
      'payment_id',NULL,'plan_id',NULL,'plan_name',NULL,'last_paid_at',NULL,'due_at',NULL,'days_remaining',0);
  END IF;

  paid_at := last_payment.data_pagamento;
  IF paid_at IS NULL THEN
    RETURN jsonb_build_object('cep',caller_cep,'status','overdue','can_use',FALSE,'role',caller_role,
      'payment_id',last_payment.id,'plan_id',last_payment.plano_id,'plan_name',last_payment.plan_name,
      'last_paid_at',NULL,'due_at',NULL,'days_remaining',0);
  END IF;

  due_at := paid_at + INTERVAL '1 month';
  is_active := NOW() < due_at;
  RETURN jsonb_build_object(
    'cep',caller_cep,'status',CASE WHEN is_active THEN 'active' ELSE 'overdue' END,'can_use',is_active,
    'role',caller_role,'payment_id',last_payment.id,'plan_id',last_payment.plano_id,'plan_name',last_payment.plan_name,
    'last_paid_at',paid_at,'due_at',due_at,
    'days_remaining',CASE WHEN is_active THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (due_at-NOW()))/86400.0)::INT) ELSE 0 END
  );
END;
$$;

-- O gatilho de porteiro também reconhece contas de demonstração.
CREATE OR REPLACE FUNCTION public.condomit_enforce_porter_plan_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_role TEXT;
  member_demo BOOLEAN := FALSE;
  last_payment RECORD;
  active_until TIMESTAMPTZ;
BEGIN
  SELECT LOWER(BTRIM(COALESCE(u.user_type, ''))), COALESCE(u.demo_access, FALSE)
    INTO member_role, member_demo
  FROM public.users u
  WHERE LOWER(BTRIM(COALESCE(u.email, ''))) = LOWER(BTRIM(COALESCE(NEW.user_email, '')))
  LIMIT 1;

  IF member_demo OR member_role <> 'porteiro' THEN RETURN NEW; END IF;

  SELECT p.id,p.data_pagamento,pl.nome AS plan_name INTO last_payment
  FROM public.pagamento p LEFT JOIN public.plano pl ON pl.id = p.plano_id
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, NEW.condominium_id::TEXT)
  ORDER BY p.data_pagamento DESC NULLS LAST,p.id DESC LIMIT 1;

  IF last_payment.id IS NULL OR last_payment.data_pagamento IS NULL THEN
    RAISE EXCEPTION 'O acesso de porteiro requer um condomínio com plano Pro ou Premium ativo.' USING ERRCODE='42501';
  END IF;
  active_until := last_payment.data_pagamento + INTERVAL '1 month';
  IF NOW() >= active_until THEN
    RAISE EXCEPTION 'A mensalidade do condomínio está vencida. Regularize o pagamento para liberar o porteiro.' USING ERRCODE='42501';
  END IF;
  IF NOT (LOWER(BTRIM(COALESCE(last_payment.plan_name,''))) LIKE '%pro%'
      OR LOWER(BTRIM(COALESCE(last_payment.plan_name,''))) LIKE '%premium%') THEN
    RAISE EXCEPTION 'Porteiros estão disponíveis somente nos planos Pro e Premium.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_chat_save_contact(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_chat_remove_contact(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_chat_list_saved_contacts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_chat_clear_conversation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_chat_delete_conversation(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_list_condo_residents_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_demo_switch_role(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_chat_save_contact(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_remove_contact(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_list_saved_contacts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_clear_conversation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_delete_conversation(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_condo_residents_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_demo_switch_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_get_billing_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
