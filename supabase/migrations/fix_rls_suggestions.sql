-- =============================================================
-- FIX RLS POLICIES FOR SUGGESTIONS & CONDOMINIUMS TABLES
-- =============================================================
-- Problema: RLS estava habilitado nas tabelas sem políticas criadas,
-- resultando em "new row violates row-level security policy".
-- 
-- Solução: Como a autenticação é gerenciada pela aplicação (sessionStorage)
-- e não pelo Supabase Auth, as políticas abaixo permitem as operações
-- enquanto a aplicação aplica as regras de negócio (filtros por CEP,
-- permissões de síndico etc.).
-- =============================================================

-- -----------------------------------------------------------------
-- TABELA: condominiums (RLS habilitado - confirmado)
-- Necessária para validação de FK do cep em suggestions
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "condominiums_select_policy" ON public.condominiums;
DROP POLICY IF EXISTS "condominiums_insert_policy" ON public.condominiums;
DROP POLICY IF EXISTS "condominiums_update_policy" ON public.condominiums;

CREATE POLICY "condominiums_select_policy"
ON public.condominiums
FOR SELECT
USING (true);

CREATE POLICY "condominiums_insert_policy"
ON public.condominiums
FOR INSERT
WITH CHECK (true);

CREATE POLICY "condominiums_update_policy"
ON public.condominiums
FOR UPDATE
USING (true)
WITH CHECK (true);

-- -----------------------------------------------------------------
-- TABELA: suggestions (RLS habilitado - confirmado)
-- Causa principal do erro ao enviar sugestão
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "suggestions_select_policy" ON public.suggestions;
DROP POLICY IF EXISTS "suggestions_insert_policy" ON public.suggestions;
DROP POLICY IF EXISTS "suggestions_update_policy" ON public.suggestions;
DROP POLICY IF EXISTS "suggestions_delete_policy" ON public.suggestions;

CREATE POLICY "suggestions_select_policy"
ON public.suggestions
FOR SELECT
USING (true);

CREATE POLICY "suggestions_insert_policy"
ON public.suggestions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "suggestions_update_policy"
ON public.suggestions
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "suggestions_delete_policy"
ON public.suggestions
FOR DELETE
USING (true);
