-- ============================================================
-- CONDOMIT - MIGRACAO 028
-- Correcoes de cadastro e regra de acesso de porteiros.
--
-- 1) Repara a sincronizacao Auth -> public.users para evitar o erro
--    "Database error saving new user" causado por triggers legados.
-- 2) Impede vinculo de porteiro em condominios Essencial ou sem uma
--    assinatura Pro/Premium ativa.
-- ============================================================

BEGIN;

-- Senhas nunca devem ser persistidas em public.users. Em bancos antigos,
-- esta coluna podia existir como NOT NULL e quebrar cadastros via Auth.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password'
  ) THEN
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN password DROP NOT NULL';
  END IF;
END;
$$;

-- Remove somente triggers customizados de auth.users cuja funcao escreve
-- explicitamente em public.users. Assim substituimos sincronizadores legados
-- quebrados sem tocar nos triggers internos do Supabase.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
      AND t.tgname <> 'condomit_sync_auth_user_profile'
      AND pg_get_functiondef(p.oid) ILIKE '%public.users%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', rec.tgname);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_sync_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cols TEXT := 'email';
  vals TEXT := '$1';
  updates TEXT := 'email = EXCLUDED.email';
BEGIN
  IF NEW.email IS NULL OR BTRIM(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) THEN
    cols := cols || ', name';
    vals := vals || ', $2';
    updates := updates || ', name = COALESCE(EXCLUDED.name, public.users.name)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone'
  ) THEN
    cols := cols || ', phone';
    vals := vals || ', $3';
    updates := updates || ', phone = COALESCE(EXCLUDED.phone, public.users.phone)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'cpf'
  ) THEN
    cols := cols || ', cpf';
    vals := vals || ', $4';
    updates := updates || ', cpf = COALESCE(EXCLUDED.cpf, public.users.cpf)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_type'
  ) THEN
    cols := cols || ', user_type';
    vals := vals || ', $5';
    updates := updates || ', user_type = COALESCE(EXCLUDED.user_type, public.users.user_type)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'type'
  ) THEN
    cols := cols || ', type';
    vals := vals || ', $5';
    updates := updates || ', type = COALESCE(EXCLUDED.type, public.users.type)';
  END IF;

  EXECUTE format(
    'INSERT INTO public.users (%s) VALUES (%s) ON CONFLICT (email) DO UPDATE SET %s',
    cols,
    vals,
    updates
  )
  USING
    LOWER(BTRIM(NEW.email)),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'name', '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'cpf', '')), ''),
    NULLIF(BTRIM(COALESCE(
      NEW.raw_user_meta_data ->> 'user_type',
      NEW.raw_user_meta_data ->> 'type',
      ''
    )), '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS condomit_sync_auth_user_profile ON auth.users;
CREATE TRIGGER condomit_sync_auth_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.condomit_sync_auth_user_profile();

-- Permite que a exclusão de conta remova dados pertencentes ao usuário em
-- vez de ser bloqueada por FKs legadas configuradas como RESTRICT.
DO $$
BEGIN
  IF to_regclass('public.maintenance_items') IS NOT NULL THEN
    ALTER TABLE public.maintenance_items
      DROP CONSTRAINT IF EXISTS maintenance_items_created_by_fkey;
    ALTER TABLE public.maintenance_items
      ADD CONSTRAINT maintenance_items_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(email)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.occurrences') IS NOT NULL THEN
    ALTER TABLE public.occurrences
      DROP CONSTRAINT IF EXISTS occurrences_reporter_email_fkey;
    ALTER TABLE public.occurrences
      ADD CONSTRAINT occurrences_reporter_email_fkey
      FOREIGN KEY (reporter_email) REFERENCES public.users(email)
      ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Porteiro: somente Pro/Premium com mensalidade ativa.
-- A verificacao no banco impede que um cliente antigo ou uma chamada direta
-- de API consiga criar o vinculo em um plano Essencial.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_enforce_porter_plan_on_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  member_role TEXT;
  last_payment RECORD;
  active_until TIMESTAMPTZ;
BEGIN
  SELECT LOWER(BTRIM(COALESCE(u.user_type, '')))
    INTO member_role
  FROM public.users u
  WHERE LOWER(BTRIM(COALESCE(u.email, ''))) = LOWER(BTRIM(COALESCE(NEW.user_email, '')))
  LIMIT 1;

  IF member_role <> 'porteiro' THEN
    RETURN NEW;
  END IF;

  SELECT
    p.id,
    p.data_pagamento,
    pl.nome AS plan_name
  INTO last_payment
  FROM public.pagamento p
  LEFT JOIN public.plano pl ON pl.id = p.plano_id
  WHERE LOWER(BTRIM(COALESCE(p.status_pagamento, ''))) = 'aprovado'
    AND public.condomit_same_cep(p.cep::TEXT, NEW.condominium_id::TEXT)
  ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC
  LIMIT 1;

  IF last_payment.id IS NULL OR last_payment.data_pagamento IS NULL THEN
    RAISE EXCEPTION 'O acesso de porteiro requer um condomínio com plano Pro ou Premium ativo.'
      USING ERRCODE = '42501';
  END IF;

  active_until := last_payment.data_pagamento + INTERVAL '1 month';

  IF NOW() >= active_until THEN
    RAISE EXCEPTION 'A mensalidade do condomínio está vencida. Regularize o pagamento para liberar o porteiro.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    LOWER(BTRIM(COALESCE(last_payment.plan_name, ''))) LIKE '%pro%'
    OR LOWER(BTRIM(COALESCE(last_payment.plan_name, ''))) LIKE '%premium%'
  ) THEN
    RAISE EXCEPTION 'Porteiros estão disponíveis somente nos planos Pro e Premium.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS condomit_enforce_porter_plan_on_membership ON public.user_condominiums;
CREATE TRIGGER condomit_enforce_porter_plan_on_membership
BEFORE INSERT OR UPDATE OF user_email, condominium_id
ON public.user_condominiums
FOR EACH ROW
EXECUTE FUNCTION public.condomit_enforce_porter_plan_on_membership();

NOTIFY pgrst, 'reload schema';

COMMIT;
