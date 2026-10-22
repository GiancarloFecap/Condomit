'use strict';
const { EgressClient } = require('livekit-server-sdk');

const BUCKET = 'condomit-assembly-recordings';
const FINISHED = new Set([3, 'EGRESS_COMPLETE']);
const FAILED = new Set([4, 5, 6, 'EGRESS_FAILED', 'EGRESS_ABORTED', 'EGRESS_LIMIT_REACHED']);
const ACTIVE = new Set([0, 1, 2, 'EGRESS_STARTING', 'EGRESS_ACTIVE', 'EGRESS_ENDING']);

function client() {
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
  return new EgressClient(process.env.LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}

function storagePath(url, assemblyId) {
  const prefix = `storage://${BUCKET}/${assemblyId}/`;
  if (!String(url || '').startsWith(prefix)) return '';
  const path = String(url).slice(prefix.length);
  return path && !path.includes('/') && !path.includes('..') ? path : '';
}

async function checkFile(admin, assemblyId, filename) {
  if (!filename) return { exists: false, stable: false, size: 0 };
  const { data, error } = await admin.storage.from(BUCKET).list(String(assemblyId), { limit: 1000, search: filename });
  if (error) throw error;
  const object = (data || []).find(item => item.name === filename);
  const size = Number(object?.metadata?.size || object?.metadata?.contentLength || object?.size || 0);
  return { exists: Boolean(object), stable: Boolean(object && size > 0), size };
}

async function stopAssemblyEgress(admin, assemblyId, api = client()) {
  if (!api) return { requested: 0, errors: ['LiveKit não configurado'] };
  const { data, error } = await admin.from('assembly_recordings')
    .select('id,egress_id,status')
    .eq('assembly_id', assemblyId).in('status', ['pendente', 'gravando'])
    .not('egress_id', 'is', null).limit(20);
  if (error) throw error;
  let requested = 0;
  const errors = [];
  for (const record of data || []) {
    try {
      const list = await api.listEgress({ egressId: record.egress_id });
      const live = list.find(info => info.egressId === record.egress_id);
      if (live && [0, 1, 'EGRESS_STARTING', 'EGRESS_ACTIVE'].includes(live.status)) {
        await api.stopEgress(record.egress_id);
        requested++;
      }
    } catch (error) {
      const message = String(error?.message || error);
      console.warn('[ASSEMBLY EGRESS STOP]', { recording: record.id, message });
      errors.push(message);
    }
  }
  return { requested, errors };
}

function safeStatus(record, remoteState, file, diagnostic) {
  return {
    recording_id: record.id,
    status: record.status,
    started_at: record.started_at,
    ended_at: record.ended_at || null,
    remote_status: remoteState,
    storage_verified: Boolean(file?.stable),
    file_size_bytes: Number(file?.size || record.file_size_bytes || 0),
    diagnostic
  };
}

async function reconcileRecording(admin, assemblyId, record, api = client()) {
  const remoteState = { value: 'desconhecido', info: null };
  let file = null;
  const filename = storagePath(record.recording_url, assemblyId);
  if (record.egress_id && api) {
    try {
      const instances = await api.listEgress({ egressId: record.egress_id });
      const info = instances.find(item => item.egressId === record.egress_id) || null;
      if (info) {
        remoteState.info = info;
        remoteState.value = FINISHED.has(info.status) ? 'concluido' : FAILED.has(info.status) ? 'falhou' : ACTIVE.has(info.status) ? 'gravando' : 'desconhecido';
      }
    } catch (error) {
      console.warn('[ASSEMBLY EGRESS CHECK]', { recording: record.id, message: String(error?.message || error) });
      remoteState.value = 'consulta_indisponivel';
    }
  }
  const remotelyFinished = remoteState.value === 'concluido';
  const remotelyFailed = remoteState.value === 'falhou';
  const shouldCheckFile = remotelyFinished || ['concluido', 'falhou'].includes(record.status) || (Boolean(record.egress_id) && ['desconhecido', 'consulta_indisponivel'].includes(remoteState.value));
  if (shouldCheckFile && filename) {
    try {
      file = await checkFile(admin, assemblyId, filename);
    } catch (error) {
      console.warn('[ASSEMBLY STORAGE CHECK]', { recording: record.id, message: String(error?.message || error) });
    }
  }
  let nextStatus = record.status;
  let diagnostic = '';
  if (remotelyFailed && !file?.stable) {
    nextStatus = 'falhou';
    const reason = String(remoteState.info?.error || '').toLowerCase();
    if (/s3|storage|bucket|upload|access.denied|signature|credential/.test(reason)) diagnostic = 'O Egress falhou ao enviar o vídeo ao Storage. Verifique credenciais, endpoint, permissões e bucket S3.';
    else if (/room|participant|empty|disconnect/.test(reason)) diagnostic = 'O Egress foi interrompido por encerramento da sala ou desconexão. Confira a duração da gravação e os logs LiveKit.';
    else if (/codec|encode|decode|media|track/.test(reason)) diagnostic = 'O Egress falhou ao codificar a gravação. Verifique codecs, recursos e logs do LiveKit.';
    else diagnostic = 'O LiveKit Egress encerrou com erro e não entregou um vídeo válido. Consulte o status do Egress e o bucket S3.';
  } else if (file?.stable && (remotelyFinished || ['concluido', 'falhou'].includes(record.status) || ['desconhecido', 'consulta_indisponivel'].includes(remoteState.value))) {
    nextStatus = 'concluido';
  } else if (remotelyFinished && !file?.stable) {
    const endedAt = Number(remoteState.info?.endedAt || 0);
    const endMs = endedAt > 1e15 ? endedAt / 1e6 : endedAt > 1e12 ? endedAt : endedAt > 1e9 ? endedAt * 1000 : 0;
    if (endMs && Date.now() - endMs > 10 * 60 * 1000) nextStatus = 'falhou';
    diagnostic = 'O Egress terminou, mas o arquivo ainda não foi confirmado no Storage.';
  } else if (record.status === 'concluido' && !file?.stable) {
    diagnostic = 'Arquivo da gravação não localizado ou não estabilizado no Storage.';
  } else if (record.status === 'falhou') {
    diagnostic = 'A gravação falhou. Confira LiveKit Egress e Storage antes de tentar novamente.';
  } else if (!record.egress_id && Date.now() - new Date(record.started_at || record.created_at || 0).getTime() > 120000) {
    nextStatus = 'falhou';
    diagnostic = 'O serviço não retornou um identificador de gravação após dois minutos.';
  } else if (record.egress_id && remoteState.value === 'desconhecido' && Date.now() - new Date(record.started_at || 0).getTime() > 1200000) {
    diagnostic = 'Não foi possível confirmar a gravação remota. Confira Egress e webhook.';
  }
  if (nextStatus !== record.status || (nextStatus === 'concluido' && Number(record.file_size_bytes || 0) !== Number(file?.size || 0))) {
    const patch = { status: nextStatus };
    if (nextStatus === 'concluido') {
      patch.file_size_bytes = file.size;
      patch.ended_at = record.ended_at || new Date().toISOString();
      patch.duration_seconds = Math.max(0, Math.round((Date.now() - new Date(record.started_at || Date.now()).getTime()) / 1000));
    } else if (nextStatus === 'falhou') patch.ended_at = new Date().toISOString();
    const { data, error } = await admin.from('assembly_recordings').update(patch).eq('id', record.id).in('status', ['pendente', 'gravando', 'falhou', 'concluido']).select('id,status,egress_id,recording_url,started_at,ended_at,file_size_bytes').maybeSingle();
    if (error) throw error;
    if (data) record = data;
  }
  return safeStatus(record, remoteState.value, file, diagnostic);
}

async function reconcileAssembly(admin, assemblyId, { limit = 10 } = {}) {
  const { data, error } = await admin.from('assembly_recordings')
    .select('id,status,egress_id,recording_url,started_at,created_at,ended_at,file_size_bytes')
    .eq('assembly_id', assemblyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const api = client();
  const records = [];
  for (let index = 0; index < (data || []).length; index += 4) {
    const group = data.slice(index, index + 4);
    const inspected = await Promise.all(group.map(async row => {
      try {
        return await reconcileRecording(admin, assemblyId, row, api);
      } catch (error) {
        console.warn('[ASSEMBLY RECORDING RECONCILE]', { recording: row.id, message: String(error?.message || error) });
        return safeStatus(row, 'consulta_indisponivel', null, 'Não foi possível verificar esta gravação.');
      }
    }));
    records.push(...inspected);
  }
  return records;
}

module.exports = { reconcileAssembly, reconcileRecording, checkFile, stopAssemblyEgress, client };
