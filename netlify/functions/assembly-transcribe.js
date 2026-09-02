'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''
).trim();

const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

const OPENAI_API_KEY = String(
  process.env.TRANSCRIPTION_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  ''
).trim();

const TRANSCRIPTION_MODEL = String(
  process.env.OPENAI_TRANSCRIPTION_MODEL ||
  'gpt-4o-mini-transcribe'
).trim();

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
};

let supabaseAdmin = null;

function getAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseAdmin;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(body)
  };
}

function getBearerToken(event) {
  const headers = event.headers || {};
  const authorization = headers.authorization || headers.Authorization || '';
  const match = String(authorization).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function parseJson(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  if (!raw) return {};
  return JSON.parse(raw);
}

function normalizeCep(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : '';
}

function sameCep(a, b) {
  const left = normalizeCep(a);
  const right = normalizeCep(b);
  return Boolean(left && right && left === right);
}

async function userBelongsToAssembly(admin, email, assembly) {
  if (!email || !assembly?.cep) return false;

  const { data: links } = await admin
    .from('user_condominiums')
    .select('condominium_id')
    .eq('user_email', email);

  if (Array.isArray(links) && links.some((row) => sameCep(row?.condominium_id, assembly.cep))) {
    return true;
  }

  const { data: userRow } = await admin
    .from('users')
    .select('cep,condominium')
    .eq('email', email)
    .maybeSingle();

  if (sameCep(userRow?.cep, assembly.cep)) return true;

  let condominium = userRow?.condominium;
  if (typeof condominium === 'string') {
    try { condominium = JSON.parse(condominium); } catch (_) { condominium = null; }
  }

  const candidates = [
    condominium?.cep,
    condominium?.condominium_cep,
    condominium?.condominium_id,
    condominium?.id
  ];
  return candidates.some((candidate) => sameCep(candidate, assembly.cep));
}

function extensionFromMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  return 'webm';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(200, { ok: true });
  if (event.httpMethod !== 'POST') return response(405, { ok: false, error: 'Método não permitido.' });

  if (!OPENAI_API_KEY) {
    return response(503, {
      ok: false,
      code: 'TRANSCRIPTION_NOT_CONFIGURED',
      error: 'Transcrição de servidor não configurada.'
    });
  }

  const admin = getAdmin();
  if (!admin) {
    return response(503, {
      ok: false,
      code: 'SUPABASE_NOT_CONFIGURED',
      error: 'Supabase não configurado no servidor.'
    });
  }

  const token = getBearerToken(event);
  if (!token) return response(401, { ok: false, error: 'Sessão ausente.' });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUser = authData?.user;
  if (authError || !authUser?.email) {
    return response(401, { ok: false, error: 'Sessão inválida ou expirada.' });
  }

  let payload;
  try {
    payload = parseJson(event);
  } catch (_) {
    return response(400, { ok: false, error: 'Corpo da requisição inválido.' });
  }

  const assemblyId = Number(payload?.assembly_id);
  const audioBase64 = String(payload?.audio_base64 || '').trim();
  const mimeType = String(payload?.mime_type || 'audio/webm').trim();
  const participantIdentity = String(payload?.participant_identity || '').trim() || null;

  if (!Number.isFinite(assemblyId) || assemblyId <= 0) {
    return response(400, { ok: false, error: 'assembly_id inválido.' });
  }
  if (!audioBase64) {
    return response(400, { ok: false, error: 'Áudio ausente.' });
  }

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audioBase64, 'base64');
  } catch (_) {
    return response(400, { ok: false, error: 'Áudio inválido.' });
  }

  if (!audioBuffer.length || audioBuffer.length > MAX_AUDIO_BYTES) {
    return response(413, { ok: false, error: 'Trecho de áudio inválido ou muito grande.' });
  }

  const { data: assembly, error: assemblyError } = await admin
    .from('scheduled_assemblies')
    .select('id,cep,status')
    .eq('id', assemblyId)
    .maybeSingle();

  if (assemblyError || !assembly) {
    return response(404, { ok: false, error: 'Assembleia não encontrada.' });
  }

  const email = String(authUser.email || '').trim().toLowerCase();
  if (!(await userBelongsToAssembly(admin, email, assembly))) {
    return response(403, { ok: false, error: 'Esta assembleia pertence a outro condomínio.' });
  }

  try {
    const form = new FormData();
    const ext = extensionFromMime(mimeType);
    form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/webm' }), `assembleia-${assemblyId}.${ext}`);
    form.append('model', TRANSCRIPTION_MODEL);
    form.append('language', 'pt');
    form.append('prompt', 'Transcreva fielmente em português do Brasil uma fala de uma assembleia de condomínio. Preserve nomes próprios, números e termos administrativos. Não resuma e não invente conteúdo.');

    const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: form
    });

    const raw = await openaiResponse.text();
    let result = null;
    try { result = raw ? JSON.parse(raw) : null; } catch (_) { result = { raw }; }

    if (!openaiResponse.ok) {
      console.error('[assembly-transcribe] OpenAI:', openaiResponse.status, result);
      return response(502, {
        ok: false,
        code: 'TRANSCRIPTION_PROVIDER_ERROR',
        error: 'Não foi possível transcrever este trecho de áudio.',
        provider_status: openaiResponse.status,
        provider_error: String(result?.error?.message || '').slice(0, 500) || null
      });
    }

    const text = String(result?.text || '').replace(/\s+/g, ' ').trim();
    let saved = false;
    let saveError = null;

    if (text) {
      try {
        const { data: profile } = await admin
          .from('users')
          .select('name,user_type')
          .eq('email', email)
          .maybeSingle();

        const participantName = String(profile?.name || authUser.user_metadata?.name || email).trim() || email;
        const participantRole = String(profile?.user_type || authUser.user_metadata?.user_type || 'morador').trim().toLowerCase() || 'morador';

        const { error: insertError } = await admin
          .from('assembly_transcripts')
          .insert({
            assembly_id: assembly.id,
            cep: assembly.cep,
            participant_email: email,
            participant_name: participantName,
            participant_role: participantRole,
            participant_identity: participantIdentity,
            transcript: text.slice(0, 4000),
            source: 'server_transcribe',
            spoken_at: new Date().toISOString()
          });

        if (insertError) {
          saveError = insertError.message || 'Falha ao salvar transcrição.';
          console.error('[assembly-transcribe] Supabase insert:', insertError);
        } else {
          saved = true;
        }
      } catch (error) {
        saveError = error?.message || 'Falha ao salvar transcrição.';
        console.error('[assembly-transcribe] Persistência:', error);
      }
    }

    return response(200, {
      ok: true,
      text,
      saved,
      save_error: saveError,
      model: TRANSCRIPTION_MODEL
    });
  } catch (error) {
    console.error('[assembly-transcribe] Falha:', error);
    return response(500, {
      ok: false,
      code: 'TRANSCRIPTION_ERROR',
      error: 'Falha interna ao transcrever o áudio.'
    });
  }
};
