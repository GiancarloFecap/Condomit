import { state } from './state.js';

let recognition = null;
let shouldRun = false;
let restarting = false;
let lastSavedText = '';
let lastSavedAt = 0;

function getRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function statusElement() {
  return document.getElementById('call-transcription-status');
}

function setStatus(status, label) {
  const element = statusElement();
  if (!element) return;
  element.dataset.status = status;
  const text = element.querySelector('span');
  if (text) text.textContent = label;
  element.title = label;
}

function microphoneEnabled() {
  return Boolean(
    state.connected &&
    state.room?.localParticipant?.isMicrophoneEnabled
  );
}

async function saveFinalTranscript(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return;

  const now = Date.now();
  if (normalized === lastSavedText && now - lastSavedAt < 5000) return;
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
        participant_identity_value: state.tokenInfo?.identity || null
      })
    });
    setStatus('active', 'Transcrição ativa');
  } catch (error) {
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível salvar a fala:', error);
    setStatus('error', 'Falha ao salvar transcrição');
  }
}

function createRecognition() {
  const Recognition = getRecognitionClass();
  if (!Recognition) return null;

  const instance = new Recognition();
  instance.lang = 'pt-BR';
  instance.continuous = true;
  instance.interimResults = true;
  instance.maxAlternatives = 1;

  instance.onstart = () => {
    restarting = false;
    setStatus('active', 'Transcrição ativa');
  };

  instance.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.isFinal) continue;
      const text = result[0]?.transcript || '';
      saveFinalTranscript(text);
    }
  };

  instance.onerror = (event) => {
    const code = String(event?.error || '');
    if (['not-allowed', 'service-not-allowed'].includes(code)) {
      shouldRun = false;
      setStatus('error', 'Transcrição sem permissão');
      return;
    }
    if (code === 'no-speech') {
      setStatus('waiting', 'Aguardando fala');
      return;
    }
    console.warn('[ASSEMBLY TRANSCRIPTION] SpeechRecognition:', code);
  };

  instance.onend = () => {
    if (!shouldRun || !microphoneEnabled()) {
      setStatus('paused', 'Transcrição pausada');
      return;
    }
    if (restarting) return;
    restarting = true;
    window.setTimeout(() => {
      restarting = false;
      try {
        recognition?.start();
      } catch (_) {}
    }, 450);
  };

  return instance;
}

export function startAssemblyTranscription() {
  if (!getRecognitionClass()) {
    setStatus('unsupported', 'Transcrição indisponível neste navegador');
    return false;
  }

  shouldRun = microphoneEnabled();
  if (!shouldRun) {
    setStatus('paused', 'Transcrição pausada');
    return false;
  }

  if (!recognition) recognition = createRecognition();
  if (!recognition) return false;

  try {
    recognition.start();
  } catch (error) {
    // InvalidStateError significa apenas que já está em execução.
    if (error?.name !== 'InvalidStateError') {
      console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar:', error);
    }
  }
  return true;
}

export function stopAssemblyTranscription() {
  shouldRun = false;
  try { recognition?.stop(); } catch (_) {}
  setStatus('paused', 'Transcrição pausada');
}

export function syncAssemblyTranscriptionWithMicrophone() {
  if (microphoneEnabled()) {
    startAssemblyTranscription();
  } else {
    stopAssemblyTranscription();
  }
}
