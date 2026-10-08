/* Painel do condomínio: indicadores e gráficos baseados em registros reais. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const copy = {
        pt: {
            overview:'VISÃO GERAL',dashboard:'Painel do condomínio',dashboardSubtitle:'Indicadores e movimentações do condomínio',loading:'Carregando dados',ready:'Dados atualizados',partial:'Dados parcialmente indisponíveis',
            residents:'Moradores cadastrados',reservations:'Reservas neste mês',occurrences:'Ocorrências no mês',notices:'Avisos publicados',
            activityTitle:'Evolução da atividade do condomínio',activitySubtitle:'Movimentação registrada ao longo dos meses',metricLabel:'Indicador',periodLabel:'Período',reservationsShort:'Reservas',noticesShort:'Comunicados',occurrencesShort:'Ocorrências',sixMonths:'Últimos 6 meses',twelveMonths:'Últimos 12 meses',
            chartNote:'Os números representam registros do condomínio, não valores estimados.',recentResidents:'Moradores recentes',recentResidentsSub:'Cadastros vinculados ao condomínio',viewAll:'Ver todos',name:'Morador',unit:'Unidade',joined:'Entrada',status:'Situação',distribution:'Distribuição de atividades',distributionSubtitle:'Registros deste mês por categoria',records:'registros',
            noResidents:'Ainda não há moradores cadastrados.',noRecords:'Nenhum registro no período.',registered:'Cadastrado',pending:'Pendente',notAvailable:'Não informado',total:'Total cadastrado',monthOverMonth:'em relação ao mês anterior',noChange:'sem variação',allRecent:'moradores registrados',maintenance:'Manutenções',
        },
        en: {
            overview:'OVERVIEW',dashboard:'Condominium dashboard',dashboardSubtitle:'Condominium indicators and activity',loading:'Loading data',ready:'Data updated',partial:'Some data is unavailable',
            residents:'Registered residents',reservations:'Reservations this month',occurrences:'Incidents this month',notices:'Published notices',
            activityTitle:'Condominium activity over time',activitySubtitle:'Monthly activity from recorded operations',metricLabel:'Metric',periodLabel:'Period',reservationsShort:'Reservations',noticesShort:'Notices',occurrencesShort:'Incidents',sixMonths:'Last 6 months',twelveMonths:'Last 12 months',
            chartNote:'All numbers come from condominium records, not estimates.',recentResidents:'Recent residents',recentResidentsSub:'Residents registered in this condominium',viewAll:'View all',name:'Resident',unit:'Unit',joined:'Joined',status:'Status',distribution:'Activity distribution',distributionSubtitle:'Records this month by category',records:'records',
            noResidents:'No registered residents yet.',noRecords:'No records during this period.',registered:'Registered',pending:'Pending',notAvailable:'Not provided',total:'Total registered',monthOverMonth:'vs. previous month',noChange:'no change',allRecent:'residents registered',maintenance:'Maintenance'
        }
    };
    const language = () => window.getCondomitResolvedLanguage?.() || (/^pt/i.test((navigator.languages || [navigator.language])[0] || 'pt') ? 'pt' : 'en');
    const t = key => copy[language()]?.[key] || copy.pt[key] || key;
    const fmt = value => new Intl.NumberFormat(language() === 'en' ? 'en-US' : 'pt-BR').format(value);
    const monthOf = value => {
        if (!value) return '';
        const d = new Date(value);
        return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` : '';
    };
    const months = count => {
        const today = new Date();
        return Array.from({length:count},(_,i)=>{
            const d = new Date(today.getFullYear(),today.getMonth()-(count-1-i),1);
            return {key:monthOf(d), label:new Intl.DateTimeFormat(language()==='en'?'en-US':'pt-BR',{month:'short'}).format(d).replace('.','')};
        });
    };
    const rowDate = (row, type) => {
        if (type==='reservations') return row?.data_reserva || row?.reservation_date || row?.date || row?.start_time || row?.created_at;
        if (type==='occurrences') return row?.occurrence_date || row?.created_at;
        return row?.created_at || row?.date;
    };
    const allRows = rows => Array.isArray(rows) ? rows : [];
    const counts = (rows, type, windowMonths) => {
        const tally = new Map(windowMonths.map(x=>[x.key,0]));
        allRows(rows).forEach(row=>{const k=monthOf(rowDate(row,type));if(tally.has(k))tally.set(k,tally.get(k)+1)});
        return windowMonths.map(m=>tally.get(m.key));
    };
    const safeRpc = async (name,payload={}) => {
        if (!window.supabaseFetch) throw Error('Supabase unavailable');
        return window.supabaseFetch(`/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    };
    const safeFetch = async path => {
        if (!window.supabaseFetch) throw Error('Supabase unavailable');
        return window.supabaseFetch(path);
    };
    let data = null;
    let unavailable = 0;
    let authRetryCount = 0;
    async function loadDashboard() {
        if (!$('referenceDashboard')) return;
        let user=null;
        try {user=JSON.parse(sessionStorage.getItem('condominiumUser')||'null')} catch(_){}
        if(!user) {
            if(authRetryCount++ < 10) setTimeout(loadDashboard,800);
            return;
        }
        const tasks=[
            ()=>safeRpc('condomit_list_condo_residents_v2').catch(()=>safeRpc('condomit_list_condo_residents')),
            ()=>safeRpc('condomit_list_all_reservations').catch(()=>safeRpc('condomit_list_reservation_slots')),
            ()=>safeFetch('/occurrences?select=*&order=created_at.desc&limit=1000'),
            ()=>safeFetch('/maintenance_items?select=id,title,status,created_at,next_date&order=created_at.desc&limit=1000'),
            ()=>safeFetch('/condominium_notices?select=id,title,created_at&order=created_at.desc&limit=1000')
        ];
        const results=await Promise.allSettled(tasks.map(task=>task()));
        unavailable=results.filter(result=>result.status==='rejected').length;
        data={residents:allRows(results[0].value),reservations:allRows(results[1].value),occurrences:allRows(results[2].value),maintenance:allRows(results[3].value),notices:allRows(results[4].value)};
        renderAll();
    }
    function updateTranslations(){
        document.querySelectorAll('#referenceDashboard [data-ref-t]').forEach(el=>{el.textContent=t(el.dataset.refT)});
        const status=$('refDataStatus');
        if(status&&data)status.innerHTML=unavailable?`<i class="fas fa-triangle-exclamation"></i> ${esc(t('partial'))}`:`<i class="fas fa-circle-check"></i> ${esc(t('ready'))}`;
    }
    function sixMonthSeries(){
        const m=months(6);return {m,reservations:counts(data.reservations,'reservations',m),occurrences:counts(data.occurrences,'occurrences',m),notices:counts(data.notices,'notices',m)};
    }
    function sparkline(id,values){
        const svg=$(id);if(!svg)return;
        const max=Math.max(...values,1),min=Math.min(...values,0),span=max-min||1;
        const pts=values.map((v,i)=>[5+i*22,35-((v-min)/span)*27]);
        svg.innerHTML=`<path d="${pts.map((xy,i)=>(i?'L':'M')+xy.map(x=>x.toFixed(1)).join(' ')).join(' ')}" fill="none" stroke="#557bb0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="2.8" fill="#37679e"/>`;
    }
    function trend(id,now,prev,neutral=''){const el=$(id);if(!el)return;
        el.classList.remove('up','down');
        if(prev===0&&now===0){el.textContent=neutral||t('noChange');return;}
        if(prev===0){el.textContent=neutral||t('monthOverMonth');return;}
        const pct=Math.round(((now-prev)/prev)*100);
        el.textContent=`${pct>0?'↗':pct<0?'↘':'→'} ${pct>0?'+':''}${pct}% ${t('monthOverMonth')}`;
        if(pct>0)el.classList.add('up');if(pct<0)el.classList.add('down');
    }
    function renderKpis(){
        const series=sixMonthSeries();
        let residents=allRows(data.residents);
        const joinedCount=counts(residents.filter(r=>r.joined_at||r.created_at).map(r=>({created_at:r.joined_at||r.created_at})),'notices',series.m);
        const residentTotal=residents.length;
        $('refResidentsValue').textContent=fmt(residentTotal);
        const last=series.m.at(-1).key;
        const previous=series.m.at(-2).key;
        const joinedCurrent=residents.filter(r=>monthOf(r.joined_at||r.created_at)===last).length;
        const joinedPrevious=residents.filter(r=>monthOf(r.joined_at||r.created_at)===previous).length;
        // Total de moradores não é volume mensal; comparar novos cadastros apenas na tendência.
        trend('refResidentsTrend',joinedCurrent,joinedPrevious,t('total'));
        const r=series.reservations,o=series.occurrences,n=series.notices;
        $('refReservationsValue').textContent=fmt(r.at(-1));trend('refReservationsTrend',r.at(-1),r.at(-2));
        $('refOccurrencesValue').textContent=fmt(o.at(-1));trend('refOccurrencesTrend',o.at(-1),o.at(-2));
        $('refNoticesValue').textContent=fmt(n.at(-1));trend('refNoticesTrend',n.at(-1),n.at(-2));
        sparkline('refSparkResidents',joinedCount);sparkline('refSparkReservations',r);sparkline('refSparkOccurrences',o);sparkline('refSparkNotices',n);
    }
    function chartPoints(values){
        const max=Math.max(1,...values);const yTop=Math.ceil(max/4)*4||4;
        const width=900,left=45,right=18,top=23,bottom=238;
        const step=(width-left-right)/Math.max(1,values.length-1);
        const pts=values.map((v,i)=>({x:left+i*step,y:bottom-(v/yTop)*(bottom-top),value:v}));
        return {pts,yTop,width,left,right,top,bottom};
    }
    function curvePath(points){
        return points.map((p,i)=>{
            if(i===0)return `M ${p.x} ${p.y}`;
            const prev=points[i-1];const mid=(prev.x+p.x)/2;
            return `C ${mid} ${prev.y} ${mid} ${p.y} ${p.x} ${p.y}`;
        }).join(' ');
    }
    function renderChart(){
        const root=$('refActivityChart');if(!root||!data)return;
        const type=$('refMetricSelect')?.value||'reservations';
        const length=Number($('refPeriodSelect')?.value||6);
        const m=months(length),values=counts(data[type],type,m);
        const {pts,yTop,left,top,bottom,width}=chartPoints(values);
        const line=curvePath(pts);
        const floor=bottom-top;
        const area=`${line} L ${pts.at(-1).x} ${bottom} L ${pts[0].x} ${bottom} Z`;
        const ticks=Array.from({length:5},(_,i)=>({y:bottom-floor*i/4,value:yTop*i/4}));
        root.setAttribute('aria-label',`${t(type==='reservations'?'reservationsShort':type==='notices'?'noticesShort':'occurrencesShort')}: ${values.map((v,i)=>m[i].label+' '+v).join(', ')}`);
        root.innerHTML=`<svg viewBox="0 0 900 278" role="img" aria-label="${esc(root.getAttribute('aria-label'))}" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="refAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6d97cb" stop-opacity=".25"/><stop offset="100%" stop-color="#6d97cb" stop-opacity=".015"/></linearGradient></defs>
            ${ticks.map(tick=>`<line class="ref-grid" x1="${left}" y1="${tick.y}" x2="${width-14}" y2="${tick.y}"/><text class="ref-axis-text" x="34" y="${tick.y+4}" text-anchor="end">${fmt(tick.value)}</text>`).join('')}
            <path d="${area}" fill="url(#refAreaGradient)"/>
            <path class="ref-main-line" d="${line}"/>
            ${pts.map((pt,i)=>`<circle class="ref-point" cx="${pt.x}" cy="${pt.y}" r="4.6"><title>${esc(m[i].label)}: ${fmt(pt.value)}</title></circle>`).join('')}
            ${pts.map((pt,i)=>pt.value>0?`<text class="ref-point-value" x="${pt.x}" y="${Math.max(13,pt.y-12)}" text-anchor="middle">${fmt(pt.value)}</text>`:'').join('')}
            ${pts.map((pt,i)=>`<text class="ref-axis-text" x="${pt.x}" y="262" text-anchor="middle">${esc(m[i].label)}</text>`).join('')}
        </svg>`;
    }
    function renderResidents(){
        const tbody=$('refResidentsTable');if(!tbody)return;
        const list=[...data.residents].sort((a,b)=>new Date(b.joined_at||b.created_at||0)-new Date(a.joined_at||a.created_at||0)).slice(0,5);
        if(!list.length){tbody.innerHTML=`<tr><td colspan="4" class="ref-table-empty">${esc(t('noResidents'))}</td></tr>`;return;}
        const loc=language()==='en'?'en-US':'pt-BR';
        tbody.innerHTML=list.map(resident=>{
            const name=String(resident.name||resident.full_name||resident.email||t('name'));
            const initials=name.trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase();
            const unit=[resident.block||resident.bloco,resident.apartment||resident.apartamento].filter(Boolean).join(' · ')||'—';
            const date=resident.joined_at||resident.created_at;
            const formatted=date&&!Number.isNaN(new Date(date).getTime())?new Date(date).toLocaleDateString(loc):'—';
            const pending=['pending','pendente','aguardando'].includes(String(resident.status||'').toLowerCase());
            return `<tr><td><div class="ref-resident-identity"><span class="ref-resident-avatar">${esc(initials)}</span><div><strong>${esc(name)}</strong><small>${esc(resident.email||'')}</small></div></div></td><td>${esc(unit)}</td><td>${esc(formatted)}</td><td><span class="ref-status-pill">${esc(t(pending?'pending':'registered'))}</span></td></tr>`;
        }).join('');
    }
    function renderDonut(){
        const cur=months(1);
        const distributions=[
            {key:'reservationsShort',count:counts(data.reservations,'reservations',cur)[0],color:'#426ca5'},
            {key:'occurrencesShort',count:counts(data.occurrences,'occurrences',cur)[0],color:'#83a2cc'},
            {key:'noticesShort',count:counts(data.notices,'notices',cur)[0],color:'#35a89d'},
            {key:'maintenance',count:counts(data.maintenance,'maintenance',cur)[0],color:'#dca96d'}
        ];
        const total=distributions.reduce((sum,item)=>sum+item.count,0);
        $('refDonutTotal').textContent=fmt(total);
        const stops=[];let pct=0;
        distributions.forEach(item=>{const next=pct+(total?item.count/total*100:0);if(item.count)stops.push(`${item.color} ${pct}% ${next}%`);pct=next});
        $('refDonut').style.background=stops.length?`conic-gradient(${stops.join(',')})`:'#e8edf5';
        $('refDonutLegend').innerHTML=distributions.map(item=>`<div class="ref-donut-legend-item"><span><i style="background:${item.color}"></i>${esc(t(item.key))}</span><b>${fmt(item.count)}</b></div>`).join('');
    }
    function renderAll(){if(!data)return;updateTranslations();renderKpis();renderChart();renderResidents();renderDonut();$('refDataStatus')?.classList.toggle('warning',unavailable>0);$('refDataStatus')?.classList.toggle('ready',unavailable===0)}
    document.addEventListener('DOMContentLoaded',()=>{
        if(!$('referenceDashboard'))return;
        updateTranslations();
        $('refMetricSelect')?.addEventListener('change',renderChart);
        $('refPeriodSelect')?.addEventListener('change',renderChart);
        loadDashboard().catch(error=>{console.warn('[Condomit dashboard]',error);const el=$('refDataStatus');if(el)el.textContent=t('partial')});
        window.addEventListener('condomit:language-changed',renderAll);
        window.addEventListener('storage',event=>{if(event.key==='app-language')renderAll()});
    });
})();
