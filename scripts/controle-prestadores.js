const providerState = {
    currentUser: null,
    providers: [],
    filters: {
        tab: 'all',
        search: '',
        status: 'all',
        category: 'all',
        date: ''
    }
};

const providerCategoryMeta = {
    electrical: { label: 'Elétrica', icon: 'fa-bolt', className: 'electrical' },
    cleaning: { label: 'Limpeza', icon: 'fa-broom', className: 'cleaning' },
    hydraulic: { label: 'Hidráulica', icon: 'fa-droplet', className: 'hydraulic' },
    security: { label: 'Segurança', icon: 'fa-shield-halved', className: 'security' },
    gardening: { label: 'Jardinagem', icon: 'fa-leaf', className: 'gardening' },
    painting: { label: 'Pintura', icon: 'fa-paint-roller', className: 'painting' },
    elevator: { label: 'Elevadores', icon: 'fa-elevator', className: 'elevator' }
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadProviderUser();
    if (!currentUser) return;

    providerState.currentUser = currentUser;
    initProviderPageShell(currentUser);
    bindProviderPageControls();
    loadProviders();
});

async function loadProviderUser() {
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

function initProviderPageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    const providerVisitDate = document.getElementById('providerVisitDate');
    const providerDateFilter = document.getElementById('providerDateFilter');
    const today = new Date().toISOString().slice(0, 10);

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    if (providerVisitDate) providerVisitDate.value = today;
    if (providerDateFilter) providerDateFilter.value = today;
    providerState.filters.date = today;
}

function bindProviderPageControls() {
    const providerSearchInput = document.getElementById('providerSearchInput');
    const providerStatusFilter = document.getElementById('providerStatusFilter');
    const providerCategoryFilter = document.getElementById('providerCategoryFilter');
    const providerDateFilter = document.getElementById('providerDateFilter');
    const clearProviderFiltersBtn = document.getElementById('clearProviderFiltersBtn');
    const newProviderBtn = document.getElementById('newProviderBtn');
    const closeProviderModalBtn = document.getElementById('closeProviderModalBtn');
    const cancelProviderBtn = document.getElementById('cancelProviderBtn');
    const providerModal = document.getElementById('providerModal');
    const providerForm = document.getElementById('providerForm');

    providerSearchInput?.addEventListener('input', (event) => {
        providerState.filters.search = event.target.value.trim().toLowerCase();
        renderProviderPage();
    });

    providerStatusFilter?.addEventListener('change', (event) => {
        providerState.filters.status = event.target.value;
        renderProviderPage();
    });

    providerCategoryFilter?.addEventListener('change', (event) => {
        providerState.filters.category = event.target.value;
        renderProviderPage();
    });

    providerDateFilter?.addEventListener('change', (event) => {
        providerState.filters.date = event.target.value;
        renderProviderPage();
    });

    clearProviderFiltersBtn?.addEventListener('click', () => {
        providerState.filters.search = '';
        providerState.filters.status = 'all';
        providerState.filters.category = 'all';
        providerState.filters.date = '';
        if (providerSearchInput) providerSearchInput.value = '';
        if (providerStatusFilter) providerStatusFilter.value = 'all';
        if (providerCategoryFilter) providerCategoryFilter.value = 'all';
        if (providerDateFilter) providerDateFilter.value = '';
        setActiveProviderTab('all');
        renderProviderPage();
    });

    document.getElementById('providerTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        setActiveProviderTab(button.dataset.tab || 'all');
        renderProviderPage();
    });

    newProviderBtn?.addEventListener('click', openProviderModal);
    closeProviderModalBtn?.addEventListener('click', closeProviderModal);
    cancelProviderBtn?.addEventListener('click', closeProviderModal);
    providerModal?.addEventListener('click', (event) => {
        if (event.target === providerModal) closeProviderModal();
    });
    providerForm?.addEventListener('submit', handleProviderSubmit);
}

function loadProviders() {
    const stored = getStoredProviders();
    providerState.providers = stored.length ? stored : buildDefaultProviders();
    if (!stored.length) saveProviders();
    populateProviderCategoryOptions();
    renderProviderPage();
}

function getCondominiumKey(user = providerState.currentUser) {
    const identifiers = typeof window.getUserCondominiumIdentifiers === 'function'
        ? window.getUserCondominiumIdentifiers(user)
        : [];
    return identifiers[0] || 'geral';
}

function getProviderStorageKey(user = providerState.currentUser) {
    return `condomit.provider-control.${getCondominiumKey(user)}`;
}

function getStoredProviders(user = providerState.currentUser) {
    try {
        return JSON.parse(localStorage.getItem(getProviderStorageKey(user)) || '[]');
    } catch (_) {
        return [];
    }
}

function saveProviders(user = providerState.currentUser) {
    localStorage.setItem(getProviderStorageKey(user), JSON.stringify(providerState.providers));
}

function buildDefaultProviders() {
    const currentUserName = providerState.currentUser?.name || 'Porteiro';
    return [
        createProviderRecord({ name: 'Carlos Alberto', company: 'Elétrica Forte LTDA', service: 'Instalações e reparos', category: 'electrical', phone: '(11) 98765-4321', email: 'contato@eletricaforte.com.br', visitDate: '2026-08-04', visitWindow: '08:00 - 12:00', status: 'in_progress', authorizedBy: currentUserName }),
        createProviderRecord({ name: 'Fernanda Lima', company: 'Limpa Mais Serviços', service: 'Áreas comuns', category: 'cleaning', phone: '(11) 97654-3210', email: 'contato@limpamais.com.br', visitDate: '2026-08-04', visitWindow: '07:00 - 11:00', status: 'active', authorizedBy: currentUserName }),
        createProviderRecord({ name: 'João Pedro', company: 'Hidrotec Soluções', service: 'Reparos e instalações', category: 'hydraulic', phone: '(11) 95432-1098', email: 'contato@hidrotec.com.br', visitDate: '2026-08-04', visitWindow: '13:00 - 17:00', status: 'scheduled', authorizedBy: currentUserName }),
        createProviderRecord({ name: 'Ricardo Souza', company: 'Jardinagem Verde', service: 'Manutenção de jardins', category: 'gardening', phone: '(11) 97123-4567', email: 'contato@jardinagemverde.com.br', visitDate: '2026-08-03', visitWindow: '08:00 - 12:00', status: 'inactive', authorizedBy: currentUserName }),
        createProviderRecord({ name: 'Marcos Vinicius', company: 'Tech Seg Sistemas', service: 'Câmeras e alarmes', category: 'security', phone: '(11) 99988-7766', email: 'contato@techseg.com.br', visitDate: '2026-08-03', visitWindow: '09:00 - 13:00', status: 'active', authorizedBy: currentUserName }),
        createProviderRecord({ name: 'Juliana Martins', company: 'Pintar Bem', service: 'Paredes e fachadas', category: 'painting', phone: '(11) 98877-6655', email: 'contato@pintarbem.com.br', visitDate: '2026-08-02', visitWindow: '--', status: 'blocked', authorizedBy: currentUserName }),
        createProviderRecord({ name: 'Alexandre Oliveira', company: 'Elevadores Plus', service: 'Preventiva e corretiva', category: 'elevator', phone: '(11) 99876-5432', email: 'contato@elevadoresplus.com.br', visitDate: '2026-08-02', visitWindow: '08:00 - 12:00', status: 'active', authorizedBy: currentUserName })
    ];
}

function createProviderRecord(values) {
    return {
        id: values.id || `provider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: values.name || 'Prestador',
        company: values.company || 'Empresa',
        service: values.service || 'Serviço',
        category: values.category || 'cleaning',
        phone: values.phone || '',
        email: values.email || '',
        visitDate: values.visitDate || new Date().toISOString().slice(0, 10),
        visitWindow: values.visitWindow || '--',
        status: values.status || 'scheduled',
        authorizedBy: values.authorizedBy || 'Portaria'
    };
}

function populateProviderCategoryOptions() {
    const providerCategoryFilter = document.getElementById('providerCategoryFilter');
    if (!providerCategoryFilter) return;

    const categories = [...new Set(providerState.providers.map((provider) => provider.category).filter(Boolean))];
    providerCategoryFilter.innerHTML = `
        <option value="all">Todas as categorias</option>
        ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(getCategoryMeta(category).label)}</option>`).join('')}
    `;
}

function renderProviderPage() {
    const filtered = applyProviderFilters();
    updateProviderMetrics();
    renderProviderTable(filtered);
    renderProviderCategories();
}

function updateProviderMetrics() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayProviders = providerState.providers.filter((provider) => provider.visitDate === todayKey);

    setText('activeProvidersCount', providerState.providers.filter((provider) => provider.status === 'active').length);
    setText('scheduledProvidersCount', todayProviders.filter((provider) => provider.status === 'scheduled').length);
    setText('inProgressProvidersCount', providerState.providers.filter((provider) => provider.status === 'in_progress').length);
    setText('blockedProvidersCount', providerState.providers.filter((provider) => provider.status === 'blocked').length);
}

function applyProviderFilters() {
    return providerState.providers.filter((provider) => {
        const searchBase = [
            provider.name,
            provider.company,
            provider.service,
            provider.phone,
            provider.email
        ].join(' ').toLowerCase();

        const matchesTab = providerState.filters.tab === 'all' || provider.status === providerState.filters.tab;
        const matchesSearch = !providerState.filters.search || searchBase.includes(providerState.filters.search);
        const matchesStatus = providerState.filters.status === 'all' || provider.status === providerState.filters.status;
        const matchesCategory = providerState.filters.category === 'all' || provider.category === providerState.filters.category;
        const matchesDate = !providerState.filters.date || provider.visitDate === providerState.filters.date;

        return matchesTab && matchesSearch && matchesStatus && matchesCategory && matchesDate;
    });
}

function renderProviderTable(providers) {
    const providerTableBody = document.getElementById('providerTableBody');
    const providerSummary = document.getElementById('providerSummary');
    if (!providerTableBody || !providerSummary) return;

    providerSummary.textContent = `Mostrando ${providers.length} prestador${providers.length === 1 ? '' : 'es'}`;

    if (!providers.length) {
        providerTableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <strong>Nenhum prestador encontrado</strong>
                        <p>Cadastre um novo prestador ou ajuste os filtros para visualizar os registros do condomínio.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    providerTableBody.innerHTML = providers.map((provider) => {
        const categoryMeta = getCategoryMeta(provider.category);
        return `
            <tr>
                <td>
                    <div class="provider-inline">
                        <span class="mini-avatar">${getInitials(provider.name)}</span>
                        <div class="provider-cell">
                            <strong>${escapeHtml(provider.name)}</strong>
                            <small>${escapeHtml(provider.company)}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="company-cell">
                        <strong>${escapeHtml(provider.service)}</strong>
                        <small>${escapeHtml(provider.company)}</small>
                    </div>
                </td>
                <td>
                    <span class="provider-category-chip ${escapeHtml(categoryMeta.className)}">
                        <i class="fas ${escapeHtml(categoryMeta.icon)}"></i>
                        <span>${escapeHtml(categoryMeta.label)}</span>
                    </span>
                </td>
                <td>
                    <div class="contact-cell">
                        <strong>${escapeHtml(provider.phone)}</strong>
                        <small>${escapeHtml(provider.email)}</small>
                    </div>
                </td>
                <td>
                    <strong>${formatDate(provider.visitDate)}</strong><br>
                    <small>${escapeHtml(provider.visitWindow)}</small>
                </td>
                <td><span class="provider-status-chip ${escapeHtml(provider.status)}">${escapeHtml(getStatusLabel(provider.status))}</span></td>
                <td>
                    <div class="request-actions">
                        <button class="icon-more" type="button" data-action="cycle-status" data-id="${escapeHtml(provider.id)}" title="Alterar status">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="icon-more" type="button" title="Mais opções">
                            <i class="fas fa-ellipsis-vertical"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    providerTableBody.querySelectorAll('[data-action="cycle-status"]').forEach((button) => {
        button.addEventListener('click', () => {
            cycleProviderStatus(button.dataset.id);
        });
    });
}

function renderProviderCategories() {
    const providerCategoryList = document.getElementById('providerCategoryList');
    if (!providerCategoryList) return;

    const counts = providerState.providers.reduce((acc, provider) => {
        acc[provider.category] = (acc[provider.category] || 0) + 1;
        return acc;
    }, {});

    providerCategoryList.innerHTML = Object.keys(providerCategoryMeta).map((key) => {
        const meta = providerCategoryMeta[key];
        return `
            <li class="category-item">
                <div class="provider-inline">
                    <span class="category-icon ${escapeHtml(meta.className)}"><i class="fas ${escapeHtml(meta.icon)}"></i></span>
                    <div>
                        <strong>${escapeHtml(meta.label)}</strong><br>
                        <small class="legend-note">${counts[key] || 0} prestador${(counts[key] || 0) === 1 ? '' : 'es'}</small>
                    </div>
                </div>
            </li>
        `;
    }).join('');
}

function setActiveProviderTab(nextTab) {
    providerState.filters.tab = nextTab;
    document.querySelectorAll('#providerTabs .status-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === nextTab);
    });
}

function cycleProviderStatus(providerId) {
    const sequence = ['scheduled', 'active', 'in_progress', 'inactive', 'blocked'];
    const index = providerState.providers.findIndex((provider) => provider.id === providerId);
    if (index === -1) return;
    const current = providerState.providers[index].status;
    const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    providerState.providers[index].status = next;
    saveProviders();
    renderProviderPage();
}

function handleProviderSubmit(event) {
    event.preventDefault();

    const values = {
        name: document.getElementById('providerName')?.value.trim(),
        company: document.getElementById('providerCompany')?.value.trim(),
        service: document.getElementById('providerService')?.value.trim(),
        category: document.getElementById('providerCategory')?.value,
        phone: document.getElementById('providerPhone')?.value.trim(),
        email: document.getElementById('providerEmail')?.value.trim(),
        visitDate: document.getElementById('providerVisitDate')?.value,
        visitWindow: document.getElementById('providerVisitWindow')?.value.trim(),
        status: document.getElementById('providerInitialStatus')?.value,
        authorizedBy: providerState.currentUser?.name || 'Portaria'
    };

    const providerFeedback = document.getElementById('providerFeedback');
    if (!values.name || !values.company || !values.service || !values.category || !values.phone || !values.email || !values.visitDate || !values.visitWindow || !values.status) {
        if (providerFeedback) {
            providerFeedback.dataset.state = 'error';
            providerFeedback.textContent = 'Preencha todos os campos obrigatórios do prestador.';
        }
        return;
    }

    providerState.providers.unshift(createProviderRecord(values));
    saveProviders();
    populateProviderCategoryOptions();
    renderProviderPage();
    event.target.reset();
    const providerVisitDate = document.getElementById('providerVisitDate');
    if (providerVisitDate) providerVisitDate.value = new Date().toISOString().slice(0, 10);

    if (providerFeedback) {
        providerFeedback.dataset.state = 'success';
        providerFeedback.textContent = 'Prestador cadastrado com sucesso.';
    }

    setTimeout(() => {
        closeProviderModal();
    }, 700);
}

function openProviderModal() {
    const providerModal = document.getElementById('providerModal');
    if (!providerModal) return;
    providerModal.classList.add('active');
    providerModal.setAttribute('aria-hidden', 'false');
}

function closeProviderModal() {
    const providerModal = document.getElementById('providerModal');
    const providerForm = document.getElementById('providerForm');
    const providerFeedback = document.getElementById('providerFeedback');

    providerForm?.reset();
    if (providerFeedback) {
        providerFeedback.textContent = '';
        delete providerFeedback.dataset.state;
    }
    const providerVisitDate = document.getElementById('providerVisitDate');
    if (providerVisitDate) providerVisitDate.value = new Date().toISOString().slice(0, 10);
    if (!providerModal) return;
    providerModal.classList.remove('active');
    providerModal.setAttribute('aria-hidden', 'true');
}

function getCategoryMeta(category) {
    return providerCategoryMeta[category] || { label: 'Outros', icon: 'fa-briefcase', className: 'elevator' };
}

function getStatusLabel(status) {
    if (status === 'active') return 'Ativo';
    if (status === 'scheduled') return 'Agendado';
    if (status === 'in_progress') return 'Em andamento';
    if (status === 'inactive') return 'Inativo';
    return 'Bloqueado';
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
        .slice(0, 2) || 'PR';
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
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
