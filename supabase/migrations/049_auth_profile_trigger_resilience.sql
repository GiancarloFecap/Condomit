-- ============================================================
-- CONDOMIT - MIGRACAO 049
-- Impede que a sincronizacao de public.users bloqueie a criacao
-- de usuarios no Supabase Auth.
--
-- O Supabase Auth deve continuar sendo a fonte de autenticacao.
-- Se a tabela de perfil tiver alguma diferenca de schema legado,
-- o erro e registrado como WARNING e o usuario de auth.users e
-- criado normalmente. O backend sincroniza public.users depois.
-- ============================================================
BEGIN;

-- Senhas pertencem exclusivamente ao Supabase Auth.
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

-- Remove novamente qualquer trigger especifico antigo do ADM que possa ter
-- permanecido em um banco no qual as migrations foram executadas parcialmente.
DROP TRIGGER IF EXISTS condomit_ensure_admin_public_profile ON auth.users;
DROP FUNCTION IF EXISTS public.condomit_ensure_admin_public_profile();

-- Sincronizador resiliente. Nenhuma falha em public.users pode cancelar um
-- INSERT valido feito pelo GoTrue/Supabase Auth.
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

  IF to_regclass('public.users') IS NULL THEN
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

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'demo_access'
  ) THEN
    cols := cols || ', demo_access';
    vals := vals || ', $6';
    updates := updates || ', demo_access = CASE WHEN LOWER(EXCLUDED.email) = ''contato.condomit@gmail.com'' THEN TRUE ELSE COALESCE(public.users.demo_access, FALSE) END';
  END IF;

  EXECUTE format(
    'INSERT INTO public.users (%s) VALUES (%s) ON CONFLICT (email) DO UPDATE SET %s',
    cols,
    vals,
    updates
  )
  USING
    LOWER(BTRIM(NEW.email)),
    COALESCE(
      NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'name', '')), ''),
      CASE WHEN LOWER(BTRIM(NEW.email)) = 'contato.condomit@gmail.com' THEN 'Administrador Condomit' ELSE NULL END
    ),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone', '')), ''),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'cpf', '')), ''),
    COALESCE(
      NULLIF(BTRIM(COALESCE(
        NEW.raw_user_meta_data ->> 'user_type',
        NEW.raw_user_meta_data ->> 'type',
        ''
      )), ''),
      CASE WHEN LOWER(BTRIM(NEW.email)) = 'contato.condomit@gmail.com' THEN 'sindico' ELSE NULL END
    ),
    (LOWER(BTRIM(NEW.email)) = 'contato.condomit@gmail.com');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Condomit: perfil publico nao sincronizado para %: [%] %',
      COALESCE(NEW.email, '<sem-email>'), SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS condomit_sync_auth_user_profile ON auth.users;
CREATE TRIGGER condomit_sync_auth_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.condomit_sync_auth_user_profile();

-- Tenta garantir o perfil do ADM imediatamente, sem impedir a migration se o
-- banco tiver um schema legado ainda mais antigo. O endpoint server-side fara
-- nova tentativa apos preparar o Auth.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.users (email, name, user_type, demo_access)
    VALUES ('contato.condomit@gmail.com', 'Administrador Condomit', 'sindico', TRUE)
    ON CONFLICT (email) DO UPDATE
    SET name = COALESCE(NULLIF(public.users.name, ''), EXCLUDED.name),
        user_type = COALESCE(NULLIF(public.users.user_type, ''), EXCLUDED.user_type),
        demo_access = TRUE;
  EXCEPTION
    WHEN undefined_column THEN
      BEGIN
        INSERT INTO public.users (email, name, user_type)
        VALUES ('contato.condomit@gmail.com', 'Administrador Condomit', 'sindico')
        ON CONFLICT (email) DO UPDATE
        SET name = COALESCE(NULLIF(public.users.name, ''), EXCLUDED.name),
            user_type = COALESCE(NULLIF(public.users.user_type, ''), EXCLUDED.user_type);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Condomit: nao foi possivel precriar perfil ADM: [%] %', SQLSTATE, SQLERRM;
      END;
    WHEN OTHERS THEN
      RAISE WARNING 'Condomit: nao foi possivel precriar perfil ADM: [%] %', SQLSTATE, SQLERRM;
  END;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
