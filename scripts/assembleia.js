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

document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const storedUser = sessionStorage.getItem('condominiumUser');
    if (!storedUser) {
        window.location.href = 'entrar.html';
        return;
    }
    
    currentUser = JSON.parse(storedUser);

    // Se for síndico, verificar se tem plano
    if (currentUser.type === 'sindico' && !currentUser.plan) {
        window.location.href = 'checkout.html';
        return;
    }
    
    updateUserProfile();
    
    // Initialize chat as closed
    document.getElementById('chat-sidebar').classList.add('closed');
    
    // Set min date to today on date input
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('assembly-date').setAttribute('min', today);
    
    // Message input enter key
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Image upload
    document.getElementById('image-upload').addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = function(event) {
                selectedImageData = event.target.result;
                const previewWrapper = document.getElementById('image-preview-wrapper');
                const previewImg = document.getElementById('image-preview');
                previewImg.src = selectedImageData;
                previewWrapper.classList.add('active');
            };
            reader.readAsDataURL(file);
        }
    });

    // Render initial assemblies from Supabase
    loadScheduledAssemblies();
    renderPastAssemblies();
});

async function loadScheduledAssemblies() {
    try {
        scheduledAssemblies = await getScheduledAssemblies();
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
    const time = document.getElementById('assembly-time').value;
    
    if (!title || !date || !time) {
        alert('Preencha todos os campos da assembleia.');
        return;
    }

    const newAssembly = {
        title: title,
        date: date,
        start_time: time
    };

    try {
        const savedAssembly = await scheduleAssemblyDb(newAssembly);
        scheduledAssemblies.push(savedAssembly);
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
        listContainer.innerHTML = '<p>Nenhuma assembleia agendada.</p>';
        return;
    }
    
    scheduledAssemblies.forEach(assembly => {
        const itemHTML = `
            <div class="assembly-item">
                <div class="assembly-info">
                    <h3>${assembly.title}</h3>
                    <p><i class="far fa-calendar-alt"></i> <strong>Data:</strong> ${formatDate(assembly.date)} às ${assembly.start_time || assembly.time}</p>
                    <p><i class="fas fa-user-tie"></i> <strong>Organizado por:</strong> ${currentUser ? currentUser.name : 'Usuário'}</p>
                </div>
                <button class="btn btn-primary" onclick="joinAssembly('${assembly.id}')">
                    <i class="fas fa-video"></i> Entrar na Chamada
                </button>
            </div>
        `;
        listContainer.innerHTML += itemHTML;
    });
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
