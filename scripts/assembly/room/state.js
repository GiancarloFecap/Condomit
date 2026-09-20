// Condomit v0.72.3 - estado único da sala de assembleia.
// Mesmo que o navegador ainda tenha algum módulo antigo em cache com outro
// query string (?v=...), todas as importações reutilizam este mesmo objeto.
const STATE_KEY = '__condomitAssemblyRoomState';

function createInitialState() {
  return {
    assemblyId: null,
    assembly: null,
    tokenInfo: null,
    room: null,
    user: null,
    permissions: null,
    connected: false,
    activeSpeakers: new Set(),
    cameraTracks: new Map(),
    mobileCameraFacing: 'user',
    profilePhotos: new Map(),
    screenShareTrack: null,
    screenShareOwner: null,
    raisedHands: new Map(),
    panelOpen: true,
    chatSubscription: null,
    handSubscription: null,
    agendaSubscription: null,
    pollsSubscription: null,
    docsSubscription: null,
    heartbeatTimer: null
  };
}

const root = globalThis;
if (!root[STATE_KEY] || typeof root[STATE_KEY] !== 'object') {
  root[STATE_KEY] = createInitialState();
}

export const state = root[STATE_KEY];
