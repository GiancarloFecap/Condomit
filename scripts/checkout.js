let currentUser = null;
let selectedPlan = null;
let selectedPrice = 0;
let plans = [];
let activePaymentPopup = null;
let activePopupWatcher = null;
let paymentResultHandled = false;
let paymentFinalizationInProgress = false;

document.addEventListener('DOMContentLoaded', async function() {
    if (handlePopupReturnToOpener()) {
        return;
    }

    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (!loggedInUser) {
        window.location.href = 'entrar.html';
        return;
    }

    currentUser = JSON.parse(loggedInUser);
    const checkoutReturnData = getCheckoutReturnFromUrl();

    if (currentUser.type !== 'sindico') {
        window.location.href = 'assembleia.html';
        return;
    }

    if (!currentUser.condominium) {
        window.location.href = 'condominio_register.html';
        return;
    }

    registerPaymentMessageListener();
    configureLogoutButton();

    try {
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        if (approvedPayment) {
            syncApprovedPlanLocally(approvedPayment);
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('[Checkout] Erro ao verificar pagamento aprovado:', error);
    }

    try {
        plans = await fetchPlans();
        renderPlans();
    } catch (error) {
        console.error('[Checkout] Erro ao carregar planos:', error);
        alert('Erro ao carregar planos. Tente novamente.');
        return;
    }

    await initCheckoutButton();

    if (checkoutReturnData) {
        await processMercadoPagoReturn(checkoutReturnData);
    }
});

function getCheckoutReturnFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout_status');
    const paymentId = params.get('payment_id') || params.get('collection_id');
    const planId = params.get('plan_id');

    if (!checkoutStatus && !paymentId) {
        return null;
    }

    return {
        checkoutStatus,
        paymentId,
        planId
    };
}

function handlePopupReturnToOpener() {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout_status');
    const paymentId = params.get('payment_id') || params.get('collection_id');
    const planId = params.get('plan_id');

    if (!checkoutStatus && !paymentId) {
        return false;
    }

    if (!window.opener || window.opener.closed) {
        return false;
    }

    try {
        window.opener.postMessage({
            type: 'condomit-checkout-status',
            checkoutStatus,
            paymentId,
            planId
        }, window.location.origin);
    } catch (error) {
        console.error('[Checkout] Falha ao notificar a janela principal:', error);
    }

    document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:24px;font-family:Arial,sans-serif;">
            <div style="max-width:420px;text-align:center;background:#fff;border-radius:16px;padding:32px;box-shadow:0 20px 50px rgba(15,23,42,0.12);">
                <h1 style="margin:0 0 12px;font-size:24px;color:#0f172a;">Pagamento processado</h1>
                <p style="margin:0;color:#475569;line-height:1.6;">Você pode fechar esta janela. Estamos finalizando a verificação do seu pagamento.</p>
            </div>
        </div>
    `;

    setTimeout(() => {
        window.close();
    }, 600);

    return true;
}

function registerPaymentMessageListener() {
    window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) {
            return;
        }

        const data = event.data || {};
        if (data.type !== 'condomit-checkout-status') {
            return;
        }

        // #region debug-point E:popup-return-message
        fetch("http://127.0.0.1:7780/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"mercado-pago-sandbox",runId:"pre-fix",hypothesisId:"E",location:"scripts/checkout.js:registerPaymentMessageListener",msg:"[DEBUG] Mensagem recebida do popup",data,ts:Date.now()})}).catch(()=>{});
        // #endregion
        paymentResultHandled = true;
        clearPopupWatcher();
        await processMercadoPagoReturn(data);
    });
}

function configureLogoutButton() {
    const logoutBtn = document.getElementById('btn-logout-checkout');
    if (!logoutBtn) {
        return;
    }

    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        sessionStorage.removeItem('condominiumUser');
        try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
        window.location.href = 'entrar.html';
    });
}

function normalizeCurrencyValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    const raw = String(value ?? '').trim();
    if (!raw) {
        return 0;
    }

    const cleaned = raw.replace(/[^\d,.-]/g, '');
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decimalIndex = Math.max(lastComma, lastDot);

    let normalized = cleaned;
    if (decimalIndex >= 0) {
        const integerPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, '');
        const decimalPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, '');
        normalized = `${integerPart}.${decimalPart}`;
    } else {
        normalized = cleaned.replace(/[.,]/g, '');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getPlanPrice(plan) {
    return normalizeCurrencyValue(plan?.valor_minimo);
}

function findPlanById(planId) {
    if (planId === undefined || planId === null || planId === '') {
        return null;
    }

    return plans.find((plan) => String(plan.id) === String(planId)) || null;
}

function getPreferredDefaultPlan() {
    return (
        plans.find((plan) => String(plan.nome || '').toLowerCase().includes('pro')) ||
        plans[1] ||
        plans[0] ||
        null
    );
}

async function fetchPlans() {
    const response = await fetch('/api/plano');
    if (!response.ok) {
        throw new Error('Falha ao buscar planos');
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function fetchApprovedPayment(email) {
    const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    const payments = await response.json();
    return Array.isArray(payments)
        ? payments.find((payment) => payment.status_pagamento === 'aprovado')
        : null;
}

async function createPayment(paymentData) {
    const response = await fetch('/api/pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Falha ao registrar pagamento');
    }
    return data;
}

async function verifyMercadoPagoPayment(paymentId) {
    const response = await fetch('/api/mercadopago/payment-status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paymentId })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Falha ao verificar pagamento');
    }

    return data;
}

function renderPlans() {
    const container = document.getElementById('plans-list-container');
    container.innerHTML = '';

    plans.forEach((plan, index) => {
        const planCard = document.createElement('div');
        const price = getPlanPrice(plan);
        const isRecommended = index === 1;
        planCard.className = `plan-card-option ${isRecommended ? 'selected' : ''}`;
        planCard.dataset.planId = String(plan.id);

        let icon = 'fa-leaf';
        let features = [];
        if (String(plan.nome || '').includes('Pro')) {
            icon = 'fa-rocket';
            features = ['Tudo do Essencial', 'Modulo Financeiro', 'Controle de Acesso'];
        } else if (String(plan.nome || '').includes('Premium')) {
            icon = 'fa-crown';
            features = ['Tudo do Pro', 'APIs e White-label', 'Suporte Prioritario'];
        } else {
            features = ['Mural de avisos', 'Reservas simples'];
        }

        planCard.innerHTML = `
            ${isRecommended ? '<div class="featured-badge">MAIS RECOMENDADO</div>' : ''}
            <div class="plan-card-header">
                <div class="plan-icon"><i class="fas ${icon}"></i></div>
                <div class="plan-meta">
                    <h3>${plan.nome}</h3>
                    <p>${plan.descricao || ''}</p>
                </div>
                <div class="plan-card-price">
                    <span class="currency">R$</span>
                    <span class="amount">${price.toFixed(0)}</span>
                    <span class="period">/mes</span>
                </div>
            </div>
            <ul class="plan-mini-features">
                ${features.map((feature) => `<li><i class="fas fa-check"></i> ${feature}</li>`).join('')}
            </ul>
        `;

        planCard.addEventListener('click', () => selectPlan(planCard, plan));
        container.appendChild(planCard);
    });

    const defaultPlan = getPreferredDefaultPlan();
    if (defaultPlan) {
        const defaultCard = Array.from(container.querySelectorAll('.plan-card-option'))
            .find((card) => card.dataset.planId === String(defaultPlan.id));
        if (defaultCard) {
            selectPlan(defaultCard, defaultPlan);
        }
    } else {
        updateSummary();
    }
}

function selectPlan(card, plan) {
    document.querySelectorAll('.plan-card-option').forEach((option) => option.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = plan;
    selectedPrice = getPlanPrice(plan);
    updateSummary();
    initCheckoutButton();
}

function updateSummary() {
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');

    if (!selectedPlan) {
        summaryPlanName.textContent = 'Nenhum plano selecionado';
        summaryTotalPrice.textContent = 'R$ 0,00';
        return;
    }

    summaryPlanName.textContent = selectedPlan.nome;
    summaryTotalPrice.textContent = `R$ ${selectedPrice.toFixed(2).replace('.', ',')}`;
}

async function createPreference() {
    if (!currentUser?.email) {
        throw new Error('Usuario nao autenticado. Por favor, faca login novamente.');
    }

    if (!selectedPlan) {
        throw new Error('Selecione um plano antes de continuar.');
    }

    // #region debug-point C:create-preference-start
    fetch("http://127.0.0.1:7780/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"mercado-pago-sandbox",runId:"pre-fix",hypothesisId:"C",location:"scripts/checkout.js:createPreference:start",msg:"[DEBUG] Iniciando criacao da preferencia no frontend",data:{selectedPlanId:selectedPlan?.id,selectedPlanName:selectedPlan?.nome,selectedPrice,currentUserEmail:currentUser?.email},ts:Date.now()})}).catch(()=>{});
    // #endregion
    const response = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            amount: selectedPrice,
            planId: selectedPlan.id,
            planName: selectedPlan.nome
        })
    });

    const data = await response.json().catch(() => null);
    // #region debug-point C:create-preference-response
    fetch("http://127.0.0.1:7780/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"mercado-pago-sandbox",runId:"pre-fix",hypothesisId:"C",location:"scripts/checkout.js:createPreference:response",msg:"[DEBUG] Preferencia recebida no frontend",data:{ok:response.ok,status:response.status,data},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (!response.ok || data?.error) {
        throw new Error(data?.error || 'Erro ao criar preferencia de pagamento');
    }

    return data;
}

function showLoadingOverlay(message = 'Aguardando pagamento...') {
    hideLoadingOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'checkout-loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        flex-direction: column;
    `;
    overlay.innerHTML = `
        <div style="text-align:center; color:white;">
            <i class="fas fa-spinner fa-spin fa-5x"></i>
            <p style="margin-top:20px; font-size:20px;">${message}</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('checkout-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

function setCheckoutButtonState(disabled) {
    const btn = document.getElementById('checkout-btn');
    if (!btn) {
        return;
    }

    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.7' : '1';
}

function clearPopupWatcher() {
    if (activePopupWatcher) {
        clearInterval(activePopupWatcher);
        activePopupWatcher = null;
    }
}

function startPopupWatcher() {
    clearPopupWatcher();

    activePopupWatcher = setInterval(() => {
        if (!activePaymentPopup || !activePaymentPopup.closed) {
            return;
        }

        clearPopupWatcher();
        activePaymentPopup = null;

        if (!paymentResultHandled && !paymentFinalizationInProgress) {
            hideLoadingOverlay();
            setCheckoutButtonState(false);
            alert('Pagamento nao foi confirmado. Finalize o pagamento para liberar o acesso ao painel.');
        }
    }, 500);
}

async function processMercadoPagoReturn(returnData) {
    if (paymentFinalizationInProgress) {
        return;
    }

    paymentFinalizationInProgress = true;
    showLoadingOverlay('Validando pagamento...');
    setCheckoutButtonState(true);

    try {
        const checkoutStatus = String(returnData?.checkoutStatus || '').toLowerCase();
        const paymentId = returnData?.paymentId;
        const planFromReturn = findPlanById(returnData?.planId);
        const planToApply = planFromReturn || selectedPlan || getPreferredDefaultPlan();

        if (checkoutStatus === 'failure') {
            throw new Error('Pagamento nao foi concluido. Tente novamente.');
        }

        if (checkoutStatus === 'pending') {
            throw new Error('Pagamento ainda esta pendente. O acesso sera liberado somente apos a aprovacao.');
        }

        if (!paymentId) {
            throw new Error('Nao foi possivel identificar o pagamento retornado pelo Mercado Pago.');
        }

        const existingApprovedPayment = await fetchApprovedPayment(currentUser.email);
        if (existingApprovedPayment) {
            syncApprovedPlanLocally(existingApprovedPayment);
            window.location.href = 'index.html';
            return;
        }

        const paymentStatus = await verifyMercadoPagoPayment(paymentId);
        if (String(paymentStatus?.status || '').toLowerCase() !== 'approved') {
            throw new Error('O pagamento ainda nao foi aprovado pelo Mercado Pago.');
        }

        if (!planToApply) {
            throw new Error('Nao foi possivel identificar o plano pago.');
        }

        const planPrice = getPlanPrice(planToApply);
        const paidAmount = normalizeCurrencyValue(paymentStatus.transaction_amount) || planPrice;

        await createPayment({
            email: currentUser.email,
            cep: currentUser.condominium?.cep || '',
            plano_id: planToApply.id,
            total_apartamentos: currentUser.condominium?.totalApartments || 0,
            valor_por_unidade: normalizeCurrencyValue(planToApply.valor_por_unidade),
            valor_minimo: planPrice,
            valor_pago: paidAmount,
            status_pagamento: 'aprovado',
            codigo_transacao: String(paymentStatus.id),
            data_pagamento: new Date().toISOString()
        });

        await updateUserByEmail(currentUser.email, { plan: planToApply.nome });
        currentUser.plan = planToApply.nome;
        sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));

        hideLoadingOverlay();
        window.location.href = 'index.html';
    } catch (error) {
        console.error('[Checkout] Erro ao finalizar pagamento:', error);
        hideLoadingOverlay();
        setCheckoutButtonState(false);
        alert(error.message || 'Erro ao finalizar o pagamento. Tente novamente.');
    } finally {
        paymentFinalizationInProgress = false;
    }
}

function syncApprovedPlanLocally(approvedPayment) {
    if (!approvedPayment || !currentUser) {
        return;
    }

    const matchingPlan = findPlanById(approvedPayment.plano_id);
    if (matchingPlan?.nome) {
        currentUser.plan = matchingPlan.nome;
    } else if (approvedPayment.plano_id && !currentUser.plan) {
        currentUser.plan = approvedPayment.plano_id;
    }

    sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
}

async function initCheckoutButton() {
    const container = document.getElementById('payment-brick_container');
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Carregando pagamento...</div>';

    try {
        container.innerHTML = `
            <div style="text-align:center;">
                <button id="checkout-btn" style="
                    background-color: #009ee3;
                    color: white;
                    border: none;
                    padding: 15px 40px;
                    font-size: 18px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: background-color 0.3s;
                ">
                    <i class="fas fa-credit-card"></i> Pagar com Mercado Pago
                </button>
            </div>
        `;

        if (selectedPlan?.nome) {
            sessionStorage.setItem('selectedPlan', selectedPlan.nome);
        }

        const btn = document.getElementById('checkout-btn');
        if (!selectedPlan) {
            setCheckoutButtonState(true);
            return;
        }

        setCheckoutButtonState(false);

        btn.addEventListener('click', async () => {
            try {
                // #region debug-point A:checkout-button-click
                fetch("http://127.0.0.1:7780/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"mercado-pago-sandbox",runId:"pre-fix",hypothesisId:"A",location:"scripts/checkout.js:initCheckoutButton:click",msg:"[DEBUG] Clique no botao de pagamento",data:{selectedPlanId:selectedPlan?.id,selectedPlanName:selectedPlan?.nome,selectedPrice},ts:Date.now()})}).catch(()=>{});
                // #endregion
                paymentResultHandled = false;
                showLoadingOverlay('Aguardando pagamento...');
                setCheckoutButtonState(true);

                const popupWidth = 820;
                const popupHeight = 820;
                const left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));
                const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
                activePaymentPopup = window.open('about:blank', 'MercadoPago', `width=${popupWidth},height=${popupHeight},left=${left},top=${top}`);
                // #region debug-point A:popup-open
                fetch("http://127.0.0.1:7780/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"mercado-pago-sandbox",runId:"pre-fix",hypothesisId:"A",location:"scripts/checkout.js:initCheckoutButton:window.open",msg:"[DEBUG] Resultado da abertura inicial do popup",data:{popupOpened:Boolean(activePaymentPopup)},ts:Date.now()})}).catch(()=>{});
                // #endregion

                if (activePaymentPopup && !activePaymentPopup.closed) {
                    activePaymentPopup.document.write(`
                        <html>
                        <head><title>Redirecionando para o pagamento</title></head>
                        <body style="font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a;">
                            <div style="text-align:center;padding:24px;">
                                <h1 style="font-size:22px;margin-bottom:12px;">Abrindo Mercado Pago...</h1>
                                <p style="margin:0;color:#475569;">Se o redirecionamento nao acontecer, volte para a aba principal e tente novamente.</p>
                            </div>
                        </body>
                        </html>
                    `);
                    activePaymentPopup.document.close();
                }

                const preferenceData = await createPreference();
                if (activePaymentPopup && !activePaymentPopup.closed) {
                    activePaymentPopup.location.replace(preferenceData.initPoint);
                    startPopupWatcher();
                } else {
                    window.location.href = preferenceData.initPoint;
                    return;
                }
                // #region debug-point A:popup-navigate
                fetch("http://127.0.0.1:7780/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"mercado-pago-sandbox",runId:"pre-fix",hypothesisId:"A",location:"scripts/checkout.js:initCheckoutButton:popupNavigate",msg:"[DEBUG] Navegando popup para URL da preferencia",data:{initPoint:preferenceData?.initPoint,testMode:preferenceData?.testMode,usedPopup:Boolean(activePaymentPopup && !activePaymentPopup.closed)},ts:Date.now()})}).catch(()=>{});
                // #endregion
            } catch (error) {
                console.error('[Checkout] Erro ao processar pagamento:', error);
                hideLoadingOverlay();
                clearPopupWatcher();
                try { activePaymentPopup?.close(); } catch (_) {}
                activePaymentPopup = null;
                setCheckoutButtonState(false);
                alert(error.message || 'Erro ao processar pagamento. Tente novamente.');
            }
        });
    } catch (error) {
        console.error('[Checkout] Erro ao carregar botao de pagamento:', error);
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Erro ao carregar pagamento. Tente novamente.<br><small style="color:#9ca3af;">${error.message}</small></div>`;
    }
}

async function updateUserByEmail(email, updates) {
    try {
        const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erro ao atualizar usuario:', error);
        throw error;
    }
}
