# Condomit v0.61.0 — Transcrição automática robusta

## Correções

- Corrige a rota da Function de transcrição para não ser capturada pelo proxy genérico `/api/*`.
- A sala agora chama diretamente `/.netlify/functions/assembly-transcribe`.
- Se houver fala por cerca de 7 segundos sem nenhum texto do reconhecimento do navegador, a Condomit troca automaticamente para o fallback de servidor, mesmo que o `SpeechRecognition` permaneça aparentemente ativo.
- A Function de transcrição grava o texto diretamente em `assembly_transcripts` usando o backend autenticado, reduzindo falhas de persistência no navegador.
- Erros do provedor de transcrição passam a informar melhor o motivo, incluindo falta de configuração, função não publicada ou erro do provedor.
- Mantida a detecção de atividade oral como fallback de auditoria, sem inventar o conteúdo de falas não transcritas.

## Configuração necessária

Na Netlify, mantenha `OPENAI_API_KEY` ou `TRANSCRIPTION_OPENAI_API_KEY` configurada e faça um novo deploy.

Não há migration nova do Supabase nesta versão.
