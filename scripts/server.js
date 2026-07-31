process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const root = process.cwd();
const port = process.env.PORT ? Number(process.env.PORT) : 8081;

const env = loadEnv(path.join(root, '.env'));
const SUPABASE_URL = env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MTUwNjQsImV4cCI6MjA5NTk5MTA2NH0.WTk0rZaTsPvs30uEWDfylc-z6L3G8IUb_J73oYtjuWU';
const MERCADO_PAGO_ACCESS_TOKEN = env.MERCADO_PAGO_ACCESS_TOKEN || 'TEST-436110510599548-061020-84789bd457ac44b96a90600d82aceed2-3165703884';
const APP_BASE_URL = env.APP_BASE_URL || 'https://condomit.netlify.app';
const BREVO_API_KEY = env.BREVO_API_KEY || process.env.BREVO_API_KEY || '';
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
  ...(BrevoEnvironment?.Production ? { environment: BrevoEnvironment.Production } : {})
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
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const { amount, planName, payerEmail } = data;

      const preferenceData = {
        items: [
          {
            title: `Plano ${planName} - Condomit`,
            unit_price: parseFloat(amount),
            quantity: 1,
            currency_id: 'BRL'
          }
        ],
        payer: {
          email: payerEmail
        }
      };

      console.log('[MercadoPago] Creating preference for:', payerEmail);
      const result = await preference.create({ body: preferenceData });
      console.log('[MercadoPago] Full preference response:', JSON.stringify(result, null, 2));
      console.log('[MercadoPago] Preference created:', result.id, 'init_point:', result.init_point, 'back_urls:', result.back_urls);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ preferenceId: result.id, initPoint: result.init_point }));
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

// Armazena tokens de reset temporários (em produção, use Redis)
const resetTokens = new Map();

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
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
  const nome = usuario?.nome || usuario?.firstName || usuario?.username;
  if (nome && String(nome).trim()) {
    return String(nome).trim();
  }

  return String(fallbackEmail || '').split('@')[0] || 'morador';
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

  const nomeUsuario = getDisplayName(usuario, toEmail);

  const info = await brevoClient.transactionalEmails.sendTransacEmail({
    sender: { name: 'Condomit', email: 'contato.condomit@gmail.com' },
    to: [{ email: toEmail }],
    subject: 'Recuperacao de senha - Condomit',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #32C26D;">Recuperacao de senha</h2>
        <p>Ola, <strong>${nomeUsuario}</strong>!</p>
        <p>Clique no botao abaixo para criar uma nova senha:</p>
        <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#79D836,#32C26D);color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Redefinir minha senha
        </a>
        <p style="color:#5A5A5A;font-size:14px;">Este link e valido por <strong>1 hora</strong>.</p>
        <hr style="border:none;border-top:1px solid #C2C2C2;margin:24px 0;">
        <p style="color:#C2C2C2;font-size:12px;">Condomit - O app do seu condominio</p>
      </div>
    `
  });

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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/users?select=email,nome&email=eq.${encodeURIComponent(email)}`, {
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
      if (!email) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'E-mail é obrigatório' }));
        return;
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const users = await fetchSupabaseUsersByEmail(normalizedEmail);
      let keycloakUser = null;

      if (hasKeycloakConfig()) {
        try {
          keycloakUser = await findKeycloakUserByEmail(normalizedEmail);
        } catch (keycloakError) {
          console.error('[Keycloak Forgot Password Error]', keycloakError.message);
        }
      }

      if ((!users || users.length === 0) && !keycloakUser) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Se o e-mail existir, um link de reset foi enviado' }));
        return;
      }

      const token = generateResetToken();
      resetTokens.set(token, { email: normalizedEmail, expires: Date.now() + 3600000 });
      const resetLink = buildResetLink(req, token, resetPageUrl);
      const usuario = users?.[0] || keycloakUser || { nome: normalizedEmail.split('@')[0] };
      
      console.log(`🔗 Link de redefinição para ${normalizedEmail}: ${resetLink}`);
      
      try {
        await sendResetEmail(normalizedEmail, usuario, resetLink);
        console.log(`📧 E-mail de reset enviado para ${normalizedEmail}`);
      } catch (emailError) {
        console.error('[Email Error] Falha ao enviar e-mail:', emailError);
        console.log(`🔗 Link de redefinição (para usar diretamente): ${resetLink}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'Se o e-mail existir, um link de reset foi enviado'
      }));
    } catch (error) {
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

      const resetData = resetTokens.get(token);
      if (!resetData) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token inválido ou expirado' }));
        return;
      }

      if (Date.now() > resetData.expires) {
        resetTokens.delete(token);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token expirado' }));
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

      resetTokens.delete(token);

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
