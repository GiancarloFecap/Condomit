const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://condomit.netlify.app').replace(/\/$/, '');
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
const TWO_FACTOR_SECRET =
  process.env.TWO_FACTOR_SECRET ||
  process.env.RESET_TOKEN_SECRET ||
  SUPABASE_SERVICE_ROLE_KEY;

const ACTION_TTL_MS = 15 * 60 * 1000;
const LOGIN_TTL_MS = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function maskEmail(email) {
  const value = normalizeEmail(email);
  const [name, domain] = value.split('@');
  if (!name || !domain) return value;
  if (name.length <= 2) return `${name[0] || '*'}***@${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(Math.min(6, Math.max(3, name.length - 2)))}@${domain}`;
}

function hashActionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function hashLoginCode(challengeId, code) {
  return crypto
    .createHmac('sha256', TWO_FACTOR_SECRET)
    .update(`${challengeId}:${String(code || '')}`)
    .digest('hex');
}

function safeEqualHex(a, b) {
  try {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function randomCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function assertConfig({ needAnon = false, needEmail = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase de servidor não configurado.');
  }
  if (needAnon && !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY não configurada no Netlify.');
  }
  if (needEmail && (!BREVO_API_KEY || !BREVO_SENDER_EMAIL)) {
    throw new Error('Serviço de e-mail não configurado no Netlify.');
  }
  if (!TWO_FACTOR_SECRET) {
    throw new Error('TWO_FACTOR_SECRET não configurado.');
  }
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function publicAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function brevoClient() {
  return new BrevoClient({
    apiKey: BREVO_API_KEY,
    environment: BrevoEnvironment.Production
  });
}

async function sendEmail({ to, subject, html }) {
  assertConfig({ needEmail: true });
  await brevoClient().transactionalEmails.sendTransacEmail({
    sender: { name: 'Condomit', email: BREVO_SENDER_EMAIL },
    replyTo: { email: BREVO_SENDER_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent: html
  });
}

function emailShell(title, body, buttonHtml = '') {
  return `<!doctype html>
  <html lang="pt-BR">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
    <div style="max-width:620px;margin:0 auto;padding:32px 16px">
      <div style="background:#fff;border-radius:22px;padding:32px;box-shadow:0 12px 38px rgba(15,23,42,.08)">
        <h1 style="font-size:24px;margin:0 0 16px;color:#2145b8">${title}</h1>
        <div style="font-size:15px;line-height:1.65;color:#4b5563">${body}</div>
        ${buttonHtml}
        <p style="margin:28px 0 0;font-size:12px;color:#94a3b8">2026 Condomit. Mensagem automática de segurança.</p>
      </div>
    </div>
  </body>
  </html>`;
}

async function getAuthenticatedUser(event, admin) {
  const auth = String(event.headers?.authorization || event.headers?.Authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.email) return null;
  return { authUser: data.user, token };
}

async function getProfile(admin, email) {
  const { data, error } = await admin
    .from('users')
    .select('email,name,user_type,two_factor_enabled,two_factor_enabled_at')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function handleStatus(event) {
  assertConfig();
  const admin = adminClient();
  const auth = await getAuthenticatedUser(event, admin);
  if (!auth) return response(401, { error: 'Sessão inválida.' });

  const profile = await getProfile(admin, normalizeEmail(auth.authUser.email));
  if (!profile) return response(404, { error: 'Perfil não encontrado.' });

  return response(200, {
    enabled: profile.two_factor_enabled === true,
    email: profile.email,
    maskedEmail: maskEmail(profile.email),
    enabledAt: profile.two_factor_enabled_at || null
  });
}

async function handleRequestChange(event, payload) {
  assertConfig({ needEmail: true });
  const admin = adminClient();
  const auth = await getAuthenticatedUser(event, admin);
  if (!auth) return response(401, { error: 'Sessão inválida.' });

  const email = normalizeEmail(auth.authUser.email);
  const desiredEnabled = payload?.enabled === true;
  const profile = await getProfile(admin, email);
  if (!profile) return response(404, { error: 'Perfil não encontrado.' });

  if ((profile.two_factor_enabled === true) === desiredEnabled) {
    return response(200, {
      alreadyInState: true,
      enabled: desiredEnabled,
      email,
      maskedEmail: maskEmail(email)
    });
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashActionToken(rawToken);
  const expiresAt = new Date(Date.now() + ACTION_TTL_MS).toISOString();

  await admin
    .from('two_factor_action_tokens')
    .delete()
    .eq('user_email', email)
    .is('used_at', null);

  const { error: insertError } = await admin
    .from('two_factor_action_tokens')
    .insert({
      token_hash: tokenHash,
      user_email: email,
      desired_enabled: desiredEnabled,
      expires_at: expiresAt
    });
  if (insertError) throw insertError;

  const link = `${APP_BASE_URL}/pages/confirmar-2fa.html?token=${encodeURIComponent(rawToken)}`;
  const verb = desiredEnabled ? 'ativar' : 'desativar';
  const title = desiredEnabled
    ? 'Confirme a ativação da verificação em duas etapas'
    : 'Confirme a desativação da verificação em duas etapas';

  await sendEmail({
    to: email,
    subject: `${desiredEnabled ? 'Ativar' : 'Desativar'} verificação em duas etapas - Condomit`,
    html: emailShell(
      title,
      `<p>Recebemos uma solicitação para <strong>${verb}</strong> a verificação em duas etapas da conta <strong>${email}</strong>.</p>
       <p>Este link é temporário e expira em 15 minutos. Se você não fez essa solicitação, ignore esta mensagem.</p>`,
      `<p style="margin:26px 0 0"><a href="${link}" style="display:inline-block;background:#2145b8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:700">Confirmar ${desiredEnabled ? 'ativação' : 'desativação'}</a></p>`
    )
  });

  return response(200, {
    sent: true,
    email,
    maskedEmail: maskEmail(email),
    expiresInMinutes: 15
  });
}

async function handleConfirmChange(payload) {
  assertConfig();
  const tokenHash = hashActionToken(payload?.token);
  if (!payload?.token) return response(400, { error: 'Token ausente.' });

  const admin = adminClient();
  const { data: row, error } = await admin
    .from('two_factor_action_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return response(400, { error: 'Este link é inválido, expirou ou já foi utilizado.' });
  }

  const { error: updateError } = await admin
    .from('users')
    .update({
      two_factor_enabled: row.desired_enabled === true,
      two_factor_enabled_at: row.desired_enabled === true ? new Date().toISOString() : null
    })
    .eq('email', row.user_email);
  if (updateError) throw updateError;

  await admin
    .from('two_factor_action_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  return response(200, {
    confirmed: true,
    enabled: row.desired_enabled === true,
    email: row.user_email
  });
}

async function handlePasswordLogin(payload) {
  assertConfig({ needAnon: true });
  const email = normalizeEmail(payload?.email);
  const password = String(payload?.password || '');
  if (!email || !password) return response(400, { error: 'E-mail e senha são obrigatórios.' });

  const authClient = publicAuthClient();
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email,
    password
  });

  if (authError || !authData?.session || !authData?.user) {
    return response(Number(authError?.status) || 401, {
      error: authError?.message || 'Falha na autenticação.',
      code: authError?.code || 'invalid_credentials',
      status: authError?.status || 401
    });
  }

  const admin = adminClient();
  const profile = await getProfile(admin, email);

  if (!profile?.two_factor_enabled) {
    return response(200, {
      requiresTwoFactor: false,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token
      }
    });
  }

  assertConfig({ needEmail: true });

  const challengeId = crypto.randomUUID();
  const code = randomCode();
  const codeHash = hashLoginCode(challengeId, code);
  const expiresAt = new Date(Date.now() + LOGIN_TTL_MS).toISOString();

  await admin
    .from('two_factor_login_challenges')
    .delete()
    .eq('user_email', email)
    .is('consumed_at', null);

  const { error: insertError } = await admin
    .from('two_factor_login_challenges')
    .insert({
      challenge_id: challengeId,
      user_email: email,
      code_hash: codeHash,
      expires_at: expiresAt
    });
  if (insertError) throw insertError;

  await sendEmail({
    to: email,
    subject: 'Seu código de verificação - Condomit',
    html: emailShell(
      'Código de verificação',
      `<p>Use o código abaixo para concluir o acesso à sua conta Condomit.</p>
       <div style="font-size:34px;letter-spacing:9px;font-weight:800;color:#2145b8;margin:24px 0">${code}</div>
       <p>O código expira em 10 minutos e só pode ser utilizado uma vez. Não compartilhe este código.</p>`
    )
  });

  return response(200, {
    requiresTwoFactor: true,
    challengeId,
    email,
    maskedEmail: maskEmail(email),
    expiresInMinutes: 10
  });
}

async function handleVerifyLogin(payload) {
  assertConfig();
  const challengeId = String(payload?.challengeId || '').trim();
  const code = String(payload?.code || '').replace(/\D/g, '').slice(0, 6);
  if (!challengeId || code.length !== 6) {
    return response(400, { error: 'Informe o código de 6 dígitos.' });
  }

  const admin = adminClient();
  const { data: row, error } = await admin
    .from('two_factor_login_challenges')
    .select('*')
    .eq('challenge_id', challengeId)
    .maybeSingle();
  if (error) throw error;

  if (!row || row.consumed_at) {
    return response(400, { error: 'Código inválido ou já utilizado.' });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return response(400, { error: 'O código expirou. Volte ao login e solicite um novo.' });
  }
  if (Number(row.attempts || 0) >= MAX_LOGIN_ATTEMPTS) {
    return response(429, { error: 'Número máximo de tentativas atingido. Faça login novamente.' });
  }

  const expected = hashLoginCode(challengeId, code);
  if (!safeEqualHex(expected, row.code_hash)) {
    await admin
      .from('two_factor_login_challenges')
      .update({ attempts: Number(row.attempts || 0) + 1 })
      .eq('challenge_id', challengeId);
    return response(401, { error: 'Código incorreto.' });
  }

  await admin
    .from('two_factor_login_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('challenge_id', challengeId);

  const profile = await getProfile(admin, normalizeEmail(row.user_email));
  const rawUserType = String(profile?.user_type || '').trim().toLowerCase();
  const userType = rawUserType === 'síndico' ? 'sindico' : rawUserType;

  /*
   * Gera um token de autenticação Supabase, mas NÃO redireciona o navegador
   * para o action_link. O frontend troca o token_hash diretamente por uma
   * sessão com supabase.auth.verifyOtp(). Isso evita depender de Site URL /
   * Redirect URLs do Supabase e impede redirecionamentos para localhost.
   */
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: row.user_email
  });
  if (linkError) throw linkError;

  const tokenHash = String(linkData?.properties?.hashed_token || '').trim();
  const verificationType = String(
    linkData?.properties?.verification_type || 'magiclink'
  ).trim();

  if (!tokenHash) {
    throw new Error('Não foi possível concluir a autenticação.');
  }

  return response(200, {
    verified: true,
    tokenHash,
    verificationType,
    userType
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { error: 'Método não permitido.' });

  try {
    const payload = JSON.parse(event.body || '{}');
    switch (String(payload.action || '').trim()) {
      case 'status':
        return await handleStatus(event);
      case 'request-change':
        return await handleRequestChange(event, payload);
      case 'confirm-change':
        return await handleConfirmChange(payload);
      case 'password-login':
        return await handlePasswordLogin(payload);
      case 'verify-login':
        return await handleVerifyLogin(payload);
      default:
        return response(400, { error: 'Ação inválida.' });
    }
  } catch (error) {
    console.error('[2FA]', error);
    return response(500, {
      error: error?.message || 'Erro interno na verificação em duas etapas.'
    });
  }
};
