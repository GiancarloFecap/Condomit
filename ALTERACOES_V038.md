# Condomit v0.38.0 — Cadastro, exclusão e porteiros

## Correções

- Exclusão de conta agora envia o token Supabase para a API protegida, eliminando o erro 403 causado por requisição anônima.
- A API usa o `id` do usuário autenticado para excluir o registro do Supabase Auth, sem procurar contas por e-mail.
- A exclusão do perfil ocorre antes da remoção do Auth e a migration 028 ajusta FKs de ocorrências/manutenções para `ON DELETE CASCADE`.
- Cadastro ganhou fallback também para falhas internas do Supabase (`database error saving new user`, HTTP 5xx), além do rate limit.
- Os metadados de cadastro enviam `user_type` e `type` para compatibilidade com bancos antigos.
- A migration 028 substitui sincronizadores Auth -> `public.users` legados que escrevem nessa tabela e podem causar `Database error saving new user`.
- Logo da página de tipo de usuário alterada para `assets/logo-lado.png`, igual à página inicial.
- Porteiro disponível somente para condomínios Pro/Premium com mensalidade ativa.
- Dentro da área do porteiro, Pro e Premium possuem as mesmas opções operacionais, incluindo Ocorrências.
- Benefícios dos planos na página inicial corrigidos conforme os recursos reais.
- Cache/PWA atualizado para v038.

## Obrigatório no Supabase

Execute, na ordem, as migrations ainda não aplicadas e especialmente:

`supabase/migrations/028_signup_porter_plan_fixes.sql`

A migration 028 é necessária para a correção definitiva da sincronização de novos cadastros e para a restrição segura de porteiros por plano.

## Publicação

Depois de executar a migration, publique novamente o projeto na Netlify para atualizar as Functions e os arquivos web.
