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
