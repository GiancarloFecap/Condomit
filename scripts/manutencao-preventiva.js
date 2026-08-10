const maintenanceState = {
    currentUser: null,
    cep: '',
    items: [],
    search: '',
    category: 'todos',
    status: 'todos',
    selectedDate: '',
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    saving: false
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadMaintenanceUser();
    if (!currentUser) return;

    maintenanceState.currentUser = currentUser;
    setupMaintenanceShell(currentUser);
    setupMaintenanceActions();

    try {
        maintenanceState.cep = await resolveMaintenanceCep(currentUser);
        if (!maintenanceState.cep) {
            throw new Error('Não foi possível identificar o condomínio do usuário.');
        }
        await reloadMaintenanceItems();
    } catch (error) {
        console.error('[MANUTENÇÃO]', error);
        showMaintenanceToast(error.message || 'Não foi possível carregar as manutenções.', 'error');
        renderMaintenancePage();
    }
});

async function loadMaintenanceUser() {
    let user = null;
    try {
        user = typeof refreshCurrentUserFromDb === 'function'
            ? await refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
    } catch (_) {}

    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }
    return user;
}

async function resolveMaintenanceCep(user) {
    if (typeof window.resolveUserCondominiumCep === 'function') {
        const cep = await window.resolveUserCondominiumCep(user).catch(() => null);
        if (cep) return cep;
    }

    let condominium = user?.condominium || {};
    if (typeof condominium === 'string') {
        try { condominium = JSON.parse(condominium); } catch (_) { condominium = {}; }
    }

    const raw = condominium?.cep || condominium?.condominium_id || user?.cep || user?.condominium_id || '';
    const digits = String(raw).replace(/\D/g, '');
    return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : '';
}

function setupMaintenanceShell(currentUser) {
    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');

    if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Usuário';
    if (profileTypeTop) profileTypeTop.textContent = 'Síndico';
    if (profileAvatarTop) profileAvatarTop.textContent = getInitials(currentUser.name || 'Usuário');
    window.syncAllAvatars?.(currentUser);
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
        maintenanceState.selectedDate = '';

        const search = document.getElementById('maintenanceSearch');
        const category = document.getElementById('maintenanceCategoryFilter');
        const status = document.getElementById('maintenanceStatusFilter');
        if (search) search.value = '';
        if (category) category.value = 'todos';
        if (status) status.value = 'todos';
        renderMaintenancePage();
    });

    document.getElementById('maintenanceCalendarPrev')?.addEventListener('click', () => {
        maintenanceState.calendarCursor = new Date(
            maintenanceState.calendarCursor.getFullYear(),
            maintenanceState.calendarCursor.getMonth() - 1,
            1
        );
        renderMaintenanceCalendar();
    });

    document.getElementById('maintenanceCalendarNext')?.addEventListener('click', () => {
        maintenanceState.calendarCursor = new Date(
            maintenanceState.calendarCursor.getFullYear(),
            maintenanceState.calendarCursor.getMonth() + 1,
            1
        );
        renderMaintenanceCalendar();
    });

    document.getElementById('maintenanceCalendarClear')?.addEventListener('click', () => {
        maintenanceState.selectedDate = '';
        renderMaintenancePage();
    });

    document.getElementById('openMaintenanceModalBtn')?.addEventListener('click', openMaintenanceModal);
    document.getElementById('closeMaintenanceModal')?.addEventListener('click', closeMaintenanceModal);
    document.getElementById('cancelMaintenanceModal')?.addEventListener('click', closeMaintenanceModal);
    document.getElementById('maintenanceModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'maintenanceModal') closeMaintenanceModal();
    });

    document.getElementById('maintenanceForm')?.addEventListener('submit', saveMaintenance);
}

async function reloadMaintenanceItems() {
    if (typeof window.supabaseFetch !== 'function') {
        throw new Error('Supabase não está disponível nesta página.');
    }

    const rows = await window.supabaseFetch(
        '/maintenance_items?select=*&order=next_date.asc,created_at.desc'
    );

    const targetCep = String(maintenanceState.cep || '').replace(/\D/g, '');
    maintenanceState.items = (Array.isArray(rows) ? rows : [])
        .filter((row) => String(row?.cep || '').replace(/\D/g, '') === targetCep)
        .map(mapMaintenanceRow);
    renderMaintenancePage();
}

function mapMaintenanceRow(row) {
    const storedStatus = String(row?.status || 'pendente').toLowerCase();
    const derivedStatus = storedStatus === 'concluida'
        ? 'concluida'
        : getMaintenanceStatus(row?.next_date);

    return {
        id: row?.id,
        title: row?.title || '',
        description: row?.description || '',
        location: row?.location || '',
        category: row?.category || 'Outros',
        frequency: row?.frequency || '',
        nextDate: row?.next_date || '',
        status: derivedStatus,
        storedStatus,
        icon: getCategoryIcon(row?.category),
        iconColor: getCategoryColor(row?.category)
    };
}

async function saveMaintenance(event) {
    event.preventDefault();
    if (maintenanceState.saving) return;

    const title = document.getElementById('maintenanceTitle')?.value.trim() || '';
    const location = document.getElementById('maintenanceLocation')?.value.trim() || '';
    const category = document.getElementById('maintenanceCategory')?.value || 'Elevadores';
    const frequency = document.getElementById('maintenanceFrequency')?.value || 'Mensal';
    const nextDate = document.getElementById('maintenanceDate')?.value || '';
    const description = document.getElementById('maintenanceDescription')?.value.trim() || '';

    if (!title || !location || !nextDate || !description) {
        showMaintenanceToast('Preencha todos os campos obrigatórios.', 'warning');
        return;
    }

    const email = String(maintenanceState.currentUser?.email || '').trim().toLowerCase();
    if (!email) {
        showMaintenanceToast('Não foi possível identificar o usuário.', 'error');
        return;
    }

    maintenanceState.saving = true;
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    const original = submit?.innerHTML;
    if (submit) {
        submit.disabled = true;
        submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const rows = await window.supabaseFetch('/maintenance_items', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
                cep: maintenanceState.cep,
                title,
                description,
                location,
                category,
                frequency,
                next_date: nextDate,
                status: 'pendente',
                created_by: email
            })
        });

        if (!Array.isArray(rows) || !rows[0]?.id) {
            throw new Error('O banco não confirmou a manutenção.');
        }

        closeMaintenanceModal();
        await reloadMaintenanceItems();
        showMaintenanceToast('Manutenção programada com sucesso.', 'success');
    } catch (error) {
        console.error('[MANUTENÇÃO] save', error);
        showMaintenanceToast(error.message || 'Erro ao salvar manutenção.', 'error');
    } finally {
        maintenanceState.saving = false;
        if (submit) {
            submit.disabled = false;
            submit.innerHTML = original || 'Salvar manutenção';
        }
    }
}

async function deleteMaintenance(id) {
    if (!id) return;
    const confirmed = window.confirm('Excluir esta manutenção programada?');
    if (!confirmed) return;

    try {
        await window.supabaseFetch(`/maintenance_items?id=eq.${encodeURIComponent(String(id))}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=representation' }
        });
        await reloadMaintenanceItems();
        showMaintenanceToast('Manutenção excluída.', 'success');
    } catch (error) {
        showMaintenanceToast(error.message || 'Não foi possível excluir a manutenção.', 'error');
    }
}

async function toggleMaintenanceComplete(id, shouldComplete) {
    try {
        await window.supabaseFetch(`/maintenance_items?id=eq.${encodeURIComponent(String(id))}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: shouldComplete ? 'concluida' : 'pendente' })
        });
        await reloadMaintenanceItems();
    } catch (error) {
        showMaintenanceToast(error.message || 'Não foi possível atualizar a manutenção.', 'error');
    }
}

function renderMaintenancePage() {
    populateCategoryFilter();
    renderMaintenanceMetrics();
    renderMaintenanceTable(getFilteredMaintenanceItems());
    renderUpcomingList();
    renderMaintenanceCalendar();
}

function getFilteredMaintenanceItems() {
    return maintenanceState.items.filter((item) => {
        const haystack = `${item.title} ${item.location} ${item.category} ${item.description}`.toLowerCase();
        const matchesSearch = !maintenanceState.search || haystack.includes(maintenanceState.search);
        const matchesCategory = maintenanceState.category === 'todos' || normalizeToken(item.category) === maintenanceState.category;
        const matchesStatus = maintenanceState.status === 'todos' || item.status === maintenanceState.status;
        const matchesDate = !maintenanceState.selectedDate || item.nextDate === maintenanceState.selectedDate;
        return matchesSearch && matchesCategory && matchesStatus && matchesDate;
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
    const current = maintenanceState.category;
    const categories = [...new Set(maintenanceState.items.map((item) => item.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = '<option value="todos">Todas as categorias</option>' + categories
        .map((category) => `<option value="${escapeHtml(normalizeToken(category))}">${escapeHtml(category)}</option>`)
        .join('');
    select.value = current;
}

function renderMaintenanceTable(items) {
    const tbody = document.getElementById('maintenanceTableBody');
    if (!tbody) return;
    setText('maintenanceCounter', `${items.length} manutenção${items.length === 1 ? '' : 'ões'} encontrada${items.length === 1 ? '' : 's'}`);

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Nenhuma manutenção programada para os filtros selecionados.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map((item) => `
        <tr>
            <td><div class="task-cell"><div class="task-icon ${escapeHtml(item.iconColor)}"><i class="fas ${escapeHtml(item.icon)}"></i></div><div><div class="task-title">${escapeHtml(item.title)}</div><div class="task-copy">${escapeHtml(item.description)}</div></div></div></td>
            <td>${escapeHtml(item.location)}</td>
            <td><span class="category-pill ${escapeHtml(normalizeToken(item.category))}">${escapeHtml(item.category)}</span></td>
            <td>${escapeHtml(item.frequency)}</td>
            <td><div class="next-date">${escapeHtml(formatDatePt(item.nextDate))}<small class="${item.status === 'atrasada' ? 'atrasada' : ''}">${escapeHtml(formatDateHint(item.nextDate, item.status))}</small></div></td>
            <td><span class="status-pill ${escapeHtml(item.status)}">${escapeHtml(formatStatusLabel(item.status))}</span></td>
            <td><div class="action-list">
                <button class="action-icon" type="button" data-action="complete" data-id="${escapeHtml(item.id)}" title="${item.storedStatus === 'concluida' ? 'Reabrir' : 'Marcar como concluída'}"><i class="fas ${item.storedStatus === 'concluida' ? 'fa-rotate-left' : 'fa-check'}"></i></button>
                <button class="action-icon" type="button" data-action="delete" data-id="${escapeHtml(item.id)}" title="Excluir"><i class="fas fa-trash-can"></i></button>
            </div></td>
        </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="delete"]').forEach((button) => {
        button.addEventListener('click', () => deleteMaintenance(button.dataset.id));
    });
    tbody.querySelectorAll('[data-action="complete"]').forEach((button) => {
        const item = maintenanceState.items.find((row) => String(row.id) === String(button.dataset.id));
        button.addEventListener('click', () => toggleMaintenanceComplete(button.dataset.id, item?.storedStatus !== 'concluida'));
    });
}

function renderUpcomingList() {
    const container = document.getElementById('upcomingMaintenanceList');
    if (!container) return;
    const today = localDateKey(new Date());
    const upcoming = maintenanceState.items
        .filter((item) => item.storedStatus !== 'concluida' && item.nextDate >= today)
        .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
        .slice(0, 3);

    container.innerHTML = upcoming.length
        ? upcoming.map((item) => `<article class="upcoming-item"><div class="upcoming-date"><strong>${escapeHtml(formatDay(item.nextDate))}</strong><small>${escapeHtml(formatMonth(item.nextDate))}</small></div><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.location)}</p></div></article>`).join('')
        : '<p class="table-empty">Nenhuma manutenção futura programada.</p>';
}

function renderMaintenanceCalendar() {
    const grid = document.getElementById('maintenanceCalendarGrid');
    const title = document.getElementById('maintenanceCalendarTitle');
    const clear = document.getElementById('maintenanceCalendarClear');
    if (!grid || !title) return;

    const year = maintenanceState.calendarCursor.getFullYear();
    const month = maintenanceState.calendarCursor.getMonth();
    title.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
        .format(new Date(year, month, 1))
        .replace(/^./, (c) => c.toUpperCase());

    if (clear) clear.hidden = !maintenanceState.selectedDate;

    const first = new Date(year, month, 1);
    const firstCell = new Date(year, month, 1 - first.getDay());
    const cells = [];

    for (let i = 0; i < 42; i += 1) {
        const date = new Date(firstCell);
        date.setDate(firstCell.getDate() + i);
        const key = localDateKey(date);
        const sameMonth = date.getMonth() === month;
        const dayItems = maintenanceState.items.filter((item) => item.nextDate === key);
        const statuses = new Set(dayItems.map((item) => item.status));
        const classes = ['calendar-day', 'calendar-filter-day'];
        if (!sameMonth) classes.push('muted');
        if (maintenanceState.selectedDate === key) classes.push('active');
        if (dayItems.length) classes.push('has-maintenance');

        const dots = [
            statuses.has('pendente') ? '<i class="calendar-status-dot amber"></i>' : '',
            statuses.has('atrasada') ? '<i class="calendar-status-dot red"></i>' : '',
            statuses.has('concluida') ? '<i class="calendar-status-dot green"></i>' : ''
        ].join('');

        cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${key}" aria-label="Filtrar por ${formatDatePt(key)}"><span>${date.getDate()}</span><small class="calendar-status-dots">${dots}</small></button>`);
    }

    grid.innerHTML = cells.join('');
    grid.querySelectorAll('[data-date]').forEach((button) => {
        button.addEventListener('click', () => {
            const value = button.dataset.date;
            maintenanceState.selectedDate = maintenanceState.selectedDate === value ? '' : value;
            const selected = value ? new Date(`${value}T12:00:00`) : null;
            if (selected) maintenanceState.calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
            renderMaintenancePage();
        });
    });
}

function openMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const date = document.getElementById('maintenanceDate');
    if (date && maintenanceState.selectedDate) date.value = maintenanceState.selectedDate;
}

function closeMaintenanceModal() {
    const modal = document.getElementById('maintenanceModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.getElementById('maintenanceForm')?.reset();
}

function getMaintenanceStatus(dateValue) {
    const today = localDateKey(new Date());
    return String(dateValue || '') < today ? 'atrasada' : 'pendente';
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
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function formatDatePt(value) { if (!value) return '--'; const [y, m, d] = String(value).split('-'); return `${d}/${m}/${y}`; }
function formatDateHint(value, status) { if (status === 'concluida') return 'Concluída'; if (status === 'atrasada') return 'Atrasada'; return 'Programada'; }
function formatStatusLabel(status) { return status === 'concluida' ? 'Concluída' : status === 'atrasada' ? 'Atrasada' : 'Pendente'; }
function formatRatio(value, total) { return total ? `${Math.round((value / total) * 100)}%` : '0%'; }
function formatDay(value) { return String(value || '').split('-')[2] || '--'; }
function formatMonth(value) { const d = new Date(`${value}T12:00:00`); return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', '').toUpperCase(); }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = String(value); }
function getInitials(name) { return String(name || 'US').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'US'; }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function showMaintenanceToast(message, type) { if (window.showToast) window.showToast(message, type); else alert(message); }
