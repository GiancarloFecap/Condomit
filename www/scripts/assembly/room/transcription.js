import { state } from './state.js?v=062';

let recognition = null;
let shouldRun = false;
let recognitionRunning = false;
let recognitionStarting = false;
let restartTimer = null;
let watchdogTimer = null;
let restartAttempts = 0;
let browserFailureCount = 0;
let browserEmptyEndCount = 0;
let browserHadResultThisSession = false;
let lastSavedText = '';
let lastSavedAt = 0;
let lastInterimText = '';
let speechStartedAt = 0;
let speechSavePromise = Promise.resolve();
let localSpeaking = false;
let lastBrowserResultAt = 0;
let localSpeechStartedAt = 0;
let noTextFallbackTimer = null;
let serverFailureCount = 0;

let serverFallbackActive = false;
let serverFallbackUnavailable = false;
let serverRecorder = null;
let serverRecorderTrack = null;
let serverRecorderTimer = null;
let serverChunks = [];
let serverUploadQueue = Promise.resolve();
let serverSegmentStartedAt = 0;
let serverSegmentHadSpeech = false;

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

async function resolveAccessToken() {
  try {
    if (typeof window.resolveSupabaseAccessToken === 'function') {
      const token = await window.resolveSupabaseAccessToken();
      if (token) return token;
    }
  } catch (_) {}

  try {
    const { data } = await window.supabase?.auth?.getSession?.();
    if (data?.session?.access_token) return data.session.access_token;
  } catch (_) {}

  try {
    const direct = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    if (direct) return direct;
    const raw = sessionStorage.getItem('sb-session') || localStorage.getItem('sb-session');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.access_token || parsed?.session?.access_token || null;
    }
  } catch (_) {}
  return null;
}

async function saveFinalTranscript(text, source = 'web_speech') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return;

  const now = Date.now();
  if (normalized === lastSavedText && now - lastSavedAt < 10000) return;
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

    if (source === 'server') {
      setStatus('active', 'Transcrição automática ativa', 'A fala foi transcrita pelo serviço de fallback da Condomit.');
    } else if (source === 'livekit') {
      setStatus('active', 'Transcrição recebida');
    } else {
      setStatus('active', 'Transcrição ativa');
    }
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

function getLocalMicrophoneTrack() {
  const participant = state.room?.localParticipant;
  if (!participant) return null;

  try {
    const direct = participant.getTrackPublication?.('microphone');
    const track = direct?.track?.mediaStreamTrack;
    if (track?.readyState === 'live') return track;
  } catch (_) {}

  try {
    const publications = participant.audioTrackPublications;
    const values = publications?.values ? Array.from(publications.values()) : [];
    const publication = values.find((item) => String(item?.source || '').toLowerCase().includes('microphone')) || values[0];
    const track = publication?.track?.mediaStreamTrack;
    if (track?.readyState === 'live') return track;
  } catch (_) {}

  return null;
}

function chooseRecorderMimeType() {
  if (!window.MediaRecorder) return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  return candidates.find((type) => {
    try { return MediaRecorder.isTypeSupported?.(type); } catch (_) { return false; }
  }) || '';
}

function blobToBase64(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
    }
    return btoa(binary);
  });
}

async function sendAudioForServerTranscription(blob, mimeType) {
  if (!blob?.size || blob.size < 700 || serverFallbackUnavailable) return;

  setStatus('starting', 'Transcrevendo fala...', 'Processando o trecho de áudio da assembleia.');

  try {
    const token = await resolveAccessToken();
    if (!token) throw new Error('Sessão de autenticação indisponível.');

    const audioBase64 = await blobToBase64(blob);
    const response = await fetch('/.netlify/functions/assembly-transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        assembly_id: Number(state.assemblyId),
        participant_identity: localIdentity() || null,
        mime_type: mimeType || blob.type || 'audio/webm',
        audio_base64: audioBase64
      })
    });

    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = { error: raw }; }

    if (!response.ok) {
      if (payload?.code === 'TRANSCRIPTION_NOT_CONFIGURED') {
        serverFallbackUnavailable = true;
        serverFallbackActive = false;
        setStatus(
          'unsupported',
          'Falas registradas sem transcrição textual',
          'Configure OPENAI_API_KEY na Netlify e publique novamente o site.'
        );
        return;
      }
      if (response.status === 404) {
        throw new Error('A função de transcrição não foi encontrada no deploy atual. Publique novamente a Condomit.');
      }
      const providerError = payload?.provider_error || payload?.error || `Falha na transcrição (${response.status}).`;
      const requestError = new Error(providerError);
      requestError.code = payload?.code || 'TRANSCRIPTION_PROVIDER_ERROR';
      requestError.httpStatus = response.status;
      requestError.providerStatus = payload?.provider_status || null;
      throw requestError;
    }

    serverFailureCount = 0;
    const text = String(payload?.text || '').replace(/\s+/g, ' ').trim();
    if (text) {
      if (payload?.saved === true) {
        lastSavedText = text;
        lastSavedAt = Date.now();
        setStatus('active', 'Transcrição automática ativa', 'Fala transcrita e registrada na ata.');
      } else {
        await saveFinalTranscript(text, 'server');
      }
    } else if (serverFallbackActive) {
      setStatus('active', 'Transcrição automática ativa', 'Aguardando a próxima fala.');
    }
  } catch (error) {
    serverFailureCount += 1;
    console.warn('[ASSEMBLY TRANSCRIPTION] Fallback de servidor:', {
      code: error?.code || null,
      status: error?.httpStatus || null,
      providerStatus: error?.providerStatus || null,
      message: error?.message || String(error)
    });
    if (serverFallbackActive && !serverFallbackUnavailable) {
      let label = serverFailureCount >= 2 ? 'Falha na transcrição automática' : 'Transcrição automática aguardando';
      const code = String(error?.code || '');
      if (code === 'TRANSCRIPTION_INVALID_KEY') label = 'Chave da transcrição inválida';
      else if (code === 'TRANSCRIPTION_QUOTA') label = 'Transcrição sem cota disponível';
      else if (code === 'TRANSCRIPTION_AUDIO_INVALID') label = 'Áudio incompatível com a transcrição';
      else if (code === 'SUPABASE_NOT_CONFIGURED') label = 'Transcrição sem conexão com o banco';
      setStatus(serverFailureCount >= 2 ? 'error' : 'waiting', label, error?.message || 'Falha temporária ao processar áudio.');
    }
  }
}

function cleanupServerRecorderTrack() {
  if (serverRecorderTimer) {
    clearTimeout(serverRecorderTimer);
    serverRecorderTimer = null;
  }
  try { serverRecorderTrack?.stop?.(); } catch (_) {}
  serverRecorderTrack = null;
}

function startServerAudioSegment() {
  if (!serverFallbackActive || serverFallbackUnavailable || !shouldRun || !microphoneEnabled()) return;
  if (!window.MediaRecorder || serverRecorder?.state === 'recording') return;

  const sourceTrack = getLocalMicrophoneTrack();
  if (!sourceTrack) {
    setStatus('waiting', 'Preparando transcrição...', 'Aguardando a faixa de microfone da chamada.');
    return;
  }

  try {
    serverRecorderTrack = sourceTrack.clone();
    const stream = new MediaStream([serverRecorderTrack]);
    const mimeType = chooseRecorderMimeType();
    serverChunks = [];
    serverSegmentStartedAt = Date.now();
    serverSegmentHadSpeech = Boolean(localSpeaking);
    serverRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    serverRecorder.ondataavailable = (event) => {
      if (event.data?.size) serverChunks.push(event.data);
    };

    serverRecorder.onerror = (event) => {
      console.warn('[ASSEMBLY TRANSCRIPTION] MediaRecorder:', event?.error || event);
      cleanupServerRecorderTrack();
      serverRecorder = null;
      serverChunks = [];
      serverSegmentStartedAt = 0;
      serverSegmentHadSpeech = false;
    };

    serverRecorder.onstop = () => {
      const recorderMime = serverRecorder?.mimeType || mimeType || 'audio/webm';
      const chunks = serverChunks.slice();
      const segmentDurationMs = Math.max(0, Date.now() - Number(serverSegmentStartedAt || Date.now()));
      const hadSpeech = serverSegmentHadSpeech;

      cleanupServerRecorderTrack();
      serverRecorder = null;
      serverChunks = [];
      serverSegmentStartedAt = 0;
      serverSegmentHadSpeech = false;

      // Só envia arquivos completos, com duração suficiente e nos quais o
      // LiveKit realmente detectou fala. Isso evita arquivos minúsculos ou
      // corrompidos quando o active-speaker oscila entre frases.
      if (hadSpeech && chunks.length && segmentDurationMs >= 1200) {
        const blob = new Blob(chunks, { type: recorderMime });
        serverUploadQueue = serverUploadQueue
          .catch(() => {})
          .then(() => sendAudioForServerTranscription(blob, recorderMime));
      }

      // Cada segmento é um arquivo independente, com cabeçalho próprio.
      // O próximo começa mesmo em silêncio; se ninguém falar ele não é enviado.
      if (serverFallbackActive && shouldRun && microphoneEnabled()) {
        window.setTimeout(startServerAudioSegment, 120);
      }
    };

    serverRecorder.start();
    setStatus('active', 'Transcrição automática ativa', 'A Condomit está preparando trechos de áudio válidos para transcrição.');

    // Segmentos de 12 s são suficientemente longos para formar um arquivo de
    // áudio estável, mas pequenos o bastante para a ata ser atualizada rápido.
    serverRecorderTimer = window.setTimeout(() => {
      try {
        if (serverRecorder?.state === 'recording') serverRecorder.stop();
      } catch (_) {}
    }, 12000);
  } catch (error) {
    cleanupServerRecorderTrack();
    serverRecorder = null;
    serverChunks = [];
    serverSegmentStartedAt = 0;
    serverSegmentHadSpeech = false;
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar fallback de áudio:', error);
    setStatus('waiting', 'Preparando transcrição...', error?.message || 'Falha ao acessar faixa de áudio.');
  }
}

function stopServerAudioSegment() {
  if (serverRecorderTimer) {
    clearTimeout(serverRecorderTimer);
    serverRecorderTimer = null;
  }
  try {
    if (serverRecorder?.state === 'recording') {
      serverRecorder.stop();
      return;
    }
  } catch (_) {}
  cleanupServerRecorderTrack();
  serverRecorder = null;
  serverChunks = [];
  serverSegmentStartedAt = 0;
  serverSegmentHadSpeech = false;
}

function activateServerFallback(reason = 'reconhecimento do navegador indisponível') {
  if (serverFallbackUnavailable || !shouldRun || !microphoneEnabled()) return false;

  clearRestartTimer();
  serverFallbackActive = true;
  recognitionStarting = false;
  recognitionRunning = false;
  try { recognition?.abort?.(); } catch (_) {}

  if (!window.MediaRecorder) {
    serverFallbackUnavailable = true;
    serverFallbackActive = false;
    setStatus(
      'unsupported',
      'Falas registradas sem transcrição textual',
      'Este navegador não oferece reconhecimento de voz nem gravação de áudio compatível para o fallback.'
    );
    return false;
  }

  setStatus('active', 'Transcrição automática ativa', `Fallback ativado: ${reason}.`);
  startServerAudioSegment();
  return true;
}

function clearNoTextFallbackTimer() {
  if (noTextFallbackTimer) {
    window.clearTimeout(noTextFallbackTimer);
    noTextFallbackTimer = null;
  }
}

function scheduleNoTextFallback() {
  clearNoTextFallbackTimer();
  if (!shouldRun || serverFallbackActive || !microphoneEnabled() || !localSpeaking) return;
  const speechStart = localSpeechStartedAt || Date.now();
  noTextFallbackTimer = window.setTimeout(() => {
    noTextFallbackTimer = null;
    if (!shouldRun || serverFallbackActive || !microphoneEnabled() || !localSpeaking) return;
    const resultAfterSpeechStarted = lastBrowserResultAt >= speechStart;
    if (!resultAfterSpeechStarted) {
      activateServerFallback('o navegador detectou o microfone, mas não produziu texto durante a fala');
    }
  }, 7000);
}

function syncSpeechActivityFromIdentities(identities) {
  const ownIdentity = localIdentity();
  if (!ownIdentity) return;
  const speaking = Array.isArray(identities) && identities.includes(ownIdentity);

  if (speaking && !speechStartedAt) {
    speechStartedAt = Date.now();
  }

  if (!speaking && speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }

  if (speaking !== localSpeaking) {
    localSpeaking = speaking;
    if (speaking) {
      localSpeechStartedAt = Date.now();
      if (serverFallbackActive) {
        serverSegmentHadSpeech = true;
        if (!serverRecorder) startServerAudioSegment();
      } else {
        scheduleNoTextFallback();
      }
    } else {
      localSpeechStartedAt = 0;
      clearNoTextFallbackTimer();
      // Não encerra o MediaRecorder entre frases. O arquivo só é fechado no
      // limite do segmento, garantindo um WebM/OGG/MP4 íntegro.
    }
  }
}

export async function flushAssemblySpeechActivity() {
  if (speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }
  try { await speechSavePromise; } catch (_) {}
  try { await serverUploadQueue; } catch (_) {}
}

function clearRestartTimer() {
  if (restartTimer) {
    window.clearTimeout(restartTimer);
    restartTimer = null;
  }
}

function scheduleRecognitionRestart(reason = 'nova tentativa', delay = null) {
  if (!shouldRun || serverFallbackActive || !microphoneEnabled()) return;
  clearRestartTimer();

  if (browserFailureCount >= 2 || browserEmptyEndCount >= 3) {
    activateServerFallback(reason);
    return;
  }

  const baseDelay = delay ?? Math.min(3500, 450 + (restartAttempts * 450));
  restartAttempts += 1;
  setStatus('starting', 'Preparando transcrição...', reason);
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    attemptRecognitionStart(reason);
  }, baseDelay);
}

function commitLastInterimIfUseful() {
  const partial = String(lastInterimText || '').replace(/\s+/g, ' ').trim();
  lastInterimText = '';
  if (partial.length >= 3) saveFinalTranscript(partial, 'web_speech');
}

function createRecognition() {
  const Recognition = getRecognitionClass();
  if (!Recognition) return null;

  const instance = new Recognition();
  instance.lang = 'pt-BR';
  instance.continuous = !isMobileSpeechDevice();
  instance.interimResults = true;
  instance.maxAlternatives = 1;

  instance.onstart = () => {
    recognitionStarting = false;
    recognitionRunning = true;
    browserHadResultThisSession = false;
    restartAttempts = 0;
    setStatus('active', 'Transcrição ativa');
  };

  instance.onspeechstart = () => setStatus('active', 'Transcrevendo...');
  instance.onspeechend = () => {
    if (shouldRun && microphoneEnabled() && !serverFallbackActive) setStatus('waiting', 'Aguardando fala');
  };

  instance.onresult = (event) => {
    browserHadResultThisSession = true;
    browserFailureCount = 0;
    browserEmptyEndCount = 0;
    let interim = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = String(result?.[0]?.transcript || '').trim();
      if (!text) continue;
      lastBrowserResultAt = Date.now();
      clearNoTextFallbackTimer();
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

    if (serverFallbackActive) return;

    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(code)) {
      browserFailureCount = 2;
      activateServerFallback(`reconhecimento do navegador: ${code}`);
      return;
    }

    if (code === 'no-speech') {
      setStatus('waiting', 'Aguardando fala');
      return;
    }

    if (code === 'network') {
      browserFailureCount += 1;
      if (browserFailureCount >= 2) {
        activateServerFallback('serviço de reconhecimento do navegador indisponível');
      } else {
        scheduleRecognitionRestart('primeira falha do reconhecimento do navegador', 900);
      }
      return;
    }

    if (code === 'aborted') {
      if (shouldRun && microphoneEnabled() && !serverFallbackActive) {
        scheduleRecognitionRestart('reconhecimento interrompido', 500);
      }
      return;
    }

    browserFailureCount += 1;
    console.warn('[ASSEMBLY TRANSCRIPTION] SpeechRecognition:', code, event);
    if (browserFailureCount >= 2) activateServerFallback(`erro do navegador: ${code}`);
    else scheduleRecognitionRestart(`erro do navegador: ${code}`, 900);
  };

  instance.onend = () => {
    recognitionStarting = false;
    recognitionRunning = false;
    commitLastInterimIfUseful();

    if (serverFallbackActive) return;
    if (!shouldRun) {
      setStatus('paused', 'Transcrição pausada');
      return;
    }
    if (!microphoneEnabled()) {
      setStatus('paused', 'Transcrição aguardando microfone');
      return;
    }

    if (!browserHadResultThisSession) browserEmptyEndCount += 1;
    else browserEmptyEndCount = 0;

    if (browserEmptyEndCount >= 3) {
      activateServerFallback('o navegador encerrou repetidamente a transcrição sem produzir texto');
      return;
    }

    scheduleRecognitionRestart('sessão de reconhecimento encerrada pelo navegador');
  };

  return instance;
}

function attemptRecognitionStart(reason = 'inicialização') {
  if (!shouldRun || serverFallbackActive || !microphoneEnabled()) return false;

  const Recognition = getRecognitionClass();
  if (!Recognition) return activateServerFallback('API de reconhecimento de voz não disponível');

  if (!recognition) recognition = createRecognition();
  if (!recognition || recognitionRunning || recognitionStarting) {
    return Boolean(recognitionRunning || recognitionStarting);
  }

  recognitionStarting = true;
  browserHadResultThisSession = false;
  setStatus('starting', 'Ativando transcrição...', reason);

  try {
    recognition.start();
    return true;
  } catch (error) {
    recognitionStarting = false;
    if (error?.name === 'InvalidStateError') {
      scheduleRecognitionRestart('aguardando o navegador liberar o reconhecimento', 650);
      return true;
    }
    browserFailureCount += 1;
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar:', error);
    if (browserFailureCount >= 2) return activateServerFallback(error?.message || 'falha ao iniciar reconhecimento');
    scheduleRecognitionRestart('falha ao iniciar reconhecimento', 1000);
    return false;
  }
}

function ensureWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = window.setInterval(() => {
    if (!state.connected) return;

    if (!microphoneEnabled()) {
      shouldRun = false;
      try { recognition?.abort?.(); } catch (_) {}
      stopServerAudioSegment();
      setStatus('paused', 'Transcrição aguardando microfone');
      return;
    }

    shouldRun = true;

    if (serverFallbackActive) {
      if (!serverRecorder) startServerAudioSegment();
      return;
    }

    if (localSpeaking && localSpeechStartedAt && Date.now() - localSpeechStartedAt >= 7000 && lastBrowserResultAt < localSpeechStartedAt) {
      activateServerFallback('fala detectada sem retorno textual do navegador');
      return;
    }

    if (!recognitionRunning && !recognitionStarting && !restartTimer) {
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

  shouldRun = true;
  if (serverFallbackActive) {
    setStatus('active', 'Transcrição automática ativa');
    startServerAudioSegment();
    return true;
  }
  return attemptRecognitionStart('microfone ativo');
}

export async function stopAssemblyTranscription() {
  shouldRun = false;
  clearRestartTimer();
  clearNoTextFallbackTimer();
  recognitionStarting = false;
  recognitionRunning = false;
  try { recognition?.abort?.(); } catch (_) {}
  stopServerAudioSegment();
  setStatus('paused', 'Transcrição pausada');
  await flushAssemblySpeechActivity();
}

export function syncAssemblyTranscriptionWithMicrophone() {
  if (microphoneEnabled()) {
    shouldRun = true;
    startAssemblyTranscription();
  } else {
    flushAssemblySpeechActivity();
    stopAssemblyTranscription();
  }
}

function retryFromUserInteraction() {
  if (!state.connected || !microphoneEnabled()) return;
  shouldRun = true;
  if (serverFallbackActive) {
    if (!serverRecorder) startServerAudioSegment();
    return;
  }
  if (!recognitionRunning && !recognitionStarting) attemptRecognitionStart('interação do usuário');
}

['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
  window.addEventListener(eventName, retryFromUserInteraction, { passive: true });
});

window.addEventListener('focus', () => {
  if (shouldRun && microphoneEnabled() && !serverFallbackActive && !recognitionRunning) {
    scheduleRecognitionRestart('janela voltou ao foco', 150);
  }
});

window.addEventListener('online', () => {
  if (shouldRun && microphoneEnabled() && !serverFallbackActive && !recognitionRunning) {
    scheduleRecognitionRestart('conexão restabelecida', 250);
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && shouldRun && microphoneEnabled() && !serverFallbackActive && !recognitionRunning) {
    scheduleRecognitionRestart('aba voltou a ficar visível', 200);
  }
});

window.addEventListener('condomit:assembly-microphone-state', (event) => {
  const enabled = Boolean(event?.detail?.enabled);
  if (enabled) {
    shouldRun = true;
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
  const finalSegments = segments.filter((segment) => segment?.final === true && String(segment?.text || '').trim());
  if (!finalSegments.length) return;

  // Se o LiveKit já estiver fornecendo texto, ele tem prioridade e o fallback
  // de áudio é interrompido para não gerar transcrições duplicadas.
  if (serverFallbackActive) {
    serverFallbackActive = false;
    stopServerAudioSegment();
  }

  finalSegments.forEach((segment) => saveFinalTranscript(segment.text, 'livekit'));
});
