# Condomit v0.59.0 — Transcrição automática da assembleia

## Correções

- A transcrição textual não fica mais presa em "Transcrição pausada" quando o microfone continua ativo.
- Reinício automático do reconhecimento de voz quando o navegador encerra uma sessão de transcrição.
- Watchdog periódico para recuperar a transcrição caso o serviço do navegador pare silenciosamente.
- Novas tentativas ao voltar para a aba, recuperar a conexão ou após interação do usuário.
- Tratamento específico para `no-speech`, falha de rede, falta de permissão e indisponibilidade do microfone.
- Resultados intermediários retornados pelo navegador podem ser preservados quando o serviço encerra antes de marcá-los como finais.
- Todos os módulos da sala utilizam a mesma instância de `state.js?v=059`.
- O estado visual agora informa: Ativando transcrição, Transcrevendo, Aguardando fala, Aguardando microfone, Sem permissão ou Navegador sem suporte.
- O registro de atividade de fala do LiveKit continua funcionando como fallback sem inventar o conteúdo falado.

## Banco de dados

Não há migration nova nesta versão. A transcrição continua usando as estruturas das migrations 015 e 037.
