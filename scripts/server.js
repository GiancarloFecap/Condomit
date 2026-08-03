process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
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
const APP_BASE_URL = env.APP_BASE_URL || 'https://condomit.netlify.app';
const MERCADO_PAGO_ACCESS_TOKEN = env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const MERCADO_PAGO_PUBLIC_KEY = env.MERCADO_PAGO_PUBLIC_KEY || process.env.MERCADO_PAGO_PUBLIC_KEY || '';
const MERCADO_PAGO_ENV = normalizeMercadoPagoEnvironment(env.MERCADO_PAGO_ENV || process.env.MERCADO_PAGO_ENV || 'test');
const BREVO_API_KEY = env.BREVO_API_KEY || process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = env.BREVO_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || '';
const KEYCLOAK_BASE_URL = (env.KEYCLOAK_BASE_URL || env.KEYCLOAK_URL || '').replace(/\/$/, '');
const KEYCLOAK_REALM = env.KEYCLOAK_REALM || '';
const KEYCLOAK_ADMIN_REALM = env.KEYCLOAK_ADMIN_REALM || 'master';
const KEYCLOAK_CLIENT_ID = env.KEYCLOAK_CLIENT_ID || '';
const KEYCLOAK_CLIENT_SECRET = env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_ADMIN_USERNAME = env.KEYCLOAK_ADMIN_USERNAME || '';
const KEYCLOAK_ADMIN_PASSWORD = env.KEYCLOAK_ADMIN_PASSWORD || '';

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

function normalizeMercadoPagoEnvironment(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['production', 'prod', 'live'].includes(normalized) ? 'production' : 'test';
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

    if (pathname === '/api/mercadopago/config' && req.method === 'GET') {
        return handleMercadoPagoConfigRequest(req, res);
    }

    if (pathname === '/api/mercadopago/preference' && req.method === 'POST') {
        return handleMercadoPagoPreferenceRequest(req, res);
    }

    if (pathname === '/api/mercadopago/confirm' && (req.method === 'GET' || req.method === 'POST')) {
        return handleMercadoPagoConfirmRequest(req, res, parsedUrl.query);
    }

    if (pathname === '/api/mercadopago/webhook' && req.method === 'POST') {
        return handleMercadoPagoWebhookRequest(req, res, parsedUrl.query);
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

function isMercadoPagoConfigured() {
  return Boolean(MERCADO_PAGO_ACCESS_TOKEN && MERCADO_PAGO_PUBLIC_KEY);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function getPublicAppBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = forwardedProto || 'http';
  const host = forwardedHost || req.headers.host || `localhost:${port}`;
  const requestBaseUrl = `${protocol}://${host}`;

  if (/localhost|127\.0\.0\.1/i.test(host)) {
    return requestBaseUrl;
  }

  return APP_BASE_URL || requestBaseUrl;
}

function getMercadoPagoWebhookUrl(req) {
  const publicBaseUrl = APP_BASE_URL || getPublicAppBaseUrl(req);
  return new URL('/api/mercadopago/webhook', publicBaseUrl).toString();
}

function getMercadoPagoErrorMessage(payload, fallbackMessage) {
  const candidates = [
    payload?.message,
    payload?.error,
    Array.isArray(payload?.cause) && payload.cause.length ? payload.cause.map((item) => item.description || item.message).filter(Boolean).join('; ') : null
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }

  return fallbackMessage;
}

function getDisplayNameFromUserRecord(usuario, email) {
  return getDisplayName(usuario, email);
}

function buildMercadoPagoExternalReference({ paymentId, email, planId }) {
  const encodedEmail = Buffer.from(String(email || ''), 'utf8').toString('base64url');
  return ['condomit', paymentId || 'pending', planId || 'no-plan', encodedEmail, Date.now().toString(36)].join('|');
}

function parseMercadoPagoExternalReference(reference) {
  const raw = String(reference || '').trim();
  if (!raw) return {};

  const parts = raw.split('|');
  if (parts[0] !== 'condomit') {
    return { paymentId: raw };
  }

  let email = null;
  if (parts[3]) {
    try {
      email = Buffer.from(parts[3], 'base64url').toString('utf8');
    } catch (_) {
      email = null;
    }
  }

  return {
    paymentId: parts[1] && parts[1] !== 'pending' ? parts[1] : null,
    planId: parts[2] && parts[2] !== 'no-plan' ? parts[2] : null,
    email
  };
}

function extractUserCep(userLike) {
  return userLike?.condominium?.cep ||
    userLike?.condominium?.condominium_id ||
    userLike?.condominium_cep ||
    userLike?.cep ||
    null;
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
        return;
      } catch (_) {
        const params = new URLSearchParams(body);
        if ([...params.keys()].length) {
          const parsed = {};
          params.forEach((value, key) => {
            parsed[key] = value;
          });
          resolve(parsed);
          return;
        }
      }

      reject(new Error('Nao foi possivel interpretar o corpo da requisicao'));
    });
    req.on('error', reject);
  });
}

async function createSupabasePayment(paymentPayload) {
  const result = await proxySupabasePayload(paymentPayload, '/pagamento', 'POST');
  if (result.status >= 400) {
    throw new Error('Falha ao criar pagamento pendente');
  }
  return Array.isArray(result.data) && result.data.length ? result.data[0] : result.data;
}

async function createMercadoPagoPreference({ req, userRecord, planRecord, paymentRecord }) {
  const amount = Number(planRecord?.valor_minimo ?? planRecord?.valor ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor do plano invalido para criar a preferencia');
  }

  const baseUrl = getPublicAppBaseUrl(req);
  const externalReference = buildMercadoPagoExternalReference({
    paymentId: paymentRecord?.id,
    email: userRecord?.email,
    planId: planRecord?.id
  });

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify({
      items: [
        {
          id: String(planRecord.id),
          title: planRecord.nome || 'Plano Condomit',
          description: planRecord.descricao || `Assinatura ${planRecord.nome || 'Condomit'}`,
          category_id: 'services',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: amount
        }
      ],
      payer: {
        email: userRecord.email,
        name: getDisplayNameFromUserRecord(userRecord, userRecord.email)
      },
      back_urls: {
        success: new URL('/pages/pagamento-sucesso.html', baseUrl).toString(),
        pending: new URL('/pages/pagamento-pendente.html', baseUrl).toString(),
        failure: new URL('/pages/pagamento-falha.html', baseUrl).toString()
      },
      auto_return: 'approved',
      notification_url: getMercadoPagoWebhookUrl(req),
      external_reference: externalReference,
      statement_descriptor: 'CONDOMIT',
      metadata: {
        payment_id: paymentRecord?.id || null,
        plan_id: planRecord.id,
        user_email: userRecord.email
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    throw new Error(getMercadoPagoErrorMessage(payload, 'Falha ao criar preferencia no Mercado Pago'));
  }

  return {
    preferenceId: payload.id,
    initPoint: payload.init_point || null,
    sandboxInitPoint: payload.sandbox_init_point || null,
    externalReference
  };
}

async function fetchMercadoPagoPayment(paymentId) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    throw new Error(getMercadoPagoErrorMessage(payload, 'Falha ao consultar pagamento no Mercado Pago'));
  }

  return payload;
}

async function confirmMercadoPagoPayment({ paymentId, externalReference, fallbackStatus }) {
  const parsedReference = parseMercadoPagoExternalReference(externalReference);
  let paymentRecord = null;
  let mercadoPagoPayment = null;
  let normalizedStatus = normalizePaymentStatus(fallbackStatus);

  if (paymentId) {
    mercadoPagoPayment = await fetchMercadoPagoPayment(paymentId);
    normalizedStatus = normalizePaymentStatus(mercadoPagoPayment.status || fallbackStatus);
    const resolvedReference = parseMercadoPagoExternalReference(mercadoPagoPayment.external_reference || externalReference);

    paymentRecord = await fetchSupabasePaymentByTransactionCode(String(mercadoPagoPayment.id));

    if (!paymentRecord && resolvedReference.paymentId) {
      paymentRecord = await fetchSupabasePaymentById(resolvedReference.paymentId);
    }

    if (!paymentRecord && mercadoPagoPayment.external_reference && /^\d+$/.test(String(mercadoPagoPayment.external_reference))) {
      paymentRecord = await fetchSupabasePaymentById(String(mercadoPagoPayment.external_reference));
    }

    if (!paymentRecord && mercadoPagoPayment.payer?.email) {
      paymentRecord = await fetchLatestSupabasePaymentByEmail(mercadoPagoPayment.payer.email);
    }

    if (paymentRecord?.id) {
      paymentRecord = await patchSupabasePayment(paymentRecord.id, {
        status_pagamento: normalizedStatus,
        codigo_transacao: String(mercadoPagoPayment.id),
        data_pagamento: mercadoPagoPayment.date_approved || mercadoPagoPayment.date_last_updated || new Date().toISOString(),
        ...(paymentRecord.plano_id ? {} : resolvedReference.planId ? { plano_id: resolvedReference.planId } : {})
      });
    }
  } else if (parsedReference.paymentId) {
    paymentRecord = await fetchSupabasePaymentById(parsedReference.paymentId);
  }

  const resolvedPlanId = paymentRecord?.plano_id || parsedReference.planId || mercadoPagoPayment?.metadata?.plan_id || null;
  const resolvedEmail = paymentRecord?.email || parsedReference.email || mercadoPagoPayment?.payer?.email || null;

  let userPlanUpdated = false;
  let emailResult = { skipped: true };

  if (isApprovedPaymentStatus(normalizedStatus) && resolvedEmail && resolvedPlanId) {
    try {
      await patchSupabaseUserPlan(resolvedEmail, resolvedPlanId);
      userPlanUpdated = true;
    } catch (error) {
      console.error('[Mercado Pago] Falha ao atualizar plano do usuario:', error.message);
    }

    try {
      const [usuario, plano] = await Promise.all([
        fetchSupabaseUserRecordByEmail(resolvedEmail),
        fetchSupabasePlanById(resolvedPlanId)
      ]);

      emailResult = await sendPaymentConfirmationEmailOnce(
        String(mercadoPagoPayment?.id || paymentRecord?.codigo_transacao || paymentRecord?.id || paymentId || Date.now()),
        resolvedEmail,
        usuario || { email: resolvedEmail },
        {
          planName: normalizePlanName(plano?.nome || paymentRecord?.plano_id || resolvedPlanId),
          approvedAt: mercadoPagoPayment?.date_approved || paymentRecord?.data_pagamento || new Date().toISOString(),
          amount: mercadoPagoPayment?.transaction_amount || plano?.valor_minimo || plano?.valor || 0
        }
      );
    } catch (error) {
      console.error('[Mercado Pago] Falha ao enviar e-mail de confirmacao:', error.message);
      emailResult = { skipped: false, emailSent: false, emailError: error.message };
    }
  }

  return {
    paymentRecord,
    mercadoPagoPayment,
    normalizedStatus,
    userPlanUpdated,
    emailResult
  };
}

function extractMercadoPagoNotificationData(query, body) {
  const paymentId =
    body?.data?.id ||
    body?.id ||
    query['data.id'] ||
    query.payment_id ||
    query.collection_id ||
    query.id ||
    null;

  return {
    paymentId: paymentId ? String(paymentId) : null,
    type: body?.type || body?.topic || query.type || query.topic || '',
    action: body?.action || query.action || '',
    externalReference: body?.external_reference || query.external_reference || null,
    status: body?.status || query.status || query.collection_status || null
  };
}

async function handleMercadoPagoConfigRequest(req, res) {
  sendJson(res, isMercadoPagoConfigured() ? 200 : 503, {
    configured: isMercadoPagoConfigured(),
    publicKey: MERCADO_PAGO_PUBLIC_KEY || null,
    environment: MERCADO_PAGO_ENV
  });
}

async function handleMercadoPagoPreferenceRequest(req, res) {
  try {
    if (!isMercadoPagoConfigured()) {
      sendJson(res, 503, { error: 'Mercado Pago nao configurado no ambiente' });
      return;
    }

    const body = await readRequestBody(req);
    const email = String(body.email || body.user?.email || '').trim().toLowerCase();
    const planId = String(body.planId || body.plan_id || '').trim();
    const pendingPaymentId = String(body.pendingPaymentId || body.paymentId || body.payment_id || '').trim();

    if (!email || !planId) {
      sendJson(res, 400, { error: 'email e planId sao obrigatorios para criar a preferencia' });
      return;
    }

    const [userRecord, planRecord] = await Promise.all([
      fetchSupabaseUserRecordByEmail(email).catch(() => null),
      fetchSupabasePlanById(planId)
    ]);

    if (!planRecord) {
      sendJson(res, 404, { error: 'Plano nao encontrado' });
      return;
    }

    let paymentRecord = null;
    if (pendingPaymentId) {
      paymentRecord = await fetchSupabasePaymentById(pendingPaymentId).catch(() => null);
    }

    if (!paymentRecord) {
      paymentRecord = await createSupabasePayment({
        email,
        cep: body.cep || body.condominiumCep || extractUserCep(body.user),
        plano_id: planRecord.id,
        status_pagamento: 'pendente',
        data_pagamento: new Date().toISOString()
      });
    }

    const preference = await createMercadoPagoPreference({
      req,
      userRecord: userRecord || { email, nome: body.user?.name || body.user?.nome || email.split('@')[0] },
      planRecord,
      paymentRecord
    });

    sendJson(res, 200, {
      preferenceId: preference.preferenceId,
      initPoint: preference.initPoint,
      sandboxInitPoint: preference.sandboxInitPoint,
      externalReference: preference.externalReference,
      paymentId: paymentRecord?.id || null,
      publicKey: MERCADO_PAGO_PUBLIC_KEY,
      environment: MERCADO_PAGO_ENV
    });
  } catch (error) {
    console.error('[Mercado Pago Preference Error]', error);
    sendJson(res, 500, { error: error.message || 'Erro ao criar preferencia do Mercado Pago' });
  }
}

async function handleMercadoPagoConfirmRequest(req, res, query = {}) {
  try {
    const body = req.method === 'POST' ? await readRequestBody(req) : {};
    const payload = { ...query, ...body };
    const paymentId = payload.paymentId || payload.payment_id || payload.collection_id || payload.id || payload['data.id'] || body?.data?.id || null;
    const externalReference = payload.externalReference || payload.external_reference || null;
    const fallbackStatus = payload.status || payload.collection_status || null;

    if (!paymentId && !externalReference) {
      sendJson(res, 400, { error: 'paymentId ou external_reference e obrigatorio' });
      return;
    }

    const result = await confirmMercadoPagoPayment({
      paymentId: paymentId ? String(paymentId) : null,
      externalReference,
      fallbackStatus
    });

    sendJson(res, 200, {
      ok: true,
      status: result.normalizedStatus,
      payment: result.paymentRecord || null,
      mercadoPagoPaymentId: result.mercadoPagoPayment?.id || paymentId || null,
      userPlanUpdated: result.userPlanUpdated,
      emailResult: result.emailResult
    });
  } catch (error) {
    console.error('[Mercado Pago Confirm Error]', error);
    sendJson(res, 500, { error: error.message || 'Erro ao confirmar pagamento no Mercado Pago' });
  }
}

async function handleMercadoPagoWebhookRequest(req, res, query = {}) {
  try {
    const body = await readRequestBody(req);
    const notification = extractMercadoPagoNotificationData(query, body);
    const shouldProcess = notification.paymentId && (!notification.type || notification.type === 'payment');

    const result = shouldProcess
      ? await confirmMercadoPagoPayment({
        paymentId: notification.paymentId,
        externalReference: notification.externalReference,
        fallbackStatus: notification.status
      })
      : null;

    sendJson(res, 200, {
      received: true,
      processed: Boolean(result),
      paymentId: notification.paymentId,
      status: result?.normalizedStatus || notification.status || null
    });
  } catch (error) {
    console.error('[Mercado Pago Webhook Error]', error);
    sendJson(res, 500, { error: error.message || 'Erro ao processar webhook do Mercado Pago' });
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
