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

  const pollId = body.poll_id || body.pollId;
  const optionId = body.option_id || body.optionId;
  const assemblyId = body.assembly_id || body.assemblyId;
  if (!pollId || !optionId || !assemblyId) {
    return httpError(400, 'Parâmetros obrigatórios ausentes.');
  }

  const auth = await validateAuth(event);
  if (auth.error) return auth.error;

  if (auth.user.user_type === 'porteiro') {
    return httpError(403, 'Porteiros não podem votar.');
  }

  const { data: assembly, error: assemblyError } = await supabase
    .from('scheduled_assemblies')
    .select('id, cep, status, created_by')
    .eq('id', parseInt(assemblyId, 10))
    .single();
  if (assemblyError || !assembly) {
    return httpError(404, 'Assembleia não encontrada.');
  }
  if (assembly.cep !== auth.userCEP) {
    return httpError(403, 'Esta assembleia pertence a outro condomínio.');
  }
  if (assembly.status !== 'em_andamento') {
    return httpError(409, 'Assembleia indisponível para votação.');
  }

  const { data: poll, error: pollError } = await supabase
    .from('assembly_polls')
    .select('id, assembly_id, cep, status, end_at')
    .eq('id', parseInt(pollId, 10))
    .single();
  if (pollError || !poll) return httpError(404, 'Votação não encontrada.');
  if (poll.assembly_id !== assembly.id) return httpError(403, 'Votação não pertence à assembleia.');
  if (poll.cep !== auth.userCEP) return httpError(403, 'Votação pertence a outro condomínio.');
  if (poll.status !== 'aberta') return httpError(409, 'Votação encerrada ou não iniciada.');
  if (poll.end_at && new Date(poll.end_at).getTime() < Date.now()) return httpError(409, 'Votação encerrada.');

  const { data: option, error: optionError } = await supabase
    .from('assembly_poll_options')
    .select('id, poll_id')
    .eq('id', parseInt(optionId, 10))
    .single();
  if (optionError || !option) return httpError(404, 'Opção inválida.');
  if (option.poll_id !== poll.id) return httpError(400, 'Opção não pertence à votação.');

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from('assembly_votes')
    .insert({
      poll_id: poll.id,
      option_id: option.id,
      assembly_id: assembly.id,
      cep: auth.userCEP,
      user_email: auth.userEmail,
      created_at: now,
    })
    .select('*')
    .single();

  if (insertError) {
    const msg = insertError.message || '';
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
      return httpError(409, 'Você já votou nesta votação.');
    }
    return httpError(500, 'Erro ao registrar voto.', insertError.message);
  }

  return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify(inserted) };
};

