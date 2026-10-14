document.addEventListener('DOMContentLoaded', async function() {
    const authText = (pt, en) => window.getCondomitAuthLanguage?.() === 'en' ? en : pt;
    const deletionRedirect = new URLSearchParams(window.location.search).get('deleted') === '1';

    if (deletionRedirect) {
         
         
        try { localStorage.setItem('authExplicitLogoutAt', String(Date.now())); } catch (_) {}
        try { window.clearPersistedCondomitUser?.(); } catch (_) {}
        try {
            sessionStorage.removeItem('condominiumUser');
            sessionStorage.removeItem('sb-session');
            sessionStorage.removeItem('sb-access-token');
        } catch (_) {}
        try {
            const removeKeys = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (key.startsWith('sb-') || key.startsWith('condomit') || key.startsWith('condominium') || /^sb-.*-auth-token$/i.test(key)) {
                    removeKeys.push(key);
                }
            }
            removeKeys.forEach((key) => localStorage.removeItem(key));
            localStorage.setItem('authExplicitLogoutAt', String(Date.now()));
            localStorage.setItem('accountDeletedAt', String(Date.now()));
        } catch (_) {}
        try {
            if (window.supabase?.auth?.signOut) await window.supabase.auth.signOut({ scope: 'local' });
        } catch (_) {}
    }

     
    try {
        sessionStorage.removeItem('condominiumUser');
        sessionStorage.removeItem('sb-session');
        sessionStorage.removeItem('sb-access-token');
    } catch (_) {}

    let resendCooldownUntil = 0;
    let resendInProgress = false;

    async function tryReactivateDeletedUser({ email, password, emailRedirectTo }) {
        try {
            const response = await fetch('/api/auth/reactivate-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, emailRedirectTo })
            });
            const payload = await response.json().catch(() => ({}));
            return { status: response.status, data: payload || {} };
        } catch (err) {
            console.warn('[Reactivate] Falha na chamada à API:', err?.message || err);
            return { status: 0, data: {}, error: err };
        }
    }

    async function checkDeletedUserOfferReactivate(email) {
        try {
            const response = await fetch('/api/auth/reactivate-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, probe_only: true })
            });
            const payload = await response.json().catch(() => ({}));
            return payload;
        } catch (_) {
            return {};
        }
    }

    async function fetchCondominiumBillingStatus(force = false) {
        try {
            if (typeof window.getCondomitBillingStatus === 'function') {
                return await window.getCondomitBillingStatus(force);
            }
            if (typeof window.supabaseFetch === 'function') {
                return await window.supabaseFetch('/rpc/condomit_get_billing_status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
            }
        } catch (error) {
            console.error('[LOGIN][Billing] Não foi possível consultar a mensalidade:', error);
        }
        return null;
    }

    async function denyAccessForUnpaidMember() {
        try {
            if (window.supabase?.auth?.signOut) {
                await window.supabase.auth.signOut();
            }
        } catch (_) {}

        try {
            sessionStorage.removeItem('condominiumUser');
            sessionStorage.removeItem('sb-session');
            sessionStorage.removeItem('sb-access-token');
            localStorage.removeItem('condominiumPersistentUser');
            localStorage.removeItem('condominiumPersistentSession');
        } catch (_) {}

        showModal({
            title: authText('Acesso suspenso', 'Access suspended'),
            message: authText('A mensalidade do condomínio está pendente. Enquanto o síndico não regularizar o pagamento, moradores e porteiros não poderão acessar suas contas.', 'The condominium subscription is overdue. Residents and porters cannot access their accounts until the manager regularizes payment.'),
            type: 'warning',
            confirmText: authText('Entendi', 'Got it')
        });
    }

    function getNormalizedUserType(user) {
        const raw = String(user.user_type || user.type || '').trim().toLowerCase();
        if (raw === 'síndico') return 'sindico';
        if (raw.startsWith('administra') || raw === 'admin') return 'administradora';
        return raw;
    }

    async function resolveCompletedCondominium(user) {
        let cep = '';
        try {
            if (typeof window.supabaseFetch === 'function') {
                const result = await window.supabaseFetch('/rpc/condomit_current_user_cep', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
                if (typeof result === 'string') cep = result;
            }
        } catch (error) {
            console.warn('[LOGIN] Não foi possível consultar o vínculo do condomínio:', error?.message || error);
        }

        if (!cep) return null;

        let currentCondo = user?.condominium && typeof user.condominium === 'object'
            ? { ...user.condominium }
            : {};

        try {
            const rows = await window.supabaseFetch(
                `/condominiums?select=cep,condominium_name,total_apartments&cep=eq.${encodeURIComponent(cep)}&limit=1`
            );
            const condo = Array.isArray(rows) ? rows[0] : rows;
            if (condo) {
                currentCondo = {
                    ...currentCondo,
                    cep: condo.cep || cep,
                    condominium_id: condo.cep || cep,
                    name: condo.condominium_name || currentCondo.name || 'Condomínio',
                    totalApartments: Number(condo.total_apartments || currentCondo.totalApartments || 0),
                    total_apartments: Number(condo.total_apartments || currentCondo.total_apartments || 0),
                    total_apartamentos: Number(condo.total_apartments || currentCondo.total_apartamentos || 0)
                };
            }
        } catch (_) {
            currentCondo = {
                ...currentCondo,
                cep,
                condominium_id: cep
            };
        }

        return currentCondo;
    }

    async function redirectByUserType(user) {
        const type = getNormalizedUserType(user);
        user.type = type;
        sessionStorage.setItem('condominiumUser', JSON.stringify(user));
        try { window.persistCondomitUser?.(user); } catch (_) {}
        try {
            const persistent = { email: user.email, name: user.name || null, type: user.type || null, t: Date.now() };
            (localStorage.getItem('condomitRememberMe') === '1' ? localStorage : sessionStorage).setItem('condominiumPersistentUser', JSON.stringify(persistent));
        } catch(_) {}
        if (typeof syncAllAvatars === 'function') syncAllAvatars(user);

        if (type === 'administradora') {
            window.location.href = 'index-administradora.html';
            return;
        }

        if (type === 'sindico') {
            if (!user.condominium) {
                window.location.href = 'condominio_register.html';
                return;
            }

            const billing = await fetchCondominiumBillingStatus(true);

            if (billing?.plan_id && user.plan !== billing.plan_id) {
                user.plan = billing.plan_id;
                sessionStorage.setItem('condominiumUser', JSON.stringify(user));
            }

            if (billing?.can_use) {
                window.location.href = 'index.html';
                return;
            }

             
             
            window.location.href = 'checkout.html';
            return;
        } else if (type === 'morador') {
            if (user.condominium) {
                const billing = await fetchCondominiumBillingStatus(true);
                if (!billing?.can_use) {
                    await denyAccessForUnpaidMember();
                    return;
                }
                if (billing?.plan_id) {
                    user.plan = billing.plan_id;
                    sessionStorage.setItem('condominiumUser', JSON.stringify(user));
                }
                window.location.href = 'index-morador.html';
            } else {
                window.location.href = 'entrar-condominio.html';
            }
        } else if (type === 'porteiro') {
             
             
            const linkedCondominium = await resolveCompletedCondominium(user);
            if (linkedCondominium) {
                user.condominium = linkedCondominium;
                sessionStorage.setItem('condominiumUser', JSON.stringify(user));
                try { window.persistCondomitUser?.(user); } catch (_) {}

                const billing = await fetchCondominiumBillingStatus(true);
                if (!billing?.can_use) {
                    await denyAccessForUnpaidMember();
                    return;
                }
                if (billing?.plan_id) {
                    user.plan = billing.plan_id;
                    sessionStorage.setItem('condominiumUser', JSON.stringify(user));
                }
                window.location.href = 'index-porteiro.html';
            } else {
                window.location.href = 'entrar-condominio-porteiro.html';
            }
        } else {
            window.location.href = 'assembleia.html';
        }
    }

    let user = null;
    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (loggedInUser) {
        user = JSON.parse(loggedInUser);
    }
    if (user) {
        if (user && user.email && !user.profilePhoto && typeof refreshCurrentUserFromDb === 'function') {
            try {
                const refreshed = await refreshCurrentUserFromDb();
                if (refreshed) {
                    Object.assign(user, refreshed);
                    sessionStorage.setItem('condominiumUser', JSON.stringify(user));
                    if (typeof syncAllAvatars === 'function') syncAllAvatars(user);
                }
            } catch (_) {}
        }
        try { window.persistCondomitUser?.(user); } catch (_) {}
        try {
            const persistent = { email: user.email, name: user.name || null, type: user.type || null, t: Date.now() };
            (localStorage.getItem('condomitRememberMe') === '1' ? localStorage : sessionStorage).setItem('condominiumPersistentUser', JSON.stringify(persistent));
        } catch(_) {}
        redirectByUserType(user);
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const submitBtn = loginForm?.querySelector('button[type="submit"]');
    const emailInput = document.getElementById('email');
    const ADMIN_PROFILE_SWITCH_EMAIL = 'contato.condomit@gmail.com';
    const rememberMeInput = document.getElementById('rememberMe');
    try { if (rememberMeInput) rememberMeInput.checked = localStorage.getItem('condomitRememberMe') === '1'; } catch (_) {}

    async function ensureFixedAdminAccount(email) {
        if (String(email || '').trim().toLowerCase() !== ADMIN_PROFILE_SWITCH_EMAIL) {
            return { attempted: false, ok: true };
        }

        try {
            const response = await fetch('/api/demo/account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                console.error('[ADMIN ACCOUNT] Provisionamento falhou:', {
                    status: response.status,
                    error: payload?.error || null,
                    details: payload?.details || null
                });
                 
                 
                 
                const detailParts = [
                    payload?.error,
                    payload?.details,
                    payload?.code ? `Código: ${payload.code}` : null,
                    payload?.hint
                ].filter(Boolean);
                return {
                    attempted: true,
                    ok: false,
                    status: response.status,
                    error: detailParts.join(' — ') || 'Não foi possível preparar a conta administrativa.',
                    details: payload?.details || null,
                    code: payload?.code || null
                };
            }

            return { attempted: true, ok: true, data: payload };
        } catch (error) {
            console.error('[ADMIN ACCOUNT] Endpoint de provisionamento indisponível:', error);
            return {
                attempted: true,
                ok: false,
                status: 0,
                error: error?.message || 'Endpoint administrativo indisponível.'
            };
        }
    }

    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    function setLoginSubmitting(isSubmitting) {
        if (!submitBtn) return;
        submitBtn.disabled = isSubmitting;
        if (isSubmitting) {
            submitBtn.dataset.originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (window.getCondomitAuthLanguage?.() === 'en' ? 'Signing in...' : 'Entrando...');
        } else {
            submitBtn.innerHTML = window.getCondomitAuthLanguage?.() === 'en' ? 'Sign in' : 'Entrar';
        }
    }

    async function handleResendConfirmation(email) {
        if (!email) {
            showToast(authText('Informe o e-mail para reenviar a confirmação.', 'Enter your email to resend the confirmation.'), 'warning');
            return;
        }

        const normalized = email.trim().toLowerCase();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(normalized)) {
            showToast(authText('Digite um e-mail válido para reenviar.', 'Enter a valid email address to resend.'), 'warning');
            return;
        }

        const now = Date.now();
        if (now < resendCooldownUntil) {
            const leftSecs = Math.ceil((resendCooldownUntil - now) / 1000);
            showToast(
                authText(`Aguarde ${leftSecs}s antes de solicitar outro reenvio.`, `Wait ${leftSecs}s before requesting another resend.`),
                'warning'
            );
            return;
        }

        if (resendInProgress) return;
        resendInProgress = true;

        try {
            if (!window.supabase?.auth) {
                throw new Error(authText('Sistema de autenticação não carregado.', 'Authentication service is not available.'));
            }

            const emailRedirectTo = `${window.location.origin}/pages/email-confirmado.html`;

            const { error } = await window.supabase.auth.resend({
                type: 'signup',
                email: normalized,
                options: { emailRedirectTo }
            });

            if (error) {
                const errMsg = String(error.message || '').toLowerCase();
                if (
                    errMsg.includes('too many') ||
                    errMsg.includes('rate limit') ||
                    errMsg.includes('email rate limit')
                ) {
                    throw new Error(authText('Muitas solicitações recentes. Aguarde alguns minutos e tente novamente.', 'Too many requests. Wait a few minutes and try again.'));
                }
                throw error;
            }

            resendCooldownUntil = Date.now() + 60 * 1000;

            showModal({
                title: authText('E-mail reenviado!', 'Email resent!'),
                message: authText(
                    'Enviamos um novo link de confirmação para:\n' + normalized + '\n\nVerifique sua caixa de entrada e também a pasta de spam ou lixo eletrônico.',
                    'We sent a new confirmation link to:\n' + normalized + '\n\nCheck your inbox and spam folder.'),
                type: 'success',
                confirmText: authText('Entendido', 'Got it')
            });
        } catch (err) {
            console.error('Erro ao reenviar confirmação:', err);
            const message = String(err?.message || err || '');
            const friendly =
                message && message.length > 5 && message !== 'Error'
                    ? message
                    : authText('Não foi possível reenviar o e-mail. Tente novamente em alguns instantes.', 'Could not resend the email. Please try again shortly.');
            showToast(friendly, 'error');
        } finally {
            resendInProgress = false;
        }
    }

    function showEmailNotConfirmedModal(email) {
        const normalizedEmail = (email || emailInput?.value || '').trim().toLowerCase();

        showModal({
            title: authText('E-mail ainda não confirmado', 'Email not confirmed yet'),
            message: authText(
                'Seu endereço de e-mail ainda não foi confirmado.\n\nAbra a mensagem enviada pela Condomit para o e-mail informado e clique no botão de confirmação.\n\nDica: verifique também as pastas de spam e lixo eletrônico.',
                'Your email address has not been confirmed yet.\n\nOpen the email sent by Condomit and click the confirmation button.\n\nTip: also check your spam folder.'),
            type: 'warning',
            confirmText: authText('Reenviar e-mail', 'Resend email'),
            cancelText: authText('Fechar', 'Close'),
            onConfirm: () => {
                handleResendConfirmation(normalizedEmail);
            }
        });
    }

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showToast(authText('Preencha e-mail e senha.', 'Enter your email and password.'), 'warning');
            return;
        }

        try {
            if (!window.supabase?.auth) {
                throw new Error(authText('Supabase Auth ainda não foi carregado. Atualize a página.', 'Supabase Auth is not ready yet. Refresh the page.'));
            }

            setLoginSubmitting(true);
            const adminProvision = await ensureFixedAdminAccount(email);

            let authData = null;
            let authError = null;

            try {
                if (!window.condomitTwoFactor?.passwordLogin) {
                    throw new Error(authText('Módulo de verificação em duas etapas não carregado.', 'Two-factor authentication module is not available.'));
                }

                const loginResult =
                    await window.condomitTwoFactor.passwordLogin(
                        email,
                        password
                    );

                 
                 
                window.condomitSetRememberMe?.(rememberMeInput?.checked === true);

                if (loginResult?.requiresTwoFactor) {
                    sessionStorage.setItem(
                        'condomitPendingTwoFactorLogin',
                        JSON.stringify({
                            challengeId: loginResult.challengeId,
                            email: loginResult.email || email,
                            maskedEmail: loginResult.maskedEmail || email
                        })
                    );

                    window.location.href =
                        'verificar-2fa-email.html';

                    return;
                }

                if (
                    !loginResult?.session?.access_token ||
                    !loginResult?.session?.refresh_token
                ) {
                    throw new Error(
                        authText('O servidor não retornou uma sessão válida.', 'The server did not return a valid session.')
                    );
                }

                const {
                    data,
                    error
                } =
                    await window.supabase.auth.setSession({
                        access_token:
                            loginResult.session.access_token,

                        refresh_token:
                            loginResult.session.refresh_token
                    });

                authData = data;
                authError = error;

            } catch (error) {
                authError = error;
            }

            if (authError) {
    console.error(
        '[LOGIN] Erro retornado pelo Supabase Auth:',
        {
            message: authError.message,
            code: authError.code,
            status: authError.status,
            name: authError.name
        }
    );

    const errCode =
        String(
            authError.code || ''
        )
            .trim()
            .toLowerCase();

    const errMsg =
        String(
            authError.message || ''
        )
            .trim()
            .toLowerCase();

     
    if (
        errCode === 'email_not_confirmed' ||
        errMsg.includes(
            'email not confirmed'
        ) ||
        errMsg.includes(
            'email_not_confirmed'
        )
    ) {
        setLoginSubmitting(false);

        showEmailNotConfirmedModal(
            email
        );

        return;
    }

     
    if (
        errCode.includes(
            'rate'
        ) ||
        errMsg.includes(
            'too many'
        ) ||
        errMsg.includes(
            'rate limit'
        ) ||
        Number(
            authError.status
        ) === 429
    ) {
        showToast(
            authText('Muitas tentativas de login recentes. Aguarde alguns minutos e tente novamente.', 'Too many recent login attempts. Wait a few minutes and try again.'),
            'error'
        );

        return;
    }

     
    const invalidCredentials =
        errCode ===
            'invalid_credentials' ||
        errMsg.includes(
            'invalid login credentials'
        ) ||
        errMsg.includes(
            'invalid credentials'
        );

    if (invalidCredentials) {
        if (
            email === ADMIN_PROFILE_SWITCH_EMAIL &&
            adminProvision?.attempted &&
            adminProvision?.ok === false
        ) {
            console.error('[ADMIN ACCOUNT] Login recusado após falha de provisionamento:', adminProvision);
            const provisionMessage = String(
                adminProvision?.error || 'Não foi possível preparar a conta administrativa.'
            ).trim();
            showToast(
                authText(`Conta ADM não preparada: ${provisionMessage}`, `Admin account is not ready: ${provisionMessage}`),
                'error'
            );
            return;
        }

        const probeResult =
            await checkDeletedUserOfferReactivate(
                email
            );

        if (probeResult?.exists && probeResult?.deleted) {
            setLoginSubmitting(false);
            showModal({
                title: authText('Conta excluída', 'Account deleted'),
                message: authText('Esta conta foi excluída e não pode ser acessada novamente. Para voltar a usar a Condomit, faça um novo cadastro.', 'This account has been deleted and cannot be accessed again. Create a new account to use Condomit.'),
                type: 'warning',
                confirmText: authText('Entendi', 'Got it')
            });
            return;
        }

        showToast(
            authText('E-mail ou senha incorretos.', 'Incorrect email or password.'),
            'error'
        );

        return;
    }

     
    if (
        errMsg.includes(
            'network'
        ) ||
        errMsg.includes(
            'fetch'
        )
    ) {
        showToast(
            authText('Falha de conexão. Verifique sua internet e tente novamente.', 'Connection failed. Check your internet connection and try again.'),
            'error'
        );

        return;
    }

     
    console.error(
        '[LOGIN] Falha de autenticação não reconhecida:',
        authError
    );

    showToast(
        `${authText('Falha na autenticação', 'Authentication failed')}: ${authError.message || authError.code || authText('erro desconhecido', 'unknown error')}`,
        'error'
    );

    return;
}

            if (!authData?.session || !authData?.user) {
                throw new Error(authText('O Supabase não retornou uma sessão válida.', 'Supabase did not return a valid session.'));
            }

            if (!authData.user.email_confirmed_at) {
                setLoginSubmitting(false);
                try { await window.supabase.auth.signOut(); } catch(_) {}
                sessionStorage.removeItem('sb-session');
                sessionStorage.removeItem('sb-access-token');
                showEmailNotConfirmedModal(email);
                return;
            }

            sessionStorage.setItem(
                'sb-session',
                JSON.stringify(authData.session)
            );

            sessionStorage.setItem(
                'sb-access-token',
                authData.session.access_token
            );

            const rawUser = await fetchUserByEmail(authData.user.email);

            if (!rawUser) {
                await window.supabase.auth.signOut();
                sessionStorage.removeItem('sb-session');
                sessionStorage.removeItem('sb-access-token');

                showModal({
                    title: authText('Perfil não encontrado', 'Profile not found'),
                    message: authText('A autenticação foi realizada, mas o perfil do usuário não foi localizado no sistema.\n\nEntre em contato com o suporte se o problema persistir.', 'Authentication succeeded, but your user profile could not be found.\n\nContact support if the issue continues.'),
                    type: 'error'
                });
                return;
            }

            const loadedUser = {
                ...rawUser,
                id: authData.user.id,
                type: getNormalizedUserType(rawUser),
                profilePhoto: rawUser.profile_photo || rawUser.profilePhoto || null
            };

             
            try { localStorage.removeItem('authExplicitLogoutAt'); } catch (_) {}

            sessionStorage.setItem(
                'condominiumUser',
                JSON.stringify(loadedUser)
            );

            try { window.persistCondomitUser?.(loadedUser); } catch (_) {}

            try {
                (localStorage.getItem('condomitRememberMe') === '1' ? localStorage : sessionStorage).setItem(
                    'condominiumPersistentUser',
                    JSON.stringify({
                        email: loadedUser.email,
                        name: loadedUser.name || null,
                        type: loadedUser.type || null,
                        t: Date.now()
                    })
                );
            } catch (_) {}

            if (typeof syncAllAvatars === 'function') {
                syncAllAvatars(loadedUser);
            }

            await redirectByUserType(loadedUser);
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            showToast(authText('Erro ao fazer login. Tente novamente.', 'Sign-in failed. Please try again.'), 'error');
        } finally {
            if (document.body.contains(loginForm)) {
                setLoginSubmitting(false);
            }
        }
    });
});
