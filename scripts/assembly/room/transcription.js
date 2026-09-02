import { state } from './state.js?v=059';

let recognition = null;
let shouldRun = false;
let recognitionRunning = false;
let recognitionStarting = false;
let restartTimer = null;
let watchdogTimer = null;
let restartAttempts = 0;
let lastSavedText = '';
let lastSavedAt = 0;
let lastInterimText = '';
let speechStartedAt = 0;
let speechSavePromise = Promise.resolve();
let permanentFailure = '';

function isMobileSpeechDevice() {
  const ua = String(navigator.userAgent || '');
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || window.matchMedia?.('(pointer: coarse)')?.matches === true;
}

function getRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function statusElement() {
  return document.getElementById('call-transcription-status');
}

function setStatus(status, label, detail = '') {
  const element = statusElement();
  if (!element) return;
  element.dataset.status = status;
  const text = element.querySelector('span');
  if (text) text.textContent = label;
  element.title = detail ? `${label}. ${detail}` : label;
}

function microphoneEnabled() {
  return Boolean(
    state.connected &&
    state.room?.localParticipant?.isMicrophoneEnabled
  );
}

function localIdentity() {
  return String(
    state.room?.localParticipant?.identity ||
    state.tokenInfo?.identity ||
    ''
  ).trim();
}

async function saveFinalTranscript(text, source = 'web_speech') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return;

  const now = Date.now();
  if (normalized === lastSavedText && now - lastSavedAt < 7000) return;
  lastSavedText = normalized;
  lastSavedAt = now;

  if (typeof window.supabaseFetch !== 'function') return;

  try {
    await window.supabaseFetch('/rpc/condomit_append_assembly_transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_assembly_id: Number(state.assemblyId),
        transcript_text: normalized,
        participant_identity_value: localIdentity() || null
      })
    });
    setStatus('active', source === 'livekit' ? 'Transcrição recebida' : 'Transcrição ativa');
  } catch (error) {
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível salvar a fala:', error);
    setStatus('error', 'Falha ao salvar transcrição', error?.message || '');
  }
}

function queueSpeechActivity(startedAt, endedAt) {
  const start = Number(startedAt || 0);
  const end = Number(endedAt || 0);
  const durationMs = Math.max(0, end - start);
  if (!start || !end || durationMs < 700 || typeof window.supabaseFetch !== 'function') return;

  speechSavePromise = speechSavePromise
    .catch(() => {})
    .then(async () => {
      try {
        await window.supabaseFetch('/rpc/condomit_log_assembly_speech_activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_assembly_id: Number(state.assemblyId),
            participant_identity_value: localIdentity() || null,
            started_at_value: new Date(start).toISOString(),
            ended_at_value: new Date(end).toISOString()
          })
        });
      } catch (error) {
        console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível registrar atividade de fala:', error);
      }
    });
}

function syncSpeechActivityFromIdentities(identities) {
  const ownIdentity = localIdentity();
  if (!ownIdentity) return;
  const speaking = Array.isArray(identities) && identities.includes(ownIdentity);

  if (speaking && !speechStartedAt) {
    speechStartedAt = Date.now();
    return;
  }

  if (!speaking && speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }
}

export async function flushAssemblySpeechActivity() {
  if (speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }
  try { await speechSavePromise; } catch (_) {}
}

function clearRestartTimer() {
  if (restartTimer) {
    window.clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function scheduleRecognitionRestart(reason = 'reinício automático', delay = null) {
  if (!shouldRun || permanentFailure || !microphoneEnabled()) return;
  clearRestartTimer();
  const baseDelay = delay ?? Math.min(5000, 350 + (restartAttempts * 450));
  restartAttempts += 1;
  setStatus('starting', 'Reconectando transcrição...', reason);
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    attemptRecognitionStart(reason);
  }, baseDelay);
}

function commitLastInterimIfUseful() {
  const partial = String(lastInterimText || '').replace(/\s+/g, ' ').trim();
  lastInterimText = '';
  // Se o serviço encerrou antes de marcar o resultado como final, preservamos
  // somente uma hipótese textual minimamente útil que ele próprio já retornou.
  if (partial.length >= 3) saveFinalTranscript(partial, 'web_speech');
}

function createRecognition() {
  const Recognition = getRecognitionClass();
  if (!Recognition) return null;

  const instance = new Recognition();
  instance.lang = 'pt-BR';
  // O modo contínuo é mais confiável em navegadores Chromium desktop. No
  // celular, reiniciamos a sessão a cada encerramento para evitar travamentos.
  instance.continuous = !isMobileSpeechDevice();
  instance.interimResults = true;
  instance.maxAlternatives = 1;

  instance.onstart = () => {
    recognitionStarting = false;
    recognitionRunning = true;
    restartAttempts = 0;
    permanentFailure = '';
    setStatus('active', 'Transcrição ativa');
  };

  instance.onspeechstart = () => {
    setStatus('active', 'Transcrevendo...');
  };

  instance.onspeechend = () => {
    if (shouldRun && microphoneEnabled()) setStatus('waiting', 'Aguardando fala');
  };

  instance.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = String(result?.[0]?.transcript || '').trim();
      if (!text) continue;
      if (result.isFinal) {
        lastInterimText = '';
        saveFinalTranscript(text, 'web_speech');
      } else {
        interim += `${text} `;
      }
    }
    if (interim.trim()) {
      lastInterimText = interim.trim();
      setStatus('active', 'Transcrevendo...');
    }
  };

  instance.onerror = (event) => {
    recognitionStarting = false;
    const code = String(event?.error || 'unknown');

    if (['not-allowed', 'service-not-allowed'].includes(code)) {
      permanentFailure = code;
      shouldRun = false;
      setStatus(
        'error',
        'Transcrição sem permissão',
        'Permita o uso do microfone/reconhecimento de voz no navegador e recarregue a sala.'
      );
      return;
    }

    if (code === 'audio-capture') {
      setStatus('error', 'Microfone indisponível para transcrição', 'Verifique se outro aplicativo está usando o microfone.');
      scheduleRecognitionRestart('falha de captura de áudio', 1500);
      return;
    }

    if (code === 'no-speech') {
      setStatus('waiting', 'Aguardando fala');
      return;
    }

    if (code === 'network') {
      setStatus('waiting', 'Reconectando transcrição...', 'O reconhecimento de voz do navegador depende de um serviço de rede.');
      scheduleRecognitionRestart('falha temporária de rede', 1800);
      return;
    }

    if (code === 'aborted') {
      if (shouldRun && microphoneEnabled()) scheduleRecognitionRestart('reconhecimento interrompido', 500);
      return;
    }

    console.warn('[ASSEMBLY TRANSCRIPTION] SpeechRecognition:', code, event);
    setStatus('waiting', 'Reconectando transcrição...', `Erro do navegador: ${code}`);
  };

  instance.onend = () => {
    recognitionStarting = false;
    recognitionRunning = false;
    commitLastInterimIfUseful();

    if (!shouldRun) {
      setStatus('paused', 'Transcrição pausada');
      return;
    }

    if (!microphoneEnabled()) {
      setStatus('paused', 'Transcrição aguardando microfone');
      return;
    }

    if (permanentFailure) return;
    scheduleRecognitionRestart('sessão de reconhecimento encerrada pelo navegador');
  };

  return instance;
}

function attemptRecognitionStart(reason = 'inicialização') {
  if (!shouldRun || permanentFailure || !microphoneEnabled()) return false;
  const Recognition = getRecognitionClass();
  if (!Recognition) {
    setStatus(
      'unsupported',
      'Falas registradas sem transcrição textual',
      'Este navegador não disponibiliza a API de reconhecimento de voz. Use uma versão atual do Chrome ou Edge para transcrição textual automática.'
    );
    return false;
  }

  if (!recognition) recognition = createRecognition();
  if (!recognition || recognitionRunning || recognitionStarting) return Boolean(recognitionRunning || recognitionStarting);

  recognitionStarting = true;
  setStatus('starting', 'Ativando transcrição...', reason);
  try {
    recognition.start();
    return true;
  } catch (error) {
    recognitionStarting = false;
    if (error?.name === 'InvalidStateError') {
      // A implementação Chromium pode estar terminando uma sessão anterior.
      scheduleRecognitionRestart('aguardando o navegador liberar o reconhecimento', 650);
      return true;
    }
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar:', error);
    setStatus('waiting', 'Reconectando transcrição...', error?.message || 'Falha ao iniciar reconhecimento');
    scheduleRecognitionRestart('falha ao iniciar reconhecimento', 1200);
    return false;
  }
}

function ensureWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = window.setInterval(() => {
    if (!state.connected) return;

    if (!microphoneEnabled()) {
      if (shouldRun) {
        shouldRun = false;
        try { recognition?.stop(); } catch (_) {}
      }
      setStatus('paused', 'Transcrição aguardando microfone');
      return;
    }

    if (!permanentFailure) shouldRun = true;
    if (shouldRun && !recognitionRunning && !recognitionStarting && !restartTimer) {
      attemptRecognitionStart('verificação automática');
    }
  }, 2500);
}

export function startAssemblyTranscription() {
  ensureWatchdog();

  if (!microphoneEnabled()) {
    shouldRun = false;
    setStatus('paused', 'Transcrição aguardando microfone');
    return false;
  }

  permanentFailure = '';
  shouldRun = true;
  return attemptRecognitionStart('microfone ativo');
}

export async function stopAssemblyTranscription() {
  shouldRun = false;
  clearRestartTimer();
  recognitionStarting = false;
  try { recognition?.stop(); } catch (_) {}
  setStatus('paused', 'Transcrição pausada');
  await flushAssemblySpeechActivity();
}

export function syncAssemblyTranscriptionWithMicrophone() {
  if (microphoneEnabled()) {
    shouldRun = true;
    permanentFailure = '';
    startAssemblyTranscription();
  } else {
    flushAssemblySpeechActivity();
    stopAssemblyTranscription();
  }
}

function retryFromUserInteraction() {
  if (!state.connected || !microphoneEnabled() || permanentFailure) return;
  shouldRun = true;
  if (!recognitionRunning && !recognitionStarting) attemptRecognitionStart('interação do usuário');
}

// Alguns navegadores Chromium exigem uma interação recente do usuário para
// iniciar/reiniciar serviços de reconhecimento. Uma tentativa leve após a
// primeira interação evita que a ata fique presa em "Transcrição pausada".
['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
  window.addEventListener(eventName, retryFromUserInteraction, { passive: true });
});

window.addEventListener('focus', () => {
  if (shouldRun && microphoneEnabled() && !recognitionRunning) scheduleRecognitionRestart('janela voltou ao foco', 150);
});

window.addEventListener('online', () => {
  if (shouldRun && microphoneEnabled() && !recognitionRunning) scheduleRecognitionRestart('conexão restabelecida', 250);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && shouldRun && microphoneEnabled() && !recognitionRunning) {
    scheduleRecognitionRestart('aba voltou a ficar visível', 200);
  }
});

window.addEventListener('condomit:assembly-microphone-state', (event) => {
  const enabled = Boolean(event?.detail?.enabled);
  if (enabled) {
    shouldRun = true;
    permanentFailure = '';
    startAssemblyTranscription();
  } else {
    flushAssemblySpeechActivity();
    stopAssemblyTranscription();
  }
});

window.addEventListener('condomit:assembly-active-speakers', (event) => {
  syncSpeechActivityFromIdentities(event?.detail?.identities || []);
});

window.addEventListener('condomit:assembly-livekit-transcription', (event) => {
  const detail = event?.detail || {};
  const ownIdentity = localIdentity();
  if (detail.participantIdentity && ownIdentity && detail.participantIdentity !== ownIdentity) return;
  const segments = Array.isArray(detail.segments) ? detail.segments : [];
  segments
    .filter((segment) => segment?.final === true && String(segment?.text || '').trim())
    .forEach((segment) => saveFinalTranscript(segment.text, 'livekit'));
});
