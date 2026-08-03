(function () {
  const { formatDateBR, formatTime, escapeHtml, getInitials, debounce, showToast } = window.AssemblyUtils || {};
  const AssemblyAuth = window.AssemblyAuth || {};
  const AssemblyPermissions = window.AssemblyPermissions || {};
  const AssemblyAPI = window.AssemblyAPI || {};

  const state = {
    assemblies: [],
    attendanceCounts: {},
    filtered: [],
    user: null,
    userCep: null,
    participationCount: 0,
    filters: {
      titulo: '',
      status: '',
      mes: '',
      ano: '',
      tipo: ''
    },
    loaded: false
  };

  function normalizeStatus(raw) {
    if (!raw) return 'agendada';
    const s = String(raw).toLowerCase().trim();
    if (s === 'scheduled' || s === 'agendada' || s === 'agendado' || s === 'pending') return 'agendada';
    if (s === 'live' || s === 'active' || s === 'in_progress' || s === 'em_andamento' || s === 'andamento') return 'em_andamento';
    if (s === 'ended' || s === 'finished' || s === 'completed' || s === 'concluida' || s === 'concluída' || s === 'encerrada') return 'encerrada';
    if (s === 'cancelled' || s === 'canceled' || s === 'cancelada') return 'cancelada';
    return s;
  }

  function statusLabel(status) {
    switch (status) {
      case 'agendada': return 'Agendada';
      case 'em_andamento': return 'Em andamento';
      case 'encerrada': return 'Encerrada';
      case 'cancelada': return 'Cancelada';
      default: return status || 'Agendada';
    }
  }

  function getAssemblyDate(a) {
    return a.date || a.scheduled_at || a.assembly_date || a.data || a.created_at;
  }

  function getAssemblyTime(a) {
    return a.start_time || a.time || a.horario_inicio || '';
  }

  function getAssemblyDateTime(a) {
    const d = getAssemblyDate(a);
    const t = getAssemblyTime(a);
    if (!d) return null;
    try {
      if (t) {
        return new Date(`${d}T${String(t).length <= 5 ? t + ':00' : t}`);
      }
      return new Date(d);
    } catch (e) {
      return null;
    }
  }

  function getAssemblyCep(a) {
    return a.cep || a.condominium_cep || a.condo_cep || (a.condominium && (typeof a.condominium === 'string' ? null : a.condominium.cep)) || '';
  }

  function getAssemblyTitle(a) {
    return a.title || a.assembly_title || a.titulo || 'Assembleia sem título';
  }

  function getAssemblyDescription(a) {
    const desc = a.description || a.descricao || a.summary || '';
    return String(desc || '').substring(0, 120);
  }

  function getAssemblyOrganizer(a) {
    return a.organizer || a.organizador || a.created_by_name || a.owner_name || (a.created_by && String(a.created_by).length > 10 ? 'Administrador' : '') || 'Condomínio';
  }

  function getAssemblyAgenda(a) {
    const agenda = a.agenda || a.pauta || a.agenda_items || [];
    if (Array.isArray(agenda)) {
      return agenda.slice(0, 3).map(item => {
        if (typeof item === 'string') return item;
        return item.title || item.titulo || item.description || '';
      }).filter(Boolean);
    }
    if (typeof agenda === 'string') {
      return [agenda.substring(0, 80)];
    }
    return [];
  }

  function getAssemblyCondo(a) {
    return a.condominium_name || a.nome_condominio || (a.condominium && (typeof a.condominium === 'string' ? a.condominium : (a.condominium.name || a.condominium.nome))) || 'Meu Condomínio';
  }

  function getAssemblyType(a) {
    const t = (a.type || a.tipo || 'ordinaria').toString().toLowerCase();
    if (t.includes('extra')) return 'extraordinaria';
    if (t.includes('virtual')) return 'virtual';
    return 'ordinaria';
  }

  function typeLabel(t) {
    switch (t) {
      case 'ordinaria': return 'Ordinária';
      case 'extraordinaria': return 'Extraordinária';
      case 'virtual': return 'Virtual';
      default: return t || 'Ordinária';
    }
  }

  function populateUserBadge() {
    const user = state.user || {};
    const displayName = user.name || user.full_name || user.email || 'Você';
    const role = user.user_type || user.type || user.role || 'Morador';
    const initials = getInitials ? getInitials(displayName) : String(displayName).slice(0, 2).toUpperCase();

    const nameEl = document.getElementById('user-name');
    const typeEl = document.getElementById('user-type');
    const avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = displayName;
    if (typeEl) typeEl.textContent = role;
    if (avatarEl) avatarEl.textContent = initials;
  }

  function checkAuth() {
    let user = null;
    try {
      if (window.supabase && typeof window.supabase.auth?.getSession === 'function') {
        user = window.supabase.auth.getSession().then(s => s?.data?.session?.user || null).catch(() => null);
      }
    } catch (e) {}
    if (!user || (user && typeof user.then === 'function')) {
      user = (AssemblyAuth.getCurrentUser && AssemblyAuth.getCurrentUser()) || null;
    }
    if (!user) {
      try {
        const s = sessionStorage.getItem('condominiumUser') || localStorage.getItem('condominiumUser');
        if (s) user = JSON.parse(s);
      } catch (e) {}
    }
    if (!user) {
      try {
        const s = sessionStorage.getItem('currentUser') || localStorage.getItem('currentUser');
        if (s) user = JSON.parse(s);
      } catch (e) {}
    }
    return user;
  }

  async function resolveUserCep(user) {
    if (AssemblyAuth.getUserCep) {
      try {
        const cep = await AssemblyAuth.getUserCep(user);
        if (cep) return cep;
      } catch (e) {}
    }
    if (user) {
      try {
        let condo = user.condominium;
        if (condo && typeof condo === 'string') condo = JSON.parse(condo);
        if (condo?.cep) {
          const d = String(condo.cep).replace(/\D/g, '');
          if (d.length === 8) return `${d.slice(0, 5)}-${d.slice(5)}`;
          return condo.cep;
        }
      } catch (e) {}
      try {
        const metadata = user.app_metadata || user.user_metadata || {};
        if (metadata.condominium?.cep) return metadata.condominium.cep;
      } catch (e) {}
    }
    try {
      return sessionStorage.getItem('user_cep') || localStorage.getItem('user_cep') || null;
    } catch (e) { return null; }
  }

  async function loadAssemblies() {
    const userCep = state.userCep;
    let all = [];
    let loadedViaApi = false;
    if (AssemblyAPI.loadAssemblyList) {
      try {
        const list = await AssemblyAPI.loadAssemblyList();
        if (Array.isArray(list) && list.length) {
          all = list;
          loadedViaApi = true;
        }
      } catch (e) {}
    }
    if (!loadedViaApi && typeof supabaseFetch === 'function') {
      try {
        let path = '/scheduled_assemblies?select=*';
        if (userCep) {
          const normalizedCep = encodeURIComponent(String(userCep).replace(/\D/g, ''));
          path = `/scheduled_assemblies?select=*&or=(cep.eq.${normalizedCep},cep.eq.${encodeURIComponent(userCep)})&order=date.desc,start_time.desc`;
        } else {
          path += '&order=date.desc,start_time.desc';
        }
        try {
          const list = await supabaseFetch(path);
          if (Array.isArray(list)) all = list;
        } catch (e) {
          try {
            let p2 = '/assemblies?select=*';
            if (userCep) {
              const nc = encodeURIComponent(String(userCep).replace(/\D/g, ''));
              p2 = `/assemblies?select=*&or=(condominium_cep.eq.${nc},condominium_cep.eq.${encodeURIComponent(userCep)})&order=scheduled_at.desc`;
            } else {
              p2 += '&order=scheduled_at.desc';
            }
            const l2 = await supabaseFetch(p2);
            if (Array.isArray(l2)) all = l2;
          } catch (e2) {}
        }
      } catch (e) {}
    }
    return all;
  }

  async function loadAttendanceCounts(assemblies) {
    const counts = {};
    if (!Array.isArray(assemblies) || assemblies.length === 0) return counts;
    if (typeof supabaseFetch !== 'function') {
      assemblies.forEach(a => { counts[a.id] = a.participants_count || a.attendance_count || 0; });
      return counts;
    }
    const ids = assemblies.map(a => a.id).filter(Boolean);
    if (ids.length === 0) return counts;
    const chunkSize = 50;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      try {
        const idList = chunk.map(id => encodeURIComponent(String(id))).join(',');
        const data = await supabaseFetch(`/assembly_attendance?select=assembly_id&assembly_id=in.(${idList})`);
        if (Array.isArray(data)) {
          data.forEach(row => {
            const id = row.assembly_id;
            counts[id] = (counts[id] || 0) + 1;
          });
        }
      } catch (e) {}
    }
    assemblies.forEach(a => {
      if (counts[a.id] === undefined) {
        counts[a.id] = a.participants_count || a.attendance_count || 0;
      }
    });
    return counts;
  }

  function computeStats(list) {
    const s = { agendada: 0, em_andamento: 0, encerrada: 0, cancelada: 0 };
    list.forEach(a => { s[normalizeStatus(a.status)] = (s[normalizeStatus(a.status)] || 0) + 1; });
    return s;
  }

  function renderStats(stats) {
    const el = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = String(v || 0); };
    el('stat-agendadas', stats.agendada);
    el('stat-andamento', stats.em_andamento);
    el('stat-encerradas', stats.encerrada);
    el('stat-canceladas', stats.cancelada);
    el('stat-participacoes', state.participationCount);
  }

  function updateOverviewCard() {
    const summary = document.getElementById('next-assembly-summary');
    const description = document.getElementById('next-assembly-description');
    const status = document.getElementById('next-assembly-status');
    const date = document.getElementById('next-assembly-date');
    const condo = document.getElementById('scope-condo-name');

    if (condo) {
      const currentCondo = state.assemblies[0] ? getAssemblyCondo(state.assemblies[0]) : (state.userCep ? `CEP ${state.userCep}` : 'Meu condomínio');
      condo.textContent = currentCondo;
    }

    const next = state.assemblies
      .filter(a => normalizeStatus(a.status) === 'agendada' || normalizeStatus(a.status) === 'em_andamento')
      .slice()
      .sort((x, y) => {
        const dx = getAssemblyDateTime(x); const dy = getAssemblyDateTime(y);
        return (dx ? dx.getTime() : Infinity) - (dy ? dy.getTime() : Infinity);
      })[0];

    if (!next) {
      if (summary) summary.textContent = 'Nenhuma assembleia futura encontrada';
      if (description) description.textContent = 'Quando uma nova assembleia for agendada para o seu condomínio, ela aparecerá aqui com acesso rápido.';
      if (status) status.textContent = 'Sem agenda ativa';
      if (date) date.textContent = '--/--/----';
      return;
    }

    const dt = getAssemblyDateTime(next);
    const when = dt && !isNaN(dt.getTime())
      ? `${formatDateBR(dt)}${formatTime(dt) ? ` às ${formatTime(dt)}` : ''}`
      : (getAssemblyDate(next) || '--/--/----');

    if (summary) summary.textContent = getAssemblyTitle(next);
    if (description) {
      const base = getAssemblyDescription(next) || 'Assembleia pronta para acompanhamento de pautas, presença, chat e entrada segura.';
      description.textContent = `${base}${base.endsWith('.') ? '' : '.'} Organizador: ${getAssemblyOrganizer(next)}.`;
    }
    if (status) status.textContent = statusLabel(normalizeStatus(next.status));
    if (date) date.textContent = when;
    if (condo) condo.textContent = getAssemblyCondo(next);
  }

  async function loadUserParticipationCount() {
    const user = state.user || {};
    const email = user.email || user.user_email || null;
    if (!email || typeof supabaseFetch !== 'function') return 0;

    const uniqueIds = new Set();

    try {
      const attendance = await supabaseFetch(`/assembly_attendance?select=assembly_id&user_email=eq.${encodeURIComponent(email)}`);
      if (Array.isArray(attendance)) {
        attendance.forEach(row => {
          if (row && row.assembly_id) uniqueIds.add(String(row.assembly_id));
        });
      }
    } catch (e) {}

    try {
      const confirmations = await supabaseFetch(`/assembly_participant_confirmations?select=assembly_id&user_email=eq.${encodeURIComponent(email)}`);
      if (Array.isArray(confirmations)) {
        confirmations.forEach(row => {
          if (row && row.assembly_id) uniqueIds.add(String(row.assembly_id));
        });
      }
    } catch (e) {}

    return uniqueIds.size;
  }

  function populateAnoOptions() {
    const sel = document.getElementById('filter-ano');
    if (!sel) return;
    const years = new Set();
    state.assemblies.forEach(a => {
      const dt = getAssemblyDateTime(a);
      if (dt && !isNaN(dt.getTime())) years.add(dt.getFullYear());
    });
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 1; y <= currentYear + 2; y++) years.add(y);
    const sorted = Array.from(years).sort((a, b) => b - a);
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Todos os anos</option>' +
      sorted.map(y => `<option value="${y}">${y}</option>`).join('');
    if (currentVal) sel.value = currentVal;
  }

  function applyFilters() {
    const f = state.filters;
    const list = state.assemblies.filter(a => {
      const st = normalizeStatus(a.status);
      if (f.status && st !== f.status) return false;
      const dt = getAssemblyDateTime(a);
      if (dt && !isNaN(dt.getTime())) {
        if (f.mes && String(dt.getMonth() + 1) !== String(f.mes)) return false;
        if (f.ano && String(dt.getFullYear()) !== String(f.ano)) return false;
      }
      const tp = getAssemblyType(a);
      if (f.tipo && tp !== f.tipo) return false;
      if (f.titulo) {
        const q = String(f.titulo).toLowerCase().trim();
        if (q) {
          const title = getAssemblyTitle(a).toLowerCase();
          const desc = getAssemblyDescription(a).toLowerCase();
          if (!title.includes(q) && !desc.includes(q)) return false;
        }
      }
      return true;
    });
    list.sort((x, y) => {
      const dx = getAssemblyDateTime(x);
      const dy = getAssemblyDateTime(y);
      const tx = dx ? dx.getTime() : 0;
      const ty = dy ? dy.getTime() : 0;
      return ty - tx;
    });
    state.filtered = list;
    return list;
  }

  function statusSectionConfig() {
    return [
      { key: 'proxima', title: 'Próxima assembleia', icon: 'fa-star', status: null, highlight: true, single: true, onlyIf: (a) => normalizeStatus(a.status) === 'agendada' },
      { key: 'em_andamento', title: 'Em andamento', icon: 'fa-play-circle', status: 'em_andamento' },
      { key: 'agendada', title: 'Agendadas', icon: 'fa-calendar-alt', status: 'agendada' },
      { key: 'encerrada', title: 'Encerradas', icon: 'fa-check-circle', status: 'encerrada' },
      { key: 'cancelada', title: 'Canceladas', icon: 'fa-times-circle', status: 'cancelada' }
    ];
  }

  function buildEmptyState(title, subtitle, icon, showCta) {
    const cta = showCta && state.user && canScheduleNow()
      ? `<button class="btn-primary btn-sm" id="empty-agendar"><i class="fas fa-calendar-plus"></i> Agendar primeira assembleia</button>`
      : '';
    return `
      <div class="empty-state">
        <div class="empty-icon"><i class="fas ${icon || 'fa-calendar'}"></i></div>
        <h3>${escapeHtml(title || 'Nenhuma assembleia encontrada')}</h3>
        <p>${escapeHtml(subtitle || 'Não há assembleias para exibir no momento.')}</p>
        ${cta}
      </div>
    `;
  }

  function buildCard(a, highlight) {
    const id = a.id;
    const status = normalizeStatus(a.status);
    const title = getAssemblyTitle(a);
    const desc = getAssemblyDescription(a);
    const dt = getAssemblyDateTime(a);
    const dateStr = dt && !isNaN(dt.getTime()) ? formatDateBR(dt) : (getAssemblyDate(a) ? formatDateBR(getAssemblyDate(a)) : '-');
    const timeStr = dt && !isNaN(dt.getTime()) ? formatTime(dt) : (getAssemblyTime(a) || '');
    const organizer = getAssemblyOrganizer(a);
    const agenda = getAssemblyAgenda(a);
    const condo = getAssemblyCondo(a);
    const participants = state.attendanceCounts[id] || 0;
    const type = getAssemblyType(a);
    const orgInitials = getInitials(organizer);

    const now = new Date();
    let actionBtn = '';
    if (status === 'em_andamento') {
      actionBtn = `<button class="btn-primary btn-sm btn-entrar" data-id="${escapeHtml(String(id))}"><i class="fas fa-sign-in-alt"></i> Entrar na assembleia</button>`;
    } else if (status === 'agendada') {
      const diffMs = (dt ? dt.getTime() : 0) - now.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin <= 15 && diffMin > -30) {
        actionBtn = `<button class="btn-primary btn-sm btn-entrar" data-id="${escapeHtml(String(id))}"><i class="fas fa-sign-in-alt"></i> Entrar na assembleia</button>`;
      } else {
        actionBtn = `<button class="btn-primary btn-sm" disabled title="Aguardando início"><i class="fas fa-clock"></i> Aguardando início</button>`;
      }
    }

    const agendaHtml = agenda.length
      ? `<div class="card-tags">${agenda.slice(0, 3).map(i => `<span class="tag">${escapeHtml(String(i).substring(0, 40))}</span>`).join('')}</div>`
      : '';

    const highlightClass = highlight ? ' highlight' : '';

    return `
      <div class="assembly-card status-${status}${highlightClass}" data-id="${escapeHtml(String(id))}" data-status="${status}">
        <div class="card-header">
          <span class="card-status">${statusLabel(status)}</span>
          <h3>${escapeHtml(title)}</h3>
          <div class="card-date">
            <i class="far fa-calendar-alt"></i>
            <span>${dateStr}${timeStr ? ' às ' + timeStr : ''}</span>
          </div>
        </div>
        <div class="card-body">
          ${desc ? `<p style="font-size:14px;color:var(--gray-600);line-height:1.5;">${escapeHtml(desc)}${desc.length >= 120 ? '...' : ''}</p>` : ''}
          ${agendaHtml}
          <div class="card-info">
            <div class="info-item">
              <span class="label">Organizador</span>
              <span class="value">${escapeHtml(organizer)}</span>
            </div>
            <div class="info-item">
              <span class="label">Tipo</span>
              <span class="value">${typeLabel(type)}</span>
            </div>
            <div class="info-item">
              <span class="label">Condomínio</span>
              <span class="value">${escapeHtml(condo)}</span>
            </div>
            <div class="info-item">
              <span class="label">Participantes</span>
              <span class="value"><i class="fas fa-users" style="margin-right:4px;color:var(--gray-500);"></i>${participants}</span>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn-outline btn-sm btn-detalhes" data-id="${escapeHtml(String(id))}">
            <i class="fas fa-info-circle"></i> Detalhes
          </button>
          ${actionBtn}
        </div>
      </div>
    `;
  }

  function canScheduleNow() {
    if (AssemblyPermissions && typeof AssemblyPermissions.canCreateAssembly === 'function') {
      return AssemblyPermissions.canCreateAssembly(state.user);
    }
    if (AssemblyAuth && typeof AssemblyAuth.isSindico === 'function') {
      return AssemblyAuth.isSindico(state.user);
    }
    const u = state.user || {};
    const t = (u.type || u.user_type || u.role || '').toString().toLowerCase();
    return t === 'sindico' || t === 'síndico' || t === 'admin';
  }

  function renderSections() {
    const container = document.getElementById('sections-container');
    if (!container) return;
    const list = state.filtered;
    if (list.length === 0 && state.loaded) {
      container.innerHTML = buildEmptyState(
        'Nenhuma assembleia encontrada',
        state.assemblies.length === 0
          ? 'Ainda não existem assembleias agendadas para o seu condomínio.'
          : 'Tente ajustar os filtros para visualizar outras assembleias.',
        'fa-calendar-day',
        state.assemblies.length === 0
      );
      const emptyBtn = document.getElementById('empty-agendar');
      if (emptyBtn) emptyBtn.addEventListener('click', onScheduleClick);
      return;
    }
    const sections = statusSectionConfig();
    let html = '';
    const byStatus = {};
    list.forEach(a => { byStatus[normalizeStatus(a.status)] = byStatus[normalizeStatus(a.status)] || []; byStatus[normalizeStatus(a.status)].push(a); });
    const proximaCandidate = (byStatus.agendada || []).slice().sort((x, y) => {
      const dx = getAssemblyDateTime(x); const dy = getAssemblyDateTime(y);
      const tx = dx ? dx.getTime() : Infinity; const ty = dy ? dy.getTime() : Infinity;
      return tx - ty;
    })[0];

    sections.forEach(sec => {
      let items = [];
      if (sec.key === 'proxima') {
        items = proximaCandidate ? [proximaCandidate] : [];
      } else {
        items = byStatus[sec.status] || [];
        if (sec.key === 'agendada' && proximaCandidate) {
          items = items.filter(a => a.id !== proximaCandidate.id);
        }
        if (sec.key === 'agendada') {
          items = items.slice().sort((x, y) => {
            const dx = getAssemblyDateTime(x); const dy = getAssemblyDateTime(y);
            const tx = dx ? dx.getTime() : 0; const ty = dy ? dy.getTime() : 0;
            return tx - ty;
          });
        }
      }
      if (items.length === 0) return;
      const cardsHtml = (sec.single ? [items[0]] : items).map(a => buildCard(a, sec.highlight)).join('');
      html += `
        <section class="section section-${sec.key}" style="margin-bottom:32px;">
          <div class="section-header">
            <h2><i class="fas ${sec.icon}" style="margin-right:10px;color:var(--primary-blue);"></i>${escapeHtml(sec.title)} <span style="font-size:14px;font-weight:500;color:var(--gray-500);">(${items.length})</span></h2>
          </div>
          <div class="assemblies-grid">${cardsHtml}</div>
        </section>
      `;
    });
    if (!html) {
      html = buildEmptyState(
        'Nenhuma assembleia corresponde aos filtros',
        'Tente limpar os filtros para visualizar todas as assembleias.',
        'fa-filter',
        false
      );
    }
    container.innerHTML = html;
    bindCardEvents();
  }

  function bindCardEvents() {
    document.querySelectorAll('.btn-detalhes').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        if (!id) return;
        window.location.href = `assembleia-detalhes.html?id=${encodeURIComponent(id)}`;
      });
    });
    document.querySelectorAll('.btn-entrar').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        if (!id) return;
        window.location.href = `assembleia-preparacao.html?id=${encodeURIComponent(id)}`;
      });
    });
  }

  function bindFilterEvents() {
    const ids = ['filter-titulo', 'filter-status', 'filter-mes', 'filter-ano', 'filter-tipo'];
    const map = { 'filter-titulo': 'titulo', 'filter-status': 'status', 'filter-mes': 'mes', 'filter-ano': 'ano', 'filter-tipo': 'tipo' };
    const applyDebounced = debounce(() => {
      applyFilters();
      renderSections();
    }, 250);
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = id === 'filter-titulo' ? 'input' : 'change';
      el.addEventListener(evt, () => {
        state.filters[map[id]] = el.value;
        if (id === 'filter-titulo') applyDebounced();
        else { applyFilters(); renderSections(); }
      });
    });
    const limpar = document.getElementById('btn-limpar-filtros');
    if (limpar) {
      limpar.addEventListener('click', () => {
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        state.filters = { titulo: '', status: '', mes: '', ano: '', tipo: '' };
        applyFilters();
        renderSections();
      });
    }
  }

  function onScheduleClick() {
    openScheduleModal();
  }

  function openScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeScheduleModal() {
    const modal = document.getElementById('schedule-modal');
    const form = document.getElementById('schedule-form-v2');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (form) form.reset();
  }

  function buildSchedulePayload(form) {
    const title = document.getElementById('schedule-title')?.value?.trim();
    const description = document.getElementById('schedule-description')?.value?.trim() || null;
    const date = document.getElementById('schedule-date')?.value;
    const startTime = document.getElementById('schedule-start-time')?.value;
    const endTime = document.getElementById('schedule-end-time')?.value || startTime;
    const type = document.getElementById('schedule-type')?.value || 'ordinaria';
    const mainTopic = document.getElementById('schedule-main-topic')?.value?.trim() || null;
    const rules = document.getElementById('schedule-rules')?.value?.trim() || null;

    if (!title || !date || !startTime || !endTime) {
      throw new Error('Preencha título, data e horários para agendar.');
    }

    return {
      cep: state.userCep,
      title,
      description,
      date,
      start_time: startTime,
      end_time: endTime,
      type,
      assembly_type: type,
      pauta_principal: mainTopic,
      rules,
      created_by: state.user?.email || state.user?.id || 'usuario',
      organizer_name: state.user?.name || state.user?.full_name || state.user?.email || 'Condomínio'
    };
  }

  async function submitScheduleForm(event) {
    event.preventDefault();
    if (!state.userCep) {
      showToast('Não foi possível identificar o condomínio do usuário.', 'error');
      return;
    }
    if (!canScheduleNow()) {
      showToast('Você não possui permissão para agendar assembleias.', 'warning');
      return;
    }
    if (typeof scheduleAssemblyDb !== 'function') {
      showToast('O serviço de agendamento não está disponível nesta página.', 'error');
      return;
    }

    const submitBtn = document.getElementById('schedule-submit-btn');
    try {
      if (submitBtn) submitBtn.disabled = true;
      const payload = buildSchedulePayload(event.currentTarget);
      const saved = await scheduleAssemblyDb(payload);
      if (saved) {
        state.assemblies.unshift({ ...saved, status: normalizeStatus(saved.status || 'agendada') });
      }
      populateAnoOptions();
      state.attendanceCounts = await loadAttendanceCounts(state.assemblies);
      state.participationCount = await loadUserParticipationCount();
      applyFilters();
      renderStats(computeStats(state.assemblies));
      updateOverviewCard();
      renderSections();
      closeScheduleModal();
      showToast('Assembleia agendada com sucesso.', 'success');
    } catch (e) {
      console.error('Erro ao agendar assembleia:', e);
      showToast(e.message || 'Não foi possível agendar a assembleia.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function updateScheduleButton() {
    const btn = document.getElementById('btn-agendar');
    if (!btn) return;
    if (canScheduleNow()) {
      btn.style.display = '';
      if (!btn.dataset.bound) {
        btn.addEventListener('click', onScheduleClick);
        btn.dataset.bound = '1';
      }
    } else {
      btn.style.display = 'none';
    }
  }

  function bindScheduleModal() {
    const form = document.getElementById('schedule-form-v2');
    if (form && !form.dataset.bound) {
      form.addEventListener('submit', submitScheduleForm);
      form.dataset.bound = '1';
    }

    document.querySelectorAll('[data-close-schedule]').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.addEventListener('click', closeScheduleModal);
      btn.dataset.bound = '1';
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeScheduleModal();
    }, { once: false });
  }

  async function init() {
    try {
      const user = checkAuth();
      if (user && typeof user.then === 'function') {
        try { state.user = await user; } catch (e) { state.user = null; }
      } else {
        state.user = user;
      }
      if (!state.user) {
        if (showToast) showToast('Usuário não autenticado', 'warning');
      }
      state.userCep = await resolveUserCep(state.user);
      populateUserBadge();
      updateScheduleButton();
      const assemblies = await loadAssemblies();
      state.assemblies = assemblies.map(a => ({ ...a, status: normalizeStatus(a.status) }));
      if (state.userCep) {
        const normUser = String(state.userCep).replace(/\D/g, '');
        state.assemblies = state.assemblies.filter(a => {
          const c = String(getAssemblyCep(a) || '').replace(/\D/g, '');
          if (!c) return true;
          return c === normUser;
        });
      }
      populateAnoOptions();
      state.attendanceCounts = await loadAttendanceCounts(state.assemblies);
      state.participationCount = await loadUserParticipationCount();
      state.loaded = true;
      const stats = computeStats(state.assemblies);
      renderStats(stats);
      updateOverviewCard();
      applyFilters();
      renderSections();
    } catch (e) {
      console.error('Erro ao inicializar lista de assembleias:', e);
      state.loaded = true;
      if (showToast) showToast('Erro ao carregar assembleias: ' + (e.message || 'Tente novamente'), 'error');
      const c = document.getElementById('sections-container');
      if (c) c.innerHTML = buildEmptyState('Erro ao carregar assembleias', e.message || 'Tente novamente em alguns instantes.', 'fa-exclamation-triangle', false);
    }
  }

  function render() {
    applyFilters();
    renderStats(computeStats(state.filtered));
    renderSections();
  }

  window.AssemblyList = {
    init,
    state,
    render
  };

  document.addEventListener('DOMContentLoaded', function () {
    bindFilterEvents();
    bindScheduleModal();
    init();
  });
})();
