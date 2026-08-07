(() => {
    const CATEGORY_IMAGES = {
        moveis: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=modern%20neutral%20beige%20three-seater%20sofa%20in%20a%20bright%20living%20room%2C%20realistic%20product%20photo%2C%20soft%20natural%20light&image_size=landscape_4_3',
        eletrodomesticos: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=stainless%20steel%20refrigerator%20studio%20product%20photo%2C%20clean%20white%20background%2C%20realistic%20ecommerce%20style&image_size=landscape_4_3',
        esportes: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=black%20mountain%20bike%20side%20view%20studio%20product%20photo%2C%20clean%20background%2C%20realistic%20retail%20image&image_size=landscape_4_3',
        infantil: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=colorful%20children%20toys%20organized%20on%20wooden%20shelves%2C%20bright%20playroom%2C%20realistic%20product%20photo&image_size=landscape_4_3',
        livros: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=stack%20of%20books%20on%20clean%20desk%2C%20warm%20natural%20light%2C%20realistic%20ecommerce%20product%20photo&image_size=landscape_4_3',
        eletronicos: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=modern%20smart%20tv%20on%20minimal%20wood%20stand%2C%20living%20room%20scene%2C%20realistic%20product%20photo&image_size=landscape_4_3',
        outros: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=clean%20minimal%20home%20item%20arrangement%20for%20community%20marketplace%2C%20soft%20light%2C%20realistic%20photo&image_size=landscape_4_3'
    };

    function getCurrentUser() {
        try {
            const raw = sessionStorage.getItem('condominiumUser');
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function getUserType(user = getCurrentUser()) {
        if (!user) return 'morador';
        const type = String(user.type || user.user_type || 'morador').trim().toLowerCase();
        if (type.startsWith('sind')) return 'sindico';
        if (type.startsWith('porteir')) return 'porteiro';
        return 'morador';
    }

    function getUserTypeLabel(user = getCurrentUser()) {
        const type = getUserType(user);
        if (type === 'sindico') return 'Síndico';
        if (type === 'porteiro') return 'Porteiro';
        return 'Morador';
    }

    function getInitials(name) {
        return String(name || 'Usuário')
            .split(' ')
            .filter(Boolean)
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'US';
    }

    function getCondominiumKey(user = getCurrentUser()) {
        const condominium = user?.condominium || {};
        return condominium.cep ||
            condominium.condominium_id ||
            condominium.condominiumId ||
            user?.email ||
            'geral';
    }

    function getCondominiumName(user = getCurrentUser()) {
        const name = user?.condominium?.name || user?.condominium?.condominium_name || 'Seu Condomínio';
        return String(name);
    }

    function formatCondoName(name) {
        const words = String(name || '').split(' ').filter(Boolean);
        if (words.length > 2) {
            return `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`;
        }
        return words.join(' ') || 'Seu Condomínio';
    }

    function getStorageJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function setStorageJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function getNotificationsKey(user) {
        return `condomit.notifications.${getCondominiumKey(user)}`;
    }

    function getReadNotificationsKey(user) {
        return `condomit.notifications.read.${getCondominiumKey(user)}.${user?.email || 'anon'}`;
    }

    function getDefaultNotifications() {
        return [];
    }

    function getUserCepForDb(user = getCurrentUser()) {
        const ids = typeof window.getUserCondominiumIdentifiers === 'function'
            ? window.getUserCondominiumIdentifiers(user)
            : [];
        for (const id of ids) {
            if (id && typeof id === 'string') {
                return id.replace(/\D/g, '');
            }
        }
        const direct = getCondominiumKey(user);
        return String(direct || '').replace(/\D/g, '');
    }

    async function fetchNotificationsFromSupabase(user = getCurrentUser()) {
        if (typeof window.supabaseFetch !== 'function') return [];
        const cep = getUserCepForDb(user);
        if (!cep) return [];
        try {
            const rows = await window.supabaseFetch(`/notifications?select=*&cep=eq.${encodeURIComponent(cep)}&order=created_at.desc`);
            if (!Array.isArray(rows)) return [];
            return rows.map((row) => ({
                id: `db-notif-${row.id}`,
                category: row.category || 'Avisos',
                title: row.title || '',
                message: row.description || '',
                details: row.description || '',
                createdAt: row.created_at || new Date().toISOString(),
                author: 'Síndico',
                createdByType: 'sindico'
            }));
        } catch (err) {
            console.warn('fetchNotificationsFromSupabase falhou:', err?.message || err);
            return [];
        }
    }

    async function getNotifications(user = getCurrentUser()) {
        const key = getNotificationsKey(user);
        const clearedKey = `${key}.cleared`;
        try {
            const hasCleared = localStorage.getItem(clearedKey) === '1';
            if (!hasCleared) {
                localStorage.removeItem(key);
                localStorage.setItem(clearedKey, '1');
            }
        } catch (_) {}
        let localItems = getStorageJson(key, null);
        if (!Array.isArray(localItems)) localItems = [];
        const remoteItems = await fetchNotificationsFromSupabase(user);
        const seen = new Set();
        const merged = [];
        for (const item of [...remoteItems, ...localItems]) {
            const k = `${String(item.title || '').trim().toLowerCase()}|${String(item.message || '').trim().toLowerCase()}|${String(new Date(item.createdAt || 0).getTime())}`;
            if (seen.has(k)) continue;
            seen.add(k);
            merged.push(item);
        }
        return merged
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    function clearAllNotifications(user = getCurrentUser()) {
        setStorageJson(getNotificationsKey(user), []);
        return true;
    }

    async function saveNotificationToSupabase(data, user = getCurrentUser()) {
        if (typeof window.supabaseFetch !== 'function') return null;
        const cep = getUserCepForDb(user);
        if (!cep) return null;
        const payload = {
            cep,
            category: data.category || 'Avisos',
            title: String(data.title || '').trim(),
            description: String(data.details || data.message || '').trim()
        };
        try {
            const rows = await window.supabaseFetch('/notifications', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }
            });
            if (Array.isArray(rows) && rows.length) {
                return rows[0];
            }
            return null;
        } catch (err) {
            console.warn('saveNotificationToSupabase falhou (RLS?):', err?.message || err);
            return null;
        }
    }

    async function createNotification(data, user = getCurrentUser()) {
        const saved = await saveNotificationToSupabase(data, user);
        const key = getNotificationsKey(user);
        let localItems = getStorageJson(key, null);
        if (!Array.isArray(localItems)) localItems = [];
        const notification = {
            id: saved && saved.id ? `db-notif-${saved.id}` : `notif-${Date.now()}`,
            category: data.category || 'Avisos',
            title: String(data.title || '').trim(),
            message: String(data.message || '').trim(),
            details: String(data.details || data.message || '').trim(),
            createdAt: saved && saved.created_at ? saved.created_at : new Date().toISOString(),
            author: user?.name || 'Síndico',
            createdByType: getUserType(user),
            metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : null
        };
        localItems.unshift(notification);
        setStorageJson(key, localItems);
        return notification;
    }

    function createAssemblyNotification(assembly, user = getCurrentUser()) {
        if (!assembly) return null;

        const dateLabel = formatDate(assembly.date || new Date().toISOString());
        const startTime = String(assembly.start_time || assembly.time || '--:--').slice(0, 5);
        const endTime = String(assembly.end_time || assembly.start_time || assembly.time || '').slice(0, 5);
        const timeLabel = endTime && endTime !== startTime
            ? `${startTime} às ${endTime}`
            : startTime;

        return createNotification({
            category: 'Assembleias',
            title: assembly.title || 'Nova assembleia agendada',
            message: `Uma assembleia foi agendada para ${dateLabel} às ${timeLabel}.`,
            details: `A assembleia "${assembly.title || 'Sem título'}" foi agendada para ${dateLabel} às ${timeLabel}. Acesse a área de assembleias para revisar os detalhes e preparar sua entrada.`,
            metadata: {
                assemblyId: assembly.id || null,
                date: assembly.date || null,
                startTime: assembly.start_time || assembly.time || null,
                endTime: assembly.end_time || null,
                createdBy: assembly.created_by || user?.email || null
            }
        }, user);
    }

    function getReadNotifications(user = getCurrentUser()) {
        return getStorageJson(getReadNotificationsKey(user), []);
    }

    function markNotificationAsRead(id, user = getCurrentUser()) {
        const read = new Set(getReadNotifications(user));
        read.add(id);
        setStorageJson(getReadNotificationsKey(user), Array.from(read));
    }

    function markAllNotificationsAsRead(user = getCurrentUser()) {
        const ids = getNotifications(user).map((notification) => notification.id);
        setStorageJson(getReadNotificationsKey(user), ids);
    }

    function isNotificationRead(id, user = getCurrentUser()) {
        return getReadNotifications(user).includes(id);
    }

    function getNotificationById(id, user = getCurrentUser()) {
        return getNotifications(user).find((notification) => String(notification.id) === String(id)) || null;
    }

    function getMarketplaceKey(user) {
        return `condomit.marketplace.${getCondominiumKey(user)}`;
    }

    function getFavoriteMarketplaceKey(user) {
        return `condomit.marketplace.favorite.${getCondominiumKey(user)}.${user?.email || 'anon'}`;
    }

    function categoryToDbCategory(categoryKey) {
        const map = {
            moveis: 'Móveis',
            eletrodomesticos: 'Eletrodomésticos',
            eletronicos: 'Eletrônicos',
            infantil: 'Infantil',
            esportes: 'Esportes',
            livros: 'Livros',
            outros: 'Outros'
        };
        return map[categoryKey] || 'Outros';
    }

    function dbCategoryToCategoryLabel(dbCategory) {
        return dbCategory || 'Outros';
    }

    function getDefaultMarketplaceItems() {
        return [];
    }

    async function fetchMarketplaceFromSupabase(user = getCurrentUser()) {
        if (typeof window.supabaseFetch !== 'function') return [];
        const cep = getUserCepForDb(user);
        if (!cep) return [];
        try {
            const rows = await window.supabaseFetch(`/marketplace_items?select=*&cep=eq.${encodeURIComponent(cep)}&order=created_at.desc`);
            if (!Array.isArray(rows)) return [];
            return rows.map((row) => ({
                id: `db-mp-${row.id}`,
                title: row.title || '',
                description: row.description || '',
                category: row.category || 'Outros',
                categoryLabel: dbCategoryToCategoryLabel(row.category),
                price: Number(row.price || 0),
                seller: row.user_name || 'Morador',
                sellerUnit: 'Condomínio',
                createdAt: row.created_at || new Date().toISOString(),
                status: 'Disponível',
                image: row.image_url || CATEGORY_IMAGES.outros
            }));
        } catch (err) {
            console.warn('fetchMarketplaceFromSupabase falhou:', err?.message || err);
            return [];
        }
    }

    async function saveMarketplaceToSupabase(data, user = getCurrentUser()) {
        if (typeof window.supabaseFetch !== 'function') return null;
        const cep = getUserCepForDb(user);
        if (!cep) return null;
        const payload = {
            cep,
            user_name: user?.name || 'Morador',
            title: String(data.title || '').trim(),
            category: data.categoryLabel || categoryToDbCategory(data.category),
            price: Number(data.price || 0),
            description: String(data.description || '').trim(),
            image_url: data.image || CATEGORY_IMAGES[data.category] || CATEGORY_IMAGES.outros
        };
        try {
            const rows = await window.supabaseFetch('/marketplace_items', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }
            });
            if (Array.isArray(rows) && rows.length) return rows[0];
            return null;
        } catch (err) {
            console.warn('saveMarketplaceToSupabase falhou:', err?.message || err);
            return null;
        }
    }

    async function getMarketplaceItems(user = getCurrentUser()) {
        const key = getMarketplaceKey(user);
        let localItems = getStorageJson(key, null);
        if (!Array.isArray(localItems)) localItems = [];
        const remoteItems = await fetchMarketplaceFromSupabase(user);
        const seen = new Set();
        const merged = [];
        for (const item of [...remoteItems, ...localItems]) {
            const k = `${String(item.title || '').trim().toLowerCase()}|${Number(item.price || 0)}|${String(new Date(item.createdAt || 0).getTime())}`;
            if (seen.has(k)) continue;
            seen.add(k);
            merged.push(item);
        }
        return merged
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    async function createMarketplaceItem(data, user = getCurrentUser()) {
        const saved = await saveMarketplaceToSupabase(data, user);
        const key = getMarketplaceKey(user);
        let items = getStorageJson(key, null);
        if (!Array.isArray(items)) items = [];
        const dbCategory = data.categoryLabel || categoryToDbCategory(data.category);
        const item = {
            id: saved && saved.id ? `db-mp-${saved.id}` : `item-${Date.now()}`,
            title: String(data.title || '').trim(),
            description: String(data.description || '').trim(),
            category: data.category || 'outros',
            categoryLabel: dbCategory,
            price: Number(data.price || 0),
            seller: user?.name || 'Morador',
            sellerUnit: buildUnitLabel(user),
            createdAt: saved && saved.created_at ? saved.created_at : new Date().toISOString(),
            status: 'Disponível',
            image: data.image || CATEGORY_IMAGES[data.category] || CATEGORY_IMAGES.outros
        };
        items.unshift(item);
        setStorageJson(key, items);
        return item;
    }

    function buildUnitLabel(user = getCurrentUser()) {
        if (!user) return 'Condomínio';
        if (getUserType(user) === 'sindico') return 'Administração';
        const block = user?.condominium?.block || 'Bloco A';
        const apartment = user?.condominium?.apartment || 'Apto 000';
        return `${block} - ${apartment}`;
    }

    function getFavoriteMarketplaceItems(user = getCurrentUser()) {
        return getStorageJson(getFavoriteMarketplaceKey(user), []);
    }

    function toggleMarketplaceFavorite(id, user = getCurrentUser()) {
        const favorites = new Set(getFavoriteMarketplaceItems(user));
        if (favorites.has(id)) {
            favorites.delete(id);
        } else {
            favorites.add(id);
        }
        setStorageJson(getFavoriteMarketplaceKey(user), Array.from(favorites));
        return favorites.has(id);
    }

    function isMarketplaceFavorite(id, user = getCurrentUser()) {
        return getFavoriteMarketplaceItems(user).includes(id);
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(Number(value || 0));
    }

    function formatTime(dateString) {
        const date = new Date(dateString);
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    function formatRelativeTime(dateString) {
        const diffMs = Date.now() - new Date(dateString).getTime();
        const diffMinutes = Math.round(diffMs / 60000);
        if (diffMinutes < 60) {
            return `Há ${Math.max(diffMinutes, 1)} min`;
        }
        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) {
            return `Há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
        }
        const diffDays = Math.round(diffHours / 24);
        return `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    }

    window.communityHub = {
        CATEGORY_IMAGES,
        buildUnitLabel,
        clearAllNotifications,
        createMarketplaceItem,
        createAssemblyNotification,
        createNotification,
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
        getUserType,
        getUserTypeLabel,
        isMarketplaceFavorite,
        isNotificationRead,
        markAllNotificationsAsRead,
        markNotificationAsRead,
        toggleMarketplaceFavorite
    };
})();
