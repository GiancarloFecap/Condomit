let micOn = false;
let cameraOn = false;
let chatOpen = false;
let currentAssemblyId = null;
let currentUser = null;
let localStream = null;
let selectedImageData = null;
let participants = [];

let assemblyChannel = null;
const ASSEMBLY_PARTICIPANT_TTL_MS = 45000;
const PARTICIPANT_HEARTBEAT_MS = 12000;
let participantHeartbeatTimer = null;
let participantCleanupTimer = null;
let myPeerId = null;

function channelKeyFor(assemblyId) {
    return 'condomit-assembly-' + String(assemblyId);
}

function chatKeyFor(assemblyId) {
    return 'condomit-chat-' + String(assemblyId);
}

function storageParticipantsKey(assemblyId) {
    return 'condomit-participants-' + String(assemblyId);
}

function getInitials(name) {
    if (!name) return 'US';
    return String(name).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getMyPeerId() {
    if (!myPeerId) {
        try {
            const existing = sessionStorage.getItem('condomitPeerId');
            if (existing) { myPeerId = existing; }
            else {
                myPeerId = 'peer-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
                sessionStorage.setItem('condomitPeerId', myPeerId);
            }
        } catch (_) {
            myPeerId = 'peer-' + Date.now().toString(36);
        }
    }
    return myPeerId;
}

function persistParticipantList(assemblyId, list) {
    try { localStorage.setItem(storageParticipantsKey(assemblyId), JSON.stringify(list)); } catch(_) {}
}

function loadPersistedParticipants(assemblyId) {
    try {
        const raw = localStorage.getItem(storageParticipantsKey(assemblyId));
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch(_) { return []; }
}

function serializeParticipantFromUser(user, opts = {}) {
    if (!user) return null;
    const name = user.name || 'Usuário';
    const type = user.type || (user.user_type === 'sindico' ? 'sindico' : 'morador') || 'morador';
    return {
        peerId: opts.peerId || getMyPeerId(),
        email: user.email || null,
        name: name,
        initials: opts.initials || getInitials(name),
        type: type,
        profilePhoto: user.profilePhoto || null,
        micOn: typeof opts.micOn === 'boolean' ? opts.micOn : true,
        cameraOn: typeof opts.cameraOn === 'boolean' ? opts.cameraOn : false,
        lastSeen: Date.now()
    };
}

function openAssemblyChannel(assemblyId) {
    closeAssemblyChannel();
    const key = channelKeyFor(assemblyId);
    try {
        const bc = new BroadcastChannel(key);
        bc.onmessage = (ev) => handleAssemblyMessage(assemblyId, ev.data);
        assemblyChannel = bc;
    } catch (_) {
        assemblyChannel = null;
    }
    // Carrega participantes persistidos de outras abas
    const persisted = loadPersistedParticipants(assemblyId);
    if (persisted && persisted.length) {
        const now = Date.now();
        participants = persisted.filter(p => now - (p.lastSeen || 0) < ASSEMBLY_PARTICIPANT_TTL_MS);
    }
    // Carrega chat histórico
    loadPersistedChatHistory(assemblyId);
    // Temporizador de limpeza
    participantCleanupTimer = setInterval(() => {
        const before = participants.length;
        const now = Date.now();
        participants = participants.filter(p => now - (p.lastSeen || 0) < ASSEMBLY_PARTICIPANT_TTL_MS);
        if (before !== participants.length) {
            persistParticipantList(assemblyId, participants);
            renderParticipants();
        }
    }, 5000);
}

function closeAssemblyChannel() {
    if (assemblyChannel) {
        try { assemblyChannel.close(); } catch(_) {}
        assemblyChannel = null;
    }
    if (participantHeartbeatTimer) {
        clearInterval(participantHeartbeatTimer);
        participantHeartbeatTimer = null;
    }
    if (participantCleanupTimer) {
        clearInterval(participantCleanupTimer);
        participantCleanupTimer = null;
    }
}

function broadcastToAssembly(type, payload) {
    const msg = { type, ts: Date.now(), data: payload };
    try {
        if (assemblyChannel) assemblyChannel.postMessage(msg);
    } catch (_) {}
}

function sendParticipantPresence(opts = {}) {
    if (!currentAssemblyId || !currentUser) return;
    const p = serializeParticipantFromUser(currentUser, {
        peerId: getMyPeerId(),
        micOn: typeof opts.micOn === 'boolean' ? opts.micOn : micOn,
        cameraOn: typeof opts.cameraOn === 'boolean' ? opts.cameraOn : cameraOn
    });
    // Atualiza lista local
    const idx = participants.findIndex(x => x.peerId === p.peerId);
    if (idx >= 0) participants[idx] = p;
    else participants.push(p);
    persistParticipantList(currentAssemblyId, participants);
    broadcastToAssembly('participant-presence', p);
}

function startParticipantHeartbeat() {
    if (participantHeartbeatTimer) return;
    sendParticipantPresence({ announce: true });
    participantHeartbeatTimer = setInterval(() => {
        sendParticipantPresence();
    }, PARTICIPANT_HEARTBEAT_MS);
}

function handleAssemblyMessage(assemblyId, msg) {
    if (!msg || !msg.type) return;
    const data = msg.data || msg.payload || null;
    switch (msg.type) {
        case 'participant-presence': {
            if (!data || !data.peerId) return;
            if (assemblyId !== currentAssemblyId) return;
            const p = { ...data, lastSeen: msg.ts || Date.now() };
            const idx = participants.findIndex(x => x.peerId === p.peerId);
            if (idx >= 0) participants[idx] = p;
            else participants.push(p);
            persistParticipantList(assemblyId, participants);
            renderParticipants();
            // Se for nova entrada, respondo com minha presença para o novo peer me ver
            if (msg.data?.announce && p.peerId !== getMyPeerId()) {
                setTimeout(() => sendParticipantPresence(), 200);
            }
            break;
        }
        case 'participant-leave': {
            if (!data?.peerId || assemblyId !== currentAssemblyId) return;
            const before = participants.length;
            participants = participants.filter(p => p.peerId !== data.peerId);
            persistParticipantList(assemblyId, participants);
            if (before !== participants.length) renderParticipants();
            break;
        }
        case 'chat-message': {
            if (!data || assemblyId !== currentAssemblyId) return;
            appendIncomingChatMessage(data);
            break;
        }
        case 'participant-request-roster': {
            if (assemblyId !== currentAssemblyId) return;
            sendParticipantPresence();
            break;
        }
    }
}

function loadPersistedChatHistory(assemblyId) {
    try {
        const raw = localStorage.getItem(chatKeyFor(assemblyId));
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        arr.forEach(m => appendIncomingChatMessage(m, { silent: true, history: true }));
    } catch(_) {}
}

function appendIncomingChatMessage(msg, opts = {}) {
    if (!msg) return;
    const sender = msg.sender || msg.name || 'Usuário';
    const isMe = msg.peerId && msg.peerId === getMyPeerId();
    const userType = msg.userType || 'morador';
    const text = msg.text || '';
    const imageData = msg.imageData || null;
    const time = msg.time || getCurrentTime();
    const ts = msg.ts || Date.now();
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;
    // Evitar duplicatas
    if (msg.id) {
        const already = messagesDiv.querySelector(`[data-msg-id="${String(msg.id).replace(/"/g,'')}"]`);
        if (already) return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isMe ? 'sent' : 'received');
    if (msg.id) messageDiv.dataset.msgId = String(msg.id);
    const typeLabel = userType === 'sindico' ? 'Síndico' : 'Morador';
    let contentHTML = `
        <div class="message-header">
            <strong>${escapeHtml(sender)}</strong>
            <span class="user-type-tag">${typeLabel}</span>
        </div>
    `;
    if (text) contentHTML += `<p>${escapeHtml(text)}</p>`;
    if (imageData) {
        contentHTML += `
            <div class="message-image-wrapper">
                <img src="${imageData}" alt="Imagem enviada" class="message-image" style="max-width: 200px; max-height: 200px; border-radius: 8px; object-fit: contain;">
            </div>`;
    }
    contentHTML += `<span class="time">${time}</span>`;
    messageDiv.innerHTML = contentHTML;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function persistChatMessage(assemblyId, msg) {
    try {
        const key = chatKeyFor(assemblyId);
        const raw = localStorage.getItem(key);
        let arr = [];
        if (raw) { try { arr = JSON.parse(raw); } catch(_) { arr = []; } }
        if (!Array.isArray(arr)) arr = [];
        arr.push(msg);
        if (arr.length > 400) arr = arr.slice(-400);
        localStorage.setItem(key, JSON.stringify(arr));
    } catch(_) {}
}

// Demo assembly data
let scheduledAssemblies = [];
let pastAssemblies = [];

const assemblyData = {
    1: {
        title: 'Assembleia Extraordinária',
        summary: '<p>Assembleia de exemplo.</p>',
        comments: []
    }
};

document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is logged in (sessionStorage OU localStorage persistent)
    let storedUser = null;
    try { storedUser = sessionStorage.getItem('condominiumUser'); } catch(_) {}
    if (!storedUser) {
        try {
            const persistRaw = localStorage.getItem('condominiumPersistentUser');
            if (persistRaw) {
                const persist = JSON.parse(persistRaw);
                if (persist && persist.email && typeof fetchUserByEmail === 'function') {
                    const fresh = await fetchUserByEmail(persist.email).catch(() => null);
                    if (fresh) {
                        const restored = { ...fresh, password: fresh.password || null };
                        sessionStorage.setItem('condominiumUser', JSON.stringify(restored));
                        storedUser = sessionStorage.getItem('condominiumUser');
                        if (typeof syncAllAvatars === 'function') syncAllAvatars(restored);
                    }
                }
            }
        } catch (_) {}
    }
    if (!storedUser) {
        window.location.href = 'entrar.html';
        return;
    }
    
    currentUser = JSON.parse(storedUser);

    if (typeof refreshCurrentUserFromDb === 'function') {
        currentUser = await refreshCurrentUserFromDb();
    }

    // Se for síndico, verificar se tem plano
    if (currentUser.type === 'sindico' && !currentUser.plan) {
        window.location.href = 'checkout.html';
        return;
    }
    
    updateUserProfile();
    
    // Initialize chat as closed
    const chatSidebar = document.getElementById('chat-sidebar');
    if (chatSidebar) chatSidebar.classList.add('closed');
    
    // Set min date to today on date input
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('assembly-date');
    if (dateInput) dateInput.setAttribute('min', today);
    
    if (typeof syncAllAvatars === 'function' && currentUser) {
        syncAllAvatars(currentUser);
    }

    // Message input enter key
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    
    // Image upload
    const imageUpload = document.getElementById('image-upload');
    if (imageUpload) {
        imageUpload.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = function(event) {
                    selectedImageData = event.target.result;
                    const previewWrapper = document.getElementById('image-preview-wrapper');
                    const previewImg = document.getElementById('image-preview');
                    if (previewImg) previewImg.src = selectedImageData;
                    if (previewWrapper) previewWrapper.classList.add('active');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    renderScheduleAssemblyInfo();

    // Render initial assemblies from Supabase
    loadScheduledAssemblies();
    renderPastAssemblies();
});

function extractUserCep(user) {
    if (!user) return null;
    if (user.condominium) {
        if (typeof user.condominium === 'string') {
            try {
                const c = JSON.parse(user.condominium);
                return c?.cep || c?.condominium_id || null;
            } catch (_) {}
        } else if (typeof user.condominium === 'object') {
            return user.condominium.cep || user.condominium.condominium_id || null;
        }
    }
    return user.cep || user.condominium_cep || null;
}

function renderScheduleAssemblyInfo() {
    const info = document.getElementById('schedule-info');
    if (!info) return;
    const cep = extractUserCep(currentUser);
    if (cep) {
        info.innerHTML = `<i class="fas fa-map-marker-alt" style="margin-right:6px;"></i>Essa assembleia será associada ao condomínio <strong>CEP ${cep}</strong>.`;
        info.style.display = 'block';
    } else {
        info.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-right:6px;"></i>Não foi possível identificar o CEP do condomínio deste usuário.`;
        info.style.display = 'block';
        info.style.background = '#fff7ed';
        info.style.color = '#92400e';
    }
}

async function loadScheduledAssemblies() {
    try {
        const cep = extractUserCep(currentUser);
        if (cep && typeof getScheduledAssembliesByCep === 'function') {
            scheduledAssemblies = await getScheduledAssembliesByCep(cep);
        } else {
            scheduledAssemblies = await getScheduledAssemblies();
        }
        renderScheduledAssemblies();
    } catch (error) {
        console.error('Erro ao carregar assembleias:', error);
        const listContainer = document.getElementById('scheduled-list');
        if (listContainer) {
            listContainer.innerHTML = '<p>Não foi possível carregar as assembleias no momento.</p>';
        }
    }
}

function updateUserProfile() {
    if (!currentUser) return;
    
    const avatar = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const typeEl = document.getElementById('user-type');
    const scheduleSection = document.getElementById('schedule-section');
    
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    if (avatar) {
        avatar.textContent = initials;
    }
    
    if (nameEl) nameEl.textContent = currentUser.name;
    if (typeEl) typeEl.textContent = currentUser.type === 'sindico' ? 'Síndico' : 'Morador';
    
    if (currentUser.type === 'sindico') {
        if (scheduleSection) scheduleSection.style.display = 'block';
    } else {
        if (scheduleSection) scheduleSection.style.display = 'none';
    }

    // Sincroniza avatar de perfil se houver foto armazenada
    if (typeof syncAllAvatars === 'function') {
        syncAllAvatars(currentUser);
    }

    // Update sidebar condo name
    if (currentUser.condominium) {
        const sidebarCondoNameEl = document.querySelector('.condo-name');
        if (sidebarCondoNameEl) {
            const words = currentUser.condominium.name.split(' ');
            if (words.length > 2) {
                sidebarCondoNameEl.innerHTML = `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`;
            } else {
                sidebarCondoNameEl.textContent = currentUser.condominium.name;
            }
        }
    }
}

async function scheduleAssembly(event) {
    event.preventDefault();
    
    const title = document.getElementById('assembly-title-input').value.trim();
    const date = document.getElementById('assembly-date').value;
    const startTime = document.getElementById('assembly-time').value;
    
    if (!title || !date || !startTime) {
        alert('Preencha todos os campos da assembleia.');
        return;
    }
    const cep = extractUserCep(currentUser);
    if (!cep) {
        alert('Não foi possível identificar o CEP do condomínio do usuário. Verifique seu perfil ou contate o síndico.');
        return;
    }
    if (!currentUser || !currentUser.email) {
        alert('Usuário não autenticado. Faça login novamente.');
        return;
    }

    const newAssembly = {
        cep: cep,
        title: title,
        description: null,
        date: date,
        start_time: startTime,
        end_time: startTime,
        created_by: currentUser.email
    };

    try {
        const savedAssembly = await scheduleAssemblyDb(newAssembly);
        scheduledAssemblies.push(savedAssembly);
        scheduledAssemblies.sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1;
            const as = a.start_time || '';
            const bs = b.start_time || '';
            return as < bs ? -1 : (as > bs ? 1 : 0);
        });
        renderScheduledAssemblies();
        event.target.reset();
        alert('Assembleia agendada com sucesso!');
    } catch (error) {
        console.error('Erro ao agendar assembleia:', error);
        alert('Não foi possível agendar a assembleia. Tente novamente.');
    }
}

function renderScheduledAssemblies() {
    const listContainer = document.getElementById('scheduled-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    if (scheduledAssemblies.length === 0) {
        const cep = extractUserCep(currentUser);
        listContainer.innerHTML = `<p>Nenhuma assembleia agendada para o condomínio ${cep ? 'CEP ' + cep : 'atual'}.</p>`;
        return;
    }
    
    const isSindico = currentUser && currentUser.type === 'sindico';
    
    scheduledAssemblies.forEach(assembly => {
        const isOwn = assembly.created_by && currentUser && currentUser.email && assembly.created_by === currentUser.email;
        const canDelete = isSindico || isOwn;

        const createdByHTML = assembly.created_by ? `<p><i class="fas fa-user-tie"></i> <strong>Criado por:</strong> ${escapeHtml(assembly.created_by)}</p>` : '';
        const timeText = assembly.end_time && assembly.end_time !== assembly.start_time
            ? ` às ${assembly.start_time || '--:--'} até ${assembly.end_time}`
            : ` às ${assembly.start_time || assembly.time || '--:--'}`;

        const deleteBtn = canDelete ? `
            <button class="btn btn-secondary" style="margin-left:8px;background:#fee2e2;color:#b91c1c;border-color:#fecaca;" onclick="confirmDeleteAssembly('${escapeHtml(String(assembly.id)).replace(/'/g, '&#39;')}')" title="Excluir assembleia">
                <i class="fas fa-trash-alt"></i> Excluir
            </button>` : '';

        const itemHTML = `
            <div class="assembly-item" data-assembly-id="${escapeHtml(String(assembly.id))}">
                <div class="assembly-info">
                    <h3>${escapeHtml(assembly.title)}</h3>
                    <p><i class="far fa-calendar-alt"></i> <strong>Data:</strong> ${formatDate(assembly.date)}${timeText}</p>
                    ${createdByHTML}
                </div>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
                    <button class="btn btn-primary" onclick="joinAssembly('${escapeHtml(String(assembly.id)).replace(/'/g, '&#39;')}')">
                        <i class="fas fa-video"></i> Entrar na Chamada
                    </button>
                    ${deleteBtn}
                </div>
            </div>
        `;
        listContainer.innerHTML += itemHTML;
    });
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function confirmDeleteAssembly(id) {
    if (!id) return;
    if (!confirm('Tem certeza que deseja excluir esta assembleia agendada?')) return;
    try {
        const deleted = await deleteScheduledAssemblyById(id);
        scheduledAssemblies = scheduledAssemblies.filter(a => String(a.id) !== String(id));
        renderScheduledAssemblies();
        if (!deleted) console.warn('Nenhum registro foi deletado para o id ' + id);
    } catch (error) {
        console.error('Erro ao excluir assembleia:', error);
        alert('Não foi possível excluir a assembleia. Tente novamente.');
    }
}

function renderPastAssemblies() {
    const listContainer = document.getElementById('past-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    if (pastAssemblies.length === 0) {
        listContainer.innerHTML = '<p>Nenhuma assembleia realizada.</p>';
        return;
    }
    
    pastAssemblies.forEach(assembly => {
        const itemHTML = `
            <div class="assembly-item">
                <div class="assembly-info">
                    <h3>${assembly.title}</h3>
                    <p><i class="far fa-calendar-alt"></i> <strong>Data:</strong> ${formatDate(assembly.date)}, às ${assembly.time}</p>
                </div>
                <button class="btn btn-secondary" onclick="viewPastAssembly(${assembly.id})">
                    <i class="fas fa-eye"></i> Ver Detalhes
                </button>
            </div>
        `;
        listContainer.innerHTML += itemHTML;
    });
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function joinAssembly(assemblyId) {
    const assembly = scheduledAssemblies.find(a => String(a.id) === String(assemblyId));
    const titleEl = document.getElementById('assembly-title');
    const roomEl = document.getElementById('assembly-room');
    if (!assembly) {
        console.error('Assembleia não encontrada para id=', assemblyId, ' | disponiveis=', scheduledAssemblies.map(a => a.id));
        if (assemblyId && titleEl && roomEl) {
            titleEl.textContent = 'Assembleia';
        } else {
            alert('Assembleia não encontrada. Atualize a página e tente novamente.');
            return;
        }
    } else if (titleEl) {
        titleEl.textContent = assembly.title || 'Assembleia';
    }
    if (roomEl) {
        roomEl.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    currentAssemblyId = String(assemblyId);
    participants = [];

    micOn = true;
    cameraOn = false;
    updateControlsUI();
    renderParticipants();

    openAssemblyChannel(currentAssemblyId);
    startParticipantHeartbeat();
    broadcastToAssembly('participant-request-roster', { peerId: getMyPeerId() });

    // Liga o microfone (assim como antes o join abria a camera; agora mantem só mic ligado)
    try {
        if (!localStream || !localStream.getAudioTracks().length) {
            navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(audioStream => {
                    if (localStream && localStream.getVideoTracks().length) {
                        localStream.getVideoTracks().forEach(t => audioStream.addTrack(t));
                        localStream = audioStream;
                    } else {
                        localStream = audioStream;
                    }
                    const videoElement = document.getElementById('local-video');
                    if (videoElement && cameraOn && localStream.getVideoTracks().length) {
                        videoElement.srcObject = localStream;
                    }
                    sendParticipantPresence();
                })
                .catch(err => {
                    console.warn('Não foi possível acessar o microfone:', err);
                    sendParticipantPresence({ micOn: false });
                });
        } else {
            sendParticipantPresence();
        }
    } catch (e) {
        console.warn('getUserMedia indisponível:', e);
        sendParticipantPresence({ micOn: false });
    }
}

function leaveAssembly() {
    const leavingId = currentAssemblyId;
    const roomEl = document.getElementById('assembly-room');
    const chatEl = document.getElementById('chat-sidebar');
    if (roomEl) roomEl.classList.remove('active');
    document.body.style.overflow = 'auto';
    chatOpen = false;
    if (chatEl) chatEl.classList.add('closed');

    if (leavingId) {
        broadcastToAssembly('participant-leave', { peerId: getMyPeerId() });
    }
    closeAssemblyChannel();
    participants = [];
    currentAssemblyId = null;
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    renderParticipants();
}

function renderParticipants() {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '';
    
    // Adiciona o usuário atual primeiro (box principal)
    const userBox = document.createElement('div');
    userBox.className = 'video-box';
    
    const placeholder = document.createElement('div');
    placeholder.className = 'video-placeholder';
    
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.style.position = 'relative';
    
    if (currentUser && currentUser.profilePhoto) {
        avatar.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Avatar" />`;
        avatar.style.overflow = 'hidden';
        avatar.style.background = 'none';
    } else {
        const initials = currentUser ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'US';
        avatar.textContent = initials;
    }
    
    placeholder.appendChild(avatar);
    
    const nameP = document.createElement('p');
    nameP.textContent = currentUser ? currentUser.name : 'Você';
    nameP.style.margin = '0.5rem 0 0.25rem 0';
    nameP.style.fontWeight = '600';
    nameP.style.fontSize = '0.95rem';
    placeholder.appendChild(nameP);
    
    // Adiciona tipo de usuário com ênfase em síndico
    const typeP = document.createElement('p');
    const userType = currentUser ? (currentUser.type === 'sindico' ? 'Síndico' : 'Morador') : 'Morador';
    typeP.textContent = userType;
    typeP.style.margin = '0';
    typeP.style.fontSize = '0.85rem';
    typeP.style.fontWeight = currentUser?.type === 'sindico' ? '700' : '500';
    typeP.style.color = currentUser?.type === 'sindico' ? '#dc2626' : '#6b7280';
    placeholder.appendChild(typeP);
    
    // Adiciona ícone de mic desligado se necessário
    if (!micOn) {
        const micOffIcon = document.createElement('div');
        micOffIcon.className = 'mic-off-icon';
        micOffIcon.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        placeholder.appendChild(micOffIcon);
    }
    
    userBox.appendChild(placeholder);
    grid.appendChild(userBox);
    
    participants.forEach(p => {
        const box = document.createElement('div');
        box.className = 'video-box';
        
        const placeholder = document.createElement('div');
        placeholder.className = 'video-placeholder';
        
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.position = 'relative';
        
        if (p.profilePhoto) {
            avatar.innerHTML = `<img src="${p.profilePhoto}" alt="Avatar" />`;
            avatar.style.overflow = 'hidden';
            avatar.style.background = 'none';
        } else {
            avatar.textContent = p.initials;
        }
        
        placeholder.appendChild(avatar);
        
        const nameP = document.createElement('p');
        nameP.textContent = p.name;
        nameP.style.margin = '0.5rem 0 0.25rem 0';
        nameP.style.fontWeight = '600';
        nameP.style.fontSize = '0.95rem';
        placeholder.appendChild(nameP);
        
        // Adiciona tipo de usuário com ênfase em síndico
        const typeP = document.createElement('p');
        const userType = p.type === 'sindico' ? 'Síndico' : 'Morador';
        typeP.textContent = userType;
        typeP.style.margin = '0';
        typeP.style.fontSize = '0.85rem';
        typeP.style.fontWeight = p.type === 'sindico' ? '700' : '500';
        typeP.style.color = p.type === 'sindico' ? '#dc2626' : '#6b7280';
        placeholder.appendChild(typeP);
        
        box.appendChild(placeholder);
        grid.appendChild(box);
    });
}

function updateControlsUI() {
    const micBtn = document.getElementById('mic-btn');
    const camBtn = document.getElementById('camera-btn');
    
    if (micOn) {
        micBtn.classList.remove('off');
    } else {
        micBtn.classList.add('off');
    }
    
    if (cameraOn) {
        camBtn.classList.remove('off');
    } else {
        camBtn.classList.add('off');
    }
    
    // Sincroniza ícone de mic desligado no avatar do usuário
    updateAvatarMicIcon();
}

function updateAvatarMicIcon() {
    const videoBox = document.querySelector('.video-box');
    if (!videoBox) return;
    
    const placeholder = videoBox.querySelector('.video-placeholder');
    if (!placeholder) return;
    
    // Remove ícone anterior se existir
    const oldIcon = placeholder.querySelector('.mic-off-icon');
    if (oldIcon) oldIcon.remove();
    
    // Adiciona ícone de mic desligado se necessário
    if (!micOn) {
        const micOffIcon = document.createElement('div');
        micOffIcon.className = 'mic-off-icon';
        micOffIcon.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        placeholder.appendChild(micOffIcon);
    }
}

function toggleMic() {
    micOn = !micOn;
    
    if (micOn) {
        // Ativa microfone - captura áudio
        if (!localStream || !localStream.getAudioTracks().length) {
            navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true },
                video: false
            }).then(audioStream => {
                if (localStream && localStream.getVideoTracks().length) {
                    // Se câmera está ligada, adiciona áudio ao stream existente
                    audioStream.getAudioTracks().forEach(track => {
                        localStream.addTrack(track);
                    });
                } else {
                    // Se câmera desligada, cria novo stream apenas com áudio
                    localStream = audioStream;
                }
                sendParticipantPresence({ micOn: true });
            }).catch(error => {
                console.error('Erro ao capturar áudio:', error);
                alert('Não foi possível acessar o microfone. Verifique as permissões.');
                micOn = false;
                sendParticipantPresence({ micOn: false });
            });
        } else {
            sendParticipantPresence({ micOn: true });
        }
    } else {
        // Desativa microfone - remove áudio do stream
        if (localStream && localStream.getAudioTracks().length) {
            localStream.getAudioTracks().forEach(track => {
                track.stop();
                localStream.removeTrack(track);
            });
        }
        sendParticipantPresence({ micOn: false });
    }
    
    updateControlsUI();
}

async function toggleCamera() {
    cameraOn = !cameraOn;
    
    if (cameraOn) {
        // Ativa câmera
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            
            // Procura ou cria elemento de vídeo
            let videoElement = document.getElementById('local-video');
            if (!videoElement) {
                videoElement = document.createElement('video');
                videoElement.id = 'local-video';
                videoElement.autoplay = true;
                videoElement.playsinline = true;
                videoElement.muted = true;
                videoElement.style.width = '100%';
                videoElement.style.height = '100%';
                videoElement.style.objectFit = 'cover';
                const videoBox = document.querySelector('.video-box');
                if (videoBox) {
                    videoBox.innerHTML = '';
                    videoBox.appendChild(videoElement);
                }
            }
            
            videoElement.srcObject = localStream;
            sendParticipantPresence({ cameraOn: true });
        } catch (error) {
            console.error('Erro ao acessar câmera:', error);
            alert('Não foi possível acessar a câmera. Verifique as permissões.');
            cameraOn = false;
            sendParticipantPresence({ cameraOn: false });
        }
    } else {
        // Desativa câmera
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        renderParticipants();
        sendParticipantPresence({ cameraOn: false });
    }
    
    updateControlsUI();
}

function toggleChat() {
    chatOpen = !chatOpen;
    const chatSidebar = document.getElementById('chat-sidebar');
    
    if (chatOpen) {
        chatSidebar.classList.remove('closed');
    } else {
        chatSidebar.classList.add('closed');
    }
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    const imageData = selectedImageData;

    if (!message && !imageData) {
        return;
    }
    if (!currentUser) return;
    if (!currentAssemblyId) {
        alert('Entre em uma assembleia antes de enviar mensagens.');
        return;
    }

    const msgId = 'msg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    const chatMsg = {
        id: msgId,
        peerId: getMyPeerId(),
        assemblyId: currentAssemblyId,
        sender: currentUser.name || 'Usuário',
        email: currentUser.email || null,
        userType: currentUser.type === 'sindico' ? 'sindico' : 'morador',
        text: message,
        imageData: imageData || null,
        time: getCurrentTime(),
        ts: Date.now()
    };

    persistChatMessage(currentAssemblyId, chatMsg);
    appendIncomingChatMessage(chatMsg);
    broadcastToAssembly('chat-message', chatMsg);

    input.value = '';
    removeSelectedImage();
}

function removeSelectedImage() {
    selectedImageData = null;
    const fileInput = document.getElementById('image-upload');
    if (fileInput) {
        fileInput.value = '';
    }
    document.getElementById('image-preview-wrapper').classList.remove('active');
}

function addMessage(text, imageData, sender, userType) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message sent`;
    
    const typeLabel = userType === 'sindico' ? 'Síndico' : 'Morador';

    let contentHTML = `
        <div class="message-header">
            <strong>${sender}</strong>
            <span class="user-type-tag">${typeLabel}</span>
        </div>
    `;

    if (text) {
        contentHTML += `<p>${text}</p>`;
    }

    if (imageData) {
        contentHTML += `
            <div class="message-image-wrapper">
                <img src="${imageData}" alt="Imagem enviada" class="message-image" style="max-width: 200px; max-height: 200px; border-radius: 8px; object-fit: contain;">
            </div>
        `;
    }

    contentHTML += `<span class="time">${getCurrentTime()}</span>`;
    
    messageDiv.innerHTML = contentHTML;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function getCurrentTime() {
    const now = new Date();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

function viewPastAssembly(id) {
    const assembly = assemblyData[id];
    if (assembly) {
        currentAssemblyId = id;
        document.getElementById('past-assembly-title').textContent = assembly.title;
        document.getElementById('past-assembly-detail').classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function goBack() {
    document.getElementById('past-assembly-detail').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function vote(option) {
    alert('Voto registrado: ' + (option === 'yes' ? 'A Favor' : 'Contra'));
    document.getElementById('voting-buttons').style.display = 'none';
    document.getElementById('vote-result').style.display = 'block';
}

function sendComment() {
    const commentInput = document.getElementById('comment-input');
    const text = commentInput.value.trim();
    
    if (text && currentAssemblyId && currentUser) {
        alert('Comentário enviado com sucesso!');
        commentInput.value = '';
    }
}

function logout() {
    try { sessionStorage.removeItem('condominiumUser'); } catch(_) {}
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}

if (typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', () => {
        if (currentAssemblyId) {
            try { broadcastToAssembly('participant-leave', { peerId: getMyPeerId() }); } catch(_) {}
        }
        try { closeAssemblyChannel(); } catch(_) {}
    });
}
