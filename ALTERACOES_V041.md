# Condomit v0.41.0 — Hierarquia cumulativa, checkout imediato e código de acesso

## Alterações

- A hierarquia de planos foi consolidada como cumulativa:
  - **Essencial (nível 1)**: recursos essenciais.
  - **Pro (nível 2)**: todos os recursos do Essencial + recursos Pro.
  - **Premium (nível 3)**: todos os recursos do Essencial + Pro + recursos Premium.
- A página inicial e o checkout agora deixam essa herança explícita nos benefícios exibidos.
- O checkout não depende mais da renderização visual tardia do SDK do Mercado Pago. O botão **Pagar com Mercado Pago** é exibido já no primeiro carregamento e cria a preferência apenas no clique.
- As consultas iniciais de mensalidade e catálogo de planos passam a ocorrer em paralelo para reduzir o tempo até o checkout ficar utilizável.
- O fluxo continua usando a URL `init_point`/`sandbox_init_point` retornada pela preferência criada no servidor.
- Em **Configurações > Condomínio > Gerar código de acesso**, o síndico agora consegue gerar, copiar e revogar um código seguro do condomínio.
- O código de acesso está disponível para síndicos em qualquer plano porque moradores também precisam ingressar no condomínio. O uso por porteiro continua bloqueado no banco para condomínios Essencial e permitido apenas em Pro/Premium.
- O código bruto é mostrado somente no momento da geração; gerar um novo código revoga os anteriores.
- Web e bundle Capacitor usam a mesma implementação.

## Banco de dados

Esta versão não cria migration nova. A geração segura de códigos depende da migration já existente:

`supabase/migrations/026_secure_condominium_access.sql`

A restrição de porteiro por plano depende da migration:

`supabase/migrations/028_signup_porter_plan_fixes.sql`
