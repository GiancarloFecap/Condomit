document.addEventListener('DOMContentLoaded', function() {
    // Elementos do DOM
    const form = document.getElementById('condominiumForm');
    const submitBtn = document.getElementById('submitBtn');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('condominiumPassword');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const alertContainer = document.getElementById('alertContainer');

    // Referência ao usuário logado
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

    // Verificar se o usuário está autenticado
    async function checkAuthAndRedirect() {
        try {
            // Obter usuário do sessionStorage (demo) ou do Supabase (produção)
            const loggedInUser = sessionStorage.getItem('condominiumUser');
            
            if (!loggedInUser) {
                // Se não há usuário logado, redirecionar para login
                window.location.href = 'entrar.html';
                return;
            }

            currentUser = JSON.parse(loggedInUser);

            // Se o tipo não é morador, redirecionar
            if (currentUser.type !== 'morador') {
                window.location.href = 'tipo-usuario.html';
                return;
            }

            // Se o usuário já tem condomínio vinculado no sessionStorage,
            // verificar também se o vínculo existe no banco de dados.
            if (currentUser.condominium) {
                try {
                    const boundResponse = await proxyFetch(
                        `/api/user_condominiums?user_email=eq.${encodeURIComponent(currentUser.email)}`
                    );
                    if (boundResponse && boundResponse.length > 0) {
                        window.location.href = 'index-morador.html';
                        return;
                    }
                } catch (err) {
                    console.warn('Erro ao verificar vínculo existente:', err.message);
                }

                // Se o vínculo foi salvo na sessão mas ainda não foi retornado
                // pela consulta, permitir o acesso imediato ao dashboard.
                if (currentUser.condominium.condominium_id) {
                    window.location.href = 'index-morador.html';
                    return;
                }
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            window.location.href = 'entrar.html';
        }
    }

    // Mostrar/ocultar senha
    togglePassword.addEventListener('click', function(e) {
        e.preventDefault();
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePassword.innerHTML = type === 'password' 
            ? '<i class="fas fa-eye"></i>' 
            : '<i class="fas fa-eye-slash"></i>';
    });

    // Exibir alerta
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

        // Auto-remover em 5 segundos se for sucesso
        if (type === 'success') {
            setTimeout(() => alertDiv.remove(), 5000);
        }
    }

    // Mostrar/ocultar loading
    function toggleLoading(show = true) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
        submitBtn.disabled = show;
    }

    // Limpar erros
    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
        document.querySelectorAll('.form-group input').forEach(el => el.classList.remove('input-error'));
    }

    // Mostrar erro em campo
    function showFieldError(fieldId, message) {
        const errorElement = document.getElementById(fieldId + 'Error');
        const inputElement = document.getElementById(fieldId);
        if (errorElement) {
            errorElement.textContent = message;
            inputElement.classList.add('input-error');
        }
    }

    // Validações
    async function validateForm() {
        clearErrors();

        const apartment = parseInt(document.getElementById('apartment').value.trim());
        const block = document.getElementById('block').value.trim().toUpperCase();
        const rawCondominiumId = document.getElementById('condominiumId').value.trim();
        const password = document.getElementById('condominiumPassword').value.trim();

        // Normalizar CEP para aceitar 04284070 e 04284-070
        const condominiumId = normalizeCep(rawCondominiumId);

        // Validação básica
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
            showFieldError('condominiumPassword', 'Senha do condomínio é obrigatória');
            return null;
        }

        return { apartment, block, condominiumId, password };
    }

    // Validar dados contra banco de dados
    async function validateAgainstDatabase(data) {
        try {
            // 1. Verificar se o condomínio existe (CEP = condominiumId)
            const condominiumResponse = await proxyFetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(data.condominiumId)}`
            );
            
            if (!condominiumResponse || condominiumResponse.length === 0) {
                showAlert('ID do condomínio não encontrado.', 'error');
                showFieldError('condominiumId', 'Condomínio não encontrado');
                return null;
            }

            const condominium = condominiumResponse[0];

            // 2. Verificar se a senha do condomínio é idêntica ao condominium_name
            if (data.password !== condominium.condominium_name) {
                showAlert('Senha do condomínio incorreta.', 'error');
                showFieldError('condominiumPassword', 'Senha incorreta');
                return null;
            }

            // 3. Verificar se o apartamento está no intervalo válido (1 a total_apartments)
            if (data.apartment < 1 || data.apartment > condominium.total_apartments) {
                showAlert(`Apartamento deve estar entre 1 e ${condominium.total_apartments}.`, 'error');
                showFieldError('apartment', `Inválido para este condomínio`);
                return null;
            }

            // 4. Verificar se o bloco existe no array block_names
            if (!condominium.block_names || !condominium.block_names.includes(data.block)) {
                showAlert(`Bloco "${data.block}" não existe neste condomínio.`, 'error');
                showFieldError('block', 'Bloco não encontrado');
                return null;
            }

            // 5. Verificar se o usuário está autenticado (já feito no checkAuthAndRedirect)
            // 6. Verificar se o usuário possui cadastro válido
            const userResponse = await fetchUserByEmail(currentUser.email);
            
            if (!userResponse) {
                showAlert('Usuário não encontrado no banco de dados.', 'error');
                return null;
            }

            return condominium;
        } catch (error) {
            console.error('Erro na validação:', error);
            showAlert('Erro ao validar dados: ' + error.message, 'error');
            return null;
        }
    }

    // Salvar vinculação do usuário ao condomínio
    async function saveToDatabaseAndUpdate(data, condominium) {
        try {
            // Salvar na tabela user_condominiums
            const userCondominiumPayload = {
                user_email: currentUser.email,
                condominium_id: data.condominiumId,
                apartment: data.apartment,
                block: data.block
            };

            const insertResponse = await proxyFetch('/api/user_condominiums', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userCondominiumPayload)
            });

            if (!insertResponse) {
                throw new Error('Erro ao salvar vinculação');
            }

            // Atualizar campo condominium da tabela users
            const condominiumData = {
                condominium_id: data.condominiumId,
                apartment: data.apartment,
                block: data.block
            };

            const userResponse = await fetchUserByEmail(currentUser.email);
            if (userResponse) {
                const updatedCondominium = userResponse.condominium || {};
                Object.assign(updatedCondominium, condominiumData);

                await proxyFetch(`/api/users?email=${encodeURIComponent(currentUser.email)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ condominium: updatedCondominium })
                });
            }

            return true;
        } catch (error) {
            console.error('Erro ao salvar vinculação:', error);
            showAlert('Erro ao salvar vinculação: ' + error.message, 'error');
            return false;
        }
    }

    // Submissão do formulário
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        try {
            toggleLoading(true);
            clearErrors();

            // 1. Validar formulário localmente
            const formData = await validateForm();
            if (!formData) {
                toggleLoading(false);
                return;
            }

            // 2. Validar contra banco de dados
            const condominium = await validateAgainstDatabase(formData);
            if (!condominium) {
                toggleLoading(false);
                return;
            }

            // 3. Salvar no banco de dados
            const savedSuccessfully = await saveToDatabaseAndUpdate(formData, condominium);
            if (!savedSuccessfully) {
                toggleLoading(false);
                return;
            }

            // 4. Atualizar sessionStorage do usuário
            currentUser.condominium = {
                condominium_id: formData.condominiumId,
                apartment: formData.apartment,
                block: formData.block,
                name: condominium.condominium_name
            };
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));

            // 5. Exibir sucesso e redirecionar
            showAlert('Condomínio vinculado com sucesso!', 'success');

            setTimeout(() => {
                window.location.href = 'index-morador.html';
            }, 1000);

        } catch (error) {
            console.error('Erro no envio do formulário:', error);
            showAlert('Erro ao processar sua solicitação: ' + error.message, 'error');
            toggleLoading(false);
        }
    });

    // Verificar autenticação ao carregar
    checkAuthAndRedirect();
});
