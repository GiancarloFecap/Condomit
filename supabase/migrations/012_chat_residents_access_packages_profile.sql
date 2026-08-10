-- ============================================================
-- CONDOMIT - MIGRACAO 012
-- Chat por condomínio, moradores reais, dependentes/veículos,
-- foto de perfil persistente, encomendas e ajustes de portaria.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. HELPERS DE IDENTIDADE E CONDOMÍNIO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT LOWER(COALESCE(auth.jwt() ->> 'email', ''));
$$;

CREATE OR REPLACE FUNCTION public.condomit_same_cep(a TEXT, b TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    NULLIF(REGEXP_REPLACE(COALESCE(a, ''), '\D', '', 'g'), '') IS NOT NULL
    AND REGEXP_REPLACE(COALESCE(a, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(b, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.condomit_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT LOWER(COALESCE((
    SELECT u.user_type
    FROM public.users u
    WHERE LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
    LIMIT 1
  ), ''));
$$;

CREATE OR REPLACE FUNCTION public.condomit_current_user_cep()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  result_cep TEXT;
BEGIN
  IF caller_email = '' THEN
    RETURN NULL;
  END IF;

  -- Vínculo em user_condominiums é a fonte preferencial.
  SELECT c.cep
  INTO result_cep
  FROM public.user_condominiums uc
  JOIN public.condominiums c
    ON public.condomit_same_cep(c.cep::TEXT, uc.condominium_id::TEXT)
  WHERE LOWER(COALESCE(uc.user_email, '')) = caller_email
  LIMIT 1;

  IF result_cep IS NOT NULL THEN
    RETURN result_cep;
  END IF;

  -- Compatibilidade com contas antigas que guardam o CEP apenas em users.condominium.
  SELECT c.cep
  INTO result_cep
  FROM public.users u
  JOIN public.condominiums c
    ON public.condomit_same_cep(
      c.cep::TEXT,
      COALESCE(
        u.condominium ->> 'cep',
        u.condominium ->> 'condominium_id',
        u.condominium ->> 'condominium_cep'
      )
    )
  WHERE LOWER(COALESCE(u.email, '')) = caller_email
  LIMIT 1;

  RETURN result_cep;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_email_belongs_to_cep(target_email TEXT, target_cep TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(TRIM(target_email), '') <> ''
    AND COALESCE(TRIM(target_cep), '') <> ''
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_condominiums uc
        WHERE LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(target_email, ''))
          AND public.condomit_same_cep(uc.condominium_id::TEXT, target_cep)
      )
      OR EXISTS (
        SELECT 1
        FROM public.users u
        WHERE LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(target_email, ''))
          AND jsonb_typeof(u.condominium) = 'object'
          AND (
            public.condomit_same_cep(u.condominium ->> 'cep', target_cep)
            OR public.condomit_same_cep(u.condominium ->> 'condominium_id', target_cep)
            OR public.condomit_same_cep(u.condominium ->> 'condominium_cep', target_cep)
          )
      )
    );
$$;

-- ------------------------------------------------------------
-- 2. FOTO DE PERFIL PERSISTENTE
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_photo TEXT;

CREATE OR REPLACE FUNCTION public.condomit_save_profile_photo(photo_data TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF photo_data IS NOT NULL AND LENGTH(photo_data) > 3000000 THEN
    RAISE EXCEPTION 'A foto de perfil é muito grande.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
  SET profile_photo = NULLIF(photo_data, '')
  WHERE LOWER(COALESCE(email, '')) = caller_email;

  RETURN photo_data;
END;
$$;

-- ------------------------------------------------------------
-- 3. MORADORES REAIS DO CONDOMÍNIO
-- Apenas quem realmente possui vínculo em user_condominiums.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_list_condo_residents()
RETURNS TABLE (
  email TEXT,
  name TEXT,
  phone TEXT,
  user_type TEXT,
  profile_photo TEXT,
  apartment TEXT,
  block TEXT,
  cep TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF public.condomit_auth_email() = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF current_cep IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (LOWER(u.email))
    u.email::TEXT,
    COALESCE(NULLIF(u.name, ''), u.email)::TEXT,
    COALESCE(u.phone, '')::TEXT,
    u.user_type::TEXT,
    u.profile_photo::TEXT,
    COALESCE(uc.apartment::TEXT, '')::TEXT,
    COALESCE(uc.block::TEXT, '')::TEXT,
    current_cep::TEXT
  FROM public.user_condominiums uc
  JOIN public.users u
    ON LOWER(COALESCE(u.email, '')) = LOWER(COALESCE(uc.user_email, ''))
  WHERE public.condomit_same_cep(uc.condominium_id::TEXT, current_cep)
    AND LOWER(COALESCE(u.user_type, '')) = 'morador'
  ORDER BY LOWER(u.email), COALESCE(uc.block::TEXT, ''), COALESCE(uc.apartment::TEXT, '');
END;
$$;

-- ------------------------------------------------------------
-- 4. CHAT INDIVIDUAL POR CEP
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.condominium_chat_messages (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL REFERENCES public.condominiums(cep) ON UPDATE CASCADE ON DELETE CASCADE,
  sender_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  recipient_email TEXT NOT NULL REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT condominium_chat_messages_message_check
    CHECK (CHAR_LENGTH(TRIM(message)) BETWEEN 1 AND 2000),
  CONSTRAINT condominium_chat_messages_distinct_users_check
    CHECK (LOWER(sender_email) <> LOWER(recipient_email))
);

CREATE INDEX IF NOT EXISTS idx_condominium_chat_pair_created
  ON public.condominium_chat_messages(cep, sender_email, recipient_email, created_at DESC);

ALTER TABLE public.condominium_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS condominium_chat_messages_select_policy ON public.condominium_chat_messages;
DROP POLICY IF EXISTS condominium_chat_messages_insert_policy ON public.condominium_chat_messages;

CREATE POLICY condominium_chat_messages_select_policy
ON public.condominium_chat_messages
FOR SELECT TO authenticated
USING (
  public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND (
    LOWER(sender_email) = public.condomit_auth_email()
    OR LOWER(recipient_email) = public.condomit_auth_email()
  )
);

CREATE POLICY condominium_chat_messages_insert_policy
ON public.condominium_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  LOWER(sender_email) = public.condomit_auth_email()
  AND public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND public.condomit_email_belongs_to_cep(recipient_email, cep)
);

CREATE OR REPLACE FUNCTION public.condomit_list_chat_contacts(target_role TEXT)
RETURNS TABLE (
  email TEXT,
  name TEXT,
  phone TEXT,
  user_type TEXT,
  profile_photo TEXT,
  apartment TEXT,
  block TEXT,
  cep TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_cep TEXT := public.condomit_current_user_cep();
  normalized_role TEXT := LOWER(TRIM(COALESCE(target_role, '')));
BEGIN
  IF public.condomit_auth_email() = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF normalized_role NOT IN ('morador', 'porteiro', 'sindico', 'síndico') THEN
    RAISE EXCEPTION 'Tipo de contato inválido.' USING ERRCODE = '22023';
  END IF;

  IF normalized_role = 'síndico' THEN
    normalized_role := 'sindico';
  END IF;

  IF current_cep IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (LOWER(u.email))
    u.email::TEXT,
    COALESCE(NULLIF(u.name, ''), u.email)::TEXT,
    COALESCE(u.phone, '')::TEXT,
    u.user_type::TEXT,
    u.profile_photo::TEXT,
    COALESCE(uc.apartment::TEXT, '')::TEXT,
    COALESCE(uc.block::TEXT, '')::TEXT,
    current_cep::TEXT
  FROM public.users u
  LEFT JOIN public.user_condominiums uc
    ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
   AND public.condomit_same_cep(uc.condominium_id::TEXT, current_cep)
  WHERE LOWER(COALESCE(u.user_type, '')) = normalized_role
    AND LOWER(COALESCE(u.email, '')) <> public.condomit_auth_email()
    AND public.condomit_email_belongs_to_cep(u.email, current_cep)
    -- Moradores só entram na lista depois de realmente entrarem no condomínio.
    AND (normalized_role <> 'morador' OR uc.user_email IS NOT NULL)
  ORDER BY LOWER(u.email), COALESCE(uc.block::TEXT, ''), COALESCE(uc.apartment::TEXT, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_chat_get_messages(other_email TEXT)
RETURNS TABLE (
  id BIGINT,
  cep TEXT,
  sender_email TEXT,
  recipient_email TEXT,
  message TEXT,
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

CREATE OR REPLACE FUNCTION public.condomit_chat_send_message(other_email TEXT, message_text TEXT)
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

  IF CHAR_LENGTH(clean_message) < 1 OR CHAR_LENGTH(clean_message) > 2000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 1 e 2000 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.condominium_chat_messages (
    cep, sender_email, recipient_email, message
  ) VALUES (
    current_cep, caller_email, target_email, clean_message
  )
  RETURNING * INTO inserted_row;

  RETURN to_jsonb(inserted_row);
END;
$$;

-- ------------------------------------------------------------
-- 5. DEPENDENTES E VEÍCULOS - ESTRUTURA SOLICITADA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dependents (
  cpf TEXT PRIMARY KEY,
  cep TEXT NOT NULL,
  responsible_email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  birth_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dependents_cep_fkey
    FOREIGN KEY (cep) REFERENCES public.condominiums(cep)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT dependents_responsible_email_fkey
    FOREIGN KEY (responsible_email) REFERENCES public.users(email)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  plate TEXT PRIMARY KEY,
  cep TEXT NOT NULL,
  responsible_email TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT NOT NULL,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicles_cep_fkey
    FOREIGN KEY (cep) REFERENCES public.condominiums(cep)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT vehicles_responsible_email_fkey
    FOREIGN KEY (responsible_email) REFERENCES public.users(email)
    ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE public.dependents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dependents_select_policy ON public.dependents;
DROP POLICY IF EXISTS dependents_insert_policy ON public.dependents;
DROP POLICY IF EXISTS dependents_update_policy ON public.dependents;
DROP POLICY IF EXISTS dependents_delete_policy ON public.dependents;

CREATE POLICY dependents_select_policy ON public.dependents
FOR SELECT TO authenticated
USING (
  public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND (
    LOWER(responsible_email) = public.condomit_auth_email()
    OR public.condomit_current_user_role() IN ('sindico', 'síndico', 'porteiro', 'admin')
  )
);

CREATE POLICY dependents_insert_policy ON public.dependents
FOR INSERT TO authenticated
WITH CHECK (
  LOWER(responsible_email) = public.condomit_auth_email()
  AND public.condomit_same_cep(cep, public.condomit_current_user_cep())
);

CREATE POLICY dependents_update_policy ON public.dependents
FOR UPDATE TO authenticated
USING (LOWER(responsible_email) = public.condomit_auth_email())
WITH CHECK (
  LOWER(responsible_email) = public.condomit_auth_email()
  AND public.condomit_same_cep(cep, public.condomit_current_user_cep())
);

CREATE POLICY dependents_delete_policy ON public.dependents
FOR DELETE TO authenticated
USING (
  LOWER(responsible_email) = public.condomit_auth_email()
  OR (
    public.condomit_same_cep(cep, public.condomit_current_user_cep())
    AND public.condomit_current_user_role() IN ('sindico', 'síndico', 'admin')
  )
);

DROP POLICY IF EXISTS vehicles_select_policy ON public.vehicles;
DROP POLICY IF EXISTS vehicles_insert_policy ON public.vehicles;
DROP POLICY IF EXISTS vehicles_update_policy ON public.vehicles;
DROP POLICY IF EXISTS vehicles_delete_policy ON public.vehicles;

CREATE POLICY vehicles_select_policy ON public.vehicles
FOR SELECT TO authenticated
USING (
  public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND (
    LOWER(responsible_email) = public.condomit_auth_email()
    OR public.condomit_current_user_role() IN ('sindico', 'síndico', 'porteiro', 'admin')
  )
);

CREATE POLICY vehicles_insert_policy ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  LOWER(responsible_email) = public.condomit_auth_email()
  AND public.condomit_same_cep(cep, public.condomit_current_user_cep())
);

CREATE POLICY vehicles_update_policy ON public.vehicles
FOR UPDATE TO authenticated
USING (LOWER(responsible_email) = public.condomit_auth_email())
WITH CHECK (
  LOWER(responsible_email) = public.condomit_auth_email()
  AND public.condomit_same_cep(cep, public.condomit_current_user_cep())
);

CREATE POLICY vehicles_delete_policy ON public.vehicles
FOR DELETE TO authenticated
USING (
  LOWER(responsible_email) = public.condomit_auth_email()
  OR (
    public.condomit_same_cep(cep, public.condomit_current_user_cep())
    AND public.condomit_current_user_role() IN ('sindico', 'síndico', 'admin')
  )
);

-- ------------------------------------------------------------
-- 6. ENCOMENDAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packages (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  package_description TEXT NOT NULL,
  carrier TEXT,
  tracking_code TEXT,
  received_by TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'Aguardando retirada'
    CHECK (status IN ('Aguardando retirada', 'Retirada', 'Devolvida')),
  delivered_at TIMESTAMPTZ,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT packages_cep_fkey
    FOREIGN KEY (cep) REFERENCES public.condominiums(cep)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT packages_recipient_email_fkey
    FOREIGN KEY (recipient_email) REFERENCES public.users(email)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_packages_cep_status_received
  ON public.packages(cep, status, received_at DESC);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packages_select_policy ON public.packages;
DROP POLICY IF EXISTS packages_insert_policy ON public.packages;
DROP POLICY IF EXISTS packages_update_policy ON public.packages;
DROP POLICY IF EXISTS packages_delete_policy ON public.packages;

CREATE POLICY packages_select_policy ON public.packages
FOR SELECT TO authenticated
USING (public.condomit_same_cep(cep, public.condomit_current_user_cep()));

CREATE POLICY packages_insert_policy ON public.packages
FOR INSERT TO authenticated
WITH CHECK (
  public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND public.condomit_email_belongs_to_cep(recipient_email, cep)
);

CREATE POLICY packages_update_policy ON public.packages
FOR UPDATE TO authenticated
USING (
  public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND public.condomit_current_user_role() IN ('porteiro', 'sindico', 'síndico', 'admin')
)
WITH CHECK (public.condomit_same_cep(cep, public.condomit_current_user_cep()));

CREATE POLICY packages_delete_policy ON public.packages
FOR DELETE TO authenticated
USING (
  public.condomit_same_cep(cep, public.condomit_current_user_cep())
  AND public.condomit_current_user_role() IN ('sindico', 'síndico', 'admin')
);

CREATE OR REPLACE FUNCTION public.condomit_list_package_recipients()
RETURNS TABLE (
  email TEXT,
  name TEXT,
  apartment TEXT,
  block TEXT,
  profile_photo TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.email, r.name, r.apartment, r.block, r.profile_photo
  FROM public.condomit_list_condo_residents() r
  ORDER BY r.name, r.block, r.apartment;
$$;

CREATE OR REPLACE FUNCTION public.condomit_list_packages()
RETURNS TABLE (
  id BIGINT,
  cep TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  package_description TEXT,
  carrier TEXT,
  tracking_code TEXT,
  received_by TEXT,
  received_at TIMESTAMPTZ,
  status TEXT,
  delivered_at TIMESTAMPTZ,
  observations TEXT,
  created_at TIMESTAMPTZ,
  apartment TEXT,
  block TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_cep TEXT := public.condomit_current_user_cep();
BEGIN
  IF public.condomit_auth_email() = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF current_cep IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.cep,
    p.recipient_email,
    p.recipient_name,
    p.package_description,
    p.carrier,
    p.tracking_code,
    p.received_by,
    p.received_at,
    p.status,
    p.delivered_at,
    p.observations,
    p.created_at,
    COALESCE(uc.apartment::TEXT, '')::TEXT,
    COALESCE(uc.block::TEXT, '')::TEXT
  FROM public.packages p
  LEFT JOIN LATERAL (
    SELECT x.apartment, x.block
    FROM public.user_condominiums x
    WHERE LOWER(COALESCE(x.user_email, '')) = LOWER(COALESCE(p.recipient_email, ''))
      AND public.condomit_same_cep(x.condominium_id::TEXT, p.cep)
    LIMIT 1
  ) uc ON TRUE
  WHERE public.condomit_same_cep(p.cep, current_cep)
  ORDER BY p.received_at DESC, p.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_set_package_status(package_id BIGINT, next_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  final_status TEXT := TRIM(COALESCE(next_status, ''));
  row_data public.packages%ROWTYPE;
BEGIN
  IF public.condomit_auth_email() = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF public.condomit_current_user_role() NOT IN ('porteiro', 'sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Usuário sem permissão para alterar encomendas.' USING ERRCODE = '42501';
  END IF;

  IF final_status NOT IN ('Aguardando retirada', 'Retirada', 'Devolvida') THEN
    RAISE EXCEPTION 'Status inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO row_data
  FROM public.packages p
  WHERE p.id = package_id
    AND public.condomit_same_cep(p.cep, public.condomit_current_user_cep())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.packages p
  SET status = final_status,
      delivered_at = CASE WHEN final_status IN ('Retirada', 'Devolvida') THEN NOW() ELSE NULL END
  WHERE p.id = package_id
  RETURNING p.* INTO row_data;

  RETURN to_jsonb(row_data);
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_count_released_visitors()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.visitors v
  WHERE LOWER(COALESCE(v.release_status, '')) = 'liberado'
    AND public.condomit_same_cep(v.cep, public.condomit_current_user_cep());
$$;

CREATE OR REPLACE FUNCTION public.condomit_count_waiting_packages()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.packages p
  WHERE p.status = 'Aguardando retirada'
    AND public.condomit_same_cep(p.cep, public.condomit_current_user_cep());
$$;

-- ------------------------------------------------------------
-- 7. MUDAR DE CONDOMÍNIO
-- Valida o mesmo padrão já usado pelo projeto: senha = nome do condomínio.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.condomit_change_my_condominium(
  target_cep TEXT,
  condominium_password TEXT,
  target_apartment TEXT DEFAULT NULL,
  target_block TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  condo_row public.condominiums%ROWTYPE;
  apartment_value TEXT;
  block_value TEXT;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT c.* INTO condo_row
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep::TEXT, target_cep)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condomínio não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF TRIM(COALESCE(condominium_password, '')) <> COALESCE(condo_row.condominium_name, '') THEN
    RAISE EXCEPTION 'Senha do condomínio incorreta.' USING ERRCODE = '42501';
  END IF;

  IF caller_role = 'morador' THEN
    apartment_value := NULLIF(TRIM(COALESCE(target_apartment, '')), '');
    block_value := NULLIF(TRIM(COALESCE(target_block, '')), '');
    IF apartment_value IS NULL OR block_value IS NULL THEN
      RAISE EXCEPTION 'Apartamento e bloco são obrigatórios para moradores.' USING ERRCODE = '22023';
    END IF;
  ELSE
    apartment_value := COALESCE(NULLIF(TRIM(COALESCE(target_apartment, '')), ''), '-');
    block_value := COALESCE(NULLIF(TRIM(COALESCE(target_block, '')), ''), CASE WHEN caller_role = 'porteiro' THEN 'Portaria' ELSE '-' END);
  END IF;

  DELETE FROM public.user_condominiums
  WHERE LOWER(COALESCE(user_email, '')) = caller_email;

  INSERT INTO public.user_condominiums(user_email, condominium_id, apartment, block)
  VALUES (caller_email, condo_row.cep, apartment_value, block_value);

  UPDATE public.users u
  SET condominium = jsonb_strip_nulls(
    COALESCE(u.condominium, '{}'::jsonb)
    || jsonb_build_object(
      'cep', condo_row.cep,
      'condominium_id', condo_row.cep,
      'name', condo_row.condominium_name,
      'apartment', apartment_value,
      'block', block_value
    )
  )
  WHERE LOWER(COALESCE(u.email, '')) = caller_email;

  RETURN jsonb_build_object(
    'cep', condo_row.cep,
    'condominium_id', condo_row.cep,
    'name', condo_row.condominium_name,
    'apartment', apartment_value,
    'block', block_value
  );
END;
$$;

-- ------------------------------------------------------------
-- 8. HISTÓRICO DE ALTERAÇÕES DE VISITANTES
-- Garante que liberado/revogado/recusado sempre gere registro.
-- ------------------------------------------------------------
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS release_status TEXT DEFAULT 'aguardando';
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS release_status_updated_at TIMESTAMPTZ;
ALTER TABLE public.visitors ADD COLUMN IF NOT EXISTS release_status_updated_by TEXT;

CREATE TABLE IF NOT EXISTS public.visitor_access_logs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  cep TEXT NOT NULL,
  visitor_cpf TEXT NOT NULL,
  visitor_name TEXT NOT NULL,
  responsible_cpf TEXT,
  responsible_name TEXT,
  apartment TEXT,
  block TEXT,
  action TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.condomit_log_visitor_release_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  action_value TEXT;
  movement_value TEXT;
  responsible_name_value TEXT := '';
  apartment_value TEXT := '';
  block_value TEXT := '';
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.release_status IS NOT DISTINCT FROM OLD.release_status THEN
    RETURN NEW;
  END IF;

  CASE LOWER(COALESCE(NEW.release_status, ''))
    WHEN 'liberado' THEN action_value := 'liberacao'; movement_value := 'entry';
    WHEN 'revogado' THEN action_value := 'revogacao'; movement_value := 'exit';
    WHEN 'recusado' THEN action_value := 'recusa'; movement_value := 'exit';
    ELSE RETURN NEW;
  END CASE;

  SELECT
    COALESCE(u.name, ''),
    COALESCE(NULLIF(TRIM(uc.apartment::TEXT), ''), NULLIF(TRIM(u.condominium ->> 'apartment'), ''), ''),
    COALESCE(NULLIF(TRIM(uc.block::TEXT), ''), NULLIF(TRIM(u.condominium ->> 'block'), ''), '')
  INTO responsible_name_value, apartment_value, block_value
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT x.apartment, x.block
    FROM public.user_condominiums x
    WHERE LOWER(COALESCE(x.user_email, '')) = LOWER(COALESCE(u.email, ''))
      AND public.condomit_same_cep(x.condominium_id::TEXT, NEW.cep)
    LIMIT 1
  ) uc ON TRUE
  WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(NEW.responsible_cpf, ''), '\D', '', 'g')
  LIMIT 1;

  INSERT INTO public.visitor_access_logs (
    cep, visitor_cpf, visitor_name, responsible_cpf, responsible_name,
    apartment, block, action, movement_type, created_by, created_at
  ) VALUES (
    NEW.cep,
    NEW.cpf,
    COALESCE(NULLIF(NEW.full_name, ''), 'Visitante'),
    NEW.responsible_cpf,
    COALESCE(responsible_name_value, ''),
    COALESCE(apartment_value, ''),
    COALESCE(block_value, ''),
    action_value,
    movement_value,
    COALESCE(NULLIF(NEW.release_status_updated_by, ''), public.condomit_auth_email()),
    COALESCE(NEW.release_status_updated_at, NOW())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitors_release_access_log ON public.visitors;
CREATE TRIGGER trg_visitors_release_access_log
AFTER UPDATE OF release_status ON public.visitors
FOR EACH ROW EXECUTE FUNCTION public.condomit_log_visitor_release_change();

CREATE OR REPLACE FUNCTION public.condomit_set_visitor_release_status(target_cpf TEXT, next_status TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  normalized_target TEXT := REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g');
  requested_status TEXT := LOWER(TRIM(COALESCE(next_status, '')));
  final_status TEXT;
  visitor_row public.visitors%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF caller_role NOT IN ('porteiro', 'sindico', 'síndico', 'admin') THEN
    RAISE EXCEPTION 'Usuário sem permissão para alterar visitantes.' USING ERRCODE = '42501';
  END IF;

  CASE requested_status
    WHEN 'liberado' THEN final_status := 'liberado';
    WHEN 'approved' THEN final_status := 'liberado';
    WHEN 'released' THEN final_status := 'liberado';
    WHEN 'revogado' THEN final_status := 'revogado';
    WHEN 'revoked' THEN final_status := 'revogado';
    WHEN 'aguardando' THEN final_status := 'revogado';
    WHEN 'pending' THEN final_status := 'revogado';
    WHEN 'recusado' THEN final_status := 'recusado';
    WHEN 'rejected' THEN final_status := 'recusado';
    ELSE RAISE EXCEPTION 'Status de liberação inválido.' USING ERRCODE = '22023';
  END CASE;

  SELECT v.* INTO visitor_row
  FROM public.visitors v
  WHERE REGEXP_REPLACE(COALESCE(v.cpf, ''), '\D', '', 'g') = normalized_target
    AND public.condomit_same_cep(v.cep, public.condomit_current_user_cep())
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visitante não encontrado neste condomínio.' USING ERRCODE = 'P0002';
  END IF;

  IF LOWER(COALESCE(visitor_row.release_status, 'aguardando')) = final_status THEN
    RETURN jsonb_build_object('cpf', visitor_row.cpf, 'release_status', visitor_row.release_status, 'changed', FALSE);
  END IF;

  UPDATE public.visitors
  SET release_status = final_status,
      release_status_updated_at = NOW(),
      release_status_updated_by = caller_email
  WHERE cpf = visitor_row.cpf
  RETURNING * INTO visitor_row;

  RETURN jsonb_build_object(
    'cpf', visitor_row.cpf,
    'release_status', visitor_row.release_status,
    'release_status_updated_at', visitor_row.release_status_updated_at,
    'release_status_updated_by', visitor_row.release_status_updated_by,
    'changed', TRUE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_list_visitor_access_logs()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(l)
  FROM public.visitor_access_logs l
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_same_cep(l.cep, public.condomit_current_user_cep())
  ORDER BY l.created_at DESC
  LIMIT 1000;
$$;

-- ------------------------------------------------------------
-- 9. GRANTS
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.condomit_current_user_cep() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_email_belongs_to_cep(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_save_profile_photo(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_condo_residents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_chat_contacts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_get_messages(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_chat_send_message(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_package_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_packages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_set_package_status(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_count_released_visitors() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_count_waiting_packages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_change_my_condominium(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_set_visitor_release_status(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_visitor_access_logs() TO authenticated;

GRANT SELECT, INSERT ON public.condominium_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dependents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT SELECT ON public.visitor_access_logs TO authenticated;

-- Se as sequences existirem, libera o uso para inserts via cliente autenticado.
DO $$
BEGIN
  IF to_regclass('public.condominium_chat_messages_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.condominium_chat_messages_id_seq TO authenticated';
  END IF;
  IF to_regclass('public.packages_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.packages_id_seq TO authenticated';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
