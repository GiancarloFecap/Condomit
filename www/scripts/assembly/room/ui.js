import { state } from './state.js?v=079';

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


function participantEmail(participant, meta = null) {
  const data = meta || parseMetadata(participant);
  return safeText(data?.user_email || data?.email || '').toLowerCase();
}

function participantProfilePhoto(participant, meta = null) {
  const email = participantEmail(participant, meta);
  if (email && state.profilePhotos instanceof Map) {
    const photo = safeText(state.profilePhotos.get(email));
    if (photo) return photo;
  }
  const data = meta || parseMetadata(participant);
  return safeText(data?.profile_photo || data?.profilePhoto || '');
}

function renderAvatarContent(avatar, participant, displayName, meta = null) {
  if (!avatar) return;
  const photo = participantProfilePhoto(participant, meta);
  if (avatar.dataset.photo === photo && avatar.dataset.name === displayName && avatar.childNodes.length) return;
  avatar.dataset.photo = photo;
  avatar.dataset.name = displayName;
  avatar.textContent = '';
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = `Foto de perfil de ${displayName || 'participante'}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    avatar.appendChild(img);
    avatar.classList.add('has-photo');
    return;
  }
  avatar.classList.remove('has-photo');
  avatar.textContent = getInitials(displayName);
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
  if (existing && surface._assemblyScreenTrack === track) return;
  if (existing) {
    try { surface._assemblyScreenTrack?.detach?.(existing); } catch (_) {}
    existing.remove();
  }
  try {
    const element = track.attach();
    element.playsInline = true;
    element.autoplay = true;
    element.muted = true;
    surface.appendChild(element);
    surface._assemblyScreenTrack = track;
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
    surface._assemblyScreenTrack = null;
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
  tile.dataset.participantIdentity = safeText(participant.identity);
  tile.dataset.identity = identity;

  const media = document.createElement('div');
  media.className = 'tile-media';

  const avatar = document.createElement('div');
  avatar.className = 'tile-avatar';
  renderAvatarContent(avatar, participant, displayName, meta);
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
  micIcon.className = 'tile-icon mic ' + (micOn ? 'on' : 'off');
  micIcon.title = micOn ? 'Microfone ligado' : 'Microfone desligado';
  micIcon.innerHTML = `<i class="fas ${micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>`;

  const camIcon = document.createElement('div');
  camIcon.className = 'tile-icon camera ' + (camOn ? 'on' : 'off');
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

function syncMediaIcon(icon, enabled, type) {
  if (!icon) return;
  const on = !!enabled;
  icon.classList.toggle('on', on);
  icon.classList.toggle('off', !on);
  icon.title = type === 'mic'
    ? (on ? 'Microfone ligado' : 'Microfone desligado')
    : (on ? 'Câmera ligada' : 'Câmera desligada');
  const glyph = type === 'mic' ? (on ? 'fa-microphone' : 'fa-microphone-slash')
    : (on ? 'fa-video' : 'fa-video-slash');
  const i = icon.querySelector('i');
  if (i && !i.classList.contains(glyph)) i.className = 'fas ' + glyph;
}

function updateTile(tile, participant, isLocal) {
  const meta = parseMetadata(participant);
  const identity = safeText(participant.identity || participant.sid || '');
  const displayName = safeText(participant.name || meta?.user_name || meta?.user_email || identity);
  const name = tile.querySelector('.tile-name');
  const role = tile.querySelector('.tile-role');
  if (name) name.textContent = displayName + (isLocal ? ' (você)' : '');
  if (role) role.textContent = formatUserType(meta);
  const icons = tile.querySelector('.tile-icons');
  syncMediaIcon(icons?.querySelector('.tile-icon.mic'), participant.isMicrophoneEnabled ?? false, 'mic');
  syncMediaIcon(icons?.querySelector('.tile-icon.camera'), participant.isCameraEnabled ?? false, 'camera');
  const handActive = state.raisedHands.has(identity);
  const existingHand = icons?.querySelector('.tile-icon.hand');
  if (handActive && !existingHand && icons) {
    const icon = document.createElement('div');
    icon.className = 'tile-icon hand';
    icon.title = 'Mão levantada';
    icon.innerHTML = '<i class="fas fa-hand-paper"></i>';
    icons.appendChild(icon);
  } else if (!handActive && existingHand) existingHand.remove();
  const avatar = tile.querySelector('.tile-avatar');
  if (avatar) renderAvatarContent(avatar, participant, displayName, meta);
  tile.classList.toggle('active-speaker', state.activeSpeakers.has(identity));
}

export function ensureTileAvatar(participant) {
  const identity = safeText(participant?.identity || participant?.sid || '');
  if (!identity) return;
  const tile = Array.from(el('call-grid')?.children || []).find(node => node.dataset.identity === identity);
  const media = tile?.querySelector('.tile-media');
  if (!media || media.querySelector('video')) return;
  let avatar = media.querySelector('.tile-avatar');
  if (!avatar) {
    avatar = document.createElement('div');
    avatar.className = 'tile-avatar';
    media.appendChild(avatar);
  }
  const meta = parseMetadata(participant);
  const name = safeText(participant.name || meta?.user_name || meta?.user_email || identity);
  renderAvatarContent(avatar, participant, name, meta);
}

export function updateParticipantMediaIndicators(room) {
  if (!room) return;
  const participants = [room.localParticipant, ...Array.from(room.remoteParticipants?.values() || [])].filter(Boolean);
  participants.forEach((p) => {
    const identity = safeText(p.identity || p.sid || '');
    const tile = Array.from(el('call-grid')?.children || []).find(node => node.dataset.identity === identity);
    if (tile) updateTile(tile, p, p === room.localParticipant);
    const item = Array.from(el('participants-list')?.children || []).find(node => node.dataset.participantIdentity === identity);
    if (item) {
      syncMediaIcon(item.querySelector('.tile-icon.mic'), p.isMicrophoneEnabled ?? false, 'mic');
      syncMediaIcon(item.querySelector('.tile-icon.camera'), p.isCameraEnabled ?? false, 'camera');
    }
  });
}

export function renderGrid(room) {
  const grid = el('call-grid');
  if (!grid || !room) return;
  const participants = [];
  if (room.localParticipant) participants.push({ p: room.localParticipant, local: true });
  room.remoteParticipants?.forEach(p => participants.push({ p, local: false }));
  const activeIds = new Set();
  let previous = null;
  participants.forEach(({ p, local }) => {
    const identity = safeText(p.identity || p.sid || '');
    if (!identity) return;
    activeIds.add(identity);
    let tile = Array.from(grid.children).find(node => node.dataset.identity === identity);
    if (!tile) tile = renderTile(p, local);
    if (!tile) return;
    updateTile(tile, p, local);
    if (!previous) {
      if (grid.firstElementChild !== tile) grid.prepend(tile);
    } else if (previous.nextElementSibling !== tile) previous.after(tile);
    previous = tile;
  });
  Array.from(grid.children).forEach(tile => {
    if (!activeIds.has(tile.dataset.identity)) tile.remove();
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
  const entries = [room.localParticipant, ...Array.from(room.remoteParticipants?.values() || [])].filter(Boolean);
  if (badge) badge.textContent = String(entries.length);
  const wanted = new Set();
  let previous = null;
  entries.forEach((p) => {
    const identity = safeText(p.identity || p.sid || '');
    if (!identity) return;
    wanted.add(identity);
    const meta = parseMetadata(p);
    const displayName = safeText(p.name || meta?.user_name || meta?.user_email || identity);
    let item = Array.from(list.children).find(node => node.dataset.participantIdentity === identity);
    if (!item) {
      item = document.createElement('div');
      item.className = 'panel-item';
      item.dataset.participantIdentity = identity;
      const avatar = document.createElement('div');
      avatar.className = 'panel-item-avatar';
      const info = document.createElement('div');
      info.className = 'panel-item-info';
      const name = document.createElement('div');
      name.className = 'panel-item-name';
      const role = document.createElement('div');
      role.className = 'panel-item-sub';
      info.append(name, role);
      const icons = document.createElement('div');
      icons.className = 'panel-item-icons';
      for (const type of ['mic', 'camera']) {
        const icon = document.createElement('div');
        icon.className = 'tile-icon ' + type;
        icon.appendChild(document.createElement('i'));
        icons.appendChild(icon);
      }
      item.append(avatar, info, icons);
    }
    const avatar = item.querySelector('.panel-item-avatar');
    renderAvatarContent(avatar, p, displayName, meta);
    item.querySelector('.panel-item-name').textContent = displayName;
    item.querySelector('.panel-item-sub').textContent = formatUserType(meta);
    const icons = item.querySelector('.panel-item-icons');
    syncMediaIcon(icons.querySelector('.tile-icon.mic'), p.isMicrophoneEnabled ?? false, 'mic');
    syncMediaIcon(icons.querySelector('.tile-icon.camera'), p.isCameraEnabled ?? false, 'camera');
    const hand = icons.querySelector('.tile-icon.hand');
    if (state.raisedHands.has(identity) && !hand) {
      const handIcon = document.createElement('div');
      handIcon.className = 'tile-icon hand';
      handIcon.innerHTML = '<i class="fas fa-hand-paper"></i>';
      icons.appendChild(handIcon);
    } else if (!state.raisedHands.has(identity) && hand) hand.remove();
    if (!previous) {
      if (list.firstElementChild !== item) list.prepend(item);
    } else if (previous.nextElementSibling !== item) previous.after(item);
    previous = item;
  });
  Array.from(list.children).forEach(item => {
    if (!wanted.has(item.dataset.participantIdentity)) item.remove();
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
  panel.classList.toggle('hidden', !open);
  document.querySelector('.call-body')?.classList.toggle('panel-collapsed', !open);
  const button = el('btn-toggle-panel');
  if (button) {
    button.classList.toggle('active', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-controls', 'call-panel');
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
  const ownEmail = safeText(state.tokenInfo?.user?.email).toLowerCase();
  const ownIdentity = safeText(state.room?.localParticipant?.identity || state.tokenInfo?.identity);
  const authorEmail = safeText(msg?.user_email || msg?.participant_email).toLowerCase();
  const authorIdentity = safeText(msg?.participant_identity || msg?.identity);
  const isOwn = !!((ownEmail && authorEmail === ownEmail) || (ownIdentity && authorIdentity === ownIdentity));
  row.className = isOwn ? 'chat-msg is-own' : 'chat-msg';

  const avatar = document.createElement('div');
  avatar.className = 'chat-msg-avatar';
  const msgEmail = safeText(msg?.user_email || msg?.participant_email || '').toLowerCase();
  const profilePhoto = msgEmail && state.profilePhotos instanceof Map
    ? safeText(state.profilePhotos.get(msgEmail))
    : '';
  avatar.textContent = '';
  if (profilePhoto) {
    const img = document.createElement('img');
    img.src = profilePhoto;
    img.alt = `Foto de perfil de ${name}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    avatar.appendChild(img);
    avatar.classList.add('has-photo');
  } else {
    avatar.textContent = getInitials(name);
  }

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
  const list = Array.isArray(items) ? items : [];
  const fragment = document.createDocumentFragment();
  if (badge) badge.textContent = String(list.length);
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'panel-item';
    empty.textContent = 'Nenhum item disponível';
    fragment.appendChild(empty);
  } else {
    list.forEach((item) => {
      const node = builder(item);
      if (node) fragment.appendChild(node);
    });
  }
  container.replaceChildren(fragment);
}
