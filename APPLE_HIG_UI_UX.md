# Condomit — UI/UX inspirada nas Apple Human Interface Guidelines

Esta versão adiciona uma camada visual e de experiência (`styles/apple-hig.css`) carregada por último, sem alterar a lógica de negócio, integrações, rotas ou logos do projeto.

## Princípios aplicados

- **Clareza e hierarquia:** tipografia de sistema, contraste, pesos e espaçamento mais consistentes.
- **Conteúdo acima da decoração:** cards e áreas de conteúdo usam superfícies sólidas e discretas.
- **Materiais para navegação:** sidebar, topbar e chrome usam translucidez/blur de forma controlada, preservando legibilidade.
- **Consistência entre iOS e macOS:** densidade mais compacta em desktop com mouse e alvos maiores em telas touch.
- **Acessibilidade:** foco de teclado visível, controles touch com 44px em mobile, suporte a `prefers-reduced-motion`, `prefers-reduced-transparency` e `prefers-contrast`.
- **Safe areas:** barras e navegação respeitam `env(safe-area-inset-*)` para iPhone/Capacitor.
- **Feedback de interação:** estados hover, pressed, disabled e selected mais claros.
- **Formulários:** campos mais legíveis, foco consistente e prevenção de zoom automático no iOS.
- **Modais mobile:** comportamento visual próximo de sheets em telas pequenas.
- **Dark mode:** tokens e superfícies adaptados ao modo escuro existente.

## Escopo

A camada é aplicada a dashboards de síndico, morador e porteiro, páginas operacionais, configurações, gestão, assembleias, chats, formulários e autenticação. A tela de seleção de tipo de usuário recebe um refinamento específico, sem trocar a logo ou a estrutura funcional.

## Arquivos alterados/adicionados

- `styles/apple-hig.css` — design system global.
- Todos os HTML públicos e de `pages/` — inclusão do stylesheet final.
- `pages/tipo-usuario.html` — apenas classe de escopo para o refinamento visual.
- `www/` — reconstruído por `npm run mobile:build` a partir da versão web, mantendo web e Capacitor sincronizados.

## Observação

A implementação busca a linguagem e os princípios da Apple, mas mantém a marca Condomit e não tenta copiar componentes proprietários pixel a pixel.
