import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';
import { ConnectionState, Room, RoomEvent, Track, VideoPresets } from 'https://esm.sh/livekit-client@2.21.0';

const SUPABASE_URL = 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';
const AUTH_STORAGE_KEY = 'condomitSupabaseSession';

const state = {
    assemblyId: '',
    browserSupabase: null,
    accessToken: '',
    refreshToken: '',
    currentUser: null,
    assembly: null,
    condominium: null,
    requests: [],
    chatMessages: [],
    polls: [],
    pollOptions: [],
    votes: [],
    attendance: [],
    localPreviewStream: null,
    room: null,
    roomToken: '',
    livekitUrl: '',
    realtimeChannel: null,
    heartbeatTimer: null,
    elapsedTimer: null,
    cameraEnabled: false,
    microphoneEnabled: false,
    screenShareEnabled: false,
    selectedCameraId: '',
    selectedMicrophoneId: '',
    connectedAttendanceId: null,
    activeSpeakerIds: new Set(),
    sidebarOpen: true,
    handRaised: false,
    creatingDevicesModal: false
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
        console.error('[assembleia-online] Falha ao iniciar:', error);
        showToast(error.message || 'Não foi possível carregar a assembleia online.', 'error');
        setPrejoinMessage(error.message || 'Não foi possível carregar a assembleia online.', 'error');
    });
});

async function boot() {
    cacheElements();
    bindStaticEvents();
    hydrateCurrentUser();
    updateCurrentUserUI();
    state.browserSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: true }
    });

    state.assemblyId = getAssemblyIdFromUrl();
    await ensureSupabaseSession();
    await loadAssemblyState();
    await populateDeviceSelectors(false);
    togglePollModal(false);
    refreshPollOptionButtons();
    renderAll();
}

function cacheElements() {
    [
        'sidebar-condo-name', 'nav-home-link', 'current-user-name', 'current-user-role', 'current-user-avatar',
        'connection-pill', 'assembly-subtitle', 'prejoin-panel', 'prejoin-title', 'prejoin-meta', 'assembly-status-chip',
        'preview-video', 'preview-placeholder', 'camera-select', 'microphone-select', 'request-media-btn',
        'test-audio-btn', 'toggle-camera-btn', 'toggle-mic-btn', 'condominium-name', 'assembly-date-text',
        'assembly-time-text', 'assembly-description-text', 'prejoin-message', 'enter-assembly-btn',
        'meeting-panel', 'meeting-title', 'meeting-status-text', 'elapsed-time', 'participant-count',
        'participant-grid', 'participant-list', 'chat-list', 'chat-form', 'chat-input', 'request-list',
        'raise-hand-btn', 'meeting-mic-btn', 'meeting-camera-btn', 'meeting-screen-btn', 'meeting-devices-btn',
        'meeting-sidebar-btn', 'leave-assembly-btn', 'meeting-sidebar', 'toast-region', 'start-assembly-btn',
        'end-assembly-btn', 'poll-list', 'attendance-list', 'open-poll-modal-btn', 'poll-modal',
        'close-poll-modal-btn', 'poll-form', 'poll-title-input', 'poll-description-input',
        'poll-options-wrapper', 'add-poll-option-btn', 'logout-btn', 'polls-tab', 'attendance-tab'
    ].forEach((id) => { els[id] = document.getElementById(id); });

    els.sidebarTabs = Array.from(document.querySelectorAll('.sidebar-tab'));
    els.sidebarPanels = Array.from(document.querySelectorAll('.sidebar-panel'));
}

function bindStaticEvents() {
    els['request-media-btn']?.addEventListener('click', () => requestPreviewMedia(true));
    els['test-audio-btn']?.addEventListener('click', testAudioOutput);
    els['toggle-camera-btn']?.addEventListener('click', togglePreviewCamera);
    els['toggle-mic-btn']?.addEventListener('click', togglePreviewMicrophone);
    els['camera-select']?.addEventListener('change', async (event) => {
        state.selectedCameraId = event.target.value;
        if (state.localPreviewStream) await requestPreviewMedia(false);
        if (state.room) await switchRoomDevice('videoinput', state.selectedCameraId);
    });
    els['microphone-select']?.addEventListener('change', async (event) => {
        state.selectedMicrophoneId = event.target.value;
        if (state.localPreviewStream) await requestPreviewMedia(false);
        if (state.room) await switchRoomDevice('audioinput', state.selectedMicrophoneId);
    });
    els['enter-assembly-btn']?.addEventListener('click', joinRoom);
    els['start-assembly-btn']?.addEventListener('click', startAssembly);
    els['end-assembly-btn']?.addEventListener('click', endAssembly);
    els['raise-hand-btn']?.addEventListener('click', toggleHandRaise);
    els['chat-form']?.addEventListener('submit', sendChatMessage);
    els['meeting-mic-btn']?.addEventListener('click', toggleMeetingMicrophone);
    els['meeting-camera-btn']?.addEventListener('click', toggleMeetingCamera);
    els['meeting-screen-btn']?.addEventListener('click', toggleScreenShare);
    els['meeting-sidebar-btn']?.addEventListener('click', toggleMeetingSidebar);
    els['meeting-devices-btn']?.addEventListener('click', openDevicesModal);
    els['leave-assembly-btn']?.addEventListener('click', leaveRoom);
    els['open-poll-modal-btn']?.addEventListener('click', () => togglePollModal(true));
    els['close-poll-modal-btn']?.addEventListener('click', () => togglePollModal(false));
    els['poll-form']?.addEventListener('submit', createPoll);
    els['add-poll-option-btn']?.addEventListener('click', addPollOptionField);
    els['logout-btn']?.addEventListener('click', logout);
    els['poll-modal']?.addEventListener('click', (event) => {
        if (event.target === els['poll-modal']) {
            togglePollModal(false);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && els['poll-modal'] && !els['poll-modal'].hidden) {
            togglePollModal(false);
        }
    });
    window.addEventListener('beforeunload', () => {
        stopHeartbeat();
        if (state.room) {
            attendanceLeave().catch(() => {});
            state.room.disconnect(true);
        }
    });

    els.sidebarTabs.forEach((button) => {
        button.addEventListener('click', () => switchSidebarPanel(button.dataset.tab));
    });
}

function hydrateCurrentUser() {
    const raw = sessionStorage.getItem('condominiumUser');
    if (!raw) {
        location.href = 'entrar.html';
        throw new Error('Sua sessão expirou. Faça login novamente para entrar na assembleia.');
    }

    state.currentUser = JSON.parse(raw);
}

function getAssemblyIdFromUrl() {
    const value = new URLSearchParams(location.search).get('id');
    if (!value) {
        throw new Error('O identificador da assembleia não foi informado na URL.');
    }
    return value.trim();
}

function updateCurrentUserUI() {
    const user = state.currentUser || {};
    const type = normalizeRole(user.type || user.user_type);
    const initials = getInitials(user.name || user.email || 'VC');
    if (els['current-user-name']) els['current-user-name'].textContent = user.name || 'Você';
    if (els['current-user-role']) els['current-user-role'].textContent = capitalizeRole(type);
    if (els['current-user-avatar']) els['current-user-avatar'].textContent = initials;
    if (els['nav-home-link']) els['nav-home-link'].setAttribute('href', type === 'morador' ? 'index-morador.html' : 'index.html');
}

async function ensureSupabaseSession() {
    const saved = safeJsonParse(sessionStorage.getItem(AUTH_STORAGE_KEY));
    if (saved?.access_token && saved?.refresh_token) {
        const { error } = await state.browserSupabase.auth.setSession({
            access_token: saved.access_token,
            refresh_token: saved.refresh_token
        });
        if (!error) {
            state.accessToken = saved.access_token;
            state.refreshToken = saved.refresh_token;
            return;
        }
    }

    const email = state.currentUser?.email;
    const password = state.currentUser?.password;
    if (!email || !password) {
        throw new Error('Faça login novamente para autenticar sua entrada na assembleia online.');
    }

    const { data, error } = await state.browserSupabase.auth.signInWithPassword({
        email,
        password
    });

    if (error || !data?.session?.access_token) {
        throw new Error('Não foi possível autenticar sua sessão no Supabase para entrar na assembleia.');
    }

    state.accessToken = data.session.access_token;
    state.refreshToken = data.session.refresh_token;
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        access_token: state.accessToken,
        refresh_token: state.refreshToken
    }));
}

async function getValidAccessToken() {
    const { data } = await state.browserSupabase.auth.getSession();
    if (data?.session?.access_token) {
        state.accessToken = data.session.access_token;
        state.refreshToken = data.session.refresh_token;
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            access_token: state.accessToken,
            refresh_token: state.refreshToken
        }));
        return state.accessToken;
    }
    await ensureSupabaseSession();
    return state.accessToken;
}

async function apiPost(path, payload) {
    const token = await getValidAccessToken();
    const response = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Erro ao comunicar com o servidor.');
    }
    return data;
}

async function loadAssemblyState() {
    const data = await apiPost('/api/assembly-event', {
        action: 'get_state',
        assemblyId: state.assemblyId
    });

    state.assembly = data.assembly;
    state.condominium = data.condominium;
    state.chatMessages = Array.isArray(data.chatMessages) ? data.chatMessages : [];
    state.requests = Array.isArray(data.speakingRequests) ? data.speakingRequests : [];
    state.polls = Array.isArray(data.polls) ? data.polls : [];
    state.pollOptions = Array.isArray(data.pollOptions) ? data.pollOptions : [];
    state.votes = Array.isArray(data.votes) ? data.votes : [];
    state.attendance = Array.isArray(data.attendance) ? data.attendance : [];
    if (data.currentUser) {
        state.currentUser = {
            ...state.currentUser,
            name: data.currentUser.name,
            email: data.currentUser.email,
            type: data.currentUser.role
        };
    }
    updateCurrentUserUI();
}

function renderAll() {
    renderHeader();
    renderPrejoinInfo();
    renderChat();
    renderRequests();
    renderPolls();
    renderAttendance(state.attendance);
    renderMeetingParticipants();
}

function renderHeader() {
    if (!state.assembly) return;
    if (els['sidebar-condo-name']) els['sidebar-condo-name'].textContent = state.condominium?.name || 'Condomit';
    if (els['assembly-subtitle']) {
        els['assembly-subtitle'].textContent = state.assembly.status === 'em_andamento'
            ? 'A assembleia está em andamento.'
            : 'Configure seus dispositivos antes de entrar.';
    }
    if (els['meeting-title']) els['meeting-title'].textContent = state.assembly.title;
    if (els['prejoin-title']) els['prejoin-title'].textContent = state.assembly.title;
    if (els['meeting-status-text']) els['meeting-status-text'].textContent = formatAssemblyStatusText(state.assembly.status);
}

function renderPrejoinInfo() {
    if (!state.assembly) return;
    const role = normalizeRole(state.currentUser.type || state.currentUser.user_type);
    if (els['prejoin-meta']) {
        els['prejoin-meta'].textContent = `${formatDate(state.assembly.date)} às ${state.assembly.startTime || '--:--'} • ${state.condominium?.name || 'Condomínio'}`;
    }
    if (els['assembly-status-chip']) {
        els['assembly-status-chip'].textContent = formatStatusLabel(state.assembly.status);
        els['assembly-status-chip'].className = `status-chip ${state.assembly.status}`;
    }
    if (els['condominium-name']) els['condominium-name'].textContent = state.condominium?.name || 'Condomínio';
    if (els['assembly-date-text']) els['assembly-date-text'].textContent = formatDate(state.assembly.date);
    if (els['assembly-time-text']) els['assembly-time-text'].textContent = `${state.assembly.startTime || '--:--'}${state.assembly.endTime ? ` até ${state.assembly.endTime}` : ''}`;
    if (els['assembly-description-text']) els['assembly-description-text'].textContent = state.assembly.description || 'Sem pauta adicional cadastrada.';
    if (els['meeting-title']) els['meeting-title'].textContent = state.assembly.title;

    const enterButton = els['enter-assembly-btn'];
    const startButton = els['start-assembly-btn'];
    const endButton = els['end-assembly-btn'];
    const hostOnlyElements = Array.from(document.querySelectorAll('.host-only'));
    hostOnlyElements.forEach((element) => {
        element.hidden = role !== 'sindico';
    });

    if (startButton) startButton.hidden = !(role === 'sindico' && state.assembly.status === 'agendada');
    if (endButton) endButton.hidden = !(role === 'sindico' && state.assembly.status === 'em_andamento');

    if (role !== 'sindico' && state.assembly.status === 'agendada') {
        enterButton.disabled = true;
        setPrejoinMessage('A assembleia ainda não foi iniciada pelo síndico. Assim que ela começar, seu botão de entrada será liberado.', 'info');
    } else if (state.assembly.status === 'encerrada') {
        enterButton.disabled = true;
        setPrejoinMessage('Esta assembleia já foi encerrada. O acesso à sala não está mais disponível.', 'error');
    } else if (state.assembly.status === 'cancelada') {
        enterButton.disabled = true;
        setPrejoinMessage('Esta assembleia foi cancelada pelo síndico.', 'error');
    } else {
        enterButton.disabled = false;
        if (role === 'sindico' && state.assembly.status === 'agendada') {
            setPrejoinMessage('Você pode entrar agora para preparar a sala e iniciar oficialmente a assembleia quando desejar.', 'info');
        } else {
            setPrejoinMessage('Tudo pronto. Entre na assembleia para participar em tempo real.', 'info');
        }
    }
}

function setPrejoinMessage(text, kind = 'info') {
    if (!els['prejoin-message']) return;
    els['prejoin-message'].className = `message-box ${kind}`;
    els['prejoin-message'].textContent = text;
}

async function populateDeviceSelectors(promptFirst) {
    if (promptFirst && !state.localPreviewStream) {
        await requestPreviewMedia(true);
        return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cameras = devices.filter((item) => item.kind === 'videoinput');
    const microphones = devices.filter((item) => item.kind === 'audioinput');

    fillSelect(els['camera-select'], cameras, 'Nenhuma câmera encontrada', state.selectedCameraId);
    fillSelect(els['microphone-select'], microphones, 'Nenhum microfone encontrado', state.selectedMicrophoneId);

    if (!state.selectedCameraId && cameras[0]) state.selectedCameraId = cameras[0].deviceId;
    if (!state.selectedMicrophoneId && microphones[0]) state.selectedMicrophoneId = microphones[0].deviceId;
}

function fillSelect(select, devices, emptyLabel, selectedId) {
    if (!select) return;
    select.innerHTML = '';
    if (!devices.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = emptyLabel;
        select.appendChild(option);
        return;
    }

    devices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `${device.kind === 'videoinput' ? 'Câmera' : 'Microfone'} ${index + 1}`;
        option.selected = selectedId ? device.deviceId === selectedId : index === 0;
        select.appendChild(option);
    });
}

async function requestPreviewMedia(showToastOnError) {
    try {
        stopPreviewStream();
        const constraints = {
            audio: state.selectedMicrophoneId ? { deviceId: { exact: state.selectedMicrophoneId } } : true,
            video: state.selectedCameraId ? { deviceId: { exact: state.selectedCameraId } } : true
        };
        state.localPreviewStream = await navigator.mediaDevices.getUserMedia(constraints);
        state.cameraEnabled = true;
        state.microphoneEnabled = true;
        els['preview-video'].srcObject = state.localPreviewStream;
        els['preview-placeholder'].hidden = true;
        updatePreviewButtons();
        await populateDeviceSelectors(false);
        setPrejoinMessage('Dispositivos ativos. Você pode testar e ajustar tudo antes de entrar.', 'info');
    } catch (error) {
        console.error('[assembleia-online] Erro ao acessar dispositivos:', error);
        state.cameraEnabled = false;
        state.microphoneEnabled = false;
        updatePreviewButtons();
        const friendly = 'O navegador não liberou câmera ou microfone. Verifique as permissões do site e tente novamente.';
        setPrejoinMessage(friendly, 'error');
        if (showToastOnError) showToast(friendly, 'error');
    }
}

function testAudioOutput() {
    if (!state.localPreviewStream || !state.localPreviewStream.getAudioTracks().length) {
        showToast('Ative o microfone primeiro para testar o áudio.', 'error');
        return;
    }
    showToast('Microfone detectado. Fale por alguns segundos e observe o indicador do navegador.', 'success');
}

function togglePreviewCamera() {
    state.cameraEnabled = !state.cameraEnabled;
    if (state.localPreviewStream) {
        state.localPreviewStream.getVideoTracks().forEach((track) => {
            track.enabled = state.cameraEnabled;
        });
    }
    updatePreviewButtons();
}

function togglePreviewMicrophone() {
    state.microphoneEnabled = !state.microphoneEnabled;
    if (state.localPreviewStream) {
        state.localPreviewStream.getAudioTracks().forEach((track) => {
            track.enabled = state.microphoneEnabled;
        });
    }
    updatePreviewButtons();
}

function updatePreviewButtons() {
    updateDeviceToggleButton(els['toggle-camera-btn'], state.cameraEnabled, 'fa-video', 'fa-video-slash', 'Câmera ligada', 'Câmera desligada');
    updateDeviceToggleButton(els['toggle-mic-btn'], state.microphoneEnabled, 'fa-microphone', 'fa-microphone-slash', 'Microfone ligado', 'Microfone desligado');
    updateRoundButton(els['meeting-camera-btn'], state.cameraEnabled, 'fa-video', 'fa-video-slash');
    updateRoundButton(els['meeting-mic-btn'], state.microphoneEnabled, 'fa-microphone', 'fa-microphone-slash');
}

function updateDeviceToggleButton(button, enabled, onIcon, offIcon, onText, offText) {
    if (!button) return;
    button.classList.toggle('active', enabled);
    button.innerHTML = `<i class="fas ${enabled ? onIcon : offIcon}"></i><span>${enabled ? onText : offText}</span>`;
}

function updateRoundButton(button, enabled, onIcon, offIcon) {
    if (!button) return;
    button.classList.toggle('active', enabled);
    button.innerHTML = `<i class="fas ${enabled ? onIcon : offIcon}"></i>`;
}

async function joinRoom() {
    if (state.room) return;
    setConnectionState('connecting', 'Conectando...');
    els['enter-assembly-btn'].disabled = true;

    try {
        const tokenData = await apiPost('/api/livekit-token', { assemblyId: state.assemblyId });
        state.livekitUrl = tokenData.livekitUrl;
        state.roomToken = tokenData.token;
        state.room = new Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: {
                resolution: VideoPresets.h720.resolution
            }
        });

        registerRoomListeners();
        state.room.prepareConnection(state.livekitUrl, state.roomToken);
        await state.room.connect(state.livekitUrl, state.roomToken);

        if (state.selectedMicrophoneId) {
            await switchRoomDevice('audioinput', state.selectedMicrophoneId);
        }
        if (state.selectedCameraId) {
            await switchRoomDevice('videoinput', state.selectedCameraId);
        }

        await state.room.localParticipant.setMicrophoneEnabled(Boolean(state.microphoneEnabled));
        await state.room.localParticipant.setCameraEnabled(Boolean(state.cameraEnabled));

        stopPreviewStream();
        await attendanceJoin();
        startHeartbeat();
        await subscribeRealtime();

        els['prejoin-panel'].hidden = true;
        els['meeting-panel'].hidden = false;
        renderMeetingParticipants();
        renderAttendance(state.attendance);
        startElapsedTimer();
        showToast('Você entrou na assembleia com sucesso.', 'success');
    } catch (error) {
        console.error('[assembleia-online] Erro ao entrar na sala:', error);
        state.room?.disconnect(true);
        state.room = null;
        setConnectionState('disconnected', 'Desconectado');
        showToast(error.message || 'Não foi possível entrar na assembleia.', 'error');
    } finally {
        els['enter-assembly-btn'].disabled = false;
    }
}

function registerRoomListeners() {
    if (!state.room) return;

    state.room
        .on(RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === Track.Kind.Audio) {
                const audioElement = track.attach();
                audioElement.dataset.livekitAudio = 'true';
                audioElement.style.display = 'none';
                document.body.appendChild(audioElement);
            }
            renderMeetingParticipants();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
            track.detach().forEach((element) => element.remove());
            renderMeetingParticipants();
        })
        .on(RoomEvent.ParticipantConnected, () => renderMeetingParticipants())
        .on(RoomEvent.ParticipantDisconnected, () => renderMeetingParticipants())
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            state.activeSpeakerIds = new Set((speakers || []).map((participant) => participant.identity));
            renderMeetingParticipants();
        })
        .on(RoomEvent.ConnectionStateChanged, (connectionState) => {
            if (connectionState === ConnectionState.Connected) {
                setConnectionState('connected', 'Conectado');
            } else if (connectionState === ConnectionState.Reconnecting) {
                setConnectionState('reconnecting', 'Reconectando...');
            } else if (connectionState === ConnectionState.Disconnected) {
                setConnectionState('disconnected', 'Desconectado');
            }
        })
        .on(RoomEvent.Disconnected, async () => {
            stopHeartbeat();
            unsubscribeRealtime();
            renderMeetingParticipants();
        })
        .on(RoomEvent.LocalTrackPublished, renderMeetingParticipants)
        .on(RoomEvent.LocalTrackUnpublished, renderMeetingParticipants)
        .on(RoomEvent.MediaDevicesError, () => {
            showToast('Houve um problema com câmera ou microfone. Verifique as permissões do navegador.', 'error');
        });
}

async function switchRoomDevice(kind, deviceId) {
    if (!state.room || !deviceId) return;
    try {
        await state.room.switchActiveDevice(kind, deviceId);
    } catch (error) {
        console.warn('[assembleia-online] Falha ao trocar dispositivo:', error);
    }
}

function getParticipantDescriptors() {
    if (!state.room) return [];
    const descriptors = [];

    const local = state.room.localParticipant;
    descriptors.push({
        participant: local,
        identity: local.identity,
        name: local.name || state.currentUser.name || 'Você',
        role: normalizeRole(state.currentUser.type || state.currentUser.user_type),
        isLocal: true,
        isHost: normalizeRole(state.currentUser.type || state.currentUser.user_type) === 'sindico'
    });

    state.room.remoteParticipants.forEach((participant) => {
        const metadata = safeJsonParse(participant.metadata) || {};
        descriptors.push({
            participant,
            identity: participant.identity,
            name: participant.name || metadata.email || 'Participante',
            role: normalizeRole(metadata.userType),
            isLocal: false,
            isHost: normalizeRole(metadata.userType) === 'sindico'
        });
    });

    return descriptors;
}

function renderMeetingParticipants() {
    if (!els['participant-grid']) return;
    const descriptors = getParticipantDescriptors();
    els['participant-count'].textContent = String(descriptors.length);
    els['participant-grid'].innerHTML = '';

    const screenShare = descriptors.find(({ participant }) => hasTrackWithSource(participant, Track.Source.ScreenShare));
    renderScreenShare(screenShare);

    descriptors.forEach((descriptor) => {
        const card = document.createElement('article');
        card.className = 'participant-card';
        if (state.activeSpeakerIds.has(descriptor.identity)) card.classList.add('speaking');

        const request = state.requests.find((item) => item.user_email === getParticipantEmail(descriptor));
        const handBadge = request && ['aguardando', 'autorizado'].includes(request.status)
            ? '<span class="badge-pill">✋ Mão levantada</span>'
            : '';

        const videoTrack = getVideoTrackForParticipant(descriptor.participant);
        const cameraOn = Boolean(videoTrack);
        const micOn = descriptor.participant.isMicrophoneEnabled;

        card.innerHTML = `
            <div class="participant-media">
                <div class="participant-avatar" ${cameraOn ? 'hidden' : ''}>${escapeHtml(getInitials(descriptor.name))}</div>
                <div class="participant-badges">
                    <div>
                        ${descriptor.isLocal ? '<span class="badge-pill">Você</span>' : ''}
                        ${descriptor.isHost ? '<span class="badge-pill host">Síndico</span>' : ''}
                    </div>
                    <div>${handBadge}</div>
                </div>
                <div class="participant-footer">
                    <div>${escapeHtml(descriptor.name)}${descriptor.role ? ` • ${capitalizeRole(descriptor.role)}` : ''}</div>
                    <div>
                        <span class="mic-state"><i class="fas ${micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i></span>
                        <span class="camera-state"><i class="fas ${cameraOn ? 'fa-video' : 'fa-video-slash'}"></i></span>
                    </div>
                </div>
            </div>
        `;

        if (videoTrack) {
            const container = card.querySelector('.participant-media');
            const element = videoTrack.attach();
            element.classList.add('participant-video');
            if (descriptor.isLocal) {
                element.muted = true;
                element.playsInline = true;
            }
            container.prepend(element);
        }

        els['participant-grid'].appendChild(card);
    });

    renderParticipantSidebar(descriptors);
}

function renderScreenShare(screenShareDescriptor) {
    const stage = document.getElementById('screen-share-stage');
    const container = document.getElementById('screen-share-content');
    if (!stage || !container) return;

    container.innerHTML = '';
    if (!screenShareDescriptor) {
        stage.hidden = true;
        return;
    }

    const track = getScreenShareTrack(screenShareDescriptor.participant);
    if (!track) {
        stage.hidden = true;
        return;
    }

    const element = track.attach();
    element.playsInline = true;
    if (screenShareDescriptor.isLocal) element.muted = true;
    container.appendChild(element);
    stage.hidden = false;
}

function renderParticipantSidebar(descriptors) {
    if (!els['participant-list']) return;
    els['participant-list'].innerHTML = '';

    descriptors.forEach((descriptor) => {
        const email = getParticipantEmail(descriptor);
        const request = state.requests.find((item) => item.user_email === email);
        const audioTrack = getMicrophonePublication(descriptor.participant);
        const moderationControls = normalizeRole(state.currentUser.type || state.currentUser.user_type) === 'sindico' && !descriptor.isLocal ? `
            <div class="toggle-row">
                ${audioTrack?.trackSid ? `<button type="button" class="btn btn-secondary" data-action="mute" data-identity="${descriptor.identity}" data-track="${audioTrack.trackSid}"><i class="fas fa-volume-xmark"></i> Silenciar</button>` : ''}
                <button type="button" class="btn btn-secondary" data-action="remove" data-identity="${descriptor.identity}"><i class="fas fa-user-slash"></i> Remover</button>
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <strong>${escapeHtml(descriptor.name)}</strong>
            <small>${capitalizeRole(descriptor.role)}${request ? ` • Pedido: ${request.status}` : ''}</small>
            ${moderationControls}
        `;
        card.querySelectorAll('button[data-action]').forEach((button) => {
            button.addEventListener('click', () => moderateParticipant(button.dataset.action, button.dataset.identity, button.dataset.track));
        });
        els['participant-list'].appendChild(card);
    });
}

function renderChat() {
    if (!els['chat-list']) return;
    els['chat-list'].innerHTML = '';
    state.chatMessages.forEach((message) => {
        const item = document.createElement('div');
        item.className = 'chat-item';
        item.innerHTML = `
            <strong>${escapeHtml(message.participant_name || message.user_email)}</strong>
            <small>${formatDateTime(message.created_at)}</small>
            <p>${escapeHtml(message.message || '')}</p>
        `;
        els['chat-list'].appendChild(item);
    });
    els['chat-list'].scrollTop = els['chat-list'].scrollHeight;
}

function renderRequests() {
    if (!els['request-list']) return;
    els['request-list'].innerHTML = '';

    const waiting = state.requests.filter((item) => item.status !== 'finalizado');
    if (!waiting.length) {
        els['request-list'].innerHTML = '<div class="list-card"><strong>Nenhum pedido no momento.</strong><small>Quando alguém levantar a mão, a fila aparece aqui.</small></div>';
    } else {
        waiting.forEach((request) => {
            const card = document.createElement('div');
            card.className = 'list-card';
            card.innerHTML = `
                <strong>${escapeHtml(request.participant_name)}</strong>
                <small>${request.status} • ${formatDateTime(request.requested_at)}</small>
            `;

            if (normalizeRole(state.currentUser.type || state.currentUser.user_type) === 'sindico') {
                const actions = document.createElement('div');
                actions.className = 'toggle-row';
                ['autorizado', 'recusado', 'finalizado'].forEach((status) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn btn-secondary';
                    button.textContent = status === 'autorizado' ? 'Autorizar' : status === 'recusado' ? 'Recusar' : 'Finalizar';
                    button.addEventListener('click', () => resolveSpeakingRequest(request.id, status));
                    actions.appendChild(button);
                });
                card.appendChild(actions);
            }
            els['request-list'].appendChild(card);
        });
    }

    const myWaiting = state.requests.find((item) => item.user_email === state.currentUser.email && item.status === 'aguardando');
    state.handRaised = Boolean(myWaiting);
    if (els['raise-hand-btn']) {
        els['raise-hand-btn'].innerHTML = state.handRaised
            ? '<i class="fas fa-hand"></i> Abaixar a mão'
            : '<i class="fas fa-hand-paper"></i> Levantar a mão';
    }
}

function renderPolls() {
    if (!els['poll-list']) return;
    els['poll-list'].innerHTML = '';
    const role = normalizeRole(state.currentUser.type || state.currentUser.user_type);

    if (!state.polls.length) {
        els['poll-list'].innerHTML = '<div class="poll-card"><strong>Nenhuma votação aberta.</strong><small>As votações criadas pelo síndico aparecerão aqui.</small></div>';
        return;
    }

    state.polls.forEach((poll) => {
        const pollOptions = state.pollOptions.filter((item) => item.poll_id === poll.id);
        const pollVotes = state.votes.filter((vote) => vote.poll_id === poll.id);
        const alreadyVoted = pollVotes.find((vote) => vote.user_email === state.currentUser.email);
        const card = document.createElement('div');
        card.className = 'poll-card';
        card.innerHTML = `
            <strong>${escapeHtml(poll.title)}</strong>
            <small>${poll.status} • ${formatDateTime(poll.created_at)}</small>
            <p>${escapeHtml(poll.description || '')}</p>
            <div class="vote-options"></div>
        `;
        const optionsContainer = card.querySelector('.vote-options');

        pollOptions.forEach((option) => {
            const count = pollVotes.filter((vote) => vote.option_id === option.id).length;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vote-option-btn';
            if (alreadyVoted?.option_id === option.id) button.classList.add('voted');
            button.innerHTML = `<strong>${escapeHtml(option.option_text)}</strong><small>${count} voto(s)</small>`;
            button.disabled = poll.status !== 'aberta' || role === 'porteiro' || Boolean(alreadyVoted);
            button.addEventListener('click', () => castVote(poll.id, option.id));
            optionsContainer.appendChild(button);
        });

        if (role === 'sindico' && poll.status === 'aberta') {
            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'btn btn-secondary';
            closeButton.innerHTML = '<i class="fas fa-lock"></i> Encerrar votação';
            closeButton.addEventListener('click', () => closePoll(poll.id));
            card.appendChild(closeButton);
        }
        els['poll-list'].appendChild(card);
    });
}

function renderAttendance(rows) {
    if (Array.isArray(rows) && rows.length) {
        state.attendance = rows;
    }
    if (!els['attendance-list']) return;
    els['attendance-list'].innerHTML = '';
    if (!state.attendance.length) {
        els['attendance-list'].innerHTML = '<div class="list-card"><strong>Nenhuma presença registrada.</strong></div>';
        return;
    }
    state.attendance.forEach((row) => {
        const card = document.createElement('div');
        card.className = 'list-card';
        card.innerHTML = `
            <strong>${escapeHtml(row.participant_name)}</strong>
            <small>${capitalizeRole(row.participant_role)} • Entrada: ${formatDateTime(row.joined_at)}</small>
        `;
        els['attendance-list'].appendChild(card);
    });
}

async function sendChatMessage(event) {
    event.preventDefault();
    const message = els['chat-input'].value.trim();
    if (!message) return;

    try {
        await apiPost('/api/assembly-event', {
            action: 'send_chat_message',
            assemblyId: state.assemblyId,
            message
        });
        els['chat-input'].value = '';
    } catch (error) {
        showToast(error.message || 'Não foi possível enviar a mensagem.', 'error');
    }
}

async function toggleHandRaise() {
    try {
        await apiPost('/api/assembly-event', {
            action: state.handRaised ? 'lower_hand' : 'raise_hand',
            assemblyId: state.assemblyId
        });
        await loadAssemblyState();
        renderRequests();
        renderMeetingParticipants();
    } catch (error) {
        showToast(error.message || 'Não foi possível atualizar o pedido de fala.', 'error');
    }
}

async function resolveSpeakingRequest(requestId, status) {
    try {
        await apiPost('/api/assembly-event', {
            action: 'resolve_speaking_request',
            assemblyId: state.assemblyId,
            requestId,
            status
        });
    } catch (error) {
        showToast(error.message || 'Não foi possível atualizar o pedido de fala.', 'error');
    }
}

async function createPoll(event) {
    event.preventDefault();
    const title = els['poll-title-input'].value.trim();
    const description = els['poll-description-input'].value.trim();
    const options = Array.from(els['poll-options-wrapper'].querySelectorAll('.poll-option-input'))
        .map((input) => input.value.trim())
        .filter(Boolean);

    try {
        await apiPost('/api/assembly-event', {
            action: 'create_poll',
            assemblyId: state.assemblyId,
            title,
            description,
            options
        });
        togglePollModal(false);
        els['poll-form'].reset();
        resetPollOptions();
        await loadAssemblyState();
        renderPolls();
    } catch (error) {
        showToast(error.message || 'Não foi possível criar a votação.', 'error');
    }
}

function addPollOptionField() {
    const optionNumber = els['poll-options-wrapper'].querySelectorAll('.poll-option-row').length + 1;
    const row = document.createElement('div');
    row.className = 'poll-option-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'poll-option-input';
    input.maxLength = 255;
    input.placeholder = `Opção ${optionNumber}`;
    input.required = true;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'poll-option-remove';
    removeBtn.setAttribute('aria-label', 'Remover opção');
    removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    removeBtn.addEventListener('click', () => removePollOptionRow(row));

    row.appendChild(input);
    row.appendChild(removeBtn);
    els['poll-options-wrapper'].appendChild(row);
    refreshPollOptionButtons();
}

function resetPollOptions() {
    els['poll-options-wrapper'].innerHTML = '';
    addPollOptionField();
    addPollOptionField();
}

function togglePollModal(show) {
    if (!els['poll-modal']) return;
    els['poll-modal'].hidden = !show;
    if (!show) {
        els['poll-form']?.reset();
        resetPollOptions();
    }
}

function removePollOptionRow(row) {
    const rows = els['poll-options-wrapper'].querySelectorAll('.poll-option-row');
    if (rows.length <= 2) {
        showToast('A votação precisa ter pelo menos duas opções.', 'error');
        return;
    }
    row.remove();
    refreshPollOptionButtons();
    refreshPollOptionPlaceholders();
}

function refreshPollOptionButtons() {
    const rows = Array.from(els['poll-options-wrapper']?.querySelectorAll('.poll-option-row') || []);
    rows.forEach((row) => {
        const button = row.querySelector('.poll-option-remove');
        if (button) {
            button.disabled = rows.length <= 2;
        }
    });
    refreshPollOptionPlaceholders();
}

function refreshPollOptionPlaceholders() {
    const inputs = Array.from(els['poll-options-wrapper']?.querySelectorAll('.poll-option-input') || []);
    inputs.forEach((input, index) => {
        input.placeholder = `Opção ${index + 1}`;
    });
}

async function castVote(pollId, optionId) {
    try {
        await apiPost('/api/assembly-event', {
            action: 'cast_vote',
            assemblyId: state.assemblyId,
            pollId,
            optionId
        });
        await loadAssemblyState();
        renderPolls();
        showToast('Seu voto foi registrado com sucesso.', 'success');
    } catch (error) {
        showToast(error.message || 'Não foi possível registrar o voto.', 'error');
    }
}

async function closePoll(pollId) {
    try {
        await apiPost('/api/assembly-event', {
            action: 'close_poll',
            assemblyId: state.assemblyId,
            pollId
        });
        await loadAssemblyState();
        renderPolls();
    } catch (error) {
        showToast(error.message || 'Não foi possível encerrar a votação.', 'error');
    }
}

async function startAssembly() {
    try {
        await apiPost('/api/iniciar-assembleia', { assemblyId: state.assemblyId });
        await loadAssemblyState();
        renderPrejoinInfo();
        renderHeader();
        showToast('A assembleia foi iniciada oficialmente.', 'success');
    } catch (error) {
        showToast(error.message || 'Não foi possível iniciar a assembleia.', 'error');
    }
}

async function endAssembly() {
    try {
        await apiPost('/api/encerrar-assembleia', { assemblyId: state.assemblyId });
        await loadAssemblyState();
        renderPrejoinInfo();
        renderHeader();
        showToast('A assembleia foi encerrada com sucesso.', 'success');
        if (state.room) {
            await leaveRoom();
        }
    } catch (error) {
        showToast(error.message || 'Não foi possível encerrar a assembleia.', 'error');
    }
}

async function moderateParticipant(action, targetIdentity, trackSid) {
    try {
        await apiPost('/api/moderar-participante', {
            assemblyId: state.assemblyId,
            action: action === 'mute' ? 'mute_audio' : 'remove_participant',
            targetIdentity,
            trackSid
        });
        showToast(action === 'mute' ? 'Participante silenciado.' : 'Participante removido da assembleia.', 'success');
    } catch (error) {
        showToast(error.message || 'Não foi possível moderar o participante.', 'error');
    }
}

async function attendanceJoin() {
    const response = await apiPost('/api/assembly-event', {
        action: 'attendance_join',
        assemblyId: state.assemblyId
    });
    state.connectedAttendanceId = response.attendance?.id || null;
}

async function attendanceLeave() {
    if (!state.room) return;
    try {
        await apiPost('/api/assembly-event', {
            action: 'attendance_leave',
            assemblyId: state.assemblyId
        });
    } catch (_) {}
}

function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatTimer = window.setInterval(() => {
        apiPost('/api/assembly-event', {
            action: 'attendance_heartbeat',
            assemblyId: state.assemblyId
        }).catch(() => {});
    }, 25000);
}

function stopHeartbeat() {
    if (state.heartbeatTimer) {
        clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
    }
}

function startElapsedTimer() {
    if (state.elapsedTimer) clearInterval(state.elapsedTimer);
    updateElapsedTime();
    state.elapsedTimer = window.setInterval(updateElapsedTime, 1000);
}

function updateElapsedTime() {
    if (!els['elapsed-time'] || !state.assembly) return;
    const startBase = state.assembly.startedAt || new Date().toISOString();
    const startDate = new Date(startBase);
    const diff = Math.max(0, Date.now() - startDate.getTime());
    const seconds = Math.floor(diff / 1000);
    const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    els['elapsed-time'].textContent = `${hh}:${mm}:${ss}`;
}

async function subscribeRealtime() {
    unsubscribeRealtime();
    const token = await getValidAccessToken();
    await state.browserSupabase.realtime.setAuth(token);
    state.realtimeChannel = state.browserSupabase
        .channel(`assembly-online-${state.assembly.numericId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'assembly_chat_messages',
            filter: `assembly_id=eq.${state.assembly.numericId}`
        }, handleRealtimeRefresh)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'assembly_speaking_requests',
            filter: `assembly_id=eq.${state.assembly.numericId}`
        }, handleRealtimeRefresh)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'assembly_polls',
            filter: `assembly_id=eq.${state.assembly.numericId}`
        }, handleRealtimeRefresh)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'assembly_votes',
            filter: `assembly_id=eq.${state.assembly.numericId}`
        }, handleRealtimeRefresh)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'assembly_attendance',
            filter: `assembly_id=eq.${state.assembly.numericId}`
        }, handleRealtimeRefresh)
        .subscribe();
}

let refreshTimer = null;
function handleRealtimeRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
        try {
            await loadAssemblyState();
            renderChat();
            renderRequests();
            renderPolls();
            renderAttendance(state.attendance);
            renderHeader();
        } catch (_) {}
    }, 250);
}

function unsubscribeRealtime() {
    if (state.realtimeChannel) {
        state.browserSupabase.removeChannel(state.realtimeChannel);
        state.realtimeChannel = null;
    }
}

async function toggleMeetingMicrophone() {
    if (!state.room) return;
    state.microphoneEnabled = !state.microphoneEnabled;
    await state.room.localParticipant.setMicrophoneEnabled(state.microphoneEnabled);
    updatePreviewButtons();
}

async function toggleMeetingCamera() {
    if (!state.room) return;
    state.cameraEnabled = !state.cameraEnabled;
    await state.room.localParticipant.setCameraEnabled(state.cameraEnabled);
    updatePreviewButtons();
    renderMeetingParticipants();
}

async function toggleScreenShare() {
    if (!state.room) return;
    try {
        state.screenShareEnabled = !state.screenShareEnabled;
        await state.room.localParticipant.setScreenShareEnabled(state.screenShareEnabled);
        updateRoundButton(els['meeting-screen-btn'], state.screenShareEnabled, 'fa-display', 'fa-display');
        renderMeetingParticipants();
    } catch (error) {
        state.screenShareEnabled = false;
        updateRoundButton(els['meeting-screen-btn'], false, 'fa-display', 'fa-display');
        showToast(error.message || 'Não foi possível compartilhar a tela.', 'error');
    }
}

function toggleMeetingSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    if (els['meeting-sidebar']) {
        els['meeting-sidebar'].style.display = state.sidebarOpen ? 'flex' : 'none';
    }
}

async function leaveRoom() {
    stopHeartbeat();
    unsubscribeRealtime();
    await attendanceLeave();
    if (state.room) {
        state.room.disconnect(true);
        state.room = null;
    }
    cleanupDetachedAudio();
    els['meeting-panel'].hidden = true;
    els['prejoin-panel'].hidden = false;
    setConnectionState('disconnected', 'Desconectado');
    renderMeetingParticipants();
}

function cleanupDetachedAudio() {
    document.querySelectorAll('[data-livekit-audio="true"]').forEach((element) => element.remove());
}

function switchSidebarPanel(tabName) {
    els.sidebarTabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
    els.sidebarPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tabName));
}

function openDevicesModal() {
    if (document.getElementById('devices-modal-overlay')) {
        document.getElementById('devices-modal-overlay').hidden = false;
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'devices-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="devices-modal-title">
            <div class="modal-header">
                <h3 id="devices-modal-title">Trocar dispositivos</h3>
                <button type="button" class="icon-btn" id="devices-modal-close" aria-label="Fechar modal de dispositivos">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-form">
                <label for="devices-camera-select">Câmera</label>
                <select id="devices-camera-select"></select>
                <label for="devices-microphone-select">Microfone</label>
                <select id="devices-microphone-select"></select>
                <div class="modal-actions">
                    <button type="button" class="btn btn-primary" id="devices-save-btn">Aplicar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const cameraSelect = overlay.querySelector('#devices-camera-select');
    const micSelect = overlay.querySelector('#devices-microphone-select');
    fillSelect(cameraSelect, Array.from(els['camera-select'].options).map((option) => ({ deviceId: option.value, label: option.textContent, kind: 'videoinput' })), 'Nenhuma câmera', state.selectedCameraId);
    fillSelect(micSelect, Array.from(els['microphone-select'].options).map((option) => ({ deviceId: option.value, label: option.textContent, kind: 'audioinput' })), 'Nenhum microfone', state.selectedMicrophoneId);

    overlay.querySelector('#devices-modal-close').addEventListener('click', () => {
        overlay.hidden = true;
    });
    overlay.querySelector('#devices-save-btn').addEventListener('click', async () => {
        state.selectedCameraId = cameraSelect.value;
        state.selectedMicrophoneId = micSelect.value;
        els['camera-select'].value = state.selectedCameraId;
        els['microphone-select'].value = state.selectedMicrophoneId;
        if (state.room) {
            await switchRoomDevice('videoinput', state.selectedCameraId);
            await switchRoomDevice('audioinput', state.selectedMicrophoneId);
        }
        overlay.hidden = true;
        showToast('Dispositivos atualizados.', 'success');
    });
}

function setConnectionState(kind, label) {
    if (!els['connection-pill']) return;
    els['connection-pill'].textContent = label;
    els['connection-pill'].className = `connection-pill ${kind}`;
}

function showToast(message, kind = '') {
    if (!els['toast-region']) return;
    const toast = document.createElement('div');
    toast.className = `toast-item ${kind}`.trim();
    toast.textContent = message;
    els['toast-region'].appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

function stopPreviewStream() {
    if (state.localPreviewStream) {
        state.localPreviewStream.getTracks().forEach((track) => track.stop());
        state.localPreviewStream = null;
    }
    if (els['preview-video']) els['preview-video'].srcObject = null;
    if (els['preview-placeholder']) els['preview-placeholder'].hidden = false;
}

function getVideoTrackForParticipant(participant) {
    for (const publication of participant.videoTrackPublications.values()) {
        if (publication.source === Track.Source.ScreenShare) continue;
        if (publication.videoTrack) return publication.videoTrack;
    }
    return null;
}

function getScreenShareTrack(participant) {
    for (const publication of participant.videoTrackPublications.values()) {
        if (publication.source === Track.Source.ScreenShare && publication.videoTrack) return publication.videoTrack;
    }
    return null;
}

function hasTrackWithSource(participant, source) {
    for (const publication of participant.videoTrackPublications.values()) {
        if (publication.source === source && publication.videoTrack) return true;
    }
    return false;
}

function getMicrophonePublication(participant) {
    for (const publication of participant.audioTrackPublications.values()) {
        if (publication.source === Track.Source.Microphone) return publication;
    }
    return null;
}

function getParticipantEmail(descriptor) {
    if (descriptor.isLocal) return state.currentUser.email;
    const metadata = safeJsonParse(descriptor.participant.metadata) || {};
    return metadata.email || '';
}

function formatStatusLabel(status) {
    if (status === 'agendada') return 'Agendada';
    if (status === 'em_andamento') return 'Em andamento';
    if (status === 'encerrada') return 'Encerrada';
    if (status === 'cancelada') return 'Cancelada';
    return 'Indefinida';
}

function formatAssemblyStatusText(status) {
    if (status === 'agendada') return 'Aguardando início do síndico';
    if (status === 'em_andamento') return 'Sala ao vivo';
    if (status === 'encerrada') return 'Assembleia encerrada';
    if (status === 'cancelada') return 'Assembleia cancelada';
    return 'Status indisponível';
}

function normalizeRole(value) {
    const raw = String(value || '').toLowerCase();
    if (raw.includes('sind')) return 'sindico';
    if (raw.includes('porteir')) return 'porteiro';
    return 'morador';
}

function capitalizeRole(role) {
    if (role === 'sindico') return 'Síndico';
    if (role === 'porteiro') return 'Porteiro';
    return 'Morador';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeJsonParse(value) {
    if (!value) return null;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return null;
    }
}

function getInitials(value) {
    return String(value || 'VC')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function formatDate(dateValue) {
    if (!dateValue) return '-';
    return new Intl.DateTimeFormat('pt-BR').format(new Date(dateValue));
}

function formatDateTime(dateValue) {
    if (!dateValue) return '-';
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(dateValue));
}

function logout() {
    sessionStorage.removeItem('condominiumUser');
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem('condominiumPersistentUser');
    location.href = 'entrar.html';
}
