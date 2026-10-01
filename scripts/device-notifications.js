(() => {
  'use strict';

  const state = {
    initialized: false,
    subscriptionReady: false,
    foregroundTimer: null,
    user: null,
    prefs: null
  };

  function inPages() {
    return String(location.pathname || '').includes('/pages/');
  }

  function notificationsUrl() {
    return inPages() ? 'notificacoes.html' : 'pages/notificacoes.html';
  }

  function readUser() {
    try {
      return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
    } catch (_) {
      return null;
    }
  }

  function normalizeRole(user) {
    const raw = String(user?.type || user?.user_type || '').trim().toLowerCase();
    if (raw.startsWith('sind')) return 'sindico';
    if (raw.startsWith('porteir')) return 'porteiro';
    return 'morador';
  }

  async function currentCep() {
    try {
      if (typeof window.supabaseFetch === 'function') {
        const value = await window.supabaseFetch('/rpc/condomit_current_user_cep', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        if (typeof value === 'string' && value) return value;
        if (value?.cep) return String(value.cep);
      }
    } catch (_) {}
    const user = state.user || readUser();
    const condo = user?.condominium && typeof user.condominium === 'object' ? user.condominium : {};
    return String(condo.cep || condo.condominium_id || condo.condominium_cep || '').trim();
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  async function getPreferences() {
    try {
      if (typeof window.supabaseFetch !== 'function') return null;
      const result = await window.supabaseFetch('/rpc/condomit_get_notification_preferences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      return Array.isArray(result) ? result[0] : result;
    } catch (_) {
      return null;
    }
  }

  function shouldNotify(row, prefs = state.prefs || {}) {
    const category = String(row?.category || '').trim().toLowerCase();
    const currentRole = normalizeRole(state.user || readUser());
    const actorRoleRaw = String(row?.actor_role || '').trim().toLowerCase();
    const actorRole = actorRoleRaw.startsWith('sind') ? 'sindico' : actorRoleRaw.startsWith('porteir') ? 'porteiro' : actorRoleRaw ? 'morador' : '';

    if (category === 'chat' && prefs.counterpart_messages === false) return false;
    if (currentRole === 'sindico' && actorRole === 'morador' && prefs.counterpart_messages === false) return false;
    if (currentRole !== 'sindico' && actorRole === 'sindico' && prefs.counterpart_messages === false) return false;
    if ((category === 'avisos' || category === 'assembleias') && prefs.general_notices === false) return false;
    if (category === 'reservas' && prefs.reservations === false) return false;
    if (category === 'entregas' && prefs.packages === false) return false;
    return true;
  }

  async function getCurrentMaxNotificationId() {
    try {
      if (typeof window.supabaseFetch !== 'function') return 0;
      const rows = await window.supabaseFetch('/rpc/condomit_list_notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      return (Array.isArray(rows) ? rows : []).reduce((max, row) => Math.max(max, Number(row?.id || 0)), 0);
    } catch (_) {
      return 0;
    }
  }

  async function registerPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission !== 'granted') return false;
    if (typeof window.supabaseFetch !== 'function') return false;

    const response = await fetch('/api/push/public-key', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return false;
    const payload = await response.json().catch(() => null);
    const publicKey = String(payload?.publicKey || '').trim();
    if (!publicKey) return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    const json = subscription.toJSON();
    if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) return false;

    const user = state.user || readUser();
    if (!user?.email) return false;
    const cep = await currentCep();
    if (!cep) return false;
    const maxNotificationId = await getCurrentMaxNotificationId();

    await window.supabaseFetch('/push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_email: String(user.email).trim().toLowerCase(),
        cep,
        user_role: normalizeRole(user),
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: String(navigator.userAgent || '').slice(0, 500),
        enabled: true,
        last_notification_id: maxNotificationId,
        updated_at: new Date().toISOString()
      })
    });

    state.subscriptionReady = true;
    stopForegroundFallback();
    return true;
  }

  async function enableDeviceNotifications() {
    if (!('Notification' in window)) return { ok: false, reason: 'unsupported' };
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      startForegroundFallback();
      return { ok: false, reason: permission };
    }
    state.prefs = await getPreferences() || state.prefs || {};
    const registered = await registerPushSubscription().catch((error) => {
      console.warn('[Push] Não foi possível registrar Web Push:', error?.message || error);
      return false;
    });
    if (!registered) startForegroundFallback();
    window.dispatchEvent(new CustomEvent('condomit:notification-permission-changed', { detail: { permission } }));
    return { ok: true, push: registered };
  }

  async function showSystemNotification(row) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = String(row?.title || 'Condomit');
    const body = String(row?.description || row?.message || '').slice(0, 220);
    const options = {
      body,
      icon: inPages() ? '../assets/icon-192.png' : 'assets/icon-192.png',
      badge: inPages() ? '../assets/favicon.png' : 'assets/favicon.png',
      tag: `condomit-${row?.id || Date.now()}`,
      renotify: false,
      data: { url: notificationsUrl(), notificationId: row?.id || null }
    };
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
    } catch (_) {
      try { new Notification(title, options); } catch (_) {}
    }
  }

  function foregroundKey() {
    return `condomit.foregroundPush.last.${String(state.user?.email || 'anon').trim().toLowerCase()}`;
  }

  async function pollForegroundNotifications() {
    if (document.hidden || Notification.permission !== 'granted' || typeof window.supabaseFetch !== 'function') return;
    try {
      const rows = await window.supabaseFetch('/rpc/condomit_list_notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      const list = Array.isArray(rows) ? rows.slice().sort((a, b) => Number(a.id || 0) - Number(b.id || 0)) : [];
      if (!list.length) return;
      let last = Number(localStorage.getItem(foregroundKey()) || 0);
      const max = list.reduce((m, row) => Math.max(m, Number(row.id || 0)), 0);
      if (!last) {
        localStorage.setItem(foregroundKey(), String(max));
        return;
      }
      state.prefs = await getPreferences() || state.prefs || {};
      const fresh = list.filter((row) => Number(row.id || 0) > last);
      for (const row of fresh) {
        if (shouldNotify(row, state.prefs)) await showSystemNotification(row);
      }
      localStorage.setItem(foregroundKey(), String(Math.max(last, max)));
    } catch (_) {}
  }

  function startForegroundFallback() {
    if (state.foregroundTimer || !('Notification' in window) || Notification.permission !== 'granted') return;
    pollForegroundNotifications();
    state.foregroundTimer = window.setInterval(pollForegroundNotifications, 20000);
  }

  function stopForegroundFallback() {
    if (state.foregroundTimer) window.clearInterval(state.foregroundTimer);
    state.foregroundTimer = null;
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.user = readUser();
    if (!state.user?.email) return;
    state.prefs = await getPreferences() || {};

    if ('Notification' in window && Notification.permission === 'granted') {
      const ok = await registerPushSubscription().catch(() => false);
      if (!ok) startForegroundFallback();
      return;
    }

    // O navegador só permite pedir permissão a partir de uma ação do usuário.
    // Fazemos uma única tentativa no primeiro gesto, mantendo os switches ligados por padrão.
    if ('Notification' in window && Notification.permission === 'default') {
      const key = 'condomit.notification.permission.prompted';
      const firstInteraction = async () => {
        if (localStorage.getItem(key) === '1') return;
        localStorage.setItem(key, '1');
        await enableDeviceNotifications().catch(() => {});
      };
      document.addEventListener('pointerdown', firstInteraction, { once: true, passive: true });
      document.addEventListener('keydown', firstInteraction, { once: true });
    }
  }

  window.condomitEnableDeviceNotifications = enableDeviceNotifications;
  window.condomitRefreshNotificationSubscription = registerPushSubscription;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
