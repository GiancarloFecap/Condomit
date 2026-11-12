'use strict';
function positive(value) {
  const v = Number(value);
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}
function describeUpload(record, remoteStatus = 'desconhecido', storageVerified = false, recovery = null) {
  const status = String(record?.status || 'pendente').toLowerCase();
  const remote = String(remoteStatus || '').toUpperCase();
  const transferred = positive(recovery?.recovery_uploaded_bytes);
  const total = positive(recovery?.recovery_total_bytes);
  if (status === 'concluido' && storageVerified) return { stage:'concluido', label:'MP4 salvo e confirmado no servidor.', percent:100, uploaded_bytes:positive(record.file_size_bytes), total_bytes:positive(record.file_size_bytes) };
  if (recovery?.recovery_status === 'processando' && total && transferred !== null) {
    return {stage:'recuperando', label:'Recuperando backup e enviando MP4 para o servidor...', percent: Math.min(99, Math.floor(transferred / total * 100)), uploaded_bytes:transferred, total_bytes:total};
  }
  if (status === 'falhou') return {stage:'falhou', label:'O LiveKit falhou ao enviar o MP4. A gravação não foi salva.', percent:null};
  if (remote === 'EGRESS_ENDING') return {stage:'enviando', label:'Finalizando MP4 e enviando para o Storage...', percent:null};
  if (remote === 'EGRESS_COMPLETE' || status === 'concluido') return {stage:'verificando', label:'Egress concluído. Verificando arquivo no Storage...', percent:null};
  if (remote === 'EGRESS_ACTIVE' || status === 'gravando') return {stage:'gravando', label:'Gravação em andamento no LiveKit...', percent:null};
  return {stage:'preparando', label:'Preparando gravação no LiveKit...', percent:null};
}
module.exports = {describeUpload};
