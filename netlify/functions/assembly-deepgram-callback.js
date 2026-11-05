'use strict';

const { timingSafeEqual } = require('node:crypto');
const { adminClient, MODEL, secretHash, markFailure, parseSegments } = require('./lib/assembly-deepgram');

const reply = statusCode => ({ statusCode, headers: { 'Cache-Control': 'no-store' }, body: '' });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405);
  try {
    const bytes = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (bytes.length > 5 * 1024 * 1024) return reply(413);
    const payload = JSON.parse(bytes.toString('utf8'));
    const extra = payload?.metadata?.extra;
    const id = Number(extra?.recording_id);
    const token = String(extra?.callback_secret || '');
    if (!Number.isSafeInteger(id) || id <= 0 || !/^[a-f\d]{64}$/.test(token)) return reply(403);
    const admin = adminClient();
    const { data: job, error: jobError } = await admin.from('assembly_deepgram_jobs')
      .select('recording_id,callback_token_hash,request_id,completed_at').eq('recording_id', id).maybeSingle();
    if (jobError) throw jobError;
    if (!job || !/^[a-f\d]{64}$/.test(job.callback_token_hash || '')) return reply(403);
    if (!timingSafeEqual(Buffer.from(secretHash(token), 'hex'), Buffer.from(job.callback_token_hash, 'hex'))) return reply(403);
    if (job.completed_at) return reply(204);
    const requestId = String(payload?.metadata?.request_id || '');
    if (job.request_id && requestId && job.request_id !== requestId) return reply(403);
    if (payload?.error || payload?.err_code || payload?.type === 'error') {
      await markFailure(admin, id, 'Deepgram não conseguiu transcrever este áudio. Será feita outra tentativa automática.');
      return reply(204);
    }
    if (!payload?.results || !payload?.metadata) return reply(422);
    const segments = parseSegments(payload);
    if (segments.length > 20000) return reply(413);
    const duration = Number(payload.metadata.duration || 0);
    const { data: result, error: commitError } = await admin.rpc('condomit_finish_deepgram_063', {
      target_recording_id: id, callback_token_hash_value: secretHash(token),
      callback_request_id: requestId || null, transcript_segments: segments,
      duration_seconds_value: Number.isFinite(duration) && duration >= 0 ? duration : null
    });
    if (commitError) throw commitError;
    if (result === 'ignored') return reply(204);
    if (result === 'ok' || result === 'duplicate') {
      const { error: nameError } = await admin.rpc('condomit_auto_identify_deepgram_065', { target_recording_id: id });
      if (nameError) console.warn('[ASSEMBLY DEEPGRAM SPEAKERS] Identificação pendente:', String(nameError.message || nameError).slice(0, 180));
    }
    return reply(204);
  } catch (error) {
    console.error('[ASSEMBLY DEEPGRAM CALLBACK]', { type: error?.name || 'Error', message: String(error?.message || '').slice(0, 180) });
    return reply(500);
  }
};
