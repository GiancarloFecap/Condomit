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
            errorMessage.textContent = 'Digite um e-mail válido.';
            errorMessage.style.display = 'block';
            successMessage.style.display = 'none';
            return;
        }

        errorMessage.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';

        try {
            const resetPageUrl = `${window.location.origin}/pages/redefinir-senha.html`;

            const response = await fetch('/esqueceu-senha', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email,
                    resetPageUrl
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'Ocorreu um erro ao solicitar a redefinição.');
            }

            successMessage.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <h2>Enviamos um e-mail</h2>
                <p>Caso o e-mail informado esteja cadastrado, você receberá uma mensagem com um link para redefinir sua senha.</p>
            `;
            successMessage.style.display = 'block';
            resetForm.style.display = 'none';
            
        } catch (error) {
            console.error('Error sending reset email:', error);
            errorMessage.textContent = error.message || 'Ocorreu um erro ao enviar o e-mail. Tente novamente.';
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
