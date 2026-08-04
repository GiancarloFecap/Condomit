const notificationState = {
    currentUser: null,
    activeCategory: 'Todas'
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadNotificationsUser();
    if (!currentUser) return;

    notificationState.currentUser = currentUser;
    setupNotificationsShell(currentUser);
    setupNotificationActions();
    renderNotificationsPage();
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
    const sidebarSindico = document.getElementById('sidebarSindico');
    const sidebarMorador = document.getElementById('sidebarMorador');
    const isSindico = window.communityHub.getUserType(currentUser) === 'sindico';

    if (sidebarSindico) sidebarSindico.style.display = isSindico ? 'block' : 'none';
    if (sidebarMorador) sidebarMorador.style.display = isSindico ? 'none' : 'block';

    const sidebarApartment = document.getElementById('sidebarApartment');
    if (sidebarApartment) {
        sidebarApartment.innerHTML = window.communityHub.formatCondoName(
            window.communityHub.getCondominiumName(currentUser)
        );
    }

    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Usuário';
    if (profileTypeTop) profileTypeTop.textContent = window.communityHub.getUserTypeLabel(currentUser);
    if (profileAvatarTop) profileAvatarTop.textContent = window.communityHub.getInitials(currentUser.name);

    const createButton = document.getElementById('createNotificationBtn');
    const subtitle = document.getElementById('notificationsSubtitle');
    if (createButton) createButton.style.display = isSindico ? 'inline-flex' : 'none';
    if (subtitle) {
        subtitle.textContent = isSindico
            ? 'Crie e acompanhe os avisos enviados aos moradores.'
            : 'Veja apenas as notificações já publicadas para o seu condomínio.';
    }
}

function setupNotificationActions() {
    document.getElementById('markAllReadBtn')?.addEventListener('click', () => {
        window.communityHub.markAllNotificationsAsRead(notificationState.currentUser);
        renderNotificationsPage();
    });

    document.getElementById('createNotificationBtn')?.addEventListener('click', openNotificationModal);
    document.getElementById('closeNotificationModal')?.addEventListener('click', closeNotificationModal);
    document.getElementById('cancelNotificationModal')?.addEventListener('click', closeNotificationModal);
    document.getElementById('notificationModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'notificationModal') {
            closeNotificationModal();
        }
    });

    document.getElementById('notificationForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const category = document.getElementById('notificationCategory').value;
        const title = document.getElementById('notificationTitle').value.trim();
        const message = document.getElementById('notificationMessage').value.trim();

        if (!title || !message) return;

        window.communityHub.createNotification({ category, title, message }, notificationState.currentUser);
        closeNotificationModal();
        event.target.reset();
        notificationState.activeCategory = 'Todas';
        renderNotificationsPage();
    });
}

function renderNotificationsPage() {
    const allNotifications = window.communityHub.getNotifications(notificationState.currentUser);
    const filteredNotifications = notificationState.activeCategory === 'Todas'
        ? allNotifications
        : allNotifications.filter((item) => item.category === notificationState.activeCategory);

    renderCategoryTabs(allNotifications);
    renderNotificationsList(filteredNotifications);
    renderNotificationsSummary(allNotifications);
}

function renderCategoryTabs(notifications) {
    const container = document.getElementById('categoryTabs');
    if (!container) return;

    const counts = getNotificationCounts(notifications);
    const categories = ['Todas', 'Avisos', 'Reservas', 'Assembleias', 'Entregas'];

    container.innerHTML = categories.map((category) => {
        const count = category === 'Todas'
            ? notifications.length
            : (counts[category] || 0);
        const active = category === notificationState.activeCategory ? 'active' : '';
        return `
            <button class="category-pill ${active}" type="button" data-category="${category}">
                ${category} <strong>${count}</strong>
            </button>
        `;
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

    if (counter) {
        counter.textContent = `${notifications.length} ${notifications.length === 1 ? 'item' : 'itens'}`;
    }

    if (!notifications.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Nenhuma notificação encontrada para esse filtro.</p></div>';
        return;
    }

    list.innerHTML = notifications.map((notification) => {
        const read = window.communityHub.isNotificationRead(notification.id, notificationState.currentUser);
        return `
            <article class="notification-item" data-id="${notification.id}" data-category="${notification.category}">
                <div class="notification-icon">
                    <i class="${iconForCategory(notification.category)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-meta">
                        <div class="notification-text">
                            <h4>${escapeHtml(notification.title)}</h4>
                            <p>${escapeHtml(notification.message)}</p>
                        </div>
                        <small class="muted">${window.communityHub.formatTime(notification.createdAt)}</small>
                    </div>
                    <div class="notification-badges">
                        <span class="tag category">${notification.category}</span>
                        <span class="tag status ${read ? 'read' : ''}">${read ? 'Lida' : 'Não lida'}</span>
                        <span class="tag category">${escapeHtml(notification.author || 'Sistema')}</span>
                    </div>
                </div>
                <button class="notification-dot ${read ? 'read' : ''}" type="button" aria-label="Marcar como lida"></button>
            </article>
        `;
    }).join('');

    list.querySelectorAll('.notification-item').forEach((item) => {
        item.addEventListener('click', () => {
            window.communityHub.markNotificationAsRead(item.dataset.id, notificationState.currentUser);
            renderNotificationsPage();
        });
    });
}

function renderNotificationsSummary(notifications) {
    const readCount = notifications.filter((item) =>
        window.communityHub.isNotificationRead(item.id, notificationState.currentUser)
    ).length;
    const unreadCount = notifications.length - readCount;
    const counts = getNotificationCounts(notifications);

    const totalNotifications = document.getElementById('totalNotifications');
    const unreadNotifications = document.getElementById('unreadNotifications');
    const readNotifications = document.getElementById('readNotifications');
    const categoriesSummary = document.getElementById('categoriesSummary');

    if (totalNotifications) totalNotifications.textContent = String(notifications.length);
    if (unreadNotifications) unreadNotifications.textContent = String(unreadCount);
    if (readNotifications) readNotifications.textContent = String(readCount);

    if (categoriesSummary) {
        categoriesSummary.innerHTML = ['Avisos', 'Reservas', 'Assembleias', 'Entregas'].map((category) => `
            <div class="category-summary-item">
                <span>${category}</span>
                <strong>${counts[category] || 0}</strong>
            </div>
        `).join('');
    }
}

function getNotificationCounts(notifications) {
    return notifications.reduce((accumulator, item) => {
        accumulator[item.category] = (accumulator[item.category] || 0) + 1;
        return accumulator;
    }, {});
}

function iconForCategory(category) {
    if (category === 'Reservas') return 'fas fa-calendar-check';
    if (category === 'Assembleias') return 'fas fa-users';
    if (category === 'Entregas') return 'fas fa-box-open';
    return 'fas fa-bullhorn';
}

function openNotificationModal() {
    document.getElementById('notificationModal')?.classList.add('open');
}

function closeNotificationModal() {
    document.getElementById('notificationModal')?.classList.remove('open');
}

function escapeHtml(text) {
    return String(text)
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
