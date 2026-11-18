# Condomit v0.77.0 — correção HTTP 400 Claude

O cliente Anthropic de `netlify/functions/lib/assembly-claude-minutes.js` foi atualizado para **não enviar** `temperature`, `top_p` ou `top_k` ao Claude Sonnet 5/5.5; anteriormente o campo `temperature: 0.15` provocava HTTP 400. Agora o servidor interpreta os erros de parâmetro, modelo, chave e créditos separadamente e registra o diagnóstico no log da Netlify sem registrar transcrição ou chave.

`tests/assembly-claude-compat-0770.test.cjs` verifica a composição da requisição para ambos os modelos, saída JSON e tratamento dos principais erros. O projeto passou de v0.76.9 para **v0.77.0**, conforme regra de numeração. Foram atualizados `package.json`, `package-lock.json` e as instruções já existentes.

## Aplicação

1. Publique os arquivos da v0.77.0 na Netlify (funções incluídas); aguarde a conclusão do deploy.
2. Em Netlify → Project configuration → Environment variables, confirme `ANTHROPIC_API_KEY` (Functions). A variável opcional `CLAUDE_MINUTES_MODEL` pode ter o valor `claude-sonnet-5-5` (recomendado e padrão) ou `claude-sonnet-5`.
3. Gere novamente uma minuta em Revisões → Resumo/Ata → Gerar ATA com Claude (nuvem). Revise nomes, decisões e votações, depois aprove e assine.
4. Se persistir um erro, consulte o log `[CLAUDE API]` da função `assembly-minutes-indirect` na Netlify e verifique `status`, `type`, `requestId` e `diagnostic`; não compartilhe API key nem transcrições confidenciais.

Não é necessário executar migração SQL. Testes locais não substituem uma requisição real ao serviço, que requer chave válida e saldo.
