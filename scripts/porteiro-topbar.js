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

        if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Porteiro';

        if (!profileAvatarTop) return;

        const photo = currentUser.profilePhoto || currentUser.profile_photo || currentUser.photo_url;
        if (photo) {
            profileAvatarTop.innerHTML = `<img src="${String(photo)}" alt="Avatar" />`;
            return;
        }

        profileAvatarTop.textContent = getInitials(currentUser.name || 'Porteiro');
    }

    function bindTopBarLinks() {
        const cameraBtn = document.getElementById('topCameraBtn');
        const bellBtn = document.getElementById('topBellBtn');
        const userBtn = document.getElementById('topUserBtn');
        const profileBlock = document.getElementById('topProfileBlock');

        cameraBtn?.addEventListener('click', () => {
            window.location.href = 'assembleia.html';
        });

        bellBtn?.addEventListener('click', () => {
            window.location.href = 'notificacoes.html';
        });

        userBtn?.addEventListener('click', () => {
            window.location.href = 'configuracoes.html#editar-perfil';
        });

        if (!profileBlock) return;

        profileBlock.style.cursor = 'pointer';
        profileBlock.setAttribute('role', 'link');
        profileBlock.setAttribute('tabindex', '0');

        const goToSettings = () => {
            window.location.href = 'configuracoes.html';
        };

        profileBlock.addEventListener('click', goToSettings);
        profileBlock.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                goToSettings();
            }
        });
    }

    window.initPorterTopBar = function initPorterTopBar(currentUser) {
        renderTopBarDate();
        renderTopBarUser(currentUser);
        bindTopBarLinks();
    };
})();

