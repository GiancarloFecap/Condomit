let currentUser = null;
let selectedPlan = null;
let selectedPrice = 0;
let plans = [];
let selectedPlanSlug = null;

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
        configurarContextoMercadoPago();
        renderPlans();
        initCheckoutButton();
    } catch (error) {
        console.error('[Checkout] Erro ao carregar planos:', error);
        alert('Erro ao carregar planos. Tente novamente.');
    }
});

function configurarContextoMercadoPago() {
    window.MP_AUTO_INIT = false;
    window.mercadoPagoContexto = {
        obterPlanoSelecionado: function() {
            if (selectedPlanSlug) return selectedPlanSlug;
            if (selectedPlan) {
                return mapearNomePlanoParaSlug(selectedPlan.nome || selectedPlan.id);
            }
            const cardSelecionado = document.querySelector('.plan-card-option.selected');
            if (cardSelecionado && cardSelecionado.dataset.planId) {
                return mapearNomePlanoParaSlug(cardSelecionado.dataset.planId);
            }
            return null;
        },
        aoDeslogar: function() {
            sessionStorage.removeItem('condominiumUser');
            window.location.href = 'entrar.html';
        },
        aoRetornar: function(dados) {
            console.log('[Checkout] Retorno Mercado Pago:', dados);
        },
        aposAprovado: async function() {
            try {
                const fresh = await refreshCurrentUserFromDb();
                if (typeof syncAllAvatars === 'function' && fresh) syncAllAvatars(fresh);
            } catch (_) {}
            setTimeout(function() {
                window.location.href = 'index.html';
            }, 1200);
        },
        aposFalha: function() {
        },
        aposPendente: function() {
            setTimeout(function() {
                window.location.href = 'index.html';
            }, 800);
        }
    };
    if (typeof window.MercadoPagoCheckout !== 'undefined' && typeof window.MercadoPagoCheckout.inicializarBotoes === 'function') {
        window.MercadoPagoCheckout.inicializarBotoes(window.mercadoPagoContexto);
    }
}

function mapearNomePlanoParaSlug(planNomeOuId) {
    if (!planNomeOuId) return null;
    const str = String(planNomeOuId).trim().toLowerCase();
    if (str.includes('essencial') || str === '1' || str === 'essencial' || str.includes('básico') || str.includes('basico')) return 'essencial';
    if (str.includes('premium') || str === '3' || str === 'premium') return 'premium';
    if (str.includes('pro') || str === '2' || str === 'pro') return 'pro';
    return null;
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
    selectedPlanSlug = mapearNomePlanoParaSlug(plan?.nome || plan?.id);
    window.mercadoPagoSelectedPlanSlug = selectedPlanSlug;
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn && selectedPlanSlug) {
        checkoutBtn.setAttribute('data-mercado-pago-plano', selectedPlanSlug);
        checkoutBtn.dataset.mpCheckoutInitialized = '';
        if (typeof window.MercadoPagoCheckout !== 'undefined' && typeof window.MercadoPagoCheckout.inicializarBotoes === 'function') {
            window.MercadoPagoCheckout.inicializarBotoes(window.mercadoPagoContexto);
        }
    }
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

function initCheckoutButton() {
    const container = document.getElementById('payment-brick_container');
    const hint = document.querySelector('.payment-hint');
    const planoSlug = selectedPlanSlug || (selectedPlan ? mapearNomePlanoParaSlug(selectedPlan.nome || selectedPlan.id) : null) || 'pro';
    const temPlanoValido = Boolean(planoSlug);

    if (hint) {
        hint.textContent = 'Pagamento processado pelo Mercado Pago — checkout seguro e criptografado.';
    }

    container.innerHTML = `
        <div style="text-align:center;">
            <button
                type="button"
                id="checkout-btn"
                data-mercado-pago-plano="${planoSlug}"
                class="mp-checkout-btn"
                style="
                    background-color: #009ee3;
                    color: white;
                    border: none;
                    padding: 15px 40px;
                    font-size: 18px;
                    border-radius: 8px;
                    cursor: ${temPlanoValido ? 'pointer' : 'not-allowed'};
                    font-weight: bold;
                    transition: background-color 0.25s ease, transform 0.15s ease, box-shadow 0.2s ease;
                    box-shadow: 0 8px 24px rgba(0, 158, 227, 0.18);
                    width: 100%;
                    max-width: 360px;
                "
                onmouseover="if(!this.disabled){this.style.backgroundColor='#0088c7';this.style.transform='translateY(-1px)';this.style.boxShadow='0 12px 28px rgba(0, 158, 227, 0.25)'}"
                onmouseout="if(!this.disabled){this.style.backgroundColor='#009ee3';this.style.transform='translateY(0)';this.style.boxShadow='0 8px 24px rgba(0, 158, 227, 0.18)'}"
                onmousedown="if(!this.disabled){this.style.transform='translateY(0)';this.style.boxShadow='0 5px 16px rgba(0, 158, 227, 0.2)'}"
                onmouseup="if(!this.disabled){this.style.transform='translateY(-1px)'}"
            >
                <i class="fas fa-credit-card" style="margin-right:10px;"></i><span class="btn-texto">Pagar com Mercado Pago</span>
            </button>
            <p style="margin-top:14px;color:#64748b;font-size:13.5px;line-height:1.6;">
                Checkout seguro do Mercado Pago.<br/>
                Aceita cartão de crédito, PIX, boleto e mais.
            </p>
            <div style="margin-top:16px;display:flex;justify-content:center;gap:10px;align-items:center;flex-wrap:wrap;color:#94a3b8;font-size:12px;">
                <span><i class="fas fa-lock" style="color:#10b981;margin-right:5px;"></i> SSL 256-bit</span>
                <span style="color:#cbd5e1;">•</span>
                <span><i class="fas fa-shield-alt" style="color:#10b981;margin-right:5px;"></i> Proteção Mercado Pago</span>
            </div>
        </div>
    `;

    setCheckoutButtonState(!temPlanoValido);

    if (typeof window.MercadoPagoCheckout !== 'undefined' && typeof window.MercadoPagoCheckout.inicializarBotoes === 'function') {
        window.MercadoPagoCheckout.inicializarBotoes(window.mercadoPagoContexto);
    }
}
