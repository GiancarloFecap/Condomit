-- ============================================================
-- CONDOMIT - MIGRACAO 027
-- Regras de assinatura e encerramento automático de assembleias.
--
-- 1) Mantém o ciclo de cobrança mensal por condomínio.
-- 2) Expõe também o nome do plano no status de cobrança.
-- 3) Encerra assembleias sem participantes somente após 30 minutos
--    do horário cadastrado e, depois disso, nas verificações periódicas.
-- ============================================================

BEGIN;

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
      'plan_name', NULL,
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', NULL
    );
  END IF;

  SELECT
    p.id,
    p.plano_id,
    pl.nome AS plan_name,
    p.data_pagamento,
    p.email,
    p.valor_pago,
    p.codigo_transacao
  INTO last_payment
  FROM public.pagamento p
  LEFT JOIN public.plano pl ON pl.id = p.plano_id
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
      'plan_name', NULL,
      'last_paid_at', NULL,
      'due_at', NULL,
      'days_remaining', 0
    );
  END IF;

  paid_at := last_payment.data_pagamento;

  IF paid_at IS NULL THEN
    RETURN jsonb_build_object(
      'cep', caller_cep,
      'status', 'overdue',
      'can_use', FALSE,
      'role', caller_role,
      'payment_id', last_payment.id,
      'plan_id', last_payment.plano_id,
      'plan_name', last_payment.plan_name,
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
    'plan_name', last_payment.plan_name,
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

ALTER TABLE public.scheduled_assemblies
  ADD COLUMN IF NOT EXISTS last_presence_check_at TIMESTAMPTZ;

COMMENT ON COLUMN public.scheduled_assemblies.last_presence_check_at IS
  'Última verificação de presença da rotina automática de 30 minutos.';

CREATE OR REPLACE FUNCTION public.condomit_close_stale_assemblies()
RETURNS TABLE (assembly_id BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH due_checks AS (
    SELECT
      sa.id,
      EXISTS (
        SELECT 1
        FROM public.assembly_attendance aa
        WHERE aa.assembly_id = sa.id
          AND LOWER(COALESCE(aa.presence_status, '')) = 'presente'
          AND COALESCE(aa.last_heartbeat_at, aa.updated_at, aa.joined_at)
              >= NOW() - INTERVAL '2 minutes'
      ) AS has_active_participant
    FROM public.scheduled_assemblies sa
    WHERE LOWER(COALESCE(sa.status, '')) IN ('agendada', 'em_andamento')
      -- A primeira checagem só fica elegível 30 minutos após o início
      -- cadastrado. Portanto, nunca há encerramento automático antes disso.
      AND (sa.date::date + sa.start_time::time)
          <= ((NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '30 minutes')
      -- Se a assembleia permaneceu ativa na última checagem, espere mais
      -- 30 minutos antes de verificar novamente.
      AND (
        sa.last_presence_check_at IS NULL
        OR sa.last_presence_check_at <= NOW() - INTERVAL '30 minutes'
      )
  ), closed AS (
    UPDATE public.scheduled_assemblies sa
    SET
      status = 'encerrada',
      ended_at = COALESCE(sa.ended_at, NOW()),
      last_presence_check_at = NOW(),
      updated_at = NOW()
    FROM due_checks dc
    WHERE sa.id = dc.id
      AND dc.has_active_participant = FALSE
    RETURNING sa.id
  ), checked_and_kept_open AS (
    UPDATE public.scheduled_assemblies sa
    SET
      last_presence_check_at = NOW(),
      updated_at = NOW()
    FROM due_checks dc
    WHERE sa.id = dc.id
      AND dc.has_active_participant = TRUE
    RETURNING sa.id
  )
  SELECT id FROM closed;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_close_stale_assemblies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_close_stale_assemblies() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
