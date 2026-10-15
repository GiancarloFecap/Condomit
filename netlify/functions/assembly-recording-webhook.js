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
    const successful = results.some(file => Number(file.size || 0) > 0) && !info.error;
    const endedAt = new Date().toISOString();
    const update = {status:successful?'concluido':'falhou',ended_at:endedAt,duration_seconds:Math.max(0,Math.round((Date.now()-new Date(row.started_at || endedAt).getTime())/1000))};
    const first = results[0];
    if (first?.size) update.file_size_bytes = Number(first.size);
    const {error} = await admin.from('assembly_recordings').update(update).eq('id',row.id);
    if (error) throw error;
    return {statusCode:200,body:'ok'};
  } catch(error) {
    console.error('[ASSEMBLY EGRESS WEBHOOK]',error);
    return {statusCode:401,body:'Webhook inválido ou não processado.'};
  }
};
