document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.getElementById('signupForm');
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const phoneInput = document.getElementById('phone');
    const cpfInput = document.getElementById('cpf');
    const strengthLabel = document.getElementById('strengthLabel');
    const strengthText = document.getElementById('strengthText');
    const submitButton = signupForm?.querySelector(
        'button[type="submit"], input[type="submit"]'
    );

    const strengthBarItems = [
        document.getElementById('bar1'),
        document.getElementById('bar2'),
        document.getElementById('bar3'),
        document.getElementById('bar4')
    ];

    const requirements = {
        length: {
            el: document.getElementById('req-length'),
            check: (password) => password.length >= 8
        },
        uppercase: {
            el: document.getElementById('req-uppercase'),
            check: (password) =>
                /[A-Z]/.test(password) &&
                /[a-z]/.test(password)
        },
        number: {
            el: document.getElementById('req-number'),
            check: (password) => /\d/.test(password)
        },
        special: {
            el: document.getElementById('req-special'),
            check: (password) => /[!@#$%&*]/.test(password)
        }
    };

    togglePassword?.addEventListener('click', function () {
        const newType =
            passwordInput.getAttribute('type') === 'password'
                ? 'text'
                : 'password';

        passwordInput.setAttribute('type', newType);

        togglePassword.innerHTML =
            newType === 'password'
                ? '<i class="fas fa-eye"></i>'
                : '<i class="fas fa-eye-slash"></i>';
    });

    toggleConfirmPassword?.addEventListener('click', function () {
        const newType =
            confirmPasswordInput.getAttribute('type') === 'password'
                ? 'text'
                : 'password';

        confirmPasswordInput.setAttribute('type', newType);

        toggleConfirmPassword.innerHTML =
            newType === 'password'
                ? '<i class="fas fa-eye"></i>'
                : '<i class="fas fa-eye-slash"></i>';
    });

    phoneInput?.addEventListener('input', function (event) {
        let value = event.target.value.replace(/\D/g, '');

        if (value.length > 11) {
            value = value.slice(0, 11);
        }

        if (value.length > 6) {
            value =
                `(${value.slice(0, 2)}) ` +
                `${value.slice(2, 7)}-${value.slice(7)}`;
        } else if (value.length > 2) {
            value =
                `(${value.slice(0, 2)}) ` +
                value.slice(2);
        } else if (value.length > 0) {
            value = `(${value})`;
        }

        event.target.value = value;
    });

    cpfInput?.addEventListener('input', function (event) {
        let value = event.target.value.replace(/\D/g, '');

        if (value.length > 11) {
            value = value.slice(0, 11);
        }

        if (value.length > 9) {
            value =
                `${value.slice(0, 3)}.` +
                `${value.slice(3, 6)}.` +
                `${value.slice(6, 9)}-` +
                value.slice(9);
        } else if (value.length > 6) {
            value =
                `${value.slice(0, 3)}.` +
                `${value.slice(3, 6)}.` +
                value.slice(6);
        } else if (value.length > 3) {
            value =
                `${value.slice(0, 3)}.` +
                value.slice(3);
        }

        event.target.value = value;
    });

    function updatePasswordStrength(password) {
        let validCount = 0;

        Object.values(requirements).forEach((requirement) => {
            const isValid = requirement.check(password);

            if (!requirement.el) {
                return;
            }

            const icon = requirement.el.querySelector('i');
            const text = requirement.el.querySelector('span');

            if (isValid) {
                icon?.classList.remove('fa-times-circle');
                icon?.classList.add('fa-check-circle');

                if (text) {
                    text.style.color = '#22c55e';
                }

                if (icon) {
                    icon.style.color = '#22c55e';
                }

                validCount++;
            } else {
                icon?.classList.remove('fa-check-circle');
                icon?.classList.add('fa-times-circle');

                if (text) {
                    text.style.color = '#94a3b8';
                }

                if (icon) {
                    icon.style.color = '#94a3b8';
                }
            }
        });

        strengthBarItems.forEach((bar, index) => {
            if (!bar) {
                return;
            }

            if (index >= validCount) {
                bar.style.background = '#e2e8f0';
                return;
            }

            if (validCount === 1) {
                bar.style.background = '#dc2626';
            } else if (validCount === 2) {
                bar.style.background = '#f97316';
            } else if (validCount === 3) {
                bar.style.background = '#eab308';
            } else {
                bar.style.background = '#22c55e';
            }
        });

        let label = 'Fraca';
        let labelColor = '#dc2626';

        if (validCount === 2) {
            label = 'Razoável';
            labelColor = '#f97316';
        } else if (validCount === 3) {
            label = 'Bom';
            labelColor = '#eab308';
        } else if (validCount >= 4) {
            label = 'Forte';
            labelColor = '#22c55e';
        }

        if (strengthLabel) {
            strengthLabel.textContent = label;
        }

        if (strengthText) {
            strengthText.className = 'strength-text';
            strengthText.style.color = labelColor;

            const span = strengthText.querySelector('span');
            if (span) {
                span.style.color = labelColor;
            }
        }

        return validCount >= 4;
    }

    function getSignupErrorMessage(error) {
        const message = String(
            error?.message || error || ''
        ).toLowerCase();

        if (
            message.includes('user already registered') ||
            message.includes('already been registered') ||
            message.includes('already registered')
        ) {
            return 'Já existe uma conta cadastrada com este e-mail.';
        }

        if (
            message.includes('invalid email') ||
            message.includes('email address is invalid')
        ) {
            return 'Digite um endereço de e-mail válido.';
        }

        if (
            message.includes('password should be') ||
            message.includes('weak password')
        ) {
            return 'A senha informada não atende aos requisitos de segurança.';
        }

        if (
            message.includes('database error saving new user') ||
            message.includes('unexpected_failure')
        ) {
            return 'Não foi possível concluir o seu cadastro no momento. Tente novamente.';
        }

        if (
            message.includes('duplicate key') &&
            message.includes('cpf')
        ) {
            return 'Já existe um usuário cadastrado com este CPF.';
        }

        if (
            message.includes('duplicate key') &&
            message.includes('email')
        ) {
            return 'Já existe um usuário cadastrado com este e-mail.';
        }

        if (message.includes('signup is disabled')) {
            return 'Novos cadastros estão temporariamente desativados.';
        }

        if (
            message.includes('email rate limit exceeded') ||
            message.includes('too many requests') ||
            message.includes('rate limit')
        ) {
            return 'Muitas tentativas recentes. Aguarde alguns minutos e tente novamente.';
        }

        if (
            message.includes('network') ||
            message.includes('fetch') ||
            message.includes('failed to fetch')
        ) {
            return 'Falha de conexão. Verifique sua internet e tente novamente.';
        }

        return error?.message ||
            'Não foi possível concluir o cadastro.';
    }

    function setSubmitting(isSubmitting) {
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting;

        if (submitButton.tagName === 'INPUT') {
            submitButton.value = isSubmitting
                ? 'Cadastrando...'
                : 'Cadastrar';
        } else {
            submitButton.textContent = isSubmitting
                ? 'Cadastrando...'
                : 'Cadastrar';
        }
    }

    updatePasswordStrength('');

    passwordInput?.addEventListener('input', function () {
        updatePasswordStrength(passwordInput.value);
    });

    signupForm?.addEventListener('submit', async function (event) {
        event.preventDefault();

        const name = document
            .getElementById('name')
            .value
            .trim();

        const email = document
            .getElementById('email')
            .value
            .trim()
            .toLowerCase();

        const phone = document
            .getElementById('phone')
            .value
            .trim();

        const cpf = document
            .getElementById('cpf')
            .value
            .trim();

        const password = document
            .getElementById('password')
            .value;

        const confirmPassword = document
            .getElementById('confirmPassword')
            .value;

        const type = 'porteiro';

        if (
            !name ||
            !email ||
            !phone ||
            !cpf ||
            !password ||
            !confirmPassword
        ) {
            showToast('Preencha todos os campos obrigatórios.', 'warning');
            return;
        }

        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            showToast('Digite um endereço de e-mail válido.', 'warning');
            return;
        }

        const cpfNumbers = cpf.replace(/\D/g, '');

        if (cpfNumbers.length !== 11) {
            showToast('Digite um CPF com 11 números.', 'warning');
            return;
        }

        const isPasswordValid =
            updatePasswordStrength(password);

        if (!isPasswordValid) {
            showToast(
                'A senha não atende a todos os requisitos de segurança.',
                'warning'
            );
            return;
        }

        if (password !== confirmPassword) {
            showToast('As senhas não coincidem.', 'warning');
            return;
        }

        const supabaseClient =
            window.supabaseClient ||
            window.supabase;

        if (!supabaseClient?.auth?.signUp) {
            console.error(
                'Cliente Supabase não encontrado:',
                {
                    supabaseClient:
                        Boolean(window.supabaseClient),
                    supabase:
                        Boolean(window.supabase)
                }
            );

            showModal({
                title: 'Sistema indisponível',
                message:
                    'O sistema de autenticação não foi carregado. ' +
                    'Atualize a página e tente novamente.',
                type: 'error'
            });

            return;
        }

        setSubmitting(true);

        try {
            const emailRedirectTo =
                `${window.location.origin}/pages/entrar.html`;

            const {
                data: authData,
                error: authError
            } = await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name,
                        phone,
                        cpf,
                        user_type: type
                    },
                    emailRedirectTo
                }
            });

            if (authError) {
                throw authError;
            }

            if (!authData?.user?.id) {
                throw new Error(
                    'O Supabase não retornou o usuário criado.'
                );
            }

            if (
                Array.isArray(authData.user.identities) &&
                authData.user.identities.length === 0
            ) {
                showToast(
                    'Já existe uma conta cadastrada com este e-mail.',
                    'warning'
                );
                return;
            }

            const sessionUser = {
                id: authData.user.id,
                auth_user_id: authData.user.id,
                name,
                email,
                phone,
                cpf,
                user_type: type,
                type,
                condominium: null
            };

            if (!authData.session) {
                setSubmitting(false);

                showModal({
                    title: 'Cadastro realizado!',
                    message:
                        'Cadastro realizado com sucesso! ' +
                        'Enviamos um link de confirmação para o seu e-mail (' + email + ').\n\n' +
                        'Confirme seu endereço antes de entrar na Condomit. ' +
                        'Verifique também a pasta de spam ou lixo eletrônico.',
                    type: 'success',
                    confirmText: 'Ir para o Login',
                    onConfirm: () => {
                        window.location.href = 'entrar.html';
                    }
                });
                return;
            }

            sessionStorage.setItem(
                'condominiumUser',
                JSON.stringify(sessionUser)
            );

            sessionStorage.setItem(
                'sb-session',
                JSON.stringify(authData.session)
            );

            sessionStorage.setItem(
                'sb-access-token',
                authData.session.access_token
            );

            showToast('Cadastro realizado com sucesso!', 'success');

            window.location.href = 'assembleia.html';
        } catch (error) {
            console.error(
                'Erro ao cadastrar porteiro:',
                error
            );

            const friendly = getSignupErrorMessage(error);
            showToast(friendly, 'error');
        } finally {
            if (document.body.contains(signupForm)) {
                setSubmitting(false);
            }
        }
    });
});
