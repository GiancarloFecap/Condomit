# Condomit V0.72.5 - Configurações e reservas (052)

- Removido status **Dados atualizados** do dashboard.
- Configurações reorganizadas em cinco abas: Conta e perfil; Segurança e notificações; Reservas e privacidade; Condomínio e aparência; Sobre.
- Preservadas opções originais, corrigida associação de Mudar condomínio/Registrar encomenda e Sair de todos os dispositivos.
- Aba Conta e perfil abre o perfil dedicado (`perfil.html`).
- Abas e títulos respeitam preferência de idioma (pt/en) e oferecem navegação por teclado.
- Migration 052: após mudança de CEP do condomínio de um usuário, suas reservas são removidas na mesma transação da alteração; reentradas no mesmo CEP não limpam nada. A tabela legado `public.reserva` não possui coluna CEP, de modo que todas as reservas do usuário são excluídas na troca.

**Publicação:** execute `supabase/migrations/052_clear_reservations_when_changing_condominium.sql` no SQL Editor do projeto correto; em seguida publique os arquivos atualizados do site. Não execute a migration em banco errado. Revise backups, pois a exclusão é irreversível.
