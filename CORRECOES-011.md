# Condomit — Correções 011

Esta versão aplica as correções pedidas sobre prestadores, visitantes, marketplace, sugestões, assembleias, manutenção, controle de acesso, logos e barras superiores.

## Passo obrigatório no Supabase

Execute, uma única vez, o arquivo abaixo no **Supabase > SQL Editor**:

`supabase/migrations/011_fix_project_polish_and_flows.sql`

A migration:

- corrige RLS e normalização de CEP de `service_providers`;
- garante histórico compartilhado de liberação, revogação e recusa de visitantes;
- cria `maintenance_items` e remove os registros de manutenção anteriores uma única vez;
- cria `access_vehicles` e `access_dependents`;
- cria `assembly_post_comments`;
- cria `condomit_close_stale_assemblies()` para encerrar assembleias sem participantes ativos após 30 minutos.

## Encerramento automático das assembleias

A função `netlify/functions/auto-end-assemblies.js` está configurada em `netlify.toml` para executar a cada 5 minutos no deploy publicado. Ela encerra assembleias que já passaram 30 minutos do horário de início e não têm nenhum heartbeat de participante ativo nos últimos 2 minutos.

## Ata das assembleias realizadas

Foi criada `pages/assembleia-resumo.html`. Ela consolida:

- participantes registrados;
- pautas;
- mensagens do chat com autor e horário;
- solicitações de fala;
- votações, opções originais e total de votos por opção;
- comentários pós-assembleia com autor e horário.

O projeto atual não possui transcrição automática das falas feitas somente por microfone. Portanto, a ata não inventa texto que nunca foi persistido. Para registrar palavra por palavra o áudio seria necessário adicionar um serviço de transcrição durante a chamada.

## Manutenção preventiva

A página agora usa somente `maintenance_items` do Supabase. Os exemplos fixos foram removidos. O calendário passou a filtrar a tabela pelo dia selecionado, e o dashboard (`index.html`) mostra apenas as manutenções realmente programadas nessa página.
