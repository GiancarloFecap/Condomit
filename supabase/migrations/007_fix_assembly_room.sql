-- ============================================================
-- MIGRAÇÃO 007
-- CORREÇÃO DA SALA DE ASSEMBLEIA
--
-- Corrige:
-- 1. Associação usuário x condomínio
-- 2. CEP com/sem máscara
-- 3. RLS assembly_speaking_requests
-- ============================================================


-- ============================================================
-- 1. E-MAIL AUTENTICADO
-- ============================================================

CREATE OR REPLACE FUNCTION
public.condomit_auth_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT LOWER(
        COALESCE(
            auth.jwt() ->> 'email',
            ''
        )
    );
$$;


-- ============================================================
-- 2. COMPARAÇÃO DE CEP
--
-- 04284-070 = 04284070
-- ============================================================

CREATE OR REPLACE FUNCTION
public.condomit_same_cep(
    a TEXT,
    b TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT

        NULLIF(
            REGEXP_REPLACE(
                COALESCE(
                    a,
                    ''
                ),
                '\D',
                '',
                'g'
            ),
            ''
        ) IS NOT NULL

        AND

        REGEXP_REPLACE(
            COALESCE(
                a,
                ''
            ),
            '\D',
            '',
            'g'
        )

        =

        REGEXP_REPLACE(
            COALESCE(
                b,
                ''
            ),
            '\D',
            '',
            'g'
        );
$$;


-- ============================================================
-- 3. USUÁRIO PERTENCE AO CONDOMÍNIO?
--
-- Verifica:
--
-- user_condominiums
-- OU
-- users.condominium JSONB
-- ============================================================

CREATE OR REPLACE FUNCTION
public.condomit_user_belongs_to_cep(
    target_cep TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT

        public.condomit_auth_email()
        <> ''

        AND

        (

            -- ----------------------------------------------
            -- user_condominiums
            -- ----------------------------------------------

            EXISTS (
                SELECT 1

                FROM
                    public.user_condominiums uc

                WHERE
                    LOWER(
                        COALESCE(
                            uc.user_email,
                            ''
                        )
                    )
                    =
                    public.condomit_auth_email()

                    AND

                    public.condomit_same_cep(
                        uc.condominium_id,
                        target_cep
                    )
            )


            OR


            -- ----------------------------------------------
            -- users.condominium JSONB
            -- ----------------------------------------------

            EXISTS (
                SELECT 1

                FROM
                    public.users u

                WHERE
                    LOWER(
                        COALESCE(
                            u.email,
                            ''
                        )
                    )
                    =
                    public.condomit_auth_email()

                    AND

                    jsonb_typeof(
                        u.condominium
                    )
                    =
                    'object'

                    AND
                    (
                        public.condomit_same_cep(
                            u.condominium
                                ->> 'cep',
                            target_cep
                        )

                        OR

                        public.condomit_same_cep(
                            u.condominium
                                ->> 'condominium_id',
                            target_cep
                        )

                        OR

                        public.condomit_same_cep(
                            u.condominium
                                ->> 'condominium_cep',
                            target_cep
                        )
                    )
            )

        );
$$;


-- ============================================================
-- 4. TIPO DO USUÁRIO
-- ============================================================

CREATE OR REPLACE FUNCTION
public.condomit_current_user_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT LOWER(
        COALESCE(
            (
                SELECT
                    u.user_type

                FROM
                    public.users u

                WHERE
                    LOWER(
                        COALESCE(
                            u.email,
                            ''
                        )
                    )
                    =
                    public.condomit_auth_email()

                LIMIT 1
            ),
            ''
        )
    );
$$;


-- ============================================================
-- 5. PERMISSÕES DAS FUNÇÕES
-- ============================================================

REVOKE ALL
ON FUNCTION
public.condomit_user_belongs_to_cep(TEXT)
FROM PUBLIC;


REVOKE ALL
ON FUNCTION
public.condomit_current_user_type()
FROM PUBLIC;


GRANT EXECUTE
ON FUNCTION
public.condomit_auth_email()
TO authenticated;


GRANT EXECUTE
ON FUNCTION
public.condomit_same_cep(TEXT, TEXT)
TO authenticated;


GRANT EXECUTE
ON FUNCTION
public.condomit_user_belongs_to_cep(TEXT)
TO authenticated;


GRANT EXECUTE
ON FUNCTION
public.condomit_current_user_type()
TO authenticated;



-- ============================================================
-- 6. RLS DA MÃO LEVANTADA
-- ============================================================

ALTER TABLE
public.assembly_speaking_requests
ENABLE ROW LEVEL SECURITY;



-- ============================================================
-- 6.1 APAGAR POLICIES ANTIGAS
-- ============================================================

DROP POLICY IF EXISTS
assembly_speaking_requests_select_policy
ON public.assembly_speaking_requests;


DROP POLICY IF EXISTS
assembly_speaking_requests_insert_policy
ON public.assembly_speaking_requests;


DROP POLICY IF EXISTS
assembly_speaking_requests_update_policy
ON public.assembly_speaking_requests;


DROP POLICY IF EXISTS
assembly_speaking_requests_delete_policy
ON public.assembly_speaking_requests;



-- ============================================================
-- 6.2 SELECT
-- ============================================================

CREATE POLICY
assembly_speaking_requests_select_policy
ON public.assembly_speaking_requests
FOR SELECT
TO authenticated
USING (

    public.condomit_user_belongs_to_cep(
        assembly_speaking_requests.cep
    )

    AND

    EXISTS (

        SELECT 1

        FROM
            public.scheduled_assemblies sa

        WHERE
            sa.id =
                assembly_speaking_requests
                    .assembly_id

            AND

            public.condomit_same_cep(
                sa.cep,
                assembly_speaking_requests.cep
            )

    )

);



-- ============================================================
-- 6.3 INSERT
-- ============================================================

CREATE POLICY
assembly_speaking_requests_insert_policy
ON public.assembly_speaking_requests
FOR INSERT
TO authenticated
WITH CHECK (

    public.condomit_auth_email()
    <> ''

    AND

    LOWER(
        COALESCE(
            assembly_speaking_requests
                .user_email,
            ''
        )
    )
    =
    public.condomit_auth_email()

    AND

    public.condomit_user_belongs_to_cep(
        assembly_speaking_requests.cep
    )

    AND

    EXISTS (

        SELECT 1

        FROM
            public.scheduled_assemblies sa

        WHERE
            sa.id =
                assembly_speaking_requests
                    .assembly_id

            AND

            public.condomit_same_cep(
                sa.cep,
                assembly_speaking_requests.cep
            )

            AND

            sa.status =
                'em_andamento'

    )

);



-- ============================================================
-- 6.4 UPDATE
-- ============================================================

CREATE POLICY
assembly_speaking_requests_update_policy
ON public.assembly_speaking_requests
FOR UPDATE
TO authenticated
USING (

    public.condomit_user_belongs_to_cep(
        assembly_speaking_requests.cep
    )

    AND

    (

        LOWER(
            COALESCE(
                assembly_speaking_requests
                    .user_email,
                ''
            )
        )
        =
        public.condomit_auth_email()


        OR


        public.condomit_current_user_type()
        IN (
            'sindico',
            'síndico',
            'admin'
        )


        OR


        EXISTS (

            SELECT 1

            FROM
                public.scheduled_assemblies sa

            WHERE
                sa.id =
                    assembly_speaking_requests
                        .assembly_id

                AND

                LOWER(
                    COALESCE(
                        sa.created_by,
                        ''
                    )
                )
                =
                public.condomit_auth_email()

        )

    )

)

WITH CHECK (

    public.condomit_user_belongs_to_cep(
        assembly_speaking_requests.cep
    )

    AND

    (

        LOWER(
            COALESCE(
                assembly_speaking_requests
                    .user_email,
                ''
            )
        )
        =
        public.condomit_auth_email()


        OR


        public.condomit_current_user_type()
        IN (
            'sindico',
            'síndico',
            'admin'
        )


        OR


        EXISTS (

            SELECT 1

            FROM
                public.scheduled_assemblies sa

            WHERE
                sa.id =
                    assembly_speaking_requests
                        .assembly_id

                AND

                LOWER(
                    COALESCE(
                        sa.created_by,
                        ''
                    )
                )
                =
                public.condomit_auth_email()

        )

    )

);



-- ============================================================
-- 6.5 DELETE
-- ============================================================

CREATE POLICY
assembly_speaking_requests_delete_policy
ON public.assembly_speaking_requests
FOR DELETE
TO authenticated
USING (

    public.condomit_user_belongs_to_cep(
        assembly_speaking_requests.cep
    )

    AND

    (

        LOWER(
            COALESCE(
                assembly_speaking_requests
                    .user_email,
                ''
            )
        )
        =
        public.condomit_auth_email()


        OR


        public.condomit_current_user_type()
        IN (
            'sindico',
            'síndico',
            'admin'
        )


        OR


        EXISTS (

            SELECT 1

            FROM
                public.scheduled_assemblies sa

            WHERE
                sa.id =
                    assembly_speaking_requests
                        .assembly_id

                AND

                LOWER(
                    COALESCE(
                        sa.created_by,
                        ''
                    )
                )
                =
                public.condomit_auth_email()

        )

    )

);



-- ============================================================
-- 7. GRANTS
-- ============================================================

GRANT
SELECT,
INSERT,
UPDATE,
DELETE
ON
public.assembly_speaking_requests
TO authenticated;



-- ============================================================
-- 8. RECARREGAR CACHE POSTGREST
-- ============================================================

NOTIFY pgrst, 'reload schema';