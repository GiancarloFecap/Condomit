const CACHE='condomit-shell-v031';
const CORE=['/inicio.html','/pages/entrar.html','/pages/tipo-usuario.html','/styles/theme.css','/styles/responsive-mobile.css','/assets/favicon.png','/assets/icon-192.png','/assets/icon-512.png','/manifest.webmanifest','/privacidade.html','/suporte.html','/excluir-conta.html'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  const isNavigation=event.request.mode==='navigate';
  event.respondWith(
    fetch(event.request).then(response=>{
      if(response && response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});}
      return response;
    }).catch(async()=>{
      const cached=await caches.match(event.request);
      if(cached)return cached;
      if(isNavigation)return caches.match('/inicio.html');
      return Response.error();
    })
  );
});
