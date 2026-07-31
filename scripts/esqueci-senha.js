document.addEventListener('DOMContentLoaded', () => {
    const resetForm = document.getElementById('resetForm');
    const emailInput = document.getElementById('email');
    const submitBtn = document.getElementById('submitBtn');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const successPanel = document.getElementById('successPanel');

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function setFeedback(message, type) {
        feedbackMessage.textContent = message;
        feedbackMessage.className = `feedback-message ${type}`;
        feedbackMessage.style.display = message ? 'block' : 'none';
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? 'Enviando...' : 'Enviar link de recuperação';
    }

    async function solicitarRecuperacao(email) {
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

        return data;
    }

    resetForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim().toLowerCase();

        if (!email || !isValidEmail(email)) {
            setFeedback('Digite um e-mail válido para continuar.', 'error');
            successPanel.hidden = true;
            return;
        }

        setFeedback('', '');
        setLoading(true);

        try {
            await solicitarRecuperacao(email);
            resetForm.hidden = true;
            successPanel.hidden = false;
            setFeedback('Solicitação enviada com sucesso.', 'success');
        } catch (error) {
            console.error('Erro ao solicitar recuperação de senha:', error);
            setFeedback(error.message || 'Não foi possível enviar o link de recuperação.', 'error');
        } finally {
            setLoading(false);
        }
    });

    emailInput.addEventListener('input', () => {
        if (feedbackMessage.style.display === 'block') {
            setFeedback('', '');
        }
    });
});
