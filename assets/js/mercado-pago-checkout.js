let popupMP = null;
let processando = false;

const MAPEAMENTO_PLANOS = Object.freeze({
  essencial: "essencial",
  "essencial - condomsmart": "essencial",
  "essencial - condomit": "essencial",
  pro: "pro",
  "pro - condomsmart": "pro",
  "pro - condomit": "pro",
  premium: "premium",
  "premium - condomsmart": "premium",
  "premium - condomit": "premium"
});

function mapearPlanoId(nomePlano) {
  if (!nomePlano) return "";
  const chave = String(nomePlano).trim().toLowerCase();
  if (MAPEAMENTO_PLANOS[chave]) return MAPEAMENTO_PLANOS[chave];
  if (chave.includes("essencial")) return "essencial";
  if (chave.includes("pro")) return "pro";
  if (chave.includes("premium")) return "premium";
  return "";
}

function getSupabase() {
  return (
    window.supabaseClient ||
    window.supabaseApp ||
    window.supabase
  );
}

async function getUsuario() {
  const sb = getSupabase();

  if (sb?.auth?.getUser) {
    try {
      const { data, error } = await sb.auth.getUser();
      if (!error && data?.user?.email) {
        return data.user;
      }
    } catch (_) {}
  }

  try {
    const cached = sessionStorage.getItem("condominiumUser");
    if (cached) {
      const user = JSON.parse(cached);
      if (user?.email) {
        return user;
      }
    }
  } catch (_) {}

  try {
    const cached = localStorage.getItem("condominiumPersistentUser");
    if (cached) {
      const user = JSON.parse(cached);
      if (user?.email) {
        return user;
      }
    }
  } catch (_) {}

  throw new Error("Sessão expirada. Entre novamente.");
}

function abrirPopup() {
  const sw = screen.availWidth || screen.width;
  const sh = screen.availHeight || screen.height;
  const w = Math.min(1000, Math.max(360, sw - 60));
  const h = Math.min(760, Math.max(560, sh - 80));
  const left = Math.max(0, Math.round((sw - w) / 2));
  const top = Math.max(0, Math.round((sh - h) / 2));

  const popup = window.open(
    "",
    "checkoutMercadoPago",
    [
      "popup=yes",
      `width=${w}`,
      `height=${h}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",")
  );

  if (!popup) {
    throw new Error(
      "O navegador bloqueou a janela de pagamento. " +
      "Permita popups para o site Condomit."
    );
  }

  popup.document.write(`
    <!doctype html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>Mercado Pago</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;
      background:#f5f6f8;font-family:Arial}
      main{padding:35px;background:#fff;border-radius:15px;text-align:center;
      box-shadow:0 12px 35px #0002}
      i{display:block;width:45px;height:45px;margin:auto;
      border:5px solid #ddd;border-top-color:#3483fa;border-radius:50%;
      animation:g .8s linear infinite}
      @keyframes g{to{transform:rotate(360deg)}}
    </style></head><body><main><i></i>
    <h2>Preparando pagamento...</h2>
    <p>Aguarde enquanto o Mercado Pago é aberto.</p>
    </main></body></html>
  `);
  popup.document.close();
  popup.focus();

  return popup;
}

async function criarPreferencia(dados) {
  const r = await fetch(
    "/.netlify/functions/criar-preferencia",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados)
    }
  );

  let resultado;

  try {
    resultado = await r.json();
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }

  if (!r.ok) {
    throw new Error(
      resultado.causa ||
      resultado.erro ||
      "Não foi possível iniciar o pagamento."
    );
  }

  if (!resultado.checkoutUrl) {
    throw new Error("URL do checkout ausente.");
  }

  return resultado;
}

function getPlano(botao) {
  const direto = String(
    botao.dataset.mercadoPagoPlano ||
    ""
  ).trim().toLowerCase();

  if (direto) return mapearPlanoId(direto);

  const selecionado = document.querySelector(
    "[data-plano-selecionado]"
  )?.dataset.planoSelecionado;

  if (selecionado) return mapearPlanoId(selecionado);

  const cardSelecionado = document.querySelector(
    ".plan-card-option.selected, .plan-card.selected"
  );
  if (cardSelecionado?.dataset.planName) {
    return mapearPlanoId(cardSelecionado.dataset.planName);
  }
  if (cardSelecionado?.dataset.planId) {
    const planoNome = (window.__planosDisponiveis || [])
      .find(p => String(p.id) === String(cardSelecionado.dataset.planId))?.nome;
    return mapearPlanoId(planoNome || cardSelecionado.dataset.planId);
  }

  return "";
}

function atualizarPlanoSelecionado(planoId) {
  const botao = document.querySelector(
    "[data-mercado-pago-checkout]"
  );

  if (botao) {
    botao.dataset.mercadoPagoPlano = planoId;
  }
}

window.atualizarPlanoSelecionado = atualizarPlanoSelecionado;

async function pagar(botao) {
  if (processando) return;

  const planoId = getPlano(botao);

  if (!planoId) {
    alert("Selecione um plano.");
    return;
  }

  processando = true;
  const texto = botao.innerHTML;

  try {
    popupMP = abrirPopup();
    botao.disabled = true;
    botao.innerHTML = "Abrindo pagamento...";

    const usuario = await getUsuario();
    const resultado = await criarPreferencia({
      planoId,
      email: usuario.email,
      usuarioId: usuario.id || usuario.email
    });

    if (!popupMP || popupMP.closed) {
      throw new Error("A janela de pagamento foi fechada.");
    }

    popupMP.location.replace(resultado.checkoutUrl);
    popupMP.focus();
  } catch (erro) {
    console.error("Erro Mercado Pago:", erro);

    if (popupMP && !popupMP.closed) {
      popupMP.close();
    }

    popupMP = null;
    alert(erro.message || "Falha ao iniciar pagamento.");
  } finally {
    processando = false;
    botao.disabled = false;
    botao.innerHTML = texto;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(
    "[data-mercado-pago-plano]," +
    "[data-mercado-pago-checkout]"
  ).forEach(botao => {
    botao.addEventListener("click", event => {
      event.preventDefault();
      pagar(botao);
    });
  });
});

window.pagar = pagar;
window.abrirPopup = abrirPopup;

window.addEventListener("message", event => {
  if (event.origin !== location.origin) return;
  if (event.data?.tipo !== "RETORNO_MERCADO_PAGO") return;

  if (popupMP && !popupMP.closed) popupMP.close();

  const status = event.data.status;

  location.href =
    status === "approved"
      ? "/pages/pagamento-sucesso.html"
      : status === "pending"
        ? "/pages/pagamento-pendente.html"
        : "/pages/pagamento-falha.html";
});
