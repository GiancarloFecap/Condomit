# Condomit Mobile — Capacitor 8

O projeto já está preparado para usar `www` como bundle web do Android/iOS e `com.condomit.app` como identificador nativo.

## Primeira configuração

1. Instale Node.js 22 ou superior.
2. No diretório do Condomit, execute `npm install`.
3. Gere o bundle web: `npm run mobile:build`.
4. Crie Android: `npx cap add android`.
5. Em um Mac, crie iOS: `npx cap add ios`.
6. Aplique permissões e sincronize: `npm run mobile:sync`.
7. Abra Android Studio com `npm run mobile:android` ou Xcode com `npm run mobile:ios`.

## Atualizações do código

Depois de alterar HTML/CSS/JS no VS Code, execute `npm run mobile:sync`. Isso recompila `www`, copia os arquivos para Android/iOS e reaplica as permissões nativas.

O app instalado pela Play Store/App Store não muda apenas porque um arquivo foi salvo no VS Code. Para usuários finais, gere uma nova versão nativa e publique uma atualização na loja.
