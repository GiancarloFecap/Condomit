# Notificações do dispositivo — Condomit 0.53.0

A v0.53.0 inclui Web Push para PWA/navegadores compatíveis. As notificações continuam sendo salvas na Central de Notificações mesmo quando a categoria está desligada nas Configurações.

## 1. Supabase
Execute `supabase/migrations/035_signature_notifications_preferences_push_sessions.sql`.

## 2. Dependência
Depois de extrair o projeto, execute:

```bash
npm install
```

A dependência `web-push` está declarada no `package.json`.

## 3. Gerar VAPID
Com as dependências instaladas, execute:

```bash
npx web-push generate-vapid-keys
```

Não coloque a chave privada em JavaScript público.

## 4. Variáveis da Netlify
Cadastre nas variáveis de ambiente da Netlify:

- `VAPID_PUBLIC_KEY` — chave pública gerada.
- `VAPID_PRIVATE_KEY` — chave privada gerada.
- `VAPID_SUBJECT` — por exemplo `mailto:contato.condomit@gmail.com`.

As variáveis já existentes `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` continuam sendo usadas pela função programada.

## 5. Comportamento
- Com permissão do navegador e VAPID configurado: notificações podem aparecer no sistema operacional, inclusive com o PWA fora de primeiro plano, conforme suporte do navegador/SO.
- Sem VAPID configurado: a aplicação mantém um fallback enquanto a Condomit estiver aberta no navegador.
- iPhone/iPad: Web Push requer suporte do iOS e, normalmente, o site instalado na Tela de Início.
- O aplicativo Android Capacitor nativo ainda depende de configuração própria de FCM/`google-services.json` para push nativo fora do Web/PWA.
