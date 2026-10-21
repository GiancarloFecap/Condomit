'use strict';
const { createClient } = require('@supabase/supabase-js');
const { reconcileRecording, client } = require('./lib/assembly-recording-state');

exports.handler = async () => {
  try {
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await admin.from('assembly_recordings')
      .select('id,assembly_id,status,egress_id,recording_url,started_at,created_at,ended_at,file_size_bytes')
      .in('status', ['pendente', 'gravando', 'falhou'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const api = client();
    let updated = 0;
    for (const record of data || []) {
      try {
        const next = await reconcileRecording(admin, record.assembly_id, record, api);
        if (next.status !== record.status) updated++;
      } catch (error) {
        console.warn('[ASSEMBLY RECORDING SYNC]', { recording: record.id, message: String(error?.message || error) });
      }
    }
    console.info('[ASSEMBLY RECORDING SYNC]', { examined: data?.length || 0, updated });
    return { statusCode: 200, body: JSON.stringify({ ok: true, examined: data?.length || 0, updated }) };
  } catch (error) {
    console.error('[ASSEMBLY RECORDING SYNC]', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
