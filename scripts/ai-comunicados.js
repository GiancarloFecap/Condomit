(function () {
    const TEMPLATES = {
        manutencao: {
            title: 'Aviso de Manutenção Programada',
            content: (data) =>
`Prezados(as) moradores(as),

Gostaríamos de informar sobre a manutenção programada para melhorias e segurança do nosso condomínio.

📅 Data: ${data.data || 'a definir'}
⏰ Horário: ${data.horario || 'a definir'}
📍 Local: ${data.local || 'a definir'}
🏢 Bloco(s) afetado(s): ${data.blocos || 'a definir'}

Durante o período, poderá haver interrupção temporária de alguns serviços. Pedimos a gentileza de se programarem e utilizarem as rotas alternativas quando necessário.

Agradecemos pela compreensão e colaboração de todos!

Atenciosamente,
Administração do Condomínio.`
        },
        festa: {
            title: 'Convite para Evento do Condomínio',
            content: (data) =>
`Olá, família!

É com alegria que convidamos todos para o evento do condomínio. Vamos celebrar juntos!

📅 Data: ${data.data || 'a definir'}
⏰ Horário: ${data.horario || 'a definir'}
📍 Local: ${data.local || 'Salão de Festas'}

✨ Programação:
• Recepção e coquetel
• Atividades para crianças
• Música e confraternização

Contamos com a sua presença! Por favor, confirme presença até ${data.rsvp || 'o dia anterior'}.

Esperamos por todos vocês! 🥳

Atenciosamente,
Comissão de Eventos.`
        },
        regra: {
            title: 'Atualização nas Normas do Condomínio',
            content: (data) =>
`Prezados(as) moradores(as),

Informamos que houve atualização nas normas internas do condomínio. A medida visa garantir melhor convivência e segurança para todos.

Principais pontos atualizados:

${data.pontos || '• Horário de silêncio das 22h às 7h\n• Regras para uso das áreas comuns\n• Procedimentos de visitação'}

Sugerimos a leitura atenta para evitar inconvenientes. O documento completo está disponível na área do morador ou na portaria.

Contamos com a colaboração de todos para manter nosso condomínio um lugar melhor!

Atenciosamente,
Corpo Diretivo.`
        },
        urgente: {
            title: '⚠️ Aviso Urgente - Ação Necessária',
            content: (data) =>
`Prezados(as) moradores(as),

⚠️ COMUNICADO URGENTE ⚠️

${data.assunto || 'Informação importante para todos os moradores.'}

Pedimos a gentileza de lerem atentamente e seguirem as orientações abaixo:

${data.orientacoes || '• Orientações detalhadas estarão disponíveis em breve.\n• Para dúvidas, entre em contato com a portaria ou síndico.'}

Prazo para ação: ${data.prazo || 'até a data informada'}

Qualquer dúvida, estamos à disposição.

Atenciosamente,
Administração do Condomínio.`
        },
        geral: {
            title: 'Comunicado do Condomínio',
            content: (data) =>
`Prezados(as) moradores(as),

${data.assunto || 'A administração do condomínio vem por meio deste comunicar.'}

Detalhes importantes:
${data.detalhes || '• As informações relevantes serão compartilhadas com todos os moradores.\n• Qualquer dúvida, a administração está à disposição.'}

Contamos com a atenção de todos!

Atenciosamente,
Administração.`
        }
    };

    const state = {
        currentUser: null,
        userType: 'sindico',
        history: []
    };

    function getStorageKey() {
        const base = state.currentUser?.email || state.currentUser?.cpf || 'user';
        return `condomit.ai.comunicados.${base}`;
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

    function formatDate(d) {
        const date = new Date(d);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function classifyPrompt(text) {
        const t = text.toLowerCase();
        if (t.includes('urgente') || t.includes('emergên') || t.includes('imediat')) return 'urgente';
        if (t.includes('manutenção') || t.includes('manutencao') || t.includes('elevador') || t.includes('obra') || t.includes('reforma') || t.includes('água') || t.includes('energia') || t.includes('luz') || t.includes('gás')) return 'manutencao';
        if (t.includes('festa') || t.includes('evento') || t.includes('confraterniza') || t.includes('churrasco') || t.includes('reunião') || t.includes('reuniao') || t.includes('aniversário') || t.includes('aniversario')) return 'festa';
        if (t.includes('regra') || t.includes('norma') || t.includes('regulamento') || t.includes('silêncio') || t.includes('silencio') || t.includes('multa')) return 'regra';
        return 'geral';
    }

    function extractData(text, kind) {
        const data = {};
        const reData = /(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)/;
        const matchData = text.match(reData);
        if (matchData) data.data = matchData[1];
        const reHorario = /(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})/i;
        const matchH = text.match(reHorario);
        if (matchH) data.horario = matchH[1];
        if (kind === 'manutencao') {
            if (/bloco\s*[abc\d]/i.test(text)) {
                const b = text.match(/bloco\s*([a-e\d]+(?:\s*e\s*[a-e\d]+)?)/i);
                if (b) data.blocos = b[0];
            }
            if (/elevador|portaria|piscina|salão|salao|garagem|hall/i.test(text)) {
                const places = [];
                if (/elevador/i.test(text)) places.push('Elevador');
                if (/portaria/i.test(text)) places.push('Portaria');
                if (/piscina/i.test(text)) places.push('Piscina');
                if (/salão|salao/i.test(text)) places.push('Salão de Festas');
                if (/garagem/i.test(text)) places.push('Garagem');
                if (/hall/i.test(text)) places.push('Hall de Entrada');
                if (places.length) data.local = places.join(', ');
            }
        }
        if (kind === 'festa') {
            if (/salão|salao|churrasqueira|piscina|quadra/i.test(text)) {
                if (/salão|salao/i.test(text)) data.local = 'Salão de Festas';
                else if (/churrasqueira/i.test(text)) data.local = 'Churrasqueira';
                else if (/piscina/i.test(text)) data.local = 'Área da Piscina';
                else if (/quadra/i.test(text)) data.local = 'Quadra Poliesportiva';
            }
        }
        if (kind === 'urgente') {
            data.assunto = text;
            data.orientacoes = text;
        }
        if (kind === 'geral') {
            data.assunto = text;
            data.detalhes = text;
        }
        if (kind === 'regra') {
            const lines = text.split(/[.;\n]/).filter(s => s.trim().length > 10).slice(0, 4);
            if (lines.length) data.pontos = lines.map(l => '• ' + l.trim()).join('\n');
        }
        if (text.includes('confirm') || text.includes('presença') || text.includes('presenca')) {
            const r = text.match(/até\s+(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)/);
            data.rsvp = r ? r[1] : 'o dia anterior ao evento';
        }
        const prazo = text.match(/prazo.*?(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)/i);
        if (prazo) data.prazo = prazo[1];
        return data;
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

    function loadHistory() {
        try {
            const raw = localStorage.getItem(getStorageKey());
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }

    function saveHistory() {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(state.history));
        } catch (_) {}
    }

    function renderHistory() {
        const listEl = document.getElementById('historyList');
        if (!listEl) return;
        if (!state.history.length) {
            listEl.innerHTML = `
                <div class="history-empty">
                    <i class="fas fa-inbox" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.4;"></i>
                    Nenhum comunicado gerado ainda.
                </div>`;
            return;
        }
        listEl.innerHTML = state.history.slice(0, 8).map(item => `
            <div class="history-item" data-id="${item.id}" tabindex="0" role="button">
                <h4 class="history-title">${item.title}</h4>
                <div class="history-date">
                    <i class="far fa-clock"></i>
                    ${formatDate(item.createdAt)}
                </div>
            </div>
        `).join('');
        listEl.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const found = state.history.find(h => h.id === id);
                if (found) {
                    document.getElementById('resultTitle').textContent = found.title;
                    document.getElementById('resultContent').textContent = found.content;
                    document.getElementById('promptInput').value = found.prompt || '';
                    updateActionButtons(true);
                }
            });
        });
    }

    function updateCharCount() {
        const input = document.getElementById('promptInput');
        const count = document.getElementById('promptCharCount');
        if (input && count) {
            const len = input.value.length;
            count.textContent = `${len}/500`;
            count.style.color = len > 480 ? '#dc2626' : '';
        }
    }

    function updateActionButtons(enabled) {
        ['refineBtn', 'copyBtn', 'sendBtn'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.disabled = !enabled;
        });
    }

    function setGeneratingUI(isGenerating, btn) {
        if (isGenerating) {
            btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Gerando...';
            btn.disabled = true;
            document.getElementById('resultTitle').textContent = 'A IA está escrevendo o comunicado...';
            document.getElementById('resultContent').textContent = 'Aguarde um momento enquanto processamos o seu pedido.';
            document.getElementById('step2Badge').className = 'step-badge';
        } else {
            btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
            btn.disabled = false;
            document.getElementById('step2Badge').className = 'step-badge success';
        }
    }

    function generateComunicado() {
        const input = document.getElementById('promptInput');
        const btn = document.getElementById('generateBtn');
        const text = input?.value.trim() || '';
        if (!text || text.length < 10) {
            if (typeof showToast === 'function') {
                showToast('Descreva o comunicado com pelo menos 10 caracteres.', 'warning');
            } else {
                alert('Descreva o comunicado com pelo menos 10 caracteres.');
            }
            return;
        }

        setGeneratingUI(true, btn);

        setTimeout(() => {
            const kind = classifyPrompt(text);
            const template = TEMPLATES[kind] || TEMPLATES.geral;
            const data = extractData(text, kind);
            const title = template.title;
            const content = template.content(data);

            document.getElementById('resultTitle').textContent = title;
            document.getElementById('resultContent').textContent = content;

            const item = {
                id: `c-${Date.now()}`,
                prompt: text,
                title,
                content,
                kind,
                createdAt: new Date().toISOString()
            };
            state.history.unshift(item);
            saveHistory();
            renderHistory();
            updateActionButtons(true);
            setGeneratingUI(false, btn);

            if (typeof showToast === 'function') {
                showToast('Comunicado gerado com sucesso!', 'success');
            }
        }, 1600 + Math.random() * 600);
    }

    function refineComunicado() {
        const title = document.getElementById('resultTitle').textContent;
        const content = document.getElementById('resultContent').textContent;
        if (!content || content.length < 30) return;
        const btn = document.getElementById('refineBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Refinando...';
        setTimeout(() => {
            const refinedContent = content + '\n\nRefinamento: Caso não possa comparecer ou precise de mais informações, pedimos a gentileza de entrar em contato com a portaria ou com a administração. Estamos à disposição para quaisquer esclarecimentos necessários.';
            document.getElementById('resultContent').textContent = refinedContent;
            btn.disabled = false;
            btn.textContent = originalText;
            if (state.history.length) {
                state.history[0].content = refinedContent;
                saveHistory();
                renderHistory();
            }
            if (typeof showToast === 'function') {
                showToast('Texto refinado com sucesso!', 'success');
            }
        }, 1000);
    }

    function copyText() {
        const title = document.getElementById('resultTitle').textContent;
        const content = document.getElementById('resultContent').textContent;
        const full = `${title}\n\n${content}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(full).then(() => {
                if (typeof showToast === 'function') {
                    showToast('Texto copiado para a área de transferência!', 'success');
                }
            }).catch(() => fallbackCopy(full));
        } else {
            fallbackCopy(full);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
        if (typeof showToast === 'function') {
            showToast('Texto copiado!', 'success');
        }
    }

    async function sendComunicado() {
        const title = (document.getElementById('resultTitle').textContent || '').trim();
        const content = (document.getElementById('resultContent').textContent || '').trim();
        if (!title || !content || content.length < 20) {
            if (typeof showToast === 'function') {
                showToast('Gere um rascunho antes de enviar.', 'warning');
            }
            return;
        }

        const btn = document.getElementById('sendBtn');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Enviando...';

        let created = false;
        try {
            await new Promise((r) => setTimeout(r, 600));
            if (window.communityHub && typeof window.communityHub.createNotification === 'function') {
                const preview = content.length > 160 ? content.slice(0, 157) + '...' : content;
                await window.communityHub.createNotification({
                    category: 'Avisos',
                    title: title,
                    message: preview,
                    details: content,
                    metadata: { source: 'ai-comunicados', generatedAt: new Date().toISOString() }
                }, state.currentUser);
                created = true;
            }
        } catch (err) {
            console.warn('Falha ao criar notificacao:', err);
        }

        btn.innerHTML = originalText;
        btn.disabled = false;

        if (created) {
            document.getElementById('promptInput').value = '';
            updateCharCount();
            updateActionButtons(false);
            if (typeof showToast === 'function') {
                showToast('Comunicado enviado para o Mural de Avisos! Clique para abrir.', 'success');
                try {
                    const toastEl = document.querySelector('.toast, .toast-success, [class*="toast"]');
                    if (toastEl) {
                        toastEl.style.cursor = 'pointer';
                        toastEl.addEventListener('click', () => {
                            window.location.href = 'notificacoes.html';
                        }, { once: true });
                    }
                } catch (_) {}
            }
            setTimeout(() => {
                const open = window.confirm ? confirm('Comunicado publicado! Deseja abrir o Mural de Avisos para visualizar?') : false;
                if (open) window.location.href = 'notificacoes.html';
            }, 600);
        } else {
            if (typeof showToast === 'function') {
                showToast('Não foi possível publicar o comunicado. Tente novamente.', 'error');
            }
        }
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
                renderSidebar(currentUser, userType, window.location.pathname.split('/').pop() || 'ai-comunicados.html');
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

        state.history = loadHistory();
        renderHistory();

        const promptInput = document.getElementById('promptInput');
        if (promptInput) {
            promptInput.maxLength = 500;
            promptInput.addEventListener('input', updateCharCount);
        }
        updateCharCount();

        document.getElementById('generateBtn')?.addEventListener('click', generateComunicado);
        document.getElementById('refineBtn')?.addEventListener('click', refineComunicado);
        document.getElementById('copyBtn')?.addEventListener('click', copyText);
        document.getElementById('sendBtn')?.addEventListener('click', sendComunicado);

        updateActionButtons(false);
    });

    window.logout = function () {
        if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
        sessionStorage.removeItem('condominiumUser');
        try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
        window.location.href = '../inicio.html';
    };
})();
