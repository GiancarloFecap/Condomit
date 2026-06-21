document.addEventListener('DOMContentLoaded', function() {
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

        if (type === 'sindico') {
            // Check for approved payment
            const approvedPayment = await fetchApprovedPayment(user.email);
            
            if (approvedPayment) {
                // Has approved payment
                if (user.condominium) {
                    window.location.href = 'index.html';
                } else {
                    window.location.href = 'condominio_register.html';
                }
            } else {
                // No approved payment
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
        } else {
            window.location.href = 'assembleia.html';
        }
    }

    // Check if already logged in
    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (loggedInUser) {
        const user = JSON.parse(loggedInUser);
        redirectByUserType(user);
        return;
    }
    
    const loginForm = document.getElementById('loginForm');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    // Toggle password visibility
    togglePassword.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    // Login form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!email || !password) {
            alert('Preencha e-mail e senha.');
            return;
        }

        try {
            const user = await fetchUserByEmail(email);
            if (!user || user.password !== password) {
                alert('E-mail ou senha incorretos.');
                return;
            }

            const normalizedType = getNormalizedUserType(user);
            user.type = normalizedType;
            // Ensure user_type is mapped to type for consistency
            if (user.user_type && !user.type) {
                user.type = getNormalizedUserType(user);
            }
            sessionStorage.setItem('condominiumUser', JSON.stringify(user));

            redirectByUserType(user);
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            alert('Erro ao fazer login. Tente novamente.');
        }
    });
});
