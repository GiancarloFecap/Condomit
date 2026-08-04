document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop() || '';
    const supportMailto = 'mailto:contato.condomit@gmail.com?subject=Contato%20Condomit';
    const currentUser = getSidebarCurrentUser();
    const currentUserType = getSidebarUserType(currentUser);

    renderSidebar(currentUser, currentUserType, currentPage);
    bindSupportButtons(supportMailto);

    window.navigateTo = function navigateTo(routeKey) {
        const target = getTargetForRoute(routeKey, currentUserType);
        if (target) window.location.href = target;
    };
});

function getSidebarCurrentUser() {
    try {
        const raw = sessionStorage.getItem('condominiumUser');
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function getSidebarUserType(user) {
    try {
        const normalizedType = typeof window.getNormalizedUserType === 'function'
            ? window.getNormalizedUserType(user)
            : (user?.type || user?.user_type || '').toString().trim().toLowerCase();

        if (String(normalizedType).startsWith('porteir')) return 'porteiro';
        if (String(normalizedType).startsWith('mora')) return 'morador';
        return 'sindico';
    } catch (_) {
        return 'sindico';
    }
}

function getHomePage(userType) {
    if (userType === 'morador') return 'index-morador.html';
    if (userType === 'porteiro') return 'index-porteiro.html';
    return 'index.html';
}

function getTargetForRoute(routeKey, userType) {
    const routeMap = {
        inicio: getHomePage(userType),
        mural: 'notificacoes.html',
        sugestoes: 'sugestoes.html',
        notificacoes: 'notificacoes.html',
        correio: 'notificacoes.html',
        indicacoes: 'notificacoes.html',
        'chat-sindico': 'ai-condomit.html',
        'chat-moradores': 'ai-condomit.html',
        'chat-porteiro': 'index-porteiro.html',
        'chat-portaria': 'index-porteiro.html',
        'achados-perdidos': 'achados-perdidos.html',
        marketplace: 'marketplace.html',
        assembleias: 'assembleia.html',
        chamadas: 'assembleia.html',
        'avisos-assembleia': 'assembleia.html',
        'gestao-moradores': 'gestao-moradores.html',
        reservas: 'reservas.html',
        manutencao: 'reservas.html',
        'ia-duvidas': 'ai-condomit.html',
        comunicados: 'ai-condomit.html',
        configuracoes: 'configuracoes.html',
        'porteiro-liberacao': 'index-porteiro.html#liberacao-visitantes',
        'porteiro-registrar': 'index-porteiro.html#registrar-visitante',
        'porteiro-registro': 'index-porteiro.html#registro-acesso',
        'porteiro-visitantes': 'index-porteiro.html#visitantes-liberados',
        'porteiro-historico': 'index-porteiro.html#historico-acesso',
        'porteiro-emergencia': 'index-porteiro.html#emergencia',
        'porteiro-entregas': 'index-porteiro.html#entregas',
        'porteiro-prestadores': 'index-porteiro.html#prestadores'
    };

    return routeMap[routeKey] || '';
}

function renderSidebar(currentUser, userType, currentPage) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('porteiro-sidebar', userType === 'porteiro');
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img src="../assets/logo-icon.png" alt="Condomit Icon" class="sidebar-logo">
            <h2 class="condo-name" id="sidebarApartment">${formatSidebarCondoName(getSidebarCondoName(currentUser))}</h2>
        </div>
        ${buildSidebarNav(userType, currentPage)}
        <div class="sidebar-footer">
            <button class="btn-support" type="button">
                <i class="fas fa-headset"></i>
                <span>Central de Suporte</span>
            </button>
            <button class="btn-logout-sidebar" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i>
                <span>Sair</span>
            </button>
        </div>
    `;
}

function buildSidebarNav(userType, currentPage) {
    const config = getSidebarConfig(userType);
    const navId = userType === 'morador'
        ? 'sidebarMorador'
        : userType === 'porteiro'
            ? 'sidebarPorteiro'
            : 'sidebarSindico';

    return `
        <nav class="sidebar-nav" id="${navId}">
            ${config.map((section) => renderSidebarSection(section, userType, currentPage)).join('')}
        </nav>
    `;
}

function renderSidebarSection(section, userType, currentPage) {
    const title = section.title
        ? `<div class="nav-section-title">${escapeSidebarHtml(section.title)}</div>`
        : '';

    const items = section.items.map((item) => {
        const target = getTargetForRoute(item.route, userType);
        const targetPage = target.split('#')[0];
        const isActive = targetPage && targetPage === currentPage;
        return `
            <a href="${target || '#'}" class="nav-item ${isActive ? 'active' : ''}" data-section="${item.route}">
                <i class="${item.icon}"></i>
                <span>${escapeSidebarHtml(item.label)}</span>
            </a>
        `;
    }).join('');

    return `<div class="nav-section">${title}${items}</div>`;
}

function getSidebarConfig(userType) {
    if (userType === 'porteiro') {
        return [
            { items: [{ label: 'Início', icon: 'fas fa-home', route: 'inicio' }] },
            {
                title: 'Controle de Acesso',
                items: [
                    { label: 'Liberação de Visitantes', icon: 'fas fa-user-check', route: 'porteiro-liberacao' },
                    { label: 'Registrar Visitante', icon: 'fas fa-user-plus', route: 'porteiro-registrar' },
                    { label: 'Registro de Entrada e Saída', icon: 'fas fa-right-left', route: 'porteiro-registro' },
                    { label: 'Visitantes Liberados', icon: 'fas fa-circle-check', route: 'porteiro-visitantes' },
                    { label: 'Histórico de Acesso', icon: 'fas fa-clock-rotate-left', route: 'porteiro-historico' }
                ]
            },
            {
                title: 'Emergência e Serviços',
                items: [
                    { label: 'Botão de Emergência', icon: 'fas fa-bell', route: 'porteiro-emergencia' },
                    { label: 'Autorização de Entregas', icon: 'fas fa-box-open', route: 'porteiro-entregas' },
                    { label: 'Controle de Prestadores', icon: 'fas fa-user-gear', route: 'porteiro-prestadores' }
                ]
            }
        ];
    }

    if (userType === 'morador') {
        return [
            { items: [{ label: 'Início', icon: 'fas fa-home', route: 'inicio' }] },
            {
                title: 'Avisos e Comunicações',
                items: [
                    { label: 'Mural de Avisos', icon: 'fas fa-bullhorn', route: 'mural' },
                    { label: 'Canal de Sugestões', icon: 'fas fa-lightbulb', route: 'sugestoes' },
                    { label: 'Notificações', icon: 'fas fa-bell', route: 'notificacoes' },
                    { label: 'Correio', icon: 'fas fa-envelope', route: 'correio' }
                ]
            },
            {
                title: 'Comunicação e Relacionamento',
                items: [
                    { label: 'Chat com Síndico', icon: 'fas fa-comments', route: 'chat-sindico' },
                    { label: 'Chat com Portaria', icon: 'fas fa-door-open', route: 'chat-portaria' },
                    { label: 'Achados e Perdidos', icon: 'fas fa-search', route: 'achados-perdidos' },
                    { label: 'Market Place', icon: 'fas fa-shopping-bag', route: 'marketplace' }
                ]
            },
            {
                title: 'Assembleias',
                items: [
                    { label: 'Assembleias', icon: 'fas fa-calendar-check', route: 'assembleias' },
                    { label: 'Chamadas', icon: 'fas fa-video', route: 'chamadas' },
                    { label: 'Avisos de Assembleia', icon: 'fas fa-comment-dots', route: 'avisos-assembleia' }
                ]
            },
            {
                title: 'Reservas e Manutenção',
                items: [
                    { label: 'Reserva de Locais', icon: 'fas fa-calendar-alt', route: 'reservas' },
                    { label: 'Manutenção Preventiva', icon: 'fas fa-tools', route: 'manutencao' }
                ]
            },
            {
                title: 'IA e Automação',
                items: [
                    { label: 'IA - Dúvidas do Condomínio', icon: 'fas fa-robot', route: 'ia-duvidas' },
                    { label: 'IA - Comunicados Automáticos', icon: 'fas fa-bell', route: 'comunicados' }
                ]
            },
            {
                title: 'Configurações',
                items: [{ label: 'Configurações', icon: 'fas fa-cog', route: 'configuracoes' }]
            }
        ];
    }

    return [
        { items: [{ label: 'Início', icon: 'fas fa-home', route: 'inicio' }] },
        {
            title: 'Comunicado e Engajamento',
            items: [
                { label: 'Mural de Avisos', icon: 'fas fa-bullhorn', route: 'mural' },
                { label: 'Canal de Sugestões', icon: 'fas fa-lightbulb', route: 'sugestoes' },
                { label: 'Indicações', icon: 'fas fa-flag', route: 'indicacoes' }
            ]
        },
        {
            title: 'Comunicação e Relacionamento',
            items: [
                { label: 'Chat com Moradores', icon: 'fas fa-comments', route: 'chat-moradores' },
                { label: 'Chat com Porteiro', icon: 'fas fa-door-open', route: 'chat-porteiro' },
                { label: 'Achados e Perdidos', icon: 'fas fa-search', route: 'achados-perdidos' },
                { label: 'Market Place', icon: 'fas fa-shopping-bag', route: 'marketplace' }
            ]
        },
        {
            items: [
                { label: 'Assembleia', icon: 'fas fa-calendar-check', route: 'assembleias' },
                { label: 'Chamadas', icon: 'fas fa-video', route: 'chamadas' },
                { label: 'Avisos de Assembleia', icon: 'fas fa-comment-dots', route: 'avisos-assembleia' }
            ]
        },
        {
            title: 'Gestão de Moradores',
            items: [{ label: 'Gestão de Moradores', icon: 'fas fa-users-cog', route: 'gestao-moradores' }]
        },
        {
            title: 'Reserva e Manutenção',
            items: [
                { label: 'Reserva de Locais', icon: 'fas fa-calendar-alt', route: 'reservas' },
                { label: 'Manutenção Preventiva', icon: 'fas fa-tools', route: 'manutencao' }
            ]
        },
        {
            title: 'IA e Automação',
            items: [
                { label: 'IA - Dúvidas do Condomínio', icon: 'fas fa-robot', route: 'ia-duvidas' },
                { label: 'IA - Comunicados Automáticos', icon: 'fas fa-bell', route: 'comunicados' }
            ]
        },
        {
            title: 'Configurações',
            items: [{ label: 'Configurações', icon: 'fas fa-cog', route: 'configuracoes' }]
        }
    ];
}

function bindSupportButtons(supportMailto) {
    document.querySelectorAll('.btn-support').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = supportMailto;
        });
    });
}

function getSidebarCondoName(user) {
    if (window.communityHub && typeof window.communityHub.getCondominiumName === 'function') {
        return window.communityHub.getCondominiumName(user);
    }

    return user?.condominium?.name
        || user?.condominium?.condominium_name
        || 'Seu Condomínio';
}

function formatSidebarCondoName(name) {
    if (window.communityHub && typeof window.communityHub.formatCondoName === 'function') {
        return window.communityHub.formatCondoName(name);
    }

    const words = String(name || '').split(' ').filter(Boolean);
    if (words.length > 2) {
        return `${escapeSidebarHtml(words.slice(0, 2).join(' '))}<br>${escapeSidebarHtml(words.slice(2).join(' '))}`;
    }
    return escapeSidebarHtml(words.join(' ') || 'Seu Condomínio');
}

function escapeSidebarHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
