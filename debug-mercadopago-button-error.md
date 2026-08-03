# Debug Session: mercadopago-button-error
- **Status**: [OPEN]
- **Issue**: Ao clicar no botão do Mercado Pago (Wallet Brick), aparece "Houve um erro, por favor tente mais tarde."
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-mercadopago-button-error.ndjson

## Reproduction Steps
1. Abrir /pages/checkout.html logado como síndico.
2. Selecionar um plano.
3. Clicar no botão do Mercado Pago.
4. Observar erro abaixo do botão.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O onSubmit falha ao criar pagamento pendente/preferência (erro HTTP /api/pagamento ou /api/mercadopago/preference) e o Brick exibe o erro genérico | High | Low | Pending |
| B | O backend retorna 401/403 do Mercado Pago por credenciais/env incorretos no ambiente atual (Netlify vs local) | High | Low | Pending |
| C | O redirect do Netlify ainda está enviando rota errada para a Function em produção, gerando 404/HTML no lugar de JSON | Med | Low | Pending |
| D | O Mercado Pago bloqueia o fluxo por domínio/HTTPS/config (ex.: notification_url/back_urls inválidas) | Med | Med | Pending |
| E | Falha no Wallet Brick (SDK/DOM) antes do onSubmit (erro de renderização/config) | Low | Low | Pending |

## Log Evidence
- Evidência do usuário (produção): `null value in column "total_apartamentos" of relation "pagamento" violates not-null constraint`

## Verification Conclusion
[Pending]
