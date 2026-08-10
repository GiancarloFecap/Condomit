(function () {
    'use strict';

    const state = { id: null, assembly: null, user: null, polls: [], options: [], results: [], comments: [] };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        state.id = Number.parseInt(new URLSearchParams(location.search).get('id') || '', 10);
        if (!Number.isInteger(state.id) || state.id <= 0) {
            renderFatal('ID da assembleia inválido.');
            return;
        }

        state.user = getStoredUser();
        if (!state.user) { location.href = 'entrar.html'; return; }
        syncUserHeader();
        bindTabs();
        bindCommentForm();

        try {
            await waitForAuthSession();
            await loadAll();
            renderAll();
        } catch (error) {
            console.error('[ASSEMBLY SUMMARY]', error);
            renderFatal(error.message || 'Não foi possível carregar a ata da assembleia.');
        }
    }

    function getStoredUser() {
        try { return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null'); } catch (_) { return null; }
    }

    async function waitForAuthSession() {
        if (typeof window.resolveSupabaseAccessToken !== 'function') return;
        for (let i = 0; i < 20; i += 1) {
            const token = await window.resolveSupabaseAccessToken().catch(() => null);
            if (token) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    function syncUserHeader() {
        const name = state.user?.name || 'Usuário';
        const type = String(state.user?.type || state.user?.user_type || 'morador').toLowerCase();
        setText('profileNameTop', name);
        setText('profileTypeTop', type.startsWith('sind') ? 'Síndico' : type.startsWith('porteir') ? 'Porteiro' : 'Morador');
        setText('profileAvatarTop', initials(name));
        window.syncAllAvatars?.(state.user);
    }

    async function loadAll() {
        if (typeof window.supabaseFetch !== 'function') throw new Error('Supabase não inicializado.');
        const [assemblyRows, attendance, chat, polls, agenda, hands, events, comments] = await Promise.all([
            fetchRows(`/scheduled_assemblies?select=*&id=eq.${state.id}&limit=1`),
            fetchRows(`/assembly_attendance?select=*&assembly_id=eq.${state.id}&order=joined_at.asc`),
            fetchRows(`/assembly_chat_messages?select=*&assembly_id=eq.${state.id}&order=created_at.asc`),
            fetchRows(`/assembly_polls?select=*&assembly_id=eq.${state.id}&order=created_at.asc`),
            fetchRows(`/assembly_agenda_items?select=*&assembly_id=eq.${state.id}&order=display_order.asc`),
            fetchRows(`/assembly_speaking_requests?select=*&assembly_id=eq.${state.id}&order=requested_at.asc`),
            fetchRows(`/assembly_event_logs?select=*&assembly_id=eq.${state.id}&order=created_at.asc`).catch(() => []),
            fetchRows(`/assembly_post_comments?select=*&assembly_id=eq.${state.id}&order=created_at.asc`).catch(() => [])
        ]);

        state.assembly = assemblyRows[0] || null;
        if (!state.assembly) throw new Error('Assembleia não encontrada ou sem acesso.');
        state.attendance = attendance;
        state.chat = chat;
        state.polls = polls;
        state.agenda = agenda;
        state.hands = hands;
        state.events = events;
        state.comments = comments;

        const pollIds = polls.map((p) => p.id).filter(Boolean);
        state.options = pollIds.length
            ? await fetchRows(`/assembly_poll_options?select=*&poll_id=in.(${pollIds.join(',')})&order=display_order.asc`)
            : [];

        try {
            const rpc = await window.supabaseFetch('/rpc/condomit_assembly_poll_results', {
                method: 'POST',
                body: JSON.stringify({ target_assembly_id: state.id })
            });
            state.results = Array.isArray(rpc) ? rpc : [];
        } catch (error) {
            console.warn('Resultados agregados indisponíveis, tentando leitura direta.', error);
            const votes = pollIds.length
                ? await fetchRows(`/assembly_votes?select=poll_id,option_id&poll_id=in.(${pollIds.join(',')})`).catch(() => [])
                : [];
            const map = new Map();
            votes.forEach((v) => {
                const key = `${v.poll_id}:${v.option_id}`;
                map.set(key, (map.get(key) || 0) + 1);
            });
            state.results = state.options.map((o) => ({ poll_id: o.poll_id, option_id: o.id, vote_count: map.get(`${o.poll_id}:${o.id}`) || 0 }));
        }
    }

    async function fetchRows(path) {
        const data = await window.supabaseFetch(path);
        return Array.isArray(data) ? data : (data ? [data] : []);
    }

    function renderAll() {
        renderHero();
        renderMinutes();
        renderPolls();
        renderComments();
    }

    function renderHero() {
        const a = state.assembly;
        const hero = document.getElementById('assemblySummaryHero');
        if (!hero) return;
        hero.innerHTML = `
            <div><span class="summary-chip"><i class="fas fa-file-signature"></i> Assembleia realizada</span></div>
            <h2>${esc(a.title || 'Assembleia')}</h2>
            <div class="summary-hero-meta">
                <span><i class="far fa-calendar"></i> ${formatDate(a.date)}</span>
                <span><i class="far fa-clock"></i> ${esc(String(a.start_time || '--:--').slice(0,5))}${a.end_time ? ` – ${esc(String(a.end_time).slice(0,5))}` : ''}</span>
                <span><i class="fas fa-users"></i> ${state.attendance.length} participante${state.attendance.length === 1 ? '' : 's'} registrado${state.attendance.length === 1 ? '' : 's'}</span>
                <span><i class="fas fa-check-circle"></i> ${esc(statusLabel(a.status))}</span>
            </div>
        `;
    }

    function renderMinutes() {
        const container = document.getElementById('assemblyMinutes');
        if (!container) return;

        const a = state.assembly;
        const events = [];
        const push = (time, title, text, priority = 0) => events.push({ time, title, text, priority });

        push(combineDateTime(a.date, a.start_time), 'Abertura prevista', `Assembleia “${a.title || 'Assembleia'}” programada para início às ${String(a.start_time || '--:--').slice(0,5)}.`, -10);

        state.attendance.forEach((row) => {
            push(row.joined_at, 'Entrada de participante', `${row.participant_name || row.user_email} (${roleLabel(row.participant_role)}) registrou presença.`);
            if (row.left_at) push(row.left_at, 'Saída de participante', `${row.participant_name || row.user_email} encerrou sua presença.`);
        });

        state.agenda.forEach((item) => {
            push(item.created_at || combineDateTime(a.date, a.start_time), 'Pauta registrada', `${item.title || 'Pauta'}${item.description ? ` — ${item.description}` : ''}`);
        });

        state.chat.forEach((message) => {
            push(message.created_at, `Chat — ${message.participant_name || message.user_email || 'Participante'}`, message.message || '');
        });

        state.hands.forEach((request) => {
            const status = String(request.status || '').toLowerCase();
            const action = status === 'autorizado' ? 'teve a fala autorizada' : status === 'recusado' ? 'teve a solicitação recusada' : status === 'finalizado' ? 'finalizou a solicitação de fala' : 'solicitou a palavra';
            push(request.requested_at || request.created_at, 'Solicitação de fala', `${request.participant_name || request.user_email || 'Participante'} ${action}.`);
        });

        state.polls.forEach((poll) => {
            const options = state.options.filter((o) => String(o.poll_id) === String(poll.id));
            const totals = options.map((o) => `${o.option_text || 'Opção'}: ${getVoteCount(poll.id, o.id)}`).join('; ');
            push(poll.created_at, `Votação — ${poll.title || 'Votação'}`, `${poll.description || 'Sem descrição.'}${totals ? ` Resultado: ${totals}.` : ''}`);
        });

        state.events.forEach((event) => {
            const type = String(event.event_type || 'evento').replaceAll('_', ' ');
            if (!type.startsWith('presence ')) push(event.created_at, 'Evento da assembleia', type);
        });

        state.comments.forEach((comment) => {
            push(comment.created_at, `Comentário — ${comment.participant_name || comment.user_email}`, comment.comment || '', 10);
        });

        events.sort((x, y) => safeTime(x.time) - safeTime(y.time) || x.priority - y.priority);

        const participants = state.attendance.map((r) => `${r.participant_name || r.user_email} (${roleLabel(r.participant_role)})`);
        const intro = `<div class="minutes-intro"><strong>Ata consolidada.</strong> ${a.description ? esc(a.description) : 'A assembleia foi registrada pelo Condomit.'}${participants.length ? `<br><strong>Participantes registrados:</strong> ${participants.map(esc).join(', ')}.` : ''}</div>`;
        const notice = `<div class="minutes-notice"><i class="fas fa-microphone-lines"></i> O projeto atual não armazena transcrição automática do áudio. Por isso, a ata consegue reproduzir chat, presença, pautas, votações, solicitações de fala e comentários persistidos no banco; falas feitas apenas pelo microfone não podem ser reconstruídas palavra por palavra.</div>`;

        container.innerHTML = intro + notice + (events.length
            ? `<div class="minutes-timeline">${events.map((event) => `<article class="minute-event"><time class="minute-time">${formatTime(event.time)}</time><div class="minute-card"><strong>${esc(event.title)}</strong><p>${esc(event.text)}</p></div></article>`).join('')}</div>`
            : '<div class="summary-empty">Nenhum evento persistido foi encontrado.</div>');
    }

    function renderPolls() {
        const container = document.getElementById('assemblyPollResults');
        if (!container) return;
        if (!state.polls.length) { container.innerHTML = '<div class="summary-empty">Nenhuma votação foi criada nesta assembleia.</div>'; return; }

        container.innerHTML = state.polls.map((poll) => {
            const options = state.options.filter((o) => String(o.poll_id) === String(poll.id));
            const total = options.reduce((sum, o) => sum + getVoteCount(poll.id, o.id), 0);
            return `<article class="poll-result-card"><h3>${esc(poll.title || 'Votação')}</h3><p class="poll-description">${esc(poll.description || 'Sem descrição.')}</p>${options.length ? options.map((option) => {
                const count = getVoteCount(poll.id, option.id);
                const pct = total ? Math.round(count / total * 100) : 0;
                return `<div class="poll-option-result"><span class="poll-option-label">${esc(option.option_text || 'Opção')}</span><div class="poll-result-bar"><div class="poll-result-fill" style="width:${pct}%"></div></div><span class="poll-count">${count} voto${count === 1 ? '' : 's'} · ${pct}%</span></div>`;
            }).join('') : '<div class="summary-empty">Sem opções registradas.</div>'}<div class="poll-total">Total de votos registrados: ${total}</div></article>`;
        }).join('');
    }

    function renderComments() {
        const container = document.getElementById('assemblyPostComments');
        if (!container) return;
        container.innerHTML = state.comments.length
            ? state.comments.map((comment) => `<article class="comment-card"><div class="comment-head"><strong>${esc(comment.participant_name || comment.user_email || 'Usuário')}</strong><time>${formatDateTime(comment.created_at)}</time></div><p>${esc(comment.comment || '')}</p></article>`).join('')
            : '<div class="summary-empty">Nenhum comentário publicado.</div>';
    }

    function bindTabs() {
        document.querySelectorAll('[data-summary-tab]').forEach((button) => button.addEventListener('click', () => {
            const target = button.dataset.summaryTab;
            document.querySelectorAll('[data-summary-tab]').forEach((b) => b.classList.toggle('active', b === button));
            document.querySelectorAll('[data-summary-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.summaryPanel === target));
        }));
    }

    function bindCommentForm() {
        document.getElementById('postAssemblyCommentForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const textarea = document.getElementById('postAssemblyComment');
            const comment = String(textarea?.value || '').trim();
            if (!comment || !state.assembly) return;
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            if (submit) submit.disabled = true;
            try {
                const email = String(state.user?.email || '').trim().toLowerCase();
                const rows = await window.supabaseFetch('/assembly_post_comments', {
                    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ assembly_id: state.id, cep: state.assembly.cep, user_email: email, participant_name: state.user?.name || email, comment })
                });
                const saved = Array.isArray(rows) ? rows[0] : rows;
                if (!saved) throw new Error('O comentário não foi confirmado pelo banco.');
                state.comments.push(saved);
                if (textarea) textarea.value = '';
                renderComments();
                renderMinutes();
                window.showToast?.('Comentário publicado.', 'success');
            } catch (error) {
                window.showToast?.(error.message || 'Erro ao publicar comentário.', 'error');
            } finally { if (submit) submit.disabled = false; }
        });
    }

    function getVoteCount(pollId, optionId) {
        const row = state.results.find((r) => String(r.poll_id) === String(pollId) && String(r.option_id) === String(optionId));
        return Number(row?.vote_count || 0);
    }

    function renderFatal(message) { const hero = document.getElementById('assemblySummaryHero'); if (hero) hero.innerHTML = `<div class="summary-empty"><i class="fas fa-circle-exclamation"></i><br>${esc(message)}</div>`; }
    function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
    function initials(name) { return String(name || 'US').split(/\s+/).filter(Boolean).map((x) => x[0]).join('').toUpperCase().slice(0,2) || 'US'; }
    function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
    function safeTime(v) { const t = new Date(v || 0).getTime(); return Number.isFinite(t) ? t : 0; }
    function formatDate(v) { if (!v) return '--'; const d = new Date(`${String(v).slice(0,10)}T12:00:00`); return d.toLocaleDateString('pt-BR'); }
    function formatTime(v) { if (!v) return '--:--'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v).slice(0,5) : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
    function formatDateTime(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? '--' : d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }
    function combineDateTime(date,time) { return date ? `${date}T${String(time || '00:00').slice(0,8)}` : null; }
    function roleLabel(role) { const r=String(role||'morador').toLowerCase(); return r.startsWith('sind')?'Síndico':r.startsWith('porteir')?'Porteiro':'Morador'; }
    function statusLabel(status) { const s=String(status||'').toLowerCase(); return s==='encerrada'?'Encerrada':s==='cancelada'?'Cancelada':s==='em_andamento'?'Em andamento':'Agendada'; }
})();
