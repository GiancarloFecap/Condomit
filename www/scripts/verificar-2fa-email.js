import './supabase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const raw = sessionStorage.getItem('condomitPendingTwoFactorLogin');
    let pending = null;

    try {
        pending = raw ? JSON.parse(raw) : null;
    } catch (_) {
        pending = null;
    }

    if (!pending?.challengeId) {
        window.location.replace('entrar.html');
        return;
    }

    const description = document.getElementById('twoFactorDescription');
    const feedback = document.getElementById('twoFactorFeedback');
    const form = document.getElementById('twoFactorCodeForm');
    const input = document.getElementById('twoFactorCode');
    const submit = document.getElementById('twoFactorSubmit');

    function normalizeUserType(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase();

        return normalized === 'síndico'
            ? 'sindico'
            : normalized;
    }

    function destinationForUserType(value) {
        switch (normalizeUserType(value)) {
            case 'sindico':
                return 'index.html';
            case 'morador':
                return 'index-morador.html';
            case 'porteiro':
                return 'index-porteiro.html';
            default:
                return 'entrar.html';
        }
    }

    async function waitForSupabaseClient() {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            if (window.supabase?.auth?.verifyOtp) {
                return window.supabase;
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        throw new Error('Não foi possível iniciar a autenticação do Supabase.');
    }

    if (description) {
        description.textContent =
            `Enviamos um código de 6 dígitos para ${pending.maskedEmail || pending.email || 'seu e-mail'}.`;
    }

    document.getElementById('backToLogin')?.addEventListener('click', async () => {
        sessionStorage.removeItem('condomitPendingTwoFactorLogin');

        try {
            if (window.supabase?.auth) {
                await window.supabase.auth.signOut({ scope: 'local' });
            }
        } catch (_) {}

        window.location.replace('entrar.html');
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const code = String(input?.value || '')
            .replace(/\D/g, '')
            .slice(0, 6);

        if (code.length !== 6) {
            if (feedback) {
                feedback.textContent = 'Digite os 6 dígitos enviados por e-mail.';
                feedback.dataset.state = 'error';
            }
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        }

        if (feedback) {
            feedback.textContent = '';
            feedback.dataset.state = '';
        }

        try {
            /*
             * 1. Nosso backend valida o código de 6 dígitos da Condomit.
             * 2. Ele devolve somente um token_hash Supabase de uso único.
             * 3. Este navegador troca o token_hash por uma sessão Supabase
             *    diretamente, sem abrir action_link ou passar por localhost.
             */
            const result = await window.condomitTwoFactor.verifyLogin(
                pending.challengeId,
                code
            );

            if (!result?.verified || !result?.session?.access_token || !result?.session?.refresh_token) {
                throw new Error('Não foi possível concluir o login.');
            }

            const supabase = await waitForSupabaseClient();

            const { data: authData, error: authError } =
                await supabase.auth.setSession({
                    access_token: result.session.access_token,
                    refresh_token: result.session.refresh_token
                });

            if (authError) {
                throw authError;
            }

            if (!authData?.session?.user?.email) {
                throw new Error('O Supabase não confirmou a nova sessão.');
            }

            const userType = normalizeUserType(
                result.userType ||
                authData.user?.user_metadata?.user_type ||
                authData.user?.user_metadata?.type
            );

            try {
                sessionStorage.setItem('sb-session', JSON.stringify(authData.session));
                sessionStorage.setItem('sb-access-token', authData.session.access_token);
                const email = String(authData.session.user.email || pending.email || '').trim().toLowerCase();
                if (email && typeof window.supabaseFetch === 'function') {
                    const rows = await window.supabaseFetch(`/users?select=email,name,user_type,phone,condominium,profile_photo&email=eq.${encodeURIComponent(email)}&limit=1`);
                    const profile = Array.isArray(rows) ? rows[0] : rows;
                    if (profile) {
                        const normalized = normalizeUserType(profile.user_type || result.userType);
                        const loaded = { ...profile, type: normalized, user_type: normalized };
                        sessionStorage.setItem('condominiumUser', JSON.stringify(loaded));
                        try { localStorage.setItem('condominiumPersistentUser', JSON.stringify(loaded)); } catch (_) {}
                    }
                }
            } catch (profileError) {
                console.warn('[2FA] Sessão criada; o perfil será completado no dashboard:', profileError?.message || profileError);
            }

            sessionStorage.removeItem('condomitPendingTwoFactorLogin');
            sessionStorage.removeItem('condomitVerifiedTwoFactorUserType');
            try { localStorage.removeItem('authExplicitLogoutAt'); } catch (_) {}

            /*
             * Se o projeto possuir o restaurador de sessão carregado, usa-o
             * sem permitir que ele faça outro redirecionamento. Caso contrário,
             * o dashboard carregará os dados normalmente pela sessão persistida.
             */
            try {
                if (typeof window.resumeCondomitSession === 'function') {
                    await window.resumeCondomitSession({ redirect: false });
                }
            } catch (error) {
                console.warn(
                    '[2FA] Sessão criada; dados locais serão restaurados no dashboard:',
                    error?.message || error
                );
            }

            let destinationType = userType;
            try {
                const loaded = JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
                destinationType = normalizeUserType(loaded?.type || loaded?.user_type || userType);
            } catch (_) {}
            const destination = destinationForUserType(destinationType);

            if (feedback) {
                feedback.textContent = 'Código confirmado. Entrando...';
                feedback.dataset.state = 'success';
            }

            window.location.replace(destination);
        } catch (error) {
            console.error('[2FA] Falha ao concluir login:', error);

            if (feedback) {
                feedback.textContent =
                    error?.message || 'Código inválido ou expirado.';
                feedback.dataset.state = 'error';
            }

            if (submit) {
                submit.disabled = false;
                submit.innerHTML = '<i class="fas fa-check"></i> Verificar e entrar';
            }

            input?.focus();
        }
    });

    input?.focus();
});
