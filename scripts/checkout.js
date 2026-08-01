
let currentUser = null;
let selectedPlan = null; // will hold the full plano object from DB
let selectedPrice = 149.00;
let plans = [];

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
            try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
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

async function createPreference() {
    if (!currentUser || !currentUser.email) {
        console.error('[Checkout] Usuário não autenticado ou sem email');
        throw new Error('Usuário não autenticado. Por favor, faça login novamente.');
    }
    
    console.log('[Checkout] Criando preferência com:', {
        amount: selectedPrice,
        planName: selectedPlan.nome,
        payerEmail: currentUser.email
    });
    try {
        const response = await fetch('/api/mercadopago/preference', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: selectedPrice,
                planName: selectedPlan.nome,
                payerEmail: currentUser.email
            })
        });

        console.log('[Checkout] Status da resposta:', response.status);
        const data = await response.json();
        console.log('[Checkout] Dados da resposta:', data);
        
        if (data.error) {
            throw new Error(data.error);
        }
        return data;
    } catch (error) {
        console.error('[Checkout] Erro detalhado ao criar preferência:', error);
        throw error;
    }
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
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Carregando pagamento...</div>';

    try {
        console.log('[Checkout] initCheckoutButton starting...');
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
            let mpPopup = null;
            try {
                // Show loading overlay first
                showLoadingOverlay();

                btn.disabled = true;
                btn.style.opacity = '0.7';

                const popupWidth = 820;
                const popupHeight = 820;
                const left = Math.max(0, Math.floor((window.screen.width - popupWidth) / 2));
                const top = Math.max(0, Math.floor((window.screen.height - popupHeight) / 2));
                mpPopup = window.open('', 'MercadoPago', `width=${popupWidth},height=${popupHeight},left=${left},top=${top}`);
                if (!mpPopup) {
                    hideLoadingOverlay();
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    alert('Não foi possível abrir o pop-up de pagamento. Verifique se o bloqueador de pop-ups está ativado.');
                    return;
                }

                const preferenceData = await createPreference();
                const initPoint = preferenceData.initPoint;
                mpPopup.location.href = initPoint;
                
                // Check if popup is closed every 500ms
                const checkPopup = setInterval(async () => {
                    if (mpPopup.closed) {
                        clearInterval(checkPopup);
                        
                        try {
                            // Create payment record in DB with status 'aprovado'
                            const pagamentoData = {
                                email: currentUser.email,
                                cep: currentUser.condominium?.cep || '',
                                plano_id: selectedPlan.id,
                                total_apartamentos: currentUser.condominium?.totalApartments || 0,
                                valor_por_unidade: selectedPlan.valor_por_unidade,
                                valor_minimo: selectedPlan.valor_minimo,
                                valor_pago: selectedPrice,
                                status_pagamento: 'aprovado',
                                codigo_transacao: `TXN-${Date.now()}`,
                                data_pagamento: new Date().toISOString()
                            };
                            
                            await createPayment(pagamentoData);
                            
                            // Update user's plan in DB for compatibility
                            await updateUserByEmail(currentUser.email, { plan: selectedPlan.nome });
                            
                            // Update currentUser object and sessionStorage
                            currentUser.plan = selectedPlan.nome;
                            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
                            
                            // Hide overlay
                            hideLoadingOverlay();

                            btn.disabled = false;
                            btn.style.opacity = '1';
                            
                            // Redirect to index
                            window.location.href = 'index.html';
                        } catch (error) {
                            console.error('[Checkout] Error after payment:', error);
                            hideLoadingOverlay();
                            btn.disabled = false;
                            btn.style.opacity = '1';
                            alert('Erro ao finalizar o pagamento. Tente novamente.');
                        }
                    }
                }, 500);
            } catch (error) {
                console.error('Erro ao processar pagamento:', error);
                hideLoadingOverlay();
                try { mpPopup?.close(); } catch (_) {}
                btn.disabled = false;
                btn.style.opacity = '1';
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
