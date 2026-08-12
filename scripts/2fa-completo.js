(async function () {
    async function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            if (window.supabase?.auth) {
                const { data } = await window.supabase.auth.getSession();
                if (data?.session?.user?.email) {
                    if (typeof window.resumeCondomitSession === 'function') {
                        await window.resumeCondomitSession({ redirect: true });
                        return;
                    }
                }
            }
        } catch (_) {}
        await wait(100);
    }

    window.location.replace('entrar.html');
})();
