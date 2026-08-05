document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.btn-support').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = 'mailto:contato.condomit@gmail.com?subject=Contato%20Condomit';
        });
    });

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
        return;
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
        return;
    }

    const profileNameTop = document.getElementById('profileNameTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    const sidebarApartment = document.getElementById('sidebarApartment');
    const greetingTitle = document.getElementById('greetingTitle');
    const currentDateLabel = document.getElementById('currentDateLabel');

    const fullName = currentUser.name || 'Porteiro';
    const firstName = fullName.split(' ')[0];
    const initials = fullName
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'PT';

    if (profileNameTop) profileNameTop.textContent = fullName;
    if (profileAvatarTop) profileAvatarTop.textContent = initials;
    if (greetingTitle) greetingTitle.textContent = `Bom dia, ${firstName}!`;

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`
            : currentUser.condominium.name;
    }

    if (currentDateLabel) {
        const now = new Date();
        currentDateLabel.textContent = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', ' -');
    }

    bindQuickActions();
});

function bindQuickActions() {
    const quickRoutes = {
        'liberacao-visitantes': 'index-porteiro.html#liberacao-visitantes',
        'registrar-visitante': 'registrar-visitantes.html',
        'registro-acesso': 'index-porteiro.html#registro-acesso',
        'visitantes-liberados': 'index-porteiro.html#visitantes-liberados',
        'historico-acesso': 'index-porteiro.html#historico-acesso'
    };

    Object.entries(quickRoutes).forEach(([cardId, target]) => {
        const card = document.getElementById(cardId);
        const button = card?.querySelector('button');
        if (!card || !button) return;

        button.addEventListener('click', () => {
            window.location.href = target;
        });
    });
}

function logout() {
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
