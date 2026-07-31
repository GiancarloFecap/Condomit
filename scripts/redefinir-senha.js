let isResetSessionValid = false;
let resetToken = '';

document.addEventListener('DOMContentLoaded', () => {
    resetToken = new URLSearchParams(window.location.search).get('token') || '';
    checkResetToken();

    document.getElementById('toggleNewPassword').addEventListener('click', function() {
        togglePasswordVisibility('newPassword', this);
    });

    document.getElementById('toggleConfirmPassword').addEventListener('click', function() {
        togglePasswordVisibility('confirmPassword', this);
    });

    document.getElementById('newPassword').addEventListener('input', validatePassword);
    document.getElementById('confirmPassword').addEventListener('input', validatePassword);
    document.getElementById('resetPasswordForm').addEventListener('submit', handleResetPassword);

    validatePassword();
});

function checkResetToken() {
    if (!resetToken) {
        showInvalidLink();
        return;
    }

    isResetSessionValid = true;
    showResetForm();
}

function showResetForm() {
    document.getElementById('invalidLinkMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'flex';
}

function showInvalidLink() {
    document.getElementById('invalidLinkMessage').style.display = 'block';
    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
}

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    const icon = button.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
        return;
    }

    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
}

function validatePassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    const requirements = {
        length: newPassword.length >= 8,
        uppercase: /[A-Z]/.test(newPassword),
        lowercase: /[a-z]/.test(newPassword),
        number: /[0-9]/.test(newPassword),
        special: /[!@#$%^&*]/.test(newPassword),
        match: newPassword === confirmPassword && confirmPassword.length > 0
    };

    Object.keys(requirements).forEach((key) => {
        const el = document.getElementById(`req-${key}`);
        const icon = el.querySelector('i');

        if (requirements[key]) {
            el.classList.add('valid');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-check');
        } else {
            el.classList.remove('valid');
            icon.classList.remove('fa-check');
            icon.classList.add('fa-times');
        }
    });

    const isValid = Object.values(requirements).every(Boolean);
    document.getElementById('submitBtn').disabled = !isValid;

    return isValid;
}

async function handleResetPassword(e) {
    e.preventDefault();

    if (!isResetSessionValid || !resetToken) {
        showError('Link de redefinição inválido. Solicite um novo e-mail.');
        return;
    }

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showError('As senhas não coincidem.');
        return;
    }

    if (!validatePassword()) {
        showError('Por favor, preencha todos os requisitos da senha.');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: resetToken,
                password: newPassword
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao redefinir senha.');
        }

        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('resetPasswordForm').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';

        setTimeout(() => {
            window.location.href = 'entrar.html';
        }, 3000);
    } catch (error) {
        console.error('Error resetting password:', error);
        showError(error.message || 'Erro ao redefinir senha. Por favor, tente novamente.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Atualizar Senha';
    }
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}
