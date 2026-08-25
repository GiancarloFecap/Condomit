// ═══════════════════════════════════════════════════════════════
// DASHBOARD DO MORADOR - SCRIPT PRINCIPAL
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async function() {
    // Dados globais
    let currentUser = null;
    let condominiumData = null;
    let userCondominiumData = null;

    // ═══════════════════════════════════════════════════════════════
    // FUNÇÕES UTILITÁRIAS
    // ═══════════════════════════════════════════════════════════════

    async function proxyFetch(path, options = {}) {
        const response = await fetch(path, options);
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (error) {
            data = text;
        }

        if (!response.ok) {
            const message = data?.error || data?.message || response.statusText || 'Erro no servidor';
            throw new Error(message);
        }

        return data;
    }

    // Extrair primeiro nome a partir do nome completo
    function getFirstName(fullName) {
        if (!fullName) return 'Morador';
        const parts = fullName.trim().split(' ');
        return parts[0];
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENT LISTENERS - SIDEBAR
    // ═══════════════════════════════════════════════════════════════

    // Navegação do sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href !== '' && href !== '#') {
                return;
            }
            const section = this.dataset.section;

            if (section === 'inicio') {
                window.location.href = 'index-morador.html';
                return;
            }

            if (!section) {
                return;
            }

            e.preventDefault();

            // Remover classe active anterior
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // VERIFICAÇÃO DE AUTENTICAÇÃO E VÍNCULO
    // ═══════════════════════════════════════════════════════════════

    async function checkAuthAndBind() {
        try {
            // 1. Obter usuário logado do sessionStorage OU localStorage (persistent)
            let raw = sessionStorage.getItem('condominiumUser');
            if (!raw) {
                try {
                    const persistRaw = localStorage.getItem('condominiumPersistentUser');
                    if (persistRaw) {
                        const persist = JSON.parse(persistRaw);
                        if (persist && persist.email && typeof fetchUserByEmail === 'function') {
                            const fresh = await fetchUserByEmail(persist.email).catch(() => null);
                            if (fresh) {
                                const restored = { ...fresh };
                                delete restored.password;
                                sessionStorage.setItem('condominiumUser', JSON.stringify(restored));
                                raw = sessionStorage.getItem('condominiumUser');
                                if (typeof syncAllAvatars === 'function') syncAllAvatars(restored);
                            }
                        }
                    }
                } catch (_) {}
            }
            const loggedInUser = raw;
            
            if (!loggedInUser) {
                // Se não há usuário logado, redirecionar para login
                window.location.href = 'entrar.html';
                return;
            }

            currentUser = JSON.parse(loggedInUser);

            // 1.1 Atualizar foto/nome/telefone do banco para este morador
            try {
                if (typeof refreshCurrentUserFromDb === 'function') {
                    const refreshed = await refreshCurrentUserFromDb();
                    if (refreshed) currentUser = refreshed;
                } else {
                    if (currentUser.email && typeof fetchUserByEmail === 'function') {
                        const fresh = await fetchUserByEmail(currentUser.email).catch(() => null);
                        if (fresh) {
                            const updated = { ...currentUser, ...fresh };
                            delete updated.password;
                            if (fresh.condominium && typeof fresh.condominium === 'object' && currentUser.condominium) {
                                updated.condominium = { ...currentUser.condominium, ...fresh.condominium };
                            } else if (fresh.condominium) {
                                try { updated.condominium = typeof fresh.condominium === 'string' ? JSON.parse(fresh.condominium) : fresh.condominium; } catch (_) {}
                            }
                            sessionStorage.setItem('condominiumUser', JSON.stringify(updated));
                            currentUser = updated;
                        }
                    }
                }
                if (typeof syncAllAvatars === 'function') syncAllAvatars(currentUser);
            } catch (_) {}

            // 2. Verificar se o tipo é morador
            if (currentUser.type !== 'morador') {
                window.location.href = 'tipo-usuario.html';
                return;
            }

            // 3. Buscar registro na tabela user_condominiums
            const userCondominiumResponse = await proxyFetch(
                `/api/user_condominiums?user_email=eq.${encodeURIComponent(currentUser.email)}`
            );

            if (!userCondominiumResponse || userCondominiumResponse.length === 0) {
                if (currentUser.condominium && currentUser.condominium.condominium_id) {
                    userCondominiumData = currentUser.condominium;
                } else {
                    // Se não existe vinculação, redirecionar para entrar-condominio
                    window.location.href = 'entrar-condominio.html';
                    return;
                }
            } else {
                userCondominiumData = userCondominiumResponse[0];
            }

            // 4. Buscar dados do condomínio
            const condominiumCep = userCondominiumData.condominium_id || userCondominiumData.condominiumId;
            const condominiumResponse = await proxyFetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(condominiumCep)}`
            );

            if (!condominiumResponse || condominiumResponse.length === 0) {
                console.error('Condomínio não encontrado');
                return;
            }

            condominiumData = condominiumResponse[0];

            // 5. Renderizar dados na página
            await renderDashboard();
        } catch (error) {
            console.error('Erro ao verificar autenticação e vínculo:', error);
            // Em caso de erro, ainda permitir uso da dashboard
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDERIZAÇÃO DA DASHBOARD
    // ═══════════════════════════════════════════════════════════════

    async function renderDashboard() {
        try {
            // Exibir primeiro nome no cabeçalho
            const firstName = getFirstName(currentUser.name);
            document.getElementById('firstName').textContent = firstName;

            // Preencher nome do usuário no topbar
            document.getElementById('profileNameTop').textContent = currentUser.name;
            
            // Calcular iniciais para avatar
            const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const avatarEl = document.getElementById('profileAvatarTop');
            if (avatarEl) {
                avatarEl.textContent = initials;
            }

            // Exibir nome do condomínio na sidebar embaixo da logo
            const sidebarApart = document.getElementById('sidebarApartment');
            if (sidebarApart) {
                const condoName = condominiumData?.condominium_name || userCondominiumData?.condominium_name || "Seu Condomínio";
                sidebarApart.textContent = condoName;
            }
        } catch (error) {
            console.error('Erro ao renderizar dashboard:', error);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════════

    await checkAuthAndBind();
});
function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    try { sessionStorage.removeItem('condominiumUser'); } catch(_) {}
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}
