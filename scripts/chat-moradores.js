(function () {
    const SAMPLE_RESIDENTS = [
        { id: 'r1', name: 'Juliana Martins', unit: 'Bloco A - Apto 203', initials: 'JM', avatarClass: '', status: 'online', lastMessage: 'Ok, obrigada!', lastTime: '14:32', unread: 2 },
        { id: 'r2', name: 'Carlos Lima', unit: 'Bloco B - Apto 105', initials: 'CL', avatarClass: 'secondary', status: 'offline', lastMessage: 'Preciso de ajuda com o...', lastTime: '12:15', unread: 0 },
        { id: 'r3', name: 'Mariana Costa', unit: 'Bloco A - Apto 302', initials: 'MC', avatarClass: 'tertiary', status: 'online', lastMessage: 'Tudo bem!', lastTime: 'Ontem', unread: 0 },
        { id: 'r4', name: 'Rafael Souza', unit: 'Bloco C - Apto 301', initials: 'RS', avatarClass: 'quaternary', status: 'busy', lastMessage: 'Entendido, até lá!', lastTime: 'Ontem', unread: 0 },
        { id: 'r5', name: 'Ana Costa', unit: 'Bloco A - Apto 101', initials: 'AC', avatarClass: 'quinary', status: 'offline', lastMessage: 'Recebi, valeu!', lastTime: 'Seg', unread: 0 },
        { id: 'r6', name: 'Fernanda Lima', unit: 'Bloco A - Apto 105', initials: 'FL', avatarClass: '', status: 'online', lastMessage: 'Vou verificar e te retorno.', lastTime: 'Seg', unread: 1 }
    ];

    const SAMPLE_MESSAGES = {
        r1: [
            { sender: 'them', text: 'Bom dia João! Tudo sim e você? Claro, pode falar!', time: '09:41' },
            { sender: 'me', text: 'Bom dia Juliana, tudo bem? Queria conversar sobre a festa do sábado. Você confirmou presença?', time: '09:40' },
            { sender: 'them', text: 'Ok, obrigada!', time: '14:32' },
            { sender: 'me', text: 'Ótimo! Então, a festa está confirmada para o salão de festas às 18h. Se puder, peço que confirme até amanhã para organizarmos.', time: '14:30' }
        ]
    };

    const state = {
        currentUser: null,
        userType: 'sindico',
        activeConversationId: null,
        conversations: []
    };

    function getChatStorageKey() {
        const base = state.currentUser?.email || state.currentUser?.cpf || 'sindico';
        return `condomit.chat.moradores.${base}`;
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
        const userName = user?.name || 'Síndico';
        const userTypeLabel = user?.type === 'porteiro' ? 'Porteiro' : user?.type === 'morador' ? 'Morador' : 'Síndico';
        const firstName = userName.split(' ')[0];

        const nameTop = document.getElementById('profileNameTop');
        const typeTop = document.getElementById('profileTypeTop');
        const avatarTop = document.getElementById('profileAvatarTop');
        if (nameTop) nameTop.textContent = userName;
        if (typeTop) typeTop.textContent = userTypeLabel;
        if (avatarTop) avatarTop.textContent = getInitials(userName);

        const greeting = document.querySelector('.top-bar-left h1');
        if (greeting && !greeting.dataset.set) {
            greeting.dataset.set = '1';
        }

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
            const statusLabel = conv.status === 'online' ? 'Online' : conv.status === 'busy' ? 'Ocupado' : 'Offline';
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
            const sorted = [...SAMPLE_MESSAGES[id]].map(m => ({ ...m }));
            return sorted;
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
        const userInitials = getInitials(state.currentUser?.name || 'Síndico');
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
                'Entendido! Vou verificar e te retorno em breve.',
                'Ok, obrigada pela informação!',
                'Tudo bem, entendi. Qualquer coisa te aviso.',
                'Perfeito, obrigada! 😊',
                'Vou checar aqui e já te respondo.'
            ];
            const reply = responses[Math.floor(Math.random() * responses.length)];
            const messages2 = loadMessages(state.activeConversationId);
            messages2.push({ sender: 'them', text: reply, time: formatTime(new Date()) });
            saveMessages(state.activeConversationId, messages2);
            const conv2 = state.conversations.find(c => c.id === state.activeConversationId);
            if (conv2) {
                conv2.lastMessage = reply;
                conv2.lastTime = formatTime(new Date());
            }
            if (state.activeConversationId) {
                renderMessages(state.activeConversationId);
            }
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
                renderSidebar(currentUser, userType, window.location.pathname.split('/').pop() || 'chat-moradores.html');
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
            : String(user.type || 'sindico').trim().toLowerCase();

        setupTopBar(user);
        applySidebar();

        state.conversations = SAMPLE_RESIDENTS.map(r => ({ ...r }));
        state.activeConversationId = 'r1';
        renderConversations();
        setTimeout(() => openConversation('r1'), 50);

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
