async function fetchCondominiumBillingStatus(force = false) {
    try {
        if (typeof window.getCondomitBillingStatus === 'function') {
            return await window.getCondomitBillingStatus(force);
        }
        if (typeof window.supabaseFetch === 'function') {
            return await window.supabaseFetch('/rpc/condomit_get_billing_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
        }
    } catch (error) {
        console.error('[Billing] Error checking condominium billing:', error);
    }
    return null;
}

document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is logged in
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }
    
    // O pagamento pertence ao condomínio, não ao e-mail do síndico.
    // Assim, trocar o síndico não exige novo pagamento enquanto o ciclo
    // mensal do mesmo CEP continuar ativo.
    if (currentUser.type === 'sindico') {
        if (!currentUser.condominium) {
            window.location.href = 'condominio_register.html';
            return;
        }

        const billing = await fetchCondominiumBillingStatus(true);

        if (billing?.plan_id && currentUser.plan !== billing.plan_id) {
            currentUser.plan = billing.plan_id;
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
        }

        if (billing && !billing.can_use) {
            if (typeof window.enforceCondomitBillingAccess === 'function') {
                await window.enforceCondomitBillingAccess({ force: true });
            } else {
                window.location.href = 'checkout.html';
            }
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
        loadMonthlyFinancialSummary(currentUser);
    }

    const residentManagementButton = document.getElementById('btn-resident-management-dashboard');
    if (residentManagementButton) {
        residentManagementButton.addEventListener('click', () => {
            window.location.href = 'gestao-moradores.html';
        });
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
                window.location.href = 'mural-avisos.html';
            });
        } else if (text.includes('agendar reunião') || text.includes('agendar reuniao') || text.includes('reunião') || text.includes('reuniao')) {
            btn.addEventListener('click', () => {
                window.location.href = 'assembleia.html';
            });
        } else if (text.trim() === 'chat' || /(^|\s)chat(\s|$)/i.test(btn.textContent)) {
            btn.addEventListener('click', openQuickChatChooser);
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

async function loadResidents(_cep) {
    const tableBody = document.getElementById('residentsTableBody');
    const activeResidentsEl = document.querySelector('.status-item:nth-child(3) span');

    if (!tableBody) return;

    try {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase indisponível.');
        }

        const rows = await window.supabaseFetch('/rpc/condomit_list_condo_residents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
        });

        const residents = (Array.isArray(rows) ? rows : [])
            .map((resident) => ({
                apartment: String(resident?.apartment || '-').trim() || '-',
                block: String(resident?.block || '-').trim() || '-',
                name: resident?.name || resident?.email || 'Sem nome'
            }))
            .sort((a, b) => {
                const blockCompare = a.block.localeCompare(b.block, 'pt-BR', { numeric: true, sensitivity: 'base' });
                if (blockCompare !== 0) return blockCompare;
                return a.apartment.localeCompare(b.apartment, 'pt-BR', { numeric: true, sensitivity: 'base' });
            });

        // "Moradores ativos" significa moradores atualmente vinculados ao condomínio,
        // independentemente de estarem com o site aberto.
        if (activeResidentsEl) activeResidentsEl.textContent = `Moradores Ativos: ${residents.length}`;

        if (!residents.length) {
            tableBody.innerHTML = '<tr><td colspan="3">Nenhum morador entrou neste condomínio ainda.</td></tr>';
            return;
        }

        tableBody.innerHTML = residents.map((resident) => `
            <tr>
                <td>${escapeDashboardHtml(resident.apartment)}</td>
                <td>${escapeDashboardHtml(resident.block)}</td>
                <td>${escapeDashboardHtml(resident.name)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar moradores reais do condomínio:', error);
        tableBody.innerHTML = '<tr><td colspan="3">Não foi possível carregar os moradores do condomínio.</td></tr>';
        if (activeResidentsEl) activeResidentsEl.textContent = 'Moradores Ativos: 0';
    }
}

async function loadUpcomingAssembly(cep) {
    const nextAssemblyEl = document.querySelector('.status-item:nth-child(4) span');
    if (!nextAssemblyEl) return;

    try {
        const assemblies = typeof getScheduledAssembliesByCep === 'function'
            ? await getScheduledAssembliesByCep(cep)
            : await getScheduledAssemblies();
        const today = new Date().toISOString().split('T')[0];
        const targetCep = String(cep || '').replace(/\D/g, '');
        const upcoming = (Array.isArray(assemblies) ? assemblies : [])
            // Defesa adicional: mesmo que uma API/RLS devolva assembleias de outros
            // condomínios, o painel nunca usa uma linha de CEP diferente.
            .filter((a) => {
                const assemblyCep = String(a?.cep || a?.condominium_cep || a?.condominium_id || '').replace(/\D/g, '');
                return targetCep && assemblyCep === targetCep;
            })
            .filter(a => a.date && a.date >= today)
            .filter(a => !['cancelada', 'cancelado', 'encerrada', 'encerrado'].includes(String(a.status || '').toLowerCase()))
            .sort((a, b) => `${a.date || ''} ${a.start_time || ''}`.localeCompare(`${b.date || ''} ${b.start_time || ''}`));

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


async function loadMonthlyFinancialSummary(currentUser) {
    const expenseEl = document.getElementById('monthly-expenses');
    const incomeEl = document.getElementById('monthly-income');
    const expenseMetaEl = document.getElementById('monthly-expenses-meta');
    const incomeMetaEl = document.getElementById('monthly-income-meta');
    if (!expenseEl || !incomeEl) return;

    const money = (value) => new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL'
    }).format(Number(value || 0));

    const setLoading = () => {
        expenseEl.dataset.state = 'loading';
        incomeEl.dataset.state = 'loading';
        expenseEl.textContent = 'Carregando...';
        incomeEl.textContent = 'Carregando...';
        if (expenseMetaEl) expenseMetaEl.textContent = 'Calculando lançamentos do mês';
        if (incomeMetaEl) incomeMetaEl.textContent = 'Calculando lançamentos do mês';
    };

    const renderSummary = (summary) => {
        expenseEl.dataset.state = 'ready';
        incomeEl.dataset.state = 'ready';
        expenseEl.textContent = money(summary?.expenses_total);
        incomeEl.textContent = money(summary?.income_total);

        const expenseCount = Number(summary?.expense_entries_count || 0);
        const incomeCount = Number(summary?.income_entries_count || 0);
        const subscription = Number(summary?.subscription_expense || 0);
        if (expenseMetaEl) {
            const subscriptionText = subscription > 0 ? ` · assinatura: ${money(subscription)}` : '';
            expenseMetaEl.textContent = `${expenseCount} lançamento${expenseCount === 1 ? '' : 's'}${subscriptionText}`;
        }
        if (incomeMetaEl) {
            incomeMetaEl.textContent = `${incomeCount} lançamento${incomeCount === 1 ? '' : 's'} registrado${incomeCount === 1 ? '' : 's'}`;
        }
    };

    const resolveCurrentCep = async () => {
        // O condomínio armazenado na sessão representa a seleção ativa do usuário.
        // A RPC antiga usa LIMIT 1 e, para contas ligadas a mais de um condomínio,
        // pode devolver outro vínculo; por isso ela é apenas fallback.
        const cached = currentUser?.condominium?.cep || currentUser?.condominium?.condominium_id || null;
        if (cached) return cached;
        if (typeof window.supabaseFetch === 'function') {
            try {
                const value = await window.supabaseFetch('/rpc/condomit_current_user_cep', {
                    method: 'POST',
                    body: '{}'
                });
                if (typeof value === 'string' && value.trim()) return value.trim();
            } catch (error) {
                console.warn('[Dashboard] Não foi possível identificar o CEP atual:', error);
            }
        }
        return null;
    };

    const fetchFromRpc = async (cep) => {
        if (typeof window.supabaseFetch !== 'function') throw new Error('Conexão com o banco indisponível.');
        const data = await window.supabaseFetch('/rpc/condomit_monthly_financial_summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target_month: new Date().toISOString().slice(0, 10),
                target_cep: cep || null
            })
        });
        const summary = Array.isArray(data) ? data[0] : data;
        if (!summary || typeof summary !== 'object') throw new Error('Resumo financeiro vazio.');
        return summary;
    };

    const fetchFromServerFallback = async (cep) => {
        const token = typeof window.resolveSupabaseAccessToken === 'function'
            ? await window.resolveSupabaseAccessToken()
            : (typeof window.getSupabaseAccessToken === 'function' ? window.getSupabaseAccessToken() : null);
        if (!token) throw new Error('Sessão autenticada indisponível.');

        const month = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit'
        }).format(new Date()).slice(0, 7);
        const params = new URLSearchParams({ month });
        if (cep) params.set('cep', cep);
        const response = await fetch(`/api/dashboard/financial-summary?${params.toString()}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            cache: 'no-store'
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || typeof payload !== 'object') {
            throw new Error(payload?.error || `Falha ao carregar resumo financeiro (${response.status}).`);
        }
        return payload;
    };

    setLoading();
    let rpcError = null;
    try {
        const cep = await resolveCurrentCep();
        try {
            const summary = await fetchFromRpc(cep);
            renderSummary(summary);
            return;
        } catch (error) {
            rpcError = error;
            console.warn('[Dashboard] RPC financeiro indisponível; usando fallback seguro:', error);
        }

        const fallbackSummary = await fetchFromServerFallback(cep);
        renderSummary(fallbackSummary);
    } catch (error) {
        console.warn('[Dashboard] Resumo financeiro não pôde ser carregado:', { rpcError, fallbackError: error });
        expenseEl.dataset.state = 'error';
        incomeEl.dataset.state = 'error';
        expenseEl.textContent = 'Não carregado';
        incomeEl.textContent = 'Não carregado';
        if (expenseMetaEl) expenseMetaEl.textContent = 'Não foi possível consultar as despesas agora. Tente atualizar.';
        if (incomeMetaEl) incomeMetaEl.textContent = 'Não foi possível consultar as receitas agora. Tente atualizar.';
    }
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}


function openQuickChatChooser() {
    let modal = document.getElementById('quickChatChooserModal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quickChatChooserModal';
        modal.className = 'quick-chat-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="quick-chat-card" role="dialog" aria-modal="true" aria-labelledby="quickChatChooserTitle">
                <button type="button" class="quick-chat-close" aria-label="Fechar">
                    <i class="fas fa-xmark"></i>
                </button>
                <div class="quick-chat-icon"><i class="fas fa-comments"></i></div>
                <h3 id="quickChatChooserTitle">Abrir chat</h3>
                <p>Com quem você deseja conversar?</p>
                <div class="quick-chat-options">
                    <button type="button" data-chat-target="residents">
                        <i class="fas fa-users"></i>
                        <span>
                            <strong>Chat com os moradores</strong>
                            <small>Converse individualmente com moradores do condomínio.</small>
                        </span>
                    </button>
                    <button type="button" data-chat-target="porter">
                        <i class="fas fa-user-shield"></i>
                        <span>
                            <strong>Chat com porteiro</strong>
                            <small>Abra a conversa com a portaria do condomínio.</small>
                        </span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        };

        modal.querySelector('.quick-chat-close')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
        modal.querySelector('[data-chat-target="residents"]')?.addEventListener('click', () => {
            window.location.href = 'chat-moradores.html';
        });
        modal.querySelector('[data-chat-target="porter"]')?.addEventListener('click', () => {
            window.location.href = 'chat-porteiro.html';
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('open')) close();
        });
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('viewFullCondoReportBtn')?.addEventListener('click', openFullCondoReport);
});
async function openFullCondoReport(){
    let modal=document.getElementById('fullCondoReportModal');
    if(!modal){
        modal=document.createElement('div'); modal.id='fullCondoReportModal'; modal.className='full-report-overlay';
        modal.innerHTML=`<section class="full-report-card" role="dialog" aria-modal="true"><header><div><h2>Relatório completo do condomínio</h2><p>Visão consolidada dos dados disponíveis no painel.</p></div><button type="button" data-report-close aria-label="Fechar"><i class="fas fa-xmark"></i></button></header><div class="full-report-body" id="fullCondoReportBody"></div><footer><button type="button" class="btn-secondary-large" data-report-close>Fechar</button><button type="button" class="btn-primary-large" id="printFullCondoReport"><i class="fas fa-print"></i> Imprimir relatório</button></footer></section>`;
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-report-close]').forEach(b=>b.addEventListener('click',()=>modal.classList.remove('open')));
        modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
        modal.querySelector('#printFullCondoReport')?.addEventListener('click',()=>window.print());
    }
    const body=modal.querySelector('#fullCondoReportBody');
    body.innerHTML='<div class="report-loading"><i class="fas fa-spinner fa-spin"></i> Consolidando informações...</div>';
    modal.classList.add('open');
    const user=(()=>{try{return JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(_){return null}})();
    const text=(sel,fallback='Não informado')=>document.querySelector(sel)?.textContent?.trim()||fallback;
    const statusItems=Array.from(document.querySelectorAll('.status-item span')).map(el=>el.textContent.trim()).filter(Boolean);
    const activities=Array.from(document.querySelectorAll('table tbody tr')).slice(0,20).map(row=>Array.from(row.children).map(c=>c.textContent.trim()).filter(Boolean).join(' • ')).filter(Boolean);
    const maintenance=Array.from(document.querySelectorAll('#dashboardMaintenanceList .maintenance-item')).map(el=>el.textContent.trim()).filter(Boolean);
    let residents=[]; try{const rows=await window.supabaseFetch('/rpc/condomit_list_condo_residents',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});residents=Array.isArray(rows)?rows:[]}catch(_){}
    body.innerHTML=`<div class="full-report-grid">
      <section><h3>Identificação</h3><p><strong>Condomínio:</strong> ${escapeHtmlReport(user?.condominium?.name||text('#sidebarApartment'))}</p><p><strong>Plano:</strong> ${escapeHtmlReport(user?.plan_name||'Não informado')}</p><p><strong>Responsável:</strong> ${escapeHtmlReport(user?.name||'Não informado')}</p></section>
      <section><h3>Financeiro do mês</h3><p><strong>Despesas:</strong> ${escapeHtmlReport(text('#monthly-expenses'))}</p><p>${escapeHtmlReport(text('#monthly-expenses-meta',''))}</p><p><strong>Receitas:</strong> ${escapeHtmlReport(text('#monthly-income'))}</p><p>${escapeHtmlReport(text('#monthly-income-meta',''))}</p></section>
      <section><h3>Moradores</h3><p><strong>${residents.length}</strong> morador${residents.length===1?'':'es'} vinculado${residents.length===1?'':'s'}.</p>${residents.slice(0,30).map(r=>`<p>${escapeHtmlReport(r.name||r.email||'Morador')} — ${escapeHtmlReport([r.block&&`Bloco ${r.block}`,r.apartment&&`Apto ${r.apartment}`].filter(Boolean).join(' · ')||'Unidade não informada')}</p>`).join('')}</section>
      <section><h3>Status operacional</h3>${statusItems.length?statusItems.map(x=>`<p>${escapeHtmlReport(x)}</p>`).join(''):'<p>Sem indicadores disponíveis.</p>'}</section>
      <section class="report-wide"><h3>Atividades recentes</h3>${activities.length?activities.map(x=>`<p>${escapeHtmlReport(x)}</p>`).join(''):'<p>Nenhuma atividade recente disponível.</p>'}</section>
      <section class="report-wide"><h3>Manutenções</h3>${maintenance.length?maintenance.map(x=>`<p>${escapeHtmlReport(x)}</p>`).join(''):'<p>Nenhuma manutenção listada.</p>'}</section>
    </div>`;
}
function escapeHtmlReport(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;")}
