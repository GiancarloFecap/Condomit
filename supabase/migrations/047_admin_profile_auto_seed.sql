-- ============================================================
-- CONDOMIT - MIGRACAO 047
-- Garante automaticamente o perfil da conta administrativa
-- em public.users quando ela existe no Supabase Auth.
--
-- IMPORTANTE: a senha NUNCA e salva em public.users.
-- A senha pertence exclusivamente ao Supabase Auth.
-- ============================================================
BEGIN;

-- 1) Backfill: se a conta ja existe em auth.users, cria/atualiza public.users.
DO $$
DECLARE
  admin_auth auth.users%ROWTYPE;
BEGIN
  SELECT *
    INTO admin_auth
  FROM auth.users
  WHERE LOWER(BTRIM(COALESCE(email, ''))) = 'contato.condomit@gmail.com'
  ORDER BY created_at ASC
  LIMIT 1;

  IF admin_auth.id IS NOT NULL THEN
    INSERT INTO public.users (email, name, user_type, demo_access)
    VALUES (
      'contato.condomit@gmail.com',
      COALESCE(NULLIF(BTRIM(admin_auth.raw_user_meta_data ->> 'name'), ''), 'Administrador Condomit'),
      COALESCE(NULLIF(BTRIM(admin_auth.raw_user_meta_data ->> 'user_type'), ''), 'sindico'),
      TRUE
    )
    ON CONFLICT (email) DO UPDATE
    SET name = COALESCE(NULLIF(public.users.name, ''), EXCLUDED.name),
        user_type = COALESCE(NULLIF(public.users.user_type, ''), EXCLUDED.user_type),
        demo_access = TRUE;
  END IF;
END;
$$;

-- 2) Trigger especifico de garantia para futuros INSERT/UPDATE no Auth.
CREATE OR REPLACE FUNCTION public.condomit_ensure_admin_public_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF LOWER(BTRIM(COALESCE(NEW.email, ''))) <> 'contato.condomit@gmail.com' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (email, name, user_type, demo_access)
  VALUES (
    'contato.condomit@gmail.com',
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), ''), 'Administrador Condomit'),
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'user_type'), ''), 'sindico'),
    TRUE
  )
  ON CONFLICT (email) DO UPDATE
  SET name = COALESCE(NULLIF(public.users.name, ''), EXCLUDED.name),
      user_type = COALESCE(NULLIF(public.users.user_type, ''), EXCLUDED.user_type),
      demo_access = TRUE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS condomit_ensure_admin_public_profile ON auth.users;
CREATE TRIGGER condomit_ensure_admin_public_profile
AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.condomit_ensure_admin_public_profile();

NOTIFY pgrst, 'reload schema';
COMMIT;
