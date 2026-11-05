'use strict';

const { adminClient, shouldProcess, dispatch, MODEL, MAX_ATTEMPTS } = require('./lib/assembly-deepgram');

async function candidates(admin) {
  const cols = 'id,assembly_id,recording_url,status,started_at,created_at,transcription_status,transcription_model,transcription_attempts,transcription_started_at';
  const [pending, retrying, formerFailures, legacy] = await Promise.all([
    admin.from('assembly_recordings').select(cols).eq('status', 'concluido').eq('transcription_status', 'pendente').order('created_at', { ascending: true }).limit(15),
    admin.from('assembly_recordings').select(cols).eq('status', 'concluido').in('transcription_status', ['falhou', 'enfileirado', 'processando']).eq('transcription_model', MODEL).lt('transcription_attempts', MAX_ATTEMPTS).order('transcription_started_at', { ascending: true, nullsFirst: true }).limit(30),
    admin.from('assembly_recordings').select(cols).eq('status', 'concluido').in('transcription_status', ['falhou', 'enfileirado', 'processando']).neq('transcription_model', MODEL).order('created_at', { ascending: true }).limit(10),
    process.env.DEEPGRAM_REPROCESS_LEGACY === 'true'
      ? admin.from('assembly_recordings').select(cols).eq('status', 'concluido').eq('transcription_status', 'concluido').neq('transcription_model', MODEL).order('created_at', { ascending: true }).limit(4)
      : Promise.resolve({ data: [], error: null })
  ]);
  for (const result of [pending, retrying, formerFailures, legacy]) if (result.error) throw result.error;
  const unique = new Map();
  for (const row of [...(pending.data || []), ...(retrying.data || []), ...(formerFailures.data || []), ...(legacy.data || [])]) if (shouldProcess(row)) unique.set(row.id, row);
  return [...unique.values()].slice(0, 3);
}

exports.handler = async () => {
  if (!process.env.DEEPGRAM_API_KEY) {
    console.error('[ASSEMBLY DEEPGRAM] DEEPGRAM_API_KEY não está configurada.');
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'DEEPGRAM_API_KEY ausente.' }) };
  }
  try {
    const admin = adminClient();
    const rows = await candidates(admin);
    const results = await Promise.all(rows.map(async row => {
      try {
        return await dispatch(admin, row) ? 'sent' : 'skipped';
      } catch (error) {
        console.error('[ASSEMBLY DEEPGRAM SUBMIT]', { recording: row.id, detail: String(error?.message || error).slice(0, 240) });
        return 'failed';
      }
    }));
    return { statusCode: 200, body: JSON.stringify({
      ok: true, examined: rows.length,
      sent: results.filter(result => result === 'sent').length,
      failed: results.filter(result => result === 'failed').length
    }) };
  } catch (error) {
    console.error('[ASSEMBLY DEEPGRAM DISPATCH]', String(error?.message || error));
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
