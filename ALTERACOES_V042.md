# Condomit v0.42.0 — troca de condomínio, IA do código, assembleia e exclusão

## Correções

- Corrigida a troca de condomínio quando `user_condominiums.apartment` é `INTEGER`. A RPC agora converte o apartamento do morador para inteiro antes do `INSERT` e usa `NULL` para perfis sem apartamento residencial.
- Em **Configurações**, **Gerar código de acesso** é exibido exclusivamente para o usuário **síndico**, independentemente do plano.
- A **IA Condomit** agora entende perguntas do síndico como:
  - “Qual o código de acesso do condomínio?”
  - “Qual o meu código de acesso?”
  - “Como gerar um código de acesso?”
  - “Gerar código de acesso”.
- Moradores e porteiros não recebem o código nem instruções administrativas de geração pela IA.
- Quando não existe código ativo, a IA exibe um pequeno botão **Gerar código de acesso**. Ao clicar, a mensagem é enviada ao chat e um novo código é criado automaticamente.
- Por segurança, o banco continua armazenando somente o hash. Um código gerado nesta sessão é mantido apenas no `sessionStorage`, permitindo que a IA o informe novamente ao próprio síndico durante a sessão.
- O cartão **Próxima Assembleia** do painel do síndico agora usa exclusivamente assembleias do CEP do condomínio atual e aplica uma segunda validação local para impedir vazamento entre condomínios.
- A exclusão de conta remove primeiro o vínculo em `user_condominiums`, evitando o `409` causado por FK legada. A migration também normaliza esse FK para `ON DELETE CASCADE`.
- A mensagem de erro da exclusão agora mostra o erro real devolvido pelo servidor quando houver falha.

## Banco de dados

Execute a nova migration:

```text
supabase/migrations/030_condominium_switch_ai_access_delete_fixes.sql
```

Ela substitui as RPCs de mudança de condomínio, cria a consulta segura de status do código de acesso e corrige a relação de exclusão entre `user_condominiums` e `users`.
