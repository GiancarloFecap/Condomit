const crypto = require('crypto');

const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const MERCADO_PAGO_ENV = process.env.MERCADO_PAGO_ENV || 'test';
const SITE_URL = process.env.SITE_URL || 'https://condomit.netlify.app';

const PLANOS = {
  essencial: {
    titulo: 'Plano Essencial - Condomit',
    descricao: 'Pagamento do Plano Essencial do Condomit',
    preco: 79.00
  },
  pro: {
    titulo: 'Plano Pro - Condomit',
    descricao: 'Pagamento do Plano Pro do Condomit',
    preco: 149.00
  },
  premium: {
    titulo: 'Plano Premium - Condomit',
    descricao: 'Pagamento do Plano Premium do Condomit',
    preco: 199.00
  }
};

const MP_API_BASE = 'https://api.mercadopago.com';

function normalizarPlanoId(planoIdBruto) {
  if (!planoIdBruto) return null;
  const str = String(planoIdBruto).trim().toLowerCase();
  if (str.includes('essencial') || str === '1' || str === 'essencial' || str.includes('básico') || str.includes('basico')) {
    return 'essencial';
  }
  if (str.includes('premium') || str === '3' || str === 'premium') {
    return 'premium';
  }
  if (str.includes('pro') || str === '2' || str === 'pro') {
    return 'pro';
  }
  return str in PLANOS ? str : null;
}

function validarEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).trim());
}

function construirBackUrls(baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  return {
    success: `${base}/pages/pagamento-sucesso.html`,
    failure: `${base}/pages/pagamento-falha.html`,
    pending: `${base}/pages/pagamento-pendente.html`
  };
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido. Utilize POST.' })
    };
  }

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    console.error('[criar-preferencia] MERCADO_PAGO_ACCESS_TOKEN não configurado no ambiente');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Serviço de pagamento não configurado no servidor.' })
    };
  }

  let body = null;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (parseError) {
    console.error('[criar-preferencia] Erro ao fazer parse do body:', parseError.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Corpo da requisição inválido (JSON esperado).' })
    };
  }

  const { planoId: planoIdBruto, email: emailBruto, usuarioId } = body || {};
  const planoId = normalizarPlanoId(planoIdBruto);
  const email = String(emailBruto || '').trim().toLowerCase();

  if (!planoId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Plano inválido ou não selecionado.',
        planosDisponiveis: Object.keys(PLANOS)
      })
    };
  }

  if (!validarEmail(email)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'E-mail do pagador inválido ou não informado.' })
    };
  }

  const plano = PLANOS[planoId];
  const externalReference = crypto.randomUUID();
  const notificationUrl = `${SITE_URL.replace(/\/$/, '')}/.netlify/functions/mercado-pago-webhook`;

  const preferencePayload = {
    items: [
      {
        id: planoId,
        title: plano.titulo,
        description: plano.descricao,
        category_id: 'services',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(plano.preco.toFixed(2))
      }
    ],
    payer: {
      email
    },
    back_urls: construirBackUrls(SITE_URL),
    auto_return: 'approved',
    external_reference: externalReference,
    metadata: {
      plano_id: planoId,
      email_usuario: email,
      usuario_id: usuarioId || null,
      origem: 'condomit-checkout-pro',
      ambiente: MERCADO_PAGO_ENV
    },
    notification_url: notificationUrl,
    statement_descriptor: 'Condomit Assinatura'
  };

  console.log('[criar-preferencia] Criando preferência:', {
    planoId,
    email,
    preco: plano.preco,
    externalReference,
    env: MERCADO_PAGO_ENV
  });

  let mpResponse;
  try {
    mpResponse = await fetch(`${MP_API_BASE}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferencePayload)
    });
  } catch (fetchError) {
    console.error('[criar-preferencia] Erro de rede ao chamar Mercado Pago:', fetchError.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Falha de comunicação com o provedor de pagamento.' })
    };
  }

  const responseText = await mpResponse.text();
  let responseData;
  try {
    responseData = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    responseData = { raw: responseText };
  }

  console.log('[criar-preferencia] Resposta Mercado Pago status:', mpResponse.status);
  console.log('[criar-preferencia] Resposta Mercado Pago body (sem token):', JSON.stringify({
    id: responseData?.id,
    sandbox_init_point: responseData?.sandbox_init_point ? '[presente]' : '[ausente]',
    init_point: responseData?.init_point ? '[presente]' : '[ausente]',
    external_reference: responseData?.external_reference,
    error: responseData?.error || responseData?.message || null
  }));

  if (!mpResponse.ok) {
    return {
      statusCode: mpResponse.status >= 500 ? 502 : 400,
      headers,
      body: JSON.stringify({
        error: 'O provedor de pagamento rejeitou a solicitação.',
        detalhe: responseData?.error || responseData?.message || `HTTP ${mpResponse.status}`
      })
    };
  }

  const isSandbox = MERCADO_PAGO_ENV !== 'production';
  const checkoutUrl = isSandbox
    ? (responseData.sandbox_init_point || responseData.init_point)
    : (responseData.init_point || responseData.sandbox_init_point);

  if (!checkoutUrl) {
    console.error('[criar-preferencia] Resposta do MP sem init_point nem sandbox_init_point:', JSON.stringify(responseData));
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'O provedor não retornou uma URL de checkout válida.' })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      preferenciaId: responseData.id,
      pedidoId: externalReference,
      checkoutUrl
    })
  };
};
