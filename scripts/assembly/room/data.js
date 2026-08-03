import { state } from './state.js';
import { renderChatMessage, renderSimpleList } from './ui.js';

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
  if (!message) return;
  const cep = state.tokenInfo?.user?.cep || state.assembly?.cep;
  try {
    await window.AssemblyAPI.sendChatMessage(state.assemblyId, cep, message);
  } catch (e) {
    const supabase = ensureSupabase();
    const { error } = await supabase.from('assembly_chat_messages').insert({
      assembly_id: state.assemblyId,
      cep,
      user_email: state.tokenInfo?.user?.email,
      participant_name: state.tokenInfo?.user?.name,
      message
    });
    if (error) throw new Error(error.message || 'Erro ao enviar mensagem');
  }
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
  const cep = state.tokenInfo?.user?.cep || state.assembly?.cep;
  try {
    await window.AssemblyAPI.votePoll(pollId, optionId, state.assemblyId, cep);
  } catch (e) {
    const supabase = ensureSupabase();
    const { error } = await supabase.from('assembly_votes').insert({
      poll_id: pollId,
      option_id: optionId,
      assembly_id: state.assemblyId,
      cep,
      user_email: state.tokenInfo?.user?.email
    });
    if (error) throw new Error(error.message || 'Erro ao registrar voto');
  }
}

export async function toggleHand(raised) {
  const cep = state.tokenInfo?.user?.cep || state.assembly?.cep;
  try {
    await window.AssemblyAPI.raiseHand(state.assemblyId, cep);
    return;
  } catch (_) {}

  const supabase = ensureSupabase();
  const status = raised ? 'raised' : 'lowered';
  const now = new Date().toISOString();
  const { error } = await supabase.from('assembly_speaking_requests').insert({
    assembly_id: state.assemblyId,
    cep,
    user_email: state.tokenInfo?.user?.email,
    participant_name: state.tokenInfo?.user?.name,
    participant_role: state.tokenInfo?.user?.type,
    status,
    requested_at: now
  });
  if (error) throw new Error(error.message || 'Erro ao registrar mão levantada');
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
  const url = safeText(item?.file_url || item?.url || '');
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

export function buildPollItem(poll, options, onVote) {
  const node = document.createElement('div');
  node.className = 'panel-item';

  const info = document.createElement('div');
  info.className = 'panel-item-info';

  const title = document.createElement('div');
  title.className = 'panel-item-name';
  title.textContent = safeText(poll?.title || 'Votação');

  const sub = document.createElement('div');
  sub.className = 'panel-item-sub';
  sub.textContent = [safeText(poll?.status), safeText(poll?.description)].filter(Boolean).join(' • ');

  info.appendChild(title);
  info.appendChild(sub);

  node.appendChild(info);

  const status = safeText(poll?.status || '');
  if (status === 'aberta' && Array.isArray(options) && options.length) {
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '6px';
    actions.style.alignItems = 'stretch';
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-outline btn-sm';
      b.textContent = safeText(opt?.label || opt?.title || opt?.option_text || 'Opção');
      b.addEventListener('click', () => onVote?.(poll, opt));
      actions.appendChild(b);
    });
    node.appendChild(actions);
  }

  return node;
}

export async function refreshLists() {
  const [agenda, docs, polls, hands] = await Promise.all([
    loadAgenda().catch(() => []),
    loadDocuments().catch(() => []),
    loadPolls().catch(() => []),
    loadHands().catch(() => [])
  ]);

  const pollOptions = await loadPollOptions(polls.map(p => p.id)).catch(() => []);
  const optionsByPoll = new Map();
  pollOptions.forEach((opt) => {
    const list = optionsByPoll.get(opt.poll_id) || [];
    list.push(opt);
    optionsByPoll.set(opt.poll_id, list);
  });

  state.raisedHands.clear();
  hands
    .filter(h => safeText(h.status).toLowerCase() !== 'lowered')
    .forEach((h) => {
      if (h.user_email) state.raisedHands.set(h.user_email + '-' + state.assemblyId, h);
      if (h.identity) state.raisedHands.set(h.identity, h);
    });

  renderSimpleList('agenda-list', 'agenda-count', agenda, buildAgendaItem);
  renderSimpleList('docs-list', 'docs-count', docs, buildDocItem);

  renderSimpleList('polls-list', 'polls-count', polls, (poll) => {
    const opts = optionsByPoll.get(poll.id) || [];
    return buildPollItem(poll, opts, async (_poll, opt) => {
      await vote(poll.id, opt.id);
      if (window.AssemblyUtils?.showToast) window.AssemblyUtils.showToast('Voto registrado', 'success');
    });
  });
}

