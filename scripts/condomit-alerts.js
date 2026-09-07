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
      .condomit-toast-container{position:fixed;top:max(14px,env(safe-area-inset-top));right:14px;z-index:2147483000;width:min(410px,calc(100vw - 28px));display:flex;flex-direction:column;gap:9px;pointer-events:none}
      .condomit-toast{--accent:#2252BD;pointer-events:auto;position:relative;display:grid;grid-template-columns:26px 1fr 30px;gap:11px;align-items:start;background:rgba(251,252,254,.90);color:#16243b;border-radius:15px;border:1px solid rgba(23,52,103,.14);padding:14px;box-shadow:0 14px 38px rgba(10,32,72,.16);backdrop-filter:saturate(160%) blur(20px);-webkit-backdrop-filter:saturate(160%) blur(20px);animation:condomitToastIn .2s ease-out;overflow:hidden}
      .condomit-toast[data-type="success"]{--accent:#16855b}.condomit-toast[data-type="error"]{--accent:#b42318}.condomit-toast[data-type="warning"]{--accent:#b56610}.condomit-toast[data-type="info"]{--accent:#2252BD}
      .condomit-toast-icon{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 12%,white);color:var(--accent);font-size:12px;margin-top:1px}
      .condomit-toast-title{font-weight:700;font-size:14px;line-height:1.3;margin:1px 0 3px}.condomit-toast-message{font-size:13px;line-height:1.45;color:#53647c;white-space:pre-wrap;overflow-wrap:anywhere}
      .condomit-toast-close{border:0;background:transparent;color:#77869b;width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:16px;display:grid;place-items:center;padding:0}.condomit-toast-close:hover{background:rgba(51,96,242,.08);color:#2252BD}
      .condomit-toast.is-leaving{animation:condomitToastOut .16s ease-in forwards}
      @keyframes condomitToastIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
      @keyframes condomitToastOut{to{opacity:0;transform:translateY(-4px)}}
      @media(max-width:600px){.condomit-toast-container{top:max(10px,env(safe-area-inset-top));right:10px;width:calc(100vw - 20px)}.condomit-toast{padding:13px;grid-template-columns:26px 1fr 30px}}
      html[data-theme="dark"] .condomit-toast{background:rgba(23,36,58,.92);color:#f3f7fd;border-color:rgba(181,203,235,.16);box-shadow:0 14px 38px rgba(0,0,0,.28)}
      html[data-theme="dark"] .condomit-toast-title{color:#f3f7fd}html[data-theme="dark"] .condomit-toast-message{color:#c2cee0}html[data-theme="dark"] .condomit-toast-close:hover{background:rgba(111,145,238,.14);color:#b8c9ff}
      @media(prefers-reduced-motion:reduce){.condomit-toast,.condomit-toast.is-leaving{animation:none!important}}
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
      : ((finalType === 'error' || finalType === 'warning') ? 0 : 4600);

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
