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

    /*
     * Requisitos da senha.
     */
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

    /*
     * Mostra ou esconde a senha.
     */
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

    /*
     * Mostra ou esconde a confirmação da senha.
     */
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

    /*
     * Máscara de telefone.
     */
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

    /*
     * Máscara de CPF.
     */
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

    /*
     * Atualiza o indicador de força da senha.
     */
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

        /*
         * Atualiza as barras.
         */
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

    /*
     * Converte alguns erros do Supabase em mensagens mais claras.
     */
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
            return (
                'O usuário não pôde ser salvo no banco. ' +
                'Verifique o gatilho on_auth_user_created e a tabela public.users.'
            );
        }

        if (
            message.includes('duplicate key') &&
            message.includes('cpf')
        ) {
            return 'Já existe um usuário cadastrado com este CPF.';
        }

        return error?.message ||
            'Não foi possível concluir o cadastro.';
    }

    /*
     * Ativa ou desativa o botão durante o cadastro.
     */
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

    /*
     * Inicializa o indicador da senha.
     */
    updatePasswordStrength('');

    passwordInput?.addEventListener('input', function () {
        updatePasswordStrength(passwordInput.value);
    });

    /*
     * Envio do formulário.
     */
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

        /*
         * Não usamos trim() na senha para não modificar
         * silenciosamente aquilo que o usuário digitou.
         */
        const password = document
            .getElementById('password')
            .value;

        const confirmPassword = document
            .getElementById('confirmPassword')
            .value;

        const type = 'porteiro';

        /*
         * Validação dos campos obrigatórios.
         */
        if (
            !name ||
            !email ||
            !phone ||
            !cpf ||
            !password ||
            !confirmPassword
        ) {
            alert('Preencha todos os campos obrigatórios.');
            return;
        }

        /*
         * Valida o formato básico do e-mail.
         */
        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(email)) {
            alert('Digite um endereço de e-mail válido.');
            return;
        }

        /*
         * Verifica se o CPF possui 11 números.
         */
        const cpfNumbers = cpf.replace(/\D/g, '');

        if (cpfNumbers.length !== 11) {
            alert('Digite um CPF com 11 números.');
            return;
        }

        /*
         * Verifica os requisitos da senha.
         */
        const isPasswordValid =
            updatePasswordStrength(password);

        if (!isPasswordValid) {
            alert(
                'A senha não atende a todos os requisitos.'
            );

            return;
        }

        /*
         * Confirmação da senha.
         */
        if (password !== confirmPassword) {
            alert('As senhas não coincidem.');
            return;
        }

        /*
         * Aceita o cliente com qualquer um destes nomes,
         * conforme a inicialização usada no projeto.
         */
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

            alert(
                'O sistema de autenticação não foi carregado. ' +
                'Verifique os scripts do Supabase.'
            );

            return;
        }

        setSubmitting(true);

        try {
            /*
             * Cria o usuário em Authentication → Users.
             *
             * Os dados de options.data serão gravados em
             * raw_user_meta_data e usados pelo gatilho SQL
             * para criar o perfil em public.users.
             */
            const emailRedirectTo = new URL(
                'entrar.html',
                window.location.href
            ).href;

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

            /*
             * Não chamamos createUser().
             *
             * O perfil em public.users deve ser criado pelo
             * gatilho SQL on_auth_user_created.
             */
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

            /*
             * Quando a confirmação de e-mail está ativada,
             * o usuário é criado, mas a sessão pode ser null.
             */
            if (!authData.session) {
                alert(
                    'Cadastro realizado! ' +
                    'Verifique seu e-mail para confirmar a conta.'
                );

                window.location.href = 'entrar.html';
                return;
            }

            /*
             * Caso a confirmação de e-mail esteja desativada,
             * o Supabase pode retornar uma sessão imediatamente.
             */
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

            alert('Cadastro realizado com sucesso!');

            window.location.href = 'assembleia.html';
        } catch (error) {
            console.error(
                'Erro ao cadastrar porteiro:',
                error
            );

            alert(getSignupErrorMessage(error));
        } finally {
            setSubmitting(false);
        }
    });
});