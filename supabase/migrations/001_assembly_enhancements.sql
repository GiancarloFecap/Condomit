-- ============================================================
-- MIGRAÇÃO 001 - MELHORIAS NO SISTEMA DE ASSEMBLEIAS
-- Objetivo: Adicionar tabelas complementares, constraints,
-- colunas de condomínio e políticas RLS robustas
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUNAS DE CONDOMÍNIO (CEP) NAS TABELAS EXISTENTES
-- ------------------------------------------------------------

-- assembly_attendance - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_attendance' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_attendance
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- assembly_chat_messages - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_chat_messages' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_chat_messages
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- assembly_speaking_requests - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_speaking_requests' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_speaking_requests
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- assembly_polls - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_polls' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_polls
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- assembly_poll_options - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_poll_options' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_poll_options
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- assembly_votes - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_votes' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_votes
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- assembly_event_logs - adicionar cep para RLS por condomínio
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_event_logs' AND column_name = 'cep'
    ) THEN
        ALTER TABLE assembly_event_logs
        ADD COLUMN cep TEXT REFERENCES condominiums(cep) ON DELETE CASCADE;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 2. COLUNAS ADICIONAIS NAS TABELAS EXISTENTES
-- ------------------------------------------------------------

-- assembly_attendance: reconnections, presence_status, updated_at
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_attendance' AND column_name = 'reconnections'
    ) THEN
        ALTER TABLE assembly_attendance
        ADD COLUMN reconnections INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN presence_status TEXT NOT NULL DEFAULT 'presente'
            CHECK (presence_status IN ('presente', 'ausente', 'saiu_temporariamente')),
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- scheduled_assemblies: additional columns
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scheduled_assemblies' AND column_name = 'assembly_type'
    ) THEN
        ALTER TABLE scheduled_assemblies
        ADD COLUMN assembly_type TEXT NOT NULL DEFAULT 'ordinaria'
            CHECK (assembly_type IN ('ordinaria', 'extraordinaria', 'especial')),
        ADD COLUMN rules TEXT,
        ADD COLUMN expected_duration_minutes INTEGER,
        ADD COLUMN is_recording BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN recording_url TEXT,
        ADD COLUMN recording_id TEXT,
        ADD COLUMN agenda_summary TEXT,
        ADD COLUMN minutes_document_url TEXT,
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- assembly_polls: additional columns for better voting system
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assembly_polls' AND column_name = 'agenda_item_id'
    ) THEN
        ALTER TABLE assembly_polls
        ADD COLUMN agenda_item_id BIGINT,
        ADD COLUMN start_at TIMESTAMPTZ,
        ADD COLUMN end_at TIMESTAMPTZ,
        ADD COLUMN show_results_immediately BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN allow_abstention BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN quorum_required INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- ------------------------------------------------------------
-- 3. RESTRIÇÃO ÚNICA PARA VOTOS (evitar voto duplicado)
-- ------------------------------------------------------------

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'assembly_votes_unique_poll_user'
    ) THEN
        ALTER TABLE assembly_votes
        ADD CONSTRAINT assembly_votes_unique_poll_user
        UNIQUE (poll_id, user_email);
    END IF;
END $$;

-- Restrição única para presença (um registro por usuário por assembleia)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'assembly_attendance_unique_assembly_user'
    ) THEN
        ALTER TABLE assembly_attendance
        ADD CONSTRAINT assembly_attendance_unique_assembly_user
        UNIQUE (assembly_id, user_email);
    END IF;
END $$;

-- ------------------------------------------------------------
-- 4. NOVAS TABELAS
-- ------------------------------------------------------------

-- assembly_agenda_items - Pautas da assembleia
CREATE TABLE IF NOT EXISTS assembly_agenda_items (
    id BIGSERIAL PRIMARY KEY,
    assembly_id BIGINT NOT NULL REFERENCES scheduled_assemblies(id) ON DELETE CASCADE,
    cep TEXT NOT NULL REFERENCES condominiums(cep) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 255),
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    responsible_name TEXT,
    responsible_email TEXT REFERENCES users(email) ON DELETE SET NULL,
    estimated_minutes INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'nao_iniciada'
        CHECK (status IN ('nao_iniciada', 'em_discussao', 'em_votacao', 'concluida')),
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    discussion_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- assembly_documents - Documentos da assembleia
CREATE TABLE IF NOT EXISTS assembly_documents (
    id BIGSERIAL PRIMARY KEY,
    assembly_id BIGINT NOT NULL REFERENCES scheduled_assemblies(id) ON DELETE CASCADE,
    cep TEXT NOT NULL REFERENCES condominiums(cep) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 255),
    description TEXT,
    document_url TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'outro'
        CHECK (document_type IN ('edital', 'ata', 'pauta', 'balanco', 'contrato', 'projeto', 'outro')),
    file_size_bytes BIGINT,
    uploaded_by TEXT REFERENCES users(email) ON DELETE SET NULL,
    agenda_item_id BIGINT REFERENCES assembly_agenda_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- assembly_recordings - Gravações da assembleia
CREATE TABLE IF NOT EXISTS assembly_recordings (
    id BIGSERIAL PRIMARY KEY,
    assembly_id BIGINT NOT NULL REFERENCES scheduled_assemblies(id) ON DELETE CASCADE,
    cep TEXT NOT NULL REFERENCES condominiums(cep) ON DELETE CASCADE,
    livekit_room_name TEXT,
    egress_id TEXT,
    recording_url TEXT,
    recording_type TEXT NOT NULL DEFAULT 'sala'
        CHECK (recording_type IN ('sala', 'track', 'room_composite')),
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'gravando', 'concluido', 'falhou', 'cancelado')),
    duration_seconds INTEGER DEFAULT 0,
    file_size_bytes BIGINT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    started_by TEXT REFERENCES users(email) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- assembly_participants_confirmations - Confirmação de presença antes da assembleia
CREATE TABLE IF NOT EXISTS assembly_participant_confirmations (
    id BIGSERIAL PRIMARY KEY,
    assembly_id BIGINT NOT NULL REFERENCES scheduled_assemblies(id) ON DELETE CASCADE,
    cep TEXT NOT NULL REFERENCES condominiums(cep) ON DELETE CASCADE,
    user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    participant_name TEXT NOT NULL,
    participant_role TEXT NOT NULL,
    will_attend BOOLEAN NOT NULL DEFAULT TRUE,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assembly_id, user_email)
);

-- ------------------------------------------------------------
-- 5. ÍNDICES ÚTEIS
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_assembly_attendance_cep ON assembly_attendance(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_attendance_assembly ON assembly_attendance(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_attendance_user ON assembly_attendance(user_email);
CREATE INDEX IF NOT EXISTS idx_assembly_attendance_last_heartbeat ON assembly_attendance(last_heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_assembly_chat_messages_cep ON assembly_chat_messages(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_chat_messages_assembly ON assembly_chat_messages(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_chat_messages_created ON assembly_chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_assembly_speaking_requests_cep ON assembly_speaking_requests(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_speaking_requests_assembly ON assembly_speaking_requests(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_speaking_requests_status ON assembly_speaking_requests(status);

CREATE INDEX IF NOT EXISTS idx_assembly_polls_cep ON assembly_polls(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_polls_assembly ON assembly_polls(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_polls_status ON assembly_polls(status);

CREATE INDEX IF NOT EXISTS idx_assembly_votes_cep ON assembly_votes(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_votes_poll ON assembly_votes(poll_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_assemblies_cep ON scheduled_assemblies(cep);
CREATE INDEX IF NOT EXISTS idx_scheduled_assemblies_status ON scheduled_assemblies(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_assemblies_date ON scheduled_assemblies(date);

CREATE INDEX IF NOT EXISTS idx_assembly_agenda_items_cep ON assembly_agenda_items(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_agenda_items_assembly ON assembly_agenda_items(assembly_id);
CREATE INDEX IF NOT EXISTS idx_assembly_agenda_items_order ON assembly_agenda_items(display_order);

CREATE INDEX IF NOT EXISTS idx_assembly_documents_cep ON assembly_documents(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_documents_assembly ON assembly_documents(assembly_id);

CREATE INDEX IF NOT EXISTS idx_assembly_recordings_cep ON assembly_recordings(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_recordings_assembly ON assembly_recordings(assembly_id);

CREATE INDEX IF NOT EXISTS idx_assembly_participant_confirmations_cep ON assembly_participant_confirmations(cep);
CREATE INDEX IF NOT EXISTS idx_assembly_participant_confirmations_assembly ON assembly_participant_confirmations(assembly_id);

-- ------------------------------------------------------------
-- 6. TRIGGERS PARA UPDATED_AT
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assembly_attendance_updated_at ON assembly_attendance;
CREATE TRIGGER trg_assembly_attendance_updated_at
BEFORE UPDATE ON assembly_attendance
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_scheduled_assemblies_updated_at ON scheduled_assemblies;
CREATE TRIGGER trg_scheduled_assemblies_updated_at
BEFORE UPDATE ON scheduled_assemblies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assembly_polls_updated_at ON assembly_polls;
CREATE TRIGGER trg_assembly_polls_updated_at
BEFORE UPDATE ON assembly_polls
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assembly_agenda_items_updated_at ON assembly_agenda_items;
CREATE TRIGGER trg_assembly_agenda_items_updated_at
BEFORE UPDATE ON assembly_agenda_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assembly_documents_updated_at ON assembly_documents;
CREATE TRIGGER trg_assembly_documents_updated_at
BEFORE UPDATE ON assembly_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assembly_recordings_updated_at ON assembly_recordings;
CREATE TRIGGER trg_assembly_recordings_updated_at
BEFORE UPDATE ON assembly_recordings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assembly_participant_confirmations_updated_at ON assembly_participant_confirmations;
CREATE TRIGGER trg_assembly_participant_confirmations_updated_at
BEFORE UPDATE ON assembly_participant_confirmations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 7. FUNÇÃO HELPER: EXTRAIR CEP DO CONDOMÍNIO DO USUÁRIO (para RLS)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_user_cep()
RETURNS TEXT AS $$
DECLARE
    v_email TEXT;
    v_cep TEXT;
BEGIN
    -- Tenta pegar e-mail da sessão autenticada (se estiver usando Supabase Auth)
    v_email := auth.email();
    
    -- Se não houver sessão Supabase Auth, tenta user_condominiums
    IF v_email IS NOT NULL THEN
        SELECT uc.condominium_id INTO v_cep
        FROM user_condominiums uc
        WHERE uc.user_email = v_email
        LIMIT 1;
        
        IF v_cep IS NOT NULL THEN
            RETURN v_cep;
        END IF;
        
        -- Tenta também pela tabela users (condominium JSON)
        SELECT CASE
            WHEN jsonb_typeof(u.condominium) = 'object'
            THEN COALESCE(u.condominium->>'cep', u.condominium->>'condominium_id')
            ELSE NULL
        END INTO v_cep
        FROM users u WHERE u.email = v_email LIMIT 1;
        
        RETURN v_cep;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 8. POLÍTICAS RLS - scheduled_assemblies
-- ------------------------------------------------------------

ALTER TABLE scheduled_assemblies ENABLE ROW LEVEL SECURITY;

-- SELECT: Usuários só veem assembleias do seu condomínio
DROP POLICY IF EXISTS scheduled_assemblies_select_policy ON scheduled_assemblies;
CREATE POLICY scheduled_assemblies_select_policy ON scheduled_assemblies
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = scheduled_assemblies.cep
    )
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.email = auth.email()
        AND (
            (jsonb_typeof(u.condominium) = 'object'
             AND (u.condominium->>'cep' = scheduled_assemblies.cep
                  OR u.condominium->>'condominium_id' = scheduled_assemblies.cep))
        )
    )
    OR scheduled_assemblies.created_by = auth.email()
);

-- INSERT: Síndicos podem criar assembleias do seu condomínio
DROP POLICY IF EXISTS scheduled_assemblies_insert_policy ON scheduled_assemblies;
CREATE POLICY scheduled_assemblies_insert_policy ON scheduled_assemblies
FOR INSERT WITH CHECK (
    scheduled_assemblies.created_by = auth.email()
    AND (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.email = auth.email()
            AND u.user_type = 'sindico'
            AND (
                (jsonb_typeof(u.condominium) = 'object'
                 AND (u.condominium->>'cep' = scheduled_assemblies.cep
                      OR u.condominium->>'condominium_id' = scheduled_assemblies.cep))
            )
        )
        OR EXISTS (
            SELECT 1 FROM user_condominiums uc
            JOIN users u ON u.email = uc.user_email
            WHERE uc.user_email = auth.email()
            AND u.user_type = 'sindico'
            AND uc.condominium_id = scheduled_assemblies.cep
        )
    )
);

-- UPDATE: Síndico/organizador pode atualizar
DROP POLICY IF EXISTS scheduled_assemblies_update_policy ON scheduled_assemblies;
CREATE POLICY scheduled_assemblies_update_policy ON scheduled_assemblies
FOR UPDATE USING (
    scheduled_assemblies.created_by = auth.email()
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.email = auth.email()
        AND u.user_type = 'sindico'
        AND (
            (jsonb_typeof(u.condominium) = 'object'
             AND (u.condominium->>'cep' = scheduled_assemblies.cep
                  OR u.condominium->>'condominium_id' = scheduled_assemblies.cep))
        )
    )
) WITH CHECK (
    scheduled_assemblies.created_by = auth.email()
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.email = auth.email()
        AND u.user_type = 'sindico'
        AND (
            (jsonb_typeof(u.condominium) = 'object'
             AND (u.condominium->>'cep' = scheduled_assemblies.cep
                  OR u.condominium->>'condominium_id' = scheduled_assemblies.cep))
        )
    )
);

-- DELETE: Apenas síndico/organizador
DROP POLICY IF EXISTS scheduled_assemblies_delete_policy ON scheduled_assemblies;
CREATE POLICY scheduled_assemblies_delete_policy ON scheduled_assemblies
FOR DELETE USING (
    scheduled_assemblies.created_by = auth.email()
    OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.email = auth.email()
        AND u.user_type = 'sindico'
        AND (
            (jsonb_typeof(u.condominium) = 'object'
             AND (u.condominium->>'cep' = scheduled_assemblies.cep
                  OR u.condominium->>'condominium_id' = scheduled_assemblies.cep))
        )
    )
);

-- ------------------------------------------------------------
-- 9. POLÍTICAS RLS - assembly_attendance
-- ------------------------------------------------------------

ALTER TABLE assembly_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_attendance_select_policy ON assembly_attendance;
CREATE POLICY assembly_attendance_select_policy ON assembly_attendance
FOR SELECT USING (
    assembly_attendance.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_attendance.assembly_id
        AND (sa.cep = assembly_attendance.cep)
        AND (
            sa.created_by = auth.email()
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.email = auth.email() AND u.user_type = 'sindico'
            )
        )
    )
    OR EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_attendance.cep
    )
);

DROP POLICY IF EXISTS assembly_attendance_insert_policy ON assembly_attendance;
CREATE POLICY assembly_attendance_insert_policy ON assembly_attendance
FOR INSERT WITH CHECK (
    assembly_attendance.user_email = auth.email()
    AND EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_attendance.cep
    )
);

DROP POLICY IF EXISTS assembly_attendance_update_policy ON assembly_attendance;
CREATE POLICY assembly_attendance_update_policy ON assembly_attendance
FOR UPDATE USING (
    assembly_attendance.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_attendance.assembly_id
        AND sa.created_by = auth.email()
    )
) WITH CHECK (
    assembly_attendance.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_attendance.assembly_id
        AND sa.created_by = auth.email()
    )
);

-- ------------------------------------------------------------
-- 10. POLÍTICAS RLS - assembly_chat_messages
-- ------------------------------------------------------------

ALTER TABLE assembly_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_chat_messages_select_policy ON assembly_chat_messages;
CREATE POLICY assembly_chat_messages_select_policy ON assembly_chat_messages
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_chat_messages.cep
    )
);

DROP POLICY IF EXISTS assembly_chat_messages_insert_policy ON assembly_chat_messages;
CREATE POLICY assembly_chat_messages_insert_policy ON assembly_chat_messages
FOR INSERT WITH CHECK (
    assembly_chat_messages.user_email = auth.email()
    AND EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_chat_messages.cep
    )
    AND EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_chat_messages.assembly_id
        AND sa.status IN ('em_andamento')
    )
);

-- ------------------------------------------------------------
-- 11. POLÍTICAS RLS - assembly_speaking_requests (mão levantada)
-- ------------------------------------------------------------

ALTER TABLE assembly_speaking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_speaking_requests_select_policy ON assembly_speaking_requests;
CREATE POLICY assembly_speaking_requests_select_policy ON assembly_speaking_requests
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_speaking_requests.cep
    )
);

DROP POLICY IF EXISTS assembly_speaking_requests_insert_policy ON assembly_speaking_requests;
CREATE POLICY assembly_speaking_requests_insert_policy ON assembly_speaking_requests
FOR INSERT WITH CHECK (
    assembly_speaking_requests.user_email = auth.email()
    AND EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_speaking_requests.cep
    )
);

DROP POLICY IF EXISTS assembly_speaking_requests_update_policy ON assembly_speaking_requests;
CREATE POLICY assembly_speaking_requests_update_policy ON assembly_speaking_requests
FOR UPDATE USING (
    assembly_speaking_requests.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_speaking_requests.assembly_id
        AND sa.created_by = auth.email()
    )
) WITH CHECK (
    assembly_speaking_requests.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_speaking_requests.assembly_id
        AND sa.created_by = auth.email()
    )
);

-- ------------------------------------------------------------
-- 12. POLÍTICAS RLS - assembly_polls e assembly_votes
-- ------------------------------------------------------------

ALTER TABLE assembly_polls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_polls_select_policy ON assembly_polls;
CREATE POLICY assembly_polls_select_policy ON assembly_polls
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_polls.cep
    )
);

DROP POLICY IF EXISTS assembly_polls_insert_policy ON assembly_polls;
CREATE POLICY assembly_polls_insert_policy ON assembly_polls
FOR INSERT WITH CHECK (
    assembly_polls.created_by = auth.email()
    AND EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_polls.assembly_id
        AND sa.created_by = auth.email()
    )
);

DROP POLICY IF EXISTS assembly_polls_update_policy ON assembly_polls;
CREATE POLICY assembly_polls_update_policy ON assembly_polls
FOR UPDATE USING (
    assembly_polls.created_by = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_polls.assembly_id
        AND sa.created_by = auth.email()
    )
) WITH CHECK (
    assembly_polls.created_by = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_polls.assembly_id
        AND sa.created_by = auth.email()
    )
);

-- assembly_poll_options
ALTER TABLE assembly_poll_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_poll_options_policy ON assembly_poll_options;
CREATE POLICY assembly_poll_options_policy ON assembly_poll_options
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM assembly_polls ap
        JOIN user_condominiums uc ON uc.condominium_id = ap.cep
        WHERE ap.id = assembly_poll_options.poll_id
        AND uc.user_email = auth.email()
    )
);

-- assembly_votes
ALTER TABLE assembly_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_votes_select_policy ON assembly_votes;
CREATE POLICY assembly_votes_select_policy ON assembly_votes
FOR SELECT USING (
    assembly_votes.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM assembly_polls ap
        WHERE ap.id = assembly_votes.poll_id
        AND (
            ap.show_results_immediately = TRUE
            OR ap.status = 'encerrada'
            OR ap.created_by = auth.email()
        )
        AND EXISTS (
            SELECT 1 FROM user_condominiums uc
            WHERE uc.user_email = auth.email()
            AND uc.condominium_id = assembly_votes.cep
        )
    )
);

DROP POLICY IF EXISTS assembly_votes_insert_policy ON assembly_votes;
CREATE POLICY assembly_votes_insert_policy ON assembly_votes
FOR INSERT WITH CHECK (
    assembly_votes.user_email = auth.email()
    AND EXISTS (
        SELECT 1 FROM assembly_polls ap
        WHERE ap.id = assembly_votes.poll_id
        AND ap.status = 'aberta'
        AND (ap.end_at IS NULL OR ap.end_at > NOW())
    )
    AND EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_votes.cep
    )
);

-- ------------------------------------------------------------
-- 13. POLÍTICAS RLS - NOVAS TABELAS
-- ------------------------------------------------------------

-- assembly_agenda_items
ALTER TABLE assembly_agenda_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_agenda_items_select_policy ON assembly_agenda_items;
CREATE POLICY assembly_agenda_items_select_policy ON assembly_agenda_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_agenda_items.cep
    )
);

DROP POLICY IF EXISTS assembly_agenda_items_modify_policy ON assembly_agenda_items;
CREATE POLICY assembly_agenda_items_modify_policy ON assembly_agenda_items
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_agenda_items.assembly_id
        AND sa.created_by = auth.email()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_agenda_items.assembly_id
        AND sa.created_by = auth.email()
    )
);

-- assembly_documents
ALTER TABLE assembly_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_documents_select_policy ON assembly_documents;
CREATE POLICY assembly_documents_select_policy ON assembly_documents
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_documents.cep
    )
);

DROP POLICY IF EXISTS assembly_documents_modify_policy ON assembly_documents;
CREATE POLICY assembly_documents_modify_policy ON assembly_documents
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_documents.assembly_id
        AND sa.created_by = auth.email()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_documents.assembly_id
        AND sa.created_by = auth.email()
    )
);

-- assembly_recordings
ALTER TABLE assembly_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_recordings_select_policy ON assembly_recordings;
CREATE POLICY assembly_recordings_select_policy ON assembly_recordings
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_recordings.cep
    )
);

DROP POLICY IF EXISTS assembly_recordings_modify_policy ON assembly_recordings;
CREATE POLICY assembly_recordings_modify_policy ON assembly_recordings
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_recordings.assembly_id
        AND sa.created_by = auth.email()
    )
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_recordings.assembly_id
        AND sa.created_by = auth.email()
    )
);

-- assembly_participant_confirmations
ALTER TABLE assembly_participant_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_participant_confirmations_select_policy ON assembly_participant_confirmations;
CREATE POLICY assembly_participant_confirmations_select_policy ON assembly_participant_confirmations
FOR SELECT USING (
    assembly_participant_confirmations.user_email = auth.email()
    OR EXISTS (
        SELECT 1 FROM scheduled_assemblies sa
        WHERE sa.id = assembly_participant_confirmations.assembly_id
        AND sa.created_by = auth.email()
    )
);

DROP POLICY IF EXISTS assembly_participant_confirmations_insert_policy ON assembly_participant_confirmations;
CREATE POLICY assembly_participant_confirmations_insert_policy ON assembly_participant_confirmations
FOR INSERT WITH CHECK (
    assembly_participant_confirmations.user_email = auth.email()
    AND EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_participant_confirmations.cep
    )
);

-- assembly_event_logs
ALTER TABLE assembly_event_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assembly_event_logs_select_policy ON assembly_event_logs;
CREATE POLICY assembly_event_logs_select_policy ON assembly_event_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_event_logs.cep
    )
);

DROP POLICY IF EXISTS assembly_event_logs_insert_policy ON assembly_event_logs;
CREATE POLICY assembly_event_logs_insert_policy ON assembly_event_logs
FOR INSERT WITH CHECK (
    (assembly_event_logs.created_by = auth.email() OR assembly_event_logs.created_by IS NULL)
    AND EXISTS (
        SELECT 1 FROM user_condominiums uc
        WHERE uc.user_email = auth.email()
        AND uc.condominium_id = assembly_event_logs.cep
    )
);

-- ------------------------------------------------------------
-- 14. BACKFILL: POPULAR CEP EM REGISTROS EXISTENTES
-- ------------------------------------------------------------

-- Popular cep em assembly_attendance a partir de scheduled_assemblies
UPDATE assembly_attendance aa
SET cep = sa.cep
FROM scheduled_assemblies sa
WHERE aa.assembly_id = sa.id
AND aa.cep IS NULL;

-- Popular cep em assembly_chat_messages
UPDATE assembly_chat_messages acm
SET cep = sa.cep
FROM scheduled_assemblies sa
WHERE acm.assembly_id = sa.id
AND acm.cep IS NULL;

-- Popular cep em assembly_speaking_requests
UPDATE assembly_speaking_requests asr
SET cep = sa.cep
FROM scheduled_assemblies sa
WHERE asr.assembly_id = sa.id
AND asr.cep IS NULL;

-- Popular cep em assembly_polls
UPDATE assembly_polls ap
SET cep = sa.cep
FROM scheduled_assemblies sa
WHERE ap.assembly_id = sa.id
AND ap.cep IS NULL;

-- Popular cep em assembly_poll_options
UPDATE assembly_poll_options apo
SET cep = ap.cep
FROM assembly_polls ap
WHERE apo.poll_id = ap.id
AND apo.cep IS NULL;

-- Popular cep em assembly_votes
UPDATE assembly_votes av
SET cep = sa.cep
FROM scheduled_assemblies sa
WHERE av.assembly_id = sa.id
AND av.cep IS NULL;

-- Popular cep em assembly_event_logs
UPDATE assembly_event_logs ael
SET cep = sa.cep
FROM scheduled_assemblies sa
WHERE ael.assembly_id = sa.id
AND ael.cep IS NULL;

-- Definir cep como NOT NULL onde já foi populado (opcional, pode ser feito em migração futura)
-- ALTER TABLE assembly_attendance ALTER COLUMN cep SET NOT NULL;
-- ALTER TABLE assembly_chat_messages ALTER COLUMN cep SET NOT NULL;
-- etc.
