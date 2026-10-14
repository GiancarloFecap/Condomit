(function () {
  'use strict';
  const root = document.getElementById('advancedNav');
  if (!root) return;
  const key = 'condomit-advanced-menu-expanded';
  const groups = [...root.querySelectorAll('[data-nav-group]')];
  const select = (selected) => {
    groups.forEach(group => {
      const open = group === selected;
      group.classList.toggle('expanded', open);
      const toggle = group.querySelector('.advanced-group-toggle');
      toggle?.setAttribute('aria-expanded', String(open));
    });
    try { sessionStorage.setItem(key, selected?.querySelector('.advanced-group-toggle')?.textContent?.trim() || ''); } catch (_) {}
  };
  groups.forEach(group => {
    const button = group.querySelector('.advanced-group-toggle');
    button?.addEventListener('click', () => select(group.classList.contains('expanded') ? null : group));
  });
  const stored = (() => { try { return sessionStorage.getItem(key) || ''; } catch (_) { return ''; } })();
  if (stored) select(groups.find(group => group.querySelector('.advanced-group-toggle')?.textContent.trim() === stored) || null);

  const overlay = document.getElementById('advancedOperationModal');
  const body = document.getElementById('advOperationBody');
  const title = document.getElementById('advOperationTitle');
  let opened = null;
  let previousFocus = null;
  function close() {
    if (!overlay || !opened) return;
    opened.placeholder.replaceWith(opened.node);
    opened = null;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('advanced-dialog-open');
    previousFocus?.focus();
  }
  document.querySelectorAll('[data-module-dialog]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.moduleDialog;
      const node = document.querySelector(`[data-dialog-source="${id}"]`);
      if (!node || !overlay || !body) return;
      if (opened) close();
      const placeholder = document.createComment('adv-dialog-original-position');
      node.before(placeholder);
      opened = { node, placeholder };
      previousFocus = button;
      title.textContent = button.textContent.trim();
      body.appendChild(node);
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('advanced-dialog-open');
      overlay.querySelector('[data-adv-dialog-close]')?.focus();
    });
  });
  overlay?.querySelectorAll('[data-adv-dialog-close]').forEach(button => button.addEventListener('click', close));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); close(); } });
  document.querySelectorAll('.adv-dialog-source form').forEach(form => {
    form.addEventListener('submit', () => {
      // Submission handlers are owned by gestao-avancada.js; wait until they complete.
      window.setTimeout(() => { if (opened?.node.contains(form)) close(); }, 1800);
    });
  });
})();
