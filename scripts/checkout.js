let currentUser = null;
let selectedPlan = null;
let selectedPrice = 0;
let plans = [];

document.addEventListener('DOMContentLoaded', async function() {
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

    if (!currentUser.condominium) {
        window.location.href = 'condominio_register.html';
        return;
    }

    configureLogoutButton();

    try {
        plans = await fetchPlans();
        renderPlans();
        initCheckoutButton();
    } catch (error) {
        console.error('[Checkout] Erro ao carregar planos:', error);
        alert('Erro ao carregar planos. Tente novamente.');
    }
});

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
    const planosArray = Array.isArray(data) ? data : [];
    window.__planosDisponiveis = planosArray;
    return planosArray;
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
        planCard.dataset.planName = String(plan.nome || '');

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

function setCheckoutButtonState(disabled) {
    const btn = document.getElementById('checkout-btn');
    if (!btn) {
        return;
    }

    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.7' : '1';
    btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
}

function mapearNomePlanoParaId(nomePlano) {
    if (!nomePlano) return '';
    const chave = String(nomePlano).trim().toLowerCase();
    if (chave.includes('essencial')) return 'essencial';
    if (chave.includes('premium')) return 'premium';
    if (chave.includes('pro')) return 'pro';
    return '';
}

function initCheckoutButton() {
    const planoId = mapearNomePlanoParaId(selectedPlan?.nome);

    if (window.atualizarPlanoSelecionado) {
        window.atualizarPlanoSelecionado(planoId);
    }

    const container = document.getElementById('payment-brick_container');
    container.innerHTML = `
        <div style="text-align:center;">
            <button
                type="button"
                id="checkout-btn"
                data-mercado-pago-checkout
                data-mercado-pago-plano="${planoId || ''}"
                style="
                    background-color: #009ee3;
                    color: white;
                    border: none;
                    padding: 15px 40px;
                    font-size: 18px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 12px rgba(0, 158, 227, 0.2);
                    width: 100%;
                    max-width: 340px;
                "
                onmouseover="this.style.backgroundColor='#007fc0';this.style.transform='translateY(-1px)';"
                onmouseout="this.style.backgroundColor='#009ee3';this.style.transform='translateY(0)';"
            >
                <i class="fas fa-credit-card"></i> Pagar com Mercado Pago
            </button>
            <p style="margin-top:16px;color:#64748b;font-size:14px;line-height:1.6;">
                Pagamento 100% seguro via Mercado Pago.<br>
                Aprovamos cartões, Pix e boleto.
            </p>
            <div style="margin-top:16px;display:flex;justify-content:center;gap:14px;flex-wrap:wrap;color:#94a3b8;font-size:14px;">
                <span><i class="fas fa-credit-card"></i> Cartão</span>
                <span><i class="fas fa-qrcode"></i> Pix</span>
                <span><i class="fas fa-barcode"></i> Boleto</span>
            </div>
        </div>
    `;

    const btn = document.getElementById('checkout-btn');
    if (btn && typeof window.pagar === 'function') {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            window.pagar(btn);
        });
    }

    setCheckoutButtonState(!selectedPlan);
}
