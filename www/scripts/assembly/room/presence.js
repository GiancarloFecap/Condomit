import { state } from './state.js?v=079';

async function getAccessToken() {
  return await window.resolveSupabaseAccessToken?.() || null;
}

async function postPresence(payload) {
  const token = await getAccessToken();
  if (!token) throw new Error('Sessão expirada. Entre novamente na sua conta.');
  const send = accessToken => fetch('/.netlify/functions/assembly-presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
    keepalive: payload.event === 'leave'
  });
  let res = await send(token);
  if (res.status === 401) {
    const refreshed = await window.refreshSupabaseAccessToken?.();
    if (refreshed) res = await send(refreshed);
  }
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

