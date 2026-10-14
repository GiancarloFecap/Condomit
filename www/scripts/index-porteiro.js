async function rpc(name, payload = {}) {
    if (typeof window.supabaseFetch !== 'function') throw new Error('Supabase indisponível.');
    return window.supabaseFetch(`/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function resolveCurrentCondoCep(user = null) {
    const normalize = (value) => {
        const raw = String(value || '').trim();
        const digits = raw.replace(/\D/g, '');
        return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : raw;
    };

    /*
     * 1) Usa o resolvedor compartilhado quando disponível.
     * 2) Consulta a RPC autenticada.
     * 3) Consulta o vínculo diretamente.
     * 4) Por último, usa o vínculo já validado na sessão.
     *
     * Isso evita o ciclo index-porteiro -> entrar-condominio-porteiro -> index-porteiro
     * quando uma das formas de consulta do CEP falha temporariamente.
     */
    try {
        if (typeof window.resolveUserCondominiumCep === 'function') {
            const resolved = await window.resolveUserCondominiumCep(user);
            if (resolved) return normalize(resolved);
        }
    } catch (error) {
        console.warn('Falha ao resolver CEP pelo helper compartilhado:', error?.message || error);
    }

    try {
        const result = await rpc('condomit_current_user_cep');
        if (typeof result === 'string' && result.trim()) return normalize(result);
        if (Array.isArray(result)) {
            const value = result[0]?.condomit_current_user_cep || result[0]?.cep || '';
            if (value) return normalize(value);
        }
        const value = result?.condomit_current_user_cep || result?.cep || '';
        if (value) return normalize(value);
    } catch (error) {
        console.warn('Não foi possível validar o vínculo do porteiro pela RPC:', error?.message || error);
    }

    const email = String(user?.email || '').trim();
    if (email) {
        try {
            const rows = await window.supabaseFetch(
                `/user_condominiums?select=condominium_id&user_email=eq.${encodeURIComponent(email)}&limit=1`
            );
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (row?.condominium_id) return normalize(row.condominium_id);
        } catch (error) {
            console.warn('Não foi possível validar o vínculo do porteiro pela tabela:', error?.message || error);
        }

        try {
            const response = await fetch(
                `/api/user_condominiums?user_email=eq.${encodeURIComponent(email)}`
            );
            if (response.ok) {
                const rows = await response.json().catch(() => []);
                const row = Array.isArray(rows) ? rows[0] : rows;
                if (row?.condominium_id) return normalize(row.condominium_id);
            }
        } catch (error) {
            console.warn('Não foi possível validar o vínculo do porteiro pela API:', error?.message || error);
        }
    }

    const condominium = user?.condominium && typeof user.condominium === 'object'
        ? user.condominium
        : {};
    return normalize(
        condominium.cep ||
        condominium.condominium_id ||
        condominium.condominium_cep ||
        ''
    );
}


/* Dashboard 063 — informações reais por condomínio, com estados vazios seguros. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const locale = () => (window.getCondomitResolvedLanguage?.() || (/^en/i.test(navigator.language || 'pt') ? 'en' : 'pt')) === 'en' ? 'en' : 'pt';
    const dict = {
        pt: {
            hello:'Olá', porter:'Porteiro', subtitle:'Resumo das atividades e atendimentos da portaria.', visitorKpi:'Visitantes esperados hoje', packageKpi:'Encomendas pendentes', reservationKpi:'Reservas de hoje', emergency:'Acionar emergência',
            loading:'Carregando...', today:'Hoje', yesterday:'Ontem', todayInfo:'Previstos para hoje', waitingPickup:'Aguardando retirada', reservationsInfo:'Reservas registradas',
            movementTitle:'Movimentação da portaria', movementDescription:'Liberações e revogações de acesso registradas no sistema.', movementFootnote:'Os eventos são registros de liberação ou revogação; não confirmam a passagem física.',
            released:'Liberações', revoked:'Revogações', visitorsTitle:'Visitantes esperados', packagesTitle:'Encomendas na portaria', noticesTitle:'Avisos importantes', viewAll:'Ver todos',
            noVisitors:'Nenhum visitante previsto para hoje.',noPackages:'Nenhuma encomenda registrada.',noNotices:'Nenhum aviso publicado.',noLogs:'Nenhum evento registrado neste período.', unavailable:'Dados temporariamente indisponíveis.',
            noTime:'Horário não informado',unit:'Unidade',resident:'Morador',guest:'Visitante',package:'Encomenda',delivered:'Retirada',notice:'Comunicado', todayPicked:'Retirada hoje'
        },
        en: {
            hello:'Hello', porter:'Porter', subtitle:'An overview of gatehouse activity and services.',visitorKpi:'Expected visitors today',packageKpi:'Pending packages',reservationKpi:'Reservations today',emergency:'Call emergency',
            loading:'Loading...',today:'Today',yesterday:'Yesterday',todayInfo:'Expected today',waitingPickup:'Awaiting pickup',reservationsInfo:'Registered reservations',
            movementTitle:'Gatehouse activity',movementDescription:'Access authorizations and revocations recorded in the system.',movementFootnote:'These events record authorizations/revocations, not confirmed physical arrivals or departures.',
            released:'Authorizations',revoked:'Revocations',visitorsTitle:'Expected visitors',packagesTitle:'Packages at the gatehouse',noticesTitle:'Important notices',viewAll:'View all',
            noVisitors:'No visitors expected today.',noPackages:'No registered packages.',noNotices:'No published notices.',noLogs:'No recorded events for this period.',unavailable:'Data temporarily unavailable.',
            noTime:'Time not provided',unit:'Unit',resident:'Resident',guest:'Visitor',package:'Package',delivered:'Picked up',notice:'Notice',todayPicked:'Picked up today'
        }
    };
    const t = key => dict[locale()][key] || key;
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const todayKey = () => dateKey(new Date());
    const parseDay = input => {
        if (!input) return '';
        if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input) && !input.includes('T')) return input.slice(0,10);
        const d = new Date(input);
        return Number.isFinite(d.getTime()) ? dateKey(d) : '';
    };
    const dateTime = input => { const d = new Date(input); return Number.isFinite(d.getTime()) ? d : null; };
    const asArray = rows => Array.isArray(rows) ? rows : [];
    const state = {user:null, visitors:null,packages:null,reservations:null,notices:null,logs:null};
    const initLabel = (id,text) => { const el=$(id);if(el)el.textContent=text; };
    const setValue = (id,value) => initLabel(id,value==null?'—':new Intl.NumberFormat(locale()==='en'?'en-US':'pt-BR').format(value));
    const emptyMarkup = msg => `<p class="porter-empty">${esc(msg)}</p>`;
    const isPending = pkg => ['aguardando retirada','pendente','pending','aguardando'].includes(String(pkg?.status||'').trim().toLowerCase());
    const isPicked = pkg => ['retirada','retirado','picked','delivered'].includes(String(pkg?.status||'').trim().toLowerCase());
    const isRefused = visitor => ['recusado','rejeitado','revogado','denied','rejected'].includes(String(visitor?.release_status||'').toLowerCase());
    const expectedDate = visitor => parseDay(visitor?.visit_date || visitor?.scheduled_at || visitor?.date);
    const reservationDate = reservation => parseDay(reservation?.data_reserva || reservation?.reservation_date || reservation?.start_time || reservation?.date);
    const reservationsToday = () => asArray(state.reservations).filter(r=>{
        if(reservationDate(r)!==todayKey())return false;
        const s=String(r.status||'').toLowerCase();
        return !['cancelada','cancelled','rejeitada','indisponivel','disponível','disponivel','livre','free'].includes(s);
    });
    const expectedToday = () => asArray(state.visitors).filter(v=>expectedDate(v)===todayKey() && !isRefused(v));
    const initials = name => String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'PT';

    function renderText() {
        document.querySelectorAll('#porterDashboard [data-porter-i18n]').forEach(el=>{el.textContent=t(el.dataset.porterI18n)});
        const period=$('porterPeriodSelect');
        if (period?.options.length>=2) {period.options[0].text=t('today');period.options[1].text=t('yesterday');}
        initLabel('porterFirstName',state.user?.name?.trim()?.split(/\s+/)[0]||t('porter'));
    }
    function renderMetrics(){
        const visitors=state.visitors===null?null:expectedToday().length;
        const packages=state.packages===null?null:state.packages.filter(isPending).length;
        const reservations=state.reservations===null?null:reservationsToday().length;
        setValue('porterVisitorsCount',visitors);
        setValue('porterPackagesCount',packages);
        setValue('porterReservationsCount',reservations);
        initLabel('porterVisitorsHint',visitors===null?t('unavailable'):t('todayInfo'));
        initLabel('porterPackagesHint',packages===null?t('unavailable'):t('waitingPickup'));
        initLabel('porterReservationsHint',reservations===null?t('unavailable'):t('reservationsInfo'));
    }
    function visitorTime(visitor){
        const raw=visitor?.start_time || visitor?.visit_time || visitor?.time_from || '';
        if(raw)return String(raw).slice(0,5);
        return '';
    }
    function renderVisitors(){
        const target=$('porterVisitorsList');if(!target)return;
        if(!state.visitors){target.innerHTML=emptyMarkup(t('unavailable'));return;}
        const list=expectedToday().sort((a,b)=>visitorTime(a).localeCompare(visitorTime(b))).slice(0,4);
        if(!list.length){target.innerHTML=emptyMarkup(t('noVisitors'));return;}
        target.innerHTML=list.map(visitor=>{
            const name=String(visitor.full_name||visitor.visitor_name||t('guest'));
            const responsible=visitor.responsible||{};
            const residence=responsible.condominium||{};
            const unit=[residence.block?`Bloco ${residence.block}`:'',residence.apartment?`Apto ${residence.apartment}`:visitor.apartment?`Apto ${visitor.apartment}`:''].filter(Boolean).join(' · ');
            const who=responsible.name?`${t('resident')}: ${responsible.name}`:'';
            const details=[unit,who].filter(Boolean).join(' · ') || t('unit');
            const time=visitorTime(visitor);
            return `<article class="porter-record"><span class="porter-record-icon"><i class="fas fa-user" aria-hidden="true"></i></span><div class="porter-record-content"><strong title="${esc(name)}">${esc(name)}</strong><small title="${esc(details)}">${esc(details)}</small></div><span class="porter-record-side">${time?`<span class="porter-time">${esc(time)}</span>`:esc(t('noTime'))}</span></article>`;
        }).join('');
    }
    function renderPackages(){
        const target=$('porterPackagesList');if(!target)return;
        if(!state.packages){target.innerHTML=emptyMarkup(t('unavailable'));return;}
        const packages=[...state.packages].sort((a,b)=>(Number(isPending(b))-Number(isPending(a))) || (new Date(b.received_at||b.created_at||0)-new Date(a.received_at||a.created_at||0))).slice(0,4);
        if(!packages.length){target.innerHTML=emptyMarkup(t('noPackages'));return;}
        target.innerHTML=packages.map(pkg=>{
            const name=String(pkg.recipient_name||t('package'));
            const unit=[pkg.block?`Bloco ${pkg.block}`:'',pkg.apartment?`Apto ${pkg.apartment}`:''].filter(Boolean).join(' · ');
            const desc=[unit,pkg.carrier||pkg.package_description||''].filter(Boolean).join(' · ') || t('package');
            const pending=isPending(pkg),picked=isPicked(pkg);
            const status=pending?t('waitingPickup'):picked?t('delivered'):String(pkg.status||'');
            return `<article class="porter-record"><span class="porter-record-icon is-green"><i class="fas fa-box" aria-hidden="true"></i></span><div class="porter-record-content"><strong title="${esc(name)}">${esc(name)}</strong><small>${esc(desc)}</small></div><span class="porter-record-side"><span class="porter-tag ${pending?'is-pending':''}">${esc(status)}</span></span></article>`;
        }).join('');
    }
    function renderNotices(){
        const target=$('porterNoticesList');if(!target)return;
        if(!state.notices){target.innerHTML=emptyMarkup(t('unavailable'));return;}
        const notices=[...state.notices].sort((a,b)=>new Date(b.createdAt||b.created_at||0)-new Date(a.createdAt||a.created_at||0)).slice(0,4);
        if(!notices.length){target.innerHTML=emptyMarkup(t('noNotices'));return;}
        target.innerHTML=notices.map(notice=>{
            const title=notice.title||t('notice');
            const detail=notice.message||notice.description||'';
            const d=dateTime(notice.createdAt||notice.created_at);
            const date=d?new Intl.DateTimeFormat(locale()==='en'?'en-US':'pt-BR',{day:'2-digit',month:'short'}).format(d):'';
            return `<article class="porter-record"><span class="porter-record-icon is-red"><i class="fas fa-bullhorn" aria-hidden="true"></i></span><div class="porter-record-content"><strong title="${esc(title)}">${esc(title)}</strong><small title="${esc(detail)}">${esc(detail)}</small></div><span class="porter-record-side">${esc(date)}</span></article>`;
        }).join('');
    }
    function renderChart(){
        const target=$('porterMovementChart');if(!target)return;
        if(!state.logs){target.innerHTML=emptyMarkup(t('unavailable'));return;}
        const period=$('porterPeriodSelect')?.value||'today';
        const d=new Date();if(period==='yesterday')d.setDate(d.getDate()-1);
        const day=dateKey(d),entries=Array(8).fill(0),revocations=Array(8).fill(0);
        for(const log of state.logs){
            const when=dateTime(log?.created_at);if(!when||dateKey(when)!==day)continue;
            const group=Math.min(7,Math.floor(when.getHours()/3));
            const action=String(log?.action||'').toLowerCase();
            if(action==='liberacao')entries[group]++;
            else if(action==='revogacao'||action==='recusa')revocations[group]++;
        }
        const maximum=Math.max(...entries,...revocations,0);
        if(!maximum){target.innerHTML=emptyMarkup(t('noLogs'));return;}
        const peak=Math.max(4,Math.ceil(maximum/4)*4);
        const left=38,bottom=210,top=12,width=820,chartWidth=width-left-10,chartHeight=bottom-top;
        const bars=[];
        for(let i=0;i<8;i++){
            const center=left+(i+.5)*chartWidth/8;
            const a=entries[i],b=revocations[i];
            const firstHeight=chartHeight*a/peak,secondHeight=chartHeight*b/peak;
            bars.push(`<rect x="${(center-17).toFixed(1)}" y="${(bottom-firstHeight).toFixed(1)}" width="15" height="${firstHeight.toFixed(1)}" rx="2" fill="#164c96"><title>${esc(t('released'))} ${String(i*3).padStart(2,'0')}h: ${a}</title></rect>`);
            bars.push(`<rect x="${(center+2).toFixed(1)}" y="${(bottom-secondHeight).toFixed(1)}" width="15" height="${secondHeight.toFixed(1)}" rx="2" fill="#17b7a0"><title>${esc(t('revoked'))} ${String(i*3).padStart(2,'0')}h: ${b}</title></rect>`);
            bars.push(`<text class="porter-chart-tick" x="${center.toFixed(1)}" y="239" text-anchor="middle">${String(i*3).padStart(2,'0')}h</text>`);
        }
        const lines=Array.from({length:5},(_,i)=>{
            const y=bottom-i*chartHeight/4;
            const v=peak*i/4;
            return `<line class="porter-chart-grid" x1="${left}" y1="${y}" x2="${width}" y2="${y}"/><text class="porter-chart-tick" x="${left-7}" y="${y+4}" text-anchor="end">${v}</text>`;
        });
        const accessible=`${t('released')}: ${entries.join(', ')}. ${t('revoked')}: ${revocations.join(', ')}`;
        target.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(accessible)}" viewBox="0 0 840 252">${lines.join('')}${bars.join('')}</svg>`;
    }
    function renderAll(){renderText();renderMetrics();renderVisitors();renderPackages();renderNotices();renderChart();}
    function presentTask(promise, key){return Promise.resolve(promise).then(rows=>{state[key]=asArray(rows);renderAll();}).catch(error=>{state[key]=null;renderAll();console.warn(`[Porteiro] Não foi possível carregar ${key}:`,error?.message||error)});}
    async function refresh(){
        if(!state.user)return;
        await Promise.allSettled([
            presentTask(window.getVisitorsForCondominium?.(state.user)??Promise.reject(new Error('Consulta de visitantes indisponível')), 'visitors'),
            presentTask(rpc('condomit_list_packages'), 'packages'),
            presentTask(rpc('condomit_list_all_reservations').catch(()=>rpc('condomit_list_reservation_slots')), 'reservations'),
            presentTask(window.getVisitorAccessLogsForCondominium?.()??Promise.reject(new Error('Consulta de acessos indisponível')), 'logs'),
            presentTask(window.communityHub?.getWallNotices?.(state.user)??Promise.reject(new Error('Consulta de avisos indisponível')), 'notices')
        ]);
    }
    async function init(){
        let user=null;
        try{user=typeof window.refreshCurrentUserFromDb==='function'?await window.refreshCurrentUserFromDb():JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(error){console.warn('[Porteiro] Falha ao carregar usuário:',error?.message||error)}
        if(!user){window.location.href='entrar.html';return;}
        const type=typeof window.getNormalizedUserType==='function'?window.getNormalizedUserType(user):String(user.type||user.user_type||'').trim().toLowerCase();
        if(type!=='porteiro') {if(typeof window.redirectToHome==='function')window.redirectToHome();else window.location.href='index.html';return;}
        const cep=await resolveCurrentCondoCep(user);
        if(!cep){window.location.href='entrar-condominio-porteiro.html';return;}
        if(!user.condominium || typeof user.condominium!=='object')user.condominium={};
        user.condominium.cep=cep;user.condominium.condominium_id=cep;
        try {const rows=await window.supabaseFetch(`/condominiums?select=cep,condominium_name&cep=eq.${encodeURIComponent(cep)}&limit=1`);const condo=asArray(rows)[0];if(condo?.condominium_name)user.condominium.name=condo.condominium_name;}catch(_){}
        try{sessionStorage.setItem('condominiumUser',JSON.stringify(user));}catch(_){}
        state.user=user;
        window.syncAllAvatars?.(user);
        $('porterPeriodSelect')?.addEventListener('change',renderChart);
        window.addEventListener('condomit:language-changed',renderAll);
        window.addEventListener('storage',e=>{if(e.key==='app-language')renderAll()});
        renderText();
        await refresh();
        window.setInterval(()=>{if(!document.hidden)refresh()},45000);
    }
    document.addEventListener('DOMContentLoaded',init);
})();
