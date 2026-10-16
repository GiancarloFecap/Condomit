'use strict';
const { WebhookReceiver } = require('livekit-server-sdk');
const { createClient } = require('@supabase/supabase-js');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode:405, body:'' };
  try {
    const verified = await new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
      .receive(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body, event.headers.authorization || event.headers.Authorization);
    if (!['egress_ended','egress_updated'].includes(verified.event) || !verified.egressInfo?.egressId) return {statusCode:200,body:'ok'};
    const info = verified.egressInfo;
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data: row} = await admin.from('assembly_recordings').select('id,recording_url,status,started_at').eq('egress_id',info.egressId).maybeSingle();
    if (!row || row.status === 'concluido') return {statusCode:200,body:'ok'};
    if (verified.event !== 'egress_ended') return {statusCode:200,body:'ok'};
    const results = info.fileResults || [];
    const hasEgressFile = results.some(file => Number(file.size || 0) > 8192);
    const expected = String(row.recording_url || '').match(/^storage:\/\/condomit-assembly-recordings\/(\d+)\/(.+)$/);
    let storedSize = 0;
    if (expected) {
      const {data:files,error:storageError} = await admin.storage.from('condomit-assembly-recordings').list(expected[1],{limit:100});
      if (storageError) console.error('[ASSEMBLY EGRESS WEBHOOK] Não foi possível consultar o bucket:', storageError);
      storedSize = Number((files || []).find(file=>file.name===expected[2])?.metadata?.size || 0);
    }
    const successful = !info.error && (hasEgressFile || storedSize > 8192);
    const endedAt = new Date().toISOString();
    const update = {status:successful?'concluido':'falhou',ended_at:endedAt,duration_seconds:Math.max(0,Math.round((Date.now()-new Date(row.started_at || endedAt).getTime())/1000))};
    const first = results[0];
    if (first?.size || storedSize) update.file_size_bytes = Math.max(Number(first?.size || 0), storedSize);
    const {error} = await admin.from('assembly_recordings').update(update).eq('id',row.id);
    if (error) throw error;
    return {statusCode:200,body:'ok'};
  } catch(error) {
    console.error('[ASSEMBLY EGRESS WEBHOOK]',error);
    return {statusCode:401,body:'Webhook inválido ou não processado.'};
  }
};
