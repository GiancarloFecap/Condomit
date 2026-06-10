document.addEventListener('DOMContentLoaded', async function() {
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }

    // Se for síndico, verificar se tem plano
    if (currentUser.type === 'sindico' && !currentUser.plan) {
        window.location.href = 'checkout.html';
        return;
    }

    // Se for morador e não tem o nome do condomínio no sessionStorage, busca via API
    if (currentUser.type === 'morador' && currentUser.condominium?.condominium_id && !currentUser.condominium?.name) {
        try {
            const proxyFetch = async (path, options = {}) => {
                const response = await fetch(path, options);
                const data = await response.json().catch(() => null);
                if (!response.ok) {
                    const message = data?.error || data?.message || response.statusText || 'Erro no servidor';
                    throw new Error(message);
                }
                return data;
            };

            const condominiumResponse = await proxyFetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(currentUser.condominium.condominium_id)}`
            );

            if (condominiumResponse && condominiumResponse.length > 0) {
                currentUser.condominium.name = condominiumResponse[0].condominium_name;
                sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
            }
        } catch (error) {
            console.error('Erro ao buscar nome do condomínio:', error);
        }
    }

    updateUIWithUserData(currentUser);
    initPreferences();
});

function updateUIWithUserData(currentUser) {
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const userTypeLabel = currentUser.type === 'sindico' ? 'Síndico' : 'Morador';

    // Top bar avatar
    const topAvatar = document.getElementById('user-avatar-top');
    if (topAvatar) {
        if (currentUser.profilePhoto) {
            topAvatar.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Avatar" />`;
            topAvatar.style.background = 'none';
        } else {
            topAvatar.textContent = initials;
            topAvatar.style.background = '';
        }
    }

    // Top bar user info
    const topName = document.getElementById('user-name-top');
    const topType = document.getElementById('user-type-top');

    if (topName) topName.textContent = currentUser.name;
    if (topType) topType.textContent = userTypeLabel;

    // Profile preview card
    const cardName = document.getElementById('profile-name-card');
    const cardType = document.getElementById('profile-type-card');
    const cardEmail = document.getElementById('profile-email-card');
    const cardAvatar = document.getElementById('profile-avatar-card');

    if (cardName) cardName.textContent = currentUser.name;
    if (cardType) cardType.textContent = userTypeLabel;
    if (cardEmail) cardEmail.textContent = currentUser.email || 'Não informado';

    if (cardAvatar) {
        if (currentUser.profilePhoto) {
            cardAvatar.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Avatar" />`;
            cardAvatar.style.background = 'none';
        } else {
            cardAvatar.textContent = initials;
            cardAvatar.style.background = '';
        }
    }

    // Profile details list
    const fullNameEl = document.getElementById('detail-full-name');
    const unitEl = document.getElementById('detail-unit');
    const typeEl = document.getElementById('detail-user-type');
    const emailEl = document.getElementById('detail-email');
    const phoneEl = document.getElementById('detail-phone');

    if (fullNameEl) fullNameEl.textContent = currentUser.name;
    if (typeEl) typeEl.textContent = userTypeLabel;
    if (emailEl) emailEl.textContent = currentUser.email || 'Não informado';
    if (phoneEl) phoneEl.textContent = currentUser.phone || 'Não informado';

    if (unitEl) {
        if (currentUser.type === 'sindico') {
            unitEl.textContent = 'Administração';
        } else {
            const apt = currentUser.condominium?.apartment || '---';
            const bloco = currentUser.condominium?.block || '---';
            unitEl.textContent = `Apt ${apt} - Bloco ${bloco}`;
        }
    }

    // Sidebar condo name
    if (currentUser.condominium) {
        const sidebarCondoNameEl = document.querySelector('.condo-name');
        if (sidebarCondoNameEl) {
            const words = currentUser.condominium.name.split(' ');
            if (words.length > 2) {
                sidebarCondoNameEl.innerHTML = `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`;
            } else {
                sidebarCondoNameEl.textContent = currentUser.condominium.name;
            }
        }
    }

    const inicioLink = document.getElementById('inicio-link');
    if (inicioLink) {
        const userType = (currentUser.type || '').toLowerCase();
        const targetPage = userType === 'morador' ? 'index-morador.html' : 'index.html';
        inicioLink.href = targetPage;
        inicioLink.addEventListener('click', function(event) {
            event.preventDefault();
            window.location.href = targetPage;
        });
    }
}

function logout() {
    if (confirm('Tem certeza que deseja sair da conta?')) {
        sessionStorage.removeItem('condominiumUser');
        window.location.href = 'inicio.html';
    }
}

function openConfigSection(sectionKey) {
    switch (sectionKey) {
        case 'foto-de-perfil':
            document.getElementById('profile-photo-input')?.click();
            break;
        case 'dados-pessoais':
        case 'minha-unidade':
        case 'meus-condominos':
        case 'alterar-senha':
        case 'autenticacao-2fa':
        case 'controle-acesso':
        case 'comunicados-sindico':
        case 'avisos-gerais':
        case 'reserva-areas':
        case 'encomendas':
        case 'minhas-reservas':
        case 'lembretes-reserva':
        case 'confirmacao-cancelamento':
        case 'reserva-area-comum':
        case 'politica-privacidade':
        case 'termos-uso':
        case 'consentimentos':
        case 'info-condominio':
        case 'contato-uteis':
        case 'prestadores-servicos':
        case 'sobre-empresa':
        case 'versao-app':
        case 'novas-atualizacoes':
        case 'editar-perfil':
            alert(`Funcionalidade ainda não implementada: ${sectionKey.replace(/-/g, ' ')}`);
            break;
        default:
            console.warn('Seção desconhecida de configurações:', sectionKey);
    }
}

function setTheme(theme) {
    if (typeof applyTheme === 'function') {
        applyTheme(theme);
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app-theme', theme);
        updateControlButtons('theme', theme);
    }
}

function setFontSize(size) {
    if (typeof applyFontSize === 'function') {
        applyFontSize(size);
    } else {
        document.documentElement.setAttribute('data-font', size);
        localStorage.setItem('app-font-size', size);
        updateControlButtons('font', size);
    }
}

function setLanguage(lang) {
    localStorage.setItem('app-language', lang);
    applyTranslations(lang);
}

const translations = {
    pt: {
        config_title: 'Configurações',
        config_subtitle: 'Personalize e gerencie as configurações do sistema',
        theme_label: 'Tema',
        font_size_label: 'Tamanho da fonte',
        language_label: 'Idioma',
        user_profile: 'Perfil do usuário',
        account_profile: 'Conta e Perfil',
        security: 'Segurança e acesso',
        notifications: 'Notificações',
        about: 'Sobre',
        logout: 'Sair da Conta',
    },
    en: {
        config_title: 'Settings',
        config_subtitle: 'Personalize and manage system settings',
        theme_label: 'Theme',
        font_size_label: 'Font size',
        language_label: 'Language',
        user_profile: 'User Profile',
        account_profile: 'Account and Profile',
        security: 'Security and Access',
        notifications: 'Notifications',
        about: 'About',
        logout: 'Sign Out',
    }
};

function applyTranslations(lang) {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
}

function updateControlButtons(type, value) {
    if (type === 'theme') {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`theme-${value}`);
        if (activeBtn) activeBtn.classList.add('active');
    } else if (type === 'font') {
        document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`font-${value}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
}

function initPreferences() {
    const theme = localStorage.getItem('app-theme') || 'light';
    const fontSize = localStorage.getItem('app-font-size') || 'medium';
    const language = localStorage.getItem('app-language') || 'pt';

    setTheme(theme);
    setFontSize(fontSize);
    setLanguage(language);

    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.value = language;
    }
}

function updateProfilePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const imageData = e.target.result;
        const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
        if (!currentUser) return;

        currentUser.profilePhoto = imageData;
        sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
        updateUIWithUserData(currentUser);
        
        // Sincroniza o avatar em todas as páginas
        if (typeof syncAllAvatars === 'function') {
            syncAllAvatars(currentUser);
        }
    };
    reader.readAsDataURL(file);
}
