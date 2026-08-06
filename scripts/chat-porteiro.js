(function () {
    const SAMPLE_CONTACTS = [
        { id: 'p1', name: 'Carlos Pereira', unit: 'Porteiro', initials: 'CP', avatarClass: 'quinary', status: 'busy', lastMessage: 'Tudo certo aqui!', lastTime: '09:45', unread: 0, role: 'porteiro' },
        { id: 'p2', name: 'Suporte Condomit', unit: 'Atendimento', initials: 'SC', avatarClass: 'secondary', status: 'offline', lastMessage: 'Atendimento encerrado', lastTime: '15/03', unread: 0, role: 'suporte' }
    ];

    const SAMPLE_MESSAGES = {
        p1: [
            { sender: 'them', text: 'Bom dia! Portaria aqui. Posso ajudar?', time: '09:30' },
            { sender: 'me', text: 'Bom dia Carlos! Tenho uma encomenda chegando hoje, pode avisar quando chegar?', time: '09:40' },
            { sender: 'them', text: 'Tudo certo aqui!', time: '09:45' }
        ]
    };

    const state = {
        currentUser: null,
        userType: 'morador',
        activeConversationId: null,
        conversations: []
    };

    function getChatStorageKey() {
        const base = state.currentUser?.email || state.currentUser?.cpf || 'morador';
        return `condomit.chat.porteiro.${base}`;
    }

    function getMessagesStorageKey(convId) {
        return `${getChatStorageKey()}.${convId}`;
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

    function renderConversations() {
        const listEl = document.getElementById('conversationsList');
        if (!listEl) return;

        listEl.innerHTML = state.conversations.map(conv => `
            <div class="conversation-item ${conv.id === state.activeConversationId ? 'active' : ''}" data-id="${conv.id}" tabindex="0" role="button">
                <div class="conversation-avatar ${conv.avatarClass || ''}">
                    ${conv.initials}
                    <span class="status-dot ${conv.status === 'online' ? '' : conv.status === 'busy' ? 'busy' : 'offline'}"></span>
                </div>
                <div class="conversation-info">
                    <div class="conversation-top-row">
                        <h4 class="conversation-name">${conv.name}</h4>
                        <span class="conversation-time">${conv.lastTime}</span>
                    </div>
                    <div class="conversation-sub-row">
                        <p class="conversation-last">${conv.lastMessage}</p>
                        ${conv.unread > 0 ? `<span class="conversation-badge">${conv.unread}</span>` : ''}
                    </div>
                    <div class="conversation-meta">${conv.unit}</div>
                </div>
            </div>
        `).join('');

        listEl.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => openConversation(item.dataset.id));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openConversation(item.dataset.id);
                }
            });
        });
    }

    function openConversation(id) {
        state.activeConversationId = id;
        const conv = state.conversations.find(c => c.id === id);
        if (!conv) return;

        conv.unread = 0;

        const avatar = document.getElementById('activeChatAvatar');
        const name = document.getElementById('activeChatName');
        const detail = document.getElementById('activeChatDetail');
        if (avatar) {
            avatar.className = `chat-avatar-lg ${conv.avatarClass || ''}`;
            avatar.innerHTML = `${conv.initials} <span class="status-dot ${conv.status === 'online' ? '' : conv.status === 'busy' ? 'busy' : 'offline'}"></span>`;
        }
        if (name) name.textContent = conv.name;
        if (detail) {
            const statusLabel = conv.status === 'online' ? 'Disponível' : conv.status === 'busy' ? 'Ocupado' : 'Offline';
            detail.innerHTML = `<span class="status-indicator">● ${conv.unit} • ${statusLabel}</span>`;
        }

        document.getElementById('chatEmptyState').style.display = 'none';
        renderMessages(id);
        renderConversations();
    }

    function loadMessages(id) {
        try {
            const raw = localStorage.getItem(getMessagesStorageKey(id));
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        if (SAMPLE_MESSAGES[id]) {
            return [...SAMPLE_MESSAGES[id]].map(m => ({ ...m }));
        }
        return [];
    }

    function saveMessages(id, messages) {
        try {
            localStorage.setItem(getMessagesStorageKey(id), JSON.stringify(messages));
        } catch (_) {}
    }

    function renderMessages(id) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        const divider = container.querySelector('.message-divider');
        const emptyState = container.querySelector('#chatEmptyState');
        const messages = loadMessages(id);
        const userInitials = getInitials(state.currentUser?.name || 'Morador');
        const conv = state.conversations.find(c => c.id === id);

        const messagesHtml = messages.map(msg => {
            const isMine = msg.sender === 'me';
            const avatarInitials = isMine ? userInitials : (conv?.initials || 'US');
            return `
                <div class="message ${isMine ? 'mine' : ''}">
                    <div class="message-avatar-sm ${isMine ? 'mine' : ''} ${isMine ? '' : (conv?.avatarClass || '')}">${avatarInitials}</div>
                    <div class="message-body">
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
        if (!messages.length && emptyState) {
            const empty = emptyState.cloneNode(true);
            empty.style.display = 'flex';
            container.appendChild(empty);
        } else {
            container.insertAdjacentHTML('beforeend', messagesHtml);
        }
        container.scrollTop = container.scrollHeight;
    }

    function sendMessage() {
        const input = document.getElementById('chatInput');
        if (!input || !state.activeConversationId) return;
        const text = input.value.trim();
        if (!text) return;

        const messages = loadMessages(state.activeConversationId);
        const now = new Date();
        messages.push({ sender: 'me', text, time: formatTime(now) });
        saveMessages(state.activeConversationId, messages);

        const conv = state.conversations.find(c => c.id === state.activeConversationId);
        if (conv) {
            conv.lastMessage = text;
            conv.lastTime = formatTime(now);
        }

        input.value = '';
        adjustTextareaHeight(input);
        renderMessages(state.activeConversationId);
        renderConversations();

        setTimeout(() => {
            const responses = [
                'Entendido! Vou verificar aqui.',
                'Tudo certo! Anotado.',
                'Ok, já vou providenciar.',
                'Recebi! Quando tiver novidade te aviso.',
                'Perfeito, estou verificando agora.'
            ];
            const reply = responses[Math.floor(Math.random() * responses.length)];
            const m2 = loadMessages(state.activeConversationId);
            m2.push({ sender: 'them', text: reply, time: formatTime(new Date()) });
            saveMessages(state.activeConversationId, m2);
            const c2 = state.conversations.find(c => c.id === state.activeConversationId);
            if (c2) {
                c2.lastMessage = reply;
                c2.lastTime = formatTime(new Date());
            }
            if (state.activeConversationId) renderMessages(state.activeConversationId);
            renderConversations();
        }, 900 + Math.random() * 900);
    }

    function adjustTextareaHeight(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 140) + 'px';
    }

    function bindSearch() {
        const input = document.getElementById('searchConversations');
        if (!input) return;
        input.addEventListener('input', () => {
            const q = input.value.toLowerCase().trim();
            document.querySelectorAll('.conversation-item').forEach(item => {
                const name = item.querySelector('.conversation-name')?.textContent.toLowerCase() || '';
                const unit = item.querySelector('.conversation-meta')?.textContent.toLowerCase() || '';
                const match = !q || name.includes(q) || unit.includes(q);
                item.style.display = match ? '' : 'none';
            });
        });
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
                renderSidebar(currentUser, userType, window.location.pathname.split('/').pop() || 'chat-porteiro.html');
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

        state.conversations = SAMPLE_CONTACTS.map(r => ({ ...r }));
        state.activeConversationId = 'p1';
        renderConversations();
        setTimeout(() => openConversation('p1'), 50);

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

        bindSearch();
    });

    window.logout = function () {
        if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
        sessionStorage.removeItem('condominiumUser');
        try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
        window.location.href = '../inicio.html';
    };
})();
