const CACHE='condomit-shell-v055-login';
const CORE=['/inicio.html','/pages/entrar.html','/pages/tipo-usuario.html','/styles/theme.css','/styles/responsive-mobile.css','/styles/ux-polish.css','/scripts/device-notifications.js','/assets/favicon.png','/assets/icon-192.png','/assets/icon-512.png','/manifest.webmanifest','/privacidade.html','/suporte.html','/excluir-conta.html'];

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

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    payload = { title: 'Condomit', body: event.data ? event.data.text() : '' };
  }
  const title = String(payload.title || 'Condomit');
  const options = {
    body: String(payload.body || payload.description || '').slice(0, 240),
    icon: '/assets/icon-192.png',
    badge: '/assets/favicon.png',
    tag: String(payload.tag || `condomit-${payload.notificationId || Date.now()}`),
    renotify: false,
    data: {
      url: String(payload.url || '/pages/notificacoes.html'),
      notificationId: payload.notificationId || null
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || '/pages/notificacoes.html', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        try { await client.navigate(targetUrl); } catch (_) {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return null;
  })());
});
