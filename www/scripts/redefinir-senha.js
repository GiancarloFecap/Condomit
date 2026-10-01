let isResetSessionValid = false;
let resetToken = '';
let resetMode = 'token';

/*
 * Modos possíveis:
 *
 * authenticated
 *   Usuário entrou em Configurações e quer mudar a senha.
 *
 * supabase-recovery
 *   Usuário chegou pelo fluxo oficial de recuperação do Supabase.
 *
 * token
 *   Usuário chegou pelo token customizado do seu backend/Brevo.
 */

document.addEventListener(
    'DOMContentLoaded',
    async () => {
        setupResetPasswordEvents();

        try {
            await checkResetToken();
        } catch (error) {
            console.error(
                '[RESET PASSWORD] Erro ao inicializar:',
                error
            );

            showInvalidLink();
        }

        validatePassword();
    }
);


/* ============================================================
   EVENTOS
============================================================ */

function setupResetPasswordEvents() {
    const toggleNewPassword =
        document.getElementById(
            'toggleNewPassword'
        );

    const toggleConfirmPassword =
        document.getElementById(
            'toggleConfirmPassword'
        );

    const newPassword =
        document.getElementById(
            'newPassword'
        );

    const confirmPassword =
        document.getElementById(
            'confirmPassword'
        );

    const form =
        document.getElementById(
            'resetPasswordForm'
        );

    if (toggleNewPassword) {
        toggleNewPassword.addEventListener(
            'click',
            function () {
                togglePasswordVisibility(
                    'newPassword',
                    this
                );
            }
        );
    }

    if (toggleConfirmPassword) {
        toggleConfirmPassword.addEventListener(
            'click',
            function () {
                togglePasswordVisibility(
                    'confirmPassword',
                    this
                );
            }
        );
    }

    if (newPassword) {
        newPassword.addEventListener(
            'input',
            validatePassword
        );
    }

    if (confirmPassword) {
        confirmPassword.addEventListener(
            'input',
            validatePassword
        );
    }

    if (form) {
        form.addEventListener(
            'submit',
            handleResetPassword
        );
    }
}


/* ============================================================
   CLIENTE SUPABASE
============================================================ */

function getSupabaseAuth() {
    const auth =
        window.supabase?.auth;

    if (!auth) {
        return null;
    }

    return auth;
}


/* ============================================================
   INICIALIZAR SESSÃO DE RECUPERAÇÃO
============================================================ */

async function checkResetToken() {
    isResetSessionValid = false;

    const params =
        new URLSearchParams(
            window.location.search
        );

    const hashParams =
        new URLSearchParams(
            window.location.hash
                .replace(/^#/, '')
        );

    const source =
        params.get('source') || '';

    const code =
        params.get('code') || '';

    resetToken =
        params.get('token') || '';

    /*
     * ========================================================
     * CASO 1
     * Usuário veio das configurações.
     * ========================================================
     */
    if (
        source === 'configuracoes'
    ) {
        resetMode =
            'authenticated';

        const validSession =
            await validateAuthenticatedSession();

        if (!validSession) {
            showInvalidLink();

            return;
        }

        isResetSessionValid = true;

        showResetForm();

        return;
    }

    const auth =
        getSupabaseAuth();

    /*
     * ========================================================
     * CASO 2
     * PKCE do Supabase.
     *
     * URL:
     * redefinir-senha.html?code=...
     * ========================================================
     */
    if (
        code &&
        auth &&
        typeof auth.exchangeCodeForSession ===
            'function'
    ) {
        try {
            const {
                data,
                error
            } =
                await auth
                    .exchangeCodeForSession(
                        code
                    );

            if (error) {
                throw error;
            }

            if (
                data?.session &&
                data?.user
            ) {
                resetMode =
                    'supabase-recovery';

                isResetSessionValid =
                    true;

                cleanRecoveryUrl();

                showResetForm();

                return;
            }
        } catch (error) {
            console.error(
                '[RESET PASSWORD] Falha ao trocar code por sessão:',
                error
            );
        }
    }

    /*
     * ========================================================
     * CASO 3
     * Fluxo implicit do Supabase.
     *
     * Algumas URLs podem chegar com:
     *
     * #access_token=...
     * &refresh_token=...
     * &type=recovery
     * ========================================================
     */

    const accessToken =
        hashParams.get(
            'access_token'
        );

    const refreshToken =
        hashParams.get(
            'refresh_token'
        );

    const hashType =
        hashParams.get(
            'type'
        );

    if (
        auth &&
        accessToken &&
        refreshToken &&
        hashType === 'recovery' &&
        typeof auth.setSession ===
            'function'
    ) {
        try {
            const {
                data,
                error
            } =
                await auth.setSession({
                    access_token:
                        accessToken,

                    refresh_token:
                        refreshToken
                });

            if (error) {
                throw error;
            }

            if (
                data?.session &&
                data?.user
            ) {
                resetMode =
                    'supabase-recovery';

                isResetSessionValid =
                    true;

                cleanRecoveryUrl();

                showResetForm();

                return;
            }
        } catch (error) {
            console.error(
                '[RESET PASSWORD] Falha ao restaurar sessão recovery:',
                error
            );
        }
    }

    /*
     * ========================================================
     * CASO 4
     * O cliente Supabase pode já ter detectado
     * automaticamente a sessão da URL.
     * ========================================================
     */
    if (auth) {
        try {
            const {
                data,
                error
            } =
                await auth.getUser();

            if (
                !error &&
                data?.user
            ) {
                resetMode =
                    'supabase-recovery';

                isResetSessionValid =
                    true;

                showResetForm();

                return;
            }
        } catch (error) {
            console.warn(
                '[RESET PASSWORD] Nenhuma sessão recovery ativa:',
                error
            );
        }
    }

    /*
     * ========================================================
     * CASO 5
     * Token customizado enviado pelo seu backend/Brevo.
     * ========================================================
     */
    if (resetToken) {
        resetMode =
            'token';

        isResetSessionValid =
            true;

        showResetForm();

        return;
    }

    /*
     * Nenhuma forma válida de recuperação.
     */
    showInvalidLink();
}


/* ============================================================
   VALIDAR USUÁRIO AUTENTICADO
============================================================ */

async function validateAuthenticatedSession() {
    const auth =
        getSupabaseAuth();

    if (!auth) {
        console.error(
            '[RESET PASSWORD] Supabase Auth não foi carregado.'
        );

        return false;
    }

    try {
        /*
         * getUser() consulta o servidor do Supabase Auth
         * e confirma que o usuário realmente está autenticado.
         */
        const {
            data,
            error
        } =
            await auth.getUser();

        if (error) {
            console.error(
                '[RESET PASSWORD] Erro getUser:',
                error
            );

            return false;
        }

        if (!data?.user) {
            return false;
        }

        return true;
    } catch (error) {
        console.error(
            '[RESET PASSWORD] Erro ao validar sessão:',
            error
        );

        return false;
    }
}


/* ============================================================
   LIMPAR TOKEN DA URL
============================================================ */

function cleanRecoveryUrl() {
    try {
        const cleanUrl =
            `${window.location.pathname}`;

        window.history.replaceState(
            {},
            document.title,
            cleanUrl
        );
    } catch (_) {
        /*
         * Não é crítico.
         */
    }
}


/* ============================================================
   INTERFACE
============================================================ */

function showResetForm() {
    const invalid =
        document.getElementById(
            'invalidLinkMessage'
        );

    const success =
        document.getElementById(
            'successMessage'
        );

    const form =
        document.getElementById(
            'resetPasswordForm'
        );

    const error =
        document.getElementById(
            'errorMessage'
        );

    if (invalid) {
        invalid.style.display =
            'none';
    }

    if (success) {
        success.style.display =
            'none';
    }

    if (error) {
        error.style.display =
            'none';
    }

    if (form) {
        form.style.display =
            'flex';
    }
}


function showInvalidLink() {
    isResetSessionValid =
        false;

    const invalid =
        document.getElementById(
            'invalidLinkMessage'
        );

    const success =
        document.getElementById(
            'successMessage'
        );

    const form =
        document.getElementById(
            'resetPasswordForm'
        );

    if (invalid) {
        invalid.style.display =
            'block';
    }

    if (success) {
        success.style.display =
            'none';
    }

    if (form) {
        form.style.display =
            'none';
    }
}


/* ============================================================
   MOSTRAR / ESCONDER SENHA
============================================================ */

function togglePasswordVisibility(
    inputId,
    button
) {
    const input =
        document.getElementById(
            inputId
        );

    if (!input || !button) {
        return;
    }

    const icon =
        button.querySelector('i');

    if (
        input.type ===
        'password'
    ) {
        input.type =
            'text';

        if (icon) {
            icon.classList.remove(
                'fa-eye'
            );

            icon.classList.add(
                'fa-eye-slash'
            );
        }

        return;
    }

    input.type =
        'password';

    if (icon) {
        icon.classList.remove(
            'fa-eye-slash'
        );

        icon.classList.add(
            'fa-eye'
        );
    }
}


/* ============================================================
   VALIDAR SENHA
============================================================ */

function validatePassword() {
    const newPasswordInput =
        document.getElementById(
            'newPassword'
        );

    const confirmPasswordInput =
        document.getElementById(
            'confirmPassword'
        );

    const submitBtn =
        document.getElementById(
            'submitBtn'
        );

    if (
        !newPasswordInput ||
        !confirmPasswordInput
    ) {
        return false;
    }

    const newPassword =
        newPasswordInput.value;

    const confirmPassword =
        confirmPasswordInput.value;

    const requirements = {
        length:
            newPassword.length >= 8,

        uppercase:
            /[A-Z]/.test(
                newPassword
            ),

        lowercase:
            /[a-z]/.test(
                newPassword
            ),

        number:
            /[0-9]/.test(
                newPassword
            ),

        special:
            /[!@#$%^&*]/.test(
                newPassword
            ),

        match:
            newPassword ===
                confirmPassword &&
            confirmPassword.length > 0
    };

    Object.keys(
        requirements
    ).forEach(
        (key) => {
            const el =
                document.getElementById(
                    `req-${key}`
                );

            if (!el) {
                return;
            }

            const icon =
                el.querySelector('i');

            if (
                requirements[key]
            ) {
                el.classList.add(
                    'valid'
                );

                if (icon) {
                    icon.classList.remove(
                        'fa-times'
                    );

                    icon.classList.add(
                        'fa-check'
                    );
                }
            } else {
                el.classList.remove(
                    'valid'
                );

                if (icon) {
                    icon.classList.remove(
                        'fa-check'
                    );

                    icon.classList.add(
                        'fa-times'
                    );
                }
            }
        }
    );

    const isValid =
        Object.values(
            requirements
        ).every(Boolean);

    if (submitBtn) {
        submitBtn.disabled =
            !isValid;
    }

    return isValid;
}


/* ============================================================
   ALTERAR SENHA NO SUPABASE AUTH
============================================================ */

async function updateSupabaseAuthPassword(
    newPassword
) {
    const auth =
        getSupabaseAuth();

    if (!auth) {
        throw new Error(
            'Supabase Auth não está disponível nesta página.'
        );
    }

    /*
     * Confirma primeiro que realmente há
     * uma sessão autenticada.
     */
    const {
        data: userData,
        error: userError
    } =
        await auth.getUser();

    if (userError) {
        console.error(
            '[RESET PASSWORD] getUser falhou:',
            userError
        );

        throw new Error(
            'Sua sessão de redefinição expirou. Solicite um novo link.'
        );
    }

    if (!userData?.user) {
        throw new Error(
            'Sua sessão de redefinição não é válida.'
        );
    }

    /*
     * AQUI está a correção principal.
     *
     * A senha é atualizada no Supabase Auth,
     * que é exatamente onde signInWithPassword()
     * procura a senha.
     */
    const {
        data,
        error
    } =
        await auth.updateUser({
            password:
                newPassword
        });

    if (error) {
        console.error(
            '[RESET PASSWORD] updateUser falhou:',
            {
                message:
                    error.message,

                code:
                    error.code,

                status:
                    error.status
            }
        );

        throw normalizeSupabasePasswordError(
            error
        );
    }

    if (!data?.user) {
        throw new Error(
            'O Supabase não confirmou a alteração da senha.'
        );
    }

    return data.user;
}


/* ============================================================
   TOKEN CUSTOMIZADO
============================================================ */

async function updatePasswordWithCustomToken(
    newPassword
) {
    if (!resetToken) {
        throw new Error(
            'Token de redefinição não encontrado.'
        );
    }

    const response =
        await fetch(
            '/api/reset-password',
            {
                method:
                    'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body:
                    JSON.stringify({
                        token:
                            resetToken,

                        password:
                            newPassword
                    })
            }
        );

    const text =
        await response.text();

    let data = {};

    try {
        data =
            text
                ? JSON.parse(
                    text
                )
                : {};
    } catch (_) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data?.error ||
            data?.message ||
            `Erro HTTP ${response.status} ao redefinir senha.`
        );
    }

    /*
     * Exige confirmação explícita do backend.
     *
     * Compatível também com endpoints antigos
     * que simplesmente retornavam status 200.
     */
    if (
        data?.success === false
    ) {
        throw new Error(
            data?.error ||
            'O servidor não confirmou a alteração da senha.'
        );
    }

    return data;
}


/* ============================================================
   ERROS DO SUPABASE
============================================================ */

function normalizeSupabasePasswordError(
    error
) {
    const message =
        String(
            error?.message ||
            ''
        );

    const lower =
        message.toLowerCase();

    if (
        lower.includes(
            'same password'
        ) ||
        lower.includes(
            'different from the old password'
        )
    ) {
        return new Error(
            'A nova senha deve ser diferente da senha atual.'
        );
    }

    if (
        lower.includes(
            'password should be'
        ) ||
        lower.includes(
            'weak password'
        )
    ) {
        return new Error(
            'A senha não atende aos requisitos de segurança.'
        );
    }

    if (
        lower.includes(
            'session'
        ) ||
        Number(
            error?.status
        ) === 401
    ) {
        return new Error(
            'Sua sessão expirou. Solicite um novo link de redefinição.'
        );
    }

    return new Error(
        message ||
        'Não foi possível atualizar a senha no Supabase Auth.'
    );
}


/* ============================================================
   SUBMIT
============================================================ */

async function handleResetPassword(
    event
) {
    event.preventDefault();

    if (!isResetSessionValid) {
        showError(
            'Link de redefinição inválido. Solicite um novo e-mail.'
        );

        return;
    }

    if (
        resetMode === 'token' &&
        !resetToken
    ) {
        showError(
            'Link de redefinição inválido. Solicite um novo e-mail.'
        );

        return;
    }

    const newPasswordInput =
        document.getElementById(
            'newPassword'
        );

    const confirmPasswordInput =
        document.getElementById(
            'confirmPassword'
        );

    const submitBtn =
        document.getElementById(
            'submitBtn'
        );

    if (
        !newPasswordInput ||
        !confirmPasswordInput ||
        !submitBtn
    ) {
        showError(
            'Não foi possível carregar o formulário de redefinição.'
        );

        return;
    }

    const newPassword =
        newPasswordInput.value;

    const confirmPassword =
        confirmPasswordInput.value;

    if (
        newPassword !==
        confirmPassword
    ) {
        showError(
            'As senhas não coincidem.'
        );

        return;
    }

    if (!validatePassword()) {
        showError(
            'Por favor, preencha todos os requisitos da senha.'
        );

        return;
    }

    submitBtn.disabled =
        true;

    const originalButtonHtml =
        submitBtn.innerHTML;

    submitBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

    try {
        /*
         * =====================================================
         * CONFIGURAÇÕES
         * =====================================================
         */
        if (
            resetMode ===
            'authenticated'
        ) {
            await updateSupabaseAuthPassword(
                newPassword
            );
        }

        /*
         * =====================================================
         * LINK OFICIAL DO SUPABASE
         * =====================================================
         */
        else if (
            resetMode ===
            'supabase-recovery'
        ) {
            await updateSupabaseAuthPassword(
                newPassword
            );
        }

        /*
         * =====================================================
         * TOKEN CUSTOMIZADO / BREVO
         * =====================================================
         */
        else if (
            resetMode ===
            'token'
        ) {
            await updatePasswordWithCustomToken(
                newPassword
            );
        }

        else {
            throw new Error(
                'Modo de redefinição de senha inválido.'
            );
        }

        /*
         * Não faça:
         *
         * updateUserByEmail(email, {
         *     password: newPassword
         * });
         *
         * A senha usada para login pertence
         * ao Supabase Auth.
         */

        const errorMessage =
            document.getElementById(
                'errorMessage'
            );

        const form =
            document.getElementById(
                'resetPasswordForm'
            );

        const successMessage =
            document.getElementById(
                'successMessage'
            );

        if (errorMessage) {
            errorMessage.style.display =
                'none';
        }

        if (form) {
            form.style.display =
                'none';
        }

        if (successMessage) {
            successMessage.style.display =
                'block';
        }

        /*
         * Se a alteração aconteceu através
         * de uma sessão recovery, encerra essa
         * sessão antes de voltar ao login.
         */
        if (
            resetMode ===
                'supabase-recovery' &&
            window.supabase?.auth
        ) {
            try {
                await window.supabase
                    .auth
                    .signOut({
                        scope:
                            'local'
                    });
            } catch (error) {
                console.warn(
                    '[RESET PASSWORD] Não foi possível encerrar sessão recovery:',
                    error
                );
            }
        }

        /*
         * Limpa dados antigos da aplicação.
         */
        try {
            sessionStorage.removeItem(
                'sb-access-token'
            );

            sessionStorage.removeItem(
                'sb-session'
            );
        } catch (_) {}

        setTimeout(
            () => {
                window.location.href =
                    'entrar.html';
            },
            3000
        );

    } catch (error) {
        console.error(
            '[RESET PASSWORD] Erro ao redefinir senha:',
            error
        );

        showError(
            error?.message ||
            'Erro ao redefinir senha. Por favor, tente novamente.'
        );

        submitBtn.disabled =
            false;

        submitBtn.innerHTML =
            originalButtonHtml ||
            'Atualizar Senha';
    }
}


/* ============================================================
   ERRO NA INTERFACE
============================================================ */

function showError(
    message
) {
    const errorEl =
        document.getElementById(
            'errorMessage'
        );

    if (!errorEl) {
        console.error(
            '[RESET PASSWORD]',
            message
        );

        return;
    }

    errorEl.textContent =
        message;

    errorEl.style.display =
        'block';
}


/* ============================================================
   USUÁRIO LOCAL
   Mantido para compatibilidade com outras páginas.
============================================================ */

function getAuthenticatedUser() {
    try {
        const rawUser =
            sessionStorage.getItem(
                'condominiumUser'
            );

        return rawUser
            ? JSON.parse(
                rawUser
            )
            : null;
    } catch (_) {
        return null;
    }
}