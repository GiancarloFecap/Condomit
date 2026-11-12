# Condomit v0.76.5 — Deepgram Keyterms

## Instalação

1. Mantenha as migrações anteriores do projeto até `068` aplicadas.
2. Execute **a migração `supabase/migrations/069_assembly_deepgram_keyterms.sql`** no Supabase antes de publicar a nova versão. A migração é necessária para armazenar as auditorias e as sugestões de correção.
3. Publique os arquivos da v0.76.5 no ambiente Netlify. Mantenha `DEEPGRAM_API_KEY` exclusivamente no servidor (nunca em JavaScript do navegador).
4. Opcional: `DEEPGRAM_KEYTERM_TOKEN_LIMIT=500`. O valor é limitado em 500. A seleção usa **85%** desse limite por segurança, pois a tokenização real é interna ao Deepgram. Um valor como `350` reduz o orçamento aproximado para 297 tokens.
5. Opcional: `DEEPGRAM_MODEL=nova-2` força o uso inicial da API antiga de Keywords, útil em testes. Por padrão, a versão é `nova-3`, com fallback para Nova-2 apenas se o erro indicar incompatibilidade de keyterms.
6. Verifique a gravação concluída, a transcrição bruta e, com a conta do síndico, gere o resumo da ATA e revise as correções sugeridas.

## Como funciona

- O módulo `keyterms/contexto.js` lê a assembleia, pauta, documentos, presença, moradores vinculados e empresas mencionadas nos textos cadastrados. Se não conseguir obter o contexto, usa o vocabulário base para não bloquear a transcrição.
- `keyterms/condominio.base.js` contém as nove categorias do vocabulário. Para adicionar termos, altere o array `termos` da categoria. Para mudar a seleção condicionada à pauta, ajuste `gatilhos` e `prioridade`.
- `keyterms/buildKeyterms.js` deduplica sem distinguir maiúsculas nem acentos, preserva a grafia original e seleciona até 100 termos, com prioridade: condomínio e nomes, empresas, vocabulário essencial e categorias relacionadas à pauta. O retorno inclui os termos enviados, os descartados, motivos e custos estimados.
- Nova-3 recebe `keyterm` repetido (`keyterm=síndico&keyterm=quórum`); Nova-2 recebe `keywords=termo:2` ou `:1`. Os parâmetros são codificados com `URLSearchParams` e nunca são misturados.
- Permanecem `language=pt-BR`, `smart_format=true`, `punctuate=true`, `utterances=true`, `numerals=true`, `profanity_filter=false` e `diarize_model=latest` (que habilita diarização — não combinar com `diarize=true`). `redact_usage=true` protege nomes presentes nos keyterms dos registros de uso do Deepgram.
- Quando o Nova-3 recusa explicitamente keyterms para o modelo/idioma, a requisição é repetida com `nova-2` e `keywords`. Em erros gerais (429, 500), usa-se o fluxo habitual de novas tentativas. Erros assíncronos específicos também agendam fallback.
- A auditoria fica em `assembly_recordings.deepgram_keyterm_audit` e `assembly_deepgram_jobs.keyterms_sent`, `keyterm_audit` e `model_used`. O registro do modelo real é mantido mesmo que `transcription_model` preserve a identificação da pipeline `deepgram:nova-3` para compatibilidade com o sistema anterior.
- `keyterms/correcoes.js` atua **somente na cópia dos textos enviada ao redator da ATA**. Não atualiza `assembly_transcripts`. As sugestões e justificativas ficam em `assembly_minutes_correction_audit` e são copiadas para `assembly_minutes_drafts.observacoes_revisao` ao salvar ou aprovar a minuta; o síndico pode conferi-las na tela de revisão.

## Exemplo — reunião com 10 moradores

Contexto hipotético: Residencial Parque das Flores; 10 moradores com nomes e sobrenomes; empresas Elevadores São José Ltda., Segurança Alfa Ltda. e Reformas Paraná; pauta sobre elevadores, piscina e câmeras.

| Medida | Valor da execução local |
|---|---:|
| Limite configurado | 500 tokens |
| Orçamento usado (85%) | 425 tokens |
| Estimativa dos termos incluídos | 425 tokens |
| Termos incluídos | 86 |
| Termos descartados por limite | 216 |

**Distribuição selecionada:** 1 nome do condomínio, 30 entradas de nomes (completos e partes), 3 empresas, 8 termos de Assembleia, 8 de Cargos e órgãos, 8 de Finanças, 9 de Manutenção e obras, 10 de Segurança e 9 de Áreas e serviços. Os números variam conforme os dados reais. A contagem de tokens é aproximada, não um valor retornado pelo provedor.

## Arquivos adicionados

- `keyterms/condominio.base.js` — categorias, prioridades, gatilhos e termos.
- `keyterms/buildKeyterms.js` — seleção, orçamento, deduplicação e parâmetros da API.
- `keyterms/contexto.js` — coleta de assembleia, participantes, empresa e pauta.
- `keyterms/correcoes.js` — dicionário e registro de sugestões de pós-correção.
- `supabase/migrations/069_assembly_deepgram_keyterms.sql` — auditoria e observações de revisão.
- `tests/assembly-keyterms.test.cjs` e `tests/assembly-keyterms-integration.test.cjs` — testes unitários e de integração simulada.

## Arquivos alterados

- `netlify/functions/lib/assembly-deepgram.js` — monta query, integra chave dinâmica, fallback, metadados e logs sem expor nomes em console.
- `netlify/functions/assembly-deepgram-callback.js` — registra rejeições assíncronas de keyterms e permite fallback na próxima tentativa.
- `netlify/functions/assembly-minutes-indirect.js` — corrige somente cópias da transcrição usadas para resumo e registra sugestões da ATA.
- `scripts/assembly/assembly-summary.js` — lista sugestões de correção na revisão do síndico.
- `tests/assembly-deepgram.test.cjs` e `tests/assembly-minutes-official.test.cjs` — atualiza simulações de auditoria e banco.
- `pages/assembleia-resumo.html` — atualiza versão do JavaScript de revisão.
- `package.json`, `package-lock.json`, `service-worker.js` — versão e atualização do cache web.
- `www/` — arquivos web de distribuição mobile regenerados.

### Comandos de verificação local

```bash
node --test tests/*.cjs
npm run check:project
npm run mobile:build
```

**Importante:** os testes automatizados usam respostas simuladas. Eles não garantem aceitação dos termos pelo plano Deepgram da conta nem a qualidade da transcrição de uma gravação real. Se a API indicar limites excedidos, diminua `DEEPGRAM_KEYTERM_TOKEN_LIMIT` (por exemplo, para `350`).
