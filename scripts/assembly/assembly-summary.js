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
        transcripts: [],
        condominium: null
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

        // Dados institucionais usados somente como texto na ata. A ata não inclui
        // a logo do condomínio nem qualquer imagem do modelo de referência.
        state.condominium = (await fetchRows(
            `/condominiums?select=cep,condominium_name,address,address_number,complement,neighborhood,city,state&cep=eq.${encodeURIComponent(state.assembly.cep || '')}&limit=1`
        ).catch(() => []))[0] || null;

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
        const condo = state.condominium || {};
        const participants = uniqueParticipants();
        const chair = resolveAssemblyChair(participants);
        const year = String(a.date || new Date().toISOString()).slice(0, 4);
        const condoName = String(
            condo.condominium_name ||
            state.user?.condominium?.condominium_name ||
            state.user?.condominium?.name ||
            'Condomínio'
        ).trim();
        const address = formatCondominiumAddress(condo);
        const assemblyType = formalAssemblyType(a.assembly_type);
        const startTime = String(a.start_time || '').slice(0, 5) || '--:--';
        const closingTime = resolveClosingTime();
        const title = String(a.title || 'Assembleia').trim();

        const paragraphs = [];
        const opening = `${formalDateWords(a.date)}, às ${formatClockFormal(startTime)}, nas dependências do ${condoName}${address ? `, situado em ${address}` : ''}, realizou-se a ${assemblyType} intitulada “${title}”${chair ? `, sob a presidência de ${chair.name}` : ''}${participants.length ? `, com a presença dos participantes ${participants.map((item) => `${item.name} (${roleLabel(item.role)})`).join(', ')}, conforme registro eletrônico de frequência mantido pelo Condomit.` : ', não havendo participantes identificados nos registros eletrônicos de frequência disponíveis.'}`;
        paragraphs.push(opening);

        if (a.description || a.rules) {
            const institutional = [];
            if (a.description) institutional.push(`A convocação teve por finalidade ${sentenceFragment(a.description)}`);
            if (a.rules) institutional.push(`Foram observadas as seguintes orientações registradas para a reunião: ${sentenceFragment(a.rules)}`);
            paragraphs.push(`${institutional.join('. ')}.`);
        }

        if (state.agenda.length) {
            const agendaText = state.agenda.map((item, index) => {
                const base = `${romanNumeral(index + 1)} – ${cleanFormalText(item.title || 'Item de pauta')}`;
                return item.description ? `${base}: ${cleanFormalText(item.description)}` : base;
            }).join('; ');
            paragraphs.push(`Aberta a sessão, foi apresentada a Ordem do Dia, composta pelos seguintes assuntos: ${agendaText}. Na sequência, os itens foram submetidos à apreciação dos presentes, observando-se a ordem registrada no sistema.`);
        } else if (a.agenda_summary) {
            paragraphs.push(`Aberta a sessão, passou-se à apreciação da Ordem do Dia, registrada nos seguintes termos: ${sentenceFragment(a.agenda_summary)}.`);
        } else {
            paragraphs.push('Aberta a sessão, iniciou-se a apreciação dos assuntos constantes da convocação, não havendo pauta detalhada adicional registrada no sistema.');
        }

        paragraphs.push(...buildFormalDiscussionParagraphs());
        const pollParagraphs = state.polls.map(buildFormalPollParagraph).filter(Boolean);
        paragraphs.push(...(pollParagraphs.length ? pollParagraphs : ['Não foram identificadas votações eletrônicas vinculadas a esta assembleia nos registros disponíveis.']));

        paragraphs.push(closingTime
            ? `Concluídas as discussões e deliberações registradas, e nada mais havendo a consignar nos dados eletrônicos disponíveis, a assembleia foi encerrada às ${formatClockFormal(closingTime)}.`
            : 'Concluídas as discussões e deliberações registradas, e nada mais havendo a consignar nos dados eletrônicos disponíveis, deu-se por encerrada a assembleia, sem horário final específico informado no cadastro.');
        paragraphs.push('Para constar, lavrou-se a presente ata com base nos registros eletrônicos de presença, pautas, transcrições e votações armazenados pelo Condomit, a qual deverá ser submetida à conferência e, quando aplicável, à aprovação e assinatura dos responsáveis pelo condomínio.');

        const chairSignature = chair?.name || 'Síndico / Presidente da Assembleia';
        container.innerHTML = `
            <article class="formal-minutes-document" aria-label="Ata formal da assembleia">
                <header class="formal-minutes-heading">
                    <div class="formal-condo-name">${esc(condoName)}</div>
                    ${address ? `<div class="formal-condo-address">${esc(address)}</div>` : ''}
                    <h3>ATA Nº ${esc(String(state.id))}/${esc(year)}</h3>
                    <div class="formal-minutes-subtitle">${esc(title)} · ${esc(assemblyType)}</div>
                </header>
                <div class="formal-minutes-body">${paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}</div>
                <footer class="formal-minutes-signatures">
                    <div class="formal-signature"><span class="signature-line"></span><strong>${esc(chairSignature)}</strong><small>Presidência da Assembleia</small></div>
                    <div class="formal-signature"><span class="signature-line"></span><strong>Responsável pela conferência da ata</strong><small>Assinatura</small></div>
                </footer>
                <div class="formal-minutes-note"><i class="fas fa-shield-halved"></i> Documento gerado a partir dos registros persistidos da assembleia. Nenhuma informação não registrada foi presumida pelo sistema.</div>
            </article>`;
    }
    function uniqueParticipants() {
        const seen = new Map();
        state.attendance.forEach((row) => {
            const key = String(row.user_email || row.participant_name || row.id || '').trim().toLowerCase();
            if (!key || seen.has(key)) return;
            seen.set(key, {
                email: String(row.user_email || '').trim().toLowerCase(),
                name: cleanFormalText(row.participant_name || row.user_email || 'Participante'),
                role: row.participant_role || 'morador'
            });
        });
        return Array.from(seen.values());
    }

    function resolveAssemblyChair(participants) {
        const creator = String(state.assembly?.created_by || '').trim().toLowerCase();
        if (creator) {
            const exact = participants.find((participant) => participant.email === creator);
            if (exact) return exact;
        }
        return participants.find((participant) => String(participant.role || '').toLowerCase().startsWith('sind')) || null;
    }

    function buildFormalDiscussionParagraphs() {
        const paragraphs = [];
        const agendaNotes = state.agenda.map((item) => ({
            title: cleanFormalText(item.title || 'Item de pauta'),
            notes: cleanFormalText(item.discussion_notes || '')
        })).filter((item) => item.notes);

        agendaNotes.forEach((item) => {
            paragraphs.push(`Quanto ao item “${item.title}”, ficou registrado em ata o seguinte teor de discussão: ${sentenceFragment(item.notes)}.`);
        });

        const transcriptGroups = new Map();
        state.transcripts.forEach((row) => {
            const text = cleanFormalText(row.transcript || '');
            if (!text) return;
            const name = cleanFormalText(row.participant_name || row.participant_email || 'Participante');
            const key = String(row.participant_email || name).trim().toLowerCase();
            const current = transcriptGroups.get(key) || { name, texts: [] };
            current.texts.push(text);
            transcriptGroups.set(key, current);
        });

        if (transcriptGroups.size) {
            transcriptGroups.forEach(({ name, texts }) => {
                const joined = texts.join(' ');
                paragraphs.push(`Durante os debates, registrou-se manifestação de ${name}, cujo teor transcrito foi: “${ensureTerminalPunctuation(joined)}”`);
            });
        } else if (!agendaNotes.length) {
            paragraphs.push('Não foram localizadas transcrições de falas ou anotações formais de discussão vinculadas a esta assembleia.');
        }
        return paragraphs;
    }

    function buildFormalPollParagraph(poll) {
        const title = cleanFormalText(poll.title || 'Votação');
        const description = cleanFormalText(poll.description || '');
        const options = state.options.filter((option) => String(option.poll_id) === String(poll.id));
        if (!options.length) {
            return `Em relação à matéria “${title}”, consta registro de votação, porém sem opções de voto armazenadas para consolidação do resultado.`;
        }

        const ranked = options.map((option) => ({
            text: cleanFormalText(option.option_text || 'Opção'),
            votes: getVoteCount(poll.id, option.id)
        })).sort((left, right) => right.votes - left.votes);
        const total = ranked.reduce((sum, item) => sum + item.votes, 0);
        const distribution = ranked.map((item) => `${item.text}: ${item.votes} voto${item.votes === 1 ? '' : 's'}`).join('; ');

        if (!total) {
            return `A matéria “${title}”${description ? `, referente a ${sentenceFragment(description)}` : ''}, foi disponibilizada para votação, não havendo votos registrados no sistema.`;
        }

        const topVotes = ranked[0]?.votes || 0;
        const leaders = ranked.filter((item) => item.votes === topVotes);
        const resultText = leaders.length === 1
            ? `A opção mais votada foi “${leaders[0].text}”, com ${leaders[0].votes} voto${leaders[0].votes === 1 ? '' : 's'}`
            : `Houve empate entre ${leaders.map((item) => `“${item.text}”`).join(' e ')}, com ${topVotes} voto${topVotes === 1 ? '' : 's'} para cada opção`;
        return `Submetida à votação a matéria “${title}”${description ? `, referente a ${sentenceFragment(description)}` : ''}, foram contabilizados ${total} voto${total === 1 ? '' : 's'}, assim distribuídos: ${distribution}. ${resultText}.`;
    }
    function formatCondominiumAddress(condo) {
        const street = cleanFormalText(condo?.address || '');
        const number = cleanFormalText(condo?.address_number || '');
        const complement = cleanFormalText(condo?.complement || '');
        const neighborhood = cleanFormalText(condo?.neighborhood || '');
        const city = cleanFormalText(condo?.city || '');
        const stateCode = cleanFormalText(condo?.state || '');
        const cep = cleanFormalText(condo?.cep || state.assembly?.cep || '');
        if (!street && !city && !cep) return '';
        const first = [street, number].filter(Boolean).join(', ');
        return [first, complement, neighborhood, [city, stateCode].filter(Boolean).join('/'), cep ? `CEP ${cep}` : ''].filter(Boolean).join(' – ');
    }

    function resolveClosingTime() {
        const direct = String(state.assembly?.end_time || '').trim();
        if (direct) return direct.slice(0, 5);
        const candidates = [];
        state.attendance.forEach((row) => { if (row.left_at) candidates.push(row.left_at); });
        state.events.forEach((row) => { if (row.created_at) candidates.push(row.created_at); });
        state.transcripts.forEach((row) => { if (row.spoken_at || row.created_at) candidates.push(row.spoken_at || row.created_at); });
        if (!candidates.length) return '';
        const latest = candidates.sort((left, right) => safeTime(right) - safeTime(left))[0];
        return formatTime(latest);
    }

    function formalAssemblyType(type) {
        const normalized = String(type || 'ordinaria').trim().toLowerCase();
        if (normalized === 'extraordinaria') return 'Assembleia Geral Extraordinária';
        if (normalized === 'especial') return 'Assembleia Especial';
        return 'Assembleia Geral Ordinária';
    }
    function formalDateWords(value) {
        if (!value) return 'data não informada';
        const raw = String(value).slice(0, 10);
        const [year, month, day] = raw.split('-').map(Number);
        if (!year || !month || !day) return formatDate(value);
        const dayNames = {1:'primeiro',2:'dois',3:'três',4:'quatro',5:'cinco',6:'seis',7:'sete',8:'oito',9:'nove',10:'dez',11:'onze',12:'doze',13:'treze',14:'quatorze',15:'quinze',16:'dezesseis',17:'dezessete',18:'dezoito',19:'dezenove',20:'vinte',21:'vinte e um',22:'vinte e dois',23:'vinte e três',24:'vinte e quatro',25:'vinte e cinco',26:'vinte e seis',27:'vinte e sete',28:'vinte e oito',29:'vinte e nove',30:'trinta',31:'trinta e um'};
        const monthNames = ['','janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        return `${day === 1 ? 'Ao primeiro dia' : `Aos ${dayNames[day] || day} dias`} do mês de ${monthNames[month] || month} de ${year}`;
    }

    function formatClockFormal(value) {
        const raw = String(value || '').slice(0, 5);
        const match = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return raw || 'horário não informado';
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        return `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}`;
    }

    function cleanFormalText(value) {
        return String(value || '')
            .replace(/\*\*/g, '')
            .replace(/\bimage\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function sentenceFragment(value) {
        return cleanFormalText(value).replace(/[.!?]+$/g, '');
    }

    function ensureTerminalPunctuation(value) {
        const text = cleanFormalText(value);
        if (!text) return '';
        return /[.!?]$/.test(text) ? text : `${text}.`;
    }

    function romanNumeral(value) {
        const numerals = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
        return numerals[value - 1] || String(value);
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
