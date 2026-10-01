BEGIN;

-- ============================================================
-- Condomit 0.53.0
-- 1) assinatura desenhada da ata com validação canônica de condomínio
-- 2) leitura de notificações persistida no servidor
-- 3) preferências de notificações por usuário
-- 4) assinaturas Web Push por dispositivo
-- 5) revogação de todas as sessões do usuário
-- ============================================================

-- ------------------------------------------------------------
-- 1. ASSINATURA DA ATA
-- ------------------------------------------------------------
ALTER TABLE public.assembly_minutes_signatures
  ADD COLUMN IF NOT EXISTS signature_data TEXT;

DROP FUNCTION IF EXISTS public.condomit_sign_assembly_minutes(BIGINT);
DROP FUNCTION IF EXISTS public.condomit_sign_assembly_minutes(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.condomit_sign_assembly_minutes(
  target_assembly_id BIGINT,
  target_signature_data TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := LOWER(COALESCE(public.condomit_current_user_role(), public.condomit_current_user_type(), ''));
  caller_name TEXT;
  caller_signature TEXT := NULLIF(BTRIM(COALESCE(target_signature_data, '')), '');
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

  -- Helper canônico: considera user_condominiums e o JSON users.condominium,
  -- inclusive após troca de síndico e vínculos legados.
  IF NOT public.condomit_user_belongs_to_cep(assembly_row.cep::TEXT) THEN
    RAISE EXCEPTION 'Esta assembleia pertence a outro condomínio.' USING ERRCODE = '42501';
  END IF;

  IF caller_signature IS NULL
     OR caller_signature !~ '^data:image/(png|jpeg|jpg|webp);base64,'
     OR CHAR_LENGTH(caller_signature) > 1500000 THEN
    RAISE EXCEPTION 'Faça uma assinatura válida antes de concluir.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(u.name), ''), caller_email)
    INTO caller_name
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  caller_name := COALESCE(NULLIF(caller_name, ''), caller_email);

  INSERT INTO public.assembly_minutes_signatures (
    assembly_id, cep, signer_email, signer_name, signature_data, signed_at
  ) VALUES (
    assembly_row.id, assembly_row.cep, caller_email, caller_name, caller_signature, NOW()
  )
  ON CONFLICT (assembly_id) DO UPDATE
  SET signer_email = EXCLUDED.signer_email,
      signer_name = EXCLUDED.signer_name,
      signature_data = EXCLUDED.signature_data,
      signed_at = NOW();

  SELECT s.* INTO signature_row
  FROM public.assembly_minutes_signatures s
  WHERE s.assembly_id = target_assembly_id
  LIMIT 1;

  RETURN to_jsonb(signature_row);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_sign_assembly_minutes(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_sign_assembly_minutes(BIGINT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2. ESTADO DE LEITURA DE NOTIFICAÇÕES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id BIGINT NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON public.notification_reads(LOWER(user_email), read_at DESC);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_reads_select_035 ON public.notification_reads;
CREATE POLICY notification_reads_select_035 ON public.notification_reads
FOR SELECT TO authenticated
USING (LOWER(user_email) = public.condomit_auth_email());
DROP POLICY IF EXISTS notification_reads_insert_035 ON public.notification_reads;
CREATE POLICY notification_reads_insert_035 ON public.notification_reads
FOR INSERT TO authenticated
WITH CHECK (LOWER(user_email) = public.condomit_auth_email());
DROP POLICY IF EXISTS notification_reads_update_035 ON public.notification_reads;
CREATE POLICY notification_reads_update_035 ON public.notification_reads
FOR UPDATE TO authenticated
USING (LOWER(user_email) = public.condomit_auth_email())
WITH CHECK (LOWER(user_email) = public.condomit_auth_email());

GRANT SELECT, INSERT, UPDATE ON public.notification_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_mark_notification_read(target_notification_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  row_cep TEXT;
  row_recipient TEXT;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT n.cep, n.recipient_email INTO row_cep, row_recipient
  FROM public.notifications n
  WHERE n.id = target_notification_id
  LIMIT 1;

  IF row_cep IS NULL
     OR NOT public.condomit_user_belongs_to_cep(row_cep)
     OR (row_recipient IS NOT NULL AND LOWER(row_recipient) <> caller_email) THEN
    RAISE EXCEPTION 'Notificação não encontrada ou sem acesso.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notification_reads(notification_id, user_email, read_at)
  VALUES (target_notification_id, caller_email, NOW())
  ON CONFLICT (notification_id, user_email)
  DO UPDATE SET read_at = LEAST(public.notification_reads.read_at, EXCLUDED.read_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  affected INTEGER := 0;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notification_reads(notification_id, user_email, read_at)
  SELECT n.id, caller_email, NOW()
  FROM public.notifications n
  WHERE public.condomit_same_cep(n.cep, public.condomit_current_user_cep())
    AND (n.recipient_email IS NULL OR LOWER(COALESCE(n.recipient_email,'')) = caller_email)
  ON CONFLICT (notification_id, user_email) DO NOTHING;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_mark_notification_read(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_mark_notification_read(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_mark_all_notifications_read() TO authenticated;

-- Lista notificações com estado de leitura e papel do autor.
CREATE OR REPLACE FUNCTION public.condomit_list_notifications()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(n)
    || jsonb_build_object(
      'is_read', EXISTS (
        SELECT 1 FROM public.notification_reads nr
        WHERE nr.notification_id = n.id
          AND LOWER(nr.user_email) = public.condomit_auth_email()
      ),
      'actor_role', COALESCE((
        SELECT LOWER(COALESCE(u.user_type, ''))
        FROM public.users u
        WHERE LOWER(COALESCE(u.email,'')) = LOWER(COALESCE(n.created_by,''))
        LIMIT 1
      ), '')
    )
  FROM public.notifications n
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_same_cep(n.cep, public.condomit_current_user_cep())
    AND (
      n.recipient_email IS NULL
      OR LOWER(COALESCE(n.recipient_email, '')) = public.condomit_auth_email()
    )
  ORDER BY n.created_at DESC, n.id DESC;
$$;

GRANT EXECUTE ON FUNCTION public.condomit_list_notifications() TO authenticated;

-- ------------------------------------------------------------
-- 3. PREFERÊNCIAS DE NOTIFICAÇÃO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_email TEXT PRIMARY KEY REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  counterpart_messages BOOLEAN NOT NULL DEFAULT TRUE,
  general_notices BOOLEAN NOT NULL DEFAULT TRUE,
  reservations BOOLEAN NOT NULL DEFAULT TRUE,
  packages BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_notification_preferences_select_035 ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_select_035 ON public.user_notification_preferences
FOR SELECT TO authenticated USING (LOWER(user_email) = public.condomit_auth_email());
DROP POLICY IF EXISTS user_notification_preferences_insert_035 ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_insert_035 ON public.user_notification_preferences
FOR INSERT TO authenticated WITH CHECK (LOWER(user_email) = public.condomit_auth_email());
DROP POLICY IF EXISTS user_notification_preferences_update_035 ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_update_035 ON public.user_notification_preferences
FOR UPDATE TO authenticated
USING (LOWER(user_email) = public.condomit_auth_email())
WITH CHECK (LOWER(user_email) = public.condomit_auth_email());

GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_get_notification_preferences()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  row_data public.user_notification_preferences%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_notification_preferences(user_email)
  VALUES (caller_email)
  ON CONFLICT (user_email) DO NOTHING;

  SELECT * INTO row_data
  FROM public.user_notification_preferences
  WHERE LOWER(user_email) = caller_email
  LIMIT 1;

  RETURN to_jsonb(row_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_set_notification_preference(
  target_preference TEXT,
  target_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  pref TEXT := LOWER(BTRIM(COALESCE(target_preference,'')));
  row_data public.user_notification_preferences%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_notification_preferences(user_email)
  VALUES (caller_email)
  ON CONFLICT (user_email) DO NOTHING;

  IF pref = 'counterpart_messages' THEN
    UPDATE public.user_notification_preferences SET counterpart_messages = target_enabled, updated_at = NOW() WHERE LOWER(user_email)=caller_email;
  ELSIF pref = 'general_notices' THEN
    UPDATE public.user_notification_preferences SET general_notices = target_enabled, updated_at = NOW() WHERE LOWER(user_email)=caller_email;
  ELSIF pref = 'reservations' THEN
    UPDATE public.user_notification_preferences SET reservations = target_enabled, updated_at = NOW() WHERE LOWER(user_email)=caller_email;
  ELSIF pref = 'packages' THEN
    UPDATE public.user_notification_preferences SET packages = target_enabled, updated_at = NOW() WHERE LOWER(user_email)=caller_email;
  ELSE
    RAISE EXCEPTION 'Preferência de notificação inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO row_data FROM public.user_notification_preferences WHERE LOWER(user_email)=caller_email LIMIT 1;
  RETURN to_jsonb(row_data);
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_get_notification_preferences() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_set_notification_preference(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_get_notification_preferences() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_set_notification_preference(TEXT, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 4. WEB PUSH POR DISPOSITIVO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  user_role TEXT NOT NULL DEFAULT 'morador',
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_notification_id BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(LOWER(user_email), enabled);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_cep ON public.push_subscriptions(cep, enabled);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_subscriptions_select_035 ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_035 ON public.push_subscriptions FOR SELECT TO authenticated
USING (LOWER(user_email) = public.condomit_auth_email());
DROP POLICY IF EXISTS push_subscriptions_insert_035 ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_035 ON public.push_subscriptions FOR INSERT TO authenticated
WITH CHECK (
  LOWER(user_email) = public.condomit_auth_email()
  AND public.condomit_user_belongs_to_cep(cep)
);
DROP POLICY IF EXISTS push_subscriptions_update_035 ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_035 ON public.push_subscriptions FOR UPDATE TO authenticated
USING (LOWER(user_email) = public.condomit_auth_email())
WITH CHECK (
  LOWER(user_email) = public.condomit_auth_email()
  AND public.condomit_user_belongs_to_cep(cep)
);
DROP POLICY IF EXISTS push_subscriptions_delete_035 ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_035 ON public.push_subscriptions FOR DELETE TO authenticated
USING (LOWER(user_email) = public.condomit_auth_email());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.push_subscriptions_id_seq TO authenticated;

-- ------------------------------------------------------------
-- 5. SAIR DE TODOS OS DISPOSITIVOS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_revoke_all_user_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  affected INTEGER := 0;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_session_log
  SET revoked_at = NOW()
  WHERE LOWER(user_email) = caller_email
    AND revoked_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_revoke_all_user_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_revoke_all_user_sessions() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
