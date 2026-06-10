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
