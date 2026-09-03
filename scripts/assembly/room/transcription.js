import { state } from './state.js?v=064';

// Condomit v0.64.0
// Transcrição sem OpenAI/GPT: usa o reconhecimento de voz disponibilizado pelo
// navegador/sistema (SpeechRecognition/webkitSpeechRecognition). Segmentos de
// transcrição fornecidos pelo próprio LiveKit continuam sendo aceitos.

let shouldRun = false;
let recognition = null;
let recognitionStarting = false;
let restartTimer = null;
let watchdogTimer = null;
let speechStartedAt = 0;
let speechSavePromise = Promise.resolve();
let lastSavedText = '';
let lastSavedAt = 0;
let unavailableNotified = false;

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
  return Boolean(state.connected && state.room?.localParticipant?.isMicrophoneEnabled);
}

function localIdentity() {
  return String(state.room?.localParticipant?.identity || state.tokenInfo?.identity || '').trim();
}

function recognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function saveFinalTranscript(text, source = 'browser') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized || typeof window.supabaseFetch !== 'function') return false;

  const now = Date.now();
  if (normalized === lastSavedText && now - lastSavedAt < 12000) return true;

  try {
    await window.supabaseFetch('/rpc/condomit_append_assembly_transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_assembly_id: Number(state.assemblyId),
        transcript_text: normalized.slice(0, 4000),
        participant_identity_value: localIdentity() || null
      })
    });
    lastSavedText = normalized;
    lastSavedAt = now;
    setStatus('active', 'Transcrição automática ativa', source === 'livekit'
      ? 'Texto recebido pelo LiveKit e registrado na ata.'
      : 'Reconhecimento de voz do dispositivo ativo; sem uso de créditos GPT/OpenAI.');
    return true;
  } catch (error) {
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível salvar a fala:', error);
    setStatus('error', 'Falha ao salvar transcrição', error?.message || 'Não foi possível registrar o texto na ata.');
    return false;
  }
}

function queueSpeechActivity(startedAt, endedAt) {
  const start = Number(startedAt || 0);
  const end = Number(endedAt || 0);
  if (!start || !end || end - start < 700 || typeof window.supabaseFetch !== 'function') return;
  speechSavePromise = speechSavePromise.catch(() => {}).then(async () => {
    try {
      await window.supabaseFetch('/rpc/condomit_log_assembly_speech_activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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

function scheduleRestart(delay = 450) {
  clearTimeout(restartTimer);
  if (!shouldRun || !microphoneEnabled() || document.hidden) return;
  restartTimer = window.setTimeout(() => startRecognition(), delay);
}

function stopRecognitionInstance() {
  clearTimeout(restartTimer);
  restartTimer = null;
  const current = recognition;
  recognition = null;
  recognitionStarting = false;
  if (!current) return;
  try { current.onend = null; current.onerror = null; current.stop(); } catch (_) {
    try { current.abort(); } catch (_) {}
  }
}

function startRecognition() {
  if (!shouldRun || !microphoneEnabled() || recognition || recognitionStarting || document.hidden) return false;
  const Recognition = recognitionConstructor();
  if (!Recognition) {
    if (!unavailableNotified) {
      unavailableNotified = true;
      console.warn('[ASSEMBLY TRANSCRIPTION] SpeechRecognition não é suportado neste navegador/WebView.');
    }
    setStatus('paused', 'Transcrição indisponível neste dispositivo', 'O navegador não oferece reconhecimento de voz. Nenhum crédito OpenAI será consumido.');
    return false;
  }

  recognitionStarting = true;
  try {
    const instance = new Recognition();
    recognition = instance;
    instance.lang = 'pt-BR';
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => {
      recognitionStarting = false;
      setStatus('active', 'Transcrição automática ativa', 'Reconhecimento de voz do dispositivo; sem GPT/OpenAI.');
    };

    instance.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) finalText += ` ${result[0]?.transcript || ''}`;
      }
      if (finalText.trim()) saveFinalTranscript(finalText, 'browser');
    };

    instance.onerror = (event) => {
      recognitionStarting = false;
      const code = String(event?.error || '').toLowerCase();
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        shouldRun = false;
        setStatus('error', 'Permissão de transcrição bloqueada', 'Autorize o uso do microfone/reconhecimento de voz no navegador ou aplicativo.');
        return;
      }
      if (code !== 'no-speech' && code !== 'aborted') {
        console.warn('[ASSEMBLY TRANSCRIPTION] SpeechRecognition:', code || event);
      }
    };

    instance.onend = () => {
      recognition = null;
      recognitionStarting = false;
      if (shouldRun && microphoneEnabled()) scheduleRestart(350);
    };

    instance.start();
    return true;
  } catch (error) {
    recognition = null;
    recognitionStarting = false;
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar SpeechRecognition:', error);
    scheduleRestart(900);
    return false;
  }
}

function syncSpeechActivityFromIdentities(identities) {
  const ownIdentity = localIdentity();
  if (!ownIdentity) return;
  const speaking = Array.isArray(identities) && identities.includes(ownIdentity);
  if (speaking && !speechStartedAt) speechStartedAt = Date.now();
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

function ensureWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = window.setInterval(() => {
    if (!state.connected || !shouldRun) return;
    if (!microphoneEnabled()) {
      stopRecognitionInstance();
      setStatus('paused', 'Transcrição aguardando microfone');
      return;
    }
    if (!recognition && !recognitionStarting && !document.hidden) startRecognition();
  }, 2500);
}

export function startAssemblyTranscription() {
  ensureWatchdog();
  if (!microphoneEnabled()) {
    shouldRun = false;
    setStatus('paused', 'Transcrição aguardando microfone');
    return false;
  }
  shouldRun = true;
  return startRecognition();
}

export async function stopAssemblyTranscription() {
  shouldRun = false;
  stopRecognitionInstance();
  setStatus('paused', 'Transcrição pausada');
  await flushAssemblySpeechActivity();
}

export function syncAssemblyTranscriptionWithMicrophone() {
  if (microphoneEnabled()) startAssemblyTranscription();
  else stopAssemblyTranscription();
}

function resumeFromUserInteraction() {
  if (!state.connected || !microphoneEnabled()) return;
  shouldRun = true;
  if (!recognition && !recognitionStarting) startRecognition();
}

['pointerdown', 'keydown', 'touchstart', 'click'].forEach((eventName) => {
  window.addEventListener(eventName, resumeFromUserInteraction, { passive: true });
});
window.addEventListener('focus', resumeFromUserInteraction);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeFromUserInteraction(); });

window.addEventListener('condomit:assembly-microphone-state', (event) => {
  if (Boolean(event?.detail?.enabled)) startAssemblyTranscription();
  else stopAssemblyTranscription();
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
