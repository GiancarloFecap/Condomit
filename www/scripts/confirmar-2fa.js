document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || '';
    const title = document.getElementById('confirmationTitle');
    const message = document.getElementById('confirmationMessage');
    const icon = document.getElementById('confirmationIcon');
    const action = document.getElementById('confirmationAction');

    try {
        if (!token) throw new Error('O link de confirmação está incompleto.');
        const result = await window.condomitTwoFactor.confirmChange(token);
        const enabled = result?.enabled === true;

        icon.innerHTML = '<i class="fas fa-check"></i>';
        icon.classList.add('success');
        title.textContent = enabled
            ? 'Verificação em duas etapas ativada'
            : 'Verificação em duas etapas desativada';
        message.textContent = enabled
            ? 'A partir do próximo login após sair da conta, enviaremos um código para o seu e-mail.'
            : 'A verificação adicional por e-mail foi removida da sua conta.';
        action.hidden = false;
    } catch (error) {
        icon.innerHTML = '<i class="fas fa-xmark"></i>';
        icon.classList.add('error');
        title.textContent = 'Não foi possível confirmar';
        message.textContent = error?.message || 'O link expirou ou já foi utilizado.';
        action.hidden = false;
    }
});
