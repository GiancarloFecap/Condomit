(() => {
    const CATEGORY_IMAGES = {
        moveis: '../assets/logo-icon.png',
        eletrodomesticos: '../assets/logo-icon.png',
        esportes: '../assets/logo-icon.png',
        infantil: '../assets/logo-icon.png',
        livros: '../assets/logo-icon.png',
        eletronicos: '../assets/logo-icon.png',
        outros: '../assets/logo-icon.png'
    };

    const MARKETPLACE_CATEGORY_MAP = {
        moveis: 'Móveis',
        eletrodomesticos: 'Eletrodomésticos',
        eletronicos: 'Eletrônicos',
        infantil: 'Infantil',
        esportes: 'Esportes',
        livros: 'Livros',
        outros: 'Outros'
    };

    /*
     * Cache usado pelas funções síncronas de notificações.
     */
    let notificationCache = [];
    let wallNoticeCache = [];

    /* =========================================================
       USUÁRIO / STORAGE
    ========================================================= */

    function parseStoredObject(raw) {
        if (!raw) {
            return null;
        }

        if (
            typeof raw ===
            'object'
        ) {
            return raw;
        }

        try {
            return JSON.parse(
                raw
            );
        } catch (_) {
            return null;
        }
    }

    function getCurrentUser() {
        const candidates = [];

        try {
            candidates.push(
                sessionStorage.getItem(
                    'condominiumUser'
                )
            );
        } catch (_) {}

        try {
            candidates.push(
                localStorage.getItem(
                    'condominiumUser'
                )
            );

            candidates.push(
                localStorage.getItem(
                    'condominiumPersistentUser'
                )
            );
        } catch (_) {}

        for (
            const raw of candidates
        ) {
            const parsed =
                parseStoredObject(
                    raw
                );

            if (
                parsed &&
                typeof parsed ===
                    'object'
            ) {
                return parsed;
            }
        }

        return null;
    }

    function parseUserCondominium(
        user = getCurrentUser()
    ) {
        const raw =
            user?.condominium;

        if (!raw) {
            return {};
        }

        if (
            typeof raw ===
            'object'
        ) {
            return raw;
        }

        if (
            typeof raw ===
            'string'
        ) {
            try {
                const parsed =
                    JSON.parse(
                        raw
                    );

                return (
                    parsed &&
                    typeof parsed ===
                        'object'
                        ? parsed
                        : {}
                );
            } catch (_) {
                return {};
            }
        }

        return {};
    }

    function getUserType(
        user = getCurrentUser()
    ) {
        if (!user) {
            return 'morador';
        }

        const type =
            String(
                user.type ||
                user.user_type ||
                'morador'
            )
                .trim()
                .toLowerCase();

        if (
            type.startsWith(
                'sind'
            )
        ) {
            return 'sindico';
        }

        if (
            type.startsWith(
                'porteir'
            )
        ) {
            return 'porteiro';
        }

        return 'morador';
    }

    function getUserTypeLabel(
        user = getCurrentUser()
    ) {
        const type =
            getUserType(user);

        if (
            type === 'sindico'
        ) {
            return 'Síndico';
        }

        if (
            type === 'porteiro'
        ) {
            return 'Porteiro';
        }

        return 'Morador';
    }

    function getInitials(
        name
    ) {
        return (
            String(
                name || 'Usuário'
            )
                .split(' ')
                .filter(Boolean)
                .map(
                    (part) =>
                        part[0]
                )
                .join('')
                .toUpperCase()
                .slice(0, 2) ||
            'US'
        );
    }

    /* =========================================================
       CEP / CONDOMÍNIO
    ========================================================= */

    function normalizeCepDigits(
        value
    ) {
        const digits =
            String(
                value || ''
            ).replace(
                /\D/g,
                ''
            );

        return (
            digits.length === 8
                ? digits
                : ''
        );
    }

    function normalizeCepForDb(
        value
    ) {
        const digits =
            normalizeCepDigits(
                value
            );

        /*
         * Não devolver texto qualquer
         * quando não for CEP.
         */
        if (!digits) {
            return '';
        }

        return (
            `${digits.slice(0, 5)}-` +
            `${digits.slice(5)}`
        );
    }

    function getUserCepForDb(
        user = getCurrentUser()
    ) {
        const condominium =
            parseUserCondominium(
                user
            );

        const candidates = [
            condominium?.cep,
            condominium
                ?.condominium_cep,
            condominium
                ?.condominium_id,
            condominium
                ?.condominiumId,

            user?.cep,
            user?.condominium_cep,
            user?.condominium_id,
            user?.condominiumId
        ];

        for (
            const candidate of
            candidates
        ) {
            const normalized =
                normalizeCepForDb(
                    candidate
                );

            if (normalized) {
                return normalized;
            }
        }

        return '';
    }

    async function resolveUserCepForDb(
        user = getCurrentUser()
    ) {
        /*
         * Primeiro procura no objeto
         * já salvo no navegador.
         */
        const localCep =
            getUserCepForDb(
                user
            );

        if (localCep) {
            return localCep;
        }

        /*
         * Depois utiliza o helper
         * corrigido do supabase-client.js.
         */
        if (
            typeof window
                .resolveUserCondominiumCep ===
            'function'
        ) {
            try {
                const resolved =
                    await window
                        .resolveUserCondominiumCep(
                            user
                        );

                const normalized =
                    normalizeCepForDb(
                        resolved
                    );

                if (normalized) {
                    return normalized;
                }
            } catch (error) {
                console.warn(
                    'Não foi possível resolver o CEP pelo supabase-client:',
                    error?.message ||
                    error
                );
            }
        }

        /*
         * Última tentativa:
         * user_condominiums.
         */
        const email =
            String(
                user?.email || ''
            )
                .trim()
                .toLowerCase();

        if (
            email &&
            typeof window
                .supabaseFetch ===
                'function'
        ) {
            try {
                const rows =
                    await window
                        .supabaseFetch(
                            `/user_condominiums?select=condominium_id&user_email=eq.${encodeURIComponent(
                                email
                            )}&limit=1`
                        );

                const row =
                    Array.isArray(
                        rows
                    )
                        ? rows[0]
                        : rows;

                const normalized =
                    normalizeCepForDb(
                        row
                            ?.condominium_id
                    );

                if (normalized) {
                    return normalized;
                }
            } catch (error) {
                console.warn(
                    'Não foi possível buscar o CEP em user_condominiums:',
                    error?.message ||
                    error
                );
            }
        }

        return '';
    }

    function getCondominiumKey(
        user = getCurrentUser()
    ) {
        const cep =
            getUserCepForDb(
                user
            );

        if (cep) {
            return cep;
        }

        /*
         * E-mail só é utilizado para
         * chave de localStorage.
         *
         * Nunca é usado como CEP do banco.
         */
        return (
            String(
                user?.email ||
                'geral'
            )
                .trim()
                .toLowerCase() ||
            'geral'
        );
    }

    function getCondominiumName(
        user = getCurrentUser()
    ) {
        const condominium =
            parseUserCondominium(
                user
            );

        const name =
            condominium?.name ||
            condominium
                ?.condominium_name ||
            'Seu Condomínio';

        return String(name);
    }

    function formatCondoName(
        name
    ) {
        const words =
            String(
                name || ''
            )
                .split(' ')
                .filter(Boolean);

        if (
            words.length > 2
        ) {
            return (
                `${words
                    .slice(0, 2)
                    .join(' ')}<br>` +
                `${words
                    .slice(2)
                    .join(' ')}`
            );
        }

        return (
            words.join(' ') ||
            'Seu Condomínio'
        );
    }

    function getStorageJson(
        key,
        fallback
    ) {
        try {
            const raw =
                localStorage.getItem(
                    key
                );

            return raw
                ? JSON.parse(raw)
                : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function setStorageJson(
        key,
        value
    ) {
        try {
            localStorage.setItem(
                key,
                JSON.stringify(
                    value
                )
            );
        } catch (error) {
            console.warn(
                'Não foi possível salvar dados locais:',
                error?.message ||
                error
            );
        }
    }

    /* =========================================================
       NOTIFICAÇÕES
    ========================================================= */

    function getNotificationsKey(
        user
    ) {
        return (
            `condomit.notifications.` +
            `${getCondominiumKey(
                user
            )}`
        );
    }

    function getReadNotificationsKey(
        user
    ) {
        return (
            `condomit.notifications.read.` +
            `${getCondominiumKey(
                user
            )}.` +
            `${user?.email || 'anon'}`
        );
    }

    function getDefaultNotifications() {
        return [];
    }

    async function fetchNotificationsFromSupabase(
        user = getCurrentUser()
    ) {
        if (typeof window.supabaseFetch !== 'function') {
            return [];
        }

        try {
            const rows = await window.supabaseFetch(
                '/rpc/condomit_list_notifications',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                }
            );

            if (!Array.isArray(rows)) return [];

            return rows.map((row) => ({
                id: `db-notif-${row.id}`,
                dbId: row.id,
                category: row.category || 'Avisos',
                title: row.title || '',
                message: row.description || '',
                details: row.description || '',
                createdAt: row.created_at || new Date().toISOString(),
                author: row.created_by_name || row.created_by || 'Condomit',
                createdByType: 'sindico',
                eventType: row.event_type || null,
                relatedNoticeId: row.related_notice_id || null,
                actorRole: String(row.actor_role || '').trim().toLowerCase(),
                read: Boolean(row.is_read),
                metadata: null
            }));
        } catch (error) {
            console.error('Não foi possível carregar as notificações do Supabase:', error);
            return [];
        }
    }

    async function getNotifications(
        user = getCurrentUser()
    ) {
        const key =
            getNotificationsKey(
                user
            );

        /*
         * Não apague notificações locais ao carregar a página.
         * Elas pertencem ao condomínio e devem continuar disponíveis
         * mesmo após logout/login. Os registros do Supabase continuam
         * sendo mesclados normalmente abaixo.
         */
        let localItems =
            getStorageJson(
                key,
                null
            );

        if (
            !Array.isArray(
                localItems
            )
        ) {
            localItems = [];
        }

        const remoteItems =
            await fetchNotificationsFromSupabase(
                user
            );

        const localReadIds = new Set(getReadNotifications(user).map(String));
        const serverReadIds = remoteItems.filter((item) => item.read).map((item) => String(item.id));
        if (serverReadIds.length) {
            const mergedRead = new Set(localReadIds);
            serverReadIds.forEach((id) => mergedRead.add(id));
            setStorageJson(getReadNotificationsKey(user), Array.from(mergedRead));
        }
        // Migra o histórico local das versões anteriores para o banco. Assim,
        // uma notificação já lida não volta a aparecer como não lida em outro dispositivo.
        if (typeof window.supabaseFetch === 'function') {
            remoteItems.forEach((item) => {
                if (item.read || !localReadIds.has(String(item.id))) return;
                const dbId = Number(item.dbId || String(item.id || '').replace('db-notif-', ''));
                if (!Number.isInteger(dbId) || dbId <= 0) return;
                item.read = true;
                window.supabaseFetch('/rpc/condomit_mark_notification_read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target_notification_id: dbId })
                }).catch(() => {});
            });
        }

        const seen =
            new Set();

        const merged = [];

        for (
            const item of [
                ...remoteItems,
                ...localItems
            ]
        ) {
            const keyItem =
                `${String(
                    item.title || ''
                )
                    .trim()
                    .toLowerCase()}|` +
                `${String(
                    item.message || ''
                )
                    .trim()
                    .toLowerCase()}|` +
                `${String(
                    new Date(
                        item.createdAt ||
                        0
                    ).getTime()
                )}`;

            if (
                seen.has(
                    keyItem
                )
            ) {
                continue;
            }

            seen.add(
                keyItem
            );

            merged.push(
                item
            );
        }

        notificationCache =
            merged
                .slice()
                .sort(
                    (a, b) =>
                        new Date(
                            b.createdAt
                        ).getTime() -
                        new Date(
                            a.createdAt
                        ).getTime()
                );

        return notificationCache;
    }

    function clearAllNotifications(
        user = getCurrentUser()
    ) {
        /*
         * 016: os avisos do mural são históricos do condomínio.
         * Marcar como lido não deve removê-los e nenhum logout/troca
         * de página pode limpar o feed.
         */
        console.warn(
            '[NOTIFICAÇÕES] A limpeza automática do mural foi desativada para preservar o histórico.'
        );

        return false;
    }

    async function saveNotificationToSupabase(
        data,
        user = getCurrentUser()
    ) {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase não está disponível para salvar a notificação.');
        }

        const payload = {
            target_category: data.category || 'Avisos',
            target_title: String(data.title || '').trim(),
            target_description: String(data.details || data.message || '').trim()
        };

        const result = await window.supabaseFetch(
            '/rpc/condomit_create_notification',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved || !saved.id) {
            throw new Error('O Supabase não confirmou o salvamento da notificação.');
        }
        return saved;
    }

    async function createNotification(
        data,
        user = getCurrentUser()
    ) {
        const saved = await saveNotificationToSupabase(data, user);
        const key = getNotificationsKey(user);
        let localItems = getStorageJson(key, null);
        if (!Array.isArray(localItems)) localItems = [];

        const notification = {
            id: `db-notif-${saved.id}`,
            category: saved.category || data.category || 'Avisos',
            title: saved.title || String(data.title || '').trim(),
            message: saved.description || String(data.message || '').trim(),
            details: saved.description || String(data.details || data.message || '').trim(),
            createdAt: saved.created_at || new Date().toISOString(),
            author: saved.created_by_name || user?.name || 'Síndico',
            createdByType: 'sindico',
            metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : null
        };

        // Mantém uma cópia local para leitura offline, mas o banco é a fonte de verdade.
        localItems = localItems.filter((item) => item.id !== notification.id);
        localItems.unshift(notification);
        setStorageJson(key, localItems);
        notificationCache = notificationCache.filter((item) => item.id !== notification.id);
        notificationCache.unshift(notification);
        return notification;
    }

    function createAssemblyNotification(
        assembly,
        user = getCurrentUser()
    ) {
        if (!assembly) {
            return null;
        }

        const dateLabel =
            formatDate(
                assembly.date ||
                new Date()
                    .toISOString()
            );

        const startTime =
            String(
                assembly.start_time ||
                assembly.time ||
                '--:--'
            ).slice(
                0,
                5
            );

        const endTime =
            String(
                assembly.end_time ||
                assembly.start_time ||
                assembly.time ||
                ''
            ).slice(
                0,
                5
            );

        const timeLabel =
            (
                endTime &&
                endTime !==
                    startTime
            )
                ? `${startTime} às ${endTime}`
                : startTime;

        return createNotification(
            {
                category:
                    'Assembleias',

                title:
                    assembly.title ||
                    'Nova assembleia agendada',

                message:
                    `Uma assembleia foi agendada para ${dateLabel} às ${timeLabel}.`,

                details:
                    `A assembleia "${assembly.title || 'Sem título'}" ` +
                    `foi agendada para ${dateLabel} às ${timeLabel}. ` +
                    'Acesse a área de assembleias para revisar os detalhes e preparar sua entrada.',

                metadata: {
                    assemblyId:
                        assembly.id ||
                        null,

                    date:
                        assembly.date ||
                        null,

                    startTime:
                        assembly.start_time ||
                        assembly.time ||
                        null,

                    endTime:
                        assembly.end_time ||
                        null,

                    createdBy:
                        assembly.created_by ||
                        user?.email ||
                        null
                }
            },
            user
        );
    }

    function getReadNotifications(
        user = getCurrentUser()
    ) {
        const read =
            getStorageJson(
                getReadNotificationsKey(
                    user
                ),
                []
            );

        return (
            Array.isArray(read)
                ? read
                : []
        );
    }

    function markNotificationAsRead(
        id,
        user = getCurrentUser()
    ) {
        const read = new Set(getReadNotifications(user).map(String));
        read.add(String(id));
        setStorageJson(getReadNotificationsKey(user), Array.from(read));

        const cached = notificationCache.find((item) => String(item.id) === String(id));
        if (cached) cached.read = true;

        const dbId = Number(cached?.dbId || String(id || '').replace('db-notif-', ''));
        if (Number.isInteger(dbId) && dbId > 0 && typeof window.supabaseFetch === 'function') {
            window.supabaseFetch('/rpc/condomit_mark_notification_read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_notification_id: dbId })
            }).catch((error) => console.warn('[Notificações] Falha ao persistir leitura:', error?.message || error));
        }
    }

    function markAllNotificationsAsRead(
        user = getCurrentUser()
    ) {
        const ids = notificationCache.map((notification) => String(notification.id));
        setStorageJson(getReadNotificationsKey(user), ids);
        notificationCache.forEach((notification) => { notification.read = true; });

        if (typeof window.supabaseFetch === 'function') {
            window.supabaseFetch('/rpc/condomit_mark_all_notifications_read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            }).catch((error) => console.warn('[Notificações] Falha ao persistir leitura em lote:', error?.message || error));
        }
    }

    function isNotificationRead(
        id,
        user = getCurrentUser()
    ) {
        const cached = notificationCache.find((item) => String(item.id) === String(id));
        if (cached?.read) return true;
        return getReadNotifications(user).map(String).includes(String(id));
    }

    function getNotificationById(
        id
    ) {
        return (
            notificationCache.find(
                (notification) =>
                    String(
                        notification.id
                    ) ===
                    String(id)
            ) ||
            null
        );
    }


    /* =========================================================
       MURAL DE AVISOS
    ========================================================= */

    async function fetchWallNoticesFromSupabase(
        user = getCurrentUser()
    ) {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase não está disponível para carregar o Mural de Avisos.');
        }

        const rows = await window.supabaseFetch(
            '/rpc/condomit_list_wall_notices',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            }
        );

        if (!Array.isArray(rows)) return [];

        return rows.map((row) => ({
            id: `wall-${row.id}`,
            dbId: row.id,
            category: row.category || 'Avisos',
            title: row.title || '',
            message: row.description || '',
            details: row.details || row.description || '',
            createdAt: row.created_at || new Date().toISOString(),
            author: row.created_by_name || row.created_by || 'Condomit',
            createdBy: row.created_by || null,
            source: row.source || 'manual'
        }));
    }

    async function getWallNotices(
        user = getCurrentUser()
    ) {
        wallNoticeCache = (await fetchWallNoticesFromSupabase(user))
            .slice()
            .sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
            );

        return wallNoticeCache;
    }

    async function createWallNotice(
        data,
        user = getCurrentUser()
    ) {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase não está disponível para publicar no Mural de Avisos.');
        }

        const payload = {
            target_category: data?.category || 'Avisos',
            target_title: String(data?.title || '').trim(),
            target_description: String(data?.message || data?.description || '').trim(),
            target_details: String(data?.details || data?.message || data?.description || '').trim(),
            target_source: String(data?.source || data?.metadata?.source || 'manual').trim() || 'manual'
        };

        const result = await window.supabaseFetch(
            '/rpc/condomit_create_wall_notice',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const saved = Array.isArray(result) ? result[0] : result;
        if (!saved || !saved.id) {
            throw new Error('O Supabase não confirmou a publicação no Mural de Avisos.');
        }

        const notice = {
            id: `wall-${saved.id}`,
            dbId: saved.id,
            category: saved.category || payload.target_category,
            title: saved.title || payload.target_title,
            message: saved.description || payload.target_description,
            details: saved.details || payload.target_details,
            createdAt: saved.created_at || new Date().toISOString(),
            author: saved.created_by_name || user?.name || 'Síndico',
            createdBy: saved.created_by || user?.email || null,
            source: saved.source || payload.target_source
        };

        wallNoticeCache = wallNoticeCache.filter((item) => item.dbId !== notice.dbId);
        wallNoticeCache.unshift(notice);

        // A trigger do banco cria automaticamente a notificação de mudança do mural.
        // Limpamos o cache de notificações para que a próxima abertura traga o evento novo.
        notificationCache = [];

        return notice;
    }

    function getWallNoticeById(id) {
        return wallNoticeCache.find((notice) =>
            String(notice.id) === String(id) ||
            String(notice.dbId) === String(id)
        ) || null;
    }

    /* =========================================================
       MARKETPLACE
    ========================================================= */

    function getMarketplaceKey(
        user
    ) {
        return (
            `condomit.marketplace.` +
            `${getCondominiumKey(
                user
            )}`
        );
    }

    function getFavoriteMarketplaceKey(
        user
    ) {
        return (
            `condomit.marketplace.favorite.` +
            `${getCondominiumKey(
                user
            )}.` +
            `${user?.email || 'anon'}`
        );
    }

    function normalizeMarketplaceCategoryKey(
        value
    ) {
        const normalized =
            String(
                value || ''
            )
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(
                    /[\u0300-\u036f]/g,
                    ''
                )
                .replace(
                    /[^a-z0-9]/g,
                    ''
                );

        const aliases = {
            moveis:
                'moveis',

            movel:
                'moveis',

            eletrodomesticos:
                'eletrodomesticos',

            eletrodomestico:
                'eletrodomesticos',

            eletronicos:
                'eletronicos',

            eletronico:
                'eletronicos',

            infantil:
                'infantil',

            esportes:
                'esportes',

            esporte:
                'esportes',

            livros:
                'livros',

            livro:
                'livros',

            outros:
                'outros',

            outro:
                'outros'
        };

        return (
            aliases[normalized] ||
            'outros'
        );
    }

    function categoryToDbCategory(
        categoryKey
    ) {
        const key =
            normalizeMarketplaceCategoryKey(
                categoryKey
            );

        return (
            MARKETPLACE_CATEGORY_MAP[
                key
            ] ||
            'Outros'
        );
    }

    function dbCategoryToCategoryLabel(
        dbCategory
    ) {
        const key =
            normalizeMarketplaceCategoryKey(
                dbCategory
            );

        return (
            MARKETPLACE_CATEGORY_MAP[
                key
            ] ||
            'Outros'
        );
    }

    function dbCategoryToCategoryKey(
        dbCategory
    ) {
        return (
            normalizeMarketplaceCategoryKey(
                dbCategory
            )
        );
    }

    function getDefaultMarketplaceItems() {
        return [];
    }

    async function ensureMarketplaceSession() {
        if (
            typeof window
                .supabaseFetch !==
            'function'
        ) {
            throw new Error(
                'Supabase não está disponível nesta página.'
            );
        }

        if (
            typeof window
                .resolveSupabaseAccessToken ===
            'function'
        ) {
            const accessToken =
                await window
                    .resolveSupabaseAccessToken();

            if (!accessToken) {
                throw new Error(
                    'Sua sessão expirou. Entre novamente antes de acessar o marketplace.'
                );
            }

            return accessToken;
        }

        return null;
    }

    function mapMarketplaceRowToItem(
        row
    ) {
        const categoryKey =
            dbCategoryToCategoryKey(
                row?.category
            );

        return {
            /*
             * Mantém prefixo para não
             * colidir com IDs locais antigos.
             */
            id:
                `db-mp-${row?.id}`,

            dbId:
                row?.id,

            title:
                String(
                    row?.title ||
                    ''
                ),

            description:
                String(
                    row?.description ||
                    ''
                ),

            /*
             * A interface utiliza:
             * moveis, eletronicos...
             *
             * O banco utiliza:
             * Móveis, Eletrônicos...
             */
            category:
                categoryKey,

            categoryLabel:
                dbCategoryToCategoryLabel(
                    row?.category
                ),

            price:
                Number(
                    row?.price ||
                    0
                ),

            seller:
                row?.user_name ||
                'Morador',

            sellerEmail:
                String(
                    row?.seller_email ||
                    ''
                )
                    .trim()
                    .toLowerCase(),

            sellerUnit:
                'Condomínio',

            createdAt:
                row?.created_at ||
                new Date()
                    .toISOString(),

            status:
                String(row?.item_status || 'disponivel'),

            expiresAt:
                row?.expires_at || null,

            image:
                row?.image_url ||
                CATEGORY_IMAGES[
                    categoryKey
                ] ||
                CATEGORY_IMAGES
                    .outros
        };
    }

    async function fetchMarketplaceFromSupabase(
        user = getCurrentUser()
    ) {
        await ensureMarketplaceSession();

        const cep =
            await resolveUserCepForDb(
                user
            );

        if (!cep) {
            throw new Error(
                'Não foi possível identificar o CEP do condomínio do usuário.'
            );
        }

        const rows =
            await window
                .supabaseFetch(
                    `/marketplace_items?select=*&cep=eq.${encodeURIComponent(
                        cep
                    )}&order=created_at.desc`
                );

        if (
            !Array.isArray(
                rows
            )
        ) {
            throw new Error(
                'O Supabase retornou uma resposta inválida ao carregar o marketplace.'
            );
        }

        return rows.map(
            mapMarketplaceRowToItem
        );
    }

    async function saveMarketplaceToSupabase(
        data,
        user = getCurrentUser()
    ) {
        await ensureMarketplaceSession();

        const cep =
            await resolveUserCepForDb(
                user
            );

        if (!cep) {
            throw new Error(
                'Não foi possível identificar o condomínio do usuário.'
            );
        }

        const title =
            String(
                data?.title ||
                ''
            ).trim();

        const description =
            String(
                data?.description ||
                ''
            ).trim();

        const price =
            Number(
                data?.price
            );

        const userName =
            String(
                user?.name ||
                user?.full_name ||
                'Morador'
            ).trim();

        /*
         * Sempre converte a categoria
         * da interface para uma categoria
         * permitida pelo CHECK do banco.
         */
        const categoryKey =
            normalizeMarketplaceCategoryKey(
                data?.category ||
                data?.categoryLabel
            );

        const dbCategory =
            categoryToDbCategory(
                categoryKey
            );

        const imageUrl =
            String(
                data?.image ||
                CATEGORY_IMAGES[
                    categoryKey
                ] ||
                CATEGORY_IMAGES
                    .outros
            ).trim();

        if (!title) {
            throw new Error(
                'Informe o título do anúncio.'
            );
        }

        if (!description) {
            throw new Error(
                'Informe a descrição do anúncio.'
            );
        }

        if (
            !Number.isFinite(
                price
            ) ||
            price < 0
        ) {
            throw new Error(
                'Informe um preço válido.'
            );
        }

        if (!userName) {
            throw new Error(
                'Não foi possível identificar o nome do usuário.'
            );
        }

        if (!imageUrl) {
            throw new Error(
                'Não foi possível definir a imagem do anúncio.'
            );
        }

        const sellerEmail =
            String(
                user?.email ||
                ''
            )
                .trim()
                .toLowerCase();

        if (!sellerEmail) {
            throw new Error(
                'Não foi possível identificar o e-mail do anunciante.'
            );
        }

        const payload = {
            cep,

            user_name:
                userName,

            seller_email:
                sellerEmail,

            title,

            category:
                dbCategory,

            price,

            description,

            image_url:
                imageUrl
        };

        let rows;

        try {
            rows =
                await window
                    .supabaseFetch(
                        '/marketplace_items',
                        {
                            method:
                                'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                Prefer:
                                    'return=representation'
                            },

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );
        } catch (error) {
            const message =
                String(
                    error?.message ||
                    error ||
                    ''
                );

            if (
                /row-level security|\brls\b|policy/i
                    .test(
                        message
                    )
            ) {
                throw new Error(
                    'O Supabase bloqueou a publicação pelas regras de segurança. ' +
                    'Verifique a sessão autenticada e a policy RLS de marketplace_items.'
                );
            }

            if (
                /foreign key|marketplace_items_cep_fkey/i
                    .test(
                        message
                    )
            ) {
                throw new Error(
                    'O CEP do usuário não corresponde a um condomínio cadastrado.'
                );
            }

            throw error;
        }

        /*
         * Prefer: return=representation
         * deve devolver a linha criada.
         */
        if (
            !Array.isArray(
                rows
            ) ||
            !rows.length ||
            !rows[0]?.id
        ) {
            throw new Error(
                'O Supabase não confirmou o salvamento do anúncio.'
            );
        }

        return rows[0];
    }


    async function updateMarketplaceItem(
        dbId,
        data,
        user = getCurrentUser()
    ) {
        await ensureMarketplaceSession();

        const id = Number(dbId);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error('Anúncio inválido para edição.');
        }

        const sellerEmail =
            String(user?.email || '')
                .trim()
                .toLowerCase();

        if (!sellerEmail) {
            throw new Error('Não foi possível identificar o anunciante.');
        }

        const title = String(data?.title || '').trim();
        const description = String(data?.description || '').trim();
        const price = Number(data?.price);
        const categoryKey = normalizeMarketplaceCategoryKey(
            data?.category || data?.categoryLabel
        );
        const imageUrl = String(
            data?.image ||
            CATEGORY_IMAGES[categoryKey] ||
            CATEGORY_IMAGES.outros
        ).trim();

        if (!title) throw new Error('Informe o título do anúncio.');
        if (!description) throw new Error('Informe a descrição do anúncio.');
        if (!Number.isFinite(price) || price < 0) {
            throw new Error('Informe um preço válido.');
        }

        const rows = await window.supabaseFetch(
            `/marketplace_items?id=eq.${encodeURIComponent(id)}&seller_email=eq.${encodeURIComponent(sellerEmail)}`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify({
                    title,
                    category: categoryToDbCategory(categoryKey),
                    price,
                    description,
                    image_url: imageUrl
                })
            }
        );

        const saved = Array.isArray(rows) ? rows[0] : rows;
        if (!saved?.id) {
            throw new Error(
                'O anúncio não foi atualizado. Confirme se ele pertence à sua conta.'
            );
        }

        return mapMarketplaceRowToItem(saved);
    }

    async function deleteMarketplaceItem(
        dbId,
        user = getCurrentUser()
    ) {
        await ensureMarketplaceSession();

        const id = Number(dbId);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error('Anúncio inválido para exclusão.');
        }

        const sellerEmail =
            String(user?.email || '')
                .trim()
                .toLowerCase();

        if (!sellerEmail) {
            throw new Error('Não foi possível identificar o anunciante.');
        }

        // 028: usa uma RPC que valida o proprietário no servidor. Isso evita
        // inconsistências de DELETE/RETURNING com RLS em instalações antigas.
        try {
            const result = await window.supabaseFetch(
                '/rpc/condomit_delete_marketplace_item',
                {
                    method: 'POST',
                    body: JSON.stringify({ target_item_id: id })
                }
            );

            if (result === true || result === 'true' || result?.deleted === true) {
                return true;
            }
        } catch (rpcError) {
            const msg = String(rpcError?.message || rpcError || '').toLowerCase();
            const missingRpc =
                msg.includes('condomit_delete_marketplace_item') ||
                msg.includes('schema cache') ||
                msg.includes('could not find the function') ||
                msg.includes('pgrst202');

            if (!missingRpc) {
                throw rpcError;
            }
        }

        const rows = await window.supabaseFetch(
            `/marketplace_items?id=eq.${encodeURIComponent(id)}&seller_email=eq.${encodeURIComponent(sellerEmail)}`,
            {
                method: 'DELETE',
                headers: {
                    Prefer: 'return=representation'
                }
            }
        );

        if (!Array.isArray(rows) || !rows.length) {
            throw new Error(
                'O anúncio não foi excluído. Confirme se ele pertence à sua conta e execute a migration 025.'
            );
        }

        return true;
    }

    async function getMarketplaceItems(
        user = getCurrentUser()
    ) {
        /*
         * IMPORTANTE:
         *
         * O Supabase agora é a fonte
         * de verdade do marketplace.
         *
         * Não misturamos mais anúncios
         * do banco com anúncios do
         * localStorage.
         *
         * Assim um item só aparece se
         * realmente existir no banco.
         */
        const remoteItems =
            await fetchMarketplaceFromSupabase(
                user
            );

        return (
            remoteItems
                .slice()
                .sort(
                    (a, b) =>
                        new Date(
                            b.createdAt
                        ).getTime() -
                        new Date(
                            a.createdAt
                        ).getTime()
                )
        );
    }

    async function createMarketplaceItem(
        data,
        user = getCurrentUser()
    ) {
        /*
         * Primeiro salva de verdade
         * no Supabase.
         */
        const saved =
            await saveMarketplaceToSupabase(
                data,
                user
            );

        /*
         * Sem ID do banco:
         * não considerar publicado.
         */
        if (
            !saved?.id
        ) {
            throw new Error(
                'O banco de dados não confirmou a criação do anúncio.'
            );
        }

        /*
         * Converte a linha retornada
         * pelo banco para o formato
         * usado pela interface.
         */
        const item =
            mapMarketplaceRowToItem(
                saved
            );

        /*
         * A tabela marketplace_items
         * não possui bloco/apartamento.
         *
         * Para o anúncio recém-criado
         * podemos mostrar a unidade
         * do usuário atual.
         */
        item.sellerUnit =
            buildUnitLabel(
                user
            );

        return item;
    }

    function buildUnitLabel(
        user = getCurrentUser()
    ) {
        if (!user) {
            return 'Condomínio';
        }

        if (
            getUserType(
                user
            ) === 'sindico'
        ) {
            return 'Administração';
        }

        const condominium =
            parseUserCondominium(
                user
            );

        const block =
            condominium?.block ||
            user?.block ||
            'Bloco A';

        const apartment =
            condominium?.apartment ||
            user?.apartment ||
            'Apto 000';

        return (
            `${block} - ${apartment}`
        );
    }

    /* =========================================================
       FAVORITOS
    ========================================================= */

    function getFavoriteMarketplaceItems(
        user = getCurrentUser()
    ) {
        const stored =
            getStorageJson(
                getFavoriteMarketplaceKey(
                    user
                ),
                []
            );

        if (
            !Array.isArray(
                stored
            )
        ) {
            return [];
        }

        /*
         * dataset sempre retorna string.
         * Portanto os IDs de favoritos
         * também ficam como string.
         */
        return stored.map(
            String
        );
    }

    function toggleMarketplaceFavorite(
        id,
        user = getCurrentUser()
    ) {
        const normalizedId =
            String(id);

        const favorites =
            new Set(
                getFavoriteMarketplaceItems(
                    user
                )
            );

        if (
            favorites.has(
                normalizedId
            )
        ) {
            favorites.delete(
                normalizedId
            );
        } else {
            favorites.add(
                normalizedId
            );
        }

        setStorageJson(
            getFavoriteMarketplaceKey(
                user
            ),
            Array.from(
                favorites
            )
        );

        return (
            favorites.has(
                normalizedId
            )
        );
    }

    function isMarketplaceFavorite(
        id,
        user = getCurrentUser()
    ) {
        return (
            getFavoriteMarketplaceItems(
                user
            ).includes(
                String(id)
            )
        );
    }

    /* =========================================================
       FORMATAÇÃO
    ========================================================= */

    function formatCurrency(
        value
    ) {
        return (
            new Intl.NumberFormat(
                'pt-BR',
                {
                    style:
                        'currency',

                    currency:
                        'BRL'
                }
            ).format(
                Number(
                    value ||
                    0
                )
            )
        );
    }

    function formatTime(
        dateString
    ) {
        const date =
            new Date(
                dateString
            );

        return (
            date.toLocaleTimeString(
                'pt-BR',
                {
                    hour:
                        '2-digit',

                    minute:
                        '2-digit'
                }
            )
        );
    }

    function formatDate(
        dateString
    ) {
        const date =
            new Date(
                dateString
            );

        return (
            date.toLocaleDateString(
                'pt-BR'
            )
        );
    }

    function formatRelativeTime(
        dateString
    ) {
        const time =
            new Date(
                dateString
            ).getTime();

        if (
            !Number.isFinite(
                time
            )
        ) {
            return '';
        }

        const diffMs =
            Date.now() -
            time;

        const diffMinutes =
            Math.max(
                0,
                Math.round(
                    diffMs /
                    60000
                )
            );

        if (
            diffMinutes < 60
        ) {
            return (
                `Há ${Math.max(
                    diffMinutes,
                    1
                )} min`
            );
        }

        const diffHours =
            Math.round(
                diffMinutes /
                60
            );

        if (
            diffHours < 24
        ) {
            return (
                `Há ${diffHours} ` +
                `hora${
                    diffHours > 1
                        ? 's'
                        : ''
                }`
            );
        }

        const diffDays =
            Math.round(
                diffHours /
                24
            );

        return (
            `Há ${diffDays} ` +
            `dia${
                diffDays > 1
                    ? 's'
                    : ''
            }`
        );
    }

    /* =========================================================
       EXPORTAÇÕES
    ========================================================= */

    window.communityHub = {
        CATEGORY_IMAGES,

        buildUnitLabel,

        clearAllNotifications,

        createMarketplaceItem,

        updateMarketplaceItem,

        deleteMarketplaceItem,

        createAssemblyNotification,

        createNotification,

        createWallNotice,

        fetchMarketplaceFromSupabase,

        formatCondoName,

        formatCurrency,

        formatDate,

        formatRelativeTime,

        formatTime,

        getCondominiumKey,

        getCondominiumName,

        getCurrentUser,

        getFavoriteMarketplaceItems,

        getInitials,

        getMarketplaceItems,

        getNotificationById,

        getWallNoticeById,

        getNotifications,

        getWallNotices,

        getReadNotifications,

        getUserCepForDb,

        getUserType,

        getUserTypeLabel,

        isMarketplaceFavorite,

        isNotificationRead,

        markAllNotificationsAsRead,

        markNotificationAsRead,

        resolveUserCepForDb,

        fetchWallNoticesFromSupabase,

        saveMarketplaceToSupabase,

        toggleMarketplaceFavorite
    };
})();