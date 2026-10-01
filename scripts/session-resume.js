(function () {
    'use strict';

    let inFlight = null;
    const EXPLICIT_LOGOUT_KEY = 'authExplicitLogoutAt';

    function hasExplicitLogoutGuard() {
        try {
            return Boolean(localStorage.getItem(EXPLICIT_LOGOUT_KEY));
        } catch (_) {
            return false;
        }
    }

    function normalizeType(user) {
        const raw = String(user?.user_type || user?.type || '').trim().toLowerCase();
        if (raw === 'síndico') return 'sindico';
        if (raw.startsWith('administra') || raw === 'admin') return 'administradora';
        return raw;
    }

    function pageUrl(fileName) {
        const inPages = String(window.location.pathname || '').includes('/pages/');
        return inPages ? fileName : `pages/${fileName}`;
    }

    function parseCondominium(value) {
        if (value && typeof value === 'object') return { ...value };
        if (typeof value === 'string' && value.trim()) {
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {}
        }
        return {};
    }

    async function waitForSupabase(timeoutMs = 5000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (window.supabase?.auth && typeof window.supabase.auth.getSession === 'function') return window.supabase;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return null;
    }

    async function fetchProfile(email) {
        if (!email) return null;
        if (typeof window.fetchUserByEmail === 'function') {
            return window.fetchUserByEmail(email);
        }
        if (typeof window.supabaseFetch !== 'function') return null;
        const rows = await window.supabaseFetch(`/users?select=*&email=eq.${encodeURIComponent(email)}&limit=1`);
        return Array.isArray(rows) ? rows[0] || null : rows || null;
    }

    async function resolveCep() {
        if (typeof window.supabaseFetch !== 'function') return '';
        try {
            const result = await window.supabaseFetch('/rpc/condomit_current_user_cep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            if (typeof result === 'string') return result;
            if (Array.isArray(result)) return String(result[0]?.condomit_current_user_cep || result[0]?.cep || '');
            return String(result?.condomit_current_user_cep || result?.cep || '');
        } catch (_) {
            return '';
        }
    }

    async function enrichCondominium(profile, cep) {
        const condominium = parseCondominium(profile?.condominium);
        if (!cep) return condominium;
        condominium.cep = cep;
        condominium.condominium_id = cep;
        try {
            const rows = await window.supabaseFetch(`/condominiums?select=cep,condominium_name,total_apartments&cep=eq.${encodeURIComponent(cep)}&limit=1`);
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (row) {
                condominium.cep = row.cep || cep;
                condominium.condominium_id = row.cep || cep;
                condominium.name = row.condominium_name || condominium.name || 'Condomínio';
                const totalApartments = Number(row.total_apartments || condominium.totalApartments || condominium.total_apartments || 0);
                if (totalApartments > 0) {
                    condominium.totalApartments = totalApartments;
                    condominium.total_apartments = totalApartments;
                    condominium.total_apartamentos = totalApartments;
                }
            }
        } catch (_) {}
        return condominium;
    }

    function targetFor(user, hasCondominium) {
        const type = normalizeType(user);
        if (type === 'sindico') return pageUrl(hasCondominium ? 'index.html' : 'condominio_register.html');
        if (type === 'morador') return pageUrl(hasCondominium ? 'index-morador.html' : 'entrar-condominio.html');
        if (type === 'porteiro') return pageUrl(hasCondominium ? 'index-porteiro.html' : 'entrar-condominio-porteiro.html');
        if (type === 'administradora') return pageUrl('index-administradora.html');
        return pageUrl('entrar.html');
    }

    async function resume(options = {}) {
        if (inFlight) return inFlight;
        inFlight = (async () => {
            const hash = String(window.location.hash || '');
            const search = String(window.location.search || '');
            if (/type=recovery/i.test(hash + search)) return { user: null, redirected: false };

            /*
             * Um clique explícito em "Sair" deve sempre levar a um novo login.
             * Mesmo que algum token antigo ainda exista no storage interno do
             * Supabase, não restauramos a conta automaticamente.
             */
            if (hasExplicitLogoutGuard()) {
                return { user: null, redirected: false, explicitLogout: true };
            }

            const client = await waitForSupabase();
            if (!client) return { user: null, redirected: false };

            let session = null;
            try {
                const { data, error } = await client.auth.getSession();
                if (error) return { user: null, redirected: false };
                session = data?.session || null;
            } catch (_) {
                return { user: null, redirected: false };
            }
            if (!session?.user?.email) return { user: null, redirected: false };

            let profile = null;
            try { profile = await fetchProfile(session.user.email); } catch (error) {
                console.warn('[SESSION] Não foi possível recuperar o perfil persistente:', error?.message || error);
            }
            if (!profile) return { user: null, redirected: false };

            const cep = await resolveCep();
            const condominium = await enrichCondominium(profile, cep);
            const user = {
                ...profile,
                id: session.user.id,
                type: normalizeType(profile),
                profilePhoto: profile.profile_photo || profile.profilePhoto || null,
                condominium: Object.keys(condominium).length ? condominium : null
            };
            delete user.password;

            try {
                sessionStorage.setItem('condominiumUser', JSON.stringify(user));
                sessionStorage.setItem('sb-session', JSON.stringify(session));
                if (session.access_token) sessionStorage.setItem('sb-access-token', session.access_token);
            } catch (_) {}
            try { window.persistCondomitUser?.(user); } catch (_) {}
            try {
                localStorage.setItem('condominiumPersistentUser', JSON.stringify({
                    email: user.email,
                    name: user.name || null,
                    type: user.type || null,
                    t: Date.now()
                }));
            } catch (_) {}

            let billing = null;
            if (cep && normalizeType(user) !== 'administradora' && typeof window.getCondomitBillingStatus === 'function') {
                try {
                    billing = await window.getCondomitBillingStatus(true);
                } catch (error) {
                    console.warn('[SESSION][Billing] Não foi possível validar a mensalidade ao restaurar a sessão:', error?.message || error);
                }
            }

            if (billing?.plan_id) {
                user.plan = billing.plan_id;
                try { sessionStorage.setItem('condominiumUser', JSON.stringify(user)); } catch (_) {}
            }

            if (cep && billing && !billing.can_use) {
                const type = normalizeType(user);
                if (type === 'sindico') {
                    if (options.redirect) {
                        const destination = pageUrl('checkout.html');
                        window.location.replace(destination);
                        return { user, redirected: true, destination, billingBlocked: true };
                    }
                    return { user, redirected: false, billingBlocked: true };
                }

                if (type === 'morador' || type === 'porteiro') {
                    try { await client.auth.signOut(); } catch (_) {}
                    try {
                        sessionStorage.removeItem('condominiumUser');
                        sessionStorage.removeItem('sb-session');
                        sessionStorage.removeItem('sb-access-token');
                        localStorage.removeItem('condominiumPersistentUser');
                        localStorage.removeItem('condominiumPersistentSession');
                    } catch (_) {}
                    return { user: null, redirected: false, billingBlocked: true };
                }
            }

            if (options.redirect) {
                const destination = targetFor(user, Boolean(cep));
                const currentName = String(window.location.pathname || '').split('/').pop() || '';
                const targetName = destination.split('/').pop();
                if (currentName !== targetName) {
                    window.location.replace(destination);
                    return { user, redirected: true, destination };
                }
            }
            return { user, redirected: false };
        })();
        try { return await inFlight; } finally { inFlight = null; }
    }

    window.resumeCondomitSession = resume;
})();
