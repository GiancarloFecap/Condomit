(function () {
    'use strict';

    const state = {
        currentUser: null,
        targetRole: '',
        targetLabel: 'usuário',
        emptyLabel: 'Nenhum usuário encontrado neste condomínio.',
        contacts: [],
        activeEmail: '',
        activeContact: null,
        messagePoll: null,
        contactsPoll: null,
        sending: false
    };

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getInitials(name) {
        return String(name || 'US')
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'US';
    }

    function getCurrentUser() {
        try {
            return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
        } catch (_) {
            return null;
        }
    }

    async function rpc(name, payload = {}) {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase não está disponível nesta página.');
        }

        return window.supabaseFetch(`/rpc/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    function setupShell(user) {
        const userName = user?.name || 'Usuário';
        const userType = String(user?.type || user?.user_type || '').toLowerCase();
        const typeLabels = { sindico: 'Síndico', morador: 'Morador', porteiro: 'Porteiro' };

        const nameTop = document.getElementById('profileNameTop');
        const typeTop = document.getElementById('profileTypeTop');
        const avatarTop = document.getElementById('profileAvatarTop');
        const sidebarApartment = document.getElementById('sidebarApartment');

        if (nameTop) nameTop.textContent = userName;
        if (typeTop) typeTop.textContent = typeLabels[userType] || 'Usuário';

        if (avatarTop) {
            const photo = user?.profilePhoto || user?.profile_photo || '';
            avatarTop.innerHTML = photo
                ? `<img src="${escapeHtml(photo)}" alt="Foto de perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : escapeHtml(getInitials(userName));
        }

        let condo = user?.condominium || {};
        if (typeof condo === 'string') {
            try { condo = JSON.parse(condo); } catch (_) { condo = {}; }
        }

        if (sidebarApartment && condo?.name) {
            const words = String(condo.name).split(/\s+/).filter(Boolean);
            sidebarApartment.innerHTML = words.length > 2
                ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
                : escapeHtml(words.join(' '));
        }

        if (typeof window.syncAllAvatars === 'function') {
            try { window.syncAllAvatars(user); } catch (_) {}
        }
    }

    function contactUnit(contact) {
        const parts = [];
        if (contact?.block) parts.push(`Bloco ${contact.block}`);
        if (contact?.apartment) parts.push(`Apto ${contact.apartment}`);
        return parts.length ? parts.join(' • ') : 'Mesmo condomínio';
    }

    function renderContacts() {
        const list = document.getElementById('conversationsList');
        if (!list) return;

        const search = String(document.getElementById('searchConversations')?.value || '').trim().toLowerCase();
        const contacts = state.contacts.filter((contact) => {
            const haystack = `${contact?.name || ''} ${contact?.email || ''} ${contact?.block || ''} ${contact?.apartment || ''}`.toLowerCase();
            return !search || haystack.includes(search);
        });

        if (!contacts.length) {
            list.innerHTML = `
                <div style="padding:28px 18px;text-align:center;color:#64748b;line-height:1.5;">
                    <i class="fas fa-user-slash" style="font-size:28px;margin-bottom:10px;color:#94a3b8;"></i>
                    <div>${escapeHtml(search ? 'Nenhum contato corresponde à busca.' : state.emptyLabel)}</div>
                </div>
            `;
            return;
        }

        list.innerHTML = contacts.map((contact) => {
            const email = normalizeEmail(contact.email);
            const active = email === state.activeEmail;
            const photo = contact.profile_photo || contact.profilePhoto || '';
            const avatar = photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(contact.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : escapeHtml(getInitials(contact.name));

            return `
                <div class="conversation-item ${active ? 'active' : ''}" data-contact-email="${escapeHtml(email)}" tabindex="0" role="button">
                    <div class="conversation-avatar" style="overflow:hidden;">${avatar}</div>
                    <div class="conversation-info">
                        <div class="conversation-top-row">
                            <h4 class="conversation-name">${escapeHtml(contact.name || contact.email)}</h4>
                        </div>
                        <div class="conversation-sub-row">
                            <p class="conversation-last">Clique para conversar</p>
                        </div>
                        <div class="conversation-meta">${escapeHtml(contactUnit(contact))}</div>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('[data-contact-email]').forEach((item) => {
            const open = () => openConversation(item.dataset.contactEmail);
            item.addEventListener('click', open);
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });
        });
    }

    function updateActiveHeader(contact) {
        const avatar = document.getElementById('activeChatAvatar');
        const name = document.getElementById('activeChatName');
        const detail = document.getElementById('activeChatDetail');
        const empty = document.getElementById('chatEmptyState');

        if (!contact) {
            if (name) name.textContent = 'Selecione uma conversa';
            if (detail) detail.textContent = `Escolha um ${state.targetLabel} para começar`;
            if (empty) empty.style.display = 'flex';
            return;
        }

        const photo = contact.profile_photo || contact.profilePhoto || '';
        if (avatar) {
            avatar.style.overflow = 'hidden';
            avatar.innerHTML = photo
                ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(contact.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : escapeHtml(getInitials(contact.name));
        }
        if (name) name.textContent = contact.name || contact.email;
        if (detail) detail.innerHTML = `<span class="status-indicator">${escapeHtml(contactUnit(contact))}</span>`;
        if (empty) empty.style.display = 'none';
    }

    async function loadContacts({ preserveSelection = true } = {}) {
        const rows = await rpc('condomit_list_chat_contacts', { target_role: state.targetRole });
        const contacts = Array.isArray(rows) ? rows : [];
        state.contacts = contacts
            .filter((contact) => normalizeEmail(contact?.email) !== normalizeEmail(state.currentUser?.email))
            .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { sensitivity: 'base' }));

        if (preserveSelection && state.activeEmail) {
            state.activeContact = state.contacts.find((item) => normalizeEmail(item.email) === state.activeEmail) || null;
            if (!state.activeContact) state.activeEmail = '';
        }

        renderContacts();

        const hasContactsList = Boolean(document.getElementById('conversationsList'));

        // Telas de conversa única (como chat com o síndico) não possuem
        // lista lateral. Nelas abrimos automaticamente o primeiro contato
        // real do mesmo condomínio. Nas telas com lista, só abrimos
        // automaticamente quando existe exatamente um contato.
        if (
            !state.activeEmail &&
            state.contacts.length > 0 &&
            (!hasContactsList || state.contacts.length === 1)
        ) {
            await openConversation(state.contacts[0].email);
        } else if (!state.activeEmail) {
            updateActiveHeader(null);
            renderMessages([]);
        }
    }

    async function openConversation(email) {
        const normalized = normalizeEmail(email);
        const contact = state.contacts.find((item) => normalizeEmail(item.email) === normalized);
        if (!contact) return;

        state.activeEmail = normalized;
        state.activeContact = contact;
        updateActiveHeader(contact);
        renderContacts();
        await refreshMessages();
    }

    function renderMessages(messages) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        const currentEmail = normalizeEmail(state.currentUser?.email);
        const contact = state.activeContact;

        if (!state.activeEmail) {
            const hasContactsList = Boolean(document.getElementById('conversationsList'));
            const noContacts = state.contacts.length === 0;
            const title = noContacts ? state.emptyLabel : 'Selecione uma conversa';
            const detail = noContacts
                ? 'Quando um usuário compatível estiver vinculado a este condomínio, ele aparecerá aqui.'
                : (hasContactsList ? 'Escolha um contato à esquerda para começar.' : `Escolha um ${state.targetLabel} para começar.`);

            container.innerHTML = `
                <div class="empty-state" id="chatEmptyState" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px 20px;text-align:center;">
                    <i class="fas fa-comments" style="font-size:36px;color:#cbd5e1;"></i>
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(detail)}</span>
                </div>`;
            return;
        }

        if (!Array.isArray(messages) || !messages.length) {
            container.innerHTML = `
                <div class="message-divider"><span>Conversa</span></div>
                <div style="padding:30px 20px;text-align:center;color:#64748b;">Nenhuma mensagem ainda. Envie a primeira mensagem.</div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="message-divider"><span>Conversa</span></div>
            ${messages.map((message) => {
                const mine = normalizeEmail(message.sender_email) === currentEmail;
                const personName = mine ? (state.currentUser?.name || 'Você') : (contact?.name || state.targetLabel);
                const photo = mine
                    ? (state.currentUser?.profilePhoto || state.currentUser?.profile_photo || '')
                    : (contact?.profile_photo || contact?.profilePhoto || '');
                const avatar = photo
                    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(personName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                    : escapeHtml(getInitials(personName));
                const date = new Date(message.created_at);
                const time = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="message ${mine ? 'mine' : ''}">
                        <div class="message-avatar-sm ${mine ? 'mine' : ''}" style="overflow:hidden;">${avatar}</div>
                        <div class="message-body">
                            <div class="message-bubble">${escapeHtml(message.message)}</div>
                            <div class="message-time">${escapeHtml(time)}${mine ? ' <i class="fas fa-check-double"></i>' : ''}</div>
                        </div>
                    </div>`;
            }).join('')}
        `;
        container.scrollTop = container.scrollHeight;
    }

    async function refreshMessages() {
        if (!state.activeEmail) return;
        try {
            const rows = await rpc('condomit_chat_get_messages', { other_email: state.activeEmail });
            renderMessages(Array.isArray(rows) ? rows : []);
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
        }
    }

    async function sendMessage() {
        if (state.sending || !state.activeEmail) return;
        const input = document.getElementById('chatInput');
        const text = String(input?.value || '').trim();
        if (!text) return;

        state.sending = true;
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
        try {
            await rpc('condomit_chat_send_message', {
                other_email: state.activeEmail,
                message_text: text
            });
            if (input) input.value = '';
            await refreshMessages();
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            window.showToast?.(error?.message || 'Não foi possível enviar a mensagem.', 'error');
        } finally {
            state.sending = false;
            if (sendBtn) sendBtn.disabled = false;
            input?.focus();
        }
    }

    function bindControls() {
        document.getElementById('searchConversations')?.addEventListener('input', renderContacts);
        document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
        document.getElementById('chatInput')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        document.querySelector('.new-chat-btn')?.addEventListener('click', () => {
            document.getElementById('searchConversations')?.focus();
        });
    }

    function stopPolling() {
        if (state.messagePoll) window.clearInterval(state.messagePoll);
        if (state.contactsPoll) window.clearInterval(state.contactsPoll);
        state.messagePoll = null;
        state.contactsPoll = null;
    }

    async function init(options = {}) {
        stopPolling();
        state.targetRole = String(options.targetRole || '').trim().toLowerCase();
        state.targetLabel = options.targetLabel || state.targetRole || 'usuário';
        state.emptyLabel = options.emptyLabel || `Nenhum ${state.targetLabel} encontrado neste condomínio.`;

        let user = getCurrentUser();
        if (!user) {
            window.location.href = 'entrar.html';
            return;
        }

        if (typeof window.refreshCurrentUserFromDb === 'function') {
            try { user = await window.refreshCurrentUserFromDb() || user; } catch (_) {}
        }

        state.currentUser = user;
        setupShell(user);
        bindControls();

        try {
            await loadContacts({ preserveSelection: false });
        } catch (error) {
            console.error('Erro ao carregar contatos do chat:', error);
            state.contacts = [];
            renderContacts();
            window.showToast?.(error?.message || 'Não foi possível carregar os usuários do condomínio.', 'error');
        }

        state.messagePoll = window.setInterval(() => {
            if (!document.hidden && state.activeEmail) refreshMessages();
        }, 3000);

        state.contactsPoll = window.setInterval(() => {
            if (!document.hidden) loadContacts({ preserveSelection: true }).catch(() => {});
        }, 15000);

        window.addEventListener('beforeunload', stopPolling, { once: true });
    }

    window.CondomitChat = { init, refreshMessages, loadContacts };
})();
