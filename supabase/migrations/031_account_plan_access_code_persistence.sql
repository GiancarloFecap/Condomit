-- ============================================================
-- CONDOMIT - MIGRACAO 031
-- 1) Corrige exclusao de conta preservando votacoes coletivas.
-- 2) Persiste o codigo de acesso enquanto ele estiver valido.
-- 3) Faz validade e limite de usos serem regras efetivas do banco.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. EXCLUSAO DE CONTA: assembly_polls.created_by
-- ------------------------------------------------------------
-- Uma enquete/resultado de assembleia pertence ao historico do condominio.
-- Por isso ela nao deve ser apagada junto com a conta do autor. A autoria
-- passa a ser opcional e e desvinculada quando o usuario e excluido.
DO $$
DECLARE
  rec RECORD;
BEGIN
  IF to_regclass('public.assembly_polls') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='assembly_polls' AND column_name='created_by'
     ) THEN
    ALTER TABLE public.assembly_polls ALTER COLUMN created_by DROP NOT NULL;

    FOR rec IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.assembly_polls'::regclass
        AND c.confrelid = 'public.users'::regclass
        AND a.attname = 'created_by'
    LOOP
      EXECUTE format('ALTER TABLE public.assembly_polls DROP CONSTRAINT %I', rec.conname);
    END LOOP;

    ALTER TABLE public.assembly_polls
      ADD CONSTRAINT assembly_polls_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.users(email)
      ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

-- Normaliza outras FKs legadas de coluna unica que ainda estejam como
-- NO ACTION/RESTRICT. Campos opcionais preservam o registro com SET NULL;
-- campos obrigatorios sao dados dependentes da conta e usam CASCADE.
-- Isso evita que a exclusao pare em uma nova tabela logo apos corrigir a FK
-- de assembly_polls.
DO $$
DECLARE
  rec RECORD;
  delete_action TEXT;
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    FOR rec IN
    SELECT
      c.oid,
      c.conname,
      ns.nspname AS schema_name,
      cl.relname AS table_name,
      src.attname AS source_column,
      ref.attname AS target_column,
      src.attnotnull AS source_not_null
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute src ON src.attrelid = c.conrelid AND src.attnum = c.conkey[1]
    JOIN pg_attribute ref ON ref.attrelid = c.confrelid AND ref.attnum = c.confkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.users'::regclass
      AND c.confdeltype IN ('a', 'r')
      AND cardinality(c.conkey) = 1
      AND cardinality(c.confkey) = 1
  LOOP
    delete_action := CASE WHEN rec.source_not_null THEN 'CASCADE' ELSE 'SET NULL' END;
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', rec.schema_name, rec.table_name, rec.conname);
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(%I) ON UPDATE CASCADE ON DELETE %s NOT VALID',
        rec.schema_name,
        rec.table_name,
        rec.conname,
        rec.source_column,
        rec.target_column,
        delete_action
      );
    END LOOP;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 2. CODIGO DE ACESSO PERSISTENTE
-- ------------------------------------------------------------
-- A tabela continua sem SELECT direto para usuarios autenticados. O valor em
-- texto so e devolvido por RPC SECURITY DEFINER ao sindico do mesmo condominio.
ALTER TABLE public.condominium_access_codes
  ADD COLUMN IF NOT EXISTS code_value TEXT;

COMMENT ON COLUMN public.condominium_access_codes.code_value IS
  'Valor recuperavel do codigo enquanto ativo. Acesso somente pelas RPCs seguras do sindico.';

-- Limpa codigos que ja perderam a validade/quantidade de usos.
UPDATE public.condominium_access_codes
SET active = FALSE,
    code_value = NULL
WHERE active = TRUE
  AND (
    (expires_at IS NOT NULL AND expires_at <= NOW())
    OR (max_uses IS NOT NULL AND uses >= max_uses)
  );

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

  IF valid_hours IS NULL OR valid_hours < 1 OR valid_hours > 8760 THEN
    RAISE EXCEPTION 'A validade deve estar entre 1 e 8760 horas.' USING ERRCODE = '22023';
  END IF;

  IF allowed_uses IS NULL OR allowed_uses < 1 OR allowed_uses > 10000 THEN
    RAISE EXCEPTION 'A quantidade de usos deve estar entre 1 e 10000.' USING ERRCODE = '22023';
  END IF;

  -- Um condominio possui apenas um codigo ativo por vez.
  UPDATE public.condominium_access_codes
  SET active = FALSE,
      code_value = NULL
  WHERE public.condomit_same_cep(cep, canonical_cep)
    AND active = TRUE;

  raw_code := UPPER(
    SUBSTRING(ENCODE(extensions.gen_random_bytes(6), 'hex') FROM 1 FOR 4)
    || '-'
    || SUBSTRING(ENCODE(extensions.gen_random_bytes(6), 'hex') FROM 1 FOR 4)
  );

  expiry := NOW() + make_interval(hours => valid_hours);

  INSERT INTO public.condominium_access_codes(
    cep, code_hash, code_value, created_by_email, expires_at, max_uses, uses, active
  ) VALUES (
    canonical_cep,
    extensions.crypt(raw_code, extensions.gen_salt('bf', 10)),
    raw_code,
    caller_email,
    expiry,
    allowed_uses,
    0,
    TRUE
  );

  RETURN jsonb_build_object(
    'code', raw_code,
    'cep', canonical_cep,
    'expires_at', expiry,
    'max_uses', allowed_uses,
    'uses', 0,
    'remaining_uses', allowed_uses
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
  SET active = FALSE,
      code_value = NULL
  WHERE public.condomit_same_cep(cep, canonical_cep)
    AND active = TRUE;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

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

  -- Expirado ou sem usos deixa de ser ativo e o valor recuperavel e removido.
  UPDATE public.condominium_access_codes
  SET active = FALSE,
      code_value = NULL
  WHERE public.condomit_same_cep(cep, canonical_cep)
    AND active = TRUE
    AND (
      (expires_at IS NOT NULL AND expires_at <= NOW())
      OR (max_uses IS NOT NULL AND uses >= max_uses)
    );

  SELECT x.* INTO code_row
  FROM public.condominium_access_codes x
  WHERE public.condomit_same_cep(x.cep, canonical_cep)
    AND x.active = TRUE
    AND x.expires_at > NOW()
    AND x.max_uses IS NOT NULL
    AND x.uses < x.max_uses
  ORDER BY x.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_active_code', FALSE, 'cep', canonical_cep);
  END IF;

  RETURN jsonb_build_object(
    'has_active_code', TRUE,
    'cep', canonical_cep,
    'code', code_row.code_value,
    'created_at', code_row.created_at,
    'expires_at', code_row.expires_at,
    'max_uses', code_row.max_uses,
    'uses', code_row.uses,
    'remaining_uses', GREATEST(0, code_row.max_uses - code_row.uses)
  );
END;
$$;

-- Atualiza a RPC de entrada/troca para expirar o codigo exatamente quando o
-- ultimo uso permitido for consumido.
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

  -- Limpeza oportunista antes da validacao.
  UPDATE public.condominium_access_codes
  SET active = FALSE,
      code_value = NULL
  WHERE public.condomit_same_cep(cep, condo_row.cep)
    AND active = TRUE
    AND (
      (expires_at IS NOT NULL AND expires_at <= NOW())
      OR (max_uses IS NOT NULL AND uses >= max_uses)
    );

  SELECT x.* INTO code_row
  FROM public.condominium_access_codes x
  WHERE public.condomit_same_cep(x.cep, condo_row.cep)
    AND x.active = TRUE
    AND x.expires_at > NOW()
    AND x.max_uses IS NOT NULL
    AND x.uses < x.max_uses
    AND extensions.crypt(UPPER(TRIM(access_code)), x.code_hash) = x.code_hash
  ORDER BY x.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de acesso inválido, expirado, sem usos disponíveis ou revogado. Solicite um novo código ao síndico.' USING ERRCODE = '42501';
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
      active = CASE WHEN uses + 1 >= max_uses THEN FALSE ELSE TRUE END,
      code_value = CASE WHEN uses + 1 >= max_uses THEN NULL ELSE code_value END
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

REVOKE ALL ON FUNCTION public.condomit_create_condominium_access_code(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_revoke_condominium_access_codes(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_get_condominium_access_code_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_join_condominium_secure(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_change_my_condominium(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.condomit_create_condominium_access_code(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_revoke_condominium_access_codes(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_get_condominium_access_code_status(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_join_condominium_secure(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_change_my_condominium(TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
