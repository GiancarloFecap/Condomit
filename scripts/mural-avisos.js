const wallState = {
    currentUser: null,
    activeCategory: 'Todas',
    notices: [],
    selectedNoticeId: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadWallUser();
    if (!currentUser) return;

    wallState.currentUser = currentUser;
    setupWallShell(currentUser);
    setupWallActions();
    await renderWallPage();
});

async function loadWallUser() {
    let user = window.communityHub?.getCurrentUser?.() || null;
    if (!user && typeof refreshCurrentUserFromDb === 'function') {
        user = await refreshCurrentUserFromDb().catch(() => null);
    }
    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }
    return user;
}

function setupWallShell(currentUser) {
    const isSindico = window.communityHub.getUserType(currentUser) === 'sindico';
    const createButton = document.getElementById('createWallNoticeBtn');
    const subtitle = document.getElementById('wallSubtitle');

    if (createButton) createButton.style.display = isSindico ? 'inline-flex' : 'none';
    if (subtitle) {
        subtitle.textContent = isSindico
            ? 'Publique avisos para todos os moradores do condomínio.'
            : 'Acompanhe todos os avisos publicados pelo síndico do seu condomínio.';
    }

    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Usuário';
    if (profileTypeTop) profileTypeTop.textContent = window.communityHub.getUserTypeLabel(currentUser);
    if (profileAvatarTop) profileAvatarTop.textContent = window.communityHub.getInitials(currentUser.name);
}

function setupWallActions() {
    document.getElementById('createWallNoticeBtn')?.addEventListener('click', openWallCreateModal);
    document.getElementById('closeWallCreateModal')?.addEventListener('click', closeWallCreateModal);
    document.getElementById('cancelWallCreateModal')?.addEventListener('click', closeWallCreateModal);
    document.getElementById('wallCreateModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'wallCreateModal') closeWallCreateModal();
    });

    document.getElementById('closeWallDetailModal')?.addEventListener('click', closeWallDetailModal);
    document.getElementById('closeWallDetailAction')?.addEventListener('click', closeWallDetailModal);
    document.getElementById('wallDetailModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'wallDetailModal') closeWallDetailModal();
    });

    document.getElementById('wallNoticeForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const category = document.getElementById('wallNoticeCategory')?.value || 'Avisos';
        const title = document.getElementById('wallNoticeTitle')?.value.trim() || '';
        const message = document.getElementById('wallNoticeMessage')?.value.trim() || '';
        if (!title || !message) return;

        const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            await window.communityHub.createWallNotice({
                category,
                title,
                message,
                details: message,
                source: 'manual'
            }, wallState.currentUser);

            event.target.reset();
            closeWallCreateModal();
            wallState.activeCategory = 'Todas';
            await renderWallPage();
            window.showToast?.('Aviso publicado no Mural de Avisos e moradores notificados.', 'success');
        } catch (error) {
            console.error('Erro ao publicar aviso no mural:', error);
            window.showToast?.(error?.message || 'Não foi possível publicar o aviso.', 'error');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

async function renderWallPage() {
    try {
        wallState.notices = await window.communityHub.getWallNotices(wallState.currentUser);
    } catch (error) {
        console.error('Erro ao carregar Mural de Avisos:', error);
        wallState.notices = [];
        window.showToast?.(error?.message || 'Não foi possível carregar o Mural de Avisos.', 'error');
    }

    const filtered = wallState.activeCategory === 'Todas'
        ? wallState.notices
        : wallState.notices.filter((notice) => notice.category === wallState.activeCategory);

    renderWallCategoryTabs(wallState.notices);
    renderWallNotices(filtered);
    renderWallSummary(wallState.notices);
}

function renderWallCategoryTabs(notices) {
    const container = document.getElementById('wallCategoryTabs');
    if (!container) return;

    const categories = ['Todas', 'Avisos', 'Reservas', 'Assembleias', 'Entregas'];
    const counts = notices.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
    }, {});

    container.innerHTML = categories.map((category) => {
        const count = category === 'Todas' ? notices.length : (counts[category] || 0);
        return `
            <button class="category-pill ${wallState.activeCategory === category ? 'active' : ''}" type="button" data-wall-category="${category}">
                <span>${category}</span>
                <strong>${count}</strong>
            </button>`;
    }).join('');

    container.querySelectorAll('[data-wall-category]').forEach((button) => {
        button.addEventListener('click', () => {
            wallState.activeCategory = button.dataset.wallCategory;
            renderWallPage();
        });
    });
}

function renderWallNotices(notices) {
    const list = document.getElementById('wallNoticesList');
    const counter = document.getElementById('wallCounter');
    if (!list) return;

    if (counter) counter.textContent = `${notices.length} ${notices.length === 1 ? 'aviso' : 'avisos'}`;

    if (!notices.length) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bullhorn"></i>
                <p>Nenhum aviso publicado neste filtro.</p>
            </div>`;
        return;
    }

    list.innerHTML = notices.map((notice) => `
        <article class="notification-item wall-notice-item" data-id="${escapeWallHtml(notice.id)}" data-category="${escapeWallHtml(notice.category)}" tabindex="0" role="button" aria-label="Abrir aviso ${escapeWallHtml(notice.title)}">
            <div class="notification-icon"><i class="${iconForWallCategory(notice.category)}"></i></div>
            <div class="notification-content">
                <div class="notification-meta">
                    <div class="notification-text">
                        <h4>${escapeWallHtml(notice.title)}</h4>
                        <p>${escapeWallHtml(notice.message)}</p>
                    </div>
                    <small class="muted">${formatWallDate(notice.createdAt)}</small>
                </div>
                <div class="notification-badges">
                    <span class="tag category">${escapeWallHtml(notice.category)}</span>
                    <span class="tag category">${escapeWallHtml(notice.author || 'Condomit')}</span>
                </div>
            </div>
            <i class="fas fa-chevron-right wall-chevron" aria-hidden="true"></i>
        </article>
    `).join('');

    list.querySelectorAll('.wall-notice-item').forEach((item) => {
        const open = () => openWallDetail(item.dataset.id);
        item.addEventListener('click', open);
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });
}

function renderWallSummary(notices) {
    const total = document.getElementById('totalWallNotices');
    const month = document.getElementById('monthWallNotices');
    const latest = document.getElementById('latestWallNotice');

    if (total) total.textContent = String(notices.length);

    const now = new Date();
    const monthCount = notices.filter((notice) => {
        const date = new Date(notice.createdAt);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length;
    if (month) month.textContent = String(monthCount);
    if (latest) latest.textContent = notices[0] ? formatWallDate(notices[0].createdAt) : '--';
}

function openWallCreateModal() {
    document.getElementById('wallCreateModal')?.classList.add('open');
}

function closeWallCreateModal() {
    document.getElementById('wallCreateModal')?.classList.remove('open');
}

function openWallDetail(noticeId) {
    const notice = window.communityHub.getWallNoticeById(noticeId);
    if (!notice) return;

    wallState.selectedNoticeId = noticeId;

    setText('wallDetailTitle', notice.title || 'Detalhes do aviso');
    setText('wallDetailSubtitle', 'Informações completas do aviso publicado no condomínio.');
    setText('wallDetailCategory', notice.category || 'Avisos');
    setText('wallDetailAuthor', notice.author || 'Condomit');
    setText('wallDetailDate', formatWallDate(notice.createdAt, true));
    setText('wallDetailMessage', notice.message || '--');
    setText('wallDetailFullText', notice.details || notice.message || '--');
    setText('wallDetailSource', labelForWallSource(notice.source));

    document.getElementById('wallDetailModal')?.classList.add('open');
}

function closeWallDetailModal() {
    wallState.selectedNoticeId = null;
    document.getElementById('wallDetailModal')?.classList.remove('open');
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function iconForWallCategory(category) {
    if (category === 'Reservas') return 'fas fa-calendar-check';
    if (category === 'Assembleias') return 'fas fa-users';
    if (category === 'Entregas') return 'fas fa-box-open';
    return 'fas fa-bullhorn';
}

function labelForWallSource(source) {
    if (source === 'ai-comunicados') return 'Comunicado criado com IA';
    if (source === 'role_transfer') return 'Alteração de síndico';
    if (source === 'legacy') return 'Aviso anterior';
    return 'Publicado pelo síndico';
}

function formatWallDate(value, withTime = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('pt-BR', withTime ? {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    } : {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function escapeWallHtml(text) {
    return String(text ?? '')
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
    window.location.href = '../inicio.html';
}
