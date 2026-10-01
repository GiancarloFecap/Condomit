-- ============================================================
-- CONDOMIT - MIGRACAO 017
-- Cobrança mensal por condomínio (não por síndico).
--
-- Objetivos:
-- 1) o pagamento pertence ao condomínio (CEP), então a troca de
--    síndico não exige novo pagamento enquanto o ciclo estiver ativo;
-- 2) cada pagamento aprovado libera 1 mês de uso;
-- 3) quando o ciclo vence, o condomínio fica com cobrança pendente
--    até que um novo pagamento seja aprovado.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. RECUPERAR CEP EM PAGAMENTOS ANTIGOS QUANDO POSSÍVEL
-- ------------------------------------------------------------
-- Alguns pagamentos de versões antigas podem ter sido gravados apenas
-- com o e-mail do síndico. Como o pagamento é do condomínio, tentamos
-- completar o CEP usando o vínculo user_condominiums.
UPDATE public.pagamento p
SET cep = c.cep
FROM public.user_condominiums uc
JOIN public.condominiums c
  ON public.condomit_same_cep(c.cep::TEXT, uc.condominium_id::TEXT)
WHERE (p.cep IS NULL OR BTRIM(COALESCE(p.cep::TEXT, '')) = '')
  AND LOWER(BTRIM(COALESCE(p.email, ''))) = LOWER(BTRIM(COALESCE(uc.user_email, '')));

CREATE INDEX IF NOT EXISTS idx_pagamento_condomit_billing
  ON public.pagamento (cep, status_pagamento, data_pagamento DESC);

-- ------------------------------------------------------------
-- 2. STATUS DE COBRANÇA DO CONDOMÍNIO DO USUÁRIO ATUAL
-- ------------------------------------------------------------
-- A função usa o pagamento APROVADO mais recente do CEP.
-- Cada pagamento aprovado vale por 1 mês contado de data_pagamento.
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
  last_payment RECORD;
  paid_at TIMESTAMPTZ;
  due_at TIMESTAMPTZ;
  is_active BOOLEAN := FALSE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF caller_cep IS NULL OR BTRIM(caller_cep) = '' THEN
    RETURN jsonb_build_object(
      'cep', NULL,
      'status', 'no_condominium',
      'can_use', TRUE,
      'role', caller_role,
      'payment_id', NULL,
      'plan_id', NULL,
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', NULL
    );
  END IF;

  SELECT
    p.id,
    p.plano_id,
    p.data_pagamento,
    p.email,
    p.valor_pago,
    p.codigo_transacao
  INTO last_payment
  FROM public.pagamento p
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, caller_cep)
  ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC
  LIMIT 1;

  IF last_payment.id IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep,
      'status', 'unpaid',
      'can_use', FALSE,
      'role', caller_role,
      'payment_id', NULL,
      'plan_id', NULL,
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', 0
    );
  END IF;

  paid_at := last_payment.data_pagamento;

  -- Pagamentos aprovados devem possuir data_pagamento. Caso um registro
  -- legado não possua, ele é tratado como vencido em vez de liberar acesso
  -- indefinidamente.
  IF paid_at IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep,
      'status', 'overdue',
      'can_use', FALSE,
      'role', caller_role,
      'payment_id', last_payment.id,
      'plan_id', last_payment.plano_id,
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', 0
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
    'last_paid_at', paid_at,
    'due_at', due_at,
    'days_remaining', CASE
      WHEN is_active THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (due_at - NOW())) / 86400.0)::INT)
      ELSE 0
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_get_billing_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_get_billing_status() TO authenticated;

COMMIT;
