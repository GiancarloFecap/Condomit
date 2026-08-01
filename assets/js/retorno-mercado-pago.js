(function () {
  const status =
    document.documentElement.dataset.pagamentoStatus ||
    "failure";

  function parametros() {
    const p = new URLSearchParams(location.search);

    return {
      paymentId:
        p.get("payment_id") ||
        p.get("collection_id"),
      status:
        p.get("status") ||
        p.get("collection_status"),
      externalReference:
        p.get("external_reference"),
      preferenceId:
        p.get("preference_id")
    };
  }

  function avisar() {
    if (!window.opener) return false;

    try {
      window.opener.postMessage(
        {
          tipo: "RETORNO_MERCADO_PAGO",
          status,
          dados: parametros()
        },
        window.location.origin
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  window.fecharRetornoMercadoPago = () => {
    if (avisar()) {
      try { window.close(); } catch (_) {}
      setTimeout(() => { location.href = "/"; }, 100);
    } else {
      location.href = "/";
    }
  };

  if (window.opener) {
    avisar();
    setTimeout(() => {
      try { window.close(); } catch (_) {}
    }, 2500);
  }
})();
