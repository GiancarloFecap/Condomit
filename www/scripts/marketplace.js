const marketplaceState = {
    currentUser: null,
    search: '',
    category: 'todos',
    favoritesOnly: false,
    mineOnly: false,
    selectedItemId: null,
    draftImage: '',
    editingDbId: null,
    isSaving: false
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const currentUser = await loadMarketplaceUser();

        if (!currentUser) {
            return;
        }

        marketplaceState.currentUser = currentUser;

        setupMarketplaceShell(currentUser);
        setupMarketplaceActions();

        await renderMarketplacePage();
    } catch (error) {
        console.error(
            'Erro ao inicializar o marketplace:',
            error
        );

        window.showToast?.(
            error?.message ||
                'Não foi possível carregar o marketplace.',
            'error'
        );
    }
});

async function loadMarketplaceUser() {
    let user =
        window.communityHub
            ?.getCurrentUser?.() ||
        null;

    if (
        !user &&
        typeof window.refreshCurrentUserFromDb ===
            'function'
    ) {
        user =
            await window
                .refreshCurrentUserFromDb()
                .catch(() => null);
    }

    if (!user) {
        window.location.href =
            'entrar.html';

        return null;
    }

    /*
     * Tenta restaurar a sessão autenticada
     * do Supabase.
     *
     * Isso é necessário porque marketplace_items
     * está protegida por RLS.
     */
    if (
        typeof window.resolveSupabaseAccessToken ===
        'function'
    ) {
        try {
            await window
                .resolveSupabaseAccessToken();
        } catch (error) {
            console.warn(
                'Não foi possível restaurar a sessão do Supabase:',
                error
            );
        }
    }

    return user;
}

function setupMarketplaceShell(currentUser) {
    if (!window.communityHub) {
        throw new Error(
            'O módulo community-hub.js não foi carregado.'
        );
    }

    const sidebarSindico =
        document.getElementById(
            'sidebarSindico'
        );

    const sidebarMorador =
        document.getElementById(
            'sidebarMorador'
        );

    const isSindico =
        window.communityHub
            .getUserType(
                currentUser
            ) === 'sindico';

    if (sidebarSindico) {
        sidebarSindico.style.display =
            isSindico
                ? 'block'
                : 'none';
    }

    if (sidebarMorador) {
        sidebarMorador.style.display =
            isSindico
                ? 'none'
                : 'block';
    }

    const sidebarApartment =
        document.getElementById(
            'sidebarApartment'
        );

    if (sidebarApartment) {
        sidebarApartment.innerHTML =
            window.communityHub
                .formatCondoName(
                    window.communityHub
                        .getCondominiumName(
                            currentUser
                        )
                );
    }

    const profileNameTop =
        document.getElementById(
            'profileNameTop'
        );

    const profileTypeTop =
        document.getElementById(
            'profileTypeTop'
        );

    const profileAvatarTop =
        document.getElementById(
            'profileAvatarTop'
        );

    if (profileNameTop) {
        profileNameTop.textContent =
            currentUser.name ||
            'Usuário';
    }

    if (profileTypeTop) {
        profileTypeTop.textContent =
            window.communityHub
                .getUserTypeLabel(
                    currentUser
                );
    }

    if (profileAvatarTop) {
        profileAvatarTop.textContent =
            window.communityHub
                .getInitials(
                    currentUser.name
                );
    }
}

function setupMarketplaceActions() {
    document
        .getElementById(
            'marketplaceSearch'
        )
        ?.addEventListener(
            'input',
            async (event) => {
                marketplaceState.search =
                    event.target.value
                        .trim()
                        .toLowerCase();

                await renderMarketplacePage();
            }
        );

    document
        .getElementById(
            'marketplaceCategory'
        )
        ?.addEventListener(
            'change',
            async (event) => {
                marketplaceState.category =
                    event.target.value;

                await renderMarketplacePage();
            }
        );

    document
        .getElementById(
            'toggleFavoritesBtn'
        )
        ?.addEventListener(
            'click',
            async () => {
                marketplaceState.favoritesOnly =
                    !marketplaceState
                        .favoritesOnly;

                await renderMarketplacePage();
            }
        );

    document
        .getElementById(
            'toggleMyAdsBtn'
        )
        ?.addEventListener(
            'click',
            async () => {
                marketplaceState.mineOnly =
                    !marketplaceState.mineOnly;

                await renderMarketplacePage();
            }
        );

    document
        .getElementById(
            'createItemBtn'
        )
        ?.addEventListener(
            'click',
            () => openMarketplaceModal()
        );

    document
        .getElementById(
            'closeMarketplaceModal'
        )
        ?.addEventListener(
            'click',
            closeMarketplaceModal
        );

    document
        .getElementById(
            'cancelMarketplaceModal'
        )
        ?.addEventListener(
            'click',
            closeMarketplaceModal
        );

    document
        .getElementById(
            'itemImage'
        )
        ?.addEventListener(
            'change',
            handleMarketplaceImageChange
        );

    document
        .getElementById(
            'marketplaceModal'
        )
        ?.addEventListener(
            'click',
            (event) => {
                if (
                    event.target.id ===
                    'marketplaceModal'
                ) {
                    closeMarketplaceModal();
                }
            }
        );

    /*
     * PUBLICAR ANÚNCIO
     */
    document
        .getElementById(
            'marketplaceForm'
        )
        ?.addEventListener(
            'submit',
            async (event) => {
                event.preventDefault();

                /*
                 * Evita dois INSERTS caso o
                 * usuário clique várias vezes.
                 */
                if (
                    marketplaceState
                        .isSaving
                ) {
                    return;
                }

                const form =
                    event.currentTarget;

                const categorySelect =
                    document.getElementById(
                        'itemCategory'
                    );

                const titleInput =
                    document.getElementById(
                        'itemTitle'
                    );

                const priceInput =
                    document.getElementById(
                        'itemPrice'
                    );

                const descriptionInput =
                    document.getElementById(
                        'itemDescription'
                    );

                const submitButton =
                    form?.querySelector(
                        'button[type="submit"], input[type="submit"]'
                    );

                const category =
                    String(
                        categorySelect
                            ?.value ||
                        'outros'
                    ).trim();

                const categoryLabel =
                    String(
                        categorySelect
                            ?.selectedOptions?.[0]
                            ?.textContent ||
                        'Outros'
                    ).trim();

                const title =
                    String(
                        titleInput
                            ?.value ||
                        ''
                    ).trim();

                /*
                 * Permite 10,50 e 10.50.
                 */
                const price =
                    Number(
                        String(
                            priceInput
                                ?.value ||
                            ''
                        )
                            .trim()
                            .replace(
                                ',',
                                '.'
                            )
                    );

                const description =
                    String(
                        descriptionInput
                            ?.value ||
                        ''
                    ).trim();

                const image =
                    marketplaceState
                        .draftImage;

                /*
                 * VALIDAÇÕES
                 */
                if (!title) {
                    window.showToast?.(
                        'Informe o título do anúncio.',
                        'warning'
                    );

                    titleInput?.focus();

                    return;
                }

                if (
                    !Number.isFinite(
                        price
                    ) ||
                    price < 0
                ) {
                    window.showToast?.(
                        'Informe um preço válido.',
                        'warning'
                    );

                    priceInput?.focus();

                    return;
                }

                if (!description) {
                    window.showToast?.(
                        'Informe a descrição do anúncio.',
                        'warning'
                    );

                    descriptionInput
                        ?.focus();

                    return;
                }

                if (
                    !window.communityHub ||
                    typeof window
                        .communityHub
                        .createMarketplaceItem !==
                        'function'
                ) {
                    window.showToast?.(
                        'Não foi possível acessar o serviço do marketplace.',
                        'error'
                    );

                    return;
                }

                marketplaceState
                    .isSaving =
                    true;

                /*
                 * Guarda o conteúdo original
                 * do botão.
                 */
                const oldButtonHtml =
                    submitButton
                        ?.tagName ===
                    'BUTTON'
                        ? submitButton
                            .innerHTML
                        : submitButton
                            ?.value;

                if (submitButton) {
                    submitButton.disabled =
                        true;

                    if (
                        submitButton
                            .tagName ===
                        'BUTTON'
                    ) {
                        submitButton.innerHTML =
                            '<i class="fas fa-spinner fa-spin"></i> Publicando...';
                    } else {
                        submitButton.value =
                            'Publicando...';
                    }
                }

                try {
                    /*
                     * marketplace_items está
                     * protegida por RLS.
                     *
                     * O INSERT deve utilizar
                     * o JWT do usuário.
                     */
                    if (
                        typeof window
                            .resolveSupabaseAccessToken ===
                        'function'
                    ) {
                        const accessToken =
                            await window
                                .resolveSupabaseAccessToken();

                        if (
                            !accessToken
                        ) {
                            throw new Error(
                                'Sua sessão expirou. Entre novamente antes de publicar um anúncio.'
                            );
                        }
                    }

                    /*
                     * createMarketplaceItem()
                     * deve realizar o INSERT
                     * em marketplace_items.
                     */
                    const wasEditing =
                        Boolean(
                            marketplaceState.editingDbId
                        );

                    const itemData = {
                        title,
                        category,
                        categoryLabel,
                        price,
                        description,
                        image
                    };

                    const item =
                        marketplaceState.editingDbId
                            ? await window.communityHub.updateMarketplaceItem(
                                marketplaceState.editingDbId,
                                itemData,
                                marketplaceState.currentUser
                            )
                            : await window.communityHub.createMarketplaceItem(
                                itemData,
                                marketplaceState.currentUser
                            );

                    /*
                     * Se não houve retorno
                     * de ID, não considerar
                     * como salvo.
                     */
                    if (
                        !item ||
                        item.id ===
                            undefined ||
                        item.id ===
                            null ||
                        item.id ===
                            ''
                    ) {
                        throw new Error(
                            'O banco de dados não confirmou a publicação do anúncio.'
                        );
                    }

                    marketplaceState
                        .selectedItemId =
                        normalizeItemId(
                            item.id
                        );

                    closeMarketplaceModal();

                    form?.reset();

                    resetMarketplaceImagePreview();

                    await renderMarketplacePage();

                    window.showToast?.(
                        wasEditing
                            ? 'Anúncio atualizado com sucesso.'
                            : 'Anúncio publicado e salvo no banco de dados.',
                        'success'
                    );
                } catch (error) {
                    console.error(
                        'Erro ao publicar anúncio:',
                        error
                    );

                    window.showToast?.(
                        normalizeMarketplaceError(
                            error
                        ),
                        'error'
                    );
                } finally {
                    marketplaceState
                        .isSaving =
                        false;

                    if (
                        submitButton
                    ) {
                        submitButton.disabled =
                            false;

                        if (
                            submitButton
                                .tagName ===
                            'BUTTON'
                        ) {
                            submitButton.innerHTML =
                                oldButtonHtml ||
                                'Publicar anúncio';
                        } else {
                            submitButton.value =
                                oldButtonHtml ||
                                'Publicar anúncio';
                        }
                    }
                }
            }
        );
}

/*
 * Normaliza IDs.
 *
 * IDs vindos do Supabase podem ser
 * números, enquanto dataset retorna
 * sempre string.
 */
function normalizeItemId(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return '';
    }

    return String(value);
}

/*
 * Transforma erros técnicos do
 * Supabase em mensagens mais claras.
 */
function normalizeMarketplaceError(
    error
) {
    const message =
        String(
            error?.message ||
            error ||
            ''
        ).trim();

    const lower =
        message.toLowerCase();

    if (
        lower.includes(
            'row-level security'
        ) ||
        lower.includes('rls') ||
        lower.includes('policy')
    ) {
        return (
            'O Supabase bloqueou a publicação pelas regras de segurança. ' +
            'Verifique sua sessão e a policy RLS de marketplace_items.'
        );
    }

    if (
        lower.includes(
            'foreign key'
        ) ||
        lower.includes(
            'marketplace_items_cep_fkey'
        )
    ) {
        return (
            'O CEP do condomínio do usuário não corresponde ' +
            'a um condomínio cadastrado no banco.'
        );
    }

    if (
        lower.includes(
            'not-null'
        ) ||
        lower.includes(
            'null value'
        )
    ) {
        return (
            'Um dos campos obrigatórios do anúncio não foi preenchido corretamente.'
        );
    }

    return (
        message ||
        'Não foi possível publicar o anúncio.'
    );
}

async function renderMarketplacePage() {
    if (
        !window.communityHub ||
        typeof window
            .communityHub
            .getMarketplaceItems !==
            'function'
    ) {
        throw new Error(
            'O módulo do marketplace não está disponível.'
        );
    }

    try {
        await window.supabaseFetch('/rpc/condomit_expire_marketplace_items', { method: 'POST', body: '{}' });
    } catch (_) {}

    const allItems =
        await window
            .communityHub
            .getMarketplaceItems(
                marketplaceState
                    .currentUser
            );

    const safeItems =
        Array.isArray(
            allItems
        )
            ? allItems
            : [];

    /*
     * Favoritos também são
     * normalizados como string.
     */
    let favoriteIds = window.communityHub.getFavoriteMarketplaceItems(marketplaceState.currentUser);
    try {
        const dbFavorites = await window.supabaseFetch('/marketplace_favorites?select=item_id');
        if (Array.isArray(dbFavorites)) favoriteIds = dbFavorites.map(row => `db-mp-${row.item_id}`);
    } catch (_) {}

    const favorites = new Set((Array.isArray(favoriteIds) ? favoriteIds : []).map(normalizeItemId));

    const currentEmail =
        String(
            marketplaceState.currentUser?.email ||
            ''
        )
            .trim()
            .toLowerCase();

    const filteredItems =
        safeItems.filter(
            (item) => {
                const matchesCategory =
                    marketplaceState
                        .category ===
                        'todos' ||
                    item.category ===
                        marketplaceState
                            .category;

                const haystack =
                    `${
                        item.title ||
                        ''
                    } ${
                        item.description ||
                        ''
                    } ${
                        item.categoryLabel ||
                        ''
                    } ${
                        item.seller ||
                        ''
                    }`
                        .toLowerCase();

                const matchesSearch =
                    !marketplaceState
                        .search ||
                    haystack.includes(
                        marketplaceState
                            .search
                    );

                const matchesFavorite =
                    !marketplaceState
                        .favoritesOnly ||
                    favorites.has(
                        normalizeItemId(
                            item.id
                        )
                    );

                const matchesMine =
                    !marketplaceState.mineOnly ||
                    (
                        currentEmail &&
                        String(item.sellerEmail || '')
                            .trim()
                            .toLowerCase() === currentEmail
                    );

                return (
                    matchesCategory &&
                    matchesSearch &&
                    matchesFavorite &&
                    matchesMine
                );
            }
        );

    if (
        !marketplaceState
            .selectedItemId &&
        filteredItems.length
    ) {
        marketplaceState
            .selectedItemId =
            normalizeItemId(
                filteredItems[0].id
            );
    }

    if (
        marketplaceState
            .selectedItemId &&
        !filteredItems.some(
            (item) =>
                normalizeItemId(
                    item.id
                ) ===
                normalizeItemId(
                    marketplaceState
                        .selectedItemId
                )
        )
    ) {
        marketplaceState
            .selectedItemId =
            filteredItems[0]
                ? normalizeItemId(
                    filteredItems[0].id
                )
                : null;
    }

    renderMarketplaceShortcuts();

    renderMarketplaceGrid(
        filteredItems,
        favorites
    );

    renderMarketplaceDetail(
        filteredItems
    );
}

function renderMarketplaceShortcuts() {
    const container =
        document.getElementById(
            'categoryShortcuts'
        );

    if (!container) {
        return;
    }

    const categories = [
        {
            value: 'todos',
            label: 'Todos',
            icon: 'fa-border-all'
        },
        {
            value: 'moveis',
            label: 'Móveis',
            icon: 'fa-couch'
        },
        {
            value:
                'eletrodomesticos',
            label:
                'Eletrodomésticos',
            icon:
                'fa-kitchen-set'
        },
        {
            value: 'eletronicos',
            label: 'Eletrônicos',
            icon: 'fa-tv'
        },
        {
            value: 'infantil',
            label: 'Infantil',
            icon: 'fa-puzzle-piece'
        },
        {
            value: 'esportes',
            label: 'Esportes',
            icon: 'fa-basketball'
        },
        {
            value: 'livros',
            label: 'Livros',
            icon: 'fa-book'
        },
        {
            value: 'outros',
            label: 'Outros',
            icon: 'fa-box-open'
        }
    ];

    container.innerHTML =
        categories
            .map(
                (category) => `
                    <button
                        class="category-chip ${
                            marketplaceState.category ===
                            category.value
                                ? 'active'
                                : ''
                        }"
                        type="button"
                        data-category="${category.value}"
                    >
                        <i class="fas ${category.icon}"></i>
                        ${category.label}
                    </button>
                `
            )
            .join('');

    container
        .querySelectorAll(
            '[data-category]'
        )
        .forEach(
            (button) => {
                button.addEventListener(
                    'click',
                    () => {
                        marketplaceState
                            .category =
                            button.dataset
                                .category;

                        const select =
                            document.getElementById(
                                'marketplaceCategory'
                            );

                        if (select) {
                            select.value =
                                marketplaceState
                                    .category;
                        }

                        renderMarketplacePage()
                            .catch(
                                (error) => {
                                    console.error(
                                        'Erro ao aplicar filtro:',
                                        error
                                    );
                                }
                            );
                    }
                );
            }
        );
}

function renderMarketplaceGrid(
    items,
    favorites
) {
    const grid =
        document.getElementById(
            'marketplaceGrid'
        );

    const counter =
        document.getElementById(
            'marketplaceCounter'
        );

    const favoritesButton =
        document.getElementById(
            'toggleFavoritesBtn'
        );

    const myAdsButton =
        document.getElementById(
            'toggleMyAdsBtn'
        );

    if (!grid) {
        return;
    }

    if (counter) {
        counter.textContent =
            `${items.length} ${
                items.length === 1
                    ? 'resultado'
                    : 'resultados'
            }`;
    }

    if (favoritesButton) {
        const favoritesActive = Boolean(
            marketplaceState.favoritesOnly
        );

        favoritesButton.classList.toggle(
            'active',
            favoritesActive
        );

        favoritesButton.setAttribute(
            'aria-pressed',
            favoritesActive ? 'true' : 'false'
        );

        const heartIcon = favoritesButton.querySelector('i');
        if (heartIcon) {
            heartIcon.classList.toggle('far', !favoritesActive);
            heartIcon.classList.toggle('fas', favoritesActive);
            heartIcon.classList.add('fa-heart');
        }
    }

    if (myAdsButton) {
        const mineActive = Boolean(
            marketplaceState.mineOnly
        );
        myAdsButton.classList.toggle(
            'active',
            mineActive
        );
        myAdsButton.setAttribute(
            'aria-pressed',
            mineActive ? 'true' : 'false'
        );
    }

    if (!items.length) {
        grid.innerHTML =
            `
                <div class="empty-state">
                    <i class="fas fa-store-slash"></i>
                    <p>
                        Nenhum item encontrado com esses filtros.
                    </p>
                </div>
            `;

        return;
    }

    grid.innerHTML =
        items
            .map(
                (item) => {
                    const itemId =
                        normalizeItemId(
                            item.id
                        );

                    const selected =
                        itemId ===
                        normalizeItemId(
                            marketplaceState
                                .selectedItemId
                        );

                    const favorite =
                        favorites.has(
                            itemId
                        );

                    return `
                        <article
                            class="product-card ${
                                selected
                                    ? 'active'
                                    : ''
                            }"
                            data-item-id="${escapeHtml(
                                itemId
                            )}"
                        >
                            <img
                                src="${escapeHtml(
                                    item.image ||
                                    ''
                                )}"
                                alt="${escapeHtml(
                                    item.title ||
                                    ''
                                )}"
                            >

                            <div class="card-body">
                                <span class="muted">
                                    ${escapeHtml(
                                        item.categoryLabel ||
                                        'Outros'
                                    )}
                                </span>
                                <span class="market-status market-status-${escapeHtml(item.status || 'disponivel')}">${escapeHtml(marketplaceStatusLabel(item.status))}</span>

                                <h4>
                                    ${escapeHtml(
                                        item.title ||
                                        ''
                                    )}
                                </h4>

                                <p class="price">
                                    ${
                                        window.communityHub
                                            .formatCurrency(
                                                item.price
                                            )
                                    }
                                </p>

                                <p>
                                    ${escapeHtml(
                                        item.sellerUnit ||
                                        'Condomínio'
                                    )}
                                </p>
                            </div>

                            <div class="card-footer">
                                <small class="muted">
                                    ${
                                        window.communityHub
                                            .formatRelativeTime(
                                                item.createdAt
                                            )
                                    }
                                </small>

                                <button
                                    class="favorite-btn ${
                                        favorite
                                            ? 'active'
                                            : ''
                                    }"
                                    type="button"
                                    data-favorite-id="${escapeHtml(
                                        itemId
                                    )}"
                                    aria-label="Favoritar item"
                                >
                                    <i
                                        class="${
                                            favorite
                                                ? 'fas'
                                                : 'far'
                                        } fa-heart"
                                    ></i>
                                </button>
                            </div>
                        </article>
                    `;
                }
            )
            .join('');

    grid
        .querySelectorAll(
            '[data-item-id]'
        )
        .forEach(
            (card) => {
                card.addEventListener(
                    'click',
                    (event) => {
                        if (
                            event.target.closest(
                                '[data-favorite-id]'
                            )
                        ) {
                            return;
                        }

                        marketplaceState
                            .selectedItemId =
                            normalizeItemId(
                                card.dataset
                                    .itemId
                            );

                        renderMarketplacePage()
                            .catch(
                                (error) => {
                                    console.error(
                                        'Erro ao selecionar item:',
                                        error
                                    );
                                }
                            );
                    }
                );
            }
        );

    grid
        .querySelectorAll(
            '[data-favorite-id]'
        )
        .forEach(
            (button) => {
                button.addEventListener(
                    'click',
                    async (event) => {
                        event.stopPropagation();

                        const itemId =
                            normalizeItemId(
                                button.dataset
                                    .favoriteId
                            );

                        await togglePersistentMarketplaceFavorite(itemId);

                        renderMarketplacePage()
                            .catch(
                                (error) => {
                                    console.error(
                                        'Erro ao atualizar favoritos:',
                                        error
                                    );
                                }
                            );
                    }
                );
            }
        );
}

function renderMarketplaceDetail(
    items
) {
    const detail =
        document.getElementById(
            'marketplaceDetail'
        );

    if (!detail) {
        return;
    }

    const selected =
        items.find(
            (item) =>
                normalizeItemId(
                    item.id
                ) ===
                normalizeItemId(
                    marketplaceState
                        .selectedItemId
                )
        ) ||
        items[0];

    if (!selected) {
        detail.innerHTML =
            `
                <div class="empty-state">
                    <i class="fas fa-image"></i>
                    <p>
                        Selecione um item para ver os detalhes.
                    </p>
                </div>
            `;

        return;
    }

    marketplaceState
        .selectedItemId =
        normalizeItemId(
            selected.id
        );

    detail.innerHTML = `
        <img
            class="detail-image"
            src="${escapeHtml(
                selected.image ||
                ''
            )}"
            alt="${escapeHtml(
                selected.title ||
                ''
            )}"
        >

        <span class="detail-tag">
            <i class="fas fa-tag"></i>
            ${escapeHtml(
                selected.categoryLabel ||
                'Outros'
            )}
        </span>

        <h3>
            ${escapeHtml(
                selected.title ||
                ''
            )}
        </h3>

        <p class="detail-price">
            ${
                window.communityHub
                    .formatCurrency(
                        selected.price
                    )
            }
        </p>

        <div class="detail-meta">
            <span class="detail-tag market-status market-status-${escapeHtml(selected.status || 'disponivel')}"><i class="fas fa-tag"></i>${escapeHtml(marketplaceStatusLabel(selected.status))}</span>
            <span class="detail-tag">
                <i class="fas fa-location-dot"></i>
                ${escapeHtml(
                    selected.sellerUnit ||
                    'Condomínio'
                )}
            </span>

            <span class="detail-tag">
                <i class="fas fa-clock"></i>

                ${
                    window.communityHub
                        .formatRelativeTime(
                            selected.createdAt
                        )
                }
            </span>
        </div>

        <p class="detail-copy">
            ${escapeHtml(
                selected.description ||
                ''
            )}
        </p>

        <div class="seller-box">
            <div class="seller-avatar">
                ${
                    window.communityHub
                        .getInitials(
                            selected.seller
                        )
                }
            </div>

            <div>
                <strong>
                    ${escapeHtml(
                        selected.seller ||
                        'Morador'
                    )}
                </strong>

                <p>
                    ${escapeHtml(
                        selected.sellerUnit ||
                        'Condomínio'
                    )}
                </p>
            </div>
        </div>

        <div class="detail-actions">
            ${
                isOwnMarketplaceItem(selected)
                    ? `
                        <button
                            class="primary-action"
                            type="button"
                            id="editOwnMarketplaceItem"
                        >
                            <i class="fas fa-pen"></i>
                            Editar anúncio
                        </button>

                        <div class="marketplace-status-actions">
                            <button class="ghost-btn" type="button" data-own-status="disponivel">Disponível</button>
                            <button class="ghost-btn" type="button" data-own-status="reservado">Reservado</button>
                            <button class="ghost-btn" type="button" data-own-status="vendido">Vendido</button>
                            <button class="ghost-btn" type="button" data-own-status="doado">Doado</button>
                        </div>

                        <button
                            class="ghost-btn danger-action"
                            type="button"
                            id="deleteOwnMarketplaceItem"
                        >
                            <i class="fas fa-trash"></i>
                            Excluir anúncio
                        </button>
                    `
                    : `
                        <button
                            class="primary-action"
                            type="button"
                            id="contactMarketplaceSeller"
                        >
                            <i class="fas fa-comment-dots"></i>
                            Entrar em contato
                        </button>

                        <button
                            class="ghost-btn"
                            type="button"
                            id="whatsappMarketplaceSeller"
                        >
                            <i class="fab fa-whatsapp"></i>
                            WhatsApp
                        </button>
                    `
            }
        </div>
    `;

    detail
        .querySelector('#editOwnMarketplaceItem')
        ?.addEventListener('click', () => {
            openMarketplaceModal(selected);
        });

    detail.querySelectorAll('[data-own-status]').forEach(button => {
        button.addEventListener('click', async () => {
            try {
                await window.supabaseFetch(`/marketplace_items?id=eq.${encodeURIComponent(selected.dbId)}&seller_email=eq.${encodeURIComponent(String(marketplaceState.currentUser?.email || '').toLowerCase())}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({item_status:button.dataset.ownStatus}) });
                window.showToast?.('Status do anúncio atualizado.', 'success');
                await renderMarketplacePage();
            } catch (error) { window.showToast?.(error?.message || 'Não foi possível atualizar o status.', 'error'); }
        });
    });

    detail
        .querySelector('#deleteOwnMarketplaceItem')
        ?.addEventListener('click', async (event) => {
            await deleteOwnMarketplaceItem(selected, event.currentTarget);
        });

    detail.querySelector('#contactMarketplaceSeller')?.addEventListener('click', () => {
        const email=String(selected?.sellerEmail||'').trim().toLowerCase();
        if(!email){window.showToast?.('O anunciante não possui e-mail disponível.','warning');return;}
        sessionStorage.setItem('condomitChatTargetEmail',email);
        sessionStorage.setItem('condomitChatReturnUrl','marketplace.html');
        window.location.href='chat-moradores.html';
    });

    detail.querySelector('#whatsappMarketplaceSeller')?.addEventListener('click', async () => {
        const email=String(selected?.sellerEmail||'').trim().toLowerCase();
        if(!email){window.showToast?.('O anunciante não possui contato disponível.','warning');return;}
        try{
            let contact=null;
            for(const role of ['morador','sindico','porteiro']){
                try{
                    const rows=await window.supabaseFetch('/rpc/condomit_list_chat_contacts',{method:'POST',body:JSON.stringify({target_role:role})});
                    contact=(rows||[]).find(item=>String(item.email||'').trim().toLowerCase()===email)||contact;
                    if(contact)break;
                }catch(_){}
            }
            const phone=String(contact?.phone||'').replace(/\D/g,'');
            if(!phone)throw new Error('Telefone não cadastrado pelo anunciante.');
            const number=phone.startsWith('55')?phone:`55${phone}`;
            window.open(`https://wa.me/${number}?text=${encodeURIComponent('Olá! Vi seu anúncio no Marketplace do Condomit.')}`,'_blank','noopener');
        }catch(error){window.showToast?.(error?.message||'Não foi possível abrir o WhatsApp.','warning');}
    });
}

function marketplaceStatusLabel(value) {
    return ({disponivel:'Disponível',reservado:'Reservado',vendido:'Vendido',doado:'Doado',expirado:'Expirado'})[String(value||'').toLowerCase()] || 'Disponível';
}

async function togglePersistentMarketplaceFavorite(itemId) {
    const normalized = normalizeItemId(itemId);
    const dbId = Number(String(normalized).replace(/^db-mp-/, ''));
    if (!Number.isFinite(dbId)) { window.communityHub.toggleMarketplaceFavorite(normalized, marketplaceState.currentUser); return; }
    try {
        const existing = await window.supabaseFetch(`/marketplace_favorites?select=item_id&item_id=eq.${dbId}&limit=1`);
        if (Array.isArray(existing) && existing.length) {
            await window.supabaseFetch(`/marketplace_favorites?item_id=eq.${dbId}`, {method:'DELETE',headers:{Prefer:'return=minimal'}});
        } else {
            await window.supabaseFetch('/marketplace_favorites', {method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({item_id:dbId,user_email:marketplaceState.currentUser.email})});
        }
    } catch (_) {
        window.communityHub.toggleMarketplaceFavorite(normalized, marketplaceState.currentUser);
    }
}

function isOwnMarketplaceItem(item) {
    const currentEmail =
        String(
            marketplaceState.currentUser?.email ||
            ''
        )
            .trim()
            .toLowerCase();

    const sellerEmail =
        String(
            item?.sellerEmail ||
            ''
        )
            .trim()
            .toLowerCase();

    return Boolean(
        currentEmail &&
        sellerEmail &&
        currentEmail === sellerEmail
    );
}

function openMarketplaceModal(item = null) {
    const modal = document.getElementById('marketplaceModal');

    if (!modal) {
        return;
    }

    const isEditing = Boolean(item && isOwnMarketplaceItem(item));
    marketplaceState.editingDbId =
        isEditing
            ? Number(item.dbId)
            : null;

    const titleEl = modal.querySelector('.marketplace-modal-header h3');
    const subtitleEl = modal.querySelector('.marketplace-modal-header p');
    const submitButton = modal.querySelector('button[type="submit"]');

    if (titleEl) {
        titleEl.textContent =
            isEditing
                ? 'Editar anúncio'
                : 'Novo anúncio';
    }

    if (subtitleEl) {
        subtitleEl.textContent =
            isEditing
                ? 'Atualize as informações do seu anúncio.'
                : 'Publique um item para vender, doar ou negociar.';
    }

    const form = document.getElementById('marketplaceForm');
    form?.reset();
    resetMarketplaceImagePreview();

    if (isEditing) {
        const titleInput = document.getElementById('itemTitle');
        const categoryInput = document.getElementById('itemCategory');
        const priceInput = document.getElementById('itemPrice');
        const descriptionInput = document.getElementById('itemDescription');

        if (titleInput) titleInput.value = item.title || '';
        if (categoryInput) categoryInput.value = item.category || 'outros';
        if (priceInput) priceInput.value = Number(item.price || 0).toFixed(2);
        if (descriptionInput) descriptionInput.value = item.description || '';

        marketplaceState.draftImage = item.image || '';
        renderMarketplaceImagePreview();
    }

    if (submitButton) {
        submitButton.innerHTML =
            isEditing
                ? '<i class="fas fa-floppy-disk"></i> Salvar alterações'
                : 'Publicar anúncio';
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('marketplace-modal-open');

    window.requestAnimationFrame(() => {
        modal.querySelector('input, select, textarea, button')?.focus?.();
    });
}

function closeMarketplaceModal() {
    const modal = document.getElementById('marketplaceModal');

    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('marketplace-modal-open');

    document
        .getElementById(
            'marketplaceForm'
        )
        ?.reset();

    marketplaceState.editingDbId = null;
    resetMarketplaceImagePreview();
}

async function deleteOwnMarketplaceItem(item, triggerButton = null) {
    if (!item?.dbId || !isOwnMarketplaceItem(item)) {
        window.showToast?.(
            'Você só pode excluir anúncios publicados pela sua conta.',
            'warning'
        );
        return;
    }

    const confirmed =
        typeof window.showModal === 'function'
            ? await new Promise((resolve) => {
                window.showModal({
                    title: 'Excluir anúncio?',
                    message: `O anúncio "${item.title || 'selecionado'}" será removido permanentemente.`,
                    confirmText: 'Excluir',
                    cancelText: 'Cancelar',
                    type: 'warning',
                    onConfirm: () => resolve(true),
                    onCancel: () => resolve(false)
                });
            })
            : window.confirm('Deseja excluir este anúncio?');

    if (!confirmed) return;

    if (triggerButton?.dataset.deleteLoading === 'true') return;
    const originalButtonHtml = triggerButton?.innerHTML || '';
    if (triggerButton) {
        triggerButton.dataset.deleteLoading = 'true';
        triggerButton.disabled = true;
        triggerButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
    }

    try {
        await window.communityHub.deleteMarketplaceItem(
            item.dbId,
            marketplaceState.currentUser
        );
        marketplaceState.selectedItemId = null;
        const detail = document.getElementById('marketplaceDetail');
        if (detail) detail.innerHTML = '';
        await renderMarketplacePage();
        window.showToast?.(
            'Anúncio excluído com sucesso.',
            'success'
        );
    } catch (error) {
        console.error('Erro ao excluir anúncio:', error);
        window.showToast?.(
            error?.message ||
            'Não foi possível excluir o anúncio.',
            'error'
        );
    } finally {
        if (triggerButton?.isConnected) {
            triggerButton.dataset.deleteLoading = 'false';
            triggerButton.disabled = false;
            triggerButton.innerHTML = originalButtonHtml;
        }
    }
}

function handleMarketplaceImageChange(
    event
) {
    const file =
        event.target
            .files?.[0];

    if (!file) {
        resetMarketplaceImagePreview();

        return;
    }

    if (
        !file.type ||
        !file.type.startsWith(
            'image/'
        )
    ) {
        resetMarketplaceImagePreview();

        window.showToast?.(
            'Selecione um arquivo de imagem válido.',
            'warning'
        );

        return;
    }

    /*
     * Evita inserir imagens gigantes
     * como base64 no banco.
     */
    const maxSize =
        5 *
        1024 *
        1024;

    if (
        file.size >
        maxSize
    ) {
        resetMarketplaceImagePreview();

        window.showToast?.(
            'A imagem deve ter no máximo 5 MB.',
            'warning'
        );

        return;
    }

    const reader =
        new FileReader();

    reader.onload =
        () => {
            marketplaceState
                .draftImage =
                typeof reader.result ===
                    'string'
                    ? reader.result
                    : '';

            renderMarketplaceImagePreview();
        };

    reader.onerror =
        () => {
            resetMarketplaceImagePreview();

            window.showToast?.(
                'Não foi possível carregar a imagem.',
                'error'
            );
        };

    reader.readAsDataURL(
        file
    );
}

function renderMarketplaceImagePreview() {
    const card =
        document.getElementById(
            'itemImagePreviewCard'
        );

    const preview =
        document.getElementById(
            'itemImagePreview'
        );

    if (
        !card ||
        !preview
    ) {
        return;
    }

    if (
        !marketplaceState
            .draftImage
    ) {
        resetMarketplaceImagePreview();

        return;
    }

    preview.src =
        marketplaceState
            .draftImage;

    preview.style.display =
        'block';

    card.classList.add(
        'has-image'
    );
}

function resetMarketplaceImagePreview() {
    marketplaceState
        .draftImage =
        '';

    const input =
        document.getElementById(
            'itemImage'
        );

    const card =
        document.getElementById(
            'itemImagePreviewCard'
        );

    const preview =
        document.getElementById(
            'itemImagePreview'
        );

    if (input) {
        input.value = '';
    }

    if (preview) {
        preview.removeAttribute(
            'src'
        );

        preview.style.display =
            'none';
    }

    if (card) {
        card.classList.remove(
            'has-image'
        );
    }
}

function escapeHtml(text) {
    return String(
        text ?? ''
    )
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#39;'
        );
}

function logout() {
    if (
        typeof window
            .performFullLogout ===
        'function'
    ) {
        window
            .performFullLogout();

        return;
    }

    sessionStorage.removeItem(
        'condominiumUser'
    );

    try {
        localStorage.removeItem(
            'condominiumPersistentUser'
        );
    } catch (_) {}

    window.location.href =
        '../inicio.html';
}