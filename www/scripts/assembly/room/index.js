import { state } from './state.js?v=0724';
import { connectToRoom, toggleCamera, toggleMicrophone, toggleScreenShare, disconnectRoom, canSwitchMobileCamera, switchMobileCamera } from './livekit.js?v=0724';
import { setHeader, setPanelOpen, setConnectionConnecting, showBanner, updateHandIndicators, renderParticipantsList, renderChatMessage } from './ui.js?v=077';
import { loadAssembly, loadChatHistory, subscribeChat, sendChat, refreshLists, refreshDocuments, subscribeAgenda, subscribeDocuments, subscribePolls, subscribeHands, toggleHand, createAgendaItem, createDocument, uploadAssemblyDocument, createPollWithDuration, formatCountdown, isPollOpen } from './data.js?v=077';
import { presenceJoin, presenceHeartbeat, presenceLeave } from './presence.js?v=0724';
import { startAssemblyTranscription, stopAssemblyTranscription, syncAssemblyTranscriptionWithMicrophone } from './transcription.js?v=0724';
import { startIncrementalTranscription, stopIncrementalTranscription } from './incremental-transcription.js?v=080';
const RECORDING_CHECK_MS = 20000;
let recordingCheckTimer = null;
let recordingSyncInFlight = false;
let serverRecordingActive = false;

function setRecordingStatus(message, isError = false) {
  const indicator = document.getElementById('recording-status');
  if (!indicator) return;
  indicator.hidden = !message;
  indicator.textContent = message || '';
  indicator.dataset.status = isError ? 'error' : 'info';
}

function isAssemblyRunning() {
  return String(state.assembly?.status || '').trim().toLowerCase() === 'em_andamento';
}

function mayStartAssembly() {
  const user = state.tokenInfo?.user || {};
  const role = String(user.type || user.user_type || user.role || '').toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  const organizer = String(state.assembly?.created_by || '').trim().toLowerCase();
  return role === 'sindico' || Boolean(email && organizer && email === organizer);
}

function hasScheduledStartPassed() {
  const day = String(state.assembly?.date || '').slice(0, 10);
  const time = String(state.assembly?.start_time || '00:00').slice(0, 5);
  if (!day) return true;
  const timestamp = new Date(`${day}T${time}:00-03:00`).getTime();
  return Number.isFinite(timestamp) && Date.now() >= timestamp;
}

async function startAssemblyOnHostEntry() {
  if (isAssemblyRunning() || String(state.assembly?.status || '') !== 'agendada' || !mayStartAssembly() || !hasScheduledStartPassed()) return;
  try {
    await window.AssemblyAPI.requestAssemblyAction('start', { assembly_id: Number(state.assemblyId) });
  } catch (error) {
    // Another manager may have started the meeting concurrently; refresh its status below.
    console.warn('[Assembly] Não foi possível iniciar automaticamente:', error?.message || error);
  }
  await loadAssembly();
  setHeader(state.assembly);
}

async function ensureServerRecording() {
  const token = await window.resolveSupabaseAccessToken?.();
  if (!token) throw new Error('Sua sessão expirou.');
  const response = await fetch('/.netlify/functions/assembly-recording', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assembly_id: Number(state.assemblyId) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'A gravação do servidor não foi iniciada.');
    error.status = response.status;
    throw error;
  }
  if (result.status === 'gravando') {
    setRecordingStatus('● REC · Gravação no servidor');
    return true;
  }
  if (result.status === 'falhou') {
    setRecordingStatus(result.error || 'Gravação falhou. A próxima tentativa será automática.', true);
  } else {
    setRecordingStatus('Preparando gravação no servidor…');
  }
  return false;
}

async function syncAssemblyRecording() {
  if (recordingSyncInFlight || !state.connected) return;
  recordingSyncInFlight = true;
  try {
    await loadAssembly();
    setHeader(state.assembly);
    await startAssemblyOnHostEntry();
    if (!isAssemblyRunning()) {
      setRecordingStatus('');
      return;
    }
    try {
      serverRecordingActive = await ensureServerRecording();
    } catch (error) {
      if (error.status === 409) {
        // The status can change between fetching the assembly and starting recording.
        setRecordingStatus('');
        return;
      }
      console.error('[Assembly Recording]', error);
      setRecordingStatus(error?.message || 'Gravação indisponível: confira LiveKit Egress, S3 e webhook na Netlify.', true);
    }
  } catch (error) {
    console.warn('[Assembly] Não foi possível atualizar a situação da sala:', error);
  } finally {
    recordingSyncInFlight = false;
    // Nunca interrompa as verificações: o Egress pode falhar APÓS iniciar.
  }
}

function beginRecordingStatusWatch() {
  if (recordingCheckTimer) clearInterval(recordingCheckTimer);
  recordingCheckTimer = setInterval(() => syncAssemblyRecording().catch(console.error), RECORDING_CHECK_MS);
  syncAssemblyRecording().catch(console.error);
}

function stopRecordingStatusWatch() {
  if (recordingCheckTimer) clearInterval(recordingCheckTimer);
  recordingCheckTimer = null;
}

function $(id) {
  return document.getElementById(id);
}

function getQueryParam(name) {
  if (window.AssemblyUtils?.getQueryParam) return window.AssemblyUtils.getQueryParam(name);
  return new URLSearchParams(window.location.search).get(name);
}

function resolveAssemblyId() {
  const queryId = String(getQueryParam('id') || '').trim();
  if (queryId) {
    try { sessionStorage.setItem('condomit_current_assembly_id', queryId); } catch (_) {}
    return queryId;
  }

  try {
    const cached = String(sessionStorage.getItem('condomit_current_assembly_id') || '').trim();
    if (cached) return cached;
  } catch (_) {}
  return '';
}

function toast(msg, type) {
  if (window.AssemblyUtils?.showToast) return window.AssemblyUtils.showToast(msg, type);
  if (typeof window.showToast === 'function') return window.showToast(msg, type || 'info');
  console.log('[Assembly Toast]', type ? `[${type}]` : '', msg);
}

async function getTokenInfo() {
  if (!window.AssemblyAPI?.requestLivekitToken) throw new Error('AssemblyAPI indisponível');
  return await window.AssemblyAPI.requestLivekitToken(state.assemblyId);
}


async function loadAssemblyProfilePhotos() {
  const directory = new Map();
  const ownUser = state.tokenInfo?.user || {};
  const ownEmail = String(ownUser.email || '').trim().toLowerCase();
  const ownPhoto = ownUser.profile_photo || ownUser.profilePhoto || '';
  if (ownEmail && ownPhoto) directory.set(ownEmail, ownPhoto);

  if (typeof window.supabaseFetch !== 'function') {
    state.profilePhotos = directory;
    return;
  }

  const requests = [
    window.supabaseFetch('/rpc/condomit_list_condo_residents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).catch(() => []),
    window.supabaseFetch('/rpc/condomit_list_chat_contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_role: 'sindico' })
    }).catch(() => []),
    window.supabaseFetch('/rpc/condomit_list_chat_contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_role: 'porteiro' })
    }).catch(() => [])
  ];

  const groups = await Promise.all(requests);
  groups.flat().forEach((row) => {
    const email = String(row?.email || '').trim().toLowerCase();
    const photo = row?.profile_photo || row?.profilePhoto || '';
    if (email && photo) directory.set(email, photo);
  });
  state.profilePhotos = directory;
}

function bindTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  const panels = document.querySelectorAll('.panel-section');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      const target = tab.dataset.tab;
      if (target === 'docs') refreshDocuments().catch(() => {});
      panels.forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === target);
      });
    });
  });
}

function bindModeratorMenu() {
  if (!state.permissions?.canManage && !state.permissions?.canRemoveParticipants) return;
  const menu = document.createElement('div');
  menu.className = 'call-moderation-menu';
  menu.setAttribute('role','menu');
  menu.hidden = true;
  menu.innerHTML = `
    <button type="button" role="menuitem" data-moderation="mute_microphone"><i class="fas fa-microphone-slash"></i> Silenciar microfone</button>
    <button type="button" role="menuitem" data-moderation="mute_camera"><i class="fas fa-video-slash"></i> Desativar câmera</button>
    <button type="button" role="menuitem" class="danger" data-moderation="remove"><i class="fas fa-user-xmark"></i> Retirar da assembleia</button>`;
  document.body.appendChild(menu);
  let identity = '';
  const hide = () => { menu.hidden = true; identity = ''; };
  for (const id of ['call-grid','participants-list']) {
    $(id)?.addEventListener('contextmenu', event => {
      const element = event.target.closest('[data-participant-identity]');
      const selected = element?.dataset.participantIdentity;
      if (!selected || selected === state.room?.localParticipant?.identity) return;
      event.preventDefault();
      identity = selected;
      menu.hidden = false;
      const width = 230, height = 148;
      menu.style.left = `${Math.max(8,Math.min(event.clientX,window.innerWidth-width-8))}px`;
      menu.style.top = `${Math.max(8,Math.min(event.clientY,window.innerHeight-height-8))}px`;
    });
  }
  document.addEventListener('click', event => { if (!menu.contains(event.target)) hide(); });
  document.addEventListener('keydown', event => {if(event.key==='Escape')hide();});
  menu.addEventListener('click', async event => {
    const button = event.target.closest('button[data-moderation]');
    if (!button || !identity) return;
    const targetIdentity = identity;
    const action = button.dataset.moderation;
    hide();
    if (action === 'remove') {
      const ok = await window.showConfirm({ title: 'Retirar participante', message: 'Deseja retirar este participante da chamada?',confirmText:'Retirar',cancelText:'Cancelar'});
      if (!ok) return;
    }
    try {
      const token = await window.resolveSupabaseAccessToken?.();
      if (!token) throw new Error('Sua sessão expirou.');
      const response = await fetch('/.netlify/functions/assembly-moderate',{
        method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({assembly_id:Number(state.assemblyId),identity:targetIdentity,action})
      });
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(result.error || 'Falha ao moderar participante.');
      toast(result.message || 'Ação concluída.','success');
    } catch(error) { toast(error.message || 'Falha na moderação.','error'); }
  });
}

function bindControls() {
  $('btn-mic')?.addEventListener('click', async () => {
    try { await toggleMicrophone(); syncAssemblyTranscriptionWithMicrophone(); } catch (e) { toast('Não foi possível alternar microfone', 'error'); }
  });
  $('btn-camera')?.addEventListener('click', async () => {
    try { await toggleCamera(); } catch (e) { toast('Não foi possível alternar câmera', 'error'); }
  });
  $('btn-switch-camera')?.addEventListener('click', async () => {
    const button = $('btn-switch-camera');
    if (button) button.disabled = true;
    try {
      await switchMobileCamera();
    } catch (e) {
      toast('Não foi possível trocar entre a câmera frontal e traseira', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  });
  $('btn-screen')?.addEventListener('click', async () => {
    try { await toggleScreenShare(); } catch (e) { toast('Não foi possível compartilhar tela', 'error'); }
  });
  $('btn-hand')?.addEventListener('click', async () => {
    try {
      const identity = state.tokenInfo?.identity;
      const raised = identity ? state.raisedHands.has(identity) : false;
      await toggleHand(!raised);
      await refreshLists().catch(() => {});
      updateHandIndicators(state.room);
      renderParticipantsList(state.room);
    } catch (e) {
      toast(e.message || 'Não foi possível atualizar a mão', 'error');
    }
  });
  $('btn-stop-screen-share')?.addEventListener('click', async () => {
    try { await toggleScreenShare(); } catch (_) {}
  });
  $('btn-toggle-panel')?.addEventListener('click', () => {
    setPanelOpen(!state.panelOpen);
  });
  $('btn-leave')?.addEventListener('click', async () => {
    const ok = await window.showConfirm({title:'Sair da assembleia', message:'Deseja sair? A gravação continuará no servidor enquanto houver participantes na sala.', confirmText:'Sair', cancelText:'Continuar na reunião'});
    if (!ok) return;
    stopRecordingStatusWatch();
    const flush = stopIncrementalTranscription();
    setRecordingStatus('Finalizando trechos de transcrição…');
    // A espera permite salvar áudio capturado antes de sair, sem impedir indefinidamente a saída.
    await flush;
    presenceLeave().catch(() => {});
    await Promise.race([disconnectRoom().catch(() => {}), new Promise(resolve => setTimeout(resolve, 800))]);
    window.location.replace('assembleia.html');
  });
  $('call-open-details')?.addEventListener('click', () => {
    window.location.href = `assembleia-detalhes.html?id=${encodeURIComponent(String(state.assemblyId))}`;
  });
}

function bindChat() {
  $('chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chat-input');
    const text = input?.value || '';
    if (!text.trim()) return;
    input.value = '';
    try {
      await sendChat(text);
    } catch (err) {
      toast(err.message || 'Erro ao enviar mensagem', 'error');
    }
  });
}

async function initChat() {
  const messages = await loadChatHistory().catch(() => []);
  messages.forEach((m) => {
    const fn = window.AssemblyUtils?.sanitizeMessage ? window.AssemblyUtils.sanitizeMessage(m.message || m.text || '') : (m.message || m.text || '');
    const msg = { ...m, message: fn };
    renderChatMessage(msg);
  });
  subscribeChat();
}

async function initLists() {
  await refreshLists().catch(() => {});
  const refresh = async () => {
    await refreshLists().catch(() => {});
    updateHandIndicators(state.room);
    renderParticipantsList(state.room);
  };
  subscribeAgenda(refresh);
  subscribeDocuments(() => refreshDocuments().catch(() => {}));
  subscribePolls(refresh);
  subscribeHands(refresh);
  startPollCountdownTick();
}

function startPollCountdownTick() {
  clearInterval(state._countdownTimer);
  state._countdownTimer = setInterval(() => {
    const timers = document.querySelectorAll('.poll-timer[data-countdown]');
    let needsRefresh = false;
    timers.forEach((el) => {
      const target = el.dataset.countdown;
      if (!target) return;
      const span = el.querySelector('span');
      if (!span) return;
      const newText = formatCountdown(target);
      const prevText = span.textContent || '';
      if (newText === 'Encerrada') {
        if (!el.classList.contains('ended')) {
          el.classList.add('ended');
          needsRefresh = true;
        }
      }
      if (newText !== prevText) {
          span.textContent = newText;
        }
    });
    if (needsRefresh) {
      refreshLists().catch(() => {});
    }
  }, 1000);
}

function isPrivilegedUser() {
  const user = state.tokenInfo?.user || null;
  const assembly = state.assembly || null;
  if (window.AssemblyPermissions?.canManageAgenda) {
    return !!window.AssemblyPermissions.canManageAgenda(user, assembly);
  }
  if (!user || !assembly) return false;
  const userType = String(user.type || user.role || '').toLowerCase();
  if (userType === 'sindico' || userType === 'admin') return true;
  const createdBy = String(assembly.created_by || assembly.organizer_id || '');
  const userId = String(user.id || user.email || '');
  return createdBy && userId === createdBy;
}

function showSimpleModal({ title, bodyHtml, onMount, onSubmit, submitLabel, cancelLabel, showSubmit }) {
  const root = $('modal-root');
  if (!root) return null;
  const overlay = document.createElement('div');
  overlay.className = 'simple-modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'simple-modal';

  const header = document.createElement('div');
  header.className = 'simple-modal-header';
  const h3 = document.createElement('h3');
  h3.className = 'simple-modal-title';
  h3.textContent = title || 'Modal';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'simple-modal-close';
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  header.appendChild(h3);
  header.appendChild(closeBtn);
  modal.appendChild(header);

  const body = document.createElement('div');
  body.className = 'simple-modal-body';
  if (typeof bodyHtml === 'string') body.innerHTML = bodyHtml;
  else if (bodyHtml instanceof Node) body.appendChild(bodyHtml);
  modal.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'simple-modal-footer';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-ghost';
  cancel.textContent = cancelLabel || 'Cancelar';
  footer.appendChild(cancel);
  let submit = null;
  if (showSubmit !== false) {
    submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'btn btn-primary';
    submit.textContent = submitLabel || 'Confirmar';
    footer.appendChild(submit);
  }
  modal.appendChild(footer);

  overlay.appendChild(modal);
  root.appendChild(overlay);

  const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  closeBtn.addEventListener('click', close);
  cancel.addEventListener('click', close);

  if (typeof onMount === 'function') {
    try { onMount(body, { submit, close }); } catch (_) {}
  }
  if (submit && typeof onSubmit === 'function') {
    submit.addEventListener('click', async () => {
      try {
        const result = await onSubmit(body, { close });
        if (result !== false) close();
      } catch (err) {
          toast(err?.message || String(err || 'Erro'), 'error');
        }
    });
  }
  return { overlay, body, submit, close };
}

function bindRoomActions() {
  const canManage = isPrivilegedUser();
  if (canManage) {
    const btnAgenda = $('btn-add-agenda');
    const btnPoll = $('btn-add-poll');
    const btnDoc = $('btn-add-doc');
    if (btnAgenda) btnAgenda.style.display = 'inline-flex';
    if (btnPoll) btnPoll.style.display = 'inline-flex';
    if (btnDoc) btnDoc.style.display = 'inline-flex';
  }

  $('btn-add-agenda')?.addEventListener('click', openAddAgendaModal);
  $('btn-add-poll')?.addEventListener('click', openAddPollModal);
  $('btn-add-doc')?.addEventListener('click', openAddDocModal);
}

function openAddAgendaModal() {
  const bodyHtml = `
    <div class="field">
      <label for="agenda-title">Título da pauta *</label>
      <input id="agenda-title" type="text" maxlength="255" placeholder="Ex: Aprovação da reforma do playground" />
    </div>
    <div class="inline-fields">
      <div class="field">
        <label for="agenda-estimated">Tempo estimado (min, opcional)</label>
        <input id="agenda-estimated" type="number" min="1" max="480" step="1" placeholder="Ex: 15" />
      </div>
      <div class="field">
        <label for="agenda-order">Ordem (opcional)</label>
        <input id="agenda-order" type="number" min="0" max="999" step="1" value="0" />
      </div>
    </div>
    <div class="field">
      <label for="agenda-description">Descrição (opcional)</label>
      <textarea id="agenda-description" maxlength="1000" placeholder="Detalhes ou observações sobre esta pauta..."></textarea>
    </div>
  `;
  showSimpleModal({
    title: 'Nova Pauta',
    bodyHtml,
    submitLabel: 'Criar Pauta',
    onSubmit: async (body) => {
      const title = String(body.querySelector('#agenda-title')?.value || '').trim();
      if (!title) { throw new Error('Informe o título da pauta.'); }
      const estimatedRaw = body.querySelector('#agenda-estimated')?.value;
      const orderRaw = body.querySelector('#agenda-order')?.value;
      const description = String(body.querySelector('#agenda-description')?.value || '').trim();
      const estimated = estimatedRaw && Number(estimatedRaw) > 0 ? Number(estimatedRaw) : null;
      const display_order = orderRaw && Number(orderRaw) >= 0 ? Number(orderRaw) : 0;
      await createAgendaItem({ title, description, estimated_minutes: estimated, display_order });
      toast('Pauta criada com sucesso.', 'success');
      await refreshLists().catch(() => {});
    }
  });
}

function openAddPollModal() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="field">
      <label for="poll-kind">Tipo de votação</label>
      <select id="poll-kind"><option value="regular">Votação geral</option><option value="sindico">Eleição de síndico</option></select>
    </div>
    <div class="field" id="poll-candidates-status" hidden role="status"></div>
    <div class="field">
      <label for="poll-title">Título da votação *</label>
      <input id="poll-title" type="text" maxlength="255" placeholder="Ex: Aprovação orçamento anual 2026" />
    </div>
    <div class="field">
      <label for="poll-description">Descrição (opcional)</label>
      <input id="poll-description" type="text" maxlength="255" placeholder="Resumo curto" />
    </div>
    <div class="inline-fields">
      <div class="field">
        <label for="poll-duration">Duração *</label>
        <select id="poll-duration">
          <option value="1">1 minuto</option>
          <option value="3">3 minutos</option>
          <option value="5" selected>5 minutos</option>
          <option value="10">10 minutos</option>
          <option value="15">15 minutos</option>
          <option value="30">30 minutos</option>
          <option value="60">1 hora</option>
        </select>
      </div>
      <div class="field">
        <label>&nbsp;</label>
        <button type="button" class="btn btn-secondary" id="btn-add-option" style="align-self:flex-start;justify-content:center;"><i class="fas fa-plus"></i> Opção</button>
      </div>
    </div>
    <div class="field">
      <label>Opções (mínimo 2)</label>
      <div class="chip-list" id="poll-options-list"></div>
    </div>
  `;

  const list = body.querySelector('#poll-options-list');
  const addOptionRow = (initialValue) => {
    const row = document.createElement('div');
    row.className = 'chip-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 255;
    input.placeholder = 'Texto da opção';
    if (initialValue) input.value = initialValue;
    const del = document.createElement('button');
    del.type = 'button';
    del.innerHTML = '<i class="fas fa-trash"></i>';
    del.addEventListener('click', () => {
      const rows = list.querySelectorAll('.chip-row');
      if (rows.length <= 2) { toast('Mantenha ao menos 2 opções.', 'warning'); return; }
      if (row.parentNode) row.parentNode.removeChild(row);
    });
    row.appendChild(input);
    row.appendChild(del);
    list.appendChild(row);
    return input;
  };
  addOptionRow('Sim');
  addOptionRow('Não');
  body.querySelector('#btn-add-option').addEventListener('click', () => {
    if (list.querySelectorAll('.chip-row').length >= 10) { toast('Máximo de 10 opções.', 'warning'); return; }
    addOptionRow('');
  });

  let electionCandidates = null;
  const kindSelect = body.querySelector('#poll-kind');
  const candidateStatus = body.querySelector('#poll-candidates-status');
  const addOptionBtn = body.querySelector('#btn-add-option');
  async function fetchCandidates() {
    const cep = String(state.assembly?.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) throw new Error('A assembleia não possui um CEP válido.');
    if (!window.supabase) throw new Error('Não foi possível conectar ao Supabase.');
    if (!state.assemblyId || !/^\d+$/.test(String(state.assemblyId))) throw new Error('Identificação da assembleia inválida.');
    const {data: users, error} = await window.supabase.rpc('condomit_assembly_election_candidates', {
      target_assembly_id: Number(state.assemblyId)
    });
    if (error) throw new Error('Não foi possível consultar candidatos deste CEP. Aplique a migration 053 no Supabase: ' + error.message);
    const names = (users || []).map(row => ({
      email:String(row.email || '').trim().toLowerCase(), name:String(row.name || '').trim()
    })).filter(row => row.email && row.name);
    if (!names.length) throw new Error('Não há usuários registrados e vinculados ao condomínio desta assembleia.');
    const counts = new Map(); names.forEach(row => counts.set(row.name,(counts.get(row.name)||0)+1));
    return names.map(row => counts.get(row.name)>1 ? `${row.name} (${row.email})` : row.name).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  }
  kindSelect.addEventListener('change', async () => {
    const election = kindSelect.value === 'sindico';
    candidateStatus.hidden = !election;
    addOptionBtn.disabled = election;
    list.querySelectorAll('.chip-row').forEach(row => row.querySelector('button')?.toggleAttribute('disabled', election));
    if (!election) {
      electionCandidates = null;
      candidateStatus.textContent = '';
      list.replaceChildren(); addOptionRow('Sim'); addOptionRow('Não');
      return;
    }
    electionCandidates = null;
    list.replaceChildren();
    body.querySelector('#poll-title').value = 'Eleição de síndico';
    candidateStatus.textContent = 'Carregando usuários vinculados ao CEP da assembleia...';
    try {
      const options = await fetchCandidates();
      if (kindSelect.value !== 'sindico') return;
      electionCandidates = options;
      options.forEach(option => { const input = addOptionRow(option); input.readOnly = true; input.setAttribute('aria-readonly','true'); });
      candidateStatus.textContent = `${options.length} candidato(s) do condomínio. A lista é obtida pelos vínculos registrados no Supabase.`;
    } catch (error) {
      electionCandidates = null;
      candidateStatus.textContent = error?.message || 'Não foi possível carregar os candidatos.';
      toast(candidateStatus.textContent, 'error');
    }
  });

  showSimpleModal({
    title: 'Nova Votação',
    bodyHtml: body,
    submitLabel: 'Iniciar Votação',
    onSubmit: async (b) => {
      const title = String(b.querySelector('#poll-title')?.value || '').trim();
      const description = String(b.querySelector('#poll-description')?.value || '').trim();
      const durationRaw = b.querySelector('#poll-duration')?.value;
      const options = Array.from(b.querySelectorAll('#poll-options-list .chip-row input')).map(i => String(i.value || '').trim()).filter(Boolean);
      if (title.length < 3) throw new Error('Título da votação muito curto (min 3).');
      if (options.length < 2) throw new Error('Informe ao menos 2 opções válidas.');
      if (kindSelect.value === 'sindico') {
        if (!electionCandidates || electionCandidates.length < 2) throw new Error('A eleição exige pelo menos dois candidatos registrados no condomínio atual.');
        const freshCandidates = await fetchCandidates();
        if (JSON.stringify(freshCandidates) !== JSON.stringify(electionCandidates)) throw new Error('A lista de candidatos foi alterada. Reabra a votação para atualizar a lista.');
      }
      const duration = Number(durationRaw);
      if (!duration || duration <= 0) throw new Error('Duração inválida.');
      await createPollWithDuration({ title, description: description || null, options }, duration);
      toast(`Votação criada. Duração: ${duration} minuto${duration === 1 ? '' : 's'}.`, 'success');
      await refreshLists().catch(() => {});
    }
  });
}

function openAddDocModal() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="field">
      <label for="doc-title">Título do documento *</label>
      <input id="doc-title" type="text" maxlength="255" placeholder="Ex: Ata assembleia 03/2026" />
    </div>
    <div class="inline-fields">
      <div class="field">
        <label for="doc-type">Tipo</label>
        <select id="doc-type">
          <option value="outro">Outro</option>
          <option value="ata">Ata</option>
          <option value="edital">Edital</option>
          <option value="pauta">Pauta</option>
          <option value="balanco">Balanço</option>
          <option value="contrato">Contrato</option>
          <option value="projeto">Projeto</option>
        </select>
      </div>
      <div class="field">
        <label for="doc-file">Arquivo *</label>
        <input id="doc-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv" style="padding: 8px;" />
      </div>
    </div>
    <div class="field">
      <label for="doc-description">Descrição (opcional)</label>
      <textarea id="doc-description" maxlength="1000" placeholder="Observações..."></textarea>
    </div>
    <div class="field" id="doc-file-preview-wrap" style="display:none;">
      <label>Arquivo selecionado</label>
      <div class="panel-item-sub" id="doc-file-preview"></div>
    </div>
  `;
  const fileInput = body.querySelector('#doc-file');
  const previewWrap = body.querySelector('#doc-file-preview-wrap');
  const preview = body.querySelector('#doc-file-preview');
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) { previewWrap.style.display = 'none'; return; }
    previewWrap.style.display = 'flex';
    preview.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB) — limite de 50 MB`;
  });

  showSimpleModal({
    title: 'Enviar Documento',
    bodyHtml: body,
    submitLabel: 'Enviar',
    onSubmit: async (b) => {
      const title = String(b.querySelector('#doc-title')?.value || '').trim();
      const type = String(b.querySelector('#doc-type')?.value || 'outro').trim().toLowerCase();
      const description = String(b.querySelector('#doc-description')?.value || '').trim();
      if (!title) throw new Error('Informe o título do documento.');
      const file = b.querySelector('#doc-file')?.files?.[0];
      if (!file) throw new Error('Selecione um arquivo.');
      const storageReference = await uploadAssemblyDocument(file);
      await createDocument({
        title,
        document_type: type,
        description: description || null,
        document_url: storageReference,
        file_size_bytes: file.size
      });
      toast('Documento enviado com sucesso.', 'success');
      await refreshLists().catch(() => {});
    }
  });
}

async function startHeartbeat() {
  clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = setInterval(() => {
    presenceHeartbeat().catch(() => {});
  }, 25000);
}

async function init() {
  try {
    setConnectionConnecting();
    bindTabs();
    bindControls();
    bindChat();

    const id = resolveAssemblyId();
    if (!id) throw new Error('ID da assembleia não informado');
     
     
    state.assemblyId = id;

    await loadAssembly();
    setHeader(state.assembly);

    const tokenInfo = await getTokenInfo();
    state.tokenInfo = tokenInfo;
    state.permissions = tokenInfo.permissions || {};
    await loadAssemblyProfilePhotos();

    bindRoomActions();
    bindModeratorMenu();

    await connectToRoom(tokenInfo);

     
     
    beginRecordingStatusWatch();

    const switchCameraButton = $('btn-switch-camera');
    if (switchCameraButton) {
      switchCameraButton.hidden = !(await canSwitchMobileCamera());
    }

    startAssemblyTranscription();
    startIncrementalTranscription();
    document.addEventListener('pointerdown', () => {
      window.dispatchEvent(new Event('condomit:assembly-allow-audio'));
    }, {passive:true});

    try { await presenceJoin(); } catch (_) {}
    startHeartbeat();

    await initChat();
    await initLists();
    state.documentsRefreshTimer = setInterval(() => {
      if (!document.hidden && document.querySelector('.panel-section[data-panel="docs"]')?.classList.contains('active')) {
        refreshDocuments().catch(() => {});
      }
    }, 12000);

    if (window.matchMedia('(max-width: 1024px)').matches) {
      setPanelOpen(false);
    }
  } catch (e) {
    console.error(e);
    showBanner(e.message || 'Erro ao entrar na assembleia', 'error');
    toast(e.message || 'Erro ao entrar', 'error');
  }
}

window.addEventListener('pagehide', () => {
  stopRecordingStatusWatch();
  stopIncrementalTranscription({waitForSave:false});
  clearInterval(state.documentsRefreshTimer);
  presenceLeave().catch(() => {});
});

document.addEventListener('DOMContentLoaded', init);
