# Condomit Desktop

A partir da v0.71.5, o botão de download do site aponta para instaladores desktop reais, e não para a instalação PWA do navegador.

## Sistemas suportados

- Windows 10/11 64 bits: instalador `.exe` (NSIS).
- macOS Intel e Apple Silicon: pacote universal `.dmg` e `.zip`.
- Linux 64 bits: `.AppImage` e `.deb`.

Não existe um único executável que rode em todos os sistemas operacionais. O projeto gera um instalador apropriado para cada plataforma.

## Como funciona

O Electron abre a versão HTTPS da Condomit (`https://condomit.netlify.app/inicio.html`) em uma janela desktop segura. Isso mantém Netlify Functions, Supabase, LiveKit, Mercado Pago e demais serviços funcionando no mesmo domínio da versão web, sem duplicar o backend.

`desktop/main.cjs` é o processo principal do Electron. Ele cria a janela, restringe navegação a Condomit, abre links externos no navegador padrão e concede câmera/microfone/compartilhamento de tela apenas ao domínio oficial.

`desktop/preload.cjs` expõe somente informações não sensíveis da plataforma para a página. `nodeIntegration` fica desativado, `contextIsolation` e `sandbox` ficam ativados.

## Gerar no computador

1. Instale Node.js 22 ou superior.
2. Na raiz do projeto, execute `npm install`.
3. Use um dos comandos:

```bash
npm run desktop:dev
npm run desktop:dist
```

O `electron-builder` gera os instaladores em `desktop/dist`.

## Publicação para Windows, macOS e Linux

O arquivo `.github/workflows/desktop-release.yml` cria os três instaladores automaticamente.

1. Publique este projeto em um repositório GitHub.
2. No Netlify, a variável `CONDOMIT_DESKTOP_GITHUB_REPO` pode ser definida como `GiancarloFecap/Condomit`. A função também usa esse repositório como fallback.
3. Faça push de uma tag, por exemplo:

```bash
git tag v0.71.5
git push origin v0.71.5
```

O GitHub Actions executará três builds e publicará os arquivos em **GitHub Releases**. A página `pages/download-desktop.html` consulta a função Netlify `desktop-downloads` e mostra os links da release mais recente.

### Assinatura de código

Sem assinatura, Windows SmartScreen ou macOS Gatekeeper podem mostrar um aviso de editor não verificado. Para distribuição pública profissional, configure certificados de assinatura no GitHub Actions. Isso não altera o código da Condomit; apenas autentica o instalador perante o sistema operacional.
