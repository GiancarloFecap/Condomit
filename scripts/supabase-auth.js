import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const supabaseUrl = window.SUPABASE_URL;
const supabaseAnonKey = window.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase não configurado');
}

const REMEMBER_KEY = 'condomitRememberMe';
function wantsPersistentSession() {
  try { return localStorage.getItem(REMEMBER_KEY) === '1'; } catch (_) { return false; }
}

function authTokenKeys(store) {
  const keys = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && /^sb-.*-auth-token(?:-code-verifier)?$/i.test(key)) keys.push(key);
    }
  } catch (_) {}
  return keys;
}

function clearAuthTokenKeys(store) {
  authTokenKeys(store).forEach(key => {
    try { store.removeItem(key); } catch (_) {}
  });
}

// A versão anterior usava localStorage sem consentimento. Não reabre essas
// sessões de maneira silenciosa quando o usuário não escolheu Lembrar de mim.
if (!wantsPersistentSession()) {
  try {
    clearAuthTokenKeys(localStorage);
    // Remove também formatos antigos de cache de sessão usados pelo projeto.
    for (const key of [
      'sb-session', 'sb-access-token',
      'condominiumPersistentSession', 'condominiumPersistentUser',
      'condomitPersistentUserV2'
    ]) localStorage.removeItem(key);
  } catch (_) {}
}

const condomitAuthStorage = {
  getItem(key) {
    try { return (wantsPersistentSession() ? localStorage : sessionStorage).getItem(key); } catch (_) { return null; }
  },
  setItem(key, value) {
    try { (wantsPersistentSession() ? localStorage : sessionStorage).setItem(key, value); } catch (_) {}
  },
  removeItem(key) {
    // Desconectar deve limpar as cópias em ambos os lugares.
    try { localStorage.removeItem(key); } catch (_) {}
    try { sessionStorage.removeItem(key); } catch (_) {}
  }
};

window.condomitSetRememberMe = function (remember) {
  try {
    // Deixa de carregar qualquer sessão de outra conta/visita ao mudar de modo.
    clearAuthTokenKeys(localStorage);
    clearAuthTokenKeys(sessionStorage);
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    if (!remember) {
      localStorage.removeItem('condominiumPersistentUser');
      localStorage.removeItem('condominiumPersistentSession');
      localStorage.removeItem('condomitPersistentUserV2');
    }
  } catch (_) {}
};

if (!window.supabase) {
  window.supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      storage: condomitAuthStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

function syncSessionToStorage(session) {
  try {
    if (!session) {
      sessionStorage.removeItem('sb-session');
      sessionStorage.removeItem('sb-access-token');
      return;
    }
    sessionStorage.setItem('sb-session', JSON.stringify(session));
    if (session.access_token) sessionStorage.setItem('sb-access-token', session.access_token);
  } catch (_) {}
}

try {
  const { data } = window.supabase.auth.onAuthStateChange((event, session) => {
    syncSessionToStorage(session);

    if (event === 'SIGNED_OUT') {
      try { sessionStorage.removeItem('condominiumUser'); } catch (_) {}
      try { window.clearPersistedCondomitUser?.(); } catch (_) {}
    }
  });
  window.__supabaseAuthSubscription = data?.subscription || null;
} catch (_) {}

try {
  const { data } = await window.supabase.auth.getSession();
  syncSessionToStorage(data?.session || null);
} catch (_) {}

