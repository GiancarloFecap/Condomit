const CACHE='condomit-shell-v028';
const CORE=['/inicio.html','/pages/entrar.html','/pages/tipo-usuario.html','/styles/theme.css','/styles/responsive-mobile.css','/assets/favicon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return response;}).catch(()=>caches.match(event.request).then(r=>r||caches.match('/inicio.html'))));
});
