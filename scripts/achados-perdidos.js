const lostFoundState = {
    currentUser: null,
    search: '',
    type: 'encontrado',
    status: 'todos',
    draftImage: ''
};

const LOST_FOUND_IMAGES = {
    chaves: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20photo%20of%20car%20keys%20and%20house%20keys%20on%20a%20neutral%20surface%2C%20soft%20light&image_size=landscape_4_3',
    carteira: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20brown%20leather%20wallet%20on%20clean%20light%20background%2C%20product%20photo&image_size=landscape_4_3',
    celular: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20black%20smartphone%20on%20minimal%20light%20surface%2C%20product%20photo&image_size=landscape_4_3',
    mochila: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20black%20backpack%20studio%20photo%20on%20light%20background&image_size=landscape_4_3',
    oculos: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20eyeglasses%20on%20clean%20light%20surface%2C%20product%20photo&image_size=landscape_4_3',
    fone: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20wireless%20earbuds%20charging%20case%20on%20light%20surface%2C%20product%20photo&image_size=landscape_4_3',
    garrafa: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20metal%20water%20bottle%20on%20clean%20neutral%20background%2C%20product%20photo&image_size=landscape_4_3',
    pelucia: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20teddy%20bear%20toy%20on%20soft%20light%20background%2C%20product%20photo&image_size=landscape_4_3',
    default: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=realistic%20lost%20and%20found%20item%20on%20clean%20light%20background%2C%20product%20photo&image_size=landscape_4_3'
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadLostFoundUser();
    if (!currentUser) return;

    lostFoundState.currentUser = currentUser;
    setupLostFoundShell(currentUser);
    setupLostFoundActions();
    renderLostFoundPage();
});

async function loadLostFoundUser() {
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

function setupLostFoundShell(currentUser) {
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
}

function setupLostFoundActions() {
    document.getElementById('lostFoundSearch')?.addEventListener('input', (event) => {
        lostFoundState.search = event.target.value.trim().toLowerCase();
        renderLostFoundPage();
    });

    document.getElementById('lostFoundTypeFilter')?.addEventListener('change', (event) => {
        const value = event.target.value;
        lostFoundState.type = value === 'todos' ? 'todos' : value;
        syncTypeCards();
        renderLostFoundPage();
    });

    document.getElementById('lostFoundStatusFilter')?.addEventListener('change', (event) => {
        lostFoundState.status = event.target.value;
        renderLostFoundPage();
    });

    document.querySelectorAll('[data-type]').forEach((button) => {
        button.addEventListener('click', () => {
            lostFoundState.type = button.dataset.type;
            const typeFilter = document.getElementById('lostFoundTypeFilter');
            if (typeFilter) typeFilter.value = button.dataset.type;
            syncTypeCards();
            renderLostFoundPage();
        });
    });

    document.getElementById('createLostFoundBtn')?.addEventListener('click', openLostFoundModal);
    document.getElementById('closeLostFoundModal')?.addEventListener('click', closeLostFoundModal);
    document.getElementById('cancelLostFoundModal')?.addEventListener('click', closeLostFoundModal);
    document.getElementById('lostFoundImage')?.addEventListener('change', handleLostFoundImageChange);

    document.getElementById('lostFoundModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'lostFoundModal') {
            closeLostFoundModal();
        }
    });

    document.getElementById('lostFoundForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveLostFoundItem();
    });
}

function getLostFoundStorageKey(user = lostFoundState.currentUser) {
    const condoKey = window.communityHub?.getCondominiumKey?.(user) || 'geral';
    return `condomit.lostfound.${condoKey}`;
}

function getDefaultLostFoundItems() {
    return [];
}

function typeToDbItemType(type) {
    return type === 'perdido' ? 'Perdido' : 'Encontrado';
}

function dbItemTypeToType(dbType) {
    return dbType === 'Perdido' ? 'perdido' : 'encontrado';
}

function normalizeLostFoundCepForDb(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 8) return String(value || '').trim();
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function getLostFoundUserCep() {
    const user = lostFoundState.currentUser;
    const condominium = user?.condominium || {};
    const candidates = [
        condominium?.cep,
        condominium?.condominium_cep,
        condominium?.condominium_id,
        condominium?.condominiumId,
        user?.cep,
        user?.condominium_cep,
        user?.condominium_id,
        user?.condominiumId,
        window.communityHub?.getCondominiumKey?.(user)
    ];
    if (typeof window.getUserCondominiumIdentifiers === 'function') {
        const ids = window.getUserCondominiumIdentifiers(user) || [];
        for (const id of ids) {
            if (id && typeof id === 'string') candidates.unshift(id);
        }
    }
    for (const c of candidates) {
        if (!c || typeof c !== 'string') continue;
        const normalized = normalizeLostFoundCepForDb(c);
        if (normalized) return normalized;
    }
    return '';
}

async function fetchLostFoundFromSupabase() {
    if (typeof window.supabaseFetch !== 'function') return [];
    const cep = getLostFoundUserCep();
    if (!cep) return [];
    try {
        const rows = await window.supabaseFetch(`/lost_and_found_items?select=*&cep=eq.${encodeURIComponent(cep)}&order=item_date.desc,created_at.desc`);
        if (!Array.isArray(rows)) return [];
        return rows.map((row) => ({
            id: `db-lf-${row.id}`,
            title: row.item_name || '',
            description: row.item_name || '',
            location: row.location || '',
            date: row.item_date || new Date().toISOString().slice(0, 10),
            status: 'disponivel',
            type: dbItemTypeToType(row.item_type),
            author: 'Condomínio',
            image: row.image_url || LOST_FOUND_IMAGES.default
        }));
    } catch (err) {
        console.warn('fetchLostFoundFromSupabase falhou:', err?.message || err);
        return [];
    }
}

async function saveLostFoundToSupabase(
  item
) {
  if (
    typeof window.supabaseFetch !==
    'function'
  ) {
    throw new Error(
      'Supabase não está disponível nesta página.'
    );
  }

  const cep =
    getLostFoundUserCep();

  if (!cep) {
    throw new Error(
      'Não foi possível identificar o condomínio do usuário.'
    );
  }

  const payload = {
    cep,

    item_type:
      typeToDbItemType(
        item.type
      ),

    item_name:
      String(
        item.title || ''
      ).trim(),

    location:
      String(
        item.location || ''
      ).trim(),

    item_date:
      String(
        item.date ||
        new Date()
          .toISOString()
          .slice(0, 10)
      ),

    image_url:
      item.image ||
      LOST_FOUND_IMAGES.default
  };

  const rows =
    await window.supabaseFetch(
      '/lost_and_found_items',
      {
        method: 'POST',

        body:
          JSON.stringify(payload),

        headers: {
          'Content-Type':
            'application/json',

          Prefer:
            'return=representation'
        }
      }
    );

  if (
    !Array.isArray(rows) ||
    !rows.length ||
    !rows[0]?.id
  ) {
    throw new Error(
      'O Supabase não confirmou o salvamento do registro.'
    );
  }

  return rows[0];
}

async function getLostFoundItems() {
    const key = getLostFoundStorageKey();
    let localItems = [];
    try {
        localItems = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (_) {
        localItems = [];
    }
    if (!Array.isArray(localItems)) localItems = [];
    const remoteItems = await fetchLostFoundFromSupabase();
    const seen = new Set();
    const merged = [];
    for (const item of [...remoteItems, ...localItems]) {
        const k = `${String(item.title || '').trim().toLowerCase()}|${String(item.location || '').trim().toLowerCase()}|${String(item.date || '')}`;
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(item);
    }
    return merged.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function setLostFoundItems(items) {
    localStorage.setItem(getLostFoundStorageKey(), JSON.stringify(items));
}

async function renderLostFoundPage() {
    const items = (await getLostFoundItems()).filter((item) => {
        const matchesType = lostFoundState.type === 'todos' || item.type === lostFoundState.type;
        const matchesStatus = lostFoundState.status === 'todos' || item.status === lostFoundState.status;
        const haystack = `${item.title} ${item.location} ${item.description} ${item.date}`.toLowerCase();
        const matchesSearch = !lostFoundState.search || haystack.includes(lostFoundState.search);
        return matchesType && matchesStatus && matchesSearch;
    });

    const title = document.getElementById('lostFoundSectionTitle');
    const count = document.getElementById('lostFoundCount');
    if (title) {
        title.textContent = lostFoundState.type === 'perdido' ? 'Itens perdidos' : 'Itens encontrados';
    }
    if (count) {
        count.textContent = `${items.length} ${items.length === 1 ? 'resultado' : 'resultados'}`;
    }

    renderLostFoundGrid(items);
}

function renderLostFoundGrid(items) {
    const grid = document.getElementById('lostFoundGrid');
    if (!grid) return;

    if (!items.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>Nenhum item encontrado com esses filtros.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = items.map((item) => `
        <article class="res-item-card">
            <img class="res-item-image" src="${item.image || LOST_FOUND_IMAGES.default}" alt="${escapeHtml(item.title)}">
            <div class="res-item-body">
                <div class="res-item-top">
                    <h3>${escapeHtml(item.title)}</h3>
                    <span class="status-chip ${item.status}">
                        ${getStatusLabel(item.status)}
                    </span>
                </div>
                <p class="res-item-copy">${escapeHtml(item.description)}</p>
                <div class="res-item-meta">
                    <span><i class="fas fa-location-dot"></i>${escapeHtml(item.location)}</span>
                    <span><i class="fas fa-calendar-day"></i>${formatDate(item.date)}</span>
                </div>
            </div>
        </article>
    `).join('');
}

function syncTypeCards() {
    document.querySelectorAll('[data-type]').forEach((button) => {
        button.classList.toggle('active', button.dataset.type === lostFoundState.type);
    });
}

function openLostFoundModal() {
    document.getElementById('lostFoundModal')?.classList.add('open');
}

function closeLostFoundModal() {
    document.getElementById('lostFoundModal')?.classList.remove('open');
    document.getElementById('lostFoundForm')?.reset();
    resetLostFoundPreview();
}

function handleLostFoundImageChange(event) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
        resetLostFoundPreview();
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        lostFoundState.draftImage = typeof reader.result === 'string' ? reader.result : '';
        renderLostFoundPreview();
    };
    reader.readAsDataURL(file);
}

function renderLostFoundPreview() {
    const card = document.getElementById('lostFoundPreviewCard');
    const image = document.getElementById('lostFoundPreviewImage');
    if (!card || !image || !lostFoundState.draftImage) return;
    image.src = lostFoundState.draftImage;
    card.classList.add('has-image');
}

function resetLostFoundPreview() {
    lostFoundState.draftImage = '';
    const image = document.getElementById('lostFoundPreviewImage');
    const card = document.getElementById('lostFoundPreviewCard');
    const input = document.getElementById('lostFoundImage');
    if (image) image.removeAttribute('src');
    if (card) card.classList.remove('has-image');
    if (input) input.value = '';
}

async function saveLostFoundItem() {
    const title = document.getElementById('lostFoundTitle')?.value.trim();
    const type = document.getElementById('lostFoundTypeInput')?.value || 'encontrado';
    const location = document.getElementById('lostFoundLocation')?.value.trim();
    const date = document.getElementById('lostFoundDate')?.value;
    const description = document.getElementById('lostFoundDescription')?.value.trim();

    if (!title || !location || !date || !description) return;

    const draftItem = {
        title,
        type,
        location,
        date,
        description,
        status: 'disponivel',
        author: lostFoundState.currentUser?.name || 'Usuário',
        image: lostFoundState.draftImage || LOST_FOUND_IMAGES.default
    };
    const saved = await saveLostFoundToSupabase(draftItem);
    const key = getLostFoundStorageKey();
    let items = [];
    try { items = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { items = []; }
    if (!Array.isArray(items)) items = [];
    items.unshift({
        id: saved && saved.id ? `db-lf-${saved.id}` : `lf-${Date.now()}`,
        title,
        type,
        location,
        date: saved && saved.item_date ? saved.item_date : date,
        description,
        status: 'disponivel',
        author: lostFoundState.currentUser?.name || 'Usuário',
        image: saved && saved.image_url ? saved.image_url : draftItem.image
    });
    setLostFoundItems(items);

    lostFoundState.type = type;
    const typeFilter = document.getElementById('lostFoundTypeFilter');
    if (typeFilter) typeFilter.value = type;
    syncTypeCards();
    closeLostFoundModal();
    await renderLostFoundPage();
}

function getStatusLabel(status) {
    if (status === 'devolvido') return 'Devolvido';
    if (status === 'em-analise') return 'Em análise';
    return 'Disponível';
}

function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    if (isNaN(date.getTime())) return 'Data não informada';
    return date.toLocaleDateString('pt-BR');
}

function escapeHtml(text) {
    return String(text || '')
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
