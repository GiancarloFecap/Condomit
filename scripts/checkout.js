let currentUser = null;
let selectedPlan = 'pro';
let selectedPrice = 149.00;
let currentInitPoint = null;

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

    // Se já tiver plano, vai para o próximo passo
    if (currentUser.plan) {
        window.location.href = currentUser.condominium ? 'index.html' : 'condominio_register.html';
        return;
    }

    initPlanSelection();
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

function initPlanSelection() {
    const planOptions = document.querySelectorAll('.plan-card-option');
    const summaryPlanName = document.getElementById('summary-plan-name');
    const summaryTotalPrice = document.getElementById('summary-total-price');

    planOptions.forEach(option => {
        option.addEventListener('click', async () => {
            if (option.classList.contains('selected')) return;

            // Remover seleção anterior
            planOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Adicionar nova seleção
            option.classList.add('selected');
            
            selectedPlan = option.dataset.plan;
            selectedPrice = parseFloat(option.dataset.price);

            // Atualizar resumo
            summaryPlanName.textContent = `Plano ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}`;
            summaryTotalPrice.textContent = `R$ ${selectedPrice.toFixed(2).replace('.', ',')}`;

            // Atualizar botão de pagamento
            await initCheckoutButton();
        });
    });
}

async function createPreference() {
    if (!currentUser || !currentUser.email) {
        console.error('[Checkout] Usuário não autenticado ou sem email');
        throw new Error('Usuário não autenticado. Por favor, faça login novamente.');
    }
    
    console.log('[Checkout] Criando preferência com:', {
        amount: selectedPrice,
        planName: selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1),
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
                planName: selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1),
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

async function initCheckoutButton() {
    const container = document.getElementById('payment-brick_container');
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Carregando pagamento...</div>';

    try {
        console.log('[Checkout] initCheckoutButton starting...');
        const preferenceData = await createPreference();
        currentInitPoint = preferenceData.initPoint;
        console.log('[Checkout] Preference created with init_point:', currentInitPoint);
        
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
        
        const btn = document.getElementById('checkout-btn');
        btn.addEventListener('click', async () => {
            try {
                // Abrir Mercado Pago sandbox
                window.open(currentInitPoint, '_blank');
                
                // Simular confirmação de pagamento (no ambiente real, use webhooks)
                const updates = { plan: selectedPlan };
                await updateUserByEmail(currentUser.email, updates);
                
                currentUser.plan = selectedPlan;
                sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
                
                // Aguardar um pouco para o usuário ver o Mercado Pago, depois redirecionar
                setTimeout(() => {
                    alert('Confira o pagamento no Mercado Pago e clique em OK para continuar!');
                    window.location.href = 'condominio_register.html';
                }, 1000);
            } catch (error) {
                console.error('Erro ao processar pagamento:', error);
                alert('Erro ao processar pagamento. Tente novamente.');
            }
        });
        
        console.log('[Checkout] Checkout button created');
    } catch (error) {
        console.error('[Checkout] initCheckoutButton ERROR:', error);
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Erro ao carregar pagamento. Tente novamente.<br><small style="color:#9ca3af;">${error.message}</small></div>`;
    }
}
