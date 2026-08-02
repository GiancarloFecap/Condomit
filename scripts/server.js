process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { Brevo, BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const root = process.cwd();
const port = process.env.PORT ? Number(process.env.PORT) : 8081;

const env = loadEnv(path.join(root, '.env'));
const SUPABASE_URL = env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
const MERCADO_PAGO_ACCESS_TOKEN = env.MERCADO_PAGO_ACCESS_TOKEN || '';
const MERCADO_PAGO_WEBHOOK_SECRET = env.MERCADO_PAGO_WEBHOOK_SECRET || '';
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

const mpClient = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN });
const preference = new Preference(mpClient);
const brevoClient = BREVO_API_KEY ? new BrevoClient({
  apiKey: BREVO_API_KEY,
  environment: BrevoEnvironment.Production
}) : null;

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

    if (pathname === '/api/users' && req.method === 'DELETE') {
        const email = parsedUrl.query.email;
        if (!email) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parâmetro email é obrigatório' }));
            return;
        }
        return proxySupabaseRequest(req, res, `/users?email=eq.${encodeURIComponent(email)}`, 'DELETE');
    }

    if (pathname === '/api/condominiums' && req.method === 'DELETE') {
        const cep = parsedUrl.query.cep;
        if (!cep) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Parâmetro cep é obrigatório' }));
            return;
        }
        return proxySupabaseRequest(req, res, `/condominiums?cep=eq.${encodeURIComponent(cep)}`, 'DELETE');
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

    if (pathname === '/api/mercadopago/confirm' && req.method === 'POST') {
        return handleMercadoPagoConfirmation(req, res);
    }

    if (pathname === '/api/mercadopago/webhook' && (req.method === 'POST' || req.method === 'GET')) {
        return handleMercadoPagoWebhook(req, res, parsedUrl.query);
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

async function proxySupabasePayload(body, pathSuffix, method) {
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

async function createMercadoPagoPreference(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      ensureMercadoPagoConfig();
      const pendingPaymentId = data?.pendingPaymentId;
      const planId = data?.planId;

      if (!pendingPaymentId) {
        throw new Error('pendingPaymentId e obrigatorio para criar a preferencia');
      }

      const pendingPayment = await fetchSupabasePaymentById(pendingPaymentId);
      if (!pendingPayment) {
        throw new Error('Pagamento pendente nao encontrado');
      }

      const resolvedPlanId = planId || pendingPayment.plano_id;
      if (!resolvedPlanId) {
        throw new Error('planId e obrigatorio para criar a preferencia');
      }

      if (planId && String(planId) !== String(pendingPayment.plano_id)) {
        throw new Error('O plano informado nao corresponde ao pagamento pendente');
      }

      const planRecord = await fetchSupabasePlanById(resolvedPlanId);
      if (!planRecord) {
        throw new Error('Plano nao encontrado');
      }

      const amount = Number(planRecord.valor_minimo);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Valor do plano invalido');
      }

      const payerEmail = String(pendingPayment.email || '').trim().toLowerCase();
      if (!payerEmail) {
        throw new Error('E-mail do usuario nao encontrado para o pagamento');
      }

      const planName = normalizePlanName(planRecord.nome || pendingPayment.plano_id);

      const protocol = (req.headers['x-forwarded-proto'] || 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${port}`;
      const baseUrl = `${protocol}://${host}`;

      const successUrl = baseUrl + (baseUrl.includes('localhost') ? '/pages/pagamento-sucesso.html' : '/pages/pagamento-sucesso.html');
      const pendingUrl = baseUrl + (baseUrl.includes('localhost') ? '/pages/pagamento-pendente.html' : '/pages/pagamento-pendente.html');
      const failureUrl = baseUrl + (baseUrl.includes('localhost') ? '/pages/pagamento-falha.html' : '/pages/pagamento-falha.html');
      const webhookUrl = `${baseUrl}/api/mercadopago/webhook`;

      const preferenceData = {
        items: [
          {
            id: String(planRecord.id),
            title: `Plano ${planName} - Condomit`,
            description: planRecord.descricao || 'Plano Condomit',
            unit_price: amount,
            quantity: 1,
            currency_id: 'BRL'
          }
        ],
        payer: {
          email: payerEmail
        },
        back_urls: {
          success: successUrl,
          pending: pendingUrl,
          failure: failureUrl
        },
        auto_return: 'approved',
        notification_url: webhookUrl,
        external_reference: String(pendingPaymentId),
        metadata: {
          pending_payment_id: String(pendingPaymentId),
          payer_email: payerEmail,
          user_email: payerEmail,
          plan_id: String(planRecord.id),
          plan_name: planName
        }
      };

      console.log('[MercadoPago] Preferencia criada:', {
        payerEmail,
        amount,
        planId: planRecord.id,
        planName,
        successUrl,
        pendingUrl,
        failureUrl,
        webhookUrl
      });
      const result = await preference.create({ body: preferenceData });
      const checkoutUrl = result.sandbox_init_point || result.init_point || null;
      console.log('[MercadoPago] Resultado da preferencia:', {
        preferenceId: result.id,
        hasCheckoutUrl: Boolean(checkoutUrl)
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        preferenceId: result.id,
        checkoutUrl,
        initPoint: checkoutUrl,
        sandboxInitPoint: result.sandbox_init_point || null
      }));
    } catch (error) {
      console.error('[MercadoPago Error]', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

process.on('uncaughtException', (err) => {
  console.error('ERRO NÃO TRATADO:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('REJEIÇÃO NÃO TRATADA:', reason);
});

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
  if (['pending', 'in_process', 'authorized', 'pendente', 'em_processo'].includes(normalized)) return 'pendente';
  if (['cancelled', 'canceled', 'expired', 'cancelado'].includes(normalized)) return 'cancelado';
  if (['refunded', 'estornado'].includes(normalized)) return 'estornado';
  if (['charged_back', 'contestado'].includes(normalized)) return 'contestado';
  if (['rejected', 'recusado', 'falhou', 'failure'].includes(normalized)) return 'recusado';

  return normalized || 'desconhecido';
}

function isApprovedPaymentStatus(status) {
  return normalizePaymentStatus(status) === 'aprovado';
}

function ensureSupabaseAdminConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados');
  }
}

function ensureMercadoPagoConfig() {
  ensureSupabaseAdminConfig();
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error('MERCADO_PAGO_ACCESS_TOKEN precisa estar configurado');
  }
}

function parseMercadoPagoSignatureHeader(signatureHeader) {
  return String(signatureHeader || '')
    .split(',')
    .reduce((acc, part) => {
      const [key, ...value] = part.split('=');
      if (key && value.length) {
        acc[key.trim()] = value.join('=').trim();
      }
      return acc;
    }, {});
}

function validateMercadoPagoWebhookSignature(headers, paymentId) {
  if (!MERCADO_PAGO_WEBHOOK_SECRET) {
    return { valid: false, reason: 'missing_secret' };
  }

  const signatureHeader = headers['x-signature'] || headers['X-Signature'] || '';
  const requestId = headers['x-request-id'] || headers['X-Request-Id'] || '';

  if (!signatureHeader || !requestId || !paymentId) {
    return { valid: false, reason: 'missing_headers' };
  }

  const parsedHeader = parseMercadoPagoSignatureHeader(signatureHeader);
  const ts = parsedHeader.ts;
  const v1 = parsedHeader.v1;

  if (!ts || !v1) {
    return { valid: false, reason: 'invalid_signature_header', requestId };
  }

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  const provided = String(v1);
  const valid = provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  return {
    valid,
    reason: valid ? null : 'signature_mismatch',
    requestId
  };
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
    throw new Error('BREVO_API_KEY nao configurada');
  }
  if (!BREVO_SENDER_EMAIL) {
    throw new Error('BREVO_SENDER_EMAIL nao configurado');
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
    throw new Error('O Brevo nao confirmou o recebimento do e-mail');
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

async function fetchSupabaseUserRecordByEmail(email) {
  if (!email) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*&email=eq.${encodeURIComponent(email)}&limit=1`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Falha ao consultar usuario para confirmacao do pagamento');
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
    throw new Error('Falha ao consultar transacao ja processada');
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
    throw new Error('Falha ao localizar pagamento pendente do usuario');
  }

  const payments = await response.json().catch(() => []);
  return Array.isArray(payments) && payments.length ? payments[0] : null;
}

async function patchSupabasePayment(paymentId, updates) {
  const result = await proxySupabasePayload(updates, `/pagamento?id=eq.${encodeURIComponent(paymentId)}`, 'PATCH');
  if (result.status >= 400) {
    throw new Error('Falha ao atualizar status do pagamento');
  }
  return Array.isArray(result.data) && result.data.length ? result.data[0] : result.data;
}

async function patchSupabaseUserPlan(email, planId) {
  const result = await proxySupabasePayload({ plan: planId }, `/users?email=eq.${encodeURIComponent(email)}`, 'PATCH');
  if (result.status >= 400) {
    throw new Error('Falha ao atualizar o plano do usuario');
  }
  return result.data;
}

async function fetchMercadoPagoPayment(paymentId) {
  ensureMercadoPagoConfig();
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
    throw new Error('paymentId e obrigatorio para confirmar o pagamento');
  }

  const mercadoPagoPayment = await fetchMercadoPagoPayment(paymentId);
  const rawPaymentStatus = String(mercadoPagoPayment.status || '').trim().toLowerCase();
  const paymentStatus = normalizePaymentStatus(rawPaymentStatus);
  const transactionId = String(mercadoPagoPayment.id || paymentId);
  const approvedAt = mercadoPagoPayment.date_approved || mercadoPagoPayment.date_last_updated || mercadoPagoPayment.date_created || new Date().toISOString();
  const amount = Number(mercadoPagoPayment.transaction_amount || 0);
  const externalReference = mercadoPagoPayment.external_reference || mercadoPagoPayment.metadata?.pending_payment_id || null;
  const payerEmail = mercadoPagoPayment.payer?.email || mercadoPagoPayment.metadata?.payer_email || mercadoPagoPayment.metadata?.email || '';

  const existingProcessedPayment = await fetchSupabasePaymentByTransactionCode(transactionId);
  console.log('[MercadoPago] Pagamento consultado:', {
    id: mercadoPagoPayment.id,
    status: mercadoPagoPayment.status,
    statusDetail: mercadoPagoPayment.status_detail,
    externalReference: mercadoPagoPayment.external_reference,
    paymentMethodId: mercadoPagoPayment.payment_method_id,
    paymentTypeId: mercadoPagoPayment.payment_type_id,
    dateCreated: mercadoPagoPayment.date_created,
    dateLastUpdated: mercadoPagoPayment.date_last_updated,
    liveMode: mercadoPagoPayment.live_mode
  });

  if (existingProcessedPayment && isApprovedPaymentStatus(existingProcessedPayment.status_pagamento) && rawPaymentStatus === 'approved') {
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
  if (!targetPayment && existingProcessedPayment) {
    targetPayment = existingProcessedPayment;
  }
  if (!targetPayment && payerEmail) {
    targetPayment = await fetchLatestSupabasePaymentByEmail(payerEmail);
  }

  if (!targetPayment) {
    throw new Error('Pagamento pendente nao encontrado para a transacao informada');
  }

  const planRecord = await fetchSupabasePlanById(targetPayment.plano_id).catch(() => null);
  const planName = normalizePlanName(planRecord?.nome || mercadoPagoPayment.metadata?.plan_name || targetPayment.plano_id);
  const expectedAmount = Number(planRecord?.valor_minimo);
  const userEmail = targetPayment.email || payerEmail;
  const userRecord = userEmail ? await fetchSupabaseUserRecordByEmail(userEmail).catch(() => null) : null;
  const paymentTimestamp = mercadoPagoPayment.date_last_updated || mercadoPagoPayment.date_created || approvedAt;

  switch (rawPaymentStatus) {
    case 'approved': {
      if (Number.isFinite(expectedAmount) && expectedAmount > 0 && Math.abs(amount - expectedAmount) > 0.01) {
        await patchSupabasePayment(targetPayment.id, {
          status_pagamento: 'recusado',
          data_pagamento: paymentTimestamp,
          valor_pago: amount || targetPayment.valor_pago,
          codigo_transacao: transactionId
        });
        throw new Error('O valor aprovado nao corresponde ao valor oficial do plano');
      }

      await patchSupabasePayment(targetPayment.id, {
        status_pagamento: 'aprovado',
        data_pagamento: approvedAt,
        valor_pago: amount || targetPayment.valor_pago,
        codigo_transacao: transactionId
      });

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

      console.log('[MercadoPago] Pagamento atualizado:', {
        paymentId: transactionId,
        status: rawPaymentStatus,
        planActivated: true
      });

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
    case 'pending':
    case 'in_process':
    case 'authorized':
    case 'rejected':
    case 'cancelled':
    case 'canceled':
    case 'expired':
    case 'refunded':
    case 'charged_back':
      await patchSupabasePayment(targetPayment.id, {
        status_pagamento: paymentStatus,
        data_pagamento: paymentTimestamp,
        valor_pago: amount || targetPayment.valor_pago,
        codigo_transacao: transactionId
      });
      console.log('[MercadoPago] Pagamento atualizado:', {
        paymentId: transactionId,
        status: rawPaymentStatus,
        planActivated: false
      });
      return {
        approved: false,
        alreadyProcessed: false,
        paymentId: transactionId,
        paymentStatus,
        planId: targetPayment.plano_id || null,
        planName
      };
    default:
      await patchSupabasePayment(targetPayment.id, {
        status_pagamento: paymentStatus,
        data_pagamento: paymentTimestamp,
        valor_pago: amount || targetPayment.valor_pago,
        codigo_transacao: transactionId
      });
      console.log('[MercadoPago] Pagamento atualizado:', {
        paymentId: transactionId,
        status: rawPaymentStatus || 'unknown',
        planActivated: false
      });
      return {
        approved: false,
        alreadyProcessed: false,
        paymentId: transactionId,
        paymentStatus,
        planId: targetPayment.plano_id || null,
        planName
      };
  }
}

function handleMercadoPagoConfirmation(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const paymentId = payload.paymentId || payload.payment_id || null;
      const result = await processMercadoPagoPaymentConfirmation(paymentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message || 'Erro ao confirmar pagamento' }));
    }
  });
}

function handleMercadoPagoWebhook(req, res, query = {}) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Webhook do Mercado Pago está ativo.'
    }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const paymentId = extractMercadoPagoPaymentId(query, payload);
      if (!paymentId) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true, ignored: true }));
        return;
      }

      const signatureValidation = validateMercadoPagoWebhookSignature(req.headers || {}, paymentId);
      console.log('[MercadoPago] Webhook recebido:', {
        type: payload?.type || null,
        action: payload?.action || null,
        paymentId,
        requestId: signatureValidation.requestId || req.headers?.['x-request-id'] || null,
        liveMode: payload?.live_mode ?? null
      });

      if (!signatureValidation.valid) {
        const errorMessage = signatureValidation.reason === 'missing_secret'
          ? 'MERCADO_PAGO_WEBHOOK_SECRET nao configurado'
          : 'Assinatura do webhook do Mercado Pago invalida';
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: false, error: errorMessage }));
        return;
      }

      const result = await processMercadoPagoPaymentConfirmation(paymentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, paymentId, approved: result.approved, alreadyProcessed: result.alreadyProcessed }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message || 'Erro ao processar webhook' }));
    }
  });
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
