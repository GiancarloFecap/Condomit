import { state } from './state.js';

function el(id) {
  return document.getElementById(id);
}

function safeText(value) {
  return String(value ?? '').trim();
}

function getInitials(name) {
  if (window.AssemblyUtils?.getInitials) return window.AssemblyUtils.getInitials(name);
  const parts = safeText(name).split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('') || 'US';
}

function parseMetadata(participant) {
  const raw = participant?.metadata;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function formatUserType(meta) {
  const t = safeText(meta?.user_type || meta?.type || meta?.participant_role).toLowerCase();
  if (!t) return 'Participante';
  if (t === 'sindico') return 'Síndico';
  if (t === 'morador') return 'Morador';
  if (t === 'porteiro') return 'Porteiro';
  if (t === 'convidado') return 'Convidado';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function setConnection(dotColor, text) {
  const container = el('call-connection');
  const dot = container?.querySelector('.dot');
  const label = el('call-connection-text');
  if (dot) dot.style.background = dotColor;
  if (label) label.textContent = text;
}

export function setConnectionConnecting() {
  setConnection('var(--call-warning)', 'Conectando...');
}

export function setConnectionConnected() {
  setConnection('var(--call-success)', 'Conectado');
}

export function setConnectionReconnecting() {
  setConnection('var(--call-warning)', 'Reconectando...');
}

export function setConnectionDisconnected() {
  setConnection('var(--call-danger)', 'Desconectado');
}

export function showBanner(message, type) {
  const banner = el('call-banner');
  if (!banner) return;
  const msg = safeText(message);
  if (!msg) {
    banner.style.display = 'none';
    banner.textContent = '';
    return;
  }
  banner.style.display = '';
  banner.textContent = msg;
  if (type === 'error') banner.style.borderColor = 'rgba(239, 68, 68, 0.55)';
  else if (type === 'warning') banner.style.borderColor = 'rgba(245, 158, 11, 0.55)';
  else banner.style.borderColor = 'rgba(59, 130, 246, 0.45)';
}

export function setHeader(assembly) {
  const title = el('call-assembly-title');
  const meta = el('call-assembly-meta');
  const name = safeText(assembly?.title || assembly?.name || 'Assembleia');
  if (title) title.textContent = name;
  const date = safeText(assembly?.date || assembly?.scheduled_at || '');
  const start = safeText(assembly?.start_time || '');
  const status = safeText(assembly?.status || '');
  const bits = [];
  if (status) bits.push(status.replace(/_/g, ' '));
  if (date) bits.push(date);
  if (start) bits.push(start);
  if (meta) meta.textContent = bits.length ? bits.join(' • ') : 'Ao vivo';
}

function clearElement(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createIcon(className, title) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tile-icon ' + className;
  wrapper.title = title;
  const i = document.createElement('i');
  i.className = 'fas ' + (className.includes('hand') ? 'fa-hand-paper' : 'fa-circle');
  wrapper.appendChild(i);
  return wrapper;
}

function ensureVideoAttached(surface, track) {
  if (!surface) return;
  const existing = surface.querySelector('video');
  if (existing) existing.remove();
  try {
    const element = track.attach();
    element.playsInline = true;
    element.autoplay = true;
    element.muted = true;
    surface.appendChild(element);
  } catch (_) {}
}

export function renderScreenShare(screenShareTrack, ownerName) {
  const container = el('call-screen-share');
  const surface = el('screen-share-surface');
  const title = el('screen-share-title');
  if (!container || !surface) return;

  if (!screenShareTrack) {
    container.style.display = 'none';
    clearElement(surface);
    return;
  }

  container.style.display = '';
  if (title) title.textContent = ownerName ? `Tela compartilhada por ${ownerName}` : 'Compartilhamento de tela';
  ensureVideoAttached(surface, screenShareTrack);
}

function renderTile(participant, isLocal) {
  const identity = safeText(participant.identity || participant.sid || '');
  if (!identity) return null;

  const meta = parseMetadata(participant);
  const displayName = safeText(participant.name || meta?.user_name || meta?.user_email || identity);
  const tile = document.createElement('div');
  tile.className = 'call-tile';
  tile.dataset.identity = identity;

  const media = document.createElement('div');
  media.className = 'tile-media';

  const avatar = document.createElement('div');
  avatar.className = 'tile-avatar';
  avatar.textContent = getInitials(displayName);
  media.appendChild(avatar);

  const footer = document.createElement('div');
  footer.className = 'tile-footer';

  const user = document.createElement('div');
  user.className = 'tile-user';

  const name = document.createElement('div');
  name.className = 'tile-name';
  name.textContent = displayName + (isLocal ? ' (você)' : '');

  const role = document.createElement('div');
  role.className = 'tile-role';
  role.textContent = formatUserType(meta);

  user.appendChild(name);
  user.appendChild(role);

  const icons = document.createElement('div');
  icons.className = 'tile-icons';

  const micOn = participant.isMicrophoneEnabled ?? true;
  const camOn = participant.isCameraEnabled ?? true;

  const micIcon = document.createElement('div');
  micIcon.className = 'tile-icon ' + (micOn ? 'on' : 'off');
  micIcon.title = micOn ? 'Microfone ligado' : 'Microfone desligado';
  micIcon.innerHTML = `<i class="fas ${micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>`;

  const camIcon = document.createElement('div');
  camIcon.className = 'tile-icon ' + (camOn ? 'on' : 'off');
  camIcon.title = camOn ? 'Câmera ligada' : 'Câmera desligada';
  camIcon.innerHTML = `<i class="fas ${camOn ? 'fa-video' : 'fa-video-slash'}"></i>`;

  icons.appendChild(micIcon);
  icons.appendChild(camIcon);

  const hand = state.raisedHands.get(identity);
  if (hand) {
    const handIcon = document.createElement('div');
    handIcon.className = 'tile-icon hand';
    handIcon.title = 'Mão levantada';
    handIcon.innerHTML = `<i class="fas fa-hand-paper"></i>`;
    icons.appendChild(handIcon);
  }

  footer.appendChild(user);
  footer.appendChild(icons);

  tile.appendChild(media);
  tile.appendChild(footer);

  if (state.activeSpeakers.has(identity)) {
    tile.classList.add('active-speaker');
  }

  return tile;
}

export function renderGrid(room) {
  const grid = el('call-grid');
  if (!grid || !room) return;

  const participants = [];
  if (room.localParticipant) participants.push({ p: room.localParticipant, local: true });
  room.remoteParticipants?.forEach(p => participants.push({ p, local: false }));

  clearElement(grid);
  participants.forEach(({ p, local }) => {
    const tile = renderTile(p, local);
    if (tile) grid.appendChild(tile);
  });
}

export function updateHandIndicators(room) {
  if (!room) return;

  const participants = [];
  if (room.localParticipant) participants.push(room.localParticipant);
  room.remoteParticipants?.forEach((participant) => participants.push(participant));

  participants.forEach((participant) => {
    const identity = safeText(participant?.identity || participant?.sid || '');
    if (!identity) return;

    const tile = document.querySelector(
      `.call-tile[data-identity="${CSS.escape(identity)}"]`
    );
    if (!tile) return;

    const icons = tile.querySelector('.tile-icons');
    if (!icons) return;

    const active = state.raisedHands.has(identity);
    const existing = icons.querySelector('.tile-icon.hand');

    if (active && !existing) {
      const handIcon = document.createElement('div');
      handIcon.className = 'tile-icon hand';
      handIcon.title = 'Mão levantada';
      handIcon.innerHTML = '<i class="fas fa-hand-paper"></i>';
      icons.appendChild(handIcon);
    } else if (!active && existing) {
      existing.remove();
    }
  });

  const localIdentity = safeText(
    room.localParticipant?.identity || state.tokenInfo?.identity || ''
  );
  setControlActive(
    'btn-hand',
    !!localIdentity && state.raisedHands.has(localIdentity)
  );
}

export function renderParticipantsList(room) {
  const list = el('participants-list');
  const badge = el('participants-count');
  if (!list || !room) return;

  const entries = [];
  if (room.localParticipant) entries.push(room.localParticipant);
  room.remoteParticipants?.forEach(p => entries.push(p));

  clearElement(list);
  if (badge) badge.textContent = String(entries.length);

  entries.forEach((p) => {
    const meta = parseMetadata(p);
    const displayName = safeText(p.name || meta?.user_name || meta?.user_email || p.identity);
    const item = document.createElement('div');
    item.className = 'panel-item';

    const avatar = document.createElement('div');
    avatar.className = 'panel-item-avatar';
    avatar.textContent = getInitials(displayName);

    const info = document.createElement('div');
    info.className = 'panel-item-info';

    const name = document.createElement('div');
    name.className = 'panel-item-name';
    name.textContent = displayName;

    const sub = document.createElement('div');
    sub.className = 'panel-item-sub';
    sub.textContent = formatUserType(meta);

    info.appendChild(name);
    info.appendChild(sub);

    const icons = document.createElement('div');
    icons.className = 'panel-item-icons';

    const micOn = p.isMicrophoneEnabled ?? true;
    const camOn = p.isCameraEnabled ?? true;

    const micIcon = document.createElement('div');
    micIcon.className = 'tile-icon ' + (micOn ? 'on' : 'off');
    micIcon.innerHTML = `<i class="fas ${micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>`;

    const camIcon = document.createElement('div');
    camIcon.className = 'tile-icon ' + (camOn ? 'on' : 'off');
    camIcon.innerHTML = `<i class="fas ${camOn ? 'fa-video' : 'fa-video-slash'}"></i>`;

    icons.appendChild(micIcon);
    icons.appendChild(camIcon);

    if (state.raisedHands.get(p.identity)) {
      const hand = document.createElement('div');
      hand.className = 'tile-icon hand';
      hand.innerHTML = `<i class="fas fa-hand-paper"></i>`;
      icons.appendChild(hand);
    }

    item.appendChild(avatar);
    item.appendChild(info);
    item.appendChild(icons);

    list.appendChild(item);
  });
}

export function setControlActive(id, active) {
  const btn = el(id);
  if (!btn) return;
  btn.classList.toggle('active', !!active);
}

export function setPanelOpen(open) {
  state.panelOpen = !!open;
  const panel = el('call-panel');
  if (!panel) return;
  if (window.matchMedia('(max-width: 1024px)').matches) {
    panel.classList.toggle('hidden', !open);
  }
}

export function formatTimeBR(value) {
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

export function renderChatMessage(msg) {
  const container = el('chat-messages');
  if (!container) return;

  const name = safeText(msg?.participant_name || msg?.user_name || msg?.user_email || 'Participante');
  const text = safeText(msg?.message || msg?.text || '');
  const time = msg?.created_at ? formatTimeBR(msg.created_at) : '';

  const row = document.createElement('div');
  row.className = 'chat-msg';

  const avatar = document.createElement('div');
  avatar.className = 'chat-msg-avatar';
  avatar.textContent = getInitials(name);

  const body = document.createElement('div');
  body.className = 'chat-msg-body';

  const header = document.createElement('div');
  header.className = 'chat-msg-header';

  const nameEl = document.createElement('div');
  nameEl.className = 'chat-msg-name';
  nameEl.textContent = name;

  const timeEl = document.createElement('div');
  timeEl.className = 'chat-msg-time';
  timeEl.textContent = time;

  const textEl = document.createElement('div');
  textEl.className = 'chat-msg-text';
  textEl.textContent = text;

  header.appendChild(nameEl);
  if (time) header.appendChild(timeEl);
  body.appendChild(header);
  body.appendChild(textEl);

  row.appendChild(avatar);
  row.appendChild(body);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;

  const badge = el('chat-count');
  if (badge) badge.textContent = String(container.querySelectorAll('.chat-msg').length);
}

export function renderSimpleList(containerId, badgeId, items, builder) {
  const container = el(containerId);
  const badge = el(badgeId);
  if (!container) return;
  clearElement(container);
  const list = Array.isArray(items) ? items : [];
  if (badge) badge.textContent = String(list.length);
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-item';
    empty.textContent = 'Nenhum item disponível';
    container.appendChild(empty);
    return;
  }
  list.forEach((item) => {
    const node = builder(item);
    if (node) container.appendChild(node);
  });
}
