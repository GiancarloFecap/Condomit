(() => {
  'use strict';

  const state = {
    user: null,
    role: 'morador',
    cep: '',
    management: false,
    documents: [], financial: [], budgets: [], utilities: [], assets: [], templates: [], tickets: [],
    parking: [], chargers: [], bookings: [], emergencies: [], surveys: [], calendar: [],
    badges: [], tasks: [], permissions: [], audits: [], managedCondos: [], sessions: []
  };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const fmtDate = (v) => v ? new Date(v).toLocaleString('pt-BR', { dateStyle:'short', timeStyle: String(v).includes('T') ? 'short' : undefined }) : '—';
  const money = (v) => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    state.user = readUser();
    if (!state.user) { location.href = 'entrar.html'; return; }
    try { state.user = await window.refreshCurrentUserFromDb?.() || state.user; } catch (_) {}
    state.role = normalizeRole(state.user);
    state.management = ['sindico','administradora','admin'].includes(state.role);
    state.cep = await resolveCep();
    configureShell();
    bindNavigation();
    bindForms();
    bindDelegatedActions();
    setupPwaControls();
    await loadAll();
    await openAssetFromQuery();
  }

  function readUser(){ try { return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null'); } catch (_) { return null; } }
  function normalizeRole(user){
    const raw = String(user?.user_type || user?.type || '').trim().toLowerCase();
    if (raw.includes('sind')) return 'sindico';
    if (raw.includes('porteir')) return 'porteiro';
    if (raw.includes('administra') || raw === 'admin') return 'administradora';
    return 'morador';
  }
  function roleLabel(role){ return ({sindico:'Síndico',morador:'Morador',porteiro:'Porteiro',administradora:'Administradora',admin:'Administrador'})[role] || role; }
  function currentHome(){ return state.role === 'porteiro' ? 'index-porteiro.html' : state.role === 'morador' ? 'index-morador.html' : state.role === 'administradora' ? 'index-administradora.html' : 'index.html'; }

  async function resolveCep(){
    if (state.role === 'administradora') {
      const active = sessionStorage.getItem('condomitActiveManagedCep') || localStorage.getItem('condomitActiveManagedCep');
      if (active) return active;
    }
    try {
      const result = await window.supabaseFetch('/rpc/condomit_current_user_cep', { method:'POST', body:'{}' });
      if (typeof result === 'string' && result) return result;
    } catch (_) {}
    const condo = state.user?.condominium && typeof state.user.condominium === 'object' ? state.user.condominium : {};
    return String(condo.cep || condo.condominium_id || state.user?.cep || '').replace(/\D/g,'');
  }

  function configureShell(){
    $('advancedHomeLink').href = currentHome();
    $('advancedUserName').textContent = state.user?.name || 'Usuário';
    $('advancedUserRole').textContent = roleLabel(state.role);
    const condoName = state.user?.condominium?.name || state.user?.condominium?.condominium_name || (state.cep ? `CEP ${state.cep}` : 'Condomit');
    $('sidebarCondo').textContent = condoName;
    const avatar = $('advancedAvatar');
    const photo = state.user?.profilePhoto || state.user?.profile_photo;
    if (photo) avatar.innerHTML = `<img src="${esc(photo)}" alt="Foto de perfil">`;
    else avatar.textContent = initials(state.user?.name || 'US');
    document.querySelectorAll('.management-only').forEach(el => el.hidden = !state.management);
    const adminNav=document.querySelector('.advanced-nav-item[data-view="admin"]');
    if(adminNav)adminNav.hidden=state.role!=='administradora';
    if (!state.management && document.querySelector('.advanced-nav-item.active.management-only')) switchView('overview');
  }

  function initials(name){ return String(name).split(/\s+/).filter(Boolean).map(p=>p[0]).join('').slice(0,2).toUpperCase() || 'US'; }

  function bindNavigation(){
    document.querySelectorAll('.advanced-nav-item').forEach(btn => btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      document.body.classList.remove('advanced-menu-open');
    }));
    document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.jump)));
    $('advancedMenuBtn')?.addEventListener('click', () => document.body.classList.toggle('advanced-menu-open'));
    document.addEventListener('click', e => {
      if (document.body.classList.contains('advanced-menu-open') && !e.target.closest('.advanced-sidebar') && !e.target.closest('#advancedMenuBtn')) document.body.classList.remove('advanced-menu-open');
    });
    $('refreshAdvancedBtn')?.addEventListener('click', loadAll);
    $('advancedSupportBtn')?.addEventListener('click', () => {
      window.location.href='mailto:contato.condomit@gmail.com?subject=Contato%20Condomit';
    });
    $('advancedLogoutBtn')?.addEventListener('click', async () => {
      const button=$('advancedLogoutBtn'); if(button)button.disabled=true;
      try {
        if (typeof window.performFullLogout === 'function') await window.performFullLogout('../inicio.html');
        else { try{await window.supabase?.auth?.signOut?.();}catch(_){} sessionStorage.clear(); location.replace('../inicio.html'); }
      } finally { if(button)button.disabled=false; }
    });
  }

  function switchView(name){
    document.querySelectorAll('.advanced-nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.advanced-view').forEach(v => v.classList.toggle('active', v.dataset.viewPanel === name));
    const label = document.querySelector(`.advanced-nav-item[data-view="${CSS.escape(name)}"] span`)?.textContent || 'Gestão Avançada';
    const subtitles = {
      overview: 'Resumo operacional e atalhos do condomínio',
      documents: 'Documentos, versões, validade e base de conhecimento da IA',
      financial: 'Receitas, despesas, orçamento e consumo',
      assets: 'Patrimônio, QR Code e manutenção preventiva',
      tickets: 'Chamados, prazos de SLA e acompanhamento',
      mobility: 'Vagas, empréstimos e carregadores elétricos',
      community: 'Emergências, satisfação, calendário e participação',
      governance: 'Tarefas, permissões e auditoria administrativa',
      admin: 'Gestão de múltiplos condomínios',
      integrations: 'PWA, API, segurança e integrações'
    };
    $('pageTitle').textContent = label;
    if ($('pageSubtitle')) $('pageSubtitle').textContent = subtitles[name] || 'Indicadores e operações do condomínio';
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function tableGet(table, select='*', extra=''){
    const sep = extra ? '&' : '';
    return window.supabaseFetch(`/${table}?select=${encodeURIComponent(select)}&cep=eq.${encodeURIComponent(state.cep)}${sep}${extra}`);
  }
  async function insert(table, payload){
    const rows = await window.supabaseFetch(`/${table}`, {method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    return Array.isArray(rows) ? rows[0] : rows;
  }
  async function patch(table, id, payload){
    const rows = await window.supabaseFetch(`/${table}?id=eq.${encodeURIComponent(id)}`, {method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)});
    return Array.isArray(rows) ? rows[0] : rows;
  }
  async function remove(table,id){ return window.supabaseFetch(`/${table}?id=eq.${encodeURIComponent(id)}`, {method:'DELETE',headers:{Prefer:'return=minimal'}}); }

  function payloadFromForm(form){
    const fd = new FormData(form); const obj = {};
    for (const [k,v] of fd.entries()) obj[k] = typeof v === 'string' ? v.trim() : v;
    Object.keys(obj).forEach(k => { if (obj[k] === '') obj[k] = null; });
    return obj;
  }
  function isoLocal(v){ return v ? new Date(v).toISOString() : null; }

  function bindForms(){
    bindForm('documentForm', async p => insert('condominium_documents',{...p,version:Number(p.version||1),cep:state.cep,created_by:state.user.email}), 'Documento salvo.', loadDocuments);
    bindForm('financialForm', async p => insert('financial_entries',{...p,amount:Number(p.amount),cep:state.cep,created_by:state.user.email}), 'Lançamento registrado.', loadFinancial);
    bindForm('budgetForm', async p => {
      const month = String(p.budget_month || '').slice(0,7);
      if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Selecione um mês válido para o orçamento.');
      const payload = {
        cep: state.cep,
        budget_month: `${month}-01`,
        category: p.category || 'Geral',
        planned_amount: Number(p.planned_amount || 0),
        notes: p.notes || '',
        created_by: state.user.email,
        updated_at: new Date().toISOString()
      };
      const rows = await window.supabaseFetch('/budget_plans?on_conflict=cep,budget_month,category', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      });
      return Array.isArray(rows) ? rows[0] : rows;
    }, 'Orçamento mensal salvo.', loadFinancial);
    bindForm('utilityForm', async p => insert('utility_readings',{...p,reading_value:Number(p.reading_value),measured_at:p.measured_at||new Date().toISOString().slice(0,10),cep:state.cep,created_by:state.user.email}), 'Leitura salva.', loadUtilities);
    bindForm('assetForm', async p => {
      const row = await insert('condominium_assets',{...p,cep:state.cep,created_by:state.user.email});
      if (row?.id && !row.qr_code) await patch('condominium_assets',row.id,{qr_code:`CONDOMIT:${state.cep}:ASSET:${row.id}`});
      return row;
    }, 'Ativo cadastrado.', loadAssets);
    bindForm('maintenanceTemplateForm', async p => insert('maintenance_templates',{...p,asset_id:p.asset_id?Number(p.asset_id):null,interval_days:Number(p.interval_days),cep:state.cep,created_by:state.user.email}), 'Plano recorrente criado.', loadTemplates);
    bindForm('ticketForm', async p => insert('service_tickets',{...p,sla_due_at:isoLocal(p.sla_due_at),cep:state.cep,requester_email:state.user.email}), 'Chamado aberto.', loadTickets);
    bindForm('parkingForm', async p => insert('parking_spaces',{...p,cep:state.cep,user_email:p.user_email||null}), 'Vaga cadastrada.', loadParking);
    bindForm('chargerForm', async p => insert('ev_chargers',{...p,power_kw:p.power_kw?Number(p.power_kw):null,cep:state.cep}), 'Carregador cadastrado.', loadMobility);
    bindForm('chargerBookingForm', async p => {
      const start = new Date(p.start_at), end = new Date(p.end_at);
      if (!(end > start)) throw new Error('O horário final deve ser posterior ao horário inicial.');
      const chargerId = Number(p.charger_id);
      const overlaps = state.bookings.some(b => Number(b.charger_id)===chargerId && b.status !== 'cancelado' && start < new Date(b.end_at) && end > new Date(b.start_at));
      if (overlaps) throw new Error('Este carregador já possui reserva nesse intervalo.');
      return insert('ev_charger_bookings',{cep:state.cep,charger_id:chargerId,user_email:state.user.email,start_at:start.toISOString(),end_at:end.toISOString()});
    }, 'Reserva criada.', loadMobility);
    bindForm('emergencyForm', async p => insert('emergency_alerts',{...p,cep:state.cep,created_by:state.user.email}), 'Alerta de emergência publicado.', loadEmergencies);
    bindForm('surveyForm', async p => insert('satisfaction_surveys',{...p,cep:state.cep,created_by:state.user.email}), 'Pesquisa criada.', loadSurveys);
    bindForm('calendarForm', async p => insert('condominium_calendar_events',{...p,starts_at:isoLocal(p.starts_at),cep:state.cep,created_by:state.user.email}), 'Evento adicionado.', loadCalendar);
    bindForm('badgeForm', async p => insert('engagement_badges',{...p,points:Number(p.points||0),label:badgeLabel(p.badge_code),cep:state.cep}), 'Conquista concedida.', loadBadges);
    bindForm('assemblyTaskForm', async p => insert('assembly_tasks',{...p,cep:state.cep,created_by:state.user.email}), 'Tarefa criada.', loadTasks);

    $('documentSearch')?.addEventListener('input', renderDocuments);
    $('ticketStatusFilter')?.addEventListener('change', renderTickets);
    $('generateMaintenanceBtn')?.addEventListener('click', async () => {
      try {
        const count = await window.supabaseFetch('/rpc/condomit_generate_due_maintenance',{method:'POST',body:'{}'});
        toast(`${Number(count||0)} manutenção(ões) gerada(s).`,'success'); await loadTemplates(); await loadMetrics();
      } catch(e){ toast(errorText(e),'error'); }
    });
  }

  function bindForm(id, action, success, reload){
    const form = $(id); if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault(); const button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      try {
        const payload = payloadFromForm(form); const row = await action(payload);
        form.reset(); toast(success,'success'); audit('create', id.replace('Form',''), row?.id || '', payload); await reload?.(); await loadMetrics();
      } catch(err){ console.error(err); toast(errorText(err),'error'); }
      finally { if (button) button.disabled = false; }
    });
  }

  function bindDelegatedActions(){
    document.addEventListener('click', async e => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const { action:kind, id } = action.dataset;
      try {
        if (kind === 'delete-document') { await remove('condominium_documents',id); await audit('delete','document',id); await loadDocuments(); }
        if (kind === 'asset-qr') await showAssetQr(id);
        if (kind === 'ticket-status') { await patch('service_tickets',id,{status:action.dataset.status,resolved_at:action.dataset.status==='resolvido'?new Date().toISOString():null,updated_at:new Date().toISOString()}); await audit('update','ticket',id,{status:action.dataset.status}); await loadTickets(); }
        if (kind === 'parking-toggle') { const current=state.parking.find(x=>String(x.id)===String(id)); await patch('parking_spaces',id,{status:current?.status==='livre'?'ocupada':'livre',...(current?.status==='emprestada'?{borrowed_until:null,user_email:null}:{})}); await loadParking(); }
        if (kind === 'booking-cancel') { await patch('ev_charger_bookings',id,{status:'cancelado'}); await loadMobility(); }
        if (kind === 'emergency-ack') { await acknowledgeEmergency(id); }
        if (kind === 'emergency-close') { await patch('emergency_alerts',id,{active:false,ended_at:new Date().toISOString()}); await audit('close','emergency',id); await loadEmergencies(); }
        if (kind === 'survey-vote') { await voteSurvey(id,Number(action.dataset.score)); }
        if (kind === 'task-toggle') { const cur=state.tasks.find(x=>String(x.id)===String(id)); await patch('assembly_tasks',id,{status:cur?.status==='concluida'?'pendente':'concluida'}); await loadTasks(); }
      } catch(err){ toast(errorText(err),'error'); }
    });
    document.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>$(btn.dataset.closeModal).hidden=true));
    $('copyApiExampleBtn')?.addEventListener('click', async () => {
      const txt = `curl -H "x-condomit-api-key: SUA_CHAVE" "https://SEU-SITE.netlify.app/.netlify/functions/public-api?resource=metrics&cep=${state.cep}"`;
      try { await navigator.clipboard.writeText(txt); toast('Exemplo da API copiado.','success'); } catch (_) { toast(txt); }
    });
  }

  async function loadAll(){
    if (!state.cep && state.role !== 'administradora') { toast('Não foi possível identificar o CEP do condomínio.','error'); return; }
    try {
      await Promise.allSettled([loadDocuments(),loadFinancial(),loadUtilities(),loadAssets(),loadTemplates(),loadTickets(),loadMobility(),loadEmergencies(),loadSurveys(),loadCalendar(),loadBadges(),loadTasks(),loadPermissions(),loadAudits(),loadManagedCondos(),loadSessions()]);
      $('migrationWarning').hidden = true;
      await loadMetrics();
    } catch(e){ handleSchemaError(e); }
  }
  function handleSchemaError(e){
    console.error(e); if (/relation .* does not exist|schema cache|could not find|PGRST205|42P01/i.test(errorText(e))) $('migrationWarning').hidden=false; else toast(errorText(e),'error');
  }
  function errorText(e){ return e?.message || e?.error_description || String(e || 'Erro inesperado.'); }

  async function loadDocuments(){
    try { state.documents = await tableGet('condominium_documents','*','order=updated_at.desc'); renderDocuments(); }
    catch(e){ handleSchemaError(e); }
  }
  function renderDocuments(){
    const q=String($('documentSearch')?.value||'').toLowerCase(); const list=$('documentsList'); if(!list)return;
    const rows=state.documents.filter(d=>`${d.title} ${d.category} ${d.description}`.toLowerCase().includes(q));
    list.innerHTML=rows.length?rows.map(d=>`<div class="list-item"><div class="list-item-main"><strong>${esc(d.title)} <span class="chip">v${esc(d.version)}</span></strong><small>${esc(d.category)} · Atualizado ${fmtDate(d.updated_at)}${d.expires_at?` · vence ${fmtDate(d.expires_at)}`:''}</small><small>${esc(d.description||'')}</small>${d.file_url?`<a href="${esc(d.file_url)}" target="_blank" rel="noopener" class="chip">Abrir arquivo</a>`:''}</div><div class="list-actions">${state.management?`<button class="text-btn" data-action="delete-document" data-id="${d.id}">Excluir</button>`:''}</div></div>`).join(''):'<div class="empty-state">Nenhum documento cadastrado.</div>';
  }

  async function loadFinancial(){
    if(!state.management)return;
    try {
      const [financial,budgets] = await Promise.all([
        tableGet('financial_entries','*','order=created_at.desc&limit=300'),
        tableGet('budget_plans','*','order=budget_month.desc&limit=120').catch(()=>[])
      ]);
      state.financial=financial||[];
      state.budgets=budgets||[];
      renderFinancial();
    } catch(e){ handleSchemaError(e); }
  }
  function renderFinancial(){
    let inc=0,exp=0,pending=0;
    state.financial.forEach(x=>{
      const a=Number(x.amount||0);
      if(x.entry_type==='receita')inc+=a; else exp+=a;
      if(x.status==='pendente'||x.status==='atrasado')pending++;
    });
    $('financeIncome').textContent=money(inc);
    $('financeExpense').textContent=money(exp);
    $('financeBalance').textContent=money(inc-exp);
    $('financePending').textContent=String(pending);
    $('financialList').innerHTML=state.financial.slice(0,8).map(x=>`<div class="list-item"><div><strong>${esc(x.description)}</strong><small>${esc(x.category)} · ${fmtDate(x.due_date)}</small></div><div><strong>${money(x.amount)}</strong><span class="chip ${x.status==='atrasado'?'danger':x.status==='pago'?'success':''}">${esc(x.status)}</span></div></div>`).join('')||'<div class="empty-state">Nenhum lançamento.</div>';
    if($('budgetList')) $('budgetList').innerHTML=state.budgets.slice(0,8).map(x=>`<div class="list-item"><div><strong>${esc(x.category)}</strong><small>${new Date(`${String(x.budget_month).slice(0,7)}-02T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</small></div><strong>${money(x.planned_amount)}</strong></div>`).join('')||'<div class="empty-state">Nenhum orçamento planejado.</div>';
    renderFinanceChart();
  }
  function renderFinanceChart(){
    const root=$('financeMonthlyChart'); if(!root)return;
    const map=new Map();
    const put=(key)=>{if(!map.has(key))map.set(key,{planned:0,realized:0});return map.get(key);};
    state.budgets.forEach(b=>{const key=String(b.budget_month||'').slice(0,7);if(key)put(key).planned+=Number(b.planned_amount||0);});
    state.financial.filter(f=>f.entry_type==='despesa'&&f.status!=='cancelado').forEach(f=>{
      const raw=f.paid_date||f.due_date||f.created_at;const key=String(raw||'').slice(0,7);if(key)put(key).realized+=Number(f.amount||0);
    });
    const months=[...map.keys()].sort().slice(-6);
    if(!months.length){root.innerHTML='<div class="empty-state">Cadastre orçamento e despesas para gerar o comparativo.</div>';return;}
    const max=Math.max(1,...months.flatMap(m=>[map.get(m).planned,map.get(m).realized]));
    root.innerHTML=`<div class="finance-chart-legend"><span><i class="legend-dot planned"></i> Previsto</span><span><i class="legend-dot realized"></i> Realizado</span></div><div class="finance-bars">${months.map(m=>{
      const d=map.get(m);const label=new Date(`${m}-02T12:00:00`).toLocaleDateString('pt-BR',{month:'short'});
      return `<div class="finance-month"><div class="finance-bar-pair"><div class="finance-bar planned" style="--bar:${Math.max(4,d.planned/max*100)}%" title="Previsto: ${money(d.planned)}"></div><div class="finance-bar realized ${d.realized>d.planned&&d.planned>0?'over':''}" style="--bar:${Math.max(4,d.realized/max*100)}%" title="Realizado: ${money(d.realized)}"></div></div><strong>${esc(label)}</strong><small>${money(d.realized)} / ${money(d.planned)}</small></div>`;
    }).join('')}</div>`;
  }

  async function loadUtilities(){
    if(!state.management)return; try { state.utilities=await tableGet('utility_readings','*','order=measured_at.desc&limit=100'); renderUtilityAlerts(); } catch(e){ handleSchemaError(e); }
  }
  function renderUtilityAlerts(){
    const groups=new Map(); state.utilities.forEach(r=>{const k=`${r.block||''}-${r.unit}-${r.utility_type}`; if(!groups.has(k))groups.set(k,[]); groups.get(k).push(r);}); const warnings=[];
    groups.forEach(rows=>{rows.sort((a,b)=>new Date(b.measured_at)-new Date(a.measured_at)); if(rows.length>1){const cur=Number(rows[0].reading_value),prev=Number(rows[1].reading_value); if(prev>0&&cur>prev*1.3)warnings.push({row:rows[0],pct:Math.round((cur/prev-1)*100)});}});
    $('utilityAlerts').innerHTML=warnings.length?warnings.map(w=>`<div class="list-item utility-warning"><div><strong>Consumo acima do padrão: ${esc(w.row.utility_type)}</strong><small>Unidade ${esc(w.row.block||'')} ${esc(w.row.unit)} · leitura ${esc(w.row.reading_value)}</small></div><span class="chip danger">+${w.pct}%</span></div>`).join(''):'<div class="empty-state">Nenhuma variação superior a 30% detectada.</div>';
  }

  async function loadAssets(){
    if(!state.management)return; try { state.assets=await tableGet('condominium_assets','*','order=created_at.desc'); renderAssets(); } catch(e){ handleSchemaError(e); }
  }
  function renderAssets(){
    $('assetsList').innerHTML=state.assets.length?state.assets.map(a=>`<div class="list-item"><div><strong>${esc(a.name)}</strong><small>${esc(a.asset_type)} · ${esc(a.location)}</small><span class="chip">${esc(a.status)}</span></div><button class="secondary-btn" data-action="asset-qr" data-id="${a.id}"><i class="fas fa-qrcode"></i></button></div>`).join(''):'<div class="empty-state">Nenhum ativo cadastrado.</div>';
    const select=$('maintenanceAssetSelect'); if(select){select.innerHTML='<option value="">Sem ativo específico</option>'+state.assets.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');}
  }
  async function showAssetQr(id){
    const a=state.assets.find(x=>String(x.id)===String(id)); if(!a)return;
    const url=new URL(location.href);
    url.search='';
    url.hash='';
    url.searchParams.set('asset',String(a.id));
    const value=url.toString();
    $('assetQrTitle').textContent=`QR · ${a.name}`;
    $('assetQrValue').textContent=a.qr_code||`CONDOMIT:${state.cep}:ASSET:${a.id}`;
    const box=$('assetQrCode'); box.innerHTML='';
    if(window.QRCode)new QRCode(box,{text:value,width:210,height:210}); else box.textContent=value;
    const history=$('assetHistory');
    if(history) {
      history.innerHTML='<div class="empty-state">Carregando histórico...</div>';
      try {
        const rows=await window.supabaseFetch(`/maintenance_items?select=id,title,description,status,next_date,created_at,category&cep=eq.${encodeURIComponent(state.cep)}&asset_id=eq.${encodeURIComponent(a.id)}&order=created_at.desc&limit=30`);
        history.innerHTML=(rows||[]).length?(rows||[]).map(m=>`<div class="list-item"><div><strong>${esc(m.title||m.category||'Manutenção')}</strong><small>${fmtDate(m.next_date||m.created_at)} · ${esc(m.status||'')}</small><small>${esc(m.description||'')}</small></div></div>`).join(''):'<div class="empty-state">Nenhuma manutenção vinculada a este equipamento.</div>';
      } catch(e) { history.innerHTML=`<div class="empty-state">Não foi possível carregar o histórico: ${esc(errorText(e))}</div>`; }
    }
    $('assetQrModal').hidden=false;
  }
  async function openAssetFromQuery(){
    const id=new URLSearchParams(location.search).get('asset');
    if(!id || !state.management)return;
    const found=state.assets.some(a=>String(a.id)===String(id));
    if(!found)return;
    switchView('assets');
    await showAssetQr(id);
  }

  async function loadTemplates(){ if(!state.management)return; try { state.templates=await tableGet('maintenance_templates','*','order=next_due.asc'); } catch(e){ handleSchemaError(e); } }

  async function loadTickets(){ try { state.tickets=await tableGet('service_tickets','*','order=created_at.desc&limit=100'); renderTickets(); } catch(e){ handleSchemaError(e); } }
  function renderTickets(){
    const filter=$('ticketStatusFilter')?.value||''; const rows=state.tickets.filter(x=>!filter||x.status===filter); const now=Date.now();
    $('ticketsList').innerHTML=rows.length?rows.map(t=>{const overdue=t.sla_due_at&&new Date(t.sla_due_at).getTime()<now&&!['resolvido','cancelado'].includes(t.status); return `<div class="list-item ${overdue?'sla-overdue':''}"><div class="list-item-main"><strong>#${t.id} · ${esc(t.title)}</strong><small>${esc(t.category)} · aberto por ${esc(t.requester_email)}</small><span class="chip ${overdue?'danger':t.status==='resolvido'?'success':''}">${overdue?'SLA vencido':esc(t.status.replaceAll('_',' '))}</span>${t.sla_due_at?`<small>Prazo: ${fmtDate(t.sla_due_at)}</small>`:''}</div>${state.management?`<div class="list-actions"><button class="text-btn" data-action="ticket-status" data-id="${t.id}" data-status="em_andamento">Em andamento</button><button class="text-btn" data-action="ticket-status" data-id="${t.id}" data-status="aguardando_prestador">Prestador</button><button class="text-btn" data-action="ticket-status" data-id="${t.id}" data-status="resolvido">Resolver</button></div>`:''}</div>`;}).join(''):'<div class="empty-state">Nenhum chamado.</div>';
  }

  async function loadParking(){ if(!state.management)return; try { state.parking=await tableGet('parking_spaces','*','order=code.asc'); renderParking(); } catch(e){ handleSchemaError(e); } }
  function renderParking(){
    $('parkingList').innerHTML=state.parking.slice(0,12).map(p=>{
      const borrowed=p.status==='emprestada'&&p.borrowed_until;
      return `<div class="list-item"><div><strong>${esc(p.code)}</strong><small>${esc(p.space_type)} · ${esc(p.vehicle_plate||'sem veículo')}</small>${p.user_email?`<small>${esc(p.user_email)}</small>`:''}${borrowed?`<span class="chip">Emprestada até ${fmtDate(p.borrowed_until)}</span>`:''}</div><button class="text-btn" data-action="parking-toggle" data-id="${p.id}">${borrowed?'Liberar':esc(p.status)}</button></div>`;
    }).join('')||'<div class="empty-state">Nenhuma vaga.</div>';
  }

  async function loadMobility(){
    try {
      const jobs=[]; if(state.management)jobs.push(tableGet('parking_spaces','*','order=code.asc').then(x=>state.parking=x)); jobs.push(tableGet('ev_chargers','*','order=name.asc').then(x=>state.chargers=x)); jobs.push(tableGet('ev_charger_bookings','*','order=start_at.desc&limit=50').then(x=>state.bookings=x)); await Promise.all(jobs); renderParking(); renderMobility();
    } catch(e){ handleSchemaError(e); }
  }
  function renderMobility(){
    if($('chargerList'))$('chargerList').innerHTML=state.chargers.map(c=>`<div class="list-item"><div><strong>${esc(c.name)}</strong><small>${esc(c.location)} · ${esc(c.power_kw||'—')} kW</small></div><span class="chip">${esc(c.status)}</span></div>`).join('')||'<div class="empty-state">Nenhum carregador.</div>';
    const sel=$('chargerBookingSelect'); if(sel)sel.innerHTML='<option value="">Selecione</option>'+state.chargers.filter(c=>c.status!=='inativo'&&c.status!=='manutencao').map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('chargerBookingsList').innerHTML=state.bookings.map(b=>{const own=String(b.user_email).toLowerCase()===String(state.user.email).toLowerCase();return `<div class="list-item"><div><strong>${esc(state.chargers.find(c=>c.id===b.charger_id)?.name||`Carregador #${b.charger_id}`)}</strong><small>${fmtDate(b.start_at)} → ${fmtDate(b.end_at)}${b.kwh!=null?` · ${Number(b.kwh).toLocaleString('pt-BR')} kWh`:''}</small><span class="chip">${esc(b.status)}</span></div><div class="list-actions">${(own||state.management)&&b.status==='reservado'?`<button class="text-btn" data-action="booking-cancel" data-id="${b.id}">Cancelar</button>`:''}${state.management&&['reservado','em_uso'].includes(b.status)?`<button class="text-btn" data-action="booking-complete" data-id="${b.id}">Concluir</button>`:''}</div></div>`}).join('')||'<div class="empty-state">Nenhuma reserva.</div>';
  }

  async function loadEmergencies(){ try { state.emergencies=await tableGet('emergency_alerts','*','order=created_at.desc&limit=20'); renderEmergencies(); } catch(e){ handleSchemaError(e); } }
  function renderEmergencies(){
    const list=$('emergencyList'); if(!list)return; list.innerHTML=state.emergencies.length?state.emergencies.map(a=>`<div class="list-item ${a.active?'sla-overdue':''}"><div><strong>${esc(a.title)}</strong><small>${esc(a.message)}</small><span class="chip ${a.active?'danger':'success'}">${a.active?'Ativo':'Encerrado'}</span></div><div class="list-actions">${a.active?`<button class="text-btn" data-action="emergency-ack" data-id="${a.id}">Confirmar leitura</button>`:''}${state.management&&a.active?`<button class="text-btn" data-action="emergency-close" data-id="${a.id}">Encerrar</button>`:''}</div></div>`).join(''):'<div class="empty-state">Nenhum alerta.</div>';
  }
  async function acknowledgeEmergency(id){
    await window.supabaseFetch('/communication_reads?on_conflict=resource_type,resource_id,user_email',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({cep:state.cep,resource_type:'emergency',resource_id:String(id),user_email:state.user.email,acknowledged:true})}); toast('Leitura confirmada.','success');
  }

  async function loadSurveys(){ try { state.surveys=await tableGet('satisfaction_surveys','*','order=created_at.desc&limit=30'); renderSurveys(); } catch(e){ handleSchemaError(e); } }
  function renderSurveys(){
    const list=$('surveysList'); if(!list)return; list.innerHTML=state.surveys.length?state.surveys.map(s=>`<div class="list-item"><div class="list-item-main"><strong>${esc(s.title)}</strong><small>${esc(s.question)}</small><div class="list-actions" style="justify-content:flex-start;margin-top:8px">${[1,2,3,4,5].map(n=>`<button class="text-btn" data-action="survey-vote" data-id="${s.id}" data-score="${n}">${'★'.repeat(n)}</button>`).join('')}</div></div><span class="chip">${s.active?'Ativa':'Encerrada'}</span></div>`).join(''):'<div class="empty-state">Nenhuma pesquisa.</div>';
  }
  async function voteSurvey(id,score){
    await window.supabaseFetch('/satisfaction_responses?on_conflict=survey_id,user_email',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({survey_id:Number(id),cep:state.cep,user_email:state.user.email,score})}); toast('Avaliação registrada.','success'); await loadMetrics();
  }

  async function loadCalendar(){
    try {
      const items = await tableGet('condominium_calendar_events','*','order=starts_at.asc&limit=80').catch(()=>[]);
      const merged=(items||[]).map(x=>({...x,source:x.source||'manual'}));

      // Integra automaticamente assembleias, manutenções e reservas já existentes.
      try {
        const assemblies=await window.supabaseFetch(`/scheduled_assemblies?select=id,title,scheduled_date,scheduled_time,status,cep&cep=eq.${encodeURIComponent(state.cep)}&order=scheduled_date.asc&limit=50`);
        (assemblies||[]).forEach(a=>{
          const date=String(a.scheduled_date||'').slice(0,10);
          if(!date)return;
          const time=String(a.scheduled_time||'19:00').slice(0,5)||'19:00';
          merged.push({id:`assembly-${a.id}`,title:a.title||'Assembleia',event_type:'assembleia',starts_at:`${date}T${time}:00`,source:'assembleia'});
        });
      } catch(_){}

      try {
        const maintenance=await window.supabaseFetch(`/maintenance_items?select=id,title,next_date,status,cep&cep=eq.${encodeURIComponent(state.cep)}&order=next_date.asc&limit=80`);
        (maintenance||[]).filter(m=>m.next_date&&m.status!=='concluida').forEach(m=>merged.push({id:`maintenance-${m.id}`,title:m.title||'Manutenção',event_type:'manutencao',starts_at:`${String(m.next_date).slice(0,10)}T09:00:00`,source:'manutencao'}));
      } catch(_){}

      try {
        const reservations=await window.supabaseFetch('/rpc/condomit_list_reservation_slots',{method:'POST',body:'{}'});
        (reservations||[]).filter(r=>r.data_reserva).forEach((r,i)=>merged.push({id:`reservation-${i}-${r.data_reserva}-${r.horario_inicio}`,title:`Reserva · ${r.nome_local||'Área comum'}`,event_type:'reserva',starts_at:`${String(r.data_reserva).slice(0,10)}T${String(r.horario_inicio||'09:00').slice(0,5)}:00`,source:'reserva'}));
      } catch(_){}

      const seen=new Set();
      state.calendar=merged.filter(e=>{
        const key=`${String(e.title).toLowerCase()}|${String(e.starts_at).slice(0,16)}`;
        if(seen.has(key))return false;seen.add(key);return true;
      }).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
      renderCalendar();
    } catch(e){ handleSchemaError(e); }
  }
  function renderCalendar(){
    const html=state.calendar.filter(e=>new Date(e.starts_at).getTime()>Date.now()-86400000).slice(0,20).map(e=>`<div class="list-item"><div><strong>${esc(e.title)}</strong><small>${esc(e.event_type)} · ${fmtDate(e.starts_at)}${e.source&&e.source!=='manual'?` · sincronizado de ${esc(e.source)}`:''}</small></div></div>`).join('')||'<div class="empty-state">Nenhum evento próximo.</div>';
    if($('calendarList'))$('calendarList').innerHTML=html;
    if($('overviewCalendar'))$('overviewCalendar').innerHTML=html;
  }

  async function loadBadges(){ try { state.badges=await tableGet('engagement_badges','*','order=awarded_at.desc&limit=40'); renderBadges(); } catch(e){ handleSchemaError(e); } }
  function renderBadges(){ $('badgesList').innerHTML=state.badges.length?state.badges.map(b=>`<div class="list-item"><div><strong>${esc(b.label)}</strong><small>${esc(b.user_email)}</small></div><span class="chip">+${Number(b.points||0)} pts</span></div>`).join(''):'<div class="empty-state">Nenhuma conquista concedida.</div>'; }
  function badgeLabel(code){ return ({participacao_assembleia:'Participação em assembleia',pesquisa:'Colaboração em pesquisa',comunidade:'Colaboração comunitária'})[code]||'Participação comunitária'; }

  async function loadTasks(){ if(!state.management)return; try { state.tasks=await tableGet('assembly_tasks','*','order=created_at.desc&limit=50'); renderTasks(); } catch(e){ handleSchemaError(e); } }
  function renderTasks(){ $('assemblyTasksList').innerHTML=state.tasks.map(t=>`<div class="list-item"><div><strong>${esc(t.title)}</strong><small>${esc(t.assigned_to||'Sem responsável')} · ${fmtDate(t.due_date)}</small></div><button class="text-btn" data-action="task-toggle" data-id="${t.id}">${t.status==='concluida'?'Reabrir':'Concluir'}</button></div>`).join('')||'<div class="empty-state">Nenhuma tarefa.</div>'; }

  const permissionDefinitions=[['ver_financeiro','Ver financeiro'],['gerenciar_reservas','Gerenciar reservas'],['registrar_encomendas','Registrar encomendas'],['criar_assembleia','Criar assembleia'],['gerenciar_manutencao','Gerenciar manutenção'],['ver_auditoria','Ver auditoria']];
  async function loadPermissions(){ if(!state.management)return; try { state.permissions=await tableGet('role_permissions','*'); renderPermissions(); } catch(e){ handleSchemaError(e); } }
  function renderPermissions(){
    const root=$('permissionsMatrix'); if(!root)return; root.innerHTML=permissionDefinitions.map(([code,label])=>`<div class="permission-row"><strong>${esc(label)}</strong>${['morador','porteiro'].map(role=>{const row=state.permissions.find(p=>p.role===role&&p.permission===code);return `<label><input type="checkbox" data-permission="${code}" data-role="${role}" ${row?.enabled?'checked':''}> ${roleLabel(role)}</label>`}).join('')}</div>`).join('');
    root.querySelectorAll('[data-permission]').forEach(input=>input.addEventListener('change',async()=>{try{await window.supabaseFetch('/role_permissions?on_conflict=cep,role,permission',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({cep:state.cep,role:input.dataset.role,permission:input.dataset.permission,enabled:input.checked,updated_by:state.user.email,updated_at:new Date().toISOString()})});toast('Permissão atualizada.','success');await audit('permission','role_permissions','',{role:input.dataset.role,permission:input.dataset.permission,enabled:input.checked});}catch(e){input.checked=!input.checked;toast(errorText(e),'error');}}));
  }

  async function loadAudits(){ if(!state.management)return; try { state.audits=await tableGet('audit_log','*','order=created_at.desc&limit=60'); renderAudits(); } catch(e){ handleSchemaError(e); } }
  function renderAudits(){ const root=$('auditList'); if(!root)return; root.innerHTML=`<table class="audit-table"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>ID</th></tr></thead><tbody>${state.audits.map(a=>`<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.actor_email)}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type)}</td><td>${esc(a.entity_id||'—')}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum evento registrado.</td></tr>'}</tbody></table>`; }
  async function audit(action,entityType,entityId='',details={}){ if(!state.cep)return; try{await insert('audit_log',{cep:state.cep,actor_email:state.user.email,action,entity_type:entityType,entity_id:String(entityId||''),details});if(state.management)loadAudits();}catch(_){} }

  async function loadManagedCondos(){
    if(state.role!=='administradora'&&!state.management)return;
    try {
      const dashboard=await window.supabaseFetch('/rpc/condomit_managed_condominiums_dashboard',{method:'POST',body:'{}'});
      if(Array.isArray(dashboard)&&dashboard.length){
        state.managedCondos=dashboard.map(x=>({...x,active:true}));
        renderManagedCondos();
        return;
      }
      const companyRows=await window.supabaseFetch(`/management_company_users?select=company_id,user_email&user_email=eq.${encodeURIComponent(state.user.email)}`);
      if(!companyRows?.length){state.managedCondos=[];renderManagedCondos();return;}
      const ids=companyRows.map(x=>x.company_id).join(',');
      state.managedCondos=await window.supabaseFetch(`/managed_condominiums?select=company_id,cep,active&company_id=in.(${ids})&active=eq.true`);
      renderManagedCondos();
    } catch(e){ if(state.role==='administradora')handleSchemaError(e); }
  }

  function renderManagedCondos(){
    const root=$('managedCondosList'); if(!root)return; root.innerHTML=state.managedCondos.length?state.managedCondos.map(c=>`<div class="list-item"><div><strong>${esc(c.condominium_name||`Condomínio ${c.cep}`)}</strong><small>${esc(c.company_name||`Empresa #${c.company_id}`)}${c.open_tickets!=null?` · ${Number(c.open_tickets)} chamados · ${Number(c.pending_maintenance||0)} manutenções`:''}</small></div><button class="secondary-btn" data-managed-cep="${esc(c.cep)}">Abrir</button></div>`).join(''):'<div class="empty-state">Nenhum condomínio vinculado a esta conta.</div>';
    root.querySelectorAll('[data-managed-cep]').forEach(btn=>btn.addEventListener('click',()=>{sessionStorage.setItem('condomitActiveManagedCep',btn.dataset.managedCep);localStorage.setItem('condomitActiveManagedCep',btn.dataset.managedCep);location.href='index-administradora.html';}));
  }

  async function loadMetrics(){
    try {
      const [docs,tickets,maint,alerts,ratings,fin] = await Promise.all([
        tableGet('condominium_documents','id','limit=1000').catch(()=>[]),
        tableGet('service_tickets','id,status','limit=1000').catch(()=>[]),
        window.supabaseFetch(`/maintenance_items?select=id,status&cep=eq.${encodeURIComponent(state.cep)}&limit=1000`).catch(()=>[]),
        tableGet('emergency_alerts','id,active','limit=1000').catch(()=>[]),
        tableGet('satisfaction_responses','score','limit=1000').catch(()=>[]),
        state.management?tableGet('financial_entries','entry_type,amount,status','limit=1000').catch(()=>[]):Promise.resolve([])
      ]);
      const balance=fin.reduce((s,x)=>s+(x.entry_type==='receita'?1:-1)*Number(x.amount||0),0); const avg=ratings.length?ratings.reduce((s,x)=>s+Number(x.score||0),0)/ratings.length:null;
      setMetric('documents',docs.length); setMetric('tickets',tickets.filter(x=>!['resolvido','cancelado'].includes(x.status)).length); setMetric('maintenance',maint.filter(x=>x.status!=='concluida').length); setMetric('emergency',alerts.filter(x=>x.active).length); setMetric('satisfaction',avg?`${avg.toFixed(1)}/5`:'--'); setMetric('balance',state.management?money(balance):'Restrito');
      renderIndicators({tickets,maint,alerts,docs});
    } catch(e){ handleSchemaError(e); }
  }
  function setMetric(name,value){ const el=document.querySelector(`[data-metric="${name}"]`);if(el)el.textContent=value; }
  function renderIndicators({tickets,maint,alerts,docs}){ const rows=[['Chamados fora do SLA',tickets.filter(t=>t.sla_due_at&&new Date(t.sla_due_at)<new Date()&&!['resolvido','cancelado'].includes(t.status)).length],['Manutenções em atraso',maint.filter(m=>m.next_date&&new Date(m.next_date)<new Date()&&m.status!=='concluida').length],['Documentos próximos do vencimento',state.documents.filter(d=>d.expires_at&&new Date(d.expires_at)-Date.now()<30*86400000&&new Date(d.expires_at)>new Date()).length],['Alertas de emergência',alerts.filter(a=>a.active).length]]; $('operationalIndicators').innerHTML=rows.map(([l,v])=>`<div class="indicator-row"><span>${esc(l)}</span><strong>${v}</strong></div>`).join(''); }

  async function loadSessions(){
    try {
      state.sessions = await window.supabaseFetch(`/user_session_log?select=session_id,device_label,user_agent,last_seen_at,created_at,revoked_at&user_email=eq.${encodeURIComponent(state.user.email)}&order=last_seen_at.desc&limit=20`);
      renderSessions();
    } catch(e){ if(!/does not exist|schema cache|PGRST205|42P01/i.test(errorText(e))) console.warn(e); }
  }
  function renderSessions(){
    const root=$('sessionsList'); if(!root)return; const current=localStorage.getItem('condomitSessionId027')||'';
    root.innerHTML=state.sessions.length?state.sessions.map(s=>`<div class="list-item"><div><strong>${esc(s.device_label||'Navegador')} ${s.session_id===current?'<span class="chip success">Este dispositivo</span>':''}</strong><small>Última atividade: ${fmtDate(s.last_seen_at)}${s.revoked_at?' · sessão encerrada':''}</small></div><span class="chip ${s.revoked_at?'danger':''}">${s.revoked_at?'Encerrada':'Ativa'}</span></div>`).join(''):'<div class="empty-state">Nenhuma sessão registrada ainda.</div>';
  }
  async function signOutAllDevices(){
    const button=$('signOutAllDevicesBtn'); if(button)button.disabled=true;
    try{
      await window.supabaseFetch(`/user_session_log?user_email=eq.${encodeURIComponent(state.user.email)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({revoked_at:new Date().toISOString()})}).catch(()=>{});
      try{await window.supabase?.auth?.signOut?.({scope:'global'});}catch(_){}
      toast('Sessões encerradas. Faça login novamente.','success');
      setTimeout(()=>{ if(window.performFullLogout) window.performFullLogout('../inicio.html'); else {sessionStorage.clear();location.href='../inicio.html';}},650);
    }catch(e){toast(errorText(e),'error');if(button)button.disabled=false;}
  }

  function setupPwaControls(){
    $('signOutAllDevicesBtn')?.addEventListener('click',signOutAllDevices);
    const installBtn=$('installPwaBtn');
    const status=$('pwaStatus');
    const refreshInstallUi=()=>{
      const stateNow=window.condomitGetPwaInstallState?.()||'unknown';
      if(stateNow==='installed'){ if(installBtn){installBtn.disabled=true;installBtn.innerHTML='<i class="fas fa-check"></i> Condomit instalado';} if(status)status.textContent='O Condomit já está instalado neste dispositivo.'; }
      else if(stateNow==='ready'){ if(installBtn){installBtn.disabled=false;installBtn.innerHTML='<i class="fas fa-download"></i> Instalar Condomit';} if(status)status.textContent='Pronto para instalar como aplicativo neste dispositivo.'; }
      else { if(installBtn)installBtn.disabled=false; if(status)status.textContent='Se o navegador oferecer instalação de PWA, o botão abrirá a confirmação do sistema.'; }
    };
    window.addEventListener('condomit:pwa-ready',refreshInstallUi);
    window.addEventListener('condomit:pwa-installed',refreshInstallUi);
    installBtn?.addEventListener('click',async()=>{
      if(!window.condomitInstallPwa){toast('Instalação PWA não está disponível neste navegador.','warning');return;}
      const result=await window.condomitInstallPwa();
      if(result?.ok){toast(result.outcome==='installed'?'Condomit já está instalado.':'Instalação do Condomit confirmada.','success');}
      else if(result?.outcome==='dismissed'){toast('Instalação cancelada. Você pode tentar novamente pelo menu do navegador.','info');}
      else if(result?.outcome==='unavailable'){toast('O navegador ainda não disponibilizou a instalação. No Chrome/Edge, confira também o ícone de instalar na barra de endereço.','warning');}
      else toast('Não foi possível iniciar a instalação neste navegador.','error');
      refreshInstallUi();
    });
    refreshInstallUi();
  }

  function toast(message,type='info'){
    if(window.showToast){window.showToast(message,type);return;} const el=document.createElement('div');el.className=`advanced-toast ${type}`;el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),4200);
  }
})();
