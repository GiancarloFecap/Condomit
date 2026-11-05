'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'condomit-assembly-recordings';
const MODEL = 'deepgram:nova-3';
const SOURCE = 'recording_video_deepgram';
const MAX_ATTEMPTS = 5;
const SELECT = 'id,assembly_id,recording_url,status,started_at,created_at,transcription_status,transcription_model,transcription_attempts,transcription_started_at';

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase de servidor não configurado.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function storagePath(row) {
  const assemblyId = Number(row?.assembly_id);
  if (!Number.isSafeInteger(assemblyId) || assemblyId <= 0) throw new Error('Identificador de assembleia inválido.');
  const prefix = `storage://${BUCKET}/${assemblyId}/`;
  const url = String(row?.recording_url || '');
  if (!url.startsWith(prefix)) throw new Error('Endereço de gravação não é privado ou está fora da assembleia.');
  const name = url.slice(prefix.length);
  if (!/^[a-zA-Z0-9_.-]+\.mp4$/i.test(name) || name.includes('..')) throw new Error('Nome de arquivo MP4 inválido.');
  return `${assemblyId}/${name}`;
}

function secretHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shouldProcess(row, now = Date.now()) {
  if (row?.status !== 'concluido' || !row?.recording_url) return false;
  const status = String(row.transcription_status || 'pendente');
  const model = String(row.transcription_model || '');
  const attempts = Number(row.transcription_attempts || 0);
  if (status === 'concluido') {
    return model !== MODEL && process.env.DEEPGRAM_REPROCESS_LEGACY === 'true';
  }
  if (status === 'pendente') return true;
  if (model !== MODEL) return true;
  const age = now - Date.parse(row.transcription_started_at || '1970-01-01T00:00:00Z');
  if (!Number.isFinite(age)) return false;
  if (status === 'enfileirado' || status === 'processando') return age > 3 * 3600000 && attempts < MAX_ATTEMPTS;
  if (status === 'falhou') return attempts < MAX_ATTEMPTS && age >= Math.min(3600000, 30000 * 2 ** Math.max(0, attempts - 1));
  return false;
}

function callbackUrl() {
  const raw = process.env.DEEPGRAM_CALLBACK_URL || `${String(process.env.URL || '').replace(/\/+$/, '')}/.netlify/functions/assembly-deepgram-callback`;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Configure DEEPGRAM_CALLBACK_URL como HTTPS público sem parâmetros.');
  return url.toString();
}

async function claim(admin, row) {
  const token = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const previousModel = String(row.transcription_model || '');
  const attempt = previousModel === MODEL ? Number(row.transcription_attempts || 0) + 1 : 1;
  let query = admin.from('assembly_recordings').update({
    transcription_status: 'processando', transcription_model: MODEL,
    transcription_started_at: now, transcription_finished_at: null,
    transcription_attempts: attempt, transcription_error: null,
    transcription_cursor_seconds: 0, transcription_total_seconds: null
  }).eq('id', row.id).eq('status', 'concluido')
    .eq('transcription_status', row.transcription_status || 'pendente')
    .eq('transcription_attempts', Number(row.transcription_attempts || 0));
  query = previousModel ? query.eq('transcription_model', previousModel) : query.is('transcription_model', null);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { error: jobError } = await admin.from('assembly_deepgram_jobs').upsert({
    recording_id: row.id, callback_token_hash: secretHash(token),
    request_id: null, submitted_at: now, completed_at: null
  }, { onConflict: 'recording_id' });
  if (jobError) {
    await markFailure(admin, row.id, 'Não foi possível preparar o processamento privado da gravação.');
    throw jobError;
  }
  return token;
}

async function markFailure(admin, recordingId, message) {
  const { error } = await admin.from('assembly_recordings').update({
    transcription_status: 'falhou', transcription_error: String(message).slice(0, 250),
    transcription_started_at: new Date().toISOString()
  }).eq('id', recordingId).eq('status', 'concluido').eq('transcription_model', MODEL)
    .in('transcription_status', ['enfileirado', 'processando']);
  if (error) throw error;
}

async function sendToDeepgram(admin, row, token, fetcher = fetch) {
  if (!process.env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY ausente nas variáveis de ambiente do servidor.');
  const path = storagePath(row);
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 7200);
  if (error || !data?.signedUrl) throw new Error('O vídeo privado não pôde ser disponibilizado para transcrição.');
  const origin = new URL(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).origin;
  const signedUrl = new URL(data.signedUrl, origin);
  if (signedUrl.protocol !== 'https:' || signedUrl.origin !== origin) throw new Error('URL assinada do vídeo inválida.');
  const endpoint = new URL('https://api.deepgram.com/v1/listen');
  endpoint.searchParams.set('model', 'nova-3');
  endpoint.searchParams.set('language', 'pt-BR');
  endpoint.searchParams.set('smart_format', 'true');
  endpoint.searchParams.set('utterances', 'true');
  endpoint.searchParams.set('diarize_model', 'latest');
  endpoint.searchParams.set('callback', callbackUrl());
  endpoint.searchParams.append('extra', `recording_id:${row.id}`);
  endpoint.searchParams.append('extra', `callback_secret:${token}`);
  const response = await fetcher(endpoint, {
    method: 'POST', headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: signedUrl.toString() }), signal: AbortSignal.timeout(18000)
  });
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new Error(`Deepgram recusou a gravação (HTTP ${response.status}${retryable ? ', tentativa posterior' : ''}).`);
  }
  const result = await response.json();
  if (!result?.request_id) throw new Error('Deepgram não confirmou o identificador da transcrição assíncrona.');
  const { error: jobError } = await admin.from('assembly_deepgram_jobs').update({ request_id: String(result.request_id) })
    .eq('recording_id', row.id).eq('callback_token_hash', secretHash(token));
  if (jobError) throw jobError;
  const { error: statusError } = await admin.from('assembly_recordings').update({ transcription_status: 'enfileirado' })
    .eq('id', row.id).eq('transcription_status', 'processando').eq('transcription_model', MODEL);
  if (statusError) throw statusError;
  return String(result.request_id);
}

async function dispatch(admin, row, fetcher = fetch) {
  if (!shouldProcess(row)) return false;
  const token = await claim(admin, row);
  if (!token) return false;
  try {
    await sendToDeepgram(admin, row, token, fetcher);
    return true;
  } catch (error) {
    const message = String(error?.message || 'Erro desconhecido');
    await markFailure(admin, row.id, message);
    throw error;
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitUtterance(utterance) {
  const text = cleanText(utterance?.transcript);
  if (!text) return [];
  const start = Math.max(0, Number(utterance.start) || 0);
  const end = Math.max(start, Number(utterance.end) || start);
  const speaker = Number.isSafeInteger(utterance.speaker) && utterance.speaker >= 0 ? utterance.speaker : null;
  const confidence = utterance.confidence != null && Number.isFinite(Number(utterance.confidence)) ? Math.min(1, Math.max(0, Number(utterance.confidence))) : null;
  const chunks = [];
  let remainder = text;
  while (remainder) {
    if (remainder.length <= 3900) { chunks.push(remainder); break; }
    let cut = remainder.lastIndexOf(' ', 3900);
    if (cut <= 0) cut = 3900;
    chunks.push(remainder.slice(0, cut).trim());
    remainder = remainder.slice(cut).trim();
  }
  let charOffset = 0;
  return chunks.map((chunk, index) => {
    const begin = start + (end - start) * (charOffset / text.length);
    charOffset += chunk.length + (index === chunks.length - 1 ? 0 : 1);
    const finish = index === chunks.length - 1 ? end : start + (end - start) * (charOffset / text.length);
    return { start: Number(begin.toFixed(2)), end: Number(Math.max(begin, finish).toFixed(2)), text: chunk, speaker, confidence };
  });
}

function joinUtteranceText(previous, next) {
  let left = cleanText(previous);
  let right = cleanText(next);
  if (!left) return right;
  if (!right) return left;
  if (/\b(?:e|ou|mas|que|para|de|do|da|dos|das|em|na|no|com|sem|enquanto|se|por|sobre|um|uma|os|as|o|a)[,.!?;:]*$/i.test(left)) {
    left = left.replace(/[,.!?;:]+$/, '');
    right = right.charAt(0).toLocaleLowerCase('pt-BR') + right.slice(1);
  }
  return `${left}${/^[,.;:!?]/.test(right) ? '' : ' '}${right}`;
}

function mergeConsecutiveUtterances(segments) {
  const merged = [];
  for (const segment of segments.slice().sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && segment.speaker != null && last.speaker === segment.speaker
      && segment.start >= last.end - 0.5 && segment.start - last.end <= 12
      && segment.end - last.start <= 180
      && last.text.length + segment.text.length <= 2400) {
      last.text = joinUtteranceText(last.text, segment.text);
      last.end = segment.end;
      if (segment.confidence != null) last.confidence = last.confidence == null ? segment.confidence : Math.min(last.confidence, segment.confidence);
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function splitWordsBySpeaker(words, defaultSpeaker = null) {
  if (!Array.isArray(words) || !words.length) return [];
  const hasWordLabels = words.some(word => Number.isSafeInteger(word?.speaker) && word.speaker >= 0);
  const groups = [];
  let current = null;
  for (const word of words) {
    const text = cleanText(word?.punctuated_word || word?.word);
    if (!text) continue;
    const start = Math.max(0, Number(word.start) || 0);
    const end = Math.max(start, Number(word.end) || start);
    const speaker = Number.isSafeInteger(word.speaker) && word.speaker >= 0
      ? word.speaker : hasWordLabels ? null : defaultSpeaker;
    const confidence = Number.isFinite(Number(word.confidence))
      ? Math.max(0, Math.min(1, Number(word.confidence))) : null;
    const nextLength = (current?.transcript.length || 0) + text.length + 1;
    if (!current || current.speaker !== speaker || nextLength > 3400 || end - current.start > 180) {
      current = { start, end, speaker, transcript: text, confidence };
      groups.push(current);
    } else {
      current.transcript += `${/^[.,;:!?]/.test(text) ? '' : ' '}${text}`;
      current.end = end;
      if (confidence !== null) current.confidence = current.confidence === null
        ? confidence : Math.min(current.confidence, confidence);
    }
  }
  return groups.flatMap(splitUtterance);
}

function parseSegments(payload) {
  const utterances = payload?.results?.utterances;
  if (Array.isArray(utterances) && utterances.length) {
    return mergeConsecutiveUtterances(utterances.flatMap(utterance => {
      const words = utterance?.words;
      if (Array.isArray(words) && words.length) {
        const fallback = Number.isSafeInteger(utterance.speaker) && utterance.speaker >= 0
          ? utterance.speaker : null;
        const segments = splitWordsBySpeaker(words, fallback);
        if (segments.length) return segments;
      }
      return splitUtterance(utterance);
    }));
  }
  const alt = payload?.results?.channels?.[0]?.alternatives?.[0];
  const words = Array.isArray(alt?.words) ? alt.words : [];
  if (words.length) return mergeConsecutiveUtterances(splitWordsBySpeaker(words));
  if (cleanText(alt?.transcript)) return splitUtterance({ transcript: alt.transcript, start: 0, end: Number(payload?.metadata?.duration || 0) });
  return [];
}

module.exports = { MODEL, SOURCE, MAX_ATTEMPTS, adminClient, storagePath, secretHash, shouldProcess, callbackUrl, claim, markFailure, sendToDeepgram, dispatch, parseSegments, mergeConsecutiveUtterances, splitWordsBySpeaker };
