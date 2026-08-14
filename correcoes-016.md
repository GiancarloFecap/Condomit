# Correções 016 — Condomit

## Antes de publicar

1. Execute `supabase/migrations/016_email_2fa_packages_reservations_notices.sql` no SQL Editor do Supabase.
2. No Netlify, mantenha configuradas:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `APP_BASE_URL`
3. Crie uma variável nova `TWO_FACTOR_SECRET` com um valor aleatório forte.
4. Em Supabase Auth > URL Configuration, permita:
   - `https://condomit.netlify.app/pages/2fa-completo.html`
   - ou a URL equivalente do seu domínio.
5. Faça um novo deploy e use Ctrl+Shift+R.

## Alterações principais

- 2FA por e-mail com confirmação de ativação/desativação por link temporário.
- Código de 6 dígitos enviado após login por senha quando o 2FA estiver ativo.
- Destinatário e e-mail separados no cadastro de encomenda.
- Data e horário previstos de chegada da encomenda.
- Cancelamento de reservas pelo usuário.
- Status Confirmada em verde.
- Bloqueio de horário já reservado e de horários sobrepostos.
- Listagem de todas as reservas do mesmo condomínio.
- Popup rápido de chat no mesmo padrão visual do Controle de acesso.
- Avisos do mural preservados no histórico/feed.
- Chave de servidor removida do fallback hardcoded de `api-proxy.js`.
