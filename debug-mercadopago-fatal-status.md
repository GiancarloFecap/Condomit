# Debug Session: mercadopago-fatal-status
- **Status**: [OPEN]
- **Issue**: No sandbox do Mercado Pago, cartão não aprova e ao finalizar às vezes volta com página em "fatal".

## Reproduction Steps
1. Login como síndico.
2. Abrir checkout e clicar no botão do Mercado Pago.
3. Finalizar pagamento no sandbox com conta/cartão de teste.
4. Verificar se volta como "fatal" ou fica pendente indefinidamente.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O erro “uma das partes é de teste” ocorre por mistura de comprador vendedor (usuário MP logado em conta real/produção usando preferência de teste) | High | Low | Pending |
| B | O “fatal” é um erro de frontend na página de retorno (JS falha ao interpretar resposta do /api/mercadopago/confirm) | High | Low | Pending |
| C | O /api/mercadopago/confirm ou webhook retorna erro (500/HTML/timeout) e o retorno não consegue atualizar o status | Med | Low | Pending |
| D | O status do Mercado Pago vem como valor não aceito no CHECK do banco e a atualização do Supabase falha | Med | Low | Pending |
| E | O pagamento realmente ficou `in_process` no sandbox por cartão/teste usado (não é bug do sistema) | Med | Low | Pending |

## Log Evidence
[Pending]

## Verification Conclusion
[Pending]
