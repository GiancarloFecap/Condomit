const releaseState = {
    currentUser: null,
    visitors: [],
    filters: {
        tab: 'pending',
        search: '',
        block: 'all',
        period: 'all'
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadPorterUser();
    if (!currentUser) return;

    releaseState.currentUser = currentUser;
    initReleasePageShell(currentUser);
    bindReleasePageControls();
    await loadVisitorsForRelease();
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

function initReleasePageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    const historyButton = document.getElementById('accessHistoryBtn');

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    historyButton?.addEventListener('click', () => {
        window.location.href = 'registro-entrada-saida.html';
    });
}

function bindReleasePageControls() {
    const releaseSearchInput = document.getElementById('releaseSearchInput');
    const releaseBlockFilter = document.getElementById('releaseBlockFilter');
    const releasePeriodFilter = document.getElementById('releasePeriodFilter');
    const clearReleaseFiltersBtn = document.getElementById('clearReleaseFiltersBtn');

    releaseSearchInput?.addEventListener('input', (event) => {
        releaseState.filters.search = event.target.value.trim().toLowerCase();
        renderReleasePage();
    });

    releaseBlockFilter?.addEventListener('change', (event) => {
        releaseState.filters.block = event.target.value;
        renderReleasePage();
    });

    releasePeriodFilter?.addEventListener('change', (event) => {
        releaseState.filters.period = event.target.value;
        renderReleasePage();
    });

    clearReleaseFiltersBtn?.addEventListener('click', () => {
        releaseState.filters.search = '';
        releaseState.filters.block = 'all';
        releaseState.filters.period = 'all';
        if (releaseSearchInput) releaseSearchInput.value = '';
        if (releaseBlockFilter) releaseBlockFilter.value = 'all';
        if (releasePeriodFilter) releasePeriodFilter.value = 'all';
        renderReleasePage();
    });

    document.getElementById('releaseTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        releaseState.filters.tab = button.dataset.tab || 'pending';
        renderReleasePage();
    });
}

async function loadVisitorsForRelease() {
    const visitors = typeof window.getVisitorsForCondominium === 'function'
        ? await window.getVisitorsForCondominium(releaseState.currentUser)
        : [];

    releaseState.visitors = Array.isArray(visitors) ? visitors : [];
    hydrateInitialTabFromUrl();
    populateReleaseBlockOptions();
    renderReleasePage();
}

function hydrateInitialTabFromUrl() {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'liberados' || tabParam === 'approved') {
        releaseState.filters.tab = 'approved';
    } else if (tabParam === 'recusados' || tabParam === 'rejected') {
        releaseState.filters.tab = 'rejected';
    }
}

function getCondominiumKey(user = releaseState.currentUser) {
    const identifiers = typeof window.getUserCondominiumIdentifiers === 'function'
        ? window.getUserCondominiumIdentifiers(user)
        : [];
    return identifiers[0] || 'geral';
}

function getReleaseStorageKey(user = releaseState.currentUser) {
    return `condomit.release-status.${getCondominiumKey(user)}`;
}

function getAccessLogStorageKey(user = releaseState.currentUser) {
    return `condomit.access-log.${getCondominiumKey(user)}`;
}

function getStoredReleaseStatuses(user = releaseState.currentUser) {
    try {
        return JSON.parse(localStorage.getItem(getReleaseStorageKey(user)) || '{}');
    } catch (_) {
        return {};
    }
}

function saveStoredReleaseStatuses(statuses, user = releaseState.currentUser) {
    localStorage.setItem(getReleaseStorageKey(user), JSON.stringify(statuses));
}

function pushAccessLog(entry, user = releaseState.currentUser) {
    try {
        const currentLogs = JSON.parse(localStorage.getItem(getAccessLogStorageKey(user)) || '[]');
        currentLogs.unshift(entry);
        localStorage.setItem(getAccessLogStorageKey(user), JSON.stringify(currentLogs.slice(0, 200)));
    } catch (_) {
        // Ignore storage failures silently for this local dashboard cache
    }
}

function populateReleaseBlockOptions() {
    const releaseBlockFilter = document.getElementById('releaseBlockFilter');
    if (!releaseBlockFilter) return;

    const blocks = [...new Set(
        releaseState.visitors
            .map((visitor) => String(visitor?.responsible?.condominium?.block || '').trim())
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right, 'pt-BR'))
    )];

    releaseBlockFilter.innerHTML = `
        <option value="all">Todos os blocos</option>
        ${blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('')}
    `;
}

function renderReleasePage() {
    const statuses = getStoredReleaseStatuses();
    const visitors = [...releaseState.visitors];
    const pending = visitors.filter((visitor) => getVisitorStatus(visitor, statuses) === 'pending');
    const approved = visitors.filter((visitor) => getVisitorStatus(visitor, statuses) === 'approved');
    const rejected = visitors.filter((visitor) => getVisitorStatus(visitor, statuses) === 'rejected');

    updateReleaseMetrics({ pending, approved, rejected, statuses });
    updateReleaseTabs({ pending, approved, rejected });
    renderReleaseList(applyReleaseFilters(visitors, statuses));
}

function getVisitorStatus(visitor, statuses = getStoredReleaseStatuses()) {
    const visitorCpf = String(visitor?.cpf || '').replace(/\D/g, '');
    return statuses?.[visitorCpf]?.status || 'pending';
}

function applyReleaseFilters(visitors, statuses) {
    const now = Date.now();
    return visitors.filter((visitor) => {
        const status = getVisitorStatus(visitor, statuses);
        const block = String(visitor?.responsible?.condominium?.block || '').trim();
        const createdAt = new Date(visitor?.created_at || Date.now()).getTime();
        const searchBase = [
            visitor?.full_name,
            formatCpf(visitor?.cpf),
            visitor?.responsible?.name,
            visitor?.responsible?.condominium?.apartment,
            visitor?.responsible?.condominium?.block
        ].join(' ').toLowerCase();

        const matchesTab = releaseState.filters.tab === 'pending'
            ? status === 'pending'
            : releaseState.filters.tab === 'approved'
                ? status === 'approved'
                : status === 'rejected';

        const matchesSearch = !releaseState.filters.search || searchBase.includes(releaseState.filters.search);
        const matchesBlock = releaseState.filters.block === 'all' || block === releaseState.filters.block;
        const matchesPeriod = releaseState.filters.period === 'all'
            ? true
            : releaseState.filters.period === 'today'
                ? isSameDay(createdAt, now)
                : releaseState.filters.period === '7d'
                    ? createdAt >= now - (7 * 24 * 60 * 60 * 1000)
                    : createdAt >= now - (30 * 24 * 60 * 60 * 1000);

        return matchesTab && matchesSearch && matchesBlock && matchesPeriod;
    });
}

function updateReleaseMetrics({ pending, approved, rejected, statuses }) {
    const todayPending = pending.filter((visitor) => isToday(visitor?.created_at)).length;
    const todayApproved = approved.filter((visitor) => isToday(statuses[String(visitor?.cpf || '').replace(/\D/g, '')]?.updatedAt)).length;
    const todayRejected = rejected.filter((visitor) => isToday(statuses[String(visitor?.cpf || '').replace(/\D/g, '')]?.updatedAt)).length;
    const todayTotal = todayPending + todayApproved + todayRejected;

    setText('pendingVisitorsCount', pending.length);
    setText('approvedVisitorsCount', todayApproved);
    setText('rejectedVisitorsCount', todayRejected);
    setText('todayVisitorsTotal', todayTotal);
    setText('legendApprovedCount', approved.length);
    setText('legendPendingCount', pending.length);
    setText('legendRejectedCount', rejected.length);

    const chart = document.getElementById('releaseDonutChart');
    if (chart) {
        chart.style.background = buildDonutGradient([
            { value: approved.length, color: '#0ea5a4' },
            { value: pending.length, color: '#f59e0b' },
            { value: rejected.length, color: '#ef4444' }
        ]);
    }
}

function updateReleaseTabs({ pending, approved, rejected }) {
    document.querySelectorAll('#releaseTabs .status-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === releaseState.filters.tab);
    });

    setText('tabPendingCount', pending.length);
    setText('tabApprovedCount', approved.length);
    setText('tabRejectedCount', rejected.length);
}

function renderReleaseList(visitors) {
    const list = document.getElementById('visitorReleaseList');
    if (!list) return;

    if (!visitors.length) {
        list.innerHTML = `
            <div class="empty-state">
                <strong>Nenhum visitante encontrado</strong>
                <p>Os visitantes cadastrados para o mesmo condomínio do porteiro aparecerão aqui.</p>
            </div>
        `;
        return;
    }

    const statuses = getStoredReleaseStatuses();
    list.innerHTML = visitors.map((visitor) => {
        const visitorCpf = String(visitor?.cpf || '').replace(/\D/g, '');
        const status = getVisitorStatus(visitor, statuses);
        const statusLabel = status === 'approved' ? 'Liberado' : status === 'rejected' ? 'Recusado' : 'Aguardando';
        const statusClass = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
        const createdAt = new Date(visitor?.created_at || Date.now());
        const apartment = visitor?.responsible?.condominium?.apartment || '--';
        const block = visitor?.responsible?.condominium?.block || '--';

        return `
            <article class="request-card">
                <div class="request-time">
                    <strong>${createdAt.toLocaleDateString('pt-BR', { day: '2-digit' })}</strong>
                    <span>${createdAt.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase()}</span>
                    <span>${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="request-main">
                    <div class="request-avatar">${getInitials(visitor?.full_name)}</div>
                    <div class="request-meta">
                        <strong>${escapeHtml(visitor?.full_name || 'Visitante')}</strong>
                        <small>CPF: ${escapeHtml(formatCpf(visitor?.cpf))}</small>
                        <div class="badge-row">
                            <span class="pill info">Visita</span>
                            <span class="pill ${statusClass}">${statusLabel}</span>
                        </div>
                        <small>Responsável: ${escapeHtml(visitor?.responsible?.name || '--')}</small>
                        <small>Apto ${escapeHtml(String(apartment))} - Bloco ${escapeHtml(String(block))}</small>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="primary-outline" type="button" data-action="approve" data-cpf="${visitorCpf}">
                        <i class="fas fa-circle-check"></i>
                        <span>Liberar</span>
                    </button>
                    <button class="danger-outline" type="button" data-action="reject" data-cpf="${visitorCpf}">
                        <i class="fas fa-circle-xmark"></i>
                        <span>Recusar</span>
                    </button>
                    <button class="icon-more" type="button" title="Mais informações">
                        <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('');

    list.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', () => {
            updateVisitorReleaseStatus(button.dataset.cpf, button.dataset.action === 'approve' ? 'approved' : 'rejected');
        });
    });
}

function updateVisitorReleaseStatus(visitorCpf, nextStatus) {
    const statuses = getStoredReleaseStatuses();
    const normalizedCpf = String(visitorCpf || '').replace(/\D/g, '');
    const currentStatus = statuses?.[normalizedCpf]?.status || 'pending';
    if (!normalizedCpf || currentStatus === nextStatus) return;

    statuses[normalizedCpf] = {
        status: nextStatus,
        updatedAt: new Date().toISOString()
    };
    saveStoredReleaseStatuses(statuses);

    const visitor = releaseState.visitors.find((item) => String(item?.cpf || '').replace(/\D/g, '') === normalizedCpf);
    if (visitor) {
        pushAccessLog({
            id: `${normalizedCpf}-${Date.now()}`,
            createdAt: new Date().toISOString(),
            movementType: nextStatus === 'approved' ? 'entry' : 'exit',
            status: nextStatus,
            fullName: visitor.full_name,
            cpf: normalizedCpf,
            apartment: visitor?.responsible?.condominium?.apartment || '',
            block: visitor?.responsible?.condominium?.block || '',
            responsibleName: visitor?.responsible?.name || '',
            source: 'liberacao'
        });
    }

    renderReleasePage();
}

function buildDonutGradient(parts) {
    const total = parts.reduce((sum, part) => sum + Math.max(0, Number(part.value) || 0), 0);
    if (!total) {
        return 'conic-gradient(#e2e8f0 0deg 360deg)';
    }

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

function isSameDay(left, right) {
    const leftDate = new Date(left);
    const rightDate = new Date(right);
    return leftDate.getFullYear() === rightDate.getFullYear()
        && leftDate.getMonth() === rightDate.getMonth()
        && leftDate.getDate() === rightDate.getDate();
}

function isToday(value) {
    if (!value) return false;
    return isSameDay(value, Date.now());
}

function formatCpf(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits;
}

function getInitials(name) {
    return String(name || '')
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'VT';
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
