(() => {
  const overlays = [...document.querySelectorAll('[data-assembly-dialog]')];
  let previousFocus = null;
  function close() {
    overlays.forEach(overlay => { overlay.hidden = true; overlay.querySelector('.assembly-dialog').hidden = true; });
    document.body.classList.remove('assembly-dialog-open');
    previousFocus?.focus?.({ preventScroll: true });
  }
  function open(name) {
    const overlay = overlays.find(item => item.dataset.assemblyDialog === name);
    if (!overlay) return;
    previousFocus = document.activeElement;
    overlays.forEach(item => { item.hidden = item !== overlay; item.querySelector('.assembly-dialog').hidden = item !== overlay; });
    overlay.hidden = false;
    document.body.classList.add('assembly-dialog-open');
    if (name === 'scheduled' || name === 'past') window.loadScheduledAssemblies?.();
    requestAnimationFrame(() => overlay.querySelector('[data-close-assembly-dialog]')?.focus());
  }
  document.querySelectorAll('[data-open-assembly-dialog]').forEach(button =>
    button.addEventListener('click', () => open(button.dataset.openAssemblyDialog)));
  overlays.forEach(overlay => {
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.closest('[data-close-assembly-dialog]')) close(); });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlays.some(overlay => !overlay.hidden)) { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const active = overlays.find(overlay => !overlay.hidden);
      if (!active) return;
      const items = [...active.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
  });
  window.closeAssemblyDialog = close;
  window.openAssemblyDialog = open;
})();
