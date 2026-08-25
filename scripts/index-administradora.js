(() => {
  'use strict';
  const $=id=>document.getElementById(id); const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  document.addEventListener('DOMContentLoaded',init);
  async function init(){
    const user=readUser();if(!user){location.href='entrar.html';return;} const role=String(user.user_type||user.type||'').toLowerCase();if(!role.includes('administra')&&role!=='admin'&&!role.includes('sind')){$('adminCompanyWarning').hidden=false;$('adminCompanyWarning').innerHTML='<strong>Acesso da administradora não habilitado para esta conta.</strong>';}
    $('adminRefreshBtn')?.addEventListener('click',load);$('adminLogoutBtn')?.addEventListener('click',()=>window.performFullLogout?window.performFullLogout('../inicio.html'):(location.href='../inicio.html'));await load();
  }
  function readUser(){try{return JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(_){return null}}
  async function load(){
    try{
      const rows=await window.supabaseFetch('/rpc/condomit_managed_condominiums_dashboard',{method:'POST',body:'{}'});
      render((rows||[]).map(x=>({
        ...x,
        name:x.condominium_name||`Condomínio ${x.cep}`,
        tickets:Number(x.open_tickets||0),
        maintenance:Number(x.pending_maintenance||0),
        alerts:Number(x.active_emergencies||0),
        documents:Number(x.documents_count||0),
        balance:Number(x.current_balance||0)
      })));
    }catch(e){
      console.error(e);
      $('adminCompanyWarning').hidden=false;
      $('adminCompanyWarning').innerHTML=`<strong>Não foi possível carregar o painel.</strong><span>${esc(e.message||e)}. Confirme a execução da migration 024.</span>`;
      render([]);
    }
  }

  function render(rows){
    const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    $('adminCondoCount').textContent=rows.length;
    $('adminTicketCount').textContent=rows.reduce((sum,x)=>sum+x.tickets,0);
    $('adminMaintenanceCount').textContent=rows.reduce((sum,x)=>sum+x.maintenance,0);
    $('adminEmergencyCount').textContent=rows.reduce((sum,x)=>sum+x.alerts,0);
    if($('adminDocumentsCount'))$('adminDocumentsCount').textContent=rows.reduce((sum,x)=>sum+x.documents,0);
    if($('adminBalance'))$('adminBalance').textContent=money(rows.reduce((sum,x)=>sum+x.balance,0));
    $('adminCondoGrid').innerHTML=rows.length?rows.map(c=>`<article class="admin-condo-card"><div><h4>${esc(c.name)}</h4><small>${esc(c.company_name||'Administradora')} · CEP ${esc(c.cep)}</small></div><div class="admin-condo-stats"><div><strong>${c.tickets}</strong><small>Chamados</small></div><div><strong>${c.maintenance}</strong><small>Manutenção</small></div><div><strong>${c.alerts}</strong><small>Alertas</small></div><div><strong>${c.documents}</strong><small>Documentos</small></div><div class="wide-stat"><strong>${money(c.balance)}</strong><small>Saldo</small></div></div><button class="primary-btn" data-cep="${esc(c.cep)}">Abrir condomínio</button></article>`).join(''):'<div class="empty-state">Nenhum condomínio vinculado à administradora.</div>';
    $('adminCondoGrid').querySelectorAll('[data-cep]').forEach(btn=>btn.addEventListener('click',()=>{
      sessionStorage.setItem('condomitActiveManagedCep',btn.dataset.cep);
      localStorage.setItem('condomitActiveManagedCep',btn.dataset.cep);
      location.href='gestao-avancada.html';
    }));
  }

})();
