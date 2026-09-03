# Condomit v0.63.0

## Transcrição da assembleia

- Substitui o `SpeechRecognition` do navegador como mecanismo principal.
- Remove a dependência de `MediaRecorder`/WebM para a transcrição automática.
- Captura PCM diretamente da faixa de microfone da chamada com Web Audio.
- Converte localmente para WAV mono PCM16 em 16 kHz, em blocos de cerca de 10 segundos.
- Usa detecção de energia do próprio áudio + estado de fala do LiveKit apenas para evitar enviar silêncio; a transcrição não depende mais do detector para começar a gravar.
- Envia os blocos WAV para `assembly-transcribe` e salva o texto na ata.
- A Function não exige mais `SUPABASE_SERVICE_ROLE_KEY`: valida a sessão com a chave pública do Supabase e grava através de `condomit_append_assembly_transcript`, que já aplica as regras de pertencimento ao condomínio.
- Mantém `OPENAI_API_KEY`/`TRANSCRIPTION_OPENAI_API_KEY` apenas no servidor.
- Mantém `gpt-4o-mini-transcribe` como modelo padrão, com `whisper-1` como fallback em erros compatíveis de modelo/requisição.
- Mensagens de erro da sala distinguem chave inválida, falta de cota, sessão expirada, erro de áudio e erro de persistência.
- Todos os módulos da sala foram alinhados para `state.js?v=063`.

Não há nova migration do Supabase nesta versão.
