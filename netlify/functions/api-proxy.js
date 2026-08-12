const crypto = require('crypto');
const { Brevo, BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://condomit.netlify.app';
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || '';
const MERCADO_PAGO_PUBLIC_KEY = process.env.MERCADO_PAGO_PUBLIC_KEY || '';
const MERCADO_PAGO_ENV = normalizeMercadoPagoEnvironment(process.env.MERCADO_PAGO_ENV || 'test');
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
const KEYCLOAK_BASE_URL = (process.env.KEYCLOAK_BASE_URL || process.env.KEYCLOAK_URL || '').replace(/\/$/, '');
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || '';
const KEYCLOAK_ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || 'master';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || '';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET || '';
const KEYCLOAK_ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME || '';
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || '';

const brevoClient = BREVO_API_KEY ? new BrevoClient({
  apiKey: BREVO_API_KEY,
  environment: BrevoEnvironment.Production
}) : null;

const RESET_TOKEN_SECRET = process.env.RESET_TOKEN_SECRET || SUPABASE_SERVICE_ROLE_KEY;
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const SUPPORT_PAYMENT_MAILTO = 'mailto:contato.condomit@gmail.com?subject=Suporte%20Condomit%20-%20Pagamento';
const paymentConfirmationEmailAttempts = new Map();

function normalizeCepForDatabase(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length !== 8) {
    return '';
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function hasSupabaseAdminConfig() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_SERVICE_ROLE_KEY
  );
}

function normalizeMercadoPagoEnvironment(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['production', 'prod', 'live'].includes(normalized) ? 'production' : 'test';
}

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

function isMercadoPagoConfigured() {
  return Boolean(MERCADO_PAGO_ACCESS_TOKEN && MERCADO_PAGO_PUBLIC_KEY);
}

function getMercadoPagoWebhookUrl(event) {
  const baseUrl = APP_BASE_URL || getRequestOrigin(event);
  return new URL('/api/mercadopago/webhook', baseUrl).toString();
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

async function createSupabasePayment(paymentPayload) {
  const result = await proxySupabaseRequest(paymentPayload, '/pagamento', 'POST');
  if (result.status >= 400) {
    throw new Error('Falha ao criar pagamento pendente');
  }
  return Array.isArray(result.data) && result.data.length ? result.data[0] : result.data;
}

async function createMercadoPagoPreference({ event, userRecord, planRecord, paymentRecord }) {
  const amount = Number(paymentRecord?.valor_pago ?? planRecord?.valor_minimo ?? planRecord?.valor ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor do plano invalido para criar a preferencia');
  }

  const baseUrl = APP_BASE_URL || getRequestOrigin(event);
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
        name: getDisplayName(userRecord, userRecord.email)
      },
      back_urls: {
        success: new URL('/pages/pagamento-sucesso.html', baseUrl).toString(),
        pending: new URL('/pages/pagamento-pendente.html', baseUrl).toString(),
        failure: new URL('/pages/pagamento-falha.html', baseUrl).toString()
      },
      auto_return: 'approved',
      notification_url: getMercadoPagoWebhookUrl(event),
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

async function handleMercadoPagoConfig() {
  //#region debug-point mp-config-token-mode
  const rawToken = String(MERCADO_PAGO_ACCESS_TOKEN || '');
  const accessTokenMode = rawToken.startsWith('TEST-')
    ? 'test'
    : rawToken.startsWith('APP_USR-')
      ? 'production'
      : rawToken
        ? 'unknown'
        : 'missing';
  //#endregion debug-point mp-config-token-mode

  return {
    statusCode: isMercadoPagoConfigured() ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      configured: isMercadoPagoConfigured(),
      publicKey: MERCADO_PAGO_PUBLIC_KEY || null,
      environment: MERCADO_PAGO_ENV,
      accessTokenMode
    })
  };
}

async function handleMercadoPagoPreference(event, body) {
  if (!isMercadoPagoConfigured()) {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Mercado Pago nao configurado no ambiente' }) };
  }

  const email = String(body?.email || body?.user?.email || '').trim().toLowerCase();
  const planId = String(body?.planId || body?.plan_id || '').trim();
  const pendingPaymentId = String(body?.pendingPaymentId || body?.paymentId || body?.payment_id || '').trim();

  if (!email || !planId) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'email e planId sao obrigatorios para criar a preferencia' }) };
  }

  const [userRecord, planRecord] = await Promise.all([
    fetchSupabaseUserRecordByEmail(email).catch(() => null),
    fetchSupabasePlanById(planId)
  ]);

  if (!planRecord) {
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Plano nao encontrado' }) };
  }

  let paymentRecord = null;
  if (pendingPaymentId) {
    paymentRecord = await fetchSupabasePaymentById(pendingPaymentId).catch(() => null);
  }

  if (!paymentRecord) {
    const totalApartamentos =
      Number(body?.total_apartamentos) ||
      Number(body?.totalApartments) ||
      Number(body?.user?.condominium?.totalApartments) ||
      Number(body?.user?.condominium?.total_apartments) ||
      Number(body?.user?.condominium?.total_apartamentos) ||
      0;

    const valorPorUnidade = Number(body?.valor_por_unidade) || Number(planRecord?.valor_por_unidade) || 0;
    const valorMinimo = Number(body?.valor_minimo) || Number(planRecord?.valor_minimo) || 0;
    const valorPagoBody = Number(body?.valor_pago);
    const valorCalculado = totalApartamentos > 0 && valorPorUnidade > 0 ? totalApartamentos * valorPorUnidade : 0;
    const valorPago = Number.isFinite(valorPagoBody) && valorPagoBody > 0
      ? valorPagoBody
      : valorCalculado > 0 && valorMinimo > 0
        ? Math.max(valorMinimo, valorCalculado)
        : valorMinimo;

    if (!Number.isFinite(valorPorUnidade) || valorPorUnidade <= 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Plano sem valor_por_unidade valido para iniciar o pagamento' }) };
    }

    if (!Number.isFinite(valorMinimo) || valorMinimo <= 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Plano sem valor_minimo valido para iniciar o pagamento' }) };
    }

    if (!Number.isFinite(valorPago) || valorPago <= 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Nao foi possivel calcular o valor do pagamento' }) };
    }

    paymentRecord = await createSupabasePayment({
      email,
      cep: body?.cep || body?.condominiumCep || extractUserCep(body?.user),
      plano_id: planRecord.id,
      total_apartamentos: totalApartamentos > 0 ? totalApartamentos : 1,
      valor_por_unidade: valorPorUnidade,
      valor_minimo: valorMinimo,
      valor_pago: valorPago,
      status_pagamento: 'pendente',
      data_pagamento: new Date().toISOString()
    });
  }

  const preference = await createMercadoPagoPreference({
    event,
    userRecord: userRecord || { email, nome: body?.user?.name || body?.user?.nome || email.split('@')[0] },
    planRecord,
    paymentRecord
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preferenceId: preference.preferenceId,
      initPoint: preference.initPoint,
      sandboxInitPoint: preference.sandboxInitPoint,
      externalReference: preference.externalReference,
      paymentId: paymentRecord?.id || null,
      publicKey: MERCADO_PAGO_PUBLIC_KEY,
      environment: MERCADO_PAGO_ENV
    })
  };
}

async function handleMercadoPagoConfirm(body, query) {
  const payload = { ...query, ...(body || {}) };
  const paymentId = payload.paymentId || payload.payment_id || payload.collection_id || payload.id || payload['data.id'] || body?.data?.id || null;
  const externalReference = payload.externalReference || payload.external_reference || null;
  const fallbackStatus = payload.status || payload.collection_status || null;

  if (!paymentId && !externalReference) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'paymentId ou external_reference e obrigatorio' }) };
  }

  const result = await confirmMercadoPagoPayment({
    paymentId: paymentId ? String(paymentId) : null,
    externalReference,
    fallbackStatus
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      status: result.normalizedStatus,
      payment: result.paymentRecord || null,
      mercadoPagoPaymentId: result.mercadoPagoPayment?.id || paymentId || null,
      userPlanUpdated: result.userPlanUpdated,
      emailResult: result.emailResult
    })
  };
}

async function handleMercadoPagoWebhook(body, query) {
  const notification = extractMercadoPagoNotificationData(query, body || {});
  const shouldProcess = notification.paymentId && (!notification.type || notification.type === 'payment');

  const result = shouldProcess
    ? await confirmMercadoPagoPayment({
      paymentId: notification.paymentId,
      externalReference: notification.externalReference,
      fallbackStatus: notification.status
    })
    : null;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      received: true,
      processed: Boolean(result),
      paymentId: notification.paymentId,
      status: result?.normalizedStatus || notification.status || null
    })
  };
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
  return 'recusado';
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

async function fetchAuthAdminUserByEmail(email) {
  if (!email) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Auth admin lookup falhou (HTTP ${response.status})`);
  }
  const payload = await response.json().catch(() => ({}));
  const users = Array.isArray(payload?.users) ? payload.users : [];
  return users.length ? users[0] : null;
}

async function reactivateSoftDeletedAuthUser({ uid, email, newPassword }) {
  if (!uid) return { reactivated: false, reason: 'missing-uid' };
  const patchPayload = { deleted_at: null, banned_until: null };
  if (newPassword) patchPayload.password = newPassword;
  const patchResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patchPayload)
  });
  if (!patchResponse.ok) {
    const errBody = await patchResponse.text().catch(() => '');
    throw new Error(`Falha ao reativar usuário (HTTP ${patchResponse.status}) ${errBody}`.trim());
  }
  return { reactivated: true };
}

async function deleteAuthAdminUserById(uid) {
  if (!uid) return { deleted: false, reason: 'missing-uid' };
  const deleteResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    const errBody = await deleteResponse.text().catch(() => '');
    throw new Error(`Falha ao remover usuário do auth (HTTP ${deleteResponse.status}) ${errBody}`.trim());
  }
  return { deleted: true, status: deleteResponse.status };
}

async function createAuthAdminUser({ email, password, userMetadata, emailConfirm = false, autoConfirm = false }) {
  if (!email) return { created: false, reason: 'missing-email' };
  const payload = {
    email: String(email).trim().toLowerCase(),
    email_confirm: Boolean(emailConfirm || autoConfirm),
    confirm: Boolean(emailConfirm || autoConfirm)
  };
  if (password) payload.password = String(password);
  if (userMetadata && typeof userMetadata === 'object') payload.user_metadata = userMetadata;

  const createResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) {
    const message =
      (body && (body.msg || body.message || body.error_description || body.error)) ||
      createResponse.statusText;
    return {
      created: false,
      status: createResponse.status,
      error: `Falha ao criar usuário no auth (HTTP ${createResponse.status}) ${message}`.trim(),
      raw: body
    };
  }

  return {
    created: true,
    status: createResponse.status,
    user: body
  };
}

async function handleAuthReactivateUser(event, body) {
  const email = String(body?.email || '').trim().toLowerCase();
  const newPassword = body?.password ? String(body.password) : null;
  const userType = body?.user_type ? String(body.user_type).trim().toLowerCase() : null;
  const redirectTo = body?.emailRedirectTo || `${APP_BASE_URL}/pages/entrar.html`;
  const probeOnly = Boolean(body?.probe_only);

  if (!email) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'E-mail é obrigatório' })
    };
  }

  let authUser = null;
  try {
    authUser = await fetchAuthAdminUserByEmail(email);
  } catch (err) {
    console.error('[Reactivate] Lookup error:', err.message);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Falha ao consultar conta existente.', reactivated: false })
    };
  }

  if (!authUser) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reactivated: false, status: 'not-found', exists: false, deleted: false })
    };
  }

  const isDeleted = Boolean(authUser.deleted_at);

  if (probeOnly) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reactivated: false,
        status: isDeleted ? 'deleted' : 'active',
        exists: true,
        deleted: isDeleted,
        active: !isDeleted,
        alreadyActive: !isDeleted
      })
    };
  }

  if (!isDeleted) {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Já existe uma conta ativa cadastrada com este e-mail.', reactivated: false, status: 'already-active', exists: true, deleted: false })
    };
  }

  try {
    const result = await reactivateSoftDeletedAuthUser({
      uid: authUser.id,
      email,
      newPassword
    });
    if (!result.reactivated) throw new Error('Falha interna na reativação');

    const resendResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}/reauthenticate`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    }).catch(() => null);

    try {
      await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY },
        body: JSON.stringify({ email, redirectTo })
      }).catch(() => null);
    } catch (_) {}

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reactivated: true,
        status: 'reactivated',
        userId: authUser.id,
        emailSent: resendResponse?.ok || false
      })
    };
  } catch (err) {
    console.error('[Reactivate] Patch error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Falha ao reativar a conta.', reactivated: false })
    };
  }
}

async function handleAdminSignupUser(event, body) {
  const email = String(body?.email || '').trim().toLowerCase();
  const password = body?.password ? String(body.password) : null;
  const userType = body?.user_type ? String(body.user_type).trim().toLowerCase() : null;
  const name = body?.name ? String(body.name).trim() : null;
  const phone = body?.phone ? String(body.phone).trim() : null;
  const cpf = body?.cpf ? String(body.cpf).trim() : null;
  const emailRedirectTo =
    body?.emailRedirectTo ||
    body?.email_redirect_to ||
    `${APP_BASE_URL}/pages/entrar.html`;

  if (!email) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'E-mail é obrigatório.' })
    };
  }

  let existingAuth = null;
  try {
    existingAuth = await fetchAuthAdminUserByEmail(email);
  } catch (_) {}

  if (existingAuth && !existingAuth.deleted_at) {
    return {
      statusCode: 409,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Já existe uma conta cadastrada com este e-mail.',
        status: 'already-active',
        email,
        exists: true
      })
    };
  }

  let reactivated = false;
  let authUser = existingAuth || null;
  if (existingAuth && existingAuth.deleted_at) {
    try {
      const result = await reactivateSoftDeletedAuthUser({
        uid: existingAuth.id,
        email,
        newPassword: password
      });
      if (result?.reactivated) {
        reactivated = true;
        authUser = { ...existingAuth };
      }
    } catch (reactivateErr) {
      console.warn('[AdminSignup] Reativacao falhou:', reactivateErr?.message);
    }
  }

  if (!authUser || reactivated === false) {
    const userMetadata = {
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(cpf ? { cpf } : {}),
      ...(userType ? { user_type: userType } : {})
    };
    const createResult = await createAuthAdminUser({
      email,
      password,
      userMetadata,
      emailConfirm: false,
      autoConfirm: false
    });
    if (!createResult.created) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: createResult.error || 'Falha ao criar conta.',
          status: 'admin-create-failed'
        })
      };
    }
    authUser = createResult.user || null;
  }

  if (!authUser?.id) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Usuario nao retornado pelo auth.', status: 'no-user' })
    };
  }

  try {
    await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ email, redirectTo: emailRedirectTo })
    }).catch(() => null);

    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(authUser.id)}/reauthenticate`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    }).catch(() => null);
  } catch (_) {}

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      created: true,
      reactivated,
      status: reactivated ? 'reactivated' : 'created',
      user: { id: authUser.id, email, role: authUser.role || 'authenticated' }
    })
  };
}

async function handleCreateScheduledAssembly(event, body) {
  const payload = body || {};

  if (!hasSupabaseAdminConfig()) {
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      error:
        'SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor.'
    })
  };
}

  const title = String(payload.title || '').trim();
  const date = String(payload.date || '').trim();
  const startTime = String(payload.start_time || payload.startTime || '').trim();
  const cep = normalizeCepForDatabase(payload.cep);
  const createdBy = String(payload.created_by || payload.createdBy || '').trim().toLowerCase();

  if (!title || !date || !startTime || !cep) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Campos obrigatórios ausentes: título, data, horário e CEP do condomínio.' })
    };
  }

  if (!createdBy) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Usuário criador não identificado. Refaça o login e tente novamente.' })
    };
  }

  let callerEmail = null;
  const rawAuthHeader =
    (event.headers && (event.headers['Authorization'] || event.headers['authorization'])) ||
    (event.multiValueHeaders && (
      (event.multiValueHeaders['Authorization'] && event.multiValueHeaders['Authorization'][0]) ||
      (event.multiValueHeaders['authorization'] && event.multiValueHeaders['authorization'][0])
    )) ||
    null;

  if (rawAuthHeader) {
    const tokenMatch = String(rawAuthHeader).match(/Bearer\s+(\S+)/i);
    if (tokenMatch && tokenMatch[1]) {
      try {
        const userInfo = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          method: 'GET',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${tokenMatch[1]}`
          }
        }).then(async (r) => (r.ok ? r.json().catch(() => null) : null));
        callerEmail = userInfo?.email ? String(userInfo.email).trim().toLowerCase() : null;
      } catch (_) {
        callerEmail = null;
      }
    }
  }

  if (callerEmail && callerEmail !== createdBy) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'O usuário autenticado não corresponde ao criador informado.' })
    };
  }

  if (!callerEmail) {
    const matchingUsers = await fetchSupabaseUsersByEmail(createdBy);
    const isKnownUser = Array.isArray(matchingUsers) && matchingUsers.length > 0;
    if (!isKnownUser) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Usuário criador não encontrado. Refaça o login e tente novamente.' })
      };
    }
  }

  const insertPayload = {
    cep,
    title,
    description: payload.description ?? null,
    date,
    start_time: startTime,
    end_time: payload.end_time || payload.endTime || startTime,
    created_by: createdBy,
    assembly_type: payload.assembly_type || payload.assemblyType || 'ordinaria',
    status: payload.status || 'agendada'
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_assemblies`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(insertPayload)
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

    if (!response.ok) {
      const message = (data && (data.message || data.error)) || `Erro HTTP ${response.status} ao salvar`;
      console.error('[AssemblyCreate] Supabase insert error:', response.status, message);
      return {
        statusCode: response.status >= 400 && response.status < 500 ? response.status : 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: message })
      };
    }

    const result = Array.isArray(data) ? data[0] : (data || insertPayload);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
  } catch (err) {
    console.error('[AssemblyCreate] Network/Supabase error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Falha ao salvar a assembleia no banco.' })
    };
  }
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
    if (p.startsWith('/users') || p.startsWith('/register') || p.startsWith('/condominiums') || p.startsWith('/pagamento') || p.startsWith('/reserva') || p.startsWith('/plano') || p.startsWith('/forgot') || p.startsWith('/reset') || p.startsWith('/user_condominiums') || p.startsWith('/esqueceu-senha') || p.startsWith('/mercadopago')) {
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
      const normalizedEmail = String(email).trim().toLowerCase();
      let authDeleteResult = { skipped: true };
      try {
        const authUser = await fetchAuthAdminUserByEmail(normalizedEmail);
        if (authUser?.id) {
          authDeleteResult = await deleteAuthAdminUserById(authUser.id);
        }
      } catch (authErr) {
        console.warn('[DELETE /users] Aviso ao remover auth.user:', authErr?.message || authErr);
      }
      const result = await proxySupabaseRequest(null, `/users?email=eq.${encodeURIComponent(normalizedEmail)}`, 'DELETE');
      return {
        statusCode: result.status,
        headers,
        body: JSON.stringify({
          ...(result.data || {}),
          authDeleted: authDeleteResult.deleted || false,
          authSkipped: authDeleteResult.skipped || false
        })
      };
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

    if (pathname === '/plano' && rawMethod === 'GET') {
      const result = await proxySupabaseRequest(null, '/plano?select=*', 'GET');
      return { statusCode: result.status, headers, body: JSON.stringify(result.data) };
    }

    if (pathname === '/mercadopago/config' && rawMethod === 'GET') {
      const result = await handleMercadoPagoConfig();
      return { ...result, headers: { ...headers, ...(result.headers || {}) } };
    }

    if (pathname === '/mercadopago/preference' && rawMethod === 'POST') {
      const result = await handleMercadoPagoPreference(event, body || {});
      return { ...result, headers: { ...headers, ...(result.headers || {}) } };
    }

    if (pathname === '/mercadopago/confirm' && (rawMethod === 'GET' || rawMethod === 'POST')) {
      const result = await handleMercadoPagoConfirm(body || {}, query);
      return { ...result, headers: { ...headers, ...(result.headers || {}) } };
    }

    if (pathname === '/mercadopago/webhook' && rawMethod === 'POST') {
      const result = await handleMercadoPagoWebhook(body || {}, query);
      return { ...result, headers: { ...headers, ...(result.headers || {}) } };
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

    if ((pathname === '/auth/reactivate-user' || pathname === '/auth/reativar-usuario') && rawMethod === 'POST') {
      return await handleAuthReactivateUser(event, body);
    }

    if ((pathname === '/auth/admin/signup' || pathname === '/auth/signup-admin' || pathname === '/auth/cadastro-admin' || pathname === '/signup-admin' || pathname === '/cadastro-admin') && rawMethod === 'POST') {
      return await handleAdminSignupUser(event, body);
    }

    if ((pathname === '/assemblies' || pathname === '/agendar-assembleia' || pathname === '/scheduled-assemblies') && rawMethod === 'POST') {
      return await handleCreateScheduledAssembly(event, body);
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
