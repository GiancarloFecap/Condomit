# Condomit — Correções 010 (Portaria e Assembleia)

## Alterações aplicadas

- O botão **Mão** da assembleia não recria mais a grade de vídeo. Assim, levantar/abaixar a mão não remove a câmera nem altera o tamanho da página.
- A sala da assembleia foi protegida contra aumento indevido de largura/altura e scroll externo.
- Adicionado **Notificações** à barra lateral do porteiro.
- Corrigido o ícone de **Visitantes Liberados** para `fa-user-check`.
- Padronizado o tamanho dos ícones da barra lateral.
- O atalho **Visitantes Liberados** do início do porteiro agora abre `visitantes-liberados.html`.
- Visitantes são listados pelo **CEP salvo em `visitors.cep`**, independente de quem fez o cadastro.
- Registros antigos sem CEP tentam ser preenchidos a partir do morador responsável.
- O status de liberação passou a ser salvo no Supabase (`release_status`), sem depender de `localStorage`.
- Ao clicar em um visitante em **Liberação de Visitantes**, abre um popup com os dados salvos.
- Popup mostra **Liberar entrada** quando não liberado e **Revogar entrada** quando liberado.
- Liberação, revogação e recusa geram histórico compartilhado em `visitor_access_logs`.
- **Registro de Entrada e Saída** lê esse histórico e mostra apartamento/bloco do morador responsável.
- As páginas da portaria atualizam automaticamente os dados periodicamente para refletir alterações feitas em outros dispositivos.

## Passo obrigatório no Supabase

Antes de testar, abra **Supabase > SQL Editor > New query** e execute todo o conteúdo de:

`supabase/migrations/010_fix_porter_visitors_access_and_ui.sql`

Apenas colocar o arquivo SQL na pasta do projeto ou fazer deploy no Netlify **não executa a migration no banco remoto**.

Depois faça um novo deploy do projeto no Netlify e atualize o navegador com `Ctrl + Shift + R`.
