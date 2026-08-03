import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.111.0';

const supabaseUrl = window.SUPABASE_URL;
const supabaseAnonKey = window.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase não configurado');
}

if (!window.supabase) {
  window.supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
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
  const { data } = window.supabase.auth.onAuthStateChange((_event, session) => {
    syncSessionToStorage(session);
  });
  window.__supabaseAuthSubscription = data?.subscription || null;
} catch (_) {}

try {
  const { data } = await window.supabase.auth.getSession();
  syncSessionToStorage(data?.session || null);
} catch (_) {}

