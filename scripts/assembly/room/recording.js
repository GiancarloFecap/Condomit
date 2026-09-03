import { state } from './state.js?v=065';

const recording = {
  recorder: null,
  chunks: [],
  canvas: null,
  canvasStream: null,
  audioContext: null,
  audioDestination: null,
  audioNodes: new Map(),
  refreshTimer: null,
  drawTimer: null,
  startedAt: null,
  stopping: false
};

function safeText(value) {
  return String(value ?? '').trim();
}

function setUi(active) {
  const button = document.getElementById('btn-recording');
  const label = document.getElementById('recording-status');
  if (button) {
    button.classList.toggle('active', active);
    button.classList.toggle('recording', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const span = button.querySelector('span');
    if (span) span.textContent = active ? 'Gravando' : 'Gravar';
  }
  if (label) {
    label.hidden = !active;
    label.textContent = active ? '● REC' : '';
  }
}

function getAllPublications(room) {
  const pubs = [];
  const collect = (participant) => {
    participant?.trackPublications?.forEach?.((publication) => pubs.push(publication));
  };
  collect(room?.localParticipant);
  room?.remoteParticipants?.forEach?.(collect);
  return pubs;
}

function getAudioMediaTracks(room) {
  const tracks = [];
  for (const pub of getAllPublications(room)) {
    const mediaTrack = pub?.track?.mediaStreamTrack;
    if (!mediaTrack || mediaTrack.kind !== 'audio' || mediaTrack.readyState === 'ended') continue;
    tracks.push(mediaTrack);
  }
  return tracks;
}

async function ensureAudioGraph() {
  if (recording.audioContext && recording.audioDestination) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('O navegador não oferece suporte à mistura de áudio para gravação.');
  recording.audioContext = new AudioCtx();
  recording.audioDestination = recording.audioContext.createMediaStreamDestination();
  if (recording.audioContext.state === 'suspended') {
    await recording.audioContext.resume().catch(() => {});
  }
}

async function refreshAudioSources() {
  await ensureAudioGraph();
  const current = new Set();
  const tracks = getAudioMediaTracks(state.room);

  for (const track of tracks) {
    current.add(track.id);
    if (recording.audioNodes.has(track.id)) continue;
    try {
      const stream = new MediaStream([track]);
      const source = recording.audioContext.createMediaStreamSource(stream);
      source.connect(recording.audioDestination);
      recording.audioNodes.set(track.id, { source, track });
    } catch (error) {
      console.warn('[Assembly Recording] Não foi possível adicionar uma faixa de áudio.', error);
    }
  }

  for (const [id, item] of recording.audioNodes.entries()) {
    if (current.has(id) && item.track?.readyState !== 'ended') continue;
    try { item.source?.disconnect?.(); } catch (_) {}
    recording.audioNodes.delete(id);
  }
}

function getScreenShareVideo() {
  const container = document.getElementById('call-screen-share');
  if (!container || container.style.display === 'none') return null;
  return container.querySelector('video');
}

function getCameraVideos() {
  return Array.from(document.querySelectorAll('#call-grid video[data-assembly-camera="1"], #call-grid video'))
    .filter((video) => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
}

function drawCover(ctx, video, x, y, w, h, contain = false) {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const sourceRatio = vw / vh;
  const targetRatio = w / h;
  let dw = w;
  let dh = h;
  let dx = x;
  let dy = y;

  if (contain) {
    if (sourceRatio > targetRatio) {
      dh = w / sourceRatio;
      dy = y + (h - dh) / 2;
    } else {
      dw = h * sourceRatio;
      dx = x + (w - dw) / 2;
    }
  } else if (sourceRatio > targetRatio) {
    dw = h * sourceRatio;
    dx = x - (dw - w) / 2;
  } else {
    dh = w / sourceRatio;
    dy = y - (dh - h) / 2;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();
}

function drawMeetingFrame() {
  const canvas = recording.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, w, h);

  const screen = getScreenShareVideo();
  if (screen?.readyState >= 2 && screen.videoWidth > 0) {
    drawCover(ctx, screen, 0, 0, w, h, true);
  } else {
    const videos = getCameraVideos();
    if (videos.length) {
      const cols = Math.ceil(Math.sqrt(videos.length));
      const rows = Math.ceil(videos.length / cols);
      const gap = 8;
      const tileW = (w - gap * (cols + 1)) / cols;
      const tileH = (h - gap * (rows + 1)) / rows;
      videos.forEach((video, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        drawCover(ctx, video, gap + col * (tileW + gap), gap + row * (tileH + gap), tileW, tileH, false);
      });
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 40px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(safeText(state.assembly?.title || 'Assembleia Condomit'), w / 2, h / 2 - 15);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '24px Arial, sans-serif';
      ctx.fillText('Gravação de áudio em andamento', w / 2, h / 2 + 35);
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(18, 18, 112, 44);
  ctx.fillStyle = '#ff4d4f';
  ctx.beginPath();
  ctx.arc(39, 40, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 21px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('REC', 57, 47);
}

function chooseMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'audio/webm;codecs=opus',
    'audio/webm'
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function sanitizeFilename(value) {
  return safeText(value || 'assembleia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'assembleia';
}

function downloadBlob(blob) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const title = sanitizeFilename(state.assembly?.title || `assembleia-${state.assemblyId}`);
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}-${stamp}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function isRecordingSupported() {
  return typeof window.MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export function isAssemblyRecording() {
  return recording.recorder?.state === 'recording';
}

export async function startAssemblyRecording() {
  if (isAssemblyRecording()) return true;
  if (!state.room) throw new Error('A sala ainda não está conectada.');
  if (!isRecordingSupported()) throw new Error('Este navegador não oferece suporte à gravação da assembleia.');

  recording.chunks = [];
  recording.stopping = false;
  recording.canvas = document.createElement('canvas');
  recording.canvas.width = 1280;
  recording.canvas.height = 720;
  recording.canvas.style.display = 'none';
  recording.canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(recording.canvas);

  await ensureAudioGraph();
  await refreshAudioSources();
  recording.refreshTimer = window.setInterval(() => refreshAudioSources().catch(() => {}), 1500);
  recording.drawTimer = window.setInterval(drawMeetingFrame, 1000 / 24);
  drawMeetingFrame();

  recording.canvasStream = recording.canvas.captureStream(24);
  const output = new MediaStream();
  recording.canvasStream.getVideoTracks().forEach((track) => output.addTrack(track));
  recording.audioDestination.stream.getAudioTracks().forEach((track) => output.addTrack(track));

  const mimeType = chooseMimeType();
  const options = mimeType ? { mimeType, videoBitsPerSecond: 2500000, audioBitsPerSecond: 128000 } : undefined;
  recording.recorder = new MediaRecorder(output, options);
  recording.recorder.ondataavailable = (event) => {
    if (event.data?.size) recording.chunks.push(event.data);
  };
  recording.recorder.onerror = (event) => {
    console.error('[Assembly Recording] Erro no MediaRecorder', event?.error || event);
  };
  recording.recorder.start(1000);
  recording.startedAt = new Date();
  setUi(true);
  window.dispatchEvent(new CustomEvent('condomit:assembly-recording-state', { detail: { active: true } }));
  return true;
}

export async function stopAssemblyRecording({ download = true } = {}) {
  if (!recording.recorder || recording.recorder.state === 'inactive' || recording.stopping) return null;
  recording.stopping = true;

  const recorder = recording.recorder;
  const stopped = new Promise((resolve) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
  });
  try { recorder.requestData?.(); } catch (_) {}
  recorder.stop();
  await stopped;

  clearInterval(recording.refreshTimer);
  clearInterval(recording.drawTimer);
  recording.refreshTimer = null;
  recording.drawTimer = null;

  const blob = new Blob(recording.chunks, { type: recorder.mimeType || 'video/webm' });
  if (download && blob.size > 0) downloadBlob(blob);

  recording.audioNodes.forEach((item) => { try { item.source?.disconnect?.(); } catch (_) {} });
  recording.audioNodes.clear();
  try { recording.canvasStream?.getTracks?.().forEach((track) => track.stop()); } catch (_) {}
  try { await recording.audioContext?.close?.(); } catch (_) {}
  try { recording.canvas?.remove?.(); } catch (_) {}

  recording.recorder = null;
  recording.canvas = null;
  recording.canvasStream = null;
  recording.audioContext = null;
  recording.audioDestination = null;
  recording.chunks = [];
  recording.startedAt = null;
  recording.stopping = false;
  setUi(false);
  window.dispatchEvent(new CustomEvent('condomit:assembly-recording-state', { detail: { active: false } }));
  return blob;
}
