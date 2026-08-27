(async function () {
    'use strict';

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function normalizeType(value) {
        const raw = String(value || '').trim().toLowerCase();
        return raw === 'síndico' ? 'sindico' : raw;
    }

    function destinationFor(type) {
        switch (normalizeType(type)) {
            case 'sindico':
                return 'index.html';
            case 'morador':
                return 'index-morador.html';
            case 'porteiro':
                return 'index-porteiro.html';
            default:
                return 'entrar.html';
        }
    }

    async function resolveUserType(session) {
        const storedType = normalizeType(
            sessionStorage.getItem('condomitVerifiedTwoFactorUserType')
        );
        if (storedType) return storedType;

        try {
            if (typeof window.resumeCondomitSession === 'function') {
                const resumed = await window.resumeCondomitSession({ redirect: false });
                const resumedType = normalizeType(
                    resumed?.user?.user_type || resumed?.user?.type
                );
                if (resumedType) return resumedType;
            }
        } catch (error) {
            console.warn(
                '[2FA] Não foi possível restaurar os dados completos da sessão:',
                error?.message || error
            );
        }

        try {
            const rawUser = sessionStorage.getItem('condominiumUser');
            const user = rawUser ? JSON.parse(rawUser) : null;
            const localType = normalizeType(user?.user_type || user?.type);
            if (localType) return localType;
        } catch (_) {}

        try {
            if (typeof window.fetchUserByEmail === 'function' && session?.user?.email) {
                const profile = await window.fetchUserByEmail(session.user.email);
                const profileType = normalizeType(profile?.user_type || profile?.type);
                if (profileType) return profileType;
            }
        } catch (error) {
            console.warn(
                '[2FA] Não foi possível consultar o tipo do usuário:',
                error?.message || error
            );
        }

        return '';
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            if (window.supabase?.auth) {
                const { data, error } = await window.supabase.auth.getSession();
                const session = data?.session || null;

                if (!error && session?.user?.email) {
                    /*
                     * Recria condominiumUser e demais dados locais antes de
                     * abrir o dashboard. Usamos redirect:false porque o
                     * destino desta etapa deve ser exclusivamente definido
                     * pelo tipo da conta após a validação do 2FA.
                     */
                    try {
                        if (typeof window.resumeCondomitSession === 'function') {
                            await window.resumeCondomitSession({ redirect: false });
                        }
                    } catch (_) {}

                    const userType = await resolveUserType(session);
                    const destination = destinationFor(userType);

                    sessionStorage.removeItem('condomitVerifiedTwoFactorUserType');
                    sessionStorage.removeItem('condomitPendingTwoFactorLogin');

                    window.location.replace(destination);
                    return;
                }
            }
        } catch (error) {
            console.warn(
                '[2FA] Aguardando a sessão segura ser concluída:',
                error?.message || error
            );
        }

        await wait(100);
    }

    sessionStorage.removeItem('condomitVerifiedTwoFactorUserType');
    window.location.replace('entrar.html');
})();
