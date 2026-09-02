const webpush = require('web-push');

const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://zoplefkruidaxeapnrjp.supabase.co').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || 'mailto:contato.condomit@gmail.com').trim();

function adminHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: adminHeaders(options.headers || {})
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Supabase ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '');
}

function preferenceAllows(notification, preference, subscription, actorRoleMap) {
  const category = String(notification?.category || '').trim().toLowerCase();
  const prefs = preference || {};
  const currentRoleRaw = String(subscription?.user_role || '').trim().toLowerCase();
  const currentRole = currentRoleRaw.startsWith('sind') ? 'sindico' : currentRoleRaw.startsWith('porteir') ? 'porteiro' : 'morador';
  const actorRoleRaw = String(actorRoleMap?.get(normalizeEmail(notification?.created_by)) || '').trim().toLowerCase();
  const actorRole = actorRoleRaw.startsWith('sind') ? 'sindico' : actorRoleRaw.startsWith('porteir') ? 'porteiro' : actorRoleRaw ? 'morador' : '';
  if (category === 'chat' && prefs.counterpart_messages === false) return false;
  if (currentRole === 'sindico' && actorRole === 'morador' && prefs.counterpart_messages === false) return false;
  if (currentRole !== 'sindico' && actorRole === 'sindico' && prefs.counterpart_messages === false) return false;
  if ((category === 'avisos' || category === 'assembleias') && prefs.general_notices === false) return false;
  if (category === 'reservas' && prefs.reservations === false) return false;
  if (category === 'entregas' && prefs.packages === false) return false;
  return true;
}

async function patchSubscription(id, body) {
  await rest(`push_subscriptions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() })
  });
}

async function deliverToSubscription(subscription, notifications, preference, actorRoleMap) {
  const email = normalizeEmail(subscription.user_email);
  const cep = normalizeCep(subscription.cep);
  let cursor = Number(subscription.last_notification_id || 0);
  const relevant = notifications.filter((row) => {
    const id = Number(row?.id || 0);
    if (!id || id <= cursor) return false;
    if (normalizeCep(row?.cep) !== cep) return false;
    const recipient = normalizeEmail(row?.recipient_email);
    return !recipient || recipient === email;
  });

  if (!relevant.length) return { sent: 0, cursor };

  let sent = 0;
  for (const row of relevant) {
    const id = Number(row.id || 0);
    if (!preferenceAllows(row, preference, subscription, actorRoleMap)) {
      cursor = Math.max(cursor, id);
      continue;
    }

    const payload = JSON.stringify({
      title: row.title || 'Condomit',
      body: row.description || '',
      tag: `condomit-${id}`,
      notificationId: id,
      url: '/pages/notificacoes.html'
    });

    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload, { TTL: 60 * 60 * 24 });
      sent += 1;
      cursor = Math.max(cursor, id);
    } catch (error) {
      const status = Number(error?.statusCode || error?.status || 0);
      if (status === 404 || status === 410) {
        await patchSubscription(subscription.id, { enabled: false, last_notification_id: id }).catch(() => {});
        return { sent, cursor: id, disabled: true };
      }
      console.error('[Push] falha ao enviar', subscription.id, id, error?.message || error);
      // Mantém o cursor anterior para uma nova tentativa no próximo ciclo.
      break;
    }
  }

  if (cursor > Number(subscription.last_notification_id || 0)) {
    await patchSubscription(subscription.id, { last_notification_id: cursor });
  }
  return { sent, cursor };
}

exports.handler = async () => {
  if (!SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'push_not_configured' }) };
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    const subscriptions = await rest('push_subscriptions?select=*&enabled=eq.true&order=id.asc&limit=1000');
    if (!Array.isArray(subscriptions) || !subscriptions.length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, subscriptions: 0, sent: 0 }) };
    }

    const minCursor = subscriptions.reduce((min, row) => Math.min(min, Number(row.last_notification_id || 0)), Number.MAX_SAFE_INTEGER);
    const notifications = await rest(`notifications?select=id,cep,category,title,description,recipient_email,created_by,event_type,created_at&id=gt.${Math.max(0, minCursor)}&order=id.asc&limit=2000`);
    const preferences = await rest('user_notification_preferences?select=user_email,counterpart_messages,general_notices,reservations,packages&limit=2000').catch(() => []);
    const preferenceMap = new Map((Array.isArray(preferences) ? preferences : []).map((row) => [normalizeEmail(row.user_email), row]));
    const users = await rest('users?select=email,user_type&limit=5000').catch(() => []);
    const actorRoleMap = new Map((Array.isArray(users) ? users : []).map((row) => [normalizeEmail(row.email), String(row.user_type || '').toLowerCase()]));

    let sent = 0;
    let disabled = 0;
    for (const subscription of subscriptions) {
      const result = await deliverToSubscription(
        subscription,
        Array.isArray(notifications) ? notifications : [],
        preferenceMap.get(normalizeEmail(subscription.user_email)) || null,
        actorRoleMap
      );
      sent += result.sent || 0;
      if (result.disabled) disabled += 1;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, subscriptions: subscriptions.length, sent, disabled })
    };
  } catch (error) {
    console.error('[Push dispatcher]', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error?.message || 'push_dispatch_failed' }) };
  }
};
