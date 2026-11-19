# Condomit v0.77.4 — conferência de conteúdo, novas ATAs e assinatura

## Alterações

- **Geração de nova ATA:** o síndico pode selecionar **Gerar nova ata** quando a assembleia está encerrada, possui gravação/transcrição Deepgram concluída e o documento não está aprovado/assinado. É uma nova chamada ao Claude, portanto consome créditos. Não há duas solicitações simultâneas e existe proteção contra reenvios em menos de 30 segundos.
- **Conferência de conteúdo:** cada bloco redigido pelo Claude é comparado ao texto original Deepgram. A rotina verifica presença de autores, valores monetários e percentuais, inclusive grafias numéricas equivalentes (R$ 25.000,00 e 25 mil reais). Quando omite dados, o Claude recebe uma segunda tentativa corretiva; se a omissão persistir, a geração falha de forma visível. A edição manual é comparada novamente antes da aprovação.
- **Identificação dos falantes:** a migração 075 mantém a associação da migração 074 e permite associar a voz restante a um único participante ainda não associado, quando há comprovação de atividade de microfone sobreposta. Os nomes previamente confirmados manualmente sempre prevalecem. Se não houver evidências suficientes, o sistema não inventa identidade; será necessária conferência, pois a diarização Deepgram, isoladamente, não identifica pessoas.
- **Tela:** sem botão “Gerar tarefas das decisões”; **Aprovar ata** ao lado de **Salvar em PDF**, substituído por **Reabrir para correção** após aprovação. A revisão formal desaparece após a aprovação. Nova ATA disponível na barra superior. Texto de geração sem ícone de cérebro; revisão formal sem ícone de checklist.
- **Gravações:** textos substituídos por “Preparando a gravação...” e remoção da observação sobre porcentagem do LiveKit. Indicadores de transcrição e mensagem de conclusão ocultos assim que a transcrição termina.
- **Pauta:** sem a expressão “identificada a partir das manifestações transcritas pelo Deepgram”.
- **Assinatura:** assinatura eletrônica fica diretamente sobre a linha de assinatura, sem caixa verde; data e código continuam visíveis. O PDF já exportava a imagem sobre a linha, mantendo o mesmo arranjo.

## Publicação — passo a passo

1. Faça backup do banco de dados antes de qualquer migração.
2. No painel Supabase, abra **SQL Editor**, cole `supabase/migrations/075_assembly_speaker_fallback_and_regeneration.sql` e execute **depois** das migrações 072, 073 e 074. **Este pacote não executou nenhuma alteração diretamente no banco**.
3. Faça deploy do ZIP completo v0.77.4 na Netlify, sem enviar alterações diretamente para GitHub/Supabase por esta entrega.
4. Mantenha `ANTHROPIC_API_KEY`, `CLAUDE_MINUTES_MODEL`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas como variáveis da Netlify com escopo Functions. Nenhuma nova chave é necessária.
5. Confira que a Netlify publicou a função `assembly-minutes-regenerate` e que o agendamento `assembly-minutes-auto-dispatch` está funcionando.
6. Atualize a página do Condomit com Ctrl+F5, ou reinstale/sincronize o aplicativo mobile se utilizar uma versão empacotada.
7. Teste uma gravação com **dois usuários diferentes**, usando microfones individuais. Verifique nomes, valores mencionados, status da transcrição, geração da ATA e assinatura. Faça uma edição removendo um orçamento: o painel deverá acusar a ausência e impedir a aprovação até o valor ser restaurado.
8. Para uma ATA já aprovada e assinada, clique **Reabrir para correção** antes de editar ou solicitar nova geração. Isso invalida a aprovação/assinatura anterior até que o síndico aprove e assine novamente.

## Limitações e segurança

- A checagem automática garante comparações objetivas de **autoria, valores monetários e percentuais reconhecidos**, mas não assegura que toda sutileza semântica ou justificativa esteja perfeita. O síndico deve comparar a redação com a transcrição e a gravação.
- A transcrição Deepgram pode conter erros: um número incorretamente transcrito também pode aparecer incorreto na ata. Sempre confira valores com o áudio antes de assinar.
- Os falantes só podem ser identificados automaticamente quando existem evidências suficientes de atividade individual dos microfones; nomes nunca serão inventados pela diarização.
- A nova geração consome créditos da Anthropic. Se estiver em andamento, o botão fica desabilitado e a tarefa prossegue em segundo plano sem exigir a página aberta.
- SQL 075 só altera uma função interna de identificação de falantes e adiciona `manual_request_at` na fila `assembly_auto_minutes_jobs`. Nenhum documento oficial é alterado pela aplicação da migração isoladamente.
