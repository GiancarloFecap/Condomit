# Condomit

**Condomit** é uma plataforma completa de gestão condominial que centraliza, em um único ecossistema, a rotina de **síndicos, moradores e porteiros**. O projeto possui versões Web/PWA, Android/iOS via Capacitor e aplicativo Desktop via Electron.

## Diferenciais

O principal objetivo da Condomit é reduzir a fragmentação da gestão do condomínio. Em vez de depender de várias ferramentas externas, recursos administrativos e de comunicação ficam integrados à mesma conta e ao mesmo condomínio.

- **Assembleias digitais com videoconferência integrada via LiveKit**, sem precisar sair da Condomit ou abrir Zoom/Meet em outra aplicação.
- Gravação automática da assembleia, vinculada à própria Ata.
- Ata com presença, votações, comentários, transcrição e assinatura eletrônica do síndico.
- IA Condomit para dúvidas do condomínio e apoio à criação de comunicados.
- Gestão de moradores e unidades.
- Controle de acesso, visitantes, prestadores, porteiros, encomendas e ocorrências.
- Reservas de áreas comuns e manutenção preventiva.
- Mural, notificações, chats, Achados e Perdidos e Marketplace.
- Gestão avançada para operação e acompanhamento do condomínio.
- Planos Essencial, Pro e Premium, com controle de permissões por assinatura.
- Aplicativo desktop para Windows, macOS e Linux, além da experiência web e mobile.

## Tecnologias principais

- **HTML, CSS e JavaScript** — interface e experiência do usuário.
- **Node.js / Netlify Functions** — backend serverless e integrações privadas.
- **Supabase (PostgreSQL/Auth/Storage/RLS)** — dados, autenticação, arquivos e segurança.
- **LiveKit** — áudio, vídeo e videoconferências das assembleias.
- **Mercado Pago** — checkout e cobrança dos planos.
- **Brevo** — envio de e-mails transacionais.
- **ViaCEP** — apoio ao preenchimento e validação de endereço.
- **Capacitor** — empacotamento mobile Android/iOS.
- **Electron / electron-builder** — aplicativo desktop e instaladores multiplataforma.
- **GitHub Actions** — builds e Releases do aplicativo desktop.

## Estrutura principal

- `inicio.html` — landing page pública.
- `pages/` — telas autenticadas e fluxos de login/cadastro.
- `scripts/` — lógica do frontend e integrações do cliente.
- `styles/` — identidade visual, temas e responsividade.
- `netlify/functions/` — backend serverless.
- `supabase/migrations/` — banco, RPCs e políticas RLS.
- `mobile/` / `android/` — aplicação mobile.
- `desktop/` — aplicação Electron e configuração dos instaladores.
- `.github/workflows/desktop-release.yml` — build Windows/macOS/Linux e GitHub Release.
- `tools/check-project.mjs` — validação estática do projeto.

## Desenvolvimento e segurança

O deploy web de produção utiliza Netlify. Segredos e chaves privadas devem existir somente em variáveis de ambiente. **Nunca** coloque `SUPABASE_SERVICE_ROLE_KEY`, segredos do LiveKit, Mercado Pago ou Brevo em HTML/JS entregue ao navegador.

O projeto utiliza autenticação Supabase, RLS no PostgreSQL, buckets privados para conteúdos sensíveis e funções backend para operações privilegiadas.

## Banco de dados

Execute as migrations de `supabase/migrations/` na ordem numérica. Antes de publicar uma versão nova, confirme se todas as migrations adicionadas à versão foram executadas no projeto Supabase correspondente.

## Web / PWA

`manifest.webmanifest` e `service-worker.js` permitem instalação nos navegadores compatíveis. O site público continua sendo a porta de entrada para login, cadastro, apresentação dos planos e download da versão Desktop.

## Android/iOS

Requer Node.js 22+.

```powershell
npm.cmd install
npm.cmd run mobile:build
npm.cmd run mobile:sync
npx.cmd cap open android
```

No macOS, o mesmo fluxo pode ser usado com o projeto iOS do Capacitor.

## Desktop

A Condomit possui aplicativo Electron para **Windows, macOS e Linux**. O aplicativo utiliza a mesma infraestrutura online da versão Web, preservando Supabase, LiveKit, Mercado Pago e demais integrações.

Os instaladores são gerados pelo workflow do GitHub Actions a partir de tags `v*` e publicados em GitHub Releases. A versão desktop também possui verificação de atualizações pelo próprio aplicativo.

## Verificação antes do deploy

```powershell
npm.cmd run check:project
```

Esse comando valida JavaScript, referências locais de HTML e arquivos obrigatórios do projeto.

## Variáveis de ambiente principais

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_PUBLIC_KEY`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `APP_BASE_URL=https://condomit.netlify.app`
- `CONDOMIT_DESKTOP_GITHUB_REPO=GiancarloFecap/Condomit`

## Páginas públicas

- `/privacidade.html`
- `/excluir-conta.html`
- `/suporte.html`

## Visão do produto

A Condomit busca transformar a gestão condominial em uma experiência contínua: o morador acompanha sua rotina, o porteiro opera acessos e entregas e o síndico administra comunicação, assembleias, finanças e processos **sem trocar de aplicativo a cada tarefa**. A videoconferência nativa nas assembleias é um dos exemplos mais claros desse princípio.
