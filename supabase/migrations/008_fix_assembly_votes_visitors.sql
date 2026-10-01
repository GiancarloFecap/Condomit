-- ============================================================
-- MIGRAÇÃO 008
-- Condomit
-- Corrige chat, mão levantada, leitura de resultados de votação
-- e busca segura de responsável por CPF.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. HELPERS BÁSICOS
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

CREATE OR REPLACE FUNCTION public.condomit_user_belongs_to_cep(target_cep TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.condomit_auth_email() <> ''
    AND (
      EXISTS (
        SELECT 1
        FROM public.user_condominiums uc
        WHERE LOWER(COALESCE(uc.user_email, '')) = public.condomit_auth_email()
          AND public.condomit_same_cep(uc.condominium_id, target_cep)
      )
      OR EXISTS (
        SELECT 1
        FROM public.users u
        WHERE LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
          AND jsonb_typeof(u.condominium) = 'object'
          AND (
            public.condomit_same_cep(u.condominium ->> 'cep', target_cep)
            OR public.condomit_same_cep(u.condominium ->> 'condominium_id', target_cep)
            OR public.condomit_same_cep(u.condominium ->> 'condominium_cep', target_cep)
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.condomit_current_user_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT LOWER(
    COALESCE(
      (
        SELECT u.user_type
        FROM public.users u
        WHERE LOWER(COALESCE(u.email, '')) = public.condomit_auth_email()
        LIMIT 1
      ),
      ''
    )
  );
$$;

-- ============================================================
-- 2. GARANTIR COLUNAS USADAS PELO CHAT E PELA MÃO
-- ============================================================

ALTER TABLE public.assembly_chat_messages
  ADD COLUMN IF NOT EXISTS participant_name TEXT;

ALTER TABLE public.assembly_chat_messages
  ADD COLUMN IF NOT EXISTS participant_role TEXT;

ALTER TABLE public.assembly_speaking_requests
  ADD COLUMN IF NOT EXISTS participant_name TEXT;

ALTER TABLE public.assembly_speaking_requests
  ADD COLUMN IF NOT EXISTS participant_role TEXT;

ALTER TABLE public.assembly_speaking_requests
  ADD COLUMN IF NOT EXISTS identity TEXT;

ALTER TABLE public.assembly_speaking_requests
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.assembly_speaking_requests
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- 3. CHAT DA ASSEMBLEIA
-- ============================================================

ALTER TABLE public.assembly_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_chat_messages_select_policy
ON public.assembly_chat_messages;

DROP POLICY IF EXISTS assembly_chat_messages_insert_policy
ON public.assembly_chat_messages;

DROP POLICY IF EXISTS assembly_chat_messages_update_policy
ON public.assembly_chat_messages;

DROP POLICY IF EXISTS assembly_chat_messages_delete_policy
ON public.assembly_chat_messages;

CREATE POLICY assembly_chat_messages_select_policy
ON public.assembly_chat_messages
FOR SELECT
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_chat_messages.cep)
);

CREATE POLICY assembly_chat_messages_insert_policy
ON public.assembly_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  LOWER(COALESCE(assembly_chat_messages.user_email, '')) = public.condomit_auth_email()
  AND public.condomit_user_belongs_to_cep(assembly_chat_messages.cep)
  AND EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies sa
    WHERE sa.id = assembly_chat_messages.assembly_id
      AND public.condomit_same_cep(sa.cep, assembly_chat_messages.cep)
      AND LOWER(COALESCE(sa.status, '')) IN ('agendada', 'em_andamento')
  )
);

CREATE POLICY assembly_chat_messages_update_policy
ON public.assembly_chat_messages
FOR UPDATE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_chat_messages.cep)
  AND (
    LOWER(COALESCE(assembly_chat_messages.user_email, '')) = public.condomit_auth_email()
    OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
  )
)
WITH CHECK (
  public.condomit_user_belongs_to_cep(assembly_chat_messages.cep)
  AND (
    LOWER(COALESCE(assembly_chat_messages.user_email, '')) = public.condomit_auth_email()
    OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
  )
);

CREATE POLICY assembly_chat_messages_delete_policy
ON public.assembly_chat_messages
FOR DELETE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_chat_messages.cep)
  AND (
    LOWER(COALESCE(assembly_chat_messages.user_email, '')) = public.condomit_auth_email()
    OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
  )
);

-- ============================================================
-- 4. MÃO LEVANTADA
-- Aceita sala em "agendada" ou "em_andamento".
-- ============================================================

ALTER TABLE public.assembly_speaking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_speaking_requests_select_policy
ON public.assembly_speaking_requests;

DROP POLICY IF EXISTS assembly_speaking_requests_insert_policy
ON public.assembly_speaking_requests;

DROP POLICY IF EXISTS assembly_speaking_requests_update_policy
ON public.assembly_speaking_requests;

DROP POLICY IF EXISTS assembly_speaking_requests_delete_policy
ON public.assembly_speaking_requests;

CREATE POLICY assembly_speaking_requests_select_policy
ON public.assembly_speaking_requests
FOR SELECT
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_speaking_requests.cep)
  AND EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies sa
    WHERE sa.id = assembly_speaking_requests.assembly_id
      AND public.condomit_same_cep(sa.cep, assembly_speaking_requests.cep)
  )
);

CREATE POLICY assembly_speaking_requests_insert_policy
ON public.assembly_speaking_requests
FOR INSERT
TO authenticated
WITH CHECK (
  LOWER(COALESCE(assembly_speaking_requests.user_email, '')) = public.condomit_auth_email()
  AND public.condomit_user_belongs_to_cep(assembly_speaking_requests.cep)
  AND EXISTS (
    SELECT 1
    FROM public.scheduled_assemblies sa
    WHERE sa.id = assembly_speaking_requests.assembly_id
      AND public.condomit_same_cep(sa.cep, assembly_speaking_requests.cep)
      AND LOWER(COALESCE(sa.status, '')) IN ('agendada', 'em_andamento')
  )
);

CREATE POLICY assembly_speaking_requests_update_policy
ON public.assembly_speaking_requests
FOR UPDATE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_speaking_requests.cep)
  AND (
    LOWER(COALESCE(assembly_speaking_requests.user_email, '')) = public.condomit_auth_email()
    OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
  )
)
WITH CHECK (
  public.condomit_user_belongs_to_cep(assembly_speaking_requests.cep)
  AND (
    LOWER(COALESCE(assembly_speaking_requests.user_email, '')) = public.condomit_auth_email()
    OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
  )
);

CREATE POLICY assembly_speaking_requests_delete_policy
ON public.assembly_speaking_requests
FOR DELETE
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_speaking_requests.cep)
  AND (
    LOWER(COALESCE(assembly_speaking_requests.user_email, '')) = public.condomit_auth_email()
    OR public.condomit_current_user_type() IN ('sindico', 'síndico', 'admin')
  )
);

-- ============================================================
-- 5. VOTOS
-- Corrige leitura de resultado após end_at.
-- ============================================================

ALTER TABLE public.assembly_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_votes_select_policy
ON public.assembly_votes;

DROP POLICY IF EXISTS assembly_votes_insert_policy
ON public.assembly_votes;

CREATE POLICY assembly_votes_select_policy
ON public.assembly_votes
FOR SELECT
TO authenticated
USING (
  public.condomit_user_belongs_to_cep(assembly_votes.cep)
  AND EXISTS (
    SELECT 1
    FROM public.assembly_polls ap
    WHERE ap.id = assembly_votes.poll_id
      AND public.condomit_same_cep(ap.cep, assembly_votes.cep)
      AND (
        LOWER(COALESCE(assembly_votes.user_email, '')) = public.condomit_auth_email()
        OR LOWER(COALESCE(ap.created_by, '')) = public.condomit_auth_email()
        OR COALESCE(ap.show_results_immediately, FALSE) = TRUE
        OR LOWER(COALESCE(ap.status, '')) = 'encerrada'
        OR (ap.end_at IS NOT NULL AND ap.end_at <= NOW())
      )
  )
);

CREATE POLICY assembly_votes_insert_policy
ON public.assembly_votes
FOR INSERT
TO authenticated
WITH CHECK (
  LOWER(COALESCE(assembly_votes.user_email, '')) = public.condomit_auth_email()
  AND public.condomit_user_belongs_to_cep(assembly_votes.cep)
  AND EXISTS (
    SELECT 1
    FROM public.assembly_polls ap
    JOIN public.scheduled_assemblies sa
      ON sa.id = ap.assembly_id
    WHERE ap.id = assembly_votes.poll_id
      AND ap.assembly_id = assembly_votes.assembly_id
      AND public.condomit_same_cep(ap.cep, assembly_votes.cep)
      AND public.condomit_same_cep(sa.cep, assembly_votes.cep)
      AND LOWER(COALESCE(sa.status, '')) IN ('agendada', 'em_andamento')
      AND LOWER(COALESCE(ap.status, '')) = 'aberta'
      AND (ap.start_at IS NULL OR ap.start_at <= NOW())
      AND (ap.end_at IS NULL OR ap.end_at > NOW())
  )
);

-- ============================================================
-- 6. RPC SEGURA PARA RESULTADOS AGREGADOS
-- Não expõe e-mail de quem votou.
-- ============================================================

CREATE OR REPLACE FUNCTION public.condomit_assembly_poll_results(
  target_assembly_id BIGINT
)
RETURNS TABLE (
  poll_id BIGINT,
  option_id BIGINT,
  vote_count BIGINT,
  current_user_voted BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ap.id AS poll_id,
    apo.id AS option_id,
    (
      SELECT COUNT(*)::BIGINT
      FROM public.assembly_votes av
      WHERE av.poll_id = ap.id
        AND av.option_id = apo.id
    ) AS vote_count,
    EXISTS (
      SELECT 1
      FROM public.assembly_votes mine
      WHERE mine.poll_id = ap.id
        AND LOWER(COALESCE(mine.user_email, '')) = public.condomit_auth_email()
    ) AS current_user_voted
  FROM public.assembly_polls ap
  JOIN public.assembly_poll_options apo
    ON apo.poll_id = ap.id
  WHERE ap.assembly_id = target_assembly_id
    AND public.condomit_user_belongs_to_cep(ap.cep)
    AND (
      COALESCE(ap.show_results_immediately, FALSE) = TRUE
      OR LOWER(COALESCE(ap.status, '')) = 'encerrada'
      OR (ap.end_at IS NOT NULL AND ap.end_at <= NOW())
      OR LOWER(COALESCE(ap.created_by, '')) = public.condomit_auth_email()
    )
  ORDER BY ap.id, apo.display_order, apo.id;
$$;

REVOKE ALL
ON FUNCTION public.condomit_assembly_poll_results(BIGINT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.condomit_assembly_poll_results(BIGINT)
TO authenticated;

-- ============================================================
-- 7. RPC SEGURA PARA LOCALIZAR RESPONSÁVEL PELO CPF
-- Faz comparação ignorando pontuação e retorna o CPF exatamente
-- como ele está salvo em users, para respeitar a FK visitors -> users.cpf.
-- ============================================================

CREATE OR REPLACE FUNCTION public.condomit_find_responsible_by_cpf(
  target_cpf TEXT
)
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
  WITH candidates AS (
    SELECT
      u.cpf,
      u.name,
      u.phone,
      u.email,
      u.condominium,
      (
        SELECT jsonb_build_object(
          'cep', uc.condominium_id,
          'condominium_id', uc.condominium_id,
          'apartment', uc.apartment,
          'block', uc.block
        )
        FROM public.user_condominiums uc
        WHERE LOWER(COALESCE(uc.user_email, '')) = LOWER(COALESCE(u.email, ''))
          AND public.condomit_user_belongs_to_cep(uc.condominium_id)
        LIMIT 1
      ) AS linked_condominium
    FROM public.users u
    WHERE REGEXP_REPLACE(COALESCE(u.cpf, ''), '\D', '', 'g')
          = REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g')
      AND LENGTH(REGEXP_REPLACE(COALESCE(target_cpf, ''), '\D', '', 'g')) = 11
  )
  SELECT
    c.cpf,
    c.name,
    c.phone,
    c.email,
    CASE
      WHEN c.linked_condominium IS NOT NULL THEN
        COALESCE(c.condominium, '{}'::jsonb) || c.linked_condominium
      ELSE
        COALESCE(c.condominium, '{}'::jsonb)
    END AS condominium
  FROM candidates c
  WHERE
    c.linked_condominium IS NOT NULL
    OR (
      jsonb_typeof(c.condominium) = 'object'
      AND (
        public.condomit_user_belongs_to_cep(c.condominium ->> 'cep')
        OR public.condomit_user_belongs_to_cep(c.condominium ->> 'condominium_id')
        OR public.condomit_user_belongs_to_cep(c.condominium ->> 'condominium_cep')
      )
    )
  LIMIT 1;
$$;

REVOKE ALL
ON FUNCTION public.condomit_find_responsible_by_cpf(TEXT)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.condomit_find_responsible_by_cpf(TEXT)
TO authenticated;

-- ============================================================
-- 8. GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.assembly_chat_messages
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.assembly_speaking_requests
TO authenticated;

GRANT SELECT, INSERT
ON public.assembly_votes
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
