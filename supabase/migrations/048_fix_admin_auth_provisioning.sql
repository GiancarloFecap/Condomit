-- ============================================================
-- CONDOMIT - MIGRACAO 048
-- Corrige o provisionamento da conta administrativa fixa.
--
-- Motivo: a migration 047 adicionava um segundo trigger em auth.users.
-- Atualizações do usuário administrativo (por exemplo, redefinição da senha
-- pelo backend antes do login) podiam falhar por causa de diferenças entre
-- schemas legados de public.users. O trigger genérico e compatível criado na
-- migration 028 já cobre novos usuários do Auth.
-- ============================================================
BEGIN;

-- Remove o trigger específico e duplicado da migration 047. O perfil continua
-- sendo sincronizado pelo trigger condomit_sync_auth_user_profile (migration 028)
-- e pelo endpoint server-side /api/demo/account.
DROP TRIGGER IF EXISTS condomit_ensure_admin_public_profile ON auth.users;
DROP FUNCTION IF EXISTS public.condomit_ensure_admin_public_profile();

-- Em instalações antigas, public.users.password podia ser obrigatório. Senhas
-- pertencem exclusivamente ao Supabase Auth e nunca devem bloquear o perfil.
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

-- Backfill compatível com schemas antigos: se o ADM já existir no Auth,
-- garante pelo menos email/nome/tipo em public.users. As colunas opcionais
-- são incluídas apenas quando realmente existem no banco.
DO $$
DECLARE
  admin_auth auth.users%ROWTYPE;
  cols TEXT := 'email';
  vals TEXT := '$1';
  updates TEXT := 'email = EXCLUDED.email';
BEGIN
  SELECT *
    INTO admin_auth
  FROM auth.users
  WHERE LOWER(BTRIM(COALESCE(email, ''))) = 'contato.condomit@gmail.com'
  ORDER BY created_at ASC
  LIMIT 1;

  IF admin_auth.id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) THEN
    cols := cols || ', name';
    vals := vals || ', $2';
    updates := updates || ', name = COALESCE(NULLIF(public.users.name, ''''), EXCLUDED.name)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_type'
  ) THEN
    cols := cols || ', user_type';
    vals := vals || ', $3';
    updates := updates || ', user_type = COALESCE(NULLIF(public.users.user_type, ''''), EXCLUDED.user_type)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'type'
  ) THEN
    cols := cols || ', type';
    vals := vals || ', $3';
    updates := updates || ', type = COALESCE(NULLIF(public.users.type, ''''), EXCLUDED.type)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'demo_access'
  ) THEN
    cols := cols || ', demo_access';
    vals := vals || ', TRUE';
    updates := updates || ', demo_access = TRUE';
  END IF;

  EXECUTE format(
    'INSERT INTO public.users (%s) VALUES (%s) ON CONFLICT (email) DO UPDATE SET %s',
    cols,
    vals,
    updates
  )
  USING
    'contato.condomit@gmail.com',
    COALESCE(NULLIF(BTRIM(admin_auth.raw_user_meta_data ->> 'name'), ''), 'Administrador Condomit'),
    COALESCE(NULLIF(BTRIM(admin_auth.raw_user_meta_data ->> 'user_type'), ''), 'sindico');
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
