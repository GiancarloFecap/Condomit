# Condomit v0.57.0 — Assembleia, câmeras e registro de falas

## Sala da assembleia

- Restaurado o visual clássico/antigo da página `assembleia-sala.html`.
- A sala deixa de herdar a camada global de UX que alterava o visual original.
- Restauradas as cores e componentes do `assembleia-room.css` clássico.

## Câmera no computador

- O sistema não confia mais apenas em `isCameraEnabled` para mostrar a câmera como ligada.
- A câmera só é considerada ativa quando existe uma faixa de vídeo LiveKit real, não mutada e com `MediaStreamTrack` em estado `live`.
- O `deviceId` salvo na tela de preparação é verificado antes de ser reutilizado.
- Se o dispositivo salvo não existir mais ou não iniciar, a Condomit remove essa preferência e tenta a câmera padrão automaticamente.
- Ao ligar novamente a câmera durante a reunião, também é usado o mesmo fluxo de fallback.
- O renderizador aceita `publication.videoTrack` e `publication.track`, melhorando a compatibilidade entre versões do LiveKit.

## Câmera frontal/traseira no celular

- Na preparação, a câmera atual é liberada antes da tentativa de abrir outra câmera.
- A troca de câmera solicita apenas vídeo, preservando o áudio já ativo.
- Em celular, há fallback por `facingMode` (`user`/`environment`) quando o `deviceId` não funciona.
- Dentro da sala LiveKit, a troca frontal/traseira tenta primeiro `restartTrack({ facingMode })`, conforme a API do LiveKit.
- Se necessário, a Condomit encerra completamente a captura anterior antes de abrir a câmera oposta.
- Se a troca falhar, a câmera anterior é restaurada para não deixar o usuário sem vídeo.

## Ata e falas da reunião

- A transcrição automática via Web Speech continua sendo utilizada quando o navegador oferece suporte.
- O bloqueio que desativava totalmente a tentativa de transcrição em dispositivos móveis foi removido.
- A sala também aceita segmentos de transcrição enviados pelo próprio LiveKit quando disponíveis.
- Adicionado registro persistente de atividade oral. Assim, se o navegador não conseguir converter a voz em texto, a ata sabe que houve fala e não afirma incorretamente que não houve discussão.
- Quando houve fala mas não existe texto transcrito, a ata informa de forma transparente que houve manifestação oral, sem inventar o conteúdo.
- Quando alguns participantes possuem transcrição e outros apenas atividade oral detectada, ambos os casos são registrados corretamente no texto formal.

## Erro 404

- Adicionado `favicon.ico` na raiz do projeto e no pacote mobile, cobrindo a requisição automática feita por alguns navegadores que antes podia retornar 404.
- Cache do PWA atualizado para `condomit-shell-v057`.

## Supabase

Executar a migration:

`supabase/migrations/037_assembly_camera_speech_activity.sql`

Ela cria o registro persistente e seguro de atividade oral usado como fallback da ata quando o dispositivo não fornece transcrição textual.
