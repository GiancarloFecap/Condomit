const crypto = require('crypto');

const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const MERCADO_PAGO_WEBHOOK_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';
const MERCADO_PAGO_ENV = process.env.MERCADO_PAGO_ENV || 'test';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvcGxlZmtydWlkYXhlYXBucmpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQxNTA2NCwiZXhwIjoyMDk1OTkxMDY0fQ.wi0H-LHiBiMm3_WPXw1lslRnhAw3atf_BGUZCp2PdNA';

const PLANOS = {
  essencial: { preco: 79.00 },
  pro: { preco: 149.00 },
  premium: { preco: 199.00 }
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

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!response.ok) {
    const msg = (typeof data === 'object' && data?.message) ? data.message : `HTTP ${response.status}`;
    throw new Error(`Supabase error: ${msg}`);
  }
  return { status: response.status, data };
}

function extrairIdPagamento(event, body) {
  const query = event.queryStringParameters || {};
  if (query['data.id']) return query['data.id'];
  if (query['id']) return query['id'];
  if (query.payment_id) return query.payment_id;
  if (body && typeof body === 'object') {
    if (body.data && typeof body.data === 'object' && body.data.id) return String(body.data.id);
    if (body.id && body.type) return String(body.id);
    if (body.payment_id) return String(body.payment_id);
  }
  return null;
}

function extrairTipoNotificacao(body) {
  if (!body || typeof body !== 'object') return null;
  return body.type || body.topic || null;
}

function validarAssinaturaMercadoPago(event, body, webhookSecret) {
  if (!webhookSecret) {
    console.warn('[webhook] MERCADO_PAGO_WEBHOOK_SECRET não configurado. Validação de assinatura SKIPPED (permitido em sandbox, mas obrigatório em produção).');
    return true;
  }
  if (MERCADO_PAGO_ENV === 'production' && !webhookSecret) {
    console.error('[webhook] AMBIENTE PRODUÇÃO SEM MERCADO_PAGO_WEBHOOK_SECRET configurado. Bloqueando processamento.');
    return false;
  }

  const signatureHeader = (event.headers || {})['x-signature'] || (event.headers || {})['X-Signature'];
  const requestIdHeader = (event.headers || {})['x-request-id'] || (event.headers || {})['X-Request-Id'];

  if (!signatureHeader || !requestIdHeader) {
    console.warn('[webhook] Cabeçalhos x-signature e/ou x-request-id ausentes.');
    return MERCADO_PAGO_ENV !== 'production';
  }

  try {
    const params = new URLSearchParams(signatureHeader);
    const ts = params.get('ts');
    const hash = params.get('v1');
    if (!ts || !hash) {
      console.warn('[webhook] Assinatura MP malformada (falta ts ou v1).');
      return MERCADO_PAGO_ENV !== 'production';
    }
    const manifest = `id:${requestIdHeader};request-id:${requestIdHeader};ts:${ts};`;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(manifest)
      .digest('hex');
    if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) {
      console.error('[webhook] Assinatura MP inválida (HMAC não confere).');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[webhook] Exceção ao validar assinatura MP:', err.message);
    return MERCADO_PAGO_ENV !== 'production';
  }
}

async function consultarPagamentoMP(paymentId) {
  const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`MP retornou HTTP ${response.status}: ${data?.error || data?.message || text || 'unknown'}`);
  }
  return data;
}

function mapearStatusMP(statusMP) {
  switch (String(statusMP || '').toLowerCase()) {
    case 'approved':
    case 'authorized':
      return 'aprovado';
    case 'pending':
    case 'in_process':
    case 'in_mediation':
      return 'pendente';
    case 'rejected':
    case 'cancelled':
    case 'refunded':
    case 'charged_back':
      return 'rejeitado';
    default:
      return 'pendente';
  }
}

async function verificarPagamentoJaProcessado(mpPaymentId) {
  try {
    const result = await supabaseFetch(`/pagamento?select=id,mp_payment_id,status_pagamento&mp_payment_id=eq.${encodeURIComponent(String(mpPaymentId))}`, {
      method: 'GET',
      headers: { Prefer: 'return=representation' }
    });
    return Array.isArray(result.data) && result.data.length > 0;
  } catch (err) {
    console.warn('[webhook] Não foi possível consultar pagamento existente (coluna mp_payment_id pode não existir ainda):', err.message);
    return false;
  }
}

async function buscarPagamentoPorExternalRef(externalReference) {
  try {
    const result = await supabaseFetch(`/pagamento?select=*&external_reference=eq.${encodeURIComponent(String(externalReference))}`, {
      method: 'GET'
    });
    return Array.isArray(result.data) ? result.data : [];
  } catch (_) {
    return [];
  }
}

async function upsertPagamentoNoSupabase(pagamentoMP, planoIdValidado, statusTraduzido) {
  const mpPaymentId = String(pagamentoMP.id);
  const externalReference = pagamentoMP.external_reference || null;
  const transactionAmount = Number(pagamentoMP.transaction_amount || 0);
  const currencyId = String(pagamentoMP.currency_id || 'BRL');
  const payerEmail = String(pagamentoMP.payer?.email || pagamentoMP.metadata?.email_usuario || '').trim().toLowerCase();
  const usuarioId = pagamentoMP.metadata?.usuario_id || null;
  const statusDetail = pagamentoMP.status_detail || null;
  const dateApproved = pagamentoMP.date_approved || pagamentoMP.date_created || new Date().toISOString();
  const agora = new Date().toISOString();

  const row = {
    mp_payment_id: mpPaymentId,
    external_reference: externalReference,
    plano_id: planoIdValidado,
    status_pagamento: statusTraduzido,
    status_detail: statusDetail,
    valor_pago: transactionAmount,
    moeda: currencyId,
    email: payerEmail,
    usuario_id: usuarioId || null,
    data_pagamento: dateApproved,
    data_atualizacao: agora,
    mp_status: pagamentoMP.status || null,
    mp_status_detail: statusDetail
  };

  const existentes = await buscarPagamentoPorExternalRef(externalReference);
  if (existentes && existentes.length > 0) {
    const existente = existentes[0];
    const idKey = existente.id !== undefined ? 'id' : (existente.mp_payment_id ? 'mp_payment_id' : 'external_reference');
    const idValue = idKey === 'id' ? existente.id : (idKey === 'mp_payment_id' ? mpPaymentId : externalReference);
    console.log(`[webhook] Atualizando registro existente via ${idKey}=${idValue}`);
    const path = idKey === 'id'
      ? `/pagamento?id=eq.${encodeURIComponent(String(idValue))}`
      : `/pagamento?${idKey}=eq.${encodeURIComponent(String(idValue))}`;
    await supabaseFetch(path, {
      method: 'PATCH',
      body: JSON.stringify(row)
    });
    return { modo: 'atualizado', ...row };
  }

  try {
    const result = await supabaseFetch('/pagamento', {
      method: 'POST',
      body: JSON.stringify(row),
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' }
    });
    return { modo: 'criado', ...row, ...(Array.isArray(result.data) ? result.data[0] : result.data) };
  } catch (insertErr) {
    console.warn('[webhook] INSERT falhou (talvez colunas ainda não existam). Tentando UPDATE por external_reference...', insertErr.message);
    try {
      await supabaseFetch(`/pagamento?external_reference=eq.${encodeURIComponent(String(externalReference))}`, {
        method: 'PATCH',
        body: JSON.stringify(row)
      });
      return { modo: 'atualizado-fallback', ...row };
    } catch (patchErr) {
      console.warn('[webhook] PATCH também falhou. Tentando inserir com subconjunto de colunas compatíveis com tabela antiga...');
      const minimalRow = {
        email: payerEmail,
        plano_id: planoIdValidado,
        status_pagamento: statusTraduzido,
        external_reference: externalReference,
        data_pagamento: dateApproved
      };
      const result2 = await supabaseFetch('/pagamento', {
        method: 'POST',
        body: JSON.stringify(minimalRow)
      });
      return { modo: 'criado-minimal', ...minimalRow, ...(Array.isArray(result2.data) ? result2.data[0] : result2.data) };
    }
  }
}

async function atualizarPlanoUsuarioSupabase(emailUsuario, planoIdValidado) {
  if (!emailUsuario || !planoIdValidado) return null;
  try {
    const result = await supabaseFetch(`/users?select=*&email=eq.${encodeURIComponent(emailUsuario)}`, {
      method: 'GET'
    });
    const usuarios = Array.isArray(result.data) ? result.data : [];
    if (!usuarios.length) {
      console.warn(`[webhook] Nenhum usuário encontrado com email ${emailUsuario} para ativar plano.`);
      return null;
    }
    const atualizados = [];
    for (const usuario of usuarios) {
      const idKey = usuario.id !== undefined ? 'id' : 'email';
      const idValue = idKey === 'id' ? usuario.id : emailUsuario;
      const path = idKey === 'id'
        ? `/users?id=eq.${encodeURIComponent(String(idValue))}`
        : `/users?email=eq.${encodeURIComponent(emailUsuario)}`;
      await supabaseFetch(path, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: planoIdValidado,
          plano: planoIdValidado,
          data_ativacao_plano: new Date().toISOString()
        })
      });
      atualizados.push(idValue);
    }
    return atualizados;
  } catch (err) {
    console.error('[webhook] Erro ao atualizar plano do usuário:', err.message);
    return null;
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-signature, x-request-id',
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
      body: JSON.stringify({ error: 'Método não permitido. Webhook aceita apenas POST.' })
    };
  }

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    console.error('[webhook] MERCADO_PAGO_ACCESS_TOKEN não configurado.');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Webhook não configurado.' }) };
  }

  let body = null;
  let rawBody = '';
  try {
    rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : (event.body || '');
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch (parseError) {
    console.error('[webhook] Body inválido (JSON esperado):', parseError.message);
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body inválido.' }) };
  }

  const tipoNotificacao = extrairTipoNotificacao(body);
  const paymentId = extrairIdPagamento(event, body);

  console.log('[webhook] Evento recebido:', {
    tipoNotificacao,
    paymentId: paymentId ? '[presente]' : '[ausente]',
    action: body?.action || null,
    query: event.queryStringParameters || null
  });

  const actionIgnored = tipoNotificacao && !['payment', 'payment.created', 'payment.updated', 'payment.approved'].includes(tipoNotificacao) && !['payment.updated', 'payment.created'].includes(String(body?.action || ''));
  if (actionIgnored || !paymentId) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ignored', motivo: actionIgnored ? 'tipo-notificacao-nao-pagamento' : 'sem-payment-id' })
    };
  }

  const assinaturaValida = validarAssinaturaMercadoPago(event, body, MERCADO_PAGO_WEBHOOK_SECRET);
  if (!assinaturaValida) {
    return {
      statusCode: MERCADO_PAGO_ENV === 'production' ? 401 : 200,
      headers,
      body: JSON.stringify({ status: MERCADO_PAGO_ENV === 'production' ? 'invalid-signature' : 'ignored-invalid-signature-dev' })
    };
  }

  let pagamentoMP;
  try {
    pagamentoMP = await consultarPagamentoMP(paymentId);
  } catch (err) {
    console.error('[webhook] Falha ao consultar pagamento na API do MP:', err.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Falha ao consultar pagamento.' }) };
  }

  console.log('[webhook] Pagamento MP consultado:', {
    id: pagamentoMP.id,
    status: pagamentoMP.status,
    status_detail: pagamentoMP.status_detail,
    external_reference: pagamentoMP.external_reference,
    transaction_amount: pagamentoMP.transaction_amount,
    currency_id: pagamentoMP.currency_id,
    payer_email: pagamentoMP.payer?.email,
    metadata: pagamentoMP.metadata
  });

  const metadata = pagamentoMP.metadata || {};
  const planoIdBruto = metadata.plano_id || pagamentoMP.items?.[0]?.id || null;
  const planoIdValidado = normalizarPlanoId(planoIdBruto);
  const valorEsperado = planoIdValidado ? PLANOS[planoIdValidado].preco : null;
  const transactionAmount = Number(pagamentoMP.transaction_amount || 0);
  const currencyId = String(pagamentoMP.currency_id || '').toUpperCase();
  const payerEmail = String(pagamentoMP.payer?.email || metadata.email_usuario || '').trim().toLowerCase();
  const emailMetadata = String(metadata.email_usuario || '').trim().toLowerCase();

  if (!planoIdValidado) {
    console.error(`[webhook] Plano inválido/desconhecido: ${planoIdBruto}`);
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'plano-invalido', paymentId }) };
  }

  if (!valorEsperado || Math.abs(transactionAmount - valorEsperado) > 0.02) {
    console.error(`[webhook] Valor inesperado. Esperado R$${valorEsperado}, recebido R$${transactionAmount}. Bloqueando ativação.`);
    await upsertPagamentoNoSupabase(pagamentoMP, planoIdValidado, 'rejeitado');
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'valor-incorreto', paymentId }) };
  }

  if (currencyId !== 'BRL') {
    console.error(`[webhook] Moeda incorreta: ${currencyId}. Esperado BRL.`);
    await upsertPagamentoNoSupabase(pagamentoMP, planoIdValidado, 'rejeitado');
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'moeda-incorreta', paymentId }) };
  }

  if (emailMetadata && payerEmail && emailMetadata !== payerEmail) {
    console.warn(`[webhook] Divergência de e-mail: metadata=${emailMetadata} vs payer=${payerEmail}. Mantendo payer como oficial.`);
  }

  const jaProcessado = await verificarPagamentoJaProcessado(pagamentoMP.id);
  if (jaProcessado && pagamentoMP.status === 'approved') {
    console.log(`[webhook] Pagamento ${pagamentoMP.id} JÁ FOI processado anteriormente (idempotência). Nenhuma alteração repetida.`);
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'idempotente-ja-aprovado', paymentId }) };
  }

  const statusTraduzido = mapearStatusMP(pagamentoMP.status);

  let dbResult;
  try {
    dbResult = await upsertPagamentoNoSupabase(pagamentoMP, planoIdValidado, statusTraduzido);
  } catch (dbErr) {
    console.error('[webhook] Falha ao gravar no Supabase (talvez precise rodar o SQL de migração):', dbErr.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falha ao persistir pagamento.', detalhe: dbErr.message }) };
  }

  let usuarioAtualizado = null;
  if (pagamentoMP.status === 'approved') {
    const emailParaAtivar = payerEmail || emailMetadata;
    usuarioAtualizado = await atualizarPlanoUsuarioSupabase(emailParaAtivar, planoIdValidado);
    console.log(`[webhook] ✅ Pagamento APROVADO ${pagamentoMP.id}. Plano ${planoIdValidado} ativado para ${emailParaAtivar}. Usuários atualizados:`, usuarioAtualizado);
  } else {
    console.log(`[webhook] Pagamento ${pagamentoMP.id} com status ${pagamentoMP.status} (${statusTraduzido}). Aguardando aprovação para ativar plano.`);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: 'processado',
      paymentId,
      mpStatus: pagamentoMP.status,
      statusTraduzido,
      planoId: planoIdValidado,
      dbOperacao: dbResult?.modo || null,
      usuariosAtualizados: usuarioAtualizado
    })
  };
};
