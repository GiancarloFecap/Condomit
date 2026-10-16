import { state } from './state.js?v=0724';
import { getLocalWhisper } from './local-whisper.js?v=077';

const SEGMENT_MS = 8000;
const MAX_PENDING_SEGMENTS = 16;
let active = false;
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
  el.dataset.status = /falha|indisponível|não transcrit|aguardando/i.test(message) ? 'warning' : 'active';
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

function resampleTo16K(chunks, sourceRate, sampleCount) {
  const merged = new Float32Array(sampleCount);
  let index = 0;
  for (const chunk of chunks) {merged.set(chunk,index); index+=chunk.length;}
  if (!Number.isFinite(sourceRate) || sourceRate < 8000) throw new Error('Frequência de áudio inválida.');
  if (sourceRate === 16000) return merged;
  const ratio = sourceRate / 16000;
  const output = new Float32Array(Math.ceil(merged.length / ratio));
  for (let i=0;i<output.length;i++) {
    const p = i*ratio;
    const left = Math.min(merged.length-1,Math.floor(p));
    const right = Math.min(merged.length-1,left+1);
    const fract = p-left;
    output[i] = merged[left]*(1-fract)+merged[right]*fract;
  }
  return output;
}

function enqueueSegment(data) {
  if (!active || !data) return;
  if (queue.length >= MAX_PENDING_SEGMENTS) {
    setStatus('Dispositivo sobrecarregado', 'Alguns trechos não poderão ser transcritos neste aparelho. O vídeo continua no servidor.');
    return;
  }
  queue.push(data);
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
  const frames = rawFrames, length=rawLength, rate=rawRate;
  rawFrames = [];rawLength=0;
  if (length < rate * 0.6) return;
  enqueueSegment({pcm:frames, sampleRate:rate, sampleCount:length, identity:String(state.room?.localParticipant?.identity||'')});
}

async function tryPcmCapture() {
  if (startingCapture || audioContext || !active) return;
  const track = microphoneTrack();
  if (!track) {setStatus('Aguardando microfone ativo…', 'Ative o microfone para transcrever sua fala.'); return;}
  if (!window.AudioWorkletNode) return;
  startingCapture = true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({latencyHint:'interactive'});
    await ctx.audioWorklet.addModule(new URL('./transcription-worklet.js', import.meta.url));
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const worklet = new AudioWorkletNode(ctx,'condomit-pcm-capture');
    const sink = ctx.createGain(); sink.gain.value=0;
    worklet.port.onmessage = event => onPcmFrame(event.data);
    source.connect(worklet); worklet.connect(sink); sink.connect(ctx.destination);
    audioContext=ctx; audioSource=source;audioWorklet=worklet;audioSink=sink;capturedTrack=track;
    ctx.resume().then(() => {
      if (audioContext === ctx && active) setStatus('Transcrição captando microfone…', 'Os trechos de áudio serão reconhecidos no próprio aparelho pelo Whisper.');
    }).catch(error => console.warn('[Condomit] Contexto de áudio aguardando gesto:',error));
    if (ctx.state === 'suspended') setStatus('Ative a transcrição tocando na tela', 'O navegador exige uma interação para liberar o processamento de áudio.');
  } catch(error) {
    console.warn('[Condomit] Worklet indisponível; tentando MediaRecorder.',error);
    if (audioContext) { await audioContext.close().catch(()=>{}); audioContext=null; }
  } finally {startingCapture = false;}
}

function cleanupPcm() {
  flushRawAudio();
  audioWorklet?.port?.close?.();
  audioSource?.disconnect?.();audioWorklet?.disconnect?.();audioSink?.disconnect?.();
  audioContext?.close?.().catch(()=>{});
  audioContext=null;audioSource=null;audioWorklet=null;audioSink=null;capturedTrack=null;
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
        const audio = segment.pcm ? resampleTo16K(segment.pcm,segment.sampleRate,segment.sampleCount) : await decodeTo16K(segment.blob);
        if (!hasSpeechSignal(audio)) continue;
        const model = await getLocalWhisper((message) => setStatus(message));
        const result = await model(audio, {
          language: 'portuguese', task: 'transcribe',
          return_timestamps: false, chunk_length_s: 30, stride_length_s: 5
        });
        const text = usefulText(result?.text || (typeof result === 'string' ? result : ''));
        if (text) {
          await saveText(text, segment.identity);
          processedCount++;
          setStatus(`Transcrição: ${processedCount} trecho${processedCount===1?'':'s'} salvo${processedCount===1?'':'s'}`, 'Falas transcritas no dispositivo e registradas no Supabase. Confira a ata.');
        }
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
      if (!recorder && !audioContext) startSegment();
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
      enqueueSegment({
        blob: new Blob(chunks, { type: next.mimeType || mime || 'audio/webm' }),
        identity: String(state.room?.localParticipant?.identity || '').trim()
      });
    }
    if (active && !audioContext) startSegment();
  };
  next.start();
  recordingTimeout = setTimeout(() => { if (next.state === 'recording') next.stop(); }, SEGMENT_MS);
}

export function startIncrementalTranscription() {
  if (active) return;
  active = true;
  engineUnavailable = false;
  setStatus('Preparando transcrição local…', 'Whisper é executado no navegador sem créditos da OpenAI.');
  processedCount = 0;
  getLocalWhisper(message => setStatus(message)).catch(error => {
    console.warn('[Condomit Whisper] Modelo não carregado:', error);
    setStatus('Modelo de voz não carregado', 'Confira a conexão de internet e atualize a página. A gravação em vídeo é independente.');
  });
  const retry = async () => {
    if (!active || engineUnavailable) return;
    const track = microphoneTrack();
    if (!track) { if (audioContext) cleanupPcm(); return; }
    if (audioContext && capturedTrack !== track) cleanupPcm();
    if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
    if (!audioContext && !startingCapture && !recorder) await tryPcmCapture();
    if (!audioContext && !recorder && !startingCapture) startSegment();
  };
  retry();
  retryTimer = setInterval(retry, 2000);
}

export function stopIncrementalTranscription() {
  active = false;
  if (retryTimer) clearInterval(retryTimer);
  retryTimer = null;
  if (recordingTimeout) clearTimeout(recordingTimeout);
  cleanupPcm();
  if (recorder?.state === 'recording') recorder.stop();
  recorder = null;
  queue.length = 0;
}

window.addEventListener('condomit:assembly-allow-audio', () => {
  if (active && audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
});
