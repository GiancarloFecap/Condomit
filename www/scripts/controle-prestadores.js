const providerState = {
    currentUser: null,
    currentCondoCep: '',
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

const providerValidStatuses = ['agendado', 'em andamento', 'concluído', 'cancelado'];

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadProviderUser();
    if (!currentUser) return;

    providerState.currentUser = currentUser;
    providerState.currentCondoCep = extractCondoCep(currentUser);
    initProviderPageShell(currentUser);
    bindProviderPageControls();
    await loadProviders();
});

function extractCondoCep(user) {
    const ids = typeof window.getUserCondominiumIdentifiers === 'function'
        ? window.getUserCondominiumIdentifiers(user || {})
        : [];
    if (ids.length) return ids[0];
    const c = typeof user?.condominium === 'string'
        ? (() => { try { return JSON.parse(user.condominium); } catch (_) { return {}; } })()
        : (user?.condominium || {});
    const raw = c.cep || c.condominium_id || c.condominiumId || user?.cep || user?.condominium_cep || user?.condominium_id || '';
    return String(raw || '').replace(/\D/g, '');
}

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
        window.location.href = '../entrar.html';
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
    if (providerDateFilter) providerDateFilter.value = '';
    providerState.filters.date = '';

    const statusEl = document.getElementById('providerInitialStatus');
    if (statusEl) {
        statusEl.innerHTML = providerValidStatuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s[0].toUpperCase() + s.slice(1))}</option>`).join('');
        statusEl.value = 'agendado';
    }
    const statusFilterEl = document.getElementById('providerStatusFilter');
    if (statusFilterEl) {
        statusFilterEl.innerHTML = '<option value="all">Todos os status</option>' +
            providerValidStatuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s[0].toUpperCase() + s.slice(1))}</option>`).join('');
    }

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }
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

async function loadProviders() {
    const rows = typeof window.listServiceProvidersByCep === 'function'
        ? await window.listServiceProvidersByCep(providerState.currentCondoCep)
        : [];
    providerState.providers = (Array.isArray(rows) ? rows : []).map(mapProviderRowToUi);
    if (!providerState.providers.length) {
        providerState.providers = buildDefaultProviders();
        for (const p of providerState.providers) {
            try { await saveProviderToSupabase(p); } catch (_) {}
        }
        const rows2 = typeof window.listServiceProvidersByCep === 'function'
            ? await window.listServiceProvidersByCep(providerState.currentCondoCep)
            : [];
        if (Array.isArray(rows2) && rows2.length) {
            providerState.providers = rows2.map(mapProviderRowToUi);
        }
    }
    populateProviderCategoryOptions();
    renderProviderPage();
}

function mapProviderRowToUi(row) {
    return {
        email: String(row?.email || '').trim().toLowerCase(),
        name: String(row?.provider_name || row?.name || 'Prestador').trim(),
        company: String(row?.company || 'Empresa').trim(),
        service: String(row?.service || 'Serviço').trim(),
        category: String(row?.category || 'cleaning').trim(),
        phone: String(row?.phone || '').trim(),
        visitDate: String(row?.service_date || row?.visitDate || '').trim().slice(0, 10),
        visitWindow: String(row?.service_window || row?.visitWindow || '--').trim(),
        status: providerValidStatuses.includes(String(row?.initial_status || '').trim().toLowerCase())
            ? String(row?.initial_status).trim().toLowerCase()
            : 'agendado',
        cep: String(row?.cep || providerState.currentCondoCep || '').trim(),
        created_at: row?.created_at || new Date().toISOString()
    };
}

function buildDefaultProviders() {
    return [];
}

async function saveProviderToSupabase(providerUi) {
    if (typeof window.createServiceProvider !== 'function') return null;
    try {
        return await window.createServiceProvider({
            cep: providerState.currentCondoCep,
            email: providerUi.email,
            provider_name: providerUi.name,
            company: providerUi.company,
            service: providerUi.service,
            category: providerUi.category,
            phone: providerUi.phone,
            service_date: providerUi.visitDate,
            service_window: providerUi.visitWindow,
            initial_status: providerUi.status
        });
    } catch (err) {
        console.warn('saveProviderToSupabase warning:', err);
        throw err;
    }
}

function populateProviderCategoryOptions() {
    const providerCategoryFilter = document.getElementById('providerCategoryFilter');
    const providerCategoryForm = document.getElementById('providerCategory');
    const allCategories = Object.keys(providerCategoryMeta);

    if (providerCategoryFilter) {
        providerCategoryFilter.innerHTML = `
            <option value="all">Todas as categorias</option>
            ${allCategories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(getCategoryMeta(category).label)}</option>`).join('')}
        `;
    }

    if (providerCategoryForm) {
        providerCategoryForm.innerHTML = allCategories.map((category) =>
            `<option value="${escapeHtml(category)}">${escapeHtml(getCategoryMeta(category).label)}</option>`
        ).join('');
    }
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

    setText('activeProvidersCount', providerState.providers.length);
    setText('scheduledProvidersCount', todayProviders.length);
    setText('inProgressProvidersCount', 0);
    setText('blockedProvidersCount', 0);
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
                <td><span class="provider-status-chip status-${escapeHtml(provider.status.replace(/\s+/g, '-'))}">${escapeHtml(getStatusLabel(provider.status))}</span></td>
                <td>
                    <div class="request-actions">
                        <button class="icon-more" type="button" data-action="cycle-status" data-email="${escapeHtml(provider.email)}" title="Avançar status">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="icon-more" type="button" title="Remover prestador" data-action="delete" data-email="${escapeHtml(provider.email)}">
                            <i class="fas fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    providerTableBody.querySelectorAll('[data-action="cycle-status"]').forEach((button) => {
        button.addEventListener('click', () => {
            cycleProviderStatus(button.dataset.email);
        });
    });

    providerTableBody.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', () => {
            deleteProviderAction(button.dataset.email);
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

async function cycleProviderStatus(providerEmail) {
    const normalizedEmail = String(providerEmail || '').trim().toLowerCase();
    const index = providerState.providers.findIndex((provider) => String(provider.email).toLowerCase() === normalizedEmail);
    if (index === -1) return;
    const current = providerState.providers[index].status;
    const sequence = providerValidStatuses.slice();
    const next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    if (typeof window.updateServiceProviderStatus === 'function') {
        const updated = await window.updateServiceProviderStatus(normalizedEmail, next);
        if (updated) providerState.providers[index] = mapProviderRowToUi(updated);
    }
    renderProviderPage();
}

async function deleteProviderAction(providerEmail) {
    const normalizedEmail = String(providerEmail || '').trim().toLowerCase();
    if (!normalizedEmail) return;
    const ok = typeof window.showModal === 'function'
        ? await new Promise((resolve) => {
            window.showModal({
                title: 'Remover prestador?',
                message: 'Tem certeza que deseja remover o prestador do condomínio? Essa ação não pode ser desfeita.',
                confirmLabel: 'Remover',
                cancelLabel: 'Cancelar',
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        })
        : true;
    if (ok === false) return;
    if (typeof window.deleteServiceProvider === 'function') {
        const removed = await window.deleteServiceProvider(normalizedEmail);
        if (removed) {
            providerState.providers = providerState.providers.filter((p) => String(p.email).toLowerCase() !== normalizedEmail);
            if (typeof window.showToast === 'function') window.showToast('Prestador removido com sucesso.', 'success');
        } else if (typeof window.showToast === 'function') {
            window.showToast('Não foi possível remover o prestador.', 'error');
        }
    }
    renderProviderPage();
}

async function handleProviderSubmit(event) {
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
        status: document.getElementById('providerInitialStatus')?.value || 'agendado'
    };

    const providerFeedback = document.getElementById('providerFeedback');
    if (!values.name || !values.company || !values.service || !values.category || !values.phone || !values.email || !values.visitDate || !values.visitWindow || !values.status) {
        if (providerFeedback) {
            providerFeedback.dataset.state = 'error';
            providerFeedback.textContent = 'Preencha todos os campos obrigatórios do prestador.';
        }
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; }

    try {
        const created = await saveProviderToSupabase({
            email: values.email,
            name: values.name,
            company: values.company,
            service: values.service,
            category: values.category,
            phone: values.phone,
            visitDate: values.visitDate,
            visitWindow: values.visitWindow,
            status: values.status
        });
        if (created) {
            providerState.providers.unshift(mapProviderRowToUi(created));
        } else {
            providerState.providers.unshift(mapProviderRowToUi({
                email: values.email,
                cep: providerState.currentCondoCep,
                provider_name: values.name,
                company: values.company,
                service: values.service,
                category: values.category,
                phone: values.phone,
                service_date: values.visitDate,
                service_window: values.visitWindow,
                initial_status: values.status,
                created_at: new Date().toISOString()
            }));
        }
        populateProviderCategoryOptions();
        renderProviderPage();
        event.target.reset();
        const providerVisitDate = document.getElementById('providerVisitDate');
        if (providerVisitDate) providerVisitDate.value = new Date().toISOString().slice(0, 10);
        const providerInitialStatus = document.getElementById('providerInitialStatus');
        if (providerInitialStatus) providerInitialStatus.value = 'agendado';

        if (providerFeedback) {
            providerFeedback.dataset.state = 'success';
            providerFeedback.textContent = 'Prestador cadastrado com sucesso.';
        }
        if (typeof window.showToast === 'function') window.showToast('Prestador cadastrado com sucesso.', 'success');

        setTimeout(() => {
            closeProviderModal();
        }, 700);
    } catch (err) {
        if (providerFeedback) {
            providerFeedback.dataset.state = 'error';
            providerFeedback.textContent = String(err?.message || err) || 'Erro ao cadastrar prestador.';
        } else if (typeof window.showToast === 'function') {
            window.showToast(String(err?.message || err) || 'Erro ao cadastrar prestador.', 'error');
        }
    } finally {
        if (submitBtn) { submitBtn.disabled = false; }
    }
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
    const providerInitialStatus = document.getElementById('providerInitialStatus');
    if (providerInitialStatus) providerInitialStatus.value = 'agendado';
    if (!providerModal) return;
    providerModal.classList.remove('active');
    providerModal.setAttribute('aria-hidden', 'true');
}

function getCategoryMeta(category) {
    return providerCategoryMeta[category] || { label: 'Outros', icon: 'fa-briefcase', className: 'elevator' };
}

function getStatusLabel(status) {
    if (status === 'agendado') return 'Agendado';
    if (status === 'em andamento') return 'Em andamento';
    if (status === 'concluído') return 'Concluído';
    if (status === 'cancelado') return 'Cancelado';
    return 'Agendado';
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
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
