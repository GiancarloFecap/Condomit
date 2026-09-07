# Condomit 0.72.0 — revisão de UI/UX

Esta revisão preserva a lógica de negócio e aplica uma camada visual e de interação inspirada nas Human Interface Guidelines da Apple, adaptada à identidade da Condomit.

## Principais mudanças

- Paleta Condomit com navegação azul-marinho, azul principal `#2252BD`, azul de ação `#3360F2` e ciano como acento.
- Interface híbrida: navegação escura + conteúdo azul-cinza, evitando telas totalmente claras ou totalmente escuras.
- Barra superior e navegação com materiais translúcidos usados apenas na camada funcional; cards e conteúdo permanecem em superfícies opacas para legibilidade.
- Hierarquia tipográfica baseada na pilha de fontes do sistema (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui`).
- Cards, tabelas, campos, botões, modais, chats, estados vazios e badges harmonizados.
- Controles móveis com área mínima de toque de 44 px.
- Nova barra de navegação inferior no mobile, criada a partir dos links reais da sidebar e acompanhada do botão “Mais”.
- Sidebar mobile em formato de drawer arredondado, com safe areas e fundo desfocado.
- Modais adaptados para apresentação próxima de bottom sheet em telas pequenas.
- Melhorias de acessibilidade: foco visível, rótulos automáticos conservadores para botões somente com ícone, suporte a `prefers-reduced-motion` e `prefers-contrast`.
- Alertas mais compactos e menos intrusivos. Erros e avisos importantes permanecem visíveis até fechamento explícito.
- PWA atualizada com nova cor de fundo/tema e cache `condomit-shell-v072`.
- Correção do verificador de projeto para caminhos contendo espaços.

## Arquivos adicionados

- `styles/apple-hig.css`
- `scripts/apple-ux.js`

## Arquivos principais atualizados

- HTMLs em `pages/` para carregar a nova camada visual e de interação.
- `scripts/condomit-alerts.js`
- `service-worker.js`
- `manifest.webmanifest`
- `package.json` / `package-lock.json`
- `tools/check-project.mjs`

O bundle `www/` é regenerado com `npm run mobile:build` para manter o projeto Capacitor sincronizado.
