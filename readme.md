# Condomit

Plataforma de gestão condominial para síndicos, moradores e porteiros, com versão Web/PWA e preparação para Android/iOS via Capacitor.

## Estrutura principal

- `inicio.html` — landing page pública.
- `pages/` — telas autenticadas e fluxos de cadastro/login.
- `scripts/` — lógica de frontend e cliente Supabase.
- `styles/` — estilos e responsividade.
- `netlify/functions/` — backend serverless e integrações privadas.
- `supabase/migrations/` — migrations SQL do banco e RLS.
- `mobile/` — scripts para preparar Android/iOS.
- `tools/check-project.mjs` — validação estática do projeto.

## Desenvolvimento web

O deploy de produção usa Netlify. As credenciais privadas devem existir somente nas Environment Variables do Netlify. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, chaves privadas de LiveKit, Mercado Pago ou Brevo em HTML/JS do navegador.

## Banco de dados

Execute as migrations na ordem numérica. Para esta versão, as migrations mais recentes são:

1. `024_advanced_management_suite.sql`
2. `025_marketplace_delete_and_ui_polish.sql`
3. `026_secure_condominium_access.sql`

A migration 026 substitui a antiga regra insegura em que o nome do condomínio funcionava como senha. O síndico passa a gerar códigos temporários em **Configurações → Condomínio → Gerar código de acesso**.

## Android/iOS

Requer Node.js 22+.

```powershell
npm.cmd install
npm.cmd run mobile:build
npx.cmd cap add android   # apenas na primeira vez
npm.cmd run mobile:sync
npx.cmd cap open android
```

Em macOS, para iOS:

```bash
npm install
npx cap add ios           # apenas na primeira vez
npm run mobile:sync
npx cap open ios
```

Depois de alterar HTML/CSS/JS, use `npm run mobile:sync` antes de testar a nova versão nativa.

## PWA

`manifest.webmanifest` e `service-worker.js` habilitam instalação em navegadores compatíveis. O botão **Instalar Condomit** aparece na landing page quando o navegador disponibiliza o prompt de instalação.

## Páginas públicas

- `/privacidade.html`
- `/excluir-conta.html`
- `/suporte.html`

Essas páginas podem ser usadas como URLs públicas em cadastros de loja e suporte.

## Segurança

- Ações sensíveis de usuário no `api-proxy` exigem token Supabase.
- PATCH de usuário possui allowlist de campos e não permite alterar `user_type`.
- Exclusão de conta via API exige que o e-mail autenticado seja o próprio e-mail solicitado.
- Exclusão de condomínio exige síndico autenticado vinculado ao condomínio.
- Códigos de acesso do condomínio são armazenados somente como hash.
- O deploy adiciona CSP, HSTS, `X-Content-Type-Options` e `X-Frame-Options`.

## Verificação antes do deploy

```powershell
npm.cmd run check:project
```

O script valida sintaxe dos JavaScripts, referências locais de HTML, arquivos obrigatórios e resquícios do servidor de debug local.

## Variáveis de ambiente

Dependendo dos recursos usados:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_PUBLIC_KEY`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_RECIPIENT_EMAIL` ou `CONDOMIT_SUPPORT_EMAIL`
- `APP_BASE_URL=https://condomit.netlify.app`

## Observação sobre `package-lock.json`

Ao receber esta versão em uma máquina onde as dependências mobile ainda não foram instaladas, execute `npm install`. O npm atualizará o lockfile de acordo com o `package.json`; depois disso, mantenha o `package-lock.json` atualizado no repositório.
