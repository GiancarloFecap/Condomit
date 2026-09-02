# Condomit v0.56.0 — Logo e modo escuro global

- Nova `Logo.svg` aplicada em Entrar e Tipo de Usuário.
- Alternador sol/lua em Início, Entrar, Tipo de Usuário e cadastros de Morador, Síndico e Porteiro.
- Checkout também ganhou alternador compacto e variação completa de modo escuro.
- Tema escolhido persiste em `app-theme` e é aplicado antes do primeiro paint para reduzir flashes de tema incorreto.
- `theme.css` + `dark-mode-global.css` passaram a ser carregados em todas as páginas HTML do projeto, oferecendo fallback de modo escuro para páginas antigas.
- Páginas públicas, autenticação, 2FA, recuperação de senha, páginas legais e resultados de pagamento receberam ajustes de contraste.
- Em Configurações, removido o bloco visual `Notificações do dispositivo ativadas`.
- Ícone de `Sair de todos os dispositivos` corrigido no modo escuro.
- Web e `www/` sincronizados.
- Nenhuma migration nova do Supabase.
