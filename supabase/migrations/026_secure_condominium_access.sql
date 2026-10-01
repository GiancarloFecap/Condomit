-- ============================================================
-- CONDOMIT - MIGRAÇÃO 026
-- Códigos de acesso seguros para entrada/mudança de condomínio.
-- Substitui a regra antiga "senha = nome do condomínio".
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.condominium_access_codes (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  cep TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS condominium_access_codes_cep_active_idx
  ON public.condominium_access_codes (cep, active, created_at DESC);

ALTER TABLE public.condominium_access_codes ENABLE ROW LEVEL SECURITY;

-- Nenhum código/hash deve ser lido diretamente pelo navegador.
DROP POLICY IF EXISTS condominium_access_codes_no_direct_select ON public.condominium_access_codes;
CREATE POLICY condominium_access_codes_no_direct_select
  ON public.condominium_access_codes
  FOR SELECT
  TO authenticated
  USING (FALSE);

REVOKE ALL ON public.condominium_access_codes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.condominium_access_codes FROM authenticated;
GRANT SELECT ON public.condominium_access_codes TO authenticated;

CREATE OR REPLACE FUNCTION public.condomit_create_condominium_access_code(
  target_cep TEXT,
  valid_hours INTEGER DEFAULT 168,
  allowed_uses INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  canonical_cep TEXT;
  raw_code TEXT;
  expiry TIMESTAMPTZ;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF caller_role <> 'sindico' THEN
    RAISE EXCEPTION 'Apenas o síndico pode gerar códigos de acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT c.cep INTO canonical_cep
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep::TEXT, target_cep)
  LIMIT 1;

  IF canonical_cep IS NULL OR NOT public.condomit_user_belongs_to_cep(canonical_cep) THEN
    RAISE EXCEPTION 'Condomínio não autorizado para esta conta.' USING ERRCODE = '42501';
  END IF;

  IF valid_hours IS NOT NULL AND (valid_hours < 1 OR valid_hours > 8760) THEN
    RAISE EXCEPTION 'A validade deve estar entre 1 e 8760 horas.' USING ERRCODE = '22023';
  END IF;

  IF allowed_uses IS NOT NULL AND (allowed_uses < 1 OR allowed_uses > 10000) THEN
    RAISE EXCEPTION 'A quantidade de usos deve estar entre 1 e 10000.' USING ERRCODE = '22023';
  END IF;

  -- Ao gerar um novo código, os anteriores são revogados.
  UPDATE public.condominium_access_codes
     SET active = FALSE
   WHERE public.condomit_same_cep(cep, canonical_cep)
     AND active = TRUE;

  raw_code := UPPER(
    SUBSTRING(ENCODE(extensions.gen_random_bytes(6), 'hex') FROM 1 FOR 4)
    || '-'
    || SUBSTRING(ENCODE(extensions.gen_random_bytes(6), 'hex') FROM 1 FOR 4)
  );

  expiry := CASE
    WHEN valid_hours IS NULL THEN NULL
    ELSE NOW() + make_interval(hours => valid_hours)
  END;

  INSERT INTO public.condominium_access_codes(
    cep, code_hash, created_by_email, expires_at, max_uses
  ) VALUES (
    canonical_cep,
    extensions.crypt(raw_code, extensions.gen_salt('bf', 10)),
    caller_email,
    expiry,
    allowed_uses
  );

  RETURN jsonb_build_object(
    'code', raw_code,
    'cep', canonical_cep,
    'expires_at', expiry,
    'max_uses', allowed_uses
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_revoke_condominium_access_codes(target_cep TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  canonical_cep TEXT;
  affected INTEGER := 0;
BEGIN
  IF caller_email = '' OR caller_role <> 'sindico' THEN
    RAISE EXCEPTION 'Apenas o síndico pode revogar códigos de acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT c.cep INTO canonical_cep
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep::TEXT, target_cep)
  LIMIT 1;

  IF canonical_cep IS NULL OR NOT public.condomit_user_belongs_to_cep(canonical_cep) THEN
    RAISE EXCEPTION 'Condomínio não autorizado para esta conta.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.condominium_access_codes
     SET active = FALSE
   WHERE public.condomit_same_cep(cep, canonical_cep)
     AND active = TRUE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.condomit_join_condominium_secure(
  target_cep TEXT,
  access_code TEXT,
  target_apartment TEXT DEFAULT NULL,
  target_block TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  condo_row public.condominiums%ROWTYPE;
  code_row public.condominium_access_codes%ROWTYPE;
  apartment_value TEXT;
  block_value TEXT;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente.' USING ERRCODE = '42501';
  END IF;

  IF TRIM(COALESCE(access_code, '')) = '' THEN
    RAISE EXCEPTION 'Código de acesso obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT c.* INTO condo_row
  FROM public.condominiums c
  WHERE public.condomit_same_cep(c.cep::TEXT, target_cep)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Condomínio não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  SELECT x.* INTO code_row
  FROM public.condominium_access_codes x
  WHERE public.condomit_same_cep(x.cep, condo_row.cep)
    AND x.active = TRUE
    AND (x.expires_at IS NULL OR x.expires_at > NOW())
    AND (x.max_uses IS NULL OR x.uses < x.max_uses)
    AND extensions.crypt(UPPER(TRIM(access_code)), x.code_hash) = x.code_hash
  ORDER BY x.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de acesso inválido, expirado ou revogado. Solicite um novo código ao síndico.' USING ERRCODE = '42501';
  END IF;

  IF caller_role = 'morador' THEN
    apartment_value := NULLIF(TRIM(COALESCE(target_apartment, '')), '');
    block_value := UPPER(NULLIF(TRIM(COALESCE(target_block, '')), ''));

    IF apartment_value IS NULL OR block_value IS NULL THEN
      RAISE EXCEPTION 'Apartamento e bloco são obrigatórios para moradores.' USING ERRCODE = '22023';
    END IF;

    IF apartment_value !~ '^\d+$' OR apartment_value::INTEGER < 1 OR apartment_value::INTEGER > condo_row.total_apartments THEN
      RAISE EXCEPTION 'Apartamento inválido para este condomínio.' USING ERRCODE = '22023';
    END IF;

    IF condo_row.block_names IS NOT NULL
       AND cardinality(condo_row.block_names) > 0
       AND NOT (block_value = ANY(ARRAY(SELECT UPPER(x) FROM unnest(condo_row.block_names) AS x))) THEN
      RAISE EXCEPTION 'Bloco não encontrado neste condomínio.' USING ERRCODE = '22023';
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

  UPDATE public.condominium_access_codes
     SET uses = uses + 1,
         active = CASE WHEN max_uses IS NOT NULL AND uses + 1 >= max_uses THEN FALSE ELSE active END
   WHERE id = code_row.id;

  RETURN jsonb_build_object(
    'cep', condo_row.cep,
    'condominium_id', condo_row.cep,
    'name', condo_row.condominium_name,
    'condominium_name', condo_row.condominium_name,
    'total_apartments', condo_row.total_apartments,
    'block_names', condo_row.block_names,
    'apartment', apartment_value,
    'block', block_value
  );
END;
$$;

-- Mantém compatibilidade com telas antigas, mas o parâmetro agora é um código seguro.
CREATE OR REPLACE FUNCTION public.condomit_change_my_condominium(
  target_cep TEXT,
  condominium_password TEXT,
  target_apartment TEXT DEFAULT NULL,
  target_block TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.condomit_join_condominium_secure(
    target_cep,
    condominium_password,
    target_apartment,
    target_block
  );
$$;

REVOKE ALL ON FUNCTION public.condomit_create_condominium_access_code(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_revoke_condominium_access_codes(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_join_condominium_secure(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_change_my_condominium(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.condomit_create_condominium_access_code(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_revoke_condominium_access_codes(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_join_condominium_secure(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_change_my_condominium(TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
