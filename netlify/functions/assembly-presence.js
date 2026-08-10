const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function httpError(statusCode, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

async function validateAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: httpError(401, 'Autenticação necessária.') };
  }

  const token = authHeader.substring(7).trim();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    return { error: httpError(401, 'Token de autenticação inválido ou expirado.') };
  }

  const userEmail = String(authData.user.email).trim().toLowerCase();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('name, email, user_type, condominium')
    .eq('email', userEmail)
    .maybeSingle();

  if (userError || !user) {
    return { error: httpError(401, 'Usuário não encontrado no sistema.') };
  }

  const { data: links } = await supabase
    .from('user_condominiums')
    .select('condominium_id')
    .eq('user_email', userEmail);

  const condoDigits = new Set();
  (Array.isArray(links) ? links : []).forEach((row) => {
    const digits = normalizeCep(row?.condominium_id);
    if (digits) condoDigits.add(digits);
  });

  let condo = user.condominium;
  if (typeof condo === 'string') {
    try { condo = JSON.parse(condo); } catch (_) { condo = null; }
  }
  if (condo && typeof condo === 'object') {
    [condo.cep, condo.condominium_id, condo.condominium_cep].forEach((value) => {
      const digits = normalizeCep(value);
      if (digits) condoDigits.add(digits);
    });
  }

  if (!condoDigits.size) {
    return { error: httpError(403, 'Usuário não possui condomínio associado.') };
  }

  return { user, userEmail, condoDigits };
}

function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '');
}

async function fetchAssembly(assemblyId) {
  const { data: assembly, error: assemblyError } = await supabase
    .from('scheduled_assemblies')
    .select('id, cep, status, created_by')
    .eq('id', assemblyId)
    .single();

  if (assemblyError || !assembly) {
    return { error: httpError(404, 'Assembleia não encontrada.') };
  }
  return { assembly };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return httpError(405, 'Método não permitido. Use POST.');
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (_) {
    return httpError(400, 'Corpo da requisição inválido.');
  }

  const assemblyId = body.assembly_id ? parseInt(body.assembly_id, 10) : NaN;
  if (!assemblyId || Number.isNaN(assemblyId)) {
    return httpError(400, 'ID da assembleia é obrigatório.');
  }

  const eventType = String(body.event || '').trim().toLowerCase();
  if (!['join', 'heartbeat', 'leave', 'reconnect'].includes(eventType)) {
    return httpError(400, 'Evento inválido.');
  }

  const auth = await validateAuth(event);
  if (auth.error) return auth.error;

  const fetched = await fetchAssembly(assemblyId);
  if (fetched.error) return fetched.error;
  const assembly = fetched.assembly;

  if (!auth.condoDigits.has(normalizeCep(assembly.cep))) {
    return httpError(403, 'Esta assembleia pertence a outro condomínio.');
  }

  if (auth.user.user_type === 'porteiro') {
    return httpError(403, 'Porteiros não podem participar de assembleias.');
  }

  const now = new Date().toISOString();
  const identity = `${auth.userEmail}-${assembly.id}`;

  try {
    if (eventType === 'join') {
      await supabase.from('assembly_attendance').upsert(
        {
          assembly_id: assembly.id,
          user_email: auth.userEmail,
          participant_name: auth.user.name || auth.userEmail,
          participant_role: auth.user.user_type,
          cep: assembly.cep,
          joined_at: now,
          last_heartbeat_at: now,
          presence_status: 'presente',
          updated_at: now,
        },
        { onConflict: 'assembly_id,user_email', ignoreDuplicates: false }
      );
    } else if (eventType === 'reconnect') {
      const { data: existing } = await supabase
        .from('assembly_attendance')
        .select('reconnections')
        .eq('assembly_id', assembly.id)
        .eq('user_email', auth.userEmail)
        .maybeSingle();
      const reconnections = Math.max(0, parseInt(existing?.reconnections || 0, 10)) + 1;
      await supabase
        .from('assembly_attendance')
        .update({
          reconnections,
          last_heartbeat_at: now,
          presence_status: 'presente',
          updated_at: now,
        })
        .eq('assembly_id', assembly.id)
        .eq('user_email', auth.userEmail);
    } else if (eventType === 'heartbeat') {
      await supabase
        .from('assembly_attendance')
        .update({
          last_heartbeat_at: now,
          presence_status: 'presente',
          updated_at: now,
        })
        .eq('assembly_id', assembly.id)
        .eq('user_email', auth.userEmail);
    } else if (eventType === 'leave') {
      await supabase
        .from('assembly_attendance')
        .update({
          presence_status: 'saiu_temporariamente',
          updated_at: now,
        })
        .eq('assembly_id', assembly.id)
        .eq('user_email', auth.userEmail);
    }
  } catch (e) {
    return httpError(500, 'Erro ao registrar presença.', e.message);
  }

  try {
    await supabase.from('assembly_event_logs').insert({
      assembly_id: assembly.id,
      cep: assembly.cep,
      event_type: `presence_${eventType}`,
      event_payload: { identity },
      created_by: auth.userEmail,
      created_at: now,
    });
  } catch (_) {}

  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: JSON.stringify({ ok: true }),
  };
};

