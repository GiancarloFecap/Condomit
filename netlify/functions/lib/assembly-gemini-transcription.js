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

async function enqueueTranscription(recordingId) {
  if (!process.env.GEMINI_API_KEY || !signingSecret()) return false;
  const base = process.env.DEPLOY_URL || process.env.URL;
  if (!base || !/^https:\/\//i.test(base)) return false;
  const body = JSON.stringify({ recording_id: recordingId, timestamp: Date.now() });
  const response = await fetch(new URL('/.netlify/functions/assembly-gemini-transcribe-background', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-condomit-job-signature': signJob(body) },
    body,
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Solicitação da transcrição recusada (${response.status}).`);
  return true;
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
  const prompt = `Transcreva literalmente somente o áudio falado em português (ou no idioma realmente falado) deste trecho de assembleia. Não resuma, não invente frases, não transforme diálogos em ata e não inclua elementos visuais. Retorne JSON com a lista segments, cada item com text, start_seconds, end_seconds e speaker. Timestamps em segundos ABSOLUTOS do vídeo original (este recorte começa em ${start}s). Use uma identificação genérica de voz como "Falante 1" ou "Falante 2" somente se conseguir distingui-las; jamais atribua nomes reais por suposição. Se não houver fala inteligível, retorne segments vazio. Preserve falas contínuas completas sem cortar frases.`;
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
  const expired = new Date(Date.now() - 20 * 60000).toISOString();
  const retryable = row.transcription_status === 'pendente' || (row.transcription_status === 'falhou' && row.transcription_attempts < 3) || (row.transcription_status === 'processando' && row.transcription_started_at < expired);
  if (!retryable) return false;
  let request = admin.from('assembly_recordings').update({ transcription_status: 'processando', transcription_started_at: now,
    transcription_attempts: Number(row.transcription_attempts || 0) + 1, transcription_error: null })
    .eq('id', row.id).eq('status', 'concluido').eq('transcription_status', row.transcription_status);
  if (row.transcription_status === 'processando') request = request.lt('transcription_started_at', expired);
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
  let file = null;
  try {
    file = await uploadVideo(admin, row);
    file = await waitForFile(file.name);
    const duration = Number(row.duration_seconds) > 0 ? Number(row.duration_seconds) : null;
    const windows = [];
    if (!duration) throw new Error('A duração da gravação não está disponível para transcrição.');
    for (let from = 0; from < duration; from += 480) windows.push([from, Math.min(duration, from + 480)]);
    if (windows.length > 24) throw new Error('Gravação acima do limite de 3h12 de transcrição por execução.');
    const entries = [];
    for (const [start, end] of windows) entries.push(...await transcribeWindow(file, start, end));
    if (!entries.length) throw new Error('O Gemini não identificou nenhuma fala inteligível no vídeo.');
    const { data: assembly, error: assemblyError } = await admin.from('scheduled_assemblies').select('cep').eq('id', row.assembly_id).single();
    if (assemblyError) throw assemblyError;
    const transcriptRows = entries.map(item => ({ assembly_id: row.assembly_id, recording_id: row.id, cep: assembly.cep,
      participant_email: 'transcricao-video@condomit.invalid', participant_name: item.participant_name,
      participant_role: 'não identificado', participant_identity: null, transcript: item.transcript,
      source: 'recording_gemini', transcript_source: 'recording_gemini',
      spoken_at: new Date(new Date(row.started_at).getTime() + item.start_seconds * 1000).toISOString(),
      start_seconds: item.start_seconds, end_seconds: item.end_seconds }));
    const { error: deleteError } = await admin.from('assembly_transcripts').delete().eq('recording_id', row.id).eq('transcript_source', 'recording_gemini');
    if (deleteError) throw deleteError;
    for (let offset = 0; offset < transcriptRows.length; offset += 100) {
      const { error: insertError } = await admin.from('assembly_transcripts').insert(transcriptRows.slice(offset, offset + 100));
      if (insertError) throw insertError;
    }
    const { error: updateError } = await admin.from('assembly_recordings').update({ transcription_status: 'concluido', transcription_error: null,
      transcription_finished_at: new Date().toISOString(), transcription_model: MODEL }).eq('id', row.id);
    if (updateError) throw updateError;
    return true;
  } catch (error) {
    const diagnostic = String(error?.message || 'Falha de transcrição').replace(/AIza[\w-]+/g, '[chave]').slice(0, 450);
    await admin.from('assembly_recordings').update({ transcription_status: 'falhou', transcription_error: diagnostic }).eq('id', row.id);
    throw error;
  } finally {
    if (file?.name) await fetch(`${API}/v1beta/${file.name}?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, { method: 'DELETE', signal: AbortSignal.timeout(12000) }).catch(() => {});
  }
}

module.exports = { adminClient, signJob, verifyJob, enqueueTranscription, runTranscription, normalizedEntries, videoPath, claimRecording };
