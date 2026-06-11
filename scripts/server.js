const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const root = process.cwd();
const port = process.env.PORT ? Number(process.env.PORT) : 8081;

const env = loadEnv(path.join(root, '.env'));
const SUPABASE_URL = env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
const MERCADO_PAGO_ACCESS_TOKEN = env.MERCADO_PAGO_ACCESS_TOKEN || 'TEST-436110510599548-061020-84789bd457ac44b96a90600d82aceed2-3165703884';

const mpClient = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN });
const preference = new Preference(mpClient);

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
    pathname = '/pages/inicio.html';
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

server.listen(port, () => {
  console.log(`Servidor HTTP rodando em http://localhost:${port}`);
});
