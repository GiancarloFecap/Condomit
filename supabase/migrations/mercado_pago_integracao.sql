-- =================================================================
-- MERCADO PAGO CHECKOUT PRO - SUPABASE MIGRATION
-- =================================================================
-- O QUE FAZ:
--   1. Adiciona colunas na tabela "pagamento" para integracao MP
--   2. Cria indice UNICO em mp_payment_id (idempotencia)
--   3. Cria indice de busca em external_reference
--   4. Adiciona colunas na tabela "users" para ativacao de plano
--   5. Aplica RLS policies na tabela "pagamento"
--
-- SEGURANCA:
--   - Tudo com IF NOT EXISTS (NAO E DESTRUTIVO)
--   - Nenhuma coluna/tabela existente e removida
--   - Compativel com PostgreSQL 12+ (Supabase)
--   - Sintaxe SQL puro (sem blocos PL/pgSQL DO $$...)
-- =================================================================


-- =================================================================
-- PARTE 1/5 — TABELA "pagamento" (adicao de colunas)
-- =================================================================
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS mp_payment_id        TEXT;
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS external_reference  TEXT;
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS valor_pago          NUMERIC(12,2);
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS moeda               TEXT DEFAULT 'BRL';
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS status_detail       TEXT;
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS mp_status           TEXT;
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS mp_status_detail    TEXT;
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS data_pagamento      TIMESTAMPTZ;
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS data_atualizacao    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pagamento ADD COLUMN IF NOT EXISTS usuario_id          TEXT;


-- =================================================================
-- PARTE 2/5 — TABELA "pagamento" (indices para performance e unicidade)
-- =================================================================
-- Garante IDEMPOTENCIA: o mesmo pagamento MP NUNCA sera processado 2x
CREATE UNIQUE INDEX IF NOT EXISTS pagamento_mp_payment_id_uq
    ON public.pagamento (mp_payment_id);

-- Acelera buscas por pedido (usado no webhook)
CREATE INDEX IF NOT EXISTS pagamento_external_reference_idx
    ON public.pagamento (external_reference);

-- Acelera buscas de pagamentos de um usuario especifico
CREATE INDEX IF NOT EXISTS pagamento_email_idx
    ON public.pagamento (email);

-- Acelera buscas por status de pagamento
CREATE INDEX IF NOT EXISTS pagamento_status_pagamento_idx
    ON public.pagamento (status_pagamento);


-- =================================================================
-- PARTE 3/5 — TABELA "users" (adicao de colunas para ativar plano)
-- =================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan                 TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plano                TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS data_ativacao_plano  TIMESTAMPTZ;


-- =================================================================
-- PARTE 4/5 — TABELA "users" (indice de busca por email)
-- =================================================================
CREATE INDEX IF NOT EXISTS users_email_idx
    ON public.users (email);


-- =================================================================
-- PARTE 5/5 — RLS POLICIES (compatibilidade com pattern do projeto)
-- =================================================================
-- Obs: O webhook usa SUPABASE_SERVICE_ROLE_KEY, que IGNORA RLS.
-- Estas policies servem para o frontend (anon key) continuar
-- funcionando igual ao resto do sistema via api-proxy.js.
-- Ver: supabase/migrations/fix_rls_suggestions.sql

DROP POLICY IF EXISTS pagamento_select_policy ON public.pagamento;
CREATE POLICY pagamento_select_policy
    ON public.pagamento
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS pagamento_insert_policy ON public.pagamento;
CREATE POLICY pagamento_insert_policy
    ON public.pagamento
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS pagamento_update_policy ON public.pagamento;
CREATE POLICY pagamento_update_policy
    ON public.pagamento
    FOR UPDATE
    USING (true)
    WITH CHECK (true);


-- =================================================================
-- COMO VERIFICAR SE DEU TUDO CERTO (copie e rode separado no SQL Editor):
-- =================================================================
/*
-- Ver colunas novas em pagamento:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'pagamento'
  AND column_name IN (
      'mp_payment_id','external_reference','valor_pago','moeda',
      'status_detail','mp_status','mp_status_detail',
      'data_pagamento','data_atualizacao','usuario_id'
  )
ORDER BY column_name;

-- Ver colunas novas em users:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
  AND column_name IN ('plan','plano','data_ativacao_plano')
ORDER BY column_name;

-- Ver indices criados:
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('pagamento','users')
ORDER BY tablename, indexname;

-- Ver RLS policies:
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'pagamento'
ORDER BY policyname;
*/
