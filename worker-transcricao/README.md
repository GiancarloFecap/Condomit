# Worker de transcrição de vídeo — Condomit

O processamento independe de qualquer navegador aberto. A cada 20 segundos, por padrão, um processo **independente da Netlify** procura gravações com `status='concluido'`, baixa o MP4 do bucket privado `condomit-assembly-recordings`, extrai áudio com FFmpeg e executa **faster-whisper** localmente. Persiste no Supabase `assembly_transcripts` (`transcript_source='recording_video_whisper'`) usando as colunas já criadas pelas migrações 061/062. Sem endpoint comercial de IA. Mantém o áudio no arquivo MP4 original; o áudio de trabalho é temporário e apagado ao finalizar.

## Implantação manual (nenhuma alteração foi realizada automaticamente)

1. Garanta que as migrações `061` e `062` já tenham sido aplicadas. Se o Gemini já foi utilizado, é provável que sim.
2. Em uma máquina **confiável, permanentemente ligada**, com Docker Compose e conexão de internet, entre nesta pasta.
3. Copie `.env.example` para `.env`, preenchendo `SUPABASE_URL` e a **service-role key**. Nunca envie `.env` para GitHub, Netlify, navegador, aplicativos desktop ou usuários finais.
4. Execute `docker compose up -d --build`. Confira `docker compose logs -f transcritor`.
5. O worker reprocessa gravações antigas `falhou`/`concluido` originadas no Gemini. Para uma carga inicial grande, pode levar bastante tempo (CPU e duração do vídeo). Para melhor reconhecimento em português, altere `WHISPER_MODEL=medium` em máquina com recursos suficientes. Evite mudar para `medium.en`, que é inglês apenas.
6. Implante **separadamente e quando desejar** a versão web/Netlify deste pacote. As funções de invocação Gemini foram removidas localmente. Até publicar, a versão antiga da Netlify poderá continuar disparando Gemini; o worker não é a mesma coisa que publicar o site.

### Limitações e cuidados

- O servidor precisa permanecer funcionando. Se ficar desligado, as gravações permanecem na fila e serão processadas quando voltar. Não é necessário usuário com a aba aberta.
- Se o vídeo ainda estiver no processo de finalização do LiveKit Egress ou não tiver arquivo MP4 válido, não haverá como transcrever. A etapa de gravação ainda precisa funcionar.
- Este processo **não garante 100% de fidelidade textual**. Não reconstitui áudio inaudível, identifica-se o falante apenas como "Falante não identificado" e preserva `[inaudível]` para trechos inseguros. Não se deve aprovar atas automaticamente com base nisso.
- O servidor manipula documentos sensíveis. Restrinja acesso, disco, logs, backups, privilégios e consentimento/LGPD. O worker não expõe porta pública. A chave administrativa do Supabase tem grandes privilégios.
- Atribuir frases a moradores precisaria de captura separada de áudio por participante e validação de identidade. Este pacote não simula essa atribuição.
- Sem serviço de computação que fique rodando, a transcrição assíncrona não existe por conta própria. **Não há API de IA paga**, mas a máquina que executa o modelo pode ter custo.

### Verificações

`python -m unittest discover -s tests -v`

`docker compose logs --tail 100 transcritor`

No painel do Supabase, confira os campos `assembly_recordings.transcription_status`, `transcription_model`, `transcription_cursor_seconds`, `transcription_error` e a existência de linhas em `assembly_transcripts` com `recording_id` e `transcript_source='recording_video_whisper'`.
