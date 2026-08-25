# Supabase — instruções da versão atual

## Ordem das migrations

Execute as migrations existentes em ordem numérica. Para atualizar um banco que já estava na migration 023, execute:

```text
024_advanced_management_suite.sql
025_marketplace_delete_and_ui_polish.sql
026_secure_condominium_access.sql
```

A migration 024 incluída nesta versão é a versão corrigida: `service_tickets` é criada antes de `condomit_managed_condominiums_dashboard()`.

## Novo código de acesso do condomínio

A migration 026 elimina do fluxo de entrada a comparação `senha == condominium_name`.

Depois de executá-la:

1. Entre como síndico.
2. Abra **Configurações**.
3. Em **Condomínio**, clique em **Gerar código de acesso**.
4. Escolha validade e quantidade máxima de usos.
5. Copie o código exibido.
6. Use esse código nas telas **Entrar no condomínio** de morador/porteiro.

O valor puro do código não é salvo no banco. O banco armazena apenas um hash e o código é mostrado ao síndico no momento da geração.

## Verificação rápida

```sql
select to_regclass('public.service_tickets');

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'condomit_managed_condominiums_dashboard',
    'condomit_create_condominium_access_code',
    'condomit_join_condominium_secure'
  );

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'marketplace_items'
  and column_name = 'item_status';
```

Depois das migrations:

```sql
NOTIFY pgrst, 'reload schema';
```

## Segurança

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no frontend. No navegador, mantenha apenas a chave pública/publishable. A service role deve existir somente em Netlify Environment Variables.
