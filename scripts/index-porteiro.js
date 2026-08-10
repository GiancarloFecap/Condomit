document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.btn-support').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = 'mailto:contato.condomit@gmail.com?subject=Contato%20Condomit';
        });
    });

    let currentUser = null;
    try {
        currentUser = typeof refreshCurrentUserFromDb === 'function'
            ? await refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
    } catch (_) {
        currentUser = null;
    }

    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }

    const userType = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(currentUser)
        : String(currentUser.type || currentUser.user_type || '').trim().toLowerCase();

    if (userType !== 'porteiro') {
        if (typeof redirectToHome === 'function') redirectToHome();
        else window.location.href = 'index.html';
        return;
    }

    // A conclusão do cadastro é conferida no banco. Isso evita o redirecionamento
    // momentâneo causado pelas antigas flags de sessionStorage.
    const linkedCep = await resolveCurrentCondoCep();
    if (!linkedCep) {
        window.location.href = 'entrar-condominio-porteiro.html';
        return;
    }

    if (!currentUser.condominium || typeof currentUser.condominium !== 'object') {
        currentUser.condominium = {};
    }
    currentUser.condominium.cep = currentUser.condominium.cep || linkedCep;
    currentUser.condominium.condominium_id = currentUser.condominium.condominium_id || linkedCep;

    try {
        const rows = await window.supabaseFetch(`/condominiums?select=cep,condominium_name&cep=eq.${encodeURIComponent(linkedCep)}&limit=1`);
        const condo = Array.isArray(rows) ? rows[0] : rows;
        if (condo?.condominium_name) currentUser.condominium.name = condo.condominium_name;
    } catch (_) {}

    sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));

    setupPorterShell(currentUser);
    bindQuickActions();
    await Promise.allSettled([
        loadOverviewCounts(),
        loadDashboardPackages(),
        loadDashboardProviders()
    ]);

    window.setInterval(() => {
        if (!document.hidden) {
            loadOverviewCounts();
            loadDashboardPackages();
        }
    }, 15000);
});

async function rpc(name, payload = {}) {
    if (typeof window.supabaseFetch !== 'function') throw new Error('Supabase indisponível.');
    return window.supabaseFetch(`/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function resolveCurrentCondoCep() {
    try {
        const result = await rpc('condomit_current_user_cep');
        return typeof result === 'string' ? result : '';
    } catch (error) {
        console.warn('Não foi possível validar o vínculo do porteiro:', error?.message || error);
        return '';
    }
}

function setupPorterShell(currentUser) {
    const profileNameTop = document.getElementById('profileNameTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    const sidebarApartment = document.getElementById('sidebarApartment');
    const greetingTitle = document.getElementById('greetingTitle');
    const currentDateLabel = document.getElementById('currentDateLabel');

    const fullName = currentUser.name || 'Porteiro';
    const firstName = fullName.split(' ')[0];
    const initials = getInitials(fullName);
    const photo = currentUser.profilePhoto || currentUser.profile_photo || '';

    if (profileNameTop) profileNameTop.textContent = fullName;
    if (profileAvatarTop) {
        profileAvatarTop.innerHTML = photo
            ? `<img src="${escapeHtml(photo)}" alt="Foto de perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : initials;
    }
    if (greetingTitle) greetingTitle.textContent = `Bom dia, ${firstName}!`;

    if (sidebarApartment && currentUser.condominium?.name) {
        const words = currentUser.condominium.name.split(' ');
        sidebarApartment.innerHTML = words.length > 2
            ? `${escapeHtml(words.slice(0, 2).join(' '))}<br>${escapeHtml(words.slice(2).join(' '))}`
            : escapeHtml(currentUser.condominium.name);
    }

    if (currentDateLabel) {
        currentDateLabel.textContent = new Date().toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
        }).replace(',', ' -');
    }

    if (typeof window.initPorterTopBar === 'function') window.initPorterTopBar(currentUser);
    if (typeof window.syncAllAvatars === 'function') window.syncAllAvatars(currentUser);

    document.querySelector('.danger-btn')?.addEventListener('click', () => {
        window.location.href = 'tel:+5511974409806';
    });
    const topProfileBlock = document.getElementById('topProfileBlock');
    if (topProfileBlock) {
        topProfileBlock.style.cursor = 'pointer';
        topProfileBlock.addEventListener('click', () => window.location.href = 'configuracoes.html');
    }
    document.getElementById('topUserBtn')?.addEventListener('click', () => {
        window.location.href = 'configuracoes.html#editar-perfil';
    });
}

async function loadOverviewCounts() {
    try {
        const [released, waitingPackages, providers] = await Promise.all([
            rpc('condomit_count_released_visitors').catch(() => 0),
            rpc('condomit_count_waiting_packages').catch(() => 0),
            loadProviders().catch(() => [])
        ]);

        setText('releasedVisitorsOverview', Number(released) || 0);
        setText('waitingPackagesOverview', Number(waitingPackages) || 0);
        setText('authorizedProvidersOverview', providers.length);
    } catch (error) {
        console.warn('Erro ao atualizar indicadores da portaria:', error);
    }
}

async function loadProviders() {
    if (typeof window.supabaseFetch !== 'function') return [];
    const rows = await window.supabaseFetch('/service_providers?select=email,provider_name,service,initial_status,service_window&order=created_at.desc&limit=100');
    return (Array.isArray(rows) ? rows : []).filter((row) => String(row?.initial_status || '').toLowerCase() !== 'cancelado');
}

async function loadDashboardPackages() {
    const list = document.querySelector('#entregas .simple-list');
    if (!list) return;
    try {
        const rows = await rpc('condomit_list_packages');
        const pending = (Array.isArray(rows) ? rows : [])
            .filter((row) => row.status === 'Aguardando retirada')
            .slice(0, 3);
        list.innerHTML = pending.length
            ? pending.map((pkg) => `<li>${escapeHtml(pkg.recipient_name)}${pkg.block || pkg.apartment ? ` — ${escapeHtml([pkg.block ? `Bloco ${pkg.block}` : '', pkg.apartment ? `Apto ${pkg.apartment}` : ''].filter(Boolean).join(' • '))}` : ''}</li>`).join('')
            : '<li>Nenhuma encomenda aguardando retirada.</li>';
    } catch (_) {
        list.innerHTML = '<li>Não foi possível carregar as encomendas.</li>';
    }
}

async function loadDashboardProviders() {
    const list = document.querySelector('#prestadores .simple-list');
    if (!list) return;
    try {
        const providers = (await loadProviders()).slice(0, 3);
        list.innerHTML = providers.length
            ? providers.map((provider) => `<li>${escapeHtml(provider.provider_name || 'Prestador')} — ${escapeHtml(provider.service || 'Serviço')}</li>`).join('')
            : '<li>Nenhum prestador autorizado.</li>';
    } catch (_) {
        list.innerHTML = '<li>Não foi possível carregar os prestadores.</li>';
    }
}

function bindQuickActions() {
    const quickRoutes = {
        'liberacao-visitantes': 'liberacao-visitantes.html',
        'registrar-visitante': 'registrar-visitantes.html',
        'registro-acesso': 'registro-entrada-saida.html',
        'visitantes-liberados': 'visitantes-liberados.html',
        'historico-acesso': 'registro-entrada-saida.html'
    };

    Object.entries(quickRoutes).forEach(([cardId, target]) => {
        const card = document.getElementById(cardId);
        const button = card?.querySelector('button');
        if (!card || !button) return;
        card.style.cursor = 'pointer';
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        button.addEventListener('click', () => window.location.href = target);
        card.addEventListener('click', (event) => {
            if (!event.target.closest('button')) window.location.href = target;
        });
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.location.href = target;
            }
        });
    });
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

function getInitials(name) {
    return String(name || 'PT').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'PT';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
