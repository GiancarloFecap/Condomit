(function(){
  'use strict';
  const routes={morador:'index-morador.html',sindico:'index.html',porteiro:'index-porteiro.html'};
  const labels={morador:'Morador',sindico:'Síndico',porteiro:'Porteiro'};
  let busy=false;

  const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  function readCachedUser(){try{return JSON.parse(sessionStorage.getItem('condominiumUser')||'null')}catch(_){return null}}
  function setStatus(text,type=''){const el=document.getElementById('demoStatus');if(!el)return;el.textContent=text||'';el.className=`demo-status ${type}`.trim()}
  function setBusy(value){busy=value;document.querySelectorAll('[data-demo-role]').forEach(btn=>{btn.disabled=value})}
  async function waitForAuth(){for(let i=0;i<50;i+=1){if(window.supabase?.auth)return window.supabase;await sleep(80)}throw new Error('Não foi possível iniciar a autenticação.')}
  async function getFreshProfile(){if(typeof window.refreshCurrentUserFromDb==='function')return window.refreshCurrentUserFromDb().catch(()=>null);return null}
  function normalizeRole(value){const raw=String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(raw.startsWith('sind'))return 'sindico';if(raw.startsWith('porteir'))return 'porteiro';return 'morador'}
  function persistDemoUser(profile,role,fallback={}){
    const user={...(profile||{}),...fallback,type:role,user_type:role,demo_access:true,plan_name:'Premium',planName:'Premium',plan_level:3,planLevel:3};
    sessionStorage.setItem('condominiumUser',JSON.stringify(user));
    try{window.persistCondomitUser?.(user)}catch(_){}
    return user;
  }
  async function switchExistingDemo(role,user){
    setStatus(`Alterando o perfil para ${labels[role]}...`,'loading');
    await window.supabaseFetch('/rpc/condomit_demo_switch_role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target_role:role})});
    const profile=await getFreshProfile();
    persistDemoUser(profile,role,user);
  }
  async function createDemo(role){
    setStatus(`Criando acesso de demonstração como ${labels[role]}...`,'loading');
    const response=await fetch('/api/demo/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload?.error||'Não foi possível criar a conta de demonstração.');
    const supabase=await waitForAuth();
    const {error}=await supabase.auth.signInWithPassword({email:payload.email,password:payload.password});
    if(error)throw error;
    await sleep(120);
    const profile=await getFreshProfile();
    persistDemoUser(profile,role,payload);
  }
  async function enterRole(role){
    if(busy)return;
    setBusy(true);
    try{
      await waitForAuth();
      const cached=readCachedUser();
      const {data}=await window.supabase.auth.getSession();
      const signedEmail=String(data?.session?.user?.email||'').toLowerCase();
      const cachedEmail=String(cached?.email||'').toLowerCase();
      if(cached?.demo_access===true && signedEmail && signedEmail===cachedEmail){
        await switchExistingDemo(role,cached);
      }else{
        if(data?.session)await window.supabase.auth.signOut().catch(()=>null);
        await createDemo(role);
      }
      setStatus(`Abrindo a Condomit como ${labels[role]}...`,'loading');
      window.location.href=routes[role];
    }catch(error){
      console.error('Erro no acesso de demonstração:',error);
      setStatus(error?.message||'Não foi possível abrir o ambiente de demonstração.','error');
      window.showToast?.(error?.message||'Não foi possível abrir o ambiente de demonstração.','error');
    }finally{setBusy(false)}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-demo-role]').forEach(btn=>btn.addEventListener('click',()=>enterRole(normalizeRole(btn.dataset.demoRole))));
    const cached=readCachedUser();
    if(cached?.demo_access===true)setStatus(`Acesso de demonstração ativo. Você pode trocar de perfil quando quiser.`);
  });
})();
