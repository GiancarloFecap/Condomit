# Condomit v0.50.0 — Financeiro e refinamento de UI

## Dashboard financeiro
- Corrigida a mensagem enganosa que sempre indicava ausência da migration 032.
- A RPC `condomit_monthly_financial_summary` continua sendo a fonte primária.
- Adicionado fallback autenticado no servidor (`/api/dashboard/financial-summary`) que calcula despesas e receitas reais diretamente do banco se a RPC falhar.
- Despesas incluem lançamentos financeiros reais do mês e pagamentos aprovados da assinatura Condomit.
- Receitas usam os lançamentos reais do mês.
- O CEP atual é revalidado antes da consulta.
- Mensagens de erro não instruem mais a executar uma migration que já pode estar instalada.

## Resumo do mês
- Valores menores e responsivos.
- Textos não se sobrepõem mais.
- Melhor comportamento em cards estreitos e celular.

## UI interna
- Refinamento de top bars, cards, formulários, tabelas e estados vazios nas páginas internas.
- Landing page `inicio.html` preservada.

## Tipo de usuário
- Página redesenhada com fundo claro, cabeçalho de marca, hierarquia visual mais limpa e informações de segurança.
- Cards Morador, Síndico e Porteiro mantêm a identidade visual existente.
- Removida dependência da imagem externa de condomínio no fundo.

## Publicação
- Não há migration nova obrigatória nesta versão.
- Republicar Netlify é necessário porque `netlify/functions/api-proxy.js` foi alterado.
