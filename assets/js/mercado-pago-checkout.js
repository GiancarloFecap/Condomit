(function() {
  'use strict';

  const MERCADO_PAGO_CONFIG = {
    popupWidth: 1000,
    popupHeight: 760,
    preferenciaEndpoint: '/.netlify/functions/criar-preferencia'
  };

  let isProcessing = false;

  function mapearNomePlanoParaSlug(planNomeOuId) {
    if (!planNomeOuId) return null;
    const str = String(planNomeOuId).trim().toLowerCase();
    if (str.includes('essencial') || str === '1' || str === 'essencial' || str.includes('básico') || str.includes('basico')) return 'essencial';
    if (str.includes('premium') || str === '3' || str === 'premium') return 'premium';
    if (str.includes('pro') || str === '2' || str === 'pro') return 'pro';
    return null;
  }

  function obterPlanoSelecionadoSlug(contexto) {
    if (contexto && contexto.planoSlugManual) return contexto.planoSlugManual;
    if (contexto && typeof contexto.obterPlanoSelecionado === 'function') {
      const result = contexto.obterPlanoSelecionado();
      if (result) return mapearNomePlanoParaSlug(result);
    }
    const btnAtivo = document.querySelector('[data-mercado-pago-plano]');
    if (btnAtivo) return mapearNomePlanoParaSlug(btnAtivo.getAttribute('data-mercado-pago-plano'));
    const cardSelecionado = document.querySelector('.plan-card-option.selected');
    if (cardSelecionado && cardSelecionado.dataset.planId) {
      return mapearNomePlanoParaSlug(cardSelecionado.dataset.planId);
    }
    if (window.mercadoPagoSelectedPlanSlug) return window.mercadoPagoSelectedPlanSlug;
    return null;
  }

  async function obterUsuarioAutenticado() {
    let sessionUser = null;
    try {
      const cached = sessionStorage.getItem('condominiumUser');
      if (cached) sessionUser = JSON.parse(cached);
    } catch (_) {}

    let supabaseUser = null;
    if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.auth === 'object' && typeof window.supabase.auth.getUser === 'function') {
      try {
        const res = await window.supabase.auth.getUser();
        if (res && res.data && res.data.user) {
          supabaseUser = res.data.user;
        }
      } catch (err) {
        console.warn('[MercadoPago] Não foi possível consultar usuário via Supabase Auth:', err.message);
      }
    }

    const email = (supabaseUser && supabaseUser.email) || (sessionUser && sessionUser.email) || null;
    const usuarioId = (supabaseUser && supabaseUser.id) || (sessionUser && (sessionUser.id || sessionUser.user_id || sessionUser.userId)) || null;

    if (!email) return null;
    return { email: String(email).trim().toLowerCase(), usuarioId, supabaseUser, sessionUser };
  }

  function calcularPosicaoPopup(largura, altura) {
    const screenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const screenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    const parentWidth = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width;
    const parentHeight = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height;
    const left = ((parentWidth - largura) / 2) + screenLeft;
    const top = ((parentHeight - altura) / 2) + screenTop;
    return { left: Math.max(0, Math.floor(left)), top: Math.max(0, Math.floor(top)) };
  }

  function abrirPopupComLoading() {
    const maxW = MERCADO_PAGO_CONFIG.popupWidth;
    const maxH = MERCADO_PAGO_CONFIG.popupHeight;
    const w = Math.min(maxW, Math.max(360, window.innerWidth - 40));
    const h = Math.min(maxH, Math.max(520, window.innerHeight - 80));
    const { left, top } = calcularPosicaoPopup(w, h);
    const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=yes,status=yes`;
    const popup = window.open('', 'checkoutMercadoPago', features);
    if (!popup) {
      return { popup: null, blocked: true };
    }
    popup.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Preparando pagamento...</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
            background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #111827;
          }
          .loader-card {
            background: #ffffff;
            border-radius: 16px;
            padding: 48px 36px;
            max-width: 380px;
            width: 92%;
            box-shadow: 0 20px 50px rgba(30, 64, 175, 0.12);
            text-align: center;
          }
          .spinner {
            width: 56px;
            height: 56px;
            margin: 0 auto 24px;
            border: 5px solid #dbeafe;
            border-top-color: #1e40af;
            border-radius: 50%;
            animation: spin 0.9s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          h1 {
            font-size: 1.35rem;
            font-weight: 700;
            color: #1e3a8a;
            margin-bottom: 10px;
          }
          p {
            color: #64748b;
            font-size: 0.95rem;
            line-height: 1.6;
          }
          .secure {
            margin-top: 20px;
            font-size: 0.8rem;
            color: #94a3b8;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
        </style>
      </head>
      <body>
        <div class="loader-card">
          <div class="spinner" role="status" aria-label="Carregando"></div>
          <h1>Preparando pagamento...</h1>
          <p>Estamos abrindo o checkout seguro do Mercado Pago. Esta janela será redirecionada em instantes.</p>
          <div class="secure"><span>🔒</span> Ambiente seguro</div>
        </div>
      </body>
      </html>
    `);
    popup.document.close();
    return { popup, blocked: false };
  }

  function setButtonLoadingState(btn, loading, originalText) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.dataset.originalText || (originalText || btn.textContent || '');
      btn.disabled = true;
      btn.style.opacity = '0.75';
      btn.style.cursor = 'progress';
      const orig = btn.dataset.originalText;
      if (btn.querySelector('i') && btn.querySelector('.btn-texto')) {
        btn.querySelector('.btn-texto').textContent = ' Abrindo pagamento...';
      } else {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Abrindo pagamento...`;
      }
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
      const orig = btn.dataset.originalText || '';
      if (orig) {
        btn.innerHTML = orig;
      }
      delete btn.dataset.originalText;
    }
  }

  async function iniciarCheckout(btn, contexto) {
    if (isProcessing) return;
    isProcessing = true;
    const originalHtml = btn ? btn.innerHTML : null;
    try {
      if (btn) setButtonLoadingState(btn, true, originalHtml);

      const { popup, blocked } = abrirPopupComLoading();
      if (blocked) {
        alert('O navegador bloqueou a janela de pagamento. Permita popups para o site Condomit e tente novamente.');
        return;
      }

      const usuario = await obterUsuarioAutenticado();
      if (!usuario) {
        try { if (popup && !popup.closed) popup.close(); } catch (_) {}
        alert('Sua sessão expirou. Por favor, faça login novamente antes de pagar.');
        if (typeof contexto?.aoDeslogar === 'function') contexto.aoDeslogar();
        return;
      }

      const planoSlug = obterPlanoSelecionadoSlug(contexto);
      if (!planoSlug) {
        try { if (popup && !popup.closed) popup.close(); } catch (_) {}
        alert('Selecione um plano antes de prosseguir com o pagamento.');
        return;
      }

      let resposta;
      try {
        const res = await fetch(MERCADO_PAGO_CONFIG.preferenciaEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planoId: planoSlug,
            email: usuario.email,
            usuarioId: usuario.usuarioId || null
          })
        });
        const text = await res.text();
        try { resposta = text ? JSON.parse(text) : {}; } catch (_) { resposta = { raw: text }; }
        if (!res.ok) {
          throw new Error(resposta?.error || resposta?.detalhe || `HTTP ${res.status}`);
        }
      } catch (fetchErr) {
        try { if (popup && !popup.closed) popup.close(); } catch (_) {}
        alert('Não foi possível abrir o pagamento: ' + (fetchErr.message || 'erro de comunicação.'));
        console.error('[MercadoPago] Erro ao criar preferência:', fetchErr);
        return;
      }

      const checkoutUrl = resposta?.checkoutUrl;
      if (!checkoutUrl) {
        try { if (popup && !popup.closed) popup.close(); } catch (_) {}
        alert('O servidor não retornou uma URL de pagamento válida. Tente novamente.');
        return;
      }

      if (popup.closed) {
        window.location.href = checkoutUrl;
      } else {
        try {
          popup.location.replace(checkoutUrl);
        } catch (_) {
          popup.location.href = checkoutUrl;
        }
      }

      if (typeof contexto?.aposRedirecionar === 'function') {
        contexto.aposRedirecionar({
          preferenciaId: resposta.preferenciaId,
          pedidoId: resposta.pedidoId
        });
      }
    } finally {
      isProcessing = false;
      if (btn) setButtonLoadingState(btn, false, originalHtml);
    }
  }

  function configurarListenerMensagensRetorno(contexto) {
    window.addEventListener('message', function(event) {
      if (!event || event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.tipo !== 'RETORNO_MERCADO_PAGO') return;

      const status = data.status;
      if (typeof contexto?.aoRetornar === 'function') {
        contexto.aoRetornar({ status, collection_id: data.collection_id, payment_id: data.payment_id, preference_id: data.preference_id });
      }

      if (status === 'approved') {
        setTimeout(() => {
          alert('Pagamento aprovado! Estamos confirmando a ativação do seu plano. Você será redirecionado.');
          if (typeof contexto?.aposAprovado === 'function') {
            contexto.aposAprovado();
          } else {
            window.location.href = 'index.html';
          }
        }, 200);
      } else if (status === 'failure' || status === 'rejected') {
        setTimeout(() => {
          alert('Pagamento não aprovado. Tente novamente ou utilize outro meio de pagamento.');
          if (typeof contexto?.aposFalha === 'function') contexto.aposFalha();
        }, 200);
      } else if (status === 'pending') {
        setTimeout(() => {
          alert('Pagamento pendente. O Mercado Pago ainda está processando. O plano será ativado após a confirmação.');
          if (typeof contexto?.aposPendente === 'function') contexto.aposPendente();
        }, 200);
      }
    });
  }

  function inicializarBotoesMercadoPago(contextoCustom) {
    const contexto = contextoCustom || window.mercadoPagoContexto || {};
    const botoes = document.querySelectorAll('[data-mercado-pago-plano], button.mp-checkout-btn, .btn-mercado-pago');
    botoes.forEach(function(btn) {
      if (btn.dataset.mpCheckoutInitialized === 'true') return;
      btn.dataset.mpCheckoutInitialized = 'true';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const planoAtributo = btn.getAttribute('data-mercado-pago-plano');
        const ctx = { ...contexto };
        if (planoAtributo) ctx.planoSlugManual = mapearNomePlanoParaSlug(planoAtributo);
        iniciarCheckout(btn, ctx);
      });
    });
    configurarListenerMensagensRetorno(contexto);
  }

  window.MercadoPagoCheckout = {
    iniciar: function(btn, ctx) { return iniciarCheckout(btn, ctx || {}); },
    inicializarBotoes: inicializarBotoesMercadoPago,
    mapearPlano: mapearNomePlanoParaSlug,
    obterUsuario: obterUsuarioAutenticado
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (window.MP_AUTO_INIT !== false) inicializarBotoesMercadoPago();
    });
  } else {
    if (window.MP_AUTO_INIT !== false) inicializarBotoesMercadoPago();
  }
})();
