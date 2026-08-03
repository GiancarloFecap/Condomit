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

function sanitizeMessage(message) {
  const raw = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.replace(/[<>]/g, '').slice(0, 800);
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
  const message = sanitizeMessage(body.message);
  if (!assemblyId) return httpError(400, 'ID da assembleia é obrigatório.');
  if (!message) return httpError(400, 'Mensagem vazia.');

  const auth = await validateAuth(event);
  if (auth.error) return auth.error;

  if (auth.user.user_type === 'porteiro') {
    return httpError(403, 'Porteiros não podem participar do chat.');
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
    return httpError(409, 'Chat disponível somente durante a assembleia.');
  }

  const now = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('assembly_chat_messages')
    .insert({
      assembly_id: assembly.id,
      cep: auth.userCEP,
      user_email: auth.userEmail,
      participant_name: auth.user.name || auth.userEmail,
      participant_role: auth.user.user_type,
      message,
      created_at: now,
    })
    .select('*')
    .single();

  if (insertError) {
    return httpError(500, 'Erro ao salvar mensagem.', insertError.message);
  }

  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(inserted) };
};

