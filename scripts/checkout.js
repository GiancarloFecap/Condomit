
let currentUser = null;
let selectedPlan = null; // will hold the full plano object from DB
let selectedPrice = null; // inicializa null, será definido ao carregar os planos
let currentInitPoint = null;
let plans = [];
let currentPagamentoId = null; // armazena o ID do pagamento pendente criado
let mpPopup = null;
let paymentListenerAdded = false;
let mpReturnHandled = false;

document.addEventListener('DOMContentLoaded', async function() {
    // 1. Verificar autenticação
    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (!loggedInUser) {
        window.location.href = 'entrar.html';
        return;
    }

    currentUser = JSON.parse(loggedInUser);

    // Se não for síndico, redireciona
    if (currentUser.type !== 'sindico') {
        window.location.href = 'assembleia.html';
        return;
    }

    // Check if user already has an approved payment
    try {
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        if (approvedPayment) {
            window.location.href = 'index.html';
            return;
        }
    } catch (error) {
        console.error('[Checkout] Error checking payment status:', error);
    }

    // Fetch plans from DB
    try {
        plans = await fetchPlans();
        renderPlans();
    } catch (error) {
        console.error('[Checkout] Error fetching plans:', error);
        alert('Erro ao carregar planos. Tente novamente.');
        return;
    }

    await initCheckoutButton();

    // Configurar o link de voltar com logout
    const logoutBtn = document.getElementById('btn-logout-checkout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            sessionStorage.removeItem('condominiumUser');
            window.location.href = 'entrar.html';
        });
    }
});

async function fetchPlans() {
    const response = await fetch('/api/plano');
    if (!response.ok) throw new Error('Failed to fetch plans');
    return await response.json();
}

async function fetchApprovedPayment(email) {
    const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    const payments = await response.json();
    return payments.find(p => p.status_pagamento === 'aprovado');
}

async function createPayment(paymentData) {
    const response = await fetch('/api/pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
    });
    if (!response.ok) throw new Error('Failed to create payment');
    return await response.json();
}

function renderPlans() {
    const container = document.getElementById('plans-list-container');
    container.innerHTML = '';

    plans.forEach((plan, index) => {
        const planCard = document.createElement('div');
        planCard.className = `plan-card-option ${index === 1 ? 'selected' : ''}`;
        planCard.dataset.planId = plan.id;
        planCard.dataset.planName = plan.nome;
        planCard.dataset.price = plan.valor_minimo;
        planCard.dataset.valorPorUnidade = plan.valor_por_unidade;
        planCard.dataset.valorMinimo = plan.valor_minimo;

        let icon = 'fa-leaf';
        let features = [];
        if (plan.nome.includes('Pro')) {
            icon = 'fa-rocket';
            features = ['Tudo do Essencial', 'Módulo Financeiro', 'Controle de Acesso'];
        } else if (plan.nome.includes('Premium')) {
            icon = 'fa-crown';
            features = ['Tudo do Pro', 'APIs e White-label', 'Suporte Prioritário'];
        } else {
            features = ['Mural de avisos', 'Reservas simples'];
        }

        planCard.innerHTML = `
            ${index === 1 ? '<div class="featured-badge">MAIS RECOMENDADO</div>' : ''}
            <div class="plan-card-header">
                <div class="plan-icon"><i class="fas ${icon}"></i></div>
                <div class="plan-meta">
                    <h3>${plan.nome}</h3>
                    <p>${plan.descricao || ''}</p>
                </div>
                <div class="plan-card-price">
                    <span class="currency">R$</span>
                    <span class="amount">${Number(plan.valor_minimo).toFixed(0)}</span>
                    <span class="period">/mês</span>
                </div>
            </div>
            <ul class="plan-mini-features">
                ${features.map(f => `<li><i class="fas fa-check"></i> ${f}</li>`).join('')}
            </ul>
        `;

        planCard.addEventListener('click', async () => selectPlan(planCard, plan));
        container.appendChild(planCard);
    });

    // Set default selected plan
    if (plans.length >= 2) {
        selectedPlan = plans[1];
        selectedPrice = selectedPlan.valor_minimo;
        updateSummary();
    }
}

function selectPlan(card, plan) {
    document.querySelectorAll('.plan-card-option').forEach(opt => opt.classList.remove('selected'));
    card.classList.add('selected');
    selectedPlan = plan;
    selectedPrice = plan.valor_minimo;
    updateSummary();
    initCheckoutButton();
}

function updateSummary() {
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');
    if (!selectedPlan) return;
    summaryPlanName.textContent = selectedPlan.nome;
    summaryTotalPrice.textContent = `R$ ${Number(selectedPrice).toFixed(2).replace('.', ',')}`;
}

async function createPreference(pendingPaymentId) {
    if (!currentUser || !currentUser.email) {
        console.error('[Checkout] Usuário não autenticado ou sem email');
        throw new Error('Usuário não autenticado. Por favor, faça login novamente.');
    }

    if (!selectedPlan?.id) {
        throw new Error('Plano inválido. Selecione um plano novamente.');
    }

    if (!pendingPaymentId) {
        throw new Error('Não foi possível preparar o pagamento. Tente novamente.');
    }
    
    try {
        const response = await fetch('/api/mercadopago/preference', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                planId: selectedPlan.id,
                pendingPaymentId
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
        }

        if (!data.checkoutUrl) {
            throw new Error('O Mercado Pago não retornou a URL do checkout.');
        }

        return data;
    } catch (error) {
        console.error('[Checkout] Erro detalhado ao criar preferência:', error);
        throw error;
    }
}

function getMercadoPagoPaymentId(dados = {}) {
    return (
        dados.paymentId ||
        dados.payment_id ||
        dados.collection_id ||
        dados.collectionId ||
        null
    );
}

async function confirmMercadoPagoPayment(paymentId) {
    if (!paymentId) return null;

    const response = await fetch('/api/mercadopago/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível confirmar o pagamento.');
    }

    return data;
}

// Função para criar registro de pagamento PENDENTE antes de abrir checkout
async function createPendingPayment() {
    const pagamentoData = {
        email: currentUser.email,
        cep: currentUser.condominium?.cep || '',
        plano_id: selectedPlan.id,
        total_apartamentos: currentUser.condominium?.totalApartments || 0,
        valor_por_unidade: selectedPlan.valor_por_unidade,
        valor_minimo: selectedPlan.valor_minimo,
        valor_pago: selectedPrice,
        status_pagamento: 'pendente',
        codigo_transacao: `TXN-${Date.now()}`,
        data_pagamento: new Date().toISOString()
    };

    const result = await createPayment(pagamentoData);
    if (result && result.id) {
        currentPagamentoId = result.id;
    } else if (Array.isArray(result) && result.length && result[0].id) {
        currentPagamentoId = result[0].id;
    }
    return result;
}

// Atualiza status do pagamento no banco
async function updatePaymentStatus(id, status) {
    const response = await fetch(`/api/pagamento?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status_pagamento: status,
            data_pagamento: new Date().toISOString()
        })
    });
    if (!response.ok) throw new Error('Failed to update payment');
    return await response.json();
}

// Listener para receber retorno real do Mercado Pago
function addMercadoPagoReturnListener() {
    if (paymentListenerAdded) return;
    paymentListenerAdded = true;

    window.addEventListener('message', async (event) => {
        if (event.origin !== location.origin) return;
        if (event.data?.tipo !== 'RETORNO_MERCADO_PAGO') return;

        const status = event.data.status;
        const dados = event.data.dados || {};
        mpReturnHandled = true;

        hideLoadingOverlay();
        if (mpPopup && !mpPopup.closed) {
            try { mpPopup.close(); } catch (_) {}
        }

        try {
            if (status === 'approved') {
                const paymentId = getMercadoPagoPaymentId(dados);
                const search = new URLSearchParams();
                if (paymentId) search.set('payment_id', paymentId);
                if (dados.externalReference) search.set('external_reference', dados.externalReference);
                if (dados.preferenceId) search.set('preference_id', dados.preferenceId);
                search.set('status', 'approved');
                window.location.href = `pagamento-sucesso.html?${search.toString()}`;
            } else if (status === 'pending') {
                const paymentId = getMercadoPagoPaymentId(dados);

                if (paymentId) {
                    const confirmation = await confirmMercadoPagoPayment(paymentId).catch((error) => {
                        console.warn('[Checkout] Não foi possível reconciliar o status pendente com o backend:', error);
                        return null;
                    });

                    if (confirmation?.approved) {
                        const search = new URLSearchParams();
                        search.set('payment_id', paymentId);
                        search.set('status', 'approved');
                        if (dados.externalReference) search.set('external_reference', dados.externalReference);
                        if (dados.preferenceId) search.set('preference_id', dados.preferenceId);
                        window.location.href = `pagamento-sucesso.html?${search.toString()}`;
                        return;
                    }
                }

                if (currentPagamentoId) {
                    await updatePaymentStatus(currentPagamentoId, 'pendente');
                }
                window.location.href = paymentId
                    ? `pagamento-pendente.html?payment_id=${encodeURIComponent(paymentId)}&status=pending`
                    : 'pagamento-pendente.html';
            } else {
                if (currentPagamentoId) {
                    await updatePaymentStatus(currentPagamentoId, 'falhou');
                }
                const paymentId = getMercadoPagoPaymentId(dados);
                window.location.href = paymentId
                    ? `pagamento-falha.html?payment_id=${encodeURIComponent(paymentId)}&status=${encodeURIComponent(status || 'failure')}`
                    : 'pagamento-falha.html';
            }
        } catch (err) {
            console.error('[Checkout] Erro ao processar retorno MP:', err);
            alert('Erro ao confirmar status do pagamento. Tente novamente.');
        }
    });
}

// Function to show loading overlay
function showLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'checkout-loading-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        flex-direction: column;
    `;
    overlay.innerHTML = `
        <div style="text-align:center; color:white;">
            <i class="fas fa-spinner fa-spin fa-5x"></i>
            <p style="margin-top:20px; font-size:20px;">Aguardando pagamento...</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

// Function to hide loading overlay
function hideLoadingOverlay() {
    const overlay = document.getElementById('checkout-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}

async function initCheckoutButton() {
    const container = document.getElementById('payment-brick_container');
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Preparando pagamento...</div>';

    if (!selectedPlan || selectedPrice == null) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Selecione um plano para continuar.</div>`;
        return;
    }

    try {
        console.log('[Checkout] initCheckoutButton starting...');
        
        // Garante listener de retorno do MP
        addMercadoPagoReturnListener();
        
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
        
        // Store selected plan in sessionStorage
        sessionStorage.setItem('selectedPlan', selectedPlan.nome);
        
        const btn = document.getElementById('checkout-btn');
        btn.addEventListener('click', async () => {
            try {
                // Show loading overlay first
                showLoadingOverlay();

                currentPagamentoId = null;
                mpReturnHandled = false;

                // Cria pagamento PENDENTE no banco antes de abrir popup
                await createPendingPayment();

                const preferenceData = await createPreference(currentPagamentoId);
                currentInitPoint = preferenceData.checkoutUrl;
                console.log('[Checkout] Preference created with init_point:', currentInitPoint);
                
                // Open Mercado Pago in a popup
                mpPopup = window.open(currentInitPoint, 'MercadoPago', 'width=800,height=800');
                
                // Check if popup is closed every 500ms (fallback)
                const checkPopup = setInterval(async () => {
                    if (mpPopup && mpPopup.closed) {
                        clearInterval(checkPopup);
                        if (mpReturnHandled) {
                            return;
                        }
                        // Se o popup foi fechado sem retorno (aprovado/pendente/falha), consideramos como cancelado/falha
                        hideLoadingOverlay();
                        alert('Janela de pagamento foi fechada. Tente novamente.');
                        try {
                            if (currentPagamentoId) {
                                await updatePaymentStatus(currentPagamentoId, 'falhou');
                            }
                        } catch (_) {}
                    }
                }, 500);
            } catch (error) {
                console.error('Erro ao processar pagamento:', error);
                hideLoadingOverlay();
                alert('Erro ao processar pagamento. Tente novamente.');
            }
        });
        
        console.log('[Checkout] Checkout button created');
    } catch (error) {
        console.error('[Checkout] initCheckoutButton ERROR:', error);
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
        console.error('Erro ao atualizar usuário:', error);
        throw error;
    }
}
