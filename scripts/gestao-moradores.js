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
    if (typeof window.supabaseFetch !== 'function') {
        throw new Error('Supabase indisponível.');
    }

    const rows = await window.supabaseFetch('/rpc/condomit_list_condo_residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });

    return (Array.isArray(rows) ? rows : [])
        .map((resident) => ({
            id: resident?.email || `resident-${Math.random().toString(36).slice(2, 8)}`,
            name: resident?.name || resident?.email || 'Morador',
            email: resident?.email || 'Não informado',
            phone: resident?.phone || 'Não informado',
            block: String(resident?.block || 'Sem bloco'),
            apartment: String(resident?.apartment || '---'),
            condominiumIdentifiers: [String(resident?.cep || '').replace(/\D/g, '')].filter(Boolean),
            type: 'morador',
            status: 'ativo',
            role: 'Titular',
            createdAt: resident?.joined_at || resident?.created_at || null,
            profilePhoto: resident?.profile_photo || null
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }));
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

    closeResidentActionsMenu();

    if (counter) {
        counter.textContent = `${residents.length} ${residents.length === 1 ? 'morador encontrado' : 'moradores encontrados'}`;
    }

    if (!residents.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhum morador encontrado com esses filtros.</td></tr>';
        return;
    }

    tbody.innerHTML = residents.map((resident) => `
        <tr class="resident-table-row" data-resident-row data-resident-email="${escapeHtml(resident.email)}" tabindex="0">
            <td>
                <div class="resident-cell">
                    <div class="resident-avatar">${resident.profilePhoto ? `<img src="${escapeHtml(resident.profilePhoto)}" alt="${escapeHtml(resident.name)}">` : escapeHtml(getInitials(resident.name))}</div>
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
                    <button type="button" class="resident-view-btn" data-resident-email="${escapeHtml(resident.email)}" aria-label="Visualizar morador" title="Visualizar morador"><i class="fas fa-eye"></i></button>
                    <button type="button" class="resident-more-btn" data-resident-email="${escapeHtml(resident.email)}" aria-label="Mais ações" title="Mais ações"><i class="fas fa-ellipsis-v"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    const findResident = (email) => residentsState.residents.find(
        (item) => String(item.email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase()
    );

    tbody.querySelectorAll('.resident-view-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const resident = findResident(button.dataset.residentEmail);
            if (resident) openResidentDetails(resident);
        });
    });

    tbody.querySelectorAll('.resident-more-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const resident = findResident(button.dataset.residentEmail);
            if (resident) openResidentActionsMenu(button, resident);
        });
    });

    tbody.querySelectorAll('[data-resident-row]').forEach((row) => {
        const open = () => {
            const resident = findResident(row.dataset.residentEmail);
            if (resident) openResidentDetails(resident);
        };
        row.addEventListener('click', (event) => {
            if (event.target.closest('button, a, input, select')) return;
            open();
        });
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') open();
        });
    });
}

function closeResidentActionsMenu() {
    document.getElementById('residentActionsMenu')?.remove();
}

function openResidentActionsMenu(button, resident) {
    closeResidentActionsMenu();
    const menu = document.createElement('div');
    menu.id = 'residentActionsMenu';
    menu.className = 'resident-actions-menu';
    menu.innerHTML = `
        <button type="button" data-action="promote"><i class="fas fa-user-tie"></i><span>Tornar o usuário síndico</span></button>
        <button type="button" class="danger" data-action="expel"><i class="fas fa-user-slash"></i><span>Expulsar do condomínio</span></button>`;
    document.body.appendChild(menu);

    const rect = button.getBoundingClientRect();
    const width = 250;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 12, rect.bottom + 8)}px`;

    menu.querySelector('[data-action="promote"]')?.addEventListener('click', () => {
        closeResidentActionsMenu();
        confirmPromoteResident(resident);
    });
    menu.querySelector('[data-action="expel"]')?.addEventListener('click', () => {
        closeResidentActionsMenu();
        confirmExpelResident(resident);
    });
}

function askConfirmation(options) {
    if (typeof window.showModal === 'function') {
        window.showModal(options);
        return;
    }
    if (window.confirm(options.message || options.title || 'Confirmar ação?')) {
        Promise.resolve(options.onConfirm?.()).catch(console.error);
    }
}

function persistCurrentUserRole(role) {
    const current = { ...(residentsState.currentUser || {}) };
    current.type = role;
    current.user_type = role;
    residentsState.currentUser = current;
    try { sessionStorage.setItem('condominiumUser', JSON.stringify(current)); } catch (_) {}
    try { localStorage.setItem('condominiumPersistentUser', JSON.stringify(current)); } catch (_) {}
}

function confirmPromoteResident(resident) {
    askConfirmation({
        title: 'Transferir função de síndico',
        message: `Ao promover ${resident.name} a síndico, sua própria conta passará a ser morador. Deseja continuar?`,
        type: 'warning',
        confirmText: 'Sim, transferir função',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await window.supabaseFetch('/rpc/condomit_promote_resident_to_sindico', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_email: resident.email })
                });
                persistCurrentUserRole('morador');
                window.showToast?.(`${resident.name} agora é o síndico do condomínio. Sua conta passou a ser morador.`, 'success');
                window.setTimeout(() => { window.location.href = 'index-morador.html'; }, 900);
            } catch (error) {
                console.error('Erro ao promover morador:', error);
                window.showToast?.(error?.message || 'Não foi possível transferir a função de síndico.', 'error');
            }
        }
    });
}

function confirmExpelResident(resident) {
    askConfirmation({
        title: 'Expulsar morador do condomínio',
        message: `${resident.name} será removido deste condomínio e precisará entrar em outro condomínio para voltar a utilizar as funções condominiais. Deseja continuar?`,
        type: 'warning',
        confirmText: 'Expulsar do condomínio',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            try {
                await window.supabaseFetch('/rpc/condomit_expulse_resident', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_email: resident.email })
                });
                window.showToast?.(`${resident.name} foi removido do condomínio.`, 'success');
                await loadResidents();
            } catch (error) {
                console.error('Erro ao expulsar morador:', error);
                window.showToast?.(error?.message || 'Não foi possível remover o morador do condomínio.', 'error');
            }
        }
    });
}

function openResidentDetails(resident) {
    let overlay = document.getElementById('residentDetailsModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'residentDetailsModal';
        overlay.className = 'resident-modal-overlay';
        overlay.innerHTML = `
            <div class="resident-modal" role="dialog" aria-modal="true" aria-labelledby="residentModalTitle">
                <div class="resident-modal-head">
                    <div>
                        <span class="resident-modal-eyebrow">Morador</span>
                        <h2 id="residentModalTitle">Informações do morador</h2>
                    </div>
                    <button type="button" class="resident-modal-close" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
                </div>
                <div id="residentModalBody"></div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.resident-modal-close')?.addEventListener('click', closeResidentDetails);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeResidentDetails();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && overlay.classList.contains('open')) closeResidentDetails();
        });
    }

    const body = document.getElementById('residentModalBody');
    const photo = resident.profilePhoto || '';
    const joinedDate = resident.createdAt ? new Date(resident.createdAt) : null;
    const joinedLabel = joinedDate && !Number.isNaN(joinedDate.getTime())
        ? joinedDate.toLocaleDateString('pt-BR')
        : 'Não informado';
    if (body) {
        body.innerHTML = `
            <div class="resident-modal-profile">
                <div class="resident-modal-avatar">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(resident.name)}">` : escapeHtml(getInitials(resident.name))}</div>
                <div>
                    <strong>${escapeHtml(resident.name)}</strong>
                    <span>${escapeHtml(resident.email)}</span>
                </div>
            </div>
            <div class="resident-modal-grid">
                <div class="resident-detail"><span>Telefone</span><strong>${escapeHtml(resident.phone)}</strong></div>
                <div class="resident-detail"><span>Apartamento</span><strong>${escapeHtml(resident.apartment)}</strong></div>
                <div class="resident-detail"><span>Bloco</span><strong>${escapeHtml(resident.block)}</strong></div>
                <div class="resident-detail"><span>Tipo</span><strong>${escapeHtml(resident.role || 'Titular')}</strong></div>
                <div class="resident-detail"><span>Status</span><strong>${escapeHtml(resident.status === 'ativo' ? 'Ativo' : resident.status)}</strong></div>
                <div class="resident-detail"><span>Entrou no condomínio em</span><strong>${escapeHtml(joinedLabel)}</strong></div>
            </div>`;
    }
    overlay.classList.add('open');
    document.body.classList.add('resident-modal-open');
}

function closeResidentDetails() {
    document.getElementById('residentDetailsModal')?.classList.remove('open');
    document.body.classList.remove('resident-modal-open');
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
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}


document.addEventListener('click', (event) => {
    if (!event.target.closest('#residentActionsMenu, .resident-more-btn')) closeResidentActionsMenu();
});
window.addEventListener('resize', closeResidentActionsMenu);
window.addEventListener('scroll', closeResidentActionsMenu, true);
