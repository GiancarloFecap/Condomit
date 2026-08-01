# Debug Session: mercadopago-popup-error [OPEN]

## Sintoma
- Ao clicar em `Pagar com Mercado Pago` em `condomit.netlify.app`, a interface mostra `Erro ao processar pagamento. Tente novamente.`

## Esperado
- O popup do Mercado Pago deve abrir com a URL de checkout retornada pela preferência criada no backend.

## Hipóteses
- H1. A chamada `POST /api/mercadopago/preference` está falhando em produção por token do Mercado Pago ausente ou inválido.
- H2. A função Netlify está retornando erro por payload inválido, como `amount` ou `planName` ausentes.
- H3. O popup está sendo aberto, mas a URL `initPoint` não está vindo na resposta da preferência.
- H4. O frontend está lançando exceção antes de abrir/navegar o popup, por exemplo ao acessar `selectedPlan` ou `currentUser`.
- H5. O backend local foi corrigido, mas a produção ainda usa caminho/variável diferente no `api-proxy`.

## Plano
- Instrumentar frontend do checkout no clique do botão e no retorno da API.
- Instrumentar função Netlify do Mercado Pago na entrada, criação da preferência e falha.
- Reproduzir em produção e analisar os logs antes de aplicar qualquer correção.

## Evidências
- Requisição direta para `https://condomit.netlify.app/api/mercadopago/preference` com payload válido retornou:
  - `{"error":"MERCADO_PAGO_ACCESS_TOKEN não configurado"}`

## Conclusão
- H1 confirmada: a produção está falhando por ausência do access token do Mercado Pago no ambiente publicado.
- H2 rejeitada: o payload de teste com `amount`, `planName` e `payerEmail` foi aceito pela rota.
- H3 rejeitada: a falha ocorre antes da resposta com `init_point`.
- H4 rejeitada: o frontend não é a causa primária deste erro específico.
- H5 confirmada: o problema está no backend publicado do Netlify.
