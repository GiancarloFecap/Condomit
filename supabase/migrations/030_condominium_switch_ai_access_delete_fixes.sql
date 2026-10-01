-- ============================================================
-- CONDOMIT - MIGRACAO 030
-- 1) Corrige troca de condominio quando user_condominiums.apartment e INTEGER.
-- 2) Disponibiliza ao sindico o status seguro do codigo de acesso (sem expor hash).
-- 3) Garante exclusao em cascata do vinculo user_condominiums -> users.
-- ============================================================

BEGIN;

-- O banco de producao usa apartment como INTEGER em user_condominiums.
-- A RPC anterior montava apartment_value como TEXT, causando:
-- column "apartment" is of type integer but expression is of type text.
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
  apartment_number INTEGER := NULL;
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
    IF NULLIF(TRIM(COALESCE(target_apartment, '')), '') IS NULL
       OR NULLIF(TRIM(COALESCE(target_block, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Apartamento e bloco são obrigatórios para moradores.' USING ERRCODE = '22023';
    END IF;

    IF TRIM(target_apartment) !~ '^\d+$' THEN
      RAISE EXCEPTION 'Apartamento inválido para este condomínio.' USING ERRCODE = '22023';
    END IF;

    apartment_number := TRIM(target_apartment)::INTEGER;
    block_value := UPPER(TRIM(target_block));

    IF apartment_number < 1 OR apartment_number > condo_row.total_apartments THEN
      RAISE EXCEPTION 'Apartamento inválido para este condomínio.' USING ERRCODE = '22023';
    END IF;

    IF condo_row.block_names IS NOT NULL
       AND cardinality(condo_row.block_names) > 0
       AND NOT (block_value = ANY(ARRAY(SELECT UPPER(x) FROM unnest(condo_row.block_names) AS x))) THEN
      RAISE EXCEPTION 'Bloco não encontrado neste condomínio.' USING ERRCODE = '22023';
    END IF;
  ELSE
    -- Porteiro/sindico nao possuem apartamento residencial.
    -- NULL e compatível tanto com coluna INTEGER quanto com telas que usam o JSON.
    apartment_number := NULL;
    block_value := COALESCE(
      NULLIF(TRIM(COALESCE(target_block, '')), ''),
      CASE WHEN caller_role = 'porteiro' THEN 'Portaria' ELSE '-' END
    );
  END IF;

  DELETE FROM public.user_condominiums
  WHERE LOWER(COALESCE(user_email, '')) = caller_email;

  INSERT INTO public.user_condominiums(user_email, condominium_id, apartment, block)
  VALUES (caller_email, condo_row.cep, apartment_number, block_value);

  UPDATE public.users u
  SET condominium = jsonb_strip_nulls(
    COALESCE(u.condominium, '{}'::jsonb)
    || jsonb_build_object(
      'cep', condo_row.cep,
      'condominium_id', condo_row.cep,
      'name', condo_row.condominium_name,
      'apartment', apartment_number,
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
    'apartment', apartment_number,
    'block', block_value
  );
END;
$$;

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

-- Retorna somente metadados. O codigo puro nunca e recuperado do banco,
-- pois ele e armazenado apenas como hash.
CREATE OR REPLACE FUNCTION public.condomit_get_condominium_access_code_status(
  target_cep TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT := public.condomit_current_user_role();
  canonical_cep TEXT;
  code_row public.condominium_access_codes%ROWTYPE;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  IF caller_role <> 'sindico' THEN
    RAISE EXCEPTION 'A informação do código de acesso é exclusiva do síndico.' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(TRIM(COALESCE(target_cep, '')), '') IS NULL THEN
    SELECT c.cep INTO canonical_cep
    FROM public.condominiums c
    WHERE public.condomit_user_belongs_to_cep(c.cep::TEXT)
    LIMIT 1;
  ELSE
    SELECT c.cep INTO canonical_cep
    FROM public.condominiums c
    WHERE public.condomit_same_cep(c.cep::TEXT, target_cep)
      AND public.condomit_user_belongs_to_cep(c.cep::TEXT)
    LIMIT 1;
  END IF;

  IF canonical_cep IS NULL THEN
    RAISE EXCEPTION 'Condomínio não autorizado para esta conta.' USING ERRCODE = '42501';
  END IF;

  SELECT x.* INTO code_row
  FROM public.condominium_access_codes x
  WHERE public.condomit_same_cep(x.cep, canonical_cep)
    AND x.active = TRUE
    AND (x.expires_at IS NULL OR x.expires_at > NOW())
    AND (x.max_uses IS NULL OR x.uses < x.max_uses)
  ORDER BY x.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_active_code', FALSE, 'cep', canonical_cep);
  END IF;

  RETURN jsonb_build_object(
    'has_active_code', TRUE,
    'cep', canonical_cep,
    'created_at', code_row.created_at,
    'expires_at', code_row.expires_at,
    'max_uses', code_row.max_uses,
    'uses', code_row.uses
  );
END;
$$;

-- Bancos antigos podem ter o FK de user_condominiums configurado como
-- NO ACTION/RESTRICT. Isso causa HTTP 409 ao apagar public.users.
DO $$
DECLARE
  rec RECORD;
BEGIN
  IF to_regclass('public.user_condominiums') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL THEN
    FOR rec IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.user_condominiums'::regclass
        AND confrelid = 'public.users'::regclass
        AND contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE public.user_condominiums DROP CONSTRAINT %I', rec.conname);
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_condominiums' AND column_name='user_email'
    ) THEN
      ALTER TABLE public.user_condominiums
        ADD CONSTRAINT user_condominiums_user_email_fkey
        FOREIGN KEY (user_email) REFERENCES public.users(email)
        ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.condomit_get_condominium_access_code_status(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.condomit_get_condominium_access_code_status(TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION public.condomit_join_condominium_secure(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_change_my_condominium(TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
