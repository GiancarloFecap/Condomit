# Debug Session: mercadopago-payment-error

Status: OPEN

## Sintoma
- A finalizacao do pagamento do Mercado Pago falha com a mensagem de mistura entre parte de teste e parte real.

## Hipoteses
- H1: A preferencia esta retornando um link de checkout incorreto para o ambiente atual.
- H2: Algum campo enviado na preferencia esta causando mistura entre conta real e conta de teste.
- H3: O erro aparece apenas na etapa de finalizacao do pagamento, nao na criacao da preferencia.
- H4: A API do Mercado Pago retorna um detalhe de erro mais preciso que o frontend nao mostra hoje.
- H5: O backend local e o backend do Netlify nao estao enviando exatamente o mesmo payload.

## Plano
- Subir o Debug Server.
- Instrumentar frontend e backends com logs minimos.
- Reproduzir o fluxo.
- Analisar evidencias e aplicar a menor correcao possivel.

## Evidencias
- E1: A reproducao direta da criacao da preferencia retornou `tokenPrefix: APP_USR-`, `isTest: false`, `statusCode: 201`, com `initPoint` e `sandboxInitPoint`.
- E2: No runtime local apos a correcao, `tokenPresent: false`, confirmando que o ambiente nao estava usando um token de teste real e dependia do fallback hardcoded.

## Conclusao Parcial
- H1 rejeitada: a API conseguiu criar a preferencia com sucesso.
- H2 confirmada: o runtime estava usando credencial real hardcoded, o que explica a mistura com comprador de teste.
- H3 rejeitada: o problema nasce antes da finalizacao, na combinacao de credenciais/ambiente.
- H4 parcialmente confirmada: a API nao falhou, entao o detalhe relevante veio do ambiente de credenciais.
- H5 parcialmente confirmada: o codigo permitia divergencia silenciosa por fallback hardcoded.

## Correcao Aplicada
- Removido o fallback hardcoded de token real em `scripts/server.js`.
- Removido o fallback hardcoded de token real em `netlify/functions/api-proxy.js`.
- Mantida a instrumentacao para validacao pos-fix.
