'use strict';

const { timingSafeEqual } = require('node:crypto');

const BUCKET = 'condomit-assembly-recordings';
const TABLE = 'assembly_egress_diagnostics';
const STATUS = { 0: 'EGRESS_STARTING', 1: 'EGRESS_ACTIVE', 2: 'EGRESS_ENDING', 3: 'EGRESS_COMPLETE', 4: 'EGRESS_FAILED', 5: 'EGRESS_ABORTED', 6: 'EGRESS_LIMIT_REACHED' };
const completed = status => normalizeStatus(status) === 'EGRESS_COMPLETE';
const failed = status => ['EGRESS_FAILED', 'EGRESS_ABORTED', 'EGRESS_LIMIT_REACHED'].includes(normalizeStatus(status));
const normalizeStatus = status => STATUS[Number(status)] || String(status || 'UNKNOWN').toUpperCase();
const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const supabaseUrl = () => String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const makeAdmin = () => {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl(), secret(), { auth: { persistSession: false, autoRefreshToken: false } });
};

function equalsSecret(provided) {
  const expected = Buffer.from(secret());
  const actual = Buffer.from(String(provided || ''));
  return expected.length >= 32 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Um URL assinado pelo provedor nunca é enviado ao navegador e nunca deve aparecer em logs.
function trustedBackupUrl(input) {
  try {
    const url = new URL(String(input || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const h = url.hostname.toLowerCase();
    if (!['.amazonaws.com', '.oraclecloud.com', '.livekit.io', '.storage.googleapis.com'].some(s => h.endsWith(s)) && h !== 'storage.googleapis.com') return null;
    return url.toString();
  } catch (_) { return null; }
}

function backupDetails(info) {
  if (info?.backupStorageUsed !== true) return { used: false, location: null, manifest: null };
  const result = [...(Array.isArray(info?.fileResults) ? info.fileResults : []), info?.file]
    .find(file => file?.location && /\.mp4(?:$|\?)/i.test(String(file.filename || file.location)));
  return { used: true, location: trustedBackupUrl(result?.location), manifest: trustedBackupUrl(info?.manifestLocation) };
}

function safeError(input) {
  return String(input || '').replace(/(Bearer|Token)\s+[\w.-]+/gi, '$1 [redacted]')
    .replace(/https?:\/\/\S+/g, '[URL]')
    .replace(/(access.?key|secret|password|signature)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 450);
}

async function saveDiagnostic(admin, recordingId, info, { webhook = false } = {}) {
  if (!info || !recordingId) return;
  const backup = backupDetails(info);
  const now = new Date().toISOString();
  const patch = {
    recording_id: recordingId, remote_status: normalizeStatus(info.status),
    error_code: Number(info.errorCode) || null, error_message: safeError(info.error) || null,
    details: safeError(info.details) || null,
    backup_storage_used: backup.used, last_checked_at: now,
    ...(webhook ? { last_webhook_at: now } : {})
  };
  // Não apaga URLs ou estados de recuperação por causa de webhooks fora de ordem.
  const { data: prev, error: fetchError } = await admin.from(TABLE).select('backup_location,backup_manifest,backup_storage_used,recovery_status,remote_status').eq('recording_id', recordingId).maybeSingle();
  if (fetchError) { console.warn('[EGRESS DIAGNOSTIC] Migração 070 ausente ou consulta indisponível', { code: fetchError.code }); return; }
  if (prev?.remote_status === 'EGRESS_COMPLETE' && ['EGRESS_STARTING', 'EGRESS_ACTIVE', 'EGRESS_ENDING'].includes(patch.remote_status)) return;
  if (backup.location && !prev?.backup_location) patch.backup_location = backup.location;
  if (backup.manifest && !prev?.backup_manifest) patch.backup_manifest = backup.manifest;
  patch.backup_storage_used = backup.used || prev?.backup_storage_used === true;
  if (backup.used && (!prev?.recovery_status || prev.recovery_status === 'sem_backup')) patch.recovery_status = 'pendente';
  const { error } = await admin.from(TABLE).upsert(patch, { onConflict: 'recording_id' });
  if (error) console.warn('[EGRESS DIAGNOSTIC] Falha ao salvar metadados', { code: error.code });
}

async function triggerRecovery(recordingId, fetcher = fetch) {
  const origin = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').replace(/\/$/, '');
  if (!origin.startsWith('https://') || !secret()) return false;
  try {
    const response = await fetcher(`${origin}/.netlify/functions/assembly-recording-recover-background`, {
      method: 'POST', headers: { authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recording_id: recordingId }), signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) console.warn('[EGRESS BACKUP] Função não agendada', { status: response.status, recording_id: recordingId });
    return response.ok;
  } catch (error) {
    console.warn('[EGRESS BACKUP] Invocação indisponível', { recording_id: recordingId, error: safeError(error.message) });
    return false;
  }
}

function urlForFile(adminUrl, bucket, path) {
  const direct = adminUrl.replace(/^https:\/\/([a-z0-9-]+)\.supabase\.co(?=\/|$)/i, 'https://$1.storage.supabase.co');
  return `${direct}/storage/v1/upload/resumable`;
}

async function backupVideoUrl(row, fetcher = fetch) {
  if (trustedBackupUrl(row.backup_location)) return row.backup_location;
  const manifest = trustedBackupUrl(row.backup_manifest);
  if (!manifest) throw new Error('Backup não informado no webhook ou no Egress.');
  const response = await fetcher(manifest, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Manifesto do backup indisponível (HTTP ${response.status}).`);
  const result = await response.json();
  const video = (Array.isArray(result.files) ? result.files : []).find(f => /\.mp4$/i.test(String(f.filename || '')) && trustedBackupUrl(f.location));
  if (!video) throw new Error('Manifesto não contém arquivo MP4 recuperável.');
  return trustedBackupUrl(video.location);
}

// TUS transfere blocos, em vez de manter um vídeo inteiro em memória na Netlify.
async function restoreBackup(admin, recording, diag, fetcher = fetch, onProgress = null) {
  const filename = String(recording.recording_url || '').split('/').pop();
  if (!/^[\w-]+\.mp4$/i.test(filename)) throw new Error('Nome do vídeo inválido.');
  const path = `${recording.assembly_id}/${filename}`;
  const { data: objects, error: listError } = await admin.storage.from(BUCKET).list(String(recording.assembly_id), { search: filename, limit: 100 });
  if (listError) throw listError;
  if ((objects || []).some(x => x.name === filename && Number(x.metadata?.size || x.size || 0) > 0)) return { restored: true, bytes: 0, existed: true };
  const url = await backupVideoUrl(diag, fetcher);
  const source = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(14 * 60_000) });
  if (!source.ok || !source.body) throw new Error(`Não foi possível ler backup LiveKit (HTTP ${source.status}).`);
  const size = Number(source.headers.get('content-length'));
  if (!Number.isSafeInteger(size) || size < 1024 || size > 5 * 1024 ** 3) throw new Error('Backup sem tamanho confiável ou muito grande.');
  const headers = {
    authorization: `Bearer ${secret()}`, apikey: secret(), 'Tus-Resumable': '1.0.0',
    'Upload-Length': String(size), 'Upload-Metadata': [
      `bucketName ${Buffer.from(BUCKET).toString('base64')}`,
      `objectName ${Buffer.from(path).toString('base64')}`,
      `contentType ${Buffer.from('video/mp4').toString('base64')}`
    ].join(','), 'x-upsert': 'false'
  };
  const init = await fetcher(urlForFile(supabaseUrl()), { method: 'POST', headers, signal: AbortSignal.timeout(20000) });
  if (!init.ok) throw new Error(`Falha no início do upload TUS (HTTP ${init.status}).`);
  const loc = init.headers.get('location');
  if (!loc) throw new Error('O Storage não retornou o destino TUS.');
  const upload = new URL(loc, urlForFile(supabaseUrl()));
  const allowed = new URL(urlForFile(supabaseUrl()));
  if (upload.protocol !== 'https:' || upload.hostname !== allowed.hostname || !upload.pathname.startsWith('/storage/v1/upload/resumable/')) throw new Error('Destino TUS inesperado.');
  if (typeof onProgress === 'function') await onProgress(0, size);
  const reader = source.body.getReader();
  const chunkSize = 5 * 1024 * 1024;
  let buffered = Buffer.alloc(0), offset = 0, complete = false;
  async function sendChunk(bytes) {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetcher(upload, { method: 'PATCH', headers: {
        authorization: `Bearer ${secret()}`, apikey: secret(), 'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream'
      }, body: bytes, signal: AbortSignal.timeout(60000) });
      if (response.ok) break;
      if (attempt === 2) throw new Error(`Bloco TUS recusado (HTTP ${response.status}).`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
    const next = Number(response.headers.get('Upload-Offset'));
    offset = Number.isSafeInteger(next) && next >= offset ? next : offset + bytes.length;
    if (typeof onProgress === 'function') await onProgress(offset, size);
  }
  while (!complete) {
    const { value, done } = await reader.read();
    complete = done;
    if (value?.length) buffered = Buffer.concat([buffered, Buffer.from(value)]);
    while (buffered.length >= chunkSize || (done && buffered.length)) {
      const chunk = buffered.subarray(0, Math.min(chunkSize, buffered.length));
      buffered = buffered.subarray(chunk.length);
      await sendChunk(chunk);
    }
  }
  if (offset !== size) throw new Error('Backup incompleto: tamanho transferido diferente do esperado.');
  const { data: verified, error } = await admin.storage.from(BUCKET).list(String(recording.assembly_id), { search: filename, limit: 100 });
  if (error) throw error;
  const stored = (verified || []).find(x => x.name === filename);
  if (!stored || Number(stored.metadata?.size || stored.size || 0) <= 0) throw new Error('Upload terminou, mas o MP4 ainda não está confirmado no Storage.');
  return { restored: true, bytes: offset };
}

module.exports = { BUCKET, TABLE, normalizeStatus, completed, failed, backupDetails, trustedBackupUrl, safeError, saveDiagnostic, triggerRecovery, equalsSecret, makeAdmin, restoreBackup };
