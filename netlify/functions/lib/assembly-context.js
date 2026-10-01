const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[assembly-context] Variáveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.');
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function httpError(statusCode, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;

  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body)
  };
}

function normalizeCep(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : '';
}

function formatCep(value) {
  const digits = normalizeCep(value);
  return digits ? `${digits.slice(0, 5)}-${digits.slice(5)}` : '';
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function extractProfileCep(user) {
  if (!user) return '';

  const direct =
    user.cep ||
    user.condominium_cep ||
    user.condominiumCep ||
    user.condominium_id ||
    user.condominiumId;

  if (normalizeCep(direct)) return formatCep(direct);

  const condominium = parseJsonObject(user.condominium);
  if (!condominium) return '';

  return formatCep(
    condominium.cep ||
    condominium.condominium_cep ||
    condominium.condominiumCep ||
    condominium.condominium_id ||
    condominium.condominiumId ||
    condominium.id
  );
}

async function getAuthenticatedContext(event) {
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    '';

  if (!authHeader.startsWith('Bearer ')) {
    return {
      error: httpError(401, 'Autenticação necessária.')
    };
  }

  const token = authHeader.slice(7).trim();

  const {
    data: authData,
    error: authError
  } = await supabase.auth.getUser(token);

  if (authError || !authData?.user?.email) {
    return {
      error: httpError(
        401,
        'Token de autenticação inválido ou expirado.',
        authError?.message || null
      )
    };
  }

  const authUser = authData.user;
  const userEmail = String(authUser.email || '').trim().toLowerCase();

  const {
    data: user,
    error: userError
  } = await supabase
    .from('users')
    .select('name,email,user_type,cpf,phone,condominium')
    .eq('email', userEmail)
    .maybeSingle();

  if (userError || !user) {
    return {
      error: httpError(
        401,
        'Usuário não encontrado no sistema.',
        userError?.message || null
      )
    };
  }

  const {
    data: links,
    error: linksError
  } = await supabase
    .from('user_condominiums')
    .select('condominium_id,apartment,block')
    .eq('user_email', userEmail);

  if (linksError) {
    console.warn(
      '[assembly-context] Falha ao consultar user_condominiums:',
      linksError.message
    );
  }

  const condominiumDigits = new Set();

  (Array.isArray(links) ? links : []).forEach((row) => {
    const digits = normalizeCep(row?.condominium_id);
    if (digits) condominiumDigits.add(digits);
  });

  const profileDigits = normalizeCep(extractProfileCep(user));
  if (profileDigits) condominiumDigits.add(profileDigits);

  return {
    authUser,
    user,
    userEmail,
    links: Array.isArray(links) ? links : [],
    condominiumDigits
  };
}

function belongsToCep(context, cep) {
  const digits = normalizeCep(cep);
  return Boolean(
    digits &&
    context?.condominiumDigits instanceof Set &&
    context.condominiumDigits.has(digits)
  );
}

function isAllowedAssemblyRoomStatus(status) {
  return ['agendada', 'em_andamento'].includes(
    String(status || '').trim().toLowerCase()
  );
}

module.exports = {
  supabase,
  corsHeaders,
  httpError,
  normalizeCep,
  formatCep,
  parseJsonObject,
  extractProfileCep,
  getAuthenticatedContext,
  belongsToCep,
  isAllowedAssemblyRoomStatus
};
