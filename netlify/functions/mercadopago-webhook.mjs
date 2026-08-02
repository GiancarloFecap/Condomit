function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

function extractPaymentId(query, body) {
  return (
    body?.data?.id ||
    body?.payment_id ||
    body?.paymentId ||
    query.get('data.id') ||
    query.get('id') ||
    query.get('payment_id') ||
    query.get('paymentId') ||
    null
  );
}

function buildBaseUrl(event) {
  const headers = event.headers || {};
  const protocol = headers['x-forwarded-proto'] || headers['X-Forwarded-Proto'] || 'https';
  const host = headers['x-forwarded-host'] || headers['X-Forwarded-Host'] || headers.host || headers.Host;
  if (!host) {
    throw new Error('Host da requisição não encontrado.');
  }
  return `${protocol}://${host}`;
}

export async function handler(event) {
  const corsHeaders = getCorsHeaders();

  try {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: ''
      };
    }

    if (event.httpMethod === 'GET') {
      return jsonResponse(200, {
        success: true,
        message: 'Webhook do Mercado Pago está ativo.'
      }, corsHeaders);
    }

    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, {
        error: 'Método não permitido.'
      }, corsHeaders);
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '');
    const body = rawBody ? JSON.parse(rawBody) : {};
    const url = new URL(event.rawUrl || buildBaseUrl(event));
    const paymentId = extractPaymentId(url.searchParams, body);

    console.log('[mercadopago-webhook] Webhook recebido:', {
      type: body?.type || null,
      action: body?.action || null,
      paymentId,
      liveMode: body?.live_mode ?? null
    });

    if (!paymentId) {
      return jsonResponse(200, {
        received: true,
        ignored: true
      }, corsHeaders);
    }

    const baseUrl = buildBaseUrl(event);
    const confirmResponse = await fetch(`${baseUrl}/.netlify/functions/api-proxy/mercadopago/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentId })
    });

    const confirmData = await confirmResponse.json().catch(() => ({}));
    if (!confirmResponse.ok) {
      console.error('[mercadopago-webhook] Falha ao confirmar pagamento:', confirmData);
      return jsonResponse(500, {
        error: 'Falha ao processar a confirmação do pagamento.',
        paymentId
      }, corsHeaders);
    }

    return jsonResponse(200, {
      received: true,
      paymentId,
      approved: Boolean(confirmData.approved),
      alreadyProcessed: Boolean(confirmData.alreadyProcessed)
    }, corsHeaders);
  } catch (error) {
    console.error('[mercadopago-webhook] Erro no webhook Mercado Pago:', error);
    return jsonResponse(500, {
      error: 'Erro interno no webhook.'
    }, corsHeaders);
  }
}
