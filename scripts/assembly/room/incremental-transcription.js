import { state } from './state.js?v=079';
import { getLocalWhisper } from './local-whisper.js?v=078';

const SEGMENT_MS = 8000;
const MAX_PENDING_SEGMENTS = 48;
const RETRY_DELAY_MS = 12000;
let active = false;
let closing = false;
let audioContext = null;
let audioSource = null;
let audioWorklet = null;
let audioSink = null;
let capturedTrack = null;
let rawFrames = [];
let rawLength = 0;
let rawRate = 48000;
let startingCapture = false;
let processedCount = 0;
let recorder = null;
let recorderFinished = null;
let recordingTimeout = null;
let retryTimer = null;
let processing = false;
let retryAfter = 0;
let failedCount = 0;
let missedCount = 0;
let captureError = '';
let modelReady = false;
let lastStatus = '';
const queue = [];
const listeners = new Set();

function log(event, detail = {}) {
  console.info('[Condomit transcrição]', event, { queued: queue.length, processing, ...detail });
}

function setStatus(message, detail = '', warning = false) {
  lastStatus = message;
  const el = document.getElementById('call-transcription-status');
  if (!el) return;
  const label = el.querySelector('span');
  if (label) label.textContent = message;
  el.dataset.status = warning || /falha|indisponível|não transcrit|aguardando|bloqueado|pendente|erro/i.test(message) ? 'warning' : 'active';
  el.title = detail || message;
  el.setAttribute('aria-label', `${message}. ${detail}`);
}

function notify() {
  const result = getIncrementalTranscriptionState();
  for (const callback of listeners) callback(result);
}

export function getIncrementalTranscriptionState() {
  return { pending: queue.length + Number(processing), saved: processedCount, failed: failedCount, missed: missedCount, active, closing, modelReady, captureError, status: lastStatus };
}

function microphoneTrack() {
  const publications = state.room?.localParticipant?.trackPublications;
  if (!publications) return null;
  for (const publication of publications.values()) {
    const media = publication.track?.mediaStreamTrack;
    if (media?.kind === 'audio' && media.readyState === 'live' && !publication.isMuted) return media;
  }
  return null;
}

async function decodeTo16K(blob) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Context || !Offline) throw new Error('Navegador sem decodificador de áudio.');
  const context = new Context();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new Offline(1, Math.max(1, Math.ceil(audio.duration * 16000)), 16000);
    const source = offline.createBufferSource();
    source.buffer = audio;
    source.connect(offline.destination);
    source.start(0);
    return new Float32Array((await offline.startRendering()).getChannelData(0));
  } finally {
    await context.close().catch(() => {});
  }
}

function hasSpeechSignal(audio) {
  if (!audio?.length) return false;
  let sum = 0;
  const stride = Math.max(1, Math.floor(audio.length / 30000));
  let samples = 0;
  for (let i = 0; i < audio.length; i += stride) { sum += audio[i] * audio[i]; samples++; }
  return Math.sqrt(sum / Math.max(samples, 1)) > 0.002;
}

function resampleTo16K(chunks, sourceRate, sampleCount) {
  if (!Number.isFinite(sourceRate) || sourceRate < 8000) throw new Error('Frequência de áudio inválida.');
  const merged = new Float32Array(sampleCount);
  let position = 0;
  for (const chunk of chunks) { merged.set(chunk, position); position += chunk.length; }
  if (sourceRate === 16000) return merged;
  const ratio = sourceRate / 16000;
  const output = new Float32Array(Math.ceil(merged.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const p = i * ratio;
    const left = Math.min(merged.length - 1, Math.floor(p));
    const right = Math.min(merged.length - 1, left + 1);
    output[i] = merged[left] * (1 - (p - left)) + merged[right] * (p - left);
  }
  return output;
}

function enqueueSegment(data) {
  if ((!active && !closing) || !data) return;
  if (queue.length >= MAX_PENDING_SEGMENTS) {
    missedCount++;
    captureError = 'O dispositivo não conseguiu acompanhar todas as falas.';
    setStatus(`${missedCount} trecho(s) sem processamento`, 'A transcrição está sobrecarregada. Confira o vídeo integral antes de aprovar a ata.', true);
    log('capture-overload', { missed: missedCount });
    notify();
    return;
  }
  queue.push({ ...data, attempts: 0 });
  notify();
  processQueue();
}

function onPcmFrame(frame) {
  if (!active || !frame?.buffer?.length) return;
  const rate = Number(frame.rate || 48000);
  if (rawLength && rate !== rawRate) flushRawAudio();
  rawRate = rate;
  rawFrames.push(frame.buffer);
  rawLength += frame.buffer.length;
  if (rawLength >= SEGMENT_MS * rawRate / 1000) flushRawAudio();
}

function flushRawAudio() {
  if (!rawLength) return;
  const frames = rawFrames;
  const length = rawLength;
  const rate = rawRate;
  rawFrames = [];
  rawLength = 0;
  if (length < rate * 0.6) return;
  enqueueSegment({ pcm: frames, sampleRate: rate, sampleCount: length, identity: String(state.room?.localParticipant?.identity || '') });
}

function cleanupPcm() {
  flushRawAudio();
  audioWorklet?.port?.close?.();
  audioSource?.disconnect?.();
  audioWorklet?.disconnect?.();
  audioSink?.disconnect?.();
  audioContext?.close?.().catch(() => {});
  audioContext = null;
  audioSource = null;
  audioWorklet = null;
  audioSink = null;
  capturedTrack = null;
}

async function tryPcmCapture() {
  if (startingCapture || audioContext || !active) return;
  const track = microphoneTrack();
  if (!track) {
    captureError = 'Microfone não ativado ou sem permissão.';
    setStatus('Aguardando microfone', 'Ative o microfone e autorize o navegador para registrar suas falas.', true);
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !window.AudioWorkletNode) return;
  startingCapture = true;
  let ctx = null;
  try {
    ctx = new Ctx({ latencyHint: 'interactive' });
    await Promise.race([
      ctx.audioWorklet.addModule(new URL('./transcription-worklet.js', import.meta.url)),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AudioWorklet sem resposta')), 3500))
    ]);
    if (!active) return;
    await Promise.race([
      ctx.resume(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AudioContext suspenso')), 1200))
    ]);
    if (ctx.state !== 'running') throw new Error('AudioContext suspenso');
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const worklet = new AudioWorkletNode(ctx, 'condomit-pcm-capture');
    const sink = ctx.createGain();
    sink.gain.value = 0;
    worklet.port.onmessage = event => onPcmFrame(event.data);
    source.connect(worklet);
    worklet.connect(sink);
    sink.connect(ctx.destination);
    audioContext = ctx;
    audioSource = source;
    audioWorklet = worklet;
    audioSink = sink;
    capturedTrack = track;
    captureError = '';
    setStatus('Microfone captado · preparando reconhecimento', 'O áudio está chegando ao dispositivo; a transcrição e o salvamento são etapas separadas.');
  } catch (error) {
    captureError = 'Captura PCM indisponível; tentando modo compatível.';
    log('pcm-fallback', { reason: String(error?.message || error) });
  } finally {
    if (ctx && audioContext !== ctx) await ctx.close().catch(() => {});
    startingCapture = false;
  }
}

function usefulText(input) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 4000) return '';
  if (/^\[?(music|música|silêncio|silence|noise|ruído)\]?$/i.test(text)) return '';
  return text;
}

function createWav(audio) {
  const buffer = new ArrayBuffer(44 + audio.length * 2);
  const view = new DataView(buffer);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, audio.length * 2, true);
  for (let i = 0; i < audio.length; i++) {
    const sample = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function ensureAudioUploaded(segment, pcm) {
  if (segment.audioPath) return segment.audioPath;
  const supabase = window.supabase;
  if (!supabase?.storage) throw new Error('Armazenamento de áudio indisponível.');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) throw new Error('Sessão expirada ao salvar áudio.');
  const audio = segment.blob || createWav(pcm);
  const ext = segment.blob ? (audio.type.includes('mp4') ? 'mp4' : 'webm') : 'wav';
  const path = `${Number(state.assemblyId)}/trechos/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('condomit-assembly-recordings').upload(path, audio, {
    contentType: ext === 'wav' ? 'audio/wav' : ext === 'mp4' ? 'audio/mp4' : 'audio/webm',
    upsert: false,
    cacheControl: '3600'
  });
  if (error) throw new Error(`Não foi possível guardar o áudio da fala: ${error.message}`);
  segment.audioPath = path;
  return path;
}

async function saveText(text, identity, audioPath) {
  if (typeof window.supabaseFetch !== 'function') throw new Error('Sessão do Supabase ainda não carregada.');
  const payload = {
    target_assembly_id: Number(state.assemblyId),
    transcript_text: text,
    participant_identity_value: identity || null,
    transcript_source_value: 'whisper_browser_local',
    confidence_value: null
  };
  try {
    await window.supabaseFetch('/rpc/condomit_append_assembly_transcript_audio_055', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, audio_path_value: audioPath })
    });
  } catch (error) {
    if (!/PGRST202|could not find the function|function.*does not exist|não encontr.*função/i.test(String(error?.message || ''))) throw error;
    await window.supabaseFetch('/rpc/condomit_append_assembly_transcript', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    captureError = 'A migração 055 precisa ser aplicada para vincular áudio aos trechos.';
    setStatus('Texto salvo · áudio sem vínculo', captureError, true);
  }
}

async function processQueue() {
  if (processing || Date.now() < retryAfter || !queue.length) return;
  processing = true;
  notify();
  try {
    while (queue.length) {
      const segment = queue[0];
      try {
        setStatus(`Reconhecendo fala · ${queue.length} pendente(s)`, 'Áudio capturado; aguardando reconhecimento Whisper e confirmação do Supabase.');
        const audio = segment.pcm ? resampleTo16K(segment.pcm, segment.sampleRate, segment.sampleCount) : await decodeTo16K(segment.blob);
        if (hasSpeechSignal(audio)) {
          const model = await getLocalWhisper(message => setStatus(message, 'Carregamento do modelo de reconhecimento.'));
          modelReady = true;
          const output = await model(audio, { language: 'portuguese', task: 'transcribe', return_timestamps: false, chunk_length_s: 30, stride_length_s: 5 });
          const text = usefulText(output?.text || (typeof output === 'string' ? output : ''));
          if (text) {
            setStatus(`Salvando texto · ${queue.length} pendente(s)`, 'Enviando trecho reconhecido ao banco de dados.');
            const audioPath = await ensureAudioUploaded(segment, audio);
            await saveText(text, segment.identity, audioPath);
            processedCount++;
            log('segment-saved', { saved: processedCount });
          }
        }
        queue.shift();
        if (segment.reportedFailure) failedCount = Math.max(0, failedCount - 1);
        notify();
      } catch (error) {
        segment.attempts++;
        log('segment-error', { reason: String(error?.message || error), attempt: segment.attempts });
        if (segment.attempts >= 3 && !segment.reportedFailure) {
          segment.reportedFailure = true;
          failedCount++;
          captureError = 'Reconhecimento ou salvamento ainda indisponível.';
        }
        modelReady = false;
        retryAfter = Date.now() + RETRY_DELAY_MS;
        setStatus(`${segment.reportedFailure ? 'Falha persistente' : 'Falha temporária'} · ${queue.length} pendente(s)`, 'O áudio ainda está na fila local. Uma nova tentativa será feita automaticamente enquanto a sala estiver aberta.', true);
        notify();
        break;
      }
    }
  } finally {
    processing = false;
    if (!queue.length && !failedCount && !missedCount) {
      setStatus(modelReady ? `Transcrição salva · ${processedCount} trecho(s)` : 'Capturando áudio · aguardando voz', 'A confirmação de salvamento é exibida somente após a resposta do Supabase.');
    }
    notify();
  }
}

function startSegment() {
  if (!active || recorder || typeof MediaRecorder === 'undefined') return;
  const track = microphoneTrack();
  if (!track) return;
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || '';
  let next;
  try {
    next = new MediaRecorder(new MediaStream([track]), mime ? { mimeType: mime } : {});
  } catch (error) {
    captureError = 'Não foi possível iniciar o gravador de áudio local.';
    setStatus('Falha na captura do microfone', 'Confira as permissões e a compatibilidade do navegador.', true);
    log('recorder-error', { reason: String(error?.message || error) });
    return;
  }
  recorder = next;
  const chunks = [];
  recorderFinished = new Promise(resolve => {
    next.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    next.onerror = event => {
      captureError = 'O navegador interrompeu a captura do microfone.';
      setStatus('Falha no gravador de áudio', 'Verifique o microfone e tente novamente.', true);
      log('recorder-error', { reason: String(event?.error?.message || 'Erro MediaRecorder') });
      if (next.state === 'recording') next.stop();
    };
    next.onstop = () => {
      clearTimeout(recordingTimeout);
      if (recorder === next) recorder = null;
      if (chunks.length) enqueueSegment({ blob: new Blob(chunks, { type: next.mimeType || mime || 'audio/webm' }), identity: String(state.room?.localParticipant?.identity || '') });
      resolve();
      if (active && !audioContext) startSegment();
    };
  });
  try {
    next.start();
    captureError = '';
    setStatus('Capturando microfone · modo compatível', 'O áudio está sendo segmentado e será salvo após reconhecimento.');
    recordingTimeout = setTimeout(() => { if (next.state === 'recording') next.stop(); }, SEGMENT_MS);
  } catch (error) {
    recorder = null;
    recorderFinished = Promise.resolve();
    captureError = String(error?.message || error);
    setStatus('Falha ao capturar microfone', captureError, true);
  }
}

async function retry() {
  if (!active) return;
  const track = microphoneTrack();
  if (!track) {
    if (audioContext) cleanupPcm();
    if (recorder?.state === 'recording') recorder.stop();
    setStatus('Aguardando microfone', 'Ative o microfone para registrar sua fala.', true);
  } else {
    if (audioContext && (capturedTrack !== track || audioContext.state !== 'running')) cleanupPcm();
    if (!audioContext && !startingCapture && !recorder) await tryPcmCapture();
    if (!audioContext && !recorder && !startingCapture) startSegment();
  }
  if (queue.length) processQueue();
}

export function startIncrementalTranscription() {
  if (active) return;
  active = true;
  closing = false;
  retryAfter = 0;
  setStatus('Iniciando captura do microfone…', 'Áudio, reconhecimento e salvamento serão acompanhados separadamente.');
  retry();
  retryTimer = setInterval(retry, 2000);
  notify();
}

export async function stopIncrementalTranscription({ timeoutMs = 30000 } = {}) {
  if (closing) return getIncrementalTranscriptionState();
  active = false;
  closing = true;
  clearInterval(retryTimer);
  retryTimer = null;
  clearTimeout(recordingTimeout);
  cleanupPcm();
  const stopping = recorderFinished;
  if (recorder?.state === 'recording') recorder.stop();
  if (stopping) await Promise.race([stopping, new Promise(resolve => setTimeout(resolve, 2000))]);
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while ((queue.length || processing) && Date.now() < deadline) {
    if (Date.now() >= retryAfter) processQueue();
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const outcome = getIncrementalTranscriptionState();
  closing = false;
  if (outcome.pending || outcome.failed || outcome.missed) {
    setStatus(`Transcrição incompleta · ${outcome.pending} pendente(s)`, 'Você pode continuar na sala para tentar salvar os trechos. A gravação do servidor deve ser conferida.', true);
  }
  notify();
  return outcome;
}

window.addEventListener('condomit:assembly-allow-audio', () => {
  if (active && audioContext?.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
});
