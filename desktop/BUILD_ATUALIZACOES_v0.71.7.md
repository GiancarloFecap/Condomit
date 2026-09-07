# Atualizações do Condomit Desktop — v0.71.7

Esta versão adiciona verificação de atualizações dentro do aplicativo desktop.

O Electron consulta a Release estável mais recente em `GiancarloFecap/Condomit`, compara com `app.getVersion()` e disponibiliza o instalador compatível com Windows, macOS ou Linux.

No navegador, o controle de atualização desktop permanece oculto. Dentro do Electron, os links de download da Condomit e o instalador PWA são ocultados para evitar oferecer uma segunda instalação do aplicativo.
