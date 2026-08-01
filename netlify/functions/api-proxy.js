const crypto = require('crypto');
const https = require('https');
const { Brevo, BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxNTA2NCwiZXhwIjoyMDk1OTkxMDY0fQ.wi0H-LHiBiMm3_WPXw1lslRnhAw3atf_BGUZCp2PdNA';
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://condomit.netlify.app';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
const KEYCLOAK_BASE_URL = (process.env.KEYCLOAK_BASE_URL || process.env.KEYCLOAK_URL || '').replace(/\/$/, '');
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || '';
const KEYCLOAK_ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || 'master';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || '';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || '';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || '';
const MERCADO_PAGO_IS_TEST_MODE = /^TEST-/i.test(String(MERCADO_PAGO_ACCESS_TOKEN || '').trim());

const brevoClient = BREVO_API_KEY ? new BrevoClient({
  apiKey: BREVO_API_KEY,
  environment: BrevoEnvironment.Production
}) : null;

function mpRequest(requestPath, method = 'GET', payload = null) {
  return new Promise((resolve, reject) => {
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      reject(new Error('MERCADO_PAGO_ACCESS_TOKEN não configurado'));
      return;
    }

    const body = payload ? JSON.stringify(payload) : null;
    const options = {
      hostname: 'api.mercadopago.com',
      path: requestPath,
      method,
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (_) {
          reject(new Error('Erro ao parsear resposta do Mercado Pago'));
          return;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const message = parsed?.message || parsed?.error || `Erro Mercado Pago (HTTP ${response.statusCode})`;
          reject(new Error(message));
          return;
        }
        resolve(parsed);
      });
    });

    request.on('error', (e) => reject(e));
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function mpCreatePreference(preferencePayload) {
  return mpRequest('/checkout/preferences', 'POST', preferencePayload);
}

function mpFetchPayment(paymentId) {
  return mpRequest(`/v1/payments/${encodeURIComponent(String(paymentId))}`, 'GET');
}

function parseMercadoPagoAmount(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return NaN;
  }

  const cleaned = raw.replace(/[^\d,.-]/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);

  let normalized = cleaned;
  if (decimalIndex >= 0) {
    const integerPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, '');
    const decimalPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, '');
    normalized = `${integerPart}.${decimalPart}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }

  return Number(normalized);
}

function resolveMercadoPagoCheckoutUrl(createdPreference) {
  const sandboxInitPoint = createdPreference?.sandbox_init_point || '';
  const productionInitPoint = createdPreference?.init_point || '';
  return sandboxInitPoint || productionInitPoint || '';
}

const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY;
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;

function generateResetToken(email) {
  const payload = Buffer.from(JSON.stringify({
    email,
    expires: Date.now() + RESET_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(16).toString('hex')
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', RESET_TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyResetToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;

  const expectedSignature = crypto.createHmac('sha256', RESET_TOKEN_SECRET).update(payload).digest('base64url');
  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.email && Date.now() <= data.expires ? data : null;
  } catch (error) {
    return null;
  }
}

function hasBrevoConfig() {
  return Boolean(BREVO_API_KEY && brevoClient);
}

function hasKeycloakConfig() {
  return Boolean(
    KEYCLOAK_BASE_URL &&
    KEYCLOAK_REALM &&
    KEYCLOAK_CLIENT_ID &&
    (KEYCLOAK_CLIENT_SECRET || (KEYCLOAK_ADMIN_USERNAME && KEYCLOAK_ADMIN_PASSWORD))
  );
}

function getRequestOrigin(event) {
  const headers = event.headers || {};
  const forwardedProto = headers['x-forwarded-proto'];
  const forwardedHost = headers['x-forwarded-host'];
  const protocol = forwardedProto || 'https';
  const host = forwardedHost || headers.host || 'condomit.netlify.app';
  return `${protocol}://${host}`;
}

function getResetPageUrl(event, providedResetPageUrl) {
  const fallbackBase = APP_BASE_URL || getRequestOrigin(event);
  try {
    return new URL(providedResetPageUrl || '/pages/redefinir-senha.html', fallbackBase).toString();
  } catch (error) {
    return new URL('/pages/redefinir-senha.html', fallbackBase).toString();
  }
}

function buildResetLink(event, token, providedResetPageUrl) {
  const resetUrl = new URL(getResetPageUrl(event, providedResetPageUrl));
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
}

function getDisplayName(usuario, fallbackEmail) {
  const nome = usuario?.nome || usuario?.name || usuario?.firstName || usuario?.username;
  if (nome && String(nome).trim()) {
    return String(nome).trim();
  }
  return String(fallbackEmail || '').split('@')[0] || 'morador';
}

function getBrevoErrorMessage(error) {
  const candidates = [
    error?.body?.message,
    error?.response?.data?.message,
    error?.response?.body?.message,
    error?.message
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }

  try {
    return JSON.stringify(error);
  } catch (_) {
    return 'Falha ao enviar e-mail pelo Brevo';
  }
}

function buildResetEmailHtml(usuarioNome, link) {
  const logoUrl = `${APP_BASE_URL}/assets/logo-full.png`;
  const supportMailto = 'mailto:contato.condomit@gmail.com?subject=Suporte%20Condomit';
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <body style="margin:0;padding:0;background-color:#efefef;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#efefef;margin:0;padding:0;">
          <tr>
            <td align="center" style="padding:20px 12px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:820px;">
                <tr>
                  <td align="center" style="padding:0 0 18px;">
                    <img src="${logoUrl}" alt="Condomit" width="264" style="display:block;width:264px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#ffffff;border:1px solid #d8d8d8;border-radius:12px;padding:0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding:56px 56px 26px;font-family:Arial,sans-serif;color:#172554;font-size:18px;line-height:1.7;">
                          <p style="margin:0 0 28px;font-size:18px;line-height:1.7;color:#172554;">
                            <strong>Olá, ${usuarioNome},</strong>
                          </p>
                          <p style="margin:0 0 26px;font-size:18px;line-height:1.75;color:#1f2f5c;">
                            Recebemos uma solicitação para redefinir a senha da sua conta no Condomit. Clique no botão abaixo para criar uma nova senha.
                          </p>
                          <p style="margin:0 0 34px;font-size:18px;line-height:1.75;color:#1f2f5c;">
                            Se você não solicitou a troca de senha, pode ignorar este e-mail.
                          </p>
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 42px;">
                            <tr>
                              <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                                <a href="${link}" style="display:inline-block;padding:17px 52px;font-family:Arial,sans-serif;font-size:18px;font-weight:400;line-height:1.2;color:#ffffff;text-decoration:none;background:#2563eb;border-radius:6px;">
                                  Redefinir senha
                                </a>
                              </td>
                            </tr>
                          </table>
                          <div style="border-top:1px solid #d9d9d9;font-size:1px;line-height:1px;margin:0 0 34px;">&nbsp;</div>
                          <p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#1f2f5c;">
                            Precisa de ajuda?
                            <a href="${supportMailto}" style="color:#2563eb;text-decoration:none;">Entre em contato com nossa equipe de suporte</a>
                          </p>
                          <p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#1f2f5c;">
                            ou acesse nossa
                            <a href="${supportMailto}" style="color:#2563eb;text-decoration:none;">Central de Ajuda</a>.
                          </p>
                          <p style="margin:0;font-size:16px;line-height:1.85;color:#1f2f5c;">
                            A segurança da sua conta é importante para nós.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:18px 24px 0;font-family:Arial,sans-serif;color:#7c8aa5;">
                    <p style="margin:0 0 8px;font-size:14px;line-height:1.7;">Este é um e-mail automático, por favor não responda.</p>
                    <p style="margin:0;font-size:14px;line-height:1.7;">© 2026 Condomit. Todos os direitos reservados.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

async function sendResetEmail(toEmail, usuario, resetLink) {
  if (!hasBrevoConfig()) {
    throw new Error('BREVO_API_KEY não configurada');
  }
  if (!BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_SENDER_EMAIL não configurado');
  }

  const email = toEmail;
  const link = resetLink;
  const usuarioBrevo = {
    ...usuario,
    nome: getDisplayName(usuario, toEmail)
  };

  const info = await brevoClient.transactionalEmails.sendTransacEmail({
    sender: { name: 'Condomit', email: BREVO_SENDER_EMAIL },
    replyTo: { email: BREVO_SENDER_EMAIL },
    to: [{ email: email }],
    subject: 'Recuperação de senha — Condomit',
    htmlContent: buildResetEmailHtml(usuarioBrevo.nome, link)
  });

  const messageId = info?.messageId || info?.body?.messageId;
  if (!messageId) {
    throw new Error('O Brevo não confirmou o recebimento do e-mail');
  }

  console.log('Link de reset:', resetLink);
  return { ...info, messageId };
}

async function proxySupabaseRequest(body, pathSuffix, method) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${pathSuffix}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (parseError) {
    data = text;
  }
  return { status: response.status, data };
}

async function fetchSupabaseUsersByEmail(email) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=email,name&email=eq.${encodeURIComponent(email)}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!response.ok) throw new Error('Falha ao consultar usuários no Supabase');
  const users = await response.json();
  return Array.isArray(users) ? users : [];
}

async function updateSupabasePassword(email, password) {
  const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ password })
  });
  if (!updateResponse.ok) throw new Error('Falha ao atualizar senha no Supabase');
  const updatedUsers = await updateResponse.json().catch(() => []);
  return Array.isArray(updatedUsers) ? updatedUsers.length : 0;
}

async function getKeycloakAdminToken() {
  if (!hasKeycloakConfig()) return null;
  const params = new URLSearchParams();
  params.set('client_id', KEYCLOAK_CLIENT_ID);
  if (KEYCLOAK_CLIENT_SECRET) {
    params.set('grant_type', 'client_credentials');
    params.set('client_secret', KEYCLOAK_CLIENT_SECRET);
  } else {
    params.set('grant_type', 'password');
    params.set('username', KEYCLOAK_ADMIN_USERNAME);
    params.set('password', KEYCLOAK_ADMIN_PASSWORD);
  }
  const response = await fetch(`${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_ADMIN_REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Falha ao autenticar no Keycloak');
  }
  return payload.access_token;
}

async function findKeycloakUserByEmail(email) {
  if (!hasKeycloakConfig()) return null;
  const accessToken = await getKeycloakAdminToken();
  const response = await fetch(`${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users?email=${encodeURIComponent(email)}&exact=true`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const users = await response.json().catch(() => []);
  if (!response.ok) throw new Error('Falha ao consultar usuário no Keycloak');
  return Array.isArray(users) && users.length ? users[0] : null;
}

async function updateKeycloakPassword(email, password) {
  if (!hasKeycloakConfig()) return { synced: false, reason: 'disabled' };
  const user = await findKeycloakUserByEmail(email);
  if (!user?.id) return { synced: false, reason: 'not-found' };
  const accessToken = await getKeycloakAdminToken();
  const response = await fetch(`${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user.id}/reset-password`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ type: 'password', temporary: false, value: password })
  });
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || 'Falha ao atualizar senha no Keycloak');
  }
  return { synced: true };
}

async function createMercadoPagoPreference(data) {
  const { amount, planName, payerEmail, planId } = data;
  const normalizedAmount = parseMercadoPagoAmount(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Valor do plano inválido para gerar o pagamento');
  }
  const base = APP_BASE_URL || 'https://condomit.netlify.app';
  const successUrl = new URL('/pages/checkout.html', base);
  const failureUrl = new URL('/pages/checkout.html', base);
  const pendingUrl = new URL('/pages/checkout.html', base);
  successUrl.searchParams.set('checkout_status', 'approved');
  failureUrl.searchParams.set('checkout_status', 'failure');
  pendingUrl.searchParams.set('checkout_status', 'pending');
  if (planId !== undefined && planId !== null) {
    successUrl.searchParams.set('plan_id', String(planId));
    failureUrl.searchParams.set('plan_id', String(planId));
    pendingUrl.searchParams.set('plan_id', String(planId));
  }

  const preferencePayload = {
    items: [
      {
        title: `Plano ${planName} - Condomit`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: normalizedAmount
      }
    ],
    back_urls: {
      success: successUrl.toString(),
      failure: failureUrl.toString(),
      pending: pendingUrl.toString()
    },
    auto_return: 'approved',
    statement_descriptor: 'CONDOMIT',
    external_reference: `CONDOMIT-${planId || 'plan'}-${Date.now()}`
  };

  const created = await mpCreatePreference(preferencePayload);
  const initPoint = resolveMercadoPagoCheckoutUrl(created);
  const detectedTestMode = Boolean(created?.sandbox_init_point) || MERCADO_PAGO_IS_TEST_MODE;
  if (!initPoint) throw new Error(created?.message || 'Link de pagamento não retornado');
  return { preferenceId: created.id, initPoint, testMode: detectedTestMode };
}

async function getMercadoPagoPaymentStatus(data) {
  const paymentId = data?.paymentId;
  if (!paymentId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'paymentId é obrigatório' }) };
  }
  const payment = await mpFetchPayment(paymentId);
  return {
    statusCode: 200,
    body: JSON.stringify({
      id: payment?.id,
      status: payment?.status,
      status_detail: payment?.status_detail,
      transaction_amount: payment?.transaction_amount,
      external_reference: payment?.external_reference
    })
  };
}

async function handleForgotPassword(event, body) {
  const { email, resetPageUrl } = body || {};
  // #region debug-point C:netlify-handler-start
  fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"C",location:"netlify/functions/api-proxy.js:handleForgotPassword:start",msg:"[DEBUG] Handler de recuperacao iniciou no Netlify proxy",data:{path:event.path||event.rawPath||null,email,resetPageUrl},ts:Date.now()})}).catch(()=>{});
  // #endregion
  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'E-mail é obrigatório' }) };
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const users = await fetchSupabaseUsersByEmail(normalizedEmail);
  // #region debug-point C:netlify-users-result
  fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"C",location:"netlify/functions/api-proxy.js:handleForgotPassword:users",msg:"[DEBUG] Consulta de usuario concluida no Netlify proxy",data:{normalizedEmail,userCount:Array.isArray(users)?users.length:null},ts:Date.now()})}).catch(()=>{});
  // #endregion
  let keycloakUser = null;
  if (hasKeycloakConfig()) {
    try {
      keycloakUser = await findKeycloakUserByEmail(normalizedEmail);
    } catch (keycloakError) {
      console.error('[Keycloak Forgot Password Error]', keycloakError.message);
    }
  }
  if ((!users || users.length === 0) && !keycloakUser) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Nenhuma conta foi encontrada para este e-mail.' }) };
  }
  const token = generateResetToken(normalizedEmail);
  const resetLink = buildResetLink(event, token, resetPageUrl);
  const usuario = users?.[0] || keycloakUser || { name: normalizedEmail.split('@')[0] };
  try {
    await sendResetEmail(normalizedEmail, usuario, resetLink);
    // #region debug-point C:netlify-email-sent
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"C",location:"netlify/functions/api-proxy.js:handleForgotPassword:sendResetEmail",msg:"[DEBUG] Envio de email concluido no Netlify proxy",data:{normalizedEmail},ts:Date.now()})}).catch(()=>{});
    // #endregion
    console.log(`E-mail de reset enviado para ${normalizedEmail}`);
  } catch (emailError) {
    // #region debug-point C:netlify-email-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"post-fix",hypothesisId:"C",location:"netlify/functions/api-proxy.js:handleForgotPassword:sendResetEmail:catch",msg:"[DEBUG] Envio de email falhou no Netlify proxy",data:{normalizedEmail,message:getBrevoErrorMessage(emailError)},ts:Date.now()})}).catch(()=>{});
    // #endregion
    console.error('[Email Error] Falha ao enviar e-mail:', getBrevoErrorMessage(emailError));
    const errorMessage = emailError?.message === 'BREVO_API_KEY não configurada'
      ? 'Serviço de e-mail não configurado. Defina BREVO_API_KEY no Netlify.'
      : emailError?.message === 'BREVO_SENDER_EMAIL não configurado'
        ? 'Remetente de e-mail não configurado. Defina BREVO_SENDER_EMAIL no Netlify com um endereço validado no Brevo.'
      : getBrevoErrorMessage(emailError);
    return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: errorMessage }) };
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Link de reset enviado com sucesso.', emailSent: true }) };
}

async function handleResetPassword(body) {
  const { token, password } = body || {};
  if (!token || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token e senha são obrigatórios' }) };
  }
  const resetData = verifyResetToken(token);
  if (!resetData) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Token inválido ou expirado' }) };
  }
  const updatedSupabaseUsers = await updateSupabasePassword(resetData.email, password);
  if (updatedSupabaseUsers === 0) {
    console.warn(`[Reset Password] Nenhum usuário Supabase atualizado para ${resetData.email}`);
  }
  let keycloakSync = { synced: false, reason: 'disabled' };
  if (hasKeycloakConfig()) {
    keycloakSync = await updateKeycloakPassword(resetData.email, password);
    if (keycloakSync.synced) {
      console.log(`Senha sincronizada no Keycloak para ${resetData.email}`);
    }
  }
  if (updatedSupabaseUsers === 0 && !keycloakSync.synced) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Nenhuma conta compatível foi encontrada para redefinir a senha' }) };
  }
  return { statusCode: 200, body: JSON.stringify({ message: 'Senha redefinida com sucesso' }) };
}

function parsePath(event) {
  const inputs = [
    event.path,
    event.rawPath,
    event.url,
    event.requestContext && event.requestContext.http && event.requestContext.http.path
  ].filter(Boolean);
  const rawPath = inputs[0] || '';

  const candidates = [rawPath];
  const fullUrl = event.rawUrl || (event.headers && (event.headers['x-forwarded-proto'] && event.headers.host ? `${event.headers['x-forwarded-proto']}://${event.headers.host}${rawPath}` : null));
  if (fullUrl) {
    try { candidates.push(new URL(fullUrl).pathname); } catch (_) {}
  }

  for (const p of candidates) {
    const apiPrefix = '/api/';
    if (p.startsWith(apiPrefix)) {
      return '/' + p.slice(apiPrefix.length);
    }
    const apiProxyPrefix = '/.netlify/functions/api-proxy/';
    if (p.startsWith(apiProxyPrefix)) {
      return '/' + p.slice(apiProxyPrefix.length);
    }
    const apiProxyIndex = p.indexOf('/.netlify/functions/api-proxy');
    if (apiProxyIndex !== -1) {
      const rest = p.slice(apiProxyIndex + '/.netlify/functions/api-proxy'.length);
      return rest.startsWith('/') ? rest : '/' + rest;
    }
    if (p.startsWith('/users') || p.startsWith('/register') || p.startsWith('/condominiums') || p.startsWith('/pagamento') || p.startsWith('/reserva') || p.startsWith('/plano') || p.startsWith('/forgot') || p.startsWith('/reset') || p.startsWith('/mercadopago') || p.startsWith('/user_condominiums') || p.startsWith('/esqueceu-senha')) {
      return p;
    }
  }

  return '/_unknown_' + rawPath;
}

function parseQuery(event) {
  if (event.queryStringParameters && typeof event.queryStringParameters === 'object' && Object.keys(event.queryStringParameters).length > 0) {
    return { ...event.queryStringParameters };
  }
  if (event.multiValueQueryStringParameters && typeof event.multiValueQueryStringParameters === 'object') {
    const flat = {};
    for (const k of Object.keys(event.multiValueQueryStringParameters)) {
      const v = event.multiValueQueryStringParameters[k];
      flat[k] = Array.isArray(v) ? v[0] : v;
    }
    if (Object.keys(flat).length > 0) return flat;
  }
  const candidates = [event.rawUrl, event.url];
  if (event.headers && event.headers.host && (event.headers['x-forwarded-proto'] || event.headers.referer)) {
    const proto = event.headers['x-forwarded-proto'] || 'https';
    candidates.push(`${proto}://${event.headers.host}${event.path || ''}`);
  }
  for (const u of candidates) {
    if (!u) continue;
    try {
      const url = new URL(u);
      const params = {};
      url.searchParams.forEach((value, key) => { params[key] = value; });
      if (Object.keys(params).length > 0) return params;
    } catch (_) {}
  }
  return {};
}

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  const rawMethod = (event.httpMethod || 'GET').toUpperCase();
  const pathname = parsePath(event);
  const query = parseQuery(event);
  let body = null;
  if (event.body) {
    try {
      const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch (e) {
      body = null;
    }
  }

  try {
    console.log('[api-proxy] method=', rawMethod, 'pathname=', pathname, 'query=', JSON.stringify(query));
    if (pathname === '/esqueceu-senha' || pathname === '/forgot-password') {
      // #region debug-point C:netlify-route-match
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"C",location:"netlify/functions/api-proxy.js:handler:route-match",msg:"[DEBUG] Rota de recuperacao atingida no Netlify proxy",data:{pathname,rawMethod,query,hasBody:Boolean(body)},ts:Date.now()})}).catch(()=>{});
      // #endregion
    }
    if (pathname === '/register' && rawMethod === 'POST') {
      const result = await proxySupabaseRequest(body, '/users', 'POST');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/condominiums' && rawMethod === 'POST') {
      const result = await proxySupabaseRequest(body, '/condominiums', 'POST');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/users' && rawMethod === 'GET') {
      const email = query.email;
      if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parâmetro email é obrigatório' }) };
      }
      const result = await proxySupabaseRequest(null, `/users?select=*&email=eq.${encodeURIComponent(email)}`, 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/users' && rawMethod === 'PATCH') {
      const email = query.email;
      if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parâmetro email é obrigatório' }) };
      }
      const result = await proxySupabaseRequest(body, `/users?email=eq.${encodeURIComponent(email)}`, 'PATCH');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/condominiums' && rawMethod === 'GET') {
      const queryCopy = { ...query };
      delete queryCopy.select;
      const queryString = new URLSearchParams(queryCopy).toString();
      const pathSuffix = queryString ? `/condominiums?select=*&${queryString}` : '/condominiums?select=*';
      const result = await proxySupabaseRequest(null, pathSuffix, 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/user_condominiums' && rawMethod === 'GET') {
      const queryCopy = { ...query };
      delete queryCopy.select;
      const queryString = new URLSearchParams(queryCopy).toString();
      const pathSuffix = queryString ? `/user_condominiums?select=*&${queryString}` : '/user_condominiums?select=*';
      const result = await proxySupabaseRequest(null, pathSuffix, 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/user_condominiums' && rawMethod === 'POST') {
      const result = await proxySupabaseRequest(body, '/user_condominiums', 'POST');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/mercadopago/preference' && rawMethod === 'POST') {
      const mpResult = await createMercadoPagoPreference(body || {});
      return { statusCode: 200, headers, body: JSON.stringify(mpResult) };
    }

    if (pathname === '/mercadopago/payment-status' && rawMethod === 'POST') {
      const mpStatusResult = await getMercadoPagoPaymentStatus(body || {});
      return { statusCode: mpStatusResult.statusCode, headers, body: mpStatusResult.body };
    }

    if (pathname === '/plano' && rawMethod === 'GET') {
      const result = await proxySupabaseRequest(null, '/plano?select=*', 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/pagamento' && rawMethod === 'GET') {
      const email = query.email;
      const cep = query.cep;
      let pathSuffix = '/pagamento?select=*';
      if (email) pathSuffix += `&email=eq.${encodeURIComponent(email)}`;
      if (cep) pathSuffix += `&cep=eq.${encodeURIComponent(cep)}`;
      const result = await proxySupabaseRequest(null, pathSuffix, 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/pagamento' && rawMethod === 'POST') {
      const result = await proxySupabaseRequest(body, '/pagamento', 'POST');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/pagamento' && rawMethod === 'PATCH') {
      const id = query.id;
      if (!id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parâmetro id é obrigatório' }) };
      }
      const result = await proxySupabaseRequest(body, `/pagamento?id=eq.${encodeURIComponent(id)}`, 'PATCH');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/reserva' && rawMethod === 'GET') {
      const nome_local = query.nome_local;
      const data_reserva = query.data_reserva;
      let pathSuffix = '/reserva?select=*';
      if (nome_local) pathSuffix += `&nome_local=eq.${encodeURIComponent(nome_local)}`;
      if (data_reserva) pathSuffix += `&data_reserva=eq.${encodeURIComponent(data_reserva)}`;
      const result = await proxySupabaseRequest(null, pathSuffix, 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/reserva' && rawMethod === 'POST') {
      const result = await proxySupabaseRequest(body, '/reserva', 'POST');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if ((pathname === '/forgot-password' || pathname === '/esqueceu-senha') && rawMethod === 'POST') {
      return await handleForgotPassword(event, body);
    }

    if (pathname === '/reset-password' && rawMethod === 'POST') {
      return await handleResetPassword(body);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Endpoint não encontrado', debug: { pathname, rawPath: event.path, rawPath2: event.rawPath, method: rawMethod, query } })
    };
  } catch (error) {
    // #region debug-point C:netlify-handler-error
    fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"C",location:"netlify/functions/api-proxy.js:handler:catch",msg:"[DEBUG] Handler principal do Netlify proxy falhou",data:{message:error?.message||String(error),stack:error?.stack||null},ts:Date.now()})}).catch(()=>{});
    // #endregion
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Erro interno do servidor' })
    };
  }
};
