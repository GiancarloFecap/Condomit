(() => {
  const ICONS = {
    success: 'fa-check',
    error: 'fa-xmark',
    warning: 'fa-exclamation',
    info: 'fa-info'
  };

  const TITLES = {
    success: 'Sucesso',
    error: 'Erro',
    warning: 'Atenção',
    info: 'Informação'
  };

  function ensureStyles() {
    if (document.getElementById('condomit-alert-style-014')) return;
    const style = document.createElement('style');
    style.id = 'condomit-alert-style-014';
    style.textContent = `
      .condomit-toast-container{position:fixed;top:20px;right:20px;z-index:2147483000;width:min(475px,calc(100vw - 32px));display:flex;flex-direction:column;gap:12px;pointer-events:none}
      .condomit-toast{--accent:#2563eb;pointer-events:auto;position:relative;display:grid;grid-template-columns:30px 1fr 28px;gap:14px;align-items:start;background:#fff;color:#111827;border-radius:16px;border-left:6px solid var(--accent);padding:20px 18px 20px 22px;box-shadow:0 12px 36px rgba(15,23,42,.18),0 2px 8px rgba(15,23,42,.08);animation:condomitToastIn .24s ease-out;overflow:hidden}
      .condomit-toast[data-type="success"]{--accent:#16a34a}.condomit-toast[data-type="error"]{--accent:#dc2626}.condomit-toast[data-type="warning"]{--accent:#d97706}.condomit-toast[data-type="info"]{--accent:#2563eb}
      .condomit-toast-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:14px;margin-top:1px}
      .condomit-toast-title{font-weight:800;font-size:16px;line-height:1.3;margin:1px 0 7px}.condomit-toast-message{font-size:16px;line-height:1.6;color:#667085;white-space:pre-wrap;overflow-wrap:anywhere}
      .condomit-toast-close{border:0;background:transparent;color:#98a2b3;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:18px;display:grid;place-items:center;padding:0}.condomit-toast-close:hover{background:#f2f4f7;color:#475467}
      .condomit-toast.is-leaving{animation:condomitToastOut .2s ease-in forwards}
      @keyframes condomitToastIn{from{opacity:0;transform:translateY(-12px) scale(.98)}to{opacity:1;transform:none}}
      @keyframes condomitToastOut{to{opacity:0;transform:translateY(-8px) scale(.98)}}
      @media(max-width:600px){.condomit-toast-container{top:12px;right:12px;width:calc(100vw - 24px)}.condomit-toast{padding:16px 14px;grid-template-columns:28px 1fr 26px}.condomit-toast-message{font-size:14px}}
      html[data-theme="dark"] .condomit-toast{background:#111827;color:#f8fafc;box-shadow:0 12px 36px rgba(0,0,0,.4)}
      html[data-theme="dark"] .condomit-toast-title{color:#f8fafc}html[data-theme="dark"] .condomit-toast-message{color:#cbd5e1}html[data-theme="dark"] .condomit-toast-close:hover{background:#1f2937}
    `;
    document.head.appendChild(style);
  }

  function ensureContainer() {
    ensureStyles();
    let container = document.querySelector('.condomit-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'condomit-toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    return container;
  }

  function normalizeType(type, message) {
    const normalized = String(type || '').toLowerCase();
    if (['success', 'error', 'warning', 'info'].includes(normalized)) return normalized;
    const text = String(message || '').toLowerCase();
    if (/erro|falha|não foi possível|bloquead|inválid|expirou|negad/.test(text)) return 'error';
    if (/sucesso|salv|cadastrad|publicad|atualizad|concluíd|liberad/.test(text)) return 'success';
    if (/atenção|aviso|preencha|confirme|selecione|obrigatóri/.test(text)) return 'warning';
    return 'info';
  }

  function showToast(message, type = 'info', options = {}) {
    const text = String(message ?? '');
    const finalType = normalizeType(type, text);
    const title = options?.title || TITLES[finalType];
    const duration = Number.isFinite(Number(options?.duration))
      ? Number(options.duration)
      : (finalType === 'error' ? 6500 : 4800);

    const toast = document.createElement('div');
    toast.className = 'condomit-toast';
    toast.dataset.type = finalType;
    toast.setAttribute('role', finalType === 'error' || finalType === 'warning' ? 'alert' : 'status');
    toast.innerHTML = `
      <div class="condomit-toast-icon"><i class="fas ${ICONS[finalType]}"></i></div>
      <div><div class="condomit-toast-title"></div><div class="condomit-toast-message"></div></div>
      <button type="button" class="condomit-toast-close" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
    `;
    toast.querySelector('.condomit-toast-title').textContent = title;
    toast.querySelector('.condomit-toast-message').textContent = text;

    let timer = null;
    const close = () => {
      if (toast.classList.contains('is-leaving')) return;
      toast.classList.add('is-leaving');
      if (timer) clearTimeout(timer);
      setTimeout(() => toast.remove(), 210);
    };
    toast.querySelector('.condomit-toast-close')?.addEventListener('click', close);
    ensureContainer().appendChild(toast);
    if (duration > 0) timer = setTimeout(close, duration);
    return { close, element: toast };
  }

  window.showToast = showToast;
  window.alert = (message) => {
    showToast(message, normalizeType('', message));
  };
})();
