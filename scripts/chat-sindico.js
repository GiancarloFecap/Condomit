(function () {
    const SAMPLE_MESSAGES = [
        { sender: 'them', text: 'Olá, tudo bem? Espero que esteja gostando do aplicativo!', time: '09:10' },
        { sender: 'me', text: 'Boa tarde João! Tudo ótimo por aqui. Só queria te enviar uma sugestão sobre o estacionamento.', time: '15:32' },
        { sender: 'them', text: 'Que bom! Fico feliz em ouvir. Pode compartilhar suas ideias quando quiser.', time: '15:35' }
    ];

    const state = {
        currentUser: null,
        userType: 'morador',
        messages: []
    };

    function getChatStorageKey() {
        const base = state.currentUser?.email || state.currentUser?.cpf || 'morador';
        return `condomit.chat.sindico.${base}`;
    }

    function getInitials(name) {
        return String(name || 'US')
            .split(' ')
            .filter(Boolean)
            .map(p => p[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'US';
    }

    function formatTime(date) {
        return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function loadUser() {
        try {
            const raw = sessionStorage.getItem('condominiumUser');
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function setupTopBar(user) {
        const userName = user?.name || 'Morador';
        const userTypeLabel = user?.type === 'porteiro' ? 'Porteiro' : user?.type === 'sindico' ? 'Síndico' : 'Morador';

        const nameTop = document.getElementById('profileNameTop');
        const typeTop = document.getElementById('profileTypeTop');
        const avatarTop = document.getElementById('profileAvatarTop');
        if (nameTop) nameTop.textContent = userName;
        if (typeTop) typeTop.textContent = userTypeLabel;
        if (avatarTop) avatarTop.textContent = getInitials(userName);

        if (typeof syncAllAvatars === 'function') {
            try { syncAllAvatars(user); } catch (_) {}
        }

        const topProfileBlock = document.getElementById('topProfileBlock');
        if (topProfileBlock) {
            topProfileBlock.style.cursor = 'pointer';
            topProfileBlock.addEventListener('click', () => {
                window.location.href = 'configuracoes.html';
            });
        }

        const topUserBtn = document.getElementById('topUserBtn');
        if (topUserBtn) {
            topUserBtn.addEventListener('click', () => {
                window.location.href = 'configuracoes.html#editar-perfil';
            });
        }

        const sidebarApartment = document.getElementById('sidebarApartment');
        if (sidebarApartment && user?.condominium?.name) {
            const words = user.condominium.name.split(' ').filter(Boolean);
            sidebarApartment.innerHTML = words.length > 2
                ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
                : words.join(' ');
        }
    }

    function loadMessages() {
        try {
            const raw = localStorage.getItem(getChatStorageKey());
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return SAMPLE_MESSAGES.map(m => ({ ...m }));
    }

    function saveMessages(messages) {
        try {
            localStorage.setItem(getChatStorageKey(), JSON.stringify(messages));
        } catch (_) {}
    }

    function renderMessages() {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        const divider = container.querySelector('.message-divider');
        const messages = state.messages;
        const userInitials = getInitials(state.currentUser?.name || 'Morador');
        const sindicoInitials = 'JS';

        const messagesHtml = messages.map(msg => {
            const isMine = msg.sender === 'me';
            return `
                <div class="message ${isMine ? 'mine' : ''}">
                    <div class="message-avatar-sm ${isMine ? 'mine' : ''}">${isMine ? userInitials : sindicoInitials}</div>
                    <div class="message-body">
                        <div class="message-sender">${isMine ? 'Você' : 'João Silva'}</div>
                        <div class="message-bubble">${msg.text}</div>
                        <div class="message-time">
                            ${msg.time}
                            ${isMine ? '<i class="fas fa-check-double"></i>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = '';
        if (divider) container.appendChild(divider.cloneNode(true));
        container.insertAdjacentHTML('beforeend', messagesHtml);
        container.scrollTop = container.scrollHeight;
    }

    function sendMessage() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        state.messages.push({ sender: 'me', text, time: formatTime(new Date()) });
        saveMessages(state.messages);
        input.value = '';
        adjustTextareaHeight(input);
        renderMessages();

        setTimeout(() => {
            const responses = [
                'Entendido! Vou analisar e te retorno em breve.',
                'Obrigado pela mensagem! Qualquer novidade já te aviso.',
                'Perfeito, anotei aqui. Se precisar de mais detalhes te chamo.',
                'Agradeço o contato! Vamos resolver isso juntos.',
                'Recebi sua mensagem. Em breve entrarei em contato.'
            ];
            const reply = responses[Math.floor(Math.random() * responses.length)];
            state.messages.push({ sender: 'them', text: reply, time: formatTime(new Date()) });
            saveMessages(state.messages);
            renderMessages();
        }, 900 + Math.random() * 900);
    }

    function adjustTextareaHeight(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    }

    function applySidebar() {
        const currentUser = state.currentUser;
        const userType = state.userType;
        if (typeof applyGlobalAppLanguage === 'function') {
            try {
                applyGlobalAppLanguage(currentUser, userType);
            } catch (_) {}
        } else if (typeof renderSidebar === 'function') {
            try {
                renderSidebar(currentUser, userType, window.location.pathname.split('/').pop() || 'chat-sindico.html');
            } catch (_) {}
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const user = loadUser();
        if (!user) {
            window.location.href = 'entrar.html';
            return;
        }
        state.currentUser = user;
        state.userType = typeof getNormalizedUserType === 'function'
            ? getNormalizedUserType(user)
            : String(user.type || 'morador').trim().toLowerCase();

        setupTopBar(user);
        applySidebar();

        state.messages = loadMessages();
        renderMessages();

        const input = document.getElementById('chatInput');
        if (input) {
            input.addEventListener('input', () => adjustTextareaHeight(input));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }
    });

    window.logout = function () {
        if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
        sessionStorage.removeItem('condominiumUser');
        try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
        window.location.href = '../inicio.html';
    };
})();
