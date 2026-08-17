/* Condomit 025 - navegacao responsiva global das telas autenticadas. */
(() => {
    const MOBILE_QUERY = '(max-width: 900px)';

    function initResponsiveSidebar() {
        const sidebar = document.querySelector('.dashboard-sindico > .sidebar, .sidebar');
        if (!sidebar || sidebar.dataset.responsiveReady === 'true') return;

        sidebar.dataset.responsiveReady = 'true';
        sidebar.setAttribute('aria-hidden', window.matchMedia(MOBILE_QUERY).matches ? 'true' : 'false');

        const overlay = document.createElement('div');
        overlay.className = 'mobile-sidebar-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);

        let topBar = document.querySelector('.main-content > .top-bar, .top-bar');
        let button = document.querySelector('.mobile-menu-btn');

        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'mobile-menu-btn';
            button.setAttribute('aria-label', 'Abrir menu');
            button.setAttribute('aria-expanded', 'false');
            button.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';

            if (topBar) {
                topBar.insertBefore(button, topBar.firstChild);
            } else {
                button.classList.add('mobile-menu-btn-floating');
                document.body.appendChild(button);
            }
        }

        function isMobile() {
            return window.matchMedia(MOBILE_QUERY).matches;
        }

        function setOpen(open) {
            if (!isMobile()) open = false;
            sidebar.classList.toggle('open', open);
            overlay.classList.toggle('active', open);
            document.body.classList.toggle('mobile-sidebar-open', open);
            button.setAttribute('aria-expanded', String(open));
            button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
            sidebar.setAttribute('aria-hidden', String(isMobile() && !open));
            overlay.setAttribute('aria-hidden', String(!open));
            const icon = button.querySelector('i');
            if (icon) icon.className = open ? 'fas fa-xmark' : 'fas fa-bars';
        }

        button.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
        overlay.addEventListener('click', () => setOpen(false));

        sidebar.addEventListener('click', (event) => {
            if (!isMobile()) return;
            const link = event.target.closest('a.nav-item, .sidebar-footer button');
            if (link) setOpen(false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setOpen(false);
        });

        const media = window.matchMedia(MOBILE_QUERY);
        const handleBreakpoint = () => {
            if (!media.matches) {
                setOpen(false);
                sidebar.setAttribute('aria-hidden', 'false');
            } else {
                sidebar.setAttribute('aria-hidden', sidebar.classList.contains('open') ? 'false' : 'true');
            }
        };

        if (typeof media.addEventListener === 'function') media.addEventListener('change', handleBreakpoint);
        else if (typeof media.addListener === 'function') media.addListener(handleBreakpoint);

        handleBreakpoint();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResponsiveSidebar);
    } else {
        initResponsiveSidebar();
    }
})();
