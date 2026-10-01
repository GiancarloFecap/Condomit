const releaseState = {
    currentUser: null,
    visitors: [],
    currentModalVisitorRaw: null,
    busyCpf: '',
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

    // Mantém a portaria sincronizada com cadastros feitos em outros dispositivos.
    window.setInterval(() => {
        if (!document.hidden && !releaseState.busyCpf) loadVisitorsForRelease();
    }, 15000);
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
        : String(currentUser.type || currentUser.user_type || '').trim().toLowerCase();

    if (userType !== 'porteiro') {
        if (typeof redirectToHome === 'function') redirectToHome();
        else window.location.href = 'index.html';
        return null;
    }

    return currentUser;
}

function initReleasePageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = String(currentUser.condominium.name).split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
            : escapeHtml(currentUser.condominium.name);
    }

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }
}

function bindReleasePageControls() {
    const searchInput = document.getElementById('releaseSearchInput');
    const blockFilter = document.getElementById('releaseBlockFilter');
    const periodFilter = document.getElementById('releasePeriodFilter');
    const clearButton = document.getElementById('clearReleaseFiltersBtn');

    searchInput?.addEventListener('input', (event) => {
        releaseState.filters.search = event.target.value.trim().toLowerCase();
        renderReleasePage();
    });

    blockFilter?.addEventListener('change', (event) => {
        releaseState.filters.block = event.target.value;
        renderReleasePage();
    });

    periodFilter?.addEventListener('change', (event) => {
        releaseState.filters.period = event.target.value;
        renderReleasePage();
    });

    clearButton?.addEventListener('click', () => {
        releaseState.filters.search = '';
        releaseState.filters.block = 'all';
        releaseState.filters.period = 'all';
        if (searchInput) searchInput.value = '';
        if (blockFilter) blockFilter.value = 'all';
        if (periodFilter) periodFilter.value = 'all';
        renderReleasePage();
    });

    document.getElementById('releaseTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        releaseState.filters.tab = button.dataset.tab || 'pending';
        renderReleasePage();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeReleaseVisitorProfileModal();
    });
}

async function loadVisitorsForRelease() {
    try {
        if (typeof window.getVisitorsForCondominium !== 'function') {
            throw new Error('Função de visitantes do condomínio indisponível.');
        }

        const visitors = await window.getVisitorsForCondominium(releaseState.currentUser);
        releaseState.visitors = Array.isArray(visitors) ? visitors : [];
    } catch (error) {
        console.error('Erro ao carregar visitantes para liberação:', error);
        releaseState.visitors = [];
        notifyRelease(error?.message || 'Não foi possível carregar os visitantes.', 'error');
    }

    hydrateInitialTabFromUrl();
    populateReleaseBlockOptions();
    renderReleasePage();
}

function hydrateInitialTabFromUrl() {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'liberados' || tabParam === 'approved') releaseState.filters.tab = 'approved';
    else if (tabParam === 'recusados' || tabParam === 'rejected') releaseState.filters.tab = 'rejected';
}

function normalizeReleaseStatus(visitorOrStatus) {
    const raw = typeof visitorOrStatus === 'object' && visitorOrStatus !== null
        ? visitorOrStatus.release_status ?? visitorOrStatus.liberacao_status ?? visitorOrStatus.access_status ?? visitorOrStatus.status
        : visitorOrStatus;
    const status = String(raw || 'aguardando').trim().toLowerCase();

    if (['liberado', 'approved', 'released', 'confirmed'].includes(status)) return 'approved';
    if (['recusado', 'rejected', 'denied', 'negado'].includes(status)) return 'rejected';
    return 'pending';
}

function getRawStatusLabel(visitor) {
    const raw = String(visitor?.release_status || '').trim().toLowerCase();
    if (raw === 'revogado') return 'Revogado';
    const normalized = normalizeReleaseStatus(visitor);
    if (normalized === 'approved') return 'Liberado';
    if (normalized === 'rejected') return 'Recusado';
    return 'Aguardando';
}

function populateReleaseBlockOptions() {
    const filter = document.getElementById('releaseBlockFilter');
    if (!filter) return;

    const blocks = [...new Set(
        releaseState.visitors
            .map((visitor) => getResponsibleCondo(visitor).block)
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    )];

    const previous = releaseState.filters.block;
    filter.innerHTML = `
        <option value="all">Todos os blocos</option>
        ${blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('')}
    `;

    if (blocks.includes(previous)) filter.value = previous;
    else {
        filter.value = 'all';
        releaseState.filters.block = 'all';
    }
}

function renderReleasePage() {
    const visitors = [...releaseState.visitors];
    const pending = visitors.filter((visitor) => normalizeReleaseStatus(visitor) === 'pending');
    const approved = visitors.filter((visitor) => normalizeReleaseStatus(visitor) === 'approved');
    const rejected = visitors.filter((visitor) => normalizeReleaseStatus(visitor) === 'rejected');

    updateReleaseMetrics({ pending, approved, rejected });
    updateReleaseTabs({ pending, approved, rejected });
    renderReleaseList(applyReleaseFilters(visitors));
}

function applyReleaseFilters(visitors) {
    const now = Date.now();

    return visitors.filter((visitor) => {
        const status = normalizeReleaseStatus(visitor);
        const responsible = visitor?.responsible || {};
        const condo = getResponsibleCondo(visitor);
        const block = String(condo.block || '').trim();
        const createdAt = new Date(visitor?.created_at || Date.now()).getTime();
        const searchBase = [
            visitor?.full_name,
            formatCpf(visitor?.cpf),
            responsible?.name,
            responsible?.email,
            condo.apartment,
            condo.block
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

function updateReleaseMetrics({ pending, approved, rejected }) {
    const todayApproved = approved.filter((visitor) => isToday(visitor?.release_status_updated_at || visitor?.created_at)).length;
    const todayRejected = rejected.filter((visitor) => isToday(visitor?.release_status_updated_at || visitor?.created_at)).length;
    const todayVisitors = releaseState.visitors.filter((visitor) =>
        isToday(visitor?.created_at) || isToday(visitor?.release_status_updated_at)
    ).length;

    setText('pendingVisitorsCount', pending.length);
    setText('approvedVisitorsCount', todayApproved);
    setText('rejectedVisitorsCount', todayRejected);
    setText('todayVisitorsTotal', todayVisitors);
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
                <p>Todo visitante cadastrado com o mesmo CEP do porteiro aparecerá aqui.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = visitors.map((visitor) => {
        const visitorCpf = normalizeCpf(visitor?.cpf);
        const status = normalizeReleaseStatus(visitor);
        const statusLabel = getRawStatusLabel(visitor);
        const statusClass = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
        const createdAt = safeDate(visitor?.created_at);
        const condo = getResponsibleCondo(visitor);
        const apartment = condo.apartment || '--';
        const block = condo.block || '--';
        const isBusy = releaseState.busyCpf === visitorCpf;

        const primaryAction = status === 'approved'
            ? `<button class="danger-outline" type="button" data-action="revoke" data-cpf="${visitorCpf}" ${isBusy ? 'disabled' : ''}>
                    <i class="fas fa-ban"></i><span>Revogar</span>
               </button>`
            : `<button class="primary-outline" type="button" data-action="approve" data-cpf="${visitorCpf}" ${isBusy ? 'disabled' : ''}>
                    <i class="fas fa-circle-check"></i><span>Liberar</span>
               </button>`;

        const rejectAction = status === 'pending'
            ? `<button class="danger-outline" type="button" data-action="reject" data-cpf="${visitorCpf}" ${isBusy ? 'disabled' : ''}>
                    <i class="fas fa-circle-xmark"></i><span>Recusar</span>
               </button>`
            : '';

        return `
            <article class="request-card" data-action="profile" data-cpf="${visitorCpf}" role="button" tabindex="0" aria-label="Ver informações de ${escapeHtml(visitor?.full_name || 'visitante')}" style="cursor:pointer;">
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
                            <span class="pill ${statusClass}">${escapeHtml(statusLabel)}</span>
                        </div>
                        <small>Responsável: ${escapeHtml(visitor?.responsible?.name || '--')}</small>
                        <small>Apto ${escapeHtml(String(apartment))} - Bloco ${escapeHtml(String(block))}</small>
                    </div>
                </div>
                <div class="request-actions">
                    ${primaryAction}
                    ${rejectAction}
                    <button class="icon-more" type="button" title="Ver informações" data-action="profile" data-cpf="${visitorCpf}">
                        <i class="fas fa-user"></i>
                    </button>
                </div>
            </article>
        `;
    }).join('');

    list.querySelectorAll('.request-card').forEach((card) => {
        card.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            openVisitorByCpf(card.dataset.cpf);
        });
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openVisitorByCpf(card.dataset.cpf);
            }
        });
    });

    list.querySelectorAll('button[data-action]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.stopPropagation();
            const action = button.dataset.action;
            const cpf = button.dataset.cpf;
            if (action === 'profile') return openVisitorByCpf(cpf);
            if (action === 'approve') return updateVisitorReleaseStatus(cpf, 'liberado');
            if (action === 'revoke') return updateVisitorReleaseStatus(cpf, 'revogado');
            if (action === 'reject') return updateVisitorReleaseStatus(cpf, 'recusado');
        });
    });
}

function openVisitorByCpf(cpf) {
    const normalized = normalizeCpf(cpf);
    const visitor = releaseState.visitors.find((item) => normalizeCpf(item?.cpf) === normalized);
    if (visitor) openReleaseVisitorProfileModal(visitor);
}

async function updateVisitorReleaseStatus(visitorCpf, nextStatus) {
    const normalizedCpf = normalizeCpf(visitorCpf);
    if (!normalizedCpf || releaseState.busyCpf) return;

    if (typeof window.setVisitorReleaseStatus !== 'function') {
        notifyRelease('Execute a migration 010 para habilitar a liberação persistente de visitantes.', 'error');
        return;
    }

    releaseState.busyCpf = normalizedCpf;
    renderReleasePage();

    try {
        await window.setVisitorReleaseStatus(normalizedCpf, nextStatus);
        await loadVisitorsForRelease();

        const message = nextStatus === 'liberado'
            ? 'Entrada liberada e registrada no histórico.'
            : nextStatus === 'revogado'
                ? 'Entrada revogada e registrada no histórico.'
                : 'Entrada recusada e registrada no histórico.';
        notifyRelease(message, 'success');
    } catch (error) {
        console.error('Erro ao atualizar liberação do visitante:', error);
        notifyRelease(error?.message || 'Não foi possível alterar a liberação.', 'error');
    } finally {
        releaseState.busyCpf = '';
        renderReleasePage();
    }
}

function ensureReleaseModalStructure() {
    if (document.getElementById('releaseVisitorModalBackdrop')) return;

    const style = document.createElement('style');
    style.id = 'releaseVisitorModalCss';
    style.textContent = `
        .modal-box.release-visitor-modal{max-width:820px}.release-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 28px}.release-modal-grid .info-col.full{grid-column:1/-1;border-top:1px solid #e5e7eb;padding-top:18px}.release-modal-grid .info-col{display:flex;flex-direction:column;gap:10px}.release-modal-grid .info-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#374151;margin:0 0 6px;padding-bottom:8px;border-bottom:1px solid #f3f4f6}.release-modal-grid .info-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:13.5px}.release-modal-grid .info-row>span:first-child{color:#6b7280}.release-modal-grid .info-row>strong{color:#111827;font-weight:500;text-align:right;word-break:break-word}.release-status{display:inline-flex;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:700}.release-status.approved{background:#ecfdf5;color:#047857}.release-status.pending{background:#fef3c7;color:#b45309}.release-status.rejected{background:#fee2e2;color:#b91c1c}html[data-theme="dark"] .release-modal-grid .info-title,html[data-theme="dark"] .release-modal-grid .info-row>strong{color:#f8fafc}html[data-theme="dark"] .release-modal-grid .info-row>span:first-child{color:#94a3b8}@media(max-width:760px){.release-modal-grid{grid-template-columns:1fr}.release-modal-grid .info-col.full{grid-column:auto}}
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'releaseVisitorModalBackdrop';
    backdrop.style.display = 'none';
    backdrop.innerHTML = `
        <div class="modal-box release-visitor-modal" role="dialog" aria-modal="true" aria-labelledby="releaseVisitorTitle">
            <div class="modal-header">
                <div class="modal-icon modal-icon-info" id="releaseVisitorIcon"><i class="fas fa-user"></i></div>
                <div class="modal-title-wrap">
                    <h3 class="modal-title" id="releaseVisitorTitle">Informações do visitante</h3>
                    <p style="color:#64748b;margin:4px 0 0;font-size:13px;">Dados salvos e situação da liberação</p>
                </div>
                <button class="modal-close" type="button" id="releaseVisitorClose" aria-label="Fechar" style="background:none;border:none;cursor:pointer;font-size:18px;color:#64748b;"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" id="releaseVisitorBody"></div>
            <div class="modal-footer">
                <button type="button" class="modal-btn modal-btn-secondary" id="releaseVisitorCancel"><i class="fas fa-times"></i> Fechar</button>
                <button type="button" class="modal-btn modal-btn-primary" id="releaseVisitorAction"></button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeReleaseVisitorProfileModal();
    });
    document.getElementById('releaseVisitorClose')?.addEventListener('click', closeReleaseVisitorProfileModal);
    document.getElementById('releaseVisitorCancel')?.addEventListener('click', closeReleaseVisitorProfileModal);
    document.getElementById('releaseVisitorAction')?.addEventListener('click', handleReleaseModalAction);
}

function openReleaseVisitorProfileModal(visitorRaw) {
    ensureReleaseModalStructure();
    releaseState.currentModalVisitorRaw = visitorRaw;

    const responsible = visitorRaw?.responsible || {};
    const condo = getResponsibleCondo(visitorRaw);
    const status = normalizeReleaseStatus(visitorRaw);
    const body = document.getElementById('releaseVisitorBody');
    const actionButton = document.getElementById('releaseVisitorAction');
    const { dateLabel, timeLabel } = formatReleaseDateTimeRange(visitorRaw);

    body.innerHTML = `
        <div class="release-modal-grid">
            <div class="info-col">
                <h4 class="info-title"><i class="fas fa-user-circle"></i> Visitante</h4>
                <div class="info-row"><span>Nome completo</span><strong>${escapeHtml(visitorRaw?.full_name || '--')}</strong></div>
                <div class="info-row"><span>CPF</span><strong>${escapeHtml(formatCpf(visitorRaw?.cpf) || '--')}</strong></div>
                <div class="info-row"><span>RG</span><strong>${escapeHtml(visitorRaw?.rg || '--')}</strong></div>
                <div class="info-row"><span>Telefone</span><strong>${escapeHtml(formatPhone(visitorRaw?.phone))}</strong></div>
                <div class="info-row"><span>E-mail</span><strong>${escapeHtml(visitorRaw?.email || '--')}</strong></div>
            </div>
            <div class="info-col">
                <h4 class="info-title"><i class="fas fa-house-user"></i> Responsável</h4>
                <div class="info-row"><span>Nome</span><strong>${escapeHtml(responsible?.name || '--')}</strong></div>
                <div class="info-row"><span>CPF</span><strong>${escapeHtml(formatCpf(responsible?.cpf || visitorRaw?.responsible_cpf) || '--')}</strong></div>
                <div class="info-row"><span>Telefone</span><strong>${escapeHtml(formatPhone(responsible?.phone))}</strong></div>
                <div class="info-row"><span>E-mail</span><strong>${escapeHtml(responsible?.email || '--')}</strong></div>
                <div class="info-row"><span>Apartamento</span><strong>${escapeHtml(String(condo.apartment || '--'))}</strong></div>
                <div class="info-row"><span>Bloco</span><strong>${escapeHtml(String(condo.block || '--'))}</strong></div>
            </div>
            <div class="info-col full">
                <h4 class="info-title"><i class="fas fa-calendar-check"></i> Acesso</h4>
                <div class="info-row"><span>Data do cadastro/visita</span><strong>${escapeHtml(dateLabel)}</strong></div>
                <div class="info-row"><span>Horário</span><strong>${escapeHtml(timeLabel)}</strong></div>
                <div class="info-row"><span>Condomínio/CEP</span><strong>${escapeHtml(String(visitorRaw?.cep || condo.cep || condo.condominium_id || '--'))}</strong></div>
                <div class="info-row"><span>Status</span><strong><span class="release-status ${status}">${escapeHtml(getRawStatusLabel(visitorRaw))}</span></strong></div>
            </div>
        </div>
    `;

    if (status === 'approved') {
        actionButton.dataset.nextStatus = 'revogado';
        actionButton.innerHTML = '<i class="fas fa-ban"></i> Revogar entrada';
        actionButton.style.background = 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)';
    } else {
        actionButton.dataset.nextStatus = 'liberado';
        actionButton.innerHTML = '<i class="fas fa-check-circle"></i> Liberar entrada';
        actionButton.style.background = 'linear-gradient(135deg,#10b981 0%,#0f766e 100%)';
    }

    document.getElementById('releaseVisitorModalBackdrop').style.display = 'flex';
}

function closeReleaseVisitorProfileModal() {
    const backdrop = document.getElementById('releaseVisitorModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    releaseState.currentModalVisitorRaw = null;
}

async function handleReleaseModalAction() {
    const visitor = releaseState.currentModalVisitorRaw;
    const button = document.getElementById('releaseVisitorAction');
    if (!visitor || !button) return;

    button.disabled = true;
    const nextStatus = button.dataset.nextStatus || 'liberado';
    const cpf = visitor.cpf;
    closeReleaseVisitorProfileModal();

    try {
        await updateVisitorReleaseStatus(cpf, nextStatus);
    } finally {
        button.disabled = false;
    }
}

function getResponsibleCondo(visitor) {
    const condo = visitor?.responsible?.condominium;
    if (condo && typeof condo === 'object') {
        return {
            ...condo,
            apartment: condo.apartment || condo.apartamento || condo.unit || '',
            block: condo.block || condo.bloco || ''
        };
    }
    return {};
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

function formatReleaseDateTimeRange(visitor) {
    const dateValue = visitor?.visit_date || visitor?.date || visitor?.created_at || visitor?.scheduled_at || '';
    const startTime = visitor?.start_time || visitor?.visit_time || visitor?.time_from || '';
    const endTime = visitor?.end_time || visitor?.time_until || '';
    const date = safeDate(dateValue);
    const dateLabel = dateValue ? date.toLocaleDateString('pt-BR') : '--';
    let timeLabel = '--:--';
    if (startTime && endTime) timeLabel = `${String(startTime).slice(0, 5)} - ${String(endTime).slice(0, 5)}`;
    else if (startTime) timeLabel = String(startTime).slice(0, 5);
    else if (dateValue) timeLabel = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { dateLabel, timeLabel };
}

function safeDate(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isSameDay(left, right) {
    const a = new Date(left);
    const b = new Date(right);
    return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())
        && a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function isToday(value) {
    return !!value && isSameDay(value, Date.now());
}

function normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function formatCpf(value) {
    const digits = normalizeCpf(value);
    if (digits.length !== 11) return digits;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return value || '--';
}

function getInitials(name) {
    return String(name || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'VT';
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function notifyRelease(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
}
