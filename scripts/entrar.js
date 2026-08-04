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
        } else if (type === 'porteiro') {
            window.location.href = 'index-porteiro.html';
        } else {
            window.location.href = 'assembleia.html';
        }
    }

    // Check if already logged in
    let user = null;
    const loggedInUser = sessionStorage.getItem('condominiumUser');
    if (loggedInUser) {
        user = JSON.parse(loggedInUser);
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
        
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value.trim();

        if (!email || !password) {
            alert('Preencha e-mail e senha.');
            return;
        }

        try {
            if (!window.supabase?.auth) {
    throw new Error('Supabase Auth ainda não foi carregado.');
}

const { data: authData, error: authError } =
    await window.supabase.auth.signInWithPassword({
        email,
        password
    });

if (authError) {
    alert('E-mail ou senha incorretos.');
    return;
}

if (!authData?.session || !authData?.user) {
    throw new Error('O Supabase não retornou uma sessão válida.');
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

    alert('Perfil do usuário não encontrado.');
    return;
}

const user = {
    ...rawUser,
    id: authData.user.id,
    type: getNormalizedUserType(rawUser)
};

sessionStorage.setItem(
    'condominiumUser',
    JSON.stringify(user)
);

try {
    localStorage.setItem(
        'condominiumPersistentUser',
        JSON.stringify({
            email: user.email,
            name: user.name || null,
            type: user.type || null,
            t: Date.now()
        })
    );
} catch (_) {}

if (typeof syncAllAvatars === 'function') {
    syncAllAvatars(user);
}

await redirectByUserType(user);
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            alert('Erro ao fazer login. Tente novamente.');
        }
    });
});
