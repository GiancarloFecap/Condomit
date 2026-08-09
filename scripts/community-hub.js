(() => {
    const CATEGORY_IMAGES = {
        moveis:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=modern%20neutral%20beige%20three-seater%20sofa%20in%20a%20bright%20living%20room%2C%20realistic%20product%20photo%2C%20soft%20natural%20light&image_size=landscape_4_3',

        eletrodomesticos:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=stainless%20steel%20refrigerator%20studio%20product%20photo%2C%20clean%20white%20background%2C%20realistic%20ecommerce%20style&image_size=landscape_4_3',

        esportes:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=black%20mountain%20bike%20side%20view%20studio%20product%20photo%2C%20clean%20background%2C%20realistic%20retail%20image&image_size=landscape_4_3',

        infantil:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=colorful%20children%20toys%20organized%20on%20wooden%20shelves%2C%20bright%20playroom%2C%20realistic%20product%20photo&image_size=landscape_4_3',

        livros:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=stack%20of%20books%20on%20clean%20desk%2C%20warm%20natural%20light%2C%20realistic%20ecommerce%20product%20photo&image_size=landscape_4_3',

        eletronicos:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=modern%20smart%20tv%20on%20minimal%20wood%20stand%2C%20living%20room%20scene%2C%20realistic%20product%20photo&image_size=landscape_4_3',

        outros:
            'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=clean%20minimal%20home%20item%20arrangement%20for%20community%20marketplace%2C%20soft%20light%2C%20realistic%20photo&image_size=landscape_4_3'
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
        if (
            typeof window
                .supabaseFetch !==
            'function'
        ) {
            return [];
        }

        const cep =
            await resolveUserCepForDb(
                user
            );

        if (!cep) {
            return [];
        }

        try {
            const rows =
                await window
                    .supabaseFetch(
                        `/notifications?select=*&cep=eq.${encodeURIComponent(
                            cep
                        )}&order=created_at.desc`
                    );

            if (
                !Array.isArray(
                    rows
                )
            ) {
                return [];
            }

            return rows.map(
                (row) => ({
                    id:
                        `db-notif-${row.id}`,

                    category:
                        row.category ||
                        'Avisos',

                    title:
                        row.title ||
                        '',

                    message:
                        row.description ||
                        '',

                    details:
                        row.description ||
                        '',

                    createdAt:
                        row.created_at ||
                        new Date()
                            .toISOString(),

                    author:
                        'Síndico',

                    createdByType:
                        'sindico'
                })
            );
        } catch (error) {
            console.warn(
                'fetchNotificationsFromSupabase falhou:',
                error?.message ||
                error
            );

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

        const clearedKey =
            `${key}.cleared`;

        try {
            const hasCleared =
                localStorage.getItem(
                    clearedKey
                ) === '1';

            if (!hasCleared) {
                localStorage.removeItem(
                    key
                );

                localStorage.setItem(
                    clearedKey,
                    '1'
                );
            }
        } catch (_) {}

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
        setStorageJson(
            getNotificationsKey(
                user
            ),
            []
        );

        notificationCache = [];

        return true;
    }

    async function saveNotificationToSupabase(
        data,
        user = getCurrentUser()
    ) {
        if (
            typeof window
                .supabaseFetch !==
            'function'
        ) {
            return null;
        }

        const cep =
            await resolveUserCepForDb(
                user
            );

        if (!cep) {
            return null;
        }

        const payload = {
            cep,

            category:
                data.category ||
                'Avisos',

            title:
                String(
                    data.title ||
                    ''
                ).trim(),

            description:
                String(
                    data.details ||
                    data.message ||
                    ''
                ).trim()
        };

        try {
            const rows =
                await window
                    .supabaseFetch(
                        '/notifications',
                        {
                            method:
                                'POST',

                            body:
                                JSON.stringify(
                                    payload
                                ),

                            headers: {
                                'Content-Type':
                                    'application/json',

                                Prefer:
                                    'return=representation'
                            }
                        }
                    );

            if (
                Array.isArray(
                    rows
                ) &&
                rows.length
            ) {
                return rows[0];
            }

            return null;
        } catch (error) {
            console.warn(
                'saveNotificationToSupabase falhou (RLS?):',
                error?.message ||
                error
            );

            return null;
        }
    }

    async function createNotification(
        data,
        user = getCurrentUser()
    ) {
        const saved =
            await saveNotificationToSupabase(
                data,
                user
            );

        const key =
            getNotificationsKey(
                user
            );

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

        const notification = {
            id:
                saved?.id
                    ? `db-notif-${saved.id}`
                    : `notif-${Date.now()}`,

            category:
                data.category ||
                'Avisos',

            title:
                String(
                    data.title ||
                    ''
                ).trim(),

            message:
                String(
                    data.message ||
                    ''
                ).trim(),

            details:
                String(
                    data.details ||
                    data.message ||
                    ''
                ).trim(),

            createdAt:
                saved?.created_at ||
                new Date()
                    .toISOString(),

            author:
                user?.name ||
                'Síndico',

            createdByType:
                getUserType(
                    user
                ),

            metadata:
                (
                    data.metadata &&
                    typeof data.metadata ===
                        'object'
                )
                    ? data.metadata
                    : null
        };

        localItems.unshift(
            notification
        );

        setStorageJson(
            key,
            localItems
        );

        notificationCache.unshift(
            notification
        );

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
        const read =
            new Set(
                getReadNotifications(
                    user
                ).map(String)
            );

        read.add(
            String(id)
        );

        setStorageJson(
            getReadNotificationsKey(
                user
            ),
            Array.from(
                read
            )
        );
    }

    function markAllNotificationsAsRead(
        user = getCurrentUser()
    ) {
        /*
         * No código antigo havia:
         *
         * getNotifications(user).map(...)
         *
         * mas getNotifications é async.
         *
         * Agora usamos o cache carregado.
         */
        const ids =
            notificationCache.map(
                (notification) =>
                    String(
                        notification.id
                    )
            );

        setStorageJson(
            getReadNotificationsKey(
                user
            ),
            ids
        );
    }

    function isNotificationRead(
        id,
        user = getCurrentUser()
    ) {
        return (
            getReadNotifications(
                user
            )
                .map(String)
                .includes(
                    String(id)
                )
        );
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

            sellerUnit:
                'Condomínio',

            createdAt:
                row?.created_at ||
                new Date()
                    .toISOString(),

            status:
                'Disponível',

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

        const payload = {
            cep,

            user_name:
                userName,

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

        createAssemblyNotification,

        createNotification,

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

        getNotifications,

        getReadNotifications,

        getUserCepForDb,

        getUserType,

        getUserTypeLabel,

        isMarketplaceFavorite,

        isNotificationRead,

        markAllNotificationsAsRead,

        markNotificationAsRead,

        resolveUserCepForDb,

        saveMarketplaceToSupabase,

        toggleMarketplaceFavorite
    };
})();