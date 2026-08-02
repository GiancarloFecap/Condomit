const assemblyState = {
    assembly: null,
    currentUser: null,
    currentAssemblyId: null,
    connected: false,
    joining: false,
    leaving: false,
    connectionStatus: 'Desconectado',
    cameraEnabled: false,
    microphoneEnabled: false,
    screenShareEnabled: false,
    handRaised: false,
    activePanel: null,
    openModal: null,
    activePollId: null,
    previewStream: null,
    screenStream: null,
    activeDevices: {
        audioInputId: '',
        videoInputId: ''
    },
    subscriptions: [],
    attendanceId: null,
    roomJoinedAt: null,
    timerInterval: null,
    heartbeatInterval: null,
    cleanupInterval: null,
    channel: null,
    sidePanelLastFocus: null,
    modalTrigger: null,
    participantMap: new Map(),
    polls: [],
    processedEventIds: new Set(),
    unreadChatCount: 0,
    unreadPollCount: 0
};

let selectedImageData = null;
let scheduledAssemblies = [];
let pastAssemblies = [];

function storageKey(prefix, assemblyId) {
    return `condomit-${prefix}-${String(assemblyId)}`;
}

function channelKeyFor(assemblyId) {
    return storageKey('assembly-channel', assemblyId);
}

function getChatStorageKey(assemblyId) {
    return storageKey('assembly-chat', assemblyId);
}

function getParticipantsStorageKey(assemblyId) {
    return storageKey('assembly-participants', assemblyId);
}

function getPollsStorageKey(assemblyId) {
    return storageKey('assembly-polls', assemblyId);
}

function getRequestsStorageKey(assemblyId) {
    return storageKey('assembly-speaking-requests', assemblyId);
}

function getInitials(name) {
    const value = String(name || '').trim();
    if (!value) return 'US';
    return value.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function getMyPeerId() {
    let peerId = '';
    try {
        peerId = sessionStorage.getItem('condomitPeerId') || '';
    } catch (_) {}

    if (!peerId) {
        peerId = `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            sessionStorage.setItem('condomitPeerId', peerId);
        } catch (_) {}
    }

    return peerId;
}

function getCurrentUserEmail() {
    return String(assemblyState.currentUser?.email || '').trim().toLowerCase();
}

function getCurrentUserType() {
    if (typeof getNormalizedUserType === 'function') {
        return getNormalizedUserType(assemblyState.currentUser);
    }
    return String(assemblyState.currentUser?.type || assemblyState.currentUser?.user_type || 'morador').toLowerCase();
}

function isSindico() {
    return getCurrentUserType() === 'sindico';
}

function isPorteiro() {
    return getCurrentUserType() === 'porteiro';
}

function canCurrentUserVote() {
    return !isPorteiro();
}

function readStorageJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch (_) {
        return fallback;
    }
}

function writeStorageJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = String(dateStr).split('-');
    if (!year || !month || !day) return String(dateStr);
    return `${day}/${month}/${year}`;
}

function formatTime(timeStr) {
    if (!timeStr) return '--:--';
    return String(timeStr).slice(0, 5);
}

function getCondoName(user) {
    const condo = user?.condominium;
    if (!condo) return 'Condominio atual';

    if (typeof condo === 'string') {
        try {
            const parsed = JSON.parse(condo);
            return parsed?.name || parsed?.condominium_name || parsed?.cep || 'Condominio atual';
        } catch (_) {
            return condo;
        }
    }

    return condo.name || condo.condominium_name || condo.cep || 'Condominio atual';
}

function extractUserCep(user) {
    if (!user) return null;
    if (user.condominium) {
        if (typeof user.condominium === 'string') {
            try {
                const parsed = JSON.parse(user.condominium);
                return parsed?.cep || parsed?.condominium_id || null;
            } catch (_) {
                return null;
            }
        }
        return user.condominium.cep || user.condominium.condominium_id || null;
    }
    return user.cep || user.condominium_cep || null;
}

function escapeText(value) {
    return String(value ?? '');
}

function showToast(message, tone = 'info') {
    const region = document.getElementById('toast-region');
    if (!region) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.textContent = message;
    region.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add('toast-hide');
        window.setTimeout(() => toast.remove(), 220);
    }, 3200);
}

function setConnectionStatus(status) {
    assemblyState.connectionStatus = status;
    const label = document.getElementById('connection-status-text');
    if (label) {
        label.textContent = status;
    }
}

function updateStatusChip(statusText) {
    const label = document.getElementById('room-status-text');
    if (label) {
        label.textContent = statusText;
    }
}

function setOverlayVisibility(id, visible) {
    const element = document.getElementById(id);
    if (!element) return;
    element.hidden = !visible;
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function closeAllPanels() {
    const panel = document.getElementById('assembly-side-panel');
    if (panel) {
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
    }

    document.querySelectorAll('.side-panel-section').forEach((section) => {
        section.hidden = true;
    });

    assemblyState.activePanel = null;

    const chatCounter = document.getElementById('chat-counter');
    if (chatCounter) {
        chatCounter.hidden = assemblyState.unreadChatCount === 0;
        chatCounter.textContent = String(assemblyState.unreadChatCount);
    }
}

function openSidePanel(panelName, triggerButton) {
    const panel = document.getElementById('assembly-side-panel');
    const panelTitle = document.getElementById('side-panel-title');
    if (!panel) return;

    if (assemblyState.activePanel === panelName && !panel.hidden) {
        closeAllPanels();
        return;
    }

    assemblyState.sidePanelLastFocus = triggerButton || document.activeElement;
    assemblyState.activePanel = panelName;
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');

    document.querySelectorAll('.side-panel-section').forEach((section) => {
        section.hidden = section.id !== `${panelName}-panel`;
    });

    if (panelTitle) {
        if (panelName === 'chat') panelTitle.textContent = 'Chat';
        if (panelName === 'participants') panelTitle.textContent = 'Participantes';
        if (panelName === 'polls') panelTitle.textContent = 'Votacoes';
    }

    if (panelName === 'chat') {
        assemblyState.unreadChatCount = 0;
        syncUnreadCounters();
        const input = document.getElementById('message-input');
        if (input) input.focus();
    }

    if (panelName === 'participants') {
        renderParticipantsPanel();
    }

    if (panelName === 'polls') {
        assemblyState.unreadPollCount = 0;
        syncUnreadCounters();
        renderPollsPanel();
    }
}

function syncUnreadCounters() {
    const chatCounter = document.getElementById('chat-counter');
    const pollCounter = document.getElementById('poll-counter');

    if (chatCounter) {
        chatCounter.hidden = assemblyState.unreadChatCount === 0;
        chatCounter.textContent = String(assemblyState.unreadChatCount);
    }

    if (pollCounter) {
        pollCounter.hidden = assemblyState.unreadPollCount === 0;
        pollCounter.textContent = String(assemblyState.unreadPollCount);
    }
}

function openModal(modalId, trigger) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (assemblyState.openModal === modalId && !modal.hidden) return;

    closeModal(assemblyState.openModal);
    assemblyState.openModal = modalId;
    assemblyState.modalTrigger = trigger || document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    const firstFocusable = modal.querySelector('input, select, textarea, button');
    if (firstFocusable) firstFocusable.focus();
}

function closeModal(modalId) {
    if (!modalId) return;
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (assemblyState.openModal === modalId) {
        assemblyState.openModal = null;
        document.body.classList.remove('modal-open');
        const trigger = assemblyState.modalTrigger;
        assemblyState.modalTrigger = null;
        if (trigger && typeof trigger.focus === 'function') {
            trigger.focus();
        }
    }
}

function closeAllModals() {
    document.querySelectorAll('.assembly-modal').forEach((modal) => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
    });
    assemblyState.openModal = null;
    document.body.classList.remove('modal-open');
}

function buildBroadcastEvent(type, data) {
    return {
        id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        ts: Date.now(),
        data
    };
}

function rememberProcessedEvent(eventId) {
    if (!eventId) return false;
    if (assemblyState.processedEventIds.has(eventId)) return true;
    assemblyState.processedEventIds.add(eventId);
    if (assemblyState.processedEventIds.size > 150) {
        const values = Array.from(assemblyState.processedEventIds).slice(-80);
        assemblyState.processedEventIds = new Set(values);
    }
    return false;
}

function getPersistedParticipants() {
    if (!assemblyState.currentAssemblyId) return [];
    return readStorageJson(getParticipantsStorageKey(assemblyState.currentAssemblyId), []);
}

function persistParticipants() {
    if (!assemblyState.currentAssemblyId) return;
    writeStorageJson(
        getParticipantsStorageKey(assemblyState.currentAssemblyId),
        Array.from(assemblyState.participantMap.values())
    );
}

function buildLocalParticipant(overrides = {}) {
    const name = assemblyState.currentUser?.name || 'Voce';
    return {
        peerId: getMyPeerId(),
        name,
        email: getCurrentUserEmail(),
        type: getCurrentUserType(),
        profilePhoto: assemblyState.currentUser?.profilePhoto || null,
        initials: getInitials(name),
        micOn: assemblyState.microphoneEnabled,
        cameraOn: assemblyState.cameraEnabled,
        handRaised: assemblyState.handRaised,
        lastSeen: Date.now(),
        ...overrides
    };
}

function upsertParticipant(participant) {
    if (!participant?.peerId) return;
    const normalized = {
        ...participant,
        initials: participant.initials || getInitials(participant.name),
        lastSeen: participant.lastSeen || Date.now()
    };
    assemblyState.participantMap.set(normalized.peerId, normalized);
    persistParticipants();
    renderParticipants();
    renderParticipantsPanel();
}

function removeParticipant(peerId) {
    if (!peerId) return;
    assemblyState.participantMap.delete(peerId);
    persistParticipants();
    renderParticipants();
    renderParticipantsPanel();
}

function broadcast(type, data) {
    if (!assemblyState.channel) return;
    const event = buildBroadcastEvent(type, data);
    rememberProcessedEvent(event.id);
    try {
        assemblyState.channel.postMessage(event);
    } catch (_) {}
}

function openAssemblyChannel() {
    closeAssemblyChannel();
    try {
        assemblyState.channel = new BroadcastChannel(channelKeyFor(assemblyState.currentAssemblyId));
        assemblyState.channel.onmessage = (message) => {
            handleAssemblyEvent(message.data);
        };
    } catch (_) {
        assemblyState.channel = null;
    }

    const persistedParticipants = getPersistedParticipants();
    assemblyState.participantMap = new Map();
    persistedParticipants
        .filter((participant) => Date.now() - Number(participant.lastSeen || 0) < 45000)
        .forEach((participant) => {
            assemblyState.participantMap.set(participant.peerId, participant);
        });

    renderParticipants();
    renderParticipantsPanel();
    loadChatHistory();
    loadPolls();
}

function closeAssemblyChannel() {
    if (assemblyState.channel) {
        try {
            assemblyState.channel.close();
        } catch (_) {}
    }
    assemblyState.channel = null;

    if (assemblyState.heartbeatInterval) {
        clearInterval(assemblyState.heartbeatInterval);
        assemblyState.heartbeatInterval = null;
    }

    if (assemblyState.cleanupInterval) {
        clearInterval(assemblyState.cleanupInterval);
        assemblyState.cleanupInterval = null;
    }
}

function handleAssemblyEvent(event) {
    if (!event?.type || rememberProcessedEvent(event.id)) return;
    const data = event.data || {};

    if (String(data.assemblyId || assemblyState.currentAssemblyId) !== String(assemblyState.currentAssemblyId)) {
        return;
    }

    switch (event.type) {
        case 'participant-presence':
            if (data.peerId !== getMyPeerId()) {
                upsertParticipant({ ...data, lastSeen: event.ts || Date.now() });
                updateParticipantCount();
            }
            break;
        case 'participant-leave':
            removeParticipant(data.peerId);
            updateParticipantCount();
            break;
        case 'participant-request-roster':
            if (data.peerId !== getMyPeerId()) {
                sendPresence();
            }
            break;
        case 'chat-message':
            appendChatMessage(data, { persist: true, fromRealtime: true });
            break;
        case 'poll-created':
        case 'poll-updated':
        case 'poll-ended':
            loadPolls();
            if (event.type === 'poll-created' && data.createdBy !== getCurrentUserEmail()) {
                assemblyState.unreadPollCount += 1;
                syncUnreadCounters();
                showToast('Uma nova votacao foi iniciada.', 'info');
            }
            break;
        case 'hand-raised':
            if (data.peerId !== getMyPeerId()) {
                upsertParticipant({ ...assemblyState.participantMap.get(data.peerId), ...data, lastSeen: Date.now() });
                if (isSindico()) {
                    showToast(`${data.name || 'Participante'} levantou a mao.`, 'info');
                }
            }
            break;
        case 'assembly-ended':
            showToast('A assembleia foi encerrada pelo sindico.', 'warning');
            performLeaveAssembly(false);
            break;
        default:
            break;
    }
}

function appendChatMessage(message, options = {}) {
    if (!message || !assemblyState.currentAssemblyId) return;

    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    const messageId = String(message.id || '');
    if (messageId && messagesContainer.querySelector(`[data-message-id="${messageId}"]`)) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `safe-message ${message.peerId === getMyPeerId() ? 'is-own' : ''}`;
    if (messageId) wrapper.dataset.messageId = messageId;

    const header = document.createElement('div');
    header.className = 'safe-message-header';

    const sender = document.createElement('strong');
    sender.textContent = message.sender || 'Usuario';
    header.appendChild(sender);

    const meta = document.createElement('span');
    meta.textContent = `${message.userType === 'sindico' ? 'Sindico' : message.userType === 'porteiro' ? 'Porteiro' : 'Morador'} • ${message.time || currentTimeLabel()}`;
    header.appendChild(meta);
    wrapper.appendChild(header);

    if (message.text) {
        const body = document.createElement('p');
        body.textContent = message.text;
        wrapper.appendChild(body);
    }

    if (message.imageData) {
        const image = document.createElement('img');
        image.src = message.imageData;
        image.alt = 'Imagem enviada no chat';
        image.className = 'chat-image-item';
        wrapper.appendChild(image);
    }

    messagesContainer.appendChild(wrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (options.persist) {
        const key = getChatStorageKey(assemblyState.currentAssemblyId);
        const history = readStorageJson(key, []);
        history.push(message);
        writeStorageJson(key, history.slice(-300));
    }

    if (options.fromRealtime && assemblyState.activePanel !== 'chat' && message.peerId !== getMyPeerId()) {
        assemblyState.unreadChatCount += 1;
        syncUnreadCounters();
    }
}

function currentTimeLabel() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function loadChatHistory() {
    const container = document.getElementById('chat-messages');
    if (!container || !assemblyState.currentAssemblyId) return;
    container.innerHTML = '';
    const history = readStorageJson(getChatStorageKey(assemblyState.currentAssemblyId), []);
    history.forEach((message) => appendChatMessage(message, { persist: false }));
}

function sendChatMessage() {
    const input = document.getElementById('message-input');
    const text = String(input?.value || '').trim();
    if (!text && !selectedImageData) return;
    if (!assemblyState.connected) {
        showToast('Entre na assembleia antes de enviar mensagens.', 'warning');
        return;
    }

    const message = {
        id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        assemblyId: assemblyState.currentAssemblyId,
        peerId: getMyPeerId(),
        sender: assemblyState.currentUser?.name || 'Usuario',
        email: getCurrentUserEmail(),
        userType: getCurrentUserType(),
        text,
        imageData: selectedImageData || null,
        time: currentTimeLabel()
    };

    appendChatMessage(message, { persist: true });
    broadcast('chat-message', message);

    if (input) input.value = '';
    removeSelectedImage();
}

function removeSelectedImage() {
    selectedImageData = null;
    const input = document.getElementById('image-upload');
    const wrapper = document.getElementById('image-preview-wrapper');
    const image = document.getElementById('image-preview');
    if (input) input.value = '';
    if (image) image.removeAttribute('src');
    if (wrapper) wrapper.classList.remove('active');
}

async function handleImageSelection(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        selectedImageData = reader.result;
        const wrapper = document.getElementById('image-preview-wrapper');
        const image = document.getElementById('image-preview');
        if (image) image.src = selectedImageData;
        if (wrapper) wrapper.classList.add('active');
    };
    reader.readAsDataURL(file);
}

function getPolls() {
    if (!assemblyState.currentAssemblyId) return [];
    return readStorageJson(getPollsStorageKey(assemblyState.currentAssemblyId), []);
}

function setPolls(polls) {
    assemblyState.polls = polls;
    if (assemblyState.currentAssemblyId) {
        writeStorageJson(getPollsStorageKey(assemblyState.currentAssemblyId), polls);
    }
    renderPollsPanel();
    syncUnreadCounters();
}

function loadPolls() {
    assemblyState.polls = getPolls();
    renderPollsPanel();
}

function createPollOptionField(value = '') {
    const row = document.createElement('div');
    row.className = 'poll-option-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 80;
    input.required = true;
    input.value = value;
    input.placeholder = 'Opcao da votacao';
    row.appendChild(input);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-only-btn';
    removeButton.setAttribute('aria-label', 'Remover opcao');
    removeButton.innerHTML = '<i class="fas fa-trash"></i>';
    removeButton.addEventListener('click', () => {
        const container = document.getElementById('poll-options-container');
        if (!container) return;
        if (container.children.length <= 2) {
            showToast('Uma votacao precisa ter pelo menos duas opcoes.', 'warning');
            return;
        }
        row.remove();
    });
    row.appendChild(removeButton);

    return row;
}

function resetCreatePollForm() {
    const form = document.getElementById('create-poll-form');
    const container = document.getElementById('poll-options-container');
    if (form) form.reset();
    if (container) {
        container.innerHTML = '';
        container.appendChild(createPollOptionField());
        container.appendChild(createPollOptionField());
    }
}

function renderPollsPanel() {
    const panel = document.getElementById('polls-panel-list');
    if (!panel) return;
    panel.innerHTML = '';

    const polls = getPolls();
    const currentUserEmail = getCurrentUserEmail();

    if (!polls.length) {
        const empty = document.createElement('p');
        empty.className = 'panel-empty';
        empty.textContent = 'Nenhuma votacao disponivel no momento.';
        panel.appendChild(empty);
        return;
    }

    polls
        .slice()
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .forEach((poll) => {
            const card = document.createElement('article');
            card.className = 'panel-card';

            const title = document.createElement('h4');
            title.textContent = poll.title;
            card.appendChild(title);

            const meta = document.createElement('p');
            const alreadyVoted = Boolean(poll.votes?.[currentUserEmail]);
            meta.textContent = `${poll.status === 'closed' ? 'Encerrada' : 'Aberta'} • ${alreadyVoted ? 'Voto registrado' : 'Aguardando voto'}`;
            card.appendChild(meta);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-secondary';
            button.textContent = 'Ver votacao';
            button.addEventListener('click', () => {
                assemblyState.activePollId = poll.id;
                openPollView(poll.id, button);
            });
            card.appendChild(button);

            panel.appendChild(card);
        });
}

function openPollView(pollId, trigger) {
    const poll = getPolls().find((item) => item.id === pollId);
    if (!poll) {
        showToast('A votacao nao foi encontrada.', 'warning');
        return;
    }

    const content = document.getElementById('poll-view-content');
    if (!content) return;
    content.innerHTML = '';

    const title = document.createElement('h4');
    title.textContent = poll.title;
    content.appendChild(title);

    if (poll.description) {
        const description = document.createElement('p');
        description.textContent = poll.description;
        content.appendChild(description);
    }

    const status = document.createElement('p');
    status.className = 'poll-status-line';
    status.textContent = `Status: ${poll.status === 'closed' ? 'Encerrada' : 'Aberta'}`;
    content.appendChild(status);

    const list = document.createElement('div');
    list.className = 'poll-options-list';
    const currentUserEmail = getCurrentUserEmail();
    const selectedOptionId = poll.votes?.[currentUserEmail] || null;
    const totalVotes = Object.keys(poll.votes || {}).length;

    poll.options.forEach((option) => {
        const votesForOption = Object.values(poll.votes || {}).filter((value) => value === option.id).length;
        const row = document.createElement('div');
        row.className = 'poll-option-vote-row';

        const label = document.createElement('div');
        label.className = 'poll-option-vote-label';
        label.textContent = option.text;
        row.appendChild(label);

        const stats = document.createElement('div');
        stats.className = 'poll-option-vote-stats';
        stats.textContent = `${votesForOption} voto(s)`;
        row.appendChild(stats);

        if (poll.status === 'open' && canCurrentUserVote()) {
            const voteButton = document.createElement('button');
            voteButton.type = 'button';
            voteButton.className = 'btn btn-primary btn-small';
            voteButton.textContent = selectedOptionId === option.id ? 'Votado' : selectedOptionId ? 'Indisponivel' : 'Votar';
            voteButton.disabled = Boolean(selectedOptionId);
            voteButton.addEventListener('click', () => {
                registerVote(poll.id, option.id);
            });
            row.appendChild(voteButton);
        }

        list.appendChild(row);
    });

    content.appendChild(list);

    const foot = document.createElement('p');
    foot.className = 'poll-status-line';
    foot.textContent = `Total de votos: ${totalVotes}${isPorteiro() ? ' • Porteiros nao podem votar' : ''}`;
    content.appendChild(foot);

    openModal('poll-view-modal', trigger);
}

function registerVote(pollId, optionId) {
    if (!canCurrentUserVote()) {
        showToast('Porteiros nao podem votar nesta pauta.', 'warning');
        return;
    }

    const polls = getPolls();
    const pollIndex = polls.findIndex((item) => item.id === pollId);
    if (pollIndex === -1) {
        showToast('A votacao nao foi encontrada.', 'warning');
        return;
    }

    const poll = polls[pollIndex];
    if (poll.status !== 'open') {
        showToast('Essa votacao ja foi encerrada.', 'warning');
        return;
    }

    const email = getCurrentUserEmail();
    if (!email) {
        showToast('Nao foi possivel identificar o usuario atual.', 'warning');
        return;
    }

    poll.votes = poll.votes || {};
    if (poll.votes[email]) {
        showToast('Seu voto ja foi registrado.', 'warning');
        return;
    }

    poll.votes[email] = optionId;
    polls[pollIndex] = poll;
    setPolls(polls);
    broadcast('poll-updated', {
        assemblyId: assemblyState.currentAssemblyId,
        pollId,
        voterEmail: email
    });

    showToast('Voto registrado com sucesso.', 'success');
    openPollView(pollId, document.getElementById('room-polls-btn'));
}

function createPoll(event) {
    event.preventDefault();
    if (!isSindico()) {
        showToast('Somente o sindico pode criar votacoes.', 'warning');
        return;
    }

    const title = String(document.getElementById('poll-title-input')?.value || '').trim();
    const description = String(document.getElementById('poll-description-input')?.value || '').trim();
    const optionInputs = Array.from(document.querySelectorAll('#poll-options-container input'));
    const options = optionInputs
        .map((input) => String(input.value || '').trim())
        .filter(Boolean);

    const uniqueOptions = Array.from(new Set(options.map((option) => option.toLowerCase())));

    if (!title) {
        showToast('Informe um titulo para a votacao.', 'warning');
        return;
    }

    if (options.length < 2) {
        showToast('Adicione pelo menos duas opcoes validas.', 'warning');
        return;
    }

    if (uniqueOptions.length !== options.length) {
        showToast('As opcoes da votacao nao podem ser identicas.', 'warning');
        return;
    }

    const submitButton = document.getElementById('submit-poll-btn');
    if (submitButton) submitButton.disabled = true;

    try {
        const polls = getPolls();
        const poll = {
            id: `poll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            assemblyId: assemblyState.currentAssemblyId,
            title,
            description,
            createdBy: getCurrentUserEmail(),
            createdAt: Date.now(),
            status: 'open',
            options: options.map((option) => ({
                id: `option-${Math.random().toString(36).slice(2, 8)}`,
                text: option
            })),
            votes: {}
        };

        polls.push(poll);
        setPolls(polls);
        closeModal('create-poll-modal');
        resetCreatePollForm();
        renderPollsPanel();

        broadcast('poll-created', {
            assemblyId: assemblyState.currentAssemblyId,
            pollId: poll.id,
            createdBy: poll.createdBy
        });

        showToast('Votacao criada com sucesso.', 'success');
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

function updateParticipantCount() {
    const count = 1 + Array.from(assemblyState.participantMap.values()).filter((participant) => participant.peerId !== getMyPeerId()).length;
    const label = document.getElementById('participants-count');
    if (label) {
        label.textContent = `${count} participante${count === 1 ? '' : 's'}`;
    }
}

function createParticipantCard(participant, isLocal) {
    const card = document.createElement('article');
    card.className = 'participant-card';

    const media = document.createElement('div');
    media.className = 'participant-media';

    const canShowLocalVideo = isLocal && assemblyState.cameraEnabled && assemblyState.previewStream?.getVideoTracks().length;
    if (canShowLocalVideo) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.srcObject = assemblyState.previewStream;
        media.appendChild(video);
    } else {
        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        if (participant.profilePhoto) {
            const image = document.createElement('img');
            image.src = participant.profilePhoto;
            image.alt = participant.name || 'Participante';
            avatar.appendChild(image);
        } else {
            avatar.textContent = participant.initials || getInitials(participant.name);
        }
        media.appendChild(avatar);
    }

    const footer = document.createElement('div');
    footer.className = 'participant-footer';

    const name = document.createElement('strong');
    const labels = [];
    if (isLocal) labels.push('Voce');
    if (participant.type === 'sindico') labels.push('Sindico');
    if (participant.handRaised) labels.push('Mao levantada');
    name.textContent = `${participant.name || 'Participante'}${labels.length ? ` • ${labels.join(' • ')}` : ''}`;
    footer.appendChild(name);

    const stateLine = document.createElement('span');
    stateLine.textContent = `${participant.cameraOn ? 'Camera ligada' : 'Camera desligada'} • ${participant.micOn ? 'Microfone ativo' : 'Microfone mudo'}`;
    footer.appendChild(stateLine);

    card.appendChild(media);
    card.appendChild(footer);
    return card;
}

function renderParticipants() {
    const grid = document.getElementById('video-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const localParticipant = buildLocalParticipant();
    grid.appendChild(createParticipantCard(localParticipant, true));

    Array.from(assemblyState.participantMap.values())
        .filter((participant) => participant.peerId !== getMyPeerId())
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .forEach((participant) => {
            grid.appendChild(createParticipantCard(participant, false));
        });

    updateParticipantCount();
}

function renderParticipantsPanel() {
    const panel = document.getElementById('participants-panel-list');
    if (!panel) return;
    panel.innerHTML = '';

    const everyone = [buildLocalParticipant()].concat(
        Array.from(assemblyState.participantMap.values()).filter((participant) => participant.peerId !== getMyPeerId())
    );

    everyone.forEach((participant, index) => {
        const row = document.createElement('div');
        row.className = 'participant-row';

        const info = document.createElement('div');
        info.className = 'participant-row-info';

        const name = document.createElement('strong');
        name.textContent = `${participant.name}${index === 0 ? ' • Voce' : ''}`;
        info.appendChild(name);

        const meta = document.createElement('span');
        meta.textContent = `${participant.type === 'sindico' ? 'Sindico' : participant.type === 'porteiro' ? 'Porteiro' : 'Morador'} • ${participant.handRaised ? 'Mao levantada' : 'Sem pedido de fala'}`;
        info.appendChild(meta);
        row.appendChild(info);

        const badges = document.createElement('div');
        badges.className = 'participant-row-badges';
        badges.textContent = `${participant.cameraOn ? 'Video on' : 'Video off'} • ${participant.micOn ? 'Audio on' : 'Audio off'}`;
        row.appendChild(badges);

        panel.appendChild(row);
    });
}

function persistLocalPresence() {
    upsertParticipant(buildLocalParticipant());
    broadcast('participant-presence', {
        ...buildLocalParticipant(),
        assemblyId: assemblyState.currentAssemblyId,
        announce: true
    });
}

function sendPresence() {
    upsertParticipant(buildLocalParticipant());
    broadcast('participant-presence', {
        ...buildLocalParticipant(),
        assemblyId: assemblyState.currentAssemblyId
    });
}

function startPresenceLoops() {
    if (assemblyState.heartbeatInterval) return;

    persistLocalPresence();
    broadcast('participant-request-roster', {
        assemblyId: assemblyState.currentAssemblyId,
        peerId: getMyPeerId()
    });

    assemblyState.heartbeatInterval = window.setInterval(() => {
        sendPresence();
    }, 12000);

    assemblyState.cleanupInterval = window.setInterval(() => {
        const now = Date.now();
        Array.from(assemblyState.participantMap.values()).forEach((participant) => {
            if (participant.peerId !== getMyPeerId() && now - Number(participant.lastSeen || 0) > 45000) {
                assemblyState.participantMap.delete(participant.peerId);
            }
        });
        persistParticipants();
        renderParticipants();
    }, 5000);
}

async function stopMediaStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
        try {
            track.stop();
        } catch (_) {}
    });
}

async function refreshPreviewMedia() {
    const desiredAudio = assemblyState.microphoneEnabled;
    const desiredVideo = assemblyState.cameraEnabled;
    const nextStream = new MediaStream();
    const permissionMessages = [];

    if (desiredAudio) {
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: assemblyState.activeDevices.audioInputId ? { deviceId: { exact: assemblyState.activeDevices.audioInputId } } : true,
                video: false
            });
            audioStream.getAudioTracks().forEach((track) => nextStream.addTrack(track));
        } catch (_) {
            assemblyState.microphoneEnabled = false;
            permissionMessages.push('Microfone indisponivel. Voce pode entrar como ouvinte.');
        }
    }

    if (desiredVideo) {
        try {
            const videoStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: assemblyState.activeDevices.videoInputId ? { deviceId: { exact: assemblyState.activeDevices.videoInputId } } : true
            });
            videoStream.getVideoTracks().forEach((track) => nextStream.addTrack(track));
        } catch (_) {
            assemblyState.cameraEnabled = false;
            permissionMessages.push('Camera indisponivel. Voce pode entrar sem video.');
        }
    }

    await stopMediaStream(assemblyState.previewStream);
    assemblyState.previewStream = nextStream;
    updatePrejoinMediaUI();
    renderParticipants();
    sendPresence();

    if (permissionMessages.length) {
        showToast(permissionMessages.join(' '), 'warning');
    }
}

function updatePrejoinMediaUI() {
    const video = document.getElementById('prejoin-video');
    const avatar = document.getElementById('prejoin-avatar');
    const empty = document.getElementById('prejoin-preview-empty');
    const summary = document.getElementById('prejoin-media-summary');

    const micButton = document.getElementById('prejoin-mic-btn');
    const cameraButton = document.getElementById('prejoin-camera-btn');
    const roomMicButton = document.getElementById('room-mic-btn');
    const roomCameraButton = document.getElementById('room-camera-btn');

    const hasVideoTrack = assemblyState.previewStream?.getVideoTracks().length;

    if (video) {
        if (hasVideoTrack) {
            video.hidden = false;
            video.srcObject = assemblyState.previewStream;
        } else {
            video.hidden = true;
            video.srcObject = null;
        }
    }

    if (avatar) avatar.hidden = Boolean(hasVideoTrack);
    if (empty) empty.hidden = assemblyState.cameraEnabled || assemblyState.microphoneEnabled;

    if (summary) {
        if (assemblyState.cameraEnabled && assemblyState.microphoneEnabled) summary.textContent = 'Camera e microfone ativos';
        else if (assemblyState.cameraEnabled) summary.textContent = 'Somente camera ativa';
        else if (assemblyState.microphoneEnabled) summary.textContent = 'Somente microfone ativo';
        else summary.textContent = 'Sem midia ativa';
    }

    if (micButton) {
        micButton.setAttribute('aria-pressed', assemblyState.microphoneEnabled ? 'true' : 'false');
        micButton.innerHTML = `<i class="fas ${assemblyState.microphoneEnabled ? 'fa-microphone' : 'fa-microphone-slash'}"></i><span>${assemblyState.microphoneEnabled ? 'Microfone ligado' : 'Microfone desligado'}</span>`;
    }

    if (cameraButton) {
        cameraButton.setAttribute('aria-pressed', assemblyState.cameraEnabled ? 'true' : 'false');
        cameraButton.innerHTML = `<i class="fas ${assemblyState.cameraEnabled ? 'fa-video' : 'fa-video-slash'}"></i><span>${assemblyState.cameraEnabled ? 'Camera ligada' : 'Camera desligada'}</span>`;
    }

    if (roomMicButton) {
        roomMicButton.classList.toggle('off', !assemblyState.microphoneEnabled);
        roomMicButton.innerHTML = `<i class="fas ${assemblyState.microphoneEnabled ? 'fa-microphone' : 'fa-microphone-slash'}"></i>`;
    }

    if (roomCameraButton) {
        roomCameraButton.classList.toggle('off', !assemblyState.cameraEnabled);
        roomCameraButton.innerHTML = `<i class="fas ${assemblyState.cameraEnabled ? 'fa-video' : 'fa-video-slash'}"></i>`;
    }
}

async function populateDeviceSelects() {
    const cameraSelect = document.getElementById('camera-select');
    const microphoneSelect = document.getElementById('microphone-select');
    const settingsCameraSelect = document.getElementById('settings-camera-select');
    const settingsMicrophoneSelect = document.getElementById('settings-microphone-select');

    const targets = [
        { element: cameraSelect, type: 'videoinput', placeholder: 'Selecionar camera' },
        { element: microphoneSelect, type: 'audioinput', placeholder: 'Selecionar microfone' },
        { element: settingsCameraSelect, type: 'videoinput', placeholder: 'Selecionar camera' },
        { element: settingsMicrophoneSelect, type: 'audioinput', placeholder: 'Selecionar microfone' }
    ];

    targets.forEach((target) => {
        if (target.element) {
            target.element.innerHTML = `<option value="">${target.placeholder}</option>`;
        }
    });

    if (!navigator.mediaDevices?.enumerateDevices) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    targets.forEach((target) => {
        if (!target.element) return;
        devices
            .filter((device) => device.kind === target.type)
            .forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `${target.type === 'videoinput' ? 'Camera' : 'Microfone'} ${index + 1}`;
                if (target.type === 'videoinput' && device.deviceId === assemblyState.activeDevices.videoInputId) option.selected = true;
                if (target.type === 'audioinput' && device.deviceId === assemblyState.activeDevices.audioInputId) option.selected = true;
                target.element.appendChild(option);
            });
    });
}

async function toggleMicrophone() {
    assemblyState.microphoneEnabled = !assemblyState.microphoneEnabled;
    await refreshPreviewMedia();
}

async function toggleCamera() {
    assemblyState.cameraEnabled = !assemblyState.cameraEnabled;
    await refreshPreviewMedia();
}

async function toggleScreenShare() {
    if (assemblyState.screenShareEnabled) {
        stopScreenShare();
        return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
        showToast('Compartilhamento de tela nao disponivel neste navegador.', 'warning');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        assemblyState.screenStream = stream;
        assemblyState.screenShareEnabled = true;

        const spotlight = document.getElementById('share-spotlight');
        const body = document.getElementById('share-spotlight-body');
        if (spotlight && body) {
            body.innerHTML = '';
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.srcObject = stream;
            body.appendChild(video);
            spotlight.hidden = false;
        }

        const track = stream.getVideoTracks()[0];
        if (track) {
            track.addEventListener('ended', () => stopScreenShare(), { once: true });
        }
        const button = document.getElementById('room-screen-btn');
        if (button) button.classList.add('off');
    } catch (_) {
        showToast('Nao foi possivel iniciar o compartilhamento de tela.', 'warning');
    }
}

function stopScreenShare() {
    stopMediaStream(assemblyState.screenStream);
    assemblyState.screenStream = null;
    assemblyState.screenShareEnabled = false;
    const button = document.getElementById('room-screen-btn');
    if (button) button.classList.remove('off');
    const spotlight = document.getElementById('share-spotlight');
    const body = document.getElementById('share-spotlight-body');
    if (body) body.innerHTML = '';
    if (spotlight) spotlight.hidden = true;
}

function toggleHandRaise() {
    if (!assemblyState.connected) {
        showToast('Entre na assembleia antes de levantar a mao.', 'warning');
        return;
    }

    assemblyState.handRaised = !assemblyState.handRaised;
    sendPresence();
    broadcast('hand-raised', {
        assemblyId: assemblyState.currentAssemblyId,
        peerId: getMyPeerId(),
        name: assemblyState.currentUser?.name || 'Participante',
        handRaised: assemblyState.handRaised
    });

    showToast(assemblyState.handRaised ? 'Pedido de fala enviado.' : 'Pedido de fala removido.', 'info');
}

function startRoomTimer() {
    const label = document.getElementById('assembly-timer');
    if (!label) return;
    if (assemblyState.timerInterval) clearInterval(assemblyState.timerInterval);

    const tick = () => {
        if (!assemblyState.roomJoinedAt) {
            label.textContent = '00:00:00';
            return;
        }
        const diff = Date.now() - assemblyState.roomJoinedAt;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        label.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    tick();
    assemblyState.timerInterval = window.setInterval(tick, 1000);
}

function stopRoomTimer() {
    if (assemblyState.timerInterval) {
        clearInterval(assemblyState.timerInterval);
        assemblyState.timerInterval = null;
    }
    const label = document.getElementById('assembly-timer');
    if (label) label.textContent = '00:00:00';
}

function populateInfoModal() {
    const container = document.getElementById('assembly-info-content');
    if (!container || !assemblyState.assembly) return;
    container.innerHTML = '';

    const entries = [
        ['Titulo', assemblyState.assembly.title || 'Assembleia'],
        ['Condominio', getCondoName(assemblyState.currentUser)],
        ['Data', formatDate(assemblyState.assembly.date)],
        ['Horario', formatTime(assemblyState.assembly.start_time || assemblyState.assembly.time)],
        ['Status', assemblyState.connected ? 'Em andamento' : 'Agendada']
    ];

    entries.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'detail-line';
        const left = document.createElement('span');
        left.textContent = label;
        const right = document.createElement('strong');
        right.textContent = value;
        row.appendChild(left);
        row.appendChild(right);
        container.appendChild(row);
    });
}

function updatePrejoinInfo() {
    if (!assemblyState.assembly) return;

    const assembly = assemblyState.assembly;
    const userName = assemblyState.currentUser?.name || 'Voce';

    const mappings = [
        ['prejoin-assembly-title', assembly.title || 'Assembleia'],
        ['prejoin-condo-name', getCondoName(assemblyState.currentUser)],
        ['prejoin-date', formatDate(assembly.date)],
        ['prejoin-time', formatTime(assembly.start_time || assembly.time)],
        ['prejoin-status', assembly.status || 'Agendada'],
        ['prejoin-user-name', userName],
        ['prejoin-assembly-meta', `${assembly.title || 'Assembleia'} • ${formatDate(assembly.date)} • ${formatTime(assembly.start_time || assembly.time)}`]
    ];

    mappings.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });

    const avatar = document.getElementById('prejoin-avatar');
    if (avatar) {
        if (assemblyState.currentUser?.profilePhoto) {
            avatar.innerHTML = `<img src="${assemblyState.currentUser.profilePhoto}" alt="${escapeText(userName)}">`;
        } else {
            avatar.textContent = getInitials(userName);
        }
    }
}

function updateRoomHeader() {
    const title = document.getElementById('room-assembly-title');
    const subtitle = document.getElementById('room-assembly-subtitle');
    if (title) title.textContent = assemblyState.assembly?.title || 'Assembleia';
    if (subtitle) subtitle.textContent = `${getCondoName(assemblyState.currentUser)} • ${formatDate(assemblyState.assembly?.date)} • ${formatTime(assemblyState.assembly?.start_time || assemblyState.assembly?.time)}`;
}

function openPrejoin(assemblyId) {
    const assembly = scheduledAssemblies.find((item) => String(item.id) === String(assemblyId));
    if (!assembly) {
        showToast('Assembleia nao encontrada. Atualize a pagina e tente novamente.', 'warning');
        return;
    }

    assemblyState.assembly = assembly;
    assemblyState.currentAssemblyId = String(assembly.id);
    assemblyState.handRaised = false;
    updatePrejoinInfo();
    populateDeviceSelects().catch(() => {});
    updatePrejoinMediaUI();
    setOverlayVisibility('prejoin-overlay', true);
}

function closePrejoin() {
    setOverlayVisibility('prejoin-overlay', false);
}

async function enterAssembly() {
    if (!assemblyState.assembly || assemblyState.joining) return;

    assemblyState.joining = true;
    const enterButton = document.getElementById('prejoin-enter-btn');
    if (enterButton) enterButton.disabled = true;

    try {
        await populateDeviceSelects();
        closePrejoin();
        setOverlayVisibility('assembly-room', true);
        assemblyState.connected = true;
        assemblyState.roomJoinedAt = Date.now();
        setConnectionStatus('Conectado');
        updateStatusChip('Em andamento');
        updateRoomHeader();
        openAssemblyChannel();
        startPresenceLoops();
        startRoomTimer();
        renderParticipants();
        renderPollsPanel();
        populateInfoModal();
    } finally {
        assemblyState.joining = false;
        if (enterButton) enterButton.disabled = false;
    }
}

function resetRoomState() {
    assemblyState.connected = false;
    assemblyState.joining = false;
    assemblyState.leaving = false;
    assemblyState.handRaised = false;
    assemblyState.activePanel = null;
    assemblyState.activePollId = null;
    assemblyState.roomJoinedAt = null;
    assemblyState.unreadChatCount = 0;
    assemblyState.unreadPollCount = 0;
    syncUnreadCounters();
    closeAllPanels();
    closeAllModals();
    stopRoomTimer();
    closeAssemblyChannel();
    stopScreenShare();
    stopMediaStream(assemblyState.previewStream);
    assemblyState.previewStream = null;
    assemblyState.cameraEnabled = false;
    assemblyState.microphoneEnabled = false;
    updatePrejoinMediaUI();
    setConnectionStatus('Desconectado');
    updateStatusChip('Agendada');
}

function performLeaveAssembly(showMessage = true) {
    if (!assemblyState.currentAssemblyId) {
        setOverlayVisibility('assembly-room', false);
        return;
    }

    broadcast('participant-leave', {
        assemblyId: assemblyState.currentAssemblyId,
        peerId: getMyPeerId()
    });

    removeParticipant(getMyPeerId());
    resetRoomState();
    setOverlayVisibility('assembly-room', false);
    if (showMessage) {
        showToast('Voce saiu da assembleia.', 'info');
    }
}

async function scheduleAssembly(event) {
    event.preventDefault();

    const title = String(document.getElementById('assembly-title-input')?.value || '').trim();
    const date = document.getElementById('assembly-date')?.value || '';
    const startTime = document.getElementById('assembly-time')?.value || '';

    if (!title || !date || !startTime) {
        showToast('Preencha todos os campos da assembleia.', 'warning');
        return;
    }

    const cep = extractUserCep(assemblyState.currentUser);
    if (!cep) {
        showToast('Nao foi possivel identificar o CEP do condominio.', 'warning');
        return;
    }

    try {
        const saved = await scheduleAssemblyDb({
            cep,
            title,
            description: null,
            date,
            start_time: startTime,
            end_time: startTime,
            created_by: getCurrentUserEmail()
        });

        scheduledAssemblies.push(saved);
        scheduledAssemblies.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start_time || '').localeCompare(String(b.start_time || '')));
        renderScheduledAssemblies();
        event.target.reset();
        showToast('Assembleia agendada com sucesso.', 'success');
    } catch (error) {
        console.error('Erro ao agendar assembleia:', error);
        showToast('Nao foi possivel agendar a assembleia.', 'warning');
    }
}

function renderScheduleAssemblyInfo() {
    const info = document.getElementById('schedule-info');
    if (!info) return;
    const cep = extractUserCep(assemblyState.currentUser);
    if (!cep) {
        info.hidden = false;
        info.textContent = 'Nao foi possivel identificar o CEP do condominio deste usuario.';
        return;
    }
    info.hidden = false;
    info.textContent = `Essa assembleia sera associada ao condominio de CEP ${cep}.`;
}

async function loadScheduledAssemblies() {
    try {
        const cep = extractUserCep(assemblyState.currentUser);
        scheduledAssemblies = cep && typeof getScheduledAssembliesByCep === 'function'
            ? await getScheduledAssembliesByCep(cep)
            : await getScheduledAssemblies();
        renderScheduledAssemblies();
    } catch (error) {
        console.error('Erro ao carregar assembleias:', error);
        const list = document.getElementById('scheduled-list');
        if (list) list.textContent = 'Nao foi possivel carregar as assembleias no momento.';
    }
}

function renderPastAssemblies() {
    const list = document.getElementById('past-list');
    if (!list) return;
    list.innerHTML = '';

    if (!pastAssemblies.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Nenhuma assembleia realizada.';
        list.appendChild(empty);
        return;
    }
}

function renderScheduledAssemblies() {
    const list = document.getElementById('scheduled-list');
    if (!list) return;
    list.innerHTML = '';

    if (!scheduledAssemblies.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Nenhuma assembleia agendada para o condominio atual.';
        list.appendChild(empty);
        return;
    }

    scheduledAssemblies.forEach((assembly) => {
        const item = document.createElement('article');
        item.className = 'assembly-item';

        const info = document.createElement('div');
        info.className = 'assembly-info';

        const title = document.createElement('h3');
        title.textContent = assembly.title || 'Assembleia';
        info.appendChild(title);

        const line = document.createElement('p');
        line.textContent = `Data: ${formatDate(assembly.date)} • Horario: ${formatTime(assembly.start_time || assembly.time)}`;
        info.appendChild(line);
        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'assembly-item-actions';

        const joinButton = document.createElement('button');
        joinButton.type = 'button';
        joinButton.className = 'btn btn-primary';
        joinButton.innerHTML = '<i class="fas fa-video"></i> Preparar entrada';
        joinButton.addEventListener('click', () => openPrejoin(assembly.id));
        actions.appendChild(joinButton);

        item.appendChild(actions);
        list.appendChild(item);
    });
}

function updateUserProfile() {
    const user = assemblyState.currentUser;
    if (!user) return;

    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    const type = document.getElementById('user-type');
    const scheduleSection = document.getElementById('schedule-section');
    const syndicButtons = document.querySelectorAll('.syndic-only');

    if (avatar) {
        if (user.profilePhoto) {
            avatar.innerHTML = `<img src="${user.profilePhoto}" alt="${escapeText(user.name || 'Usuario')}">`;
        } else {
            avatar.textContent = getInitials(user.name || 'Usuario');
        }
    }
    if (name) name.textContent = user.name || 'Usuario';
    if (type) type.textContent = isSindico() ? 'Sindico' : isPorteiro() ? 'Porteiro' : 'Morador';
    if (scheduleSection) scheduleSection.style.display = isSindico() ? 'block' : 'none';
    syndicButtons.forEach((button) => {
        button.hidden = !isSindico();
    });

    if (typeof syncAllAvatars === 'function') {
        syncAllAvatars(user);
    }
}

async function restoreUser() {
    let storedUser = null;
    try {
        storedUser = sessionStorage.getItem('condominiumUser');
    } catch (_) {}

    if (!storedUser) {
        try {
            const persisted = localStorage.getItem('condominiumPersistentUser');
            if (persisted) {
                const parsed = JSON.parse(persisted);
                if (parsed?.email && typeof fetchUserByEmail === 'function') {
                    const freshUser = await fetchUserByEmail(parsed.email).catch(() => null);
                    if (freshUser) {
                        sessionStorage.setItem('condominiumUser', JSON.stringify(freshUser));
                        storedUser = sessionStorage.getItem('condominiumUser');
                    }
                }
            }
        } catch (_) {}
    }

    if (!storedUser) {
        location.href = 'entrar.html';
        return false;
    }

    assemblyState.currentUser = JSON.parse(storedUser);
    if (typeof refreshCurrentUserFromDb === 'function') {
        assemblyState.currentUser = await refreshCurrentUserFromDb();
    }

    if (isSindico() && !assemblyState.currentUser?.plan) {
        location.href = 'checkout.html';
        return false;
    }

    updateUserProfile();
    renderScheduleAssemblyInfo();
    return true;
}

function handleModalBackdropClick(event) {
    const modal = event.target;
    if (!modal.classList.contains('assembly-modal')) return;
    if (modal.id === 'create-poll-modal') return;
    closeModal(modal.id);
}

function handleEscape(event) {
    if (event.key !== 'Escape') return;
    if (assemblyState.openModal) {
        closeModal(assemblyState.openModal);
        return;
    }
    if (assemblyState.activePanel) {
        closeAllPanels();
        if (assemblyState.sidePanelLastFocus && typeof assemblyState.sidePanelLastFocus.focus === 'function') {
            assemblyState.sidePanelLastFocus.focus();
        }
    }
}

function attachStaticEvents() {
    document.getElementById('schedule-form')?.addEventListener('submit', scheduleAssembly);
    document.getElementById('sidebar-logout-btn')?.addEventListener('click', logout);

    document.getElementById('prejoin-close-btn')?.addEventListener('click', closePrejoin);
    document.getElementById('prejoin-back-btn')?.addEventListener('click', closePrejoin);
    document.getElementById('prejoin-enter-btn')?.addEventListener('click', enterAssembly);
    document.getElementById('prejoin-mic-btn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('prejoin-camera-btn')?.addEventListener('click', toggleCamera);

    document.getElementById('camera-select')?.addEventListener('change', async (event) => {
        assemblyState.activeDevices.videoInputId = event.target.value;
        if (assemblyState.cameraEnabled) await refreshPreviewMedia();
        await populateDeviceSelects();
    });
    document.getElementById('microphone-select')?.addEventListener('change', async (event) => {
        assemblyState.activeDevices.audioInputId = event.target.value;
        if (assemblyState.microphoneEnabled) await refreshPreviewMedia();
        await populateDeviceSelects();
    });

    document.getElementById('settings-camera-select')?.addEventListener('change', async (event) => {
        assemblyState.activeDevices.videoInputId = event.target.value;
        if (assemblyState.cameraEnabled) await refreshPreviewMedia();
        await populateDeviceSelects();
    });
    document.getElementById('settings-microphone-select')?.addEventListener('change', async (event) => {
        assemblyState.activeDevices.audioInputId = event.target.value;
        if (assemblyState.microphoneEnabled) await refreshPreviewMedia();
        await populateDeviceSelects();
    });

    document.getElementById('room-mic-btn')?.addEventListener('click', toggleMicrophone);
    document.getElementById('room-camera-btn')?.addEventListener('click', toggleCamera);
    document.getElementById('room-screen-btn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('room-hand-btn')?.addEventListener('click', toggleHandRaise);
    document.getElementById('room-chat-btn')?.addEventListener('click', (event) => openSidePanel('chat', event.currentTarget));
    document.getElementById('room-participants-btn')?.addEventListener('click', (event) => openSidePanel('participants', event.currentTarget));
    document.getElementById('room-polls-btn')?.addEventListener('click', (event) => openSidePanel('polls', event.currentTarget));
    document.getElementById('room-settings-btn')?.addEventListener('click', async (event) => {
        await populateDeviceSelects();
        openModal('settings-modal', event.currentTarget);
    });
    document.getElementById('room-info-btn')?.addEventListener('click', (event) => {
        populateInfoModal();
        openModal('info-modal', event.currentTarget);
    });
    document.getElementById('room-new-poll-btn')?.addEventListener('click', (event) => {
        if (!isSindico()) return;
        resetCreatePollForm();
        openModal('create-poll-modal', event.currentTarget);
    });
    document.getElementById('room-end-btn')?.addEventListener('click', (event) => {
        if (!isSindico()) return;
        openModal('end-assembly-modal', event.currentTarget);
    });
    document.getElementById('room-leave-btn')?.addEventListener('click', (event) => {
        openModal('leave-modal', event.currentTarget);
    });
    document.getElementById('confirm-leave-btn')?.addEventListener('click', () => {
        closeModal('leave-modal');
        performLeaveAssembly();
    });
    document.getElementById('confirm-end-assembly-btn')?.addEventListener('click', () => {
        if (!isSindico()) return;
        broadcast('assembly-ended', { assemblyId: assemblyState.currentAssemblyId });
        closeModal('end-assembly-modal');
        performLeaveAssembly(false);
        showToast('Assembleia encerrada com sucesso.', 'success');
    });
    document.getElementById('side-panel-close-btn')?.addEventListener('click', () => {
        closeAllPanels();
        if (assemblyState.sidePanelLastFocus && typeof assemblyState.sidePanelLastFocus.focus === 'function') {
            assemblyState.sidePanelLastFocus.focus();
        }
    });
    document.getElementById('send-message-btn')?.addEventListener('click', sendChatMessage);
    document.getElementById('message-input')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });
    document.getElementById('chat-image-btn')?.addEventListener('click', () => {
        document.getElementById('image-upload')?.click();
    });
    document.getElementById('image-upload')?.addEventListener('change', handleImageSelection);
    document.getElementById('remove-image-btn')?.addEventListener('click', removeSelectedImage);
    document.getElementById('stop-share-btn')?.addEventListener('click', stopScreenShare);

    document.getElementById('create-poll-form')?.addEventListener('submit', createPoll);
    document.getElementById('add-poll-option-btn')?.addEventListener('click', () => {
        document.getElementById('poll-options-container')?.appendChild(createPollOptionField());
    });

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => closeModal(button.getAttribute('data-close-modal')));
    });

    document.querySelectorAll('.assembly-modal').forEach((modal) => {
        modal.addEventListener('click', handleModalBackdropClick);
    });

    document.addEventListener('keydown', handleEscape);
}

function logout() {
    try {
        sessionStorage.removeItem('condominiumUser');
    } catch (_) {}
    try {
        localStorage.removeItem('condominiumPersistentUser');
    } catch (_) {}
    location.href = '../inicio.html';
}

window.addEventListener('beforeunload', () => {
    if (assemblyState.currentAssemblyId && assemblyState.connected) {
        try {
            broadcast('participant-leave', {
                assemblyId: assemblyState.currentAssemblyId,
                peerId: getMyPeerId()
            });
        } catch (_) {}
    }
    resetRoomState();
    stopMediaStream(assemblyState.previewStream);
});

document.addEventListener('DOMContentLoaded', async () => {
    attachStaticEvents();
    resetCreatePollForm();
    closeAllPanels();
    closeAllModals();
    updatePrejoinMediaUI();

    const restored = await restoreUser();
    if (!restored) return;

    const dateInput = document.getElementById('assembly-date');
    if (dateInput) {
        dateInput.min = new Date().toISOString().split('T')[0];
    }

    await loadScheduledAssemblies();
    renderPastAssemblies();
});
