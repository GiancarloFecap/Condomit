# Condomit V0.72.5 — atualização do dashboard, menu, notificações e idiomas

## Alterações
- Menu lateral agora tem grupos expansíveis (acordeão): inicialmente fechados, com apenas um grupo aberto por vez. Seções e permissões são preservadas por perfil/plano.
- Novo dashboard do síndico inspirado na referência enviada, mantendo topbar/sidebar do sistema: quatro cartões de indicadores reais, gráfico de linha selecionável (reservas, comunicados, ocorrências), seleção de 6/12 meses, tabela de moradores recentes e gráfico de distribuição de atividades.
- Gráficos/dados vêm das consultas existentes ao Supabase, sem valores de exemplo no site publicado. Quando há falha parcial de consulta, a interface informa que há dados indisponíveis.
- Popup de notificações arrastável segurando no cabeçalho, sem arrastar pelo botão de fechar. Posição é mantida na sessão; movimento limitado aos limites da janela.
- Idioma: Padrão (dispositivo), Português e Inglês. Quando não há escolha explícita armazenada, lê o idioma do dispositivo. A escolha do usuário é mantida no `localStorage` entre visitas (por navegador/dispositivo).
- Ao entrar por `condomit.netlify.app`, redireciona via regra 301 na primeira linha do arquivo `_redirects` para `https://condomit.com.br`, preservando o caminho. A Netlify não desativa tecnicamente o subdomínio padrão ao adicionar o personalizado.

## Publicação
1. Publique o conteúdo deste ZIP na versão web (Netlify), incluindo o arquivo `_redirects` na raiz da publicação.
2. Verifique se `https://condomit.netlify.app/pages/entrar.html` redireciona para `https://condomit.com.br/pages/entrar.html`.
3. Atualize, quando necessário, o `Site URL` e os `Redirect URLs` do Supabase Auth para `https://condomit.com.br`, e eventuais provedores OAuth ou callbacks integrados.
4. Teste login, a sidebar e o carregamento de dados com um usuário real no site publicado. A validação estrutural local não substitui os testes com banco e deploy ativos.

**Banco de dados:** estas mudanças não exigem uma nova migration.
