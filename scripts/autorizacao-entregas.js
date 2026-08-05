const deliveryState = {
    currentUser: null,
    deliveries: [],
    filters: {
        tab: 'all',
        search: '',
        status: 'all',
        block: 'all',
        date: ''
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadDeliveryUser();
    if (!currentUser) return;

    deliveryState.currentUser = currentUser;
    initDeliveryPageShell(currentUser);
    bindDeliveryPageControls();
    loadDeliveries();
});

async function loadDeliveryUser() {
    let currentUser = null;
    try {
        currentUser = typeof refreshCurrentUserFromDb === 'function'
            ? await refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser'));
    } catch (_) {
        currentUser = null;
    }

    if (!currentUser) {
        window.location.href = 'entrar.html';
        return null;
    }

    const userType = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(currentUser)
        : String(currentUser.type || '').trim().toLowerCase();

    if (userType !== 'porteiro') {
        if (typeof redirectToHome === 'function') {
            redirectToHome();
        } else {
            window.location.href = 'index.html';
        }
        return null;
    }

    return currentUser;
}

function initDeliveryPageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    const deliveryDate = document.getElementById('deliveryDate');
    const deliveryDateFilter = document.getElementById('deliveryDateFilter');

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (deliveryDate) deliveryDate.value = today;
    if (deliveryDateFilter) deliveryDateFilter.value = today;
    deliveryState.filters.date = today;

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }
}

function bindDeliveryPageControls() {
    const deliverySearchInput = document.getElementById('deliverySearchInput');
    const deliveryStatusFilter = document.getElementById('deliveryStatusFilter');
    const deliveryBlockFilter = document.getElementById('deliveryBlockFilter');
    const deliveryDateFilter = document.getElementById('deliveryDateFilter');
    const clearDeliveryFiltersBtn = document.getElementById('clearDeliveryFiltersBtn');
    const newDeliveryBtn = document.getElementById('newDeliveryBtn');
    const closeDeliveryModalBtn = document.getElementById('closeDeliveryModalBtn');
    const cancelDeliveryBtn = document.getElementById('cancelDeliveryBtn');
    const deliveryModal = document.getElementById('deliveryModal');
    const deliveryForm = document.getElementById('deliveryForm');

    deliverySearchInput?.addEventListener('input', (event) => {
        deliveryState.filters.search = event.target.value.trim().toLowerCase();
        renderDeliveryPage();
    });

    deliveryStatusFilter?.addEventListener('change', (event) => {
        deliveryState.filters.status = event.target.value;
        renderDeliveryPage();
    });

    deliveryBlockFilter?.addEventListener('change', (event) => {
        deliveryState.filters.block = event.target.value;
        renderDeliveryPage();
    });

    deliveryDateFilter?.addEventListener('change', (event) => {
        deliveryState.filters.date = event.target.value;
        renderDeliveryPage();
    });

    clearDeliveryFiltersBtn?.addEventListener('click', () => {
        deliveryState.filters.search = '';
        deliveryState.filters.status = 'all';
        deliveryState.filters.block = 'all';
        deliveryState.filters.date = '';
        if (deliverySearchInput) deliverySearchInput.value = '';
        if (deliveryStatusFilter) deliveryStatusFilter.value = 'all';
        if (deliveryBlockFilter) deliveryBlockFilter.value = 'all';
        if (deliveryDateFilter) deliveryDateFilter.value = '';
        setActiveDeliveryTab('all');
        renderDeliveryPage();
    });

    document.getElementById('deliveryTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        const nextTab = button.dataset.tab || 'all';
        setActiveDeliveryTab(nextTab);
        renderDeliveryPage();
    });

    newDeliveryBtn?.addEventListener('click', openDeliveryModal);
    closeDeliveryModalBtn?.addEventListener('click', closeDeliveryModal);
    cancelDeliveryBtn?.addEventListener('click', closeDeliveryModal);
    deliveryModal?.addEventListener('click', (event) => {
        if (event.target === deliveryModal) closeDeliveryModal();
    });
    deliveryForm?.addEventListener('submit', handleDeliverySubmit);
}

function loadDeliveries() {
    const stored = getStoredDeliveries();
    deliveryState.deliveries = stored.length ? stored : buildDefaultDeliveries();
    if (!stored.length) saveDeliveries();
    populateDeliveryBlockOptions();
    renderDeliveryPage();
}

function getCondominiumKey(user = deliveryState.currentUser) {
    const identifiers = typeof window.getUserCondominiumIdentifiers === 'function'
        ? window.getUserCondominiumIdentifiers(user)
        : [];
    return identifiers[0] || 'geral';
}

function getDeliveryStorageKey(user = deliveryState.currentUser) {
    return `condomit.delivery-authorization.${getCondominiumKey(user)}`;
}

function getStoredDeliveries(user = deliveryState.currentUser) {
    try {
        return JSON.parse(localStorage.getItem(getDeliveryStorageKey(user)) || '[]');
    } catch (_) {
        return [];
    }
}

function saveDeliveries(user = deliveryState.currentUser) {
    localStorage.setItem(getDeliveryStorageKey(user), JSON.stringify(deliveryState.deliveries));
}

function buildDefaultDeliveries() {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const userName = deliveryState.currentUser?.name || 'Porteiro';

    return [
        createDeliveryRecord({ code: '#98342', residentName: 'Mariana Costa', apartment: '203', block: 'A', carrier: 'Mercado Envios', carrierLine: 'Mercado Livre', date: toDateInput(today), timeWindow: '10:00 - 12:00', status: 'active', type: 'marketplace', authorizedBy: userName }),
        createDeliveryRecord({ code: '#98122', residentName: 'Carlos Alberto', apartment: '101', block: 'A', carrier: 'Shopee Express', carrierLine: 'Shopee', date: toDateInput(today), timeWindow: '14:00 - 16:00', status: 'scheduled', type: 'store', authorizedBy: userName }),
        createDeliveryRecord({ code: '#98011', residentName: 'Fernando Lima', apartment: '302', block: 'B', carrier: 'Loggi', carrierLine: 'Amazon', date: toDateInput(today), timeWindow: '09:00 - 11:00', status: 'active', type: 'service', authorizedBy: userName }),
        createDeliveryRecord({ code: '#97901', residentName: 'Juliana Santos', apartment: '401', block: 'C', carrier: 'Rappi', carrierLine: 'Pão de Açúcar', date: toDateInput(today), timeWindow: '11:00 - 13:00', status: 'completed', type: 'food', authorizedBy: userName }),
        createDeliveryRecord({ code: '#97823', residentName: 'Ricardo Ferreira', apartment: '104', block: 'C', carrier: 'Jadlog', carrierLine: 'Magazine Luiza', date: toDateInput(today), timeWindow: '15:00 - 17:00', status: 'completed', type: 'store', authorizedBy: userName }),
        createDeliveryRecord({ code: '#97710', residentName: 'Ana Paula', apartment: '502', block: 'D', carrier: 'Total Express', carrierLine: 'Americanas', date: toDateInput(yesterday), timeWindow: '10:00 - 12:00', status: 'canceled', type: 'store', authorizedBy: userName })
    ];
}

function createDeliveryRecord(values) {
    return {
        id: values.id || `delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        code: values.code || '#00000',
        residentName: values.residentName || 'Morador',
        apartment: values.apartment || '--',
        block: values.block || '--',
        carrier: values.carrier || 'Transportadora',
        carrierLine: values.carrierLine || 'Plataforma',
        date: values.date || new Date().toISOString().slice(0, 10),
        timeWindow: values.timeWindow || '--:-- - --:--',
        status: values.status || 'scheduled',
        type: values.type || 'other',
        authorizedBy: values.authorizedBy || 'Portaria',
        notes: values.notes || '',
        createdAt: values.createdAt || new Date().toISOString()
    };
}

function populateDeliveryBlockOptions() {
    const deliveryBlockFilter = document.getElementById('deliveryBlockFilter');
    if (!deliveryBlockFilter) return;

    const blocks = [...new Set(
        deliveryState.deliveries
            .map((delivery) => String(delivery?.block || '').trim())
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right, 'pt-BR'))
    )];

    deliveryBlockFilter.innerHTML = `
        <option value="all">Todos os blocos</option>
        ${blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('')}
    `;

    if (deliveryState.filters.block !== 'all' && blocks.includes(deliveryState.filters.block)) {
        deliveryBlockFilter.value = deliveryState.filters.block;
    }
}

function renderDeliveryPage() {
    const filtered = applyDeliveryFilters();
    updateDeliveryMetrics();
    renderDeliveryTable(filtered);
}

function updateDeliveryMetrics() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayDeliveries = deliveryState.deliveries.filter((delivery) => delivery.date === todayKey);
    setText('activeDeliveriesCount', deliveryState.deliveries.filter((delivery) => delivery.status === 'active').length);
    setText('scheduledTodayCount', todayDeliveries.filter((delivery) => delivery.status === 'scheduled').length);
    setText('completedTodayCount', todayDeliveries.filter((delivery) => delivery.status === 'completed').length);
    setText('canceledTodayCount', todayDeliveries.filter((delivery) => delivery.status === 'canceled').length);
}

function applyDeliveryFilters() {
    return deliveryState.deliveries.filter((delivery) => {
        const searchBase = [
            delivery.code,
            delivery.residentName,
            delivery.carrier,
            delivery.carrierLine,
            delivery.apartment,
            delivery.block
        ].join(' ').toLowerCase();

        const matchesTab = deliveryState.filters.tab === 'all' || delivery.status === deliveryState.filters.tab;
        const matchesSearch = !deliveryState.filters.search || searchBase.includes(deliveryState.filters.search);
        const matchesStatus = deliveryState.filters.status === 'all' || delivery.status === deliveryState.filters.status;
        const matchesBlock = deliveryState.filters.block === 'all' || delivery.block === deliveryState.filters.block;
        const matchesDate = !deliveryState.filters.date || delivery.date === deliveryState.filters.date;

        return matchesTab && matchesSearch && matchesStatus && matchesBlock && matchesDate;
    });
}

function renderDeliveryTable(deliveries) {
    const tableBody = document.getElementById('deliveryTableBody');
    if (!tableBody) return;

    if (!deliveries.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <strong>Nenhuma entrega encontrada</strong>
                        <p>Cadastre uma nova autorização ou ajuste os filtros para ver os registros do condomínio.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = deliveries.map((delivery) => `
        <tr>
            <td>
                <div class="delivery-code">
                    <strong>Pedido ${escapeHtml(delivery.code)}</strong>
                    <small>${escapeHtml(delivery.carrierLine)}</small>
                </div>
            </td>
            <td>
                <div class="resident-cell">
                    <span class="mini-avatar">${getInitials(delivery.residentName)}</span>
                    <div>
                        <strong>${escapeHtml(delivery.residentName)}</strong>
                        <div class="delivery-type-chip ${escapeHtml(delivery.type)}">${escapeHtml(getDeliveryTypeLabel(delivery.type))}</div>
                    </div>
                </div>
            </td>
            <td>
                <strong>Apto ${escapeHtml(delivery.apartment)}</strong><br>
                <small>Bloco ${escapeHtml(delivery.block)}</small>
            </td>
            <td>
                <div class="carrier-cell">
                    <strong>${escapeHtml(delivery.carrier)}</strong><br>
                    <small>${escapeHtml(delivery.carrierLine)}</small>
                </div>
            </td>
            <td>
                <strong>${formatDate(delivery.date)}</strong><br>
                <small>${escapeHtml(delivery.timeWindow)}</small>
            </td>
            <td>
                <div class="authorizer-cell">
                    <span class="mini-avatar">${getInitials(delivery.authorizedBy)}</span>
                    <div>
                        <strong>${escapeHtml(delivery.authorizedBy)}</strong><br>
                        <small>Porteiro</small>
                    </div>
                </div>
            </td>
            <td><span class="status-chip ${escapeHtml(delivery.status)}">${escapeHtml(getStatusLabel(delivery.status))}</span></td>
            <td>
                <div class="request-actions">
                    <button class="icon-more" type="button" data-action="cycle-status" data-id="${escapeHtml(delivery.id)}" title="Alterar status">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="icon-more" type="button" title="Detalhes">
                        <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    tableBody.querySelectorAll('[data-action="cycle-status"]').forEach((button) => {
        button.addEventListener('click', () => {
            cycleDeliveryStatus(button.dataset.id);
        });
    });
}

function setActiveDeliveryTab(nextTab) {
    deliveryState.filters.tab = nextTab;
    document.querySelectorAll('#deliveryTabs .status-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === nextTab);
    });
}

function cycleDeliveryStatus(deliveryId) {
    const sequence = ['scheduled', 'active', 'completed', 'canceled'];
    const index = deliveryState.deliveries.findIndex((delivery) => delivery.id === deliveryId);
    if (index === -1) return;
    const current = deliveryState.deliveries[index].status;
    const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    deliveryState.deliveries[index].status = next;
    saveDeliveries();
    renderDeliveryPage();
}

function handleDeliverySubmit(event) {
    event.preventDefault();

    const residentName = document.getElementById('deliveryResidentName')?.value.trim();
    const code = document.getElementById('deliveryCode')?.value.trim();
    const apartment = document.getElementById('deliveryApartment')?.value.trim();
    const block = document.getElementById('deliveryBlock')?.value.trim();
    const carrier = document.getElementById('deliveryCarrier')?.value.trim();
    const type = document.getElementById('deliveryType')?.value;
    const date = document.getElementById('deliveryDate')?.value;
    const timeWindow = document.getElementById('deliveryWindow')?.value.trim();
    const notes = document.getElementById('deliveryNotes')?.value.trim();
    const feedback = document.getElementById('deliveryFeedback');

    if (!residentName || !code || !apartment || !block || !carrier || !type || !date || !timeWindow) {
        if (feedback) {
            feedback.dataset.state = 'error';
            feedback.textContent = 'Preencha todos os campos obrigatórios da entrega.';
        }
        return;
    }

    deliveryState.deliveries.unshift(createDeliveryRecord({
        code,
        residentName,
        apartment,
        block,
        carrier,
        carrierLine: 'Cadastro manual',
        date,
        timeWindow,
        status: 'scheduled',
        type,
        authorizedBy: deliveryState.currentUser?.name || 'Porteiro',
        notes
    }));

    saveDeliveries();
    populateDeliveryBlockOptions();
    renderDeliveryPage();
    event.target.reset();
    const deliveryDate = document.getElementById('deliveryDate');
    if (deliveryDate) deliveryDate.value = new Date().toISOString().slice(0, 10);

    if (feedback) {
        feedback.dataset.state = 'success';
        feedback.textContent = 'Entrega autorizada com sucesso.';
    }

    setTimeout(() => {
        closeDeliveryModal();
    }, 700);
}

function openDeliveryModal() {
    const modal = document.getElementById('deliveryModal');
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeDeliveryModal() {
    const modal = document.getElementById('deliveryModal');
    const form = document.getElementById('deliveryForm');
    const feedback = document.getElementById('deliveryFeedback');
    if (feedback) {
        feedback.textContent = '';
        delete feedback.dataset.state;
    }
    form?.reset();
    const deliveryDate = document.getElementById('deliveryDate');
    if (deliveryDate) deliveryDate.value = new Date().toISOString().slice(0, 10);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function getStatusLabel(status) {
    if (status === 'active') return 'Ativa';
    if (status === 'scheduled') return 'Agendada';
    if (status === 'completed') return 'Concluída';
    return 'Cancelada';
}

function getDeliveryTypeLabel(type) {
    if (type === 'marketplace') return 'Marketplace';
    if (type === 'store') return 'Loja';
    if (type === 'food') return 'Entrega';
    if (type === 'service') return 'Serviço';
    return 'Outros';
}

function toDateInput(value) {
    return new Date(value).toISOString().slice(0, 10);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function getInitials(name) {
    return String(name || '')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'ET';
}

function formatDate(value) {
    const [year, month, day] = String(value || '').split('-');
    return year && month && day ? `${day}/${month}/${year}` : '--/--/----';
}

function escapeHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
