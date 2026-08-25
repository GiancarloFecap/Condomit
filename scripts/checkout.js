
let currentUser = null;
let selectedPlan = null;
let selectedPrice = null;
let plans = [];
let mercadoPagoConfig = null;
let mercadoPagoInstance = null;
let walletBrickController = null;
let checkoutFlowPending = false;
let checkoutRecoveryTimeout = null;
let checkoutPendingHardTimeout = null;
let lastCheckoutInitiatedAt = 0;


document.addEventListener('DOMContentLoaded', async function () {
    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (!loggedInUser) {
        window.location.href = 'entrar.html';
        return;
    }

    currentUser = JSON.parse(loggedInUser);

    if (currentUser.type !== 'sindico') {
        window.location.href = 'assembleia.html';
        return;
    }

    try {
        const billing = await fetchCondominiumBillingStatus(true);
        if (billing?.can_use) {
            persistApprovedPlan(billing);
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('[Checkout] Erro ao consultar mensalidade do condomínio:', error);
    }

    const logoutBtn = document.getElementById('btn-logout-checkout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (event) {
            event.preventDefault();
            sessionStorage.removeItem('condominiumUser');
            window.location.href = 'entrar.html';
        });
    }

    bindReturnListeners();

    try {
        const [loadedPlans, config] = await Promise.all([
            fetchPlans(),
            fetchMercadoPagoConfig()
        ]);

        plans = Array.isArray(loadedPlans) ? loadedPlans : [];
        mercadoPagoConfig = config;

        renderPlans();
        await initCheckoutButton();
    } catch (error) {
        console.error('[Checkout] Erro ao inicializar checkout:', error);
        showPaymentFeedback('error', error.message || 'Nao foi possivel carregar o checkout agora.');
        renderPaymentPlaceholder('Nao foi possivel preparar o checkout do Mercado Pago agora.');
    }
});

async function fetchPlans() {
    const response = await fetch('/api/plano');
    if (!response.ok) throw new Error('Falha ao buscar planos');
    return await response.json();
}

async function fetchCondominiumBillingStatus(force = false) {
    if (typeof window.getCondomitBillingStatus === 'function') {
        return await window.getCondomitBillingStatus(force);
    }

    if (typeof window.supabaseFetch === 'function') {
        return await window.supabaseFetch('/rpc/condomit_get_billing_status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });
    }

    return null;
}

async function fetchMercadoPagoConfig() {
    const response = await fetch('/api/mercadopago/config');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.publicKey) {
throw new Error(payload.error || 'Mercado Pago nao configurado para este ambiente.');
    }
    return payload;
}

function renderPlans() {
    const container = document.getElementById('plans-list-container');
    if (!container) return;

    container.innerHTML = '';

    plans.forEach((plan, index) => {
        const planCard = document.createElement('div');
        const isDefault = index === 1 || (index === 0 && plans.length === 1);
        const planName = String(plan.nome || '');

        planCard.className = `plan-card-option ${isDefault ? 'selected' : ''}`;
        planCard.dataset.planId = plan.id;

        let icon = 'fa-leaf';
        let features = ['Mural de avisos', 'Reservas simples'];

        if (planName.includes('Pro')) {
            icon = 'fa-rocket';
            features = ['Tudo do Essencial', 'Modulo Financeiro', 'Controle de Acesso'];
        } else if (planName.includes('Premium')) {
            icon = 'fa-crown';
            features = ['Tudo do Pro', 'APIs e White-label', 'Suporte Prioritario'];
        }

        planCard.innerHTML = `
            ${isDefault && plans.length > 1 ? '<div class="featured-badge">MAIS RECOMENDADO</div>' : ''}
            <div class="plan-card-header">
                <div class="plan-icon"><i class="fas ${icon}"></i></div>
                <div class="plan-meta">
                    <h3>${plan.nome}</h3>
                    <p>${plan.descricao || ''}</p>
                </div>
                <div class="plan-card-price">
                    <span class="currency">R$</span>
                    <span class="amount">${Number(plan.valor_minimo || 0).toFixed(0)}</span>
                    <span class="period">/mes</span>
                </div>
            </div>
            <ul class="plan-mini-features">
                ${features.map((feature) => `<li><i class="fas fa-check"></i> ${feature}</li>`).join('')}
            </ul>
        `;

        planCard.addEventListener('click', async () => {
            await selectPlan(planCard, plan);
        });

        container.appendChild(planCard);

        if (isDefault) {
            selectedPlan = plan;
            selectedPrice = plan.valor_minimo;
        }
    });

    updateSummary();
}

async function selectPlan(card, plan) {
    document.querySelectorAll('.plan-card-option').forEach((option) => option.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = plan;
    selectedPrice = plan.valor_minimo;
    updateSummary();
    await initCheckoutButton();
}

function updateSummary() {
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');

    if (!selectedPlan || !summaryPlanName || !summaryTotalPrice) return;

    summaryPlanName.textContent = selectedPlan.nome;
    summaryTotalPrice.textContent = formatCurrency(selectedPrice);
    sessionStorage.setItem('selectedPlan', selectedPlan.nome);
    sessionStorage.setItem('selectedPlanId', selectedPlan.id);
}

async function initCheckoutButton() {
    if (!selectedPlan || selectedPrice == null) {
        renderPaymentPlaceholder('Selecione um plano para liberar o pagamento.');
        return;
    }

    if (!mercadoPagoConfig?.publicKey) {
        renderPaymentPlaceholder('Mercado Pago indisponivel neste ambiente.');
        return;
    }

    if (!window.MercadoPago) {
        renderPaymentPlaceholder('Nao foi possivel carregar o SDK do Mercado Pago.');
        return;
    }

    if (!mercadoPagoInstance) {
        mercadoPagoInstance = new window.MercadoPago(mercadoPagoConfig.publicKey, {
            locale: 'pt-BR'
        });
    }

    if (walletBrickController?.unmount) {
        try {
            await walletBrickController.unmount();
        } catch (error) {
            console.warn('[Checkout] Falha ao desmontar Wallet Brick anterior:', error);
        }
    }

    showPaymentFeedback('info', `Plano ${selectedPlan.nome} pronto para pagamento.`);

    const container = document.getElementById('payment-brick_container');
    if (!container) return;
    container.innerHTML = '';

    try {
        walletBrickController = await mercadoPagoInstance.bricks().create('wallet', 'payment-brick_container', {
            initialization: {
                redirectMode: 'modal'
            },
            customization: {
                visual: {
                    buttonBackground: 'blue',
                    borderRadius: '12px',
                    buttonHeight: '52px'
                }
            },
            callbacks: {
                onReady: () => {
                    clearCheckoutPendingState();
                    showPaymentFeedback('info', 'Clique no botao para abrir o checkout. Nao feche a janela antes de concluir o pagamento.');
                },
                onSubmit: async () => {
                    markCheckoutPendingState();
                    const traceId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}`;
showPaymentFeedback('info', 'Criando seu pagamento no Mercado Pago...');
                    try {
                        const pendingPayment = await createPendingPayment(selectedPlan, traceId);
                        const preference = await createPaymentPreference(selectedPlan, pendingPayment, traceId);

                        sessionStorage.setItem('lastPendingPaymentId', String(preference.paymentId || pendingPayment.id || ''));
                        sessionStorage.setItem('lastMercadoPagoPreferenceId', String(preference.preferenceId || ''));
return preference.preferenceId;
                    } catch (error) {
clearCheckoutPendingState();
                        showPaymentFeedback('error', error?.message || 'Nao foi possivel criar o pagamento.');
                        throw error;
                    }
                },
                onError: (error) => {
                    resetCheckoutAfterPending('Nao foi possivel abrir o checkout agora. Tente novamente.');
showPaymentFeedback('error', 'Nao foi possivel abrir o popup do Mercado Pago. Tente novamente.');
                }
            }
        });
    } catch (error) {
        console.error('[Checkout] Falha ao renderizar Wallet Brick:', error);
        showPaymentFeedback('error', 'Nao foi possivel carregar o botao do Mercado Pago.');
        renderPaymentPlaceholder('Nao foi possivel carregar o checkout do Mercado Pago agora.');
    }
}

async function createPendingPayment(plan, traceId) {
    const totalApartments =
        Number(currentUser?.condominium?.totalApartments) ||
        Number(currentUser?.condominium?.total_apartments) ||
        Number(currentUser?.condominium?.total_apartamentos) ||
        Number(currentUser?.totalApartments) ||
        0;

    const computed = computePaymentAmount({ totalApartments, plan });

    const requestBody = {
        email: currentUser.email,
        cep: extractUserCep(currentUser),
        plano_id: plan.id,
        total_apartamentos: computed.totalApartments,
        valor_por_unidade: computed.valorPorUnidade,
        valor_minimo: computed.valorMinimo,
        valor_pago: computed.valorPago,
        status_pagamento: 'pendente',
        data_pagamento: new Date().toISOString()
    };
const response = await fetch('/api/pagamento', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));
const resolved = Array.isArray(payload) ? payload[0] : payload;

    if (!response.ok) {
        throw new Error(payload.error || payload.message || `[api/pagamento ${response.status}] Falha ao criar pagamento pendente.`);
    }

    if (!resolved || !resolved.id) {
        throw new Error('[api/pagamento] Resposta invalida ao criar pagamento pendente.');
    }

    return resolved;
}

async function createPaymentPreference(plan, pendingPayment, traceId) {
    const totalApartments =
        Number(currentUser?.condominium?.totalApartments) ||
        Number(currentUser?.condominium?.total_apartments) ||
        Number(currentUser?.condominium?.total_apartamentos) ||
        Number(currentUser?.totalApartments) ||
        0;

    const computed = computePaymentAmount({ totalApartments, plan });

    const requestBody = {
        email: currentUser.email,
        cep: extractUserCep(currentUser),
        planId: plan.id,
        pendingPaymentId: pendingPayment?.id || null,
        total_apartamentos: computed.totalApartments,
        valor_por_unidade: computed.valorPorUnidade,
        valor_minimo: computed.valorMinimo,
        valor_pago: computed.valorPago,
        user: currentUser
    };
const response = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));
if (!response.ok) {
        throw new Error(payload.error || payload.message || `[api/mercadopago/preference ${response.status}] Falha ao criar preferencia no Mercado Pago.`);
    }

    if (!payload.preferenceId) {
        throw new Error('[api/mercadopago/preference] Resposta invalida: preferenceId ausente.');
    }

    return payload;
}

function bindReturnListeners() {
    window.addEventListener('focus', () => {
        if (checkoutFlowPending) {
            handleCheckoutReturn();
            return;
        }
        refreshApprovedPaymentStatus();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            if (checkoutFlowPending) {
                handleCheckoutReturn();
                return;
            }
            refreshApprovedPaymentStatus();
        }
    });
}

async function refreshApprovedPaymentStatus(options = {}) {
    if (!currentUser?.email) return;

    try {
        if (typeof window.clearCondomitBillingCache === 'function') {
            window.clearCondomitBillingCache();
        }

        const billing = await fetchCondominiumBillingStatus(true);

        if (billing?.can_use) {
            clearCheckoutPendingState();
            persistApprovedPlan(billing);
            window.location.href = 'index.html';
            return true;
        }

        if (options.resetIfPending) {
            resetCheckoutAfterPending(options.message);
        }
    } catch (error) {
        console.warn('[Checkout] Nao foi possivel revalidar a mensalidade:', error);
        if (options.resetIfPending) {
            resetCheckoutAfterPending('Nao foi possivel confirmar o pagamento agora. Voce pode tentar novamente.');
        }
    }

    return false;
}

function persistApprovedPlan(paymentOrBilling) {
    const planId = paymentOrBilling?.plano_id ?? paymentOrBilling?.plan_id;
    if (!planId || !currentUser) return;
    currentUser.plan = planId;
    sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
}

function renderPaymentPlaceholder(message) {
    const container = document.getElementById('payment-brick_container');
    if (!container) return;

    container.innerHTML = `
        <div class="payment-placeholder">
            <i class="fas fa-credit-card"></i>
            <p>${message}</p>
        </div>
    `;
}

function showPaymentFeedback(type, message) {
    const feedback = document.getElementById('payment-feedback');
    if (!feedback) return;

    feedback.className = `payment-feedback ${type || 'info'}`;
    feedback.textContent = message || '';
}

function clearCheckoutPendingState() {
    checkoutFlowPending = false;
    lastCheckoutInitiatedAt = 0;
    if (checkoutRecoveryTimeout) {
        window.clearTimeout(checkoutRecoveryTimeout);
        checkoutRecoveryTimeout = null;
    }
    if (checkoutPendingHardTimeout) {
        window.clearTimeout(checkoutPendingHardTimeout);
        checkoutPendingHardTimeout = null;
    }
}

function markCheckoutPendingState() {
    clearCheckoutPendingState();
    checkoutFlowPending = true;
    lastCheckoutInitiatedAt = Date.now();

    checkoutPendingHardTimeout = window.setTimeout(() => {
        if (checkoutFlowPending) {
            console.warn('[Checkout] Timeout máximo de fluxo atingido. Recuperando estado...');
            resetCheckoutAfterPending(
                'O checkout do Mercado Pago ficou aberto por muito tempo sem conclusão. Quando quiser, abra o pagamento novamente.'
            );
        }
    }, 90 * 1000);
}

function resetCheckoutAfterPending(message) {
    const wasPending = checkoutFlowPending;
    clearCheckoutPendingState();
    showPaymentFeedback('info', message || 'Pagamento não concluído ainda. Quando quiser, abra o checkout novamente.');

    if (wasPending) {
        window.setTimeout(async () => {
            try {
                await initCheckoutButton();
            } catch (err) {
                console.warn('[Checkout] Não foi possível reinicializar o Wallet Brick:', err);
                renderPaymentPlaceholder(
                    'O botão de pagamento ficou temporariamente indisponível. Recarregue a página para tentar novamente.'
                );
            }
        }, 300);
    }
}

function handleCheckoutReturn() {
    showPaymentFeedback('info', 'Verificando o status do pagamento...');
    if (checkoutRecoveryTimeout) {
        window.clearTimeout(checkoutRecoveryTimeout);
    }

    checkoutRecoveryTimeout = window.setTimeout(() => {
        refreshApprovedPaymentStatus({
            resetIfPending: true,
            message: 'Nao feche a janela antes de concluir o pagamento. Se voce fechou, basta abrir o checkout novamente.'
        });
    }, 700);
}

function extractUserCep(user) {
    return user?.condominium?.cep ||
        user?.condominium?.condominium_id ||
        user?.condominium_cep ||
        user?.cep ||
        '';
}

function formatCurrency(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(amount);
}

function computePaymentAmount({ totalApartments, plan }) {
    const apartments = Number(totalApartments);
    const unitPrice = Number(plan?.valor_por_unidade);
    const minimum = Number(plan?.valor_minimo);

    if (!Number.isFinite(apartments) || apartments <= 0) {
        throw new Error('Nao foi possivel identificar o total de apartamentos do condominio.');
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new Error('Plano selecionado sem valor_por_unidade valido.');
    }

    if (!Number.isFinite(minimum) || minimum <= 0) {
        throw new Error('Plano selecionado sem valor_minimo valido.');
    }

    const calculated = apartments * unitPrice;
    const total = calculated >= minimum ? calculated : minimum;

    return {
        totalApartments: apartments,
        valorPorUnidade: unitPrice,
        valorMinimo: minimum,
        valorPago: total
    };
}
