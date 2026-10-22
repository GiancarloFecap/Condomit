'use strict';
const { WebhookReceiver } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
const { checkFile } = require('./lib/assembly-recording-state');

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
    if (!row || verified.event !== 'egress_ended') return { statusCode: 200, body: 'ok' };
    const failed = [4, 5, 6].includes(Number(info.status)) || Boolean(info.error);
    if (failed) {
      const detail = String(info.error || '').toLowerCase();
      const category = /s3|storage|bucket|upload|credential|signature|access.denied/.test(detail) ? 'storage' : /codec|encode|decode|media|track/.test(detail) ? 'media' : /room|participant|disconnect|empty/.test(detail) ? 'room' : 'unknown';
      console.error('[ASSEMBLY EGRESS FAILED]', { egressId: info.egressId, code: info.errorCode || Number(info.status), category });
    }
    const finished = Number(info.status) === 3;
    const path = `storage://condomit-assembly-recordings/${row.assembly_id}/`;
    const fileName = String(row.recording_url || '').startsWith(path) ? String(row.recording_url).slice(path.length) : '';
    const file = finished && !failed ? await checkFile(admin, row.assembly_id, fileName) : null;
    const nextStatus = failed ? 'falhou' : finished && file?.stable ? 'concluido' : row.status;
    if (nextStatus !== row.status) {
      const update = { status: nextStatus, ended_at: new Date().toISOString(), duration_seconds: Math.max(0, Math.round((Date.now() - new Date(row.started_at || Date.now()).getTime()) / 1000)) };
      if (nextStatus === 'concluido') update.file_size_bytes = file.size;
      const { error } = await admin.from('assembly_recordings').update(update).eq('id', row.id).in('status', ['gravando', 'pendente', 'falhou']);
      if (error) throw error;
    }
    return { statusCode: 200, body: 'ok' };
  } catch (error) {
    console.error('[ASSEMBLY EGRESS WEBHOOK]', error);
    return { statusCode: 500, body: 'Webhook não processado.' };
  }
};
