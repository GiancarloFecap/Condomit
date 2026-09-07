# Build desktop corrigido — Condomit v0.71.5

A v0.71.5 corrige a falha simultânea dos runners Windows, macOS e Linux.

## Causa
O workflow usava `npm ci`, mas o `package-lock.json` histórico não continha as dependências desktop adicionadas ao `package.json` (`electron` e `electron-builder`). O `npm ci` exige sincronismo exato e encerrava o job antes do build.

## Correção
- O workflow usa `npm install --include=dev --no-audit --no-fund`, que reconcilia o lock com o `package.json` no runner.
- `actions/checkout` e `actions/setup-node` foram atualizados para v5.
- Foi removido `GH_TOKEN` vazio do job de build.
- O `electron-builder` continua com `--publish never`; a publicação ocorre somente no job `release` com o token automático do GitHub.
- Foi adicionada uma etapa que confirma as versões do Electron e electron-builder antes de compilar.

## Publicar
```bash
git add .
git commit -m "Condomit v0.71.5 - corrige workflow desktop"
git push origin main
git tag v0.71.5
git push origin v0.71.5
```
