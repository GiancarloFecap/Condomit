# Condomit v0.56.0

## Alterações principais

- Nova logo fornecida pelo projeto aplicada em **Entrar** e **Tipo de Usuário** (asset recortado apenas para remover o espaço vazio ao redor, sem alterar a arte da logo).
- Melhor contraste do ícone **Sair de todos os dispositivos** no modo escuro.
- Removidos da seção de notificações em Configurações os textos auxiliares sobre notificações do dispositivo.
- Removida a barra de pesquisa de **Achados e Perdidos**; filtros reorganizados por status e ordenação.
- **Configurações > Reserva e áreas comuns > Reservas e espaços das áreas comuns** abre um painel com todas as reservas do condomínio.
- Síndico pode adicionar espaços, selecionar um espaço para editar/remover e selecionar vários para exclusão em lote.
- **Informações do condomínio** agora mostra a foto/logo do condomínio e permite edição pelo síndico.
- Síndico pode atualizar a foto/logo do condomínio pelo Supabase Storage.
- **Versão do app** abre um histórico de atualizações em linguagem simples.
- Ícone do card do Mural em `notificacoes.html` ajustado para um círculo perfeito.
- Persistência de notificações lidas da migration 035 foi mantida: uma notificação marcada como lida não deve voltar a ser não lida.

## Banco de dados

Execute a migration:

`supabase/migrations/036_config_condominium_reservation_management.sql`

Ela adiciona RPCs seguras para consulta das reservas do condomínio, gerenciamento dos espaços por síndico e edição das informações do condomínio.
