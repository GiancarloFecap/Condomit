import { state } from './state.js?v=070';

function getAccessToken() {
  try {
    const t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
    if (t) return t;
  } catch (_) {}
  try {
    const s = sessionStorage.getItem('sb-session') || localStorage.getItem('sb-session');
    if (s) {
      const session = JSON.parse(s);
      if (session?.access_token) return session.access_token;
    }
  } catch (_) {}
  return null;
}

async function postPresence(payload) {
  const token = getAccessToken();
  const res = await fetch('/.netlify/functions/assembly-presence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!res.ok) {
    const msg = data?.error || data?.message || `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function presenceJoin() {
  return postPresence({ assembly_id: state.assemblyId, event: 'join' });
}

export async function presenceHeartbeat() {
  return postPresence({ assembly_id: state.assemblyId, event: 'heartbeat' });
}

export async function presenceLeave() {
  return postPresence({ assembly_id: state.assemblyId, event: 'leave' });
}

export async function presenceReconnect() {
  return postPresence({ assembly_id: state.assemblyId, event: 'reconnect' });
}

