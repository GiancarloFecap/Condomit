-- ============================================================
-- MIGRAÇÃO 016 - 2FA POR E-MAIL, ENCOMENDAS, RESERVAS E AVISOS
-- Condomit
-- Requer as migrations anteriores aplicadas.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. AUTENTICAÇÃO EM DUAS ETAPAS POR E-MAIL
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.two_factor_action_tokens (
  token_hash TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  desired_enabled BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_action_tokens_email
  ON public.two_factor_action_tokens (user_email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.two_factor_login_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_login_challenges_email
  ON public.two_factor_login_challenges (user_email, created_at DESC);

ALTER TABLE public.two_factor_action_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_factor_login_challenges ENABLE ROW LEVEL SECURITY;

-- Essas tabelas são acessadas exclusivamente pela Netlify Function usando a
-- chave de servidor. Nenhum dado sensível fica acessível pelo navegador.
REVOKE ALL ON public.two_factor_action_tokens FROM anon, authenticated;
REVOKE ALL ON public.two_factor_login_challenges FROM anon, authenticated;

-- ------------------------------------------------------------
-- 2. ENCOMENDAS - PREVISÃO DE CHEGADA
-- ------------------------------------------------------------
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS expected_arrival_date DATE,
  ADD COLUMN IF NOT EXISTS expected_arrival_time TIME;

-- ------------------------------------------------------------
-- 3. RESERVAS - LISTAGEM COMPLETA E BLOQUEIO DE CONFLITOS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_list_my_reservations()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(r)
  FROM public.reserva r
  WHERE public.condomit_auth_email() <> ''
    AND LOWER(COALESCE(r.email, '')) = public.condomit_auth_email()
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
$$;

CREATE OR REPLACE FUNCTION public.condomit_list_reservation_slots()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'email', r.email,
    'nome_local', r.nome_local,
    'data_reserva', r.data_reserva,
    'horario_inicio', r.horario_inicio,
    'horario_fim', r.horario_fim,
    'status', r.status
  )
  FROM public.reserva r
  WHERE public.condomit_auth_email() <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_condominiums uc
      WHERE LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
        AND public.condomit_same_cep(
          uc.condominium_id::TEXT,
          public.condomit_current_user_cep()
        )
    )
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
$$;

CREATE OR REPLACE FUNCTION public.condomit_list_all_reservations()
RETURNS SETOF JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF public.condomit_auth_email() = '' OR caller_cep IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    to_jsonb(r)
    || jsonb_build_object(
      'reserved_by_name', COALESCE(NULLIF(u.name, ''), r.email)
    )
  FROM public.reserva r
  JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
   AND public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
  LEFT JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(r.email, ''))
  ORDER BY r.data_reserva DESC, r.horario_inicio DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_create_reservation(
  target_local TEXT,
  target_date TEXT,
  target_start TEXT,
  target_end TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_cep TEXT := public.condomit_current_user_cep();
  saved_row public.reserva%ROWTYPE;
  start_time TIME;
  end_time TIME;
  lock_key BIGINT;
BEGIN
  IF caller_email = '' OR caller_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(target_local, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Local da reserva é obrigatório.' USING ERRCODE = '23502';
  END IF;

  start_time := target_start::TIME;
  end_time := target_end::TIME;

  IF end_time <= start_time THEN
    RAISE EXCEPTION 'Horário final deve ser posterior ao horário inicial.' USING ERRCODE = '22023';
  END IF;

  -- Evita duas gravações simultâneas para o mesmo local/data.
  lock_key := hashtextextended(
    LOWER(caller_cep || '|' || TRIM(target_local) || '|' || target_date),
    0
  );
  PERFORM pg_advisory_xact_lock(lock_key);

  IF EXISTS (
    SELECT 1
    FROM public.reserva r
    JOIN public.user_condominiums uc
      ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(r.email, ''))
    WHERE public.condomit_same_cep(uc.condominium_id::TEXT, caller_cep)
      AND LOWER(COALESCE(r.nome_local, '')) = LOWER(TRIM(target_local))
      AND r.data_reserva = target_date::DATE
      AND r.horario_inicio < end_time
      AND r.horario_fim > start_time
  ) THEN
    RAISE EXCEPTION 'Este horário já foi reservado ou entra em conflito com outra reserva.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.reserva (
    email, nome_local, data_reserva, horario_inicio, horario_fim, status
  ) VALUES (
    caller_email,
    TRIM(target_local),
    target_date::DATE,
    start_time,
    end_time,
    'indisponivel'
  )
  RETURNING * INTO saved_row;

  RETURN to_jsonb(saved_row);
END;
$$;

-- ------------------------------------------------------------
-- 4. AVISOS DO MURAL - PERSISTÊNCIA
-- ------------------------------------------------------------
-- O feed sempre lista todos os avisos do condomínio; leitura não remove item.
CREATE OR REPLACE FUNCTION public.condomit_list_notifications()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(n)
  FROM public.notifications n
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_same_cep(n.cep, public.condomit_current_user_cep())
  ORDER BY n.created_at DESC, n.id DESC;
$$;

-- Avisos não são apagados pelo cliente. Permanecem no histórico/feed.
DROP POLICY IF EXISTS notifications_delete_policy ON public.notifications;
REVOKE DELETE ON public.notifications FROM authenticated;

GRANT EXECUTE ON FUNCTION public.condomit_list_my_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_reservation_slots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_all_reservations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_create_reservation(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_notifications() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
