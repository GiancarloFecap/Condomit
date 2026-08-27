let currentDate = new Date();
let selectedDate = new Date();
let selectedTime = null;
let selectedSpace = null;
let condominiumSpaces = [];
let reservations = [];
let currentReservationsUser = null;

const today = new Date();
today.setHours(0, 0, 0, 0);
selectedDate.setHours(0, 0, 0, 0);

const timeSlots = [
    { start: '08:00', end: '12:00' },
    { start: '12:00', end: '16:00' },
    { start: '16:00', end: '20:00' },
    { start: '08:00', end: '14:00' },
    { start: '14:00', end: '20:00' }
];

const weekdays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function getStoredUser() {
    const candidates = [];
    try { candidates.push(sessionStorage.getItem('condominiumUser')); } catch (_) {}
    try {
        candidates.push(localStorage.getItem('condominiumPersistentUser'));
        candidates.push(localStorage.getItem('condominiumUser'));
    } catch (_) {}
    for (const raw of candidates) {
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {}
    }
    return null;
}

function getUserType(user) {
    const type = String(user?.type || user?.user_type || 'morador').trim().toLowerCase();
    if (type.startsWith('sind')) return 'sindico';
    if (type.startsWith('porteir')) return 'porteiro';
    return 'morador';
}

async function rpc(name, payload = {}) {
    if (typeof window.supabaseFetch !== 'function') {
        throw new Error('Supabase não está disponível nesta página.');
    }
    return window.supabaseFetch(`/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function fetchCondominium(cep) {
    try {
        if (typeof window.supabaseFetch === 'function') {
            const data = await window.supabaseFetch(
                `/condominiums?select=*&cep=eq.${encodeURIComponent(cep)}&limit=1`
            );
            const row = Array.isArray(data) ? data[0] : data;
            if (row) {
                condominiumSpaces = Array.isArray(row.condominium_spaces) ? row.condominium_spaces : [];
                return row;
            }
        }

        const response = await fetch(`/api/condominiums?cep=eq.${encodeURIComponent(cep)}`);
        if (!response.ok) throw new Error('Erro ao buscar condomínio');
        const data = await response.json();
        if (Array.isArray(data) && data.length) {
            condominiumSpaces = Array.isArray(data[0].condominium_spaces) ? data[0].condominium_spaces : [];
            return data[0];
        }
    } catch (error) {
        console.error('Erro ao buscar condomínio:', error);
    }
    return null;
}

function getCondominiumIdentifier(user) {
    const condo = user?.condominium || {};
    return condo.cep || condo.condominium_id || condo.condominiumId || user?.cep || user?.condominium_id || null;
}

function normalizeReservation(row) {
    return {
        ...row,
        email: String(row?.email || '').trim().toLowerCase(),
        nome_local: row?.nome_local || '',
        data_reserva: String(row?.data_reserva || '').slice(0, 10),
        horario_inicio: String(row?.horario_inicio || '').slice(0, 5),
        horario_fim: String(row?.horario_fim || '').slice(0, 5),
        status: row?.status || 'indisponivel'
    };
}

async function fetchReservations() {
    try {
        const rows = await rpc('condomit_list_reservation_slots');
        reservations = (Array.isArray(rows) ? rows : []).map(normalizeReservation);
    } catch (error) {
        console.error('Erro ao buscar horários reservados:', error);
        reservations = [];
        window.showToast?.('Não foi possível carregar os horários já reservados.', 'error');
    }
}

function timeToMinutes(value) {
    const [hours, minutes] = String(value || '').slice(0, 5).split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60) + minutes;
}

function timeRangesOverlap(startA, endA, startB, endB) {
    const aStart = timeToMinutes(startA);
    const aEnd = timeToMinutes(endA);
    const bStart = timeToMinutes(startB);
    const bEnd = timeToMinutes(endB);
    if ([aStart, aEnd, bStart, bEnd].some((value) => value === null)) return false;
    return aStart < bEnd && aEnd > bStart;
}

function isTimeSlotReserved(dateStr, timeSlot) {
    if (!selectedSpace) return false;
    const selectedName = String(selectedSpace.name || '').trim().toLowerCase();
    return reservations.some((res) => (
        String(res.nome_local || '').trim().toLowerCase() === selectedName
        && res.data_reserva === dateStr
        && timeRangesOverlap(
            res.horario_inicio,
            res.horario_fim,
            timeSlot.start,
            timeSlot.end
        )
    ));
}

function isDayFullyReserved(dateStr) {
    if (!selectedSpace) return false;
    return timeSlots.every((slot) => isTimeSlotReserved(dateStr, slot));
}

function renderTimeSlots() {
    const container = document.getElementById('horarios-container');
    if (!container) return;
    if (!selectedSpace) {
        container.innerHTML = '<div class="reservation-inline-empty">Escolha primeiro um local para consultar os horários.</div>';
        return;
    }

    const dateStr = formatDateInput(selectedDate);
    container.innerHTML = timeSlots.map((slot, index) => {
        const isReserved = isTimeSlotReserved(dateStr, slot);
        const isSelected = selectedTime?.start === slot.start && selectedTime?.end === slot.end;
        return `
            <button class="horario-btn ${isReserved ? 'unavailable' : 'available'} ${isSelected ? 'selected' : ''}"
                    data-index="${index}" ${isReserved ? 'disabled' : ''}>
                <span>${slot.start} - ${slot.end}</span>
                <small>${isReserved ? 'Indisponível' : 'Disponível'}</small>
            </button>`;
    }).join('');

    container.querySelectorAll('.horario-btn.available').forEach((button) => {
        button.addEventListener('click', () => {
            selectedTime = timeSlots[Number(button.dataset.index)];
            renderTimeSlots();
            updateResumo();
        });
    });
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthLabel = document.querySelector('.calendar-month');
    if (monthLabel) monthLabel.textContent = `${months[month]} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDayDate = new Date(year, month + 1, 0).getDate();
    let html = weekdays.map((day) => `<div class="calendar-day weekday">${day}</div>`).join('');
    html += Array.from({ length: firstDayIndex }, () => '<div class="calendar-day" style="visibility:hidden"></div>').join('');

    for (let day = 1; day <= lastDayDate; day += 1) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);
        const dateStr = formatDateInput(date);
        let classes = 'calendar-day';
        if (date < today) classes += ' disabled';
        else if (isDayFullyReserved(dateStr)) classes += ' unavailable';
        else classes += ' available';
        if (sameDate(date, selectedDate) && classes.includes('available')) classes += ' selected';
        html += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    const grid = document.querySelector('.calendar-grid');
    if (grid) {
        grid.innerHTML = html;
        grid.querySelectorAll('.calendar-day.available').forEach((dayEl) => {
            dayEl.addEventListener('click', () => selectDate(dayEl));
        });
    }
    updatePrevButton();
}

function updatePrevButton() {
    const prevBtn = document.getElementById('prev-month');
    if (!prevBtn) return;
    const currentMonthYear = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const todayMonthYear = new Date(today.getFullYear(), today.getMonth(), 1);
    prevBtn.disabled = currentMonthYear <= todayMonthYear;
}

function selectDate(dayEl) {
    const [year, month, day] = String(dayEl.dataset.date || '').split('-').map(Number);
    if (!year || !month || !day) return;
    selectedDate = new Date(year, month - 1, day);
    selectedDate.setHours(0, 0, 0, 0);
    if (selectedTime && isTimeSlotReserved(formatDateInput(selectedDate), selectedTime)) selectedTime = null;
    renderCalendar();
    renderTimeSlots();
    updateResumo();
}

function getImageForSpace(spaceName) {
    const name = String(spaceName || '').toLowerCase();
    if (name.includes('churras')) return 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop';
    if (name.includes('piscina')) return 'https://images.unsplash.com/photo-1489824904134-891ab6455fda?w=400&h=300&fit=crop';
    if (name.includes('academia')) return 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop';
    if (name.includes('quadra')) return 'https://images.unsplash.com/photo-1598902108854-4003de100b13?w=400&h=300&fit=crop';
    if (name.includes('brinqued')) return 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=400&h=300&fit=crop';
    return 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=300&fit=crop';
}

function renderSpaces() {
    const container = document.querySelector('.locais-list');
    if (!container) return;
    if (!condominiumSpaces.length) {
        container.innerHTML = '<div class="reservation-inline-empty">Nenhum espaço foi configurado para reserva neste condomínio.</div>';
        return;
    }

    container.innerHTML = condominiumSpaces.map((space, index) => `
        <article class="local-card ${selectedSpace?.name === space.name ? 'selected' : ''}" data-index="${index}" tabindex="0">
            <img src="${getImageForSpace(space.name)}" alt="${escapeHtml(space.name)}">
            <div class="local-info">
                <h3>${escapeHtml(space.name)}</h3>
                ${space.capacity ? `<div class="capacidade"><i class="fas fa-users"></i><span>Capacidade: ${escapeHtml(space.capacity)} pessoas</span></div>` : ''}
                ${space.description ? `<p>${escapeHtml(space.description)}</p>` : ''}
            </div>
        </article>`).join('');

    const choose = async (card) => {
        selectedSpace = condominiumSpaces[Number(card.dataset.index)];
        selectedTime = null;
        renderSpaces();
        await fetchReservations();
        renderCalendar();
        renderTimeSlots();
        updateResumo();
    };
    container.querySelectorAll('.local-card').forEach((card) => {
        card.addEventListener('click', () => choose(card));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(card); }
        });
    });
}

function updateResumo() {
    const dateEl = document.getElementById('resumo-data');
    const timeEl = document.getElementById('resumo-horario');
    const localEl = document.getElementById('resumo-local');
    if (dateEl) dateEl.textContent = selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    if (timeEl) timeEl.textContent = selectedTime ? `${selectedTime.start} - ${selectedTime.end}` : 'Nenhum selecionado';
    if (localEl) localEl.textContent = selectedSpace?.name || 'Nenhum selecionado';
    const button = document.getElementById('btn-agendar');
    if (button) button.disabled = !(selectedDate && selectedTime && selectedSpace);
}

async function handleAgendar() {
    if (!selectedDate || !selectedTime || !selectedSpace) return;
    const doSave = async () => {
        try {
            /*
             * Revalida a agenda imediatamente antes de gravar. Assim, se
             * outra pessoa reservou enquanto o popup de confirmação estava
             * aberto, o horário é bloqueado sem depender do erro do banco.
             */
            await fetchReservations();
            const dateKey = formatDateInput(selectedDate);
            if (isTimeSlotReserved(dateKey, selectedTime)) {
                selectedTime = null;
                renderCalendar();
                renderTimeSlots();
                updateResumo();
                window.showToast?.('Horário indisponível! Escolha outro horário.', 'warning');
                return;
            }

            await rpc('condomit_create_reservation', {
                target_local: selectedSpace.name,
                target_date: dateKey,
                target_start: selectedTime.start,
                target_end: selectedTime.end
            });
            window.showToast?.('Reserva realizada e salva no banco de dados.', 'success');
            selectedTime = null;
            await fetchReservations();
            renderCalendar();
            renderTimeSlots();
            updateResumo();
        } catch (error) {
            console.error('Erro ao fazer reserva:', error);
            const rawMessage = String(error?.message || error || '');
            const isUnavailable = /duplicate key|reserva_unica|23505|hor[aá]rio.*reserv|conflito|indispon/i.test(rawMessage);

            if (isUnavailable) {
                selectedTime = null;
                await fetchReservations();
                renderCalendar();
                renderTimeSlots();
                updateResumo();
                window.showToast?.('Horário indisponível! Escolha outro horário.', 'warning');
                return;
            }

            window.showToast?.(rawMessage || 'Não foi possível realizar a reserva.', 'error');
        }
    };

    if (typeof window.showModal === 'function') {
        window.showModal({
            title: 'Confirmar reserva',
            message: `Reservar ${selectedSpace.name} em ${selectedDate.toLocaleDateString('pt-BR')} das ${selectedTime.start} às ${selectedTime.end}?`,
            type: 'warning',
            confirmText: 'Confirmar reserva',
            cancelText: 'Cancelar',
            onConfirm: doSave
        });
    } else if (window.confirm('Confirmar esta reserva?')) {
        await doSave();
    }
}

function ensureReservationsModal() {
    if (document.getElementById('reservationsListModal')) return;
    const modal = document.createElement('div');
    modal.id = 'reservationsListModal';
    modal.className = 'reservations-modal-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
        <section class="reservations-modal" role="dialog" aria-modal="true" aria-labelledby="reservationsModalTitle">
            <header class="reservations-modal-header">
                <div><span class="reservations-modal-eyebrow">Reservas</span><h3 id="reservationsModalTitle">Minhas reservas</h3></div>
                <button type="button" class="reservations-modal-close" id="closeReservationsModal" aria-label="Fechar"><i class="fas fa-times"></i></button>
            </header>
            <div class="reservations-modal-body" id="reservationsModalBody"></div>
        </section>`;
    document.body.appendChild(modal);
    document.getElementById('closeReservationsModal')?.addEventListener('click', closeReservationsModal);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeReservationsModal(); });
}

function closeReservationsModal() {
    const modal = document.getElementById('reservationsListModal');
    if (modal) modal.hidden = true;
}

async function openMyReservations() {
    ensureReservationsModal();
    const modal = document.getElementById('reservationsListModal');
    const title = document.getElementById('reservationsModalTitle');
    const body = document.getElementById('reservationsModalBody');
    if (!modal || !title || !body) return;
    title.textContent = 'Minhas reservas';
    body.innerHTML = '<div class="reservation-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    modal.hidden = false;
    try {
        const rows = await rpc('condomit_list_my_reservations');
        renderReservationCards(body, Array.isArray(rows) ? rows.map(normalizeReservation) : [], true);
    } catch (error) {
        body.innerHTML = `<div class="reservation-empty-state"><i class="fas fa-triangle-exclamation"></i><p>${escapeHtml(error?.message || 'Não foi possível carregar suas reservas.')}</p></div>`;
    }
}

async function openAllReservations() {
    ensureReservationsModal();
    const modal = document.getElementById('reservationsListModal');
    const title = document.getElementById('reservationsModalTitle');
    const body = document.getElementById('reservationsModalBody');
    if (!modal || !title || !body) return;
    title.textContent = 'Todas as reservas do condomínio';
    body.innerHTML = '<div class="reservation-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    modal.hidden = false;
    try {
        const rows = await rpc('condomit_list_all_reservations');
        renderReservationCards(body, Array.isArray(rows) ? rows.map(normalizeReservation) : [], false);
    } catch (error) {
        body.innerHTML = `<div class="reservation-empty-state"><i class="fas fa-triangle-exclamation"></i><p>${escapeHtml(error?.message || 'Não foi possível carregar todas as reservas.')}</p></div>`;
    }
}

function renderReservationCards(container, rows, canDelete) {
    if (!rows.length) {
        container.innerHTML = '<div class="reservation-empty-state"><i class="far fa-calendar-xmark"></i><h4>Nenhuma reserva encontrada</h4><p>Quando houver reservas elas aparecerão aqui.</p></div>';
        return;
    }
    container.innerHTML = `<div class="reservation-modal-list">${rows.map((row, index) => `
        <article class="reservation-modal-card">
            <div class="reservation-modal-card-icon"><i class="far fa-calendar-check"></i></div>
            <div class="reservation-modal-card-main">
                <div class="reservation-modal-card-title">${escapeHtml(row.nome_local || 'Local')}</div>
                <div class="reservation-modal-card-meta">
                    <span><i class="far fa-calendar"></i> ${formatDateLabel(row.data_reserva)}</span>
                    <span><i class="far fa-clock"></i> ${escapeHtml(row.horario_inicio)} - ${escapeHtml(row.horario_fim)}</span>
                    ${!canDelete && (row.reserved_by_name || row.email) ? `<span><i class="far fa-user"></i> ${escapeHtml(row.reserved_by_name || row.email)}</span>` : ''}
                </div>
                <span class="reservation-status-badge confirmed"><i class="fas fa-circle-check"></i> Confirmada</span>
            </div>
            ${canDelete ? `<button type="button" class="reservation-delete-btn reservation-cancel-btn" data-reservation-index="${index}"><i class="fas fa-ban"></i><span>Cancelar reserva</span></button>` : ''}
        </article>`).join('')}</div>`;

    if (canDelete) {
        container.querySelectorAll('.reservation-delete-btn').forEach((button) => {
            button.addEventListener('click', () => deleteOwnReservation(rows[Number(button.dataset.reservationIndex)], button));
        });
    }
}

async function deleteOwnReservation(row, button) {
    const execute = async () => {
        button.disabled = true;
        try {
            const deleted = await rpc('condomit_delete_my_reservation', {
                target_local: row.nome_local,
                target_date: row.data_reserva,
                target_start: row.horario_inicio,
                target_end: row.horario_fim
            });
            if (deleted === false) throw new Error('A reserva não foi encontrada para exclusão.');
            window.showToast?.('Reserva cancelada com sucesso.', 'success');
            await fetchReservations();
            renderCalendar();
            renderTimeSlots();
            await openMyReservations();
        } catch (error) {
            console.error('Erro ao excluir reserva:', error);
            window.showToast?.(error?.message || 'Não foi possível cancelar a reserva.', 'error');
        } finally {
            button.disabled = false;
        }
    };
    if (typeof window.showModal === 'function') {
        window.showModal({
            title: 'Cancelar reserva',
            message: `Deseja cancelar a reserva de ${row.nome_local} em ${formatDateLabel(row.data_reserva)}?`,
            type: 'warning',
            confirmText: 'Cancelar reserva',
            cancelText: 'Cancelar',
            onConfirm: execute
        });
    } else if (window.confirm('Deseja cancelar esta reserva?')) {
        await execute();
    }
}

function setupUserShell(user) {
    const name = user?.name || 'Usuário';
    const avatar = document.querySelector('.user-profile-small .avatar');
    const nameEl = document.querySelector('.user-info-small .name');
    const typeEl = document.querySelector('.user-info-small .type');
    if (avatar) avatar.textContent = initials(name);
    if (nameEl) nameEl.textContent = name;
    if (typeEl) typeEl.textContent = getUserType(user) === 'sindico' ? 'Síndico' : getUserType(user) === 'porteiro' ? 'Porteiro' : 'Morador';
    window.syncAllAvatars?.(user);

    const sindicoSidebar = document.getElementById('sidebarSindico');
    const moradorSidebar = document.getElementById('sidebarMorador');
    if (sindicoSidebar) sindicoSidebar.style.display = getUserType(user) === 'sindico' ? '' : 'none';
    if (moradorSidebar) moradorSidebar.style.display = getUserType(user) === 'sindico' ? 'none' : '';
    const sindicoSection = document.getElementById('sindicoSection');
    if (sindicoSection) sindicoSection.style.display = getUserType(user) === 'sindico' ? 'inline-flex' : 'none';
}

function formatDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateLabel(value) {
    const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? escapeHtml(value || '--') : date.toLocaleDateString('pt-BR');
}

function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function initials(name) {
    return String(name || 'U').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'U';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', async () => {
    currentReservationsUser = getStoredUser();
    if (!currentReservationsUser) {
        window.location.href = 'entrar.html';
        return;
    }

    setupUserShell(currentReservationsUser);
    ensureReservationsModal();
    document.getElementById('btnMinhasReservas')?.addEventListener('click', openMyReservations);
    document.getElementById('btnVerTodasReservas')?.addEventListener('click', openAllReservations);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeReservationsModal(); });

    const condoIdentifier = getCondominiumIdentifier(currentReservationsUser);
    if (condoIdentifier) {
        await fetchCondominium(condoIdentifier);
    }
    if (!condominiumSpaces.length && Array.isArray(currentReservationsUser?.condominium?.condominium_spaces)) {
        condominiumSpaces = currentReservationsUser.condominium.condominium_spaces;
    }

    await fetchReservations();
    renderSpaces();
    renderCalendar();
    renderTimeSlots();
    updateResumo();

    document.getElementById('prev-month')?.addEventListener('click', () => {
        const currentMonthYear = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const todayMonthYear = new Date(today.getFullYear(), today.getMonth(), 1);
        if (currentMonthYear > todayMonthYear) {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        }
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });
    document.getElementById('btn-agendar')?.addEventListener('click', handleAgendar);
    document.getElementById('btn-cancelar')?.addEventListener('click', () => window.history.back());
});

function logout() {
    if (typeof window.performFullLogout === 'function') {
        window.performFullLogout();
        return;
    }
    sessionStorage.removeItem('condominiumUser');
    window.location.href = '../inicio.html';
}
