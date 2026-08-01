# Debug Session: mercado-pago-sandbox

Status: OPEN

## Sintoma
- O checkout do Mercado Pago continua falhando no sandbox.
- Em alguns navegadores, o popup de pagamento nao abre.
- O usuario quer remover o bloco visual de "Modo teste" e recomeçar a integracao do Mercado Pago do zero, usando apenas credenciais de teste por enquanto.

## Hipoteses
1. A URL retornada pela preferencia esta correta, mas o navegador bloqueia o popup porque a abertura final acontece apos um `await`, fora do gesto direto do clique.
2. O checkout sandbox esta sendo criado com preferencia valida, mas o pagador continua entrando com conta real e o erro vem do proprio Mercado Pago, nao da criacao da preferencia.
3. O payload enviado para `/checkout/preferences` contem algum campo que faz o sandbox rejeitar ou degradar a experiencia entre navegadores.
4. O backend local e o backend Netlify nao estao gerando exatamente o mesmo comportamento para a preferencia, causando sintomas diferentes entre ambientes.
5. O fluxo de retorno do popup para a janela principal esta correto em um navegador e falha em outro por restricoes de `window.opener` ou por popup aberto tardiamente.

## Plano
- Instrumentar frontend e backend do Mercado Pago para capturar:
  - clique no botao
  - popup aberto/bloqueado
  - resposta de criacao da preferencia
  - URL final usada no popup
  - retorno do checkout para a janela principal
- Reproduzir o problema com evidencias.
- Confirmar ou descartar hipoteses.
- Aplicar uma correcao minima baseada nas evidencias.

## Evidencias
- Evidencia 1: o backend local criou a preferencia com sucesso para `amount=149`, retornando `https://sandbox.mercadopago.com.br/checkout/v1/redirect?...` e `testMode=true`.
- Evidencia 2: a function do Netlify tambem criou a preferencia com sucesso para o mesmo payload, retornando `sandbox.mercadopago.com.br` e `testMode=true`.
- Evidencia 3: o backend local tambem criou a preferencia com sucesso para `amount=199` no plano Premium, confirmando que o problema nao estava restrito a um unico valor de plano.

## Analise
- Hipotese 1: confirmada como risco real. O fluxo de popup era o ponto mais fragil entre navegadores e precisava de fallback.
- Hipotese 2: parcialmente descartada. A criacao da preferencia esta correta no sandbox.
- Hipotese 3: descartada por ora. O payload minimo atual gera preferencia valida.
- Hipotese 4: descartada para a criacao da preferencia. Local e Netlify responderam corretamente.
- Hipotese 5: confirmada como risco real. O retorno precisava funcionar tambem sem `window.opener`, para casos de fallback na mesma aba.

## Fix Aplicado
- Removido o bloco visual de "Modo teste".
- Removido o fluxo de criacao de comprador de teste.
- Simplificado o checkout para:
  - abrir popup com `about:blank` dentro do clique
  - escrever uma tela de carregamento simples no popup
  - navegar o popup para o Mercado Pago quando disponivel
  - fazer fallback para navegacao na mesma aba quando o popup for bloqueado
  - processar o retorno do Mercado Pago mesmo sem `window.opener`
- Mantidas apenas credenciais de teste no `.env` e nos fallbacks atuais do Mercado Pago.
