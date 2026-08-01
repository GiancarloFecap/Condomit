const crypto = require("node:crypto");

const PLANOS = Object.freeze({
  essencial: {
    id: "essencial",
    titulo: "Plano Essencial - Condomit",
    preco: 79
  },
  pro: {
    id: "pro",
    titulo: "Plano Pro - Condomit",
    preco: 149
  },
  premium: {
    id: "premium",
    titulo: "Plano Premium - Condomit",
    preco: 199
  }
});

function resposta(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body)
  };
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") {
    return resposta(204, {});
  }

  if (event.httpMethod !== "POST") {
    return resposta(405, {
      erro: "Método não permitido. Utilize POST."
    });
  }

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const ambiente = String(
    process.env.MERCADO_PAGO_ENV || "test"
  ).toLowerCase();
  const siteUrl = String(
    process.env.SITE_URL || "https://condomit.netlify.app"
  ).replace(/\/+$/, "");

  if (!token) {
    console.error("MERCADO_PAGO_ACCESS_TOKEN ausente.");
    return resposta(500, {
      erro: "Mercado Pago não configurado no servidor."
    });
  }

  try {
    let dados;
    try {
      dados = JSON.parse(event.body || "{}");
    } catch {
      return resposta(400, { erro: "JSON inválido." });
    }

    const planoId = String(
      dados.planoId || ""
    ).trim().toLowerCase();
    const email = String(
      dados.email || ""
    ).trim().toLowerCase();
    const usuarioId = dados.usuarioId
      ? String(dados.usuarioId)
      : "";

    const plano = PLANOS[planoId];

    if (!plano) {
      return resposta(400, { erro: "Plano inválido." });
    }

    if (!emailValido(email)) {
      return resposta(400, { erro: "E-mail inválido." });
    }

    const pedidoId = crypto.randomUUID();

    const preferencia = {
      items: [{
        id: plano.id,
        title: plano.titulo,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(plano.preco)
      }],
      payer: { email },
      back_urls: {
        success: `${siteUrl}/pages/pagamento-sucesso.html`,
        failure: `${siteUrl}/pages/pagamento-falha.html`,
        pending: `${siteUrl}/pages/pagamento-pendente.html`
      },
      auto_return: "approved",
      external_reference: pedidoId,
      metadata: {
        plano_id: plano.id,
        email_usuario: email,
        usuario_id: usuarioId || null,
        pedido_id: pedidoId
      },
      notification_url:
        `${siteUrl}/.netlify/functions/mercado-pago-webhook`
    };

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(preferencia)
      }
    );

    const resultado = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro Mercado Pago:", resultado);
      return resposta(mpResponse.status || 500, {
        erro:
          resultado.message ||
          "Não foi possível criar a preferência.",
        causa:
          resultado.cause?.[0]?.description ||
          resultado.error ||
          null
      });
    }

    const checkoutUrl =
      ambiente === "production"
        ? resultado.init_point
        : resultado.sandbox_init_point;

    if (!checkoutUrl) {
      return resposta(500, {
        erro: "URL do checkout não retornada."
      });
    }

    return resposta(200, {
      preferenciaId: resultado.id,
      pedidoId,
      checkoutUrl
    });
  } catch (erro) {
    console.error("Erro ao criar preferência:", erro);
    return resposta(500, {
      erro: "Erro interno ao preparar o pagamento."
    });
  }
};
