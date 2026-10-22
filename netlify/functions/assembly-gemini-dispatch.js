'use strict';
const { adminClient, enqueueTranscription } = require('./lib/assembly-gemini-transcription');

exports.handler = async () => {
  if (!process.env.GEMINI_API_KEY) return { statusCode: 200, body: JSON.stringify({ queued: 0, configured: false }) };
  try {
    const admin = adminClient();
    const { data, error } = await admin.from('assembly_recordings')
      .select('id,transcription_status,transcription_started_at,transcription_attempts')
      .eq('status', 'concluido').in('transcription_status', ['pendente', 'falhou', 'processando'])
      .order('created_at', { ascending: true }).limit(8);
    if (error) throw error;
    let queued = 0;
    for (const row of data || []) {
      const recent = Date.now() - new Date(row.transcription_started_at || 0).getTime();
      if (row.transcription_status === 'processando' && recent < 20 * 60000) continue;
      if (row.transcription_status === 'falhou' && (row.transcription_attempts >= 3 || recent < 5 * 60000)) continue;
      try { if (await enqueueTranscription(row.id)) queued++; }
      catch (error) { console.warn('[ASSEMBLY GEMINI DISPATCH]', { recording: row.id, error: String(error.message).slice(0, 120) }); }
    }
    return { statusCode: 200, body: JSON.stringify({ queued }) };
  } catch (error) {
    console.error('[ASSEMBLY GEMINI DISPATCH]', String(error?.message || error).slice(0, 160));
    return { statusCode: 500, body: JSON.stringify({ queued: 0 }) };
  }
};
