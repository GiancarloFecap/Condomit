document.addEventListener('DOMContentLoaded', async function() {
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
        try {
            if (typeof syncAllAvatars === 'function') syncAllAvatars(user);
        } catch(avatarErr) {
            console.warn('Erro ao sincronizar avatar (ignorado):', avatarErr);
        }

        if (type === 'sindico') {
            let approvedPayment = null;
            try {
                approvedPayment = await fetchApprovedPayment(user.email);
            } catch (paymentErr) {
                console.warn('Erro ao checar pagamento (tratado):', paymentErr);
                approvedPayment = null;
            }

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
            if (user.condominium) {
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
                    const probeResult = await checkDeletedUserOfferReactivate(email);

                    if (probeResult?.exists && probeResult?.deleted) {
                        setLoginSubmitting(false);
                        showModal({
                            title: 'Esta conta foi removida',
                            message:
                                `Detectamos que o e-mail <strong>${email}</strong> já teve uma conta cadastrada anteriormente mas ela foi inativada.<br><br>` +
                                'Deseja <strong>reativar a conta</strong> e receber um e-mail para recuperar o acesso?',
                            type: 'warning',
                            confirmText: 'Reativar e enviar e-mail',
                            cancelText: 'Não, voltar',
                            onConfirm: async () => {
                                const emailRedirectTo =
                                    `${window.location.origin}/pages/entrar.html`;
                                const reactivateResult = await tryReactivateDeletedUser({
                                    email,
                                    emailRedirectTo
                                });

                                if (reactivateResult?.data?.reactivated === true) {
                                    showModal({
                                        title: 'Conta reativada!',
                                        message:
                                            'A sua conta foi reativada com sucesso. Enviamos um e-mail para ' +
                                            `<strong>${email}</strong> com um link para cadastrar uma nova senha.<br><br>` +
                                            'Verifique também a pasta de <strong>spam</strong> ou <strong>lixo eletrônico</strong>.',
                                        type: 'success',
                                        confirmText: 'Entendido'
                                    });
                                } else if (reactivateResult?.data?.status === 'already-active') {
                                    showToast('Esta conta já está ativa. Apenas efetue o login.', 'info');
                                } else {
                                    showToast(
                                        'Não foi possível reativar a conta agora. Tente novamente mais tarde.',
                                        'error'
                                    );
                                }
                            }
                        });
                        return;
                    }

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

            const authEmailNormalized = String(authData.user.email || '').trim().toLowerCase();
            let rawUser = null;
            if (typeof window.fetchUserByEmail === 'function') {
                try {
                    rawUser = await window.fetchUserByEmail(authData.user.email);
                } catch (byEmailErr) {
                    console.warn('[entrar] fetchUserByEmail falhou (tentando auth_user_id fallback):', byEmailErr?.message || byEmailErr);
                    rawUser = null;
                }
            } else {
                try {
                    rawUser = await fetchUserByEmail(authData.user.email);
                } catch (byEmailErr) {
                    console.warn('[entrar] fallback fetchUserByEmail falhou:', byEmailErr?.message || byEmailErr);
                    rawUser = null;
                }
            }

            if (!rawUser && typeof window.fetchUserByAuthUserId === 'function' && authData.user?.id) {
                try {
                    rawUser = await window.fetchUserByAuthUserId(authData.user.id);
                    if (rawUser) console.log('[entrar] Perfil carregado via auth_user_id (email query falhou).');
                } catch (byIdErr) {
                    console.warn('[entrar] fetchUserByAuthUserId falhou:', byIdErr?.message || byIdErr);
                    rawUser = null;
                }
            }

            if (!rawUser) {
                console.warn('[entrar] Nenhuma busca retornou perfil. authEmail=', authEmailNormalized, 'auth_user_id=', authData.user?.id);
                await window.supabase.auth.signOut();
                sessionStorage.removeItem('sb-session');
                sessionStorage.removeItem('sb-access-token');

                showModal({
                    title: 'Perfil não encontrado',
                    message:
                        'A autenticação foi realizada, mas o perfil do usuário não foi localizado no sistema.\n\n' +
                        'Entre em contato com o suporte se o problema persistir.\n\n' +
                        `Dados da autenticação:\nE-mail: ${authData.user.email}\nID: ${authData.user.id}`,
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
            const detail = error?.message ? ` ${error.message}` : '';
            showToast('Erro ao fazer login. Tente novamente.' + detail, 'error');
        } finally {
            if (document.body.contains(loginForm)) {
                setLoginSubmitting(false);
            }
        }
    });
});
