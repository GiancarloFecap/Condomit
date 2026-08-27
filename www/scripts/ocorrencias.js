const occurrenceState = {
    currentUser: null,
    userType: 'morador',
    cep: '',
    myOccurrences: [],
    allOccurrences: [],
    allLoaded: false,
    saving: false,
    signature: {
        drawing: false,
        hasInk: false,
        lastX: 0,
        lastY: 0
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = await loadOccurrenceUser();
    if (!user) return;

    occurrenceState.currentUser = user;
    occurrenceState.userType = normalizeOccurrenceUserType(user);
    occurrenceState.cep = await resolveOccurrenceCep(user);

    if (!occurrenceState.cep) {
        occurrenceToast('Não foi possível identificar o condomínio da sua conta.', 'error');
    }

    setupOccurrenceShell(user);
    setupOccurrenceActions();
    setupSignatureCanvas();
    prepareOccurrenceForm();
});

async function loadOccurrenceUser() {
    let user = null;

    try {
        user = typeof window.refreshCurrentUserFromDb === 'function'
            ? await window.refreshCurrentUserFromDb()
            : JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
    } catch (error) {
        console.warn('[OCORRÊNCIAS] Falha ao atualizar usuário:', error);
    }

    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }

    return user;
}

function normalizeOccurrenceUserType(user) {
    const normalized = typeof window.getNormalizedUserType === 'function'
        ? window.getNormalizedUserType(user)
        : String(user?.type || user?.user_type || 'morador').trim().toLowerCase();

    if (String(normalized).startsWith('sind') || normalized === 'síndico') return 'sindico';
    if (String(normalized).startsWith('porteir')) return 'porteiro';
    return 'morador';
}

async function resolveOccurrenceCep(user) {
    if (typeof window.resolveUserCondominiumCep === 'function') {
        try {
            const resolved = await window.resolveUserCondominiumCep(user);
            if (resolved) return normalizeCep(resolved);
        } catch (_) {}
    }

    let condominium = user?.condominium || {};
    if (typeof condominium === 'string') {
        try { condominium = JSON.parse(condominium); } catch (_) { condominium = {}; }
    }

    return normalizeCep(
        condominium?.cep ||
        condominium?.condominium_id ||
        condominium?.condominium_cep ||
        user?.cep ||
        user?.condominium_cep ||
        user?.condominium_id ||
        ''
    );
}

function normalizeCep(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : String(value || '').trim();
}

function setupOccurrenceShell(user) {
    const name = user?.name || 'Usuário';
    const role = occurrenceRoleLabel(occurrenceState.userType);

    const nameEl = document.getElementById('profileNameTop');
    const roleEl = document.getElementById('profileTypeTop');
    const avatarEl = document.getElementById('profileAvatarTop');

    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = role;
    if (avatarEl) avatarEl.textContent = getInitials(name);
    window.syncAllAvatars?.(user);

    const myOccurrencesButton = document.getElementById('openMyOccurrencesBtn');
    if (myOccurrencesButton) {
        myOccurrencesButton.hidden = false;
        myOccurrencesButton.disabled = false;
        myOccurrencesButton.removeAttribute('aria-hidden');
    }

    const syndicButton = document.getElementById('openAllOccurrencesBtn');
    if (syndicButton) {
        const canViewCondominiumOccurrences = occurrenceState.userType === 'sindico';
        syndicButton.hidden = !canViewCondominiumOccurrences;
        syndicButton.disabled = !canViewCondominiumOccurrences;
        syndicButton.setAttribute('aria-hidden', String(!canViewCondominiumOccurrences));
        syndicButton.style.display = canViewCondominiumOccurrences ? '' : 'none';
        syndicButton.tabIndex = canViewCondominiumOccurrences ? 0 : -1;
    }

    document.querySelector('.occurrence-actions')?.classList.toggle('is-syndic', occurrenceState.userType === 'sindico');
}

function setupOccurrenceActions() {
    document.getElementById('openRegisterOccurrenceBtn')?.addEventListener('click', () => {
        prepareOccurrenceForm();
        openOccurrenceModal('registerOccurrenceModal');
        window.setTimeout(resizeSignatureCanvas, 40);
    });

    document.getElementById('openMyOccurrencesBtn')?.addEventListener('click', async () => {
        openOccurrenceModal('myOccurrencesModal');
        await loadMyOccurrences();
    });

    document.getElementById('openAllOccurrencesBtn')?.addEventListener('click', async () => {
        if (occurrenceState.userType !== 'sindico') return;
        const section = document.getElementById('syndicOccurrencesSection');
        if (!section) return;

        const shouldOpen = section.hidden;
        setAllOccurrencesSectionOpen(shouldOpen);
        if (shouldOpen) {
            await loadAllOccurrences();
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    document.getElementById('closeAllOccurrencesBtn')?.addEventListener('click', () => {
        setAllOccurrencesSectionOpen(false);
    });

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => closeOccurrenceModal(button.dataset.closeModal));
    });

    document.querySelectorAll('.occurrence-modal-backdrop').forEach((backdrop) => {
        backdrop.addEventListener('mousedown', (event) => {
            if (event.target === backdrop) closeOccurrenceModal(backdrop.id);
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const openModal = document.querySelector('.occurrence-modal-backdrop.is-open');
        if (openModal) closeOccurrenceModal(openModal.id);
    });

    document.getElementById('occurrenceForm')?.addEventListener('submit', saveOccurrence);

    document.getElementById('occurrenceDescription')?.addEventListener('input', (event) => {
        const count = document.getElementById('occurrenceDescriptionCount');
        if (count) count.textContent = String(event.target.value.length);
    });

    document.getElementById('clearSignatureBtn')?.addEventListener('click', clearSignature);

    document.getElementById('allOccurrencesSearch')?.addEventListener('input', renderAllOccurrences);
    document.getElementById('allOccurrencesRoleFilter')?.addEventListener('change', renderAllOccurrences);
    document.getElementById('allOccurrencesPeriodFilter')?.addEventListener('change', renderAllOccurrences);
    document.getElementById('clearOccurrenceFiltersBtn')?.addEventListener('click', clearOccurrenceFilters);
}

function setAllOccurrencesSectionOpen(isOpen) {
    if (occurrenceState.userType !== 'sindico') return;

    const section = document.getElementById('syndicOccurrencesSection');
    const button = document.getElementById('openAllOccurrencesBtn');
    if (!section) return;

    section.hidden = !isOpen;
    section.setAttribute('aria-hidden', String(!isOpen));

    if (button) {
        button.setAttribute('aria-expanded', String(isOpen));
        button.classList.toggle('is-expanded', isOpen);
        const label = button.querySelector('.action-copy strong');
        const description = button.querySelector('.action-copy small');
        const arrow = button.querySelector('.action-arrow');
        if (label) label.textContent = isOpen ? 'Recolher ocorrências' : 'Ver ocorrências';
        if (description) description.textContent = isOpen
            ? 'Feche a consulta de registros do condomínio.'
            : 'Consulte os registros do condomínio com busca e filtros.';
        if (arrow) {
            arrow.classList.toggle('fa-chevron-right', !isOpen);
            arrow.classList.toggle('fa-chevron-up', isOpen);
        }
    }

    if (typeof window.applyGlobalAppLanguage === 'function') {
        window.applyGlobalAppLanguage();
    }
}

function openOccurrenceModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeOccurrenceModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');

    if (!document.querySelector('.occurrence-modal-backdrop.is-open')) {
        document.body.classList.remove('modal-open');
    }
}

function prepareOccurrenceForm() {
    const form = document.getElementById('occurrenceForm');
    if (!form) return;

    const now = new Date();
    const user = occurrenceState.currentUser || {};

    setInputValue('registrationDate', formatDateBr(now));
    setInputValue('registrationTime', formatTime(now));
    setInputValue('occurrenceResponsibleName', user.name || 'Usuário');
    setInputValue('occurrenceResponsibleRole', occurrenceRoleLabel(occurrenceState.userType));

    const occurrenceDate = document.getElementById('occurrenceDate');
    const occurrenceTime = document.getElementById('occurrenceTime');
    if (occurrenceDate && !occurrenceDate.value) occurrenceDate.value = toDateInputValue(now);
    if (occurrenceTime && !occurrenceTime.value) occurrenceTime.value = formatTime(now);

    const count = document.getElementById('occurrenceDescriptionCount');
    if (count) count.textContent = String(document.getElementById('occurrenceDescription')?.value.length || 0);
}

function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value;
}

async function loadMyOccurrences() {
    const list = document.getElementById('myOccurrencesList');
    const counter = document.getElementById('myOccurrencesCounter');

    if (list) list.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Carregando ocorrências...</div>';
    if (counter) counter.textContent = 'Carregando...';

    try {
        const email = String(occurrenceState.currentUser?.email || '').trim();
        if (!email) throw new Error('Não foi possível identificar o e-mail do usuário.');

        const rows = await fetchOccurrences(
            `&reporter_email=eq.${encodeURIComponent(email)}`
        );

        occurrenceState.myOccurrences = rows;
        renderMyOccurrences();
    } catch (error) {
        console.error('[OCORRÊNCIAS] Minhas ocorrências:', error);
        if (counter) counter.textContent = 'Não foi possível carregar os registros.';
        if (list) list.innerHTML = renderEmptyState('Não foi possível carregar suas ocorrências.', 'fa-triangle-exclamation');
        occurrenceToast(error.message || 'Erro ao carregar suas ocorrências.', 'error');
    }
}

async function loadAllOccurrences(force = false) {
    if (occurrenceState.userType !== 'sindico') return;
    if (occurrenceState.allLoaded && !force) {
        renderAllOccurrences();
        return;
    }

    const tbody = document.getElementById('allOccurrencesTableBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="fas fa-spinner fa-spin"></i> Carregando ocorrências...</td></tr>';

    try {
        const cepFilter = occurrenceState.cep
            ? `&cep=eq.${encodeURIComponent(occurrenceState.cep)}`
            : '';
        occurrenceState.allOccurrences = await fetchOccurrences(cepFilter);
        occurrenceState.allLoaded = true;
        renderAllOccurrences();
    } catch (error) {
        console.error('[OCORRÊNCIAS] Todas as ocorrências:', error);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Não foi possível carregar as ocorrências.</td></tr>';
        const counter = document.getElementById('allOccurrencesCounter');
        if (counter) counter.textContent = 'Não foi possível carregar os registros.';
        occurrenceToast(error.message || 'Erro ao carregar ocorrências.', 'error');
    }
}

async function fetchOccurrences(extraQuery = '') {
    if (typeof window.supabaseFetch !== 'function') {
        throw new Error('A conexão com o Supabase não está disponível nesta página.');
    }

    const query = `/occurrences?select=id,cep,reporter_email,reporter_name,reporter_role,occurrence_date,occurrence_time,unit_involved,occurrence_author,description,signature_data,created_at&order=created_at.desc${extraQuery}`;
    const rows = await window.supabaseFetch(query);
    return Array.isArray(rows) ? rows : [];
}

async function saveOccurrence(event) {
    event.preventDefault();
    if (occurrenceState.saving) return;

    if (!occurrenceState.signature.hasInk) {
        const errorEl = document.getElementById('signatureError');
        if (errorEl) errorEl.hidden = false;
        occurrenceToast('Faça sua assinatura antes de registrar a ocorrência.', 'warning');
        return;
    }

    if (!occurrenceState.cep) {
        occurrenceToast('Não foi possível identificar o condomínio da sua conta.', 'error');
        return;
    }

    const occurrenceDate = document.getElementById('occurrenceDate')?.value || '';
    const occurrenceTime = document.getElementById('occurrenceTime')?.value || '';
    const unit = document.getElementById('occurrenceUnit')?.value.trim() || '';
    const author = document.getElementById('occurrenceAuthor')?.value.trim() || '';
    const description = document.getElementById('occurrenceDescription')?.value.trim() || '';

    if (!occurrenceDate || !occurrenceTime || !description) {
        occurrenceToast('Preencha a data, a hora e a descrição da ocorrência.', 'warning');
        return;
    }

    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) {
        occurrenceToast('A área de assinatura não está disponível.', 'error');
        return;
    }

    occurrenceState.saving = true;
    const submitButton = document.getElementById('saveOccurrenceBtn');
    const originalButton = submitButton?.innerHTML || '';

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
    }

    try {
        const payload = {
            cep: occurrenceState.cep,
            reporter_email: occurrenceState.currentUser?.email || '',
            reporter_name: occurrenceState.currentUser?.name || 'Usuário',
            reporter_role: occurrenceState.userType,
            occurrence_date: occurrenceDate,
            occurrence_time: occurrenceTime,
            unit_involved: unit || null,
            occurrence_author: author || null,
            description,
            signature_data: canvas.toDataURL('image/png')
        };

        const rows = await window.supabaseFetch('/occurrences', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(payload)
        });

        const created = Array.isArray(rows) ? rows[0] : rows;
        if (!created?.id) {
            throw new Error('O banco de dados não confirmou o registro da ocorrência.');
        }

        occurrenceState.myOccurrences = [created, ...occurrenceState.myOccurrences.filter((item) => item.id !== created.id)];
        occurrenceState.allOccurrences = [created, ...occurrenceState.allOccurrences.filter((item) => item.id !== created.id)];
        occurrenceState.allLoaded = occurrenceState.userType === 'sindico' ? occurrenceState.allLoaded : false;

        closeOccurrenceModal('registerOccurrenceModal');
        resetOccurrenceForm();
        if (occurrenceState.userType === 'sindico' && occurrenceState.allLoaded) renderAllOccurrences();
        occurrenceToast('Ocorrência registrada com sucesso.', 'success');
    } catch (error) {
        console.error('[OCORRÊNCIAS] Salvar:', error);
        occurrenceToast(
            formatOccurrenceDatabaseError(error),
            'error'
        );
    } finally {
        occurrenceState.saving = false;
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButton || '<i class="fas fa-floppy-disk"></i> Registrar ocorrência';
        }
    }
}

function formatOccurrenceDatabaseError(error) {
    const message = String(error?.message || 'Não foi possível registrar a ocorrência.');
    if (/relation .*occurrences.* does not exist|Could not find the table.*occurrences|schema cache/i.test(message)) {
        return 'A tabela de ocorrências ainda não foi criada no Supabase. Execute a migration 015_occurrences.sql e tente novamente.';
    }
    if (/row-level security|policy|42501/i.test(message)) {
        return 'O Supabase bloqueou o registro por segurança. Confirme que a migration 015 foi executada e entre novamente na conta.';
    }
    return message;
}

function resetOccurrenceForm() {
    const form = document.getElementById('occurrenceForm');
    if (!form) return;

    form.reset();
    clearSignature();
    const count = document.getElementById('occurrenceDescriptionCount');
    if (count) count.textContent = '0';
    prepareOccurrenceForm();
}

function renderMyOccurrences() {
    const list = document.getElementById('myOccurrencesList');
    const counter = document.getElementById('myOccurrencesCounter');
    if (!list || !counter) return;

    const rows = occurrenceState.myOccurrences;
    counter.textContent = rows.length === 1 ? '1 ocorrência registrada por você.' : `${rows.length} ocorrências registradas por você.`;

    if (!rows.length) {
        list.innerHTML = renderEmptyState('Você ainda não registrou nenhuma ocorrência.', 'fa-clipboard');
        return;
    }

    list.innerHTML = rows.map((row) => `
        <article class="my-occurrence-card">
            <div class="my-occurrence-main">
                <div class="my-occurrence-title">Ocorrência #${escapeOccurrenceHtml(row.id)}</div>
                <div class="my-occurrence-meta">
                    <span><i class="fas fa-calendar-day"></i> ${escapeOccurrenceHtml(formatOccurrenceDate(row.occurrence_date))}</span>
                    <span><i class="fas fa-clock"></i> ${escapeOccurrenceHtml(formatOccurrenceTime(row.occurrence_time))}</span>
                    ${row.unit_involved ? `<span><i class="fas fa-building"></i> <span data-no-translate>${escapeOccurrenceHtml(row.unit_involved)}</span></span>` : ''}
                </div>
                <p class="my-occurrence-preview" data-no-translate>${escapeOccurrenceHtml(row.description || '')}</p>
            </div>
            <button class="view-occurrence-btn" type="button" data-view-occurrence="${escapeOccurrenceHtml(row.id)}">
                <i class="fas fa-eye"></i> Ver registro
            </button>
        </article>
    `).join('');

    bindOccurrenceDetailButtons(list, rows);
    window.applyGlobalAppLanguage?.();
}

function renderAllOccurrences() {
    const tbody = document.getElementById('allOccurrencesTableBody');
    const counter = document.getElementById('allOccurrencesCounter');
    if (!tbody || !counter) return;

    const rows = getFilteredAllOccurrences();
    counter.textContent = rows.length === 1 ? '1 ocorrência encontrada.' : `${rows.length} ocorrências encontradas.`;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhuma ocorrência corresponde aos filtros selecionados.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((row) => `
        <tr>
            <td>
                <strong>#${escapeOccurrenceHtml(row.id)}</strong><br>
                <small>${escapeOccurrenceHtml(formatDateTime(row.created_at))}</small>
            </td>
            <td>${escapeOccurrenceHtml(formatOccurrenceDate(row.occurrence_date))}<br><small>${escapeOccurrenceHtml(formatOccurrenceTime(row.occurrence_time))}</small></td>
            <td><span data-no-translate>${escapeOccurrenceHtml(row.reporter_name || 'Usuário')}</span></td>
            <td><span class="role-badge role-${escapeOccurrenceHtml(normalizeStoredRole(row.reporter_role))}">${escapeOccurrenceHtml(occurrenceRoleLabel(row.reporter_role))}</span></td>
            <td>${row.unit_involved
                ? `<span data-no-translate>${escapeOccurrenceHtml(row.unit_involved)}</span>`
                : 'Não informada'}</td>
            <td>
                <button class="view-occurrence-btn" type="button" data-view-occurrence="${escapeOccurrenceHtml(row.id)}">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </td>
        </tr>
    `).join('');

    bindOccurrenceDetailButtons(tbody, rows);
    window.applyGlobalAppLanguage?.();
}

function getFilteredAllOccurrences() {
    const search = String(document.getElementById('allOccurrencesSearch')?.value || '').trim().toLowerCase();
    const role = document.getElementById('allOccurrencesRoleFilter')?.value || 'todos';
    const period = document.getElementById('allOccurrencesPeriodFilter')?.value || 'todos';
    const today = startOfToday();

    return occurrenceState.allOccurrences.filter((row) => {
        const normalizedRole = normalizeStoredRole(row.reporter_role);
        if (role !== 'todos' && normalizedRole !== role) return false;

        if (period !== 'todos') {
            const occurrenceDate = parseDateOnly(row.occurrence_date);
            if (!occurrenceDate) return false;

            if (period === 'hoje') {
                if (occurrenceDate.getTime() !== today.getTime()) return false;
            } else {
                const days = Number(period);
                const earliest = new Date(today);
                earliest.setDate(earliest.getDate() - Math.max(days - 1, 0));
                if (occurrenceDate < earliest || occurrenceDate > today) return false;
            }
        }

        if (search) {
            const haystack = [
                row.id,
                row.reporter_name,
                row.reporter_role,
                row.unit_involved,
                row.occurrence_author,
                row.description,
                row.reporter_email
            ].map((value) => String(value || '').toLowerCase()).join(' ');
            if (!haystack.includes(search)) return false;
        }

        return true;
    });
}

function clearOccurrenceFilters() {
    const search = document.getElementById('allOccurrencesSearch');
    const role = document.getElementById('allOccurrencesRoleFilter');
    const period = document.getElementById('allOccurrencesPeriodFilter');

    if (search) search.value = '';
    if (role) role.value = 'todos';
    if (period) period.value = 'todos';
    renderAllOccurrences();
}

function bindOccurrenceDetailButtons(container, rows) {
    container.querySelectorAll('[data-view-occurrence]').forEach((button) => {
        button.addEventListener('click', () => {
            const id = String(button.dataset.viewOccurrence || '');
            const row = rows.find((item) => String(item.id) === id)
                || occurrenceState.allOccurrences.find((item) => String(item.id) === id)
                || occurrenceState.myOccurrences.find((item) => String(item.id) === id);
            if (row) openOccurrenceDetails(row);
        });
    });
}

function openOccurrenceDetails(row) {
    const subtitle = document.getElementById('occurrenceDetailsSubtitle');
    const body = document.getElementById('occurrenceDetailsBody');
    if (!body) return;

    if (subtitle) subtitle.textContent = `Ocorrência #${row.id} • registrada em ${formatDateTime(row.created_at)}`;

    body.innerHTML = `
        <div class="occurrence-detail-grid">
            <div class="detail-block">
                <span>Responsável pelo registro</span>
                <strong data-no-translate>${escapeOccurrenceHtml(row.reporter_name || 'Usuário')}</strong>
            </div>
            <div class="detail-block">
                <span>Função</span>
                <strong>${escapeOccurrenceHtml(occurrenceRoleLabel(row.reporter_role))}</strong>
            </div>
            <div class="detail-block">
                <span>Data da ocorrência</span>
                <strong>${escapeOccurrenceHtml(formatOccurrenceDate(row.occurrence_date))}</strong>
            </div>
            <div class="detail-block">
                <span>Hora da ocorrência</span>
                <strong>${escapeOccurrenceHtml(formatOccurrenceTime(row.occurrence_time))}</strong>
            </div>
            <div class="detail-block">
                <span>Unidade envolvida</span>
                <strong${row.unit_involved ? ' data-no-translate' : ''}>${escapeOccurrenceHtml(row.unit_involved || 'Não informada')}</strong>
            </div>
            <div class="detail-block">
                <span>Autor da ocorrência</span>
                <strong${row.occurrence_author ? ' data-no-translate' : ''}>${escapeOccurrenceHtml(row.occurrence_author || 'Não informado')}</strong>
            </div>
            <div class="detail-block detail-full">
                <span>Descrição da ocorrência</span>
                <p data-no-translate>${escapeOccurrenceHtml(row.description || '')}</p>
            </div>
            <div class="detail-block detail-full">
                <span>Assinatura</span>
                ${isSafeSignatureData(row.signature_data)
                    ? `<img class="signature-preview" src="${row.signature_data}" alt="Assinatura do responsável pelo registro">`
                    : '<strong>Assinatura indisponível</strong>'}
            </div>
        </div>
    `;

    openOccurrenceModal('occurrenceDetailsModal');
    window.applyGlobalAppLanguage?.();
}

function renderEmptyState(message, icon) {
    return `
        <div class="empty-state">
            <div class="empty-state-content">
                <i class="fas ${escapeOccurrenceHtml(icon)}"></i>
                <strong>${escapeOccurrenceHtml(message)}</strong>
            </div>
        </div>
    `;
}

function setupSignatureCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    const pointerDown = (event) => {
        event.preventDefault();
        const point = getCanvasPoint(canvas, event);
        occurrenceState.signature.drawing = true;
        occurrenceState.signature.lastX = point.x;
        occurrenceState.signature.lastY = point.y;
        canvas.setPointerCapture?.(event.pointerId);
    };

    const pointerMove = (event) => {
        if (!occurrenceState.signature.drawing) return;
        event.preventDefault();

        const ctx = canvas.getContext('2d');
        const point = getCanvasPoint(canvas, event);

        ctx.beginPath();
        ctx.moveTo(occurrenceState.signature.lastX, occurrenceState.signature.lastY);
        ctx.lineTo(point.x, point.y);
        ctx.lineWidth = 2.25;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';
        ctx.stroke();

        occurrenceState.signature.lastX = point.x;
        occurrenceState.signature.lastY = point.y;
        occurrenceState.signature.hasInk = true;

        document.getElementById('signatureCanvasWrap')?.classList.add('has-signature');
        const errorEl = document.getElementById('signatureError');
        if (errorEl) errorEl.hidden = true;
    };

    const pointerUp = (event) => {
        occurrenceState.signature.drawing = false;
        try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);
    canvas.addEventListener('pointerleave', (event) => {
        if (event.buttons === 0) pointerUp(event);
    });

    window.addEventListener('resize', debounce(resizeSignatureCanvas, 120));
    resizeSignatureCanvas();
}

function resizeSignatureCanvas() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const oldData = occurrenceState.signature.hasInk ? canvas.toDataURL('image/png') : null;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (oldData) {
        const image = new Image();
        image.onload = () => {
            ctx.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = oldData;
    }
}

function getCanvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function clearSignature() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, rect.width, rect.height);

    occurrenceState.signature.drawing = false;
    occurrenceState.signature.hasInk = false;
    document.getElementById('signatureCanvasWrap')?.classList.remove('has-signature');
    const errorEl = document.getElementById('signatureError');
    if (errorEl) errorEl.hidden = true;
}

function normalizeStoredRole(role) {
    const value = String(role || '').trim().toLowerCase();
    if (value.startsWith('sind') || value === 'síndico') return 'sindico';
    if (value.startsWith('porteir')) return 'porteiro';
    return 'morador';
}

function occurrenceRoleLabel(role) {
    const normalized = normalizeStoredRole(role);
    if (normalized === 'sindico') return 'Síndico';
    if (normalized === 'porteiro') return 'Porteiro';
    return 'Morador';
}

function getInitials(name) {
    return String(name || 'Usuário')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'US';
}

function getOccurrenceLocale() {
    try {
        return localStorage.getItem('app-language') === 'en' ? 'en-US' : 'pt-BR';
    } catch (_) {
        return 'pt-BR';
    }
}

function formatDateBr(date) {
    return new Intl.DateTimeFormat(getOccurrenceLocale()).format(date);
}

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatOccurrenceDate(value) {
    const date = parseDateOnly(value);
    return date ? new Intl.DateTimeFormat(getOccurrenceLocale()).format(date) : 'Não informada';
}

function formatOccurrenceTime(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : (text || 'Não informada');
}

function formatDateTime(value) {
    if (!value) return 'Data não informada';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(getOccurrenceLocale(), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function isSafeSignatureData(value) {
    return /^data:image\/png;base64,[a-z0-9+/=\s]+$/i.test(String(value || ''));
}

function escapeOccurrenceHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function occurrenceToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }

    if (typeof window.alert === 'function') {
        window.alert(message);
    }
}

function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), delay);
    };
}
