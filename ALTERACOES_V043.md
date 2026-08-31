# Condomit v0.43.0 — exclusão, planos, dados imediatos e código persistente

## Correções

- Corrigida a exclusão de contas bloqueada por `assembly_polls_created_by_fkey`. As enquetes/resultados das assembleias são preservados e a autoria passa a `NULL` quando o usuário é excluído. A migration também normaliza outras FKs legadas para evitar novos erros 409 em sequência.
- A sidebar passa a resolver e persistir corretamente o nível do plano. Pro continua contendo todo o Essencial e Premium contém Essencial + Pro + Premium.
- A sidebar também revalida o plano no servidor em páginas Essencial, evitando permanecer com somente os itens Essencial por falha de ordem de carregamento.
- Em Configurações, os dados já disponíveis no `sessionStorage` são renderizados imediatamente e depois atualizados silenciosamente com o banco.
- A opção de código de acesso permanece exclusiva do síndico.
- Novos códigos de acesso passam a ficar recuperáveis pelo síndico durante toda a validade escolhida. A tabela não permite leitura direta pelo navegador; o valor é retornado somente pela RPC segura ao síndico do próprio condomínio.
- O código deixa de funcionar automaticamente quando a validade termina ou quando o último uso permitido é consumido. Nesse momento ele também é marcado como inativo e o valor recuperável é limpo.
- O modal de Configurações mostra o código ativo, data/hora de expiração e quantidade de usos restantes.
- A IA Condomit pode informar o código ativo ao síndico mesmo após recarregar/entrar novamente, enquanto o código ainda estiver válido e com usos disponíveis.

## Banco de dados

Execute:

```text
supabase/migrations/031_account_plan_access_code_persistence.sql
```

A migration é obrigatória para a correção da FK de `assembly_polls` e para a persistência do código de acesso.

> Observação: para códigos criados antes da migration 031, o banco possui apenas o hash. Depois de aplicar a migration, gere um novo código uma vez para que ele possa ser consultado pelo síndico até expirar ou esgotar os usos.
