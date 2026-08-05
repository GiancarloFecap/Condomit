const residentsState = {
    currentUser: null,
    residents: [],
    filteredResidents: [],
    search: '',
    block: 'todos'
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

    const fullName = currentUser.name || 'Síndico';
    const initials = getInitials(fullName);
    if (profileNameTop) profileNameTop.textContent = fullName;
    if (profileTypeTop) profileTypeTop.textContent = 'Síndico';
    if (profileAvatarTop) profileAvatarTop.textContent = initials;

    if (typeof syncAllAvatars === 'function') {
        syncAllAvatars(currentUser);
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
}

async function loadResidents() {
    try {
        const residents = await fetchResidentsFromApi();
        residentsState.residents = residents;
        await populateBlockFilter(residents);
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

    return allUsers
        .map(normalizeResident)
        .filter((resident) => resident.type === 'morador' && residentsBelongToCurrentCondominium(resident))
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
        condominiumIdentifiers: getCondominiumIdentifiers(user),
        type,
        status: role.includes('depend') ? 'dependente' : (status === 'inativo' ? 'inativo' : 'ativo'),
        role: role.includes('depend') ? 'Dependente' : 'Titular',
        createdAt,
        profilePhoto: user?.profilePhoto || null
    };
}

function getCondominiumIdentifiers(user) {
    let condominium = user?.condominium || {};
    if (typeof condominium === 'string') {
        try {
            condominium = JSON.parse(condominium);
        } catch (_) {
            condominium = {};
        }
    }

    return [
        condominium?.cep,
        condominium?.condominium_id,
        condominium?.condominiumId,
        user?.cep,
        user?.condominium_cep,
        user?.condominium_id,
        user?.condominiumId
    ]
        .map((value) => String(value || '').replace(/\D/g, ''))
        .filter(Boolean);
}

function residentsBelongToCurrentCondominium(resident) {
    const currentIdentifiers = getCondominiumIdentifiers(residentsState.currentUser);
    const residentIdentifiers = Array.isArray(resident?.condominiumIdentifiers)
        ? resident.condominiumIdentifiers
        : [];

    return residentIdentifiers.some((identifier) => currentIdentifiers.includes(identifier));
}

async function getRegisteredBlocks() {
    const currentUser = residentsState.currentUser;
    let condominium = currentUser?.condominium || {};
    if (typeof condominium === 'string') {
        try {
            condominium = JSON.parse(condominium);
        } catch (_) {
            condominium = {};
        }
    }
    const directBlocks = condominium.blockNames || condominium.block_names || [];

    if (Array.isArray(directBlocks) && directBlocks.length) {
        return directBlocks.map((block) => String(block || '').trim()).filter(Boolean);
    }

    const identifiers = getCondominiumIdentifiers(currentUser);
    const primaryIdentifier = identifiers[0];
    if (!primaryIdentifier) return [];

    try {
        const response = await fetch(`/api/condominiums?cep=eq.${encodeURIComponent(primaryIdentifier)}`);
        if (!response.ok) throw new Error('Falha ao buscar blocos do condomínio.');
        const data = await response.json();
        const condominiumData = Array.isArray(data) ? data[0] : data;
        const apiBlocks = condominiumData?.block_names || condominiumData?.blockNames || [];
        return Array.isArray(apiBlocks)
            ? apiBlocks.map((block) => String(block || '').trim()).filter(Boolean)
            : [];
    } catch (error) {
        console.warn('Não foi possível buscar os blocos cadastrados:', error);
        return [];
    }
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

async function populateBlockFilter(residents) {
    const select = document.getElementById('residentBlockFilter');
    if (!select) return;

    const registeredBlocks = await getRegisteredBlocks();
    const residentBlocks = residents.map((resident) => resident.block).filter(Boolean);
    const blocks = [...new Set([...registeredBlocks, ...residentBlocks])]
        .sort((left, right) => left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' }));

    select.innerHTML = '<option value="todos">Todos os blocos</option>' +
        blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('');
}

function applyResidentsFilters() {
    residentsState.filteredResidents = residentsState.residents.filter((resident) => {
        const haystack = `${resident.name} ${resident.apartment} ${resident.block} ${resident.email} ${resident.phone}`.toLowerCase();
        const matchesSearch = !residentsState.search || haystack.includes(residentsState.search);
        const matchesBlock = residentsState.block === 'todos' || resident.block === residentsState.block;
        return matchesSearch && matchesBlock;
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
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhum morador encontrado com esses filtros.</td></tr>';
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
}

function renderBlockChart(allResidents) {
    const legend = document.getElementById('blockLegend');
    const donut = document.getElementById('blockDonut');
    if (!legend || !donut) return;

    const colors = ['#22c1d6', '#60a5fa', '#4ade80', '#a78bfa', '#f59e0b', '#f97316'];
    const counts = countBy(allResidents, (resident) => resident.block || 'Sem bloco');
    renderDonutChart(donut, legend, counts, colors, allResidents.length, 'moradores');
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
