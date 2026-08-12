document.addEventListener('DOMContentLoaded', () => {
    const raw = sessionStorage.getItem('condomitPendingTwoFactorLogin');
    let pending = null;
    try { pending = raw ? JSON.parse(raw) : null; } catch (_) {}

    if (!pending?.challengeId) {
        window.location.replace('entrar.html');
        return;
    }

    const description = document.getElementById('twoFactorDescription');
    const feedback = document.getElementById('twoFactorFeedback');
    const form = document.getElementById('twoFactorCodeForm');
    const input = document.getElementById('twoFactorCode');
    const submit = document.getElementById('twoFactorSubmit');

    if (description) {
        description.textContent = `Enviamos um código de 6 dígitos para ${pending.maskedEmail || pending.email || 'seu e-mail'}.`;
    }

    document.getElementById('backToLogin')?.addEventListener('click', () => {
        sessionStorage.removeItem('condomitPendingTwoFactorLogin');
        window.location.replace('entrar.html');
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const code = String(input?.value || '').replace(/\D/g, '');
        if (code.length !== 6) {
            feedback.textContent = 'Digite os 6 dígitos enviados por e-mail.';
            feedback.dataset.state = 'error';
            return;
        }

        submit.disabled = true;
        submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        feedback.textContent = '';

        try {
            const result = await window.condomitTwoFactor.verifyLogin(pending.challengeId, code);
            if (!result?.actionLink) throw new Error('Não foi possível concluir o login.');

            const normalizedUserType = String(result.userType || '')
                .trim()
                .toLowerCase()
                .replace('síndico', 'sindico');

            if (normalizedUserType) {
                sessionStorage.setItem(
                    'condomitVerifiedTwoFactorUserType',
                    normalizedUserType
                );
            }

            sessionStorage.removeItem('condomitPendingTwoFactorLogin');

            /*
             * O actionLink conclui a sessão Supabase com segurança. Depois
             * dele o usuário retorna para 2fa-completo.html, que usa o tipo
             * salvo acima (ou o perfil do banco como fallback) para abrir o
             * dashboard correto.
             */
            window.location.replace(result.actionLink);
        } catch (error) {
            feedback.textContent = error?.message || 'Código inválido.';
            feedback.dataset.state = 'error';
            submit.disabled = false;
            submit.innerHTML = '<i class="fas fa-check"></i> Verificar e entrar';
            input?.focus();
        }
    });

    input?.focus();
});
