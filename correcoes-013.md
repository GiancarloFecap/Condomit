# Correções 013 - Chat, Gestão de Moradores e Sessão Persistente

## Chat
- Botão **Anexar arquivo** abre o seletor de arquivos.
- Arquivo selecionado aparece como prévia e só é gravado/enviado quando o usuário clica em **Enviar**.
- Limite atual: 2 MB por anexo.
- Botão **Emoji** abre um seletor de emojis e insere o emoji no ponto atual do cursor.
- Mensagens com anexos exibem um cartão para baixar o arquivo.
- Botão **Sair** das páginas de chat passa a encerrar também a sessão persistente do Supabase.

## Gestão de moradores
- Removido o botão de lápis/edição.
- O botão de olho abre um popup com nome, e-mail, telefone, apartamento, bloco, tipo, status e data de entrada no condomínio quando disponível.

## Sessão persistente
- O Supabase continua usando `persistSession: true`.
- A página inicial restaura a sessão persistida e redireciona automaticamente ao painel correspondente.
- A página de login também restaura uma sessão válida antes de exigir novo login.
- Ao apertar **Sair**, os tokens persistidos `sb-*-auth-token` são removidos para impedir login automático após logout explícito.

## Supabase
Execute `supabase/migrations/013_chat_attachments_and_session.sql` no SQL Editor depois da migration 012.
