(() => {
    'use strict';

    const state = { user: null, history: [] };
    const $ = (id) => document.getElementById(id);

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        state.user = getStoredUser();
        if (!state.user) {
            window.location.href = 'entrar.html';
            return;
        }

        if (typeof window.refreshCurrentUserFromDb === 'function') {
            try { state.user = await window.refreshCurrentUserFromDb() || state.user; } catch (_) {}
        }

        setupShell();
        bindEvents();
        resetConversation(false);
    }

    function getStoredUser() {
        try { return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null'); }
        catch (_) { return null; }
    }

    function normalizeRole(user) {
        const value = String(user?.user_type || user?.type || '').trim().toLowerCase();
        return value.includes('sind') ? 'sindico' : value.includes('porteir') ? 'porteiro' : 'morador';
    }

    function condoName(user) {
        const condo = user?.condominium && typeof user.condominium === 'object' ? user.condominium : {};
        return condo.name || condo.condominium_name || 'seu condomínio';
    }

    function setupShell() {
        const user = state.user;
        const role = normalizeRole(user);
        const userName = user?.name || 'Usuário';
        const firstName = userName.split(/\s+/)[0] || 'Usuário';
        const firstNameEl = $('firstName');
        const profileNameTop = $('profileNameTop');
        const profileAvatarTop = $('profileAvatarTop');
        const typeEl = document.querySelector('.user-info-small .type');
        const sidebarApartment = $('sidebarApartment');
        const sidebarSindico = $('sidebarSindico');
        const sidebarMorador = $('sidebarMorador');

        if (firstNameEl) firstNameEl.textContent = firstName;
        if (profileNameTop) profileNameTop.textContent = userName;
        if (profileAvatarTop) profileAvatarTop.textContent = initials(userName);
        if (typeEl) typeEl.textContent = role === 'sindico' ? 'Síndico' : role === 'porteiro' ? 'Porteiro' : 'Morador';
        if (sidebarSindico) sidebarSindico.style.display = role === 'sindico' ? 'block' : 'none';
        if (sidebarMorador) sidebarMorador.style.display = role === 'sindico' ? 'none' : 'block';

        const name = condoName(user);
        if (sidebarApartment) sidebarApartment.textContent = name;
        if ($('aiCondoContext')) $('aiCondoContext').textContent = `Contexto: ${name}`;
        window.syncAllAvatars?.(user);
    }

    function bindEvents() {
        const input = $('chatInput');
        $('sendBtn')?.addEventListener('click', sendMessage);
        $('newAiConversationBtn')?.addEventListener('click', () => resetConversation(true));

        input?.addEventListener('input', () => {
            updateCharCount();
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
        });
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        document.querySelectorAll('[data-question]').forEach((button) => {
            button.addEventListener('click', () => {
                if (!input) return;
                input.value = button.dataset.question || '';
                updateCharCount();
                sendMessage();
            });
        });
    }

    function resetConversation(showNotice) {
        state.history = [];
        const messages = $('chatMessages');
        const welcome = $('welcomeCard');
        if (messages) messages.innerHTML = '';
        if (welcome) welcome.style.display = '';
        const input = $('chatInput');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        updateCharCount();
        if (showNotice) window.showToast?.('Nova conversa iniciada.', 'success');
    }

    function updateCharCount() {
        const input = $('chatInput');
        const count = $('charCount');
        if (count) count.textContent = `${input?.value.length || 0}/700`;
    }

    async function sendMessage() {
        const input = $('chatInput');
        const message = String(input?.value || '').trim();
        if (!message) return;

        $('welcomeCard')?.style.setProperty('display', 'none');
        addMessage('user', message);
        input.value = '';
        input.style.height = 'auto';
        updateCharCount();
        showTyping();

        await new Promise((resolve) => setTimeout(resolve, 350));
        hideTyping();
        const answer = buildAnswer(message);
        addMessage('ai', answer.text, answer.actions || []);
    }

    function buildAnswer(question) {
        const q = normalize(question);
        const role = normalizeRole(state.user);
        const condo = condoName(state.user);
        const isPorter = role === 'porteiro';
        const isSindico = role === 'sindico';

        if (includesAny(q, ['reserva', 'churrasqueira', 'salao de festas', 'salao', 'area comum'])) {
            return {
                text: `Na Condomit, as reservas dos espaços cadastrados em ${condo} ficam na página Reserva de Locais. Você pode escolher o local, a data e um horário disponível. Também é possível consultar suas próprias reservas.`,
                actions: [{ label: 'Abrir Reserva de Locais', href: 'reservas.html', icon: 'fa-calendar-check' }]
            };
        }

        if (includesAny(q, ['visitante', 'visita', 'liberar entrada', 'liberacao'])) {
            if (isPorter) return {
                text: 'Como porteiro, você pode consultar os visitantes do condomínio, liberar ou revogar entradas e acompanhar os registros de acesso.',
                actions: [
                    { label: 'Liberação de visitantes', href: 'liberacao-visitantes.html', icon: 'fa-user-check' },
                    { label: 'Registro de entrada e saída', href: 'registro-entrada-saida.html', icon: 'fa-right-left' }
                ]
            };
            return {
                text: 'Você pode cadastrar um visitante em Configurações, na área Segurança e acesso. O cadastro fica vinculado ao seu condomínio para que a portaria possa consultá-lo.',
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-gear' }]
            };
        }

        if (includesAny(q, ['assembleia', 'votacao', 'votar', 'ata'])) {
            return {
                text: 'Na área de Assembleias você acompanha reuniões agendadas e realizadas. Durante a chamada é possível participar do chat, levantar a mão e votar. Depois do encerramento, a ata reúne os registros persistidos e as votações.',
                actions: [{ label: 'Abrir Assembleias', href: 'assembleia.html', icon: 'fa-users-rectangle' }]
            };
        }

        if (includesAny(q, ['notificacao', 'aviso', 'comunicado'])) {
            return {
                text: isSindico
                    ? 'Na página Mural de Avisos o síndico pode publicar comunicados permanentes para os moradores e acompanhar todo o histórico.'
                    : 'Na página Mural de Avisos você encontra todos os avisos permanentes publicados para o seu condomínio.',
                actions: [{ label: 'Abrir Mural de Avisos', href: 'mural-avisos.html', icon: 'fa-bullhorn' }]
            };
        }

        if (includesAny(q, ['sindico', 'falar com sindico', 'contato sindico'])) {
            return {
                text: isSindico ? 'Você está usando uma conta de síndico. Para conversar com moradores ou com a portaria, use as páginas de chat correspondentes.' : 'Use o Chat com Síndico para enviar mensagens diretamente ao síndico vinculado ao mesmo CEP do seu condomínio.',
                actions: [{ label: isSindico ? 'Chat com Moradores' : 'Chat com Síndico', href: isSindico ? 'chat-moradores.html' : 'chat-sindico.html', icon: 'fa-comments' }]
            };
        }

        if (includesAny(q, ['porteiro', 'portaria'])) {
            return {
                text: 'O Chat com Porteiro conecta você aos porteiros vinculados ao mesmo condomínio. Quando houver telefone cadastrado, o botão de ligação do chat também pode iniciar uma chamada telefônica.',
                actions: [{ label: 'Chat com Porteiro', href: 'chat-porteiro.html', icon: 'fa-door-open' }]
            };
        }

        if (includesAny(q, ['encomenda', 'entrega', 'pacote'])) {
            return {
                text: 'Em Configurações, na área Segurança e acesso, você pode registrar uma encomenda para a própria conta. As encomendas registradas ficam disponíveis na área de autorização de entregas.',
                actions: [{ label: 'Registrar encomenda', href: 'configuracoes.html#registrar-encomenda', icon: 'fa-box' }]
            };
        }

        if (includesAny(q, ['foto', 'perfil', 'avatar'])) {
            return {
                text: 'Abra Configurações e selecione Foto de perfil. Você pode enviar uma imagem, reposicioná-la e também resetar a foto para voltar ao avatar padrão.',
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-user-pen' }]
            };
        }

        if (includesAny(q, ['prestador', 'manutencao', 'servico'])) {
            return {
                text: isSindico || isPorter
                    ? 'A Condomit possui uma área para controle de prestadores, com consulta e cadastro dos serviços vinculados ao condomínio.'
                    : 'O controle de prestadores é administrado pela gestão e pela portaria do condomínio.',
                actions: (isSindico || isPorter) ? [{ label: 'Controle de Prestadores', href: 'controle-prestadores.html', icon: 'fa-screwdriver-wrench' }] : []
            };
        }

        if (includesAny(q, ['marketplace', 'anuncio', 'vender'])) {
            return {
                text: 'O Marketplace mostra anúncios dos moradores do mesmo condomínio. Você pode publicar itens, favoritar anúncios e gerenciar os seus próprios anúncios.',
                actions: [{ label: 'Abrir Marketplace', href: 'marketplace.html', icon: 'fa-store' }]
            };
        }

        return {
            text: `Posso orientar você sobre as áreas disponíveis na Condomit para ${condo}: reservas, visitantes, assembleias, notificações, chats, encomendas, perfil, marketplace e prestadores. Escreva o que você deseja fazer e eu indico o caminho dentro do sistema.`,
            actions: [{ label: 'Ir para o início', href: role === 'sindico' ? 'index.html' : role === 'porteiro' ? 'index-porteiro.html' : 'index-morador.html', icon: 'fa-house' }]
        };
    }

    function addMessage(type, text, actions = []) {
        const messages = $('chatMessages');
        if (!messages) return;
        const item = document.createElement('article');
        item.className = `message ${type}`;
        item.innerHTML = `
            <div class="message-avatar">${type === 'ai' ? '<i class="fas fa-sparkles"></i>' : escapeHtml(initials(state.user?.name || 'US'))}</div>
            <div class="message-content">
                <div class="message-bubble">${escapeHtml(text)}</div>
                ${actions.length ? `<div class="ai-message-actions">${actions.map((action) => `<a href="${escapeHtml(action.href)}" class="ai-action-link"><i class="fas ${escapeHtml(action.icon || 'fa-arrow-right')}"></i>${escapeHtml(action.label)}</a>`).join('')}</div>` : ''}
                <div class="message-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>`;
        messages.appendChild(item);
        state.history.push({ type, text, actions });
        messages.scrollTop = messages.scrollHeight;
    }

    function showTyping() {
        const messages = $('chatMessages');
        if (!messages || $('typingIndicator')) return;
        const item = document.createElement('article');
        item.className = 'message ai';
        item.id = 'typingIndicator';
        item.innerHTML = '<div class="message-avatar"><i class="fas fa-sparkles"></i></div><div class="message-content"><div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>';
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() { $('typingIndicator')?.remove(); }
    function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    function includesAny(value, terms) { return terms.some((term) => value.includes(term)); }
    function initials(name) { return String(name || 'US').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'US'; }
    function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

    window.logout = function logout() {
        if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
        sessionStorage.removeItem('condominiumUser');
        window.location.href = '../inicio.html';
    };
})();
