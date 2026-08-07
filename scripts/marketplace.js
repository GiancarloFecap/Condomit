const marketplaceState = {
    currentUser: null,
    search: '',
    category: 'todos',
    favoritesOnly: false,
    selectedItemId: null,
    draftImage: ''
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadMarketplaceUser();
    if (!currentUser) return;

    marketplaceState.currentUser = currentUser;
    setupMarketplaceShell(currentUser);
    setupMarketplaceActions();
    await renderMarketplacePage();
});

async function loadMarketplaceUser() {
    let user = window.communityHub?.getCurrentUser?.() || null;
    if (!user && typeof refreshCurrentUserFromDb === 'function') {
        user = await refreshCurrentUserFromDb().catch(() => null);
    }
    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }
    return user;
}

function setupMarketplaceShell(currentUser) {
    const sidebarSindico = document.getElementById('sidebarSindico');
    const sidebarMorador = document.getElementById('sidebarMorador');
    const isSindico = window.communityHub.getUserType(currentUser) === 'sindico';

    if (sidebarSindico) sidebarSindico.style.display = isSindico ? 'block' : 'none';
    if (sidebarMorador) sidebarMorador.style.display = isSindico ? 'none' : 'block';

    const sidebarApartment = document.getElementById('sidebarApartment');
    if (sidebarApartment) {
        sidebarApartment.innerHTML = window.communityHub.formatCondoName(
            window.communityHub.getCondominiumName(currentUser)
        );
    }

    document.getElementById('profileNameTop').textContent = currentUser.name || 'Usuário';
    document.getElementById('profileTypeTop').textContent = window.communityHub.getUserTypeLabel(currentUser);
    document.getElementById('profileAvatarTop').textContent = window.communityHub.getInitials(currentUser.name);
}

function setupMarketplaceActions() {
    document.getElementById('marketplaceSearch')?.addEventListener('input', async (event) => {
        marketplaceState.search = event.target.value.trim().toLowerCase();
        await renderMarketplacePage();
    });

    document.getElementById('marketplaceCategory')?.addEventListener('change', async (event) => {
        marketplaceState.category = event.target.value;
        await renderMarketplacePage();
    });

    document.getElementById('toggleFavoritesBtn')?.addEventListener('click', async () => {
        marketplaceState.favoritesOnly = !marketplaceState.favoritesOnly;
        await renderMarketplacePage();
    });

    document.getElementById('createItemBtn')?.addEventListener('click', openMarketplaceModal);
    document.getElementById('closeMarketplaceModal')?.addEventListener('click', closeMarketplaceModal);
    document.getElementById('cancelMarketplaceModal')?.addEventListener('click', closeMarketplaceModal);
    document.getElementById('itemImage')?.addEventListener('change', handleMarketplaceImageChange);
    document.getElementById('marketplaceModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'marketplaceModal') {
            closeMarketplaceModal();
        }
    });

    document.getElementById('marketplaceForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const category = document.getElementById('itemCategory').value;
        const categoryLabel = document.getElementById('itemCategory').selectedOptions[0]?.textContent || 'Outros';
        const title = document.getElementById('itemTitle').value.trim();
        const price = document.getElementById('itemPrice').value;
        const description = document.getElementById('itemDescription').value.trim();
        const image = marketplaceState.draftImage;

        if (!title || !description) return;

        const item = await window.communityHub.createMarketplaceItem({
            title,
            category,
            categoryLabel,
            price,
            description,
            image
        }, marketplaceState.currentUser);

        marketplaceState.selectedItemId = item.id;
        closeMarketplaceModal();
        event.target.reset();
        resetMarketplaceImagePreview();
        await renderMarketplacePage();
    });
}

async function renderMarketplacePage() {
    const allItems = await window.communityHub.getMarketplaceItems(marketplaceState.currentUser);
    const favorites = new Set(window.communityHub.getFavoriteMarketplaceItems(marketplaceState.currentUser));
    const filteredItems = allItems.filter((item) => {
        const matchesCategory = marketplaceState.category === 'todos' || item.category === marketplaceState.category;
        const haystack = `${item.title} ${item.description} ${item.categoryLabel} ${item.seller}`.toLowerCase();
        const matchesSearch = !marketplaceState.search || haystack.includes(marketplaceState.search);
        const matchesFavorite = !marketplaceState.favoritesOnly || favorites.has(item.id);
        return matchesCategory && matchesSearch && matchesFavorite;
    });

    if (!marketplaceState.selectedItemId && filteredItems.length) {
        marketplaceState.selectedItemId = filteredItems[0].id;
    }
    if (marketplaceState.selectedItemId && !filteredItems.some((item) => item.id === marketplaceState.selectedItemId)) {
        marketplaceState.selectedItemId = filteredItems[0]?.id || null;
    }

    renderMarketplaceShortcuts();
    renderMarketplaceGrid(filteredItems, favorites);
    renderMarketplaceDetail(filteredItems);
}

function renderMarketplaceShortcuts() {
    const container = document.getElementById('categoryShortcuts');
    if (!container) return;

    const categories = [
        { value: 'todos', label: 'Todos', icon: 'fa-border-all' },
        { value: 'moveis', label: 'Móveis', icon: 'fa-couch' },
        { value: 'eletrodomesticos', label: 'Eletrodomésticos', icon: 'fa-kitchen-set' },
        { value: 'eletronicos', label: 'Eletrônicos', icon: 'fa-tv' },
        { value: 'infantil', label: 'Infantil', icon: 'fa-puzzle-piece' },
        { value: 'esportes', label: 'Esportes', icon: 'fa-basketball' },
        { value: 'livros', label: 'Livros', icon: 'fa-book' },
        { value: 'outros', label: 'Outros', icon: 'fa-box-open' }
    ];

    container.innerHTML = categories.map((category) => `
        <button class="category-chip ${marketplaceState.category === category.value ? 'active' : ''}" type="button" data-category="${category.value}">
            <i class="fas ${category.icon}"></i>
            ${category.label}
        </button>
    `).join('');

    container.querySelectorAll('[data-category]').forEach((button) => {
        button.addEventListener('click', () => {
            marketplaceState.category = button.dataset.category;
            const select = document.getElementById('marketplaceCategory');
            if (select) select.value = marketplaceState.category;
            renderMarketplacePage();
        });
    });
}

function renderMarketplaceGrid(items, favorites) {
    const grid = document.getElementById('marketplaceGrid');
    const counter = document.getElementById('marketplaceCounter');
    const favoritesButton = document.getElementById('toggleFavoritesBtn');
    if (!grid) return;

    if (counter) {
        counter.textContent = `${items.length} ${items.length === 1 ? 'resultado' : 'resultados'}`;
    }

    if (favoritesButton) {
        favoritesButton.classList.toggle('active', marketplaceState.favoritesOnly);
    }

    if (!items.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-store-slash"></i><p>Nenhum item encontrado com esses filtros.</p></div>';
        return;
    }

    grid.innerHTML = items.map((item) => `
        <article class="product-card ${item.id === marketplaceState.selectedItemId ? 'active' : ''}" data-item-id="${item.id}">
            <img src="${item.image}" alt="${escapeHtml(item.title)}">
            <div class="card-body">
                <span class="muted">${escapeHtml(item.categoryLabel)}</span>
                <h4>${escapeHtml(item.title)}</h4>
                <p class="price">${window.communityHub.formatCurrency(item.price)}</p>
                <p>${escapeHtml(item.sellerUnit)}</p>
            </div>
            <div class="card-footer">
                <small class="muted">${window.communityHub.formatRelativeTime(item.createdAt)}</small>
                <button class="favorite-btn ${favorites.has(item.id) ? 'active' : ''}" type="button" data-favorite-id="${item.id}" aria-label="Favoritar item">
                    <i class="${favorites.has(item.id) ? 'fas' : 'far'} fa-heart"></i>
                </button>
            </div>
        </article>
    `).join('');

    grid.querySelectorAll('[data-item-id]').forEach((card) => {
        card.addEventListener('click', (event) => {
            if (event.target.closest('[data-favorite-id]')) return;
            marketplaceState.selectedItemId = card.dataset.itemId;
            renderMarketplacePage();
        });
    });

    grid.querySelectorAll('[data-favorite-id]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            window.communityHub.toggleMarketplaceFavorite(button.dataset.favoriteId, marketplaceState.currentUser);
            renderMarketplacePage();
        });
    });
}

function renderMarketplaceDetail(items) {
    const detail = document.getElementById('marketplaceDetail');
    if (!detail) return;

    const selected = items.find((item) => item.id === marketplaceState.selectedItemId) || items[0];
    if (!selected) {
        detail.innerHTML = '<div class="empty-state"><i class="fas fa-image"></i><p>Selecione um item para ver os detalhes.</p></div>';
        return;
    }

    detail.innerHTML = `
        <img class="detail-image" src="${selected.image}" alt="${escapeHtml(selected.title)}">
        <span class="detail-tag"><i class="fas fa-tag"></i>${escapeHtml(selected.categoryLabel)}</span>
        <h3>${escapeHtml(selected.title)}</h3>
        <p class="detail-price">${window.communityHub.formatCurrency(selected.price)}</p>
        <div class="detail-meta">
            <span class="detail-tag"><i class="fas fa-location-dot"></i>${escapeHtml(selected.sellerUnit)}</span>
            <span class="detail-tag"><i class="fas fa-clock"></i>${window.communityHub.formatRelativeTime(selected.createdAt)}</span>
        </div>
        <p class="detail-copy">${escapeHtml(selected.description)}</p>
        <div class="seller-box">
            <div class="seller-avatar">${window.communityHub.getInitials(selected.seller)}</div>
            <div>
                <strong>${escapeHtml(selected.seller)}</strong>
                <p>${escapeHtml(selected.sellerUnit)}</p>
            </div>
        </div>
        <div class="detail-actions">
            <button class="primary-action" type="button">
                <i class="fas fa-comment-dots"></i>
                Entrar em contato
            </button>
            <button class="ghost-btn" type="button">
                <i class="fab fa-whatsapp"></i>
                WhatsApp
            </button>
        </div>
    `;
}

function openMarketplaceModal() {
    document.getElementById('marketplaceModal')?.classList.add('open');
}

function closeMarketplaceModal() {
    document.getElementById('marketplaceModal')?.classList.remove('open');
    document.getElementById('marketplaceForm')?.reset();
    resetMarketplaceImagePreview();
}

function handleMarketplaceImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
        resetMarketplaceImagePreview();
        return;
    }

    if (!file.type.startsWith('image/')) {
        resetMarketplaceImagePreview();
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        marketplaceState.draftImage = typeof reader.result === 'string' ? reader.result : '';
        renderMarketplaceImagePreview();
    };
    reader.readAsDataURL(file);
}

function renderMarketplaceImagePreview() {
    const card = document.getElementById('itemImagePreviewCard');
    const preview = document.getElementById('itemImagePreview');
    if (!card || !preview) return;

    if (!marketplaceState.draftImage) {
        resetMarketplaceImagePreview();
        return;
    }

    preview.src = marketplaceState.draftImage;
    preview.style.display = 'block';
    card.classList.add('has-image');
}

function resetMarketplaceImagePreview() {
    marketplaceState.draftImage = '';
    const input = document.getElementById('itemImage');
    const card = document.getElementById('itemImagePreviewCard');
    const preview = document.getElementById('itemImagePreview');

    if (input) input.value = '';
    if (preview) {
        preview.removeAttribute('src');
        preview.style.display = 'none';
    }
    if (card) {
        card.classList.remove('has-image');
    }
}

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
