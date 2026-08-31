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

## Atualização 0.39 — logo e regulamento do condomínio

Depois das migrations anteriores, execute:

```text
029_condominium_assets_and_documents.sql
```

Essa migration adiciona os campos de identidade visual e regulamento em `public.condominiums` e cria dois buckets no Storage. O bucket de regulamentos é privado e aceita apenas MIME de documentos Word `.doc` e `.docx`.

Para que o botão **Confirmar meu e-mail** leve à tela de confirmação da Condomit e, em seguida, à página de entrada, adicione também em **Authentication > URL Configuration > Redirect URLs**:

```text
https://SEU-DOMINIO/pages/email-confirmado.html
```

No desenvolvimento, adicione a mesma rota com a origem local usada pelo projeto.

## Atualização 0.42 — troca de condomínio, código pela IA e exclusão

Execute depois da migration 029:

```text
030_condominium_switch_ai_access_delete_fixes.sql
```

Essa migration corrige o tipo de `apartment` na troca de condomínio, adiciona a RPC segura `condomit_get_condominium_access_code_status` e normaliza a exclusão do vínculo `user_condominiums -> users`.

Verificação rápida:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'condomit_join_condominium_secure',
    'condomit_change_my_condominium',
    'condomit_get_condominium_access_code_status'
  );
```

## Atualização v0.43.0

Execute também a migration abaixo no SQL Editor do Supabase, após as anteriores:

```text
supabase/migrations/031_account_plan_access_code_persistence.sql
```

Ela corrige a exclusão de contas bloqueada por chaves estrangeiras legadas (incluindo `assembly_polls_created_by_fkey`) e passa a manter o valor do código de acesso disponível somente ao síndico enquanto a validade e a quantidade de usos ainda permitirem o acesso. Códigos criados antes desta migration continuam válidos conforme as regras antigas, mas o valor em texto não pode ser recuperado a partir do hash; gere um novo código após aplicar a migration para usar a recuperação pela IA/Configurações.
