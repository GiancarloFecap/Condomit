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
| A | Clientes em maquinas diferentes usam URLs LiveKit diferentes | High | Low | Pending |
| B | O backend gera nomes de sala diferentes para a mesma assembleia | High | Low | Pending |
| C | O token sai valido, mas `room.connect` falha ou conecta sem participants remotos | High | Medium | Pending |
| D | Os eventos de participant/tracks do LiveKit nao estao sendo tratados corretamente | Medium | Medium | Pending |
| E | A UI depende de sincronizacao local e por isso so funciona no mesmo computador | High | Low | Pending |

## Log Evidence
- Instrumentation added in:
  - `netlify/functions/livekit-token.js`
  - `scripts/assembly/room/index.js`
  - `scripts/assembly/room/livekit.js`
- Waiting for cross-device reproduction logs.

## Verification Conclusion
- Pending
