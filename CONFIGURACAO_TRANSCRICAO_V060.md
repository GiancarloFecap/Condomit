# Condomit v0.60.0 — Transcrição robusta de assembleias

## O que mudou

A Condomit continua usando a transcrição nativa do navegador quando ela funciona. Se o navegador não fornecer texto, apresentar erros de rede ou encerrar repetidamente o reconhecimento, a sala passa automaticamente para um fallback de transcrição no servidor.

Nesse fallback, a Condomit grava pequenos trechos **somente enquanto o participante local está falando**, usa a faixa de microfone já publicada no LiveKit e envia o trecho para a Function `assembly-transcribe`. O texto retornado é salvo pelo fluxo já existente de `assembly_transcripts` e passa a compor a ata.

Isso evita o estado permanente “Reconectando transcrição...” observado em navegadores em que `SpeechRecognition` existe, mas o serviço de reconhecimento não funciona de forma estável.

## Configuração necessária na Netlify

Para habilitar o fallback de servidor, adicione uma variável de ambiente:

- `OPENAI_API_KEY` — chave da OpenAI usada exclusivamente no servidor; **não coloque a chave no JavaScript do navegador**.

Opcionalmente, você pode usar:

- `TRANSCRIPTION_OPENAI_API_KEY` — se quiser manter uma chave separada apenas para transcrição;
- `OPENAI_TRANSCRIPTION_MODEL` — modelo de transcrição. Se não for definido, o projeto usa `gpt-4o-mini-transcribe`.

Depois de salvar as variáveis, faça um novo deploy da Netlify.

## Privacidade

O fallback só é acionado quando a transcrição nativa do navegador falha. Quando ativo, pequenos trechos da fala do próprio participante são enviados ao provedor de transcrição pelo servidor da Condomit. A chave da API nunca é exposta ao navegador.

## Banco de dados

Não há migration nova nesta versão. O texto continua sendo armazenado pelas estruturas de transcrição já existentes nas migrations anteriores.
