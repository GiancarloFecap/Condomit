document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadVisitorPageUser();
    if (!currentUser) return;

    initVisitorPageShell(currentUser);
    initVisitorPageForm(currentUser);
    renderRecentVisitors(currentUser);
});

async function loadVisitorPageUser() {
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

function initVisitorPageShell(currentUser) {
    const sidebarApartment = document.getElementById('sidebarApartment');
    const profileNameTop = document.getElementById('profileNameTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    const visitorPageDateLabel = document.getElementById('visitorPageDateLabel');
    const fullName = currentUser.name || 'Porteiro';
    const initials = fullName
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'PT';

    if (profileNameTop) profileNameTop.textContent = fullName;
    if (profileAvatarTop) profileAvatarTop.textContent = initials;

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    if (visitorPageDateLabel) {
        const now = new Date();
        visitorPageDateLabel.textContent = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', ' -');
    }
}

function initVisitorPageForm(currentUser) {
    if (!window.visitorRegistration) return;

    const form = document.getElementById('visitorRegistrationForm');
    if (!form) return;

    window.visitorRegistration.initForm(form, {
        currentUser,
        onSuccess() {
            renderRecentVisitors(currentUser);
        }
    });
}

function renderRecentVisitors(currentUser) {
    if (!window.visitorRegistration) return;

    const recentLogs = window.visitorRegistration.getRecentLogs(currentUser);
    const list = document.getElementById('visitorPresenceList');
    const count = document.getElementById('todayVisitorsCount');
    if (!list || !count) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayLogs = recentLogs.filter((item) => item.visitDate === todayKey);
    count.textContent = String(todayLogs.length);

    if (!recentLogs.length) {
        list.innerHTML = `
            <div class="presence-item">
                <div class="presence-avatar">--</div>
                <div class="presence-copy">
                    <strong>Nenhum visitante registrado</strong>
                    <small>Os últimos cadastros aparecerão aqui.</small>
                </div>
            </div>
        `;
        return;
    }

    list.innerHTML = recentLogs.slice(0, 4).map((item) => `
        <div class="presence-item">
            <div class="presence-avatar">${getInitials(item.fullName)}</div>
            <div class="presence-copy">
                <strong>${escapeHtml(item.fullName)}</strong>
                <small>Apto ${escapeHtml(item.apartment || '--')} - Bloco ${escapeHtml(item.block || '--')}</small>
                <small>Entrada: ${escapeHtml(item.visitTime || '--:--')}</small>
            </div>
            <span class="presence-badge">Presente</span>
        </div>
    `).join('');
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
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
