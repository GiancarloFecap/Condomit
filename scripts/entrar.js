document.addEventListener('DOMContentLoaded', async function() {
    let resendCooldownUntil = 0;
    let resendInProgress = false;

    async function fetchApprovedPayment(email) {
        try {
            const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
            if (!response.ok) return null;
            const payments = await response.json();
            return payments.find(p => p.status_pagamento === 'aprovado');
        } catch (error) {
            console.error('Error checking payment:', error);
            return null;
        }
    }

    function getNormalizedUserType(user) {
        return String(user.user_type || user.type || '').trim().toLowerCase();
    }

    async function redirectByUserType(user) {
        const type = getNormalizedUserType(user);
        user.type = type;
        sessionStorage.setItem('condominiumUser', JSON.stringify(user));
        try {
            const persistent = { email: user.email, name: user.name || null, type: user.type || null, t: Date.now() };
            localStorage.setItem('condominiumPersistentUser', JSON.stringify(persistent));
        } catch(_) {}
        if (typeof syncAllAvatars === 'function') syncAllAvatars(user);

        if (type === 'sindico') {
            const approvedPayment = await fetchApprovedPayment(user.email);

            if (approvedPayment) {
                if (user.condominium) {
                    window.location.href = 'index.html';
                } else {
                    window.location.href = 'condominio_register.html';
                }
            } else {
                if (user.condominium) {
                    window.location.href = 'checkout.html';
                } else {
                    window.location.href = 'condominio_register.html';
                }
            }
        } else if (type === 'morador') {
            if (user.condominium) {
                window.location.href = 'index-morador.html';
            } else {
                window.location.href = 'entrar-condominio.html';
            }
        } else if (type === 'porteiro') {
            window.location.href = 'index-porteiro.html';
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

            const emailRedirectTo = `${window.location.origin}/pages/entrar.html`;

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

            const { data: authData, error: authError } =
                await window.supabase.auth.signInWithPassword({
                    email,
                    password
                });

            if (authError) {
                const errCode = String(authError.code || '').toLowerCase();
                const errMsg = String(authError.message || '').toLowerCase();

                if (
                    errCode === 'email_not_confirmed' ||
                    errMsg.includes('email not confirmed') ||
                    errMsg.includes('email_not_confirmed')
                ) {
                    setLoginSubmitting(false);
                    showEmailNotConfirmedModal(email);
                    return;
                }

                if (
                    errCode === 'invalid_credentials' ||
                    errMsg.includes('invalid') ||
                    errMsg.includes('incorrect') ||
                    errMsg.includes('credentials') ||
                    (authError.status && authError.status >= 400 && authError.status < 500)
                ) {
                    showToast('E-mail ou senha incorretos.', 'error');
                    return;
                }

                if (
                    errMsg.includes('too many') ||
                    errMsg.includes('rate limit')
                ) {
                    showToast(
                        'Muitas tentativas de login recentes. Aguarde alguns minutos e tente novamente.',
                        'error'
                    );
                    return;
                }

                if (
                    errMsg.includes('network') ||
                    errMsg.includes('fetch')
                ) {
                    showToast(
                        'Falha de conexão. Verifique sua internet e tente novamente.',
                        'error'
                    );
                    return;
                }

                throw authError;
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
                type: getNormalizedUserType(rawUser)
            };

            sessionStorage.setItem(
                'condominiumUser',
                JSON.stringify(loadedUser)
            );

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
