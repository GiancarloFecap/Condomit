-- ============================================================
-- MIGRAÇÃO 013 - ANEXOS NO CHAT
-- Condomit
-- ============================================================
-- Execute no Supabase SQL Editor depois da migration 012.

BEGIN;

ALTER TABLE public.condominium_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_data TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT;

ALTER TABLE public.condominium_chat_messages
  ALTER COLUMN message SET DEFAULT '';

ALTER TABLE public.condominium_chat_messages
  DROP CONSTRAINT IF EXISTS condominium_chat_messages_message_check;

ALTER TABLE public.condominium_chat_messages
  DROP CONSTRAINT IF EXISTS condominium_chat_messages_attachment_check;

ALTER TABLE public.condominium_chat_messages
  ADD CONSTRAINT condominium_chat_messages_message_check
  CHECK (
    CHAR_LENGTH(TRIM(COALESCE(message, ''))) BETWEEN 1 AND 2000
    OR (
      NULLIF(TRIM(COALESCE(attachment_name, '')), '') IS NOT NULL
      AND NULLIF(COALESCE(attachment_data, ''), '') IS NOT NULL
    )
  );

ALTER TABLE public.condominium_chat_messages
  ADD CONSTRAINT condominium_chat_messages_attachment_check
  CHECK (
    attachment_data IS NULL
    OR (
      attachment_name IS NOT NULL
      AND CHAR_LENGTH(attachment_name) BETWEEN 1 AND 255
      AND COALESCE(attachment_size, 0) BETWEEN 1 AND 2097152
      AND attachment_data LIKE 'data:%;base64,%'
      AND CHAR_LENGTH(COALESCE(attachment_type, '')) <= 150
    )
  );

DROP FUNCTION IF EXISTS public.condomit_chat_get_messages(TEXT);
DROP FUNCTION IF EXISTS public.condomit_chat_send_message(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.condomit_chat_send_message(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT);

CREATE FUNCTION public.condomit_chat_get_messages(other_email TEXT)
RETURNS TABLE (
  id BIGINT,
  cep TEXT,
  sender_email TEXT,
  recipient_email TEXT,
  message TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_data TEXT,
  attachment_size BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  current_cep TEXT := public.condomit_current_user_cep();
  target_email TEXT := LOWER(TRIM(COALESCE(other_email, '')));
BEGIN
  IF caller_email = '' OR current_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  IF target_email = '' OR NOT public.condomit_email_belongs_to_cep(target_email, current_cep) THEN
    RAISE EXCEPTION 'Usuário não pertence ao mesmo condomínio.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.cep,
    m.sender_email,
    m.recipient_email,
    m.message,
    m.attachment_name,
    m.attachment_type,
    m.attachment_data,
    m.attachment_size,
    m.created_at
  FROM public.condominium_chat_messages m
  WHERE public.condomit_same_cep(m.cep, current_cep)
    AND (
      (LOWER(m.sender_email) = caller_email AND LOWER(m.recipient_email) = target_email)
      OR
      (LOWER(m.sender_email) = target_email AND LOWER(m.recipient_email) = caller_email)
    )
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 1000;
END;
$$;

CREATE FUNCTION public.condomit_chat_send_message(
  other_email TEXT,
  message_text TEXT DEFAULT '',
  attachment_name TEXT DEFAULT NULL,
  attachment_type TEXT DEFAULT NULL,
  attachment_data TEXT DEFAULT NULL,
  attachment_size BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  current_cep TEXT := public.condomit_current_user_cep();
  target_email TEXT := LOWER(TRIM(COALESCE(other_email, '')));
  clean_message TEXT := TRIM(COALESCE(message_text, ''));
  clean_attachment_name TEXT := NULLIF(TRIM(COALESCE(attachment_name, '')), '');
  clean_attachment_type TEXT := NULLIF(TRIM(COALESCE(attachment_type, '')), '');
  clean_attachment_data TEXT := NULLIF(COALESCE(attachment_data, ''), '');
  inserted_row public.condominium_chat_messages%ROWTYPE;
BEGIN
  IF caller_email = '' OR current_cep IS NULL THEN
    RAISE EXCEPTION 'Sessão ou condomínio inválido.' USING ERRCODE = '42501';
  END IF;

  IF target_email = '' OR target_email = caller_email THEN
    RAISE EXCEPTION 'Destinatário inválido.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.condomit_email_belongs_to_cep(target_email, current_cep) THEN
    RAISE EXCEPTION 'O destinatário não pertence ao mesmo condomínio.' USING ERRCODE = '42501';
  END IF;

  IF CHAR_LENGTH(clean_message) > 2000 THEN
    RAISE EXCEPTION 'A mensagem deve ter no máximo 2000 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF clean_attachment_data IS NULL AND clean_message = '' THEN
    RAISE EXCEPTION 'Digite uma mensagem ou anexe um arquivo.' USING ERRCODE = '22023';
  END IF;

  IF clean_attachment_data IS NOT NULL THEN
    IF clean_attachment_name IS NULL THEN
      RAISE EXCEPTION 'Nome do arquivo anexado inválido.' USING ERRCODE = '22023';
    END IF;
    IF CHAR_LENGTH(clean_attachment_name) > 255 THEN
      RAISE EXCEPTION 'O nome do arquivo é muito longo.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(attachment_size, 0) < 1 OR attachment_size > 2097152 THEN
      RAISE EXCEPTION 'O arquivo deve ter no máximo 2 MB.' USING ERRCODE = '22023';
    END IF;
    IF clean_attachment_data NOT LIKE 'data:%;base64,%' THEN
      RAISE EXCEPTION 'Formato do arquivo anexado inválido.' USING ERRCODE = '22023';
    END IF;
  ELSE
    clean_attachment_name := NULL;
    clean_attachment_type := NULL;
    attachment_size := NULL;
  END IF;

  INSERT INTO public.condominium_chat_messages (
    cep,
    sender_email,
    recipient_email,
    message,
    attachment_name,
    attachment_type,
    attachment_data,
    attachment_size
  ) VALUES (
    current_cep,
    caller_email,
    target_email,
    clean_message,
    clean_attachment_name,
    clean_attachment_type,
    clean_attachment_data,
    attachment_size
  )
  RETURNING * INTO inserted_row;

  RETURN to_jsonb(inserted_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.condomit_chat_get_messages(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_send_message(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
