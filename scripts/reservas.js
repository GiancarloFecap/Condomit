let currentDate = new Date();
let selectedDate = new Date();
let selectedTime = null;
const today = new Date();
today.setHours(0, 0, 0, 0);
const LOCAL_NOME = 'Salão de Festas';
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

async function fetchReservations() {
    try {
        const response = await fetch(`/api/reserva?nome_local=${encodeURIComponent(LOCAL_NOME)}`);
        if (!response.ok) {
            throw new Error('Erro ao buscar reservas');
        }
        reservations = await response.json();
        console.log('Reservations loaded:', reservations);
        // Processa as reservas para garantir o formato correto
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
    
    // Add click handlers for available time slots
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
    
    // Weekdays
    for (let i = 0; i < 7; i++) {
        calendarHTML += `<div class="calendar-day weekday">${weekdays[i]}</div>`;
    }
    
    // Empty cells before first day of month
    for (let i = 0; i < firstDayIndex; i++) {
        calendarHTML += `<div class="calendar-day" style="visibility: hidden;"></div>`;
    }
    
    // Current month days
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
    
    // Add click handlers for selectable days
    document.querySelectorAll('.calendar-day.available, .calendar-day.unavailable').forEach(dayEl => {
        dayEl.addEventListener('click', () => selectDate(dayEl));
    });

    // Update prev button state
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
    
    // Remove selected class from all
    document.querySelectorAll('.calendar-day.selected').forEach(el => {
        el.classList.remove('selected');
    });
    // Add selected to clicked
    dayEl.classList.add('selected');
    
    // Update selected date
    const dateParts = dayEl.dataset.date.split('-');
    selectedDate = new Date(dateParts[0], parseInt(dateParts[1]) - 1, dateParts[2]);
    console.log('Selected date:', selectedDate);
    
    // Check if selected time is available on new date
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

function updateResumo() {
    const resumoDataEl = document.getElementById('resumo-data');
    const resumoHorarioEl = document.getElementById('resumo-horario');
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
        if (btnAgendar) {
            btnAgendar.disabled = false;
            console.log('Agendar button enabled');
        }
    } else if (resumoHorarioEl) {
        resumoHorarioEl.textContent = 'Nenhum selecionado';
        if (btnAgendar) {
            btnAgendar.disabled = true;
            console.log('Agendar button disabled');
        }
    }
}

async function handleAgendar() {
    if (!selectedDate || !selectedTime) return;
    
    const dateStr = selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = `${selectedTime.start} - ${selectedTime.end}`;
    
    const confirm = window.confirm(`Você realmente quer agendar o ${LOCAL_NOME} para ${dateStr} às ${timeStr}?`);
    
    if (confirm) {
        const userStr = sessionStorage.getItem('condominiumUser');
        if (!userStr) {
            alert('Você precisa estar logado para agendar.');
            return;
        }
        
        const user = JSON.parse(userStr);
        const reservationData = {
            email: user.email,
            nome_local: LOCAL_NOME,
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
            
            alert('Reserva realizada com sucesso!');
            await fetchReservations();
            renderTimeSlots();
        } catch (error) {
            console.error('Erro ao fazer reserva:', error);
            alert(`Erro ao fazer reserva: ${error.message}`);
        }
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Reservas page loaded');
    
    // Check user type
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }
    
    // Update top bar info
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
    
    // Update condo name in sidebar
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
    
    // Update sidebar
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
    
    // Show sindico section if user is sindico
    const sindicoSection = document.getElementById('sindicoSection');
    if (sindicoSection && currentUser.type === 'sindico') {
        sindicoSection.style.display = 'block';
    }
    
    // Add event listener to ver todas reservas button
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
    
    // Add event listener to fechar button
    const btnFecharReservas = document.getElementById('btnFecharReservas');
    if (btnFecharReservas) {
        btnFecharReservas.addEventListener('click', () => {
            const todasReservasSection = document.getElementById('todasReservasSection');
            if (todasReservasSection) {
                todasReservasSection.style.display = 'none';
            }
        });
    }
    
    // Fetch reservations
    await fetchReservations();
    
    // Initialize resumo with today's date
    updateResumo();

    // Render calendar and time slots
    renderCalendar();
    renderTimeSlots();
    
    // Previous month button
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
    
    // Next month button
    const nextBtn = document.getElementById('next-month');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }
    
    // Agendar button
    const agendarBtn = document.getElementById('btn-agendar');
    if (agendarBtn) {
        agendarBtn.addEventListener('click', handleAgendar);
    }
    
    // Cancelar button
    const cancelarBtn = document.getElementById('btn-cancelar');
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', () => {
            window.history.back();
        });
    }
});
