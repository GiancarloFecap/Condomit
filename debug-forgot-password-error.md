# Debug Session: forgot-password-error

Status: OPEN

## Sintoma
- Ao enviar o email na página `esqueci-senha`, a interface mostra `Ocorreu um erro ao solicitar a redefinição.`

## Hipóteses iniciais
- H1. A rota `/esqueceu-senha` não está sendo encaminhada corretamente no ambiente atual e retorna 404/HTML em vez de JSON.
- H2. O backend da rota `/esqueceu-senha` lança exceção antes de responder, por erro de importação/configuração do Brevo.
- H3. A função Netlify `api-proxy` não reconhece `/esqueceu-senha` em todos os caminhos de execução e cai no branch de endpoint não encontrado.
- H4. A consulta do usuário ou a construção do link de reset falha para alguns emails e retorna 500 no backend.
- H5. O frontend recebe uma resposta não JSON ou vazia e converte a falha em mensagem genérica.

## Plano
- Instrumentar frontend e backend para capturar status HTTP, payload da resposta e caminho efetivamente chamado.
- Reproduzir a falha com logs.
- Confirmar a hipótese suportada pelos logs.
- Aplicar correção mínima.
- Verificar novamente com evidência pós-correção.

## Evidências
- `.dbg/trae-debug-log-forgot-password-error.ndjson:2-4` mostra que o frontend iniciou a requisição e recebeu `status: 404` em `https://condomit.netlify.app/esqueceu-senha`.
- Não houve logs dos pontos `B`, `C` ou `D`, então a chamada não chegou nem ao servidor local nem ao proxy do Netlify.

## Status das hipóteses
- H1. Confirmada. A rota `/esqueceu-senha` respondeu `404` no ambiente atual.
- H2. Rejeitada nesta reprodução. Não há evidência de falha do Brevo porque o backend nem foi atingido.
- H3. Inconclusiva. O proxy não foi chamado nesta reprodução.
- H4. Rejeitada nesta reprodução. A consulta de usuário não chegou a executar.
- H5. Confirmada parcialmente. O frontend recebeu uma resposta vazia após `404` e exibiu a mensagem genérica.

## Raiz confirmada
- O ambiente atual ainda não resolve `/esqueceu-senha`; por isso a requisição falha antes de qualquer lógica de recuperação.

## Evidência adicional pós-fix
- A leitura remota de `https://condomit.netlify.app/scripts/esqueci-senha.js` mostrou que a produção ainda está servindo a versão antiga do script, sem o fallback para `/api/forgot-password`.
- Por isso os logs `post-fix` não apareceram: o navegador executou JavaScript antigo, não o arquivo local já corrigido.

## Conclusão atual
- A correção local existe, mas a produção não está com o script atualizado.
- É necessário publicar a nova versão para que o fallback e a rota nova entrem em vigor no ambiente `condomit.netlify.app`.

## Nova evidência
- `.dbg/trae-debug-log-forgot-password-error.ndjson:15-17` mostra que o fallback para `/api/forgot-password` foi executado e a produção respondeu `502`.
- Isso confirma que a falha atual está dentro do envio do Brevo no backend publicado, não mais na página.

## Ajuste aplicado
- `scripts/server.js` e `netlify/functions/api-proxy.js` agora usam o envio com Brevo no formato pedido, com `sender.email` fixo em `contato.condomit@gmail.com`.
- Os handlers passaram a devolver a mensagem real do Brevo quando o envio falhar, em vez de esconder tudo atrás de um erro genérico.

## Próxima verificação
- Após novo deploy, testar novamente a página `esqueci-senha`.
- Se ainda falhar, a mensagem exibida deve revelar a causa exata do Brevo para a próxima iteração.
