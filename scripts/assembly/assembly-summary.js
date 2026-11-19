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
        recordings: [],
        speechActivities: [],
        speakerAssignments: [],
        condominium: null,
        signature: null,
        signedDocuments: [],
        minutesNumber: null,
        minutesDraft: null,
        generatedMinutes: "",
        renderedMinutesBody: "",
        detailsReleased: true,
        indirectDiscussion: null,
        indirectTopics: null,
        indirectObservacoes: [],
        indirectSummaryError: "",
        indirectSummaryRunning: false,
        indirectSummaryMethod: null,
        autoMinutesJob: null,
        speakerRevisionPending: false,
        commentProfiles: new Map(),
        commentVotes: [],
        replyComposerFor: null,
        expandedReplyIds: new Set(),
        signaturePad: { drawing: false, lastX: 0, lastY: 0, hasInk: false }
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
        bindCommentActions();
        setupSignatureModal();

        try {
            await waitForAuthSession();
            const visible = await window.supabaseFetch('/rpc/condomit_assembly_details_visible_065', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({target_assembly_id: state.id})
            });
            if (visible !== true) {
                state.detailsReleased = false;
                renderAwaitingSignature();
                return;
            }
            await loadAll();
            await loadMinutesReview();
            renderAll();
            if (currentUserRole() === 'sindico') startAutoMinutesRefresh();
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
        if (role.startsWith('sind') || role === 'admin') return 'sindico';
        if (role.startsWith('porteir')) return 'porteiro';
        return 'morador';
    }

    function draftCanBeAutomaticallyReplaced(draft) {
        if (!draft) return true;
        if (draft.status !== 'rascunho') return false;
        const body = String(draft.body || '');
        return body.trim().length < 30
            || /síntese narrativa das manifestações está pendente|não foi possível consolidar as manifestações|registrando os seguintes pontos:|Falante\s*\d+\s*declarou/i.test(body);
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

    async function loadAll({ verifyRecordings = false } = {}) {
        if (typeof window.supabaseFetch !== 'function') throw new Error('Supabase não inicializado.');

        const recordingsPromise = fetchRows(`/assembly_recordings?select=*&assembly_id=eq.${state.id}&order=started_at.asc`).then(rows => {
            state.recordingStatuses = rows;
            state.recordings = rows.filter(row => row.status === 'concluido' && row.recording_url);
            renderRecordings();
            return rows;
        });
        const [assemblyRows, attendance, chat, polls, agenda, hands, events, comments, transcripts, recordings, speechActivities, speakerAssignments, signatures, commentVotes] = await Promise.all([
            fetchRows(`/scheduled_assemblies?select=*&id=eq.${state.id}&limit=1`),
            fetchRows(`/assembly_attendance?select=*&assembly_id=eq.${state.id}&order=joined_at.asc`),
            fetchRows(`/assembly_chat_messages?select=*&assembly_id=eq.${state.id}&order=created_at.asc`),
            fetchRows(`/assembly_polls?select=*&assembly_id=eq.${state.id}&order=created_at.asc`),
            fetchRows(`/assembly_agenda_items?select=*&assembly_id=eq.${state.id}&order=display_order.asc`),
            fetchRows(`/assembly_speaking_requests?select=*&assembly_id=eq.${state.id}&order=requested_at.asc`),
            fetchRows(`/assembly_event_logs?select=*&assembly_id=eq.${state.id}&order=created_at.asc`).catch(() => []),
            fetchRows(`/assembly_post_comments?select=*&assembly_id=eq.${state.id}&order=created_at.asc`).catch(() => []),
            fetchRows(`/assembly_transcripts?select=*&assembly_id=eq.${state.id}&order=spoken_at.asc`).catch(() => []),
            recordingsPromise.catch(() => []),
            fetchRows(`/assembly_speech_activity?select=*&assembly_id=eq.${state.id}&order=started_at.asc`).catch(() => []),
            Promise.resolve([]),
            fetchRows(`/assembly_minutes_signatures?select=assembly_id,signer_email,signer_name,signed_at,signature_code,signature_data&assembly_id=eq.${state.id}&limit=1`).catch(() => []),
            fetchRows(`/assembly_post_comment_votes?select=comment_id,user_email,vote_type,created_at,updated_at&assembly_id=eq.${state.id}`).catch(() => [])
        ]);

        state.assembly = assemblyRows[0] || null;
        if (!state.assembly) throw new Error('Assembleia não encontrada ou sem acesso.');
        let recordingVerification = null;
        if (verifyRecordings && (recordings || []).length) {
          try {
            const token = await window.resolveSupabaseAccessToken?.();
            if (token) {
              const result = await fetch('/.netlify/functions/assembly-recording-reconcile', {
                method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
                body:JSON.stringify({assembly_id:Number(state.id)}), cache:'no-store'
              });
              if (result.ok) {
                const checked = await result.json();
                recordingVerification = new Map((checked.recordings || []).map(item => [String(item.recording_id), item]));
                const fresh = await fetchRows(`/assembly_recordings?select=*&assembly_id=eq.${state.id}&order=started_at.asc`).catch(() => null);
                if (fresh) recordings.splice(0, recordings.length, ...fresh);
              }
            }
          } catch(error) {console.warn('[ASSEMBLY RECORDINGS] Falha ao conferir arquivo de mídia:',error);}
        }
        const playableRecordings = (recordings || []).filter(row => row?.status === 'concluido' && String(row?.recording_url || '').trim() && (recordingVerification === null || recordingVerification.get(String(row.id))?.storage_verified));
        state.recordingStatuses = (recordings || []).map(row => ({ ...row, verification: recordingVerification?.get(String(row.id)) || null }));
        Object.assign(state, { attendance, chat, polls, agenda, hands, events, comments, transcripts, recordings: playableRecordings, speechActivities, commentVotes });
        state.speakerAssignments = await loadSpeakerAssignments();
        state.signature = signatures[0] || null;

         
         
        state.condominium = (await fetchRows(
            `/condominiums?select=cep,condominium_name,address,address_number,complement,neighborhood,city,state&cep=eq.${encodeURIComponent(state.assembly.cep || '')}&limit=1`
        ).catch(() => []))[0] || null;

        const pollIds = polls.map((poll) => poll.id).filter(Boolean);
        state.options = pollIds.length
            ? await fetchRows(`/assembly_poll_options?select=*&poll_id=in.(${pollIds.join(',')})&order=display_order.asc`)
            : [];
        await Promise.all([loadPollResults(), loadCommentProfiles()]);
    }

    async function loadSpeakerAssignments() {
        const ids = (state.recordingStatuses || []).map(row => Number(row.id)).filter(id => Number.isSafeInteger(id) && id > 0);
        if (!ids.length) return [];
        return fetchRows(`/assembly_deepgram_speakers?select=*&recording_id=in.(${ids.join(',')})`).catch(() => []);
    }

    function completedDeepgramTranscripts() {
        // Uma gravação pode ter transcrição salva mesmo enquanto a reconciliação
        // de status está pendente. A ATA não pode apagar essas falas da visualização.
        const recordingIds = new Set((state.recordingStatuses || []).map(row => String(row.id)));
        return state.transcripts.filter(row =>
            String(row.transcript_source || row.source || '').trim().toLowerCase() === 'recording_video_deepgram'
            && (recordingIds.size === 0 || recordingIds.has(String(row.recording_id)))
            && String(row.transcript || '').trim());
    }

    function groupedDeepgramTranscripts() {
        return window.CondomitMinutesSpeech?.groupRows(completedDeepgramTranscripts()) || [];
    }

    function missingAttributedSpeakers(body) {
        const authors = new Set();
        groupedDeepgramTranscripts().forEach(group => {
            const name = window.CondomitMinutesSpeech?.recognizedName(group);
            if (name && String(group.text || '').length >= 25) authors.add(name);
        });
        const narrative = String(body || '');
        const escapes = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return Array.from(authors).filter(name => {
            const expression = new RegExp(`\\b(?:O|A)\\s+(?:síndico|síndica|morador|moradora|participante|irmão|irmã|tio|tia)\\s+${escapes(name)}(?=[\\s,.!?;:]|$)`, 'iu');
            return !expression.test(narrative);
        });
    }

    function speakerOptions() {
        const users = new Map();
        state.attendance.concat(state.speechActivities).forEach(row => {
            const email = String(row.user_email || row.participant_email || '').trim().toLowerCase();
            const name = cleanFormalText(row.participant_name || row.name || email);
            if (email && !email.endsWith('@condomit.invalid') && !users.has(email)) users.set(email, {email, name, role: String(row.participant_role || row.role || '').trim()});
        });
        return Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    function speakerMappingControls(groups) {
        if (currentUserRole() !== 'sindico') return '';
        const voices = new Map();
        groups.forEach(group => {
            if (group.speakerIndex != null) voices.set(`${group.recordingId}:${group.speakerIndex}`, group);
        });
        if (!voices.size) return '';
        const people = speakerOptions();
        return `<div class="minutes-speaker-mapping074"><strong>Identificação automática de vozes</strong>
            <p>O sistema associa automaticamente cada voz ao participante quando os sinais de áudio permitem identificação confiável. Não é necessário preencher a lista para gerar a ATA. Ajuste apenas se encontrar um erro.</p>
            <details><summary>Corrigir identificação de um falante (opcional)</summary>
            ${Array.from(voices.values()).map(group => {
                const mapping = state.speakerAssignments.find(row => String(row.recording_id) === group.recordingId && Number(row.speaker_index) === group.speakerIndex);
                const selected = String(mapping?.participant_email || group.participant_email || '').toLowerCase();
                return `<label class="minutes-speaker-label074">Voz ${group.speakerIndex + 1}
                  <select data-speaker-recording="${esc(group.recordingId)}" data-speaker-index="${group.speakerIndex}" aria-label="Identificar voz ${group.speakerIndex + 1}">
                    <option value="">Não identificada</option>
                    ${people.map(person => `<option value="${esc(person.email)}" ${person.email === selected ? 'selected' : ''}>${esc(person.name)}</option>`).join('')}
                  </select>
                  <small>${mapping?.assignment_source === 'reviewed' ? 'Identificação confirmada na revisão' : mapping?.assignment_source === 'speech_activity' ? 'Sugerido pela atividade do microfone; confirme pelo áudio' : 'Identidade não confirmada'}</small>
                </label>`;
            }).join('')}
            </details>
        </div>`;
    }

    async function updateSpeakerMapping(select) {
        const recordingId = Number(select.dataset.speakerRecording);
        const speakerIndex = Number(select.dataset.speakerIndex);
        const email = select.value || null;
        const priorGroups = groupedDeepgramTranscripts();
        const previous = priorGroups.find(item => String(item.recordingId) === String(recordingId) && item.speakerIndex === speakerIndex);
        const oldName = previous && window.CondomitMinutesSpeech?.recognizedName(previous);
        const newSpeaker = speakerOptions().find(item => item.email === email);
        const nextName = newSpeaker?.name || '';
        if (state.minutesDraft?.status === 'aprovada' && !await reopenMinutesForReview()) {
            select.value = previous?.participant_email || '';
            return;
        }
        select.disabled = true;
        try {
            await window.supabaseFetch('/rpc/condomit_assign_deepgram_speaker_064', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({target_recording_id: recordingId, target_speaker_index: speakerIndex, selected_participant_email: email})
            });
            state.transcripts = await fetchRows(`/assembly_transcripts?select=*&assembly_id=eq.${state.id}&order=spoken_at.asc`);
            state.speakerAssignments = await loadSpeakerAssignments();
            const token=await window.resolveSupabaseAccessToken?.();
            if(!token) throw new Error('Sessão expirada. Faça login para atualizar a ATA.');
            const response=await fetch('/.netlify/functions/assembly-minutes-speaker-refresh',{
                method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
                body:JSON.stringify({assembly_id:state.id,recording_id:recordingId}),cache:'no-store'
            });
            const result=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(result.error||'Identificação salva, mas a regeneração da ATA não foi agendada.');
            state.indirectDiscussion=null;
            state.indirectTopics=null;
            state.speakerRevisionPending=false;
            state.autoMinutesJob={status:'pendente',attempts:0,progress_completed:0,progress_total:0};
            renderMinutes();
            startAutoMinutesRefresh();
            window.showToast?.('Identificação corrigida. O Claude gerará novamente a ATA com o nome atualizado.','success');
        } catch (error) {
            window.showToast?.(error?.message || 'Não foi possível identificar esta voz.', 'error');
            select.disabled = false;
        }
    }

    function autoMinutesProgressMarkup() {
        const job=state.autoMinutesJob;
        const completed=Math.max(0,Number(job?.progress_completed)||0);
        const total=Math.max(0,Number(job?.progress_total)||0);
        const processing=job?.status==='processando';
        const percent=processing && total>0 ? Math.min(99,Math.floor(completed/total*100)) : null;
        const line=processing && total>0
            ? `${Math.min(completed,total)} de ${total} blocos redigidos pelo Claude (${percent}%).`
            : job?.status==='falhou' ? 'Falha detectada; o servidor tentará novamente, conforme o limite de tentativas.'
            : job?.status==='pendente' ? 'Na fila para iniciar a redação automática.'
            : 'Aguardando a conclusão da transcrição e identificação das vozes.';
        return `<section class="minutes-generation-progress0772" role="status" aria-live="polite">
          <h3><i class="fas fa-brain"></i> Preparando ATA com Claude</h3>
          <p>${esc(autoMinutesStatusMessage())}</p>
          <div class="minutes-generation-track0772" role="progressbar" aria-label="Progresso da geração da ATA"
             aria-valuemin="0" aria-valuemax="100" ${percent===null?'':`aria-valuenow="${percent}"`}>
             <span class="${percent===null?'minutes-generation-indeterminate0772':''}" style="${percent===null?'':`width:${percent}%`}"></span>
          </div>
          <small>${esc(line)} O tempo restante depende da API e não pode ser estimado com precisão.</small>
        </section>`;
    }

    function autoMinutesStatusMessage() {
        const job=state.autoMinutesJob;
        if (!job) return 'Aguardando gravação e transcrição Deepgram. A IA gerará a ATA automaticamente, sem deixar a página aberta.';
        if (job.status === 'pendente') return 'Transcrição pronta. A ATA foi enfileirada para geração automática pelo Claude.';
        if (job.status === 'processando') return 'Claude está redigindo a ATA automaticamente com todas as falas do Deepgram e os nomes identificados.';
        if (job.status === 'falhou') return `${Number(job.attempts||0)>=5?'As tentativas automáticas se esgotaram. Confira as configurações e os logs da Netlify.':'A geração automática será repetida pelo servidor.'} Motivo: ${String(job.last_error || 'falha temporária').slice(0,190)}`;
        if (job.status === 'bloqueado') return 'A ATA já foi revisada ou assinada. A geração automática não sobrescreverá a versão oficial.';
        if (!job.saved_to_draft && state.minutesDraft?.body !== job.generated_body) return 'Claude concluiu a ATA, mas havia uma minuta anterior. O texto existente foi preservado; você pode aplicar a nova redação após conferir.';
        return 'ATA gerada e salva automaticamente pelo Claude a partir da transcrição integral. Revise, aprove e assine.';
    }

    let autoMinutesRefreshTimer = null;
    async function refreshAutoMinutes() {
        if (currentUserRole() !== 'sindico' || !state.id || !state.detailsReleased) return;
        const rows=await fetchRows(`/assembly_auto_minutes_jobs?select=status,attempts,last_error,generated_body,saved_to_draft,source_count,progress_completed,progress_total,progress_stage,finished_at&assembly_id=eq.${state.id}&limit=1`).catch(() => []);
        const job=rows[0] || null;
        const changed=JSON.stringify(job) !== JSON.stringify(state.autoMinutesJob);
        state.autoMinutesJob=job;
        if (!changed) return;
        const edit=document.getElementById('assemblyMinutesEditor074');
        const before=edit?.value||'';
        const original=state.renderedMinutesBody || state.minutesDraft?.body || state.generatedMinutes || '';
        const unsaved=before.trim() && before.trim()!==original.trim();
        if(job?.status==='concluido' && job.saved_to_draft && !unsaved) await loadMinutesReview();
        if (job && ['pendente','processando','concluido'].includes(job.status)) {
            const recent=await fetchRows(`/assembly_recordings?select=*&assembly_id=eq.${state.id}&order=started_at.asc`).catch(()=>null);
            if(recent) state.recordingStatuses=recent;
        }
        renderHero();
        renderMinutes();
        if (unsaved) { const next=document.getElementById('assemblyMinutesEditor074'); if(next) next.value=before; }
        if (['concluido','bloqueado'].includes(job?.status)) { clearInterval(autoMinutesRefreshTimer);autoMinutesRefreshTimer=null; }
    }
    function startAutoMinutesRefresh() {
        clearInterval(autoMinutesRefreshTimer);
        autoMinutesRefreshTimer=null;
        refreshAutoMinutes().catch(() => {});
        if(state.minutesDraft?.status==='aprovada') return;
        autoMinutesRefreshTimer=setInterval(() => refreshAutoMinutes().catch(() => {}),12000);
    }
    async function applyAutomaticMinutesDraft() {
        const job=state.autoMinutesJob;
        if(job?.status!=='concluido' || !job.generated_body || state.minutesDraft?.status==='aprovada') return;
        const confirmed=await window.showConfirm?.({title:'Aplicar redação automática',
            message:'Existe uma minuta anterior. Deseja substituí-la pelo texto que o Claude já produziu a partir do Deepgram? Confira antes de aprovar.',
            confirmText:'Aplicar texto',cancelText:'Cancelar'});
        if(confirmed!==true) return;
        const draft=await window.supabaseFetch('/rpc/condomit_review_assembly_minutes_054',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({target_assembly_id:state.id,reviewed_text:job.generated_body,approve_document:false})});
        state.minutesDraft=Array.isArray(draft)?draft[0]:draft;
        if (state.autoMinutesJob) state.autoMinutesJob.saved_to_draft=true;
        renderMinutes();
        window.showToast?.('ATA automática aplicada à minuta. Revise e assine após aprovação.','success');
    }

    async function loadMinutesReview() {
        const [numbers, drafts, signedDocs] = await Promise.all([
            fetchRows(`/assembly_minutes_numbers?select=minutes_number&assembly_id=eq.${state.id}&limit=1`).catch(() => []),
            fetchRows(`/assembly_minutes_drafts?select=assembly_id,body,status,reviewed_by,approved_at,updated_at,observacoes_revisao&assembly_id=eq.${state.id}&limit=1`).catch(() => []),
            fetchRows(`/assembly_signed_documents?select=id,filename,sha256,storage_path,external_validation_status,uploaded_at&assembly_id=eq.${state.id}&order=uploaded_at.desc`).catch(() => [])
        ]);
        state.minutesNumber = numbers[0]?.minutes_number || null;
        state.minutesDraft = drafts[0] || null;
        state.indirectObservacoes = Array.isArray(state.minutesDraft?.observacoes_revisao) ? state.minutesDraft.observacoes_revisao : [];
        state.signedDocuments = signedDocs;
    }

    async function saveMinutesReview(approve) {
        const textarea = document.getElementById('assemblyMinutesEditor074');
        const body = String(textarea?.value || '').trim();
        if (body.length < 30) { window.showToast?.('Revise e preencha o conteúdo da ata antes de salvar.', 'warning'); return; }
        if (approve && groupedDeepgramTranscripts().length && !window.CondomitMinutesNarrative?.hasNarrative(body)) {
            window.showToast?.('A ata não contém as manifestações transcritas. Gere o resumo em discurso indireto, confira as falas e salve antes de aprovar.', 'warning'); return;
        }
        if (approve && /síntese narrativa das manifestações está pendente|não foi possível consolidar as manifestações/i.test(body)) {
            window.showToast?.('Preencha o resumo em discurso indireto antes de aprovar a ata.', 'warning'); return;
        }
        if (approve) {
            const missing = missingAttributedSpeakers(body);
            if (missing.length) {
                window.showToast?.(`A ATA ainda não contém o relato atribuído a: ${missing.slice(0,5).join(', ')}. Regenere com IA local ou revise o texto antes de aprovar.`, 'warning');
                return;
            }
        }
        if (approve && state.speakerRevisionPending) {
            window.showToast?.('A identificação de falantes mudou. Regenere a ATA antes de aprovar, para evitar nome incorreto.', 'warning');
            return;
        }
        if (approve && (state.recordingStatuses || []).some(row => row.status === 'concluido'
            && (row.transcription_status !== 'concluido' || String(row.transcription_model || '') !== 'deepgram:nova-3'))) {
            window.showToast?.('Aguarde a transcrição do vídeo em segundo plano e confira os trechos antes de aprovar a ata.', 'warning');
            return;
        }
        if (approve) {
            const ok = await window.showConfirm?.({
                title:'Aprovar ata revisada',
                message:'Confirma que conferiu presença, pautas, resultados e a transcrição com os registros da assembleia? A aprovação habilita a assinatura.',
                confirmText:'Confirmar aprovação',cancelText:'Voltar à revisão'
            });
            if (!ok) return;
        }
        try {
            const response = await window.supabaseFetch('/rpc/condomit_review_assembly_minutes_054', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({target_assembly_id:state.id,reviewed_text:body,approve_document:!!approve})
            });
            state.minutesDraft = Array.isArray(response) ? response[0] : response;
            state.indirectDiscussion = null;
            state.indirectTopics = null;
            if (!approve) state.signature = null;
            renderHero(); renderMinutes();
            window.showToast?.(approve ? 'Ata aprovada após revisão. Assinatura habilitada.' : 'Minuta salva para revisão.', 'success');
        } catch(error) { window.showToast?.(error?.message || 'Não foi possível salvar a revisão.', 'error'); }
    }

    async function openSignedDocument(path) {
        try {
            if (!path.startsWith(`${state.id}/signed-`) || !path.endsWith('.pdf') || path.includes('..')) throw new Error('Caminho do PDF inválido.');
            const token = await window.resolveSupabaseAccessToken?.();
            if (!token) throw new Error('Sua sessão expirou.');
            const endpoint = `${window.SUPABASE_URL}/storage/v1/object/sign/condomit-assembly-documents/${path}`;
            const res = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:window.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})});
            if (!res.ok) throw new Error('Sem permissão para acessar o PDF.');
            const data = await res.json();
            const link = String(data.signedURL || data.signedUrl || '').trim();
            if (!link) throw new Error('O armazenamento não disponibilizou o PDF.');
            const normalized = link.startsWith('/object/') ? `${window.SUPABASE_URL}/storage/v1${link}` : link.startsWith('/storage/v1/') ? `${window.SUPABASE_URL}${link}` : link;
            const url = new URL(normalized,window.SUPABASE_URL);
            if (url.origin !== new URL(window.SUPABASE_URL).origin) throw new Error('URL não autorizada.');
            window.open(url.href,'_blank','noopener,noreferrer');
        } catch(error) { window.showToast?.(error.message || 'Não foi possível abrir o PDF.', 'error'); }
    }

    async function uploadSignedGovPdf() {
        const input = document.getElementById('assemblyGovSignedFile074');
        const file = input?.files?.[0];
        if (!file) { window.showToast?.('Escolha o PDF assinado para anexar.', 'warning'); return; }
        if (file.type !== 'application/pdf' || file.size > 50 * 1024 * 1024 || file.size === 0) {
            window.showToast?.('O anexo precisa ser PDF de até 50 MB.', 'error'); return;
        }
        if (state.minutesDraft?.status !== 'aprovada') {
            window.showToast?.('Aprove a ata revisada antes de anexar o documento assinado.', 'warning'); return;
        }
        try {
            const token = await window.resolveSupabaseAccessToken?.();
            if (!token) throw new Error('Sessão expirada. Entre novamente.');
            const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            const sha256 = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
            const path = `${state.id}/signed-${crypto.randomUUID()}.pdf`;
            const endpoint = `${window.SUPABASE_URL}/storage/v1/object/condomit-assembly-documents/${path}`;
            const upload = await fetch(endpoint, {method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:window.SUPABASE_ANON_KEY,'Content-Type':'application/pdf','x-upsert':'false'},body:file});
            if (!upload.ok) throw new Error('Não foi possível salvar o PDF assinado.');
            await window.supabaseFetch('/assembly_signed_documents', {
                method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},
                body:JSON.stringify({assembly_id:state.id,cep:state.assembly.cep,filename:file.name.slice(0,160),storage_path:path,sha256,uploaded_by:state.user.email})
            });
            await loadMinutesReview();
            renderMinutes();
            window.showToast?.('PDF anexado. Valide a assinatura no serviço oficial do ITI.', 'success');
        } catch(error) { window.showToast?.(error?.message || 'Falha ao anexar documento.', 'error'); }
    }

    async function requestMinutesAiSuggestions() {
        const output = document.getElementById('assemblyMinutesAiSuggestions074');
        if (!output) return;
        output.hidden = false;
        output.textContent = 'Selecionando trechos para conferência dos registros...';
        try {
            const token = await window.resolveSupabaseAccessToken?.();
            const response = await fetch('/.netlify/functions/assembly-minutes-assist', {
                method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
                body:JSON.stringify({assembly_id:state.id})
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Não foi possível selecionar os trechos.');
            const lines = (result.suggestions || []).map(item => `• ${item.text}\nFontes: ${item.sources.join(', ')}`);
            output.textContent = `${result.warning || ''}\n\n${lines.join('\n\n') || 'Nenhum trecho adequado foi encontrado.'}\n\nRevise o áudio e os registros oficiais antes de incluir conteúdo na ata.`;
        } catch(error) { output.textContent = error?.message || 'Não foi possível gerar sugestões.'; }
    }

    async function loadCommentProfiles() {
        state.commentProfiles = new Map();
        try {
            const rows = await window.supabaseFetch('/rpc/condomit_assembly_comment_profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_assembly_id: state.id })
            });
            (Array.isArray(rows) ? rows : []).forEach((profile) => {
                const email = String(profile?.email || '').trim().toLowerCase();
                if (email) state.commentProfiles.set(email, profile);
            });
        } catch (error) {
            console.warn('Fotos dos autores dos comentários indisponíveis:', error);
        }
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

    function renderAwaitingSignature() {
        const hero = document.getElementById('assemblySummaryHero');
        if (hero) hero.innerHTML = `<div class="summary-pending-publication" role="status">
            <i class="fas fa-lock" aria-hidden="true"></i>
            <h2>Ata em revisão</h2>
            <p>Os detalhes, as gravações, as votações e os comentários desta assembleia estarão disponíveis aos moradores somente após a revisão, aprovação e assinatura da ata pelo síndico.</p>
            <button type="button" class="summary-secondary" id="retryAssemblyPublication0761"><i class="fas fa-rotate-right"></i> Verificar publicação</button>
        </div>`;
        hero?.querySelector('#retryAssemblyPublication0761')?.addEventListener('click', () => location.reload());
        const tabs = document.querySelector('.summary-tabs');
        if (tabs) { tabs.hidden = true; tabs.style.display = 'none'; }
        document.querySelectorAll('[data-summary-panel]').forEach(panel => { panel.hidden = true; panel.style.display = 'none'; });
    }

    async function reopenMinutesForReview() {
        if (currentUserRole() !== 'sindico' || state.minutesDraft?.status !== 'aprovada') return false;
        const confirmed = await window.showConfirm?.({
            title: 'Reabrir a ata oficial',
            message: 'Esta ação retira a aprovação e a assinatura existente. Os detalhes deixarão de estar disponíveis aos moradores até uma nova revisão, aprovação e assinatura. Deseja continuar?',
            confirmText: 'Reabrir para correção', cancelText: 'Cancelar'
        });
        if (confirmed !== true) return false;
        try {
            const draft = await window.supabaseFetch('/rpc/condomit_review_assembly_minutes_054', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({target_assembly_id: state.id, reviewed_text: state.minutesDraft.body, approve_document: false})
            });
            state.minutesDraft = Array.isArray(draft) ? draft[0] : draft;
            state.signature = null;
            state.indirectDiscussion = null;
            state.indirectTopics = null;
            renderHero();
            renderMinutes();
            window.showToast?.('Ata reaberta. Gere ou corrija as manifestações e assine novamente após a aprovação.', 'warning');
            return true;
        } catch (error) {
            window.showToast?.(error?.message || 'Não foi possível reabrir a ata.', 'error');
            return false;
        }
    }

    async function generateIndirectSummary({automatic = false, useLocalAI = false, useRules = false} = {}) {
        if (state.indirectSummaryRunning || currentUserRole() !== 'sindico' || !state.detailsReleased || state.minutesDraft?.status === 'aprovada') return;
        if (!automatic) {
            const editor = document.getElementById('assemblyMinutesEditor074');
            if (editor?.value.trim() && editor.value.trim() !== (state.minutesDraft?.body || state.generatedMinutes).trim()) {
                const confirmed = await window.showConfirm?.({title:'Refazer resumo narrativo',message:'O novo resumo substituirá a redação atual do editor. Deseja prosseguir?',confirmText:'Gerar resumo',cancelText:'Cancelar'});
                if (confirmed === false) return;
            }
        }
        state.indirectSummaryRunning = true;
        state.indirectSummaryError = '';
        const currentEditor = document.getElementById('assemblyMinutesEditor074');
        const initialValue = currentEditor?.value || '';
        const initialBaseline = state.minutesDraft?.body || state.generatedMinutes;
        const hadChanges = initialValue.trim() !== initialBaseline.trim();
        const status = document.getElementById('assemblyMinutesIndirectStatus0761');
        if (status) status.textContent = 'Preparando a redação em discurso indireto a partir do Deepgram e das vozes reconhecidas...' ;
        try {
            const token = await window.resolveSupabaseAccessToken?.();
            if (!token) throw new Error('Sessão expirada. Entre novamente.');
            const resp = await fetch('/.netlify/functions/assembly-minutes-indirect', {
                method:'POST', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
                body:JSON.stringify({assembly_id: state.id, local_only:useLocalAI, provider: useRules ? 'rules' : 'claude'}),cache:'no-store'
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error || 'Não foi possível resumir a assembleia.');
            if (!Array.isArray(json.topics) || !json.topics.some(item => item.paragraphs?.length)) throw new Error('Nenhuma síntese por pauta foi produzida.');
            if (useLocalAI) {
                if (!window.CondomitLocalMinutesAI) throw new Error('Modelo local de IA não está disponível.');
                json.topics = await window.CondomitLocalMinutesAI.summarizeTopics(json.source_topics, {
                    model: document.getElementById('minutesAiModel0768')?.value || window.CondomitLocalMinutesAI.MODEL,
                    onProgress:message=>{ const label=document.getElementById('assemblyMinutesIndirectStatus0761'); if (label) label.textContent=message; }
                });
                json.method = 'webllm_qwen2_5_local';
                json.warning = 'IA executada no navegador, sem API de geração externa. Confira autoria, argumentos, valores e votações antes de aprovar.';
            }
            state.indirectTopics = json.topics.map(topic => ({id:topic.id,paragraphs:(topic.paragraphs || []).map(cleanFormalText).filter(Boolean)}));
            state.indirectDiscussion = state.indirectTopics.flatMap(topic => topic.paragraphs);
            state.indirectSummaryMethod = json.method;
            state.indirectObservacoes = Array.isArray(json.observacoes_revisao) ? json.observacoes_revisao : [];
            if (!state.indirectDiscussion.length) throw new Error('Resumo vazio.');
            const editorBeforeRender = document.getElementById('assemblyMinutesEditor074');
            const latestUserText = editorBeforeRender?.value || initialValue;
            const userChangedText = hadChanges || latestUserText !== initialValue;
            renderMinutes();
            const nextEditor = document.getElementById('assemblyMinutesEditor074');
            if (nextEditor && userChangedText) nextEditor.value = latestUserText;
            else if (nextEditor) nextEditor.value = state.generatedMinutes;
            if (!userChangedText) state.speakerRevisionPending = false;
            let savedAutomatically = false;
            if ((automatic || useLocalAI || !useRules) && !userChangedText && !state.signature && (useLocalAI || draftCanBeAutomaticallyReplaced(state.minutesDraft))) {
                try {
                    const saved = await window.supabaseFetch('/rpc/condomit_review_assembly_minutes_054', {
                        method: 'POST', headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({target_assembly_id: state.id, reviewed_text: state.generatedMinutes, approve_document: false})
                    });
                    state.minutesDraft = Array.isArray(saved) ? saved[0] : saved;
                    savedAutomatically = Boolean(state.minutesDraft?.body);
                } catch (saveError) {
                    console.warn('[ASSEMBLY MINUTES] Falha ao persistir síntese automática:', saveError);
                }
            }
            state.indirectSummaryError = '';
            const nextStatus = document.getElementById('assemblyMinutesIndirectStatus0761');
            if (nextStatus) nextStatus.textContent = `${json.warning || 'Síntese produzida em discurso indireto.'} ${savedAutomatically ? 'Minuta salva automaticamente. Confira e aprove somente após revisar.' : 'Confira e salve a minuta antes de aprovar.'} ${state.indirectObservacoes.length ? `${state.indirectObservacoes.length} sugestões de correção disponíveis para conferência abaixo.` : ''}`;
            if (!automatic) window.showToast?.(useLocalAI ? 'ATA gerada por IA local. Confira a revisão.' : useRules ? 'Minuta provisória por regras preparada.' : 'ATA redigida com Claude. Confira e aprove a minuta.', 'success');
        } catch (err) {
            state.indirectSummaryError = err?.message || 'Erro ao elaborar a síntese.';
            const output = document.getElementById('assemblyMinutesIndirectStatus0761');
            if (output) output.textContent = state.indirectSummaryError;
            if (!automatic) window.showToast?.(state.indirectSummaryError, 'warning');
        } finally {
            state.indirectSummaryRunning = false;
        }
    }

    function renderAll() {
        renderHero();
        renderMinutes();
        renderPolls();
        renderRecordings();
        startRecordingRefresh();
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
                <span><i class="fas fa-video"></i> ${state.recordings.length} ${state.recordings.length === 1 ? 'gravação concluída' : 'gravações concluídas'}${(state.recordingStatuses || []).filter(row => row.status !== 'concluido').length ? ` · ${(state.recordingStatuses || []).filter(row => row.status !== 'concluido').length} pendente(s) ou com falha` : ''}</span>
                <span><i class="fas fa-microphone-lines"></i> ${groupedDeepgramTranscripts().length ? `${groupedDeepgramTranscripts().length} manifestações registradas` : `${uniqueSpeechParticipants().length} participante${uniqueSpeechParticipants().length === 1 ? '' : 's'} com fala detectada`}</span>
            </div>
            <div class="summary-hero-actions">
                ${currentUserRole() === 'sindico' ? '<button type="button" id="generateAssemblyTasks027" class="summary-secondary"><i class="fas fa-list-check"></i> Gerar tarefas das decisões</button>' : ''}
                ${currentUserRole() === 'sindico' && state.minutesDraft?.status === 'aprovada' ? `<button type="button" id="signAssemblyMinutes049" class="summary-primary"><i class="fas fa-signature"></i> ${state.signature ? 'Corrigir assinatura' : 'Assinar ata'}</button>` : ''}
                ${state.signature && state.minutesDraft?.status === 'aprovada' ? `<span class="summary-signed-chip"><i class="fas fa-circle-check"></i> Ata assinada por ${esc(state.signature.signer_name || state.signature.signer_email || 'Síndico')}</span>` : ''}
                ${state.minutesDraft?.status === 'aprovada' || state.autoMinutesJob?.status === 'concluido' ? `<button type="button" id="printAssemblyMinutes049" class="summary-secondary"><i class="fas fa-print"></i> Imprimir ata</button>
                <button type="button" id="saveAssemblyMinutesPdf082" class="summary-secondary"><i class="fas fa-file-pdf"></i> Salvar em PDF</button>` : ''}
            </div>`;
        hero.querySelector('#generateAssemblyTasks027')?.addEventListener('click', generateAssemblyDecisionTasks);
        hero.querySelector('#signAssemblyMinutes049')?.addEventListener('click', signAssemblyMinutes);
        hero.querySelector('#printAssemblyMinutes049')?.addEventListener('click', printAssemblyMinutes);
        hero.querySelector('#saveAssemblyMinutesPdf082')?.addEventListener('click', saveAssemblyMinutesPdf);
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

        const approved = state.minutesDraft?.status === 'aprovada';
        const job=state.autoMinutesJob;
        const ready=approved || (job?.status==='concluido' && Boolean(String(job.generated_body||'').trim()));
        if(!ready) {
            state.renderedMinutesBody='';
            container.innerHTML=autoMinutesProgressMarkup();
            const awaiting=(state.recordingStatuses||[]).filter(row=>row.status==='concluido' && row.transcription_status!=='concluido');
            if(awaiting.length && window.CondomitTranscriptionProgress) {
                const progress=document.createElement('section');
                progress.className='assembly-transcript-summary0768';
                awaiting.forEach(row=>{const node=document.createElement('div');window.CondomitTranscriptionProgress.render(node,row);progress.append(node);});
                container.prepend(progress);
            }
            return;
        }
        const manuallyEdited=state.minutesDraft?.saved_by && state.minutesDraft.saved_by!=='sistema:claude'
            && Date.parse(state.minutesDraft.updated_at||0)>Date.parse(job?.finished_at||0);
        const rawDisplayText=approved || manuallyEdited
            ? String(state.minutesDraft?.body||'') : String(job?.generated_body||'');
        const displayText=window.CondomitMinutesNarrative?.stripLegacyHeadings(rawDisplayText) || rawDisplayText;
        state.generatedMinutes=displayText;
        state.renderedMinutesBody=displayText;
        const published = approved && Boolean(state.signature);
        const chairSignature = chair?.name || 'Síndico / Presidente da Assembleia';
        container.innerHTML = `
            <article class="formal-minutes-document" aria-label="Ata formal da assembleia">
                <header class="formal-minutes-heading">
                    <div class="formal-condo-name">${esc(condoName)}</div>
                    ${address ? `<div class="formal-condo-address">${esc(address)}</div>` : ''}
                    <h3>ATA Nº ${esc(String(state.minutesNumber || "A DEFINIR"))}/${esc(year)}</h3>
                    <div class="formal-minutes-subtitle">${esc(title)} · ${esc(assemblyType)}</div>
                </header>
                <div class="formal-minutes-body">${displayText.split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div>
                <footer class="formal-minutes-signatures">
                    ${state.signature && approved ? `
                    <div class="formal-signature formal-signature-electronic">
                        ${isSafeSignatureData(state.signature.signature_data) ? `<img class="assembly-signature-image" src="${esc(state.signature.signature_data)}" alt="Assinatura de ${esc(state.signature.signer_name || chairSignature)}">` : `<i class="fas fa-circle-check signature-verified-icon"></i>`}
                        <strong>${esc(state.signature.signer_name || chairSignature)}</strong>
                        <small>Assinatura interna Condomit (não certificada pelo gov.br) em ${esc(formatDateTime(state.signature.signed_at))}</small>
                        <small class="signature-code">Código de verificação: ${esc(String(state.signature.signature_code || '').slice(0, 18))}</small>
                    </div>` : `
                    <div class="formal-signature"><span class="signature-line"></span><strong>${esc(chairSignature)}</strong><small>Assinatura do Síndico / Presidência da Assembleia</small></div>`}
                </footer>
                <div class="formal-minutes-note"><i class="fas fa-shield-halved"></i> ${published ? 'Ata revisada, aprovada e assinada pelo síndico.' : approved ? 'Ata aprovada, aguardando assinatura do síndico para publicação aos moradores.' : 'MINUTA NÃO APROVADA: resumo narrativo e registros precisam de conferência humana.'}</div>
                ${currentUserRole() === 'sindico' && groupedDeepgramTranscripts().length && !window.CondomitMinutesNarrative?.hasNarrative(displayText) ? `<p class="minutes-incomplete-alert0763" role="alert">${approved ? 'A ata aprovada' : 'Esta minuta'} ainda não contém a síntese das falas identificadas no vídeo. ${approved ? 'Reabra a revisão' : 'Aguarde a geração automática pelo Claude'} para corrigir o texto antes da aprovação e assinatura.</p>` : ''}
            </article>
            ${currentUserRole() === 'sindico' ? `<section class="minutes-review-editor074">
              <h3><i class="fas fa-clipboard-check"></i> Revisão formal da ata</h3>
              <p>A gravação e a transcrição são documentos de apoio. Confirme data, presença, discussões, deliberações, quóruns e responsáveis. A transcrição automática é gerada em segundo plano diretamente do vídeo. Ela pode conter erros e deve ser conferida com o áudio original.</p>
              <textarea id="assemblyMinutesEditor074" rows="14" spellcheck="true" aria-label="Redigir ata para revisão">${esc(displayText)}</textarea>
              <div class="minutes-review-actions074">
                ${approved ? `<button type="button" class="summary-secondary" id="minutesReopen0763"><i class="fas fa-file-pen"></i> Reabrir para corrigir manifestações</button>` : ''}
                <button type="button" class="summary-secondary" id="minutesAiHelp074"><i class="fas fa-wand-magic-sparkles"></i> Selecionar trechos da transcrição</button>
                ${!approved ? `<button type="button" class="summary-secondary" id="minutesSave074">Salvar minuta</button>
                <button type="button" class="summary-primary" id="minutesApprove074">Aprovar ata revisada</button>` : ''}
              </div>

              ${state.speakerRevisionPending ? '<p role="alert" class="minutes-incomplete-alert0763">Uma voz foi identificada, mas a autoria ainda não pôde ser vinculada com segurança à minuta salva. Regenere a ATA antes de aprovar.</p>' : ''}
              ${!approved && missingAttributedSpeakers(displayText).length ? `<p role="alert" class="minutes-incomplete-alert0763">Atenção: a minuta ainda não atribui as manifestações a: ${esc(missingAttributedSpeakers(displayText).slice(0,5).join(', '))}. Gere novamente ou corrija antes de aprovar.</p>` : ''}
              <div class="minutes-ai-suggestions074" role="status">${esc(autoMinutesStatusMessage())}</div>
              ${!approved && state.autoMinutesJob?.status === 'concluido' && !state.autoMinutesJob?.saved_to_draft && state.autoMinutesJob?.generated_body && state.minutesDraft?.body !== state.autoMinutesJob?.generated_body ? `<button type="button" class="summary-secondary" id="minutesApplyAuto0771">Aplicar ATA automática à minuta existente (revisar antes)</button>` : ''}
              <div id="assemblyMinutesIndirectStatus0761" class="minutes-ai-suggestions074" role="status">${esc(state.indirectSummaryError || (state.indirectDiscussion ? 'Síntese narrativa gerada. Revise as informações antes de aprovar.' : 'A ATA será gerada automaticamente pelo Claude após a conclusão do Deepgram. Confira e assine somente após revisão.'))}</div>
              ${state.indirectObservacoes.length ? `<details class="minutes-evidence074"><summary>Conferir sugestões de correção da transcrição (${state.indirectObservacoes.length})</summary>
                <p>São ajustes sugeridos somente para a redação da ATA. O texto original do Deepgram permanece preservado. Confira cada termo com a gravação antes de aprovar.</p>
                <ul>${state.indirectObservacoes.slice(0,100).map(n => `<li>${esc(String(n.original||''))} → ${esc(String(n.sugerido||''))} (${esc(String(n.motivo||''))})</li>`).join('')}</ul>
              </details>` : ''}
              <div id="assemblyMinutesAiSuggestions074" class="minutes-ai-suggestions074" hidden></div>
              <details class="minutes-evidence074"><summary>Conferir transcrição do vídeo (${groupedDeepgramTranscripts().length} manifestações)</summary>
                <p>Trechos consecutivos da mesma voz são reunidos automaticamente. A autoria é vinculada aos registros de microfone quando há evidências suficientes; eventuais identificações pendentes são sinalizadas, sem inventar nomes.</p>
                ${speakerMappingControls(groupedDeepgramTranscripts())}
                ${groupedDeepgramTranscripts().slice(0,120).map((item, index) => `<div class="minutes-audio-segment"><p><strong>Manifestação ${index + 1}</strong> · ${esc(item.participant_name)}: ${esc(item.text)}</p>${item.audio_storage_path ? `<audio controls preload="none" aria-label="Ouvir áudio da manifestação ${index + 1}" data-transcript-audio-path="${esc(item.audio_storage_path)}"></audio><small class="minutes-audio-status">Preparando áudio protegido...</small>` : item.recordingId && item.start_seconds !== null && item.end_seconds !== null ? `<audio controls preload="none" aria-label="Ouvir fala no vídeo gravado" data-recording-clip-id="${esc(item.recordingId)}" data-clip-start="${esc(String(item.start_seconds))}" data-clip-end="${esc(String(item.end_seconds))}"></audio><small class="minutes-audio-status">Trecho retirado do vídeo da assembleia.</small>` : '<small>Áudio individual não disponível para este trecho.</small>'}</div>`).join('')}
                ${groupedDeepgramTranscripts().length > 120 ? `<p>Exibindo 120 de ${groupedDeepgramTranscripts().length} manifestações. Consulte o registro original para as demais.</p>` : ''}
              </details>
              <div class="minutes-external-signature074">
                <strong>Assinatura eletrônica gov.br — serviço externo</strong>
                <p>Exporte o documento aprovado em PDF, assine no portal oficial e valide o PDF resultante pelo ITI. Este fluxo não é uma autenticação gov.br integrada à Condomit.</p>
                <a href="https://assinador.iti.br/" target="_blank" rel="noopener noreferrer">Abrir assinador gov.br</a>
                <a href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">Validar assinatura no ITI</a>
                <label for="assemblyGovSignedFile074" class="minutes-signed-file-label074">Anexar PDF assinado (até 50 MB)</label>
                <input id="assemblyGovSignedFile074" type="file" accept="application/pdf" aria-label="PDF assinado externamente">
                <button type="button" class="summary-secondary" id="assemblyAttachGovPdf074">Salvar PDF assinado</button>
                <small>Arquivo anexado não significa que a assinatura foi validada. Verifique no portal VALIDAR do ITI.</small>
                ${state.signedDocuments.map(doc => `<div class="minutes-signed-document074"><i class="fas fa-file-pdf"></i> ${esc(doc.filename)} · ${esc(formatDateTime(doc.uploaded_at))} · Validação externa pendente <button type="button" data-signed-path074="${esc(doc.storage_path)}">Abrir PDF</button></div>`).join('')}
              </div>
            </section>` : ''}`;
        const oldProgress = container.querySelector('.assembly-transcript-summary0768');
        oldProgress?.remove();
        const eligibleVideos = (state.recordingStatuses || []).filter(row => row.status === 'concluido' && row.transcription_status !== 'concluido');
        if (eligibleVideos.length && window.CondomitTranscriptionProgress) {
            const progressPanel = document.createElement('section');
            progressPanel.className = 'assembly-transcript-summary0768';
            progressPanel.setAttribute('aria-label', 'Progresso de transcrição dos vídeos da assembleia');
            eligibleVideos.forEach(row => {
                const node = document.createElement('div');
                window.CondomitTranscriptionProgress.render(node,row);
                progressPanel.append(node);
            });
            container.prepend(progressPanel);
        }
        const evidence = container.querySelector('.minutes-evidence074');
        evidence?.addEventListener('toggle', () => { if (evidence.open) prepareTranscriptAudio(evidence); });
        evidence?.querySelectorAll('select[data-speaker-recording]')?.forEach(select => select.addEventListener('change', () => updateSpeakerMapping(select)));

        container.querySelector('#minutesApplyAuto0771')?.addEventListener('click', () => applyAutomaticMinutesDraft().catch(error => window.showToast?.(error.message,'error')));
        container.querySelector('#minutesReopen0763')?.addEventListener('click', reopenMinutesForReview);
        container.querySelector('#minutesSave074')?.addEventListener('click', () => saveMinutesReview(false));
        container.querySelector('#minutesApprove074')?.addEventListener('click', () => saveMinutesReview(true));
        container.querySelector('#minutesAiHelp074')?.addEventListener('click', requestMinutesAiSuggestions);
        container.querySelector('#assemblyAttachGovPdf074')?.addEventListener('click', uploadSignedGovPdf);
        container.querySelectorAll('[data-signed-path074]').forEach(button => button.addEventListener('click', () => openSignedDocument(button.dataset.signedPath074))); 
    }
    async function prepareTranscriptAudio(section) {
        const audios = Array.from(section.querySelectorAll('audio[data-transcript-audio-path]'));
        let position = 0;
        const worker = async () => {
            while (position < audios.length) {
                const audio = audios[position++];
                if (audio.dataset.audioReady === 'true') continue;
                const label = audio.nextElementSibling;
                try {
                    const path = audio.dataset.transcriptAudioPath || '';
                    if (!new RegExp(`^${Number(state.id)}/trechos/[a-f0-9-]+/[a-f0-9-]+\\.(wav|webm|mp4)$`, 'i').test(path)) throw new Error('Referência de áudio inválida.');
                    if (!window.supabase?.storage) throw new Error('Storage indisponível.');
                    const { data, error } = await window.supabase.storage.from('condomit-assembly-recordings').createSignedUrl(path, 3600);
                    if (error || !data?.signedUrl) throw new Error(error?.message || 'Não foi possível autorizar este áudio.');
                    audio.src = data.signedUrl;
                    audio.dataset.audioReady = 'true';
                    if (label) label.textContent = 'Reproduza a fala correspondente ao trecho transcrito.';
                } catch (error) {
                    if (label) label.textContent = error?.message || 'Áudio temporariamente indisponível.';
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, audios.length) }, worker));
        const clips = Array.from(section.querySelectorAll('audio[data-recording-clip-id]'));
        const signed = new Map();
        for (const clip of clips) {
            const recordingId = clip.dataset.recordingClipId;
            const recording = (state.recordings || []).find(row => String(row.id) === recordingId);
            const label = clip.nextElementSibling;
            if (!recording) { if (label) label.textContent = 'Vídeo correspondente indisponível.'; continue; }
            try {
                if (!signed.has(recordingId)) signed.set(recordingId, await createSignedRecordingUrl(recording));
                clip.src = signed.get(recordingId);
                const start = Number(clip.dataset.clipStart);
                const end = Number(clip.dataset.clipEnd);
                clip.addEventListener('loadedmetadata', () => {
                    if (Number.isFinite(start)) clip.currentTime = Math.max(0, start);
                });
                clip.addEventListener('play', () => {
                    if (Number.isFinite(start) && (clip.currentTime < start || clip.currentTime >= end)) clip.currentTime = Math.max(0, start);
                });
                clip.addEventListener('timeupdate', () => {
                    if (Number.isFinite(end) && clip.currentTime >= end) clip.pause();
                });
            } catch (error) {
                if (label) label.textContent = error?.message || 'Não foi possível abrir o áudio do vídeo.';
            }
        }
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

    function buildFormalTopicParagraphs() {
        const engine = window.CondomitMinutesTopics;
        if (!engine) return buildFormalDiscussionParagraphs().concat(state.polls.map(buildFormalPollParagraph));
        const topics = engine.buildTopics({
            rows:completedDeepgramTranscripts(), agenda:state.agenda, polls:state.polls
        });
        const results = [];
        const associatedPolls = new Set();
        for (const topic of topics) {
            const inferred = !topic.registered;
            const lead = inferred
                ? `Na sequência, foi tratado o assunto referente a ${sentenceFragment(topic.title).toLocaleLowerCase('pt-BR')}.`
                : `Em relação à pauta de ${sentenceFragment(topic.title)}, foram registrados os seguintes encaminhamentos e manifestações.`;
            results.push(lead);
            const generated = state.indirectTopics?.find(item => item.id === topic.id);
            let interventions = generated?.paragraphs || [];
            if (!interventions.length) {
                interventions = topic.contributions.map(person => window.CondomitMinutesNarrative?.paragraphForGroup({
                    text:person.text,participant_name:person.name || 'Participante não identificado',
                    participant_email:person.participant_email,participant_role:person.role
                })).filter(Boolean);
            }
            results.push(...interventions);
            for (const poll of topic.polls) {
                if (associatedPolls.has(String(poll.id))) continue;
                associatedPolls.add(String(poll.id));
                results.push(buildFormalPollParagraph(poll));
            }
            if (!interventions.length && !topic.polls.length && topic.registered) {
                results.push('Não foram identificadas manifestações ou deliberações sobre este item nos registros disponíveis.');
            }
        }
        if (!topics.length) return buildFormalDiscussionParagraphs();
        for (const poll of state.polls) {
            if (!associatedPolls.has(String(poll.id))) results.push(buildFormalPollParagraph(poll));
        }
        return results.filter(Boolean);
    }

    function buildFormalDiscussionParagraphs() {
        const paragraphs = [];
        const agendaNotes = state.agenda.map(item => ({
            title: cleanFormalText(item.title || 'Item de pauta'),
            notes: cleanFormalText(item.discussion_notes || '')
        })).filter(item => item.notes);
        if (Array.isArray(state.indirectDiscussion) && state.indirectDiscussion.length) {
            paragraphs.push(...state.indirectDiscussion);
        } else if (groupedDeepgramTranscripts().length) {
            const provisional = window.CondomitMinutesNarrative?.fallbackParagraphs(completedDeepgramTranscripts()) || [];
            if (provisional.length) paragraphs.push(...provisional);
            else paragraphs.push('A síntese narrativa das manifestações está pendente de revisão. O síndico deverá conferir a gravação e completar o conteúdo antes de aprovar a ata.');
        } else if (agendaNotes.length) {
            agendaNotes.forEach(item => paragraphs.push(`A pauta referente a ${item.title} foi registrada para apreciação, devendo o síndico confirmar as manifestações e eventuais deliberações a partir dos registros.`));
        } else {
            paragraphs.push('Não foi possível consolidar as manifestações dos participantes com segurança. A revisão da gravação e o preenchimento da síntese pelo síndico são necessários.');
        }
        return paragraphs;
    }

    function uniqueSpeechParticipants() {
        const map = new Map();
        state.speechActivities.forEach((row) => {
            const key = String(row.participant_email || row.participant_identity || row.participant_name || '').trim().toLowerCase();
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, {
                    name: cleanFormalText(row.participant_name || row.participant_email || 'Participante'),
                    email: String(row.participant_email || '').trim().toLowerCase()
                });
            }
        });
        return Array.from(map.values());
    }

    function formatHumanList(items) {
        const list = items.filter(Boolean);
        if (!list.length) return 'participantes da reunião';
        if (list.length === 1) return list[0];
        if (list.length === 2) return `${list[0]} e ${list[1]}`;
        return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
    }

    function formatDurationFormal(totalSeconds) {
        const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;
        if (minutes && remainder) return `${minutes} minuto${minutes === 1 ? '' : 's'} e ${remainder} segundo${remainder === 1 ? '' : 's'}`;
        if (minutes) return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
        return `${remainder} segundo${remainder === 1 ? '' : 's'}`;
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
        state.speechActivities.forEach((row) => { if (row.ended_at || row.started_at) candidates.push(row.ended_at || row.started_at); });
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
        if (!value) return 'Data não informada';
        const raw = String(value).slice(0, 10);
        const [year, month, day] = raw.split('-').map(Number);
        if (!year || !month || !day) return formatDate(value);
        const ordinalDays = {
            1:'primeiro',2:'segundo',3:'terceiro',4:'quarto',5:'quinto',6:'sexto',7:'sétimo',8:'oitavo',9:'nono',10:'décimo',
            11:'décimo primeiro',12:'décimo segundo',13:'décimo terceiro',14:'décimo quarto',15:'décimo quinto',16:'décimo sexto',17:'décimo sétimo',18:'décimo oitavo',19:'décimo nono',20:'vigésimo',
            21:'vigésimo primeiro',22:'vigésimo segundo',23:'vigésimo terceiro',24:'vigésimo quarto',25:'vigésimo quinto',26:'vigésimo sexto',27:'vigésimo sétimo',28:'vigésimo oitavo',29:'vigésimo nono',30:'trigésimo',31:'trigésimo primeiro'
        };
        const monthNames = ['','janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        return `Ao ${ordinalDays[day] || day} dia do mês de ${monthNames[month] || month} de ${year}`;
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
        } else if (await window.showConfirm({title:'Confirmar voto',message:'Confirmar este voto? Ele não poderá ser alterado.',confirmText:'Confirmar voto'})) {
            await execute();
        }
    }

    function normalizeSignedStorageUrl(value) {
        const signed = String(value || '').trim();
        if (!signed) return null;
        if (/^https?:\/\//i.test(signed)) return signed;
        const base = String(window.SUPABASE_URL || '').replace(/\/$/, '');
        if (!base) return null;
        if (signed.startsWith('/storage/v1/')) return `${base}${signed}`;
        if (signed.startsWith('/object/')) return `${base}/storage/v1${signed}`;
        if (signed.startsWith('storage/v1/')) return `${base}/${signed}`;
        if (signed.startsWith('object/')) return `${base}/storage/v1/${signed}`;
        return `${base}/storage/v1/${signed.replace(/^\/+/, '')}`;
    }

    function recordingMimeType(recordingRow) {
        const raw = String(recordingRow?.recording_url || '').toLowerCase();
        if (raw.includes('.mp4')) return 'video/mp4';
        if (raw.includes('.webm')) return 'video/webm';
        return 'video/webm';
    }

    async function createSignedRecordingUrl(recordingRow) {
        const raw = String(recordingRow?.recording_url || '').trim();
        if (!raw) throw new Error('A gravação não possui endereço de armazenamento.');
        if (!raw.startsWith('storage://')) return raw;
        const match = raw.match(/^storage:\/\/([^/]+)\/(.+)$/);
        if (!match) throw new Error('Endereço interno da gravação inválido.');
        const [, bucket, objectPath] = match;
        const token = await window.resolveSupabaseAccessToken?.().catch(() => null);
        if (!token) throw new Error('Sua sessão expirou. Entre novamente para reproduzir a gravação.');
        const endpoint = `${window.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: window.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ expiresIn: 3600 }),
            cache: 'no-store'
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(detail || `Não foi possível autorizar a reprodução (${response.status}).`);
        }
        const data = await response.json();
        const signed = data?.signedURL || data?.signedUrl || data?.signed_url;
        const normalized = normalizeSignedStorageUrl(signed);
        if (!normalized) throw new Error('O Storage não retornou uma URL de reprodução válida.');
        return normalized;
    }

    function renderRecordingPlayer(card, row, url) {
        const holder = card.querySelector('.recording-player-loading, .recording-player-wrap');
        if (!holder) return;
        holder.className = 'recording-player-wrap';
        holder.innerHTML = '';

        const video = document.createElement('video');
        video.className = 'assembly-recording-player';
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        video.disablePictureInPicture = true;
        video.setAttribute('controlsList', 'nodownload noremoteplayback');
        video.setAttribute('oncontextmenu', 'return false;');

        video.src = url;

        const note = document.createElement('small');
        note.className = 'recording-access-note';
        note.innerHTML = '<i class="fas fa-shield-halved"></i> Reprodução disponível somente nesta Ata para usuários autorizados.';

        const errorBox = document.createElement('div');
        errorBox.className = 'recording-playback-error';
        errorBox.hidden = true;

        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'summary-secondary recording-retry-btn';
        retryButton.innerHTML = '<i class="fas fa-rotate-right"></i> Tentar reproduzir novamente';
        retryButton.hidden = true;

        let retrying = false;

        const retryPlayback = async () => {
            if (retrying) return;
            retrying = true;
            retryButton.disabled = true;
            errorBox.hidden = true;
            try {
                const freshUrl = await createSignedRecordingUrl(row);
                if (video.src !== freshUrl) video.src = freshUrl;
                await video.play().catch(() => {});
            } catch (error) {
                errorBox.textContent = error?.message || 'Não foi possível renovar o acesso à gravação.';
                errorBox.hidden = false;
                retryButton.hidden = false;
            } finally {
                retrying = false;
                retryButton.disabled = false;
            }
        };

        video.addEventListener('error', () => {
            const messages = {
                1: 'A reprodução foi interrompida.',
                2: 'Falha de rede ao carregar a gravação.',
                3: 'O navegador não conseguiu decodificar esta gravação.',
                4: 'O formato desta gravação não é compatível com este navegador.'
            };
            errorBox.textContent = messages[video.error?.code] || 'Não foi possível reproduzir esta gravação.';
            errorBox.hidden = false;
            retryButton.hidden = false;
        });
        video.addEventListener('loadedmetadata', () => {
            errorBox.hidden = true;
            retryButton.hidden = true;
        });
        retryButton.addEventListener('click', retryPlayback);

        holder.append(video, note, errorBox, retryButton);

    }

    function formatBytes(bytes) {
        const n = Number(bytes || 0);
        if (!n) return 'Tamanho não informado';
        if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
        return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
    }

    function formatDuration(seconds) {
        const n = Math.max(0, Number(seconds || 0));
        const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = Math.floor(n % 60);
        return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min ${String(sec).padStart(2, '0')}s`;
    }

    let recordingRefreshInFlight = false;
    let recordingRefreshTimer = null;
    let recordingRefreshStartedAt = 0;
    const recordingPlayersLoading = new Set();

    function recordingNeedsRefresh(row) {
        if (['pendente', 'gravando'].includes(row.status)) return true;
        if (row.status !== 'concluido') return false;
        if (['pendente', 'enfileirado', 'processando'].includes(row.transcription_status)) return true;
        return row.transcription_status === 'falhou'
            && (row.transcription_model !== 'deepgram:nova-3' || Number(row.transcription_attempts || 0) < 5);
    }

    function recordingTranscriptionLabel(row) {
        const status = String(row.transcription_status || 'pendente');
        const model = String(row.transcription_model || '');
        if (status === 'concluido') {
            return model === 'deepgram:nova-3'
                ? 'Transcrição Deepgram concluída. Revise as falas com o vídeo original antes de aprovar a ata.'
                : 'Transcrição de versão anterior disponível. Para substituí-la pelo Deepgram, habilite o reprocessamento de gravações antigas no servidor.';
        }
        if (status === 'processando') return 'Preparando transcrição pelo Deepgram no servidor. Você pode fechar esta página.';
        if (status === 'enfileirado') return 'Transcrição Deepgram em andamento no servidor. Você pode fechar esta página.';
        if (status === 'falhou') {
            const attempts = Number(row.transcription_attempts || 0);
            const reason = String(row.transcription_error || 'Consulte os registros da função de transcrição.').slice(0, 200);
            return attempts >= 5 && model === 'deepgram:nova-3'
                ? `Transcrição indisponível após cinco tentativas: ${reason}`
                : `A transcrição apresentou uma falha e será tentada novamente pelo servidor: ${reason}`;
        }
        return 'Gravação pronta. A transcrição Deepgram será iniciada automaticamente no servidor.';
    }

    async function refreshRecordingStatus() {
        if (recordingRefreshInFlight || document.hidden) return;
        if (!(state.recordingStatuses || []).some(recordingNeedsRefresh)
            && ((state.recordingStatuses || []).length || Date.now() - recordingRefreshStartedAt > 300000)) return;
        recordingRefreshInFlight = true;
        try {
            const incomplete = !state.recordingStatuses.length
                || state.recordingStatuses.some(row => ['pendente', 'gravando', 'falhou'].includes(row.status));
            let statuses = null;
            if (incomplete) {
                const token = await window.resolveSupabaseAccessToken?.();
                if (token) {
                    const result = await fetch('/.netlify/functions/assembly-recording-reconcile', {
                        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ assembly_id: Number(state.id) }), cache: 'no-store'
                    });
                    if (result.ok) {
                        const verified = await result.json();
                        statuses = new Map((verified.recordings || []).map(item => [String(item.recording_id), item]));
                    }
                }
            }
            const rows = await fetchRows(`/assembly_recordings?select=*&assembly_id=eq.${state.id}&order=started_at.asc`);
            const previous = new Map(state.recordingStatuses.map(row => [String(row.id), row]));
            const recordingChanged = rows.some(row => {
                const earlier = previous.get(String(row.id));
                return !earlier || earlier.status !== row.status
                    || earlier.transcription_status !== row.transcription_status
                    || earlier.transcription_model !== row.transcription_model
                    || Number(earlier.transcription_cursor_seconds || 0) !== Number(row.transcription_cursor_seconds || 0)
                    || Number(earlier.transcription_total_seconds || 0) !== Number(row.transcription_total_seconds || 0);
            });
            state.recordingStatuses = rows.map(row => ({ ...row, verification: statuses?.get(String(row.id)) || previous.get(String(row.id))?.verification || null }));
            state.recordings = rows.filter(row => row.status === 'concluido' && row.recording_url);
            const latestTranscripts = await fetchRows(`/assembly_transcripts?select=*&assembly_id=eq.${state.id}&order=spoken_at.asc`).catch(() => null);
            const transcriptsChanged = latestTranscripts && (latestTranscripts.length !== state.transcripts.length
                || latestTranscripts.some((row, index) => row.id !== state.transcripts[index]?.id || row.transcript !== state.transcripts[index]?.transcript || row.participant_name !== state.transcripts[index]?.participant_name || row.participant_email !== state.transcripts[index]?.participant_email));
            if (transcriptsChanged) state.transcripts = latestTranscripts;
            if (recordingChanged || transcriptsChanged) state.speakerAssignments = await loadSpeakerAssignments();
            if (recordingChanged || transcriptsChanged) {
                const editor = document.getElementById('assemblyMinutesEditor074');
                const previousEditorValue = editor && editor.value !== (state.minutesDraft?.body || state.generatedMinutes)
                    ? editor.value : null;
                if (state.assembly) renderMinutes();
                if (previousEditorValue !== null) {
                    const nextEditor = document.getElementById('assemblyMinutesEditor074');
                    if (nextEditor) nextEditor.value = previousEditorValue;
                }

            }
            if (state.assembly) renderHero();
            renderRecordings();
            if (!state.recordingStatuses.some(recordingNeedsRefresh)
                && (state.recordingStatuses.length || Date.now() - recordingRefreshStartedAt > 300000)) {
                clearInterval(recordingRefreshTimer);
                recordingRefreshTimer = null;
            }
        } catch (error) {
            console.warn('[ASSEMBLY RECORDING REFRESH]', String(error?.message || error));
        } finally {
            recordingRefreshInFlight = false;
        }
    }

    function startRecordingRefresh() {
        clearInterval(recordingRefreshTimer);
        recordingRefreshTimer = null;
        recordingRefreshStartedAt = Date.now();
        if ((state.recordingStatuses || []).length && !state.recordingStatuses.some(recordingNeedsRefresh)) return;
        queueMicrotask(() => refreshRecordingStatus().catch(() => {}));
        recordingRefreshTimer = setInterval(() => refreshRecordingStatus().catch(() => {}), 1600);
    }

    function renderRecordingUploadStatuses(container) {
        const unfinished = (state.recordingStatuses || []).filter(row => row.status !== 'concluido');
        let panel = container.querySelector(':scope > .assembly-upload-statuses');
        if (!unfinished.length) { panel?.remove(); return; }
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'assembly-upload-statuses';
            container.prepend(panel);
        }
        const live = new Set(unfinished.map(row => String(row.id)));
        panel.querySelectorAll('[data-upload-recording-id]').forEach(node => {
            if (!live.has(node.dataset.uploadRecordingId)) node.remove();
        });
        unfinished.forEach((row, index) => {
            const id = String(row.id);
            let item = Array.from(panel.querySelectorAll('[data-upload-recording-id]')).find(node => node.dataset.uploadRecordingId === id);
            if (!item) {
                item = document.createElement('div');
                item.dataset.uploadRecordingId = id;
                const heading = document.createElement('strong');
                heading.className = 'assembly-upload-status-heading';
                const progress = document.createElement('div');
                progress.className = 'assembly-upload-progress';
                item.append(heading, progress);
                panel.append(item);
            }
            item.querySelector('.assembly-upload-status-heading').textContent = `Gravação ${index + 1}`;
            window.CondomitUploadProgress?.render(item.querySelector('.assembly-upload-progress'), row);
            let transcript = item.querySelector('.recording-transcription-progress0768');
            if (!transcript) { transcript=document.createElement('div'); transcript.className='recording-transcription-progress0768'; item.append(transcript); }
            if (row.status === 'concluido') window.CondomitTranscriptionProgress?.render(transcript,row);
            else transcript.replaceChildren();
            if (row.status === 'falhou' && row.verification?.diagnostic) {
                const label = item.querySelector('.assembly-upload-label');
                if (label) label.textContent = row.verification.diagnostic;
            }
        });
    }

    function renderRecordings() {
        const container = document.getElementById('assemblyRecordings');
        if (!container) return;
        const rows = state.recordings || [];
        const placeholders = container.querySelectorAll(':scope > .summary-empty, :scope > #refreshAssemblyRecordings079');
        if (!rows.length) {
            const statuses = (state.recordingStatuses || []).map(row => String(row?.status || '').toLowerCase());
            const waiting = statuses.some(status => ['pendente', 'gravando'].includes(status));
            const failed = statuses.includes('falhou');
            const unavailable = state.recordingStatuses?.some(row => row.status === 'concluido');
            const diagnosis = (state.recordingStatuses || []).find(row => row.status === 'falhou' && row.verification?.diagnostic)?.verification?.diagnostic;
            const message = waiting ? 'O vídeo MP4 está sendo finalizado pelo LiveKit. Esta tela se atualiza automaticamente, independentemente da transcrição.' : failed
                ? (diagnosis || 'O LiveKit não concluiu esta gravação. Confira o Egress e o armazenamento S3; se houver backup, ele poderá ser recuperado.') : unavailable
                ? 'Vídeo registrado no banco, mas ainda sem endereço de reprodução.' : 'Nenhuma gravação disponível até o momento.';
            if (!container.querySelector(':scope > .summary-empty')) {
                container.innerHTML = `<div class="summary-empty">${message}</div><button class="summary-secondary" type="button" id="refreshAssemblyRecordings079"><i class="fas fa-rotate-right"></i> Verificar gravações novamente</button>`;
                container.querySelector('#refreshAssemblyRecordings079')?.addEventListener('click', () => refreshRecordingStatus().catch(() => {}));
            } else container.querySelector(':scope > .summary-empty').textContent = message;
            renderRecordingUploadStatuses(container);
            return;
        }
        placeholders.forEach(element => element.remove());
        renderRecordingUploadStatuses(container);
        const wanted = new Set(rows.map(row => String(row.id)));
        container.querySelectorAll(':scope > .recording-card[data-recording-id]').forEach(card => {
            if (!wanted.has(card.dataset.recordingId)) card.remove();
        });
        rows.forEach((row, index) => {
            const id = String(row.id);
            let card = Array.from(container.querySelectorAll(':scope > .recording-card[data-recording-id]')).find(item => item.dataset.recordingId === id);
            if (!card) {
                card = document.createElement('article');
                card.className = 'recording-card';
                card.dataset.recordingId = id;
                card.innerHTML = `<div class="recording-card-head"><div><strong><i class="fas fa-video"></i> Gravação ${index + 1}</strong><small class="recording-details"></small></div></div><p class="recording-transcription-status" role="status"></p><div class="recording-player-loading"><i class="fas fa-spinner fa-spin"></i> Preparando reprodução segura...</div>`;
                container.append(card);
            }
            const details = card.querySelector('.recording-details');
            if (details) details.textContent = `${row.started_at ? new Date(row.started_at).toLocaleString('pt-BR') : 'Horário não informado'} • ${formatDuration(row.duration_seconds)} • ${formatBytes(row.file_size_bytes)}`;
            const status = card.querySelector('.recording-transcription-status');
            if (status) status.textContent = recordingTranscriptionLabel(row);
            let transcript = card.querySelector('.recording-transcription-progress0768');
            if (!transcript) { transcript=document.createElement('div'); transcript.className='recording-transcription-progress0768'; status?.after(transcript); }
            window.CondomitTranscriptionProgress?.render(transcript,row);
            const holder = card.querySelector('.recording-player-loading');
            if (holder && !recordingPlayersLoading.has(id)) {
                recordingPlayersLoading.add(id);
                createSignedRecordingUrl(row).then(url => {
                    if (card.isConnected) renderRecordingPlayer(card, row, url);
                }).catch(error => {
                    if (card.isConnected) {
                        holder.className = 'recording-player-wrap';
                        const message = document.createElement('div');
                        message.className = 'summary-empty';
                        message.textContent = error?.message || 'Não foi possível autorizar a reprodução.';
                        const retry = document.createElement('button');
                        retry.type = 'button';
                        retry.className = 'summary-secondary';
                        retry.textContent = 'Tentar reproduzir';
                        retry.addEventListener('click', async () => {
                            retry.disabled = true;
                            try { renderRecordingPlayer(card, row, await createSignedRecordingUrl(row)); }
                            catch (problem) { message.textContent = problem.message || 'Falha na reprodução.'; retry.disabled = false; }
                        });
                        holder.replaceChildren(message, retry);
                    }
                }).finally(() => recordingPlayersLoading.delete(id));
            }
        });
    }

    function renderComments() {
        const container = document.getElementById('assemblyPostComments');
        if (!container) return;
        const roots = state.comments
            .filter((comment) => !comment?.parent_comment_id)
            .sort((left, right) => safeTime(left.created_at) - safeTime(right.created_at));
        container.innerHTML = roots.length
            ? roots.map((comment) => renderCommentCard(comment, 0)).join('')
            : '<div class="summary-empty">Nenhum comentário publicado.</div>';
    }

    function getCommentChildren(parentId) {
        return state.comments
            .filter((comment) => String(comment?.parent_comment_id || '') === String(parentId))
            .sort((left, right) => safeTime(left.created_at) - safeTime(right.created_at));
    }

    function getCommentProfile(comment) {
        const email = String(comment?.user_email || '').trim().toLowerCase();
        return state.commentProfiles.get(email) || {};
    }

    function getCommentAuthor(comment) {
        const profile = getCommentProfile(comment);
        return profile.name || comment?.participant_name || comment?.user_email || 'Usuário';
    }

    function getCommentPhoto(comment) {
        const profile = getCommentProfile(comment);
        return String(profile.profile_photo || '').trim();
    }

    function getCommentVotes(commentId) {
        const rows = (Array.isArray(state.commentVotes) ? state.commentVotes : []).filter((vote) => String(vote.comment_id) === String(commentId));
        const currentEmail = String(state.user?.email || '').trim().toLowerCase();
        return {
            likes: rows.filter((vote) => vote.vote_type === 'like').length,
            dislikes: rows.filter((vote) => vote.vote_type === 'dislike').length,
            currentVote: (rows.find((vote) => String(vote.user_email || '').trim().toLowerCase() === currentEmail) || {}).vote_type || ''
        };
    }

    function renderCommentCard(comment, depth) {
        const commentId = String(comment?.id || '');
        const author = getCommentAuthor(comment);
        const photo = getCommentPhoto(comment);
        const avatar = photo
            ? `<img src="${esc(photo)}" alt="Foto de ${esc(author)}" loading="lazy">`
            : `<span>${esc(initials(author))}</span>`;
        const children = getCommentChildren(comment.id);
        const expanded = state.expandedReplyIds.has(commentId);
        const votes = getCommentVotes(comment.id);
        const replyForm = state.replyComposerFor === commentId
            ? `<div class="comment-reply-form" data-parent-id="${esc(commentId)}">
                    <textarea maxlength="1000" rows="3" placeholder="Escreva uma resposta..."></textarea>
                    <div class="comment-reply-actions">
                        <button type="button" class="ghost-btn compact-btn" data-comment-action="cancel-reply" data-comment-id="${esc(commentId)}">Cancelar</button>
                        <button type="button" class="summary-primary compact-btn" data-comment-action="submit-reply" data-comment-id="${esc(commentId)}"><i class="fas fa-paper-plane"></i> Responder</button>
                    </div>
                </div>`
            : '';
        const toggleReplies = children.length
            ? `<button type="button" class="comment-action-btn comment-replies-toggle" data-comment-action="toggle-replies" data-comment-id="${esc(commentId)}">${expanded ? 'Ocultar respostas' : `View all ${children.length} replies`}</button>`
            : '';
        const repliesHtml = children.length && expanded
            ? `<div class="comment-replies">${children.map((child) => renderCommentCard(child, depth + 1)).join('')}</div>`
            : '';
        return `<article class="comment-card${depth ? ' is-reply' : ''}" data-comment-id="${esc(commentId)}">
            <div class="comment-head">
                <div class="comment-author">
                    <div class="comment-avatar">${avatar}</div>
                    <div class="comment-author-meta">
                        <strong>${esc(author)}</strong>
                        <span class="comment-date">${formatDateTime(comment.created_at)}</span>
                    </div>
                </div>
            </div>
            <p class="comment-text">${esc(comment.comment || '')}</p>
            <div class="comment-actions">
                <button type="button" class="comment-action-btn${votes.currentVote === 'like' ? ' active' : ''}" data-comment-action="like" data-comment-id="${esc(commentId)}" aria-label="Curtir comentário"><i class="far fa-thumbs-up"></i><span>${votes.likes}</span></button>
                <button type="button" class="comment-action-btn${votes.currentVote === 'dislike' ? ' active dislike' : ''}" data-comment-action="dislike" data-comment-id="${esc(commentId)}" aria-label="Não curtir comentário"><i class="far fa-thumbs-down"></i><span>${votes.dislikes}</span></button>
                <button type="button" class="comment-action-btn textual" data-comment-action="reply" data-comment-id="${esc(commentId)}"><i class="fas fa-reply"></i>Responder</button>
                ${toggleReplies}
            </div>
            ${replyForm}
            ${repliesHtml}
        </article>`;
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
                await createAssemblyComment(comment);
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

    function bindCommentActions() {
        document.getElementById('assemblyPostComments')?.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-comment-action]');
            if (!button) return;
            const action = button.dataset.commentAction;
            const commentId = button.dataset.commentId;
            if (!action || !commentId) return;
            if (action === 'reply') {
                state.replyComposerFor = state.replyComposerFor === commentId ? null : commentId;
                state.expandedReplyIds.add(commentId);
                renderComments();
                return;
            }
            if (action === 'cancel-reply') {
                state.replyComposerFor = null;
                renderComments();
                return;
            }
            if (action === 'toggle-replies') {
                if (state.expandedReplyIds.has(commentId)) state.expandedReplyIds.delete(commentId);
                else state.expandedReplyIds.add(commentId);
                renderComments();
                return;
            }
            if (action === 'submit-reply') {
                const form = document.querySelector(`.comment-reply-form[data-parent-id="${CSS.escape(commentId)}"]`);
                const textarea = form?.querySelector('textarea');
                const replyText = String(textarea?.value || '').trim();
                if (!replyText) return;
                button.disabled = true;
                try {
                    await createAssemblyComment(replyText, commentId);
                    state.replyComposerFor = null;
                    state.expandedReplyIds.add(commentId);
                    renderComments();
                    window.showToast?.('Resposta publicada.', 'success');
                } catch (error) {
                    window.showToast?.(error?.message || 'Erro ao responder comentário.', 'error');
                } finally {
                    button.disabled = false;
                }
                return;
            }
            if (action === 'like' || action === 'dislike') {
                button.disabled = true;
                try {
                    await voteAssemblyComment(commentId, action);
                    renderComments();
                } catch (error) {
                    window.showToast?.(error?.message || 'Erro ao registrar sua reação.', 'error');
                } finally {
                    button.disabled = false;
                }
            }
        });
    }

    async function createAssemblyComment(comment, parentCommentId = null) {
        const email = String(state.user?.email || '').trim().toLowerCase();
        const rows = await window.supabaseFetch('/assembly_post_comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({
                assembly_id: state.id,
                cep: state.assembly.cep,
                user_email: email,
                participant_name: state.user?.name || email,
                comment,
                parent_comment_id: parentCommentId ? Number(parentCommentId) : null
            })
        });
        const saved = Array.isArray(rows) ? rows[0] : rows;
        if (!saved) throw new Error('O comentário não foi confirmado pelo banco.');
        state.comments.push(saved);
        if (email) {
            state.commentProfiles.set(email, {
                email,
                name: state.user?.name || email,
                profile_photo: state.user?.profilePhoto || state.user?.profile_photo || null
            });
        }
        return saved;
    }

    async function voteAssemblyComment(commentId, voteType) {
        await window.supabaseFetch('/rpc/condomit_vote_assembly_post_comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_comment_id: Number(commentId), target_vote: voteType })
        });
        state.commentVotes = await fetchRows(`/assembly_post_comment_votes?select=comment_id,user_email,vote_type,created_at,updated_at&assembly_id=eq.${state.id}`).catch(() => []);
    }

    function setupSignatureModal() {
        closeAssemblySignatureModal();
        document.getElementById('closeAssemblySignatureModal')?.addEventListener('click', closeAssemblySignatureModal);
        document.getElementById('cancelAssemblySignatureBtn')?.addEventListener('click', closeAssemblySignatureModal);
        document.getElementById('clearAssemblySignatureBtn')?.addEventListener('click', clearAssemblySignature);
        document.getElementById('confirmAssemblySignatureBtn')?.addEventListener('click', submitAssemblySignature);
        document.getElementById('assemblySignatureModal')?.addEventListener('click', (event) => {
            if (event.target?.id === 'assemblySignatureModal') closeAssemblySignatureModal();
        });
        setupSignatureCanvasEvents();
        window.addEventListener('resize', debounce(resizeAssemblySignatureCanvas, 120));
    }

    function setupSignatureCanvasEvents() {
        const canvas = document.getElementById('assemblySignatureCanvas');
        if (!canvas || canvas.dataset.signatureBound === '1') return;
        canvas.dataset.signatureBound = '1';
        canvas.tabIndex = 0;

        const start = (event) => {
            if (event.button != null && event.button !== 0) return;
            const point = getCanvasPoint(canvas, event);
            state.signaturePad.drawing = true;
            state.signaturePad.lastX = point.x;
            state.signaturePad.lastY = point.y;
            try { canvas.setPointerCapture?.(event.pointerId); } catch (_) {}
            event.preventDefault();
        };
        const move = (event) => {
            if (!state.signaturePad.drawing) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const point = getCanvasPoint(canvas, event);
            ctx.beginPath();
            ctx.moveTo(state.signaturePad.lastX, state.signaturePad.lastY);
            ctx.lineTo(point.x, point.y);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 2.4;
            ctx.strokeStyle = '#111827';
            ctx.stroke();
            state.signaturePad.lastX = point.x;
            state.signaturePad.lastY = point.y;
            state.signaturePad.hasInk = true;
            document.getElementById('assemblySignatureCanvasWrap')?.classList.add('has-signature');
            const errorEl = document.getElementById('assemblySignatureError');
            if (errorEl) errorEl.hidden = true;
            event.preventDefault();
        };
        const stop = (event) => {
            state.signaturePad.drawing = false;
            try { canvas.releasePointerCapture?.(event?.pointerId); } catch (_) {}
        };

        if ('PointerEvent' in window) {
            canvas.addEventListener('pointerdown', start);
            canvas.addEventListener('pointermove', move);
            canvas.addEventListener('pointerup', stop);
            canvas.addEventListener('pointercancel', stop);
            canvas.addEventListener('pointerleave', (event) => {
                if (!canvas.hasPointerCapture?.(event.pointerId)) stop(event);
            });
        } else {
            canvas.addEventListener('mousedown', start);
            canvas.addEventListener('mousemove', move);
            window.addEventListener('mouseup', stop);
            canvas.addEventListener('touchstart', start, { passive: false });
            canvas.addEventListener('touchmove', move, { passive: false });
            window.addEventListener('touchend', stop);
        }
    }

    function openAssemblySignatureModal() {
        const modal = document.getElementById('assemblySignatureModal');
        if (!modal) return;
        const title = modal.querySelector('.modal-header h3');
        const subtitle = modal.querySelector('.modal-header p');
        const confirm = document.getElementById('confirmAssemblySignatureBtn');
        if (title) title.textContent = state.signature ? 'Corrigir assinatura da ata' : 'Assinar ata';
        if (subtitle) subtitle.textContent = state.signature ? 'Desenhe a nova assinatura. Ao salvar, ela substituirá a assinatura anterior.' : 'Desenhe sua assinatura abaixo, como no livro de ocorrências.';
        if (confirm) confirm.innerHTML = `<i class="fas fa-signature"></i> ${state.signature ? 'Salvar nova assinatura' : 'Assinar ata'}`;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('signature-modal-open');
        state.signaturePad.drawing = false;
        state.signaturePad.hasInk = false;
        window.requestAnimationFrame(() => {
            resizeAssemblySignatureCanvas();
            clearAssemblySignature();
            document.getElementById('assemblySignatureCanvas')?.focus?.();
        });
    }

    function closeAssemblySignatureModal() {
        const modal = document.getElementById('assemblySignatureModal');
        if (modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('signature-modal-open');
        state.signaturePad.drawing = false;
        clearAssemblySignature();
    }

    function resizeAssemblySignatureCanvas() {
        const canvas = document.getElementById('assemblySignatureCanvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const snapshot = state.signaturePad.hasInk ? canvas.toDataURL('image/png') : null;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = Math.max(1, Math.round(rect.width * ratio));
        canvas.height = Math.max(1, Math.round(rect.height * ratio));
        canvas.dataset.cssWidth = String(rect.width);
        canvas.dataset.cssHeight = String(rect.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        if (snapshot) {
            const image = new Image();
            image.onload = () => {
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                ctx.drawImage(image, 0, 0, rect.width, rect.height);
            };
            image.src = snapshot;
        }
    }

    function clearAssemblySignature() {
        const canvas = document.getElementById('assemblySignatureCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        state.signaturePad.drawing = false;
        state.signaturePad.hasInk = false;
        document.getElementById('assemblySignatureCanvasWrap')?.classList.remove('has-signature');
        const errorEl = document.getElementById('assemblySignatureError');
        if (errorEl) errorEl.hidden = true;
    }

    function getCanvasPoint(canvas, event) {
        const source = event.touches?.[0] || event.changedTouches?.[0] || event;
        const rect = canvas.getBoundingClientRect();
        const cssWidth = Number(canvas.dataset.cssWidth || rect.width || 1);
        const cssHeight = Number(canvas.dataset.cssHeight || rect.height || 1);
        return {
            x: ((Number(source.clientX) - rect.left) / Math.max(rect.width, 1)) * cssWidth,
            y: ((Number(source.clientY) - rect.top) / Math.max(rect.height, 1)) * cssHeight
        };
    }

    async function submitAssemblySignature() {
        if (state.minutesDraft?.status !== 'aprovada') {
            window.showToast?.('A ata precisa ser revisada e aprovada antes da assinatura.', 'warning');
            return;
        }
        if (!state.signaturePad.hasInk) {
            const errorEl = document.getElementById('assemblySignatureError');
            if (errorEl) errorEl.hidden = false;
            window.showToast?.('Faça sua assinatura antes de concluir.', 'warning');
            return;
        }
        const button = document.getElementById('confirmAssemblySignatureBtn');
        const canvas = document.getElementById('assemblySignatureCanvas');
        if (!button || !canvas) return;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Assinando...';
        try {
            const result = await window.supabaseFetch('/rpc/condomit_sign_assembly_minutes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_assembly_id: state.id,
                    target_signature_data: canvas.toDataURL('image/png')
                })
            });
            state.signature = Array.isArray(result) ? result[0] : result;
            closeAssemblySignatureModal();
            renderHero();
            renderMinutes();
            window.showToast?.(state.signature ? 'Assinatura da ata salva com sucesso.' : 'Ata assinada eletronicamente com sucesso.', 'success');
        } catch (error) {
            window.showToast?.(error?.message || 'Não foi possível assinar a ata.', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = `<i class="fas fa-signature"></i> ${state.signature ? 'Corrigir assinatura' : 'Assinar ata'}`;
        }
    }

    async function signAssemblyMinutes() {
        if (currentUserRole() !== 'sindico') return;
        openAssemblySignatureModal();
    }

    function getPrintableMinutes() {
        const documentNode = document.querySelector('#assemblyMinutes .formal-minutes-document');
        if (!documentNode?.querySelector('.formal-minutes-body p')) {
            window.showToast?.('Não foi possível encontrar o texto da ata.', 'warning');
            return null;
        }
        return documentNode;
    }

    function printAssemblyMinutes() {
        if (!getPrintableMinutes()) return;
        document.body.classList.add('printing-assembly-minutes');
        window.addEventListener('afterprint', () => document.body.classList.remove('printing-assembly-minutes'), { once: true });
        window.print();
    }

    async function saveAssemblyMinutesPdf(event) {
        const documentNode = getPrintableMinutes();
        if (!documentNode) return;
        const button = event?.currentTarget;
        if (button) button.disabled = true;
        try {
            const { saveMinutesAsPdf } = await import('./minutes-pdf.js?v=082');
            const minutesNumber = String(state.minutesNumber || state.id).replace(/[^\dA-Za-z_-]/g, '');
            const year = String(state.assembly?.date || new Date().toISOString()).slice(0, 4);
            await saveMinutesAsPdf(documentNode, `Ata_Assembleia_${minutesNumber}_${year}.pdf`);
        } catch (error) {
            window.showToast?.(error?.message || 'Não foi possível gerar o PDF.', 'error');
        } finally {
            if (button?.isConnected) button.disabled = false;
        }
    }

    async function logout() {
        if (typeof window.performFullLogout === 'function') {
            await window.performFullLogout();
            return;
        }
        try { await window.supabase?.auth?.signOut?.(); } catch (_) {}
        try {
            sessionStorage.clear();
            localStorage.removeItem('condominiumPersistentUser');
            localStorage.removeItem('condominiumPersistentSession');
        } catch (_) {}
        window.location.href = '../inicio.html';
    }

    window.logout = logout;

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



    function debounce(fn, wait) {
        let timer = null;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = window.setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function isSafeSignatureData(value) {
        return /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(String(value || '').trim());
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
