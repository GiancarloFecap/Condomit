(() => {
  'use strict';
  let installPrompt = null;
  let installState = 'unknown';

  function isStandalone() {
    return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installState = 'ready';
    window.dispatchEvent(new CustomEvent('condomit:pwa-ready'));
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installState = 'installed';
    window.dispatchEvent(new CustomEvent('condomit:pwa-installed'));
  });

  window.condomitGetPwaInstallState = () => {
    if (isStandalone()) return 'installed';
    return installPrompt ? 'ready' : installState;
  };

  window.condomitInstallPwa = async () => {
    if (isStandalone()) { installState = 'installed'; return { ok:true, outcome:'installed' }; }
    if (!installPrompt) return { ok:false, outcome:'unavailable' };
    const promptEvent = installPrompt;
    installPrompt = null;
    installState = 'prompting';
    try {
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;
      const accepted = result?.outcome === 'accepted';
      installState = accepted ? 'accepted' : 'dismissed';
      return { ok:accepted, outcome:result?.outcome || installState };
    } catch (error) {
      installState = 'error';
      return { ok:false, outcome:'error', error };
    }
  };

  function inPages() { return String(location.pathname || '').includes('/pages/'); }
  function page(name) { return inPages() ? name : `pages/${name}`; }
  function readUser(){ try{return JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(_){return null} }
  function role(user){ const r=String(user?.user_type||user?.type||'').toLowerCase();return r.includes('sind')?'sindico':r.includes('porteir')?'porteiro':r.includes('administra')||r==='admin'?'administradora':'morador'; }
  async function cep(){
    try { const x=await window.supabaseFetch?.('/rpc/condomit_current_user_cep',{method:'POST',body:'{}'});if(typeof x==='string'&&x)return x; } catch(_){}
    const u=readUser();const c=u?.condominium&&typeof u.condominium==='object'?u.condominium:{};return String(c.cep||c.condominium_id||sessionStorage.getItem('condomitActiveManagedCep')||'').replace(/\D/g,'');
  }


  function createSessionId(){return (crypto?.randomUUID?.()||('sess-'+Date.now()+'-'+Math.random().toString(36).slice(2)));}
  function rotateSessionId(){
    const id=createSessionId();
    try{localStorage.setItem('condomitSessionId027',id);localStorage.setItem('condomitSessionStartedAt',String(Date.now()));}catch(_){}
    return id;
  }
  window.condomitRotateSessionId=rotateSessionId;
  function getSessionId(){
    let id='';try{id=localStorage.getItem('condomitSessionId027')||'';}catch(_){}
    if(!id)id=rotateSessionId();
    return id;
  }
  function deviceLabel(){const ua=navigator.userAgent||'';if(/iPhone|iPad|iPod/i.test(ua))return 'iPhone/iPad';if(/Android/i.test(ua))return 'Android';if(/Windows/i.test(ua))return 'Windows';if(/Macintosh|Mac OS/i.test(ua))return 'Mac';return 'Navegador';}
  async function registerSession(){
    const user=readUser();if(!user?.email||typeof window.supabaseFetch!=='function')return;
    const sessionId=getSessionId();
    try {
      const existing=await window.supabaseFetch(`/user_session_log?select=session_id,revoked_at&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`);
      const row=Array.isArray(existing)?existing[0]:null;
      if(row?.revoked_at){
        const startedAt=Number(localStorage.getItem('condomitSessionStartedAt')||0);
        const revokedAt=Date.parse(row.revoked_at)||0;
        // Se houve um novo login depois da revogação, não reaproveita o ID
        // antigo: cria uma nova sessão de dispositivo e mantém o usuário logado.
        if(startedAt && revokedAt && startedAt>revokedAt){
          rotateSessionId();
          return registerSession();
        }
        try{await window.supabase?.auth?.signOut?.({scope:'local'});}catch(_){}
        try{sessionStorage.clear();localStorage.removeItem('condomitPersistentSessionUser');}catch(_){}
        location.replace(inPages()?'../inicio.html':'inicio.html');
        return;
      }
      const payload={session_id:sessionId,user_email:user.email,device_label:deviceLabel(),user_agent:String(navigator.userAgent||'').slice(0,500),last_seen_at:new Date().toISOString()};
      await window.supabaseFetch('/user_session_log?on_conflict=session_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
    }catch(error){if(!/does not exist|schema cache|PGRST205|42P01/i.test(String(error?.message||error)))console.warn('[Condomit] session log:',error);}
  }

  function ensureManifest(){
    if(document.querySelector('link[rel="manifest"]'))return;
    const link=document.createElement('link');link.rel='manifest';link.href=inPages()?'../manifest.webmanifest':'manifest.webmanifest';document.head.appendChild(link);
  }

  function injectAdvancedNavigation(){
    if(location.pathname.endsWith('/gestao-avancada.html')||location.pathname.endsWith('/index-administradora.html'))return;
    const nav=document.querySelector('.sidebar-nav, .sidebar nav, aside.sidebar nav');
    if(!nav)return;

    const currentRole=role(readUser());
    const lang=(()=>{try{return localStorage.getItem('app-language')==='en'?'en':'pt';}catch(_){return 'pt';}})();
    const labels=lang==='en'
      ? {management:'Management',advanced:'Advanced Management',assembly:'Assembly'}
      : {management:'Gestão',advanced:'Gestão Avançada',assembly:'Assembleia'};

    // Remove a seção antiga que criava um segundo botão e o título “Gestão inteligente”.
    nav.querySelectorAll('.advanced-nav-section-027').forEach(el=>el.remove());
    [...nav.querySelectorAll('.nav-section-title')].forEach(title=>{
      if(/^gest[aã]o inteligente$/i.test(title.textContent.trim())) title.closest('.nav-section')?.remove();
    });

    const advancedLinks=[...nav.querySelectorAll('a.nav-item')].filter(a=>
      /gestao-avancada\.html(?:$|[?#])/i.test(a.getAttribute('href')||'') ||
      /gestão avançada|advanced management/i.test(a.textContent||'')
    );

    if(currentRole!=='sindico'){
      advancedLinks.forEach(a=>a.remove());
      return;
    }

    // Renomeia o grupo de moradores para “Gestão”.
    const residentLink=[...nav.querySelectorAll('a.nav-item')].find(a=>/gestão de moradores|resident management/i.test(a.textContent||''));
    const managementSection=residentLink?.closest('.nav-section');
    if(managementSection){
      let title=managementSection.querySelector(':scope > .nav-section-title');
      if(!title){ title=document.createElement('div'); title.className='nav-section-title'; managementSection.prepend(title); }
      title.textContent=labels.management;

      // Mantém exatamente um botão Gestão Avançada logo abaixo de Gestão de Moradores.
      const keep=advancedLinks.find(a=>a.closest('.nav-section')===managementSection) || advancedLinks[0] || document.createElement('a');
      advancedLinks.filter(a=>a!==keep).forEach(a=>a.remove());
      keep.href=page('gestao-avancada.html');
      keep.className='nav-item';
      keep.dataset.condomitAdvancedLink='true';
      keep.innerHTML=`<i class="fas fa-layer-group"></i><span>${labels.advanced}</span>`;
      residentLink.insertAdjacentElement('afterend',keep);
    }

    // Adiciona o título “Assembleia” no grupo da assembleia quando a sidebar legada não o tiver.
    const assemblyLink=[...nav.querySelectorAll('a.nav-item')].find(a=>/assembleia|assembly/i.test(a.textContent||'') && /assembleia\.html|assembleias/i.test(a.getAttribute('href')||a.textContent||''));
    const assemblySection=assemblyLink?.closest('.nav-section');
    if(assemblySection && !assemblySection.querySelector(':scope > .nav-section-title')){
      const title=document.createElement('div');title.className='nav-section-title';title.textContent=labels.assembly;assemblySection.prepend(title);
    }
  }

  async function showEmergencyBanner(){
    const user=readUser();if(!user||typeof window.supabaseFetch!=='function')return;const currentCep=await cep();if(!currentCep)return;
    try{
      const rows=await window.supabaseFetch(`/emergency_alerts?select=id,title,message,severity,created_at&cep=eq.${encodeURIComponent(currentCep)}&active=eq.true&order=created_at.desc&limit=1`);
      const alert=Array.isArray(rows)?rows[0]:null;if(!alert)return;
      let bar=document.getElementById('condomitEmergencyBanner027');if(!bar){bar=document.createElement('div');bar.id='condomitEmergencyBanner027';bar.className='condomit-emergency-banner-027';document.body.prepend(bar);}
      bar.innerHTML=`<div><i class="fas fa-triangle-exclamation"></i><strong>${escapeHtml(alert.title)}</strong><span>${escapeHtml(alert.message)}</span></div><button type="button" data-ack-emergency="${alert.id}">Confirmar leitura</button>`;
      bar.querySelector('button')?.addEventListener('click',async()=>{
        try{await window.supabaseFetch('/communication_reads?on_conflict=resource_type,resource_id,user_email',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({cep:currentCep,resource_type:'emergency',resource_id:String(alert.id),user_email:user.email,acknowledged:true})});bar.classList.add('acknowledged');bar.querySelector('button').textContent='Leitura confirmada';bar.querySelector('button').disabled=true;}catch(_){}
      });
    }catch(error){ if(!/does not exist|schema cache|PGRST205|42P01/i.test(String(error?.message||error)))console.warn('[Condomit] alerta de emergência:',error); }
  }

  function injectStyle(){ if(document.getElementById('advancedGlobalStyle027'))return;const s=document.createElement('style');s.id='advancedGlobalStyle027';s.textContent=`
    .condomit-emergency-banner-027{position:relative;z-index:9990;background:#a92828;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px max(16px,env(safe-area-inset-right)) 11px max(16px,env(safe-area-inset-left));font:600 14px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 5px 18px rgba(120,20,20,.18)}
    .condomit-emergency-banner-027>div{display:flex;align-items:center;gap:9px;min-width:0}.condomit-emergency-banner-027 span{font-weight:400;opacity:.93;overflow-wrap:anywhere}.condomit-emergency-banner-027 button{border:1px solid rgba(255,255,255,.5);background:#fff;color:#8c1e1e;border-radius:10px;padding:7px 10px;font-weight:800;white-space:nowrap}.condomit-emergency-banner-027.acknowledged{background:#6d3030}
    @media(max-width:650px){.condomit-emergency-banner-027{align-items:flex-start;flex-direction:column}.condomit-emergency-banner-027>div{align-items:flex-start}.condomit-emergency-banner-027 button{width:100%}}
  `;document.head.appendChild(s); }
  function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}

  async function boot(){
    ensureManifest();injectStyle();injectAdvancedNavigation();setTimeout(injectAdvancedNavigation,0);
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')){navigator.serviceWorker.register(inPages()?'../service-worker.js':'service-worker.js',{scope:'../'}).catch(()=>{});}
    await Promise.allSettled([showEmergencyBanner(),registerSession()]);
    window.setInterval(()=>{if(!document.hidden)registerSession();},300000);
    window.addEventListener('condomit:language-changed',injectAdvancedNavigation);
    window.addEventListener('storage',e=>{if(e.key==='app-language')setTimeout(injectAdvancedNavigation,0);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
