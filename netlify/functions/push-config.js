const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();

exports.handler = async () => ({
  statusCode: VAPID_PUBLIC_KEY ? 200 : 503,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  },
  body: JSON.stringify(VAPID_PUBLIC_KEY
    ? { ok: true, publicKey: VAPID_PUBLIC_KEY }
    : { ok: false, error: 'Web Push ainda não foi configurado no servidor.' })
});
