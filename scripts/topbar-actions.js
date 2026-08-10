(function () {
    'use strict';

    function getUser() {
        try {
            return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
        } catch (_) {
            return null;
        }
    }

    function getType(user) {
        if (typeof window.getNormalizedUserType === 'function') {
            return window.getNormalizedUserType(user);
        }
        const value = String(user?.type || user?.user_type || 'morador').toLowerCase();
        if (value.startsWith('sind')) return 'sindico';
        if (value.startsWith('porteir')) return 'porteiro';
        return 'morador';
    }

    function go(path) {
        if (!path) return;
        window.location.href = path;
    }

    function bindButton(button, handler, label) {
        if (!button || button.dataset.condomitTopbarBound === '1') return;
        button.dataset.condomitTopbarBound = '1';
        button.type = 'button';
        if (label) {
            button.title = label;
            button.setAttribute('aria-label', label);
        }
        button.addEventListener('click', handler);
    }

    function initTopbarActions() {
        const topbar = document.querySelector('.top-bar');
        if (!topbar) return;

        const user = getUser();
        const type = getType(user);
        const buttons = [...topbar.querySelectorAll('.top-icons .icon-btn')];

        buttons.forEach((button) => {
            /* porteiro-topbar.js já trata seus próprios IDs */
            if (['topCameraBtn', 'topBellBtn', 'topUserBtn'].includes(button.id)) return;

            if (button.querySelector('.fa-comments, .fa-comment, .fa-message, .fa-comments-alt')) {
                bindButton(
                    button,
                    () => go(type === 'morador' ? 'chat-sindico.html' : type === 'porteiro' ? 'chat-sindico.html' : 'chat-moradores.html'),
                    'Mensagens'
                );
                return;
            }

            if (button.querySelector('.fa-video, .fa-video-camera')) {
                bindButton(button, () => go('assembleia.html'), 'Assembleias');
                return;
            }

            if (button.querySelector('.fa-bell')) {
                bindButton(button, () => go('notificacoes.html'), 'Notificações');
                return;
            }

            if (button.querySelector('.fa-user-circle, .fa-circle-user, .fa-user')) {
                bindButton(button, () => go('configuracoes.html#editar-perfil'), 'Editar perfil');
            }
        });

        const profile = topbar.querySelector('.user-profile-small');
        if (profile && profile.id !== 'topProfileBlock' && profile.dataset.condomitTopbarBound !== '1') {
            profile.dataset.condomitTopbarBound = '1';
            profile.style.cursor = 'pointer';
            profile.setAttribute('role', 'button');
            profile.setAttribute('tabindex', '0');
            profile.addEventListener('click', () => go('configuracoes.html'));
            profile.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    go('configuracoes.html');
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTopbarActions);
    } else {
        initTopbarActions();
    }

    window.initTopbarActions = initTopbarActions;
})();
