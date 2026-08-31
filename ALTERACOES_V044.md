# Condomit v0.44.0

## Correções

- Exclusão de conta passa a encerrar e remover imediatamente toda sessão local do Supabase e caches de usuário.
- Após a exclusão, o usuário é redirecionado para `entrar.html?deleted=1`; a página de login não tenta restaurar uma sessão antiga nesse fluxo.
- Exclusão administrativa do Supabase Auth solicita explicitamente hard delete (`should_soft_delete=false`).
- Login não oferece mais reativação de uma conta já marcada como excluída.
- Cards, linhas, e-mails e textos de Configurações agora quebram linha e permanecem dentro das caixas, inclusive com fonte grande e em celular.
- Modo escuro de Configurações recebeu contraste reforçado, removendo textos herdados em tons escuros do tema claro.
- Cache PWA atualizado para `condomit-shell-v044`.
