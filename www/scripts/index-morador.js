 
 
 

 
const residentOverviewStrings = {
  pt: {dashboard:'PAINEL DO MORADOR',greeting:'Olá',subtitle:'Acompanhe o que é importante no seu condomínio.',condoFallback:'Meu condomínio',notices:'Mural de avisos',noticesDesc:'Informações e comunicados da administração.',reservations:'Minhas reservas',reservationsDesc:'Consulte ou agende áreas comuns.',assemblies:'Assembleias',assembliesDesc:'Confira reuniões e decisões do condomínio.',suggestionPrompt:'Tem uma sugestão para melhorar o condomínio?',suggestionCta:'Enviar sugestão'},
  en: {dashboard:'RESIDENT DASHBOARD',greeting:'Hello',subtitle:'Keep up with what matters in your condominium.',condoFallback:'My condominium',notices:'Notice board',noticesDesc:'News and announcements from management.',reservations:'My reservations',reservationsDesc:'View or book shared spaces.',assemblies:'Meetings',assembliesDesc:'Review meetings and condominium decisions.',suggestionPrompt:'Have a suggestion for your condominium?',suggestionCta:'Send suggestion'}
};
function applyResidentOverviewLanguage() {
  let choice = 'auto';
  try { choice = localStorage.getItem('app-language') || 'auto'; } catch (_) {}
  const lang = (typeof window.getCondomitResolvedLanguage === 'function' ? window.getCondomitResolvedLanguage() : (choice === 'auto' ? (/^pt(?:-|$)/i.test((navigator.languages || [navigator.language || 'pt'])[0]) ? 'pt' : 'en') : choice)) === 'en' ? 'en' : 'pt';
  document.querySelectorAll('[data-resident-i18n]').forEach(el => {
    if (el.id === 'residentCondoName' && el.dataset.hasRealCondo === '1') return;
    const value = residentOverviewStrings[lang][el.dataset.residentI18n];
    if (value) el.textContent = value;
  });
}
window.addEventListener('condomit:language-changed', applyResidentOverviewLanguage);
window.addEventListener('storage', event => { if (event.key === 'app-language') applyResidentOverviewLanguage(); });

document.addEventListener('DOMContentLoaded', async function() {
    applyResidentOverviewLanguage();
     
    let currentUser = null;
    let condominiumData = null;
    let userCondominiumData = null;

     
     
     

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

     
    function getFirstName(fullName) {
        if (!fullName) return 'Morador';
        const parts = fullName.trim().split(' ');
        return parts[0];
    }

     
     
     

     
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

             
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });

     
     
     

    async function checkAuthAndBind() {
        try {
             
            let raw = sessionStorage.getItem('condominiumUser');
            if (!raw) {
                try {
                    const persistRaw = localStorage.getItem('condominiumPersistentUser');
                    if (persistRaw) {
                        const persist = JSON.parse(persistRaw);
                        if (persist && persist.email && typeof fetchUserByEmail === 'function') {
                            const fresh = await fetchUserByEmail(persist.email).catch(() => null);
                            if (fresh) {
                                const restored = { ...fresh, password: fresh.password || null };
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
                 
                window.location.href = 'entrar.html';
                return;
            }

            currentUser = JSON.parse(loggedInUser);

             
             
            try {
                const firstNameEl = document.getElementById('firstName');
                if (firstNameEl) firstNameEl.textContent = getFirstName(currentUser.name);
                const profileNameEl = document.getElementById('profileNameTop');
                if (profileNameEl) profileNameEl.textContent = currentUser.name || 'Morador';
                const avatarEl = document.getElementById('profileAvatarTop');
                if (avatarEl && currentUser.name) avatarEl.textContent = currentUser.name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
                const sidebarApart = document.getElementById('sidebarApartment');
                const cachedCondoName = currentUser?.condominium?.name || currentUser?.condominium?.condominium_name;
                if (sidebarApart && cachedCondoName) sidebarApart.textContent = cachedCondoName;
                window.syncAllAvatars?.(currentUser);
            } catch (_) {}

             
             
            try {
                if (typeof refreshCurrentUserFromDb === 'function') {
                    const refreshed = await Promise.race([refreshCurrentUserFromDb(), new Promise(resolve => setTimeout(() => resolve(null), 900))]);
                    if (refreshed) currentUser = refreshed;
                } else {
                    if (currentUser.email && typeof fetchUserByEmail === 'function') {
                        const fresh = await fetchUserByEmail(currentUser.email).catch(() => null);
                        if (fresh) {
                            const updated = { ...currentUser, ...fresh, password: currentUser.password || fresh.password };
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

             
            if (currentUser.type !== 'morador') {
                window.location.href = 'tipo-usuario.html';
                return;
            }

             
            const userCondominiumResponse = await proxyFetch(
                `/api/user_condominiums?user_email=eq.${encodeURIComponent(currentUser.email)}`
            );

            if (!userCondominiumResponse || userCondominiumResponse.length === 0) {
                if (currentUser.condominium && currentUser.condominium.condominium_id) {
                    userCondominiumData = currentUser.condominium;
                } else {
                     
                    window.location.href = 'entrar-condominio.html';
                    return;
                }
            } else {
                userCondominiumData = userCondominiumResponse[0];
            }

             
            const condominiumCep = userCondominiumData.condominium_id || userCondominiumData.condominiumId;
            const condominiumResponse = await proxyFetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(condominiumCep)}`
            );

            if (!condominiumResponse || condominiumResponse.length === 0) {
                console.error('Condomínio não encontrado');
                return;
            }

            condominiumData = condominiumResponse[0];

             
            await renderDashboard();
        } catch (error) {
            console.error('Erro ao verificar autenticação e vínculo:', error);
            // Em caso de erro, ainda permitir uso da dashboard
        }
    }

     
     
     

    async function renderDashboard() {
        try {
             
            const firstName = getFirstName(currentUser.name);
            document.getElementById('firstName').textContent = firstName;

             
            document.getElementById('profileNameTop').textContent = currentUser.name;
            
             
            const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const avatarEl = document.getElementById('profileAvatarTop');
            if (avatarEl) {
                avatarEl.textContent = initials;
            }

            const condoLabel = document.getElementById('residentCondoName');
            if (condoLabel) {
                const condoName = condominiumData?.condominium_name || condominiumData?.name || userCondominiumData?.condominium_name || currentUser?.condominium?.name;
                if (condoName) { condoLabel.textContent = condoName; condoLabel.dataset.hasRealCondo = '1'; }
            }

             
            const sidebarApart = document.getElementById('sidebarApartment');
            if (sidebarApart) {
                const condoName = condominiumData?.condominium_name || userCondominiumData?.condominium_name || "Seu Condomínio";
                sidebarApart.textContent = condoName;
            }
        } catch (error) {
            console.error('Erro ao renderizar dashboard:', error);
        }
    }

     
     
     

    document.querySelectorAll('[data-resident-route]').forEach(link => link.addEventListener('click', event => {
        const route = link.dataset.residentRoute;
        if (typeof window.canCondomitUseRoute === 'function' && !window.canCondomitUseRoute(route)) {
            event.preventDefault();
            window.navigateTo?.(route);
        }
    }));
    await checkAuthAndBind();
});
function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    try { sessionStorage.removeItem('condominiumUser'); } catch(_) {}
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}
