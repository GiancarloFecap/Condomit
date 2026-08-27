const deliveryState = {
    currentUser: null,
    packages: [],
    filters: { tab: 'all', search: '', status: 'all', block: 'all', date: '' }
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = await loadDeliveryUser();
    if (!user) return;
    deliveryState.currentUser = user;
    initDeliveryShell(user);
    bindDeliveryControls();
    document.getElementById('deliveryModal')?.setAttribute('hidden', 'hidden');
    await loadPackages();
    window.setInterval(() => {
        if (!document.hidden) loadPackages();
    }, 15000);
});

async function loadDeliveryUser() {
    let user = null;
    try {
        user = typeof refreshCurrentUserFromDb === 'function'
            ? await refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
    } catch (_) { user = null; }

    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }
    return user;
}

async function rpc(name, payload = {}) {
    if (typeof window.supabaseFetch !== 'function') throw new Error('Supabase indisponível.');
    return window.supabaseFetch(`/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

function initDeliveryShell(user) {
    const sidebar = document.getElementById('sidebarApartment');
    let condo = user?.condominium || {};
    if (typeof condo === 'string') {
        try { condo = JSON.parse(condo); } catch (_) { condo = {}; }
    }
    if (sidebar && condo?.name) {
        const words = String(condo.name).split(/\s+/).filter(Boolean);
        sidebar.innerHTML = words.length > 2
            ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
            : escapeHtml(words.join(' '));
    }

    if (typeof window.initPorterTopBar === 'function') window.initPorterTopBar(user);
    const dateLabel = document.getElementById('currentDateLabel');
    if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

}

function bindDeliveryControls() {
    document.getElementById('deliverySearchInput')?.addEventListener('input', (event) => {
        deliveryState.filters.search = event.target.value.trim().toLowerCase();
        renderDeliveryPage();
    });
    document.getElementById('deliveryStatusFilter')?.addEventListener('change', (event) => {
        deliveryState.filters.status = event.target.value;
        renderDeliveryPage();
    });
    document.getElementById('deliveryBlockFilter')?.addEventListener('change', (event) => {
        deliveryState.filters.block = event.target.value;
        renderDeliveryPage();
    });
    document.getElementById('deliveryDateFilter')?.addEventListener('change', (event) => {
        deliveryState.filters.date = event.target.value;
        renderDeliveryPage();
    });
    document.getElementById('clearDeliveryFiltersBtn')?.addEventListener('click', () => {
        deliveryState.filters = { tab: 'all', search: '', status: 'all', block: 'all', date: '' };
        const search = document.getElementById('deliverySearchInput');
        const status = document.getElementById('deliveryStatusFilter');
        const block = document.getElementById('deliveryBlockFilter');
        const date = document.getElementById('deliveryDateFilter');
        if (search) search.value = '';
        if (status) status.value = 'all';
        if (block) block.value = 'all';
        if (date) date.value = '';
        syncTabs();
        renderDeliveryPage();
    });
    document.getElementById('deliveryTabs')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-tab]');
        if (!button) return;
        deliveryState.filters.tab = button.dataset.tab || 'all';
        syncTabs();
        renderDeliveryPage();
    });
}

async function loadPackages() {
    try {
        /* Gera os avisos das encomendas antigas sem interromper a listagem
           quando a migration 024 ainda não tiver sido aplicada. */
        rpc('condomit_notify_old_packages').catch(() => {});

        const rows = await rpc('condomit_list_packages');
        deliveryState.packages = Array.isArray(rows) ? rows : [];

        /* O RPC legado continua compatível com instalações antigas. Os campos
           avançados são mesclados por uma consulta RLS-safe quando existem. */
        try {
            const advanced = await window.supabaseFetch('/packages?select=id,pickup_code,package_photo_url,overdue_notified_at&order=received_at.desc');
            const byId = new Map((Array.isArray(advanced) ? advanced : []).map(item => [Number(item.id), item]));
            deliveryState.packages = deliveryState.packages.map(pkg => ({ ...pkg, ...(byId.get(Number(pkg.id)) || {}) }));
        } catch (_) {}

        populateBlocks();
        renderDeliveryPage();
    } catch (error) {
        console.error('Erro ao carregar encomendas:', error);
        deliveryState.packages = [];
        renderDeliveryPage();
        window.showToast?.(error?.message || 'Não foi possível carregar as encomendas.', 'error');
    }
}

function normalizeStatus(status) {
    if (status === 'Retirada') return 'picked';
    if (status === 'Devolvida') return 'returned';
    return 'pending';
}

function statusLabel(status) {
    if (status === 'picked') return 'Retirada';
    if (status === 'returned') return 'Devolvida';
    return 'Aguardando retirada';
}

function statusClass(status) {
    if (status === 'picked') return 'completed';
    if (status === 'returned') return 'canceled';
    return 'scheduled';
}

function populateBlocks() {
    const select = document.getElementById('deliveryBlockFilter');
    if (!select) return;
    const blocks = [...new Set(deliveryState.packages.map((pkg) => String(pkg?.block || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const previous = deliveryState.filters.block;
    select.innerHTML = '<option value="all">Todos os blocos</option>' + blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('');
    if (blocks.includes(previous)) select.value = previous;
    else deliveryState.filters.block = 'all';
}

function applyFilters() {
    return deliveryState.packages.filter((pkg) => {
        const normalized = normalizeStatus(pkg.status);
        const searchBase = [pkg.id, pkg.tracking_code, pkg.package_description, pkg.recipient_name, pkg.recipient_email, pkg.carrier, pkg.apartment, pkg.block, pkg.pickup_code]
            .join(' ').toLowerCase();
        const date = toDateKey(pkg.received_at);
        const tabOk = deliveryState.filters.tab === 'all' || normalized === deliveryState.filters.tab;
        const statusOk = deliveryState.filters.status === 'all' || normalized === deliveryState.filters.status;
        const searchOk = !deliveryState.filters.search || searchBase.includes(deliveryState.filters.search);
        const blockOk = deliveryState.filters.block === 'all' || String(pkg.block || '') === deliveryState.filters.block;
        const dateOk = !deliveryState.filters.date || date === deliveryState.filters.date;
        return tabOk && statusOk && searchOk && blockOk && dateOk;
    });
}

function renderDeliveryPage() {
    updateMetrics();
    renderTable(applyFilters());
}

function updateMetrics() {
    const today = new Date().toISOString().slice(0, 10);
    const pending = deliveryState.packages.filter((pkg) => normalizeStatus(pkg.status) === 'pending').length;
    const receivedToday = deliveryState.packages.filter((pkg) => toDateKey(pkg.received_at) === today).length;
    const pickedToday = deliveryState.packages.filter((pkg) => pkg.status === 'Retirada' && toDateKey(pkg.delivered_at) === today).length;
    const returnedToday = deliveryState.packages.filter((pkg) => pkg.status === 'Devolvida' && toDateKey(pkg.delivered_at) === today).length;
    setText('activeDeliveriesCount', pending);
    setText('scheduledTodayCount', receivedToday);
    setText('completedTodayCount', pickedToday);
    setText('canceledTodayCount', returnedToday);
}

function renderTable(packages) {
    const tbody = document.getElementById('deliveryTableBody');
    if (!tbody) return;
    if (!packages.length) {
        tbody.innerHTML = `
            <tr><td colspan="8"><div class="empty-state">
                <strong>Nenhuma encomenda encontrada</strong>
                <p>As encomendas registradas no condomínio aparecerão aqui.</p>
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = packages.map((pkg) => {
        const normalized = normalizeStatus(pkg.status);
        const code = pkg.tracking_code || `#${pkg.id}`;
        const received = formatDateTime(pkg.received_at);
        const unit = [pkg.apartment ? `Apto ${pkg.apartment}` : '', pkg.block ? `Bloco ${pkg.block}` : ''].filter(Boolean);
        return `
            <tr>
                <td><div class="delivery-code">${pkg.package_photo_url ? `<img class="package-thumb" src="${escapeHtml(pkg.package_photo_url)}" alt="Foto da encomenda" loading="lazy" referrerpolicy="no-referrer">` : ''}<strong>${escapeHtml(code)}</strong><small>${escapeHtml(pkg.package_description || 'Encomenda')}</small>${pkg.pickup_code ? `<small class="pickup-code">Retirada: <b>${escapeHtml(pkg.pickup_code)}</b> <button class="inline-qr-btn" type="button" data-package-qr="${pkg.id}" title="Mostrar QR Code"><i class="fas fa-qrcode"></i></button></small>` : ''}${packageWaitingBadge(pkg)}</div></td>
                <td><div class="resident-cell"><span class="mini-avatar">${escapeHtml(getInitials(pkg.recipient_name))}</span><div><strong>${escapeHtml(pkg.recipient_name)}</strong><small>${escapeHtml(pkg.recipient_email || '')}</small></div></div></td>
                <td>${unit.length ? unit.map(escapeHtml).join('<br>') : '--'}</td>
                <td><strong>${escapeHtml(pkg.carrier || 'Não informada')}</strong></td>
                <td><strong>${escapeHtml(received.date)}</strong><br><small>${escapeHtml(received.time)}</small></td>
                <td><strong>${escapeHtml(pkg.received_by || '--')}</strong></td>
                <td><span class="status-chip ${statusClass(normalized)}">${escapeHtml(statusLabel(normalized))}</span></td>
                <td><div class="request-actions">
                    ${normalized === 'pending' ? `<button class="icon-more" type="button" data-package-action="Retirada" data-id="${pkg.id}" title="Marcar como retirada"><i class="fas fa-check"></i></button>
                    <button class="icon-more" type="button" data-package-action="Devolvida" data-id="${pkg.id}" title="Marcar como devolvida"><i class="fas fa-rotate-left"></i></button>` : '<span>—</span>'}
                </div></td>
            </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-package-action]').forEach((button) => {
        button.addEventListener('click', () => changePackageStatus(Number(button.dataset.id), button.dataset.packageAction));
    });
    tbody.querySelectorAll('[data-package-qr]').forEach((button) => {
        button.addEventListener('click', () => showPackageQr(Number(button.dataset.packageQr)));
    });
}

function packageWaitingBadge(pkg) {
    if (normalizeStatus(pkg.status) !== 'pending' || !pkg.received_at) return '';
    const days = Math.max(0, Math.floor((Date.now() - new Date(pkg.received_at).getTime()) / 86400000));
    if (days < 1) return '';
    return `<small class="package-age ${days >= 3 ? 'overdue' : ''}">Na portaria há ${days} dia${days === 1 ? '' : 's'}</small>`;
}

function showPackageQr(id) {
    const pkg = deliveryState.packages.find(item => Number(item.id) === Number(id));
    if (!pkg?.pickup_code) return;
    let modal = document.getElementById('packageQrModal027');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'packageQrModal027';
        modal.className = 'package-qr-modal';
        modal.innerHTML = `<div class="package-qr-card"><button type="button" class="package-qr-close" aria-label="Fechar">×</button><h3>QR Code de retirada</h3><div id="packageQrCanvas027"></div><strong id="packageQrCode027"></strong><p>Confirme este código antes de entregar a encomenda.</p></div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('.package-qr-close')) modal.remove(); });
    }
    const canvas = modal.querySelector('#packageQrCanvas027');
    const code = modal.querySelector('#packageQrCode027');
    canvas.innerHTML = '';
    code.textContent = pkg.pickup_code;
    if (window.QRCode) new QRCode(canvas, { text: `CONDOMIT:PACKAGE:${pkg.id}:${pkg.pickup_code}`, width: 180, height: 180 });
}

async function changePackageStatus(id, status) {
    try {
        await rpc('condomit_set_package_status', { package_id: id, next_status: status });
        window.showToast?.(`Encomenda marcada como ${status.toLowerCase()}.`, 'success');
        await loadPackages();
    } catch (error) {
        window.showToast?.(error?.message || 'Não foi possível alterar a encomenda.', 'error');
    }
}

function syncTabs() {
    document.querySelectorAll('#deliveryTabs [data-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === deliveryState.filters.tab);
    });
}

function toDateKey(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: '--', time: '--' };
    return {
        date: date.toLocaleDateString('pt-BR'),
        time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
}

function getInitials(name) {
    return String(name || 'US').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'US';
}
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = String(value); }
function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
