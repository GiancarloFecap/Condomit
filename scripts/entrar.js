document.addEventListener('DOMContentLoaded', async function() {
    const deletionRedirect = new URLSearchParams(window.location.search).get('deleted') === '1';

    if (deletionRedirect) {
        // A API já removeu a conta. Esta limpeza adicional existe para impedir
        // que um token/cache antigo faça a tela de login restaurar a sessão.
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

    if (!deletionRedirect && !sessionStorage.getItem('condominiumUser') && typeof window.resumeCondomitSession === 'function') {
        try {
            const resumed = await window.resumeCondomitSession({ redirect: true });
            if (resumed?.redirected) return;
        } catch (error) {
            console.warn('[LOGIN] Falha ao restaurar sessão persistente:', error?.message || error);
        }
    }

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
            title: 'Acesso suspenso',
            message:
                'A mensalidade do condomínio está pendente. Enquanto o síndico não regularizar o pagamento, ' +
                'moradores e porteiros não poderão acessar suas contas.',
            type: 'warning',
            confirmText: 'Entendi'
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
                `/condominiums?select=cep,condominium_name&cep=eq.${encodeURIComponent(cep)}&limit=1`
            );
            const condo = Array.isArray(rows) ? rows[0] : rows;
            if (condo) {
                currentCondo = {
                    ...currentCondo,
                    cep: condo.cep || cep,
                    condominium_id: condo.cep || cep,
                    name: condo.condominium_name || currentCondo.name || 'Condomínio'
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
            localStorage.setItem('condominiumPersistentUser', JSON.stringify(persistent));
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

            // Sem pagamento ativo (primeiro pagamento ou renovação mensal vencida),
            // o síndico segue apenas para o checkout para regularizar o condomínio.
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
            // O porteiro só vai para a página de concluir cadastro quando realmente
            // não existe vínculo em user_condominiums. Não usamos flags temporárias.
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
            localStorage.setItem('condominiumPersistentUser', JSON.stringify(persistent));
        } catch(_) {}
        redirectByUserType(user);
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const submitBtn = loginForm?.querySelector('button[type="submit"]');
    const emailInput = document.getElementById('email');

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
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        } else {
            submitBtn.innerHTML = submitBtn.dataset.originalText || 'Entrar';
        }
    }

    async function handleResendConfirmation(email) {
        if (!email) {
            showToast('Informe o e-mail para reenviar a confirmação.', 'warning');
            return;
        }

        const normalized = email.trim().toLowerCase();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(normalized)) {
            showToast('Digite um e-mail válido para reenviar.', 'warning');
            return;
        }

        const now = Date.now();
        if (now < resendCooldownUntil) {
            const leftSecs = Math.ceil((resendCooldownUntil - now) / 1000);
            showToast(
                `Aguarde ${leftSecs}s antes de solicitar outro reenvio.`,
                'warning'
            );
            return;
        }

        if (resendInProgress) return;
        resendInProgress = true;

        try {
            if (!window.supabase?.auth) {
                throw new Error('Sistema de autenticação não carregado.');
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
                    throw new Error('Muitas solicitações recentes. Aguarde alguns minutos e tente novamente.');
                }
                throw error;
            }

            resendCooldownUntil = Date.now() + 60 * 1000;

            showModal({
                title: 'E-mail reenviado!',
                message:
                    'Enviamos um novo link de confirmação para:\n' + normalized + '\n\n' +
                    'Verifique sua caixa de entrada e também a pasta de spam ou lixo eletrônico.',
                type: 'success',
                confirmText: 'Entendido'
            });
        } catch (err) {
            console.error('Erro ao reenviar confirmação:', err);
            const message = String(err?.message || err || '');
            const friendly =
                message && message.length > 5 && message !== 'Error'
                    ? message
                    : 'Não foi possível reenviar o e-mail. Tente novamente em alguns instantes.';
            showToast(friendly, 'error');
        } finally {
            resendInProgress = false;
        }
    }

    function showEmailNotConfirmedModal(email) {
        const normalizedEmail = (email || emailInput?.value || '').trim().toLowerCase();

        showModal({
            title: 'E-mail ainda não confirmado',
            message:
                'Seu endereço de e-mail ainda não foi confirmado.\n\n' +
                'Abra a mensagem enviada pela Condomit para o e-mail informado e clique no botão de confirmação.\n\n' +
                'Dica: verifique também as pastas de spam e lixo eletrônico.',
            type: 'warning',
            confirmText: 'Reenviar e-mail',
            cancelText: 'Fechar',
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
            showToast('Preencha e-mail e senha.', 'warning');
            return;
        }

        try {
            if (!window.supabase?.auth) {
                throw new Error('Supabase Auth ainda não foi carregado. Atualize a página.');
            }

            setLoginSubmitting(true);

            let authData = null;
            let authError = null;

            try {
                if (!window.condomitTwoFactor?.passwordLogin) {
                    throw new Error('Módulo de verificação em duas etapas não carregado.');
                }

                const loginResult =
                    await window.condomitTwoFactor.passwordLogin(
                        email,
                        password
                    );

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
                        'O servidor não retornou uma sessão válida.'
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

    /*
     * E-mail ainda não confirmado
     */
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

    /*
     * Limite de tentativas
     */
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
            'Muitas tentativas de login recentes. Aguarde alguns minutos e tente novamente.',
            'error'
        );

        return;
    }

    /*
     * Credenciais realmente inválidas.
     *
     * IMPORTANTE:
     * não considerar qualquer 4xx
     * como senha incorreta.
     */
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
        const probeResult =
            await checkDeletedUserOfferReactivate(
                email
            );

        if (probeResult?.exists && probeResult?.deleted) {
            setLoginSubmitting(false);
            showModal({
                title: 'Conta excluída',
                message: 'Esta conta foi excluída e não pode ser acessada novamente. Para voltar a usar a Condomit, faça um novo cadastro.',
                type: 'warning',
                confirmText: 'Entendi'
            });
            return;
        }

        showToast(
            'E-mail ou senha incorretos.',
            'error'
        );

        return;
    }

    /*
     * Problema de internet
     */
    if (
        errMsg.includes(
            'network'
        ) ||
        errMsg.includes(
            'fetch'
        )
    ) {
        showToast(
            'Falha de conexão. Verifique sua internet e tente novamente.',
            'error'
        );

        return;
    }

    /*
     * Qualquer outro erro:
     * NÃO dizer que a senha está errada.
     */
    console.error(
        '[LOGIN] Falha de autenticação não reconhecida:',
        authError
    );

    showToast(
        `Falha na autenticação: ${
            authError.message ||
            authError.code ||
            'erro desconhecido'
        }`,
        'error'
    );

    return;
}

            if (!authData?.session || !authData?.user) {
                throw new Error('O Supabase não retornou uma sessão válida.');
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
                    title: 'Perfil não encontrado',
                    message:
                        'A autenticação foi realizada, mas o perfil do usuário não foi localizado no sistema.\n\n' +
                        'Entre em contato com o suporte se o problema persistir.',
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

            /*
             * O usuário informou as credenciais e o login foi concluído.
             * A partir daqui a restauração automática de sessão volta a ser
             * permitida em recarregamentos futuros.
             */
            try { localStorage.removeItem('authExplicitLogoutAt'); } catch (_) {}

            sessionStorage.setItem(
                'condominiumUser',
                JSON.stringify(loadedUser)
            );

            try { window.persistCondomitUser?.(loadedUser); } catch (_) {}

            try {
                localStorage.setItem(
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
            showToast('Erro ao fazer login. Tente novamente.', 'error');
        } finally {
            if (document.body.contains(loginForm)) {
                setLoginSubmitting(false);
            }
        }
    });
});
