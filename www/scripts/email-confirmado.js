document.addEventListener('DOMContentLoaded', async () => {
    const icon = document.getElementById('emailConfirmIcon');
    const title = document.getElementById('emailConfirmTitle');
    const message = document.getElementById('emailConfirmMessage');
    const actions = document.getElementById('emailConfirmActions');

    const render = (status, heading, body) => {
        icon.className = `email-confirm-icon ${status}`;
        icon.innerHTML = status === 'success'
            ? '<i class="fas fa-check"></i>'
            : status === 'error'
                ? '<i class="fas fa-xmark"></i>'
                : '<i class="fas fa-spinner fa-spin"></i>';
        title.textContent = heading;
        message.textContent = body;
        actions.hidden = status === 'loading';
    };

    try {
        const supabase = await waitForSupabase();
        await consumeConfirmationCallback(supabase);

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError && !String(userError.message || '').toLowerCase().includes('session')) {
            throw userError;
        }

        const user = userData?.user || null;
        const confirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);

        if (!confirmed) {
            // Em alguns fluxos o Supabase limpa os parâmetros logo após confirmar.
            // Aguarda brevemente o evento de autenticação antes de classificar o link.
            const confirmedUser = await waitForConfirmedUser(supabase, 2500);
            if (!confirmedUser) {
                throw new Error('O link de confirmação é inválido, expirou ou já foi utilizado.');
            }
        }

        await forceLoggedOutState(supabase);
        history.replaceState({}, document.title, 'email-confirmado.html');

        render(
            'success',
            'E-mail confirmado!',
            'Seu endereço de e-mail foi confirmado com sucesso. Agora entre com seu e-mail e sua senha para continuar.'
        );

        window.setTimeout(() => {
            window.location.replace('entrar.html?email_confirmado=1');
        }, 1800);
    } catch (error) {
        console.error('[EMAIL CONFIRMATION]', error);
        try {
            if (window.supabase) await forceLoggedOutState(window.supabase);
        } catch (_) {}

        render(
            'error',
            'Não foi possível confirmar o e-mail',
            error?.message || 'O link pode ter expirado. Solicite um novo e-mail de confirmação pela página de entrada.'
        );
    }

    async function waitForSupabase() {
        for (let i = 0; i < 100; i += 1) {
            if (window.supabase?.auth) return window.supabase;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('O serviço de autenticação não foi carregado.');
    }

    async function consumeConfirmationCallback(supabase) {
        const url = new URL(window.location.href);
        const search = url.searchParams;
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
        const type = search.get('type') || hash.get('type') || '';
        const code = search.get('code');
        const tokenHash = search.get('token_hash');

        if (type === 'recovery') {
            window.location.replace(`redefinir-senha.html${url.search}${url.hash}`);
            throw new Error('Redirecionando para redefinição de senha.');
        }

        if (tokenHash) {
            const otpType = ['signup', 'email', 'email_change', 'invite'].includes(type) ? type : 'email';
            const { error } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type: otpType
            });
            if (error) throw error;
            return;
        }

        if (code && typeof supabase.auth.exchangeCodeForSession === 'function') {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error && !String(error.message || '').toLowerCase().includes('code verifier')) {
                throw error;
            }
        }

        // Para links implícitos (#access_token=...), detectSessionInUrl do
        // supabase-auth.js consome automaticamente os tokens.
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    async function waitForConfirmedUser(supabase, timeoutMs) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const { data } = await supabase.auth.getUser().catch(() => ({ data: null }));
            if (data?.user?.email_confirmed_at || data?.user?.confirmed_at) return data.user;
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return null;
    }

    async function forceLoggedOutState(supabase) {
        try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
        try {
            sessionStorage.removeItem('condominiumUser');
            sessionStorage.removeItem('sb-session');
            sessionStorage.removeItem('sb-access-token');
            sessionStorage.removeItem('condomitPendingTwoFactorLogin');
            sessionStorage.removeItem('selectedPlan');
            sessionStorage.removeItem('selectedPlanId');
        } catch (_) {}
        try {
            localStorage.removeItem('condominiumPersistentUser');
            localStorage.removeItem('condomitPersistentUserV2');
            localStorage.setItem('authExplicitLogoutAt', String(Date.now()));
        } catch (_) {}
        try { window.clearPersistedCondomitUser?.(); } catch (_) {}
    }
});
