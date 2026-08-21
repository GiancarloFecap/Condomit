# Condomit 030 — Android, iOS e publicação

## 1. O que já foi configurado no projeto

- Capacitor 8 declarado no `package.json`.
- `capacitor.config.ts` com `appId` `com.condomit.app`, nome `Condomit` e `webDir` `www`.
- Build mobile automático em `mobile/build-web.mjs`.
- Configuração automática das permissões de câmera e microfone em `mobile/configure-native.mjs`.
- Roteamento das chamadas `/api/*` e `/.netlify/functions/*` para `https://condomit.netlify.app` quando o código estiver rodando dentro do aplicativo nativo.
- Scripts npm para build, sync, Android e iOS.
- `www/index.html` e `www/inicio.html` gerados a partir da versão web.
- Service Worker desabilitado no runtime nativo para evitar conflito com o bundle local do Capacitor.

## 2. Requisitos

### Windows / Android

- Node.js 22 ou superior.
- Android Studio compatível com Capacitor 8.
- Android SDK 36 recomendado para publicação atual.

### macOS / iOS

- Node.js 22 ou superior.
- Xcode 26 ou superior.
- Xcode Command Line Tools.
- Conta Apple Developer adequada para distribuição.

## 3. Primeira instalação no projeto

Abra o terminal do VS Code na pasta raiz do Condomit.

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
npm install @capacitor/android @capacitor/ios
```

Como esses pacotes já estão declarados no `package.json` da versão 030, também é suficiente executar:

```bash
npm install
```

O projeto já possui `capacitor.config.ts`, portanto **não execute `npx cap init` novamente** nesta versão. Se estiver reproduzindo a configuração do zero em outro projeto, aí sim use:

```bash
npx cap init
```

## 4. Gerar o bundle mobile

```bash
npm run mobile:build
```

Isso recria a pasta `www` com HTML, CSS, JS e assets do Condomit.

## 5. Criar Android

Execute uma única vez:

```bash
npx cap add android
```

Depois:

```bash
npm run mobile:sync
npm run mobile:android
```

O último comando abre o Android Studio.

No Windows também existe:

```powershell
powershell -ExecutionPolicy Bypass -File mobile/setup-windows.ps1
```

## 6. Criar iOS

O projeto iOS deve ser criado e compilado em um Mac:

```bash
npx cap add ios
npm run mobile:sync
npm run mobile:ios
```

Se necessário, instale as ferramentas do Xcode:

```bash
xcode-select --install
```

No Mac, também é possível executar:

```bash
bash mobile/setup-macos.sh
```

## 7. Testar no Android

1. Abra `npm run mobile:android`.
2. No Android Studio, aguarde o Gradle concluir.
3. Selecione um emulador ou celular conectado por USB.
4. Clique em **Run**.
5. Teste login, câmera, microfone, assembleia, chats, upload de foto e notificações internas.

A câmera traseira deve ser testada em aparelho físico.

## 8. Testar no iPhone

1. No Mac, execute `npm run mobile:ios`.
2. No Xcode, selecione o target `App`.
3. Em **Signing & Capabilities**, selecione a equipe Apple Developer.
4. Selecione um iPhone/simulador.
5. Pressione **Run**.

## 9. Quando alterar o projeto no VS Code

Depois de alterar HTML, CSS ou JavaScript, execute:

```bash
npm run mobile:sync
```

Esse comando:

1. recria `www`;
2. executa `npx cap sync`;
3. copia a versão web para Android/iOS;
4. reaplica permissões nativas de câmera/microfone.

Depois, execute novamente o app pelo Android Studio/Xcode.

### Isso atualiza automaticamente o aplicativo instalado pela loja?

**Não.** Salvar arquivos no VS Code não atualiza a versão já instalada por usuários da Play Store/App Store.

Para uma atualização pública:

1. altere o projeto no VS Code;
2. execute `npm run mobile:sync`;
3. aumente o número da versão/build nativo;
4. gere um novo AAB no Android ou Archive no iOS;
5. envie uma nova versão à loja;
6. após aprovação/publicação, os usuários recebem a atualização conforme as configurações da loja.

Mudanças apenas no banco de dados ou conteúdo remoto podem aparecer sem atualizar o binário, desde que o código instalado já saiba lidar com elas.

## 10. Publicar na Google Play

### Conta

Crie/tenha acesso a uma conta de desenvolvedor do Google Play. O titular precisa atender aos requisitos legais da plataforma. Contas pessoais novas podem ter etapa obrigatória de teste fechado antes de obter acesso à produção.

### Gerar AAB

No Android Studio:

1. abra o projeto Android;
2. confira `versionCode` e `versionName`;
3. use **Build > Generate Signed App Bundle / APK**;
4. escolha **Android App Bundle**;
5. crie ou selecione sua upload key/keystore;
6. gere o arquivo `.aab` de release.

Não publique nem envie a outras pessoas os arquivos `.jks`, `.keystore` ou as senhas de assinatura.

### Play Console

1. Crie o aplicativo.
2. Configure nome, descrição, ícone, screenshots e categoria.
3. Preencha Política de Privacidade, Segurança dos Dados, Público-alvo e Classificação de Conteúdo.
4. Configure Play App Signing.
5. Faça upload do `.aab` em um track de teste.
6. Faça testes internos/fechados.
7. Quando elegível, crie a release de produção.
8. Envie para análise e publique.

Para novas submissões em 2026, use Android 16/API 36. Capacitor 8 foi escolhido justamente porque sua linha Android 8.x trabalha com target SDK 36.

## 11. Publicar na App Store

### Conta e ambiente

- É necessário macOS para o fluxo normal de build do iOS.
- Use Xcode 26+ e SDK iOS 26+ para submissões atuais.
- O titular da conta precisa cumprir os requisitos legais do Apple Developer Program.

### Xcode

1. Execute `npm run mobile:ios`.
2. Abra **Signing & Capabilities**.
3. Selecione a equipe Apple Developer.
4. Confirme o Bundle Identifier `com.condomit.app`.
5. Defina Version e Build.
6. Teste em iPhone real.
7. Selecione **Any iOS Device (arm64)** ou destino equivalente de distribuição.
8. Use **Product > Archive**.
9. No Organizer, escolha **Distribute App > App Store Connect**.
10. Faça o upload.

### App Store Connect

1. Crie o registro do app com o mesmo Bundle ID.
2. Preencha nome, categoria, descrição, palavras-chave e suporte.
3. Envie screenshots.
4. Preencha App Privacy e classificação etária.
5. Escolha o build enviado pelo Xcode.
6. Use TestFlight antes da produção.
7. Preencha as informações de revisão, inclusive uma conta de teste quando o login for necessário.
8. Envie para App Review.

## 12. Observações importantes para aprovação

O Condomit não deve parecer apenas um site encaixado em um WebView. Para fortalecer a experiência nativa, mantenha recursos como câmera/microfone em assembleias, upload de fotos, instalação, comportamento responsivo e, futuramente, push notifications, biometria e deep links.

## 13. Identificador do app

A versão 030 usa:

```text
com.condomit.app
```

Defina o identificador definitivo **antes da primeira publicação**. Depois que um aplicativo é publicado, o identificador de pacote/bundle não deve ser tratado como um campo comum de renomeação.
