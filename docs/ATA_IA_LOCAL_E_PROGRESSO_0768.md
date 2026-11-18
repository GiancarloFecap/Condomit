# Condomit v0.76.8 — ATA com IA local e progresso de transcrição

## Novidades

- **IA local, sem chave de geração paga:** no painel de revisão da ATA, o síndico clica em **Redigir ATA com IA local (sem API)**. A página baixa um modelo Qwen2.5 por meio do WebLLM e faz a inferência no próprio dispositivo usando WebGPU. Há opção de modelo de 1,5B (mais leve, ~1,6 GB de memória de GPU) ou de 3B (mais qualidade, ~2,5 GB). Esses tamanhos são aproximados, não garantias de download. A primeira execução baixa pesos grandes. O modelo local não é incluído no ZIP.
- **Ajuste das falas na ATA:** quando a voz é reatribuída, o sistema recarrega a transcrição e corrige referências explícitas ao nome antigo na minuta não aprovada. Se for a única voz sem identificação, também pode substituir o marcador anônimo; quando houver mais de uma voz anônima, exige geração novamente para não atribuir o texto à pessoa errada. Atas aprovadas são reabertas antes de alteração, exigindo nova revisão e assinatura. Antes de aprovar, a interface procura manifestações de participantes identificados que não estejam atribuídas no texto.
- **Progresso da transcrição:** na aba da ATA e na aba Gravações, mostra a duração total e, quando houver dados reais de avanço na base, a parcela processada. A transcrição Deepgram com callback único não fornece atualização granular: enquanto o retorno não chega, aparece estado animado e mensagem de que não existe porcentagem real. Nunca inventa uma estimativa de tempo. Somente após `transcription_status='concluido'` chega a 100%.
- **Estilo de escrita:** o modelo recebe as falas já divididas por assunto, com nome, papel e texto. A instrução pede uma síntese formal em terceira pessoa, como nos exemplos de irmão/tio e nos exemplos de síndico/morador; sem títulos artificiais, sem hesitações e sem resultados de votação inventados. As votações continuam adicionadas a partir dos registros reais pelo editor já existente.

## Execução

1. Publique a pasta do projeto e preserve as migrações anteriores até `071` já aplicadas. **Esta versão não exige SQL novo.**
2. Acesse uma assembleia com gravação e transcrição Deepgram concluídas como síndico.
3. Confira ou corrija as vozes na seção de transcrições, antes de redigir.
4. Escolha o modelo local e clique em **Redigir ATA com IA local (sem API)**. Mantenha a página aberta durante a geração; a transcrição gravada segue persistida no servidor.
5. Confira todos os assuntos, a autoria das manifestações, os valores e os resultados das votações. Salve a minuta, aprove e assine.
6. Sem WebGPU, utilize **Gerar versão provisória por regras** ou redija manualmente. Essa opção não usa modelo de IA e não é apresentada como resumo de IA.

O modelo é baixado via CDN e cacheado pelo navegador na primeira utilização, mas **os dados da assembleia não são enviados a serviço externo de geração** durante a inferência. A função do próprio Condomit é usada apenas para fornecer transcrições e pautas já protegidas pela autenticação do síndico.

A qualidade em português depende da capacidade do modelo escolhido e da precisão da transcrição; um modelo pequeno pode falhar, omitir ou inferir informações incorretas. A revisão do síndico continua obrigatória. O sistema **não testa inferência real de um modelo completo em navegadores dos usuários** nos testes automatizados locais.

## Arquivos principais

- `scripts/assembly/transcription-progress.js`, `styles/assembly-transcription-progress.css` — barra e leitura dos segundos realmente registrados.
- `scripts/assembly/local-ai-minutes.js` — redação por modelo WebLLM no navegador (modelos Qwen2.5 com WebGPU).
- `scripts/assembly/speaker-draft.js` — correção de referências nominais em minuta e cautela com falantes anônimos.
- `scripts/assembly/assembly-summary.js` — botões, barra, atualização de autoria, redação e revisão.
- `netlify/functions/assembly-minutes-indirect.js` — modo `local_only`, retorna dados autorizados por assunto e não chama APIs de geração externa.
- `pages/assembleia-resumo.html`, `netlify.toml` — scripts, CSS e permissão restrita do CDN.
- `service-worker.js`, `package.json`, `package-lock.json`, `www/` — versão e distribuição web/mobile.
- `tests/assembly-local-minutes-0768.test.cjs` — 12 testes específicos do novo fluxo.

## Verificação local

```sh
node --test tests/*.cjs
node tools/check-project.mjs
npm run mobile:build
```

**Limitação atual de porcentagem:** o Deepgram assíncrono retorna o texto quando termina, e não transmite frações do arquivo transcrito. Para obter progresso contínuo real, a arquitetura precisaria processar o áudio em segmentos e confirmar separadamente cada segmento; não seria correto mostrar uma porcentagem fictícia do processamento.
