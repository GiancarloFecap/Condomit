import { state } from './state.js?v=0703';

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
  stopping: false,
  pendingUpload: null
};

function safeText(value) {
  return String(value ?? '').trim();
}

function setUi(active) {
  const label = document.getElementById('recording-status');
  if (label) {
    label.hidden = !active;
    label.textContent = active ? '● REC · Gravação automática' : '';
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

function canRecordAndPlay(mimeType) {
  if (!window.MediaRecorder?.isTypeSupported?.(mimeType)) return false;
  try {
    const video = document.createElement('video');
    const result = video.canPlayType?.(mimeType) || '';
    // `maybe` e `probably` indicam que o navegador reconhece o formato.
    return result === 'maybe' || result === 'probably';
  } catch (_) {
    return true;
  }
}

function chooseMimeType() {
  // Prefere formatos mais portáveis. MP4/H.264 é escolhido quando o navegador
  // realmente consegue gravar E reproduzir esse perfil. No WebM, VP8 vem antes
  // de VP9 por ter compatibilidade mais ampla entre navegadores/WebViews.
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42001E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ];
  return candidates.find(canRecordAndPlay)
    || candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type))
    || '';
}

function normalizeStorageMimeType(value) {
  const mime = String(value || '').split(';', 1)[0].trim().toLowerCase();
  if (mime === 'video/webm' || mime === 'video/mp4' || mime === 'audio/webm') return mime;
  return 'video/webm';
}

function base64Metadata(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function uploadRecordingTus(blob, bucket, storagePath, token) {
  const endpoint = `${window.SUPABASE_URL}/storage/v1/upload/resumable`;
  const metadata = [
    ['bucketName', bucket],
    ['objectName', storagePath],
    ['contentType', normalizeStorageMimeType(blob.type)],
    ['cacheControl', '3600']
  ].map(([key, value]) => `${key} ${base64Metadata(value)}`).join(',');

  const create = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: window.SUPABASE_ANON_KEY,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(blob.size),
      'Upload-Metadata': metadata,
      'x-upsert': 'false'
    }
  });
  if (!create.ok) {
    const detail = await create.text().catch(() => '');
    throw new Error(detail || `Falha ao preparar upload da gravação (${create.status}).`);
  }

  const location = create.headers.get('Location');
  if (!location) throw new Error('O armazenamento não retornou a URL do upload da gravação.');
  const uploadUrl = new URL(location, endpoint).toString();
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;

  while (offset < blob.size) {
    const chunk = blob.slice(offset, Math.min(offset + chunkSize, blob.size));
    let response = null;
    let lastError = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        response = await fetch(uploadUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: window.SUPABASE_ANON_KEY,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': String(offset),
            'Content-Type': 'application/offset+octet-stream'
          },
          body: chunk
        });
        if (response.ok) break;
        lastError = new Error((await response.text().catch(() => '')) || `Falha no envio (${response.status}).`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, [800, 2000, 4000, 7000][attempt]));
    }

    if (!response?.ok) throw lastError || new Error('Falha ao enviar um trecho da gravação.');
    const nextOffset = Number(response.headers.get('Upload-Offset'));
    offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + chunk.size;

    const label = document.getElementById('recording-status');
    if (label) {
      const percent = Math.min(100, Math.round((offset / blob.size) * 100));
      label.hidden = false;
      label.textContent = `Salvando gravação… ${percent}%`;
    }
  }
}

async function uploadRecordingStandard(blob, bucket, storagePath, token) {
  const url = `${window.SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: window.SUPABASE_ANON_KEY,
      'Content-Type': normalizeStorageMimeType(blob.type),
      'x-upsert': 'false'
    },
    body: blob
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `Falha ao enviar gravação (${response.status}).`);
  }
}

async function uploadRecordingBlob(blob, startedAt, endedAt) {
  if (!blob?.size || !state.assemblyId || !state.assembly?.cep) return null;
  const token = await window.resolveSupabaseAccessToken?.().catch(() => null);
  if (!token) throw new Error('Sessão expirada: não foi possível salvar a gravação na Ata.');

  const bucket = 'condomit-assembly-recordings';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const storagePath = `${Number(state.assemblyId)}/${stamp}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${extension}`;

  // Uploads maiores são enviados em blocos de 6 MB. Isso evita perder uma
  // assembleia inteira por limite/t instabilidade de uma única requisição HTTP.
  if (blob.size > 6 * 1024 * 1024) {
    await uploadRecordingTus(blob, bucket, storagePath, token);
  } else {
    await uploadRecordingStandard(blob, bucket, storagePath, token);
  }

  const durationSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const payload = {
    target_assembly_id: Number(state.assemblyId),
    storage_url_value: `storage://${bucket}/${storagePath}`,
    livekit_room_name_value: state.room?.name || null,
    duration_seconds_value: durationSeconds,
    file_size_bytes_value: blob.size,
    started_at_value: startedAt.toISOString(),
    ended_at_value: endedAt.toISOString()
  };

  // O registro é feito por RPC SECURITY DEFINER para não depender de uma
  // segunda política RLS depois que o arquivo já foi enviado ao Storage.
  return await window.supabaseFetch('/rpc/condomit_register_assembly_recording_040', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}


async function persistPendingRecording() {
  const pending = recording.pendingUpload;
  if (!pending?.blob?.size) return null;
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const label = document.getElementById('recording-status');
      if (label) {
        label.hidden = false;
        label.textContent = attempt === 1
          ? 'Salvando gravação na Ata…'
          : `Tentando salvar gravação novamente (${attempt}/4)…`;
      }
      const result = await uploadRecordingBlob(pending.blob, pending.startedAt, pending.endedAt);
      recording.pendingUpload = null;
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[Assembly Recording] Tentativa ${attempt}/4 falhou.`, error);
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    }
  }
  throw lastError || new Error('Não foi possível salvar a gravação na Ata.');
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
  const options = mimeType ? { mimeType, videoBitsPerSecond: 1200000, audioBitsPerSecond: 96000 } : undefined;
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

export async function stopAssemblyRecording() {
  // Se uma tentativa anterior de upload falhou, um novo clique em Sair tenta
  // persistir exatamente o mesmo arquivo antes de abandonar a página.
  if ((!recording.recorder || recording.recorder.state === 'inactive') && recording.pendingUpload) {
    await persistPendingRecording();
    setUi(false);
    return true;
  }

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
  const endedAt = new Date();
  if (blob.size > 0) {
    recording.pendingUpload = {
      blob,
      startedAt: recording.startedAt || endedAt,
      endedAt
    };
  }

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

  if (recording.pendingUpload) {
    try {
      await persistPendingRecording();
    } catch (error) {
      const label = document.getElementById('recording-status');
      if (label) {
        label.hidden = false;
        label.textContent = 'Não foi possível salvar a gravação. Não feche esta página e tente sair novamente.';
        label.title = error?.message || '';
      }
      // Não há download local como fallback. A página deve permanecer aberta
      // para permitir nova tentativa de persistência na Ata.
      throw error;
    }
  }

  setUi(false);
  window.dispatchEvent(new CustomEvent('condomit:assembly-recording-state', { detail: { active: false } }));
  return true;
}

