const PLANOS = Object.freeze({
  essencial: { id: "essencial", preco: 79 },
  pro: { id: "pro", preco: 149 },
  premium: { id: "premium", preco: 199 }
});

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  },
  body: JSON.stringify(body)
});

const valorCorreto = (a, b) =>
  Math.abs(Number(a) - Number(b)) < 0.01;

async function consultarPagamento(id, token) {
  const r = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const pagamento = await r.json();

  if (!r.ok) {
    console.error("Erro Mercado Pago:", pagamento);
    throw new Error("Falha ao consultar pagamento.");
  }

  return pagamento;
}

async function supabase(caminho, opcoes = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase privado não configurado.");
  }

  const r = await fetch(`${url}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {})
    }
  });

  const texto = await r.text();
  let dados = texto;

  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {}

  if (!r.ok) {
    console.error("Erro Supabase:", dados, "Status:", r.status, "Caminho:", caminho);
    throw new Error("Falha ao atualizar banco.");
  }

  return dados;
}

async function pagamentoJaExiste(id) {
  try {
    const registros = await supabase(
      `/rest/v1/pagamento?codigo_transacao=eq.${encodeURIComponent(String(id))}&select=codigo_transacao&limit=1`,
      { method: "GET" }
    );
    return Array.isArray(registros) && registros.length > 0;
  } catch (_) {
    try {
      const registrosFallback = await supabase(
        `/rest/v1/pagamento?id=eq.${encodeURIComponent(String(id))}&select=id&limit=1`,
        { method: "GET" }
      );
      return Array.isArray(registrosFallback) && registrosFallback.length > 0;
    } catch (__) {
      return false;
    }
  }
}

async function buscarUsuarioPorEmail(email) {
  try {
    const usuarios = await supabase(
      `/rest/v1/users?email=eq.${encodeURIComponent(String(email))}&select=email,condominium&limit=1`,
      { method: "GET" }
    );
    if (Array.isArray(usuarios) && usuarios.length > 0) {
      return usuarios[0];
    }
  } catch (_) {}
  return null;
}

function extrairCepCondominio(usuario) {
  if (!usuario?.condominium) return null;
  try {
    const condo = typeof usuario.condominium === "string"
      ? JSON.parse(usuario.condominium)
      : usuario.condominium;
    return condo.cep || null;
  } catch (_) {
    return null;
  }
}

async function registrar(pagamento, plano, email) {
  if (await pagamentoJaExiste(pagamento.id)) {
    return { duplicado: true };
  }

  const usuario = await buscarUsuarioPorEmail(email);
  const cep = extrairCepCondominio(usuario);

  const dadosPagamento = {
    plano_id: plano.id,
    valor_pago: Number(pagamento.transaction_amount),
    status_pagamento: "aprovado",
    codigo_transacao: String(pagamento.id),
    data_pagamento:
      pagamento.date_approved || pagamento.date_created || new Date().toISOString(),
    external_reference:
      pagamento.external_reference || null,
    status_detail: pagamento.status_detail || null,
    email_usuario: email,
    email: email
  };

  if (cep) {
    dadosPagamento.cep = cep;
  }

  await supabase("/rest/v1/pagamento", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(dadosPagamento)
  });

  try {
    await supabase(
      "/rest/v1/user_plan_status?on_conflict=email",
      {
        method: "POST",
        headers: {
          Prefer:
            "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify({
          email,
          plano_escolhido: plano.id,
          status: "ativo"
        })
      }
    );
  } catch (erroUserPlan) {
    console.warn("Tabela user_plan_status não disponível, tentando atualizar users diretamente:", erroUserPlan.message || erroUserPlan);
    try {
      await supabase(
        `/rest/v1/users?email=eq.${encodeURIComponent(String(email))}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            plano: plano.id,
            plano_escolhido: plano.id,
            plan_status: "ativo"
          })
        }
      );
    } catch (erroUpdateUser) {
      console.warn("Não foi possível atualizar tabela users também:", erroUpdateUser.message || erroUpdateUser);
    }
  }

  return { duplicado: false };
}

exports.handler = async event => {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  if (event.httpMethod !== "POST") {
    return json(405, { erro: "Método não permitido." });
  }

  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!token) {
    return json(500, {
      erro: "Credencial do Mercado Pago ausente."
    });
  }

  try {
    let corpo = {};
    try {
      corpo = JSON.parse(event.body || "{}");
    } catch {}

    const q = event.queryStringParameters || {};
    const pagamentoId =
      corpo?.data?.id ||
      corpo?.id ||
      q["data.id"] ||
      q.data_id ||
      q.id;

    if (!pagamentoId) {
      console.log("[Webhook MP] Sem ID de pagamento. Corpo:", JSON.stringify(corpo), "Query:", JSON.stringify(q));
      return json(200, {
        recebido: true,
        ignorado: true
      });
    }

    console.log("[Webhook MP] Processando pagamento:", pagamentoId);

    const pagamento = await consultarPagamento(
      pagamentoId,
      token
    );

    console.log("[Webhook MP] Status pagamento:", pagamento.status, "detail:", pagamento.status_detail);

    const plano = PLANOS[
      String(
        pagamento.metadata?.plano_id || ""
      ).toLowerCase()
    ];

    if (!plano) {
      return json(400, { erro: "Plano inválido no metadata." });
    }

    if (pagamento.currency_id !== "BRL") {
      return json(400, { erro: "Moeda inválida." });
    }

    if (
      !valorCorreto(
        pagamento.transaction_amount,
        plano.preco
      )
    ) {
      console.warn(`[Webhook MP] Valor divergente: esperado R$${plano.preco}, recebido R$${pagamento.transaction_amount}`);
      return json(400, {
        erro: "Valor diferente do plano."
      });
    }

    const email = String(
      pagamento.metadata?.email_usuario ||
      pagamento.payer?.email ||
      pagamento.metadata?.email ||
      ""
    ).trim().toLowerCase();

    if (!email) {
      return json(400, {
        erro: "Usuário não identificado."
      });
    }

    if (pagamento.status === "approved") {
      const resultado = await registrar(
        pagamento,
        plano,
        email
      );

      console.log("[Webhook MP] Pagamento aprovado. Duplicado:", resultado.duplicado, "Email:", email, "Plano:", plano.id);

      return json(200, {
        recebido: true,
        aprovado: true,
        duplicado: resultado.duplicado
      });
    }

    return json(200, {
      recebido: true,
      aprovado: false,
      status: pagamento.status,
      statusDetail: pagamento.status_detail || null
    });
  } catch (erro) {
    console.error("Erro no webhook:", erro);

    return json(500, {
      erro: "Erro interno no webhook."
    });
  }
};
