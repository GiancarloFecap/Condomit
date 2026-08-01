process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { Brevo, BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');

const root = process.cwd();
const port = process.env.PORT ? Number(process.env.PORT) : 8081;

const env = loadEnv(path.join(root, '.env'));
const SUPABASE_URL = env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';
const MERCADO_PAGO_ACCESS_TOKEN = env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || 'APP_USR-2991875109649887-061020-07b3ac464f9a25e0272cd8ba40bf2321-3466462896';
const APP_BASE_URL = env.APP_BASE_URL || 'https://condomit.netlify.app';
const BREVO_API_KEY = env.BREVO_API_KEY || process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = env.BREVO_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || '';
const KEYCLOAK_BASE_URL = (env.KEYCLOAK_BASE_URL || env.KEYCLOAK_URL || '').replace(/\/$/, '');
const KEYCLOAK_REALM = env.KEYCLOAK_REALM || '';
const KEYCLOAK_ADMIN_REALM = env.KEYCLOAK_ADMIN_REALM || 'master';
const KEYCLOAK_CLIENT_ID = env.KEYCLOAK_CLIENT_ID || '';
const KEYCLOAK_CLIENT_SECRET = env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_ADMIN_USERNAME = env.KEYCLOAK_ADMIN_USERNAME || '';
const KEYCLOAK_ADMIN_PASSWORD = env.KEYCLOAK_ADMIN_PASSWORD || '';
const MERCADO_PAGO_IS_TEST_MODE = /^TEST-/i.test(String(MERCADO_PAGO_ACCESS_TOKEN || '').trim());

const brevoClient = BREVO_API_KEY ? new BrevoClient({
  apiKey: BREVO_API_KEY,
  environment: BrevoEnvironment.Production
}) : null;

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

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

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    env[key] = rest.join('=').trim();
  });

  return env;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/' || pathname === '/pages') {
        pathname = '/inicio.html';
    }

    if (pathname === '/api/register' && req.method === 'POST') {
        return proxySupabaseRequest(req, res, '/users', 'POST');
    }

    if (pathname === '/api/condominiums' && req.method === 'POST') {
        return proxySupabaseRequest(req, res, '/condominiums', 'POST');
    }

    if (pathname === '/api/users' && req.method === 'GET') {
        const email = parsedUrl.query.email;
        if (!email) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parâmetro email é obrigatório' }));
            return;
        }
        return proxySupabaseRequest(req, res, `/users?select=*&email=eq.${encodeURIComponent(email)}`, 'GET');
    }

    if (pathname === '/api/users' && req.method === 'PATCH') {
        const email = parsedUrl.query.email;
        if (!email) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parâmetro email é obrigatório' }));
            return;
        }
        return proxySupabaseRequest(req, res, `/users?email=eq.${encodeURIComponent(email)}`, 'PATCH');
    }

    if (pathname === '/api/condominiums' && req.method === 'GET') {
        const query = { ...parsedUrl.query };
        delete query.select;
        const queryString = new URLSearchParams(query).toString();
        const pathSuffix = queryString ? `/condominiums?select=*&${queryString}` : '/condominiums?select=*';
        return proxySupabaseRequest(req, res, pathSuffix, 'GET');
    }

    if (pathname === '/api/user_condominiums' && req.method === 'GET') {
        const query = { ...parsedUrl.query };
        delete query.select;
        const queryString = new URLSearchParams(query).toString();
        const pathSuffix = queryString ? `/user_condominiums?select=*&${queryString}` : '/user_condominiums?select=*';
        return proxySupabaseRequest(req, res, pathSuffix, 'GET');
    }

    if (pathname === '/api/user_condominiums' && req.method === 'POST') {
        return proxySupabaseRequest(req, res, '/user_condominiums', 'POST');
    }

    if (pathname === '/api/mercadopago/preference' && req.method === 'POST') {
        return createMercadoPagoPreference(req, res);
    }

    if (pathname === '/api/mercadopago/payment-status' && req.method === 'POST') {
        return getMercadoPagoPaymentStatus(req, res);
    }

    // ENDPOINT: GET /api/plano - Fetch all plans
    if (pathname === '/api/plano' && req.method === 'GET') {
        return proxySupabaseRequest(req, res, '/plano?select=*', 'GET');
    }

    // ENDPOINT: GET /api/pagamento - Fetch payments (by email or cep)
    if (pathname === '/api/pagamento' && req.method === 'GET') {
        const email = parsedUrl.query.email;
        const cep = parsedUrl.query.cep;
        let pathSuffix = '/pagamento?select=*';
        if (email) {
            pathSuffix += `&email=eq.${encodeURIComponent(email)}`;
        }
        if (cep) {
            pathSuffix += `&cep=eq.${encodeURIComponent(cep)}`;
        }
        return proxySupabaseRequest(req, res, pathSuffix, 'GET');
    }

    // ENDPOINT: POST /api/pagamento - Create new payment
    if (pathname === '/api/pagamento' && req.method === 'POST') {
        return proxySupabaseRequest(req, res, '/pagamento', 'POST');
    }


    // ENDPOINT: GET /api/reserva - Fetch all reservations or by local/date
    if (pathname === '/api/reserva' && req.method === 'GET') {
        const nome_local = parsedUrl.query.nome_local;
        const data_reserva = parsedUrl.query.data_reserva;
        let pathSuffix = '/reserva?select=*';
        if (nome_local) {
            pathSuffix += `&nome_local=eq.${encodeURIComponent(nome_local)}`;
        }
        if (data_reserva) {
            pathSuffix += `&data_reserva=eq.${encodeURIComponent(data_reserva)}`;
        }
        return proxySupabaseRequest(req, res, pathSuffix, 'GET');
    }

    // ENDPOINT: POST /api/reserva - Create new reservation
    if (pathname === '/api/reserva' && req.method === 'POST') {
        return proxySupabaseRequest(req, res, '/reserva', 'POST');
    }

    // ENDPOINT: POST /api/forgot-password or /esqueceu-senha - Request password reset
    if ((pathname === '/api/forgot-password' || pathname === '/esqueceu-senha') && req.method === 'POST') {
        // #region debug-point B:server-route-match
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"B",location:"scripts/server.js:route:/esqueceu-senha",msg:"[DEBUG] Rota de recuperacao atingida no servidor local",data:{pathname,method:req.method},ts:Date.now()})}).catch(()=>{});
        // #endregion
        return handleForgotPassword(req, res);
    }

    // ENDPOINT: POST /api/reset-password - Reset password
    if (pathname === '/api/reset-password' && req.method === 'POST') {
        return handleResetPassword(req, res);
    }
    // ENDPOINT: PATCH /api/pagamento - Update payment status (by id)
    if (pathname === '/api/pagamento' && req.method === 'PATCH') {
        const id = parsedUrl.query.id;
        if (!id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parâmetro id é obrigatório' }));
            return;
        }
        return proxySupabaseRequest(req, res, `/pagamento?id=eq.${encodeURIComponent(id)}`, 'PATCH');

    }

  let filePath = path.join(root, pathname);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      // Fallback to /pages/<file> for HTML requests like /entrar.html
      if (pathname.endsWith('.html') && !pathname.startsWith('/pages/')) {
        const fallbackPath = path.join(root, 'pages', path.basename(pathname));
        if (fallbackPath.startsWith(root)) {
          fs.stat(fallbackPath, (fallbackErr, fallbackStats) => {
            if (!fallbackErr && fallbackStats.isFile()) {
              serveFile(fallbackPath, res);
              return;
            }
            res.writeHead(404);
            res.end('Arquivo não encontrado');
          });
          return;
        }
      }

      res.writeHead(404);
      res.end('Arquivo não encontrado');
      return;
    }

    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.readFile(indexPath, (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end('Índice não encontrado');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }

    serveFile(filePath, res);
  });
});

function serveFile(filePath, res) {
  fs.readFile(filePath, (err2, data2) => {
    if (err2) {
      res.writeHead(500);
      res.end('Erro interno no servidor');
      return;
    }

    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(data2);
  });
}

function proxySupabaseRequest(req, res, pathSuffix, method) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1${pathSuffix}`, {
        method,
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: body || undefined
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        data = text;
      }

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message || 'Erro interno no servidor' }));
    }
  });
}

async function createMercadoPagoPreference(req, res) {
  try {
    const data = await readJsonBody(req);
    const { amount, planName, payerEmail, planId } = data || {};
    const normalizedAmount = parseMercadoPagoAmount(amount);

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new Error('Valor do plano inválido para gerar o pagamento');
    }

    const origin = getRequestOrigin(req);
    const base = APP_BASE_URL || origin;
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
      payer: !MERCADO_PAGO_IS_TEST_MODE && payerEmail ? { email: payerEmail } : undefined,
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
    const initPoint = MERCADO_PAGO_IS_TEST_MODE
      ? (created?.sandbox_init_point || created?.init_point)
      : (created?.init_point || created?.sandbox_init_point);
    if (!initPoint) {
      throw new Error(created?.message || 'Link de pagamento não retornado');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      preferenceId: created.id,
      initPoint,
      testMode: MERCADO_PAGO_IS_TEST_MODE
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Erro ao criar preferência' }));
  }
}

async function getMercadoPagoPaymentStatus(req, res) {
  try {
    const data = await readJsonBody(req);
    const paymentId = data?.paymentId;

    if (!paymentId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'paymentId é obrigatório' }));
      return;
    }

    const payment = await mpFetchPayment(paymentId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: payment?.id,
      status: payment?.status,
      status_detail: payment?.status_detail,
      transaction_amount: payment?.transaction_amount,
      external_reference: payment?.external_reference
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Erro ao consultar pagamento no Mercado Pago' }));
  }
}

process.on('uncaughtException', (err) => {
  console.error('ERRO NÃO TRATADO:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('REJEIÇÃO NÃO TRATADA:', reason);
});

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

function getRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = forwardedProto || 'http';
  const host = forwardedHost || req.headers.host || `localhost:${port}`;
  return `${protocol}://${host}`;
}

function getResetPageUrl(req, providedResetPageUrl) {
  const fallbackBase = APP_BASE_URL || getRequestOrigin(req);

  try {
    return new URL(providedResetPageUrl || '/pages/redefinir-senha.html', fallbackBase).toString();
  } catch (error) {
    return new URL('/pages/redefinir-senha.html', fallbackBase).toString();
  }
}

function buildResetLink(req, token, providedResetPageUrl) {
  const resetUrl = new URL(getResetPageUrl(req, providedResetPageUrl));
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
  console.log('========================================');
  console.log('📧 INICIANDO ENVIO DO E-MAIL DE RESET');
  console.log('========================================');
  console.log('Destinatário:', toEmail);
  console.log('Link de reset:', resetLink);
  console.log('');

  if (!hasBrevoConfig()) {
    throw new Error('BREVO_API_KEY nao configurada');
  }
  if (!BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_SENDER_EMAIL nao configurado');
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
    throw new Error('O Brevo nao confirmou o recebimento do e-mail');
  }

  console.log('');
  console.log('✅ E-MAIL REGISTRADO COM SUCESSO!');
  console.log('----------------------------------------');
  console.log('📨 E-mail enviado usando Brevo.');

  console.log('🔗 Link de reset:');
  console.log(resetLink);
  console.log('========================================');
  
  return info;
}

async function fetchSupabaseUsersByEmail(email) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=email,name&email=eq.${encodeURIComponent(email)}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao consultar usuários no Supabase');
  }

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

  if (!updateResponse.ok) {
    throw new Error('Falha ao atualizar senha no Supabase');
  }

  const updatedUsers = await updateResponse.json().catch(() => []);
  return Array.isArray(updatedUsers) ? updatedUsers.length : 0;
}

async function getKeycloakAdminToken() {
  if (!hasKeycloakConfig()) {
    return null;
  }

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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Falha ao autenticar no Keycloak');
  }

  return payload.access_token;
}

async function findKeycloakUserByEmail(email) {
  if (!hasKeycloakConfig()) {
    return null;
  }

  const accessToken = await getKeycloakAdminToken();
  const response = await fetch(`${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users?email=${encodeURIComponent(email)}&exact=true`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const users = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error('Falha ao consultar usuário no Keycloak');
  }

  return Array.isArray(users) && users.length ? users[0] : null;
}

async function updateKeycloakPassword(email, password) {
  if (!hasKeycloakConfig()) {
    return { synced: false, reason: 'disabled' };
  }

  const user = await findKeycloakUserByEmail(email);
  if (!user?.id) {
    return { synced: false, reason: 'not-found' };
  }

  const accessToken = await getKeycloakAdminToken();
  const response = await fetch(`${KEYCLOAK_BASE_URL}/admin/realms/${KEYCLOAK_REALM}/users/${user.id}/reset-password`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type: 'password',
      temporary: false,
      value: password
    })
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || 'Falha ao atualizar senha no Keycloak');
  }

  return { synced: true };
}

function handleForgotPassword(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { email, resetPageUrl } = JSON.parse(body || '{}');
      // #region debug-point D:server-handler-start
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"D",location:"scripts/server.js:handleForgotPassword:start",msg:"[DEBUG] Handler de recuperacao iniciou",data:{email,resetPageUrl},ts:Date.now()})}).catch(()=>{});
      // #endregion
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'E-mail é obrigatório' }));
        return;
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const users = await fetchSupabaseUsersByEmail(normalizedEmail);
      // #region debug-point D:server-users-result
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"D",location:"scripts/server.js:handleForgotPassword:users",msg:"[DEBUG] Consulta de usuario concluida no servidor local",data:{normalizedEmail,userCount:Array.isArray(users)?users.length:null},ts:Date.now()})}).catch(()=>{});
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
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Nenhuma conta foi encontrada para este e-mail.' }));
        return;
      }

      const token = generateResetToken(normalizedEmail);
      const resetLink = buildResetLink(req, token, resetPageUrl);
      const usuario = users?.[0] || keycloakUser || { nome: normalizedEmail.split('@')[0] };
      
      console.log(`🔗 Link de redefinição para ${normalizedEmail}: ${resetLink}`);
      
      try {
        await sendResetEmail(normalizedEmail, usuario, resetLink);
        // #region debug-point B:server-email-sent
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"B",location:"scripts/server.js:handleForgotPassword:sendResetEmail",msg:"[DEBUG] Envio de email concluido no servidor local",data:{normalizedEmail},ts:Date.now()})}).catch(()=>{});
        // #endregion
        console.log(`📧 E-mail de reset enviado para ${normalizedEmail}`);
      } catch (emailError) {
        // #region debug-point B:server-email-error
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"post-fix",hypothesisId:"B",location:"scripts/server.js:handleForgotPassword:sendResetEmail:catch",msg:"[DEBUG] Envio de email falhou no servidor local",data:{normalizedEmail,message:getBrevoErrorMessage(emailError)},ts:Date.now()})}).catch(()=>{});
        // #endregion
        console.error('[Email Error] Falha ao enviar e-mail:', getBrevoErrorMessage(emailError));
        res.writeHead(502, { 'Content-Type': 'application/json' });
        const errorMessage = emailError?.message === 'BREVO_API_KEY nao configurada'
          ? 'Servico de e-mail nao configurado. Defina BREVO_API_KEY no ambiente local.'
          : emailError?.message === 'BREVO_SENDER_EMAIL nao configurado'
            ? 'Remetente de e-mail nao configurado. Defina BREVO_SENDER_EMAIL no ambiente local com um endereco validado no Brevo.'
          : getBrevoErrorMessage(emailError);
        res.end(JSON.stringify({ error: errorMessage }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Link de reset enviado com sucesso.',
        emailSent: true
      }));
    } catch (error) {
      // #region debug-point D:server-handler-error
      fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"D",location:"scripts/server.js:handleForgotPassword:catch",msg:"[DEBUG] Handler de recuperacao falhou no servidor local",data:{message:error?.message||String(error),stack:error?.stack||null},ts:Date.now()})}).catch(()=>{});
      // #endregion
      console.error('[Forgot Password Error]', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
    }
  });
}

function handleResetPassword(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { token, password } = JSON.parse(body || '{}');
      if (!token || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token e senha são obrigatórios' }));
        return;
      }

      const resetData = verifyResetToken(token);
      if (!resetData) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token inválido ou expirado' }));
        return;
      }

      const updatedSupabaseUsers = await updateSupabasePassword(resetData.email, password);
      if (updatedSupabaseUsers === 0) {
        console.warn(`[Reset Password] Nenhum usuário Supabase atualizado para ${resetData.email}`);
      }

      let keycloakSync = { synced: false, reason: 'disabled' };
      if (hasKeycloakConfig()) {
        keycloakSync = await updateKeycloakPassword(resetData.email, password);
        if (keycloakSync.synced) {
          console.log(`🔐 Senha sincronizada no Keycloak para ${resetData.email}`);
        } else {
          console.log(`ℹ️ Keycloak não sincronizado para ${resetData.email}: ${keycloakSync.reason}`);
        }
      }

      if (updatedSupabaseUsers === 0 && !keycloakSync.synced) {
        throw new Error('Nenhuma conta compatível foi encontrada para redefinir a senha');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Senha redefinida com sucesso' }));
    } catch (error) {
      console.error('[Reset Password Error]', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
    }
  });
}

server.listen(port, () => {
  console.log(`Servidor HTTP rodando em http://localhost:${port}`);
});
