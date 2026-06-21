document.addEventListener('DOMContentLoaded', () => {
    const resetForm = document.getElementById('resetForm');
    const emailInput = document.getElementById('email');
    const submitBtn = document.getElementById('submitBtn');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();

        if (!email || !validateEmail(email)) {
            errorMessage.style.display = 'block';
            successMessage.style.display = 'none';
            return;
        }

        errorMessage.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        try {
            const response = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ocorreu um erro');
            }

            // Em desenvolvimento, redirecionamos diretamente com o token
            if (data.token) {
                window.location.href = data.redirectUrl;
            } else {
                successMessage.style.display = 'block';
                resetForm.style.display = 'none';
            }
        } catch (error) {
            console.error('Error sending reset email:', error);
            errorMessage.textContent = 'Ocorreu um erro ao enviar o e-mail. Tente novamente.';
            errorMessage.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar link de redefinição';
        }
    });

    emailInput.addEventListener('input', () => {
        if (errorMessage.style.display === 'block') {
            errorMessage.style.display = 'none';
        }
    });
});