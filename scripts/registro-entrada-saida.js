const accessLogState = {
    currentUser: null,
    movements: [],
    filters: {
        search: '',
        type: 'all',
        block: 'all',
        date: ''
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadPorterUser();
    if (!currentUser) return;

    accessLogState.currentUser = currentUser;
    initAccessPageShell(currentUser);
    bindAccessPageControls();
    await loadAccessMovements();
});

async function loadPorterUser() {
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

function initAccessPageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    const exportButton = document.getElementById('accessLogExportBtn');
    const accessDateFilter = document.getElementById('accessDateFilter');

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    if (accessDateFilter) {
        accessDateFilter.value = new Date().toISOString().slice(0, 10);
        accessLogState.filters.date = accessDateFilter.value;
    }

    exportButton?.addEventListener('click', () => {
        loadAccessMovements();
    });

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }
}

function bindAccessPageControls() {
    const accessSearchInput = document.getElementById('accessSearchInput');
    const accessTypeFilter = document.getElementById('accessTypeFilter');
    const accessBlockFilter = document.getElementById('accessBlockFilter');
    const accessDateFilter = document.getElementById('accessDateFilter');
    const clearAccessFiltersBtn = document.getElementById('clearAccessFiltersBtn');

    accessSearchInput?.addEventListener('input', (event) => {
        accessLogState.filters.search = event.target.value.trim().toLowerCase();
        renderAccessPage();
    });

    accessTypeFilter?.addEventListener('change', (event) => {
        accessLogState.filters.type = event.target.value;
        syncQuickFilterState(event.target.value);
        renderAccessPage();
    });

    accessBlockFilter?.addEventListener('change', (event) => {
        accessLogState.filters.block = event.target.value;
        renderAccessPage();
    });

    accessDateFilter?.addEventListener('change', (event) => {
        accessLogState.filters.date = event.target.value;
        renderAccessPage();
    });

    clearAccessFiltersBtn?.addEventListener('click', () => {
        accessLogState.filters = {
            search: '',
            type: 'all',
            block: 'all',
            date: ''
        };

        if (accessSearchInput) accessSearchInput.value = '';
        if (accessTypeFilter) accessTypeFilter.value = 'all';
        if (accessBlockFilter) accessBlockFilter.value = 'all';
        if (accessDateFilter) accessDateFilter.value = '';
        syncQuickFilterState('all');
        renderAccessPage();
    });

    document.querySelectorAll('[data-quick-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            const nextType = button.dataset.quickFilter || 'all';
            accessLogState.filters.type = nextType;
            if (accessTypeFilter) accessTypeFilter.value = nextType;
            syncQuickFilterState(nextType);
            renderAccessPage();
        });
    });
}

async function loadAccessMovements() {
    const visitorRecords = typeof window.getVisitorsForCondominium === 'function'
        ? await window.getVisitorsForCondominium(accessLogState.currentUser)
        : [];
    const localRegistrationLogs = window.visitorRegistration && typeof window.visitorRegistration.getRecentLogs === 'function'
        ? window.visitorRegistration.getRecentLogs(accessLogState.currentUser)
        : [];
    const gatehouseLogs = getStoredAccessLogs(accessLogState.currentUser);

    accessLogState.movements = [
        ...buildMovementsFromRegistrations(localRegistrationLogs),
        ...buildMovementsFromGatehouseLogs(gatehouseLogs, visitorRecords)
    ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    populateAccessBlockOptions();
    renderAccessPage();
}

function getCondominiumKey(user = accessLogState.currentUser) {
    const identifiers = typeof window.getUserCondominiumIdentifiers === 'function'
        ? window.getUserCondominiumIdentifiers(user)
        : [];
    return identifiers[0] || 'geral';
}

function getAccessLogStorageKey(user = accessLogState.currentUser) {
    return `condomit.access-log.${getCondominiumKey(user)}`;
}

function getStoredAccessLogs(user = accessLogState.currentUser) {
    try {
        return JSON.parse(localStorage.getItem(getAccessLogStorageKey(user)) || '[]');
    } catch (_) {
        return [];
    }
}

function buildMovementsFromRegistrations(logs) {
    return (Array.isArray(logs) ? logs : []).map((log, index) => ({
        id: `registration-${index}-${log.createdAt || log.visitDate || ''}`,
        createdAt: buildIsoDate(log.visitDate, log.visitTime, log.createdAt),
        movementType: 'entry',
        fullName: log.fullName || 'Visitante',
        cpf: log.cpf || '',
        apartment: log.apartment || '',
        block: log.block || '',
        responsibleName: log.responsibleName || '',
        originLabel: 'Cadastro',
        badges: ['Visitante']
    }));
}

function buildMovementsFromGatehouseLogs(logs, visitors) {
    const visitorsByCpf = new Map(
        (Array.isArray(visitors) ? visitors : []).map((visitor) => [
            String(visitor?.cpf || '').replace(/\D/g, ''),
            visitor
        ])
    );

    return (Array.isArray(logs) ? logs : []).map((log, index) => {
        const visitor = visitorsByCpf.get(String(log?.cpf || '').replace(/\D/g, '')) || {};
        const movementType = log?.movementType === 'exit' ? 'exit' : 'entry';
        return {
            id: `gatehouse-${index}-${log.createdAt || ''}`,
            createdAt: log?.createdAt || new Date().toISOString(),
            movementType,
            fullName: log?.fullName || visitor?.full_name || 'Visitante',
            cpf: log?.cpf || visitor?.cpf || '',
            apartment: log?.apartment || visitor?.responsible?.condominium?.apartment || '',
            block: log?.block || visitor?.responsible?.condominium?.block || '',
            responsibleName: log?.responsibleName || visitor?.responsible?.name || '',
            originLabel: movementType === 'entry' ? 'Liberação' : 'Recusa',
            badges: ['Visitante', movementType === 'entry' ? 'Liberado' : 'Recusado']
        };
    });
}

function populateAccessBlockOptions() {
    const accessBlockFilter = document.getElementById('accessBlockFilter');
    if (!accessBlockFilter) return;

    const blocks = [...new Set(
        accessLogState.movements
            .map((movement) => String(movement?.block || '').trim())
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right, 'pt-BR'))
    )];

    accessBlockFilter.innerHTML = `
        <option value="all">Todos os blocos</option>
        ${blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('')}
    `;

    if (accessLogState.filters.block !== 'all' && blocks.includes(accessLogState.filters.block)) {
        accessBlockFilter.value = accessLogState.filters.block;
    }
}

function renderAccessPage() {
    const filteredMovements = applyAccessFilters(accessLogState.movements);
    updateAccessMetrics(accessLogState.movements);
    renderAccessTable(filteredMovements);
}

function applyAccessFilters(movements) {
    return movements.filter((movement) => {
        const normalizedSearchBase = [
            movement.fullName,
            formatCpf(movement.cpf),
            movement.responsibleName,
            movement.apartment,
            movement.block,
            movement.originLabel
        ].join(' ').toLowerCase();

        const matchesSearch = !accessLogState.filters.search || normalizedSearchBase.includes(accessLogState.filters.search);
        const matchesType = accessLogState.filters.type === 'all' || movement.movementType === accessLogState.filters.type;
        const matchesBlock = accessLogState.filters.block === 'all' || String(movement.block || '') === accessLogState.filters.block;
        const matchesDate = !accessLogState.filters.date || buildDateKey(movement.createdAt) === accessLogState.filters.date;

        return matchesSearch && matchesType && matchesBlock && matchesDate;
    });
}

function updateAccessMetrics(movements) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayMovements = movements.filter((movement) => buildDateKey(movement.createdAt) === todayKey);
    const todayEntries = todayMovements.filter((movement) => movement.movementType === 'entry');
    const todayExits = todayMovements.filter((movement) => movement.movementType === 'exit');
    const uniqueVisitors = new Set(todayMovements.map((movement) => String(movement.cpf || movement.fullName || ''))).size;

    setText('entriesTodayCount', todayEntries.length);
    setText('exitsTodayCount', todayExits.length);
    setText('movementsTodayCount', todayMovements.length);
    setText('peakHourLabel', getPeakHourLabel(todayMovements));
    setText('legendEntriesCount', todayEntries.length);
    setText('legendExitsCount', todayExits.length);
    setText('legendVisitorsCount', uniqueVisitors);

    const chart = document.getElementById('accessDonutChart');
    if (chart) {
        chart.style.background = buildDonutGradient([
            { value: todayEntries.length, color: '#0ea5a4' },
            { value: todayExits.length, color: '#f59e0b' },
            { value: uniqueVisitors, color: '#6366f1' }
        ]);
    }
}

function renderAccessTable(movements) {
    const tableBody = document.getElementById('accessLogTableBody');
    const accessLogSummary = document.getElementById('accessLogSummary');
    if (!tableBody || !accessLogSummary) return;

    accessLogSummary.textContent = `Mostrando ${movements.length} registro${movements.length === 1 ? '' : 's'}`;

    if (!movements.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <strong>Nenhum registro encontrado</strong>
                        <p>Cadastros de visitantes e liberações feitas pelo porteiro aparecerão aqui.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = movements.map((movement) => `
        <tr>
            <td>
                <strong>${formatTime(movement.createdAt)}</strong><br>
                <span class="legend-note">${formatDate(movement.createdAt)}</span>
            </td>
            <td>
                <span class="movement-chip ${movement.movementType}">
                    <i class="fas ${movement.movementType === 'entry' ? 'fa-right-to-bracket' : 'fa-right-from-bracket'}"></i>
                    ${movement.movementType === 'entry' ? 'Entrada' : 'Saída'}
                </span>
            </td>
            <td>
                <div class="table-name">
                    <strong>${escapeHtml(movement.fullName || 'Visitante')}</strong>
                    <div class="table-badges">
                        ${(movement.badges || []).map((badge) => `<span class="pill ${badge === 'Liberado' ? 'success' : badge === 'Recusado' ? 'danger' : 'info'}">${escapeHtml(badge)}</span>`).join('')}
                    </div>
                </div>
            </td>
            <td>${escapeHtml(formatCpf(movement.cpf || '--'))}</td>
            <td>${escapeHtml(String(movement.apartment || '--'))}</td>
            <td>${escapeHtml(String(movement.block || '--'))}</td>
            <td>${escapeHtml(movement.responsibleName || '--')}</td>
            <td><span class="record-avatar">${getInitials(movement.fullName)}</span></td>
        </tr>
    `).join('');
}

function getPeakHourLabel(movements) {
    if (!movements.length) return '--:--';

    const hourCounts = new Map();
    movements.forEach((movement) => {
        const hour = new Date(movement.createdAt).toTimeString().slice(0, 2);
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    const [peakHour] = [...hourCounts.entries()].sort((left, right) => right[1] - left[1])[0] || [];
    return peakHour ? `${peakHour}:00` : '--:--';
}

function syncQuickFilterState(activeFilter) {
    document.querySelectorAll('[data-quick-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.quickFilter === activeFilter);
    });
}

function buildIsoDate(visitDate, visitTime, fallback) {
    if (visitDate && visitTime) return `${visitDate}T${visitTime}:00`;
    if (visitDate) return `${visitDate}T00:00:00`;
    return fallback || new Date().toISOString();
}

function buildDateKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildDonutGradient(parts) {
    const total = parts.reduce((sum, part) => sum + Math.max(0, Number(part.value) || 0), 0);
    if (!total) return 'conic-gradient(#e2e8f0 0deg 360deg)';

    let accumulated = 0;
    const slices = parts.map((part) => {
        const start = (accumulated / total) * 360;
        accumulated += Math.max(0, Number(part.value) || 0);
        const end = (accumulated / total) * 360;
        return `${part.color} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${slices.join(', ')})`;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function formatDate(value) {
    return new Date(value).toLocaleDateString('pt-BR');
}

function formatTime(value) {
    return new Date(value).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCpf(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits || '--';
}

function getInitials(name) {
    return String(name || '')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'AC';
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
