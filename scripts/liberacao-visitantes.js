const releaseState = {
    currentUser: null,
    visitors: [],
    currentModalVisitorRaw: null,
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

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }
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
                    <div class="request-avatar" style="cursor:pointer;" data-action="profile" data-cpf="${visitorCpf}" title="Ver perfil do visitante">${getInitials(visitor?.full_name)}</div>
                    <div class="request-meta">
                        <strong style="cursor:pointer;" data-action="profile" data-cpf="${visitorCpf}" title="Ver perfil do visitante">${escapeHtml(visitor?.full_name || 'Visitante')}</strong>
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
                    <button class="icon-more" type="button" title="Perfil do visitante" data-action="profile" data-cpf="${visitorCpf}">
                        <i class="fas fa-user"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('');

    list.querySelectorAll('[data-action="approve"], [data-action="reject"]').forEach((button) => {
        button.addEventListener('click', () => {
            updateVisitorReleaseStatus(button.dataset.cpf, button.dataset.action === 'approve' ? 'approved' : 'rejected');
        });
    });

    list.querySelectorAll('[data-action="profile"]').forEach((element) => {
        element.addEventListener('click', () => {
            const cpf = String(element.dataset.cpf || '').replace(/\D/g, '');
            const visitor = releaseState.visitors.find((v) => String(v?.cpf || '').replace(/\D/g, '') === cpf);
            if (visitor) openReleaseVisitorProfileModal(visitor);
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

function ensureReleaseModalCssInjected() {
    if (document.getElementById('releaseModalCss')) return;
    const style = document.createElement('style');
    style.id = 'releaseModalCss';
    style.textContent = `
.modal-box.release-visitor-modal { max-width: 820px; }
.release-modal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 28px; }
.release-modal-grid .info-col.full { grid-column: 1 / -1; border-top: 1px solid #e5e7eb; padding-top: 18px; }
.info-col { display: flex; flex-direction: column; gap: 10px; }
.info-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #374151; margin: 0 0 6px 0; padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; }
.info-title i { color: #1e40af; font-size: 13px; }
.info-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; font-size: 13.5px; }
.info-row > span:first-child { color: #6b7280; font-weight: 400; flex-shrink: 0; }
.info-row > strong { color: #111827; font-weight: 500; text-align: right; word-break: break-word; }
.info-row .status-badge { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.status-badge.release-approved { background: rgba(14, 165, 164, 0.12); color: #0f766e; }
.status-badge.release-rejected { background: rgba(239, 68, 68, 0.12); color: #b91c1c; }
.status-badge.release-pending { background: rgba(245, 158, 11, 0.12); color: #b45309; }
html[data-theme="dark"] .release-modal-grid .info-col.full { border-top-color: #2d3b50; }
html[data-theme="dark"] .info-title { color: #e2e8f0; border-bottom-color: #1e293b; }
html[data-theme="dark"] .info-title i { color: #60a5fa; }
html[data-theme="dark"] .info-row > span:first-child { color: #94a3b8; }
html[data-theme="dark"] .info-row > strong { color: #f8fafc; }
@media (max-width: 760px) {
.release-modal-grid { grid-template-columns: 1fr; }
.release-modal-grid .info-col.full { border-top: none; padding-top: 0; }
.info-col + .info-col:not(.full) { border-top: 1px solid #e5e7eb; padding-top: 16px; }
html[data-theme="dark"] .info-col + .info-col:not(.full) { border-top-color: #2d3b50; }
}
`;
    document.head.appendChild(style);
}

function formatReleasePhone(value) {
    const d = String(value || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return value || '--';
}

function formatReleaseDatePt(value) {
    if (!value) return '--';
    const d = new Date(value);
    if (isNaN(d.getTime())) {
        const parts = String(value).split(/[-/ T]/).filter(Boolean);
        if (parts.length >= 3 && parts[0].length === 4) return `${parts[2].slice(0, 2)}/${parts[1]}/${parts[0]}`;
        return String(value).slice(0, 10);
    }
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatReleaseDateTimeRange(visitorRaw) {
    const dateValue = visitorRaw?.visit_date || visitorRaw?.date || visitorRaw?.created_at || visitorRaw?.scheduled_at || '';
    const startTime = visitorRaw?.start_time || visitorRaw?.visit_time || visitorRaw?.time_from || (visitorRaw?.schedule && visitorRaw.schedule.start_time) || '';
    const endTime = visitorRaw?.end_time || visitorRaw?.time_until || (visitorRaw?.schedule && visitorRaw.schedule.end_time) || '';
    const dateLabel = formatReleaseDatePt(dateValue);
    let timeLabel = '--:--';
    if (startTime && endTime) timeLabel = `${String(startTime).slice(0, 5)} - ${String(endTime).slice(0, 5)}`;
    else if (startTime) timeLabel = `${String(startTime).slice(0, 5)}`;
    else if (dateValue) {
        const d = new Date(dateValue);
        if (!isNaN(d.getTime())) timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return { dateLabel, timeLabel };
}

function getReleaseStatusBadge(visitorRaw) {
    const statuses = getStoredReleaseStatuses();
    const cpf = String(visitorRaw?.cpf || '').replace(/\D/g, '');
    const status = statuses?.[cpf]?.status || 'pending';
    if (status === 'approved') return '<span class="status-badge release-approved">Liberado</span>';
    if (status === 'rejected') return '<span class="status-badge release-rejected">Recusado</span>';
    return '<span class="status-badge release-pending">Aguardando</span>';
}

function ensureReleaseModalStructure() {
    ensureReleaseModalCssInjected();
    if (document.getElementById('releaseVisitorModalBackdrop')) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'releaseVisitorModalBackdrop';
    backdrop.innerHTML = `
<div class="modal-box release-visitor-modal" role="dialog" aria-modal="true" aria-labelledby="releaseVisitorTitle">
  <div class="modal-header">
    <div class="modal-icon modal-icon-info" id="releaseVisitorIcon"><i class="fas fa-user"></i></div>
    <div class="modal-title-wrap">
      <h3 class="modal-title" id="releaseVisitorTitle">Perfil do visitante</h3>
      <p class="modal-sub" style="color:#64748B; margin:4px 0 0; font-size:13px;">Detalhes completos do acesso</p>
    </div>
    <button class="modal-close" type="button" id="releaseVisitorClose" aria-label="Fechar" style="background:none; border:none; cursor:pointer; font-size:18px; color:#64748B;">
      <i class="fas fa-times"></i>
    </button>
  </div>
  <div class="modal-body" id="releaseVisitorBody"></div>
  <div class="modal-footer">
    <button type="button" class="modal-btn modal-btn-secondary" id="releaseVisitorCancel">
      <i class="fas fa-times"></i> Fechar
    </button>
    <button type="button" class="modal-btn modal-btn-primary" id="releaseVisitorLiberar" style="background: linear-gradient(135deg, #10b981 0%, #0f766e 100%);">
      <i class="fas fa-check-circle"></i> Liberar visitante
    </button>
  </div>
</div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeReleaseVisitorProfileModal(); });
    document.getElementById('releaseVisitorClose').addEventListener('click', closeReleaseVisitorProfileModal);
    document.getElementById('releaseVisitorCancel').addEventListener('click', closeReleaseVisitorProfileModal);
    document.getElementById('releaseVisitorLiberar').addEventListener('click', liberarFromReleaseModal);
}

function openReleaseVisitorProfileModal(visitorRaw) {
    ensureReleaseModalStructure();
    releaseState.currentModalVisitorRaw = visitorRaw;
    const responsible = visitorRaw?.responsible || {};
    const respCondo = responsible?.condominium || {};
    const { dateLabel, timeLabel } = formatReleaseDateTimeRange(visitorRaw);
    const body = document.getElementById('releaseVisitorBody');
    const iconDiv = document.getElementById('releaseVisitorIcon');
    const avatarColors = ['#1e40af','#86198f','#0f766e','#9d174d','#92400e','#155e75','#4c1d95','#065f46','#b45309','#1d4ed8','#0369a1'];
    const seed = String(visitorRaw?.cpf || visitorRaw?.full_name || '').toLowerCase().replace(/\s+/g, '');
    let sum = 0; for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
    const avatarColor = avatarColors[sum % avatarColors.length];
    iconDiv.style.background = avatarColor;
    iconDiv.innerHTML = `<span style="font-size:18px; font-weight:700;">${getInitials(visitorRaw?.full_name)}</span>`;
    const apartment = respCondo?.apartment || respCondo?.unit || respCondo?.apartamento || '--';
    const block = respCondo?.block || respCondo?.bloco || '--';
    const respUnidade = (block !== '--' ? (String(block).startsWith('Bloco') ? block : `Bloco ${block}`) : '') +
        (apartment !== '--' ? ` / Apto ${String(apartment).replace(/^Apto\s*/i, '')}` : '') || 'Unidade --';
    const reason = visitorRaw?.reason || visitorRaw?.purpose || visitorRaw?.visit_reason || visitorRaw?.motivo || 'Visita';
    const condoName = respCondo?.name || respCondo?.condominium_name || visitorRaw?.condominium?.name || '--';
    body.innerHTML = `
<div class="release-modal-grid">
  <div class="info-col">
    <h4 class="info-title"><i class="fas fa-user-circle"></i> Visitante</h4>
    <div class="info-row"><span>Nome completo</span><strong>${escapeHtml(visitorRaw?.full_name || visitorRaw?.nome || visitorRaw?.name || '--')}</strong></div>
    <div class="info-row"><span>CPF</span><strong>${formatCpf(visitorRaw?.cpf) || '--'}</strong></div>
    <div class="info-row"><span>RG</span><strong>${escapeHtml(visitorRaw?.rg || '--')}</strong></div>
    <div class="info-row"><span>Telefone</span><strong>${formatReleasePhone(visitorRaw?.phone || visitorRaw?.telefone)}</strong></div>
    <div class="info-row"><span>E-mail</span><strong>${escapeHtml(visitorRaw?.email || '--')}</strong></div>
  </div>
  <div class="info-col">
    <h4 class="info-title"><i class="fas fa-home"></i> Responsável</h4>
    <div class="info-row"><span>Nome</span><strong>${escapeHtml(responsible?.name || responsible?.full_name || responsible?.nome || visitorRaw?.responsible_name || '--')}</strong></div>
    <div class="info-row"><span>CPF</span><strong>${formatCpf(responsible?.cpf || visitorRaw?.responsible_cpf) || '--'}</strong></div>
    <div class="info-row"><span>Telefone</span><strong>${formatReleasePhone(responsible?.phone || responsible?.telefone)}</strong></div>
    <div class="info-row"><span>E-mail</span><strong>${escapeHtml(responsible?.email || '--')}</strong></div>
    <div class="info-row"><span>Unidade</span><strong>${escapeHtml(respUnidade)}</strong></div>
  </div>
  <div class="info-col full">
    <h4 class="info-title"><i class="fas fa-calendar-check"></i> Visita</h4>
    <div class="info-row"><span>Data</span><strong>${dateLabel}</strong></div>
    <div class="info-row"><span>Horário</span><strong>${timeLabel}</strong></div>
    <div class="info-row"><span>Motivo</span><strong>${escapeHtml(reason)}</strong></div>
    <div class="info-row"><span>Condomínio</span><strong>${escapeHtml(condoName)}</strong></div>
    <div class="info-row"><span>Status</span><strong>${getReleaseStatusBadge(visitorRaw)}</strong></div>
  </div>
</div>`;
    document.getElementById('releaseVisitorModalBackdrop').classList.add('open');
}

function closeReleaseVisitorProfileModal() {
    const backdrop = document.getElementById('releaseVisitorModalBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    releaseState.currentModalVisitorRaw = null;
}

function liberarFromReleaseModal() {
    const v = releaseState.currentModalVisitorRaw;
    if (!v) return;
    const cpf = String(v?.cpf || '').replace(/\D/g, '');
    const btn = document.getElementById('releaseVisitorLiberar');
    btn.disabled = true;
    try {
        updateVisitorReleaseStatus(cpf, 'approved');
        if (typeof window.showToast === 'function') {
            window.showToast('Visitante liberado com sucesso!', 'success');
        }
        closeReleaseVisitorProfileModal();
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeReleaseVisitorProfileModal();
});

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
