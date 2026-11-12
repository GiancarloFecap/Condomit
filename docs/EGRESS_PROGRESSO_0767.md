# Gravações — v0.76.7

- A assembleia só passa para “encerrada” quando o registro estiver concluído e o MP4 existir no Storage com o tamanho correto. A regra também é aplicada no SQL (migração 071).
- O clique de finalização é idempotente; novas tentativas são bloqueadas enquanto há processamento.
- A barra de progresso informa o estágio da gravação. No upload nativo Egress/S3 não existe percentual de bytes no `EgressInfo`; não exibimos um percentual inventado nem uma estimativa de tempo restante.
- Durante a recuperação TUS de um backup, mostramos o progresso real por bytes, com confirmação de 100% somente quando o objeto existe e foi conferido.
- Para evitar o erro 413 em UploadPart, o endpoint `CONDOMIT_S3_ENDPOINT` do Supabase é normalizado automaticamente para o hostname direto `https://<projeto>.storage.supabase.co/storage/v1/s3`, mesmo se a variável tiver sido cadastrada com o hostname de API `<projeto>.supabase.co`.
- A conversão para o hostname direto não garante correção de erros 413 por limites particulares do serviço/conta; se persistirem, consultar o suporte Supabase e o painel LiveKit com o ID Egress ou configurar armazenamento S3 alternativo compatível.
- Não executar migração ou alterar Netlify/Supabase/GitHub automaticamente. Aplicar a migração 071 e fazer novo deploy.
