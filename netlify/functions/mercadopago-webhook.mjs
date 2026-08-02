function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export default async function handler(request) {
  try {
    /*
     * Permite testar a existência da função diretamente
     * pelo navegador.
     */
    if (request.method === "GET") {
      return jsonResponse(200, {
        success: true,
        message: "Webhook do Mercado Pago está ativo."
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(405, {
        error: "Método não permitido."
      });
    }

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    const paymentId =
      body?.data?.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    console.log("Webhook Mercado Pago recebido:", {
      type: body?.type,
      action: body?.action,
      paymentId,
      liveMode: body?.live_mode
    });

    return jsonResponse(200, {
      received: true,
      paymentId: paymentId || null
    });
  } catch (error) {
    console.error("Erro no webhook Mercado Pago:", error);

    return jsonResponse(500, {
      error: "Erro interno no webhook."
    });
  }
}

export const config = {
  path: "/api/mercadopago/webhook"
};