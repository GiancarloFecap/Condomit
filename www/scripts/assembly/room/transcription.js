import { state } from './state.js?v=063';

// Condomit v0.63.0
// A transcrição da assembleia deixa de depender do SpeechRecognition do navegador.
// O áudio do próprio microfone publicado no LiveKit é capturado como PCM, convertido
// em WAV mono/16 kHz no cliente e enviado em blocos curtos para a Netlify Function.
// Isso evita os loops "Reconectando transcrição..." e os WebM/OGG incompletos que
// alguns navegadores e celulares produzem com MediaRecorder.

let shouldRun = false;
let watchdogTimer = null;
let speechStartedAt = 0;
let speechSavePromise = Promise.resolve();
let localSpeaking = false;
let lastSavedText = '';
let lastSavedAt = 0;
let serverUploadQueue = Promise.resolve();
let serverFailureCount = 0;
let transcriptionUnavailable = false;

let audioContext = null;
let audioSource = null;
let processorNode = null;
let silentGain = null;
let ownedMicrophoneTrack = null;
let captureStarting = false;
let captureGeneration = 0;
let pcmChunks = [];
let pcmSampleCount = 0;
let voicedSampleCount = 0;
let chunkHadLivekitSpeech = false;
let currentInputSampleRate = 48000;
let lastChunkQueuedAt = 0;

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 10;
const MIN_PARTIAL_SECONDS = 1.8;
const MIN_VOICE_SECONDS = 0.20;
const RMS_SPEECH_THRESHOLD = 0.0045;

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

async function saveFinalTranscript(text, source = 'livekit') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;

  const now = Date.now();
  if (normalized === lastSavedText && now - lastSavedAt < 12000) return true;

  if (typeof window.supabaseFetch !== 'function') return false;

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

    lastSavedText = normalized;
    lastSavedAt = now;
    setStatus(
      'active',
      'Transcrição automática ativa',
      source === 'server'
        ? 'Trecho de voz transcrito e registrado na ata.'
        : 'Transcrição recebida e registrada na ata.'
    );
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
    const publication = participant.getTrackPublication?.('microphone');
    const track = publication?.track?.mediaStreamTrack;
    if (track?.readyState === 'live' && track.enabled !== false) return track;
  } catch (_) {}

  try {
    const publications = participant.audioTrackPublications;
    const values = publications?.values ? Array.from(publications.values()) : [];
    const publication = values.find((item) => String(item?.source || '').toLowerCase().includes('microphone')) || values[0];
    const track = publication?.track?.mediaStreamTrack;
    if (track?.readyState === 'live' && track.enabled !== false) return track;
  } catch (_) {}

  return null;
}

async function resolveCaptureTrack() {
  const livekitTrack = getLocalMicrophoneTrack();
  if (livekitTrack) return livekitTrack;

  // Fallback raro: se o SDK ainda não expôs a faixa publicada, solicita apenas
  // áudio e usa essa faixa exclusivamente para transcrição.
  const stream = await navigator.mediaDevices?.getUserMedia?.({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });
  const track = stream?.getAudioTracks?.()[0] || null;
  if (track) ownedMicrophoneTrack = track;
  return track;
}

function rmsOf(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

function joinFloat32(chunks, totalLength) {
  const output = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function downsampleTo16k(input, inputRate) {
  const sourceRate = Math.max(1, Number(inputRate || TARGET_SAMPLE_RATE));
  if (sourceRate === TARGET_SAMPLE_RATE) return input;

  const ratio = sourceRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((outputIndex + 1) * ratio)));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) sum += input[inputIndex];
    output[outputIndex] = sum / Math.max(1, end - start);
  }

  return output;
}

function writeAscii(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodeWav(samples, sampleRate = TARGET_SAMPLE_RATE) {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
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

function errorLabel(code, fallback = 'Falha na transcrição automática') {
  const normalized = String(code || '');
  if (normalized === 'TRANSCRIPTION_NOT_CONFIGURED') return 'Transcrição não configurada';
  if (normalized === 'TRANSCRIPTION_INVALID_KEY') return 'Chave da transcrição inválida';
  if (normalized === 'TRANSCRIPTION_QUOTA') return 'Transcrição sem cota disponível';
  if (normalized === 'TRANSCRIPTION_AUDIO_INVALID') return 'Áudio não pôde ser processado';
  if (normalized === 'TRANSCRIPTION_AUTH') return 'Sessão da transcrição expirada';
  if (normalized === 'TRANSCRIPTION_SAVE_DENIED') return 'Sem permissão para registrar transcrição';
  if (normalized === 'TRANSCRIPTION_SAVE_ERROR') return 'Falha ao registrar transcrição';
  return fallback;
}

async function callTranscriptionEndpoint(endpoint, token, body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch (_) { payload = { error: raw }; }
  return { response, payload };
}

async function sendAudioForServerTranscription(blob) {
  // Um bloco já capturado deve terminar de ser enviado mesmo se o usuário
  // desligar o microfone ou sair da sala logo em seguida.
  if (!blob?.size || transcriptionUnavailable) return;

  setStatus('starting', 'Transcrevendo trecho...', 'Processando o áudio da assembleia em segundo plano.');

  try {
    const token = await resolveAccessToken();
    if (!token) {
      const authError = new Error('A sessão do usuário não está disponível. Entre novamente na Condomit.');
      authError.code = 'TRANSCRIPTION_AUTH';
      throw authError;
    }

    const body = {
      assembly_id: Number(state.assemblyId),
      participant_identity: localIdentity() || null,
      mime_type: 'audio/wav',
      audio_base64: await blobToBase64(blob)
    };

    let { response, payload } = await callTranscriptionEndpoint('/.netlify/functions/assembly-transcribe', token, body);
    if (response.status === 404) {
      ({ response, payload } = await callTranscriptionEndpoint('/api/assembly/transcribe', token, body));
    }

    if (!response.ok) {
      const requestError = new Error(
        payload?.provider_error ||
        payload?.error ||
        `Falha na transcrição (${response.status}).`
      );
      requestError.code = payload?.code || 'TRANSCRIPTION_PROVIDER_ERROR';
      requestError.httpStatus = response.status;
      requestError.providerStatus = payload?.provider_status || null;
      throw requestError;
    }

    serverFailureCount = 0;
    const text = String(payload?.text || '').replace(/\s+/g, ' ').trim();

    if (text) {
      lastSavedText = text;
      lastSavedAt = Date.now();
      if (payload?.saved === true) {
        setStatus('active', 'Transcrição automática ativa', 'Trecho transcrito e registrado na ata.');
      } else {
        await saveFinalTranscript(text, 'server');
      }
    } else {
      setStatus('active', 'Transcrição automática ativa', 'Aguardando fala inteligível.');
    }
  } catch (error) {
    serverFailureCount += 1;
    const code = String(error?.code || '');
    console.warn('[ASSEMBLY TRANSCRIPTION] PCM/WAV:', {
      code,
      status: error?.httpStatus || null,
      providerStatus: error?.providerStatus || null,
      message: error?.message || String(error)
    });

    if (code === 'TRANSCRIPTION_NOT_CONFIGURED' || code === 'TRANSCRIPTION_INVALID_KEY' || code === 'TRANSCRIPTION_QUOTA') {
      transcriptionUnavailable = true;
    }

    setStatus(
      'error',
      errorLabel(code),
      error?.message || 'Não foi possível transcrever o trecho de áudio.'
    );
  }
}

function resetPcmChunk() {
  pcmChunks = [];
  pcmSampleCount = 0;
  voicedSampleCount = 0;
  chunkHadLivekitSpeech = false;
}

function queueCurrentPcmChunk({ force = false } = {}) {
  if (!pcmSampleCount || !pcmChunks.length) return false;

  const sampleCount = pcmSampleCount;
  const inputRate = currentInputSampleRate || 48000;
  const durationSeconds = sampleCount / inputRate;
  const voicedSeconds = voicedSampleCount / inputRate;
  const hadSpeech = chunkHadLivekitSpeech || voicedSeconds >= MIN_VOICE_SECONDS;

  const chunks = pcmChunks;
  resetPcmChunk();

  if ((!force && durationSeconds < CHUNK_SECONDS * 0.65) || durationSeconds < MIN_PARTIAL_SECONDS || !hadSpeech) {
    return false;
  }

  const joined = joinFloat32(chunks, sampleCount);
  const mono16k = downsampleTo16k(joined, inputRate);
  const wavBlob = encodeWav(mono16k, TARGET_SAMPLE_RATE);
  lastChunkQueuedAt = Date.now();

  serverUploadQueue = serverUploadQueue
    .catch(() => {})
    .then(() => sendAudioForServerTranscription(wavBlob));

  return true;
}

function disconnectCaptureNodes() {
  try { processorNode && (processorNode.onaudioprocess = null); } catch (_) {}
  try { audioSource?.disconnect?.(); } catch (_) {}
  try { processorNode?.disconnect?.(); } catch (_) {}
  try { silentGain?.disconnect?.(); } catch (_) {}
  audioSource = null;
  processorNode = null;
  silentGain = null;

  try { ownedMicrophoneTrack?.stop?.(); } catch (_) {}
  ownedMicrophoneTrack = null;

  const context = audioContext;
  audioContext = null;
  if (context && context.state !== 'closed') {
    try { context.close(); } catch (_) {}
  }
}

async function stopPcmCapture({ flush = true } = {}) {
  captureGeneration += 1;
  captureStarting = false;
  if (flush) queueCurrentPcmChunk({ force: true });
  else resetPcmChunk();
  disconnectCaptureNodes();
}

async function startPcmCapture() {
  if (!shouldRun || transcriptionUnavailable || !microphoneEnabled()) return false;
  if (audioContext && processorNode) {
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume(); } catch (_) {}
    }
    return true;
  }
  if (captureStarting) return true;

  captureStarting = true;
  const generation = ++captureGeneration;
  setStatus('starting', 'Preparando transcrição...', 'Conectando ao áudio do seu microfone.');

  try {
    const track = await resolveCaptureTrack();
    if (!track) throw new Error('A faixa de microfone da chamada não está disponível.');
    if (generation !== captureGeneration || !shouldRun) return false;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      transcriptionUnavailable = true;
      throw new Error('Este navegador não oferece processamento de áudio compatível.');
    }

    const context = new AudioContextClass({ latencyHint: 'interactive' });
    try { await context.resume(); } catch (_) {}
    if (generation !== captureGeneration || !shouldRun) {
      try { await context.close(); } catch (_) {}
      return false;
    }

    currentInputSampleRate = Number(context.sampleRate || 48000);
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const processor = context.createScriptProcessor(4096, 1, 1);
    const gain = context.createGain();
    gain.gain.value = 0;

    resetPcmChunk();
    processor.onaudioprocess = (event) => {
      if (!shouldRun || transcriptionUnavailable) return;
      const input = event.inputBuffer?.getChannelData?.(0);
      if (!input?.length) return;

      const copy = new Float32Array(input);
      pcmChunks.push(copy);
      pcmSampleCount += copy.length;

      const rms = rmsOf(copy);
      if (rms >= RMS_SPEECH_THRESHOLD) voicedSampleCount += copy.length;
      if (localSpeaking) chunkHadLivekitSpeech = true;

      if (pcmSampleCount >= currentInputSampleRate * CHUNK_SECONDS) {
        queueCurrentPcmChunk();
      }
    };

    source.connect(processor);
    processor.connect(gain);
    gain.connect(context.destination);

    audioContext = context;
    audioSource = source;
    processorNode = processor;
    silentGain = gain;
    captureStarting = false;
    setStatus('active', 'Transcrição automática ativa', 'Áudio capturado em WAV e transcrito no servidor.');
    return true;
  } catch (error) {
    captureStarting = false;
    disconnectCaptureNodes();
    console.warn('[ASSEMBLY TRANSCRIPTION] Não foi possível iniciar captura PCM:', error);
    setStatus('error', 'Falha ao iniciar transcrição', error?.message || 'Não foi possível acessar o áudio do microfone.');
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

  localSpeaking = speaking;
  if (speaking) chunkHadLivekitSpeech = true;
}

export async function flushAssemblySpeechActivity() {
  if (speechStartedAt) {
    const start = speechStartedAt;
    speechStartedAt = 0;
    queueSpeechActivity(start, Date.now());
  }
  queueCurrentPcmChunk({ force: true });
  try { await speechSavePromise; } catch (_) {}
  try { await serverUploadQueue; } catch (_) {}
}

function ensureWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = window.setInterval(async () => {
    if (!state.connected) return;

    if (!microphoneEnabled()) {
      if (shouldRun || audioContext) {
        shouldRun = false;
        await stopPcmCapture({ flush: true });
        setStatus('paused', 'Transcrição aguardando microfone');
      }
      return;
    }

    shouldRun = true;
    if (!audioContext || !processorNode) {
      startPcmCapture();
      return;
    }

    if (audioContext.state === 'suspended' && !document.hidden) {
      try { await audioContext.resume(); } catch (_) {}
    }

    // Se por algum motivo o callback de áudio parar, recria a cadeia de captura.
    if (lastChunkQueuedAt && Date.now() - lastChunkQueuedAt > 30000 && pcmSampleCount === 0) {
      await stopPcmCapture({ flush: false });
      startPcmCapture();
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

  if (transcriptionUnavailable) {
    setStatus('error', 'Transcrição indisponível', 'Verifique a configuração da API de transcrição e recarregue a sala.');
    return false;
  }

  shouldRun = true;
  startPcmCapture();
  return true;
}

export async function stopAssemblyTranscription() {
  shouldRun = false;
  await stopPcmCapture({ flush: true });
  setStatus('paused', 'Transcrição pausada');
  await flushAssemblySpeechActivity();
}

export function syncAssemblyTranscriptionWithMicrophone() {
  if (microphoneEnabled()) {
    shouldRun = true;
    startAssemblyTranscription();
  } else {
    stopAssemblyTranscription();
  }
}

async function resumeFromUserInteraction() {
  if (!state.connected || !microphoneEnabled()) return;
  shouldRun = true;
  if (!audioContext || !processorNode) {
    startPcmCapture();
    return;
  }
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch (_) {}
  }
}

['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
  window.addEventListener(eventName, resumeFromUserInteraction, { passive: true });
});

window.addEventListener('focus', resumeFromUserInteraction);
window.addEventListener('online', resumeFromUserInteraction);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeFromUserInteraction();
});

window.addEventListener('condomit:assembly-microphone-state', (event) => {
  const enabled = Boolean(event?.detail?.enabled);
  if (enabled) {
    shouldRun = true;
    startAssemblyTranscription();
  } else {
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
  finalSegments.forEach((segment) => saveFinalTranscript(segment.text, 'livekit'));
});
