const residentsState = {
    currentUser: null,
    residents: [],
    filteredResidents: [],
    search: '',
    block: 'todos',
    status: 'todos'
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadResidentsUser();
    if (!currentUser) return;

    residentsState.currentUser = currentUser;
    setupResidentsShell(currentUser);
    setupResidentsFilters();
    await loadResidents();
});

async function loadResidentsUser() {
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

    const userType = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(user)
        : String(user.type || '').trim().toLowerCase();

    if (userType !== 'sindico') {
        if (typeof redirectToHome === 'function') {
            redirectToHome();
        } else {
            window.location.href = 'index.html';
        }
        return null;
    }

    return user;
}

function setupResidentsShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
            : escapeHtml(currentUser.condominium.name);
    }
}

function setupResidentsFilters() {
    document.getElementById('residentSearch')?.addEventListener('input', (event) => {
        residentsState.search = String(event.target.value || '').trim().toLowerCase();
        applyResidentsFilters();
    });

    document.getElementById('residentBlockFilter')?.addEventListener('change', (event) => {
        residentsState.block = event.target.value;
        applyResidentsFilters();
    });

    document.getElementById('residentStatusFilter')?.addEventListener('change', (event) => {
        residentsState.status = event.target.value;
        applyResidentsFilters();
    });
}

async function loadResidents() {
    try {
        const residents = await fetchResidentsFromApi();
        residentsState.residents = residents;
        populateBlockFilter(residents);
        applyResidentsFilters();
    } catch (error) {
        console.error('Erro ao carregar moradores:', error);
        renderResidentsTable([]);
    }
}

async function fetchResidentsFromApi() {
    const response = await fetch('/api/users');
    if (!response.ok) throw new Error('Não foi possível buscar os moradores.');

    const data = await response.json();
    const allUsers = Array.isArray(data) ? data : [];
    const condominiumKey = getCondominiumKey(residentsState.currentUser);

    return allUsers
        .map(normalizeResident)
        .filter((resident) => resident.type === 'morador' && resident.condominiumKey === condominiumKey)
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function normalizeResident(user) {
    let condominium = user?.condominium || {};
    if (typeof condominium === 'string') {
        try {
            condominium = JSON.parse(condominium);
        } catch (_) {
            condominium = {};
        }
    }

    const type = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(user)
        : String(user?.type || user?.user_type || '').trim().toLowerCase();

    const status = String(user?.status || user?.resident_status || 'ativo').trim().toLowerCase();
    const role = String(user?.resident_role || user?.role || 'titular').trim().toLowerCase();
    const createdAt = user?.created_at || user?.createdAt || null;

    return {
        id: user?.id || user?.email || `resident-${Math.random().toString(36).slice(2, 8)}`,
        name: user?.name || 'Morador',
        email: user?.email || 'Não informado',
        phone: user?.phone || user?.telephone || 'Não informado',
        block: condominium?.block || 'Sem bloco',
        apartment: condominium?.apartment || '---',
        condominiumKey: getCondominiumKey(user),
        type,
        status: role.includes('depend') ? 'dependente' : (status === 'inativo' ? 'inativo' : 'ativo'),
        role: role.includes('depend') ? 'Dependente' : 'Titular',
        createdAt,
        profilePhoto: user?.profilePhoto || null
    };
}

function getCondominiumKey(user) {
    const condominium = user?.condominium && typeof user.condominium === 'object'
        ? user.condominium
        : {};
    return String(
        condominium.cep ||
        condominium.condominium_id ||
        condominium.condominiumId ||
        user?.cep ||
        ''
    ).replace(/\D/g, '');
}

function populateBlockFilter(residents) {
    const select = document.getElementById('residentBlockFilter');
    if (!select) return;

    const blocks = [...new Set(residents.map((resident) => resident.block).filter(Boolean))];
    select.innerHTML = '<option value="todos">Todos os blocos</option>' +
        blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('');
}

function applyResidentsFilters() {
    residentsState.filteredResidents = residentsState.residents.filter((resident) => {
        const haystack = `${resident.name} ${resident.apartment} ${resident.block} ${resident.email} ${resident.phone}`.toLowerCase();
        const matchesSearch = !residentsState.search || haystack.includes(residentsState.search);
        const matchesBlock = residentsState.block === 'todos' || resident.block === residentsState.block;
        const matchesStatus = residentsState.status === 'todos' || resident.status === residentsState.status;
        return matchesSearch && matchesBlock && matchesStatus;
    });

    renderResidentsStats(residentsState.residents);
    renderResidentsTable(residentsState.filteredResidents);
    renderResidentsCharts(residentsState.residents);
}

function renderResidentsStats(allResidents) {
    const totalResidents = allResidents.filter((resident) => resident.status === 'ativo').length;
    const totalUnits = new Set(allResidents.map((resident) => `${resident.block}-${resident.apartment}`)).size;
    const newResidents = allResidents.filter((resident) => isCurrentMonth(resident.createdAt)).length;
    const dependentResidents = allResidents.filter((resident) => resident.status === 'dependente').length;

    setText('totalResidents', totalResidents);
    setText('totalUnits', totalUnits);
    setText('newResidents', newResidents);
    setText('dependentResidents', dependentResidents);
}

function renderResidentsTable(residents) {
    const tbody = document.getElementById('residentsTableBody');
    const counter = document.getElementById('residentCounter');
    if (!tbody) return;

    if (counter) {
        counter.textContent = `${residents.length} ${residents.length === 1 ? 'morador encontrado' : 'moradores encontrados'}`;
    }

    if (!residents.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum morador encontrado com esses filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = residents.map((resident) => `
        <tr>
            <td>
                <div class="resident-cell">
                    <div class="resident-avatar">${resident.profilePhoto ? `<img src="${resident.profilePhoto}" alt="${escapeHtml(resident.name)}">` : escapeHtml(getInitials(resident.name))}</div>
                    <div>
                        <div class="resident-name">${escapeHtml(resident.name)}</div>
                        <div class="resident-role">${escapeHtml(resident.role)}</div>
                    </div>
                </div>
            </td>
            <td>Apto ${escapeHtml(resident.apartment)}</td>
            <td>${escapeHtml(resident.block)}</td>
            <td>
                <div class="resident-contact">
                    <strong>${escapeHtml(resident.phone)}</strong>
                    <small>${escapeHtml(resident.email)}</small>
                </div>
            </td>
            <td><span class="status-pill ${resident.status}">${formatResidentStatus(resident.status)}</span></td>
            <td>
                <div class="action-buttons">
                    <button type="button" aria-label="Visualizar"><i class="fas fa-eye"></i></button>
                    <button type="button" aria-label="Editar"><i class="fas fa-pen"></i></button>
                    <button type="button" aria-label="Mais ações"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderResidentsCharts(allResidents) {
    renderBlockChart(allResidents);
    renderStatusChart(allResidents);
}

function renderBlockChart(allResidents) {
    const legend = document.getElementById('blockLegend');
    const donut = document.getElementById('blockDonut');
    if (!legend || !donut) return;

    const colors = ['#22c1d6', '#60a5fa', '#4ade80', '#a78bfa', '#f59e0b', '#f97316'];
    const counts = countBy(allResidents, (resident) => resident.block || 'Sem bloco');
    renderDonutChart(donut, legend, counts, colors, allResidents.length, 'moradores');
}

function renderStatusChart(allResidents) {
    const legend = document.getElementById('statusLegend');
    const donut = document.getElementById('statusDonut');
    if (!legend || !donut) return;

    const counts = {
        Ativos: allResidents.filter((resident) => resident.status === 'ativo').length,
        Inativos: allResidents.filter((resident) => resident.status === 'inativo').length,
        Dependentes: allResidents.filter((resident) => resident.status === 'dependente').length
    };

    renderDonutChart(donut, legend, counts, ['#22c55e', '#94a3b8', '#f59e0b'], allResidents.length, 'moradores');
}

function renderDonutChart(donut, legend, counts, colors, total, suffix) {
    const entries = Object.entries(counts).filter(([, value]) => value > 0);

    if (!entries.length) {
        donut.style.background = '#e2e8f0';
        legend.innerHTML = '<span>Sem dados disponíveis.</span>';
        return;
    }

    let accumulated = 0;
    const gradient = entries.map(([_, value], index) => {
        const start = accumulated;
        const percentage = (value / total) * 100;
        accumulated += percentage;
        return `${colors[index % colors.length]} ${start}% ${accumulated}%`;
    }).join(', ');

    donut.style.background = `conic-gradient(${gradient})`;
    legend.innerHTML = entries.map(([label, value], index) => `
        <div class="legend-item">
            <span><i class="legend-dot" style="background:${colors[index % colors.length]}"></i>${escapeHtml(label)}</span>
            <strong>${value}</strong>
        </div>
    `).join('') + `<span>Total: ${total} ${suffix}</span>`;
}

function countBy(items, getter) {
    return items.reduce((accumulator, item) => {
        const key = getter(item);
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
    }, {});
}

function isCurrentMonth(value) {
    if (!value) return false;
    const date = new Date(value);
    const now = new Date();
    return !isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function formatResidentStatus(status) {
    if (status === 'inativo') return 'Inativo';
    if (status === 'dependente') return 'Dependente';
    return 'Ativo';
}

function getInitials(name) {
    return String(name || 'Morador')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'MR';
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
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
