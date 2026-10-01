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

    // Atualiza o histórico quando outra aba/dispositivo libera ou revoga um acesso.
    window.setInterval(() => {
        if (!document.hidden) loadAccessMovements();
    }, 10000);
});

async function loadPorterUser() {
    let currentUser = null;
    try {
        currentUser = typeof refreshCurrentUserFromDb === 'function'
            ? await refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
    } catch (_) {
        currentUser = null;
    }

    if (!currentUser) {
        window.location.href = 'entrar.html';
        return null;
    }

    const userType = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(currentUser)
        : String(currentUser.user_type || currentUser.type || '').trim().toLowerCase();

    if (userType !== 'porteiro') {
        if (typeof redirectToHome === 'function') redirectToHome();
        else window.location.href = 'index.html';
        return null;
    }

    return currentUser;
}

function initAccessPageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    const accessDateFilter = document.getElementById('accessDateFilter');

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = String(currentUser.condominium.name).split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
            : escapeHtml(currentUser.condominium.name);
    }

    if (accessDateFilter) {
        accessDateFilter.value = new Date().toISOString().slice(0, 10);
        accessLogState.filters.date = accessDateFilter.value;
    }

    document.getElementById('accessLogExportBtn')?.addEventListener('click', loadAccessMovements);

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }
}

function bindAccessPageControls() {
    const searchInput = document.getElementById('accessSearchInput');
    const typeFilter = document.getElementById('accessTypeFilter');
    const blockFilter = document.getElementById('accessBlockFilter');
    const dateFilter = document.getElementById('accessDateFilter');
    const clearButton = document.getElementById('clearAccessFiltersBtn');

    searchInput?.addEventListener('input', (event) => {
        accessLogState.filters.search = event.target.value.trim().toLowerCase();
        renderAccessPage();
    });
    typeFilter?.addEventListener('change', (event) => {
        accessLogState.filters.type = event.target.value;
        syncQuickFilterState(event.target.value);
        renderAccessPage();
    });
    blockFilter?.addEventListener('change', (event) => {
        accessLogState.filters.block = event.target.value;
        renderAccessPage();
    });
    dateFilter?.addEventListener('change', (event) => {
        accessLogState.filters.date = event.target.value;
        renderAccessPage();
    });

    clearButton?.addEventListener('click', () => {
        accessLogState.filters = { search: '', type: 'all', block: 'all', date: '' };
        if (searchInput) searchInput.value = '';
        if (typeFilter) typeFilter.value = 'all';
        if (blockFilter) blockFilter.value = 'all';
        if (dateFilter) dateFilter.value = '';
        syncQuickFilterState('all');
        renderAccessPage();
    });

    document.querySelectorAll('[data-quick-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            const nextType = button.dataset.quickFilter || 'all';
            accessLogState.filters.type = nextType;
            if (typeFilter) typeFilter.value = nextType;
            syncQuickFilterState(nextType);
            renderAccessPage();
        });
    });
}

async function loadAccessMovements() {
    let dbLogs = [];

    if (typeof window.getVisitorAccessLogsForCondominium === 'function') {
        try {
            dbLogs = await window.getVisitorAccessLogsForCondominium();
        } catch (error) {
            console.warn('Histórico compartilhado ainda não disponível:', error?.message || error);
        }
    }

    let movements = buildMovementsFromDatabaseLogs(dbLogs);

    /*
     * Compatibilidade com registros criados antes da migration 010.
     * Eles continuam visíveis, mas toda nova liberação/revogação passa a ser
     * persistida no banco e compartilhada entre dispositivos.
     */
    const legacyGatehouse = getStoredAccessLogs(accessLogState.currentUser);

    /*
     * Cadastro não é entrada. O Registro de entrada e saída passa a mostrar
     * somente mudanças reais de liberação/revogação/recusa do banco, mais
     * o histórico legado já existente.
     */
    movements = [
        ...movements,
        ...buildMovementsFromLegacyGatehouseLogs(legacyGatehouse)
    ];

    const seen = new Set();
    accessLogState.movements = movements
        .filter((movement) => {
            const key = `${movement.id || ''}|${movement.createdAt}|${normalizeCpf(movement.cpf)}|${movement.originLabel}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    populateAccessBlockOptions();
    renderAccessPage();
}

function buildMovementsFromDatabaseLogs(logs) {
    return (Array.isArray(logs) ? logs : []).map((log) => {
        const action = String(log?.action || '').toLowerCase();
        const movementType = log?.movement_type === 'exit' ? 'exit' : 'entry';
        const originLabel = action === 'revogacao'
            ? 'Entrada revogada'
            : action === 'recusa'
                ? 'Entrada recusada'
                : 'Entrada liberada';
        const statusBadge = action === 'revogacao'
            ? 'Revogado'
            : action === 'recusa'
                ? 'Recusado'
                : 'Liberado';

        return {
            id: `db-${log?.id || `${log?.visitor_cpf}-${log?.created_at}`}`,
            createdAt: log?.created_at || new Date().toISOString(),
            movementType,
            fullName: log?.visitor_name || 'Visitante',
            cpf: log?.visitor_cpf || '',
            apartment: log?.apartment || '',
            block: log?.block || '',
            responsibleName: log?.responsible_name || '',
            originLabel,
            badges: ['Visitante', statusBadge]
        };
    });
}

function getCondominiumKey(user = accessLogState.currentUser) {
    const identifiers = typeof window.getUserCondominiumIdentifiers === 'function'
        ? window.getUserCondominiumIdentifiers(user)
        : [];
    return identifiers[0] || 'geral';
}

function getStoredAccessLogs(user = accessLogState.currentUser) {
    try {
        return JSON.parse(localStorage.getItem(`condomit.access-log.${getCondominiumKey(user)}`) || '[]');
    } catch (_) {
        return [];
    }
}

function buildMovementsFromLegacyGatehouseLogs(logs) {
    return (Array.isArray(logs) ? logs : []).map((log, index) => {
        const movementType = log?.movementType === 'exit' ? 'exit' : 'entry';
        return {
            id: `legacy-${index}-${log?.createdAt || ''}`,
            createdAt: log?.createdAt || new Date().toISOString(),
            movementType,
            fullName: log?.fullName || 'Visitante',
            cpf: log?.cpf || '',
            apartment: log?.apartment || '',
            block: log?.block || '',
            responsibleName: log?.responsibleName || '',
            originLabel: movementType === 'entry' ? 'Liberação antiga' : 'Alteração antiga',
            badges: ['Visitante', movementType === 'entry' ? 'Liberado' : 'Recusado']
        };
    });
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
        originLabel: 'Cadastro local',
        badges: ['Visitante']
    }));
}

function populateAccessBlockOptions() {
    const blockFilter = document.getElementById('accessBlockFilter');
    if (!blockFilter) return;

    const blocks = [...new Set(
        accessLogState.movements
            .map((movement) => String(movement.block || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    )];

    const selected = accessLogState.filters.block;
    blockFilter.innerHTML = `
        <option value="all">Todos os blocos</option>
        ${blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('')}
    `;
    if (blocks.includes(selected)) blockFilter.value = selected;
}

function renderAccessPage() {
    const filtered = applyAccessFilters(accessLogState.movements);
    updateAccessMetrics(accessLogState.movements);
    renderAccessTable(filtered);
}

function applyAccessFilters(movements) {
    return movements.filter((movement) => {
        const searchBase = [
            movement.fullName,
            formatCpf(movement.cpf),
            movement.responsibleName,
            movement.apartment,
            movement.block,
            movement.originLabel
        ].join(' ').toLowerCase();

        const matchesSearch = !accessLogState.filters.search || searchBase.includes(accessLogState.filters.search);
        const matchesType = accessLogState.filters.type === 'all' || movement.movementType === accessLogState.filters.type;
        const matchesBlock = accessLogState.filters.block === 'all' || String(movement.block || '') === accessLogState.filters.block;
        const matchesDate = !accessLogState.filters.date || buildDateKey(movement.createdAt) === accessLogState.filters.date;

        return matchesSearch && matchesType && matchesBlock && matchesDate;
    });
}

function updateAccessMetrics(movements) {
    const todayKey = buildDateKey(new Date());
    const today = movements.filter((movement) => buildDateKey(movement.createdAt) === todayKey);
    const entries = today.filter((movement) => movement.movementType === 'entry');
    const exits = today.filter((movement) => movement.movementType === 'exit');
    const uniqueVisitors = new Set(today.map((movement) => normalizeCpf(movement.cpf) || movement.fullName)).size;

    setText('entriesTodayCount', entries.length);
    setText('exitsTodayCount', exits.length);
    setText('movementsTodayCount', today.length);
    setText('peakHourLabel', getPeakHourLabel(today));
    setText('legendEntriesCount', entries.length);
    setText('legendExitsCount', exits.length);
    setText('legendVisitorsCount', uniqueVisitors);

    const chart = document.getElementById('accessDonutChart');
    if (chart) {
        chart.style.background = buildDonutGradient([
            { value: entries.length, color: '#0ea5a4' },
            { value: exits.length, color: '#f59e0b' },
            { value: uniqueVisitors, color: '#6366f1' }
        ]);
    }
}

function renderAccessTable(movements) {
    const tableBody = document.getElementById('accessLogTableBody');
    const summary = document.getElementById('accessLogSummary');
    if (!tableBody || !summary) return;

    summary.textContent = `Mostrando ${movements.length} registro${movements.length === 1 ? '' : 's'}`;

    if (!movements.length) {
        tableBody.innerHTML = `
            <tr><td colspan="8"><div class="empty-state"><strong>Nenhum registro encontrado</strong><p>Liberações e revogações de visitantes do condomínio aparecerão aqui.</p></div></td></tr>
        `;
        return;
    }

    tableBody.innerHTML = movements.map((movement) => `
        <tr>
            <td><strong>${formatTime(movement.createdAt)}</strong><br><span class="legend-note">${formatDate(movement.createdAt)}</span></td>
            <td><span class="movement-chip ${movement.movementType}"><i class="fas ${movement.movementType === 'entry' ? 'fa-right-to-bracket' : 'fa-right-from-bracket'}"></i>${movement.movementType === 'entry' ? 'Entrada' : 'Saída'}</span></td>
            <td><div class="table-name"><strong>${escapeHtml(movement.fullName || 'Visitante')}</strong><span class="legend-note">${escapeHtml(movement.originLabel || '')}</span><div class="table-badges">${(movement.badges || []).map((badge) => `<span class="pill ${badge === 'Liberado' ? 'success' : ['Recusado', 'Revogado'].includes(badge) ? 'danger' : 'info'}">${escapeHtml(badge)}</span>`).join('')}</div></div></td>
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
    const counts = new Map();
    movements.forEach((movement) => {
        const date = new Date(movement.createdAt);
        if (Number.isNaN(date.getTime())) return;
        const hour = String(date.getHours()).padStart(2, '0');
        counts.set(hour, (counts.get(hour) || 0) + 1);
    });
    const [hour] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
    return hour ? `${hour}:00` : '--:--';
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
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildDonutGradient(parts) {
    const total = parts.reduce((sum, part) => sum + Math.max(0, Number(part.value) || 0), 0);
    if (!total) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    let accumulated = 0;
    return `conic-gradient(${parts.map((part) => {
        const start = (accumulated / total) * 360;
        accumulated += Math.max(0, Number(part.value) || 0);
        const end = (accumulated / total) * 360;
        return `${part.color} ${start}deg ${end}deg`;
    }).join(', ')})`;
}

function normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function formatCpf(value) {
    const digits = normalizeCpf(value);
    if (digits.length !== 11) return value || '--';
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('pt-BR');
}

function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'AC';
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function logout() {
    if (typeof window.performFullLogout === 'function') {
        window.performFullLogout();
        return;
    }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
