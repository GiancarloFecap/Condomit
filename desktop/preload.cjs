'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const progressListeners = new Set();
ipcRenderer.on('condomit:update-progress', (_event, payload) => {
  for (const callback of progressListeners) {
    try { callback(payload); } catch (_) {}
  }
});

contextBridge.exposeInMainWorld('CondomitDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke('condomit:desktop-info'),
  checkForUpdates: () => ipcRenderer.invoke('condomit:check-updates'),
  installUpdate: () => ipcRenderer.invoke('condomit:install-update'),
  onUpdateProgress(callback) {
    if (typeof callback !== 'function') return () => {};
    progressListeners.add(callback);
    return () => progressListeners.delete(callback);
  }
}));

function hideDesktopDownloadEntryPoints() {
  try {
    const pathname = String(location.pathname || '').toLowerCase();
    if (pathname.endsWith('/pages/download-desktop.html') || pathname.endsWith('/download-desktop.html')) {
      location.replace(new URL('/inicio.html', location.origin).toString());
      return;
    }

    const hide = () => {
      document.querySelectorAll('a[href*="download-desktop"], [data-condomit-desktop-download]').forEach((element) => {
        element.hidden = true;
        element.style.setProperty('display', 'none', 'important');
        element.setAttribute('aria-hidden', 'true');
      });
      const pwaInstall = document.getElementById('installPwaBtn');
      if (pwaInstall) {
        const card = pwaInstall.closest('.panel-card');
        (card || pwaInstall).hidden = true;
        (card || pwaInstall).style.setProperty('display', 'none', 'important');
      }
    };
    hide();
    const observer = new MutationObserver(hide);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', hideDesktopDownloadEntryPoints, { once: true });
} else {
  hideDesktopDownloadEntryPoints();
}
