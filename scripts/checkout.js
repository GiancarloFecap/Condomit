const mp = new MercadoPago('APP_USR-66228770-9686-4e78-9041-866468755606', {
    locale: 'pt-BR'
});

let currentUser = null;
let selectedPlan = 'pro';
let selectedPrice = 149.00;

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
    await initPaymentBrick();

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

            // Reiniciar Brick de pagamento com novo valor
            const container = document.getElementById('payment-brick_container');
            container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;"><i class="fas fa-spinner fa-spin"></i> Atualizando pagamento...</div>';
            
            if (window.paymentBrickController) {
                // Em vez de destruir e recriar, o ideal seria usar update
                // mas para simplificar e garantir o valor correto no brick:
                await initPaymentBrick();
            } else {
                await initPaymentBrick();
            }
        });
    });
}

async function initPaymentBrick() {
    const bricksBuilder = mp.bricks();
    
    const settings = {
        initialization: {
            amount: selectedPrice, // Valor do plano selecionado
            preferenceId: "PREFERENCE_ID", // Em produção, gerar isso no backend
            payer: {
                email: currentUser.email,
            },
        },
        customization: {
            paymentMethods: {
                ticket: "all",
                bankTransfer: "all",
                creditCard: "all",
                debitCard: "all",
                mercadoPago: "all",
            },
        },
        callbacks: {
            onReady: () => {
                console.log('Brick ready');
            },
            onSubmit: async ({ selectedPaymentMethod, formData }) => {
                // Em um cenário real, você enviaria formData para seu backend
                // Aqui vamos simular o sucesso para demonstração do fluxo
                console.log('Payment data:', formData);
                
                try {
                    // Simulação de processamento
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Atualizar usuário no banco via Supabase (simulado pela API proxy)
                    const updates = { plan: selectedPlan };
                    await updateUserByEmail(currentUser.email, updates);
                    
                    // Atualizar sessionStorage
                    currentUser.plan = selectedPlan;
                    sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
                    
                    alert('Pagamento realizado com sucesso!');
                    
                    // Redirecionar para registro de condomínio
                    window.location.href = 'condominio_register.html';
                } catch (error) {
                    console.error('Erro ao processar pagamento:', error);
                    alert('Erro ao processar pagamento. Tente novamente.');
                }
            },
            onError: (error) => {
                console.error('Brick error:', error);
            },
        },
    };

    window.paymentBrickController = await bricksBuilder.create(
        "payment",
        "payment-brick_container",
        settings
    );
}
