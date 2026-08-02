let currentUser = null;
let selectedPlan = null;
let selectedPrice = null;
let plans = [];
let currentPagamentoId = null;
let mpPopup = null;
let popupWatcher = null;
let paymentListenerAdded = false;
let paymentReturnHandled = false;
let checkoutInFlight = false;

document.addEventListener('DOMContentLoaded', async () => {
    renderBootState();

    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (!loggedInUser) {
        renderBlockedState(
            'Faça login para continuar',
            'Não encontramos uma sessão ativa para carregar o checkout.',
            'Ir para login',
            'entrar.html'
        );
        return;
    }

    currentUser = JSON.parse(loggedInUser);
    currentUser.type = normalizeUserType(currentUser);

    if (currentUser.type !== 'sindico') {
        renderBlockedState(
            'Checkout indisponível para este perfil',
            'A contratação do plano está disponível apenas para o perfil de síndico.',
            'Ir para assembleia',
            'assembleia.html'
        );
        return;
    }

    try {
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        if (approvedPayment) {
            renderBlockedState(
                'Plano já ativo',
                'Este condomínio já possui um pagamento aprovado. Você pode seguir para o painel principal.',
                'Ir para o painel',
                'index.html'
            );
            return;
        }
    } catch (error) {
        console.error('[Checkout] Falha ao verificar pagamento aprovado:', error);
    }

    bindLogoutButton();
    addMercadoPagoReturnListener();

    try {
        plans = await fetchPlans();
        if (!plans.length) {
            plans = getFallbackPlans();
        }
        renderPlans();
        renderCheckoutButton();
    } catch (error) {
        console.error('[Checkout] Falha ao carregar planos:', error);
        plans = getFallbackPlans();
        renderPlans();
        renderErrorState('Não foi possível conectar à API agora. Os planos exibidos são apenas de referência até a conexão voltar.');
    }
});

function normalizeUserType(user) {
    const raw = String(user?.type || user?.user_type || 'morador').trim().toLowerCase();
    if (raw.startsWith('sind')) return 'sindico';
    if (raw.startsWith('port')) return 'porteiro';
    return 'morador';
}

function bindLogoutButton() {
    const logoutBtn = document.getElementById('btn-logout-checkout');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        try {
            sessionStorage.removeItem('condominiumUser');
        } catch (_) {}
        window.location.href = 'entrar.html';
    });
}

function renderBootState() {
    const plansContainer = document.getElementById('plans-list-container');
    const paymentContainer = document.getElementById('payment-brick_container');
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');

    if (plansContainer) {
        plansContainer.innerHTML = `
            <div class="empty-state">
                <strong>Carregando checkout...</strong>
                <span>Estamos preparando os planos e o pagamento.</span>
            </div>
        `;
    }

    if (paymentContainer) {
        paymentContainer.innerHTML = `
            <div style="text-align:center;padding:18px;color:#475569;">
                <i class="fas fa-spinner fa-spin"></i> Preparando pagamento...
            </div>
        `;
    }

    if (summaryPlanName) {
        summaryPlanName.textContent = 'Carregando...';
    }

    if (summaryTotalPrice) {
        summaryTotalPrice.textContent = 'R$ 0,00';
    }
}

function renderBlockedState(title, description, buttonLabel, href) {
    const plansContainer = document.getElementById('plans-list-container');
    const paymentContainer = document.getElementById('payment-brick_container');
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');

    if (plansContainer) {
        plansContainer.innerHTML = `
            <div class="empty-state">
                <strong>${title}</strong>
                <span>${description}</span>
            </div>
        `;
    }

    if (paymentContainer) {
        paymentContainer.innerHTML = `
            <div style="text-align:center;padding:18px;">
                <a href="${href}" style="
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    gap:8px;
                    background:#1e40af;
                    color:white;
                    text-decoration:none;
                    border-radius:8px;
                    padding:14px 22px;
                    font-weight:700;
                ">
                    <i class="fas fa-arrow-right"></i> ${buttonLabel}
                </a>
            </div>
        `;
    }

    if (summaryPlanName) {
        summaryPlanName.textContent = '-';
    }

    if (summaryTotalPrice) {
        summaryTotalPrice.textContent = 'R$ 0,00';
    }
}

function getFallbackPlans() {
    return [
        {
            id: 'essencial',
            nome: 'Plano Essencial',
            descricao: 'Ideal para condomínios pequenos começarem a organizar a gestão.',
            valor_minimo: 79,
            valor_por_unidade: 0
        },
        {
            id: 'pro',
            nome: 'Plano Pro',
            descricao: 'Mais automação, comunicação e recursos financeiros para o condomínio.',
            valor_minimo: 149,
            valor_por_unidade: 0
        },
        {
            id: 'premium',
            nome: 'Plano Premium',
            descricao: 'Operação completa com recursos avançados e atendimento prioritário.',
            valor_minimo: 249,
            valor_por_unidade: 0
        }
    ];
}

async function fetchPlans() {
    const response = await fetch('/api/plano');
    if (!response.ok) {
        throw new Error('Falha ao buscar planos.');
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

async function fetchApprovedPayment(email) {
    const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;

    const payments = await response.json();
    if (!Array.isArray(payments)) return null;

    return payments.find((payment) => payment.status_pagamento === 'aprovado') || null;
}

async function createPayment(paymentData) {
    const response = await fetch('/api/pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao criar registro do pagamento.');
    }

    return response.json();
}

async function updatePaymentStatus(id, status) {
    if (!id) return null;

    const response = await fetch(`/api/pagamento?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status_pagamento: status,
            data_pagamento: new Date().toISOString()
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao atualizar status do pagamento.');
    }

    return response.json();
}

function formatCurrency(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(amount);
}

function getPlanFeatures(plan) {
    const normalizedName = String(plan?.nome || '').toLowerCase();

    if (normalizedName.includes('premium')) {
        return ['Tudo do Pro', 'APIs e white-label', 'Suporte prioritário'];
    }

    if (normalizedName.includes('pro')) {
        return ['Tudo do Essencial', 'Módulo financeiro', 'Controle de acesso'];
    }

    return ['Mural de avisos', 'Reservas simples', 'Comunicação básica'];
}

function getPlanIcon(plan) {
    const normalizedName = String(plan?.nome || '').toLowerCase();
    if (normalizedName.includes('premium')) return 'fa-crown';
    if (normalizedName.includes('pro')) return 'fa-rocket';
    return 'fa-leaf';
}

function renderPlans() {
    const container = document.getElementById('plans-list-container');
    if (!container) return;

    container.innerHTML = '';

    if (!plans.length) {
        container.innerHTML = '<p class="empty-state">Nenhum plano disponível no momento.</p>';
        return;
    }

    plans.forEach((plan, index) => {
        const card = document.createElement('div');
        const isRecommended = index === Math.min(1, plans.length - 1);

        card.className = `plan-card-option ${isRecommended ? 'selected' : ''}`;
        card.dataset.planId = plan.id;

        card.innerHTML = `
            ${isRecommended ? '<div class="featured-badge">MAIS RECOMENDADO</div>' : ''}
            <div class="plan-card-header">
                <div class="plan-icon"><i class="fas ${getPlanIcon(plan)}"></i></div>
                <div class="plan-meta">
                    <h3>${plan.nome}</h3>
                    <p>${plan.descricao || ''}</p>
                </div>
                <div class="plan-card-price">
                    <span class="currency">R$</span>
                    <span class="amount">${Number(plan.valor_minimo || 0).toFixed(0)}</span>
                    <span class="period">/mês</span>
                </div>
            </div>
            <ul class="plan-mini-features">
                ${getPlanFeatures(plan).map((feature) => `<li><i class="fas fa-check"></i> ${feature}</li>`).join('')}
            </ul>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.plan-card-option').forEach((entry) => entry.classList.remove('selected'));
            card.classList.add('selected');
            selectedPlan = plan;
            selectedPrice = Number(plan.valor_minimo || 0);
            updateSummary();
            renderCheckoutButton();
        });

        container.appendChild(card);

        if (isRecommended) {
            selectedPlan = plan;
            selectedPrice = Number(plan.valor_minimo || 0);
        }
    });

    updateSummary();
}

function updateSummary() {
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');

    if (summaryPlanName) {
        summaryPlanName.textContent = selectedPlan?.nome || '-';
    }

    if (summaryTotalPrice) {
        summaryTotalPrice.textContent = formatCurrency(selectedPrice);
    }
}

function renderErrorState(message) {
    const container = document.getElementById('payment-brick_container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center;padding:20px;color:#b91c1c;">
            <i class="fas fa-circle-exclamation"></i> ${message}
        </div>
    `;
}

function openMercadoPagoPopup() {
    const popup = window.open('', 'MercadoPagoCheckout', 'width=860,height=760');
    if (!popup) {
        throw new Error('O navegador bloqueou a janela de pagamento. Libere popups para continuar.');
    }

    popup.document.write(`
        <!doctype html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Mercado Pago</title>
            <style>
                body {
                    margin: 0;
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    background: #f5f7fb;
                    font-family: Arial, sans-serif;
                    color: #1f2937;
                }
                .card {
                    background: white;
                    border-radius: 18px;
                    padding: 32px 28px;
                    text-align: center;
                    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
                    width: min(92vw, 420px);
                }
                .spinner {
                    width: 48px;
                    height: 48px;
                    border-radius: 999px;
                    border: 4px solid #dbeafe;
                    border-top-color: #2563eb;
                    margin: 0 auto 20px;
                    animation: spin 0.8s linear infinite;
                }
                h1 {
                    margin: 0 0 10px;
                    font-size: 1.25rem;
                }
                p {
                    margin: 0;
                    color: #64748b;
                    line-height: 1.6;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="spinner"></div>
                <h1>Abrindo Mercado Pago...</h1>
                <p>Estamos preparando seu checkout seguro.</p>
            </div>
        </body>
        </html>
    `);
    popup.document.close();
    popup.focus();

    return popup;
}

async function createPendingPayment() {
    if (!currentUser || !selectedPlan) {
        throw new Error('Usuário ou plano não disponível para iniciar o pagamento.');
    }

    const paymentPayload = {
        email: currentUser.email,
        cep: currentUser.condominium?.cep || '',
        plano_id: selectedPlan.id,
        total_apartamentos: currentUser.condominium?.totalApartments || 0,
        valor_por_unidade: Number(selectedPlan.valor_por_unidade || 0),
        valor_minimo: Number(selectedPlan.valor_minimo || 0),
        valor_pago: Number(selectedPrice || 0),
        status_pagamento: 'pendente',
        codigo_transacao: `PEND-${Date.now()}`,
        data_pagamento: new Date().toISOString()
    };

    const payment = await createPayment(paymentPayload);
    const normalized = Array.isArray(payment) ? payment[0] : payment;

    if (!normalized?.id) {
        throw new Error('Não foi possível criar o registro do pagamento pendente.');
    }

    currentPagamentoId = normalized.id;
    return normalized;
}

async function createPreference(pendingPaymentId) {
    const response = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pendingPaymentId,
            planId: selectedPlan?.id || null,
            payerEmail: currentUser?.email || null
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível criar a preferência de pagamento.');
    }

    if (!data.initPoint) {
        throw new Error('O Mercado Pago não retornou uma URL válida de checkout.');
    }

    return data;
}

function stopPopupWatcher() {
    if (popupWatcher) {
        clearInterval(popupWatcher);
        popupWatcher = null;
    }
}

function startPopupWatcher() {
    stopPopupWatcher();

    popupWatcher = setInterval(async () => {
        if (!mpPopup || !mpPopup.closed) return;

        stopPopupWatcher();

        if (paymentReturnHandled) return;

        checkoutInFlight = false;
        renderCheckoutButton();

        try {
            if (currentPagamentoId) {
                await updatePaymentStatus(currentPagamentoId, 'falhou');
            }
        } catch (error) {
            console.warn('[Checkout] Não foi possível atualizar pagamento após fechamento manual:', error);
        }

        alert('A janela de pagamento foi fechada antes da conclusão. Tente novamente.');
    }, 500);
}

function getMercadoPagoPaymentId(data = {}) {
    return data.paymentId || data.payment_id || data.collection_id || data.collectionId || null;
}

function addMercadoPagoReturnListener() {
    if (paymentListenerAdded) return;
    paymentListenerAdded = true;

    window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.tipo !== 'RETORNO_MERCADO_PAGO') return;

        paymentReturnHandled = true;
        checkoutInFlight = false;
        stopPopupWatcher();

        if (mpPopup && !mpPopup.closed) {
            try {
                mpPopup.close();
            } catch (_) {}
        }

        renderCheckoutButton();

        const status = event.data.status;
        const data = event.data.dados || {};
        const paymentId = getMercadoPagoPaymentId(data);
        const search = new URLSearchParams();

        if (paymentId) search.set('payment_id', paymentId);
        if (data.preferenceId) search.set('preference_id', data.preferenceId);
        if (data.externalReference) search.set('external_reference', data.externalReference);
        if (status) search.set('status', status);

        if (status === 'approved') {
            window.location.href = `pagamento-sucesso.html?${search.toString()}`;
            return;
        }

        if (status === 'pending') {
            window.location.href = `pagamento-pendente.html?${search.toString()}`;
            return;
        }

        if (currentPagamentoId) {
            try {
                await updatePaymentStatus(currentPagamentoId, 'falhou');
            } catch (error) {
                console.warn('[Checkout] Falha ao marcar pagamento como não aprovado:', error);
            }
        }

        window.location.href = `pagamento-falha.html?${search.toString()}`;
    });
}

async function handleCheckoutClick() {
    if (checkoutInFlight) return;
    if (!selectedPlan) {
        alert('Selecione um plano antes de continuar.');
        return;
    }

    try {
        checkoutInFlight = true;
        paymentReturnHandled = false;
        currentPagamentoId = null;
        renderCheckoutButton();

        mpPopup = openMercadoPagoPopup();
        await createPendingPayment();
        const preferenceData = await createPreference(currentPagamentoId);

        mpPopup.location.replace(preferenceData.initPoint);
        mpPopup.focus();
        startPopupWatcher();
    } catch (error) {
        console.error('[Checkout] Erro ao iniciar Mercado Pago:', error);
        checkoutInFlight = false;
        stopPopupWatcher();

        if (mpPopup && !mpPopup.closed) {
            try {
                mpPopup.close();
            } catch (_) {}
        }

        mpPopup = null;
        renderCheckoutButton();
        alert(error.message || 'Não foi possível abrir o checkout do Mercado Pago.');
    }
}

function renderCheckoutButton() {
    const container = document.getElementById('payment-brick_container');
    if (!container) return;

    if (!selectedPlan) {
        container.innerHTML = `
            <div style="text-align:center;padding:18px;color:#b45309;">
                <i class="fas fa-triangle-exclamation"></i> Selecione um plano para continuar.
            </div>
        `;
        return;
    }

    const buttonLabel = checkoutInFlight ? 'Preparando pagamento...' : 'Pagar com Mercado Pago';

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
                opacity: ${checkoutInFlight ? '0.7' : '1'};
            " ${checkoutInFlight ? 'disabled' : ''}>
                <i class="fas fa-credit-card"></i> ${buttonLabel}
            </button>
        </div>
    `;

    const button = document.getElementById('checkout-btn');
    if (button) {
        button.addEventListener('click', handleCheckoutClick);
    }
}
