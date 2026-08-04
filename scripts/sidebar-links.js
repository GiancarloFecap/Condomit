document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || '';
    const rawUser = sessionStorage.getItem('condominiumUser');
    let currentUserType = 'sindico';

    try {
        const currentUser = rawUser ? JSON.parse(rawUser) : null;
        const normalizedType = typeof window.getNormalizedUserType === 'function'
            ? window.getNormalizedUserType(currentUser)
            : (currentUser?.type || currentUser?.user_type || '').toString().trim().toLowerCase();
        if (normalizedType.startsWith('mora')) currentUserType = 'morador';
        if (normalizedType.startsWith('porteir')) currentUserType = 'porteiro';
    } catch (_) {}

    const sharedLinks = {
        'Mural de Avisos': 'notificacoes.html',
        'Canal de Sugestões': 'sugestoes.html',
        'Notificações': 'notificacoes.html',
        'Correio': 'notificacoes.html',
        'Chat com Moradores': 'ai-condomit.html',
        'Chat com Síndico': 'ai-condomit.html',
        'Chat com Porteiro': 'porteiro.html',
        'Chat com Portaria': 'porteiro.html',
        'Achados e Perdidos': 'notificacoes.html',
        'Market Place': 'marketplace.html',
        'Marketplace': 'marketplace.html',
        'Assembleia': 'assembleia.html',
        'Assembleias': 'assembleia.html',
        'Chamadas': 'assembleia.html',
        'Avisos de Assembleia': 'assembleia.html',
        'Gestão de Moradores': 'index.html',
        'Reserva de Locais': 'reservas.html',
        'Manutenção Preventiva': 'reservas.html',
        'IA - Dúvidas do Condomínio': 'ai-condomit.html',
        'IA - Comunicados Automáticos': 'ai-condomit.html',
        'Configurações': 'configuracoes.html'
    };

    const sectionLinks = {
        mural: 'notificacoes.html',
        sugestoes: 'sugestoes.html',
        notificacoes: 'notificacoes.html',
        correio: 'notificacoes.html',
        'chat-sindico': 'ai-condomit.html',
        'chat-moradores': 'ai-condomit.html',
        'chat-portaria': 'porteiro.html',
        'achados-perdidos': 'notificacoes.html',
        marketplace: 'marketplace.html',
        assembleias: 'assembleia.html',
        chamadas: 'assembleia.html',
        'avisos-assembleia': 'assembleia.html',
        manutencao: 'reservas.html',
        'ia-duvidas': 'ai-condomit.html',
        comunicados: 'ai-condomit.html',
        configuracoes: 'configuracoes.html'
    };

    function getHomePage() {
        if (currentUserType === 'morador') return 'index-morador.html';
        if (currentUserType === 'porteiro') return 'porteiro.html';
        return 'index.html';
    }

    function getTargetForRoute(routeKey) {
        if (!routeKey) return '';
        if (routeKey === 'inicio') return getHomePage();
        return sectionLinks[routeKey] || sharedLinks[routeKey] || '';
    }

    window.navigateTo = function navigateTo(routeKey) {
        const target = getTargetForRoute(routeKey);
        if (target) {
            window.location.href = target;
        }
    };

    document.querySelectorAll('.sidebar-nav').forEach((nav) => {
        const isMoradorNav = nav.id === 'sidebarMorador' || (nav.id !== 'sidebarSindico' && currentUserType === 'morador');
        const homePage = isMoradorNav ? 'index-morador.html' : getHomePage();

        nav.querySelectorAll('.nav-item').forEach((item) => {
            const label = (item.textContent || '').replace(/\s+/g, ' ').trim();
            const section = item.dataset.section;
            const target = label === 'Início'
                ? homePage
                : (getTargetForRoute(section) || sharedLinks[label]);

            if (target) {
                item.setAttribute('href', target);
            }

            const itemHref = item.getAttribute('href');
            if (itemHref && itemHref !== '#') {
                const targetPage = itemHref.split('/').pop();
                if (targetPage === currentPage) {
                    item.classList.add('active');
                }
            }
        });
    });
});
