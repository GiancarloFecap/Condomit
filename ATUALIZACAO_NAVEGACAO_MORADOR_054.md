# Condomit v0.72.5 — Atualização 054

- Sino de notificações retorna ao canto superior direito do aplicativo sem recriar a topbar. O popup existente continua acessível por ele, inclusive em Gestão Avançada.
- Sidebar mantém, durante a sessão e por usuário/perfil, a última seção expansível escolhida ao navegar entre páginas; uma seção aberta fecha as outras.
- Painel do morador simplificado para mural de avisos, reservas, assembleias e um link discreto ao canal de sugestões, sem cards de chat/notificações ou datas fictícias.
- Cabeçalho da página inicial fixado na parte superior durante a rolagem, mantendo textos e ícones dos botões alinhados horizontalmente.
- Seletor de idioma: “Padrão”, “Português” e “Inglês”; o comportamento de idioma automático e a preferência persistente permanecem.
- Arquivos do aplicativo mobile (`www`) reconstruídos após as alterações.
- Nenhuma migration de Supabase é necessária.

## Observação
Verificações de sintaxe e estrutura não substituem o teste de navegação real no navegador e a verificação de interação com o Supabase de produção.
