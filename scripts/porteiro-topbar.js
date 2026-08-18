(function () {
    function getInitials(name) {
        return String(name || '')
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'PT';
    }

    function renderTopBarDate() {
        const currentDateLabel = document.getElementById('currentDateLabel');
        if (!currentDateLabel) return;

        const now = new Date();
        currentDateLabel.textContent = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', ' -');
    }

    function renderTopBarUser(currentUser) {
        if (!currentUser) return;

        const profileNameTop = document.getElementById('profileNameTop');
        const profileAvatarTop = document.getElementById('profileAvatarTop');
        const profileTypeTop = document.getElementById('profileTypeTop');

        if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Porteiro';
        if (profileTypeTop) profileTypeTop.textContent = 'Porteiro';

        if (!profileAvatarTop) return;

        const photo = currentUser.profilePhoto || currentUser.profile_photo || currentUser.photo_url;
        if (photo) {
            profileAvatarTop.innerHTML = `<img src="${String(photo)}" alt="Avatar" />`;
            return;
        }

        profileAvatarTop.textContent = getInitials(currentUser.name || 'Porteiro');
    }

    window.initPorterTopBar = function initPorterTopBar(currentUser) {
        renderTopBarDate();
        renderTopBarUser(currentUser);
        /* Ações e padronização dos ícones ficam centralizadas em topbar-actions.js. */
        window.initTopbarActions?.();
    };
})();
