
let currentUser = null;
let selectedPlan = null;
let selectedPrice = null;
let plans = [];
let mercadoPagoConfig = null;
let mercadoPagoInstance = null;
let walletBrickController = null;

const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event';
const DEBUG_SESSION_ID = 'mercadopago-button-error';

function reportDebugEvent({ runId, hypothesisId, location, msg, data, traceId }) {
    try {
        fetch(DEBUG_SERVER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: DEBUG_SESSION_ID,
                runId,
                hypothesisId,
                location,
                msg,
                data,
                traceId,
                ts: Date.now()
            })
        }).catch(() => { });
    } catch (_) { }
}

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
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        if (approvedPayment) {
            persistApprovedPlan(approvedPayment);
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('[Checkout] Erro ao consultar pagamento aprovado:', error);
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

async function fetchApprovedPayment(email) {
    const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    const payments = await response.json();
    return Array.isArray(payments)
        ? payments.find((payment) => payment.status_pagamento === 'aprovado')
        : null;
}

async function fetchMercadoPagoConfig() {
    const response = await fetch('/api/mercadopago/config');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.publicKey) {
        // #region debug-point B:config-failed
        reportDebugEvent({
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'scripts/checkout.js:fetchMercadoPagoConfig',
            msg: '[DEBUG] Mercado Pago config endpoint failed',
            data: {
                status: response.status,
                payload
            }
        });
        // #endregion
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
                    showPaymentFeedback('info', 'Clique no botao para abrir o popup do Mercado Pago.');
                },
                onSubmit: async () => {
                    const traceId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}`;
                    // #region debug-point A:onSubmit-start
                    reportDebugEvent({
                        runId: 'pre-fix',
                        hypothesisId: 'A',
                        location: 'scripts/checkout.js:onSubmit',
                        msg: '[DEBUG] Wallet Brick onSubmit triggered',
                        data: {
                            email: currentUser?.email || null,
                            selectedPlanId: selectedPlan?.id || null,
                            selectedPlanName: selectedPlan?.nome || null
                        },
                        traceId
                    });
                    // #endregion
                    showPaymentFeedback('info', 'Criando seu pagamento no Mercado Pago...');
                    try {
                        const pendingPayment = await createPendingPayment(selectedPlan, traceId);
                        const preference = await createPaymentPreference(selectedPlan, pendingPayment, traceId);

                        sessionStorage.setItem('lastPendingPaymentId', String(preference.paymentId || pendingPayment.id || ''));
                        sessionStorage.setItem('lastMercadoPagoPreferenceId', String(preference.preferenceId || ''));

                        // #region debug-point A:onSubmit-success
                        reportDebugEvent({
                            runId: 'pre-fix',
                            hypothesisId: 'A',
                            location: 'scripts/checkout.js:onSubmit',
                            msg: '[DEBUG] Wallet Brick onSubmit resolved preference',
                            data: {
                                preferenceId: preference?.preferenceId || null,
                                paymentId: preference?.paymentId || pendingPayment?.id || null
                            },
                            traceId
                        });
                        // #endregion

                        return preference.preferenceId;
                    } catch (error) {
                        // #region debug-point A:onSubmit-failed
                        reportDebugEvent({
                            runId: 'pre-fix',
                            hypothesisId: 'A',
                            location: 'scripts/checkout.js:onSubmit',
                            msg: '[DEBUG] Wallet Brick onSubmit failed',
                            data: {
                                message: error?.message || String(error),
                                stack: error?.stack || null
                            },
                            traceId
                        });
                        // #endregion
                        showPaymentFeedback('error', error?.message || 'Nao foi possivel criar o pagamento.');
                        throw error;
                    }
                },
                onError: (error) => {
                    // #region debug-point E:brick-error
                    reportDebugEvent({
                        runId: 'pre-fix',
                        hypothesisId: 'E',
                        location: 'scripts/checkout.js:onError',
                        msg: '[DEBUG] Wallet Brick onError triggered',
                        data: {
                            message: error?.message || String(error),
                            stack: error?.stack || null,
                            name: error?.name || null
                        }
                    });
                    // #endregion
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

    // #region debug-point A:pending-request
    reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'scripts/checkout.js:createPendingPayment',
        msg: '[DEBUG] Creating pending payment via /api/pagamento',
        data: {
            requestBody: {
                email: requestBody.email,
                cep: requestBody.cep,
                plano_id: requestBody.plano_id,
                total_apartamentos: requestBody.total_apartamentos,
                valor_por_unidade: requestBody.valor_por_unidade,
                valor_minimo: requestBody.valor_minimo,
                valor_pago: requestBody.valor_pago,
                status_pagamento: requestBody.status_pagamento
            }
        },
        traceId
    });
    // #endregion

    const response = await fetch('/api/pagamento', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));

    // #region debug-point A:pending-response
    reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'scripts/checkout.js:createPendingPayment',
        msg: '[DEBUG] Pending payment response received',
        data: {
            status: response.status,
            ok: response.ok,
            payload
        },
        traceId
    });
    // #endregion

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

    // #region debug-point A:preference-request
    reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'scripts/checkout.js:createPaymentPreference',
        msg: '[DEBUG] Creating Mercado Pago preference via /api/mercadopago/preference',
        data: {
            requestBody: {
                email: requestBody.email,
                cep: requestBody.cep,
                planId: requestBody.planId,
                pendingPaymentId: requestBody.pendingPaymentId,
                total_apartamentos: requestBody.total_apartamentos,
                valor_por_unidade: requestBody.valor_por_unidade,
                valor_minimo: requestBody.valor_minimo,
                valor_pago: requestBody.valor_pago
            }
        },
        traceId
    });
    // #endregion

    const response = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));

    // #region debug-point A:preference-response
    reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: response.ok ? 'A' : 'B',
        location: 'scripts/checkout.js:createPaymentPreference',
        msg: '[DEBUG] Preference response received',
        data: {
            status: response.status,
            ok: response.ok,
            payload
        },
        traceId
    });
    // #endregion

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
        refreshApprovedPaymentStatus();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            refreshApprovedPaymentStatus();
        }
    });
}

async function refreshApprovedPaymentStatus() {
    if (!currentUser?.email) return;

    try {
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        if (approvedPayment) {
            persistApprovedPlan(approvedPayment);
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.warn('[Checkout] Nao foi possivel revalidar pagamento aprovado:', error);
    }
}

function persistApprovedPlan(payment) {
    if (!payment?.plano_id || !currentUser) return;
    currentUser.plan = payment.plano_id;
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
