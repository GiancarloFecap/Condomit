'use strict';
const { WebhookReceiver } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const { reconcileRecording, checkFile } = require('./lib/assembly-recording-state');
const { normalizeStatus, completed, failed, backupDetails, saveDiagnostic, triggerRecovery } = require('./lib/assembly-egress-recovery');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  try {
    const verified = await new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
      .receive(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body, event.headers.authorization || event.headers.Authorization);
    if (!['egress_ended', 'egress_updated'].includes(verified.event) || !verified.egressInfo?.egressId) return { statusCode: 200, body: 'ok' };
    const info = verified.egressInfo;
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: row, error: lookupError } = await admin.from('assembly_recordings').select('id,assembly_id,recording_url,status,started_at').eq('egress_id', info.egressId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!row) return { statusCode: 200, body: 'ok' };
    await saveDiagnostic(admin, row.id, info, { webhook: true });
    if (verified.event !== 'egress_ended') return { statusCode: 200, body: 'ok' };
    const remoteStatus = normalizeStatus(info.status);
    const isFailure = failed(remoteStatus);
    const isComplete = completed(remoteStatus);
    if (isFailure) {
      console.error('[ASSEMBLY EGRESS FAILED]', {
        recording: row.id, status: remoteStatus, code: Number(info.errorCode) || null,
        backup: Boolean(info.backupStorageUsed)
      });
    }
    // Usa a resposta real do LiveKit para conferir nome, caminho e estado do MP4.
    const result = await reconcileRecording(admin, row.assembly_id,
      { ...row, egress_id: info.egressId }, { listEgress: async () => [info] });
    const backup = backupDetails(info);
    if ((isFailure || isComplete) && backup.used && !result.storage_verified) {
      await triggerRecovery(row.id);
    }
    // O worker externo detecta automaticamente registros com status 'concluido'.
    // O webhook apenas finaliza o vídeo: nunca aguarda, chama ou reprocessa um serviço de IA.
    return { statusCode: 200, body: 'ok' };
  } catch (error) {
    console.error('[ASSEMBLY EGRESS WEBHOOK]', error);
    return { statusCode: 500, body: 'Webhook não processado.' };
  }
};
