BEGIN;

-- ============================================================
-- Condomit 0.51.0
-- 1) Corrige falso "assembleia pertence a outro condomínio" após troca de síndico.
-- 2) Considera o valor da assinatura Condomit como despesa mensal do período coberto.
-- 3) Expõe, com segurança, as fotos dos autores dos comentários da ata.
-- ============================================================

-- ------------------------------------------------------------
-- Resumo financeiro: uma mensalidade Condomit aplicável ao mês.
-- A cobrança é considerada no mês se o período de 1 mês iniciado no
-- pagamento aprovado interceptar o mês consultado. Apenas a cobrança
-- aprovada mais recente aplicável é considerada, evitando duplicidade.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_monthly_financial_summary(
  target_month DATE DEFAULT CURRENT_DATE,
  target_cep TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  resolved_cep TEXT;
  month_start DATE := DATE_TRUNC('month', COALESCE(target_month, CURRENT_DATE))::DATE;
  next_month DATE := (DATE_TRUNC('month', COALESCE(target_month, CURRENT_DATE)) + INTERVAL '1 month')::DATE;
  ledger_expenses NUMERIC(14,2) := 0;
  ledger_income NUMERIC(14,2) := 0;
  subscription_expense NUMERIC(14,2) := 0;
  expense_count INTEGER := 0;
  income_count INTEGER := 0;
  subscription_count INTEGER := 0;
BEGIN
  IF caller_email = '' OR caller_role NOT IN ('sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode consultar o resumo financeiro do condomínio.' USING ERRCODE = '42501';
  END IF;

  resolved_cep := NULLIF(BTRIM(COALESCE(target_cep, '')), '');
  IF resolved_cep IS NULL THEN
    resolved_cep := public.condomit_current_user_cep();
  ELSIF NOT public.condomit_user_belongs_to_cep(resolved_cep) THEN
    RAISE EXCEPTION 'O usuário não pertence ao condomínio informado.' USING ERRCODE = '42501';
  END IF;

  IF resolved_cep IS NULL THEN
    RAISE EXCEPTION 'Condomínio atual não identificado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN fe.entry_type = 'despesa' THEN fe.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN fe.entry_type = 'receita' THEN fe.amount ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE fe.entry_type = 'despesa'),
    COUNT(*) FILTER (WHERE fe.entry_type = 'receita')
  INTO ledger_expenses, ledger_income, expense_count, income_count
  FROM public.financial_entries fe
  WHERE public.condomit_same_cep(fe.cep, resolved_cep)
    AND LOWER(COALESCE(fe.status, '')) <> 'cancelado'
    AND COALESCE(fe.due_date, fe.paid_date, fe.created_at::DATE) >= month_start
    AND COALESCE(fe.due_date, fe.paid_date, fe.created_at::DATE) < next_month;

  SELECT COALESCE(p.valor_pago, 0)
  INTO subscription_expense
  FROM public.pagamento p
  WHERE public.condomit_same_cep(p.cep, resolved_cep)
    AND LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND COALESCE(p.data_pagamento, p.created_at) < next_month::TIMESTAMPTZ
    AND (COALESCE(p.data_pagamento, p.created_at) + INTERVAL '1 month') > month_start::TIMESTAMPTZ
  ORDER BY COALESCE(p.data_pagamento, p.created_at) DESC, p.id DESC
  LIMIT 1;

  IF COALESCE(subscription_expense, 0) > 0 THEN
    subscription_count := 1;
  ELSE
    subscription_expense := 0;
  END IF;

  RETURN jsonb_build_object(
    'cep', resolved_cep,
    'month', TO_CHAR(month_start, 'YYYY-MM'),
    'expenses_total', ledger_expenses + subscription_expense,
    'income_total', ledger_income,
    'balance', ledger_income - (ledger_expenses + subscription_expense),
    'ledger_expenses', ledger_expenses,
    'subscription_expense', subscription_expense,
    'expense_entries_count', expense_count + subscription_count,
    'ledger_expense_entries_count', expense_count,
    'subscription_payments_count', subscription_count,
    'income_entries_count', income_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_monthly_financial_summary(DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_monthly_financial_summary(DATE, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Finalizar assembleia: usa o helper canônico que conhece vínculos
-- antigos e o JSON users.condominium, não apenas user_condominiums.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Assinatura da ata: mesma validação canônica de pertencimento.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_sign_assembly_minutes(target_assembly_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), ''));
  caller_name TEXT;
  assembly_row public.scheduled_assemblies%ROWTYPE;
  signature_row public.assembly_minutes_signatures%ROWTYPE;
BEGIN
  IF caller_email = '' OR caller_role NOT IN ('sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Apenas o síndico pode assinar a ata.' USING ERRCODE = '42501';
  END IF;

  SELECT sa.* INTO assembly_row
  FROM public.scheduled_assemblies sa
  WHERE sa.id = target_assembly_id
  LIMIT 1;

  IF assembly_row.id IS NULL THEN
    RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF LOWER(COALESCE(assembly_row.status, '')) NOT IN ('encerrada','finalizada','completed') THEN
    RAISE EXCEPTION 'A ata só pode ser assinada após a assembleia ser finalizada.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.condomit_user_belongs_to_cep(assembly_row.cep::TEXT) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.name), ''), caller_email)
  INTO caller_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  caller_name := COALESCE(NULLIF(caller_name, ''), caller_email);

  INSERT INTO public.assembly_minutes_signatures (assembly_id, cep, signer_email, signer_name)
  VALUES (assembly_row.id, assembly_row.cep, caller_email, caller_name)
  ON CONFLICT (assembly_id) DO NOTHING;

  SELECT s.* INTO signature_row
  FROM public.assembly_minutes_signatures s
  WHERE s.assembly_id = target_assembly_id
  LIMIT 1;

  RETURN to_jsonb(signature_row);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_sign_assembly_minutes(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_sign_assembly_minutes(BIGINT) TO authenticated;

-- A leitura da assinatura também passa a usar o helper canônico.
DROP POLICY IF EXISTS assembly_minutes_signatures_select_032 ON public.assembly_minutes_signatures;
DROP POLICY IF EXISTS assembly_minutes_signatures_select_033 ON public.assembly_minutes_signatures;
CREATE POLICY assembly_minutes_signatures_select_033
ON public.assembly_minutes_signatures
FOR SELECT TO authenticated
USING (public.condomit_user_belongs_to_cep(cep::TEXT));

-- ------------------------------------------------------------
-- Perfis dos autores de comentários de uma ata.
-- Só retorna autores da assembleia e somente a quem pertence ao mesmo
-- condomínio. Não expõe dados além de e-mail, nome e foto de perfil.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_assembly_comment_profiles(target_assembly_id BIGINT)
RETURNS TABLE (
  email TEXT,
  name TEXT,
  profile_photo TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  assembly_cep TEXT;
BEGIN
  SELECT sa.cep::TEXT INTO assembly_cep
  FROM public.scheduled_assemblies sa
  WHERE sa.id = target_assembly_id
  LIMIT 1;

  IF assembly_cep IS NULL THEN
    RAISE EXCEPTION 'Assembleia não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.condomit_user_belongs_to_cep(assembly_cep) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    u.email::TEXT,
    COALESCE(NULLIF(BTRIM(u.name), ''), u.email)::TEXT,
    u.profile_photo::TEXT
  FROM public.assembly_post_comments c
  JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(c.user_email, ''))
  WHERE c.assembly_id = target_assembly_id
    AND public.condomit_same_cep(c.cep::TEXT, assembly_cep)
  ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_assembly_comment_profiles(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_assembly_comment_profiles(BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
