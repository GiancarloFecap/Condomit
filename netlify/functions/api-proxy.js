const crypto = require('crypto');
const { Brevo, BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxNTA2NCwiZXhwIjoyMDk1OTkxMDY0fQ.wi0H-LHiBiMm3_WPXw1lslRnhAw3atf_BGUZCp2PdNA';
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'TEST-436110510599548-061020-84789bd457ac44b96a90600d82aceed2-3165703884';
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

const mpClient = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN });
const preference = new Preference(mpClient);
const brevoClient = BREVO_API_KEY ? new BrevoClient({
  apiKey: BREVO_API_KEY,
  environment: BrevoEnvironment.Production
}) : null;

const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY;
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const MERCADO_PAGO_API_BASE = 'https://api.mercadopago.com';
const SUPPORT_PAYMENT_MAILTO = 'mailto:contato.condomit@gmail.com?subject=Suporte%20Condomit%20-%20Pagamento';
const paymentConfirmationEmailAttempts = new Map();

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePlanName(planName) {
  const raw = String(planName || '').trim();
  const normalized = raw.toLowerCase();

  if (normalized.includes('essencial')) return 'Essencial';
  if (normalized.includes('premium')) return 'Premium';
  if (normalized.includes('pro')) return 'Pro';

  return raw || 'Plano Condomit';
}

function normalizePaymentStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();

  if (['approved', 'aprovado'].includes(normalized)) return 'aprovado';
  if (['pending', 'in_process', 'pendente', 'em_processo'].includes(normalized)) return 'pendente';
  if (['cancelled', 'canceled', 'cancelado'].includes(normalized)) return 'cancelado';
  if (['refunded', 'charged_back', 'estornado'].includes(normalized)) return 'estornado';
  if (['rejected', 'recusado', 'falhou', 'failure'].includes(normalized)) return 'recusado';

  return normalized || 'desconhecido';
}

function isApprovedPaymentStatus(status) {
  return normalizePaymentStatus(status) === 'aprovado';
}

function formatBrazilianDate(dateValue) {
  if (!dateValue) return '';

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  }).format(parsed);
}

function formatBrazilianCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'R$ 0,00';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(amount);
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

function buildPaymentConfirmationEmailHtml({ usuarioNome, nomePlano, dataPagamento, valorPago, loginUrl }) {
  const logoUrl = `${APP_BASE_URL}/assets/logo-full2.png`;

  const infoRows = [
    { icon: 'P', label: 'Plano', value: normalizePlanName(nomePlano) },
    { icon: 'OK', label: 'Status', value: 'Pagamento aprovado' },
    { icon: 'D', label: 'Data', value: dataPagamento },
    { icon: 'R$', label: 'Valor', value: valorPago }
  ].map((item, index, items) => `
    <tr>
      <td style="padding:${index === items.length - 1 ? '0' : '0 0 14px'};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td width="52" valign="middle" style="padding:0 16px 0 0;">
              <table role="presentation" width="36" height="36" cellspacing="0" cellpadding="0" border="0" style="width:36px;height:36px;border-radius:999px;background:#eff6ff;border:1px solid #bfdbfe;">
                <tr>
                  <td align="center" valign="middle" style="font-family:Arial,sans-serif;font-size:13px;font-weight:700;line-height:1;color:#2563eb;">
                    ${escapeHtml(item.icon)}
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1e3a8a;font-weight:700;padding:0 14px 0 0;">
              ${escapeHtml(item.label)}:
            </td>
            <td valign="middle" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2f5c;">
              ${escapeHtml(item.value)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

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
                            <strong>Olá, ${escapeHtml(usuarioNome)},</strong>
                          </p>
                          <p style="margin:0 0 10px;font-size:18px;line-height:1.75;color:#1f2f5c;">
                            Recebemos a confirmação do pagamento do seu plano na Condomit.
                          </p>
                          <p style="margin:0 0 34px;font-size:18px;line-height:1.75;color:#1f2f5c;">
                            Seu acesso foi ativado com sucesso e sua assinatura já está disponível para uso.
                          </p>
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 34px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;">
                            <tr>
                              <td style="padding:20px 22px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                  ${infoRows}
                                </table>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 42px;">
                            <tr>
                              <td align="center" bgcolor="#2563eb" style="border-radius:6px;">
                                <a href="${loginUrl}" style="display:inline-block;padding:17px 52px;font-family:Arial,sans-serif;font-size:18px;font-weight:400;line-height:1.2;color:#ffffff;text-decoration:none;background:#2563eb;border-radius:6px;">
                                  Acessar minha conta
                                </a>
                              </td>
                            </tr>
                          </table>
                          <div style="border-top:1px solid #d9d9d9;font-size:1px;line-height:1px;margin:0 0 34px;">&nbsp;</div>
                          <p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#1f2f5c;">
                            Precisa de ajuda?
                            <a href="${SUPPORT_PAYMENT_MAILTO}" style="color:#2563eb;text-decoration:none;">Entre em contato com nossa equipe de suporte</a>
                          </p>
                          <p style="margin:0 0 12px;font-size:16px;line-height:1.85;color:#1f2f5c;">
                            ou acesse nossa
                            <a href="${SUPPORT_PAYMENT_MAILTO}" style="color:#2563eb;text-decoration:none;">Central de Ajuda</a>.
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

async function sendPaymentConfirmationEmail(toEmail, usuario, paymentDetails) {
  if (!hasBrevoConfig()) {
    throw new Error('BREVO_API_KEY não configurada');
  }
  if (!BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_SENDER_EMAIL não configurado');
  }

  const usuarioNome = getDisplayName(usuario, toEmail);
  const loginUrl = `${APP_BASE_URL}/pages/entrar.html`;
  const info = await brevoClient.transactionalEmails.sendTransacEmail({
    sender: { name: 'Condomit', email: BREVO_SENDER_EMAIL },
    replyTo: { email: BREVO_SENDER_EMAIL },
    to: [{ email: toEmail }],
    subject: 'Pagamento confirmado — seu plano Condomit está ativo',
    htmlContent: buildPaymentConfirmationEmailHtml({
      usuarioNome,
      nomePlano: paymentDetails.planName,
      dataPagamento: formatBrazilianDate(paymentDetails.approvedAt),
      valorPago: formatBrazilianCurrency(paymentDetails.amount),
      loginUrl
    })
  });

  const messageId = info?.messageId || info?.body?.messageId;
  if (!messageId) {
    throw new Error('O Brevo não confirmou o recebimento do e-mail');
  }

  return { ...info, messageId };
}

async function sendPaymentConfirmationEmailOnce(transactionId, toEmail, usuario, paymentDetails) {
  const cacheKey = String(transactionId || '').trim();
  if (!cacheKey || !toEmail) {
    return { skipped: true, emailSent: false, emailError: 'Dados insuficientes para envio do e-mail' };
  }

  const cached = paymentConfirmationEmailAttempts.get(cacheKey);
  if (cached?.status === 'sent') {
    return { skipped: true, emailSent: true, messageId: cached.messageId || null };
  }
  if (cached?.status === 'pending' && cached.promise) {
    return cached.promise;
  }

  const promise = (async () => {
    try {
      const result = await sendPaymentConfirmationEmail(toEmail, usuario, paymentDetails);
      paymentConfirmationEmailAttempts.set(cacheKey, {
        status: 'sent',
        messageId: result?.messageId || null
      });
      return { skipped: false, emailSent: true, messageId: result?.messageId || null };
    } catch (error) {
      const emailError = getBrevoErrorMessage(error);
      paymentConfirmationEmailAttempts.set(cacheKey, {
        status: 'failed',
        emailError
      });
      return { skipped: false, emailSent: false, emailError };
    }
  })();

  paymentConfirmationEmailAttempts.set(cacheKey, {
    status: 'pending',
    promise
  });

  return promise;
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

async function fetchSupabaseUserRecordByEmail(email) {
  if (!email) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*&email=eq.${encodeURIComponent(email)}&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao consultar usuário para confirmação do pagamento');
  }

  const users = await response.json().catch(() => []);
  return Array.isArray(users) && users.length ? users[0] : null;
}

async function fetchSupabasePlanById(planId) {
  if (!planId) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/plano?select=*&id=eq.${encodeURIComponent(planId)}&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao consultar plano do pagamento');
  }

  const plans = await response.json().catch(() => []);
  return Array.isArray(plans) && plans.length ? plans[0] : null;
}

async function fetchSupabasePaymentById(paymentId) {
  if (!paymentId) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/pagamento?select=*&id=eq.${encodeURIComponent(paymentId)}&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao consultar pagamento pendente');
  }

  const payments = await response.json().catch(() => []);
  return Array.isArray(payments) && payments.length ? payments[0] : null;
}

async function fetchSupabasePaymentByTransactionCode(transactionCode) {
  if (!transactionCode) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/pagamento?select=*&codigo_transacao=eq.${encodeURIComponent(transactionCode)}&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao consultar transação já processada');
  }

  const payments = await response.json().catch(() => []);
  return Array.isArray(payments) && payments.length ? payments[0] : null;
}

async function fetchLatestSupabasePaymentByEmail(email) {
  if (!email) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/pagamento?select=*&email=eq.${encodeURIComponent(email)}&status_pagamento=neq.aprovado&order=data_pagamento.desc.nullslast&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao localizar pagamento pendente do usuário');
  }

  const payments = await response.json().catch(() => []);
  return Array.isArray(payments) && payments.length ? payments[0] : null;
}

async function patchSupabasePayment(paymentId, updates) {
  const result = await proxySupabaseRequest(updates, `/pagamento?id=eq.${encodeURIComponent(paymentId)}`, 'PATCH');
  if (result.status >= 400) {
    throw new Error('Falha ao atualizar status do pagamento');
  }
  return Array.isArray(result.data) && result.data.length ? result.data[0] : result.data;
}

async function patchSupabaseUserPlan(email, planId) {
  const result = await proxySupabaseRequest({ plan: planId }, `/users?email=eq.${encodeURIComponent(email)}`, 'PATCH');
  if (result.status >= 400) {
    throw new Error('Falha ao atualizar o plano do usuário');
  }
  return result.data;
}

async function fetchMercadoPagoPayment(paymentId) {
  const response = await fetch(`${MERCADO_PAGO_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || 'Falha ao consultar pagamento no Mercado Pago');
  }

  return payload;
}

function extractMercadoPagoPaymentId(query = {}, body = {}) {
  return (
    body?.data?.id ||
    body?.id ||
    body?.paymentId ||
    query['data.id'] ||
    query.id ||
    query.payment_id ||
    query.paymentId ||
    null
  );
}

async function processMercadoPagoPaymentConfirmation(paymentId) {
  if (!paymentId) {
    throw new Error('paymentId é obrigatório para confirmar o pagamento');
  }

  const mercadoPagoPayment = await fetchMercadoPagoPayment(paymentId);
  const paymentStatus = normalizePaymentStatus(mercadoPagoPayment.status);
  const transactionId = String(mercadoPagoPayment.id || paymentId);
  const approvedAt = mercadoPagoPayment.date_approved || mercadoPagoPayment.date_last_updated || mercadoPagoPayment.date_created || new Date().toISOString();
  const amount = Number(mercadoPagoPayment.transaction_amount || 0);
  const externalReference = mercadoPagoPayment.external_reference || mercadoPagoPayment.metadata?.pending_payment_id || null;
  const payerEmail = mercadoPagoPayment.payer?.email || mercadoPagoPayment.metadata?.payer_email || mercadoPagoPayment.metadata?.email || '';

  const existingProcessedPayment = await fetchSupabasePaymentByTransactionCode(transactionId);
  if (existingProcessedPayment && isApprovedPaymentStatus(existingProcessedPayment.status_pagamento)) {
    const processedPlan = await fetchSupabasePlanById(existingProcessedPayment.plano_id).catch(() => null);
    const existingUserEmail = existingProcessedPayment.email || payerEmail;
    const existingUserRecord = existingUserEmail ? await fetchSupabaseUserRecordByEmail(existingUserEmail).catch(() => null) : null;
    const existingEmailResult = existingUserEmail
      ? await sendPaymentConfirmationEmailOnce(
        transactionId,
        existingUserEmail,
        existingUserRecord || { name: existingUserEmail.split('@')[0] },
        {
          planName: normalizePlanName(processedPlan?.nome || mercadoPagoPayment.metadata?.plan_name || existingProcessedPayment.plano_id),
          approvedAt: existingProcessedPayment.data_pagamento || approvedAt,
          amount: existingProcessedPayment.valor_pago || amount
        }
      )
      : { skipped: true, emailSent: false, emailError: 'E-mail do usuário não encontrado' };

    return {
      approved: true,
      alreadyProcessed: true,
      paymentId: transactionId,
      paymentStatus,
      planId: existingProcessedPayment.plano_id || null,
      planName: normalizePlanName(processedPlan?.nome || mercadoPagoPayment.metadata?.plan_name || existingProcessedPayment.plano_id),
      approvedAtFormatted: formatBrazilianDate(existingProcessedPayment.data_pagamento || approvedAt),
      amountFormatted: formatBrazilianCurrency(existingProcessedPayment.valor_pago || amount),
      emailSent: existingEmailResult.emailSent,
      emailError: existingEmailResult.emailError || null
    };
  }

  let targetPayment = externalReference ? await fetchSupabasePaymentById(externalReference) : null;
  if (!targetPayment && payerEmail) {
    targetPayment = await fetchLatestSupabasePaymentByEmail(payerEmail);
  }

  if (!targetPayment) {
    throw new Error('Pagamento pendente não encontrado para a transação informada');
  }

  const planRecord = await fetchSupabasePlanById(targetPayment.plano_id).catch(() => null);
  const planName = normalizePlanName(planRecord?.nome || mercadoPagoPayment.metadata?.plan_name || targetPayment.plano_id);

  if (!isApprovedPaymentStatus(paymentStatus)) {
    return {
      approved: false,
      alreadyProcessed: false,
      paymentId: transactionId,
      paymentStatus,
      planId: targetPayment.plano_id || null,
      planName
    };
  }

  await patchSupabasePayment(targetPayment.id, {
    status_pagamento: 'aprovado',
    data_pagamento: approvedAt,
    valor_pago: amount || targetPayment.valor_pago,
    codigo_transacao: transactionId
  });

  const userEmail = targetPayment.email || payerEmail;
  const userRecord = await fetchSupabaseUserRecordByEmail(userEmail).catch(() => null);

  if (userEmail && targetPayment.plano_id) {
    await patchSupabaseUserPlan(userEmail, targetPayment.plano_id);
  }

  let emailSent = false;
  let emailError = null;

  if (userEmail) {
    const emailResult = await sendPaymentConfirmationEmailOnce(
      transactionId,
      userEmail,
      userRecord || { name: userEmail.split('@')[0] },
      {
        planName,
        approvedAt,
        amount: amount || targetPayment.valor_pago || targetPayment.valor_minimo || 0
      }
    );
    emailSent = emailResult.emailSent;
    emailError = emailResult.emailError || null;
    if (emailError) {
      console.error(`[Payment Confirmation Email Error] paymentId=${transactionId}`, emailError);
    }
  }

  return {
    approved: true,
    alreadyProcessed: false,
    paymentId: transactionId,
    paymentStatus,
    planId: targetPayment.plano_id || null,
    planName,
    approvedAtFormatted: formatBrazilianDate(approvedAt),
    amountFormatted: formatBrazilianCurrency(amount || targetPayment.valor_pago || targetPayment.valor_minimo || 0),
    emailSent,
    emailError
  };
}

async function createMercadoPagoPreference(data, event) {
  const { amount, planName, payerEmail, pendingPaymentId } = data;
  const isSandboxToken = /^TEST-/i.test(String(MERCADO_PAGO_ACCESS_TOKEN || '').trim());

  const headers = event.headers || {};
  const protocol = headers['x-forwarded-proto'] || 'https';
  const host = headers['x-forwarded-host'] || headers.host || APP_BASE_URL.replace('https://', '').replace('http://', '');
  const baseUrl = APP_BASE_URL || `${protocol}://${host}`;

  const successUrl = `${baseUrl}/pages/pagamento-sucesso.html`;
  const pendingUrl = `${baseUrl}/pages/pagamento-pendente.html`;
  const failureUrl = `${baseUrl}/pages/pagamento-falha.html`;
  const webhookUrl = `${baseUrl}/api/mercadopago/webhook`;

  const preferenceData = {
    items: [
      {
        title: `Plano ${planName} - Condomit`,
        unit_price: parseFloat(amount),
        quantity: 1,
        currency_id: 'BRL'
      }
    ],
    back_urls: {
      success: successUrl,
      pending: pendingUrl,
      failure: failureUrl
    },
    auto_return: 'approved',
    notification_url: webhookUrl,
    external_reference: pendingPaymentId ? String(pendingPaymentId) : undefined,
    metadata: {
      pending_payment_id: pendingPaymentId ? String(pendingPaymentId) : '',
      payer_email: payerEmail,
      plan_name: normalizePlanName(planName)
    }
  };

  // Em sandbox, fixar o payer.email do Condomit costuma quebrar o fluxo
  // quando o pagamento é feito com contas de teste diferentes no Mercado Pago.
  if (!isSandboxToken && payerEmail) {
    preferenceData.payer = { email: payerEmail };
  }

  console.log('[MercadoPago Netlify] Creating preference for:', payerEmail, 'amount:', amount, 'plan:', planName, 'sandbox:', isSandboxToken);
  console.log('[MercadoPago Netlify] Back URLs:', { successUrl, pendingUrl, failureUrl });

  const result = await preference.create({ body: preferenceData });
  return { preferenceId: result.id, initPoint: result.init_point };
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

    if (pathname === '/users' && rawMethod === 'DELETE') {
      const email = query.email;
      if (!email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parâmetro email é obrigatório' }) };
      }
      const result = await proxySupabaseRequest(null, `/users?email=eq.${encodeURIComponent(email)}`, 'DELETE');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/condominiums' && rawMethod === 'DELETE') {
      const cep = query.cep;
      if (!cep) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Parâmetro cep é obrigatório' }) };
      }
      const result = await proxySupabaseRequest(null, `/condominiums?cep=eq.${encodeURIComponent(cep)}`, 'DELETE');
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
      const mpResult = await createMercadoPagoPreference(body || {}, event);
      return { statusCode: 200, headers, body: JSON.stringify(mpResult) };
    }

    if (pathname === '/mercadopago/confirm' && rawMethod === 'POST') {
      const paymentId = body?.paymentId || body?.payment_id || query.paymentId || query.payment_id;
      const result = await processMercadoPagoPaymentConfirmation(paymentId);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    if (pathname === '/mercadopago/webhook' && (rawMethod === 'POST' || rawMethod === 'GET')) {
      const paymentId = extractMercadoPagoPaymentId(query, body || {});
      if (!paymentId) {
        return { statusCode: 200, headers, body: JSON.stringify({ received: true, ignored: true }) };
      }

      const result = await processMercadoPagoPaymentConfirmation(paymentId);
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, paymentId, approved: result.approved, alreadyProcessed: result.alreadyProcessed }) };
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
