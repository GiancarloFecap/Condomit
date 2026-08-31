# Condomit v0.40.0 — Checkout mobile e confirmação Mercado Pago

## Alterações principais

### Checkout em celulares
- Cabeçalho, logo, botão de voltar, cards de planos e resumo agora se adaptam a telas pequenas.
- Recursos dos cards ficam em uma coluna no celular, evitando estouro horizontal.
- Resumo deixa de ser `sticky` no mobile.
- Wallet Brick/iframe é limitado a 100% da largura disponível.
- Botões das telas de sucesso, pendência e falha ocupam a largura disponível no celular.
- Safe areas do Android/iOS foram preservadas sem duplicar padding no checkout.

### Mercado Pago
- O retorno não confia mais no `status` recebido pela URL como resultado final.
- `/api/mercadopago/confirm` consulta diretamente `GET /v1/payments/{id}` no Mercado Pago.
- Quando só existe `external_reference`, o backend procura o pagamento em `/v1/payments/search`.
- Respostas de confirmação usam `Cache-Control: no-store` para evitar estado antigo em cache.
- A página de retorno pendente verifica o pagamento automaticamente: a cada 5 s no início e depois a cada 15 s.
- O bloco de Debug foi removido da interface.
- `status_detail` do Mercado Pago é tratado de forma amigável sem expor JSON interno ao usuário.
- O plano só é persistido no navegador após status realmente aprovado.
- A data efetiva do pagamento só é renovada quando o Mercado Pago confirmar aprovação.
- A tentativa pendente é reconhecida pelo checkout para evitar criação acidental de cobrança duplicada.
- O modo do checkout direto (sandbox/produção) passa a ser inferido prioritariamente pela credencial do Mercado Pago.
- Novas preferências usam `binary_mode: true` para exigir decisão imediata (aprovado/recusado), evitando novas transações indefinidamente em `in_process`.
- O Webhook continua sendo a fonte assíncrona de atualização caso o status seja alterado depois do retorno do comprador.

## Publicação
Não há migration nova de banco nesta versão.

É necessário republicar o projeto na Netlify, pois houve alteração em:
- `netlify/functions/api-proxy.js`
- `scripts/checkout.js`
- `assets/js/retorno-mercado-pago.js`
- `styles/checkout.css`
- páginas de checkout/retorno

Após publicar, faça um novo pagamento de teste. Uma transação antiga que o próprio Mercado Pago ainda informe como `in_process` não deve ser marcada artificialmente como aprovada pela Condomit; ela será reconsultada e sincronizada quando o Mercado Pago alterar o status oficial.
