import { state } from './state.js?v=026';
import { connectToRoom, toggleCamera, toggleMicrophone, toggleScreenShare, disconnectRoom, canSwitchMobileCamera, switchMobileCamera } from './livekit.js?v=026';
import { setHeader, setPanelOpen, setConnectionConnecting, showBanner, updateHandIndicators, renderParticipantsList, renderChatMessage } from './ui.js?v=026';
import { loadAssembly, loadChatHistory, subscribeChat, sendChat, refreshLists, subscribeAgenda, subscribeDocuments, subscribePolls, subscribeHands, toggleHand, createAgendaItem, createDocument, createPollWithDuration, formatCountdown, isPollOpen } from './data.js?v=026';
import { presenceJoin, presenceHeartbeat, presenceLeave } from './presence.js?v=026';
import { startAssemblyTranscription, stopAssemblyTranscription, syncAssemblyTranscriptionWithMicrophone } from './transcription.js?v=026';

function $(id) {
  return document.getElementById(id);
}

function getQueryParam(name) {
  if (window.AssemblyUtils?.getQueryParam) return window.AssemblyUtils.getQueryParam(name);
  return new URLSearchParams(window.location.search).get(name);
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
      panels.forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === target);
      });
    });
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
  const ok = window.confirm('Deseja sair da assembleia?');

  if (!ok) {
    return;
  }

  try {
    await presenceLeave();
  } catch (error) {
    console.warn(
      'Não foi possível registrar a saída:',
      error
    );
  }

  stopAssemblyTranscription();

  try {
    await disconnectRoom();
  } catch (error) {
    console.warn(
      'Não foi possível desconectar do LiveKit:',
      error
    );
  }

  window.location.href = 'assembleia.html';
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
  subscribeDocuments(refresh);
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
        <input id="doc-file" type="file" accept="application/pdf,image/*,.doc,.docx,.txt,.csv" style="padding: 8px;" />
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
  let selected = null;
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    if (!file) { selected = null; previewWrap.style.display = 'none'; return; }
    if (file.size > 5 * 1024 * 1024) {
      toast('Arquivo muito grande. Use até 5MB.', 'warning');
      fileInput.value = '';
      selected = null;
      previewWrap.style.display = 'none';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      selected = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: String(reader.result || '') };
      previewWrap.style.display = 'flex';
      previewWrap.style.flexDirection = 'column';
      preview.textContent = `${selected.name} (${(selected.size / 1024).toFixed(1)} KB) Tipo: ${selected.type}`;
    };
    reader.readAsDataURL(file);
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
      if (!selected) throw new Error('Selecione um arquivo.');
      await createDocument({
        title,
        document_type: type,
        description: description || null,
        document_url: selected.dataUrl,
        file_size_bytes: selected.size
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

    const id = getQueryParam('id');
    if (!id) throw new Error('ID da assembleia não informado');
    state.assemblyId = id;

    await loadAssembly();
    setHeader(state.assembly);

    const tokenInfo = await getTokenInfo();
    state.tokenInfo = tokenInfo;
    state.permissions = tokenInfo.permissions || {};
    await loadAssemblyProfilePhotos();

    if (state.assembly?.status !== 'em_andamento') {
      showBanner('A assembleia ainda não está em andamento. Aguarde o organizador iniciar.', 'warning');
    }

    bindRoomActions();

    await connectToRoom(tokenInfo);

    const switchCameraButton = $('btn-switch-camera');
    if (switchCameraButton) {
      switchCameraButton.hidden = !(await canSwitchMobileCamera());
    }

    startAssemblyTranscription();

    try { await presenceJoin(); } catch (_) {}
    startHeartbeat();

    await initChat();
    await initLists();

    if (window.matchMedia('(max-width: 1024px)').matches) {
      setPanelOpen(false);
    }
  } catch (e) {
    console.error(e);
    showBanner(e.message || 'Erro ao entrar na assembleia', 'error');
    toast(e.message || 'Erro ao entrar', 'error');
  }
}

window.addEventListener('beforeunload', () => {
  stopAssemblyTranscription();
  try { presenceLeave(); } catch (_) {}
});

document.addEventListener('DOMContentLoaded', init);
