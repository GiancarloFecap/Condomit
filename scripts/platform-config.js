(function () {
  'use strict';

  const BACKEND_ORIGIN = 'https://condomit.netlify.app';

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
