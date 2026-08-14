# 🗺️ MAPA DE NAVEGAÇÃO - CondoSmart

## Fluxo de Usuário Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENTRADA NO SISTEMA                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
              ┌─────▼─────┐           ┌──────────▼──────┐
              │  INICIO    │           │   ENTRAR (JÁ   │
              │ (Landing)  │           │   LOGADO?)      │
              └─────┬─────┘           └────────┬────────┘
                    │                          │ (Sim)
        ┌──────────┴──────────┐           ┌────▼──────────────┐
        │                     │           │  TIPO-USUARIO.    │
        │                     │           │  (Selecionar      │
    ┌───▼──────────────┐  ┌───▼──────┐    │   perfil) [URL]   │
    │ LOGIN (Entrar)   │  │ CADASTRO │    │                   │
    └───┬──────────────┘  │ (Novo)   │    └────┬──────────────┘
        │                 └───┬──────┘         │
        │   ┌────────────────┘│               │
        │   │                 │               │
        │   │     ┌───────────┴──────────┐    │
        │   │     │ TIPO-USUARIO.       │    │
        │   │     │ (Selecionar tipo)   │    │
        │   │     └───┬─────────────┬───┘    │
        │   │         │             │        │
    ┌───▼───▼─────────▼─────────┐  │   ┌────▼────────────────┐
    │    CADASTRO (Signup)      │  │   │ VERIFICAÇÃO DE      │
    │  - Nome                   │  │   │ TIPO DE USUÁRIO     │
    │  - Email                  │  │   └────┬──────────────┬─┘
    │  - Telefone (mask)        │  │        │              │
    │  - CPF (mask)             │  │        │ (Síndico?)   │ (Outro)
    │  - Senha                  │  │        │              │
    │  - Confirmar Senha        │  │        │              │
    └────┬──────────────────────┘  │   ┌────▼────────────────▼───┐
         │                         │   │ ASSEMBLEIA.HTML         │
         │        ┌────────────────┘   │ (Sala de Reunião)      │
         │        │                    └────────────────────────┘
         │        │
    ┌────▼────────▼───────────────────────────────┐
    │ CONDOMINIO_REGISTER.HTML (se síndico)      │
    │ - Total de Apartamentos                     │
    │ - Total de Blocos                           │
    │ - Nomes dos Blocos (dinâmico)              │
    │ - CEP (mask)                                │
    │ - Nome do Condomínio                        │
    └────┬────────────────────────────────────────┘
         │
         │ (Após registrar condomínio)
         │
    ┌────▼──────────────────────────────────────────────────────┐
    │                  INDEX.HTML (Dashboard)                    │
    │  ┌────────────────────────────────────────────────────┐   │
    │  │ SIDEBAR (Navegação Principal)                      │   │
    │  ├─ Início ─────────────────► index.html             │   │
    │  │  Comunicado e Engajamento                         │   │
    │  ├─ Mural de Avisos                                 │   │
    │  ├─ Canal de Sugestões                              │   │
    │  ├─ Indicações                                       │   │
    │  │  Comunicação e Relacionamento                     │   │
    │  ├─ Chat com Moradores                              │   │
    │  ├─ Chat com Porteiro                               │   │
    │  ├─ Achados e Perdidos                              │   │
    │  ├─ Market Place                                    │   │
    │  │  Assembleia                                       │   │
    │  ├─ Assembleia ───────────────► assembleia.html     │   │
    │  ├─ Chamadas                                         │   │
    │  ├─ Avisos de Assembleia                            │   │
    │  │  Gestão de Moradores                             │   │
    │  ├─ Gestão de Moradores                             │   │
    │  │  Reserva e Manutenção                            │   │
    │  ├─ Reserva de Locais                               │   │
    │  ├─ Manutenção Preventiva                           │   │
    │  │  IA e Automação                                  │   │
    │  ├─ IA - Dúvidas do Condomínio                      │   │
    │  ├─ IA - Comunicados Automáticos                    │   │
    │  │  Configurações                                   │   │
    │  ├─ Configurações ──────────► configuracoes.html    │   │
    │  │                                                  │   │
    │  └─ Logout ────────────────► inicio.html             │   │
    │  └────────────────────────────────────────────────────┘   │
    │                                                            │
    │  ┌────────────────────────────────────────────────────┐   │
    │  │ CONTEÚDO PRINCIPAL                                │   │
    │  │ (Varia conforme página selecionada)              │   │
    │  │                                                   │   │
    │  │ Dashboard mostra:                                │   │
    │  │ - Bem-vindo ao painel                            │   │
    │  │ - Assembleias agendadas                          │   │
    │  │ - Estatísticas                                   │   │
    │  │ - Informações do condomínio                      │   │
    │  └────────────────────────────────────────────────────┘   │
    │                                                            │
    │  ┌────────────────────────────────────────────────────┐   │
    │  │ TOP BAR                                            │   │
    │  │ - Ícones de ações (chat, telefone, sino)         │   │
    │  │ - Avatar do usuário ──────┐                      │   │
    │  │ - Perfil do usuário       └──────┐               │   │
    │  │                                   ▼               │   │
    │  │                            Dropdown:              │   │
    │  │                            - Ver Perfil          │   │
    │  │                            - Configurações       │   │
    │  │                            - Sair               │   │
    │  └────────────────────────────────────────────────────┘   │
    └──────────────────────────────────────────────────────────┘
         │
         │ (Configurações)
         │
    ┌────▼──────────────────────────────────────┐
    │  CONFIGURACOES.HTML (Settings)            │
    │  - Perfil do Usuário                      │
    │  ├─ Ver foto                              │
    │  ├─ Editar dados                          │
    │  │  Preferências                          │
    │  ├─ Tema (Light/Dark)                    │
    │  ├─ Tamanho de Fonte (P/M/G)             │
    │  ├─ Idioma (PT-BR, etc)                  │
    │  │  Conta                                 │
    │  ├─ Email                                 │
    │  ├─ Telefone                              │
    │  ├─ CPF                                   │
    │  │  Segurança                             │
    │  ├─ Alterar Senha                         │
    │  ├─ Autenticação 2FA                      │
    │  │  Privacidade                           │
    │  ├─ Notificações                          │
    │  ├─ Compartilhamento de Dados            │
    │  │  Condomínio                            │
    │  ├─ Alterar Condomínio                    │
    │  ├─ Dados do Condomínio                   │
    │  │  Sobre                                 │
    │  ├─ Versão da App                         │
    │  ├─ Termos de Uso                         │
    │  │                                        │
    │  └─ LOGOUT ────► Retorna para INICIO    │
    └────────────────────────────────────────┘

         │
         │ (Assembleia)
         │
    ┌────▼──────────────────────────────────────────────────┐
    │  ASSEMBLEIA.HTML (Sala de Reunião)                    │
    │  ┌──────────────────────────────────────────────────┐ │
    │  │ GRID DE VÍDEO (Simulado)                         │ │
    │  │ - Seu vídeo principal (com câmera/microfone)    │ │
    │  │ - Vídeos de outros participantes (grid)         │ │
    │  │ - Botões: Mic, Câmera, Screen Share             │ │
    │  └──────────────────────────────────────────────────┘ │
    │  ┌──────────────────────────────────────────────────┐ │
    │  │ CHAT SIDEBAR                                     │ │
    │  │ - Histórico de mensagens                         │ │
    │  │ - Caixa de entrada para novas mensagens         │ │
    │  │ - Botão enviar                                  │ │
    │  └──────────────────────────────────────────────────┘ │
    │  ┌──────────────────────────────────────────────────┐ │
    │  │ VOTING & COMMENTS (Abas)                         │ │
    │  │ - Votação: Sim/Não/Abstenção                    │ │
    │  │ - Resultado da votação em tempo real            │ │
    │  │ - Comentários com data/hora                     │ │
    │  │ - Campo para adicionar novo comentário          │ │
    │  └──────────────────────────────────────────────────┘ │
    └──────────────────────────────────────────────────────┘
```

---

## 📍 Localização de Páginas

### Estrutura de Pastas
```
pages/
├── index.html               (Dashboard principal)
├── entrar.html             (Login)
├── cadastro.html           (Signup)
├── tipo-usuario.html       (Seleção de tipo)
├── inicio.html             (Landing page)
├── assembleia.html         (Meeting room)
├── condominio_register.html (Condo registration)
└── configuracoes.html      (Settings)
```

### Links Relativos
```
HTML → HTML: href="[nome].html"      (mesma pasta)
HTML → CSS:  href="../styles/[nome].css"
HTML → JS:   href="../scripts/[nome].js"
HTML → Assets: href="../assets/[nome]"
HTML → i18n: href="../i18n.js"
```

---

## 🔄 Transições Entre Páginas

### De Inicial para Login
```
inicio.html → Clique "Login" → entrar.html
       ↓
    sessionStorage tem usuário?
       ├─ SIM  → index.html
       └─ NÃO  → entrar.html
```

### De Login para Dashboard
```
entrar.html → Credenciais OK → Criado usuário em sessionStorage
        ↓
    User é síndico?
        ├─ SIM  → condominio_register.html
        └─ NÃO  → assembleia.html (moradores/porteiros)
```

### De Cadastro para Dashboard
```
cadastro.html → Preenche formulário → Criado usuário em sessionStorage
         ↓
    Tipo = síndico?
         ├─ SIM  → condominio_register.html
         └─ NÃO  → assembleia.html
```

### Do Dashboard para Outras Páginas
```
index.html (Dashboard)
    ├─ Assembleia → assembleia.html
    ├─ Configurações → configuracoes.html
    ├─ Logout → sessionStorage limpo → inicio.html
    └─ Qualquer link da sidebar
```

### Das Configurações
```
configuracoes.html
    ├─ Voltar → index.html
    └─ Logout → sessionStorage limpo → inicio.html
```

---

## 🎯 Pontos de Entrada

### URL para Iniciar
```
1. Landing Page (Recomendado)
   file:///c:\...\pages\inicio.html
   
2. Login Direto
   file:///c:\...\pages\entrar.html
   
3. Dashboard
   file:///c:\...\pages\index.html
   (Redireciona para login se não autenticado)
```

---

## 🔐 Verificações de Autenticação

```
┌─ Usuário clica em página
  │
  ├─ Página verifica sessionStorage['condominiumUser']
  │
  ├─ sessionStorage vazio?
  │  └─ SIM: Redireciona para entrar.html
  │
  └─ sessionStorage contém usuário?
     └─ SIM: Carrega página normalmente
```

---

## 💾 Armazenamento de Dados

### sessionStorage (Temporário - Sessão)
```
Usuário criado no login
├─ id (timestamp)
├─ name (nome do usuário)
├─ email
├─ phone
├─ cpf
├─ type (síndico/morador/porteiro)
└─ condominium (se síndico)

Limpo ao:
- Fechar a aba
- Clicar em Logout
- Fechar o navegador
```

### localStorage (Persistente - Entre sessões)
```
UI Preferences
├─ theme (light/dark)
├─ fontSize (small/medium/large)
└─ language (pt-br/en/es)

NÃO limpo ao:
- Fechar a aba
- Fazer logout (mas sessionStorage é)
- Fechar o navegador
```

---

**Versão**: 1.0
**Data**: 06 de Junho de 2026
**Status**: ✅ Mapa Completo
