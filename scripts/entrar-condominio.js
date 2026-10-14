document.addEventListener('DOMContentLoaded', function() {
     
    const form = document.getElementById('condominiumForm');
    const submitBtn = document.getElementById('submitBtn');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('condominiumPassword');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const alertContainer = document.getElementById('alertContainer');

     
    let currentUser = null;

    function normalizeCep(value) {
        const digits = String(value).replace(/\D/g, '');
        if (digits.length === 8) {
            return `${digits.slice(0, 5)}-${digits.slice(5)}`;
        }
        return value;
    }

    async function proxyFetch(path, options = {}) {
        const response = await fetch(path, options);
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            const message = data?.error || data?.message || response.statusText || 'Erro no servidor';
            throw new Error(message);
        }
        return data;
    }

     
    async function checkAuthAndRedirect() {
        try {
             
            const loggedInUser = sessionStorage.getItem('condominiumUser');
            
            if (!loggedInUser) {
                 
                window.location.href = 'entrar.html';
                return;
            }

            currentUser = JSON.parse(loggedInUser);

             
            const userType = String(currentUser.type || currentUser.user_type || '').toLowerCase();
            if (userType !== 'morador' && userType !== 'porteiro') {
                window.location.href = 'tipo-usuario.html';
                return;
            }

             
             
            if (currentUser.condominium) {
                try {
                    const boundResponse = await proxyFetch(
                        `/api/user_condominiums?user_email=eq.${encodeURIComponent(currentUser.email)}`
                    );
                    if (boundResponse && boundResponse.length > 0) {
                        window.location.href = userType === 'porteiro' ? 'index-porteiro.html' : 'index-morador.html';
                        return;
                    }
                } catch (err) {
                    console.warn('Erro ao verificar vínculo existente:', err.message);
                }

                 
                 
                if (currentUser.condominium.condominium_id) {
                    window.location.href = userType === 'porteiro' ? 'index-porteiro.html' : 'index-morador.html';
                    return;
                }
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            window.location.href = 'entrar.html';
        }
    }

     
    togglePassword.addEventListener('click', function(e) {
        e.preventDefault();
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' 
            ? '<i class="fas fa-eye"></i>' 
            : '<i class="fas fa-eye-slash"></i>';
    });

     
    function showAlert(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = `
            <div class="alert-content">
                <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
            <button class="btn-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        alertContainer.appendChild(alertDiv);

         
        if (type === 'success') {
            setTimeout(() => alertDiv.remove(), 5000);
        }
    }

     
    function toggleLoading(show = true) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
        submitBtn.disabled = show;
    }

     
    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        document.querySelectorAll('.form-group input').forEach(el => el.classList.remove('input-error'));
    }

     
    function showFieldError(fieldId, message) {
        const errorElement = document.getElementById(fieldId + 'Error');
        const inputElement = document.getElementById(fieldId);
        if (errorElement) {
            errorElement.textContent = message;
            inputElement.classList.add('input-error');
        }
    }

     
    async function validateForm() {
        clearErrors();

        const apartment = parseInt(document.getElementById('apartment').value.trim());
        const block = document.getElementById('block').value.trim().toUpperCase();
        const rawCondominiumId = document.getElementById('condominiumId').value.trim();
        const password = document.getElementById('condominiumPassword').value.trim();

         
        const condominiumId = normalizeCep(rawCondominiumId);

         
        if (!apartment || isNaN(apartment) || apartment < 1) {
            showFieldError('apartment', 'Apartamento inválido');
            return null;
        }

        if (!block) {
            showFieldError('block', 'Bloco é obrigatório');
            return null;
        }

        if (!condominiumId) {
            showFieldError('condominiumId', 'ID do condomínio é obrigatório');
            return null;
        }

        if (!/^[0-9]{5}-[0-9]{3}$/.test(condominiumId)) {
            showFieldError('condominiumId', 'Informe um CEP válido de 8 dígitos');
            return null;
        }

        if (!password) {
            showFieldError('condominiumPassword', 'Código de acesso é obrigatório');
            return null;
        }

        return { apartment, block, condominiumId, password };
    }

     
     
    async function validateAgainstDatabase(data) {
        try {
            if (typeof window.supabaseFetch !== 'function') {
                throw new Error('Sessão do Supabase indisponível. Entre novamente.');
            }

            return await window.supabaseFetch('/rpc/condomit_join_condominium_secure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_cep: data.condominiumId,
                    access_code: data.password,
                    target_apartment: String(data.apartment),
                    target_block: data.block
                })
            });
        } catch (error) {
            console.error('Erro ao validar código de acesso:', error);
            const message = error?.message || 'Não foi possível validar o código de acesso.';
            showAlert(message, 'error');
            showFieldError('condominiumPassword', message);
            return null;
        }
    }

    async function saveToDatabaseAndUpdate() {
         
        return true;
    }

     
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        try {
            toggleLoading(true);
            clearErrors();

             
            const formData = await validateForm();
            if (!formData) {
                toggleLoading(false);
                return;
            }

             
            const condominium = await validateAgainstDatabase(formData);
            if (!condominium) {
                toggleLoading(false);
                return;
            }

             
            const savedSuccessfully = await saveToDatabaseAndUpdate(formData, condominium);
            if (!savedSuccessfully) {
                toggleLoading(false);
                return;
            }

             
            currentUser.condominium = {
                condominium_id: formData.condominiumId,
                apartment: formData.apartment,
                block: formData.block,
                name: condominium.condominium_name
            };
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));

             
            showAlert('Condomínio vinculado com sucesso!', 'success');

            const finalUserType = String(currentUser.type || currentUser.user_type || '').toLowerCase();
            const redirectPage = finalUserType === 'porteiro' ? 'index-porteiro.html' : 'index-morador.html';

            setTimeout(() => {
                window.location.href = redirectPage;
            }, 1000);

        } catch (error) {
            console.error('Erro no envio do formulário:', error);
            showAlert('Erro ao processar sua solicitação: ' + error.message, 'error');
            toggleLoading(false);
        }
    });

     
    checkAuthAndRedirect();
});
