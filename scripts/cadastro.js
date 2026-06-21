document.addEventListener('DOMContentLoaded', function() {
    // Get user type from URL
    const urlParams = new URLSearchParams(window.location.search);
    const userType = urlParams.get('type') || 'morador';
    
    const signupForm = document.getElementById('signupForm');
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const phoneInput = document.getElementById('phone');
    const cpfInput = document.getElementById('cpf');
    const userTypeSelect = document.getElementById('userType');
    const strengthLabel = document.getElementById('strengthLabel');
    const strengthText = document.getElementById('strengthText');
    const strengthBarItems = [
        document.getElementById('bar1'),
        document.getElementById('bar2'),
        document.getElementById('bar3'),
        document.getElementById('bar4'),
        document.getElementById('bar5')
    ];

    // Password requirements
    const requirements = {
        length: { el: document.getElementById('req-length'), check: (p) => p.length >= 8 },
        uppercase: { el: document.getElementById('req-uppercase'), check: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
        number: { el: document.getElementById('req-number'), check: (p) => /\d/.test(p) },
        special: { el: document.getElementById('req-special'), check: (p) => /[!@#$%&*]/.test(p) }
    };

    // Pre-select user type
    if (userType) {
        userTypeSelect.value = userType;
    }

    // Toggle password visibility
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    toggleConfirmPassword.addEventListener('click', function() {
        const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        confirmPasswordInput.setAttribute('type', type);
        toggleConfirmPassword.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    // Phone mask
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        
        if (value.length > 6) {
            value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
        } else if (value.length > 2) {
            value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
        } else if (value.length > 0) {
            value = `(${value}`;
        }
        
        e.target.value = value;
    });

    // CPF mask
    cpfInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        
        if (value.length > 9) {
            value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`;
        } else if (value.length > 6) {
            value = `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6)}`;
        } else if (value.length > 3) {
            value = `${value.slice(0, 3)}.${value.slice(3)}`;
        }
        
        e.target.value = value;
    });

    // Update password strength indicator
    function updatePasswordStrength(password) {
        let validCount = 0;
        Object.values(requirements).forEach(req => {
            const isValid = req.check(password);
            const i = req.el.querySelector('i');
            const span = req.el.querySelector('span');
            if (isValid) {
                i.classList.remove('fa-times-circle');
                i.classList.add('fa-check-circle');
                span.style.color = '#22c55e';
                validCount++;
            } else {
                i.classList.remove('fa-check-circle');
                i.classList.add('fa-times-circle');
                span.style.color = '#dc2626';
            }
        });

        // Update strength bar and label
        strengthBarItems.forEach((bar, index) => {
            if (index < validCount) {
                if (validCount === 1) {
                    bar.style.background = '#dc2626';
                } else if (validCount === 2) {
                    bar.style.background = '#f97316';
                } else if (validCount === 3) {
                    bar.style.background = '#eab308';
                } else if (validCount >= 4) {
                    bar.style.background = '#22c55e';
                }
            } else {
                bar.style.background = '#d1d5db';
            }
        });

        let strengthLabelText = 'Fraca';
        strengthText.className = 'strength-text';
        strengthText.querySelector('span').style.color = '#dc2626';
        if (validCount === 2) {
            strengthLabelText = 'Razoável';
            strengthText.querySelector('span').style.color = '#f97316';
        } else if (validCount === 3) {
            strengthLabelText = 'Bom';
            strengthText.querySelector('span').style.color = '#eab308';
        } else if (validCount >= 4) {
            strengthLabelText = 'Forte';
            strengthText.querySelector('span').style.color = '#22c55e';
        }
        strengthLabel.textContent = strengthLabelText;

        return validCount >= 4;
    }

    passwordInput.addEventListener('input', () => {
        updatePasswordStrength(passwordInput.value);
    });

    // Signup form submission
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const cpf = document.getElementById('cpf').value.trim();
        const password = document.getElementById('password').value.trim();
        const confirmPassword = document.getElementById('confirmPassword').value.trim();
        const type = document.getElementById('userType').value;

        // Validate password requirements
        const isPasswordValid = updatePasswordStrength(password);
        if (!isPasswordValid) {
            alert('A senha não atende a todos os requisitos!');
            return;
        }

        // Validate password match
        if (password !== confirmPassword) {
            alert('As senhas não coincidem!');
            return;
        }

        const user = {
            name: name,
            email: email,
            phone: phone,
            cpf: cpf,
            password: password,
            user_type: type,
            condominium: null
        };

        try {
            const existingUser = await fetchUserByEmail(email);
            if (existingUser) {
                alert('Já existe um usuário cadastrado com este e-mail.');
                return;
            }

            await createUser(user);

            const sessionUser = {
                ...user,
                type: type
            };

            sessionStorage.setItem('condominiumUser', JSON.stringify(sessionUser));
            alert('Cadastro realizado com sucesso!');

            if (type === 'sindico') {
                window.location.href = 'condominio_register.html';
            } else if (type === 'morador') {
                window.location.href = 'entrar-condominio.html';
            } else {
                window.location.href = 'assembleia.html';
            }
        } catch (error) {
            console.error('Erro ao cadastrar usuário:', error);
            alert(`Não foi possível concluir o cadastro: ${error.message || error}`);
        }
    });
});
