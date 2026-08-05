let currentDate = new Date();
let selectedDate = new Date();
let selectedTime = null;
let selectedSpace = null;
let condominiumSpaces = [];
const today = new Date();
today.setHours(0, 0, 0, 0);
let reservations = [];

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

async function fetchCondominium(cep) {
    try {
        const response = await fetch(`/api/condominiums?cep=eq.${encodeURIComponent(cep)}`);
        if (!response.ok) {
            throw new Error('Erro ao buscar condomínio');
        }
        const data = await response.json();
        if (data && data.length > 0) {
            condominiumSpaces = data[0].condominium_spaces || [];
            return data[0];
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar condomínio:', error);
        return null;
    }
}

function getCondominiumIdentifier(user) {
    if (!user || !user.condominium) return null;

    return user.condominium.cep ||
        user.condominium.condominium_id ||
        user.condominium.condominiumId ||
        null;
}

async function fetchReservations() {
    try {
        const url = selectedSpace
            ? `/api/reserva?nome_local=${encodeURIComponent(selectedSpace.name)}`
            : '/api/reserva';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Erro ao buscar reservas');
        }
        reservations = await response.json();
        console.log('Reservations loaded:', reservations);
        reservations = reservations.map(res => ({
            ...res,
            horario_inicio: res.horario_inicio ? res.horario_inicio.substring(0, 5) : '',
            horario_fim: res.horario_fim ? res.horario_fim.substring(0, 5) : '',
            data_reserva: res.data_reserva
        }));
        console.log('Processed reservations:', reservations);
    } catch (error) {
        console.error('Erro ao buscar reservas:', error);
        reservations = [];
    }
}

function isTimeSlotReserved(dateStr, timeSlot) {
    return reservations.some(res => {
        const dbStart = res.horario_inicio ? res.horario_inicio.substring(0, 5) : '';
        const dbEnd = res.horario_fim ? res.horario_fim.substring(0, 5) : '';
        return res.data_reserva === dateStr &&
            dbStart === timeSlot.start &&
            dbEnd === timeSlot.end &&
            res.status === 'indisponivel';
    });
}

function isDayFullyReserved(dateStr) {
    return timeSlots.every(timeSlot => isTimeSlotReserved(dateStr, timeSlot));
}

function renderTodasReservas() {
    const container = document.getElementById('todasReservasContainer');
    if (!container) return;

    if (!reservations.length) {
        container.innerHTML = '<p>Nenhuma reserva encontrada.</p>';
        return;
    }

    container.innerHTML = reservations.map(reserva => {
        const dataFormatada = new Date(reserva.data_reserva + 'T00:00:00').toLocaleDateString('pt-BR');
        const horario = `${reserva.horario_inicio.substring(0, 5)} - ${reserva.horario_fim.substring(0, 5)}`;
        return `
            <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                <p><strong>Data:</strong> ${dataFormatada}</p>
                <p><strong>Horário:</strong> ${horario}</p>
                <p><strong>Local:</strong> ${reserva.nome_local}</p>
                <p><strong>Usuário:</strong> ${reserva.email}</p>
                <p><strong>Status:</strong> ${reserva.status}</p>
            </div>
        `;
    }).join('');
}

function renderTimeSlots() {
    const container = document.getElementById('horarios-container');
    if (!container) return;

    const dateStr = selectedDate.toISOString().split('T')[0];

    let html = '';

    timeSlots.forEach((slot, index) => {
        const isReserved = isTimeSlotReserved(dateStr, slot);
        const isSelected = selectedTime && selectedTime.start === slot.start && selectedTime.end === slot.end;

        let classes = 'horario-btn';
        if (isReserved) {
            classes += ' unavailable';
        } else {
            classes += ' available';
        }
        if (isSelected) {
            classes += ' selected';
        }

        html += `
            <button class="${classes}" data-index="${index}" data-start="${slot.start}" data-end="${slot.end}" ${isReserved ? 'disabled' : ''}>
                <span>${slot.start} - ${slot.end}</span>
                <small>${isReserved ? 'Indisponível' : 'Disponível'}</small>
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.horario-btn.available').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            selectedTime = timeSlots[index];
            console.log('Selected time:', selectedTime);
            renderTimeSlots();
            updateResumo();
        });
    });
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const calendarMonth = document.querySelector('.calendar-month');
    if (calendarMonth) {
        calendarMonth.textContent = `${months[month]} ${year}`;
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const firstDayIndex = firstDay.getDay();
    const lastDayDate = lastDay.getDate();

    let calendarHTML = '';

    for (let i = 0; i < 7; i++) {
        calendarHTML += `<div class="calendar-day weekday">${weekdays[i]}</div>`;
    }

    for (let i = 0; i < firstDayIndex; i++) {
        calendarHTML += `<div class="calendar-day" style="visibility: hidden;"></div>`;
    }

    for (let day = 1; day <= lastDayDate; day++) {
        const dateToCheck = new Date(year, month, day);
        dateToCheck.setHours(0, 0, 0, 0);

        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isFullyReserved = isDayFullyReserved(dateStr);

        let classes = 'calendar-day';

        if (dateToCheck < today) {
            classes += ' disabled';
        } else if (isFullyReserved) {
            classes += ' unavailable';
        } else {
            classes += ' available';
        }

        if (selectedDate.getFullYear() === year &&
            selectedDate.getMonth() === month &&
            selectedDate.getDate() === day) {
            classes += ' selected';
        }

        calendarHTML += `<div class="${classes}" data-date="${dateStr}">${day}</div>`;
    }

    const calendarGrid = document.querySelector('.calendar-grid');
    if (calendarGrid) {
        calendarGrid.innerHTML = calendarHTML;
    }

    document.querySelectorAll('.calendar-day.available, .calendar-day.unavailable').forEach(dayEl => {
        dayEl.addEventListener('click', () => selectDate(dayEl));
    });

    updatePrevButton();
}

function updatePrevButton() {
    const prevBtn = document.getElementById('prev-month');
    if (!prevBtn) return;

    const currentMonthYear = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const todayMonthYear = new Date(today.getFullYear(), today.getMonth(), 1);

    if (currentMonthYear <= todayMonthYear) {
        prevBtn.disabled = true;
        prevBtn.style.opacity = '0.5';
        prevBtn.style.cursor = 'not-allowed';
    } else {
        prevBtn.disabled = false;
        prevBtn.style.opacity = '1';
        prevBtn.style.cursor = 'pointer';
    }
}

function selectDate(dayEl) {
    if (dayEl.classList.contains('disabled') || dayEl.classList.contains('unavailable')) return;

    document.querySelectorAll('.calendar-day.selected').forEach(el => {
        el.classList.remove('selected');
    });
    dayEl.classList.add('selected');

    const dateParts = dayEl.dataset.date.split('-');
    selectedDate = new Date(dateParts[0], parseInt(dateParts[1]) - 1, dateParts[2]);
    console.log('Selected date:', selectedDate);

    if (selectedTime) {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const isReserved = isTimeSlotReserved(dateStr, selectedTime);
        if (isReserved) {
            selectedTime = null;
        }
    }

    updateResumo();
    renderTimeSlots();
}

function renderSpaces() {
    const container = document.querySelector('.locais-list');
    if (!container) return;

    if (!condominiumSpaces.length) {
        container.innerHTML = '<p>Nenhum espaço disponível para reserva.</p>';
        return;
    }

    function getImageForSpace(spaceName) {
        const lowerName = spaceName.toLowerCase();
        if (lowerName.includes('churras') || lowerName.includes('grill') || lowerName.includes('barbecue')) {
            return 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('piscina') || lowerName.includes('pool')) {
            return 'https://images.unsplash.com/photo-1489824904134-891ab6455fda?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('sala') && lowerName.includes('festas')) {
            return 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('salao') || lowerName.includes('sala')) {
            return 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('gym') || lowerName.includes('academia')) {
            return 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('quadra') || lowerName.includes('court') || lowerName.includes('esporte')) {
            return 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('jardim') || lowerName.includes('garden')) {
            return 'https://images.unsplash.com/photo-1598902108854-4003de100b13?w=400&h=300&fit=crop';
        }
        if (lowerName.includes('brinquedoteca') || lowerName.includes('play') || lowerName.includes('infantil')) {
            return 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=400&h=300&fit=crop';
        }
        // Default
        return 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=300&fit=crop';
    }

    container.innerHTML = condominiumSpaces.map((space, index) => {
        const isSelected = selectedSpace && selectedSpace.name === space.name;
        const imageUrl = getImageForSpace(space.name);
        return `
            <div class="local-card ${isSelected ? 'selected' : ''}" data-index="${index}">
                <img src="${imageUrl}" alt="${space.name}">
                <div class="local-info">
                    <h3>${space.name}</h3>
                    ${space.capacity ? `
                    <div class="capacidade">
                        <i class="fas fa-users"></i>
                        <span>Capacidade: ${space.capacity} pessoas</span>
                    </div>` : ''}
                    ${space.description ? `<p>${space.description}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.local-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            selectedSpace = condominiumSpaces[index];
            selectedTime = null;
            renderSpaces();
            fetchReservations().then(() => {
                renderTimeSlots();
                updateResumo();
            });
        });
    });
}

function updateResumo() {
    const resumoDataEl = document.getElementById('resumo-data');
    const resumoHorarioEl = document.getElementById('resumo-horario');
    const resumoLocalEl = document.querySelector('#resumo-local');
    const btnAgendar = document.getElementById('btn-agendar');

    if (selectedDate && resumoDataEl) {
        const dateStr = selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const weekdayStr = selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' });
        resumoDataEl.textContent = `${dateStr} (${weekdayStr})`;
    } else if (resumoDataEl) {
        resumoDataEl.textContent = 'Nenhuma selecionada';
    }

    if (selectedTime && resumoHorarioEl) {
        resumoHorarioEl.textContent = `${selectedTime.start} - ${selectedTime.end}`;
    } else if (resumoHorarioEl) {
        resumoHorarioEl.textContent = 'Nenhum selecionado';
    }

    if (selectedSpace && resumoLocalEl) {
        resumoLocalEl.textContent = selectedSpace.name;
    } else if (resumoLocalEl) {
        resumoLocalEl.textContent = 'Nenhum selecionado';
    }

    if (btnAgendar) {
        btnAgendar.disabled = !(selectedDate && selectedTime && selectedSpace);
    }
}

async function handleAgendar() {
    if (!selectedDate || !selectedTime || !selectedSpace) return;

    const dateStr = selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = `${selectedTime.start} - ${selectedTime.end}`;

    window.showModal({
        title: 'Confirmar reserva',
        message: `Você realmente quer agendar o ${selectedSpace.name} para ${dateStr} às ${timeStr}?`,
        type: 'warning',
        confirmText: 'Sim, agendar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
            const userStr = sessionStorage.getItem('condominiumUser');
            if (!userStr) {
                window.showToast('Você precisa estar logado para agendar.', 'warning');
                return;
            }

            const user = JSON.parse(userStr);
            const reservationData = {
                email: user.email,
                nome_local: selectedSpace.name,
                data_reserva: selectedDate.toISOString().split('T')[0],
                horario_inicio: selectedTime.start,
                horario_fim: selectedTime.end,
                status: 'indisponivel'
            };

            try {
                const response = await fetch('/api/reserva', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(reservationData)
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => null);
                    throw new Error(errorData?.message || 'Erro ao fazer reserva');
                }

                window.showToast('Reserva realizada com sucesso!', 'success');
                await fetchReservations();
                renderTimeSlots();
            } catch (error) {
                console.error('Erro ao fazer reserva:', error);
                window.showToast(`Erro ao fazer reserva: ${error.message}`, 'error');
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Reservas page loaded');

    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));

    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }

    const userName = currentUser.name || 'Usuário';
    const firstName = userName.split(' ')[0];
    const avatar = document.querySelector('.user-profile-small .avatar');
    const nameEl = document.querySelector('.user-info-small .name');
    const typeEl = document.querySelector('.user-info-small .type');

    if (avatar && nameEl && typeEl) {
        const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        avatar.textContent = initials;
        nameEl.textContent = userName;
        typeEl.textContent = currentUser.type === 'sindico' ? 'Síndico' : 'Morador';
    }

    if (currentUser.condominium && currentUser.condominium.name) {
        const condoNameEl = document.querySelector('.sidebar-header .condo-name');
        if (condoNameEl) {
            const words = currentUser.condominium.name.split(' ');
            if (words.length > 2) {
                condoNameEl.innerHTML = `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`;
            } else {
                condoNameEl.textContent = currentUser.condominium.name;
            }
        }
    }

    const sidebarSindico = document.getElementById('sidebarSindico');
    const sidebarMorador = document.getElementById('sidebarMorador');
    if (sidebarSindico && sidebarMorador) {
        if (currentUser.type === 'sindico') {
            sidebarSindico.style.display = 'block';
            sidebarMorador.style.display = 'none';
        } else {
            sidebarSindico.style.display = 'none';
            sidebarMorador.style.display = 'block';
        }
    }

    const sindicoSection = document.getElementById('sindicoSection');
    if (sindicoSection && currentUser.type === 'sindico') {
        sindicoSection.style.display = 'block';
    }

    const btnVerTodasReservas = document.getElementById('btnVerTodasReservas');
    if (btnVerTodasReservas) {
        btnVerTodasReservas.addEventListener('click', () => {
            const todasReservasSection = document.getElementById('todasReservasSection');
            if (todasReservasSection) {
                todasReservasSection.style.display = 'block';
                renderTodasReservas();
            }
        });
    }

    const btnFecharReservas = document.getElementById('btnFecharReservas');
    if (btnFecharReservas) {
        btnFecharReservas.addEventListener('click', () => {
            const todasReservasSection = document.getElementById('todasReservasSection');
            if (todasReservasSection) {
                todasReservasSection.style.display = 'none';
            }
        });
    }

    const condominiumIdentifier = getCondominiumIdentifier(currentUser);

    if (condominiumIdentifier) {
        await fetchCondominium(condominiumIdentifier);
        if (!condominiumSpaces.length && currentUser.condominium.condominium_spaces) {
            condominiumSpaces = currentUser.condominium.condominium_spaces;
        }
    } else if (currentUser.condominium && currentUser.condominium.condominium_spaces) {
        condominiumSpaces = currentUser.condominium.condominium_spaces;
    }

    renderSpaces();
    await fetchReservations();

    updateResumo();

    renderCalendar();
    renderTimeSlots();

    const prevBtn = document.getElementById('prev-month');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const currentMonthYear = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const todayMonthYear = new Date(today.getFullYear(), today.getMonth(), 1);

            if (currentMonthYear > todayMonthYear) {
                currentDate.setMonth(currentDate.getMonth() - 1);
                renderCalendar();
            }
        });
    }

    const nextBtn = document.getElementById('next-month');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    const agendarBtn = document.getElementById('btn-agendar');
    if (agendarBtn) {
        agendarBtn.addEventListener('click', handleAgendar);
    }

    const cancelarBtn = document.getElementById('btn-cancelar');
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', () => {
            window.history.back();
        });
    }
});

function logout() {
    sessionStorage.removeItem('condominiumUser');
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}
