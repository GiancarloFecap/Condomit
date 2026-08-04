document.addEventListener('DOMContentLoaded', function () {
    const signupForm = document.getElementById('signupForm');
    const submitButton = document.getElementById('submitBtn');

    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');

    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const phoneInput = document.getElementById('phone');
    const cpfInput = document.getElementById('cpf');

    const strengthLabel = document.getElementById('strengthLabel');
    const strengthText = document.getElementById('strengthText');

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

    /*
     * Exibir ou esconder senha.
     */
    togglePassword.addEventListener('click', function () {
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

    toggleConfirmPassword.addEventListener('click', function () {
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
    phoneInput.addEventListener('input', function (event) {
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
    cpfInput.addEventListener('input', function (event) {
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
     * Atualiza a indicação de força da senha.
     */
    function updatePasswordStrength(password) {
        let validCount = 0;

        Object.values(requirements).forEach((requirement) => {
            const isValid = requirement.check(password);
            const icon = requirement.el.querySelector('i');
            const text = requirement.el.querySelector('span');

            if (isValid) {
                icon.classList.remove('fa-times-circle');
                icon.classList.add('fa-check-circle');

                text.style.color = '#22c55e';
                icon.style.color = '#22c55e';

                validCount++;
            } else {
                icon.classList.remove('fa-check-circle');
                icon.classList.add('fa-times-circle');

                text.style.color = '#94a3b8';
                icon.style.color = '#94a3b8';
            }
        });

        strengthBarItems.forEach((bar, index) => {
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

        let strengthLabelText = 'Fraca';
        let strengthColor = '#dc2626';

        if (validCount === 2) {
            strengthLabelText = 'Razoável';
            strengthColor = '#f97316';
        } else if (validCount === 3) {
            strengthLabelText = 'Bom';
            strengthColor = '#eab308';
        } else if (validCount >= 4) {
            strengthLabelText = 'Forte';
            strengthColor = '#22c55e';
        }

        strengthLabel.textContent = strengthLabelText;
        strengthText.style.color = strengthColor;

        const strengthSpan = strengthText.querySelector('span');

        if (strengthSpan) {
            strengthSpan.style.color = strengthColor;
        }

        return validCount >= 4;
    }

    updatePasswordStrength('');

    passwordInput.addEventListener('input', function () {
        updatePasswordStrength(passwordInput.value);
    });

    /*
     * Bloqueia ou libera o botão durante o cadastro.
     */
    function setSubmitting(isSubmitting) {
        if (!submitButton) {
            return;
        }

        submitButton.disabled = isSubmitting;

        if (isSubmitting) {
            submitButton.innerHTML =
                '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';
        } else {
            submitButton.innerHTML =
                '<i class="fas fa-arrow-right-from-bracket"></i> ' +
                'Cadastrar no Condomit';
        }
    }

    /*
     * Cadastro do usuário.
     */
    signupForm.addEventListener('submit', async function (event) {
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
         * Não utilize trim() na senha.
         */
        const password = document
            .getElementById('password')
            .value;

        const confirmPassword = document
            .getElementById('confirmPassword')
            .value;

        const type = 'morador';

        if (!name || !email || !phone || !cpf) {
            alert('Preencha todos os campos obrigatórios.');
            return;
        }

        const normalizedCpf = cpf.replace(/\D/g, '');
        const normalizedPhone = phone.replace(/\D/g, '');

        if (normalizedCpf.length !== 11) {
            alert('Digite um CPF com 11 números.');
            return;
        }

        if (
            normalizedPhone.length !== 10 &&
            normalizedPhone.length !== 11
        ) {
            alert('Digite um telefone válido.');
            return;
        }

        const isPasswordValid =
            updatePasswordStrength(password);

        if (!isPasswordValid) {
            alert(
                'A senha não atende a todos os requisitos.'
            );

            return;
        }

        if (password !== confirmPassword) {
            alert('As senhas não coincidem.');
            return;
        }

        try {
            setSubmitting(true);

            if (!window.supabase?.auth) {
                throw new Error(
                    'Supabase Auth não foi carregado. ' +
                    'Verifique os scripts da página.'
                );
            }

            /*
             * Cria o usuário no Supabase Authentication.
             *
             * Os dados enviados em options.data ficam disponíveis
             * em auth.users.raw_user_meta_data.
             *
             * O gatilho SQL usa esses dados para criar o registro
             * correspondente em public.users.
             */
            const { data: authData, error: authError } =
                await window.supabase.auth.signUp({
                    email,
                    password,

                    options: {
                        data: {
                            name,
                            phone,
                            cpf,
                            user_type: type
                        },

                        emailRedirectTo:
                            `${window.location.origin}` +
                            '/pages/entrar.html'
                    }
                });

            if (authError) {
                throw new Error(authError.message);
            }

            if (!authData?.user?.id) {
                throw new Error(
                    'O Supabase não retornou o usuário criado.'
                );
            }

            /*
             * Alguns projetos podem ocultar a informação de que
             * um e-mail já está cadastrado.
             */
            if (
                Array.isArray(authData.user.identities) &&
                authData.user.identities.length === 0
            ) {
                alert(
                    'Já existe uma conta cadastrada com este e-mail.'
                );

                return;
            }

            /*
             * Se a confirmação de e-mail estiver habilitada,
             * o usuário será criado, mas session será null.
             */
            if (!authData.session) {
                alert(
                    'Cadastro realizado! Verifique seu e-mail ' +
                    'para confirmar a conta.'
                );

                window.location.href = 'entrar.html';
                return;
            }

            /*
             * Objeto local sem senha.
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

            sessionStorage.setItem(
                'sb-session',
                JSON.stringify(authData.session)
            );

            sessionStorage.setItem(
                'sb-access-token',
                authData.session.access_token
            );

            sessionStorage.setItem(
                'condominiumUser',
                JSON.stringify(sessionUser)
            );

            alert('Cadastro realizado com sucesso!');

            window.location.href =
                'entrar-condominio.html';
        } catch (error) {
            console.error(
                'Erro ao cadastrar usuário:',
                error
            );

            const errorMessage = String(
                error?.message || error || ''
            );

            if (
                errorMessage
                    .toLowerCase()
                    .includes('already registered')
            ) {
                alert(
                    'Já existe uma conta cadastrada com este e-mail.'
                );
            } else if (
                errorMessage
                    .toLowerCase()
                    .includes('database error saving new user')
            ) {
                alert(
                    'O usuário não pôde ser salvo no banco. ' +
                    'Verifique o gatilho handle_new_auth_user ' +
                    'e as colunas da tabela public.users.'
                );
            } else {
                alert(
                    `Não foi possível concluir o cadastro: ` +
                    errorMessage
                );
            }
        } finally {
            setSubmitting(false);
        }
    });
});