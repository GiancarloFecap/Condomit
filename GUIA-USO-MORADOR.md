═══════════════════════════════════════════════════════════════════════════════
GUIA DE USO - FLUXO VINCULAÇÃO MORADOR + DASHBOARD
═══════════════════════════════════════════════════════════════════════════════

## 🚀 PASSO 1: PREPARAR O BANCO DE DADOS

### 1.1 Criar tabela user_condominiums no Supabase

Acesse: https://app.supabase.com > Seu Projeto > SQL Editor > New Query

Cole e execute:

```sql
CREATE TABLE public.user_condominiums (
  id bigint generated always as identity primary key,
  user_email text not null references public.users(email) on delete cascade,
  condominium_id text not null references public.condominiums(cep) on delete cascade,
  apartment integer not null,
  block text not null,
  created_at timestamp with time zone default now(),
  unique(user_email)
);
```

### 1.2 (Opcional) Criar índices para melhor performance

```sql
CREATE INDEX idx_user_condominiums_user_email 
ON public.user_condominiums(user_email);

CREATE INDEX idx_user_condominiums_condominium_id 
ON public.user_condominiums(condominium_id);

CREATE INDEX idx_user_condominiums_created_at 
ON public.user_condominiums(created_at);
```

### 1.3 Verificar dados existentes

Verifique se você tem:

**Tabela condominiums** com pelo menos um registro:
- cep: "01234-567" (ID único)
- condominium_name: "Residencial Jardim Imperial" (será a senha)
- total_apartments: 100
- total_blocks: 3
- block_names: ["A", "B", "C"]

**Tabela users** com um usuário morador:
- email: "morador@email.com"
- password: "senha123"
- user_type: "morador"
- condominium: null (inicialmente)


## 👤 PASSO 2: TESTAR O FLUXO

### 2.1 Acessar a página de login

Navegue para: `pages/entrar.html`

Faça login como morador:
- Email: morador@email.com
- Senha: senha123

**Resultado esperado**: Redireciona para `entrar-condominio.html`


### 2.2 Vincular ao condomínio

Página: `entrar-condominio.html`

Preencha o formulário:
- Apartamento: 10
- Bloco: A
- ID do condomínio: 01234-567
- Senha do condomínio: Residencial Jardim Imperial (EXATO)

**Clique**: "Entrar no condomínio"

**O que acontece**:
1. Exibe loading
2. Valida os dados (6 checks)
3. Salva em user_condominiums
4. Atualiza campo condominium em users
5. Exibe "Condomínio vinculado com sucesso!"
6. Aguarda 1 segundo
7. Redireciona para index-morador.html


### 2.3 Visualizar a dashboard

Página: `index-morador.html`

**O que você vê**:
- Header com "Olá, Morador!" (primeiro nome do usuário)
- Condomínio: "Residencial Jardim Imperial"
- Apartamento: "Apto 10 - Bloco A"
- 6 seções com 11 cards interativos:
  1. Avisos e Comunicados (3 cards)
  2. Comunicação e Relacionamento (3 cards)
  3. Assembleias (1 card)
  4. Reservas de Locais (1 card)
  5. Manutenção (1 card)
  6. IA e Serviços (2 cards)
- Sidebar com menu completo
- Botão de logout


## 🎯 PASSO 3: TESTAR CASOS ESPECIAIS

### 3.1 Usuário não autenticado

Se acessar `entrar-condominio.html` sem login:
→ Redireciona para `entrar.html`

Se acessar `index-morador.html` sem login:
→ Redireciona para `entrar.html`


### 3.2 Usuário já vinculado

Login com morador que já tem condominium:
→ Vai direto para `index-morador.html`

Não passa por `entrar-condominio.html`


### 3.3 Dados inválidos em entrar-condominio.html

**Apartamento fora do intervalo**:
- Insira: 101 (para condomínio com 100 apts)
- Erro: "Apartamento deve estar entre 1 e 100"

**Bloco não existe**:
- Insira: "Z" (não existe em ["A","B","C"])
- Erro: "Bloco \"Z\" não existe neste condomínio"

**Senha incorreta**:
- Insira: senha errada
- Erro: "Senha do condomínio incorreta"

**ID do condomínio não existe**:
- Insira: "99999-999"
- Erro: "ID do condomínio não encontrado"


### 3.4 Deletar vínculo e testar novamente

Para refazer o teste, delete o registro:

```sql
DELETE FROM user_condominiums 
WHERE user_email = 'morador@email.com';

UPDATE users 
SET condominium = null 
WHERE email = 'morador@email.com';
```

Depois faça login novamente e repita o fluxo.


## 📱 PASSO 4: TESTAR RESPONSIVIDADE

### Desktop (1200px+)
- Sidebar sempre visível (280px)
- Cards em 3 colunas
- Menu vertical

### Tablet (768px - 1024px)
- Sidebar 240px
- Cards em 2 colunas
- Header ajustado

### Mobile (até 768px)
- Sidebar oculta (toggle com botão)
- Botão menu no header
- Cards em 1 coluna
- Header compacto


## 🧪 CHECKLIST DE TESTE

- [ ] Tabela user_condominiums criada
- [ ] Condomínio de teste existe em condominiums
- [ ] Usuário morador existe em users (sem condominium)
- [ ] Login com morador redireciona para entrar-condominio.html
- [ ] Formulário valida campos vazios
- [ ] Validações contra banco funcionam
- [ ] Dados salvam em user_condominiums
- [ ] Dashboard carrega com dados corretos
- [ ] Nome do morador aparece no header
- [ ] Condomínio exibe corretamente
- [ ] Apartamento e bloco aparecem
- [ ] Sidebar funciona em mobile
- [ ] Logout funciona
- [ ] Links de navegação funcionam (placeholders)
- [ ] Responsividade OK em 3 tamanhos


## 🐛 SOLUÇÃO DE PROBLEMAS

### Dashboard não carrega

**Possíveis causas**:
1. Usuário não está autenticado
2. Não existe vínculo em user_condominiums
3. Erro na conexão Supabase
4. CEP/condominium_id está incorreto

**Solução**:
- Abra console (F12)
- Veja mensagens de erro
- Verifique dados no Supabase
- Teste conexão com fetch direto


### Vinculação não salva

**Possíveis causas**:
1. Foreign keys não configuradas
2. Constraint UNIQUE violado
3. Erro de permissão (RLS)
4. Dados inválidos nos campos

**Solução**:
- Verifique FK em Supabase
- Teste INSERT direto no SQL
- Revise políticas RLS
- Valide tipos de dados


### Redirecionamento não funciona

**Possíveis causas**:
1. Paths errados nas URLs
2. Arquivo .html não encontrado
3. Erro no JavaScript antes do redirect

**Solução**:
- Verifique paths em .html
- Console > Networks > veja 404s
- Console > veja erros JS


### Estilos não aparecem

**Possíveis causas**:
1. Path do CSS incorreto
2. Arquivo .css não encontrado
3. Cache do navegador

**Solução**:
- Verifique link rel="stylesheet" em HTML
- Hard refresh (Ctrl+Shift+R)
- Inspect > devtools > check URL


## 📧 SUPORTE E DÚVIDAS

Confira os arquivos:
- RESUMO-IMPLEMENTACAO.md (overview geral)
- INSTRUCOES-SUPABASE.md (detalhes técnicos)
- Código comentado nos arquivos .js e .css


═══════════════════════════════════════════════════════════════════════════════
FIM DO GUIA DE USO
═══════════════════════════════════════════════════════════════════════════════
