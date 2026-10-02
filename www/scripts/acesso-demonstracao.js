(function(){
  'use strict';
  const ADMIN_EMAIL='contato.condomit@gmail.com';
  const routes={morador:'index-morador.html',sindico:'index.html',porteiro:'index-porteiro.html'};
  const labels={morador:'Morador',sindico:'Síndico',porteiro:'Porteiro'};
  let busy=false;

  const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  function readCachedUser(){try{return JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(_){return null}}
  function setStatus(text,type=''){const el=document.getElementById('demoStatus');if(!el)return;el.textContent=text||'';el.className=`demo-status ${type}`.trim()}
  function setBusy(value){busy=value;document.querySelectorAll('[data-demo-role]').forEach(btn=>{btn.disabled=value})}
  function normalizeRole(value){const raw=String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(raw.startsWith('sind'))return'sindico';if(raw.startsWith('porteir'))return'porteiro';return'morador'}
  async function waitForAuth(){for(let i=0;i<50;i+=1){if(window.supabase?.auth)return window.supabase;await sleep(80)}throw new Error('Não foi possível iniciar a autenticação.')}
  async function getFreshProfile(){if(typeof window.refreshCurrentUserFromDb==='function')return window.refreshCurrentUserFromDb().catch(()=>null);return null}
  function persistAdminUser(profile,role,fallback={}){
    const user={...(fallback||{}),...(profile||{}),type:role,user_type:role,plan_name:'Premium',planName:'Premium',plan_level:3,planLevel:3};
    sessionStorage.setItem('condominiumUser',JSON.stringify(user));
    try{window.persistCondomitUser?.(user)}catch(_){}
    return user;
  }
  async function ensureAuthorized(){
    const supabase=await waitForAuth();
    const {data}=await supabase.auth.getSession();
    const signedEmail=String(data?.session?.user?.email||'').trim().toLowerCase();
    const cached=readCachedUser();
    const cachedEmail=String(cached?.email||'').trim().toLowerCase();
    if(signedEmail!==ADMIN_EMAIL||cachedEmail!==ADMIN_EMAIL){
      setStatus('A troca de tipo de usuário é exclusiva da conta administrativa.','error');
      document.querySelectorAll('[data-demo-role]').forEach(btn=>{btn.disabled=true});
      setTimeout(()=>{window.location.href='perfil.html'},900);
      return null;
    }
    return cached;
  }
  async function enterRole(role){
    if(busy)return;
    setBusy(true);
    try{
      const cached=await ensureAuthorized();
      if(!cached)return;
      setStatus(`Alterando o perfil para ${labels[role]}...`,'loading');
      await window.supabaseFetch('/rpc/condomit_demo_switch_role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target_role:role})});
      const profile=await getFreshProfile();
      persistAdminUser(profile,role,cached);
      setStatus(`Abrindo a Condomit como ${labels[role]}...`,'loading');
      window.location.href=routes[role];
    }catch(error){
      console.error('Erro ao trocar tipo de usuário:',error);
      setStatus(error?.message||'Não foi possível trocar o tipo de usuário.','error');
      window.showToast?.(error?.message||'Não foi possível trocar o tipo de usuário.','error');
    }finally{setBusy(false)}
  }
  document.addEventListener('DOMContentLoaded',async()=>{
    const cached=await ensureAuthorized();
    if(!cached)return;
    setStatus('Selecione o tipo de usuário que deseja utilizar.');
    document.querySelectorAll('[data-demo-role]').forEach(btn=>btn.addEventListener('click',()=>enterRole(normalizeRole(btn.dataset.demoRole))));
  });
})();
