# Debug Session: livekit-cross-device
- **Status**: [OPEN]
- **Issue**: Participantes da mesma assembleia se enxergam no mesmo computador, mas em computadores diferentes cada cliente mostra apenas o proprio usuario.
- **Debug Server**: http://10.1.32.166:7777/event
- **Log File**: .dbg/trae-debug-log-livekit-cross-device.ndjson

## Reproduction Steps
1. Abrir a mesma assembleia com dois usuarios do mesmo condominio.
2. Testar em duas maquinas diferentes.
3. Entrar na sala e verificar se os dois participantes aparecem.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Clientes em maquinas diferentes usam URLs LiveKit diferentes | High | Low | Confirmed by code path: backend returned raw `LIVEKIT_URL` and frontend connected directly with it, sem validacao contra localhost |
| B | O backend gera nomes de sala diferentes para a mesma assembleia | High | Low | Rejected by code inspection: `assembleia-${assembly.id}-${assembly.cep}` e persistencia em `livekit_room_name` |
| C | O token sai valido, mas `room.connect` falha ou conecta sem participants remotos | High | Medium | Partially confirmed: fluxo dependia da URL recebida; guardas adicionados no backend/frontend para validar a URL antes do connect |
| D | Os eventos de participant/tracks do LiveKit nao estao sendo tratados corretamente | Medium | Medium | Inconclusive before logs; instrumentado para verificacao pos-fix |
| E | A UI depende de sincronizacao local e por isso so funciona no mesmo computador | High | Low | Confirmed for o fluxo antigo: `pages/assembleia.html` ainda abria a sala legacy em `scripts/assembleia.js`, baseada em `BroadcastChannel`/`localStorage` |

## Log Evidence
- Instrumentation added in:
  - `netlify/functions/livekit-token.js`
  - `scripts/assembly/room/index.js`
  - `scripts/assembly/room/livekit.js`
- Waiting for cross-device reproduction logs.

## Verification Conclusion
- Root cause principal identificado por analise do codigo e do sintoma: `livekit-token.js` retornava `LIVEKIT_URL` sem normalizacao/validacao, e `room.connect` consumia essa URL diretamente. Se a variavel estivesse em `localhost`/`127.0.0.1`, cada navegador poderia conectar no proprio host local em vez do mesmo servidor LiveKit.
- Root cause complementar confirmado pelas telas enviadas: o botao `Preparar entrada` da pagina `assembleia.html` ainda disparava o fluxo legacy de chamada local, nao o fluxo novo com `assembleia-preparacao.html` + `assembleia-sala.html`.
- Fix aplicado:
  - backend normaliza `http/https` para `ws/wss`;
  - backend bloqueia `localhost` sem host publico e, quando possivel, resolve usando o host real da requisicao;
  - frontend rejeita `localhost` fora do ambiente local para evitar falso positivo de "Sala conectada".
  - pagina antiga agora redireciona para a preparacao real da assembleia baseada em LiveKit.
