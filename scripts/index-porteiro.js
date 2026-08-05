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

    try {
        const email = String(currentUser.email || '').toLowerCase();
        const todayStr = new Date().toISOString().slice(0, 10);
        const sessionKey = `porteiro:session:${email}:${todayStr}`;
        const condoId = currentUser.condominium?.condominium_id || currentUser.condominium?.cep || '';
        const everKey = `porteiro:entry:${email}:${condoId}`;
        const hasPassedEntry = !!sessionStorage.getItem(sessionKey) ||
            (condoId ? !!sessionStorage.getItem(everKey) : false);
        if (!hasPassedEntry) {
            window.location.href = 'entrar-condominio-porteiro.html';
            return;
        }
    } catch (_) {}

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

    if (typeof window.initPorterTopBar === 'function') {
        window.initPorterTopBar(currentUser);
    }

    bindQuickActions();
});

function bindQuickActions() {
    const quickRoutes = {
        'liberacao-visitantes': 'liberacao-visitantes.html',
        'registrar-visitante': 'registrar-visitantes.html',
        'registro-acesso': 'registro-entrada-saida.html',
        'visitantes-liberados': 'liberacao-visitantes.html?tab=liberados',
        'historico-acesso': 'registro-entrada-saida.html'
    };

    Object.entries(quickRoutes).forEach(([cardId, target]) => {
        const card = document.getElementById(cardId);
        const button = card?.querySelector('button');
        if (!card || !button) return;
        card.style.cursor = 'pointer';
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');

        button.addEventListener('click', () => {
            window.location.href = target;
        });

        card.addEventListener('click', (event) => {
            if (event.target.closest('button')) return;
            window.location.href = target;
        });

        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.location.href = target;
            }
        });
    });
}

function logout() {
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
