# Build desktop corrigido — Condomit v0.71.6

A v0.71.6 corrige especificamente a falha do runner Linux na etapa de verificação do Electron.

## Causa

`npx electron --version` executava o binário Chromium do Electron. No Ubuntu do GitHub Actions o `chrome-sandbox` não possui o modo SUID esperado e o Electron abortava com SIGTRAP antes do build.

## Correção

O workflow agora valida as versões sem executar o aplicativo:

```bash
node -e "console.log('Electron:', require('electron/package.json').version)"
node -e "console.log('electron-builder:', require('electron-builder/package.json').version)"
```

Depois disso o job segue normalmente para `npm run desktop:dist:linux`.

## Publicar

```bash
git tag v0.71.6
git push origin v0.71.6
```
