'use strict';

const { createClient } = require('@supabase/supabase-js');

// As chaves abaixo são públicas no frontend do próprio projeto e servem apenas
// para validar a sessão do usuário. A OPENAI_API_KEY continua exclusivamente no
// ambiente da Netlify e nunca é enviada ao navegador.
const SUPABASE_URL = String(
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://zoplefkruidaxeapnrjp.supabase.co'
).trim();

const SUPABASE_ANON_KEY = String(
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_z9bRGucN09k7_E6taywKIg_FUpIEzaR'
).trim();

const OPENAI_API_KEY = String(
  process.env.TRANSCRIPTION_OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  ''
).trim().replace(/^['\"]|['\"]$/g, '');

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

function response(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
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

function createUserClient(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

function extensionFromMime(mime) {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  return 'webm';
}

function baseMimeType(mime) {
  const normalized = String(mime || 'audio/wav').toLowerCase().split(';')[0].trim();
  return /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|m4a)$/i.test(normalized)
    ? normalized
    : 'audio/wav';
}

function providerMessage(result, fallback = '') {
  return String(
    result?.error?.message ||
    result?.message ||
    result?.raw ||
    fallback ||
    ''
  ).replace(/\s+/g, ' ').trim().slice(0, 900);
}

async function requestTranscription(audioBuffer, mimeType, assemblyId, model) {
  const form = new FormData();
  const uploadMime = baseMimeType(mimeType);
  const ext = extensionFromMime(uploadMime);
  const bytes = new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);

  form.append('file', new Blob([bytes], { type: uploadMime }), `assembleia-${assemblyId}.${ext}`);
  form.append('model', model);
  form.append('language', 'pt');
  form.append(
    'prompt',
    'Transcreva fielmente em português do Brasil a fala desta assembleia de condomínio. Preserve nomes próprios, números e termos administrativos. Não resuma. Não invente conteúdo. Se houver apenas silêncio ou ruído sem fala inteligível, retorne texto vazio.'
  );

  const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form
  });

  const raw = await openaiResponse.text();
  let result = null;
  try { result = raw ? JSON.parse(raw) : null; } catch (_) { result = { raw }; }
  return { response: openaiResponse, result };
}

function mapProviderError(openaiResponse, result) {
  const detail = providerMessage(result, `OpenAI HTTP ${openaiResponse.status}`);
  let code = 'TRANSCRIPTION_PROVIDER_ERROR';
  let friendly = 'Não foi possível transcrever este trecho de áudio.';

  if (openaiResponse.status === 401 || openaiResponse.status === 403) {
    code = 'TRANSCRIPTION_INVALID_KEY';
    friendly = 'A OPENAI_API_KEY configurada na Netlify foi recusada.';
  } else if (openaiResponse.status === 429) {
    code = 'TRANSCRIPTION_QUOTA';
    friendly = 'A API de transcrição está sem cota/créditos disponíveis ou atingiu um limite de uso.';
  } else if (openaiResponse.status === 413) {
    code = 'TRANSCRIPTION_AUDIO_TOO_LARGE';
    friendly = 'O trecho de áudio ultrapassou o limite aceito pelo serviço de transcrição.';
  } else if ([400, 415, 422].includes(openaiResponse.status) && /audio|file|format|decode|corrupt|wav/i.test(detail)) {
    code = 'TRANSCRIPTION_AUDIO_INVALID';
    friendly = 'O serviço não conseguiu interpretar o trecho de áudio WAV.';
  }

  return { code, friendly, detail };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(200, { ok: true });
  if (event.httpMethod !== 'POST') return response(405, { ok: false, error: 'Método não permitido.' });

  if (!OPENAI_API_KEY) {
    return response(503, {
      ok: false,
      code: 'TRANSCRIPTION_NOT_CONFIGURED',
      error: 'OPENAI_API_KEY não configurada na Netlify.'
    });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return response(503, {
      ok: false,
      code: 'TRANSCRIPTION_AUTH',
      error: 'Configuração pública do Supabase indisponível no servidor.'
    });
  }

  const token = getBearerToken(event);
  if (!token) {
    return response(401, {
      ok: false,
      code: 'TRANSCRIPTION_AUTH',
      error: 'Sessão ausente. Entre novamente na Condomit.'
    });
  }

  const userClient = createUserClient(token);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    return response(401, {
      ok: false,
      code: 'TRANSCRIPTION_AUTH',
      error: 'Sessão inválida ou expirada. Entre novamente na Condomit.'
    });
  }

  let payload;
  try {
    payload = parseJson(event);
  } catch (_) {
    return response(400, { ok: false, error: 'Corpo da requisição inválido.' });
  }

  const assemblyId = Number(payload?.assembly_id);
  const audioBase64 = String(payload?.audio_base64 || '').trim();
  const mimeType = baseMimeType(payload?.mime_type || 'audio/wav');
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
    return response(400, { ok: false, code: 'TRANSCRIPTION_AUDIO_INVALID', error: 'Áudio inválido.' });
  }

  if (!audioBuffer.length || audioBuffer.length > MAX_AUDIO_BYTES) {
    return response(413, {
      ok: false,
      code: 'TRANSCRIPTION_AUDIO_TOO_LARGE',
      error: 'Trecho de áudio vazio ou acima do limite permitido.'
    });
  }

  try {
    let usedModel = TRANSCRIPTION_MODEL;
    let attempt = await requestTranscription(audioBuffer, mimeType, assemblyId, usedModel);
    let openaiResponse = attempt.response;
    let result = attempt.result;

    // Erros de credencial/cota não melhoram trocando de modelo. Para erros de
    // requisição/modelo, tenta whisper-1 como compatibilidade adicional.
    if (!openaiResponse.ok && !['whisper-1'].includes(usedModel) && ![401, 403, 429, 413].includes(openaiResponse.status)) {
      const detail = providerMessage(result).toLowerCase();
      if ([400, 404, 415, 422].includes(openaiResponse.status) || /model|unsupported|invalid.*model|not found/.test(detail)) {
        usedModel = 'whisper-1';
        attempt = await requestTranscription(audioBuffer, mimeType, assemblyId, usedModel);
        openaiResponse = attempt.response;
        result = attempt.result;
      }
    }

    if (!openaiResponse.ok) {
      console.error('[assembly-transcribe] OpenAI:', openaiResponse.status, result);
      const mapped = mapProviderError(openaiResponse, result);
      return response(502, {
        ok: false,
        code: mapped.code,
        error: mapped.friendly,
        provider_status: openaiResponse.status,
        provider_error: mapped.detail || null,
        model: usedModel,
        audio_bytes: audioBuffer.length,
        audio_mime: mimeType
      });
    }

    const text = String(result?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return response(200, {
        ok: true,
        text: '',
        saved: false,
        model: usedModel,
        reason: 'no_speech'
      });
    }

    // Salva usando a sessão do próprio usuário. A RPC já valida se o usuário
    // pertence ao condomínio da assembleia e se a assembleia aceita transcrição.
    // Não é mais necessário configurar SUPABASE_SERVICE_ROLE_KEY só para isto.
    const { data: savedRow, error: saveError } = await userClient.rpc('condomit_append_assembly_transcript', {
      target_assembly_id: assemblyId,
      transcript_text: text.slice(0, 4000),
      participant_identity_value: participantIdentity
    });

    if (saveError) {
      const denied = String(saveError.code || '') === '42501' || /condomínio|permiss|sessão/i.test(String(saveError.message || ''));
      console.error('[assembly-transcribe] RPC de persistência:', saveError);
      return response(denied ? 403 : 500, {
        ok: false,
        code: denied ? 'TRANSCRIPTION_SAVE_DENIED' : 'TRANSCRIPTION_SAVE_ERROR',
        error: saveError.message || 'A fala foi transcrita, mas não pôde ser registrada na ata.',
        text,
        model: usedModel
      });
    }

    return response(200, {
      ok: true,
      text,
      saved: Boolean(savedRow),
      model: usedModel
    });
  } catch (error) {
    console.error('[assembly-transcribe] Falha:', error);
    return response(500, {
      ok: false,
      code: 'TRANSCRIPTION_ERROR',
      error: error?.message || 'Falha interna ao transcrever o áudio.'
    });
  }
};
