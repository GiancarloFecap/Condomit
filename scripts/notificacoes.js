const notificationState = {
    currentUser: null,
    activeCategory: 'Todas',
    selectedNotificationId: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadNotificationsUser();
    if (!currentUser) return;

    notificationState.currentUser = currentUser;
    setupNotificationsShell(currentUser);
    setupNotificationActions();
    await renderNotificationsPage();
});

async function loadNotificationsUser() {
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

function setupNotificationsShell(currentUser) {
    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Usuário';
    if (profileTypeTop) profileTypeTop.textContent = window.communityHub.getUserTypeLabel(currentUser);
    if (profileAvatarTop) profileAvatarTop.textContent = window.communityHub.getInitials(currentUser.name);
}

function setupNotificationActions() {
    document.getElementById('markAllReadBtn')?.addEventListener('click', () => {
        window.communityHub.markAllNotificationsAsRead(notificationState.currentUser);
        renderNotificationsPage();
    });

    document.getElementById('openWallBtn')?.addEventListener('click', () => {
        window.location.href = 'mural-avisos.html';
    });

    document.getElementById('notificationDetailModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'notificationDetailModal') closeNotificationDetailModal();
    });
    document.getElementById('closeNotificationDetailModal')?.addEventListener('click', closeNotificationDetailModal);
    document.getElementById('closeNotificationDetailAction')?.addEventListener('click', closeNotificationDetailModal);
    document.getElementById('openRelatedWallNotice')?.addEventListener('click', () => {
        window.location.href = 'mural-avisos.html';
    });
}

async function renderNotificationsPage() {
    const allNotifications = await window.communityHub.getNotifications(notificationState.currentUser);
    const filtered = notificationState.activeCategory === 'Todas'
        ? allNotifications
        : allNotifications.filter((item) => item.category === notificationState.activeCategory);

    renderCategoryTabs(allNotifications);
    renderNotificationsList(filtered);
    renderNotificationsSummary(allNotifications);
}

function renderCategoryTabs(notifications) {
    const container = document.getElementById('categoryTabs');
    if (!container) return;

    const counts = notifications.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
    }, {});
    const categories = ['Todas', 'Avisos', 'Reservas', 'Assembleias', 'Entregas'];

    container.innerHTML = categories.map((category) => {
        const count = category === 'Todas' ? notifications.length : (counts[category] || 0);
        return `
            <button class="category-pill ${notificationState.activeCategory === category ? 'active' : ''}" type="button" data-category="${category}">
                <span>${category}</span>
                <strong>${count}</strong>
            </button>`;
    }).join('');

    container.querySelectorAll('[data-category]').forEach((button) => {
        button.addEventListener('click', () => {
            notificationState.activeCategory = button.dataset.category;
            renderNotificationsPage();
        });
    });
}

function renderNotificationsList(notifications) {
    const list = document.getElementById('notificationsList');
    const counter = document.getElementById('feedCounter');
    if (!list) return;

    if (counter) counter.textContent = `${notifications.length} ${notifications.length === 1 ? 'item' : 'itens'}`;

    if (!notifications.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação encontrada.</p></div>';
        return;
    }

    list.innerHTML = notifications.map((notification) => {
        const read = window.communityHub.isNotificationRead(notification.id, notificationState.currentUser);
        const muralEvent = notification.eventType === 'mural_notice_created';
        return `
            <article class="notification-item ${read ? 'read' : 'unread'}" data-id="${escapeNotificationHtml(notification.id)}" data-category="${escapeNotificationHtml(notification.category)}" tabindex="0" role="button" aria-label="Abrir notificação ${escapeNotificationHtml(notification.title)}">
                <div class="notification-icon">
                    <i class="${muralEvent ? 'fas fa-bullhorn' : iconForCategory(notification.category)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-meta">
                        <div class="notification-text">
                            <h4>${escapeNotificationHtml(notification.title)}</h4>
                            <p>${escapeNotificationHtml(notification.message)}</p>
                        </div>
                        <small class="muted">${formatNotificationDate(notification.createdAt)}</small>
                    </div>
                    <div class="notification-badges">
                        <span class="tag category">${muralEvent ? 'Mural de Avisos' : escapeNotificationHtml(notification.category)}</span>
                        <span class="tag status ${read ? 'read' : ''}">${read ? 'Lida' : 'Não lida'}</span>
                    </div>
                </div>
                <button class="notification-dot ${read ? 'read' : ''}" type="button" aria-label="Status da notificação"></button>
            </article>`;
    }).join('');

    list.querySelectorAll('.notification-item').forEach((item) => {
        const open = () => openNotificationDetail(item.dataset.id);
        item.addEventListener('click', open);
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });
}

function renderNotificationsSummary(notifications) {
    const readCount = notifications.filter((item) =>
        window.communityHub.isNotificationRead(item.id, notificationState.currentUser)
    ).length;

    setNotificationText('totalNotifications', notifications.length);
    setNotificationText('readNotifications', readCount);
    setNotificationText('unreadNotifications', notifications.length - readCount);
}

function openNotificationDetail(notificationId) {
    const notification = window.communityHub.getNotificationById(notificationId);
    if (!notification) return;

    notificationState.selectedNotificationId = notificationId;
    window.communityHub.markNotificationAsRead(notificationId, notificationState.currentUser);

    setNotificationText('notificationDetailTitle', notification.title || 'Detalhes da notificação');
    setNotificationText('notificationDetailSubtitle', notification.eventType === 'mural_notice_created'
        ? 'Esta atualização foi gerada por uma mudança no Mural de Avisos.'
        : 'Veja as informações desta atualização do condomínio.');
    setNotificationText('notificationDetailCategory', notification.eventType === 'mural_notice_created'
        ? 'Mural de Avisos'
        : (notification.category || 'Avisos'));
    setNotificationText('notificationDetailStatus', 'Lida');
    setNotificationText('notificationDetailAuthor', notification.author || 'Condomit');
    setNotificationText('notificationDetailDate', formatNotificationDate(notification.createdAt, true));
    setNotificationText('notificationDetailMessage', notification.details || notification.message || '--');

    const wallButton = document.getElementById('openRelatedWallNotice');
    if (wallButton) wallButton.style.display = notification.eventType === 'mural_notice_created' ? 'inline-flex' : 'none';

    document.getElementById('notificationDetailModal')?.classList.add('open');
    renderNotificationsPage();
}

function closeNotificationDetailModal() {
    notificationState.selectedNotificationId = null;
    document.getElementById('notificationDetailModal')?.classList.remove('open');
}

function setNotificationText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
}

function iconForCategory(category) {
    if (category === 'Reservas') return 'fas fa-calendar-check';
    if (category === 'Assembleias') return 'fas fa-users';
    if (category === 'Entregas') return 'fas fa-box-open';
    return 'fas fa-bell';
}

function formatNotificationDate(value, withTime = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('pt-BR', withTime ? {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    } : {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function escapeNotificationHtml(text) {
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
