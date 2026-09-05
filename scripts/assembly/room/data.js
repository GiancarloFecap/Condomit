import { state } from './state.js?v=0710';
import { renderChatMessage, renderSimpleList } from './ui.js?v=060';

function normalizeCepForDatabase(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length !== 8) {
    return '';
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function getAssemblyCep() {
  const candidates = [
    state.assembly?.cep,
    state.tokenInfo?.user?.cep,
    state.tokenInfo?.user?.condominium_cep,
    state.tokenInfo?.user?.condominium_id
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCepForDatabase(candidate);
    if (normalized) return normalized;
  }

  return '';
}

function requireAssemblyCep() {
  const cep = getAssemblyCep();

  if (!cep) {
    throw new Error('Não foi possível identificar o CEP da assembleia.');
  }

  return cep;
}

function escapeText(value) {
  if (window.AssemblyUtils?.escapeHtml) return window.AssemblyUtils.escapeHtml(String(value ?? ''));
  return String(value ?? '');
}

function safeText(value) {
  return String(value ?? '').trim();
}

function ensureSupabase() {
  if (!window.supabase) throw new Error('Supabase não inicializado');
  return window.supabase;
}

export async function loadAssembly() {
  if (!state.assemblyId) throw new Error('assemblyId ausente');
  if (typeof window.supabaseFetch !== 'function') throw new Error('supabaseFetch indisponível');
  const rows = await window.supabaseFetch(`/scheduled_assemblies?id=eq.${encodeURIComponent(String(state.assemblyId))}&limit=1`);
  const assembly = Array.isArray(rows) ? (rows[0] || null) : rows;
  if (!assembly) throw new Error('Assembleia não encontrada');
  state.assembly = assembly;
  return assembly;
}

export async function loadChatHistory() {
  if (!state.assemblyId) return [];
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('assembly_chat_messages')
    .select('*')
    .eq('assembly_id', state.assemblyId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message || 'Erro ao carregar chat');
  return Array.isArray(data) ? data : [];
}

export function subscribeChat() {
  const supabase = ensureSupabase();
  state.chatSubscription?.unsubscribe?.();
  const channel = supabase
    .channel(`assembly-chat-${state.assemblyId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'assembly_chat_messages', filter: `assembly_id=eq.${state.assemblyId}` },
      (payload) => {
        if (payload?.new) renderChatMessage(payload.new);
      }
    );
  state.chatSubscription = channel;
  channel.subscribe();
}

export async function sendChat(text) {
  const message = safeText(text).slice(0, 800);

  if (!message) {
    return null;
  }

  if (!window.AssemblyAPI?.sendChatMessage) {
    throw new Error('Serviço de chat da assembleia indisponível.');
  }

  const cep = requireAssemblyCep();

  return window.AssemblyAPI.sendChatMessage(
    state.assemblyId,
    cep,
    message
  );
}

export async function loadAgenda() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('assembly_agenda_items')
    .select('*')
    .eq('assembly_id', state.assemblyId)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message || 'Erro ao carregar pautas');
  return Array.isArray(data) ? data : [];
}

export function subscribeAgenda(onChange) {
  const supabase = ensureSupabase();
  state.agendaSubscription?.unsubscribe?.();
  const channel = supabase
    .channel(`assembly-agenda-${state.assemblyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assembly_agenda_items', filter: `assembly_id=eq.${state.assemblyId}` },
      () => onChange?.()
    );
  state.agendaSubscription = channel;
  channel.subscribe();
}

export async function loadDocuments() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('assembly_documents')
    .select('*')
    .eq('assembly_id', state.assemblyId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Erro ao carregar documentos');
  return Array.isArray(data) ? data : [];
}

export function subscribeDocuments(onChange) {
  const supabase = ensureSupabase();
  state.docsSubscription?.unsubscribe?.();
  const channel = supabase
    .channel(`assembly-docs-${state.assemblyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assembly_documents', filter: `assembly_id=eq.${state.assemblyId}` },
      () => onChange?.()
    );
  state.docsSubscription = channel;
  channel.subscribe();
}

export async function loadPolls() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('assembly_polls')
    .select('*')
    .eq('assembly_id', state.assemblyId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Erro ao carregar votações');
  return Array.isArray(data) ? data : [];
}

export async function loadPollOptions(pollIds) {
  const supabase = ensureSupabase();
  const ids = (Array.isArray(pollIds) ? pollIds : []).filter(Boolean);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('assembly_poll_options')
    .select('*')
    .in('poll_id', ids)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message || 'Erro ao carregar opções');
  return Array.isArray(data) ? data : [];
}

export function subscribePolls(onChange) {
  const supabase = ensureSupabase();
  state.pollsSubscription?.unsubscribe?.();
  const channel = supabase
    .channel(`assembly-polls-${state.assemblyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assembly_polls', filter: `assembly_id=eq.${state.assemblyId}` },
      () => onChange?.()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assembly_poll_options' },
      () => onChange?.()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assembly_votes' },
      () => onChange?.()
    );
  state.pollsSubscription = channel;
  channel.subscribe();
}

export async function vote(pollId, optionId) {
  const poll = await findPollById(pollId);

  if (poll && !isPollOpen(poll)) {
    throw new Error('Esta votação já foi encerrada ou expirada.');
  }

  if (!window.AssemblyAPI?.votePoll) {
    throw new Error('Serviço de votação indisponível.');
  }

  const cep = requireAssemblyCep();

  return window.AssemblyAPI.votePoll(
    pollId,
    optionId,
    state.assemblyId,
    cep
  );
}

export async function findPollById(pollId) {
  try {
    const list = await loadPolls();
    return list.find(p => String(p.id) === String(pollId)) || null;
  } catch (_) {
    return null;
  }
}

export function isPollOpen(poll) {
  if (!poll) return false;
  const status = safeText(poll.status || '').toLowerCase();
  if (status === 'encerrada' || status === 'cancelada') return false;
  const now = Date.now();
  if (poll.start_at) {
    const start = new Date(poll.start_at).getTime();
    if (!Number.isNaN(start) && now < start) return false;
  }
  if (poll.end_at) {
    const end = new Date(poll.end_at).getTime();
    if (!Number.isNaN(end) && now >= end) return false;
  }
  return true;
}

export function formatCountdown(targetISO) {
  if (!targetISO) return '';
  const target = new Date(targetISO).getTime();
  if (Number.isNaN(target)) return '';
  const diff = target - Date.now();
  if (diff <= 0) return 'Encerrada';
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

export async function createAgendaItem(payload) {
  if (!state.assemblyId) throw new Error('Assembly ausente');
  const cep = requireAssemblyCep();
  const title = safeText(payload?.title || '').slice(0, 255);
  if (!title) throw new Error('Informe o título da pauta.');
  const description = payload?.description != null ? safeText(payload.description) : null;
  const order = typeof payload?.display_order === 'number' ? payload.display_order : 0;
  const estimated = typeof payload?.estimated_minutes === 'number' && payload.estimated_minutes > 0
    ? payload.estimated_minutes
    : null;
  const supabase = ensureSupabase();
  const { data, error } = await supabase.from('assembly_agenda_items').insert({
    assembly_id: state.assemblyId,
    cep,
    title,
    description,
    display_order: order,
    estimated_minutes: estimated,
    status: 'nao_iniciada'
  }).select().limit(1);
  if (error) throw new Error(error.message || 'Erro ao criar pauta');
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function createDocument(payload) {
  if (!state.assemblyId) throw new Error('Assembly ausente');
  const cep = requireAssemblyCep();
  const title = safeText(payload?.title || '').slice(0, 255);
  if (!title) throw new Error('Informe o título do documento.');
  const url = safeText(payload?.document_url || payload?.url || '');
  if (!url) throw new Error('Documento não anexado.');
  const docType = ['edital', 'ata', 'pauta', 'balanco', 'contrato', 'projeto', 'outro']
    .includes(safeText(payload?.document_type || '').toLowerCase())
    ? safeText(payload.document_type).toLowerCase()
    : 'outro';
  const description = payload?.description != null ? safeText(payload.description) : null;
  const fileSize = typeof payload?.file_size_bytes === 'number' ? payload.file_size_bytes : null;
  const uploadedBy = state.tokenInfo?.user?.email || null;
  const supabase = ensureSupabase();
  const { data, error } = await supabase.from('assembly_documents').insert({
    assembly_id: state.assemblyId,
    cep,
    title,
    description,
    document_url: url,
    document_type: docType,
    file_size_bytes: fileSize,
    uploaded_by: uploadedBy
  }).select().limit(1);
  if (error) throw new Error(error.message || 'Erro ao enviar documento');
  return Array.isArray(data) && data.length ? data[0] : null;
}

export async function createPollWithDuration(payload, durationMinutes) {
  if (!state.assemblyId) throw new Error('Assembly ausente');
  const cep = requireAssemblyCep();
  const title = safeText(payload?.title || '').slice(0, 255);
  if (title.length < 3) throw new Error('Título da votação deve ter ao menos 3 caracteres.');
  const options = (Array.isArray(payload?.options) ? payload.options : [])
    .map(o => safeText(o).slice(0, 255))
    .filter(o => o.length >= 1);
  if (options.length < 2) throw new Error('Informe ao menos 2 opções para a votação.');
  const duration = Number(durationMinutes || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Informe uma duração válida para a votação.');
  }
  const description = payload?.description != null ? safeText(payload.description) : null;
  const createdBy = state.tokenInfo?.user?.email || null;
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + Math.round(duration * 60 * 1000));

  const supabase = ensureSupabase();
  const { data: polls, error: pollErr } = await supabase.from('assembly_polls').insert({
    assembly_id: state.assemblyId,
    cep,
    title,
    description,
    status: 'aberta',
    created_by: createdBy,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    show_results_immediately: true,
    allow_abstention: true,
    quorum_required: 1
  }).select().limit(1);
  if (pollErr) throw new Error(pollErr.message || 'Erro ao criar votação');
  const poll = Array.isArray(polls) && polls.length ? polls[0] : null;
  if (!poll) throw new Error('Erro ao criar votação (sem retorno).');

  const optionRows = options.map((optionText, idx) => ({
    poll_id: poll.id,
    cep,
    option_text: optionText,
    display_order: idx
  }));

  const { error: optsErr } = await supabase.from('assembly_poll_options').insert(optionRows);
  if (optsErr) {
    await supabase.from('assembly_polls').delete().eq('id', poll.id).catch(() => {});
    throw new Error(optsErr.message || 'Erro ao criar opções da votação');
  }
  return poll;
}

export async function toggleHand(_raised) {
  if (!window.AssemblyAPI?.raiseHand) {
    throw new Error('Serviço de mão levantada indisponível.');
  }

  const cep = requireAssemblyCep();

  return window.AssemblyAPI.raiseHand(
    state.assemblyId,
    cep
  );
}

export async function loadHands() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('assembly_speaking_requests')
    .select('*')
    .eq('assembly_id', state.assemblyId)
    .order('requested_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message || 'Erro ao carregar mãos levantadas');
  return Array.isArray(data) ? data : [];
}

export function subscribeHands(onChange) {
  const supabase = ensureSupabase();
  state.handSubscription?.unsubscribe?.();
  const channel = supabase
    .channel(`assembly-hands-${state.assemblyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assembly_speaking_requests', filter: `assembly_id=eq.${state.assemblyId}` },
      () => onChange?.()
    );
  state.handSubscription = channel;
  channel.subscribe();
}

export function buildAgendaItem(item) {
  const node = document.createElement('div');
  node.className = 'panel-item';
  const title = safeText(item?.title || 'Pauta');
  const desc = safeText(item?.description || '');
  const status = safeText(item?.status || '');

  const info = document.createElement('div');
  info.className = 'panel-item-info';

  const name = document.createElement('div');
  name.className = 'panel-item-name';
  name.textContent = title;

  const sub = document.createElement('div');
  sub.className = 'panel-item-sub';
  sub.textContent = [desc, status].filter(Boolean).join(' • ');

  info.appendChild(name);
  info.appendChild(sub);

  node.appendChild(info);
  return node;
}

export function buildDocItem(item) {
  const node = document.createElement('div');
  node.className = 'panel-item';
  const title = safeText(item?.title || 'Documento');
  const url = safeText(item?.document_url || item?.file_url || item?.url || '');
  const type = safeText(item?.document_type || '');

  const info = document.createElement('div');
  info.className = 'panel-item-info';

  const name = document.createElement('div');
  name.className = 'panel-item-name';
  name.textContent = title;

  const sub = document.createElement('div');
  sub.className = 'panel-item-sub';
  sub.textContent = type || (url ? 'Arquivo disponível' : 'Sem link');

  info.appendChild(name);
  info.appendChild(sub);

  if (url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'btn btn-outline btn-sm';
    a.textContent = 'Abrir';
    node.appendChild(info);
    node.appendChild(a);
    return node;
  }

  node.appendChild(info);
  return node;
}

export function buildPollItem(poll, options, onVote, getCurrentVotes) {
  const node = document.createElement('div');
  node.className = 'panel-item';
  node.style.flexDirection = 'column';
  node.style.alignItems = 'stretch';
  node.style.gap = '10px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.justifyContent = 'space-between';
  header.style.width = '100%';
  header.style.gap = '10px';

  const info = document.createElement('div');
  info.className = 'panel-item-info';
  info.style.minWidth = 0;

  const title = document.createElement('div');
  title.className = 'panel-item-name';
  title.textContent = safeText(poll?.title || 'Votação');

  const pollOpen = isPollOpen(poll);
  const subParts = [];
  const statusTxt = pollOpen ? 'Aberta' : 'Encerrada';
  subParts.push(statusTxt);
  if (poll?.description) subParts.push(safeText(poll.description));
  const sub = document.createElement('div');
  sub.className = 'panel-item-sub';
  sub.textContent = subParts.filter(Boolean).join(' • ');

  info.appendChild(title);
  info.appendChild(sub);

  header.appendChild(info);

  if (poll?.end_at) {
    const timer = document.createElement('span');
    timer.className = 'poll-timer';
    if (!pollOpen) timer.classList.add('ended');
    timer.dataset.countdown = String(poll.end_at);
    timer.innerHTML = `<i class="far fa-clock"></i><span>${pollOpen ? formatCountdown(poll.end_at) : 'Encerrada'}</span>`;
    header.appendChild(timer);
  }

  node.appendChild(header);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexDirection = 'column';
  actions.style.gap = '6px';
  actions.style.alignItems = 'stretch';
  actions.style.width = '100%';

  if (pollOpen && Array.isArray(options) && options.length) {
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-outline btn-sm';
      b.style.justifyContent = 'flex-start';
      b.style.textAlign = 'left';
      const label = safeText(opt?.label || opt?.title || opt?.option_text || 'Opção');
      b.textContent = label;
      b.addEventListener('click', () => onVote?.(poll, opt));
      actions.appendChild(b);
    });
  } else if (!pollOpen && Array.isArray(options) && options.length) {
    const votesMap = (typeof getCurrentVotes === 'function' ? getCurrentVotes(poll, options) : null) || {};
    const totals = (options || []).reduce((acc, o) => acc + (Number(votesMap[o.id] || votesMap[String(o.id)] || 0) || 0), 0);
    (options || []).forEach((opt) => {
      const row = document.createElement('div');
      row.className = 'poll-result-row';
      const label = safeText(opt?.label || opt?.title || opt?.option_text || 'Opção');
      const count = Number(votesMap[opt.id] || votesMap[String(opt.id)] || 0) || 0;
      const percent = totals > 0 ? Math.round((count / totals) * 100) : 0;
      const labelEl = document.createElement('div');
      labelEl.style.flex = '0 0 auto';
      labelEl.style.minWidth = '110px';
      labelEl.innerHTML = `${label} <span class="poll-option-badge">${count} voto${count === 1 ? '' : 's'} • ${percent}%</span>`;
      const barWrap = document.createElement('div');
      barWrap.className = 'poll-result-bar';
      const fill = document.createElement('span');
      fill.className = 'poll-result-fill';
      fill.style.width = `${percent}%`;
      barWrap.appendChild(fill);
      row.appendChild(labelEl);
      row.appendChild(barWrap);
      actions.appendChild(row);
    });
    if (totals === 0) {
      const empty = document.createElement('div');
      empty.className = 'panel-item-sub';
      empty.textContent = 'Nenhum voto registrado.';
      actions.appendChild(empty);
    }
  }

  if (actions.childElementCount) {
    node.appendChild(actions);
  }

  return node;
}

export async function loadVotes(pollIds) {
  const supabase = ensureSupabase();

  const ids = (Array.isArray(pollIds) ? pollIds : [])
    .filter(Boolean)
    .map(String);

  if (!ids.length) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc(
      'condomit_assembly_poll_results',
      {
        target_assembly_id: Number(state.assemblyId)
      }
    );

    if (error) {
      console.error(
        'Erro ao carregar resultados agregados da votação:',
        error
      );

      return [];
    }

    return (Array.isArray(data) ? data : [])
      .filter((row) => ids.includes(String(row.poll_id)))
      .map((row) => ({
        poll_id: row.poll_id,
        option_id: row.option_id,
        vote_count: Number(row.vote_count || 0),
        current_user_voted: row.current_user_voted === true
      }));
  } catch (error) {
    console.error(
      'Falha ao carregar resultados da votação:',
      error
    );

    return [];
  }
}

export async function refreshLists() {
  const [agenda, docs, polls, hands] = await Promise.all([
    loadAgenda().catch(() => []),
    loadDocuments().catch(() => []),
    loadPolls().catch(() => []),
    loadHands().catch(() => [])
  ]);

  const pollOptions = await loadPollOptions(polls.map(p => p.id)).catch(() => []);
  const votes = await loadVotes(polls.map(p => p.id)).catch(() => []);

  const optionsByPoll = new Map();
  pollOptions.forEach((opt) => {
    const list = optionsByPoll.get(opt.poll_id) || [];
    list.push(opt);
    optionsByPoll.set(opt.poll_id, list);
  });

  const votesByOption = new Map();
  const votesByPollAndUser = new Map();

  const currentUserEmail = state.tokenInfo?.user?.email
    ? String(state.tokenInfo.user.email).toLowerCase()
    : null;

  votes.forEach((v) => {
    const increment = Number(v.vote_count ?? 1) || 0;
    const optionKey = String(v.option_id);

    const currentCount =
      Number(votesByOption.get(optionKey) || 0);

    votesByOption.set(
      optionKey,
      currentCount + increment
    );

    if (
      v.current_user_voted === true &&
      v.poll_id &&
      currentUserEmail
    ) {
      votesByPollAndUser.set(
        `${String(v.poll_id)}::${currentUserEmail}`,
        true
      );
    } else if (
      v.poll_id &&
      v.user_email
    ) {
      votesByPollAndUser.set(
        `${String(v.poll_id)}::${String(v.user_email).toLowerCase()}`,
        true
      );
    }
  });
  const getCurrentVotes = (poll, _opts) => {
    const map = {};
    const opts = optionsByPoll.get(poll.id) || [];
    opts.forEach((o) => { map[String(o.id)] = votesByOption.get(String(o.id)) || 0; });
    return map;
  };
  state._votesByPollAndUser = votesByPollAndUser;
  state._currentUserEmail = currentUserEmail;

  state.raisedHands.clear();

  /*
   * A tabela guarda histórico de solicitações. Somente o registro
   * mais recente de cada participante define se a mão está ativa.
   *
   * Estados válidos do banco:
   * aguardando | autorizado | recusado | finalizado
   */
  const latestHandByUser = new Map();

  hands.forEach((hand) => {
    const key = safeText(
      hand.user_email ||
      hand.identity ||
      hand.id
    ).toLowerCase();

    if (!key) return;

    const previous = latestHandByUser.get(key);
    const previousTime = previous
      ? new Date(
          previous.requested_at ||
          previous.created_at ||
          0
        ).getTime()
      : -1;

    const currentTime = new Date(
      hand.requested_at ||
      hand.created_at ||
      0
    ).getTime();

    if (!previous || currentTime >= previousTime) {
      latestHandByUser.set(key, hand);
    }
  });

  const activeHandStatuses = new Set([
    'aguardando',
    'autorizado',
    // Compatibilidade com registros antigos antes da migration 009.
    'raised'
  ]);

  latestHandByUser.forEach((hand) => {
    const status = safeText(
      hand.status
    ).toLowerCase();

    if (!activeHandStatuses.has(status)) {
      return;
    }

    if (hand.user_email) {
      state.raisedHands.set(
        `${hand.user_email}-${state.assemblyId}`,
        hand
      );
    }

    if (hand.identity) {
      state.raisedHands.set(
        hand.identity,
        hand
      );
    }
  });

  renderSimpleList('agenda-list', 'agenda-count', agenda, buildAgendaItem);
  renderSimpleList('docs-list', 'docs-count', docs, buildDocItem);

  const votedBadgeAdded = new Set();
  renderSimpleList('polls-list', 'polls-count', polls, (poll) => {
    const opts = optionsByPoll.get(poll.id) || [];
    const item = buildPollItem(poll, opts, async (_poll, opt) => {
      const key = `${String(poll.id)}::${currentUserEmail}`;
      if (currentUserEmail && votesByPollAndUser.has(key)) {
        if (window.AssemblyUtils?.showToast) window.AssemblyUtils.showToast('Você já votou nesta votação.', 'warning');
        return;
      }
      await vote(poll.id, opt.id);
      if (window.AssemblyUtils?.showToast) window.AssemblyUtils.showToast('Voto registrado', 'success');
      votesByPollAndUser.set(key, true);
    }, getCurrentVotes);

    if (currentUserEmail) {
      const key = `${String(poll.id)}::${currentUserEmail}`;
      if (votesByPollAndUser.has(key) && !votedBadgeAdded.has(poll.id)) {
        votedBadgeAdded.add(poll.id);
        const info = item.querySelector('.panel-item-info');
        if (info) {
          const sub = info.querySelector('.panel-item-sub');
          if (sub) {
            const votedBadge = ' ✅ Seu voto registrado';
            if (!sub.textContent.includes('Seu voto registrado')) {
              sub.textContent = sub.textContent + votedBadge;
            }
          }
        }
      }
    }
    return item;
  });
}

