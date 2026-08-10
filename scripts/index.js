async function fetchApprovedPayment(email) {
    try {
        const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
        if (!response.ok) return null;
        const payments = await response.json();
        return payments.find(p => p.status_pagamento === 'aprovado');
    } catch (error) {
        console.error('Error checking payment:', error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is logged in
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }
    
    // Check if user is sindico and has condo registered
    if (currentUser.type === 'sindico') {
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        // O usuário só pode acessar o index se tiver pagamento APROVADO no banco
        if (!approvedPayment) {
            // Limpa o plano do sessionStorage para evitar inconsistência
            delete currentUser.plan;
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
            window.location.href = 'checkout.html';
            return;
        }
        // Atualizar o usuário com o plano se houver pagamento aprovado
        if (approvedPayment && (!currentUser.plan || currentUser.plan !== approvedPayment.plano_id)) {
            currentUser.plan = approvedPayment.plano_id;
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
        }
        if (!currentUser.condominium) {
            window.location.href = 'condominio_register.html';
            return;
        }
    }

    const userType = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(currentUser)
        : String(currentUser.type || 'sindico').trim().toLowerCase();

    if (typeof applyGlobalAppLanguage === 'function') {
        try {
            applyGlobalAppLanguage(currentUser, userType);
        } catch (_) {}
    } else if (typeof renderSidebar === 'function') {
        try {
            renderSidebar(currentUser, userType, window.location.pathname.split('/').pop() || 'index.html');
        } catch (_) {}
    }

    if (typeof bindSupportButtons === 'function') {
        try { bindSupportButtons('mailto:contato.condomit@gmail.com?subject=Contato%20Condomit'); } catch (_) {}
    }
    
    // Update user info
    const userName = currentUser.name || 'Síndico';
    const firstName = userName.split(' ')[0];
    
    // Update greeting
    const greetingEl = document.querySelector('.top-bar-left h1');
    if (greetingEl) {
        greetingEl.textContent = `Olá, ${firstName}!`;
    }
    
    const avatar = document.querySelector('.user-profile-small .avatar');
    const nameEl = document.querySelector('.user-info-small .name');
    
    if (avatar && nameEl) {
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        avatar.textContent = initials;
        nameEl.textContent = userName;
        
        // Sincroniza avatar de perfil se houver foto armazenada
        if (typeof syncAllAvatars === 'function') {
            syncAllAvatars(currentUser);
        }
    }
    
    // Update sidebar condo name
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

        // Update status section
        const condoNameEl = document.querySelector('.status-item:nth-child(1) span');
        if (condoNameEl) {
            condoNameEl.textContent = `Nome do Condomínio: ${currentUser.condominium.name}`;
        }
        
        const totalAptsEl = document.querySelector('.status-item:nth-child(2) span');
        if (totalAptsEl) {
            totalAptsEl.textContent = `Total de Apartamentos: ${currentUser.condominium.totalApartments}`;
        }

        const activeResidentsEl = document.querySelector('.status-item:nth-child(3) span');
        if (activeResidentsEl) {
            activeResidentsEl.textContent = 'Moradores Ativos: carregando...';
        }

        const nextAssemblyEl = document.querySelector('.status-item:nth-child(4) span');
        if (nextAssemblyEl) {
            nextAssemblyEl.textContent = 'Próxima Assembleia: carregando...';
        }

        const pendingNoticesEl = document.querySelector('.status-item:nth-child(5) span');
        if (pendingNoticesEl) {
            pendingNoticesEl.textContent = 'Avisos Pendentes: carregando...';
        }

        loadResidents(currentUser.condominium.cep);
        loadUpcomingAssembly(currentUser.condominium.cep);
        loadPendingNotices(currentUser.condominium.cep);
        loadDashboardMaintenance(currentUser.condominium.cep);
    }

    const userProfileSmall = document.querySelector('.user-profile-small');
    if (userProfileSmall) {
        userProfileSmall.style.cursor = 'pointer';
        userProfileSmall.addEventListener('click', () => {
            window.location.href = 'configuracoes.html';
        });
    }

    const iconBtns = document.querySelectorAll('.top-icons .icon-btn');
    if (iconBtns && iconBtns.length > 0) {
        const lastIconBtn = iconBtns[iconBtns.length - 1];
        if (lastIconBtn) {
            lastIconBtn.addEventListener('click', () => {
                window.location.href = 'configuracoes.html#editar-perfil';
            });
        }
    }

    const quickActionBtns = document.querySelectorAll('.quick-action-btn');
    quickActionBtns.forEach((btn) => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('enviar aviso') || text.includes('aviso')) {
            btn.addEventListener('click', () => {
                window.location.href = 'notificacoes.html';
            });
        } else if (text.includes('agendar reunião') || text.includes('agendar reuniao') || text.includes('reunião') || text.includes('reuniao')) {
            btn.addEventListener('click', () => {
                window.location.href = 'assembleia.html';
            });
        } else if (text.trim() === 'chat' || /(^|\s)chat(\s|$)/i.test(btn.textContent)) {
            btn.addEventListener('click', () => {
                window.location.href = 'chat-moradores.html';
            });
        }
    });

    const commBtns = document.querySelectorAll('.comm-btn');
    commBtns.forEach((btn) => {
        const text = btn.textContent.toLowerCase();
        if (text.includes('e-mail') || text.includes('email') || text.includes('mail')) {
            btn.addEventListener('click', () => {
                window.location.href = 'mailto:contato.condomit@gmail.com?subject=Contato%20Condomit';
            });
        }
    });
});


async function loadDashboardMaintenance(cep) {
    const container = document.getElementById('dashboardMaintenanceList');
    if (!container) return;

    const digits = String(cep || '').replace(/\D/g, '');
    if (digits.length !== 8 || typeof window.supabaseFetch !== 'function') {
        container.innerHTML = '<div class="maintenance-item"><i class="fas fa-calendar-xmark"></i><span>Nenhuma manutenção programada.</span></div>';
        return;
    }

    try {
        const rows = await window.supabaseFetch(
            '/maintenance_items?select=id,cep,title,location,next_date,status&order=next_date.asc&limit=50'
        );
        const today = new Date().toISOString().slice(0, 10);
        const items = (Array.isArray(rows) ? rows : [])
            .filter((item) => String(item?.cep || '').replace(/\D/g, '') === digits)
            .filter((item) => String(item.status || '').toLowerCase() !== 'concluida' && String(item.next_date || '') >= today)
            .slice(0, 3);

        if (!items.length) {
            container.innerHTML = '<div class="maintenance-item"><i class="fas fa-calendar-check"></i><span>Nenhuma manutenção futura programada.</span></div>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const date = item.next_date ? item.next_date.split('-').reverse().join('/') : '--';
            return `<div class="maintenance-item"><i class="fas fa-wrench"></i><span>${escapeDashboardHtml(item.title)} - ${escapeDashboardHtml(item.location)} <small>(${date})</small></span></div>`;
        }).join('');
    } catch (error) {
        console.error('Erro ao carregar manutenções do painel:', error);
        container.innerHTML = '<div class="maintenance-item"><i class="fas fa-circle-exclamation"></i><span>Não foi possível carregar as manutenções.</span></div>';
    }
}

function escapeDashboardHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function loadResidents(cep) {
    const tableBody = document.getElementById('residentsTableBody');
    const activeResidentsEl = document.querySelector('.status-item:nth-child(3) span');

    if (!tableBody) return;

    if (!cep) {
        tableBody.innerHTML = '<tr><td colspan="3">CEP do condomínio não encontrado.</td></tr>';
        if (activeResidentsEl) activeResidentsEl.textContent = 'Moradores Ativos: 0';
        return;
    }

    try {
        const residents = await fetchResidentsByCondoCep(cep);
        const normalizedResidents = residents
            .map((resident) => {
                const condo = resident?.condominium && typeof resident.condominium === 'object'
                    ? resident.condominium
                    : {};

                return {
                    apartment: condo.apartment ?? '-',
                    block: condo.block ?? '-',
                    name: resident?.name || 'Sem nome'
                };
            })
            .sort((a, b) => {
                const blockCompare = String(a.block).localeCompare(String(b.block), 'pt-BR', { numeric: true, sensitivity: 'base' });
                if (blockCompare !== 0) return blockCompare;
                return String(a.apartment).localeCompare(String(b.apartment), 'pt-BR', { numeric: true, sensitivity: 'base' });
            });
        if (activeResidentsEl) activeResidentsEl.textContent = `Moradores Ativos: ${normalizedResidents.length}`;

        if (!normalizedResidents.length) {
            tableBody.innerHTML = '<tr><td colspan="3">Nenhum morador cadastrado encontrado para este condomínio.</td></tr>';
            return;
        }

        tableBody.innerHTML = normalizedResidents.map((resident) => {
            const apt = resident.apartment || '-';
            const block = resident.block || '-';
            const name = resident.name || 'Sem nome';
            return `<tr><td>${apt}</td><td>${block}</td><td>${name}</td></tr>`;
        }).join('');
    } catch (error) {
        console.error('Erro ao carregar moradores:', error);
        tableBody.innerHTML = `<tr><td colspan="3">Erro ao carregar moradores: ${error.message || 'Falha na consulta'}</td></tr>`;
        if (activeResidentsEl) activeResidentsEl.textContent = 'Moradores Ativos: erro';
    }
}

async function loadUpcomingAssembly(cep) {
    const nextAssemblyEl = document.querySelector('.status-item:nth-child(4) span');
    if (!nextAssemblyEl) return;

    try {
        const assemblies = await getScheduledAssemblies();
        const today = new Date().toISOString().split('T')[0];
        const upcoming = (Array.isArray(assemblies) ? assemblies : [])
            .filter(a => a.date && a.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date));

        if (upcoming.length === 0) {
            nextAssemblyEl.textContent = 'Próxima Assembleia: nenhuma agendada';
            return;
        }

        const next = upcoming[0];
        nextAssemblyEl.textContent = `Próxima Assembleia: ${formatDate(next.date)}`;
    } catch (error) {
        console.error('Erro ao carregar próxima assembleia:', error);
        nextAssemblyEl.textContent = 'Próxima Assembleia: erro ao carregar';
    }
}

async function loadPendingNotices(cep) {
    const pendingNoticesEl = document.querySelector('.status-item:nth-child(5) span');
    if (!pendingNoticesEl) return;

    try {
        const count = await fetchPendingNoticesCount(cep);
        pendingNoticesEl.textContent = `Avisos Pendentes: ${count}`;
    } catch (error) {
        console.error('Erro ao carregar avisos pendentes:', error);
        pendingNoticesEl.textContent = 'Avisos Pendentes: erro';
    }
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}
