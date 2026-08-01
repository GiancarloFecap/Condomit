document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || '';
    const rawUser = sessionStorage.getItem('condominiumUser');
    let currentUserType = 'sindico';

    try {
        const currentUser = rawUser ? JSON.parse(rawUser) : null;
        const normalizedType = (currentUser?.type || currentUser?.user_type || '').toString().trim().toLowerCase();
        if (normalizedType.startsWith('mora')) {
            currentUserType = 'morador';
        }
    } catch (_) {}

    const sharedLinks = {
        'Canal de Sugestões': 'sugestoes.html',
        'Assembleia': 'assembleia.html',
        'Assembleias': 'assembleia.html',
        'Reserva de Locais': 'reservas.html',
        'IA - Dúvidas do Condomínio': 'ai-condomit.html',
        'Configurações': 'configuracoes.html'
    };

    document.querySelectorAll('.sidebar-nav').forEach((nav) => {
        const isMoradorNav = nav.id === 'sidebarMorador' || (nav.id !== 'sidebarSindico' && currentUserType === 'morador');
        const homePage = isMoradorNav ? 'index-morador.html' : 'index.html';

        nav.querySelectorAll('.nav-item').forEach((item) => {
            const label = (item.textContent || '').replace(/\s+/g, ' ').trim();
            const target = label === 'Início' ? homePage : sharedLinks[label];

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
