import { state } from './state.js?v=0724';
import { getLocalWhisper } from './local-whisper.js?v=075';

const SEGMENT_MS = 16000;
const MAX_PENDING_SEGMENTS = 8;
let active = false;
let recorder = null;
let recordingTimeout = null;
let retryTimer = null;
let processing = false;
let engineUnavailable = false;
const queue = [];

function setStatus(message, detail = '') {
  const el = document.getElementById('call-transcription-status');
  if (!el) return;
  const label = el.querySelector('span');
  if (label) label.textContent = message;
  el.title = detail || message;
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
  if (!Context || !Offline) throw new Error('Este navegador não oferece suporte à decodificação local de áudio.');
  const context = new Context();
  try {
    const raw = await blob.arrayBuffer();
    const audio = await context.decodeAudioData(raw);
    const length = Math.max(1, Math.ceil(audio.duration * 16000));
    const offline = new Offline(1, length, 16000);
    const source = offline.createBufferSource();
    source.buffer = audio;
    source.connect(offline.destination);
    source.start(0);
    const resampled = await offline.startRendering();
    return new Float32Array(resampled.getChannelData(0));
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

function usefulText(input) {
  const text = String(input || '').replace(/\s+/g, ' ').trim();
  if (text.length < 3 || text.length > 4000) return '';
  if (/^\[?(music|música|silêncio|silence|noise|ruído)\]?$/i.test(text)) return '';
  return text;
}

async function saveText(text, identity) {
  if (typeof window.supabaseFetch !== 'function') throw new Error('A sessão do Supabase ainda não foi carregada.');
  await window.supabaseFetch('/rpc/condomit_append_assembly_transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_assembly_id: Number(state.assemblyId),
      transcript_text: text,
      participant_identity_value: identity || null,
      transcript_source_value: 'whisper_browser_local',
      confidence_value: null
    })
  });
}

async function processQueue() {
  if (processing || engineUnavailable) return;
  processing = true;
  try {
    while (queue.length && active) {
      const segment = queue.shift();
      try {
        setStatus('Transcrição local em andamento…', 'A voz é processada no dispositivo, sem API paga. A gravação continua no servidor.');
        const audio = await decodeTo16K(segment.blob);
        if (!hasSpeechSignal(audio)) continue;
        const model = await getLocalWhisper((message) => setStatus(message));
        const result = await model(audio, {
          language: 'portuguese', task: 'transcribe',
          return_timestamps: false, chunk_length_s: 30, stride_length_s: 5
        });
        const text = usefulText(result?.text || (typeof result === 'string' ? result : ''));
        if (text) await saveText(text, segment.identity);
      } catch (error) {
        console.warn('[Condomit transcrição local] Trecho não transcrito:', error);
        setStatus('Trecho não transcrito: consulte a gravação.', 'A transcrição local não substitui a gravação integral nem a revisão da ata.');
        if (/modelo|pipeline|download|fetch|webgpu|wasm|memory/i.test(String(error?.message || ''))) {
          engineUnavailable = true;
          queue.length = 0;
          break;
        }
      }
    }
  } finally {
    processing = false;
    if (active && !engineUnavailable) {
      if (!recorder) startSegment();
      if (!queue.length) setStatus('Transcrição local ativada', 'Processamento Whisper no dispositivo; confira trechos e gravação antes de aprovar a ata.');
    }
  }
}

function startSegment() {
  if (!active || engineUnavailable || recorder || typeof MediaRecorder === 'undefined') return;
  if (queue.length >= MAX_PENDING_SEGMENTS) {
    setStatus('Transcrição aguardando dispositivo…', 'O áudio integral segue sendo gravado no servidor.');
    return;
  }
  const track = microphoneTrack();
  if (!track) return;
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((type) => MediaRecorder.isTypeSupported(type)) || '';
  let next;
  try { next = new MediaRecorder(new MediaStream([track]), mime ? { mimeType: mime } : {}); }
  catch (error) { console.warn('[Condomit transcrição local] Não foi possível iniciar microfone:', error); return; }
  recorder = next;
  const chunks = [];
  next.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  next.onerror = () => { clearTimeout(recordingTimeout); if (recorder === next) recorder = null; };
  next.onstop = () => {
    clearTimeout(recordingTimeout);
    if (recorder === next) recorder = null;
    if (chunks.length && active) {
      queue.push({
        blob: new Blob(chunks, { type: next.mimeType || mime || 'audio/webm' }),
        identity: String(state.room?.localParticipant?.identity || '').trim()
      });
      processQueue();
    }
    if (active) startSegment();
  };
  next.start();
  recordingTimeout = setTimeout(() => { if (next.state === 'recording') next.stop(); }, SEGMENT_MS);
}

export function startIncrementalTranscription() {
  if (active) return;
  active = true;
  engineUnavailable = false;
  setStatus('Preparando transcrição local…', 'Whisper é executado no navegador sem créditos da OpenAI.');
  startSegment();
  retryTimer = setInterval(() => { if (!recorder && !engineUnavailable) startSegment(); }, 2000);
}

export function stopIncrementalTranscription() {
  active = false;
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = null;
  if (recordingTimeout) clearTimeout(recordingTimeout);
  if (recorder?.state === 'recording') recorder.stop();
  recorder = null;
  queue.length = 0;
}
