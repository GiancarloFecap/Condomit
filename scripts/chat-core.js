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
        sending: false,
        pendingAttachment: null,
        emojiPickerOpen: false
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


    const CHAT_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
    const CHAT_EMOJIS = [
        '😀','😃','😄','😁','😂','😊','😍','🥰','😎','🤩',
        '🙂','😉','😅','🤔','😮','😢','😭','😡','👍','👎',
        '👏','🙌','🙏','💪','❤️','💙','💚','💛','🎉','✨',
        '✅','❌','⚠️','📌','📎','🏠','🔔','📦','🚗','🐶'
    ];

    function formatBytes(bytes) {
        const value = Number(bytes || 0);
        if (!Number.isFinite(value) || value <= 0) return '0 B';
        if (value < 1024) return `${value} B`;
        if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
        return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
            reader.readAsDataURL(file);
        });
    }

    function insertTextAtCursor(textarea, text) {
        if (!textarea) return;
        const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
        const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : textarea.value.length;
        textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
        const next = start + text.length;
        textarea.focus();
        try { textarea.setSelectionRange(next, next); } catch (_) {}
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function clearPendingAttachment() {
        state.pendingAttachment = null;
        const input = document.getElementById('chatFileInput');
        if (input) input.value = '';
        renderPendingAttachment();
    }

    function renderPendingAttachment() {
        const preview = document.getElementById('chatAttachmentPreview');
        if (!preview) return;
        const attachment = state.pendingAttachment;
        if (!attachment) {
            preview.hidden = true;
            preview.innerHTML = '';
            return;
        }
        preview.hidden = false;
        preview.innerHTML = `
            <div class="chat-attachment-selected">
                <div class="chat-attachment-selected-icon"><i class="fas fa-file"></i></div>
                <div class="chat-attachment-selected-info">
                    <strong>${escapeHtml(attachment.name)}</strong>
                    <span>${escapeHtml(formatBytes(attachment.size))}</span>
                </div>
                <button type="button" id="removeChatAttachment" class="chat-attachment-remove" aria-label="Remover arquivo" title="Remover arquivo">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>`;
        document.getElementById('removeChatAttachment')?.addEventListener('click', clearPendingAttachment);
    }

    async function selectAttachment(file) {
        if (!file) return;
        if (file.size <= 0) {
            window.showToast?.('O arquivo selecionado está vazio.', 'warning');
            return;
        }
        if (file.size > CHAT_ATTACHMENT_MAX_BYTES) {
            window.showToast?.('O arquivo deve ter no máximo 2 MB.', 'warning');
            return;
        }
        try {
            const data = await readFileAsDataUrl(file);
            state.pendingAttachment = {
                name: String(file.name || 'arquivo').slice(0, 255),
                type: String(file.type || 'application/octet-stream').slice(0, 150),
                size: Number(file.size || 0),
                data
            };
            renderPendingAttachment();
        } catch (error) {
            console.error('Erro ao anexar arquivo:', error);
            window.showToast?.(error?.message || 'Não foi possível anexar o arquivo.', 'error');
        }
    }

    function closeEmojiPicker() {
        const picker = document.getElementById('chatEmojiPicker');
        if (picker) picker.hidden = true;
        state.emojiPickerOpen = false;
    }

    function toggleEmojiPicker() {
        const picker = document.getElementById('chatEmojiPicker');
        if (!picker) return;
        state.emojiPickerOpen = !state.emojiPickerOpen;
        picker.hidden = !state.emojiPickerOpen;
    }

    function ensureChatComposerTools() {
        const wrapper = document.querySelector('.chat-input-wrapper');
        const inputArea = document.querySelector('.chat-input-area');
        const textarea = document.getElementById('chatInput');
        if (!wrapper || !inputArea || !textarea) return;

        const attachButton = document.getElementById('attachFileBtn') || wrapper.querySelector('[title="Anexar arquivo"]');
        const emojiButton = document.getElementById('emojiBtn') || wrapper.querySelector('[title="Emoji"]');

        let fileInput = document.getElementById('chatFileInput');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'chatFileInput';
            fileInput.hidden = true;
            wrapper.appendChild(fileInput);
        }

        let preview = document.getElementById('chatAttachmentPreview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'chatAttachmentPreview';
            preview.className = 'chat-attachment-preview';
            preview.hidden = true;
            inputArea.insertBefore(preview, wrapper);
        }

        let picker = document.getElementById('chatEmojiPicker');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'chatEmojiPicker';
            picker.className = 'chat-emoji-picker';
            picker.hidden = true;
            picker.innerHTML = CHAT_EMOJIS.map((emoji) => `
                <button type="button" class="chat-emoji-option" data-emoji="${escapeHtml(emoji)}" aria-label="${escapeHtml(emoji)}">${escapeHtml(emoji)}</button>`
            ).join('');
            inputArea.appendChild(picker);
            picker.querySelectorAll('[data-emoji]').forEach((button) => {
                button.addEventListener('click', () => {
                    insertTextAtCursor(textarea, button.dataset.emoji || '');
                    closeEmojiPicker();
                });
            });
        }

        attachButton?.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0] || null;
            if (file) selectAttachment(file);
        });
        emojiButton?.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleEmojiPicker();
        });
        picker.addEventListener('click', (event) => event.stopPropagation());
        document.addEventListener('click', closeEmojiPicker);
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeEmojiPicker();
        });

        renderPendingAttachment();
    }

    function downloadAttachment(message) {
        const dataUrl = String(message?.attachment_data || '');
        if (!dataUrl.startsWith('data:') || !dataUrl.includes(',')) {
            window.showToast?.('O arquivo desta mensagem não está disponível.', 'error');
            return;
        }
        try {
            const commaIndex = dataUrl.indexOf(',');
            const metadata = dataUrl.slice(0, commaIndex);
            const encoded = dataUrl.slice(commaIndex + 1);
            const mimeMatch = metadata.match(/^data:([^;]+)/i);
            const mime = message?.attachment_type || mimeMatch?.[1] || 'application/octet-stream';
            const binary = atob(encoded);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = String(message?.attachment_name || 'arquivo');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        } catch (error) {
            console.error('Erro ao baixar anexo:', error);
            window.showToast?.('Não foi possível abrir o arquivo anexado.', 'error');
        }
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

        const pendingTarget=normalizeEmail(sessionStorage.getItem('condomitChatTargetEmail')||'');
        if(pendingTarget && state.contacts.some(item=>normalizeEmail(item.email)===pendingTarget)){
            sessionStorage.removeItem('condomitChatTargetEmail');
            await openConversation(pendingTarget);
            return;
        }

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
        if (state.activeEmail && state.activeEmail !== normalized) clearPendingAttachment();
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

        const messageById = new Map();
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
                const text = String(message?.message || '').trim();
                const hasAttachment = Boolean(message?.attachment_data && message?.attachment_name);
                if (hasAttachment) messageById.set(String(message.id), message);
                const attachmentMarkup = hasAttachment ? `
                    <button type="button" class="message-attachment" data-chat-download="${escapeHtml(String(message.id))}" title="Baixar ${escapeHtml(message.attachment_name)}">
                        <span class="message-attachment-icon"><i class="fas fa-file-arrow-down"></i></span>
                        <span class="message-attachment-info">
                            <strong>${escapeHtml(message.attachment_name)}</strong>
                            <small>${escapeHtml(formatBytes(message.attachment_size))}</small>
                        </span>
                        <i class="fas fa-download message-attachment-download"></i>
                    </button>` : '';
                return `
                    <div class="message ${mine ? 'mine' : ''}">
                        <div class="message-avatar-sm ${mine ? 'mine' : ''}" style="overflow:hidden;">${avatar}</div>
                        <div class="message-body">
                            ${text ? `<div class="message-bubble">${escapeHtml(text)}</div>` : ''}
                            ${attachmentMarkup}
                            <div class="message-time">${escapeHtml(time)}${mine ? ' <i class="fas fa-check-double"></i>' : ''}</div>
                        </div>
                    </div>`;
            }).join('')}
        `;

        container.querySelectorAll('[data-chat-download]').forEach((button) => {
            button.addEventListener('click', () => {
                const message = messageById.get(String(button.dataset.chatDownload || ''));
                if (message) downloadAttachment(message);
            });
        });
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
        const attachment = state.pendingAttachment;
        if (!text && !attachment) return;

        state.sending = true;
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
        try {
            await rpc('condomit_chat_send_message', {
                other_email: state.activeEmail,
                message_text: text,
                attachment_name: attachment?.name || null,
                attachment_type: attachment?.type || null,
                attachment_data: attachment?.data || null,
                attachment_size: attachment?.size || null
            });
            if (input) input.value = '';
            clearPendingAttachment();
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


    function callActiveContact() {
        const contact = state.activeContact;
        if (!contact) {
            window.showToast?.('Selecione uma conversa antes de ligar.', 'warning');
            return;
        }
        const rawPhone = String(contact.phone || '').trim();
        const digits = rawPhone.replace(/\D/g, '');
        if (digits.length < 8) {
            window.showToast?.('Este usuário não possui telefone cadastrado.', 'warning');
            return;
        }
        const telValue = rawPhone.startsWith('+') ? `+${digits}` : digits;
        window.location.href = `tel:${telValue}`;
    }

    function bindControls() {
        ensureChatComposerTools();
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

        document.querySelectorAll('.chat-header-actions [title="Ligar"]').forEach((button) => {
            button.addEventListener('click', callActiveContact);
        });
    }


    async function logout() {
        stopPolling();
        clearPendingAttachment();
        if (typeof window.performFullLogout === 'function') {
            await window.performFullLogout();
            return;
        }
        try { sessionStorage.clear(); } catch (_) {}
        try {
            localStorage.removeItem('condominiumPersistentUser');
            Object.keys(localStorage).forEach((key) => {
                if (/^sb-.*-auth-token$/i.test(key)) localStorage.removeItem(key);
            });
        } catch (_) {}
        window.location.href = '../inicio.html';
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

    window.logout = logout;
    window.CondomitChat = { init, refreshMessages, loadContacts, logout };
})();
