const crypto = require('crypto');
const { BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || '';
const SUPPORT_EMAIL = process.env.BREVO_RECIPIENT_EMAIL || process.env.CONDOMIT_SUPPORT_EMAIL || 'contato.condomit@gmail.com';
const brevoClient = BREVO_API_KEY ? new BrevoClient({ apiKey: BREVO_API_KEY, environment: BrevoEnvironment.Production }) : null;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function escapeHtml(value) { return clean(value, 4000).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método não permitido.' });
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return json(400, { error: 'Corpo da solicitação inválido.' }); }
  if (clean(body.website, 200)) return json(200, { ok: true }); // honeypot
  const email = clean(body.email, 254).toLowerCase();
  const reason = clean(body.reason, 1200);
  if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: 'E-mail inválido.' });
  if (!brevoClient || !BREVO_SENDER_EMAIL) return json(503, { error: 'Serviço de e-mail não configurado. Entre em contato pelo suporte.' });
  const requestId = crypto.randomBytes(8).toString('hex');
  await brevoClient.transactionalEmails.sendTransacEmail({
    sender: { name: 'Condomit', email: BREVO_SENDER_EMAIL },
    replyTo: { email },
    to: [{ email: SUPPORT_EMAIL }],
    subject: `Solicitação de exclusão de conta — ${requestId}`,
    htmlContent: `<h2>Solicitação de exclusão de conta</h2><p><strong>Protocolo:</strong> ${requestId}</p><p><strong>E-mail informado:</strong> ${escapeHtml(email)}</p><p><strong>Informações adicionais:</strong><br>${escapeHtml(reason || 'Não informado.').replace(/\n/g,'<br>')}</p><p>Verifique a identidade do solicitante antes de realizar qualquer exclusão.</p>`
  });
  return json(202, { ok: true, requestId });
};
