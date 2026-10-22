'use strict';
const { verifyJob, runTranscription } = require('./lib/assembly-gemini-transcription');

exports.handler = async event => {
  if (event.httpMethod !== 'POST' || !verifyJob(event.body || '', event.headers['x-condomit-job-signature'])) return { statusCode: 403, body: '' };
  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: '' }; }
  if (!Number.isSafeInteger(payload.recording_id) || payload.recording_id <= 0 || !Number.isFinite(payload.timestamp) || Math.abs(Date.now() - payload.timestamp) > 300000) {
    return { statusCode: 400, body: '' };
  }
  try {
    await runTranscription(payload.recording_id);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('[ASSEMBLY GEMINI TRANSCRIPTION]', { recording_id: payload.recording_id, message: String(error?.message || error).replace(/AIza[\w-]+/g, '[chave]').slice(0, 300) });
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
