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
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

async function validateAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: httpError(401, 'Autenticação necessária.') };
  }
  const token = authHeader.substring(7);

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    return { error: httpError(401, 'Token de autenticação inválido ou expirado.') };
  }
  const userEmail = authData.user.email;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('name, email, user_type')
    .eq('email', userEmail)
    .single();
  if (userError || !user) {
    return { error: httpError(401, 'Usuário não encontrado no sistema.') };
  }

  const { data: userCondoData } = await supabase
    .from('user_condominiums')
    .select('condominium_id')
    .eq('user_email', userEmail)
    .maybeSingle();
  const userCEP = userCondoData?.condominium_id || null;
  if (!userCEP) {
    return { error: httpError(403, 'Usuário não possui condomínio associado.') };
  }

  return { user, userEmail, userCEP };
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

  const assemblyId = body.assembly_id || body.assemblyId;
  if (!assemblyId) return httpError(400, 'ID da assembleia é obrigatório.');

  const auth = await validateAuth(event);
  if (auth.error) return auth.error;

  if (auth.user.user_type === 'porteiro') {
    return httpError(403, 'Porteiros não podem participar.');
  }

  const { data: assembly, error: assemblyError } = await supabase
    .from('scheduled_assemblies')
    .select('id, cep, status')
    .eq('id', parseInt(assemblyId, 10))
    .single();

  if (assemblyError || !assembly) {
    return httpError(404, 'Assembleia não encontrada.');
  }
  if (assembly.cep !== auth.userCEP) {
    return httpError(403, 'Esta assembleia pertence a outro condomínio.');
  }
  if (assembly.status !== 'em_andamento') {
    return httpError(409, 'A mão levantada só está disponível durante a assembleia.');
  }

  const now = new Date().toISOString();
  const identity = `${auth.userEmail}-${assembly.id}`;

  const { data: latest } = await supabase
    .from('assembly_speaking_requests')
    .select('id, status')
    .eq('assembly_id', assembly.id)
    .eq('user_email', auth.userEmail)
    .order('requested_at', { ascending: false })
    .limit(1);

  const currentStatus = Array.isArray(latest) && latest.length ? String(latest[0].status || '').toLowerCase() : '';
  const nextStatus = currentStatus && currentStatus !== 'lowered' ? 'lowered' : 'raised';

  const { data: inserted, error: insertError } = await supabase
    .from('assembly_speaking_requests')
    .insert({
      assembly_id: assembly.id,
      cep: auth.userCEP,
      user_email: auth.userEmail,
      participant_name: auth.user.name || auth.userEmail,
      participant_role: auth.user.user_type,
      identity,
      status: nextStatus,
      requested_at: now,
      created_at: now,
    })
    .select('*')
    .single();

  if (insertError) {
    return httpError(500, 'Erro ao registrar solicitação.', insertError.message);
  }

  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(inserted) };
};

