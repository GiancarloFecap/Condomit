# Configuração do domínio condomit.com.br

Este projeto está preparado para usar `https://condomit.com.br` como URL oficial de produção.

## 1. Netlify

1. Abra o projeto Condomit no Netlify.
2. Vá em **Domain management > Production domains > Add a domain > Add a domain you already own**.
3. Adicione `condomit.com.br`.
4. Defina `condomit.com.br` como domínio primário.
5. Mantenha `www.condomit.com.br` como alias e redirecione-o para o domínio primário.
6. Em **Site configuration > Environment variables**, defina:
   - `APP_BASE_URL=https://condomit.com.br`
7. Faça um novo deploy depois de alterar a variável.

`CONDOMIT_DESKTOP_URL` não precisa ser configurada no Netlify: ela é uma variável opcional do processo Electron e a v0.72.5 já usa `https://condomit.com.br/inicio.html` como padrão no código.

### DNS

Você pode usar Netlify DNS ou manter o DNS no registrador. Se usar Netlify DNS, copie os nameservers exibidos pelo Netlify e troque os nameservers no registrador do domínio. Se mantiver DNS externo, use os registros que o Netlify mostrar em **Pending DNS verification** para o apex e para `www`.

## 2. Supabase Auth

Em **Authentication > URL Configuration**:

- **Site URL:** `https://condomit.com.br`
- Adicione como Redirect URLs de produção:
  - `https://condomit.com.br/pages/email-confirmado.html`
  - `https://condomit.com.br/pages/entrar.html`
  - `https://condomit.com.br/pages/redefinir-senha.html`

Durante a transição, mantenha temporariamente os redirects antigos de `https://condomit.netlify.app/...` para que links de e-mail já enviados não parem de funcionar. Depois que esses links antigos expirarem, eles podem ser removidos.

## 3. Mercado Pago

O backend da Condomit agora cria novas preferências usando `APP_BASE_URL`, portanto novas `back_urls` e `notification_url` passam a usar `https://condomit.com.br` quando a variável do Netlify estiver configurada.

Se existir uma URL de Webhook cadastrada manualmente no painel do Mercado Pago, altere-a para:

`https://condomit.com.br/api/mercadopago/webhook`

Confirme também que a chave secreta usada para validar Webhooks corresponde à configuração ativa da aplicação.

## 4. Brevo / e-mail

Para o funcionamento dos links dos e-mails, basta `APP_BASE_URL` estar configurado no Netlify. Se você quiser enviar e-mails usando um remetente `@condomit.com.br`, crie o endereço no seu provedor de e-mail e autentique o domínio/remetente no Brevo adicionando exatamente os registros DNS exibidos no painel do Brevo (normalmente código Brevo, DKIM e DMARC). Não invente registros: use os valores fornecidos para a sua conta.

## 5. LiveKit

Nenhuma mudança de URL do LiveKit é necessária apenas por trocar o domínio do site. Continue usando as mesmas variáveis `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`. Se a sua conta/proxy LiveKit tiver uma allowlist de origens configurada externamente, inclua `https://condomit.com.br` e, durante a transição, mantenha a origem antiga até concluir os testes.

## 6. GitHub / Desktop

O Electron agora abre `https://condomit.com.br/inicio.html` por padrão. Gere uma nova release Desktop depois que o domínio estiver respondendo corretamente por HTTPS.

Tag sugerida para esta versão:

```bash
git tag v0.72.5
git push origin v0.72.5
```

## 7. Testes após ativar o domínio

Teste, nesta ordem:

1. `https://condomit.com.br` abre com HTTPS válido.
2. `https://www.condomit.com.br` redireciona para o domínio principal.
3. Cadastro e confirmação de e-mail.
4. Login e recuperação de senha.
5. Checkout do Mercado Pago e retorno aprovado/pendente/falha.
6. Recebimento de Webhook do Mercado Pago.
7. E-mails 2FA/recuperação enviados pelo Brevo.
8. Entrada em assembleia e videoconferência LiveKit.
9. Android/iOS, pois o backend nativo agora aponta para `https://condomit.com.br`.
10. Condomit Desktop, que agora abre o domínio próprio.

## 8. Transição do endereço antigo

Durante a transição, **não redirecione ainda `condomit.netlify.app` por 301**. Versões Desktop anteriores à v0.72.5 confiam no domínio antigo e podem bloquear uma mudança automática de origem. A v0.72.5 já abre `condomit.com.br` diretamente e aceita temporariamente ambas as origens. Depois que as versões antigas do Desktop forem substituídas, você pode adicionar um redirect do endereço `.netlify.app` para o domínio próprio.
