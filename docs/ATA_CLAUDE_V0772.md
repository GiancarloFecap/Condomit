# Condomit v0.77.2 — ATA automática e revisão

## Implantação

1. Faça backup do projeto publicado e do banco antes de atualizar.
2. No Supabase, acesse **SQL Editor**, cole o arquivo `supabase/migrations/074_assembly_claude_formal_opening_speaker_progress.sql` e execute. A migração 073 deve já estar aplicada.
3. Na Netlify, mantenha as variáveis `ANTHROPIC_API_KEY`, `CLAUDE_MINUTES_MODEL`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` das versões anteriores. Nenhuma nova variável de ambiente é necessária.
4. Publique **todos os arquivos da v0.77.2**, incluindo as funções `assembly-minutes-speaker-refresh`, `assembly-minutes-auto-dispatch` e `assembly-minutes-auto-background`.
5. Confira no painel de deploy que as funções foram incluídas e que a função agendada `assembly-minutes-auto-dispatch` está ativa.
6. Grave uma assembleia de teste com pelo menos dois participantes em contas diferentes. Quando o MP4 e o Deepgram forem concluídos, a ABA Resumo/ATA deverá mostrar **Preparando ATA com Claude** até o texto ser gerado.
7. Confira a abertura: data/hora reais, condomínio e endereço, participantes e presidência (conforme os registros). Depois, leia as manifestações e os resultados de votação.
8. Na revisão da transcrição, confirme se as vozes estão associadas a cada participante. Ao corrigir a identificação de uma voz, o Condomit reenfileira automaticamente a redação do Claude e oculta a minuta anterior até a nova geração.
9. O síndico revisa, aprova e assina. Moradores só terão acesso aos detalhes publicados após esses passos.

## Funcionamento

- Antes do Claude retornar uma versão completa, **nenhuma prévia de ata local** é exibida.
- A abertura é construída pelo servidor a partir dos dados oficiais (não é inventada pelo Claude). A hora efetiva de início, quando disponível, é convertida para `America/Sao_Paulo`; caso contrário é usada a hora registrada no agendamento.
- A parte narrativa vem dos textos **originais do Deepgram** com as identificações disponíveis. Não se envia ao Claude uma minuta prévia.
- Se uma das vozes não tiver evidências suficientes, permanece sem nome; a revisão opcional permite corrigi-la.
- A barra de geração exibe a proporção **de blocos efetivamente respondidos pelo Claude**. Ela **não** estima minutos restantes, e não chega a 100% antes de o job estar concluído.
- A barra de transcrição é removida do painel da ATA quando todos os vídeos tiverem status `concluido`.
- A edição manual salva pela pessoa responsável é preservada quando uma nova geração não pode ser aplicada com segurança. O sistema não modifica ata aprovada ou assinada sem reabertura.
- Os documentos já aprovados não são regenerados automaticamente. Para modificar uma ata publicada, ela deve ser reaberta, revisada e assinada novamente.
- Uma geração nova pode consumir créditos da Anthropic; novas tentativas são limitadas pelo job.

## Principais arquivos alterados

| Arquivo | Mudança |
|---|---|
| `netlify/functions/lib/assembly-auto-minutes.js` | Abertura formal com dados reais da assembleia; passa data/hora, condomínio, presidência e presença para a ATA. |
| `netlify/functions/assembly-minutes-indirect.js` | Informa quantidade de blocos enviados e concluídos da geração Claude. |
| `netlify/functions/assembly-minutes-auto-background.js` | Persiste progresso da geração e substitui somente minutas automáticas, jamais humanas aprovadas/assinadas. |
| `netlify/functions/assembly-minutes-speaker-refresh.js` | Reenvia a ATA após correção recente de voz, com autenticação e autorização por condomínio. |
| `netlify/functions/assembly-deepgram-callback.js` | Usa a nova associação automática do falante após a transcrição. |
| `scripts/assembly/assembly-summary.js` | Somente exibe ATA depois da geração Claude; barra de progresso; atualização por correções; oculta barra Deepgram concluída. |
| `styles/assembleia-resumo.css` | Estilo do indicador de geração. |
| `www/scripts/assembly/assembly-summary.js` e `www/styles/assembleia-resumo.css` | Versão web/mobile sincronizada. |
| `pages/assembleia-resumo.html` e `www/pages/assembleia-resumo.html` | Atualização do identificador de versão para limpeza de cache. |
| `supabase/migrations/074_assembly_claude_formal_opening_speaker_progress.sql` | Campos de progresso e reidentificação com evidência comparativa. |
| `tests/assembly-claude-formal-0772.test.cjs` | Regressão do novo fluxo. |

## Diagnóstico se a ATA não aparecer

No banco, consulte **`assembly_auto_minutes_jobs`** para ver `status`, `progress_completed`, `progress_total`, `last_error`, `attempts`. Não confunda o progresso da geração com o progresso do vídeo: o Claude só começa depois da transcrição concluída. Se o job estiver `falhou` por falta de créditos, autenticação ou resposta inválida, consulte o log da função `assembly-minutes-auto-background` no painel Netlify. Não coloque chaves secretas em relatórios de erro.
