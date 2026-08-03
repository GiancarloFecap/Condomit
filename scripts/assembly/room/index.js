import { state } from './state.js';
import { connectToRoom, toggleCamera, toggleMicrophone, toggleScreenShare, disconnectRoom } from './livekit.js';
import { setHeader, setPanelOpen, setConnectionConnecting, showBanner, renderGrid, renderParticipantsList, renderChatMessage } from './ui.js';
import { loadAssembly, loadChatHistory, subscribeChat, sendChat, refreshLists, subscribeAgenda, subscribeDocuments, subscribePolls, subscribeHands, toggleHand } from './data.js';
import { presenceJoin, presenceHeartbeat, presenceLeave } from './presence.js';

function $(id) {
  return document.getElementById(id);
}

function getQueryParam(name) {
  if (window.AssemblyUtils?.getQueryParam) return window.AssemblyUtils.getQueryParam(name);
  return new URLSearchParams(window.location.search).get(name);
}

function toast(msg, type) {
  if (window.AssemblyUtils?.showToast) return window.AssemblyUtils.showToast(msg, type);
  alert(msg);
}

async function getTokenInfo() {
  if (!window.AssemblyAPI?.requestLivekitToken) throw new Error('AssemblyAPI indisponível');
  return await window.AssemblyAPI.requestLivekitToken(state.assemblyId);
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
    try { await toggleMicrophone(); } catch (e) { toast('Não foi possível alternar microfone', 'error'); }
  });
  $('btn-camera')?.addEventListener('click', async () => {
    try { await toggleCamera(); } catch (e) { toast('Não foi possível alternar câmera', 'error'); }
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
      renderGrid(state.room);
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
    if (!ok) return;
    try { await presenceLeave(); } catch (_) {}
    try { await disconnectRoom(); } catch (_) {}
    window.location.href = `assembleia-detalhes.html?id=${encodeURIComponent(String(state.assemblyId))}`;
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
    renderGrid(state.room);
    renderParticipantsList(state.room);
  };
  subscribeAgenda(refresh);
  subscribeDocuments(refresh);
  subscribePolls(refresh);
  subscribeHands(refresh);
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

    if (state.assembly?.status !== 'em_andamento') {
      showBanner('A assembleia ainda não está em andamento. Aguarde o organizador iniciar.', 'warning');
    }

    await connectToRoom(tokenInfo);

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
  try { presenceLeave(); } catch (_) {}
});

document.addEventListener('DOMContentLoaded', init);
