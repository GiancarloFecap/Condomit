-- ============================================================
-- MIGRAÇÃO 009 - MÃO LEVANTADA + CPF DO RESPONSÁVEL
-- Condomit
--
-- Corrige:
-- 1) conflito raised/lowered x CHECK de assembly_speaking_requests
-- 2) FK visitors_responsible_cpf_fkey com CPF mascarado/sem máscara
-- 3) busca segura de responsável pelo CPF no mesmo condomínio
-- ============================================================

BEGIN;

-- ============================================================
-- 1. HELPERS
-- ============================================================

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

-- Retorna todos os CEPs associados a um e-mail, tanto pela tabela de vínculo
-- quanto pelo JSONB users.condominium.
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

CREATE OR REPLACE FUNCTION public.condomit_users_share_condominium(target_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.condomit_user_condo_ceps(public.condomit_auth_email()) mine
    JOIN public.condomit_user_condo_ceps(target_email) target
      ON public.condomit_same_cep(mine.cep, target.cep)
  );
$$;

-- ============================================================
-- 2. CORRIGIR STATUS DA MÃO LEVANTADA
-- ============================================================

-- Remove temporariamente o CHECK para converter qualquer registro criado
-- pelas versões que usaram raised/lowered.
ALTER TABLE public.assembly_speaking_requests
  DROP CONSTRAINT IF EXISTS assembly_speaking_requests_status_check;

UPDATE public.assembly_speaking_requests
SET status = CASE LOWER(COALESCE(status, ''))
  WHEN 'raised' THEN 'aguardando'
  WHEN 'lowered' THEN 'finalizado'
  WHEN 'aguardando' THEN 'aguardando'
  WHEN 'autorizado' THEN 'autorizado'
  WHEN 'recusado' THEN 'recusado'
  WHEN 'finalizado' THEN 'finalizado'
  ELSE 'finalizado'
END;

ALTER TABLE public.assembly_speaking_requests
  ALTER COLUMN status SET DEFAULT 'aguardando';

ALTER TABLE public.assembly_speaking_requests
  ADD CONSTRAINT assembly_speaking_requests_status_check
  CHECK (
    status IN (
      'aguardando',
      'autorizado',
      'recusado',
      'finalizado'
    )
  );

-- Se uma versão anterior tiver criado mais de um registro "aguardando"
-- para a mesma pessoa, mantém apenas o mais recente como ativo.
WITH ranked_waiting AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY assembly_id, LOWER(COALESCE(user_email, ''))
      ORDER BY requested_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.assembly_speaking_requests
  WHERE status = 'aguardando'
)
UPDATE public.assembly_speaking_requests request
SET status = 'finalizado'
FROM ranked_waiting ranked
WHERE request.id = ranked.id
  AND ranked.rn > 1;

-- O índice original impede duas solicitações aguardando simultâneas do mesmo usuário.
CREATE UNIQUE INDEX IF NOT EXISTS assembly_speaking_requests_waiting_unique
  ON public.assembly_speaking_requests (assembly_id, user_email)
  WHERE status = 'aguardando';

-- ============================================================
-- 3. CANONICALIZAR responsible_cpf ANTES DA FOREIGN KEY
-- ============================================================

CREATE OR REPLACE FUNCTION public.condomit_canonicalize_visitor_responsible_cpf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  canonical_cpf TEXT;
BEGIN
  IF NULLIF(TRIM(COALESCE(NEW.responsible_cpf, '')), '') IS NULL THEN
    RAISE EXCEPTION 'CPF do responsável é obrigatório.'
      USING ERRCODE = '23503';
  END IF;

  SELECT u.cpf
    INTO canonical_cpf
  FROM public.users u
  WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(NEW.responsible_cpf, ''), '\D', '', 'g')
  LIMIT 1;

  IF canonical_cpf IS NULL THEN
    RAISE EXCEPTION 'CPF do responsável não encontrado em users.'
      USING ERRCODE = '23503';
  END IF;

  -- Guarda exatamente o mesmo texto existente em users.cpf.
  -- Assim a FK textual visitors.responsible_cpf -> users.cpf sempre compara
  -- valores idênticos, independentemente da máscara digitada no frontend.
  NEW.responsible_cpf := canonical_cpf;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitors_canonicalize_responsible_cpf
ON public.visitors;

CREATE TRIGGER trg_visitors_canonicalize_responsible_cpf
BEFORE INSERT OR UPDATE OF responsible_cpf
ON public.visitors
FOR EACH ROW
EXECUTE FUNCTION public.condomit_canonicalize_visitor_responsible_cpf();

-- ============================================================
-- 4. RPC SEGURA PARA LOCALIZAR RESPONSÁVEL POR CPF
-- ============================================================

DROP FUNCTION IF EXISTS public.condomit_find_responsible_by_cpf(TEXT);

CREATE FUNCTION public.condomit_find_responsible_by_cpf(target_cpf TEXT)
RETURNS TABLE (
  cpf TEXT,
  name TEXT,
  phone TEXT,
  email TEXT,
  condominium JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.cpf,
    u.name,
    u.phone,
    u.email,
    COALESCE(u.condominium, '{}'::jsonb)
    ||
    COALESCE(
      (
        SELECT jsonb_build_object(
          'cep', uc.condominium_id,
          'condominium_id', uc.condominium_id,
          'apartment', uc.apartment,
          'block', uc.block
        )
        FROM public.user_condominiums uc
        WHERE LOWER(COALESCE(uc.user_email, ''))
          = LOWER(COALESCE(u.email, ''))
          AND EXISTS (
            SELECT 1
            FROM public.condomit_user_condo_ceps(public.condomit_auth_email()) mine
            WHERE public.condomit_same_cep(mine.cep, uc.condominium_id::TEXT)
          )
        LIMIT 1
      ),
      '{}'::jsonb
    ) AS condominium
  FROM public.users u
  WHERE public.condomit_auth_email() <> ''
    AND LENGTH(REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g')) = 11
    AND REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g')
    AND (
      LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
      OR public.condomit_users_share_condominium(u.email)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.condomit_user_condo_ceps(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_users_share_condominium(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.condomit_find_responsible_by_cpf(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.condomit_auth_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_same_cep(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_user_condo_ceps(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_users_share_condominium(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.condomit_find_responsible_by_cpf(TEXT) TO authenticated;

-- Trigger é executado internamente pelo PostgreSQL; não precisa ser exposto ao cliente.
REVOKE ALL ON FUNCTION public.condomit_canonicalize_visitor_responsible_cpf() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';

COMMIT;
