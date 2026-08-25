(function () {
  'use strict';

  const BACKEND_ORIGIN = 'https://condomit.netlify.app';
  const PERSISTENT_USER_KEY = 'condomitPersistentSessionUser';

  /*
   * O WebView do Android pode recriar o contexto da página quando o app muda
   * de estado. sessionStorage pode desaparecer nesse processo, embora a sessão
   * Supabase continue válida em armazenamento persistente. Restauramos apenas
   * uma cópia sanitizada do perfil (nunca senha/token) antes dos scripts de
   * cada página verificarem se há usuário logado.
   */
  function restorePersistentUserSnapshot() {
    try {
      if (sessionStorage.getItem('condominiumUser')) return;
      const raw = localStorage.getItem(PERSISTENT_USER_KEY);
      if (!raw) return;
      const user = JSON.parse(raw);
      if (!user || typeof user !== 'object' || !user.email) return;
      delete user.password;
      sessionStorage.setItem('condominiumUser', JSON.stringify(user));
    } catch (_) {}
  }

  restorePersistentUserSnapshot();

  function isNativeApp() {
    try {
      return Boolean(window.Capacitor?.isNativePlatform?.());
    } catch (_) {
      return false;
    }
  }

  function apiUrl(path) {
    const value = String(path || '').trim();
    if (!value) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (!isNativeApp()) return value;

    if (value.startsWith('/.netlify/functions/') || value.startsWith('/api/')) {
      return `${BACKEND_ORIGIN}${value}`;
    }
    return value;
  }

  try {
    document.documentElement.classList.toggle('capacitor-native', isNativeApp());
    if (isNativeApp()) {
      document.documentElement.setAttribute('data-condomit-platform', window.Capacitor?.getPlatform?.() || 'native');
    }
  } catch (_) {}

  window.CondomitPlatform = Object.freeze({
    backendOrigin: BACKEND_ORIGIN,
    isNativeApp,
    apiUrl
  });
  window.condomitApiUrl = apiUrl;

  /* Dentro do Capacitor, rotas serverless relativas precisam apontar para o Netlify.
     No site/PWA o fetch original permanece intacto. */
  if (isNativeApp() && typeof window.fetch === 'function' && !window.__condomitNativeFetchWrapped) {
    const originalFetch = window.fetch.bind(window);
    const shouldProxy = (value) =>
      value.startsWith('/api/') ||
      value.startsWith('/.netlify/functions/') ||
      value === '/esqueceu-senha' ||
      value.startsWith('/esqueceu-senha?');

    window.fetch = function condomitNativeFetch(input, init) {
      if (typeof input === 'string' && shouldProxy(input)) {
        return originalFetch(`${BACKEND_ORIGIN}${input}`, init);
      }
      if (input instanceof URL && input.origin === location.origin && shouldProxy(input.pathname)) {
        const target = new URL(`${input.pathname}${input.search}${input.hash}`, BACKEND_ORIGIN);
        return originalFetch(target, init);
      }
      if (typeof Request !== 'undefined' && input instanceof Request) {
        try {
          const parsed = new URL(input.url);
          if (parsed.origin === location.origin && shouldProxy(parsed.pathname)) {
            const target = new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, BACKEND_ORIGIN);
            return originalFetch(new Request(target, input), init);
          }
        } catch (_) {}
      }
      return originalFetch(input, init);
    };
    window.__condomitNativeFetchWrapped = true;
  }
})();
