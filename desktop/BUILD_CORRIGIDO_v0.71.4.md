# Build desktop corrigido — v0.71.4

Esta versão corrige os erros do workflow v0.71.3:

- `electron-builder` usa `--publish never`, portanto não tenta publicar sozinho e não exige `GH_TOKEN` durante os builds.
- O job `release` do GitHub Actions publica os artefatos usando `secrets.GITHUB_TOKEN`.
- O pacote Linux `.deb` possui maintainer configurado.
- O Windows gera um único instalador NSIS com nome exclusivo.

## Publicar

Depois de substituir os arquivos no repositório:

```bash
git add .
git commit -m "Condomit v0.71.4 - corrige build desktop"
git push origin main
git tag v0.71.4
git push origin v0.71.4
```

Depois acompanhe **Actions > Condomit Desktop Release**. Quando os três builds terminarem, o job `release` criará a Release `v0.71.4`.
