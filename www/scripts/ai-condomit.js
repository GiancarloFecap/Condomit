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
            input.style.height = `${Math.min(input.scrollHeight, 190)}px`;
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
        const answer = await buildAnswer(message);
        addMessage('ai', answer.text, answer.actions || []);
    }

    async function buildAnswer(question) {
        const q = normalize(question);
        const role = normalizeRole(state.user);
        const condo = condoName(state.user);
        const isPorter = role === 'porteiro';
        const isSindico = role === 'sindico';

        // 027 - Copiloto do síndico: responde com dados reais do condomínio.
        if (isSindico && includesAny(q, ['resumo do condominio', 'resumo do condomínio', 'painel', 'indicadores', 'como esta o condominio', 'como está o condomínio'])) {
            const summary = await buildManagementSummary();
            if (summary) return summary;
        }
        if (isSindico && includesAny(q, ['manutencao atrasada', 'manutencoes atrasadas', 'manutenção atrasada', 'manutenções atrasadas'])) {
            const data = await getOperationalRows('maintenance_items', 'title,next_date,status', 'status=neq.concluida&order=next_date.asc&limit=20');
            const overdue = data.filter((item) => item.next_date && new Date(item.next_date) < new Date());
            return { text: overdue.length ? `Existem ${overdue.length} manutenções atrasadas. As primeiras são: ${overdue.slice(0, 5).map((item) => `${item.title} (${formatAiDate(item.next_date)})`).join('; ')}.` : 'Não encontrei manutenções preventivas atrasadas neste momento.', actions: [{ label: 'Abrir Manutenção Preventiva', href: 'manutencao-preventiva.html', icon: 'fa-screwdriver-wrench' }] };
        }
        if (isSindico && includesAny(q, ['chamados abertos', 'tickets abertos', 'sla'])) {
            const data = await getOperationalRows('service_tickets', 'id,title,status,sla_due_at', 'order=created_at.desc&limit=100');
            const open = data.filter((item) => !['resolvido','cancelado'].includes(item.status));
            const late = open.filter((item) => item.sla_due_at && new Date(item.sla_due_at) < new Date());
            return { text: `Há ${open.length} chamado(s) aberto(s), sendo ${late.length} fora do prazo de SLA.`, actions: [{ label: 'Abrir Gestão Avançada', href: 'gestao-avancada.html', icon: 'fa-headset' }] };
        }
        if (isSindico && includesAny(q, ['gere um comunicado', 'gerar comunicado', 'crie um comunicado', 'criar comunicado'])) {
            const raw=String(question||'').trim();
            const topic=raw.replace(/^(por favor,?\s*)?(gere|gerar|crie|criar)\s+(um\s+)?comunicado\s*(sobre|a respeito de|para)?\s*/i,'').trim() || 'uma atualização importante do condomínio';
            return {
                text: `Sugestão de comunicado:\n\nPrezados moradores,\n\nInformamos ${topic}. Pedimos que acompanhem as orientações publicadas no Condomit e, em caso de dúvidas, entrem em contato com a administração.\n\nAtenciosamente,\nAdministração do condomínio.`,
                actions: [
                    { label: 'Abrir IA de Comunicados', href: 'ai-comunicados.html', icon: 'fa-wand-magic-sparkles' },
                    { label: 'Abrir Mural de Avisos', href: 'mural-avisos.html', icon: 'fa-bullhorn' }
                ]
            };
        }

        // 027 - RAG local simples: pesquisa os documentos cadastrados no próprio condomínio.
        const documentAnswer = await answerFromCondominiumDocuments(question);
        if (documentAnswer) return documentAnswer;

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


    async function getAiCep() {
        try {
            if (typeof window.supabaseFetch === 'function') {
                const value = await window.supabaseFetch('/rpc/condomit_current_user_cep', { method: 'POST', body: '{}' });
                if (typeof value === 'string' && value) return value;
            }
        } catch (_) {}
        const condo = state.user?.condominium && typeof state.user.condominium === 'object' ? state.user.condominium : {};
        return String(condo.cep || condo.condominium_id || '').replace(/\D/g, '');
    }

    async function getOperationalRows(table, select, extra = '') {
        try {
            if (typeof window.supabaseFetch !== 'function') return [];
            const cep = await getAiCep();
            if (!cep) return [];
            const suffix = extra ? `&${extra}` : '';
            const rows = await window.supabaseFetch(`/${table}?select=${encodeURIComponent(select)}&cep=eq.${encodeURIComponent(cep)}${suffix}`);
            return Array.isArray(rows) ? rows : [];
        } catch (_) { return []; }
    }

    async function answerFromCondominiumDocuments(question) {
        try {
            const docs = await getOperationalRows('condominium_documents', 'id,title,category,description,content,file_url,version,visibility,updated_at', 'order=updated_at.desc&limit=150');
            if (!docs.length) return null;
            const terms = normalize(question).split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !['qual','quais','como','onde','quando','sobre','para','isso','essa','este','esta','condominio','condomínio'].includes(term));
            if (!terms.length) return null;
            const scored = docs.map((doc) => {
                const hay = normalize(`${doc.title} ${doc.category} ${doc.description} ${doc.content}`);
                const score = terms.reduce((sum, term) => sum + (hay.includes(term) ? (normalize(doc.title).includes(term) ? 3 : 1) : 0), 0);
                return { doc, score };
            }).filter((entry) => entry.score > 0).sort((a,b) => b.score - a.score);
            if (!scored.length || scored[0].score < 2) return null;
            const best = scored[0].doc;
            const sourceText = String(best.content || best.description || '').trim();
            const excerpt = sourceText ? sourceText.slice(0, 650) : 'O documento foi localizado, mas ainda não possui conteúdo textual cadastrado para consulta.';
            return {
                text: `Encontrei essa informação na Central de Documentos, em “${best.title}” (versão ${best.version || 1}): ${excerpt}${sourceText.length > 650 ? '…' : ''}`,
                actions: [
                    { label: 'Abrir Central de Documentos', href: 'gestao-avancada.html', icon: 'fa-folder-open' },
                    ...(best.file_url ? [{ label: 'Abrir arquivo', href: best.file_url, icon: 'fa-arrow-up-right-from-square' }] : [])
                ]
            };
        } catch (_) { return null; }
    }

    async function buildManagementSummary() {
        try {
            const [tickets, maintenance, alerts, finance] = await Promise.all([
                getOperationalRows('service_tickets', 'id,status,sla_due_at', 'limit=500'),
                getOperationalRows('maintenance_items', 'id,status,next_date', 'limit=500'),
                getOperationalRows('emergency_alerts', 'id,active', 'limit=100'),
                getOperationalRows('financial_entries', 'entry_type,amount,status', 'limit=1000')
            ]);
            const openTickets = tickets.filter((x) => !['resolvido','cancelado'].includes(x.status));
            const lateTickets = openTickets.filter((x) => x.sla_due_at && new Date(x.sla_due_at) < new Date());
            const pendingMaintenance = maintenance.filter((x) => x.status !== 'concluida');
            const lateMaintenance = pendingMaintenance.filter((x) => x.next_date && new Date(x.next_date) < new Date());
            const emergencies = alerts.filter((x) => x.active).length;
            const balance = finance.reduce((sum, x) => sum + (x.entry_type === 'receita' ? 1 : -1) * Number(x.amount || 0), 0);
            return {
                text: `Resumo atual: ${openTickets.length} chamado(s) aberto(s) (${lateTickets.length} fora do SLA), ${pendingMaintenance.length} manutenção(ões) pendente(s) (${lateMaintenance.length} atrasada(s)), ${emergencies} alerta(s) de emergência ativo(s) e saldo registrado de ${balance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`,
                actions: [{ label: 'Abrir Gestão Avançada', href: 'gestao-avancada.html', icon: 'fa-chart-line' }]
            };
        } catch (_) { return null; }
    }

    function formatAiDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value || '--') : date.toLocaleDateString('pt-BR');
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
