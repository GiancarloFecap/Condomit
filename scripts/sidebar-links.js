const sidebarTextNodes = new WeakMap();
const sidebarPlaceholderNodes = new WeakMap();
const sidebarRuntime = {
    currentPage: '',
    currentUser: null,
    currentUserType: 'sindico'
};

const sidebarI18n = {
    pt: {
        your_condo: 'Seu Condomínio',
        support_center: 'Central de Suporte',
        sign_out: 'Sair',
        home: 'Início',
        notice_engagement: 'Comunicado e Engajamento',
        relationships: 'Comunicação e Relacionamento',
        resident_management: 'Gestão de Moradores',
        reservations_maintenance: 'Reserva e Manutenção',
        ai_automation: 'IA e Automação',
        settings: 'Configurações',
        notices_communications: 'Avisos e Comunicações',
        assemblies: 'Assembleias',
        reservations_services: 'Reservas e Serviços',
        access_control: 'Controle de Acesso',
        emergency_services: 'Emergência e Serviços',
        mural: 'Mural de Avisos',
        suggestions: 'Canal de Sugestões',
        suggestions_long: 'Canal de Sugestões',
        indications: 'Indicações',
        chat_residents: 'Chat com Moradores',
        chat_syndic: 'Chat com Síndico',
        chat_porter: 'Chat com Porteiro',
        chat_gatehouse: 'Chat com Portaria',
        lost_found: 'Achados e Perdidos',
        marketplace: 'Market Place',
        assembly: 'Assembleia',
        assembly_plural: 'Assembleias',
        calls: 'Chamadas',
        assembly_notices: 'Avisos de Assembleia',
        resident_management_link: 'Gestão de Moradores',
        location_reservations: 'Reserva de Locais',
        preventive_maintenance: 'Manutenção Preventiva',
        ai_questions: 'IA - Dúvidas do Condomínio',
        ai_notices: 'IA - Comunicados Automáticos',
        notifications: 'Notificações',
        mail: 'Correio',
        visitor_release: 'Liberação de Visitantes',
        register_visitor: 'Registrar Visitante',
        visitor_entry_exit: 'Registro de Entrada e Saída',
        released_visitors: 'Visitantes Liberados',
        access_history: 'Histórico de Acesso',
        emergency_button: 'Botão de Emergência',
        deliveries_authorization: 'Autorização de Entregas',
        provider_control: 'Controle de Prestadores'
    },
    en: {
        your_condo: 'Your Condo',
        support_center: 'Support Center',
        sign_out: 'Sign Out',
        home: 'Home',
        notice_engagement: 'Communication and Engagement',
        relationships: 'Communication and Relationships',
        resident_management: 'Resident Management',
        reservations_maintenance: 'Reservations and Maintenance',
        ai_automation: 'AI and Automation',
        settings: 'Settings',
        notices_communications: 'Notices and Communications',
        assemblies: 'Assemblies',
        reservations_services: 'Reservations and Services',
        access_control: 'Access Control',
        emergency_services: 'Emergency and Services',
        mural: 'Notice Board',
        suggestions: 'Suggestions Channel',
        suggestions_long: 'Suggestions Channel',
        indications: 'Recommendations',
        chat_residents: 'Chat with Residents',
        chat_syndic: 'Chat with Manager',
        chat_porter: 'Chat with Porter',
        chat_gatehouse: 'Chat with Gatehouse',
        lost_found: 'Lost and Found',
        marketplace: 'Marketplace',
        assembly: 'Assembly',
        assembly_plural: 'Assemblies',
        calls: 'Calls',
        assembly_notices: 'Assembly Notices',
        resident_management_link: 'Resident Management',
        location_reservations: 'Location Reservations',
        preventive_maintenance: 'Preventive Maintenance',
        ai_questions: 'AI - Condominium Questions',
        ai_notices: 'AI - Automatic Notices',
        notifications: 'Notifications',
        mail: 'Mail',
        visitor_release: 'Visitor Release',
        register_visitor: 'Register Visitor',
        visitor_entry_exit: 'Entry and Exit Log',
        released_visitors: 'Released Visitors',
        access_history: 'Access History',
        emergency_button: 'Emergency Button',
        deliveries_authorization: 'Delivery Authorization',
        provider_control: 'Provider Control'
    }
};

const textTranslations = {
    en: {
        'Configurações': 'Settings',
        'Personalize e gerencie as configurações do sistema': 'Customize and manage system settings',
        'Notificações': 'Notifications',
        'Fique por dentro do que acontece dentro do condomínio.': 'Stay on top of what happens inside the condominium.',
        'Marketplace': 'Marketplace',
        'Compre, venda ou doe itens com seus vizinhos.': 'Buy, sell or donate items with your neighbors.',
        'Achados e Perdidos': 'Lost and Found',
        'Encontre objetos perdidos ou veja o que foi encontrado no condomínio.': 'Find lost objects or see what was found in the condominium.',
        'Gestão de Moradores': 'Resident Management',
        'Gerencie os moradores do seu condomínio de forma prática e segura.': 'Manage condominium residents in a practical and secure way.',
        'Manutenção Preventiva': 'Preventive Maintenance',
        'Acompanhe e gerencie as manutenções preventivas do condomínio.': 'Track and manage the condominium preventive maintenance tasks.',
        'Nova manutenção': 'New maintenance',
        'Buscar por tarefa ou local...': 'Search by task or location...',
        'Todas as categorias': 'All categories',
        'Todos os status': 'All statuses',
        'Limpar filtros': 'Clear filters',
        'Manutenções programadas': 'Scheduled maintenance',
        'Calendário': 'Calendar',
        'Próximas manutenções': 'Upcoming maintenance',
        'Documentos e registros': 'Documents and records',
        'Ver documentos': 'View documents',
        'Bom dia, Porteiro!': 'Good morning, Porter!',
        'Hoje': 'Today',
        'Acesso rápido': 'Quick Access',
        'Atalhos para as operações mais usadas na portaria.': 'Shortcuts for the most used gatehouse operations.',
        'Visitantes aguardando': 'Visitors waiting',
        'Entregas na portaria': 'Deliveries at the gatehouse',
        'Prestadores autorizados': 'Authorized providers',
        'Liberação de Visitantes': 'Visitor Release',
        'Libere a entrada de visitantes pré-cadastrados.': 'Allow entry for pre-registered visitors.',
        'Ir para liberação': 'Go to release',
        'Registrar Visitante': 'Register Visitor',
        'Cadastre um novo visitante no sistema.': 'Register a new visitor in the system.',
        'Novo registro': 'New registration',
        'Registro de Entrada e Saída': 'Entry and Exit Log',
        'Controle as entradas e saídas de moradores e visitantes.': 'Track entries and exits of residents and visitors.',
        'Registrar acesso': 'Register access',
        'Visitantes Liberados': 'Released Visitors',
        'Consulte a lista de visitantes liberados hoje.': 'Check the list of visitors released today.',
        'Ver lista': 'View list',
        'Histórico de Acesso': 'Access History',
        'Visualize os últimos registros da portaria.': 'View the latest gatehouse logs.',
        'Ver histórico': 'View history',
        'Prioridade máxima': 'Highest priority',
        'Botão de emergência': 'Emergency Button',
        'Acione o protocolo interno rapidamente em caso de ocorrência.': 'Trigger the internal protocol quickly in case of an incident.',
        'Acionar emergência': 'Trigger emergency',
        'Autorização de entregas': 'Delivery Authorization',
        'Controle de prestadores': 'Provider Control',
        'Portaria': 'Gatehouse',
        'Serviços': 'Services',
        'Registrar Visitantes': 'Register Visitors',
        'Cadastre a entrada de visitantes no condomínio.': 'Register visitor entry into the condominium.',
        'Ver histórico de acessos': 'View access history',
        'Novo visitante': 'New Visitor',
        'Nome completo': 'Full Name',
        'E-mail': 'Email',
        'CPF': 'CPF',
        'RG': 'ID / RG',
        'CPF do responsável': 'Responsible CPF',
        'Nome do responsável': 'Responsible Name',
        'Telefone do responsável': 'Responsible Phone',
        'Apartamento': 'Apartment',
        'Bloco': 'Block',
        'Telefone do visitante': 'Visitor Phone',
        'Data da visita': 'Visit Date',
        'Horário previsto': 'Scheduled Time',
        'Previsão de saída': 'Estimated Exit Time',
        'Observações': 'Notes',
        'Informações adicionais (opcional)': 'Additional information (optional)',
        'Cadastre apenas as informações do visitante. O responsável será você.': 'Register only the visitor information. You will be the responsible resident.',
        'Segurança em primeiro lugar': 'Safety first',
        'Todos os visitantes são registrados e sua entrada é autorizada pelo morador responsável.': 'All visitors are registered and their entry is authorized by the responsible resident.',
        'Cancelar': 'Cancel',
        'Registrar visitante': 'Register visitor',
        'Visitantes presentes': 'Visitors present',
        'Acessos de hoje': 'Today\'s accesses',
        'Total de visitantes': 'Total visitors',
        'Motivos mais frequentes': 'Most frequent reasons',
        'Visita a moradores': 'Visits to residents',
        'Prestador de serviço': 'Service provider',
        'Entrega': 'Delivery',
        'Outros': 'Others',
        'Dica de segurança': 'Safety tip',
        'Sempre confirme a identidade do visitante e comunique o morador responsável.': 'Always confirm the visitor identity and notify the responsible resident.',
        'Lista de moradores': 'Resident list',
        'Exportar lista': 'Export list',
        'Distribuição por bloco': 'Distribution by block',
        'Status dos moradores': 'Resident status',
        'Ações rápidas': 'Quick actions',
        'Adicionar novo morador': 'Add new resident',
        'Gerenciar dependentes': 'Manage dependents',
        'Enviar comunicado': 'Send notice',
        'Exportar contatos': 'Export contacts',
        'Dica': 'Tip',
        'Como funciona?': 'How does it work?',
        'Itens encontrados': 'Found items',
        'Itens perdidos': 'Lost items',
        'Precisa de ajuda?': 'Need help?',
        'Marcar todas como lidas': 'Mark all as read',
        'Resumo': 'Summary',
        'Preferências': 'Preferences',
        'Filtrar por categoria': 'Filter by category',
        'Configurar preferências': 'Set preferences',
        'Criar notificação': 'Create notification',
        'Informações do condomínio': 'Condominium Information',
        'Minhas reservas': 'My Reservations',
        'Controle de acesso': 'Access Control',
        'Usuário': 'User',
        'Síndico': 'Manager',
        'Morador': 'Resident',
        'Porteiro': 'Porter'
    }
};

const placeholderTranslations = {
    en: {
        'Buscar por nome, apartamento ou bloco...': 'Search by name, apartment or block...',
        'Buscar por item, local ou data...': 'Search by item, place or date...',
        'Buscar por itens, categorias...': 'Search items, categories...',
        'Buscar por tarefa ou local...': 'Search by task or location...',
        'Digite o nome completo': 'Enter full name',
        'Digite o CPF': 'Enter CPF',
        'Digite o RG': 'Enter RG',
        'Digite o CPF do responsável': 'Enter responsible CPF',
        'Digite o nome do responsável': 'Enter responsible name',
        'Ex: 101': 'Ex: 101',
        'Ex: A': 'Ex: A',
        '(11) 99999-9999': '(11) 99999-9999',
        'Informações adicionais (opcional)': 'Additional information (optional)',
        'visitante@email.com': 'visitor@email.com'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    sidebarRuntime.currentPage = window.location.pathname.split('/').pop() || '';
    sidebarRuntime.currentUser = getSidebarCurrentUser();
    sidebarRuntime.currentUserType = getSidebarUserType(sidebarRuntime.currentUser);

    window.navigateTo = function navigateTo(routeKey) {
        const target = getTargetForRoute(routeKey, sidebarRuntime.currentUserType);
        if (target) window.location.href = target;
    };

    window.applyGlobalAppLanguage = function applyGlobalAppLanguage(lang = getAppLanguage()) {
        sidebarRuntime.currentPage = window.location.pathname.split('/').pop() || '';
        sidebarRuntime.currentUser = getSidebarCurrentUser();
        sidebarRuntime.currentUserType = getSidebarUserType(sidebarRuntime.currentUser);
        document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
        renderSidebar(sidebarRuntime.currentUser, sidebarRuntime.currentUserType, sidebarRuntime.currentPage, lang);
        bindSupportButtons('mailto:contato.condomit@gmail.com?subject=Contato%20Condomit');
        translateDocument(lang);
    };

    window.applyGlobalAppLanguage(getAppLanguage());
});

window.addEventListener('storage', (event) => {
    if (event.key === 'app-language' && typeof window.applyGlobalAppLanguage === 'function') {
        window.applyGlobalAppLanguage(event.newValue || 'pt');
    }
});

function getAppLanguage() {
    try {
        return localStorage.getItem('app-language') || 'pt';
    } catch (_) {
        return 'pt';
    }
}

function t(key, lang = getAppLanguage()) {
    return sidebarI18n[lang]?.[key] ?? sidebarI18n.pt[key] ?? key;
}

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
        manutencao: 'manutencao-preventiva.html',
        'ia-duvidas': 'ai-condomit.html',
        comunicados: 'ai-condomit.html',
        configuracoes: 'configuracoes.html',
        'porteiro-liberacao': 'liberacao-visitantes.html',
        'porteiro-registrar': 'registrar-visitantes.html',
        'porteiro-registro': 'registro-entrada-saida.html',
        'porteiro-visitantes': 'liberacao-visitantes.html?tab=liberados',
        'porteiro-historico': 'registro-entrada-saida.html',
        'porteiro-emergencia': 'index-porteiro.html#emergencia',
        'porteiro-entregas': 'autorizacao-entregas.html',
        'porteiro-prestadores': 'controle-prestadores.html'
    };

    return routeMap[routeKey] || '';
}

function renderSidebar(currentUser, userType, currentPage, lang = getAppLanguage()) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('porteiro-sidebar', userType === 'porteiro');
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img src="../assets/logo-icon.png" alt="Condomit Icon" class="sidebar-logo">
            <h2 class="condo-name" id="sidebarApartment">${formatSidebarCondoName(getSidebarCondoName(currentUser, lang), lang)}</h2>
        </div>
        ${buildSidebarNav(userType, currentPage, lang)}
        <div class="sidebar-footer">
            <button class="btn-support" type="button">
                <i class="fas fa-headset"></i>
                <span>${t('support_center', lang)}</span>
            </button>
            <button class="btn-logout-sidebar" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i>
                <span>${t('sign_out', lang)}</span>
            </button>
        </div>
    `;
}

function buildSidebarNav(userType, currentPage, lang = getAppLanguage()) {
    const config = getSidebarConfig(userType);
    const navId = userType === 'morador'
        ? 'sidebarMorador'
        : userType === 'porteiro'
            ? 'sidebarPorteiro'
            : 'sidebarSindico';

    return `
        <nav class="sidebar-nav" id="${navId}">
            ${config.map((section) => renderSidebarSection(section, userType, currentPage, lang)).join('')}
        </nav>
    `;
}

function renderSidebarSection(section, userType, currentPage, lang = getAppLanguage()) {
    const title = section.titleKey
        ? `<div class="nav-section-title">${escapeSidebarHtml(t(section.titleKey, lang))}</div>`
        : '';

    const items = section.items.map((item) => {
        const target = getTargetForRoute(item.route, userType);
        const targetPage = target.split('#')[0].split('?')[0];
        const currentPathWithSearch = `${currentPage}${window.location.search || ''}`;
        const isActive = target.includes('?')
            ? target === currentPathWithSearch
            : targetPage && targetPage === currentPage && !window.location.search;
        return `
            <a href="${target || '#'}" class="nav-item ${isActive ? 'active' : ''}" data-section="${item.route}">
                <i class="${item.icon}"></i>
                <span>${escapeSidebarHtml(t(item.labelKey, lang))}</span>
            </a>
        `;
    }).join('');

    return `<div class="nav-section">${title}${items}</div>`;
}

function getSidebarConfig(userType) {
    if (userType === 'porteiro') {
        return [
            { items: [{ labelKey: 'home', icon: 'fas fa-home', route: 'inicio' }] },
            {
                titleKey: 'access_control',
                items: [
                    { labelKey: 'visitor_release', icon: 'fas fa-user-check', route: 'porteiro-liberacao' },
                    { labelKey: 'register_visitor', icon: 'fas fa-user-plus', route: 'porteiro-registrar' },
                    { labelKey: 'visitor_entry_exit', icon: 'fas fa-right-left', route: 'porteiro-registro' },
                    { labelKey: 'released_visitors', icon: 'fas fa-circle-check', route: 'porteiro-visitantes' },
                    { labelKey: 'access_history', icon: 'fas fa-clock-rotate-left', route: 'porteiro-historico' }
                ]
            },
            {
                titleKey: 'relationships',
                items: [
                    { labelKey: 'chat_residents', icon: 'fas fa-comments', route: 'chat-moradores' },
                    { labelKey: 'chat_syndic', icon: 'fas fa-user-tie', route: 'chat-sindico' }
                ]
            },
            {
                titleKey: 'emergency_services',
                items: [
                    { labelKey: 'emergency_button', icon: 'fas fa-bell', route: 'porteiro-emergencia' },
                    { labelKey: 'deliveries_authorization', icon: 'fas fa-box-open', route: 'porteiro-entregas' },
                    { labelKey: 'provider_control', icon: 'fas fa-user-gear', route: 'porteiro-prestadores' }
                ]
            },
            {
                titleKey: 'settings',
                items: [{ labelKey: 'settings', icon: 'fas fa-cog', route: 'configuracoes' }]
            }
        ];
    }

    if (userType === 'morador') {
        return [
            { items: [{ labelKey: 'home', icon: 'fas fa-home', route: 'inicio' }] },
            {
                titleKey: 'notices_communications',
                items: [
                    { labelKey: 'mural', icon: 'fas fa-bullhorn', route: 'mural' },
                    { labelKey: 'suggestions', icon: 'fas fa-lightbulb', route: 'sugestoes' },
                    { labelKey: 'notifications', icon: 'fas fa-bell', route: 'notificacoes' }
                ]
            },
            {
                titleKey: 'relationships',
                items: [
                    { labelKey: 'chat_syndic', icon: 'fas fa-comments', route: 'chat-sindico' },
                    { labelKey: 'chat_gatehouse', icon: 'fas fa-door-open', route: 'chat-portaria' },
                    { labelKey: 'lost_found', icon: 'fas fa-search', route: 'achados-perdidos' },
                    { labelKey: 'marketplace', icon: 'fas fa-shopping-bag', route: 'marketplace' }
                ]
            },
            {
                titleKey: 'assemblies',
                items: [
                    { labelKey: 'assembly_plural', icon: 'fas fa-calendar-check', route: 'assembleias' },
                    { labelKey: 'calls', icon: 'fas fa-video', route: 'chamadas' },
                    { labelKey: 'assembly_notices', icon: 'fas fa-comment-dots', route: 'avisos-assembleia' }
                ]
            },
            {
                titleKey: 'reservations_services',
                items: [
                    { labelKey: 'location_reservations', icon: 'fas fa-calendar-alt', route: 'reservas' },
                    { labelKey: 'preventive_maintenance', icon: 'fas fa-tools', route: 'manutencao' }
                ]
            },
            {
                titleKey: 'ai_automation',
                items: [
                    { labelKey: 'ai_questions', icon: 'fas fa-robot', route: 'ia-duvidas' },
                    { labelKey: 'ai_notices', icon: 'fas fa-bell', route: 'comunicados' }
                ]
            },
            {
                titleKey: 'settings',
                items: [{ labelKey: 'settings', icon: 'fas fa-cog', route: 'configuracoes' }]
            }
        ];
    }

    return [
        { items: [{ labelKey: 'home', icon: 'fas fa-home', route: 'inicio' }] },
        {
            titleKey: 'notice_engagement',
            items: [
                { labelKey: 'mural', icon: 'fas fa-bullhorn', route: 'mural' },
                { labelKey: 'suggestions_long', icon: 'fas fa-lightbulb', route: 'sugestoes' }
            ]
        },
        {
            titleKey: 'relationships',
            items: [
                { labelKey: 'chat_residents', icon: 'fas fa-comments', route: 'chat-moradores' },
                { labelKey: 'chat_porter', icon: 'fas fa-door-open', route: 'chat-porteiro' },
                { labelKey: 'lost_found', icon: 'fas fa-search', route: 'achados-perdidos' },
                { labelKey: 'marketplace', icon: 'fas fa-shopping-bag', route: 'marketplace' }
            ]
        },
        {
            items: [
                { labelKey: 'assembly', icon: 'fas fa-calendar-check', route: 'assembleias' },
                { labelKey: 'calls', icon: 'fas fa-video', route: 'chamadas' },
                { labelKey: 'assembly_notices', icon: 'fas fa-comment-dots', route: 'avisos-assembleia' }
            ]
        },
        {
            titleKey: 'resident_management',
            items: [{ labelKey: 'resident_management_link', icon: 'fas fa-users-cog', route: 'gestao-moradores' }]
        },
        {
            titleKey: 'reservations_maintenance',
            items: [
                { labelKey: 'location_reservations', icon: 'fas fa-calendar-alt', route: 'reservas' },
                { labelKey: 'preventive_maintenance', icon: 'fas fa-tools', route: 'manutencao' }
            ]
        },
        {
            titleKey: 'ai_automation',
            items: [
                { labelKey: 'ai_questions', icon: 'fas fa-robot', route: 'ia-duvidas' },
                { labelKey: 'ai_notices', icon: 'fas fa-bell', route: 'comunicados' }
            ]
        },
        {
            titleKey: 'settings',
            items: [{ labelKey: 'settings', icon: 'fas fa-cog', route: 'configuracoes' }]
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

function getSidebarCondoName(user, lang = getAppLanguage()) {
    if (window.communityHub && typeof window.communityHub.getCondominiumName === 'function') {
        return window.communityHub.getCondominiumName(user);
    }

    return user?.condominium?.name
        || user?.condominium?.condominium_name
        || t('your_condo', lang);
}

function formatSidebarCondoName(name, lang = getAppLanguage()) {
    if (window.communityHub && typeof window.communityHub.formatCondoName === 'function') {
        return window.communityHub.formatCondoName(name);
    }

    const words = String(name || '').split(' ').filter(Boolean);
    if (words.length > 2) {
        return `${escapeSidebarHtml(words.slice(0, 2).join(' '))}<br>${escapeSidebarHtml(words.slice(2).join(' '))}`;
    }
    return escapeSidebarHtml(words.join(' ') || t('your_condo', lang));
}

function translateDocument(lang = getAppLanguage()) {
    translateTextNodes(lang);
    translatePlaceholders(lang);
    translateTitle(lang);
}

function translateTextNodes(lang = getAppLanguage()) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let node = walker.nextNode();
    while (node) {
        if (!sidebarTextNodes.has(node)) {
            sidebarTextNodes.set(node, node.nodeValue);
        }
        const original = sidebarTextNodes.get(node);
        node.nodeValue = translateRawText(original, lang);
        node = walker.nextNode();
    }
}

function translateRawText(value, lang = getAppLanguage()) {
    if (lang === 'pt') return value;
    const original = String(value || '');
    const trimmed = original.trim();
    if (!trimmed) return original;

    const translated = textTranslations[lang]?.[trimmed];
    if (translated) {
        return original.replace(trimmed, translated);
    }

    const greetingMorning = trimmed.match(/^Bom dia,\s*(.+)!$/i);
    if (greetingMorning) {
        return original.replace(trimmed, `Good morning, ${greetingMorning[1]}!`);
    }

    const greetingHello = trimmed.match(/^Olá,\s*(.+)!$/i);
    if (greetingHello) {
        return original.replace(trimmed, `Hello, ${greetingHello[1]}!`);
    }

    return original;
}

function translatePlaceholders(lang = getAppLanguage()) {
    document.querySelectorAll('[placeholder]').forEach((element) => {
        if (!sidebarPlaceholderNodes.has(element)) {
            sidebarPlaceholderNodes.set(element, element.getAttribute('placeholder') || '');
        }
        const original = sidebarPlaceholderNodes.get(element);
        const translated = lang === 'en'
            ? (placeholderTranslations.en[original] || original)
            : original;
        element.setAttribute('placeholder', translated);
    });
}

function translateTitle(lang = getAppLanguage()) {
    const currentTitle = document.title || '';
    if (lang === 'pt') {
        const original = document.documentElement.getAttribute('data-title-pt');
        if (original) document.title = original;
        return;
    }

    if (!document.documentElement.getAttribute('data-title-pt')) {
        document.documentElement.setAttribute('data-title-pt', currentTitle);
    }

    const titleMap = {
        'Condomit - Configurações': 'Condomit - Settings',
        'Condomit - Notificações': 'Condomit - Notifications',
        'Condomit - Marketplace': 'Condomit - Marketplace',
        'Condomit - Achados e Perdidos': 'Condomit - Lost and Found',
        'Condomit - Gestão de Moradores': 'Condomit - Resident Management',
        'Condomit - Manutenção Preventiva': 'Condomit - Preventive Maintenance',
        'Condomit - Registrar Visitantes': 'Condomit - Register Visitors',
        'Condomit - Painel do Porteiro': 'Condomit - Porter Dashboard',
        'Condomit - Liberação de Visitantes': 'Condomit - Visitor Release',
        'Condomit - Registro de Entrada e Saída': 'Condomit - Entry and Exit Log',
        'Condomit - Autorização de Entregas': 'Condomit - Delivery Authorization',
        'Condomit - Controle de Prestadores': 'Condomit - Provider Control'
    };

    document.title = titleMap[currentTitle] || currentTitle;
}

function escapeSidebarHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
