
let currentUser = null;
let selectedPlan = null;
let selectedPrice = null;
let plans = [];
let checkoutFlowPending = false;
let checkoutRecoveryTimeout = null;
let checkoutPendingHardTimeout = null;
let lastCheckoutInitiatedAt = 0;


document.addEventListener('DOMContentLoaded', async function () {
    const isUpgradeFlow = new URLSearchParams(window.location.search).get('upgrade') === '1';
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

    // O botão é desenhado imediatamente pelo HTML/JS da própria Condomit.
    // Ele não depende mais do carregamento tardio do SDK visual do Mercado Pago.
    renderDirectMercadoPagoButton('Selecione o plano e continue para o ambiente seguro do Mercado Pago.');

    const logoutBtn = document.getElementById('btn-logout-checkout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function (event) {
            event.preventDefault();
            await logoutCheckoutUser();
        });
    }

    bindReturnListeners();
    bindAbandonedPaymentBackGuard();

    // Plano e status de cobrança são consultados em paralelo. Isso reduz o tempo
    // até o checkout ficar utilizável sem abrir mão do redirecionamento de quem
    // já está com a mensalidade válida.
    const [billingResult, plansResult] = await Promise.allSettled([
        fetchCondominiumBillingStatus(true),
        fetchPlans()
    ]);

    if (billingResult.status === 'fulfilled') {
        const billing = billingResult.value;
        if (billing?.can_use) {
            persistApprovedPlan(billing);
            if (!isUpgradeFlow) {
                window.location.href = 'index.html';
                return;
            }
        }
    } else {
        console.error('[Checkout] Erro ao consultar mensalidade do condomínio:', billingResult.reason);
    }

    if (plansResult.status !== 'fulfilled') {
        console.error('[Checkout] Erro ao carregar planos:', plansResult.reason);
        showPaymentFeedback('error', plansResult.reason?.message || 'Não foi possível carregar os planos agora.');
        syncDirectMercadoPagoButtonState();
        return;
    }

    plans = Array.isArray(plansResult.value) ? plansResult.value : [];
    renderPlans();

    const previousPaymentState = await reconcileStoredMercadoPagoPayment();
    if (previousPaymentState === 'approved' || previousPaymentState === 'pending') {
        return;
    }

    syncDirectMercadoPagoButtonState();
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

        const essentialFeatures = [
            'Início, Mural de Avisos, Sugestões e Notificações',
            'Gestão de Moradores e IA - Dúvidas',
            'Dados pessoais, Minha unidade e Configurações'
        ];
        const proFeatures = [
            'Chats, Achados e Perdidos e Assembleias',
            'Reserva de Locais e Manutenção Preventiva',
            'Controle de Acesso, Encomendas e acesso de Porteiro'
        ];
        const premiumFeatures = [
            'Ocorrências e Marketplace',
            'Gestão Avançada e recursos vinculados',
            'IA - Comunicados Automáticos'
        ];

        let icon = 'fa-leaf';
        let features = [...essentialFeatures];
        const normalizedPlanName = planName.trim().toLowerCase();
        if (normalizedPlanName.includes('premium')) {
            icon = 'fa-crown';
            // Premium herda integralmente Essencial + Pro.
            features = [...essentialFeatures, ...proFeatures, ...premiumFeatures];
        } else if (normalizedPlanName.includes('pro')) {
            icon = 'fa-rocket';
            // Pro herda integralmente o Essencial.
            features = [...essentialFeatures, ...proFeatures];
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

function selectPlan(card, plan) {
    document.querySelectorAll('.plan-card-option').forEach((option) => option.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = plan;
    selectedPrice = plan.valor_minimo;
    updateSummary();
    syncDirectMercadoPagoButtonState();
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
            clearMercadoPagoFlowStarted();
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

async function reconcileStoredMercadoPagoPayment() {
    let externalReference = '';
    try {
        externalReference = String(sessionStorage.getItem('lastMercadoPagoExternalReference') || '').trim();
    } catch (_) {}

    if (!externalReference) return 'none';

    try {
        showPaymentFeedback('info', 'Verificando se existe um pagamento anterior em processamento...');
        const response = await fetch('/api/mercadopago/confirm', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({
                external_reference: externalReference,
                status: 'pending'
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Falha ao revalidar pagamento anterior.');

        if (!payload.mercadoPagoFound && !payload.mercadoPagoPaymentId) {
            clearStoredMercadoPagoAttempt();
            showPaymentFeedback('info', 'A tentativa anterior não chegou a gerar uma cobrança no Mercado Pago. Você pode tentar novamente.');
            return 'failure';
        }

        const status = normalizeMercadoPagoReturnStatus(payload.mercadoPagoStatus || payload.status);
        if (status === 'approved') {
            clearStoredMercadoPagoAttempt();
            persistApprovedPlan(payload.payment || {});
            showPaymentFeedback('success', 'Pagamento aprovado. Liberando seu acesso...');
            window.setTimeout(() => window.location.replace('index.html'), 900);
            return 'approved';
        }

        if (status === 'pending') {
            renderPendingMercadoPagoAttempt(payload.mercadoPagoPaymentId);
            return 'pending';
        }

        clearStoredMercadoPagoAttempt();
        showPaymentFeedback('info', 'O pagamento anterior foi encerrado. Você pode iniciar uma nova tentativa.');
        return 'failure';
    } catch (error) {
        console.warn('[Checkout] Não foi possível reconciliar o pagamento anterior:', error);
        return 'none';
    }
}

function normalizeMercadoPagoReturnStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    if (['approved', 'aprovado'].includes(normalized)) return 'approved';
    if (['pending', 'in_process', 'in_mediation', 'authorized', 'pendente', 'em_processo'].includes(normalized)) return 'pending';
    return 'failure';
}

function clearStoredMercadoPagoAttempt() {
    try {
        sessionStorage.removeItem('lastPendingPaymentId');
        sessionStorage.removeItem('lastMercadoPagoPreferenceId');
        sessionStorage.removeItem('lastMercadoPagoExternalReference');
        sessionStorage.removeItem('condomitMercadoPagoFlowStartedAt');
    } catch (_) {}
}

function renderPendingMercadoPagoAttempt(mercadoPagoPaymentId) {
    const idText = mercadoPagoPaymentId ? ` #${mercadoPagoPaymentId}` : '';
    showPaymentFeedback(
        'info',
        `Seu pagamento Mercado Pago${idText} ainda está em processamento. Para evitar cobrança duplicada, aguarde a confirmação antes de criar outro pagamento.`
    );

    const container = document.getElementById('payment-brick_container');
    if (!container) return;
    container.innerHTML = `
        <div class="payment-placeholder payment-pending-lock">
            <i class="fas fa-clock"></i>
            <p>Existe um pagamento em processamento para este condomínio.</p>
            <button type="button" id="recheckMercadoPagoPayment" class="mercado-pago-direct-button">
                <i class="fas fa-rotate"></i>
                Atualizar status
            </button>
        </div>
    `;

    document.getElementById('recheckMercadoPagoPayment')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando...';
        const state = await reconcileStoredMercadoPagoPayment();
        if (state === 'failure' || state === 'none') {
            renderDirectMercadoPagoButton('Selecione o plano e continue para o ambiente seguro do Mercado Pago.');
        }
        if (state === 'pending') {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-rotate"></i> Atualizar status';
        }
    });
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
    try { syncDirectMercadoPagoButtonState(); } catch (_) {}
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
        window.setTimeout(() => {
            renderDirectMercadoPagoButton('Selecione o plano e continue para o ambiente seguro do Mercado Pago.');
            syncDirectMercadoPagoButtonState();
        }, 150);
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
            message: 'O pagamento ainda não foi concluído. Você pode abrir o checkout novamente.'
        });
    }, 700);
}


async function logoutCheckoutUser() {
    try {
        if (window.supabase?.auth?.signOut) {
            await window.supabase.auth.signOut({ scope: 'local' });
        }
    } catch (error) {
        console.warn('[Checkout] Falha ao encerrar sessão Supabase:', error?.message || error);
    }

    try {
        sessionStorage.removeItem('condominiumUser');
        sessionStorage.removeItem('sb-session');
        sessionStorage.removeItem('sb-access-token');
        sessionStorage.removeItem('selectedPlan');
        sessionStorage.removeItem('selectedPlanId');
        sessionStorage.removeItem('lastPendingPaymentId');
        sessionStorage.removeItem('lastMercadoPagoPreferenceId');
        sessionStorage.removeItem('lastMercadoPagoExternalReference');
        sessionStorage.removeItem('condomitMercadoPagoFlowStartedAt');
    } catch (_) {}

    try {
        localStorage.removeItem('condominiumPersistentUser');
        localStorage.removeItem('condomitPersistentUserV2');
        localStorage.setItem('authExplicitLogoutAt', String(Date.now()));
    } catch (_) {}

    try { window.clearPersistedCondomitUser?.(); } catch (_) {}
    window.location.replace('entrar.html');
}

function markMercadoPagoFlowStarted() {
    try {
        sessionStorage.setItem('condomitMercadoPagoFlowStartedAt', String(Date.now()));
    } catch (_) {}
}

function clearMercadoPagoFlowStarted() {
    try { sessionStorage.removeItem('condomitMercadoPagoFlowStartedAt'); } catch (_) {}
}

function bindAbandonedPaymentBackGuard() {
    window.addEventListener('pageshow', async (event) => {
        let startedAt = 0;
        try { startedAt = Number(sessionStorage.getItem('condomitMercadoPagoFlowStartedAt') || 0); } catch (_) {}
        if (!startedAt) return;

        const nav = performance.getEntriesByType?.('navigation')?.[0];
        const returnedByBack = Boolean(event.persisted || nav?.type === 'back_forward');
        if (!returnedByBack) return;

        try {
            const billing = await fetchCondominiumBillingStatus(true);
            if (billing?.can_use) {
                clearMercadoPagoFlowStarted();
                persistApprovedPlan(billing);
                window.location.replace('index.html');
                return;
            }
        } catch (_) {}

        // Voltou do Mercado Pago sem concluir: a regra da Condomit é encerrar a sessão.
        await logoutCheckoutUser();
    });
}

function renderDirectMercadoPagoButton(message) {
    const container = document.getElementById('payment-brick_container');
    if (!container) return;

    container.innerHTML = `
        <div class="payment-direct-fallback">
            <button type="button" id="directMercadoPagoButton" class="mercado-pago-direct-button" disabled>
                <i class="fas fa-hand-holding-dollar"></i>
                <span>Pagar com Mercado Pago</span>
            </button>
            <p>${message || 'Você será direcionado ao ambiente seguro do Mercado Pago.'}</p>
        </div>
    `;

    const button = document.getElementById('directMercadoPagoButton');
    button?.addEventListener('click', startDirectMercadoPagoPayment);
    syncDirectMercadoPagoButtonState();
}

function syncDirectMercadoPagoButtonState() {
    const button = document.getElementById('directMercadoPagoButton');
    if (!button) return;
    const ready = Boolean(selectedPlan && selectedPrice != null && currentUser?.email);
    button.disabled = !ready || checkoutFlowPending;
    if (!checkoutFlowPending) {
        button.innerHTML = ready
            ? '<i class="fas fa-hand-holding-dollar"></i><span>Pagar com Mercado Pago</span>'
            : '<i class="fas fa-spinner fa-spin"></i><span>Carregando planos...</span>';
    }
}

async function startDirectMercadoPagoPayment() {
    const button = document.getElementById('directMercadoPagoButton');
    if (!button || !selectedPlan || button.disabled) return;

    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Abrindo Mercado Pago...</span>';
    showPaymentFeedback('info', 'Preparando o checkout seguro do Mercado Pago...');

    try {
        markCheckoutPendingState();
        markMercadoPagoFlowStarted();
        const traceId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}`;
        const pendingPayment = await createPendingPayment(selectedPlan, traceId);
        const preference = await createPaymentPreference(selectedPlan, pendingPayment, traceId);

        sessionStorage.setItem('lastPendingPaymentId', String(preference.paymentId || pendingPayment.id || ''));
        sessionStorage.setItem('lastMercadoPagoPreferenceId', String(preference.preferenceId || ''));
        sessionStorage.setItem('lastMercadoPagoExternalReference', String(preference.externalReference || ''));

        const isTestEnvironment = String(preference.environment || '').toLowerCase() === 'test';
        const checkoutUrl = isTestEnvironment
            ? (preference.sandboxInitPoint || preference.initPoint)
            : (preference.initPoint || preference.sandboxInitPoint);

        if (!checkoutUrl) {
            throw new Error('O Mercado Pago não retornou a URL do checkout.');
        }

        window.location.assign(checkoutUrl);
    } catch (error) {
        clearCheckoutPendingState();
        clearMercadoPagoFlowStarted();
        showPaymentFeedback('error', error?.message || 'Não foi possível iniciar o pagamento.');
        syncDirectMercadoPagoButtonState();
    }
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
