const ASSEMBLY_PARTICIPANT_TTL_MS = 45000;
const PARTICIPANT_HEARTBEAT_MS = 12000;
const MAX_CHAT_MESSAGES = 400;

let scheduledAssemblies = [];
let pastAssemblies = [];

const assemblyData = {
    1: {
        title: 'Assembleia Extraordinaria',
        summary: '<p>Resumo da assembleia sera exibido aqui.</p>',
        comments: []
    }
};

const assemblyState = {
    micOn: false,
    cameraOn: false,
    chatOpen: false,
    roomOpen: false,
    preJoinOpen: false,
    joining: false,
    currentAssemblyId: null,
    currentAssembly: null,
    preJoinAssemblyId: null,
    preJoinAssembly: null,
    viewingPastAssemblyId: null,
    currentUser: null,
    selectedImageData: null,
    participants: [],
    channel: null,
    participantHeartbeatTimer: null,
    participantCleanupTimer: null,
    myPeerId: null,
    preJoinDevices: {
        audioInputs: [],
        videoInputs: [],
        audioOutputs: []
    },
    preJoinSelections: {
        audioInput: '',
        videoInput: '',
        audioOutput: ''
    },
    preJoinPermissions: {
        microphone: 'prompt',
        camera: 'prompt'
    },
    preJoinLastError: '',
    preJoinAudioContext: null,
    preJoinAudioMeterTimer: null,
    localAudioTrack: null,
    localVideoTrack: null
};

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getInitials(name) {
    if (!name) return 'US';
    return String(name)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((chunk) => chunk[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function getCurrentTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getMyPeerId() {
    if (assemblyState.myPeerId) return assemblyState.myPeerId;

    try {
        const existing = sessionStorage.getItem('condomitPeerId');
        if (existing) {
            assemblyState.myPeerId = existing;
            return existing;
        }
    } catch (_) {}

    const created = `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    assemblyState.myPeerId = created;

    try {
        sessionStorage.setItem('condomitPeerId', created);
    } catch (_) {}

    return created;
}

function channelKeyFor(assemblyId) {
    return `condomit-assembly-${String(assemblyId)}`;
}

function chatKeyFor(assemblyId) {
    return `condomit-chat-${String(assemblyId)}`;
}

function participantsKeyFor(assemblyId) {
    return `condomit-participants-${String(assemblyId)}`;
}

function getUserIdentity(user) {
    if (!user) return '';
    if (user.email) return String(user.email).trim().toLowerCase();
    return String(getMyPeerId());
}

function getParticipantIdentity(participant) {
    if (!participant) return '';
    if (participant.email) return String(participant.email).trim().toLowerCase();
    if (participant.peerId) return String(participant.peerId);
    return '';
}

function normalizeParticipant(participant) {
    if (!participant) return null;

    const type = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(participant)
        : (participant.type || participant.user_type || 'morador');

    return {
        peerId: participant.peerId || null,
        email: participant.email || null,
        name: participant.name || 'Usuario',
        initials: participant.initials || getInitials(participant.name),
        type: type || 'morador',
        profilePhoto: participant.profilePhoto || null,
        micOn: participant.micOn !== false,
        cameraOn: participant.cameraOn === true,
        lastSeen: participant.lastSeen || Date.now()
    };
}

function sortParticipants(list) {
    return [...list].sort((left, right) => {
        const leftPriority = left.type === 'sindico' ? 0 : 1;
        const rightPriority = right.type === 'sindico' ? 0 : 1;

        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return (left.name || '').localeCompare(right.name || '', 'pt-BR');
    });
}

function dedupeParticipants(list) {
    const merged = new Map();
    const currentIdentity = getUserIdentity(assemblyState.currentUser);
    const myPeerId = getMyPeerId();

    (Array.isArray(list) ? list : []).forEach((rawParticipant) => {
        const participant = normalizeParticipant(rawParticipant);
        if (!participant) return;

        const identity = getParticipantIdentity(participant);
        if (!identity) return;

        if (identity === currentIdentity || participant.peerId === myPeerId) {
            return;
        }

        const existing = merged.get(identity);
        if (!existing || (participant.lastSeen || 0) >= (existing.lastSeen || 0)) {
            merged.set(identity, participant);
        } else {
            merged.set(identity, {
                ...participant,
                ...existing,
                lastSeen: Math.max(participant.lastSeen || 0, existing.lastSeen || 0)
            });
        }
    });

    return sortParticipants(Array.from(merged.values()));
}

function persistParticipantList(assemblyId, list) {
    if (!assemblyId) return;

    try {
        localStorage.setItem(participantsKeyFor(assemblyId), JSON.stringify(dedupeParticipants(list)));
    } catch (_) {}
}

function loadPersistedParticipants(assemblyId) {
    if (!assemblyId) return [];

    try {
        const raw = localStorage.getItem(participantsKeyFor(assemblyId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return dedupeParticipants(parsed);
    } catch (_) {
        return [];
    }
}

function persistChatMessage(assemblyId, message) {
    if (!assemblyId || !message) return;

    try {
        const key = chatKeyFor(assemblyId);
        const raw = localStorage.getItem(key);
        let messages = [];

        if (raw) {
            try {
                messages = JSON.parse(raw);
            } catch (_) {
                messages = [];
            }
        }

        if (!Array.isArray(messages)) messages = [];
        if (message.id && messages.some((entry) => entry && entry.id === message.id)) return;

        messages.push(message);
        if (messages.length > MAX_CHAT_MESSAGES) {
            messages = messages.slice(-MAX_CHAT_MESSAGES);
        }

        localStorage.setItem(key, JSON.stringify(messages));
    } catch (_) {}
}

function loadPersistedChatHistory(assemblyId) {
    const messagesDiv = $('chat-messages');
    if (!messagesDiv) return;

    messagesDiv.innerHTML = '';

    try {
        const raw = localStorage.getItem(chatKeyFor(assemblyId));
        if (!raw) return;

        const messages = JSON.parse(raw);
        if (!Array.isArray(messages)) return;

        messages.forEach((message) => appendIncomingChatMessage(message, { history: true }));
    } catch (_) {}
}

function serializeParticipantFromCurrentUser(overrides = {}) {
    if (!assemblyState.currentUser) return null;

    const type = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(assemblyState.currentUser)
        : (assemblyState.currentUser.type || assemblyState.currentUser.user_type || 'morador');

    return {
        peerId: overrides.peerId || getMyPeerId(),
        email: assemblyState.currentUser.email || null,
        name: assemblyState.currentUser.name || 'Usuario',
        initials: getInitials(assemblyState.currentUser.name),
        type: type || 'morador',
        profilePhoto: assemblyState.currentUser.profilePhoto || null,
        micOn: typeof overrides.micOn === 'boolean' ? overrides.micOn : assemblyState.micOn,
        cameraOn: typeof overrides.cameraOn === 'boolean' ? overrides.cameraOn : assemblyState.cameraOn,
        lastSeen: Date.now()
    };
}

function updateParticipants(list, options = {}) {
    assemblyState.participants = dedupeParticipants(list);

    if (options.persist !== false && assemblyState.currentAssemblyId) {
        persistParticipantList(assemblyState.currentAssemblyId, assemblyState.participants);
    }

    if (options.render !== false) {
        renderParticipants();
    }
}

function sendParticipantPresence(options = {}) {
    if (!assemblyState.currentAssemblyId || !assemblyState.currentUser) return;

    const participant = serializeParticipantFromCurrentUser(options);
    if (!participant) return;

    updateParticipants([...assemblyState.participants, participant], { persist: true, render: true });

    broadcastToAssembly('participant-presence', {
        ...participant,
        announce: options.announce === true
    });
}

function removeParticipant(match = {}) {
    const nextParticipants = assemblyState.participants.filter((participant) => {
        const samePeer = match.peerId && participant.peerId === match.peerId;
        const sameEmail = match.email && participant.email && String(participant.email).toLowerCase() === String(match.email).toLowerCase();
        return !(samePeer || sameEmail);
    });

    updateParticipants(nextParticipants, { persist: true, render: true });
}

function broadcastToAssembly(type, data) {
    if (!assemblyState.channel) return;

    try {
        assemblyState.channel.postMessage({
            type,
            ts: Date.now(),
            data
        });
    } catch (_) {}
}

function startParticipantHeartbeat() {
    if (assemblyState.participantHeartbeatTimer) return;

    sendParticipantPresence({ announce: true });

    assemblyState.participantHeartbeatTimer = setInterval(() => {
        sendParticipantPresence();
    }, PARTICIPANT_HEARTBEAT_MS);
}

function closeAssemblyChannel() {
    if (assemblyState.channel) {
        try {
            assemblyState.channel.close();
        } catch (_) {}
        assemblyState.channel = null;
    }

    if (assemblyState.participantHeartbeatTimer) {
        clearInterval(assemblyState.participantHeartbeatTimer);
        assemblyState.participantHeartbeatTimer = null;
    }

    if (assemblyState.participantCleanupTimer) {
        clearInterval(assemblyState.participantCleanupTimer);
        assemblyState.participantCleanupTimer = null;
    }
}

function openAssemblyChannel(assemblyId) {
    closeAssemblyChannel();
    updateParticipants(loadPersistedParticipants(assemblyId), { persist: false, render: true });
    loadPersistedChatHistory(assemblyId);

    try {
        const channel = new BroadcastChannel(channelKeyFor(assemblyId));
        channel.onmessage = (event) => handleAssemblyMessage(assemblyId, event.data);
        assemblyState.channel = channel;
    } catch (_) {
        assemblyState.channel = null;
        showToast('A sincronizacao em tempo real ficou indisponivel nesta aba.', 'warning');
    }

    assemblyState.participantCleanupTimer = setInterval(() => {
        const now = Date.now();
        const filtered = assemblyState.participants.filter((participant) => {
            return now - (participant.lastSeen || 0) < ASSEMBLY_PARTICIPANT_TTL_MS;
        });

        if (filtered.length !== assemblyState.participants.length) {
            updateParticipants(filtered, { persist: true, render: true });
        }
    }, 5000);
}

function handleAssemblyMessage(assemblyId, message) {
    if (!message || message.type == null) return;
    if (String(assemblyId) !== String(assemblyState.currentAssemblyId)) return;

    const data = message.data || {};

    switch (message.type) {
        case 'participant-presence': {
            const participant = normalizeParticipant({
                ...data,
                lastSeen: message.ts || Date.now()
            });
            if (!participant) return;

            updateParticipants([...assemblyState.participants, participant], { persist: true, render: true });

            if (data.announce && participant.peerId !== getMyPeerId()) {
                setTimeout(() => sendParticipantPresence(), 150);
            }
            break;
        }

        case 'participant-leave': {
            removeParticipant({
                peerId: data.peerId || null,
                email: data.email || null
            });
            break;
        }

        case 'participant-request-roster': {
            sendParticipantPresence();
            break;
        }

        case 'chat-message': {
            if (!data || !data.id) return;
            persistChatMessage(assemblyState.currentAssemblyId, data);
            appendIncomingChatMessage(data);
            break;
        }
    }
}

function setOverlayOpen(element, open) {
    if (!element) return;
    element.classList.toggle('active', open);
    element.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function setPageScrollLocked(locked) {
    document.body.style.overflow = locked ? 'hidden' : 'auto';
}

function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        return window.showToast(message, type);
    }

    const container = $('toast-container');
    if (!container || !message) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 220);
    }, 3200);
}

function getLocalVideoStream() {
    if (!assemblyState.localVideoTrack || !assemblyState.cameraOn) return null;
    return new MediaStream([assemblyState.localVideoTrack]);
}

function syncVideoElement(videoElement, stream) {
    if (!videoElement) return;

    if (stream) {
        if (videoElement.srcObject !== stream) {
            videoElement.srcObject = stream;
        }
        return;
    }

    if (videoElement.srcObject) {
        videoElement.srcObject = null;
    }
}

function stopLocalTrack(kind) {
    if (kind === 'audio' && assemblyState.localAudioTrack) {
        try {
            assemblyState.localAudioTrack.stop();
        } catch (_) {}
        assemblyState.localAudioTrack = null;
    }

    if (kind === 'video' && assemblyState.localVideoTrack) {
        try {
            assemblyState.localVideoTrack.stop();
        } catch (_) {}
        assemblyState.localVideoTrack = null;
    }
}

function stopAllLocalMedia() {
    stopLocalTrack('audio');
    stopLocalTrack('video');
}

function ensureRoomVideoElement() {
    const selfCard = document.querySelector('.video-box.self-card');
    if (!selfCard) return null;

    let videoElement = $('local-video');
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.id = 'local-video';
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.muted = true;
    }

    if (!selfCard.contains(videoElement)) {
        selfCard.prepend(videoElement);
    }

    return videoElement;
}

function updateLocalVideoTargets() {
    const stream = getLocalVideoStream();

    const prejoinVideo = $('prejoin-video');
    const prejoinAvatar = $('prejoin-avatar');
    const prejoinEmpty = $('prejoin-preview-empty');
    const prejoinPreview = $('prejoin-preview');

    if (prejoinPreview) {
        prejoinPreview.classList.toggle('has-video', Boolean(stream));
    }

    syncVideoElement(prejoinVideo, stream);

    if (prejoinVideo) {
        prejoinVideo.classList.toggle('active', Boolean(stream));
    }

    if (prejoinAvatar) {
        prejoinAvatar.classList.toggle('hidden', Boolean(stream));
    }

    if (prejoinEmpty) {
        prejoinEmpty.classList.toggle('hidden', Boolean(stream));
    }

    if (assemblyState.roomOpen) {
        const roomVideo = ensureRoomVideoElement();
        syncVideoElement(roomVideo, stream);
        if (roomVideo) {
            roomVideo.classList.toggle('active', Boolean(stream));
        }
    }
}

function getUserTypeLabel(user) {
    const type = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(user || assemblyState.currentUser || {})
        : ((user && (user.type || user.user_type)) || 'morador');

    if (type === 'sindico') return 'Sindico';
    if (type === 'porteiro') return 'Porteiro';
    return 'Morador';
}

function getCondominiumLabel(user) {
    if (!user) return 'Condominio atual';

    if (user.condominium && typeof user.condominium === 'object') {
        return user.condominium.name
            || user.condominium.condominium_name
            || user.condominium.cep
            || 'Condominio atual';
    }

    if (typeof user.condominium === 'string') {
        try {
            const parsed = JSON.parse(user.condominium);
            return parsed?.name || parsed?.condominium_name || parsed?.cep || 'Condominio atual';
        } catch (_) {
            return user.condominium;
        }
    }

    return user.cep || user.condominium_cep || 'Condominio atual';
}

function stopPreJoinAudioMeter() {
    if (assemblyState.preJoinAudioMeterTimer) {
        clearInterval(assemblyState.preJoinAudioMeterTimer);
        assemblyState.preJoinAudioMeterTimer = null;
    }

    if (assemblyState.preJoinAudioContext) {
        try {
            assemblyState.preJoinAudioContext.close();
        } catch (_) {}
        assemblyState.preJoinAudioContext = null;
    }

    const meterBar = $('prejoin-audio-meter-bar');
    const meterLabel = $('prejoin-audio-meter-label');

    if (meterBar) meterBar.style.width = '0%';
    if (meterLabel) meterLabel.textContent = assemblyState.micOn ? 'Aguardando sinal' : 'Sem captura';
}

function startPreJoinAudioMeter(track) {
    stopPreJoinAudioMeter();

    if (!track) return;

    try {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;

        const context = new AudioContextCtor();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;

        const stream = new MediaStream([track]);
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const meterBar = $('prejoin-audio-meter-bar');
        const meterLabel = $('prejoin-audio-meter-label');

        assemblyState.preJoinAudioContext = context;
        assemblyState.preJoinAudioMeterTimer = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((sum, value) => sum + value, 0) / (dataArray.length || 1);
            const percent = Math.max(4, Math.min(100, Math.round((average / 180) * 100)));

            if (meterBar) meterBar.style.width = `${assemblyState.micOn ? percent : 0}%`;

            if (meterLabel) {
                meterLabel.textContent = !assemblyState.micOn
                    ? 'Sem captura'
                    : average > 45
                        ? 'Microfone detectando voz'
                        : 'Fale para testar';
            }
        }, 120);
    } catch (_) {
        stopPreJoinAudioMeter();
    }
}

async function getPermissionState(name) {
    try {
        if (!navigator.permissions || !navigator.permissions.query) return 'unsupported';
        const status = await navigator.permissions.query({ name });
        return status && status.state ? status.state : 'prompt';
    } catch (_) {
        return 'unsupported';
    }
}

async function refreshPreJoinPermissions() {
    const [microphone, camera] = await Promise.all([
        getPermissionState('microphone'),
        getPermissionState('camera')
    ]);

    if (!assemblyState.micOn && microphone !== 'unsupported') {
        assemblyState.preJoinPermissions.microphone = microphone;
    } else if (assemblyState.micOn) {
        assemblyState.preJoinPermissions.microphone = 'granted';
    }

    if (!assemblyState.cameraOn && camera !== 'unsupported') {
        assemblyState.preJoinPermissions.camera = camera;
    } else if (assemblyState.cameraOn) {
        assemblyState.preJoinPermissions.camera = 'granted';
    }
}

function isMobilePreJoinDevice() {
    const ua = String(navigator.userAgent || '');
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
        || window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

function normalizePreJoinCameras(devices) {
    const cameras = Array.isArray(devices) ? devices.filter(Boolean) : [];
    if (!isMobilePreJoinDevice() || cameras.length <= 1) {
        return cameras.map((device, index) => ({ device, label: device.label || `Câmera ${index + 1}` }));
    }
    const labelOf = (device) => String(device?.label || '').toLowerCase();
    let front = cameras.find((device) => /facing\s*front|camera\s*1|front|user|frontal|frente|facetime/.test(labelOf(device)));
    let back = cameras.find((device) => /facing\s*back|camera\s*0|back|rear|environment|traseir/.test(labelOf(device)));
    if (!front) front = cameras[0] || null;
    if (!back) back = cameras.find((device) => device !== front) || null;
    const result = [];
    if (front) result.push({ device: front, label: 'Câmera frontal' });
    if (back && back !== front) result.push({ device: back, label: 'Câmera traseira' });
    return result;
}

function populateDeviceSelect(selectId, devices, selectedValue, emptyLabel) {
    const select = $(selectId);
    if (!select) return;

    const rawDevices = Array.isArray(devices) ? devices : [];
    const cameraEntries = selectId === 'prejoin-video-input' ? normalizePreJoinCameras(rawDevices) : null;
    const safeDevices = cameraEntries ? cameraEntries.map((entry) => entry.device) : rawDevices;
    select.innerHTML = '';

    if (!safeDevices.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = emptyLabel;
        select.appendChild(option);
        select.value = '';
        return;
    }

    safeDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId || '';
        option.textContent = cameraEntries
            ? cameraEntries[index].label
            : (device.label || `${emptyLabel} ${index + 1}`);
        select.appendChild(option);
    });

    const resolved = safeDevices.some((device) => device.deviceId === selectedValue)
        ? selectedValue
        : (safeDevices[0].deviceId || '');

    select.value = resolved;

    if (selectId === 'prejoin-audio-input') {
        assemblyState.preJoinSelections.audioInput = resolved;
    } else if (selectId === 'prejoin-video-input') {
        assemblyState.preJoinSelections.videoInput = resolved;
    } else if (selectId === 'prejoin-audio-output') {
        assemblyState.preJoinSelections.audioOutput = resolved;
    }
}

async function refreshPreJoinDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        assemblyState.preJoinDevices = { audioInputs: [], videoInputs: [], audioOutputs: [] };
        return;
    }

    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((device) => device.kind === 'audioinput');
        const videoInputs = devices.filter((device) => device.kind === 'videoinput');
        const audioOutputs = devices.filter((device) => device.kind === 'audiooutput');

        assemblyState.preJoinDevices = { audioInputs, videoInputs, audioOutputs };

        if (!assemblyState.preJoinSelections.audioInput && audioInputs[0]) {
            assemblyState.preJoinSelections.audioInput = audioInputs[0].deviceId || '';
        }

        if (!assemblyState.preJoinSelections.videoInput && videoInputs[0]) {
            const preferredVideoDevices = normalizePreJoinCameras(videoInputs);
            const preferredCamera = preferredVideoDevices[0]?.device || videoInputs[0];
            assemblyState.preJoinSelections.videoInput = preferredCamera.deviceId || '';
        }

        if (!assemblyState.preJoinSelections.audioOutput && audioOutputs[0]) {
            assemblyState.preJoinSelections.audioOutput = audioOutputs[0].deviceId || '';
        }

        populateDeviceSelect('prejoin-audio-input', audioInputs, assemblyState.preJoinSelections.audioInput, 'Microfone indisponivel');
        populateDeviceSelect('prejoin-video-input', videoInputs, assemblyState.preJoinSelections.videoInput, 'Camera indisponivel');
        populateDeviceSelect('prejoin-audio-output', audioOutputs, assemblyState.preJoinSelections.audioOutput, 'Saida padrao do sistema');
    } catch (_) {
        assemblyState.preJoinDevices = { audioInputs: [], videoInputs: [], audioOutputs: [] };
    }
}

async function applySelectedAudioOutput() {
    const previewVideo = $('prejoin-video');
    if (!previewVideo) return;

    const deviceId = assemblyState.preJoinSelections.audioOutput || '';
    if (!deviceId) return;
    if (typeof previewVideo.setSinkId !== 'function') return;

    try {
        await previewVideo.setSinkId(deviceId);
    } catch (_) {}
}

function renderPreJoinMessages() {
    const container = $('prejoin-messages');
    if (!container) return;

    const messages = [];
    const hasMic = assemblyState.preJoinDevices.audioInputs.length > 0;
    const hasCamera = assemblyState.preJoinDevices.videoInputs.length > 0;
    const micDenied = assemblyState.preJoinPermissions.microphone === 'denied';
    const cameraDenied = assemblyState.preJoinPermissions.camera === 'denied';

    if (assemblyState.preJoinLastError) {
        messages.push({ type: 'error', text: assemblyState.preJoinLastError });
    }

    if (!hasMic) {
        messages.push({ type: 'warning', text: 'Nenhum microfone foi encontrado neste dispositivo.' });
    } else if (micDenied) {
        messages.push({ type: 'warning', text: 'O navegador bloqueou o microfone. Libere a permissao para usar audio.' });
    }

    if (!hasCamera) {
        messages.push({ type: 'warning', text: 'Nenhuma camera foi encontrada neste dispositivo.' });
    } else if (cameraDenied) {
        messages.push({ type: 'warning', text: 'O navegador bloqueou a camera. Libere a permissao para usar video.' });
    }

    if (!messages.length) {
        messages.push({
            type: 'info',
            text: 'Revise seus dispositivos e escolha como deseja entrar. Voce tambem pode entrar so com audio ou com tudo desligado.'
        });
    }

    container.innerHTML = messages.map((message) => `
        <div class="prejoin-message prejoin-message-${message.type}">
            <i class="fas ${message.type === 'error' ? 'fa-circle-exclamation' : message.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
            <span>${escapeHtml(message.text)}</span>
        </div>
    `).join('');
}

function updatePreJoinPreviewAvatar() {
    const avatar = $('prejoin-avatar');
    const compactAvatar = $('prejoin-user-avatar');
    const userName = $('prejoin-user-name');
    const userRole = $('prejoin-user-role');
    const condoName = $('prejoin-condo-name');
    const initials = getInitials(assemblyState.currentUser ? assemblyState.currentUser.name : 'Usuario');

    if (avatar) {
        if (assemblyState.currentUser && assemblyState.currentUser.profilePhoto) {
            avatar.innerHTML = `<img src="${escapeHtml(assemblyState.currentUser.profilePhoto)}" alt="Avatar">`;
        } else {
            avatar.textContent = initials;
        }
    }

    if (compactAvatar) {
        if (assemblyState.currentUser && assemblyState.currentUser.profilePhoto) {
            compactAvatar.innerHTML = `<img src="${escapeHtml(assemblyState.currentUser.profilePhoto)}" alt="Avatar">`;
        } else {
            compactAvatar.textContent = initials;
        }
    }

    if (userName) {
        userName.textContent = assemblyState.currentUser?.name || 'Usuario';
    }

    if (userRole) {
        userRole.textContent = getUserTypeLabel(assemblyState.currentUser);
    }

    if (condoName) {
        condoName.textContent = getCondominiumLabel(assemblyState.currentUser);
    }
}

function updateChatUI() {
    const chatSidebar = $('chat-sidebar');
    if (!chatSidebar) return;

    chatSidebar.classList.toggle('closed', !assemblyState.chatOpen);
}

function updateRoomMeta() {
    const subtitle = $('assembly-subtitle');
    const status = $('assembly-connection-status');
    const participantsSummary = $('assembly-participants-summary');
    const totalParticipants = 1 + assemblyState.participants.length;

    if (subtitle) {
        if (assemblyState.roomOpen) {
            subtitle.textContent = assemblyState.participants.length > 0
                ? 'Sala ativa com participantes em acompanhamento.'
                : 'Sala pronta. Aguardando mais participantes.';
        } else {
            subtitle.textContent = 'Sala pronta para participacao.';
        }
    }

    if (status) {
        status.textContent = assemblyState.roomOpen ? 'Sala conectada' : 'Sala inativa';
        status.classList.toggle('online', assemblyState.roomOpen);
    }

    if (participantsSummary) {
        participantsSummary.textContent = `${totalParticipants} participante${totalParticipants > 1 ? 's' : ''}`;
    }
}

function updateControlsUI() {
    const micButton = $('mic-btn');
    const cameraButton = $('camera-btn');
    const micStatus = $('prejoin-mic-status');
    const cameraStatus = $('prejoin-camera-status');
    const permissionStatus = $('prejoin-permission-status');
    const micToggle = $('prejoin-mic-toggle');
    const cameraToggle = $('prejoin-camera-toggle');
    const connectionBadge = $('prejoin-connection-badge');
    const modeBadge = $('prejoin-mode-badge');
    const confirmJoinBtn = $('confirm-join-btn');

    if (micButton) {
        micButton.classList.toggle('off', !assemblyState.micOn);
        micButton.title = assemblyState.micOn ? 'Desligar microfone' : 'Ligar microfone';
    }

    if (cameraButton) {
        cameraButton.classList.toggle('off', !assemblyState.cameraOn);
        cameraButton.title = assemblyState.cameraOn ? 'Desligar camera' : 'Ligar camera';
    }

    if (micStatus) {
        micStatus.classList.toggle('active', assemblyState.micOn);
        micStatus.innerHTML = assemblyState.micOn
            ? '<i class="fas fa-microphone"></i><span>Microfone ligado</span>'
            : '<i class="fas fa-microphone-slash"></i><span>Microfone desligado</span>';
    }

    if (cameraStatus) {
        cameraStatus.classList.toggle('active', assemblyState.cameraOn);
        cameraStatus.innerHTML = assemblyState.cameraOn
            ? '<i class="fas fa-video"></i><span>Camera ligada</span>'
            : '<i class="fas fa-video-slash"></i><span>Camera desligada</span>';
    }

    if (permissionStatus) {
        const denied = assemblyState.preJoinPermissions.microphone === 'denied'
            || assemblyState.preJoinPermissions.camera === 'denied';
        const granted = assemblyState.micOn
            || assemblyState.cameraOn
            || (assemblyState.preJoinPermissions.microphone === 'granted' && assemblyState.preJoinPermissions.camera === 'granted');

        permissionStatus.classList.toggle('active', granted && !denied);
        permissionStatus.classList.toggle('warning', denied);
        permissionStatus.innerHTML = denied
            ? '<i class="fas fa-shield-virus"></i><span>Permissoes bloqueadas</span>'
            : granted
                ? '<i class="fas fa-shield-check"></i><span>Permissoes ok</span>'
                : '<i class="fas fa-shield-alt"></i><span>Permissoes pendentes</span>';
    }

    if (micToggle) {
        micToggle.classList.toggle('active', assemblyState.micOn);
        micToggle.classList.toggle('inactive', !assemblyState.micOn);
    }

    if (cameraToggle) {
        cameraToggle.classList.toggle('active', assemblyState.cameraOn);
        cameraToggle.classList.toggle('inactive', !assemblyState.cameraOn);
    }

    if (connectionBadge) {
        connectionBadge.innerHTML = assemblyState.preJoinLastError
            ? '<i class="fas fa-circle-exclamation"></i> Revisar dispositivo'
            : '<i class="fas fa-shield-alt"></i> Pronto para entrar';
    }

    if (modeBadge) {
        let label = 'Entrada personalizada';
        let icon = 'fa-user-check';

        if (assemblyState.micOn && assemblyState.cameraOn) {
            label = 'Audio e camera';
            icon = 'fa-video';
        } else if (assemblyState.micOn) {
            label = 'Somente audio';
            icon = 'fa-headphones';
        } else if (!assemblyState.micOn && !assemblyState.cameraOn) {
            label = 'Entrar em silencio';
            icon = 'fa-user-slash';
        }

        modeBadge.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
    }

    if (confirmJoinBtn) {
        confirmJoinBtn.disabled = assemblyState.joining;
    }

    updateLocalVideoTargets();
    renderPreJoinMessages();
    renderParticipants();
}

function createRemoteParticipantCard(participant) {
    const card = document.createElement('div');
    card.className = 'video-box';

    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';

    if (participant.profilePhoto) {
        avatar.innerHTML = `<img src="${escapeHtml(participant.profilePhoto)}" alt="Avatar">`;
    } else {
        avatar.textContent = participant.initials || getInitials(participant.name);
    }

    const name = document.createElement('p');
    name.className = 'participant-name';
    name.textContent = participant.name;

    const meta = document.createElement('p');
    meta.className = 'participant-type';
    meta.textContent = participant.type === 'sindico' ? 'Sindico' : 'Morador';

    const statusRow = document.createElement('div');
    statusRow.className = 'participant-status-row';
    statusRow.innerHTML = `
        <span class="participant-chip ${participant.micOn ? 'active' : ''}">
            <i class="fas ${participant.micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>
            ${participant.micOn ? 'Microfone ligado' : 'Microfone desligado'}
        </span>
        <span class="participant-chip ${participant.cameraOn ? 'active' : ''}">
            <i class="fas ${participant.cameraOn ? 'fa-video' : 'fa-video-slash'}"></i>
            ${participant.cameraOn ? 'Camera ligada' : 'Sem camera'}
        </span>
    `;

    placeholder.appendChild(avatar);
    placeholder.appendChild(name);
    placeholder.appendChild(meta);
    placeholder.appendChild(statusRow);

    if (!participant.micOn) {
        const micOff = document.createElement('div');
        micOff.className = 'mic-off-icon';
        micOff.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        placeholder.appendChild(micOff);
    }

    card.appendChild(placeholder);
    return card;
}

function createSelfParticipantCard() {
    const card = document.createElement('div');
    card.className = 'video-box self-card';

    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';

    if (assemblyState.currentUser && assemblyState.currentUser.profilePhoto) {
        avatar.innerHTML = `<img src="${escapeHtml(assemblyState.currentUser.profilePhoto)}" alt="Avatar">`;
    } else {
        avatar.textContent = getInitials(assemblyState.currentUser ? assemblyState.currentUser.name : 'Voce');
    }

    const name = document.createElement('p');
    name.className = 'participant-name';
    name.textContent = assemblyState.currentUser ? (assemblyState.currentUser.name || 'Voce') : 'Voce';

    const meta = document.createElement('p');
    meta.className = 'participant-type';
    meta.textContent = assemblyState.currentUser && getNormalizedUserType(assemblyState.currentUser) === 'sindico'
        ? 'Sindico'
        : 'Morador';

    const statusRow = document.createElement('div');
    statusRow.className = 'participant-status-row';
    statusRow.innerHTML = `
        <span class="participant-chip ${assemblyState.micOn ? 'active' : ''}">
            <i class="fas ${assemblyState.micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>
            ${assemblyState.micOn ? 'Microfone ligado' : 'Microfone desligado'}
        </span>
        <span class="participant-chip ${assemblyState.cameraOn ? 'active' : ''}">
            <i class="fas ${assemblyState.cameraOn ? 'fa-video' : 'fa-video-slash'}"></i>
            ${assemblyState.cameraOn ? 'Camera ligada' : 'Sem camera'}
        </span>
    `;

    placeholder.appendChild(avatar);
    placeholder.appendChild(name);
    placeholder.appendChild(meta);
    placeholder.appendChild(statusRow);

    if (!assemblyState.micOn) {
        const micOff = document.createElement('div');
        micOff.className = 'mic-off-icon';
        micOff.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        placeholder.appendChild(micOff);
    }

    card.appendChild(placeholder);
    return card;
}

function renderParticipants() {
    const grid = $('video-grid');
    if (!grid) return;

    grid.innerHTML = '';
    grid.appendChild(createSelfParticipantCard());

    assemblyState.participants.forEach((participant) => {
        grid.appendChild(createRemoteParticipantCard(participant));
    });

    updateRoomMeta();
    updateLocalVideoTargets();
}

function appendIncomingChatMessage(message) {
    if (!message) return;

    const messagesDiv = $('chat-messages');
    if (!messagesDiv) return;

    if (message.id) {
        const alreadyExists = messagesDiv.querySelector(`[data-msg-id="${String(message.id).replace(/"/g, '')}"]`);
        if (alreadyExists) return;
    }

    const isMe = message.peerId && message.peerId === getMyPeerId();
    const wrapper = document.createElement('div');
    wrapper.className = `message ${isMe ? 'sent' : 'received'}`;

    if (message.id) wrapper.dataset.msgId = String(message.id);

    const typeLabel = message.userType === 'sindico' ? 'Sindico' : 'Morador';
    const text = message.text ? `<p>${escapeHtml(message.text)}</p>` : '';
    const image = message.imageData
        ? `<div class="message-image-wrapper"><img src="${message.imageData}" alt="Imagem enviada" class="message-image"></div>`
        : '';

    wrapper.innerHTML = `
        <div class="message-header">
            <strong>${escapeHtml(message.sender || message.name || 'Usuario')}</strong>
            <span class="user-type-tag">${typeLabel}</span>
        </div>
        ${text}
        ${image}
        <span class="time">${escapeHtml(message.time || getCurrentTime())}</span>
    `;

    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function clearRoomChatUI() {
    const messagesDiv = $('chat-messages');
    if (messagesDiv) messagesDiv.innerHTML = '';
    removeSelectedImage();
}

function openPreJoin(assembly) {
    assemblyState.preJoinAssembly = assembly || null;
    assemblyState.preJoinAssemblyId = assembly ? String(assembly.id) : null;
    assemblyState.preJoinOpen = true;
    assemblyState.roomOpen = false;
    assemblyState.chatOpen = false;
    assemblyState.preJoinLastError = '';
    stopAllLocalMedia();
    stopPreJoinAudioMeter();
    assemblyState.micOn = false;
    assemblyState.cameraOn = false;

    if ($('prejoin-title')) {
        $('prejoin-title').textContent = assembly && assembly.title ? assembly.title : 'Assembleia';
    }

    if ($('prejoin-subtitle')) {
        const dateLabel = assembly && assembly.date ? formatDate(assembly.date) : 'Hoje';
        const timeLabel = assembly && (assembly.start_time || assembly.time) ? (assembly.start_time || assembly.time) : '--:--';
        $('prejoin-subtitle').textContent = `Revise seus dispositivos antes de entrar. Inicio previsto para ${dateLabel} as ${timeLabel}.`;
    }

    updatePreJoinPreviewAvatar();
    setOverlayOpen($('prejoin-overlay'), true);
    setPageScrollLocked(true);

    refreshPreJoinPermissions()
        .then(() => refreshPreJoinDevices())
        .then(() => {
            applySelectedAudioOutput();
            updateControlsUI();
        });

    updateChatUI();
    updateControlsUI();
}

function closePreJoin() {
    assemblyState.preJoinOpen = false;
    assemblyState.preJoinAssembly = null;
    assemblyState.preJoinAssemblyId = null;
    assemblyState.preJoinLastError = '';

    if (!assemblyState.roomOpen) {
        stopAllLocalMedia();
        stopPreJoinAudioMeter();
        assemblyState.micOn = false;
        assemblyState.cameraOn = false;
        setPageScrollLocked(false);
    }

    updateControlsUI();
    setOverlayOpen($('prejoin-overlay'), false);
}

async function ensureAudioEnabled() {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            ...(assemblyState.preJoinSelections.audioInput
                ? { deviceId: { exact: assemblyState.preJoinSelections.audioInput } }
                : {})
        },
        video: false
    });

    const [track] = stream.getAudioTracks();
    if (!track) throw new Error('Nenhuma trilha de audio encontrada.');

    stopLocalTrack('audio');
    assemblyState.localAudioTrack = track;
}

async function ensureVideoEnabled() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...(assemblyState.preJoinSelections.videoInput
                ? { deviceId: { exact: assemblyState.preJoinSelections.videoInput } }
                : { facingMode: { ideal: 'user' } })
        },
        audio: false
    });

    const [track] = stream.getVideoTracks();
    if (!track) throw new Error('Nenhuma trilha de video encontrada.');

    stopLocalTrack('video');
    assemblyState.localVideoTrack = track;
}

async function toggleMic(forceValue) {
    const nextState = typeof forceValue === 'boolean' ? forceValue : !assemblyState.micOn;

    try {
        if (nextState) {
            await ensureAudioEnabled();
            assemblyState.micOn = true;
            assemblyState.preJoinPermissions.microphone = 'granted';
            assemblyState.preJoinLastError = '';
            startPreJoinAudioMeter(assemblyState.localAudioTrack);
            showToast('Microfone pronto para uso.', 'success');
        } else {
            stopLocalTrack('audio');
            stopPreJoinAudioMeter();
            assemblyState.micOn = false;
        }
    } catch (error) {
        console.error('Erro ao acessar microfone:', error);
        assemblyState.micOn = false;
        assemblyState.preJoinLastError = 'Nao foi possivel acessar o microfone. Verifique as permissoes do navegador e o dispositivo selecionado.';
        assemblyState.preJoinPermissions.microphone = /denied|NotAllowedError/i.test(String(error && error.name || error))
            ? 'denied'
            : assemblyState.preJoinPermissions.microphone;
        stopPreJoinAudioMeter();
        showToast('Nao foi possivel acessar o microfone. Verifique as permissoes.', 'error');
    }

    await refreshPreJoinPermissions();
    await refreshPreJoinDevices();
    updateControlsUI();

    if (assemblyState.currentAssemblyId) {
        sendParticipantPresence({ micOn: assemblyState.micOn });
    }
}

async function toggleCamera(forceValue) {
    const nextState = typeof forceValue === 'boolean' ? forceValue : !assemblyState.cameraOn;

    try {
        if (nextState) {
            await ensureVideoEnabled();
            assemblyState.cameraOn = true;
            assemblyState.preJoinPermissions.camera = 'granted';
            assemblyState.preJoinLastError = '';
            showToast('Camera pronta para uso.', 'success');
        } else {
            stopLocalTrack('video');
            assemblyState.cameraOn = false;
        }
    } catch (error) {
        console.error('Erro ao acessar camera:', error);
        assemblyState.cameraOn = false;
        assemblyState.preJoinLastError = 'Nao foi possivel acessar a camera. Verifique as permissoes do navegador e o dispositivo selecionado.';
        assemblyState.preJoinPermissions.camera = /denied|NotAllowedError/i.test(String(error && error.name || error))
            ? 'denied'
            : assemblyState.preJoinPermissions.camera;
        showToast('Nao foi possivel acessar a camera. Verifique as permissoes.', 'error');
    }

    await refreshPreJoinPermissions();
    await refreshPreJoinDevices();
    updateControlsUI();

    if (assemblyState.currentAssemblyId) {
        sendParticipantPresence({ cameraOn: assemblyState.cameraOn });
    }
}

function toggleChat(forceValue) {
    const nextState = typeof forceValue === 'boolean' ? forceValue : !assemblyState.chatOpen;
    assemblyState.chatOpen = nextState;
    updateChatUI();

    if (assemblyState.chatOpen && $('message-input')) {
        $('message-input').focus();
    }
}

function openRoom() {
    if (!assemblyState.currentAssembly) return;

    if ($('assembly-title')) {
        $('assembly-title').textContent = assemblyState.currentAssembly.title || 'Assembleia';
    }

    assemblyState.roomOpen = true;
    assemblyState.chatOpen = false;
    updateChatUI();
    setOverlayOpen($('assembly-room'), true);
    renderParticipants();
    updateControlsUI();
}

function closeRoom() {
    assemblyState.roomOpen = false;
    assemblyState.chatOpen = false;

    updateChatUI();
    setOverlayOpen($('assembly-room'), false);
}

function confirmJoinAssembly() {
    if (!assemblyState.preJoinAssemblyId) return;

    const assembly = scheduledAssemblies.find((entry) => String(entry.id) === String(assemblyState.preJoinAssemblyId))
        || assemblyState.preJoinAssembly;

    if (!assembly) {
        showToast('Nao foi possivel localizar essa assembleia. Atualize a pagina e tente novamente.', 'error');
        return;
    }

    assemblyState.currentAssembly = assembly;
    assemblyState.currentAssemblyId = String(assembly.id);
    assemblyState.preJoinOpen = false;
    assemblyState.preJoinAssembly = null;
    assemblyState.preJoinAssemblyId = null;
    assemblyState.joining = true;
    assemblyState.participants = [];
    stopPreJoinAudioMeter();

    setOverlayOpen($('prejoin-overlay'), false);
    openRoom();
    clearRoomChatUI();
    openAssemblyChannel(assemblyState.currentAssemblyId);
    startParticipantHeartbeat();
    broadcastToAssembly('participant-request-roster', { peerId: getMyPeerId() });
    sendParticipantPresence({
        micOn: assemblyState.micOn,
        cameraOn: assemblyState.cameraOn
    });

    assemblyState.joining = false;
    updateRoomMeta();
}

function leaveAssembly() {
    if (assemblyState.currentAssemblyId) {
        broadcastToAssembly('participant-leave', {
            peerId: getMyPeerId(),
            email: assemblyState.currentUser ? assemblyState.currentUser.email : null
        });
    }

    closeAssemblyChannel();
    stopAllLocalMedia();
    stopPreJoinAudioMeter();
    closeRoom();

    assemblyState.currentAssembly = null;
    assemblyState.currentAssemblyId = null;
    assemblyState.preJoinAssembly = null;
    assemblyState.preJoinAssemblyId = null;
    assemblyState.participants = [];
    assemblyState.micOn = false;
    assemblyState.cameraOn = false;

    clearRoomChatUI();
    renderParticipants();
    updateControlsUI();
    setPageScrollLocked(false);
    showToast('Voce saiu da assembleia.', 'info');
}

function formatDate(dateStr) {
    if (!dateStr || !String(dateStr).includes('-')) return dateStr || '--/--/----';
    const [year, month, day] = String(dateStr).split('-');
    return `${day}/${month}/${year}`;
}

function normalizeCondominiumIdentifier(value) {
    return String(value || '').replace(/\D/g, '');
}

function getUserCondominiumIdentifiers(user) {
    if (!user) return [];

    let condominium = user.condominium || {};
    if (typeof condominium === 'string') {
        try {
            condominium = JSON.parse(condominium);
        } catch (_) {
            condominium = {};
        }
    }

    return [
        condominium?.cep,
        condominium?.condominium_id,
        condominium?.condominiumId,
        user?.cep,
        user?.condominium_cep,
        user?.condominiumCep,
        user?.condominium_id,
        user?.condominiumId
    ]
        .map(normalizeCondominiumIdentifier)
        .filter(Boolean);
}

function getAssemblyCondominiumIdentifiers(assembly) {
    return [
        assembly?.cep,
        assembly?.condominium_cep,
        assembly?.condominiumCep,
        assembly?.condominium_id,
        assembly?.condominiumId
    ]
        .map(normalizeCondominiumIdentifier)
        .filter(Boolean);
}

function assemblyBelongsToCurrentCondominium(assembly) {
    const userIdentifiers = getUserCondominiumIdentifiers(assemblyState.currentUser);
    const assemblyIdentifiers = getAssemblyCondominiumIdentifiers(assembly);
    if (!userIdentifiers.length) return true;
    return assemblyIdentifiers.some((identifier) => userIdentifiers.includes(identifier));
}

function extractUserCep(user) {
    const identifiers = getUserCondominiumIdentifiers(user);
    return identifiers[0] || null;
}

function renderScheduleAssemblyInfo() {
    const info = $('schedule-info');
    if (!info) return;

    const cep = extractUserCep(assemblyState.currentUser);

    if (cep) {
        info.innerHTML = `<i class="fas fa-map-marker-alt"></i> Essa assembleia sera associada ao condominio CEP <strong>${escapeHtml(cep)}</strong>.`;
        info.style.display = 'flex';
        info.classList.remove('warning');
    } else {
        info.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Nao foi possivel identificar o CEP do condominio deste usuario.';
        info.style.display = 'flex';
        info.classList.add('warning');
    }
}

function updateUserProfile() {
    if (!assemblyState.currentUser) return;

    assemblyState.currentUser.type = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(assemblyState.currentUser)
        : (assemblyState.currentUser.type || 'morador');

    const avatar = $('user-avatar');
    const nameEl = $('user-name');
    const typeEl = $('user-type');
    const scheduleSection = $('schedule-section');

    if (avatar) {
        avatar.textContent = getInitials(assemblyState.currentUser.name);
    }

    if (nameEl) nameEl.textContent = assemblyState.currentUser.name || 'Usuario';
    if (typeEl) {
        typeEl.textContent = assemblyState.currentUser.type === 'sindico'
            ? 'Sindico'
            : (assemblyState.currentUser.type === 'porteiro' ? 'Porteiro' : 'Morador');
    }

    if (scheduleSection) {
        scheduleSection.style.display = assemblyState.currentUser.type === 'sindico' ? 'block' : 'none';
    }

    if (typeof window.applyGlobalAppLanguage === 'function') {
        window.applyGlobalAppLanguage();
    }

    if (typeof syncAllAvatars === 'function') {
        syncAllAvatars(assemblyState.currentUser);
    }
}

async function loadScheduledAssemblies() {
    try {
        const cep = extractUserCep(assemblyState.currentUser);
        let rawList = [];
        if (cep && typeof getScheduledAssembliesByCep === 'function') {
            rawList = await getScheduledAssembliesByCep(cep);
        } else if (typeof getScheduledAssemblies === 'function') {
            rawList = await getScheduledAssemblies();
        }
        rawList = Array.isArray(rawList) ? rawList : [];
        rawList = rawList.filter(assemblyBelongsToCurrentCondominium);

        const todayIso = new Date().toISOString().split('T')[0];
        const isPastStatus = (assembly) => ['encerrada', 'finalizada', 'completed', 'cancelada', 'cancelled']
            .includes(String(assembly?.status || '').trim().toLowerCase());

        pastAssemblies = rawList.filter((assembly) =>
            isPastStatus(assembly) || String(assembly.date || '').localeCompare(todayIso) < 0
        );

        scheduledAssemblies = rawList.filter((assembly) =>
            !isPastStatus(assembly) && String(assembly.date || '').localeCompare(todayIso) >= 0
        );

        renderScheduledAssemblies();
        renderPastAssemblies();
    } catch (error) {
        console.error('Erro ao carregar assembleias:', error);
        if ($('scheduled-list')) {
            $('scheduled-list').innerHTML = '<p>Nao foi possivel carregar as assembleias no momento.</p>';
        }
        if ($('past-list')) {
            $('past-list').innerHTML = '<p>Nao foi possivel carregar as assembleias passadas.</p>';
        }
    }
}

function getScheduledAssemblyStartDate(assembly) {
    if (!assembly) return null;

    if (assembly.scheduled_at) {
        const direct = new Date(assembly.scheduled_at);
        if (!Number.isNaN(direct.getTime())) return direct;
    }

    const date = String(assembly.date || assembly.assembly_date || '').slice(0, 10);
    const time = String(assembly.start_time || assembly.time || '00:00').slice(0, 5);
    if (!date) return null;

    const local = new Date(`${date}T${time}:00`);
    return Number.isNaN(local.getTime()) ? null : local;
}

function canPrepareScheduledAssembly(assembly) {
    const start = getScheduledAssemblyStartDate(assembly);
    return !start || Date.now() >= start.getTime();
}

function renderScheduledAssemblies() {
    const listContainer = $('scheduled-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!scheduledAssemblies.length) {
        const cep = extractUserCep(assemblyState.currentUser);
        listContainer.innerHTML = `<p>Nenhuma assembleia agendada para o condominio ${cep ? `CEP ${escapeHtml(cep)}` : 'atual'}.</p>`;
        return;
    }

    const isSindico = assemblyState.currentUser && assemblyState.currentUser.type === 'sindico';

    scheduledAssemblies.forEach((assembly) => {
        const isOwn = assembly.created_by
            && assemblyState.currentUser
            && assemblyState.currentUser.email
            && assembly.created_by === assemblyState.currentUser.email;

        const canDelete = isSindico || isOwn;
        const createdByHtml = assembly.created_by
            ? `<p><i class="fas fa-user-tie"></i> <strong>Criado por:</strong> ${escapeHtml(assembly.created_by)}</p>`
            : '';

        const timeText = assembly.end_time && assembly.end_time !== assembly.start_time
            ? ` as ${escapeHtml(assembly.start_time || '--:--')} ate ${escapeHtml(assembly.end_time)}`
            : ` as ${escapeHtml(assembly.start_time || assembly.time || '--:--')}`;

        const deleteButton = canDelete
            ? `
                <button class="btn btn-secondary assembly-delete-btn" onclick="confirmDeleteAssembly('${escapeHtml(String(assembly.id)).replace(/'/g, '&#39;')}')" title="Excluir assembleia">
                    <i class="fas fa-trash-alt"></i> Excluir
                </button>
            `
            : '';

        const canPrepare = canPrepareScheduledAssembly(assembly);
        const prepareTitle = canPrepare
            ? 'Preparar entrada'
            : `Disponível a partir de ${escapeHtml(String(assembly.start_time || assembly.time || '--:--').slice(0, 5))}`;
        const prepareDisabled = canPrepare ? '' : 'disabled aria-disabled="true"';

        listContainer.insertAdjacentHTML('beforeend', `
            <div class="assembly-item" data-assembly-id="${escapeHtml(String(assembly.id))}">
                <div class="assembly-info">
                    <h3>${escapeHtml(assembly.title)}</h3>
                    <p><i class="far fa-calendar-alt"></i> <strong>Data:</strong> ${formatDate(assembly.date)}${timeText}</p>
                    ${createdByHtml}
                </div>
                <div class="assembly-actions">
                    <button class="btn btn-primary" ${prepareDisabled} title="${prepareTitle}" onclick="joinAssembly('${escapeHtml(String(assembly.id)).replace(/'/g, '&#39;')}')">
                        <i class="fas fa-sliders"></i> ${canPrepare ? 'Preparar entrada' : 'Aguardando horário'}
                    </button>
                    ${deleteButton}
                </div>
            </div>
        `);
    });
}

function renderPastAssemblies() {
    const listContainer = $('past-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!pastAssemblies.length) {
        listContainer.innerHTML = '<p>Nenhuma assembleia realizada.</p>';
        return;
    }

    pastAssemblies.forEach((assembly) => {
        const timeValue = assembly.start_time || assembly.time || assembly.end_time || '--:--';
        const safeId = Number.isFinite(Number(assembly.id)) ? Number(assembly.id) : `'${escapeHtml(String(assembly.id)).replace(/'/g, "\\'")}'`;
        listContainer.insertAdjacentHTML('beforeend', `
            <div class="assembly-item">
                <div class="assembly-info">
                    <h3>${escapeHtml(assembly.title)}</h3>
                    <p><i class="far fa-calendar-alt"></i> <strong>Data:</strong> ${formatDate(assembly.date)}, as ${escapeHtml(timeValue)}</p>
                </div>
                <button class="btn btn-primary past-details-btn" onclick="viewPastAssembly(${safeId})">
                    <i class="fas fa-eye"></i> Ver detalhes
                </button>
            </div>
        `);
    });
}

async function scheduleAssembly(event) {
    event.preventDefault();

    const title = $('assembly-title-input') ? $('assembly-title-input').value.trim() : '';
    const date = $('assembly-date') ? $('assembly-date').value : '';
    const startTime = $('assembly-time') ? $('assembly-time').value : '';

    if (!title || !date || !startTime) {
        showToast('Preencha todos os campos da assembleia.', 'warning');
        return;
    }

    const cep = extractUserCep(assemblyState.currentUser);
    if (!cep) {
        showToast('Nao foi possivel identificar o CEP do condominio do usuario.', 'error');
        return;
    }

    if (!assemblyState.currentUser || !assemblyState.currentUser.email) {
        showToast('Usuario nao autenticado. Faca login novamente.', 'error');
        return;
    }

    const payload = {
        cep,
        title,
        description: null,
        date,
        start_time: startTime,
        end_time: startTime,
        created_by: assemblyState.currentUser.email
    };

    try {
        const savedAssembly = typeof scheduleAssemblyDb === 'function'
            ? await scheduleAssemblyDb(payload)
            : payload;

        scheduledAssemblies.push(savedAssembly);
        scheduledAssemblies.sort((left, right) => {
            if (left.date !== right.date) return left.date < right.date ? -1 : 1;
            const leftTime = left.start_time || '';
            const rightTime = right.start_time || '';
            return leftTime.localeCompare(rightTime);
        });

        if (window.communityHub && typeof window.communityHub.createAssemblyNotification === 'function') {
            try {
                await window.communityHub.createAssemblyNotification(savedAssembly, assemblyState.currentUser);
            } catch (notificationError) {
                console.error('Assembleia salva, mas a notificação não pôde ser persistida:', notificationError);
                showToast('Assembleia agendada, mas não foi possível publicar a notificação. Verifique a migration 015.', 'warning');
            }
        }

        renderScheduledAssemblies();
        event.target.reset();
        showToast('Assembleia agendada com sucesso.', 'success');
    } catch (error) {
        console.error('Erro ao agendar assembleia:', error);
        const rawMessage = error && (error.message || String(error)) || '';
        let userMessage = rawMessage && /(falha|erro|campos|usuario|cep|condominio|sessao|login|obrigatorio|criador|encontrado|autenticado)/i.test(rawMessage)
            ? rawMessage
            : '';
        if (!userMessage) {
            const lower = rawMessage.toLowerCase();
            if (lower.includes('row-level') || lower.includes('policy') || lower.includes('rls') || lower.includes('403')) {
                userMessage = 'Permissao insuficiente para agendar a assembleia. Verifique se voce e sindico do condominio.';
            } else if (lower.includes('foreign') || lower.includes('condominiums') || lower.includes('cep')) {
                userMessage = 'O CEP do condominio nao esta cadastrado na base. Contate o suporte.';
            } else if (lower.includes('not-null') || lower.includes('not null') || lower.includes('column') || lower.includes('does not exist')) {
                userMessage = 'Configuracao da tabela de assembleias esta incompleta. Contate o suporte.';
            } else if (lower.includes('network') || lower.includes('fetch') || lower.includes('cors') || lower.includes('failed to fetch')) {
                userMessage = 'Falha de conexao. Verifique sua internet e tente novamente.';
            } else if (rawMessage) {
                userMessage = rawMessage;
            } else {
                userMessage = 'Nao foi possivel agendar a assembleia. Tente novamente.';
            }
        }
        showToast(userMessage, 'error');
    }
}

async function confirmDeleteAssembly(id) {
    if (!id) return;
    if (!window.confirm('Tem certeza que deseja excluir esta assembleia agendada?')) return;

    try {
        if (typeof deleteScheduledAssemblyById === 'function') {
            await deleteScheduledAssemblyById(id);
        }
        scheduledAssemblies = scheduledAssemblies.filter((assembly) => String(assembly.id) !== String(id));
        renderScheduledAssemblies();
        showToast('Assembleia excluida com sucesso.', 'success');
    } catch (error) {
        console.error('Erro ao excluir assembleia:', error);
        showToast('Nao foi possivel excluir a assembleia. Tente novamente.', 'error');
    }
}

function joinAssembly(assemblyId) {
    if (!assemblyId) {
        showToast('ID da assembleia não encontrado.', 'error');
        return;
    }

    const assembly = scheduledAssemblies.find((item) => String(item.id) === String(assemblyId));
    if (assembly && !canPrepareScheduledAssembly(assembly)) {
        const start = getScheduledAssemblyStartDate(assembly);
        const timeText = start
            ? start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : String(assembly.start_time || assembly.time || '--:--').slice(0, 5);
        showToast(`A preparação será liberada a partir das ${timeText}.`, 'warning');
        return;
    }

    window.location.href =
        `assembleia-preparacao.html?id=${encodeURIComponent(String(assemblyId))}`;
}

function sendMessage() {
    const input = $('message-input');
    const text = input ? input.value.trim() : '';
    const imageData = assemblyState.selectedImageData;

    if (!text && !imageData) return;
    if (!assemblyState.currentUser) return;
    if (!assemblyState.currentAssemblyId) {
        showToast('Entre em uma assembleia antes de enviar mensagens.', 'warning');
        return;
    }

    const chatMessage = {
        id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        peerId: getMyPeerId(),
        assemblyId: assemblyState.currentAssemblyId,
        sender: assemblyState.currentUser.name || 'Usuario',
        email: assemblyState.currentUser.email || null,
        userType: assemblyState.currentUser.type === 'sindico' ? 'sindico' : 'morador',
        text,
        imageData: imageData || null,
        time: getCurrentTime(),
        ts: Date.now()
    };

    persistChatMessage(assemblyState.currentAssemblyId, chatMessage);
    appendIncomingChatMessage(chatMessage);
    broadcastToAssembly('chat-message', chatMessage);

    if (input) input.value = '';
    removeSelectedImage();
}

function removeSelectedImage() {
    assemblyState.selectedImageData = null;

    const fileInput = $('image-upload');
    const previewWrapper = $('image-preview-wrapper');
    const previewImage = $('image-preview');

    if (fileInput) fileInput.value = '';
    if (previewImage) previewImage.removeAttribute('src');
    if (previewWrapper) previewWrapper.classList.remove('active');
}

function resetVotePanel() {
    if ($('voting-buttons')) $('voting-buttons').style.display = 'flex';
    if ($('vote-result')) $('vote-result').style.display = 'none';
}

function viewPastAssembly(id) {
    if (id === undefined || id === null || id === '') {
        showToast('Assembleia inválida.', 'warning');
        return;
    }
    window.location.href = `assembleia-resumo.html?id=${encodeURIComponent(String(id))}`;
}

function goBack() {
    assemblyState.viewingPastAssemblyId = null;
    if ($('past-assembly-detail')) $('past-assembly-detail').classList.remove('active');
    resetVotePanel();
    setPageScrollLocked(assemblyState.roomOpen || assemblyState.preJoinOpen);
}

function vote(option) {
    const resultLabel = option === 'yes' ? 'A favor' : 'Contra';
    showToast(`Voto registrado: ${resultLabel}.`, 'success');
    if ($('voting-buttons')) $('voting-buttons').style.display = 'none';
    if ($('vote-result')) $('vote-result').style.display = 'block';
}

function sendComment() {
    const commentInput = $('comment-input');
    const text = commentInput ? commentInput.value.trim() : '';

    if (!text) return;
    showToast('Comentario enviado com sucesso.', 'success');
    if (commentInput) commentInput.value = '';
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    try { sessionStorage.removeItem('condominiumUser'); } catch (_) {}
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}

function bindStaticEvents() {
    const messageInput = $('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                sendMessage();
            }
        });
    }

    const imageUpload = $('image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', (event) => {
            const [file] = event.target.files || [];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                assemblyState.selectedImageData = loadEvent.target.result;
                if ($('image-preview')) $('image-preview').src = assemblyState.selectedImageData;
                if ($('image-preview-wrapper')) $('image-preview-wrapper').classList.add('active');
            };
            reader.readAsDataURL(file);
        });
    }

    const prejoinOverlay = $('prejoin-overlay');
    if (prejoinOverlay) {
        prejoinOverlay.addEventListener('click', (event) => {
            if (event.target === prejoinOverlay) {
                closePreJoin();
            }
        });
    }

    const prejoinCloseBtn = $('prejoin-close-btn');
    if (prejoinCloseBtn) {
        prejoinCloseBtn.addEventListener('click', closePreJoin);
    }

    const prejoinCancelBtn = $('prejoin-cancel-btn');
    if (prejoinCancelBtn) {
        prejoinCancelBtn.addEventListener('click', closePreJoin);
    }

    const prejoinMicToggle = $('prejoin-mic-toggle');
    if (prejoinMicToggle) {
        prejoinMicToggle.addEventListener('click', () => {
            toggleMic();
        });
    }

    const prejoinCameraToggle = $('prejoin-camera-toggle');
    if (prejoinCameraToggle) {
        prejoinCameraToggle.addEventListener('click', () => {
            toggleCamera();
        });
    }

    const prejoinAudioOnlyBtn = $('prejoin-audio-only-btn');
    if (prejoinAudioOnlyBtn) {
        prejoinAudioOnlyBtn.addEventListener('click', async () => {
            await toggleCamera(false);
            await toggleMic(true);
        });
    }

    const prejoinSilentBtn = $('prejoin-silent-btn');
    if (prejoinSilentBtn) {
        prejoinSilentBtn.addEventListener('click', async () => {
            await toggleMic(false);
            await toggleCamera(false);
        });
    }

    const audioInputSelect = $('prejoin-audio-input');
    if (audioInputSelect) {
        audioInputSelect.addEventListener('change', async (event) => {
            assemblyState.preJoinSelections.audioInput = event.target.value || '';
            assemblyState.preJoinLastError = '';
            if (assemblyState.micOn) {
                await toggleMic(true);
            } else {
                await refreshPreJoinDevices();
                updateControlsUI();
            }
        });
    }

    const videoInputSelect = $('prejoin-video-input');
    if (videoInputSelect) {
        videoInputSelect.addEventListener('change', async (event) => {
            assemblyState.preJoinSelections.videoInput = event.target.value || '';
            assemblyState.preJoinLastError = '';
            if (assemblyState.cameraOn) {
                await toggleCamera(true);
            } else {
                await refreshPreJoinDevices();
                updateControlsUI();
            }
        });
    }

    const audioOutputSelect = $('prejoin-audio-output');
    if (audioOutputSelect) {
        audioOutputSelect.addEventListener('change', async (event) => {
            assemblyState.preJoinSelections.audioOutput = event.target.value || '';
            await applySelectedAudioOutput();
            updateControlsUI();
        });
    }

    const confirmJoinBtn = $('confirm-join-btn');
    if (confirmJoinBtn) {
        confirmJoinBtn.addEventListener('click', confirmJoinAssembly);
    }

    const pastDetailOverlay = $('past-assembly-detail');
    if (pastDetailOverlay) {
        pastDetailOverlay.addEventListener('click', (event) => {
            if (event.target === pastDetailOverlay) {
                goBack();
            }
        });
    }

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        if (assemblyState.preJoinOpen) {
            closePreJoin();
            return;
        }

        if (assemblyState.chatOpen && assemblyState.roomOpen) {
            toggleChat(false);
            return;
        }

        if (assemblyState.viewingPastAssemblyId) {
            goBack();
        }
    });
}

async function bootstrapUser() {
    let storedUser = null;

    try {
        storedUser = sessionStorage.getItem('condominiumUser');
    } catch (_) {}

    if (!storedUser) {
        try {
            const persistedRaw = localStorage.getItem('condominiumPersistentUser');
            if (persistedRaw) {
                const persisted = JSON.parse(persistedRaw);
                if (persisted && persisted.email && typeof fetchUserByEmail === 'function') {
                    const fresh = await fetchUserByEmail(persisted.email).catch(() => null);
                    if (fresh) {
                        const restored = { ...fresh, password: fresh.password || null };
                        sessionStorage.setItem('condominiumUser', JSON.stringify(restored));
                        storedUser = sessionStorage.getItem('condominiumUser');
                    }
                }
            }
        } catch (_) {}
    }

    if (!storedUser) {
        window.location.href = 'entrar.html';
        return false;
    }

    assemblyState.currentUser = JSON.parse(storedUser);

    if (typeof refreshCurrentUserFromDb === 'function') {
        assemblyState.currentUser = await refreshCurrentUserFromDb();
    }

    if (typeof getNormalizedUserType === 'function') {
        assemblyState.currentUser.type = getNormalizedUserType(assemblyState.currentUser);
    }

    // Acesso à assembleia depende da mensalidade do condomínio (CEP),
    // e não do usuário que realizou o pagamento.
    if (typeof window.enforceCondomitBillingAccess === 'function') {
        const allowed = await window.enforceCondomitBillingAccess({ force: true });
        if (!allowed) {
            return false;
        }
    }

    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    const userReady = await bootstrapUser();
    if (!userReady) return;

    updateUserProfile();
    updatePreJoinPreviewAvatar();
    updateChatUI();
    updateControlsUI();
    renderScheduleAssemblyInfo();
    renderPastAssemblies();
    bindStaticEvents();

    const today = new Date().toISOString().split('T')[0];
    if ($('assembly-date')) $('assembly-date').setAttribute('min', today);

    await loadScheduledAssemblies();

    // Mantém a separação entre agendadas e realizadas atualizada sem exigir F5.
    window.setInterval(() => {
        if (!document.hidden && !assemblyState.roomOpen && !assemblyState.preJoinOpen) {
            loadScheduledAssemblies().catch((error) => {
                console.warn('Não foi possível atualizar a lista de assembleias:', error);
            });
        }
    }, 60000);
});

window.addEventListener('beforeunload', () => {
    if (assemblyState.currentAssemblyId) {
        try {
            broadcastToAssembly('participant-leave', {
                peerId: getMyPeerId(),
                email: assemblyState.currentUser ? assemblyState.currentUser.email : null
            });
        } catch (_) {}
    }

    try {
        closeAssemblyChannel();
    } catch (_) {}

    try {
        stopAllLocalMedia();
    } catch (_) {}

    try {
        stopPreJoinAudioMeter();
    } catch (_) {}
});
