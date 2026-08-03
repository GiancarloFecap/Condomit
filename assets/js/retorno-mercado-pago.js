document.addEventListener('DOMContentLoaded', async () => {
    const root = document.querySelector('[data-payment-result]');
    if (!root) return;

    const statusBox = document.getElementById('payment-result-status');
    const titleEl = document.getElementById('payment-result-title');
    const descriptionEl = document.getElementById('payment-result-description');
    const primaryAction = document.getElementById('payment-result-primary');
    const secondaryAction = document.getElementById('payment-result-secondary');
    const retryButton = document.getElementById('payment-result-refresh');

    const defaultStatus = normalizeStatus(root.dataset.status || 'pending');
    const query = new URLSearchParams(window.location.search);
    const paymentId = query.get('payment_id') || query.get('collection_id') || query.get('id');
    const externalReference = query.get('external_reference');
    const fallbackStatus = query.get('status') || query.get('collection_status') || defaultStatus;

    //#region debug-point mp-return-context
    const debugContext = {
        href: window.location.href,
        query: Object.fromEntries(query.entries())
    };
    //#endregion debug-point mp-return-context

    renderStatus(defaultStatus, {
        titleEl,
        descriptionEl,
        statusBox,
        primaryAction,
        secondaryAction
    });

    if (retryButton) {
        retryButton.addEventListener('click', () => {
            window.location.reload();
        });
    }

    if (!paymentId && !externalReference) {
        updateStatusBox(statusBox, `Status informado pela rota: ${humanizeStatus(defaultStatus)}.`);
        return;
    }

    try {
        updateStatusBox(statusBox, 'Estamos confirmando o status do seu pagamento com o Mercado Pago...');

        const params = new URLSearchParams();
        if (paymentId) params.set('payment_id', paymentId);
        if (externalReference) params.set('external_reference', externalReference);
        if (fallbackStatus) params.set('status', fallbackStatus);

        const confirmUrl = `/api/mercadopago/confirm?${params.toString()}`;

        //#region debug-point mp-return-request
        debugContext.confirmUrl = confirmUrl;
        //#endregion debug-point mp-return-request

        const response = await fetch(confirmUrl);

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const payload = isJson
            ? await response.json().catch(() => ({}))
            : {};
        const rawBody = !isJson
            ? await response.text().catch(() => '')
            : '';

        if (!response.ok) {
            //#region debug-point mp-return-response
            debugContext.response = {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                contentType,
                payload,
                rawBody: rawBody ? rawBody.slice(0, 800) : ''
            };
            //#endregion debug-point mp-return-response

            const msg = payload.error || (rawBody ? rawBody.slice(0, 200) : '') || 'Nao foi possivel confirmar o pagamento.';
            throw new Error(msg);
        }

        const resolvedStatus = normalizeStatus(payload.status || fallbackStatus);
        if (payload.payment?.plano_id) {
            persistApprovedPlan(payload.payment.plano_id);
        }

        renderStatus(resolvedStatus, {
            titleEl,
            descriptionEl,
            statusBox,
            primaryAction,
            secondaryAction
        });

        const referenceText = payload.mercadoPagoPaymentId
            ? `Pagamento Mercado Pago #${payload.mercadoPagoPaymentId}.`
            : 'Pagamento sincronizado com sucesso.';

        if (resolvedStatus === 'approved') {
            updateStatusBox(statusBox, `${referenceText} Seu acesso sera liberado automaticamente em instantes.`);
            window.setTimeout(() => {
                window.location.href = 'index.html';
            }, 3500);
            return;
        }

        if (resolvedStatus === 'pending') {
            updateStatusBox(statusBox, `${referenceText} Ainda estamos aguardando a confirmacao final.`);

            //#region debug-point mp-return-pending
            if (!debugContext.response) {
                debugContext.response = {
                    ok: response.ok,
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    payload
                };
            }
            appendDebug(statusBox, debugContext);
            //#endregion debug-point mp-return-pending
            return;
        }

        updateStatusBox(statusBox, `${referenceText} Voce pode tentar novamente pelo checkout.`);
        //#region debug-point mp-return-final
        if (!debugContext.response) {
            debugContext.response = {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                contentType,
                payload
            };
        }
        appendDebug(statusBox, debugContext);
        //#endregion debug-point mp-return-final
    } catch (error) {
        const errorStatus = normalizeStatus(fallbackStatus || defaultStatus);
        renderStatus(errorStatus, {
            titleEl,
            descriptionEl,
            statusBox,
            primaryAction,
            secondaryAction
        });
        updateStatusBox(statusBox, error.message || 'Nao foi possivel validar o pagamento agora.');
        //#region debug-point mp-return-error
        debugContext.error = {
            message: String(error?.message || error),
            name: String(error?.name || '')
        };
        appendDebug(statusBox, debugContext);
        //#endregion debug-point mp-return-error
    }
});

function normalizeStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();

    if (['approved', 'aprovado'].includes(normalized)) return 'approved';
    if (['pending', 'in_process', 'pendente', 'em_processo'].includes(normalized)) return 'pending';
    return 'failure';
}

function humanizeStatus(status) {
    if (status === 'approved') return 'Aprovado';
    if (status === 'pending') return 'Pendente';
    return 'Falhou';
}

function renderStatus(status, elements) {
    const root = document.querySelector('[data-payment-result]');
    if (!root) return;

    root.classList.remove('success', 'pending', 'failure');

    const config = getStatusConfig(status);
    root.classList.add(config.cssClass);
    elements.titleEl.textContent = config.title;
    elements.descriptionEl.textContent = config.description;

    if (elements.primaryAction) {
        elements.primaryAction.textContent = config.primaryLabel;
        elements.primaryAction.href = config.primaryHref;
    }

    if (elements.secondaryAction) {
        elements.secondaryAction.textContent = config.secondaryLabel;
        elements.secondaryAction.href = config.secondaryHref;
    }
}

function getStatusConfig(status) {
    if (status === 'approved') {
        return {
            cssClass: 'success',
            title: 'Pagamento aprovado',
            description: 'Recebemos a confirmacao do Mercado Pago e sua assinatura esta sendo liberada.',
            primaryLabel: 'Ir para o painel',
            primaryHref: 'index.html',
            secondaryLabel: 'Voltar ao checkout',
            secondaryHref: 'checkout.html'
        };
    }

    if (status === 'pending') {
        return {
            cssClass: 'pending',
            title: 'Pagamento em analise',
            description: 'Seu pagamento foi recebido e ainda pode levar alguns instantes para ser concluido.',
            primaryLabel: 'Voltar ao checkout',
            primaryHref: 'checkout.html',
            secondaryLabel: 'Ir para o login',
            secondaryHref: 'entrar.html'
        };
    }

    return {
        cssClass: 'failure',
        title: 'Pagamento nao concluido',
        description: 'O Mercado Pago informou que a transacao nao foi aprovada. Voce pode tentar novamente.',
        primaryLabel: 'Tentar novamente',
        primaryHref: 'checkout.html',
        secondaryLabel: 'Ir para o login',
        secondaryHref: 'entrar.html'
    };
}

function updateStatusBox(element, message) {
    if (!element) return;
    element.innerHTML = `<strong>Status atual</strong><span>${message}</span>`;
}

function appendDebug(element, context) {
    if (!element) return;
    const pre = JSON.stringify(context, null, 2);
    element.insertAdjacentHTML(
        'beforeend',
        `<details style="margin-top:10px;"><summary>Debug</summary><pre style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(pre)}</pre></details>`
    );
}

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function persistApprovedPlan(planId) {
    const rawUser = sessionStorage.getItem('condominiumUser');
    if (!rawUser || !planId) return;

    try {
        const user = JSON.parse(rawUser);
        user.plan = planId;
        sessionStorage.setItem('condominiumUser', JSON.stringify(user));
    } catch (error) {
        return;
    }
}
