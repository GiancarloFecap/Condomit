document.addEventListener('DOMContentLoaded', () => {
    const redefineForm = document.getElementById('redefineForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('submitBtn');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const strengthLabel = document.getElementById('strengthLabel');
    const strengthText = document.getElementById('strengthText');
    const requirementsList = document.getElementById('requirementsList');
    const toggleNewPassword = document.getElementById('toggleNewPassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const strengthBarItems = [
        document.getElementById('bar1'),
        document.getElementById('bar2'),
        document.getElementById('bar3'),
        document.getElementById('bar4'),
        document.getElementById('bar5')
    ];

    // Obtém token da URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    const requirements = {
        length: { el: document.getElementById('req-length'), check: (p) => p.length >= 8 },
        uppercase: { el: document.getElementById('req-uppercase'), check: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p) },
        number: { el: document.getElementById('req-number'), check: (p) => /\d/.test(p) },
        special: { el: document.getElementById('req-special'), check: (p) => /[!@#$%&*]/.test(p) }
    };

    // Toggle password visibility
    function togglePasswordVisibility(input, button) {
        const type = input.type === 'password' ? 'text' : 'password';
        input.type = type;
        const icon = button.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    }

    toggleNewPassword.addEventListener('click', () => togglePasswordVisibility(newPasswordInput, toggleNewPassword));
    toggleConfirmPassword.addEventListener('click', () => togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword));

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
                span.classList.remove('invalid');
                span.classList.add('valid');
                validCount++;
            } else {
                i.classList.remove('fa-check-circle');
                i.classList.add('fa-times-circle');
                span.classList.remove('valid');
                span.classList.add('invalid');
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
        strengthText.className = 'strength-text fraca';
        if (validCount === 2) {
            strengthLabelText = 'Razoável';
            strengthText.className = 'strength-text razoavel';
        } else if (validCount === 3) {
            strengthLabelText = 'Bom';
            strengthText.className = 'strength-text bom';
        } else if (validCount >= 4) {
            strengthLabelText = 'Forte';
            strengthText.className = 'strength-text forte';
        }
        strengthLabel.textContent = strengthLabelText;

        return validCount >= 4;
    }

    newPasswordInput.addEventListener('input', () => {
        updatePasswordStrength(newPasswordInput.value);
        if (errorMessage.style.display === 'block') {
            errorMessage.style.display = 'none';
        }
    });

    // Check if passwords match
    confirmPasswordInput.addEventListener('input', () => {
        if (errorMessage.style.display === 'block') {
            errorMessage.style.display = 'none';
        }
    });

    // Handle form submission
    redefineForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!token) {
            errorMessage.textContent = 'Token inválido ou expirado.';
            errorMessage.style.display = 'block';
            return;
        }

        // Validate requirements
        const isPasswordValid = updatePasswordStrength(newPassword);
        if (!isPasswordValid) {
            errorMessage.textContent = 'A senha não atende a todos os requisitos.';
            errorMessage.style.display = 'block';
            return;
        }

        if (newPassword !== confirmPassword) {
            errorMessage.textContent = 'As senhas não coincidem.';
            errorMessage.style.display = 'block';
            return;
        }

        errorMessage.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Redefinindo...';

        try {
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token, password: newPassword })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ocorreu um erro');
            }

            successMessage.style.display = 'block';
            redefineForm.style.display = 'none';

            setTimeout(() => {
                window.location.href = 'entrar.html';
            }, 2000);
        } catch (error) {
            console.error('Error updating password:', error);
            errorMessage.textContent = 'Ocorreu um erro ao redefinir a senha. Tente novamente.';
            errorMessage.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Redefinir senha';
        }
    });
});