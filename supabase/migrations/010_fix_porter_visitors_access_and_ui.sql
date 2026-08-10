-- ============================================================
-- MIGRAÇÃO 010 - PORTARIA / VISITANTES / REGISTRO DE ACESSO
-- Condomit
--
-- Corrige:
-- 1) todos os visitantes do mesmo CEP ficam visíveis para a portaria;
-- 2) status de liberação deixa de depender de localStorage;
-- 3) liberar/revogar/recusar gera histórico persistente;
-- 4) registro de acesso guarda apartamento/bloco do responsável;
-- 5) RPCs seguras evitam depender de SELECT amplo em users.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. HELPERS (recriados aqui para a migration ser autocontida)
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

CREATE OR REPLACE FUNCTION public.condomit_user_condo_ceps(target_email TEXT)
RETURNS TABLE (cep TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT source.cep
  FROM (
    SELECT uc.condominium_id::TEXT AS cep
    FROM public.user_condominiums uc
    WHERE LOWER(COALESCE(uc.user_email, ''))
      = LOWER(COALESCE(target_email, ''))

    UNION ALL

    SELECT values_row.cep
    FROM public.users u
    CROSS JOIN LATERAL (
      VALUES
        (u.condominium ->> 'cep'),
        (u.condominium ->> 'condominium_id'),
        (u.condominium ->> 'condominium_cep'),
        (u.condominium ->> 'condominiumId')
    ) AS values_row(cep)
    WHERE LOWER(COALESCE(u.email, ''))
      = LOWER(COALESCE(target_email, ''))
  ) AS source
  WHERE NULLIF(
    REGEXP_REPLACE(COALESCE(source.cep, ''), '\D', '', 'g'),
    ''
  ) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.condomit_current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT LOWER(COALESCE(u.user_type, ''))
  FROM public.users u
  WHERE LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- 2. STATUS DE LIBERAÇÃO PERSISTENTE NA TABELA VISITORS
-- ------------------------------------------------------------
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS cep TEXT;

-- Recupera o CEP de registros antigos que foram criados antes de visitors.cep
-- ser preenchido pelo frontend. O CPF é comparado sem máscara.
UPDATE public.visitors v
SET cep = COALESCE(
  (
    SELECT uc.condominium_id::TEXT
    FROM public.users u
    JOIN public.user_condominiums uc
      ON LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
    WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
        = REGEXP_REPLACE(COALESCE(v.responsible_cpf, ''), '\D', '', 'g')
    ORDER BY uc.condominium_id::TEXT
    LIMIT 1
  ),
  (
    SELECT COALESCE(
      NULLIF(u.condominium ->> 'cep', ''),
      NULLIF(u.condominium ->> 'condominium_id', ''),
      NULLIF(u.condominium ->> 'condominium_cep', ''),
      NULLIF(u.condominium ->> 'condominiumId', '')
    )
    FROM public.users u
    WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
        = REGEXP_REPLACE(COALESCE(v.responsible_cpf, ''), '\D', '', 'g')
    LIMIT 1
  )
)
WHERE NULLIF(REGEXP_REPLACE(COALESCE(v.cep, ''), '\D', '', 'g'), '') IS NULL;

ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS release_status TEXT,
  ADD COLUMN IF NOT EXISTS release_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_status_updated_by TEXT;

UPDATE public.visitors
SET release_status = CASE LOWER(TRIM(COALESCE(release_status, '')))
  WHEN 'liberado' THEN 'liberado'
  WHEN 'approved' THEN 'liberado'
  WHEN 'released' THEN 'liberado'
  WHEN 'confirmed' THEN 'liberado'
  WHEN 'recusado' THEN 'recusado'
  WHEN 'rejected' THEN 'recusado'
  WHEN 'denied' THEN 'recusado'
  WHEN 'revogado' THEN 'revogado'
  WHEN 'revoked' THEN 'revogado'
  WHEN 'aguardando' THEN 'aguardando'
  WHEN 'pending' THEN 'aguardando'
  WHEN 'awaiting' THEN 'aguardando'
  ELSE 'aguardando'
END
WHERE release_status IS NULL
   OR LOWER(TRIM(release_status)) NOT IN ('aguardando', 'liberado', 'revogado', 'recusado');

ALTER TABLE public.visitors
  ALTER COLUMN release_status SET DEFAULT 'aguardando';

UPDATE public.visitors
SET release_status = 'aguardando'
WHERE release_status IS NULL;

ALTER TABLE public.visitors
  ALTER COLUMN release_status SET NOT NULL;

ALTER TABLE public.visitors
  DROP CONSTRAINT IF EXISTS visitors_release_status_check;

ALTER TABLE public.visitors
  ADD CONSTRAINT visitors_release_status_check
  CHECK (release_status IN ('aguardando', 'liberado', 'revogado', 'recusado'));

CREATE INDEX IF NOT EXISTS idx_visitors_cep_release_status
  ON public.visitors (cep, release_status);

-- ------------------------------------------------------------
-- 3. HISTÓRICO COMPARTILHADO DE ALTERAÇÕES DE ACESSO
-- ------------------------------------------------------------
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
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visitor_access_logs_action_check
    CHECK (action IN ('liberacao', 'revogacao', 'recusa')),
  CONSTRAINT visitor_access_logs_movement_type_check
    CHECK (movement_type IN ('entry', 'exit'))
);

CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_cep_created
  ON public.visitor_access_logs (cep, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_visitor
  ON public.visitor_access_logs (visitor_cpf, created_at DESC);

ALTER TABLE public.visitor_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitor_access_logs_select_policy
ON public.visitor_access_logs;

CREATE POLICY visitor_access_logs_select_policy
ON public.visitor_access_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.condomit_user_condo_ceps(public.condomit_auth_email()) mine
    WHERE public.condomit_same_cep(mine.cep, visitor_access_logs.cep)
  )
);

-- Escritas são feitas exclusivamente pela RPC SECURITY DEFINER abaixo.
DROP POLICY IF EXISTS visitor_access_logs_insert_policy
ON public.visitor_access_logs;

-- ------------------------------------------------------------
-- 4. LISTAR VISITANTES PELO CEP DO USUÁRIO LOGADO
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.condomit_list_visitors_for_current_condominium();

CREATE FUNCTION public.condomit_list_visitors_for_current_condominium()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    to_jsonb(v)
    || jsonb_build_object(
      'release_status', COALESCE(v.release_status, 'aguardando'),
      'responsible',
      CASE
        WHEN u.email IS NULL THEN NULL
        ELSE jsonb_build_object(
          'cpf', u.cpf,
          'name', u.name,
          'phone', u.phone,
          'email', u.email,
          'condominium',
            COALESCE(u.condominium, '{}'::jsonb)
            || jsonb_build_object(
              'cep', v.cep,
              'condominium_id', v.cep,
              'apartment', COALESCE(
                NULLIF(TRIM(uc.apartment::TEXT), ''),
                NULLIF(TRIM(u.condominium ->> 'apartment'), ''),
                NULLIF(TRIM(u.condominium ->> 'apartamento'), ''),
                ''
              ),
              'block', COALESCE(
                NULLIF(TRIM(uc.block::TEXT), ''),
                NULLIF(TRIM(u.condominium ->> 'block'), ''),
                NULLIF(TRIM(u.condominium ->> 'bloco'), ''),
                ''
              )
            )
        )
      END
    )
  FROM public.visitors v
  LEFT JOIN public.users u
    ON REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
     = REGEXP_REPLACE(COALESCE(v.responsible_cpf, ''), '\D', '', 'g')
  LEFT JOIN LATERAL (
    SELECT uc_inner.apartment, uc_inner.block
    FROM public.user_condominiums uc_inner
    WHERE LOWER(COALESCE(uc_inner.user_email, '')) = LOWER(COALESCE(u.email, ''))
      AND public.condomit_same_cep(uc_inner.condominium_id::TEXT, v.cep)
    LIMIT 1
  ) uc ON TRUE
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_current_user_role() IN ('porteiro', 'sindico', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.condomit_user_condo_ceps(public.condomit_auth_email()) mine
      WHERE public.condomit_same_cep(mine.cep, v.cep)
    )
  ORDER BY v.created_at DESC NULLS LAST, v.cpf;
$$;

-- ------------------------------------------------------------
-- 5. LIBERAR / REVOGAR / RECUSAR E GERAR O REGISTRO DE ACESSO
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.condomit_set_visitor_release_status(TEXT, TEXT);

CREATE FUNCTION public.condomit_set_visitor_release_status(
  target_cpf TEXT,
  next_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_email TEXT := public.condomit_auth_email();
  caller_role TEXT;
  normalized_target TEXT := REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g');
  normalized_next TEXT := LOWER(TRIM(COALESCE(next_status, '')));
  final_status TEXT;
  log_action TEXT;
  movement TEXT;
  visitor_row public.visitors%ROWTYPE;
  responsible_cpf_value TEXT;
  responsible_name_value TEXT;
  apartment_value TEXT;
  block_value TEXT;
BEGIN
  IF caller_email = '' THEN
    RAISE EXCEPTION 'Sessão inválida. Faça login novamente.' USING ERRCODE = '42501';
  END IF;

  SELECT public.condomit_current_user_role()
    INTO caller_role;

  IF COALESCE(caller_role, '') NOT IN ('porteiro', 'sindico', 'admin') THEN
    RAISE EXCEPTION 'Usuário sem permissão para alterar a liberação do visitante.' USING ERRCODE = '42501';
  END IF;

  IF LENGTH(normalized_target) <> 11 THEN
    RAISE EXCEPTION 'CPF do visitante inválido.' USING ERRCODE = '22023';
  END IF;

  CASE normalized_next
    WHEN 'liberado' THEN
      final_status := 'liberado';
      log_action := 'liberacao';
      movement := 'entry';
    WHEN 'approved' THEN
      final_status := 'liberado';
      log_action := 'liberacao';
      movement := 'entry';
    WHEN 'released' THEN
      final_status := 'liberado';
      log_action := 'liberacao';
      movement := 'entry';
    WHEN 'revogado' THEN
      final_status := 'revogado';
      log_action := 'revogacao';
      movement := 'exit';
    WHEN 'revoked' THEN
      final_status := 'revogado';
      log_action := 'revogacao';
      movement := 'exit';
    WHEN 'aguardando' THEN
      final_status := 'revogado';
      log_action := 'revogacao';
      movement := 'exit';
    WHEN 'pending' THEN
      final_status := 'revogado';
      log_action := 'revogacao';
      movement := 'exit';
    WHEN 'recusado' THEN
      final_status := 'recusado';
      log_action := 'recusa';
      movement := 'exit';
    WHEN 'rejected' THEN
      final_status := 'recusado';
      log_action := 'recusa';
      movement := 'exit';
    ELSE
      RAISE EXCEPTION 'Status de liberação inválido.' USING ERRCODE = '22023';
  END CASE;

  SELECT v.*
    INTO visitor_row
  FROM public.visitors v
  WHERE REGEXP_REPLACE(COALESCE(v.cpf, ''), '\D', '', 'g') = normalized_target
    AND EXISTS (
      SELECT 1
      FROM public.condomit_user_condo_ceps(caller_email) mine
      WHERE public.condomit_same_cep(mine.cep, v.cep)
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visitante não encontrado no condomínio do usuário.' USING ERRCODE = 'P0002';
  END IF;

  -- Não duplica histórico se o botão for disparado duas vezes para o mesmo estado.
  IF visitor_row.release_status = final_status THEN
    RETURN jsonb_build_object(
      'cpf', visitor_row.cpf,
      'release_status', visitor_row.release_status,
      'release_status_updated_at', visitor_row.release_status_updated_at,
      'changed', FALSE
    );
  END IF;

  SELECT
    u.cpf,
    u.name,
    COALESCE(
      NULLIF(TRIM(uc.apartment::TEXT), ''),
      NULLIF(TRIM(u.condominium ->> 'apartment'), ''),
      NULLIF(TRIM(u.condominium ->> 'apartamento'), ''),
      ''
    ),
    COALESCE(
      NULLIF(TRIM(uc.block::TEXT), ''),
      NULLIF(TRIM(u.condominium ->> 'block'), ''),
      NULLIF(TRIM(u.condominium ->> 'bloco'), ''),
      ''
    )
  INTO
    responsible_cpf_value,
    responsible_name_value,
    apartment_value,
    block_value
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT uc_inner.apartment, uc_inner.block
    FROM public.user_condominiums uc_inner
    WHERE LOWER(COALESCE(uc_inner.user_email, '')) = LOWER(COALESCE(u.email, ''))
      AND public.condomit_same_cep(uc_inner.condominium_id::TEXT, visitor_row.cep)
    LIMIT 1
  ) uc ON TRUE
  WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(visitor_row.responsible_cpf, ''), '\D', '', 'g')
  LIMIT 1;

  UPDATE public.visitors
  SET
    release_status = final_status,
    release_status_updated_at = NOW(),
    release_status_updated_by = caller_email
  WHERE cpf = visitor_row.cpf
  RETURNING * INTO visitor_row;

  INSERT INTO public.visitor_access_logs (
    cep,
    visitor_cpf,
    visitor_name,
    responsible_cpf,
    responsible_name,
    apartment,
    block,
    action,
    movement_type,
    created_by,
    created_at
  ) VALUES (
    visitor_row.cep,
    visitor_row.cpf,
    COALESCE(visitor_row.full_name, 'Visitante'),
    COALESCE(responsible_cpf_value, visitor_row.responsible_cpf),
    COALESCE(responsible_name_value, ''),
    COALESCE(apartment_value, ''),
    COALESCE(block_value, ''),
    log_action,
    movement,
    caller_email,
    NOW()
  );

  RETURN jsonb_build_object(
    'cpf', visitor_row.cpf,
    'release_status', visitor_row.release_status,
    'release_status_updated_at', visitor_row.release_status_updated_at,
    'release_status_updated_by', visitor_row.release_status_updated_by,
    'action', log_action,
    'movement_type', movement,
    'changed', TRUE
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. LER HISTÓRICO DO MESMO CONDOMÍNIO
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.condomit_list_visitor_access_logs();

CREATE FUNCTION public.condomit_list_visitor_access_logs()
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(log_row)
  FROM public.visitor_access_logs log_row
  WHERE public.condomit_auth_email() <> ''
    AND public.condomit_current_user_role() IN ('porteiro', 'sindico', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.condomit_user_condo_ceps(public.condomit_auth_email()) mine
      WHERE public.condomit_same_cep(mine.cep, log_row.cep)
    )
  ORDER BY log_row.created_at DESC
  LIMIT 500;
$$;

-- ------------------------------------------------------------
-- 7. PERMISSÕES
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.condomit_current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_user_condo_ceps(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_list_visitors_for_current_condominium() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_set_visitor_release_status(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_list_visitor_access_logs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.condomit_auth_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_same_cep(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_user_condo_ceps(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_visitors_for_current_condominium() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_set_visitor_release_status(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_list_visitor_access_logs() TO authenticated;

GRANT SELECT ON public.visitor_access_logs TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
