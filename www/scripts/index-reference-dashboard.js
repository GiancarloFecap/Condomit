(function(){
  'use strict';

  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const now=()=>new Date();
  const monthKey=value=>{const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return'';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const firstDay=(offset=0)=>{const d=now();return new Date(d.getFullYear(),d.getMonth()+offset,1)};
  const currentKey=()=>monthKey(firstDay(0));
  const previousKey=()=>monthKey(firstDay(-1));
  const monthName=d=>new Intl.DateTimeFormat('pt-BR',{month:'long'}).format(d).replace(/^./,m=>m.toUpperCase());
  const shortMonth=d=>new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(d).replace('.','').toUpperCase();
  const dateOf=row=>String(row?.data_reserva||row?.occurrence_date||row?.next_date||row?.date||row?.scheduled_date||row?.created_at||'').slice(0,10);
  const countMonth=(rows,key,getter=dateOf)=>(Array.isArray(rows)?rows:[]).filter(r=>String(getter(r)||'').slice(0,7)===key).length;

  function storedUser(){try{return JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(_){return null}}
  function condoCep(user){const c=user?.condominium||{};return c?.cep||c?.condominium_id||user?.cep||user?.condominium_cep||''}
  async function rpc(name,payload={}){if(typeof window.supabaseFetch!=='function')throw new Error('Supabase indisponível');return window.supabaseFetch(`/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
  async function fetchRows(path){if(typeof window.supabaseFetch!=='function')return[];const data=await window.supabaseFetch(path);return Array.isArray(data)?data:[]}

  function setTrend(id,current,previous,{suffix='%',invert=false,neutralText='sem variação'}={}){
    const el=$(id);if(!el)return;
    const c=Number(current||0),p=Number(previous||0);
    let pct=p>0?((c-p)/p)*100:(c>0?100:0);
    if(invert)pct*=-1;
    const up=pct>0.4,down=pct<-0.4;
    el.classList.remove('positive','negative');
    el.classList.add(up?'positive':down?'negative':'');
    if(!up&&!down){el.innerHTML=`<i class="fas fa-minus"></i> ${esc(neutralText)}`;return;}
    el.innerHTML=`<i class="fas fa-arrow-${up?'up':'down'}"></i> ${Math.abs(Math.round(pct))}${suffix} <span style="color:#71809a">vs. mês anterior</span>`;
  }

  function setBar(id,labelId,value,max,{money=false}={}){
    const bar=$(id),label=$(labelId);if(!bar||!label)return;
    const n=Math.max(0,Number(value||0));
    const pct=max>0?(n/max)*100:0;
    bar.style.height=`${Math.max(n>0?8:2,Math.min(100,pct))}%`;
    label.textContent=money?compactMoney(n):new Intl.NumberFormat('pt-BR').format(n);
  }
  function compactMoney(value){const n=Number(value||0);if(Math.abs(n)>=1000000)return `R$ ${(n/1000000).toFixed(1).replace('.',',')} mi`;if(Math.abs(n)>=1000)return `R$ ${(n/1000).toFixed(n>=10000?0:1).replace('.',',')} mil`;return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n)}

  async function loadFinancial(cep,key){
    try{
      const [y,m]=key.split('-').map(Number);
      const target=`${y}-${String(m).padStart(2,'0')}-01`;
      const data=await rpc('condomit_monthly_financial_summary',{target_month:target,target_cep:cep||null});
      const row=Array.isArray(data)?data[0]:data;
      return Number(row?.income_total||0);
    }catch(_){return 0}
  }

  async function loadDashboard(){
    if(!$('referenceDashboard'))return;
    const user=storedUser();if(!user)return;
    const cep=condoCep(user);
    const cur=currentKey(),prev=previousKey();

    const promises=[
      rpc('condomit_list_condo_residents_v2',{}).catch(()=>rpc('condomit_list_condo_residents',{}).catch(()=>[])),
      rpc('condomit_list_all_reservations',{}).catch(()=>rpc('condomit_list_reservation_slots',{}).catch(()=>[])),
      fetchRows('/occurrences?select=id,occurrence_date,created_at&order=created_at.desc&limit=500').catch(()=>[]),
      fetchRows('/maintenance_items?select=id,title,location,status,next_date,created_at&order=created_at.desc&limit=300').catch(()=>[]),
      fetchRows('/condominium_notices?select=id,title,description,category,created_at&order=created_at.desc&limit=100').catch(()=>[]),
      (typeof window.getScheduledAssembliesByCep==='function'?window.getScheduledAssembliesByCep(cep):fetchRows('/scheduled_assemblies?select=*&order=date.asc,start_time.asc')).catch(()=>[]),
      (typeof window.getCondomitBillingStatus==='function'?window.getCondomitBillingStatus(true):rpc('condomit_get_billing_status',{})).catch(()=>null),
      loadFinancial(cep,cur),
      loadFinancial(cep,prev)
    ];
    const [residents,reservations,occurrences,maintenance,notices,assemblies,billing,financeCurrent,financePrevious]=await Promise.all(promises);

    renderKpis({residents,reservations,maintenance,billing,cur,prev});
    renderChart({financeCurrent,financePrevious,reservations,occurrences,notices,cur,prev});
    renderAssemblies(assemblies,cep);
    renderNotices(notices);
    renderActivities({residents,reservations,maintenance,notices});
  }

  function renderKpis({residents,reservations,maintenance,billing,cur,prev}){
    const currentResidents=Array.isArray(residents)?residents.length:0;
    const previousResidents=(Array.isArray(residents)?residents:[]).filter(r=>!r.joined_at||monthKey(r.joined_at)<cur).length;
    if($('refResidentsValue'))$('refResidentsValue').textContent=currentResidents;
    setTrend('refResidentsTrend',currentResidents,previousResidents,{neutralText:'base estável'});

    const paid=Boolean(billing?.can_use);
    if($('refBillingValue'))$('refBillingValue').textContent=paid?'100%':'0%';
    const billingTrend=$('refBillingTrend');
    if(billingTrend){billingTrend.className=paid?'positive':'negative';billingTrend.innerHTML=paid?'<i class="fas fa-arrow-up"></i> mensalidade regular':'<i class="fas fa-arrow-down"></i> pagamento pendente'}

    const salonRows=(Array.isArray(reservations)?reservations:[]).filter(r=>/sal[aã]o|festas?/i.test(String(r?.nome_local||r?.space_name||'')));
    const effective=salonRows.length?salonRows:(Array.isArray(reservations)?reservations:[]);
    const rc=countMonth(effective,cur),rp=countMonth(effective,prev);
    if($('refReservationsValue'))$('refReservationsValue').textContent=rc;
    setTrend('refReservationsTrend',rc,rp,{neutralText:'sem variação'});

    const pending=(Array.isArray(maintenance)?maintenance:[]).filter(r=>String(r?.status||'pendente').toLowerCase()!=='concluida');
    const mc=pending.length,mp=countMonth(pending,prev,r=>r?.created_at);
    if($('refCallsValue'))$('refCallsValue').textContent=mc;
    setTrend('refCallsTrend',countMonth(pending,cur,r=>r?.created_at),mp,{invert:true,neutralText:mc?`${mc} pendente${mc===1?'':'s'}`:'nenhum pendente'});
  }

  function renderChart({financeCurrent,financePrevious,reservations,occurrences,notices,cur,prev}){
    const rCur=countMonth(reservations,cur),rPrev=countMonth(reservations,prev);
    const oCur=countMonth(occurrences,cur,r=>r?.occurrence_date||r?.created_at),oPrev=countMonth(occurrences,prev,r=>r?.occurrence_date||r?.created_at);
    const nCur=countMonth(notices,cur,r=>r?.created_at),nPrev=countMonth(notices,prev,r=>r?.created_at);
    const values=[financeCurrent,financePrevious,rCur,rPrev,oCur,oPrev,nCur,nPrev].map(Number);
    const financeMax=Math.max(Number(financeCurrent||0),Number(financePrevious||0),1);
    const countMax=Math.max(rCur,rPrev,oCur,oPrev,nCur,nPrev,1);
    setBar('refFinancePrevious','refFinancePreviousLabel',financePrevious,financeMax,{money:true});
    setBar('refFinanceCurrent','refFinanceCurrentLabel',financeCurrent,financeMax,{money:true});
    setBar('refReservationsPrevious','refReservationsPreviousLabel',rPrev,countMax);
    setBar('refReservationsCurrent','refReservationsCurrentLabel',rCur,countMax);
    setBar('refOccurrencesPrevious','refOccurrencesPreviousLabel',oPrev,countMax);
    setBar('refOccurrencesCurrent','refOccurrencesCurrentLabel',oCur,countMax);
    setBar('refNoticesPrevious','refNoticesPreviousLabel',nPrev,countMax);
    setBar('refNoticesCurrent','refNoticesCurrentLabel',nCur,countMax);
    if($('refPreviousMonthLegend'))$('refPreviousMonthLegend').textContent=monthName(firstDay(-1));
    if($('refCurrentMonthLegend'))$('refCurrentMonthLegend').textContent=monthName(firstDay(0));
    void values;
  }

  function normalizeAssemblyDate(a){return String(a?.date||a?.scheduled_date||a?.scheduled_at||'').slice(0,10)}
  function renderAssemblies(rows,cep){
    const root=$('refAssembliesList');if(!root)return;
    const digits=String(cep||'').replace(/\D/g,'');
    const today=new Date();today.setHours(0,0,0,0);
    const list=(Array.isArray(rows)?rows:[]).filter(a=>{
      const ad=normalizeAssemblyDate(a);const d=ad?new Date(`${ad}T12:00:00`):null;
      const aCep=String(a?.cep||a?.condominium_cep||'').replace(/\D/g,'');
      return d&&!Number.isNaN(d.getTime())&&d>=today&&(!digits||!aCep||aCep===digits);
    }).sort((a,b)=>normalizeAssemblyDate(a).localeCompare(normalizeAssemblyDate(b))).slice(0,2);
    if(!list.length){root.innerHTML='<div class="reference-list-empty">Nenhuma assembleia agendada.</div>';return}
    root.innerHTML=list.map(a=>{const ds=normalizeAssemblyDate(a);const d=new Date(`${ds}T12:00:00`);const time=String(a?.start_time||a?.scheduled_time||'19:00').slice(0,5);const place=a?.location||a?.local||'Sala de assembleias';return `<a class="reference-list-row" href="assembleia.html"><span class="reference-date-badge"><strong>${String(d.getDate()).padStart(2,'0')}</strong><span>${shortMonth(d)}</span></span><span class="reference-list-copy"><strong>${esc(a?.title||a?.name||'Assembleia do condomínio')}</strong><span><i class="far fa-clock"></i> ${esc(time)} &nbsp; <i class="fas fa-location-dot"></i> ${esc(place)}</span></span></a>`}).join('');
  }

  function noticeIcon(category,title){const value=`${category||''} ${title||''}`.toLowerCase();if(/coleta|recicl/.test(value))return['recycle','fa-recycle'];if(/água|agua/.test(value))return['water','fa-droplet'];return['notice','fa-bullhorn']}
  function relativeDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const diff=Date.now()-d.getTime();if(diff<3600000)return'Agora';if(diff<86400000)return`Há ${Math.max(1,Math.floor(diff/3600000))} h`;if(diff<172800000)return'Ontem';return d.toLocaleDateString('pt-BR')}
  function renderNotices(rows){
    const root=$('refNoticesList');if(!root)return;const list=(Array.isArray(rows)?rows:[]).slice(0,3);
    if(!list.length){root.innerHTML='<div class="reference-list-empty">Nenhum aviso publicado.</div>';return}
    root.innerHTML=list.map(n=>{const [cls,icon]=noticeIcon(n.category,n.title);return `<a class="reference-list-row" href="mural-avisos.html"><span class="reference-list-icon ${cls}"><i class="fas ${icon}"></i></span><span class="reference-list-copy"><strong>${esc(n?.title||'Aviso do condomínio')}</strong><span>${esc(n?.description||'Abra o mural para ver os detalhes.')}</span></span><span class="reference-list-meta">${esc(relativeDate(n?.created_at))}</span></a>`}).join('');
  }

  function renderActivities({residents,reservations,maintenance,notices}){
    const root=$('refActivitiesList');if(!root)return;const items=[];
    (reservations||[]).slice(0,10).forEach(r=>items.push({date:r?.created_at||r?.data_reserva,title:'Reserva registrada',detail:`${r?.nome_local||'Espaço do condomínio'}${r?.data_reserva?' · '+new Date(`${r.data_reserva}T12:00:00`).toLocaleDateString('pt-BR'):''}`,icon:'fa-calendar-check',cls:'activity-blue',href:'reservas.html'}));
    (residents||[]).filter(r=>r?.joined_at).slice(0,10).forEach(r=>items.push({date:r.joined_at,title:'Novo morador cadastrado',detail:`${r?.name||r?.email||'Morador'}${r?.apartment?' · Apto '+r.apartment:''}`,icon:'fa-users',cls:'activity-teal',href:'gestao-moradores.html'}));
    (maintenance||[]).slice(0,10).forEach(m=>items.push({date:m?.created_at||m?.next_date,title:String(m?.status||'').toLowerCase()==='concluida'?'Manutenção finalizada':'Manutenção registrada',detail:`${m?.title||'Manutenção'}${m?.location?' · '+m.location:''}`,icon:'fa-check',cls:'activity-green',href:'manutencao-preventiva.html'}));
    (notices||[]).slice(0,5).forEach(n=>items.push({date:n?.created_at,title:'Comunicado publicado',detail:n?.title||'Novo aviso',icon:'fa-bullhorn',cls:'activity-cyan',href:'mural-avisos.html'}));
    items.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));const list=items.slice(0,4);
    if(!list.length){root.innerHTML='<div class="reference-list-empty">Nenhuma atividade recente.</div>';return}
    root.innerHTML=list.map(i=>`<a class="reference-list-row" href="${esc(i.href)}"><span class="reference-list-icon ${esc(i.cls)}"><i class="fas ${esc(i.icon)}"></i></span><span class="reference-list-copy"><strong>${esc(i.title)}</strong><span>${esc(i.detail)}</span></span><span class="reference-list-meta">${esc(relativeDate(i.date))}</span></a>`).join('');
  }

  document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>loadDashboard().catch(err=>console.warn('[Dashboard referência]',err)),80)});
})();
