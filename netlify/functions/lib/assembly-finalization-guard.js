'use strict';


const BUCKET = 'condomit-assembly-recordings';

function classifyRecordingRows(rows, recordingExpected = false) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ready: !recordingExpected, reason: recordingExpected ? 'ausente' : 'sem_gravacao', count: 0 };
  }
  if (rows.some(row => row.status === 'falhou')) return { ready: false, reason: 'falhou', count: rows.length };
  if (rows.some(row => row.status !== 'concluido')) return { ready: false, reason: 'processando', count: rows.length };
  if (rows.some(row => !Number.isFinite(Number(row.file_size_bytes)) || Number(row.file_size_bytes) <= 0)) {
    return { ready: false, reason: 'arquivo_nao_confirmado', count: rows.length };
  }
  return { ready: true, reason: 'concluido', count: rows.length };
}

async function verifyAssemblyRecordings(admin, assembly, { requireRecording = false } = {}) {
  const { data, error } = await admin.from('assembly_recordings')
    .select('id,status,file_size_bytes,recording_url')
    .eq('assembly_id', assembly.id).limit(100);
  if (error) throw error;
  const rows = data || [];
  const state = classifyRecordingRows(rows, requireRecording || Boolean(assembly.is_recording) || Boolean(assembly.recording_end_requested_at));
  if (!state.ready || !rows.length) return state;
  for (const recording of rows) {
    const prefix = `storage://${BUCKET}/${assembly.id}/`;
    const url = String(recording.recording_url || '');
    const filename = url.startsWith(prefix) ? url.slice(prefix.length) : '';
    if (!filename || filename.includes('/') || filename.includes('..') || !/\.mp4$/i.test(filename)) {
      return { ready: false, reason: 'arquivo_nao_confirmado', count: rows.length };
    }
    const { checkFile } = require('./assembly-recording-state');
    const object = await checkFile(admin, assembly.id, filename);
    if (!object.stable || object.size <= 0 || object.size !== Number(recording.file_size_bytes)) {
      return { ready: false, reason: 'arquivo_nao_confirmado', count: rows.length };
    }
  }
  return state;
}

function finalizationStatusMessage(reason) {
  switch (reason) {
    case 'falhou': return 'A gravação falhou no LiveKit ou no S3. A assembleia não pode ser encerrada até que um MP4 válido seja recuperado e confirmado.';
    case 'ausente': return 'A gravação ainda não foi registrada. A assembleia permanece aberta para impedir a perda do vídeo.';
    case 'arquivo_nao_confirmado': return 'O MP4 ainda não foi confirmado no armazenamento. A assembleia permanece em processamento.';
    default: return 'A finalização já foi solicitada. Aguarde a confirmação do MP4; não é possível finalizar novamente.';
  }
}

module.exports = { classifyRecordingRows, verifyAssemblyRecordings, finalizationStatusMessage };
