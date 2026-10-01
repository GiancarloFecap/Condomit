BEGIN;

-- ============================================================
-- Condomit 0.49.0
-- 1) Checkout sempre lê o condomínio atual do banco.
-- 2) Dashboard financeiro usa lançamentos reais + assinatura Condomit.
-- 3) Síndico pode finalizar assembleias agendadas/em andamento.
-- 4) Síndico pode assinar eletronicamente a ata.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- Snapshot seguro do condomínio atual para checkout e UI.
-- target_cep é opcional para respeitar o condomínio ativo da sessão
-- quando o usuário possui mais de um vínculo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_current_condominium_snapshot(target_cep TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  resolved_cep TEXT;
  condo_row public.condominiums%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  resolved_cep := NULLIF(BTRIM(COALESCE(target_cep, '')), '');

  IF resolved_cep IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_condominiums uc
      WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
        AND public.condomit_same_cep(uc.condominium_id::TEXT, resolved_cep)
    ) THEN
      RAISE EXCEPTION 'O usuário não pertence ao condomínio informado.' USING ERRCODE = '42501';
    END IF;
  ELSE
    resolved_cep := public.condomit_current_user_cep();
  END IF;

  IF resolved_cep IS NULL OR BTRIM(resolved_cep) = '' THEN
    RAISE EXCEPTION 'Não foi possível identificar o condomínio atual.' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.*
    INTO condo_row
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep::TEXT, resolved_cep)
  LIMIT 1;

  IF condo_row.cep IS NULL THEN
    RAISE EXCEPTION 'Condomínio não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(condo_row) || jsonb_build_object(
    'name', condo_row.condominium_name,
    'condominium_id', condo_row.cep,
    'totalApartments', condo_row.total_apartments,
    'total_apartamentos', condo_row.total_apartments
  );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_current_condominium_snapshot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_current_condominium_snapshot(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Resumo financeiro real do mês do condomínio.
-- Despesas = lançamentos financeiros do mês + pagamentos aprovados
-- da assinatura Condomit no mesmo mês.
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
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.user_condominiums uc
      WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
        AND public.condomit_same_cep(uc.condominium_id::TEXT, resolved_cep)
    ) THEN
      RAISE EXCEPTION 'O usuário não pertence ao condomínio informado.' USING ERRCODE = '42501';
    END IF;
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

  SELECT
    COALESCE(SUM(COALESCE(p.valor_pago, 0)), 0),
    COUNT(*)
  INTO subscription_expense, subscription_count
  FROM public.pagamento p
  WHERE public.condomit_same_cep(p.cep, resolved_cep)
    AND LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND COALESCE((p.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::DATE, p.created_at::DATE) >= month_start
    AND COALESCE((p.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::DATE, p.created_at::DATE) < next_month;

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
-- Finalização manual de assembleia pelo síndico.
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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
      AND public.condomit_same_cep(uc.condominium_id::TEXT, assembly_row.cep::TEXT)
  ) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  IF LOWER(COALESCE(assembly_row.status, '')) IN ('encerrada','finalizada','completed','cancelada','cancelled') THEN
    RETURN jsonb_build_object(
      'id', assembly_row.id,
      'status', assembly_row.status,
      'end_time', assembly_row.end_time,
      'already_finished', TRUE
    );
  END IF;

  UPDATE public.scheduled_assemblies
  SET status = 'encerrada',
      end_time = finished_time,
      ended_at = NOW(),
      updated_at = NOW()
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
-- Assinatura eletrônica da ata pelo síndico.
-- A assinatura não referencia users por FK para continuar válida mesmo
-- se a conta do signatário for excluída no futuro.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assembly_minutes_signatures (
  assembly_id BIGINT PRIMARY KEY REFERENCES public.scheduled_assemblies(id) ON UPDATE CASCADE ON DELETE CASCADE,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_code UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX IF NOT EXISTS idx_assembly_minutes_signatures_cep
  ON public.assembly_minutes_signatures(cep, signed_at DESC);

ALTER TABLE public.assembly_minutes_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_minutes_signatures_select_032 ON public.assembly_minutes_signatures;
CREATE POLICY assembly_minutes_signatures_select_032
ON public.assembly_minutes_signatures
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, '')) = public.condomit_auth_email()
      AND public.condomit_same_cep(uc.condominium_id::TEXT, assembly_minutes_signatures.cep::TEXT)
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.assembly_minutes_signatures FROM authenticated;
GRANT SELECT ON public.assembly_minutes_signatures TO authenticated;

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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
      AND public.condomit_same_cep(uc.condominium_id::TEXT, assembly_row.cep::TEXT)
  ) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.name), ''), caller_email)
    INTO caller_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  caller_name := COALESCE(NULLIF(caller_name, ''), caller_email);

  INSERT INTO public.assembly_minutes_signatures (
    assembly_id, cep, signer_email, signer_name
  ) VALUES (
    assembly_row.id, assembly_row.cep, caller_email, caller_name
  )
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

NOTIFY pgrst, 'reload schema';
COMMIT;
