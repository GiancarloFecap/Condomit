(function () {
  'use strict';

  const STORAGE_KEY = 'app-theme';
  const THEMES = new Set(['light', 'dark']);

  function normalize(value) {
    return THEMES.has(value) ? value : 'light';
  }

  function getSavedTheme() {
    try { return normalize(localStorage.getItem(STORAGE_KEY)); } catch (_) { return 'light'; }
  }

  function iconMarkup(theme) {
    if (theme === 'dark') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.6 8.6 0 0 1 8.9 3.8a8.7 8.7 0 1 0 11.3 11.3Z" fill="currentColor"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  function syncButtons(theme) {
    document.querySelectorAll('.theme-icon-toggle').forEach((button) => {
      button.innerHTML = iconMarkup(theme);
      button.dataset.theme = theme;
      button.setAttribute('aria-label', theme === 'dark' ? 'Modo escuro ativo. Alterar para modo claro' : 'Modo claro ativo. Alterar para modo escuro');
      button.setAttribute('title', theme === 'dark' ? 'Modo escuro' : 'Modo claro');
    });
  }

  function applyTheme(theme, persist) {
    const normalized = normalize(theme);
    document.documentElement.setAttribute('data-theme', normalized);
    document.documentElement.style.colorScheme = normalized;
    if (persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, normalized); } catch (_) {}
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', normalized === 'dark' ? '#0B1120' : '#2252BD');
    if (document.readyState !== 'loading') syncButtons(normalized);
    window.dispatchEvent(new CustomEvent('condomit:theme-changed', { detail: { theme: normalized } }));
    return normalized;
  }

  function toggleTheme() {
    const current = normalize(document.documentElement.getAttribute('data-theme') || getSavedTheme());
    return applyTheme(current === 'dark' ? 'light' : 'dark', true);
  }

  // Apply before first paint whenever this script is loaded in <head>.
  applyTheme(getSavedTheme(), false);

  document.addEventListener('DOMContentLoaded', function () {
    const current = normalize(document.documentElement.getAttribute('data-theme') || getSavedTheme());
    syncButtons(current);
    document.querySelectorAll('.theme-icon-toggle').forEach((button) => {
      if (button.dataset.themeBound === '1') return;
      button.dataset.themeBound = '1';
      button.addEventListener('click', toggleTheme);
    });
  });

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY && event.newValue) applyTheme(event.newValue, false);
  });

  // Keep buttons synchronized when older project code changes data-theme directly.
  new MutationObserver(function () {
    if (document.readyState === 'loading') return;
    syncButtons(normalize(document.documentElement.getAttribute('data-theme')));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.condomitTheme = { apply: applyTheme, toggle: toggleTheme, current: () => normalize(document.documentElement.getAttribute('data-theme')) };
})();
