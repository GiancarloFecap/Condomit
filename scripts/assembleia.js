let micOn = false;
let cameraOn = false;
let chatOpen = false;
let currentAssemblyId = null;
let currentUser = null;
let localStream = null;
let selectedImageData = null;
let participants = [];

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
    // Check if user is logged in
    const storedUser = sessionStorage.getItem('condominiumUser');
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
    const descriptionEl = document.getElementById('assembly-description-input');
    const date = document.getElementById('assembly-date').value;
    const startTime = document.getElementById('assembly-time').value;
    const endTimeEl = document.getElementById('assembly-end-time');
    const endTime = endTimeEl ? endTimeEl.value : null;
    const info = document.getElementById('schedule-info');
    
    if (!title || !date || !startTime) {
        alert('Preencha todos os campos obrigatórios da assembleia.');
        return;
    }
    if (endTime && startTime >= endTime) {
        alert('O horário de término deve ser posterior ao horário de início.');
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
        description: (descriptionEl && descriptionEl.value) ? descriptionEl.value.trim() : null,
        date: date,
        start_time: startTime,
        end_time: endTime || startTime,
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
        if (info) {
            info.style.display = 'block';
            info.style.background = '#ecfdf5';
            info.style.color = '#065f46';
            info.innerHTML = '<i class="fas fa-check-circle" style="margin-right:6px;"></i>Assembleia agendada e salva no condomínio com sucesso!';
        }
        setTimeout(() => {
            if (info) {
                info.style.background = '#eff6ff';
                info.style.color = '#1e40af';
                info.innerHTML = `<i class="fas fa-map-marker-alt" style="margin-right:6px;"></i>Próximas assembleias serão associadas ao condomínio <strong>CEP ${cep}</strong>.`;
            }
        }, 2200);
        alert('Assembleia agendada com sucesso!');
    } catch (error) {
        console.error('Erro ao agendar assembleia:', error);
        if (info) {
            info.style.display = 'block';
            info.style.background = '#fef2f2';
            info.style.color = '#b91c1c';
            info.innerHTML = `<i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>${error && error.message ? error.message : 'Não foi possível agendar a assembleia. Verifique as permissões no banco de dados (RLS).'}`;
        }
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

        const descriptionHTML = assembly.description ? `<p style="margin-top:6px;color:#4b5563;"><i class="fas fa-align-left"></i> ${escapeHtml(assembly.description)}</p>` : '';
        const createdByHTML = assembly.created_by ? `<p><i class="fas fa-user-tie"></i> <strong>Criado por:</strong> ${escapeHtml(assembly.created_by)}</p>` : '';
        const endTimeText = assembly.end_time && assembly.end_time !== assembly.start_time ? ` às ${assembly.start_time || '--:--'} até ${assembly.end_time}` : ` às ${assembly.start_time || assembly.time || '--:--'}`;

        const deleteBtn = canDelete ? `
            <button class="btn btn-secondary" style="margin-left:8px;background:#fee2e2;color:#b91c1c;border-color:#fecaca;" onclick="confirmDeleteAssembly(${JSON.stringify(assembly.id).replace(/"/g, '&quot;')})" title="Excluir assembleia">
                <i class="fas fa-trash-alt"></i> Excluir
            </button>` : '';

        const itemHTML = `
            <div class="assembly-item" data-assembly-id="${escapeHtml(String(assembly.id))}">
                <div class="assembly-info">
                    <h3>${escapeHtml(assembly.title)}</h3>
                    <p><i class="far fa-calendar-alt"></i> <strong>Data:</strong> ${formatDate(assembly.date)}${endTimeText}</p>
                    ${createdByHTML}
                    ${descriptionHTML}
                </div>
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
                    <button class="btn btn-primary" onclick="joinAssembly(${JSON.stringify(String(assembly.id)).replace(/"/g, '&quot;')})">
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
    const assembly = scheduledAssemblies.find(a => a.id === assemblyId);
    if (assembly) {
        document.getElementById('assembly-title').textContent = assembly.title;
        document.getElementById('assembly-room').classList.add('active');
        document.body.style.overflow = 'hidden';
        
        micOn = true;
        cameraOn = false;
        updateControlsUI();
        renderParticipants();
    }
}

function leaveAssembly() {
    document.getElementById('assembly-room').classList.remove('active');
    document.body.style.overflow = 'auto';
    chatOpen = false;
    document.getElementById('chat-sidebar').classList.add('closed');
    participants = [];
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
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
            }).catch(error => {
                console.error('Erro ao capturar áudio:', error);
                alert('Não foi possível acessar o microfone. Verifique as permissões.');
                micOn = false;
            });
        }
    } else {
        // Desativa microfone - remove áudio do stream
        if (localStream && localStream.getAudioTracks().length) {
            localStream.getAudioTracks().forEach(track => {
                track.stop();
                localStream.removeTrack(track);
            });
        }
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
        } catch (error) {
            console.error('Erro ao acessar câmera:', error);
            alert('Não foi possível acessar a câmera. Verifique as permissões.');
            cameraOn = false;
        }
    } else {
        // Desativa câmera
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        renderParticipants();
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

    if (currentUser) {
        addMessage(message, imageData, 'Você', currentUser.type);
        input.value = '';
        removeSelectedImage();
    }
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
    sessionStorage.removeItem('condominiumUser');
    window.location.href = '../inicio.html';
}
