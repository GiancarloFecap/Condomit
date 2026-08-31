(() => {
  'use strict';
  const isNative = (() => { try { return Boolean(window.Capacitor?.isNativePlatform?.()); } catch (_) { return false; } })();
  const buttons = () => Array.from(document.querySelectorAll('[data-install-condomit]'));
  let deferredPrompt = null;

  function setInstallVisible(visible) {
    for (const button of buttons()) button.hidden = !visible;
  }

  if (!isNative && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((error) => {
        console.warn('[Condomit PWA] Service Worker não registrado:', error?.message || error);
      });
    });
  }

  if (isNative || window.matchMedia?.('(display-mode: standalone)')?.matches) {
    setInstallVisible(false);
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setInstallVisible(true);
  });

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-install-condomit]');
    if (!button) return;
    if (!deferredPrompt) {
      const lang = (() => { try { return localStorage.getItem('app-language') === 'en' ? 'en' : 'pt'; } catch (_) { return 'pt'; } })();
      window.showToast?.(lang === 'en' ? 'Use your browser’s “Install app” option when it becomes available.' : 'Use a opção “Instalar aplicativo” do navegador quando ela estiver disponível.', 'info');
      return;
    }
    button.disabled = true;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      setInstallVisible(false);
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallVisible(false);
  });
})();
