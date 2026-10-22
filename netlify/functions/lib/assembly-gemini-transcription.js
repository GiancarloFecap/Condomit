'use strict';
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'condomit-assembly-recordings';
const API = 'https://generativelanguage.googleapis.com';
const CHUNK = 8 * 1024 * 1024;
const MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || 'gemini-2.5-flash';

function adminClient() {
  return createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

function signingSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
}

function signJob(body) {
  return crypto.createHmac('sha256', signingSecret()).update(body).digest('hex');
}

function verifyJob(body, signature) {
  if (!signingSecret()) return false;
  const expected = Buffer.from(signJob(body), 'hex');
  if (!/^[a-f\d]{64}$/i.test(String(signature || ''))) return false;
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

async function enqueueTranscription(recordingId, { manual = false } = {}) {
  if (!signingSecret()) throw new Error('Credenciais do Supabase não configuradas no servidor.');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada nas variáveis de ambiente da Netlify.');
  const base = process.env.URL || process.env.DEPLOY_URL;
  if (!base || !/^https:\/\//i.test(base)) throw new Error('A URL pública da Netlify não está configurada.');
  const admin = adminClient();
  const { data: row, error } = await admin.from('assembly_recordings').select('id,status,transcription_status,transcription_attempts,transcription_started_at').eq('id', recordingId).maybeSingle();
  if (error) throw error;
  if (!row || row.status !== 'concluido') return false;
  const expired = new Date(Date.now() - 18 * 60000).toISOString();
  const status = row.transcription_status;
  if (status === 'concluido') return false;
  if (status === 'processando' && (!row.transcription_started_at || row.transcription_started_at >= expired)) return false;
  if (status === 'enfileirado' && row.transcription_started_at && row.transcription_started_at >= new Date(Date.now() - 5 * 60000).toISOString()) return false;
  if (status === 'falhou' && Number(row.transcription_attempts || 0) >= (manual ? 6 : 4)) return false;
  const now = new Date().toISOString();
  let claim = admin.from('assembly_recordings').update({ transcription_status: 'enfileirado', transcription_started_at: now, transcription_error: null }).eq('id', recordingId).eq('status', 'concluido').eq('transcription_status', status);
  if (row.transcription_started_at && ['enfileirado', 'processando'].includes(status)) claim = claim.lt('transcription_started_at', status === 'enfileirado' ? new Date(Date.now() - 5 * 60000).toISOString() : expired);
  const { data: updated, error: claimError } = await claim.select('id').maybeSingle();
  if (claimError) throw claimError;
  if (!updated) return false;
  try {
    const body = JSON.stringify({ recording_id: recordingId, timestamp: Date.now() });
    const response = await fetch(new URL('/.netlify/functions/assembly-gemini-transcribe-background', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-condomit-job-signature': signJob(body) }, body,
      signal: AbortSignal.timeout(12000)
    });
    if (response.status !== 202 && !response.ok) throw new Error(`O processamento Gemini não pôde ser iniciado (HTTP ${response.status}).`);
    return true;
  } catch (error) {
    await admin.from('assembly_recordings').update({ transcription_status: 'falhou', transcription_error: String(error.message).slice(0, 400) }).eq('id', recordingId).eq('transcription_status', 'enfileirado');
    throw error;
  }
}

async function readJson(response, stage) {
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 500).replace(/AIza[\w-]+/g, '[chave]');
    throw new Error(`${stage}: erro HTTP ${response.status} ${detail}`);
  }
  return response.json();
}

function videoPath(row) {
  const prefix = `storage://${BUCKET}/${row.assembly_id}/`;
  if (!String(row.recording_url || '').startsWith(prefix)) throw new Error('Endereço da gravação inválido.');
  const filename = String(row.recording_url).slice(prefix.length);
  if (!/^[a-zA-Z0-9_.-]+\.mp4$/i.test(filename)) throw new Error('Arquivo MP4 inválido.');
  return `${row.assembly_id}/${filename}`;
}

async function uploadVideo(admin, row) {
  const path = videoPath(row);
  const size = Number(row.file_size_bytes || 0);
  if (!Number.isSafeInteger(size) || size <= 0 || size > 2 * 1024 * 1024 * 1024) {
    throw new Error('Tamanho do vídeo indisponível ou acima de 2 GB, limite deste fluxo da API Gemini.');
  }
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 7200);
  if (error || !data?.signedUrl) throw new Error('Falha ao autorizar a leitura da gravação original.');
  const begin = await fetch(`${API}/upload/v1beta/files?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': 'video/mp4'
    },
    body: JSON.stringify({ file: { display_name: `condomit-assembleia-${row.assembly_id}-gravacao-${row.id}` } }),
    signal: AbortSignal.timeout(30000)
  });
  if (!begin.ok) await readJson(begin, 'Iniciar upload Gemini');
  const uploadUrl = begin.headers.get('x-goog-upload-url');
  if (!uploadUrl || !uploadUrl.startsWith(`${API}/`)) throw new Error('A API Gemini não retornou um endereço de upload válido.');
  let file = null;
  for (let offset = 0; offset < size; offset += CHUNK) {
    const end = Math.min(size, offset + CHUNK) - 1;
    const segment = await fetch(data.signedUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
      signal: AbortSignal.timeout(120000)
    });
    if (segment.status !== 206 && !(offset === 0 && end === size - 1 && segment.status === 200)) {
      throw new Error('O armazenamento não forneceu a faixa solicitada do vídeo.');
    }
    const bytes = Buffer.from(await segment.arrayBuffer());
    if (bytes.length !== end - offset + 1) throw new Error('O armazenamento retornou uma faixa incompleta do vídeo.');
    const final = end + 1 === size;
    const part = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(bytes.length),
        'X-Goog-Upload-Offset': String(offset),
        'X-Goog-Upload-Command': final ? 'upload, finalize' : 'upload'
      },
      body: bytes,
      signal: AbortSignal.timeout(120000)
    });
    if (!part.ok) await readJson(part, 'Enviar vídeo ao Gemini');
    if (final) file = await part.json();
  }
  if (!file?.file?.name || !file?.file?.uri) throw new Error('Gemini não confirmou o arquivo enviado.');
  return file.file;
}

async function waitForFile(name) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(`${API}/v1beta/${name}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { signal: AbortSignal.timeout(12000) });
    const file = await readJson(response, 'Consultar vídeo Gemini');
    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') throw new Error('Gemini não conseguiu processar o vídeo enviado.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Gemini demorou demais para preparar o arquivo de vídeo.');
}

function normalizedEntries(payload, duration, offset) {
  const items = Array.isArray(payload?.segments) ? payload.segments : [];
  const entries = [];
  for (const item of items) {
    const text = String(item.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    const start = Number(item.start_seconds);
    const end = Number(item.end_seconds);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const localOffsets = offset > 0 && start < offset - 1 && end <= duration - offset + 1;
    const absStart = localOffsets ? start + offset : start;
    const absEnd = localOffsets ? end + offset : end;
    if (absStart < offset - 1 || absEnd > duration + 1) continue;
    const speaker = String(item.speaker || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 70);
    entries.push({ transcript: text, start_seconds: Math.max(0, absStart), end_seconds: Math.max(absStart + 0.1, absEnd), participant_name: speaker || 'Voz não identificada' });
  }
  return entries;
}

async function transcribeWindow(file, start, end) {
  const prompt = `Transcreva exclusivamente o que é audível nesta gravação de assembleia, palavra por palavra, sem resumir ou corrigir o sentido e sem completar trechos que não foram ouvidos. Preserve nomes e números somente se claramente audíveis. Mantenha hesitações e repetições relevantes. Se um trecho não estiver inteligível, use [inaudível] somente naquele ponto; nunca invente. Separe intervenções por mudança de falante ou pausa natural, mas não corte uma frase contínua. Retorne somente JSON com segments contendo text, start_seconds, end_seconds e speaker. Timestamps NUMÉRICOS em segundos ABSOLUTOS do vídeo original, entre ${start} e ${end}; mantenha o texto sincronizado com o áudio. Identifique falantes por Falante 1, Falante 2, etc., sem deduzir identidade pelo rosto ou voz. Em ausência de fala, retorne segments vazio.`;
  const response = await fetch(`${API}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { fileData: { mimeType: 'video/mp4', fileUri: file.uri }, videoMetadata: { startOffset: `${start}s`, endOffset: `${end}s`, fps: 0.2 } },
        { text: prompt }
      ] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 8192,
        responseSchema: { type: 'OBJECT', properties: { segments: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
          text: { type: 'STRING' }, start_seconds: { type: 'NUMBER' }, end_seconds: { type: 'NUMBER' }, speaker: { type: 'STRING' }
        }, required: ['text', 'start_seconds', 'end_seconds', 'speaker'] } } }, required: ['segments'] }
      }
    }),
    signal: AbortSignal.timeout(120000)
  });
  const body = await readJson(response, 'Transcrever vídeo Gemini');
  const output = (body.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('').trim();
  if (!output) throw new Error('Gemini não retornou conteúdo de transcrição.');
  let parsed;
  try { parsed = JSON.parse(output); }
  catch { throw new Error('Gemini retornou uma transcrição em formato inválido.'); }
  return normalizedEntries(parsed, end, start);
}

async function claimRecording(admin, row) {
  const now = new Date().toISOString();
  const expired = new Date(Date.now() - 18 * 60000).toISOString();
  const status = row.transcription_status;
  const retryable = status === 'enfileirado' || status === 'pendente' || (status === 'falhou' && Number(row.transcription_attempts || 0) < 6) || (status === 'processando' && row.transcription_started_at && row.transcription_started_at < expired);
  if (!retryable) return false;
  let request = admin.from('assembly_recordings').update({ transcription_status: 'processando', transcription_started_at: now,
    transcription_attempts: Number(row.transcription_attempts || 0), transcription_error: null })
    .eq('id', row.id).eq('status', 'concluido').eq('transcription_status', status);
  if (status === 'processando') request = request.lt('transcription_started_at', expired);
  const { data, error } = await request.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function runTranscription(recordingId) {
  const admin = adminClient();
  const { data: row, error } = await admin.from('assembly_recordings').select('*').eq('id', recordingId).maybeSingle();
  if (error) throw error;
  if (!row || row.status !== 'concluido' || !process.env.GEMINI_API_KEY) return false;
  if (!await claimRecording(admin, row)) return false;
  let file = row.transcription_file_uri && row.transcription_file_name ? { uri: row.transcription_file_uri, name: row.transcription_file_name } : null;
  const update = payload => admin.from('assembly_recordings').update(payload).eq('id', row.id).eq('status', 'concluido');
  try {
    if (file) {
      try {
        file = await waitForFile(file.name);
      } catch (error) {
        if (!/404|not found|não encontrad|expired/i.test(String(error?.message || ''))) throw error;
        file = null;
      }
    }
    if (!file) {
      file = await uploadVideo(admin, row);
      const { error: saveError } = await update({ transcription_file_name: file.name, transcription_file_uri: file.uri });
      if (saveError) throw saveError;
      file = await waitForFile(file.name);
    }
    const durationFromFile = Number.parseFloat(String(file.videoMetadata?.videoDuration || '').replace(/s$/, ''));
    const duration = Math.max(0, Number(row.duration_seconds) || durationFromFile || 0);
    if (!duration) throw new Error('A duração da gravação não está disponível para transcrição.');
    const from = Math.max(0, Number(row.transcription_cursor_seconds) || 0);
    const end = Math.min(duration, from + 240);
    if (from >= duration) {
      const { error: finishError } = await update({ transcription_status: 'concluido', transcription_error: null, transcription_finished_at: new Date().toISOString(), transcription_model: MODEL, transcription_attempts: 0 });
      if (finishError) throw finishError;
      return true;
    }
    const entries = await transcribeWindow(file, from, end);
    const { data: assembly, error: assemblyError } = await admin.from('scheduled_assemblies').select('cep').eq('id', row.assembly_id).single();
    if (assemblyError) throw assemblyError;
    const { error: deleteError } = await admin.from('assembly_transcripts').delete().eq('recording_id', row.id).eq('transcript_source', 'recording_gemini').gte('start_seconds', from).lt('start_seconds', end);
    if (deleteError) throw deleteError;
    const transcriptRows = entries.map(item => ({ assembly_id: row.assembly_id, recording_id: row.id, cep: assembly.cep,
      participant_email: 'transcricao-video@condomit.invalid', participant_name: item.participant_name,
      participant_role: 'não identificado', participant_identity: null, transcript: item.transcript,
      source: 'recording_gemini', transcript_source: 'recording_gemini',
      spoken_at: new Date(new Date(row.started_at).getTime() + item.start_seconds * 1000).toISOString(),
      start_seconds: item.start_seconds, end_seconds: item.end_seconds }));
    for (let offset = 0; offset < transcriptRows.length; offset += 75) {
      const { error: insertError } = await admin.from('assembly_transcripts').insert(transcriptRows.slice(offset, offset + 75));
      if (insertError) throw insertError;
    }
    const complete = end >= duration;
    const { error: progressError } = await update({ transcription_cursor_seconds: end, transcription_total_seconds: duration, transcription_status: complete ? 'concluido' : 'pendente',
      transcription_error: null, transcription_attempts: 0, transcription_model: MODEL,
      ...(complete ? { transcription_finished_at: new Date().toISOString() } : {}) });
    if (progressError) throw progressError;
    if (complete) {
      try { await fetch(`${API}/v1beta/${file.name}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { method: 'DELETE', signal: AbortSignal.timeout(12000) }); }
      catch (error) { console.warn('[ASSEMBLY GEMINI CLEANUP]', String(error.message).slice(0, 140)); }
      await update({ transcription_file_name: null, transcription_file_uri: null });
    } else {
      try { await enqueueTranscription(row.id); }
      catch (error) { console.warn('[ASSEMBLY GEMINI NEXT WINDOW]', { recording: row.id, error: String(error.message).slice(0, 200) }); }
    }
    return true;
  } catch (error) {
    const diagnostic = String(error?.message || 'Falha de transcrição').replace(/AIza[\w-]+/g, '[chave]').slice(0, 450);
    await update({ transcription_status: 'falhou', transcription_error: diagnostic, transcription_attempts: Number(row.transcription_attempts || 0) + 1 });
    throw error;
  }
}

module.exports = { adminClient, signJob, verifyJob, enqueueTranscription, runTranscription, normalizedEntries, videoPath, claimRecording };
