import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../scripts/supabase-auth.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\s*/m, '');

function makeStore(entries = []) {
  const map = new Map(entries);
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.get(k) ?? null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

async function createHarness(remember = false) {
  const localStorage = makeStore([
    ['condomitRememberMe', remember ? '1' : '0'],
    ['sb-instance-auth-token', '{"old":"legacy"}']
  ]);
  const sessionStorage = makeStore();
  let storage;
  const window = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'public-key'
  };
  const createClient = (_, __, options) => {
    storage = options.auth.storage;
    return { auth: {
      onAuthStateChange() { return { data: { subscription: null } }; },
      async getSession() { return { data: { session: null } }; }
    }};
  };
  const context = { window, localStorage, sessionStorage, createClient, console };
  await runInNewContext(`(async()=>{ ${source} })()`, context);
  return { window, storage, localStorage, sessionStorage };
}

{
  const ctx = await createHarness(false);
  assert.equal(ctx.localStorage.getItem('sb-instance-auth-token'), null, 'legacy session must not auto-restore');
  ctx.storage.setItem('sb-instance-auth-token', 'session-only');
  assert.equal(ctx.sessionStorage.getItem('sb-instance-auth-token'), 'session-only');
  assert.equal(ctx.localStorage.getItem('sb-instance-auth-token'), null);
  ctx.window.condomitSetRememberMe(true);
  ctx.storage.setItem('sb-instance-auth-token', 'remembered');
  assert.equal(ctx.localStorage.getItem('sb-instance-auth-token'), 'remembered');
  assert.equal(ctx.sessionStorage.getItem('sb-instance-auth-token'), null);
  ctx.window.condomitSetRememberMe(false);
  assert.equal(ctx.localStorage.getItem('sb-instance-auth-token'), null);
  ctx.storage.setItem('sb-instance-auth-token', 'again-session');
  assert.equal(ctx.sessionStorage.getItem('sb-instance-auth-token'), 'again-session');
  ctx.storage.removeItem('sb-instance-auth-token');
  assert.equal(ctx.sessionStorage.getItem('sb-instance-auth-token'), null);
}
{
  const ctx = await createHarness(true);
  assert.equal(ctx.storage.getItem('sb-instance-auth-token'), '{"old":"legacy"}', 'remembered session may restore');
}
console.log('[061] OK — desmarcado usa sessionStorage; marcado usa localStorage; troca e logout limpam tokens.');
