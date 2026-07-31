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

        // #region debug-point A:frontend-request
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"A",location:"scripts/esqueci-senha.js:solicitarRecuperacao:start",msg:"[DEBUG] Iniciando requisicao de recuperacao",data:{email,resetPageUrl},ts:Date.now()})}).catch(()=>{});
        // #endregion
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
        // #region debug-point A:frontend-response
        fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"A",location:"scripts/esqueci-senha.js:solicitarRecuperacao:response",msg:"[DEBUG] Resposta da recuperacao recebida",data:{ok:response.ok,status:response.status,url:response.url||"/esqueceu-senha",payload:data},ts:Date.now()})}).catch(()=>{});
        // #endregion

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
            // #region debug-point E:frontend-catch
            fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"forgot-password-error",runId:"pre-fix",hypothesisId:"E",location:"scripts/esqueci-senha.js:submit:catch",msg:"[DEBUG] Frontend capturou erro na recuperacao",data:{message:error?.message||String(error)},ts:Date.now()})}).catch(()=>{});
            // #endregion
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
