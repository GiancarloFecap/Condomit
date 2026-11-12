'use strict';
const { makeAdmin, equalsSecret, restoreBackup, TABLE, safeError } = require('./lib/assembly-egress-recovery');

exports.handler = async event => {
  if (event.httpMethod !== 'POST' || !equalsSecret(String(event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, ''))) return { statusCode: 403 };
  let id;
  try { id = Number(JSON.parse(event.body || '{}').recording_id); } catch (_) { return { statusCode: 400 }; }
  if (!Number.isSafeInteger(id) || id <= 0) return { statusCode: 400 };
  const admin = makeAdmin();
  const { data: row, error: recordingError } = await admin.from('assembly_recordings')
    .select('id,assembly_id,status,recording_url,ended_at,started_at,file_size_bytes').eq('id', id).maybeSingle();
  if (recordingError || !row) return { statusCode: 404 };
  const { data: diag, error: diagError } = await admin.from(TABLE)
    .select('recording_id,backup_storage_used,backup_location,backup_manifest,recovery_status,recovery_attempts,last_recovery_at')
    .eq('recording_id', id).maybeSingle();
  if (diagError || !diag?.backup_storage_used || (!diag.backup_location && !diag.backup_manifest)) return { statusCode: 200 };
  if (row.status === 'concluido' || diag.recovery_status === 'concluido') return { statusCode: 200 };
  const attempts = Number(diag.recovery_attempts || 0);
  if (attempts >= 5) return { statusCode: 200 };
  if (diag.recovery_status === 'processando' && Date.now() - new Date(diag.last_recovery_at || 0).getTime() < 16 * 60_000) return { statusCode: 200 };
  const { data: lock, error: lockError } = await admin.from(TABLE).update({
    recovery_status: 'processando', recovery_attempts: attempts + 1, last_recovery_at: new Date().toISOString(),
    recovery_uploaded_bytes: 0, recovery_total_bytes: 0
  }).eq('recording_id', id).eq('recovery_attempts', attempts).neq('recovery_status', 'concluido').select('recording_id').maybeSingle();
  if (lockError || !lock) return { statusCode: 200 };
  try {
    const output = await restoreBackup(admin, row, diag, fetch, async (uploaded, total) => {
      const { error: progressError } = await admin.from(TABLE).update({
        recovery_uploaded_bytes: uploaded, recovery_total_bytes: total
      }).eq('recording_id', id);
      if (progressError) console.warn('[EGRESS BACKUP] Progresso não registrado', { recording_id: id, code: progressError.code });
    });
    const { data: existingFile } = await admin.storage.from('condomit-assembly-recordings').list(String(row.assembly_id), { search: row.recording_url.split('/').pop(), limit: 100 });
    const metadataSize = Number((existingFile || []).find(item => item.name === row.recording_url.split('/').pop())?.metadata?.size || output.bytes || 0);
    const { error: updateError } = await admin.from('assembly_recordings').update({ status: 'concluido', file_size_bytes: metadataSize, ended_at: row.ended_at || new Date().toISOString() })
      .eq('id', id).in('status', ['pendente', 'gravando', 'falhou']);
    if (updateError) throw updateError;
    await admin.from(TABLE).update({ recovery_status: 'concluido', recovery_error: null }).eq('recording_id', id);
    console.info('[EGRESS BACKUP] MP4 recuperado', { recording_id: id, bytes: output.bytes, existed: output.existed || false });
  } catch (error) {
    const message = safeError(error?.message || error);
    await admin.from(TABLE).update({ recovery_status: 'falhou', recovery_error: message }).eq('recording_id', id);
    console.error('[EGRESS BACKUP] Não foi possível recuperar arquivo', { recording_id: id, message });
  }
  return { statusCode: 200 };
};
