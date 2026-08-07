-- ============================================================
-- MIGRAÇÃO 005 - CORREÇÕES DE RLS E INTEGRIDADE
-- Objetivo: Adicionar RLS faltantes e corrigir problemas
-- ============================================================

-- ------------------------------------------------------------
-- 1. VERIFICAÇÃO: Garantir que coluna cep exista em visitors
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'visitors'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'visitors'
              AND column_name = 'cep'
        ) THEN
            ALTER TABLE public.visitors
            ADD COLUMN cep TEXT;
        END IF;

        -- Garantir FK para condominiums se não existir
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND constraint_name = 'visitors_cep_fkey'
        ) THEN
            DO $inner$ BEGIN
                ALTER TABLE public.visitors
                ADD CONSTRAINT visitors_cep_fkey
                FOREIGN KEY (cep) REFERENCES public.condominiums(cep)
                ON UPDATE CASCADE ON DELETE SET NULL;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Não foi possível criar FK visitors_cep_fkey: %', SQLERRM;
            END $inner$;
        END IF;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 2. RLS: assembly_polls (RECRIAR COMPLETO - faltava em migração 004)
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_polls'
    ) THEN
        ALTER TABLE public.assembly_polls ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_polls_select_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_select_policy ON public.assembly_polls
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND uc.condominium_id = assembly_polls.cep
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_polls.cep
                      OR u.condominium->>'condominium_id' = assembly_polls.cep
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_polls_insert_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_insert_policy ON public.assembly_polls
        FOR INSERT WITH CHECK (
            (
                assembly_polls.created_by = auth.email()
                OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.email = auth.email()
                      AND u.user_type IN ('sindico', 'admin')
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          u.condominium->>'cep' = assembly_polls.cep
                          OR u.condominium->>'condominium_id' = assembly_polls.cep
                      )
                )
                OR EXISTS (
                    SELECT 1 FROM user_condominiums uc
                    JOIN users u2 ON u2.email = uc.user_email
                    WHERE uc.user_email = auth.email()
                      AND u2.user_type IN ('sindico', 'admin')
                      AND uc.condominium_id = assembly_polls.cep
                )
            )
            AND EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.cep = assembly_polls.cep
            )
        );

        DROP POLICY IF EXISTS assembly_polls_update_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_update_policy ON public.assembly_polls
        FOR UPDATE USING (
            assembly_polls.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_polls.cep
                      OR u.condominium->>'condominium_id' = assembly_polls.cep
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND uc.condominium_id = assembly_polls.cep
            )
        ) WITH CHECK (
            assembly_polls.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_polls.cep
                      OR u.condominium->>'condominium_id' = assembly_polls.cep
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND uc.condominium_id = assembly_polls.cep
            )
        );

        DROP POLICY IF EXISTS assembly_polls_delete_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_delete_policy ON public.assembly_polls
        FOR DELETE USING (
            assembly_polls.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_polls.cep
                      OR u.condominium->>'condominium_id' = assembly_polls.cep
                  )
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 3. RLS: assembly_poll_options
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_poll_options'
    ) THEN
        ALTER TABLE public.assembly_poll_options ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_poll_options_policy ON public.assembly_poll_options;
        CREATE POLICY assembly_poll_options_policy ON public.assembly_poll_options
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM assembly_polls ap
                LEFT JOIN user_condominiums uc
                       ON uc.condominium_id = ap.cep
                      AND uc.user_email = auth.email()
                LEFT JOIN users u
                       ON u.email = auth.email()
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          u.condominium->>'cep' = ap.cep
                          OR u.condominium->>'condominium_id' = ap.cep
                      )
                WHERE ap.id = assembly_poll_options.poll_id
                  AND (uc.user_email IS NOT NULL OR u.email IS NOT NULL)
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM assembly_polls ap
                LEFT JOIN user_condominiums uc
                       ON uc.condominium_id = ap.cep
                      AND uc.user_email = auth.email()
                LEFT JOIN users u
                       ON u.email = auth.email()
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          u.condominium->>'cep' = ap.cep
                          OR u.condominium->>'condominium_id' = ap.cep
                      )
                WHERE ap.id = assembly_poll_options.poll_id
                  AND (uc.user_email IS NOT NULL OR u.email IS NOT NULL)
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 4. RLS: assembly_votes
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_votes'
    ) THEN
        ALTER TABLE public.assembly_votes ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_votes_select_policy ON public.assembly_votes;
        CREATE POLICY assembly_votes_select_policy ON public.assembly_votes
        FOR SELECT USING (
            assembly_votes.user_email = auth.email()
            OR (
                EXISTS (
                    SELECT 1 FROM assembly_polls ap
                    WHERE ap.id = assembly_votes.poll_id
                      AND (
                          ap.show_results_immediately = TRUE
                          OR ap.status = 'encerrada'
                          OR ap.created_by = auth.email()
                      )
                )
                AND (
                    EXISTS (
                        SELECT 1 FROM user_condominiums uc
                        WHERE uc.user_email = auth.email()
                          AND uc.condominium_id = assembly_votes.cep
                    )
                    OR EXISTS (
                        SELECT 1 FROM users u
                        WHERE u.email = auth.email()
                          AND jsonb_typeof(u.condominium) = 'object'
                          AND (
                              u.condominium->>'cep' = assembly_votes.cep
                              OR u.condominium->>'condominium_id' = assembly_votes.cep
                          )
                    )
                )
            )
        );

        DROP POLICY IF EXISTS assembly_votes_insert_policy ON public.assembly_votes;
        CREATE POLICY assembly_votes_insert_policy ON public.assembly_votes
        FOR INSERT WITH CHECK (
            assembly_votes.user_email = auth.email()
            AND EXISTS (
                SELECT 1 FROM assembly_polls ap
                WHERE ap.id = assembly_votes.poll_id
                  AND ap.cep = assembly_votes.cep
                  AND (ap.status = 'aberta' OR ap.status IS NULL)
                  AND (ap.end_at IS NULL OR ap.end_at > NOW())
            )
            AND (
                EXISTS (
                    SELECT 1 FROM user_condominiums uc
                    WHERE uc.user_email = auth.email()
                      AND uc.condominium_id = assembly_votes.cep
                )
                OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.email = auth.email()
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          u.condominium->>'cep' = assembly_votes.cep
                          OR u.condominium->>'condominium_id' = assembly_votes.cep
                      )
                )
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 5. RLS: assembly_agenda_items (atualizar para mais flexível)
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_agenda_items'
    ) THEN
        ALTER TABLE public.assembly_agenda_items ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_agenda_items_select_policy ON public.assembly_agenda_items;
        CREATE POLICY assembly_agenda_items_select_policy ON public.assembly_agenda_items
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND uc.condominium_id = assembly_agenda_items.cep
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_agenda_items.cep
                      OR u.condominium->>'condominium_id' = assembly_agenda_items.cep
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_agenda_items_modify_policy ON public.assembly_agenda_items;
        CREATE POLICY assembly_agenda_items_modify_policy ON public.assembly_agenda_items
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_agenda_items.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_agenda_items.cep
                      OR u.condominium->>'condominium_id' = assembly_agenda_items.cep
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND uc.condominium_id = assembly_agenda_items.cep
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_agenda_items.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_agenda_items.cep
                      OR u.condominium->>'condominium_id' = assembly_agenda_items.cep
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND uc.condominium_id = assembly_agenda_items.cep
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 6. RLS: assembly_documents (atualizar para mais flexível)
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_documents'
    ) THEN
        ALTER TABLE public.assembly_documents ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_documents_select_policy ON public.assembly_documents;
        CREATE POLICY assembly_documents_select_policy ON public.assembly_documents
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND uc.condominium_id = assembly_documents.cep
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_documents.cep
                      OR u.condominium->>'condominium_id' = assembly_documents.cep
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_documents_modify_policy ON public.assembly_documents;
        CREATE POLICY assembly_documents_modify_policy ON public.assembly_documents
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_documents.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_documents.cep
                      OR u.condominium->>'condominium_id' = assembly_documents.cep
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND uc.condominium_id = assembly_documents.cep
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_documents.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      u.condominium->>'cep' = assembly_documents.cep
                      OR u.condominium->>'condominium_id' = assembly_documents.cep
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND uc.condominium_id = assembly_documents.cep
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 7. RLS: visitors - ajustar policy (permitir que cep seja NULL inicialmente)
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'visitors'
    ) THEN
        ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS visitors_select_policy ON public.visitors;
        CREATE POLICY visitors_select_policy ON public.visitors
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND (
                      jsonb_typeof(u.condominium) = 'object'
                      AND (
                          u.condominium->>'cep' IS NOT NULL
                          OR u.condominium->>'condominium_id' IS NOT NULL
                      )
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
            )
            OR visitors.responsible_cpf IN (
                SELECT REGEXP_REPLACE(COALESCE(u2.cpf, ''), '\D', '', 'g')
                FROM users u2 WHERE u2.email = auth.email()
            )
        );

        DROP POLICY IF EXISTS visitors_insert_policy ON public.visitors;
        CREATE POLICY visitors_insert_policy ON public.visitors
        FOR INSERT WITH CHECK (
            (
                EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.email = auth.email()
                      AND (
                          (
                              jsonb_typeof(u.condominium) = 'object'
                              AND (
                                  u.condominium->>'cep' IS NOT NULL
                                  OR u.condominium->>'condominium_id' IS NOT NULL
                              )
                          )
                          OR u.user_type IN ('sindico', 'porteiro', 'morador')
                      )
                )
                OR EXISTS (
                    SELECT 1 FROM user_condominiums uc
                    WHERE uc.user_email = auth.email()
                )
            )
            AND (
                visitors.cep IS NULL
                OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.email = auth.email()
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(visitors.cep, '\D', '', 'g')
                          OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(visitors.cep, '\D', '', 'g')
                      )
                )
                OR EXISTS (
                    SELECT 1 FROM user_condominiums uc
                    WHERE uc.user_email = auth.email()
                      AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(visitors.cep, '\D', '', 'g')
                )
            )
        );

        DROP POLICY IF EXISTS visitors_update_policy ON public.visitors;
        CREATE POLICY visitors_update_policy ON public.visitors
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'porteiro')
            )
            OR visitors.responsible_cpf IN (
                SELECT REGEXP_REPLACE(COALESCE(u2.cpf, ''), '\D', '', 'g')
                FROM users u2 WHERE u2.email = auth.email()
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'porteiro')
            )
            OR visitors.responsible_cpf IN (
                SELECT REGEXP_REPLACE(COALESCE(u2.cpf, ''), '\D', '', 'g')
                FROM users u2 WHERE u2.email = auth.email()
            )
        );

        DROP POLICY IF EXISTS visitors_delete_policy ON public.visitors;
        CREATE POLICY visitors_delete_policy ON public.visitors
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'porteiro')
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 8. RLS: assembly_chat_messages - ATUALIZACAO com REGEXP_REPLACE
-- (para evitar falhas RLS por formatação diferente de CEP
--  entre usuário vs tabela)
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_chat_messages'
    ) THEN
        ALTER TABLE public.assembly_chat_messages ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_chat_messages_select_policy ON public.assembly_chat_messages;
        CREATE POLICY assembly_chat_messages_select_policy ON public.assembly_chat_messages
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_chat_messages.cep, '\D', '', 'g')
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_chat_messages.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_chat_messages.cep, '\D', '', 'g')
                  )
            )
            OR assembly_chat_messages.user_email = auth.email()
        );

        DROP POLICY IF EXISTS assembly_chat_messages_insert_policy ON public.assembly_chat_messages;
        CREATE POLICY assembly_chat_messages_insert_policy ON public.assembly_chat_messages
        FOR INSERT WITH CHECK (
            assembly_chat_messages.user_email = auth.email()
            AND (
                EXISTS (
                    SELECT 1 FROM user_condominiums uc
                    WHERE uc.user_email = auth.email()
                      AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_chat_messages.cep, '\D', '', 'g')
                )
                OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.email = auth.email()
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_chat_messages.cep, '\D', '', 'g')
                          OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_chat_messages.cep, '\D', '', 'g')
                      )
                )
            )
        );

        DROP POLICY IF EXISTS assembly_chat_messages_update_policy ON public.assembly_chat_messages;
        CREATE POLICY assembly_chat_messages_update_policy ON public.assembly_chat_messages
        FOR UPDATE USING (
            assembly_chat_messages.user_email = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_chat_messages.assembly_id
                  AND sa.created_by = auth.email()
            )
        ) WITH CHECK (
            assembly_chat_messages.user_email = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_chat_messages.assembly_id
                  AND sa.created_by = auth.email()
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 9. RLS: assembly_polls - ATUALIZACAO com REGEXP_REPLACE
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_polls'
    ) THEN
        ALTER TABLE public.assembly_polls ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_polls_select_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_select_policy ON public.assembly_polls
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_polls_insert_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_insert_policy ON public.assembly_polls
        FOR INSERT WITH CHECK (
            (
                assembly_polls.created_by = auth.email()
                OR EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.email = auth.email()
                      AND u.user_type IN ('sindico', 'admin')
                      AND jsonb_typeof(u.condominium) = 'object'
                      AND (
                          REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                          OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                      )
                )
                OR EXISTS (
                    SELECT 1 FROM user_condominiums uc
                    JOIN users u2 ON u2.email = uc.user_email
                    WHERE uc.user_email = auth.email()
                      AND u2.user_type IN ('sindico', 'admin')
                      AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                )
            )
        );

        DROP POLICY IF EXISTS assembly_polls_update_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_update_policy ON public.assembly_polls
        FOR UPDATE USING (
            assembly_polls.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                  )
            )
        ) WITH CHECK (
            assembly_polls.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_polls_delete_policy ON public.assembly_polls;
        CREATE POLICY assembly_polls_delete_policy ON public.assembly_polls
        FOR DELETE USING (
            assembly_polls.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_polls.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_polls.cep, '\D', '', 'g')
                  )
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 10. RLS: assembly_agenda_items - ATUALIZACAO com REGEXP_REPLACE
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_agenda_items'
    ) THEN
        ALTER TABLE public.assembly_agenda_items ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_agenda_items_select_policy ON public.assembly_agenda_items;
        CREATE POLICY assembly_agenda_items_select_policy ON public.assembly_agenda_items
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_agenda_items_modify_policy ON public.assembly_agenda_items;
        CREATE POLICY assembly_agenda_items_modify_policy ON public.assembly_agenda_items
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_agenda_items.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_agenda_items.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_agenda_items.cep, '\D', '', 'g')
            )
        );
    END IF;
END $$;

-- ------------------------------------------------------------
-- 11. RLS: assembly_documents - ATUALIZACAO com REGEXP_REPLACE
-- ------------------------------------------------------------
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'assembly_documents'
    ) THEN
        ALTER TABLE public.assembly_documents ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS assembly_documents_select_policy ON public.assembly_documents;
        CREATE POLICY assembly_documents_select_policy ON public.assembly_documents
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM user_condominiums uc
                WHERE uc.user_email = auth.email()
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
                  )
            )
        );

        DROP POLICY IF EXISTS assembly_documents_modify_policy ON public.assembly_documents;
        CREATE POLICY assembly_documents_modify_policy ON public.assembly_documents
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_documents.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM scheduled_assemblies sa
                WHERE sa.id = assembly_documents.assembly_id
                  AND sa.created_by = auth.email()
            )
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email()
                  AND u.user_type IN ('sindico', 'admin')
                  AND jsonb_typeof(u.condominium) = 'object'
                  AND (
                      REGEXP_REPLACE(u.condominium->>'cep', '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
                      OR REGEXP_REPLACE(u.condominium->>'condominium_id', '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
                  )
            )
            OR EXISTS (
                SELECT 1 FROM user_condominiums uc
                JOIN users u2 ON u2.email = uc.user_email
                WHERE uc.user_email = auth.email()
                  AND u2.user_type IN ('sindico', 'admin')
                  AND REGEXP_REPLACE(uc.condominium_id, '\D', '', 'g') = REGEXP_REPLACE(assembly_documents.cep, '\D', '', 'g')
            )
        );
    END IF;
END $$;
