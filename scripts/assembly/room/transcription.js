import { state } from './state.js?v=058';

let recognition = null;
let shouldRun = false;
let restarting = false;
let lastSavedText = '';
let lastSavedAt = 0;
let speechStartedAt = 0;
let speechSavePromise = Promise.resolve();

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
        participant_identity_value: localIdentity() || null
      })
    });
    setStatus('active', source === 'livekit' ? 'Transcrição recebida' : 'Transcrição ativa');
  } catch (error) {
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível salvar a fala:', error);
    setStatus('error', 'Falha ao salvar transcrição');
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

function createRecognition() {
  const Recognition = getRecognitionClass();
  if (!Recognition) return null;

  const instance = new Recognition();
  instance.lang = 'pt-BR';
  // No Android/iOS o modo continuous é pouco consistente. O onend abaixo
  // reinicia o reconhecimento enquanto o microfone permanecer ligado.
  instance.continuous = !isMobileSpeechDevice();
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
      saveFinalTranscript(text, 'web_speech');
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
    if (code === 'network') {
      setStatus('waiting', 'Transcrição temporariamente indisponível');
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
    }, isMobileSpeechDevice() ? 650 : 450);
  };

  return instance;
}

export function startAssemblyTranscription() {
  shouldRun = microphoneEnabled();
  if (!shouldRun) {
    setStatus('paused', 'Transcrição pausada');
    return false;
  }

  if (!getRecognitionClass()) {
    // A ata ainda saberá que houve participação oral por meio da atividade
    // de fala do LiveKit, sem inventar o conteúdo que não foi transcrito.
    setStatus('unsupported', 'Falas registradas sem transcrição textual');
    return false;
  }

  if (!recognition) recognition = createRecognition();
  if (!recognition) return false;

  try {
    recognition.start();
  } catch (error) {
    if (error?.name !== 'InvalidStateError') {
      console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar:', error);
    }
  }
  return true;
}

export async function stopAssemblyTranscription() {
  shouldRun = false;
  try { recognition?.stop(); } catch (_) {}
  setStatus('paused', 'Transcrição pausada');
  await flushAssemblySpeechActivity();
}

export function syncAssemblyTranscriptionWithMicrophone() {
  if (microphoneEnabled()) {
    startAssemblyTranscription();
  } else {
    flushAssemblySpeechActivity();
    stopAssemblyTranscription();
  }
}

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
