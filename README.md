# CondoSmart - Plataforma de Gestão de Condomínios

## 📋 Descrição
Aplicação web para gerenciamento de assembleias de condomínios, com suporte para síndicos, moradores e porteiros.

## 🏗️ Estrutura do Projeto

```
Teste-Assembleia/
├── pages/              # Páginas HTML
├── styles/             # Arquivos CSS
├── scripts/            # Arquivos JavaScript
├── assets/             # Imagens, logos, etc
└── i18n.js             # Internacionalização
```

## 🚀 Como Iniciar

1. Abrir `pages/index.html` no navegador
2. Usar credenciais de teste para login
3. A aplicação cria um usuário de demo em sessionStorage

## 🔐 Autenticação

- **Sistema**: Demo-based (sem backend)
- **Armazenamento**: sessionStorage (limpa ao fechar aba)
- **Usuários de teste**: 
  - Email: qualquer email
  - Senha: qualquer senha (não validada)

## 📱 Páginas

| Página | Rota | Descrição |
|--------|------|-----------|
| Entrada | `pages/entrar.html` | Login/autenticação |
| Cadastro | `pages/cadastro.html` | Registro de novos usuários |
| Tipo Usuário | `pages/tipo-usuario.html` | Seleção de tipo (síndico/morador/porteiro) |
| Dashboard | `pages/index.html` | Painel principal (síndico) |
| Assembleia | `pages/assembleia.html` | Sala de reunião virtual |
| Configurações | `pages/configuracoes.html` | Preferências do usuário |
| Registro Condomínio | `pages/condominio_register.html` | Cadastro de condomínio |
| Início | `pages/inicio.html` | Landing page |

## 🎨 Temas

- **Cor Primária**: Azul gradiente (#1e40af - #1e3a8a)
- **Tema**: Claro/Escuro (em configurações)
- **Fontes**: Segoe UI, Roboto
- **Ícones**: Font Awesome 6.5.1

## 🗄️ Armazenamento

### SessionStorage (temporário)
- `condominiumUser` - Dados do usuário atual
- Limpo ao fechar a aba/navegador

### LocalStorage (persistente)
- `theme` - Tema (light/dark)
- `fontSize` - Tamanho da fonte
- `language` - Idioma

## 🎯 Funcionalidades

✅ Autenticação de usuários
✅ Gestão de assembleias
✅ Sala virtual com vídeo (simulado)
✅ Chat em tempo real (simulado)
✅ Votações em assembleias
✅ Comentários
✅ Preferências de usuário
✅ Suporte a temas
✅ Responsivo (mobile-first)

## ⚠️ Limitações

- ❌ Sem backend API
- ❌ Sem persistência de dados (reset ao fechar)
- ❌ Sem autenticação real
- ❌ Vídeo/câmera simulados
- ❌ Chat local apenas

## 🔄 Fluxo de Uso

1. **Usuário anônimo** → `inicio.html` (landing)
2. → Clica "Entrar" → `entrar.html` (login)
3. → Credenciais qualquer → Login bem-sucedido
4. → Seleção de tipo → `tipo-usuario.html`
5. → Se novo → `cadastro.html` → Dados de cadastro
6. → Se síndico → `condominio_register.html` → Dados do condomínio
7. → Redirecionado para dashboard

## 📝 Notas Técnicas

- Vanilla HTML/CSS/JavaScript (sem frameworks)
- Caminhos relativos com `../` para navegação entre pastas
- CSS custom properties para temas
- Responsive design com media queries
- Mascaras de entrada (telefone, CPF, CEP)

## 🐛 Debugging

Se as páginas não carregarem:
1. Verificar console do navegador (F12)
2. Confirmar que os arquivos estão nas pastas corretas
3. Verificar caminhos relativos nos links

## 📄 Licença

Projeto de teste - Libre para uso e modificação

---

**Última atualização**: 2024
**Status**: Em desenvolvimento 🚧
