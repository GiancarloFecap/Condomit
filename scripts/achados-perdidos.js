const lostFoundState = {
    currentUser: null,
    search: '',
    type: 'encontrado',
    status: 'todos',
    draftImage: '',
    matches: [],
    sort: 'recentes'
};

const LOST_FOUND_IMAGES = {
    chaves: '../assets/logo-icon.png',
    carteira: '../assets/logo-icon.png',
    celular: '../assets/logo-icon.png',
    mochila: '../assets/logo-icon.png',
    oculos: '../assets/logo-icon.png',
    fone: '../assets/logo-icon.png',
    garrafa: '../assets/logo-icon.png',
    pelucia: '../assets/logo-icon.png',
    default: '../assets/logo-icon.png'
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

    const userName = currentUser?.name || 'Usuário';
    const role = window.communityHub.getUserType(currentUser);
    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');

    if (profileNameTop) profileNameTop.textContent = userName;
    if (profileTypeTop) {
        profileTypeTop.textContent = role === 'sindico' ? 'Síndico' : role === 'porteiro' ? 'Porteiro' : 'Morador';
    }
    if (profileAvatarTop) {
        profileAvatarTop.textContent = userName
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || 'US';
    }

    try { window.syncAllAvatars?.(currentUser); } catch (_) {}
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

    document.getElementById('lostFoundSort')?.addEventListener('change', (event) => {
        lostFoundState.sort = event.target.value || 'recentes';
        renderLostFoundPage();
    });

    document.getElementById('clearLostFoundFilters')?.addEventListener('click', clearLostFoundFilters);

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
            dbId: row.id,
            title: row.item_name || '',
            description: row.item_name || '',
            location: row.location || '',
            date: row.item_date || new Date().toISOString().slice(0, 10),
            status: row.item_status === 'arquivado' ? 'arquivado' : 'disponivel',
            type: dbItemTypeToType(row.item_type),
            author: row.created_by || 'Condomínio',
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
      LOST_FOUND_IMAGES.default,

    created_by: lostFoundState.currentUser?.email || null
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
    try {
        await window.supabaseFetch('/rpc/condomit_archive_old_lost_found', {method:'POST',body:'{}'});
        await window.supabaseFetch('/rpc/condomit_suggest_lost_found_matches', {method:'POST',body:'{}'});
        const cep = getLostFoundUserCep();
        lostFoundState.matches = await window.supabaseFetch(`/lost_found_matches?select=*&cep=eq.${encodeURIComponent(cep)}&status=eq.sugerido&order=confidence.desc`).catch(()=>[]);
    } catch (_) { lostFoundState.matches = []; }

    const allItems = await getLostFoundItems();
    renderLostFoundHighlights(allItems);
    renderLostFoundMatchesPanel(allItems);

    const items = allItems.filter((item) => {
        const matchesType = lostFoundState.type === 'todos' || item.type === lostFoundState.type;
        const matchesStatus = lostFoundState.status === 'todos' || item.status === lostFoundState.status;
        const haystack = `${item.title} ${item.location} ${item.description} ${item.date}`.toLowerCase();
        const matchesSearch = !lostFoundState.search || haystack.includes(lostFoundState.search);
        return matchesType && matchesStatus && matchesSearch;
    });

    sortLostFoundItems(items);

    const title = document.getElementById('lostFoundSectionTitle');
    const count = document.getElementById('lostFoundCount');
    if (title) {
        title.textContent = lostFoundState.type === 'perdido'
            ? 'Itens perdidos'
            : lostFoundState.type === 'todos'
                ? 'Todos os itens'
                : 'Itens encontrados';
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
                    ${getSuggestedMatch(item) ? `<span class="match-chip"><i class="fas fa-wand-magic-sparkles"></i> Correspondência ${getSuggestedMatch(item).confidence}%</span>` : ''}
                </div>
                <p class="res-item-copy">${escapeHtml(item.description)}</p>
                <div class="res-item-meta">
                    <span><i class="fas fa-location-dot"></i>${escapeHtml(item.location)}</span>
                    <span><i class="fas fa-calendar-day"></i>${formatDate(item.date)}</span>
                </div>
                <div class="res-item-author"><i class="fas fa-user"></i><span>Registrado por ${escapeHtml(item.author || 'Condomínio')}</span></div>
            </div>
        </article>
    `).join('');
}

function getSuggestedMatch(item) {
    const id = Number(item?.dbId || String(item?.id || '').replace('db-lf-', ''));
    if (!Number.isFinite(id)) return null;
    return (Array.isArray(lostFoundState.matches) ? lostFoundState.matches : []).find(match => Number(match.lost_item_id) === id || Number(match.found_item_id) === id) || null;
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
    if (status === 'arquivado') return 'Arquivado';
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



function sortLostFoundItems(items) {
    if (!Array.isArray(items)) return [];
    if (lostFoundState.sort === 'antigos') {
        items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        return items;
    }
    if (lostFoundState.sort === 'az') {
        items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR'));
        return items;
    }
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
}

function clearLostFoundFilters() {
    lostFoundState.search = '';
    lostFoundState.type = 'todos';
    lostFoundState.status = 'todos';
    lostFoundState.sort = 'recentes';
    const search = document.getElementById('lostFoundSearch');
    const typeFilter = document.getElementById('lostFoundTypeFilter');
    const statusFilter = document.getElementById('lostFoundStatusFilter');
    const sort = document.getElementById('lostFoundSort');
    if (search) search.value = '';
    if (typeFilter) typeFilter.value = 'todos';
    if (statusFilter) statusFilter.value = 'todos';
    if (sort) sort.value = 'recentes';
    syncTypeCards();
    renderLostFoundPage();
}

function renderLostFoundHighlights(allItems) {
    const container = document.getElementById('lostFoundHighlights');
    if (!container) return;
    const found = allItems.filter((item) => item.type === 'encontrado').length;
    const lost = allItems.filter((item) => item.type === 'perdido').length;
    const returned = allItems.filter((item) => item.status === 'devolvido').length;
    const matches = Array.isArray(lostFoundState.matches) ? lostFoundState.matches.length : 0;
    container.innerHTML = `
        <article class="highlight-card">
            <span>Total de registros</span>
            <strong>${allItems.length}</strong>
            <small>Itens cadastrados neste condomínio</small>
        </article>
        <article class="highlight-card">
            <span>Encontrados</span>
            <strong>${found}</strong>
            <small>Itens aguardando identificação</small>
        </article>
        <article class="highlight-card">
            <span>Perdidos</span>
            <strong>${lost}</strong>
            <small>Objetos que ainda precisam ser localizados</small>
        </article>
        <article class="highlight-card">
            <span>Correspondências</span>
            <strong>${matches}</strong>
            <small>${returned} item(ns) já marcado(s) como devolvido(s)</small>
        </article>
    `;
}

function renderLostFoundMatchesPanel(allItems) {
    const panel = document.getElementById('lostFoundMatchesPanel');
    const list = document.getElementById('lostFoundMatchesList');
    if (!panel || !list) return;
    const matches = (Array.isArray(lostFoundState.matches) ? lostFoundState.matches : []).slice(0, 4);
    if (!matches.length) {
        panel.hidden = true;
        list.innerHTML = '';
        return;
    }
    const itemById = new Map(allItems.map((item) => [Number(item.dbId || String(item.id || '').replace('db-lf-', '')), item]));
    list.innerHTML = matches.map((match) => {
        const lostItem = itemById.get(Number(match.lost_item_id));
        const foundItem = itemById.get(Number(match.found_item_id));
        return `
            <article class="match-item">
                <strong>${escapeHtml(foundItem?.title || 'Item encontrado')} × ${escapeHtml(lostItem?.title || 'Item perdido')}</strong>
                <span>Confiança da IA: ${Number(match.confidence || 0)}%</span>
                <p>${escapeHtml(foundItem?.location || 'Local não informado')} · ${escapeHtml(lostItem?.location || 'Local não informado')}</p>
            </article>
        `;
    }).join('');
    panel.hidden = false;
}

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
    window.location.href = '../inicio.html';
}
