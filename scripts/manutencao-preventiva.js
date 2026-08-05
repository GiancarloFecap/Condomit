const maintenanceState = {
    currentUser: null,
    items: [],
    search: '',
    category: 'todos',
    status: 'todos'
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadMaintenanceUser();
    if (!currentUser) return;

    maintenanceState.currentUser = currentUser;
    maintenanceState.items = buildMaintenanceItems();

    setupMaintenanceShell(currentUser);
    setupMaintenanceActions();
    renderMaintenancePage();
});

async function loadMaintenanceUser() {
    let user = null;

    try {
        user = typeof refreshCurrentUserFromDb === 'function'
            ? await refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser'));
    } catch (_) {
        user = null;
    }

    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }

    return user;
}

function setupMaintenanceShell(currentUser) {
    let condominium = currentUser?.condominium || {};
    if (typeof condominium === 'string') {
        try {
            condominium = JSON.parse(condominium);
        } catch (_) {
            condominium = {};
        }
    }

    const sidebarApartment = document.getElementById('sidebarApartment');
    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');

    if (sidebarApartment && condominium?.name) {
        const words = condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
            : escapeHtml(condominium.name);
    }

    if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Usuário';
    if (profileTypeTop) {
        profileTypeTop.textContent = typeof getNormalizedUserType === 'function' && getNormalizedUserType(currentUser) === 'morador'
            ? 'Morador'
            : 'Síndico';
    }
    if (profileAvatarTop) profileAvatarTop.textContent = getInitials(currentUser.name || 'Usuário');

    if (typeof syncAllAvatars === 'function') {
        syncAllAvatars(currentUser);
    }
}

function setupMaintenanceActions() {
    document.getElementById('maintenanceSearch')?.addEventListener('input', (event) => {
        maintenanceState.search = String(event.target.value || '').trim().toLowerCase();
        renderMaintenancePage();
    });

    document.getElementById('maintenanceCategoryFilter')?.addEventListener('change', (event) => {
        maintenanceState.category = event.target.value;
        renderMaintenancePage();
    });

    document.getElementById('maintenanceStatusFilter')?.addEventListener('change', (event) => {
        maintenanceState.status = event.target.value;
        renderMaintenancePage();
    });

    document.getElementById('maintenanceClearFilters')?.addEventListener('click', () => {
        maintenanceState.search = '';
        maintenanceState.category = 'todos';
        maintenanceState.status = 'todos';

        const search = document.getElementById('maintenanceSearch');
        const category = document.getElementById('maintenanceCategoryFilter');
        const status = document.getElementById('maintenanceStatusFilter');

        if (search) search.value = '';
        if (category) category.value = 'todos';
        if (status) status.value = 'todos';

        renderMaintenancePage();
    });

    document.getElementById('openMaintenanceModalBtn')?.addEventListener('click', openMaintenanceModal);
    document.getElementById('closeMaintenanceModal')?.addEventListener('click', closeMaintenanceModal);
    document.getElementById('cancelMaintenanceModal')?.addEventListener('click', closeMaintenanceModal);
    document.getElementById('maintenanceModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'maintenanceModal') {
            closeMaintenanceModal();
        }
    });

    document.getElementById('maintenanceForm')?.addEventListener('submit', (event) => {
        event.preventDefault();

        const title = document.getElementById('maintenanceTitle')?.value.trim() || '';
        const location = document.getElementById('maintenanceLocation')?.value.trim() || '';
        const category = document.getElementById('maintenanceCategory')?.value || 'Elevadores';
        const frequency = document.getElementById('maintenanceFrequency')?.value || 'Mensal';
        const nextDate = document.getElementById('maintenanceDate')?.value || '';
        const description = document.getElementById('maintenanceDescription')?.value.trim() || '';

        if (!title || !location || !nextDate || !description) return;

        maintenanceState.items.unshift({
            id: `maintenance-${Date.now()}`,
            title,
            description,
            location,
            category,
            frequency,
            nextDate,
            status: getMaintenanceStatus(nextDate),
            icon: getCategoryIcon(category),
            iconColor: getCategoryColor(category)
        });

        closeMaintenanceModal();
        renderMaintenancePage();
    });
}

function renderMaintenancePage() {
    const filteredItems = getFilteredMaintenanceItems();
    populateCategoryFilter();
    renderMaintenanceMetrics();
    renderMaintenanceTable(filteredItems);
    renderUpcomingList();
}

function getFilteredMaintenanceItems() {
    return maintenanceState.items.filter((item) => {
        const haystack = `${item.title} ${item.location} ${item.category} ${item.description}`.toLowerCase();
        const matchesSearch = !maintenanceState.search || haystack.includes(maintenanceState.search);
        const matchesCategory = maintenanceState.category === 'todos' || normalizeToken(item.category) === maintenanceState.category;
        const matchesStatus = maintenanceState.status === 'todos' || item.status === maintenanceState.status;
        return matchesSearch && matchesCategory && matchesStatus;
    });
}

function renderMaintenanceMetrics() {
    const total = maintenanceState.items.length;
    const completed = maintenanceState.items.filter((item) => item.status === 'concluida').length;
    const pending = maintenanceState.items.filter((item) => item.status === 'pendente').length;
    const late = maintenanceState.items.filter((item) => item.status === 'atrasada').length;

    setText('maintenanceTotalCount', total);
    setText('maintenanceCompletedCount', completed);
    setText('maintenancePendingCount', pending);
    setText('maintenanceLateCount', late);
    setText('maintenanceCompletedRatio', formatRatio(completed, total));
    setText('maintenancePendingRatio', formatRatio(pending, total));
    setText('maintenanceLateRatio', formatRatio(late, total));
}

function populateCategoryFilter() {
    const select = document.getElementById('maintenanceCategoryFilter');
    if (!select) return;

    const categories = [...new Set(maintenanceState.items.map((item) => item.category))];
    const currentValue = maintenanceState.category;

    select.innerHTML = '<option value="todos">Todas as categorias</option>' + categories.map((category) => {
        const value = normalizeToken(category);
        return `<option value="${escapeHtml(value)}">${escapeHtml(category)}</option>`;
    }).join('');

    select.value = currentValue;
}

function renderMaintenanceTable(items) {
    const tbody = document.getElementById('maintenanceTableBody');
    const counter = document.getElementById('maintenanceCounter');
    if (!tbody) return;

    if (counter) {
        counter.textContent = `${items.length} ${items.length === 1 ? 'manutenção encontrada' : 'manutenções encontradas'}`;
    }

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Nenhuma manutenção encontrada com esses filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((item) => `
        <tr>
            <td>
                <div class="task-cell">
                    <div class="task-icon ${escapeHtml(item.iconColor)}"><i class="fas ${escapeHtml(item.icon)}"></i></div>
                    <div>
                        <div class="task-title">${escapeHtml(item.title)}</div>
                        <div class="task-copy">${escapeHtml(item.description)}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(item.location)}</td>
            <td><span class="category-pill ${escapeHtml(normalizeToken(item.category))}">${escapeHtml(item.category)}</span></td>
            <td>${escapeHtml(item.frequency)}</td>
            <td>
                <div class="next-date">
                    ${escapeHtml(formatDatePt(item.nextDate))}
                    <small class="${item.status === 'atrasada' ? 'atrasada' : ''}">${escapeHtml(formatDateHint(item.nextDate, item.status))}</small>
                </div>
            </td>
            <td><span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(formatStatusLabel(item.status))}</span></td>
            <td>
                <div class="action-list">
                    <button class="action-icon" type="button" aria-label="Visualizar"><i class="fas fa-eye"></i></button>
                    <button class="action-icon" type="button" aria-label="Mais ações"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderUpcomingList() {
    const container = document.getElementById('upcomingMaintenanceList');
    if (!container) return;

    const upcomingItems = [...maintenanceState.items]
        .filter((item) => item.status !== 'concluida')
        .sort((left, right) => new Date(left.nextDate).getTime() - new Date(right.nextDate).getTime())
        .slice(0, 3);

    container.innerHTML = upcomingItems.map((item) => `
        <article class="upcoming-item">
            <div class="upcoming-date">
                <strong>${escapeHtml(formatDay(item.nextDate))}</strong>
                <small>${escapeHtml(formatMonth(item.nextDate))}</small>
            </div>
            <div>
                <h4>${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(item.location)}</p>
            </div>
        </article>
    `).join('');
}

function buildMaintenanceItems() {
    return [
        {
            id: 'maintenance-1',
            title: 'Inspeção do elevador',
            description: 'Verificação completa do sistema do elevador.',
            location: 'Bloco A',
            category: 'Elevadores',
            frequency: 'Mensal',
            nextDate: '2026-08-25',
            status: 'pendente',
            icon: 'fa-building',
            iconColor: 'blue'
        },
        {
            id: 'maintenance-2',
            title: 'Recarga de extintores',
            description: 'Verificação e recarga dos extintores de incêndio.',
            location: 'Áreas comuns',
            category: 'Segurança',
            frequency: 'Semestral',
            nextDate: '2026-08-10',
            status: 'concluida',
            icon: 'fa-shield-halved',
            iconColor: 'green'
        },
        {
            id: 'maintenance-3',
            title: 'Manutenção da bomba d’água',
            description: 'Revisão da bomba e sistema hidráulico.',
            location: 'Casa de bombas',
            category: 'Hidráulica',
            frequency: 'Trimestral',
            nextDate: '2026-08-15',
            status: 'atrasada',
            icon: 'fa-faucet-drip',
            iconColor: 'orange'
        },
        {
            id: 'maintenance-4',
            title: 'Troca de lâmpadas',
            description: 'Substituição das lâmpadas queimadas.',
            location: 'Garagem',
            category: 'Elétrica',
            frequency: 'Mensal',
            nextDate: '2026-08-18',
            status: 'atrasada',
            icon: 'fa-bolt',
            iconColor: 'purple'
        },
        {
            id: 'maintenance-5',
            title: 'Limpeza de caixa d’água',
            description: 'Limpeza e higienização das caixas d’água.',
            location: 'Caixa d’água',
            category: 'Hidráulica',
            frequency: 'Semestral',
            nextDate: '2026-09-20',
            status: 'pendente',
            icon: 'fa-droplet',
            iconColor: 'cyan'
        },
        {
            id: 'maintenance-6',
            title: 'Dedetização',
            description: 'Controle de pragas e insetos nas áreas comuns.',
            location: 'Áreas comuns',
            category: 'Limpeza',
            frequency: 'Trimestral',
            nextDate: '2026-10-05',
            status: 'pendente',
            icon: 'fa-pump-soap',
            iconColor: 'green'
        }
    ];
}

function getMaintenanceStatus(dateValue) {
    const maintenanceDate = new Date(`${dateValue}T00:00:00`);
    const now = new Date();
    maintenanceDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return maintenanceDate < now ? 'atrasada' : 'pendente';
}

function getCategoryIcon(category) {
    const normalized = normalizeToken(category);
    if (normalized === 'seguranca') return 'fa-shield-halved';
    if (normalized === 'hidraulica') return 'fa-faucet-drip';
    if (normalized === 'eletrica') return 'fa-bolt';
    if (normalized === 'limpeza') return 'fa-pump-soap';
    return 'fa-building';
}

function getCategoryColor(category) {
    const normalized = normalizeToken(category);
    if (normalized === 'seguranca' || normalized === 'limpeza') return 'green';
    if (normalized === 'hidraulica') return 'orange';
    if (normalized === 'eletrica') return 'purple';
    return 'blue';
}

function normalizeToken(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatRatio(value, total) {
    if (!total) return '0%';
    return `${Math.round((value / total) * 100)}%`;
}

function formatStatusLabel(status) {
    if (status === 'concluida') return 'Concluída';
    if (status === 'atrasada') return 'Atrasada';
    return 'Pendente';
}

function formatDatePt(value) {
    const date = new Date(`${value}T00:00:00`);
    return isNaN(date.getTime())
        ? '--/--/----'
        : date.toLocaleDateString('pt-BR');
}

function formatDateHint(value, status) {
    const date = new Date(`${value}T00:00:00`);
    const now = new Date();
    date.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (status === 'concluida') return 'Concluída';
    if (diffDays < 0) return 'Atrasada';
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'em 1 dia';
    return `em ${diffDays} dias`;
}

function formatDay(value) {
    const date = new Date(`${value}T00:00:00`);
    return isNaN(date.getTime()) ? '--' : String(date.getDate()).padStart(2, '0');
}

function formatMonth(value) {
    const date = new Date(`${value}T00:00:00`);
    return isNaN(date.getTime())
        ? '---'
        : date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
}

function openMaintenanceModal() {
    document.getElementById('maintenanceModal')?.classList.add('open');
}

function closeMaintenanceModal() {
    document.getElementById('maintenanceModal')?.classList.remove('open');
    document.getElementById('maintenanceForm')?.reset();
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function getInitials(name) {
    return String(name || 'Usuário')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'US';
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
