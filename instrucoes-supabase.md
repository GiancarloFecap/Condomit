#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
═══════════════════════════════════════════════════════════════════════════════
INSTRUÇÕES DE CONFIGURAÇÃO DO BANCO DE DADOS - SUPABASE
═══════════════════════════════════════════════════════════════════════════════

IMPORTANTE: Execute os comandos SQL abaixo no Supabase SQL Editor

Acesse: https://app.supabase.com > Seu Projeto > SQL Editor > New Query
"""

# ═══════════════════════════════════════════════════════════════════════════════
# 1. CRIAR TABELA user_condominiums
# ═══════════════════════════════════════════════════════════════════════════════

"""
Esta tabela rastreia o vínculo entre usuários (moradores) e os condomínios.

CREATE TABLE public.user_condominiums (
  id bigint generated always as identity primary key,
  user_email text not null references public.users(email) on delete cascade,
  condominium_id text not null references public.condominiums(cep) on delete cascade,
  apartment integer not null,
  block text not null,
  created_at timestamp with time zone default now(),
  unique(user_email)
);
"""

# ═══════════════════════════════════════════════════════════════════════════════
# EXPLICAÇÃO DOS CAMPOS:
# ═══════════════════════════════════════════════════════════════════════════════

"""
- id: Identificador único (auto-incrementado)
- user_email: Email do usuário (referência à tabela users)
- condominium_id: CEP do condomínio (referência à tabela condominiums)
- apartment: Número do apartamento
- block: Bloco/letra do apartamento
- created_at: Data de criação do vínculo (padrão: agora)
- UNIQUE(user_email): Um usuário só pode estar vinculado a um condomínio
"""

# ═══════════════════════════════════════════════════════════════════════════════
# 2. CRIAR ÍNDICES (OPCIONAL MAS RECOMENDADO)
# ═══════════════════════════════════════════════════════════════════════════════

"""
CREATE INDEX idx_user_condominiums_user_email 
ON public.user_condominiums(user_email);

CREATE INDEX idx_user_condominiums_condominium_id 
ON public.user_condominiums(condominium_id);

CREATE INDEX idx_user_condominiums_created_at 
ON public.user_condominiums(created_at);
"""

# ═══════════════════════════════════════════════════════════════════════════════
# 3. VERIFICAR POLÍTICAS DE SEGURANÇA (RLS)
# ═══════════════════════════════════════════════════════════════════════════════

"""
Se tiver RLS habilitado, adicione as políticas necessárias:

-- Política para SELECT: Usuários podem ver apenas seus próprios registros
CREATE POLICY "Users can view their own condominiums"
ON public.user_condominiums
FOR SELECT
USING (auth.uid() = (SELECT auth.uid FROM public.users WHERE email = user_email));

-- Política para INSERT: Apenas usuários autenticados podem inserir
CREATE POLICY "Users can create condominium links"
ON public.user_condominiums
FOR INSERT
WITH CHECK (auth.uid() = (SELECT auth.uid FROM public.users WHERE email = user_email));

-- Política para UPDATE: Não permitir atualizações (dados imutáveis)
-- (Remova este comentário se permitir edições de apartamento/bloco)

-- Política para DELETE: Apenas administradores ou o próprio usuário
CREATE POLICY "Users can delete their own links"
ON public.user_condominiums
FOR DELETE
USING (auth.uid() = (SELECT auth.uid FROM public.users WHERE email = user_email));
"""

# ═══════════════════════════════════════════════════════════════════════════════
# RESUMO DAS ALTERAÇÕES FEITAS NO PROJETO
# ═══════════════════════════════════════════════════════════════════════════════

"""
✅ NOVOS ARQUIVOS CRIADOS:

1. pages/entrar-condominio.html
   - Formulário para morador entrar no condomínio
   - Campos: Apartamento, Bloco, ID do Condomínio, Senha
   - Integração com Supabase

2. scripts/entrar-condominio.js
   - Validações contra o banco de dados
   - Verificação de autenticação
   - Salvamento em user_condominiums
   - Atualização do campo condominium em users
   - Redirecionamento automático para index-morador.html

3. styles/entrar-condominio.css
   - Design responsivo e moderno
   - Loading overlay
   - Sistema de alertas
   - Campos de erro

4. pages/index-morador.html
   - Dashboard completa do morador
   - Sidebar recolhível
   - Menu com 7 seções principais
   - Grid de cards interativos
   - Cabeçalho dinâmico

5. scripts/index-morador.js
   - Carregamento de dados do Supabase
   - Verificação de vínculo com condomínio
   - Renderização dinâmica de dados
   - Navegação entre seções
   - Responsividade

6. styles/index-morador.css
   - Design premium e moderno
   - CSS Grid responsivo
   - Animações suaves
   - Variáveis CSS reutilizáveis
   - Suporte para múltiplos tamanhos de tela
"""

# ═══════════════════════════════════════════════════════════════════════════════
# FLUXO DE VALIDAÇÃO - ENTRAR NO CONDOMÍNIO
# ═══════════════════════════════════════════════════════════════════════════════

"""
1. ✅ Verificar se usuário está autenticado
2. ✅ Verificar se é do tipo "morador"
3. ✅ Verificar se condomínio existe (CEP = condominiumId)
4. ✅ Verificar se senha = condominium_name
5. ✅ Verificar se apartamento está entre 1 e total_apartments
6. ✅ Verificar se bloco existe no array block_names
7. ✅ Salvar em user_condominiums
8. ✅ Atualizar campo condominium em users
9. ✅ Exibir sucesso e redirecionar
"""

# ═══════════════════════════════════════════════════════════════════════════════
# FLUXO DA DASHBOARD - index-morador.html
# ═══════════════════════════════════════════════════════════════════════════════

"""
1. ✅ Verificar autenticação
2. ✅ Verificar se é morador
3. ✅ Verificar vínculo em user_condominiums
4. ✅ Se não vinculado: redirecionar para entrar-condominio.html
5. ✅ Se vinculado: carregar dados
6. ✅ Exibir nome do condomínio (condominium_name)
7. ✅ Exibir apartamento e bloco
8. ✅ Renderizar dashboard completa
9. ✅ Menu lateral com 7 seções
"""

# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRAÇÃO COM SUPABASE - URLS E ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

"""
ENDPOINTS UTILIZADOS:

GET /user_condominiums?user_email=eq.{email}
  - Buscar vínculo do usuário

POST /user_condominiums
  - Inserir novo vínculo

GET /condominiums?cep=eq.{cep}
  - Buscar dados do condomínio

PATCH /users?email=eq.{email}
  - Atualizar campo condominium

GET /users?email=eq.{email}
  - Buscar dados do usuário
"""

# ═══════════════════════════════════════════════════════════════════════════════
# NOTAS IMPORTANTES
# ═══════════════════════════════════════════════════════════════════════════════

"""
⚠️ ANTES DE USAR EM PRODUÇÃO:

1. Crie a tabela user_condominiums no Supabase
2. Configure as políticas de RLS se necessário
3. Teste o fluxo completo:
   - Criar usuário morador
   - Fazer login
   - Entrar no condomínio (com dados válidos)
   - Verificar dashboard
4. Certifique-se de que:
   - O arquivo supabase-client.js tem as chaves corretas
   - Os endpoints estão acessíveis
   - As referências de chave estrangeira estão funcionando

📝 DADOS DE TESTE:

Para testar, você precisa:
1. Um condomínio cadastrado em condominiums com:
   - cep (ID)
   - condominium_name (que será a senha)
   - total_apartments
   - block_names (array)

2. Um usuário morador em users com:
   - email
   - password
   - user_type = 'morador'
   - condominium = null (inicialmente)

Exemplo de condomínio:
{
  "cep": "01234-567",
  "condominium_name": "Residencial Jardim Imperial",
  "total_apartments": 100,
  "total_blocks": 3,
  "block_names": ["A", "B", "C"]
}

Exemplo de usuário:
{
  "name": "João Silva",
  "email": "joao@email.com",
  "phone": "11999999999",
  "cpf": "12345678901",
  "password": "senha123",
  "user_type": "morador",
  "condominium": null
}
"""
