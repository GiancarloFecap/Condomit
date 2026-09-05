(function () {
    'use strict';

    const ENDPOINT = '/.netlify/functions/two-factor';

    async function request(payload, accessToken = '') {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
            },
            body: JSON.stringify(payload || {})
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data?.error || `Erro ${response.status}`);
            error.code = data?.code || '';
            error.status = data?.status || response.status;
            throw error;
        }
        return data;
    }

    async function getAccessToken(forceRefresh = false) {
        const auth = window.supabase?.auth;
        if (auth) {
            try {
                if (forceRefresh && typeof auth.refreshSession === 'function') {
                    const { data } = await auth.refreshSession();
                    if (data?.session?.access_token) return data.session.access_token;
                }
                const { data } = await auth.getSession?.() || {};
                if (data?.session?.access_token) return data.session.access_token;
            } catch (_) {}
        }
        if (typeof window.resolveSupabaseAccessToken === 'function') {
            return (await window.resolveSupabaseAccessToken()) || '';
        }
        return '';
    }

    async function authenticatedRequest(payload) {
        let token = await getAccessToken(false);
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
        try { return await request(payload, token); }
        catch (error) {
            if (error?.status !== 401) throw error;
            token = await getAccessToken(true);
            if (!token) throw error;
            return request(payload, token);
        }
    }

    async function status() { return authenticatedRequest({ action: 'status' }); }
    async function requestChange(enabled) { return authenticatedRequest({ action: 'request-change', enabled: enabled === true }); }

    async function passwordLogin(email, password) {
        return request({
            action: 'password-login',
            email: String(email || '').trim().toLowerCase(),
            password: String(password || '')
        });
    }

    async function verifyLogin(challengeId, code) {
        return request({
            action: 'verify-login',
            challengeId,
            code: String(code || '').replace(/\D/g, '')
        });
    }

    async function confirmChange(token) {
        return request({ action: 'confirm-change', token });
    }

    window.condomitTwoFactor = {
        status,
        requestChange,
        passwordLogin,
        verifyLogin,
        confirmChange
    };
})();
