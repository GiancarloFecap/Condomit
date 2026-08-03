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

        const response = await fetch(`/api/mercadopago/confirm?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || 'Nao foi possivel confirmar o pagamento.');
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
            return;
        }

        updateStatusBox(statusBox, `${referenceText} Voce pode tentar novamente pelo checkout.`);
    } catch (error) {
        console.error('[Mercado Pago Return] Erro ao confirmar pagamento:', error);
        const errorStatus = normalizeStatus(fallbackStatus || defaultStatus);
        renderStatus(errorStatus, {
            titleEl,
            descriptionEl,
            statusBox,
            primaryAction,
            secondaryAction
        });
        updateStatusBox(statusBox, error.message || 'Nao foi possivel validar o pagamento agora.');
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

function persistApprovedPlan(planId) {
    const rawUser = sessionStorage.getItem('condominiumUser');
    if (!rawUser || !planId) return;

    try {
        const user = JSON.parse(rawUser);
        user.plan = planId;
        sessionStorage.setItem('condominiumUser', JSON.stringify(user));
    } catch (error) {
        console.warn('[Mercado Pago Return] Falha ao atualizar sessionStorage:', error);
    }
}
