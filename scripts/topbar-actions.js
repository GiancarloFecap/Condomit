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
            const normalized = window.getNormalizedUserType(user);
            const value = String(normalized || '').trim().toLowerCase();
            if (value.startsWith('sind') || value === 'síndico') return 'sindico';
            if (value.startsWith('porteir')) return 'porteiro';
            return 'morador';
        }

        const value = String(user?.type || user?.user_type || 'morador').trim().toLowerCase();
        if (value.startsWith('sind') || value === 'síndico') return 'sindico';
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

    function createIconButton(id, iconClass, label) {
        const button = document.createElement('button');
        button.className = 'icon-btn';
        button.type = 'button';
        button.id = id;
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `<i class="fas ${iconClass}"></i>`;
        return button;
    }

    function findIconButton(topIcons, selector) {
        return [...topIcons.querySelectorAll('.icon-btn')]
            .find((button) => button.querySelector(selector)) || null;
    }

    function ensurePorterTopbarButtons(topbar) {
        const topIcons = topbar.querySelector('.top-icons');
        if (!topIcons) return;

        /* Porteiro não usa atalho de câmera/assembleia no top bar. */
        [...topIcons.querySelectorAll('.icon-btn')].forEach((button) => {
            if (button.id === 'topCameraBtn' || button.querySelector('.fa-video, .fa-video-camera')) {
                button.remove();
            }
        });

        let chatBtn = document.getElementById('topChatBtn') ||
            findIconButton(topIcons, '.fa-comments, .fa-comment, .fa-message, .fa-comments-alt');
        if (!chatBtn) {
            chatBtn = createIconButton('topChatBtn', 'fa-comments', 'Chat');
            topIcons.prepend(chatBtn);
        } else if (!chatBtn.id) {
            chatBtn.id = 'topChatBtn';
        }

        let bellBtn = document.getElementById('topBellBtn') || findIconButton(topIcons, '.fa-bell');
        if (!bellBtn) {
            bellBtn = createIconButton('topBellBtn', 'fa-bell', 'Notificações');
            topIcons.appendChild(bellBtn);
        } else if (!bellBtn.id) {
            bellBtn.id = 'topBellBtn';
        }

        let userBtn = document.getElementById('topUserBtn') ||
            findIconButton(topIcons, '.fa-user-circle, .fa-circle-user, .fa-user, .fa-user-shield');
        if (!userBtn) {
            userBtn = createIconButton('topUserBtn', 'fa-user', 'Editar perfil');
            topIcons.appendChild(userBtn);
        } else if (!userBtn.id) {
            userBtn.id = 'topUserBtn';
        }
    }

    function chatOption(target, icon, title, description) {
        return `
            <button type="button" data-chat-target="${target}">
                <i class="fas ${icon}"></i>
                <span>
                    <strong>${title}</strong>
                    <small>${description}</small>
                </span>
            </button>`;
    }

    function getChatOptions(type) {
        if (type === 'porteiro') {
            return [
                {
                    target: 'syndic',
                    icon: 'fa-user-tie',
                    title: 'Chat com síndico',
                    description: 'Converse diretamente com o síndico do condomínio.',
                    href: 'chat-sindico.html'
                },
                {
                    target: 'porter',
                    icon: 'fa-user-shield',
                    title: 'Chat com porteiro',
                    description: 'Abra as conversas disponíveis com a portaria.',
                    href: 'chat-porteiro.html'
                }
            ];
        }

        /* Síndico: mesmo seletor usado no Chat do acesso rápido. */
        return [
            {
                target: 'residents',
                icon: 'fa-users',
                title: 'Chat com os moradores',
                description: 'Converse individualmente com moradores do condomínio.',
                href: 'chat-moradores.html'
            },
            {
                target: 'porter',
                icon: 'fa-user-shield',
                title: 'Chat com porteiro',
                description: 'Abra a conversa com a portaria do condomínio.',
                href: 'chat-porteiro.html'
            }
        ];
    }

    function openTopbarChatChooser(type) {
        if (type === 'morador') {
            go('chat-sindico.html');
            return;
        }

        const modalId = 'condomitTopbarChatChooserModal';
        document.getElementById(modalId)?.remove();

        const options = getChatOptions(type);
        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'quick-chat-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="quick-chat-card" role="dialog" aria-modal="true" aria-labelledby="condomitTopbarChatChooserTitle">
                <button type="button" class="quick-chat-close" aria-label="Fechar">
                    <i class="fas fa-xmark"></i>
                </button>
                <div class="quick-chat-icon"><i class="fas fa-comments"></i></div>
                <h3 id="condomitTopbarChatChooserTitle">Abrir chat</h3>
                <p>Com quem você deseja conversar?</p>
                <div class="quick-chat-options">
                    ${options.map((option) => chatOption(option.target, option.icon, option.title, option.description)).join('')}
                </div>
            </div>`;

        document.body.appendChild(modal);

        const close = () => {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
            window.setTimeout(() => modal.remove(), 180);
        };

        modal.querySelector('.quick-chat-close')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });

        options.forEach((option) => {
            modal.querySelector(`[data-chat-target="${option.target}"]`)?.addEventListener('click', () => {
                go(option.href);
            });
        });

        const onEscape = (event) => {
            if (event.key !== 'Escape') return;
            document.removeEventListener('keydown', onEscape);
            close();
        };
        document.addEventListener('keydown', onEscape);

        requestAnimationFrame(() => {
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        });
    }

    function initTopbarActions() {
        const topbar = document.querySelector('.top-bar');
        if (!topbar) return;

        const user = getUser();
        const type = getType(user);

        if (type === 'porteiro') {
            ensurePorterTopbarButtons(topbar);
        }

        const buttons = [...topbar.querySelectorAll('.top-icons .icon-btn')];

        buttons.forEach((button) => {
            if (button.querySelector('.fa-comments, .fa-comment, .fa-message, .fa-comments-alt')) {
                bindButton(button, () => openTopbarChatChooser(type), 'Chat');
                return;
            }

            if (button.querySelector('.fa-video, .fa-video-camera')) {
                if (type === 'porteiro') {
                    button.remove();
                    return;
                }
                bindButton(button, () => go('assembleia.html'), 'Assembleias');
                return;
            }

            if (button.querySelector('.fa-bell')) {
                bindButton(button, () => go('notificacoes.html'), 'Notificações');
                return;
            }

            if (button.querySelector('.fa-user-circle, .fa-circle-user, .fa-user, .fa-user-shield')) {
                bindButton(button, () => go('configuracoes.html#editar-perfil'), 'Editar perfil');
            }
        });

        const profile = topbar.querySelector('.user-profile-small');
        if (profile && profile.dataset.condomitTopbarBound !== '1') {
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
    window.openCondomitTopbarChatChooser = openTopbarChatChooser;
})();
