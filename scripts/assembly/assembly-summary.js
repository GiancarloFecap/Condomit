(function () {
    'use strict';

    const state = {
        id: null,
        assembly: null,
        user: null,
        attendance: [],
        chat: [],
        polls: [],
        options: [],
        results: [],
        agenda: [],
        hands: [],
        events: [],
        comments: [],
        transcripts: []
    };

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        state.id = Number.parseInt(new URLSearchParams(location.search).get('id') || '', 10);
        if (!Number.isInteger(state.id) || state.id <= 0) {
            renderFatal('ID da assembleia inválido.');
            return;
        }

        state.user = getStoredUser();
        if (!state.user) {
            location.href = 'entrar.html';
            return;
        }

        syncUserHeader();
        bindTabs();
        bindCommentForm();

        try {
            await waitForAuthSession();
            await loadAll();
            renderAll();
        } catch (error) {
            console.error('[ASSEMBLY SUMMARY]', error);
            renderFatal(error?.message || 'Não foi possível carregar a ata da assembleia.');
        }
    }

    function getStoredUser() {
        const sources = [];
        try { sources.push(sessionStorage.getItem('condominiumUser')); } catch (_) {}
        try { sources.push(localStorage.getItem('condominiumPersistentUser')); } catch (_) {}
        for (const raw of sources) {
            if (!raw) continue;
            try {
                const user = JSON.parse(raw);
                if (user && typeof user === 'object') return user;
            } catch (_) {}
        }
        return null;
    }

    function currentUserRole() {
        const role = String(state.user?.type || state.user?.user_type || 'morador').toLowerCase();
        if (role.startsWith('sind')) return 'sindico';
        if (role.startsWith('porteir')) return 'porteiro';
        return 'morador';
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
        setText('profileNameTop', name);
        setText('profileTypeTop', currentUserRole() === 'sindico' ? 'Síndico' : currentUserRole() === 'porteiro' ? 'Porteiro' : 'Morador');
        setText('profileAvatarTop', initials(name));
        window.syncAllAvatars?.(state.user);
    }

    async function loadAll() {
        if (typeof window.supabaseFetch !== 'function') throw new Error('Supabase não inicializado.');

        const [assemblyRows, attendance, chat, polls, agenda, hands, events, comments, transcripts] = await Promise.all([
            fetchRows(`/scheduled_assemblies?select=*&id=eq.${state.id}&limit=1`),
            fetchRows(`/assembly_attendance?select=*&assembly_id=eq.${state.id}&order=joined_at.asc`),
            fetchRows(`/assembly_chat_messages?select=*&assembly_id=eq.${state.id}&order=created_at.asc`),
            fetchRows(`/assembly_polls?select=*&assembly_id=eq.${state.id}&order=created_at.asc`),
            fetchRows(`/assembly_agenda_items?select=*&assembly_id=eq.${state.id}&order=display_order.asc`),
            fetchRows(`/assembly_speaking_requests?select=*&assembly_id=eq.${state.id}&order=requested_at.asc`),
            fetchRows(`/assembly_event_logs?select=*&assembly_id=eq.${state.id}&order=created_at.asc`).catch(() => []),
            fetchRows(`/assembly_post_comments?select=*&assembly_id=eq.${state.id}&order=created_at.asc`).catch(() => []),
            fetchRows(`/assembly_transcripts?select=*&assembly_id=eq.${state.id}&order=spoken_at.asc`).catch(() => [])
        ]);

        state.assembly = assemblyRows[0] || null;
        if (!state.assembly) throw new Error('Assembleia não encontrada ou sem acesso.');
        Object.assign(state, { attendance, chat, polls, agenda, hands, events, comments, transcripts });

        const pollIds = polls.map((poll) => poll.id).filter(Boolean);
        state.options = pollIds.length
            ? await fetchRows(`/assembly_poll_options?select=*&poll_id=in.(${pollIds.join(',')})&order=display_order.asc`)
            : [];
        await loadPollResults();
    }

    async function loadPollResults() {
        try {
            const rpc = await window.supabaseFetch('/rpc/condomit_assembly_poll_results', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_assembly_id: state.id })
            });
            state.results = Array.isArray(rpc) ? rpc : [];
        } catch (error) {
            console.warn('Resultados agregados indisponíveis:', error);
            state.results = [];
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
        const uniqueParticipants = new Set(state.attendance.map((row) => String(row.user_email || row.participant_name || row.id))).size;
        hero.innerHTML = `
            <div><span class="summary-chip"><i class="fas fa-file-signature"></i> Assembleia realizada</span></div>
            <h2>${esc(a.title || 'Assembleia')}</h2>
            <div class="summary-hero-meta">
                <span><i class="far fa-calendar"></i> ${formatDate(a.date)}</span>
                <span><i class="far fa-clock"></i> ${esc(String(a.start_time || '--:--').slice(0, 5))}${a.end_time ? ` – ${esc(String(a.end_time).slice(0, 5))}` : ''}</span>
                <span><i class="fas fa-users"></i> ${uniqueParticipants} participante${uniqueParticipants === 1 ? '' : 's'}</span>
                <span><i class="fas fa-check-circle"></i> ${esc(statusLabel(a.status))}</span>
                <span><i class="fas fa-microphone-lines"></i> ${state.transcripts.length} trecho${state.transcripts.length === 1 ? '' : 's'} transcrito${state.transcripts.length === 1 ? '' : 's'}</span>
            </div>
            ${currentUserRole() === 'sindico' ? '<div class="summary-hero-actions"><button type="button" id="generateAssemblyTasks027" class="summary-primary"><i class="fas fa-list-check"></i> Gerar tarefas das decisões</button></div>' : ''}`;
        hero.querySelector('#generateAssemblyTasks027')?.addEventListener('click', generateAssemblyDecisionTasks);
    }

    function renderMinutes() {
        const container = document.getElementById('assemblyMinutes');
        if (!container) return;

        const a = state.assembly;
        const events = [];
        const push = (time, title, text, priority = 0, kind = 'event') => events.push({ time, title, text, priority, kind });

        push(combineDateTime(a.date, a.start_time), 'Abertura prevista', `Assembleia “${a.title || 'Assembleia'}” programada para início às ${String(a.start_time || '--:--').slice(0, 5)}.`, -10);

        state.attendance.forEach((row) => {
            push(row.joined_at, 'Entrada de participante', `${row.participant_name || row.user_email} (${roleLabel(row.participant_role)}) registrou presença.`);
            if (row.left_at) push(row.left_at, 'Saída de participante', `${row.participant_name || row.user_email} encerrou sua presença.`);
        });

        state.agenda.forEach((item) => {
            push(item.created_at || combineDateTime(a.date, a.start_time), 'Pauta registrada', `${item.title || 'Pauta'}${item.description ? ` — ${item.description}` : ''}`);
        });

        state.transcripts.forEach((row) => {
            push(
                row.spoken_at || row.created_at,
                `Fala — ${row.participant_name || row.participant_email || 'Participante'}`,
                row.transcript || '',
                -2,
                'speech'
            );
        });

        state.chat.forEach((message) => {
            push(message.created_at, `Chat — ${message.participant_name || message.user_email || 'Participante'}`, message.message || '', 0, 'chat');
        });

        state.hands.forEach((request) => {
            const status = String(request.status || '').toLowerCase();
            const action = status === 'autorizado'
                ? 'teve a fala autorizada'
                : status === 'recusado'
                    ? 'teve a solicitação recusada'
                    : status === 'finalizado'
                        ? 'finalizou a solicitação de fala'
                        : 'solicitou a palavra';
            push(request.requested_at || request.created_at, 'Solicitação de fala', `${request.participant_name || request.user_email || 'Participante'} ${action}.`);
        });

        state.polls.forEach((poll) => {
            const options = state.options.filter((option) => String(option.poll_id) === String(poll.id));
            const totals = options.map((option) => `${option.option_text || 'Opção'}: ${getVoteCount(poll.id, option.id)}`).join('; ');
            push(poll.created_at, `Votação — ${poll.title || 'Votação'}`, `${poll.description || 'Sem descrição.'}${totals ? ` Resultado atual: ${totals}.` : ''}`, 1, 'poll');
        });

        state.events.forEach((event) => {
            const type = String(event.event_type || 'evento').replaceAll('_', ' ');
            if (!type.startsWith('presence ')) push(event.created_at, 'Evento da assembleia', type);
        });

        state.comments.forEach((comment) => {
            push(comment.created_at, `Comentário — ${comment.participant_name || comment.user_email || 'Usuário'}`, comment.comment || '', 10, 'comment');
        });

        events.sort((left, right) => safeTime(left.time) - safeTime(right.time) || left.priority - right.priority);

        const participants = [...new Set(state.attendance.map((row) => `${row.participant_name || row.user_email} (${roleLabel(row.participant_role)})`))];
        const intro = `<div class="minutes-intro"><strong>Ata consolidada.</strong> ${a.description ? esc(a.description) : 'A assembleia foi registrada pelo Condomit.'}${participants.length ? `<br><strong>Participantes registrados:</strong> ${participants.map(esc).join(', ')}.` : ''}</div>`;
        const transcriptionState = state.transcripts.length
            ? `<div class="minutes-transcription-ok"><i class="fas fa-microphone-lines"></i><div><strong>Transcrição automática registrada</strong><span>${state.transcripts.length} trecho${state.transcripts.length === 1 ? '' : 's'} de fala salvo${state.transcripts.length === 1 ? '' : 's'} durante a reunião.</span></div></div>`
            : `<div class="minutes-transcription-empty"><i class="fas fa-wave-square"></i><span>Nenhum trecho de fala transcrito foi registrado nesta assembleia.</span></div>`;

        const decisionRows = state.polls.map((poll) => {
            const opts = state.options.filter(option => String(option.poll_id) === String(poll.id));
            if (!opts.length) return null;
            const ranked = opts.map(option => ({ option, votes: getVoteCount(poll.id, option.id) })).sort((a,b) => b.votes - a.votes);
            const winner = ranked[0];
            return winner ? `<li><strong>${esc(poll.title || 'Votação')}:</strong> ${esc(winner.option.option_text || 'Opção')} (${winner.votes} voto${winner.votes === 1 ? '' : 's'})</li>` : null;
        }).filter(Boolean);
        const decisions = decisionRows.length ? `<div class="minutes-decisions"><strong>Decisões em destaque</strong><ul>${decisionRows.join('')}</ul></div>` : '';

        container.innerHTML = intro + transcriptionState + decisions + (events.length
            ? `<div class="minutes-timeline">${events.map((event) => `<article class="minute-event ${event.kind === 'speech' ? 'speech-event' : ''}"><time class="minute-time">${formatTime(event.time)}</time><div class="minute-card"><strong>${esc(event.title)}</strong><p>${esc(event.text)}</p></div></article>`).join('')}</div>`
            : '<div class="summary-empty">Nenhum evento persistido foi encontrado.</div>');
    }

    function pollCurrentUserVoted(pollId) {
        return state.results.some((row) => String(row.poll_id) === String(pollId) && row.current_user_voted === true);
    }

    function canVoteFromSummary(poll) {
        return String(state.assembly?.status || '').toLowerCase() === 'encerrada'
            && String(poll?.status || '').toLowerCase() !== 'cancelada'
            && currentUserRole() !== 'porteiro'
            && !pollCurrentUserVoted(poll.id);
    }

    function renderPolls() {
        const container = document.getElementById('assemblyPollResults');
        if (!container) return;
        if (!state.polls.length) {
            container.innerHTML = '<div class="summary-empty">Nenhuma votação foi criada nesta assembleia.</div>';
            return;
        }

        container.innerHTML = state.polls.map((poll) => {
            const options = state.options.filter((option) => String(option.poll_id) === String(poll.id));
            const total = options.reduce((sum, option) => sum + getVoteCount(poll.id, option.id), 0);
            const canVote = canVoteFromSummary(poll);
            const voted = pollCurrentUserVoted(poll.id);

            const optionHtml = options.length ? options.map((option) => {
                const count = getVoteCount(poll.id, option.id);
                const pct = total ? Math.round((count / total) * 100) : 0;
                return `
                    <div class="poll-option-result ${canVote ? 'can-vote' : ''}">
                        <div class="poll-option-main">
                            <span class="poll-option-label">${esc(option.option_text || 'Opção')}</span>
                            ${canVote ? `<button type="button" class="post-assembly-vote-btn" data-post-vote data-poll-id="${poll.id}" data-option-id="${option.id}"><i class="fas fa-check"></i> Votar nesta opção</button>` : ''}
                        </div>
                        <div class="poll-result-bar"><div class="poll-result-fill" style="width:${pct}%"></div></div>
                        <span class="poll-count">${count} voto${count === 1 ? '' : 's'} · ${pct}%</span>
                    </div>`;
            }).join('') : '<div class="summary-empty">Sem opções registradas.</div>';

            const voteStatus = voted
                ? '<div class="poll-user-status success"><i class="fas fa-circle-check"></i> Seu voto já está registrado nesta votação.</div>'
                : canVote
                    ? '<div class="poll-user-status pending"><i class="fas fa-hand-pointer"></i> Você ainda não votou. Escolha uma opção acima.</div>'
                    : currentUserRole() === 'porteiro'
                        ? '<div class="poll-user-status neutral"><i class="fas fa-lock"></i> Porteiros não participam das votações.</div>'
                        : '';

            return `<article class="poll-result-card">
                <h3>${esc(poll.title || 'Votação')}</h3>
                <p class="poll-description">${esc(poll.description || 'Sem descrição.')}</p>
                ${optionHtml}
                <div class="poll-total">Total de votos registrados: ${total}</div>
                ${voteStatus}
            </article>`;
        }).join('');

        container.querySelectorAll('[data-post-vote]').forEach((button) => {
            button.addEventListener('click', () => castPostAssemblyVote(button));
        });
    }

    async function castPostAssemblyVote(button) {
        const pollId = Number(button.dataset.pollId);
        const optionId = Number(button.dataset.optionId);
        if (!pollId || !optionId) return;

        const poll = state.polls.find((item) => Number(item.id) === pollId);
        const option = state.options.find((item) => Number(item.id) === optionId && Number(item.poll_id) === pollId);
        if (!poll || !option) return;

        const execute = async () => {
            const card = button.closest('.poll-result-card');
            card?.querySelectorAll('[data-post-vote]').forEach((item) => { item.disabled = true; });
            try {
                await window.supabaseFetch('/rpc/condomit_cast_post_assembly_vote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_poll_id: pollId, target_option_id: optionId })
                });
                await loadPollResults();
                renderPolls();
                renderMinutes();
                window.showToast?.('Voto registrado com sucesso.', 'success');
            } catch (error) {
                console.error('Erro ao votar pela ata:', error);
                window.showToast?.(error?.message || 'Não foi possível registrar o voto.', 'error');
                card?.querySelectorAll('[data-post-vote]').forEach((item) => { item.disabled = false; });
            }
        };

        if (typeof window.showModal === 'function') {
            window.showModal({
                title: 'Confirmar voto',
                message: `Confirmar seu voto em “${option.option_text || 'Opção'}” na votação “${poll.title || 'Votação'}”? O voto não poderá ser alterado depois.`,
                type: 'warning',
                confirmText: 'Confirmar voto',
                cancelText: 'Cancelar',
                onConfirm: execute
            });
        } else if (window.confirm('Confirmar este voto?')) {
            await execute();
        }
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
            document.querySelectorAll('[data-summary-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
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
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                    body: JSON.stringify({
                        assembly_id: state.id,
                        cep: state.assembly.cep,
                        user_email: email,
                        participant_name: state.user?.name || email,
                        comment
                    })
                });
                const saved = Array.isArray(rows) ? rows[0] : rows;
                if (!saved) throw new Error('O comentário não foi confirmado pelo banco.');
                state.comments.push(saved);
                if (textarea) textarea.value = '';
                renderComments();
                renderMinutes();
                window.showToast?.('Comentário publicado.', 'success');
            } catch (error) {
                window.showToast?.(error?.message || 'Erro ao publicar comentário.', 'error');
            } finally {
                if (submit) submit.disabled = false;
            }
        });
    }

    async function generateAssemblyDecisionTasks() {
        if (currentUserRole() !== 'sindico') return;
        const button = document.getElementById('generateAssemblyTasks027');
        if (button) button.disabled = true;
        try {
            const cepResult = await window.supabaseFetch('/rpc/condomit_current_user_cep', { method:'POST', body:'{}' });
            const cep = typeof cepResult === 'string' ? cepResult : String(cepResult?.cep || '');
            if (!cep) throw new Error('Não foi possível identificar o condomínio.');
            const existing = await fetchRows(`/assembly_tasks?select=id,title&assembly_id=eq.${state.id}`).catch(()=>[]);
            const existingTitles = new Set(existing.map(row => String(row.title || '').toLowerCase()));
            const tasks = [];
            state.polls.forEach(poll => {
                const options = state.options.filter(option => String(option.poll_id) === String(poll.id));
                if (!options.length) return;
                const ranked = options.map(option => ({option,votes:getVoteCount(poll.id,option.id)})).sort((a,b)=>b.votes-a.votes);
                const winner = ranked[0];
                if (!winner) return;
                const title = `Executar decisão: ${poll.title || 'Votação'} — ${winner.option.option_text || 'Opção vencedora'}`;
                if (!existingTitles.has(title.toLowerCase())) tasks.push({cep,assembly_id:state.id,title,description:`Gerada automaticamente a partir da votação. Resultado vencedor: ${winner.option.option_text || 'Opção'} com ${winner.votes} voto(s).`,status:'pendente',created_by:state.user.email});
            });
            if (!tasks.length) { window.showToast?.('Nenhuma nova tarefa foi gerada. As decisões já possuem tarefas ou não há votações.', 'info'); return; }
            await window.supabaseFetch('/assembly_tasks', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(tasks)});
            window.showToast?.(`${tasks.length} tarefa(s) criada(s) na Gestão Avançada.`, 'success');
        } catch(error) { window.showToast?.(error?.message || 'Não foi possível gerar as tarefas.', 'error'); }
        finally { if (button) button.disabled = false; }
    }

    function getVoteCount(pollId, optionId) {
        const row = state.results.find((result) => String(result.poll_id) === String(pollId) && String(result.option_id) === String(optionId));
        return Number(row?.vote_count || 0);
    }

    function renderFatal(message) {
        const hero = document.getElementById('assemblySummaryHero');
        if (hero) hero.innerHTML = `<div class="summary-empty"><i class="fas fa-circle-exclamation"></i><br>${esc(message)}</div>`;
    }

    function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
    function initials(name) { return String(name || 'US').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'US'; }
    function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
    function safeTime(value) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0; }
    function formatDate(value) { if (!value) return '--'; const date = new Date(`${String(value).slice(0, 10)}T12:00:00`); return date.toLocaleDateString('pt-BR'); }
    function formatTime(value) { if (!value) return '--:--'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value).slice(0, 5) : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    function formatDateTime(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
    function combineDateTime(date, time) { return date ? `${date}T${String(time || '00:00').slice(0, 8)}` : null; }
    function roleLabel(role) { const normalized = String(role || 'morador').toLowerCase(); return normalized.startsWith('sind') ? 'Síndico' : normalized.startsWith('porteir') ? 'Porteiro' : 'Morador'; }
    function statusLabel(status) { const normalized = String(status || '').toLowerCase(); return normalized === 'encerrada' ? 'Encerrada' : normalized === 'cancelada' ? 'Cancelada' : normalized === 'em_andamento' ? 'Em andamento' : 'Agendada'; }
})();
