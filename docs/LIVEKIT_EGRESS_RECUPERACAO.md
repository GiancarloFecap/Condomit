# LiveKit Egress e gravações — v0.76.6

Esta versão altera a finalização segura e inclui recuperação de gravações quando o LiveKit disponibiliza backup. **Não é possível recuperar um MP4 que não foi produzido pelo Egress e não possui cópia de segurança.**

## Aplicação

1. Aplicar `supabase/migrations/070_assembly_egress_recovery.sql` depois da 069, sem executar fragmentos isolados.
2. Publicar a v0.76.6 completa (incluindo as funções agendadas e background na Netlify).
3. Verificar `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `CONDOMIT_S3_ENDPOINT`, `CONDOMIT_S3_REGION`, `CONDOMIT_S3_ACCESS_KEY`, `CONDOMIT_S3_SECRET_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. `CONDOMIT_S3_ACCESS_KEY/SECRET_KEY` são credenciais S3 do Storage, não a chave de API do Supabase.
4. Em LiveKit Cloud, Settings → Webhooks: configurar `https://condomit.com.br/.netlify/functions/assembly-recording-webhook`, com a mesma API key usada no backend. Confirmar entrega dos eventos `egress_ended` e `egress_updated`.
5. **Habilitar Egress Backup Storage com o suporte da LiveKit**; a documentação informa que é necessário um engenheiro LiveKit. Sem esse recurso, uma falha de upload pode resultar em perda definitiva do vídeo.
6. Verificar que a função `assembly-recording-sync` está agendada a cada minuto e que `assembly-recording-recover-background` está disponível. Se um backup existir, o servidor tentará recuperá-lo no Supabase Storage sem transmitir URLs assinadas ao navegador.

## Gravações 152 e 153

Em 12/11/2026, os registros estavam como `falhou` e não havia arquivos em `storage.objects` nos caminhos esperados. Isso não comprova corrupção do MP4; o LiveKit precisa ser consultado. No painel LiveKit, localizar os Egress IDs dessas assembleias pela hora aproximada, consultar **status, errorCode, error, backupStorageUsed** e a seção Destinations. Se houver backup, transferi-lo antes de 7 dias (documentação oficial), ou publicar esta atualização para tentar a restauração automatizada. Para falhas de gravação, conferir o Egress no painel antes de reprocessar a transcrição.

## Fluxo após atualização

- A sala LiveKit é criada no servidor com `departureTimeout` de 180 segundos, para tolerar quedas e permitir a reconexão do síndico. A gravação é feita no Egress, não no navegador.
- Ao solicitar fim da assembleia, o servidor pede o encerramento do Egress, mas mantém a assembleia pendente enquanto o arquivo não for confirmado.
- A tarefa `assembly-recording-sync` consulta o Egress e verifica o arquivo. Quando termina (ou há falha terminal), encerra a assembleia solicitada.
- O erro e o código de falha ficam armazenados em `assembly_egress_diagnostics`, com acesso **somente ao service_role**.
- Se o Egress informar backup, a função background baixa o vídeo por URL assinada e o reenvia em blocos TUS. Uma gravação só passa a `concluido` depois de o arquivo ser encontrado no Storage.
- Uma falha de upload sem backup continua aparecendo como falha e exige correção das credenciais S3/LiveKit. O sistema não inventa um MP4 nem considera sucesso quando ele não existe.

## Como testar

1. Iniciar uma assembleia com duas pessoas, conferir o estado `EGRESS_ACTIVE` no LiveKit, falar e desconectar abruptamente o síndico. A sala deve permitir reconexão e não perder a gravação quando outros participantes permanecem.
2. Reentrar e finalizar pelo síndico. Confirmar que o pedido informa finalização pendente e que a tarefa do servidor conclui o encerramento após o MP4 ficar disponível.
3. Conferir o tamanho do objeto no Storage e se o vídeo abre completamente (incluindo o final). Não basta um tamanho > 0 para comprovar integridade audiovisual.
4. Examinar os logs das funções `assembly-recording-webhook`, `assembly-recording-sync`, `assembly-recording-recover-background` e o LiveKit Dashboard.
5. Executar `node --test tests/*.test.cjs` e `npm run check:project` localmente.

## Limitações

- A recuperação por backup depende de configuração explícita da LiveKit Cloud e de existir uma cópia recuperável; não há garantia de resgate de gravações previamente perdidas.
- Os testes automatizados usam mocks; a integração com LiveKit e S3 deve ser validada no ambiente publicado.
- A transferência TUS é limitada pela duração da função background na Netlify (até 15 minutos); arquivos muito grandes podem exigir recuperação manual ou worker dedicado.

Referências:
- https://livekit.com/blog/troubleshooting-egress
- https://kb.livekit.io/articles/6816370598-backup-egress-recordings
- https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/
- https://docs.netlify.com/build/functions/background-functions/
