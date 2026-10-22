'use strict';
const { adminClient, enqueueTranscription } = require('./lib/assembly-gemini-transcription');

exports.handler = async () => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('[ASSEMBLY GEMINI DISPATCH] GEMINI_API_KEY não configurada');
      return { statusCode: 503, body: JSON.stringify({ queued: 0, configured: false }) };
    }
    const admin = adminClient();
    const { data, error } = await admin.from('assembly_recordings')
      .select('id,transcription_status,transcription_started_at,transcription_attempts')
      .eq('status', 'concluido').in('transcription_status', ['pendente', 'falhou', 'processando', 'enfileirado'])
      .order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    let queued = 0;
    for (const row of data || []) {
      if (queued >= 4) break;
      const age = Date.now() - new Date(row.transcription_started_at || 0).getTime();
      if (row.transcription_status === 'processando' && age < 18 * 60000) continue;
      if (row.transcription_status === 'enfileirado' && age < 5 * 60000) continue;
      if (row.transcription_status === 'falhou' && (row.transcription_attempts >= 4 || age < 2 * 60000)) continue;
      try { if (await enqueueTranscription(row.id)) queued++; }
      catch (error) { console.warn('[ASSEMBLY GEMINI DISPATCH]', { recording: row.id, error: String(error.message).slice(0, 180) }); }
    }
    return { statusCode: 200, body: JSON.stringify({ queued }) };
  } catch (error) {
    console.error('[ASSEMBLY GEMINI DISPATCH]', String(error?.message || error).slice(0, 180));
    return { statusCode: 500, body: JSON.stringify({ queued: 0 }) };
  }
};
