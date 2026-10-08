# Correção 051 — mensalidade isenta no condomínio administrativo

## Motivo
A migration 045 isentava de cobrança apenas `contato.condomit@gmail.com`. O morador/porteiro transferido para o mesmo condomínio ainda recebia `unpaid` ou `overdue` e era desconectado.

## Mudanças
- `supabase/migrations/051_admin_condominium_billing_exemption.sql`: cria uma lista fechada de CEPs isentos, inicialmente só o CEP técnico **99999-999**. A lista é protegida por RLS e não é editável pelas contas do aplicativo.
- O RPC autenticado `condomit_get_billing_status()` retorna `status: exempt`, `billing_exempt: true`, `can_use: true`, `plan_name: Premium`, inclusive a moradores e porteiros vinculados a esse condomínio. Não atribui `demo_access` ou troca de perfil a outros usuários.
- O trigger de associação de porteiro permite vínculo ao condomínio isento sem pagamentos.
- O RPC de CEP prioriza o condomínio ativo registrado em `public.users.condominium` **somente quando há o vínculo correspondente em `public.user_condominiums`**. Com isso a troca entre condomínios não deixa o usuário no CEP anterior.
- O cliente invalida status mensal de CEP anterior, não reaproveita Premium local ao selecionar um condomínio pagante e mantém os limites de assinatura nos demais condomínios.

## Publicação
1. Em **Supabase > SQL Editor**, execute `supabase/migrations/051_admin_condominium_billing_exemption.sql` (uma vez; é repetível).
2. Publique o ZIP na Netlify. Depois limpe o cache do site/recarregue a página e entre novamente nas contas de teste.
3. Certifique-se de que o morador e o porteiro tenham vínculo efetivo em `public.user_condominiums` com CEP `99999-999`. A existência de um CEP apenas no navegador não dá permissão de isenção.
4. Com o morador e o porteiro autenticados, o resultado do RPC de cobrança deve ser `status: "exempt"`, `can_use: true`, `plan_name: "Premium"`.
5. Um usuário em outro condomínio **sem pagamento** deve continuar vendo `status: "unpaid"` ou `"overdue"`; esse condomínio não é isento.

Para conferir a lista de CEPs isentos no SQL Editor:

```sql
SELECT cep, reason FROM public.condomit_billing_exempt_condominiums;
```

Para confirmar a vinculação de um usuário específico no SQL Editor:

```sql
SELECT user_email, condominium_id, joined_at
FROM public.user_condominiums
WHERE LOWER(user_email) = LOWER('EMAIL_DO_MORADOR_AQUI');
```

**Observação:** Não foi feita conexão com o Supabase de produção; a aplicação da migration e a verificação com usuários reais precisam ser feitas no seu projeto Supabase. Nenhuma mensalidade real é cancelada ou editada por esta mudança. A isenção se limita ao CEP administrativo reservado.
