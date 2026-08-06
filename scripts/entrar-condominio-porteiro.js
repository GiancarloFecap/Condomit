document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('porteiroCondominiumForm');
    const submitBtn = document.getElementById('submitBtn');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('condominiumPassword');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const alertContainer = document.getElementById('alertContainer');

    let currentUser = null;

    function normalizeCep(value) {
        const digits = String(value || '').replace(/\D/g, '');
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

            if (userType !== 'porteiro') {
                if (userType === 'morador') {
                    window.location.href = 'entrar-condominio.html';
                } else {
                    window.location.href = 'tipo-usuario.html';
                }
                return;
            }

            if (currentUser.condominium) {
                let boundOk = false;
                try {
                    const boundResponse = await proxyFetch(
                        `/api/user_condominiums?user_email=eq.${encodeURIComponent(currentUser.email)}`
                    );
                    boundOk = !!(boundResponse && boundResponse.length > 0);
                } catch (err) {
                    console.warn('Erro ao verificar vinculo existente:', err.message);
                }

                const hasCondoId = !!currentUser.condominium.condominium_id;

                if (boundOk || hasCondoId) {
                    try {
                        const email = String(currentUser.email || '').toLowerCase();
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const sessionKey = `porteiro:session:${email}:${todayStr}`;
                        const condoId = currentUser.condominium.condominium_id || currentUser.condominium.cep || '';
                        const everKey = `porteiro:entry:${email}:${condoId}`;
                        sessionStorage.setItem(sessionKey, '1');
                        if (condoId) sessionStorage.setItem(everKey, '1');
                    } catch (_) {}
                    window.location.href = 'index-porteiro.html';
                    return;
                }
            }
        } catch (error) {
            console.error('Erro ao verificar autenticacao:', error);
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
        const iconMap = {
            error: 'exclamation-circle',
            success: 'check-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.innerHTML = `
            <div class="alert-content">
                <i class="fas fa-${iconMap[type] || 'info-circle'}"></i>
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
        if (errorElement) errorElement.textContent = message;
        if (inputElement) inputElement.classList.add('input-error');
    }

    function validateForm() {
        clearErrors();

        const rawCondominiumId = document.getElementById('condominiumId').value.trim();
        const password = document.getElementById('condominiumPassword').value.trim();
        const condominiumId = normalizeCep(rawCondominiumId);

        if (!condominiumId) {
            showFieldError('condominiumId', 'ID do condomínio é obrigatório');
            return null;
        }
        if (!/^[0-9]{5}-[0-9]{3}$/.test(condominiumId)) {
            showFieldError('condominiumId', 'Informe um CEP válido de 8 dígitos');
            return null;
        }
        if (!password) {
            showFieldError('condominiumPassword', 'Senha do condomínio é obrigatória');
            return null;
        }

        return { condominiumId, password };
    }

    async function validateAgainstDatabase(data) {
        try {
            const condominiumResponse = await proxyFetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(data.condominiumId)}`
            );

            if (!condominiumResponse || condominiumResponse.length === 0) {
                showAlert('ID do condomínio não encontrado.', 'error');
                showFieldError('condominiumId', 'Condomínio não encontrado');
                return null;
            }

            const condominium = condominiumResponse[0];

            if (data.password !== condominium.condominium_name) {
                showAlert('Senha do condomínio incorreta.', 'error');
                showFieldError('condominiumPassword', 'Senha incorreta');
                return null;
            }

            return condominium;
        } catch (error) {
            console.error('Erro na validacao:', error);
            showAlert('Erro ao validar dados: ' + error.message, 'error');
            return null;
        }
    }

    async function saveToDatabaseAndUpdate(data, condominium) {
        try {
            const userCondominiumPayload = {
                user_email: currentUser.email,
                condominium_id: data.condominiumId
            };

            try {
                await proxyFetch('/api/user_condominiums', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(userCondominiumPayload)
                });
            } catch (insertErr) {
                const msg = String(insertErr?.message || '').toLowerCase();
                const isDuplicate = msg.includes('duplicate') || msg.includes('já existe') ||
                    msg.includes('already exists') || msg.includes('23505');
                if (!isDuplicate) throw insertErr;
            }

            const userResponse = (typeof fetchUserByEmail === 'function')
                ? await fetchUserByEmail(currentUser.email)
                : await proxyFetch(
                    `/api/users?select=*&email=eq.${encodeURIComponent(currentUser.email)}`
                  ).then(res => (Array.isArray(res) ? res[0] : res)).catch(() => null);

            if (userResponse) {
                const updatedCondominium = userResponse.condominium || {};
                Object.assign(updatedCondominium, {
                    condominium_id: data.condominiumId,
                    name: condominium.condominium_name
                });

                await proxyFetch(`/api/users?email=${encodeURIComponent(currentUser.email)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ condominium: updatedCondominium })
                });
            }

            return true;
        } catch (error) {
            console.error('Erro ao salvar vinculacao:', error);
            showAlert('Erro ao salvar vinculação: ' + error.message, 'error');
            return false;
        }
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        try {
            toggleLoading(true);
            clearErrors();

            const formData = validateForm();
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
                name: condominium.condominium_name
            };
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));

            try {
                const checkKey = `porteiro:entry:${currentUser.email}:${formData.condominiumId}`;
                sessionStorage.setItem(checkKey, '1');
                const todayStr = new Date().toISOString().slice(0, 10);
                const sessionKey = `porteiro:session:${currentUser.email}:${todayStr}`;
                sessionStorage.setItem(sessionKey, '1');
            } catch(_) {}

            try {
                const persistent = {
                    email: currentUser.email,
                    name: currentUser.name || null,
                    type: currentUser.type || currentUser.user_type || null,
                    condominium: currentUser.condominium,
                    t: Date.now()
                };
                localStorage.setItem('condominiumPersistentUser', JSON.stringify(persistent));
            } catch(_) {}

            showAlert('Acesso ao condomínio liberado com sucesso!', 'success');

            setTimeout(() => {
                window.location.href = 'index-porteiro.html';
            }, 1000);

        } catch (error) {
            console.error('Erro no envio do formulario:', error);
            showAlert('Erro ao processar sua solicitação: ' + error.message, 'error');
            toggleLoading(false);
        }
    });

    checkAuthAndRedirect();
});
