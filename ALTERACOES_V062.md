# Condomit v0.62.0 — Transcrição automática robusta

## Correções

- O fallback de transcrição por servidor não abre/fecha mais o MediaRecorder a cada oscilação do detector de fala.
- O áudio é gravado em segmentos independentes de aproximadamente 12 segundos e somente segmentos com fala detectada são enviados.
- Isso evita WebM/OGG/MP4 curtos ou incompletos que podiam ser rejeitados pelo serviço de transcrição.
- O MIME enviado ao provedor é normalizado (sem parâmetros de codec no Content-Type do arquivo).
- `gpt-4o-mini-transcribe` continua sendo o modelo padrão; em erro de modelo/requisição compatível, o servidor tenta `whisper-1` como fallback.
- Chaves copiadas para a Netlify com aspas externas passam a ser normalizadas.
- O vínculo do usuário com o condomínio no servidor usa comparação de e-mail sem diferenciar maiúsculas/minúsculas.
- A interface mostra diagnósticos específicos para chave inválida, falta de cota, áudio incompatível e outras falhas do provedor.
- Todos os módulos da sala usam `state.js?v=062`, mantendo uma única instância de estado.

## Configuração

Não há migration nova. É necessário manter `OPENAI_API_KEY` (ou `TRANSCRIPTION_OPENAI_API_KEY`) nas variáveis de ambiente da Netlify e realizar novo deploy.
