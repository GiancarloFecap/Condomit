(() => {
    const FAST_POLL_INTERVAL_MS = 5000;
    const SLOW_POLL_INTERVAL_MS = 15000;
    const FAST_POLL_LIMIT = 24; // ~2 minutos
    const TOTAL_POLL_LIMIT = 40; // ~6 minutos no total

    document.addEventListener('DOMContentLoaded', () => {
        initPaymentReturnPage().catch((error) => {
            console.error('[Mercado Pago] Falha ao inicializar retorno:', error);
        });
    });

    async function initPaymentReturnPage() {
        const root = document.querySelector('[data-payment-result]');
        if (!root) return;

        const elements = {
            root,
            statusBox: document.getElementById('payment-result-status'),
            titleEl: document.getElementById('payment-result-title'),
            descriptionEl: document.getElementById('payment-result-description'),
            primaryAction: document.getElementById('payment-result-primary'),
            secondaryAction: document.getElementById('payment-result-secondary'),
            retryButton: document.getElementById('payment-result-refresh')
        };

        const query = new URLSearchParams(window.location.search);
        const context = {
            paymentId: query.get('payment_id') || query.get('collection_id') || query.get('id'),
            externalReference: query.get('external_reference'),
            fallbackStatus: query.get('status') || query.get('collection_status') || root.dataset.status || 'pending',
            attempts: 0,
            timer: null,
            stopped: false
        };

        renderStatus(normalizeStatus(root.dataset.status || 'pending'), elements);

        elements.retryButton?.addEventListener('click', async () => {
            if (context.timer) window.clearTimeout(context.timer);
            context.attempts = 0;
            context.stopped = false;
            elements.retryButton.disabled = true;
            try {
                await synchronizePayment(context, elements, { manual: true });
            } finally {
                elements.retryButton.disabled = false;
            }
        });

        window.addEventListener('focus', () => {
            if (!context.stopped && normalizeStatus(elements.root.dataset.currentStatus || 'pending') === 'pending') {
                synchronizePayment(context, elements, { silent: true }).catch(() => {});
            }
        });

        if (!context.paymentId && !context.externalReference) {
            updateStatusBox(
                elements.statusBox,
                'Não recebemos o identificador do pagamento. Volte ao checkout e tente novamente.'
            );
            renderStatus('failure', elements);
            return;
        }

        await synchronizePayment(context, elements);
    }

    async function synchronizePayment(context, elements, options = {}) {
        if (context.stopped && !options.manual) return;

        context.attempts += 1;

        if (!options.silent) {
            updateStatusBox(
                elements.statusBox,
                context.attempts > 1
                    ? 'Consultando novamente o Mercado Pago...'
                    : 'Confirmando o status diretamente com o Mercado Pago...'
            );
        }

        try {
            const response = await fetch('/api/mercadopago/confirm', {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                body: JSON.stringify({
                    payment_id: context.paymentId,
                    external_reference: context.externalReference,
                    status: context.fallbackStatus
                })
            });

            const contentType = response.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await response.json().catch(() => ({}))
                : {};

            if (!response.ok) {
                throw new Error(payload.error || payload.message || 'Não foi possível confirmar o pagamento agora.');
            }

            const resolvedStatus = normalizeStatus(
                payload.mercadoPagoStatus || payload.status || context.fallbackStatus
            );
            elements.root.dataset.currentStatus = resolvedStatus;
            renderStatus(resolvedStatus, elements);

            const paymentNumber = payload.mercadoPagoPaymentId || context.paymentId;
            const referenceText = paymentNumber
                ? `Pagamento Mercado Pago #${paymentNumber}.`
                : 'Pagamento localizado.';

            if (resolvedStatus === 'approved') {
                context.stopped = true;
                if (context.timer) window.clearTimeout(context.timer);

                if (payload.payment?.plano_id) {
                    persistApprovedPlan(payload.payment.plano_id);
                }
                clearPaymentFlowStorage();

                updateStatusBox(
                    elements.statusBox,
                    `${referenceText} Pagamento aprovado. Seu plano foi liberado com sucesso.`
                );

                window.setTimeout(() => {
                    window.location.replace('index.html');
                }, 2200);
                return;
            }

            if (resolvedStatus === 'failure') {
                context.stopped = true;
                if (context.timer) window.clearTimeout(context.timer);
                clearPaymentFlowStorage();

                updateStatusBox(
                    elements.statusBox,
                    `${referenceText} O pagamento não foi aprovado. Você já pode voltar ao checkout e tentar novamente.`
                );
                return;
            }

            const detail = humanizeStatusDetail(payload.mercadoPagoStatusDetail);
            const automaticMessage = context.attempts < TOTAL_POLL_LIMIT
                ? 'A Condomit continuará verificando automaticamente.'
                : 'A verificação automática foi pausada. Use “Atualizar status” para consultar novamente.';

            updateStatusBox(
                elements.statusBox,
                `${referenceText} O Mercado Pago ainda está processando a transação${detail ? ` (${detail})` : ''}. ${automaticMessage}`
            );

            scheduleNextPoll(context, elements);
        } catch (error) {
            console.error('[Mercado Pago] Erro ao confirmar pagamento:', error);

            updateStatusBox(
                elements.statusBox,
                `${error?.message || 'Não foi possível consultar o pagamento.'} Tentaremos novamente automaticamente.`
            );

            scheduleNextPoll(context, elements);
        }
    }

    function scheduleNextPoll(context, elements) {
        if (context.stopped || context.attempts >= TOTAL_POLL_LIMIT) {
            context.stopped = context.attempts >= TOTAL_POLL_LIMIT;
            return;
        }

        if (context.timer) window.clearTimeout(context.timer);
        const interval = context.attempts < FAST_POLL_LIMIT
            ? FAST_POLL_INTERVAL_MS
            : SLOW_POLL_INTERVAL_MS;

        context.timer = window.setTimeout(() => {
            synchronizePayment(context, elements, { silent: true }).catch(() => {});
        }, interval);
    }

    function normalizeStatus(status) {
        const normalized = String(status || '').trim().toLowerCase();

        if (['approved', 'aprovado'].includes(normalized)) return 'approved';
        if (['pending', 'in_process', 'in_mediation', 'authorized', 'pendente', 'em_processo'].includes(normalized)) return 'pending';
        return 'failure';
    }

    function humanizeStatusDetail(detail) {
        const normalized = String(detail || '').trim().toLowerCase();
        if (!normalized) return '';

        const labels = {
            pending_contingency: 'processamento temporário',
            pending_review_manual: 'análise do Mercado Pago',
            pending_waiting_payment: 'aguardando confirmação',
            pending_challenge: 'aguardando autenticação do pagamento',
            accredited: 'valor creditado'
        };

        return labels[normalized] || '';
    }

    function renderStatus(status, elements) {
        const root = elements.root;
        if (!root) return;

        root.classList.remove('success', 'pending', 'failure');
        root.dataset.currentStatus = status;

        const config = getStatusConfig(status);
        root.classList.add(config.cssClass);
        if (elements.titleEl) elements.titleEl.textContent = config.title;
        if (elements.descriptionEl) elements.descriptionEl.textContent = config.description;

        setAction(elements.primaryAction, config.primaryLabel, config.primaryHref, config.showPrimary);
        setAction(elements.secondaryAction, config.secondaryLabel, config.secondaryHref, config.showSecondary);
        if (elements.retryButton) elements.retryButton.hidden = !config.showRefresh;
    }

    function setAction(element, label, href, visible) {
        if (!element) return;
        element.hidden = !visible;
        if (!visible) return;
        element.textContent = label;
        element.href = href;
    }

    function getStatusConfig(status) {
        if (status === 'approved') {
            return {
                cssClass: 'success',
                title: 'Pagamento aprovado',
                description: 'Recebemos a confirmação do Mercado Pago e sua assinatura está ativa.',
                primaryLabel: 'Ir para o painel',
                primaryHref: 'index.html',
                secondaryLabel: 'Voltar ao checkout',
                secondaryHref: 'checkout.html',
                showPrimary: true,
                showSecondary: false,
                showRefresh: false
            };
        }

        if (status === 'pending') {
            return {
                cssClass: 'pending',
                title: 'Pagamento em processamento',
                description: 'A confirmação ainda não terminou. Você não precisa criar outro pagamento enquanto esta transação estiver em análise.',
                primaryLabel: '',
                primaryHref: '#',
                secondaryLabel: '',
                secondaryHref: '#',
                showPrimary: false,
                showSecondary: false,
                showRefresh: true
            };
        }

        return {
            cssClass: 'failure',
            title: 'Pagamento não concluído',
            description: 'O Mercado Pago informou que a transação não foi aprovada. Você pode tentar novamente.',
            primaryLabel: 'Tentar novamente',
            primaryHref: 'checkout.html',
            secondaryLabel: 'Ir para o login',
            secondaryHref: 'entrar.html',
            showPrimary: true,
            showSecondary: true,
            showRefresh: false
        };
    }

    function updateStatusBox(element, message) {
        if (!element) return;
        element.innerHTML = '';

        const title = document.createElement('strong');
        title.textContent = 'Status atual';

        const text = document.createElement('span');
        text.textContent = message;

        element.append(title, text);
    }

    function clearPaymentFlowStorage() {
        try {
            sessionStorage.removeItem('lastPendingPaymentId');
            sessionStorage.removeItem('lastMercadoPagoPreferenceId');
            sessionStorage.removeItem('lastMercadoPagoExternalReference');
            sessionStorage.removeItem('condomitMercadoPagoFlowStartedAt');
        } catch (_) {}
    }

    function persistApprovedPlan(planId) {
        const rawUser = sessionStorage.getItem('condominiumUser');
        if (!rawUser || !planId) return;

        try {
            const user = JSON.parse(rawUser);
            user.plan = planId;
            sessionStorage.setItem('condominiumUser', JSON.stringify(user));
        } catch (_) {}
    }
})();
