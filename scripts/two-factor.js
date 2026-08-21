(function () {
    'use strict';

<<<<<<< HEAD
    const ENDPOINT = '/.netlify/functions/two-factor';
=======
    const ENDPOINT = window.condomitApiUrl?.('/.netlify/functions/two-factor') || '/.netlify/functions/two-factor';
>>>>>>> 48db672 (Android)

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

    async function getAccessToken() {
        if (typeof window.resolveSupabaseAccessToken === 'function') {
            return window.resolveSupabaseAccessToken();
        }
        const { data } = await window.supabase?.auth?.getSession?.() || {};
        return data?.session?.access_token || '';
    }

    async function status() {
        const token = await getAccessToken();
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
        return request({ action: 'status' }, token);
    }

    async function requestChange(enabled) {
        const token = await getAccessToken();
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
        return request({ action: 'request-change', enabled: enabled === true }, token);
    }

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
