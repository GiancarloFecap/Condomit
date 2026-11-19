# Condomit v0.77.3 — instruções de atualização

## Correções

- O Claude recebe a transcrição original do Deepgram com autores, infere um título curto para cada assunto não previamente cadastrado e devolve `pauta_inferida` junto dos parágrafos narrativos. A ATA passa a ter um parágrafo explícito com a pauta do dia; os assuntos inferidos não são apresentados como pautas formalmente cadastradas.
- A abertura formal continua usando data, hora, endereço e presidência reais. O presidente aparece apenas uma vez; os demais presentes são citados por nome, sem cargos.
- A barra lateral lê o nome atual do condomínio no Supabase e atualiza a sessão. A alteração feita em Configurações também atualiza a barra lateral imediatamente.
- O card da assembleia usa `started_at` e `ended_at` no fuso `America/Sao_Paulo`, em vez dos horários planejados `start_time` e `end_time`. Sem `ended_at` válido não é exibido um encerramento fictício.
- As cópias web e mobile e o cache do service worker foram atualizados.

## Implantação

1. Publique `Condomit-v0.77.3-completo.zip` na Netlify, substituindo a versão anterior pelo conteúdo completo da nova versão.
2. Mantenha as variáveis `ANTHROPIC_API_KEY` e `CLAUDE_MINUTES_MODEL`; não é necessário criar outra chave nem executar uma nova migração SQL.
3. Aguarde a conclusão do deploy de produção e atualize a página (Ctrl+F5 se algum recurso antigo permanecer em cache).
4. Teste com uma nova assembleia sem pauta cadastrada. Após o Deepgram concluir, a geração do Claude deve ocorrer automaticamente, com pauta inferida marcada como tal e abertura sem repetição do presidente.
5. Modifique o nome do condomínio em Configurações, salve e confira a barra lateral na mesma tela e em outras páginas.
6. Confira uma assembleia encerrada: o card deve apresentar o dia real do início e o intervalo real até `ended_at`.

## ATA existente da assembleia 166 (“Teste Modelo ATA”)

Esta ATA foi gerada na versão anterior. Atualizar apenas o código não altera automaticamente o documento já persistido — medida que protege revisões humanas e evita gastos imprevistos de API.

Se quiser regenerar **somente** a assembleia 166, depois do deploy, use o SQL opcional `REPROCESSAR_ATA_166_APOS_DEPLOY_0773.sql` no Supabase SQL Editor. O comando só reabre o job se a ATA ainda estiver como rascunho do Claude, o job estiver concluído e não houver assinatura. Ele não altera o corpo nem a transcrição original; o próprio processamento do servidor atualizará a minuta quando terminar. O processo gerará uma nova cobrança da API Anthropic.

Confira o `RETURNING` da atualização. Se retornar nenhuma linha, os critérios de segurança não foram atendidos e nenhum job foi reaberto. Caso a ata tenha sido editada manualmente, aprovada ou assinada, **não** tente forçar o comando.

## Limites e revisão

A inferência de pauta pela IA depende da qualidade da transcrição. O sistema mantém a distinção entre assunto debatido e pauta formalmente cadastrada. A redação produzida pelo Claude exige revisão pelo síndico antes da aprovação e assinatura.

Nenhuma atualização foi feita diretamente em Netlify, Supabase ou GitHub.
