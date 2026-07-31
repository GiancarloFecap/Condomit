document.addEventListener('DOMContentLoaded', async function() {
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
    let user = null;
    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (loggedInUser) {
        user = JSON.parse(loggedInUser);
    } else {
        try {
            const raw = localStorage.getItem('condominiumPersistentUser');
            if (raw) {
                const persist = JSON.parse(raw);
                if (persist && persist.email && typeof fetchUserByEmail === 'function') {
                    const fresh = await fetchUserByEmail(persist.email).catch(() => null);
                    if (fresh) {
                        user = { ...fresh, password: fresh.password || null };
                        try { sessionStorage.setItem('condominiumUser', JSON.stringify(user)); } catch(_) {}
                        if (typeof syncAllAvatars === 'function') syncAllAvatars(user);
                    }
                }
            }
        } catch (_) {}
    }
    if (user) {
        // Se nao tem profilePhoto no cache mas tem e-mail, busca do banco ANTES de redirecionar
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
            const rawUser = await fetchUserByEmail(email);
            if (!rawUser || rawUser.password !== password) {
                alert('E-mail ou senha incorretos.');
                return;
            }

            // Garante que campos opcionais do banco (profilePhoto, phone, etc.) sejam sempre copiados
            const user = {
                ...rawUser,
                password: password
            };
            if (rawUser.profilePhoto && !user.profilePhoto) user.profilePhoto = rawUser.profilePhoto;
            if (rawUser.phone && !user.phone) user.phone = rawUser.phone;
            if (rawUser.name && !user.name) user.name = rawUser.name;

            const normalizedType = getNormalizedUserType(user);
            user.type = normalizedType;
            // Ensure user_type is mapped to type for consistency
            if (user.user_type && !user.type) {
                user.type = getNormalizedUserType(user);
            }
            sessionStorage.setItem('condominiumUser', JSON.stringify(user));
            try {
                const persistent = { email: user.email, name: user.name || null, type: user.type || null, t: Date.now() };
                localStorage.setItem('condominiumPersistentUser', JSON.stringify(persistent));
            } catch(_) {}
            if (typeof syncAllAvatars === 'function') syncAllAvatars(user);

            redirectByUserType(user);
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            alert('Erro ao fazer login. Tente novamente.');
        }
    });
});
