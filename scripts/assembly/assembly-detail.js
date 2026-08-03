(function () {
  var THIRTY_MINUTES_MS = 30 * 60 * 1000;
  var countdownInterval = null;

  var state = {
    assemblyId: null,
    assembly: null,
    agendaItems: [],
    documents: [],
    confirmations: [],
    attendanceCount: 0,
    polls: [],
    currentUser: null,
    userCep: null,
    accessAllowed: false,
    accessReason: null,
    currentConfirmation: null
  };

  function pad2(n) {
    return String(Math.max(0, Math.floor(n || 0))).padStart(2, '0');
  }

  function normalizeCep(c) {
    return String(c || '').replace(/\D/g, '');
  }

  function showToast(message, type, duration) {
    if (window.AssemblyUtils && typeof window.AssemblyUtils.showToast === 'function') {
      return window.AssemblyUtils.showToast(message, type, duration);
    }
    var container = document.getElementById('toast-container');
    if (!container) return null;
    type = type || 'info';
    duration = duration || 3000;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var iconMap = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    var bgMap = {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
    Object.assign(toast.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '12px 18px',
      borderRadius: '8px',
      color: '#fff',
      fontWeight: '500',
      zIndex: '99999',
      transform: 'translateX(120%)',
      transition: 'transform 0.3s ease',
      backgroundColor: bgMap[type] || bgMap.info,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    toast.innerHTML = '<i class="fas ' + (iconMap[type] || iconMap.info) + '"></i><span>' + (AssemblyUtils ? AssemblyUtils.escapeHtml(message) : message) + '</span>';
    container.appendChild(toast);
    requestAnimationFrame(function () {
      toast.style.transform = 'translateX(0)';
    });
    setTimeout(function () {
      toast.style.transform = 'translateX(120%)';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, duration);
    return toast;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function hide(id) { var e = el(id); if (e) e.style.display = 'none'; }
  function show(id, display) { var e = el(id); if (e) e.style.display = display || ''; }
  function text(id, val) { var e = el(id); if (e) e.textContent = val != null ? val : ''; }

  async function supabaseGet(path) {
    var fullUrl = (window.SUPABASE_REST_URL || '') + path;
    var headers = Object.assign({}, window.SUPABASE_HEADERS || {});
    var token = null;
    try {
      if (window.AssemblyAuth && typeof window.AssemblyAuth.getCurrentUser === 'function') {
        var sUser = window.AssemblyAuth.getCurrentUser();
        if (sUser && sUser.token) token = sUser.token;
      }
    } catch (_) {}
    try {
      var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
      if (t) token = t;
    } catch (_) {}
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var response = await fetch(fullUrl, { method: 'GET', headers: headers });
    var txt = await response.text();
    var data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt; }
    if (!response.ok) {
      var msg = (data && (data.message || data.error)) || ('Erro ' + response.status + ': ' + response.statusText);
      var err = new Error(msg);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function supabaseUpsert(table, payload, onConflict) {
    var fullUrl = (window.SUPABASE_REST_URL || '') + '/' + table;
    var headers = Object.assign({}, window.SUPABASE_HEADERS || {});
    headers['Prefer'] = 'return=representation,resolution=merge-duplicates' + (onConflict ? ',on_conflict=' + onConflict : '');
    var token = null;
    try {
      var t = sessionStorage.getItem('sb-access-token') || localStorage.getItem('sb-access-token');
      if (t) token = t;
    } catch (_) {}
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var response = await fetch(fullUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
    var txt = await response.text();
    var data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt; }
    if (!response.ok) {
      var msg = (data && (data.message || data.error)) || ('Erro ' + response.status + ': ' + response.statusText);
      var err = new Error(msg);
      err.status = response.status;
      throw err;
    }
    return Array.isArray(data) ? data[0] : data;
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'em_andamento': case 'live': case 'active': case 'in_progress':
        return { label: 'Em andamento', cls: 'status-em_andamento' };
      case 'encerrada': case 'finalizada': case 'completed':
        return { label: 'Encerrada', cls: 'status-encerrada' };
      case 'cancelada': case 'cancelled':
        return { label: 'Cancelada', cls: 'status-cancelada' };
      case 'agendada': case 'scheduled': default:
        return { label: 'Agendada', cls: 'status-agendada' };
    }
  }

  function getTypeLabel(t) {
    switch (t) {
      case 'extraordinaria': return 'Extraordinária';
      case 'especial': return 'Especial';
      case 'ordinaria': default: return 'Ordinária';
    }
  }

  function getRoleLabel(r) {
    if (!r) return 'Morador';
    var low = String(r).toLowerCase();
    if (low.startsWith('sind') || low === 'síndico') return 'Síndico';
    if (low.startsWith('porteir')) return 'Porteiro';
    return 'Morador';
  }

  function getDocIconClass(docType) {
    var t = String(docType || '').toLowerCase();
    if (t === 'pdf') return 'pdf';
    if (t === 'doc' || t === 'docx' || t === 'ata' || t === 'contrato' || t === 'pauta' || t === 'edital' || t === 'projeto') return 'doc';
    if (t === 'xls' || t === 'xlsx' || t === 'balanco') return 'xls';
    return 'doc';
  }

  function getDocFaIcon(docType) {
    var t = String(docType || '').toLowerCase();
    if (t === 'pdf') return 'fa-file-pdf';
    if (t === 'xls' || t === 'xlsx' || t === 'balanco') return 'fa-file-excel';
    return 'fa-file-alt';
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getAssemblyStartDate(assembly) {
    if (!assembly) return null;
    var dateStr = assembly.date || assembly.scheduled_date || assembly.event_date;
    var timeStr = assembly.start_time || assembly.scheduled_time || '00:00';
    if (!dateStr) {
      var at = assembly.scheduled_at || assembly.start_at || assembly.assembly_date;
      if (at) return new Date(at);
      return null;
    }
    return new Date(dateStr + 'T' + (timeStr || '00:00:00'));
  }

  function isEndedStatus(status) {
    return status === 'encerrada' || status === 'finalizada' || status === 'completed' || status === 'cancelada' || status === 'cancelled';
  }

  function isLiveStatus(status) {
    return status === 'em_andamento' || status === 'live' || status === 'active' || status === 'in_progress';
  }

  function renderHero() {
    var a = state.assembly;
    if (!a) return;
    text('assembly-title', a.title || a.name || 'Assembleia');
    text('assembly-description', a.description || 'Nenhuma descrição fornecida.');

    var statusInfo = getStatusLabel(a.status);
    var heroBadge = el('hero-badge');
    var heroBadgeText = el('hero-badge-text');
    if (heroBadgeText) heroBadgeText.textContent = statusInfo.label;

    if (statusInfo.cls === 'status-em_andamento') {
      if (heroBadge) {
        heroBadge.style.background = 'rgba(13, 202, 240, 0.25)';
        heroBadge.style.color = '#fff';
      }
    } else if (statusInfo.cls === 'status-encerrada') {
      if (heroBadge) {
        heroBadge.style.background = 'rgba(25, 135, 84, 0.25)';
        heroBadge.style.color = '#fff';
      }
    } else if (statusInfo.cls === 'status-cancelada') {
      if (heroBadge) {
        heroBadge.style.background = 'rgba(220, 53, 69, 0.25)';
        heroBadge.style.color = '#fff';
      }
    } else {
      if (heroBadge) {
        heroBadge.style.background = 'rgba(255, 255, 255, 0.15)';
        heroBadge.style.color = '#fff';
      }
    }

    var startDate = getAssemblyStartDate(a);
    if (window.AssemblyUtils) {
      if (a.date) text('meta-date', AssemblyUtils.formatDateBR(a.date));
      else if (startDate) text('meta-date', AssemblyUtils.formatDateBR(startDate));
      if (a.start_time) text('meta-time', a.start_time);
      else if (startDate) text('meta-time', AssemblyUtils.formatTime(startDate));
    } else {
      if (a.date) text('meta-date', a.date);
      if (a.start_time) text('meta-time', a.start_time);
    }

    var durMin = a.expected_duration_minutes || a.duration_minutes || a.duration;
    text('meta-duration', durMin ? durMin + ' min' : '-- min');
    text('meta-type', getTypeLabel(a.assembly_type || a.type));

    var condoInfo = a.condominium_name || a.building_name;
    if (condoInfo) text('meta-condo', condoInfo);
    else if (a.cep) text('meta-condo', 'CEP ' + a.cep);
    else text('meta-condo', 'Condomínio');
  }

  function renderCountdown() {
    var a = state.assembly;
    if (!a) return;

    var status = a.status;
    var ended = isEndedStatus(status);
    var live = isLiveStatus(status);
    var startDate = getAssemblyStartDate(a);

    var activeTimer = el('countdown-timer-active');
    var statusBox = el('countdown-status');
    var labelEl = el('countdown-label');

    function clearBoxes() {
      ['status-em-andamento', 'status-encerrada', 'status-cancelada', 'status-iniciando'].forEach(hide);
    }
    clearBoxes();

    if (ended) {
      if (activeTimer) activeTimer.style.display = 'none';
      if (statusBox) statusBox.style.display = '';
      if (labelEl) labelEl.textContent = 'Status da assembleia';
      if (status === 'cancelada' || status === 'cancelled') show('status-cancelada');
      else show('status-encerrada');
      return;
    }

    if (live) {
      if (activeTimer) activeTimer.style.display = 'none';
      if (statusBox) statusBox.style.display = '';
      if (labelEl) labelEl.textContent = 'Status da assembleia';
      show('status-em-andamento');
      return;
    }

    if (!startDate || isNaN(startDate.getTime())) {
      if (activeTimer) activeTimer.style.display = 'none';
      if (statusBox) statusBox.style.display = '';
      if (labelEl) labelEl.textContent = 'Data não definida';
      show('status-iniciando');
      return;
    }

    if (activeTimer) activeTimer.style.display = '';
    if (statusBox) statusBox.style.display = 'none';
    if (labelEl) labelEl.textContent = 'Tempo restante para o início';

    updateCountdownValues(startDate);
  }

  function updateCountdownValues(startDate) {
    var now = new Date().getTime();
    var diff = startDate.getTime() - now;
    if (diff <= 0) {
      text('cd-days', '00');
      text('cd-hours', '00');
      text('cd-minutes', '00');
      text('cd-seconds', '00');
      var activeTimer = el('countdown-timer-active');
      var statusBox = el('countdown-status');
      var labelEl = el('countdown-label');
      if (activeTimer) activeTimer.style.display = 'none';
      if (statusBox) statusBox.style.display = '';
      if (labelEl) labelEl.textContent = 'Status da assembleia';
      ['status-em-andamento', 'status-encerrada', 'status-cancelada'].forEach(hide);
      show('status-iniciando');
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      updateCtaButtons();
      return;
    }
    var totalSec = Math.floor(diff / 1000);
    var days = Math.floor(totalSec / 86400);
    var hours = Math.floor((totalSec % 86400) / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;
    text('cd-days', pad2(days));
    text('cd-hours', pad2(hours));
    text('cd-minutes', pad2(mins));
    text('cd-seconds', pad2(secs));
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    var a = state.assembly;
    if (!a) return;
    if (isEndedStatus(a.status) || isLiveStatus(a.status)) return;
    var startDate = getAssemblyStartDate(a);
    if (!startDate) return;
    countdownInterval = setInterval(function () {
      updateCountdownValues(startDate);
    }, 1000);
  }

  function renderGeneralInfo() {
    var a = state.assembly;
    if (!a) return;
    var organizer = a.organizer_name || a.created_by_name || a.created_by;
    if (!organizer) organizer = 'Conselho Gestor';
    text('info-organizer', organizer);
    text('info-rules', a.rules || 'Não informadas');
    text('info-quorum', a.quorum_description || (a.quorum_percent ? a.quorum_percent + '% dos presentes' : 'Maioria simples'));
    text('info-attendance-count', String(state.attendanceCount || 0));
  }

  function renderAgenda() {
    var container = el('agenda-list');
    if (!container) return;
    var items = state.agendaItems || [];
    var badge = el('agenda-count');
    if (badge) badge.textContent = items.length + (items.length === 1 ? ' item' : ' itens');

    if (!items.length) {
      container.innerHTML = '<div class="empty-state" style="padding: 32px 24px;">' +
        '<div class="empty-icon" style="width: 64px; height: 64px; font-size: 28px;"><i class="fas fa-file-alt"></i></div>' +
        '<h3 style="font-size: 16px;">Nenhuma pauta cadastrada</h3>' +
        '<p style="font-size: 14px; margin-bottom: 0;">As pautas serão adicionadas em breve.</p>' +
        '</div>';
      return;
    }

    var esc = window.AssemblyUtils ? window.AssemblyUtils.escapeHtml : function (x) { return String(x || ''); };
    var statusMap = {
      nao_iniciada: { text: 'Pendente', cls: 'pendente' },
      em_discussao: { text: 'Em discussão', cls: 'andamento' },
      em_votacao: { text: 'Em votação', cls: 'andamento' },
      concluida: { text: 'Concluída', cls: 'aprovada' }
    };
    var itemClassMap = {
      nao_iniciada: '',
      em_discussao: 'current',
      em_votacao: 'current',
      concluida: 'completed'
    };

    container.innerHTML = items.map(function (item, idx) {
      var status = statusMap[item.status] || statusMap.nao_iniciada;
      var cls = itemClassMap[item.status] || '';
      var estimated = item.estimated_minutes ? ' (' + item.estimated_minutes + ' min)' : '';
      var responsible = item.responsible_name ? '<p style="margin-top: 6px; font-size: 12px; color: var(--gray-500);"><i class="fas fa-user"></i> ' + esc(item.responsible_name) + '</p>' : '';
      var desc = item.description ? '<p>' + esc(item.description) + '</p>' : '';
      return '<div class="agenda-item ' + cls + '">' +
        '<div class="agenda-number">' + (idx + 1) + '</div>' +
        '<div class="agenda-content">' +
        '<h4>' + esc(item.title) + estimated + '</h4>' +
        desc +
        responsible +
        '</div>' +
        '<span class="agenda-status ' + status.cls + '">' + status.text + '</span>' +
        '</div>';
    }).join('');
  }

  function renderPolls() {
    var container = el('polls-preview');
    if (!container) return;
    var polls = state.polls || [];

    if (!polls.length) {
      container.innerHTML = '<div class="empty-state" style="padding: 32px 24px;">' +
        '<div class="empty-icon" style="width: 64px; height: 64px; font-size: 28px;"><i class="fas fa-check-double"></i></div>' +
        '<h3 style="font-size: 16px;">Sem votações previstas</h3>' +
        '<p style="font-size: 14px; margin-bottom: 0;">As votações serão criadas durante a assembleia.</p>' +
        '</div>';
      return;
    }

    var esc = window.AssemblyUtils ? window.AssemblyUtils.escapeHtml : function (x) { return String(x || ''); };
    container.innerHTML = polls.map(function (poll) {
      var isClosed = poll.status === 'encerrada' || poll.status === 'fechada' || poll.status === 'closed';
      var totalVotes = poll.total_votes || 0;
      var options = Array.isArray(poll.options) ? poll.options : (poll._options || []);
      var optionsHtml = options.map(function (opt) {
        var label = typeof opt === 'string' ? opt : (opt.text || opt.label || opt.title || 'Opção');
        var votes = typeof opt === 'object' ? (opt.votes || opt.count || 0) : 0;
        var pct = totalVotes > 0 ? Math.min(100, Math.round((votes / totalVotes) * 100)) : 0;
        return '<div style="margin-bottom: 10px;">' +
          '<div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">' +
          '<span style="color: var(--gray-800); font-weight: 500;">' + esc(label) + '</span>' +
          '<span style="color: var(--primary-blue); font-weight: 700;">' + votes + ' votos (' + pct + '%)</span>' +
          '</div>' +
          '<div class="vote-progress"><div class="progress-bar" style="width: ' + pct + '%;"></div></div>' +
          '</div>';
      }).join('');
      var statusBadge = isClosed
        ? '<span class="poll-status-badge encerrada">Encerrada</span>'
        : '<span class="poll-status-badge aberta">Aberta</span>';
      return '<div class="poll-item">' +
        '<div class="poll-header">' +
        '<div class="poll-title">' + esc(poll.title || poll.question || 'Votação') + '</div>' +
        statusBadge +
        '</div>' +
        '<div style="font-size: 12px; color: var(--gray-500); margin-bottom: 8px;">Total: ' + totalVotes + ' votos</div>' +
        '<div class="poll-options" style="margin-top: 8px;">' + optionsHtml + '</div>' +
        '</div>';
    }).join('');
  }

  function renderDocuments() {
    var container = el('documents-list');
    if (!container) return;
    var docs = state.documents || [];
    var badge = el('docs-count');
    if (badge) badge.textContent = docs.length + (docs.length === 1 ? ' arquivo' : ' arquivos');

    if (!docs.length) {
      container.innerHTML = '<div class="empty-state" style="padding: 32px 24px;">' +
        '<div class="empty-icon" style="width: 64px; height: 64px; font-size: 28px;"><i class="fas fa-cloud-upload-alt"></i></div>' +
        '<h3 style="font-size: 16px;">Nenhum documento disponível</h3>' +
        '<p style="font-size: 14px; margin-bottom: 0;">Os documentos serão disponibilizados antes da assembleia.</p>' +
        '</div>';
      return;
    }

    var esc = window.AssemblyUtils ? window.AssemblyUtils.escapeHtml : function (x) { return String(x || ''); };
    container.innerHTML = docs.map(function (doc) {
      var iconClass = getDocIconClass(doc.document_type || doc.type);
      var faIcon = getDocFaIcon(doc.document_type || doc.type);
      var size = formatFileSize(doc.file_size_bytes);
      var metaParts = [];
      if (doc.document_type) metaParts.push(getTypeLabelForDoc(doc.document_type));
      if (size) metaParts.push(size);
      var url = doc.document_url || doc.url || '#';
      return '<a class="document-item" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        '<div class="document-icon ' + iconClass + '"><i class="fas ' + faIcon + '"></i></div>' +
        '<div class="document-info">' +
        '<div class="document-name">' + esc(doc.title || doc.name || 'Documento') + '</div>' +
        '<div class="document-meta">' + esc(metaParts.join(' · ')) + '</div>' +
        (doc.description ? '<div class="document-meta" style="margin-top: 2px;">' + esc(doc.description) + '</div>' : '') +
        '</div>' +
        '</a>';
    }).join('');
  }

  function getTypeLabelForDoc(t) {
    var map = {
      edital: 'Edital',
      ata: 'Ata',
      pauta: 'Pauta',
      balanco: 'Balanço',
      contrato: 'Contrato',
      projeto: 'Projeto',
      outro: 'Outro'
    };
    return map[t] || (t ? String(t).charAt(0).toUpperCase() + String(t).slice(1) : 'Outro');
  }

  function renderParticipants() {
    var container = el('participants-list');
    if (!container) return;
    var confs = (state.confirmations || []).filter(function (c) { return c && c.will_attend !== false; });
    var badge = el('participants-count');
    if (badge) badge.textContent = confs.length + (confs.length === 1 ? ' confirmado' : ' confirmados');

    var user = state.currentUser;
    var userEmail = user && (user.email || user.user_email);
    var currentConf = null;
    if (userEmail) {
      for (var i = 0; i < (state.confirmations || []).length; i++) {
        if (String(state.confirmations[i].user_email) === String(userEmail)) {
          currentConf = state.confirmations[i];
          break;
        }
      }
    }
    state.currentConfirmation = currentConf;

    var btnPresence = el('btn-confirm-presence');
    var presenceIcon = el('presence-icon');
    var presenceText = el('presence-text');
    if (!state.accessAllowed) {
      if (btnPresence) {
        btnPresence.disabled = true;
        btnPresence.style.opacity = '0.5';
        btnPresence.style.cursor = 'not-allowed';
      }
    } else if (currentConf && currentConf.will_attend) {
      if (presenceIcon) {
        presenceIcon.className = 'fas fa-check-circle';
        presenceIcon.style.color = '';
      }
      if (presenceText) presenceText.textContent = 'Presença confirmada • Cancelar';
      if (btnPresence) {
        btnPresence.className = 'btn btn-primary';
        btnPresence.style.width = '100%';
        btnPresence.style.marginBottom = '20px';
      }
    } else {
      if (presenceIcon) {
        presenceIcon.className = 'far fa-calendar-check';
      }
      if (presenceText) presenceText.textContent = 'Confirmar presença';
      if (btnPresence) {
        btnPresence.className = 'btn btn-outline';
        btnPresence.style.width = '100%';
        btnPresence.style.marginBottom = '20px';
      }
    }

    if (!confs.length) {
      container.innerHTML = '<div class="empty-state" style="padding: 24px 12px;">' +
        '<div class="empty-icon" style="width: 56px; height: 56px; font-size: 24px;"><i class="fas fa-user-clock"></i></div>' +
        '<p style="font-size: 13px; margin-bottom: 0;">Nenhum participante confirmou presença ainda.</p>' +
        '</div>';
      return;
    }

    var esc = window.AssemblyUtils ? window.AssemblyUtils.escapeHtml : function (x) { return String(x || ''); };
    var init = window.AssemblyUtils ? window.AssemblyUtils.getInitials : function (n) {
      return (n || '?').trim().split(/\s+/).map(function (p) { return p.charAt(0); }).slice(0, 2).join('').toUpperCase();
    };

    container.innerHTML = confs.map(function (p) {
      var name = p.participant_name || p.name || p.user_name || 'Participante';
      var role = getRoleLabel(p.participant_role || p.role || p.user_type);
      var isCheckedIn = p.checked_in || p.check_in_at || p.attended;
      var statusIcon = isCheckedIn
        ? '<i class="fas fa-check-circle" style="color: var(--success); font-size: 14px;" title="Check-in realizado"></i>'
        : '<i class="far fa-clock" style="color: var(--gray-400); font-size: 14px;" title="Aguardando check-in"></i>';
      return '<div class="participant-item">' +
        '<div class="participant-avatar">' + esc(init(name)) + '</div>' +
        '<div class="participant-info">' +
        '<div class="participant-name">' + esc(name) + '</div>' +
        '<div class="participant-role">' + esc(role) + '</div>' +
        '</div>' +
        statusIcon +
        '</div>';
    }).join('');
  }

  function renderLinks() {
    var a = state.assembly;
    if (!a) return;
    var section = el('links-resultado-section');
    var ended = isEndedStatus(a.status);
    if (!section) return;

    var linkResultado = el('link-resultado');
    var linkAta = el('link-ata');
    var linkGravacao = el('link-gravacao');

    var id = state.assemblyId;
    if (linkResultado && id) {
      linkResultado.href = 'assembleia-resumo.html?id=' + encodeURIComponent(id);
    }
    if (linkAta) {
      if (a.minutes_document_url || a.ata_url) {
        linkAta.href = a.minutes_document_url || a.ata_url;
        linkAta.target = '_blank';
        linkAta.rel = 'noopener noreferrer';
        linkAta.style.display = 'flex';
      } else {
        linkAta.style.display = 'none';
      }
    }
    if (linkGravacao) {
      if (a.recording_url || a.video_url) {
        linkGravacao.href = a.recording_url || a.video_url;
        linkGravacao.target = '_blank';
        linkGravacao.rel = 'noopener noreferrer';
        linkGravacao.style.display = 'flex';
      } else {
        linkGravacao.style.display = 'none';
      }
    }

    section.style.display = ended ? '' : 'none';
  }

  function updateCtaButtons() {
    var a = state.assembly;
    if (!a) return;
    var status = a.status;
    var ended = isEndedStatus(status);
    var live = isLiveStatus(status);
    var cancelled = status === 'cancelada' || status === 'cancelled';

    var btnCtaMain = el('btn-cta-main');
    var ctaMainText = el('cta-main-text');
    var ctaMainIcon = el('cta-main-icon');
    var btnEntrarAgora = el('btn-entrar-agora');
    var ctaSection = el('cta-section');

    var accessDenied = !state.accessAllowed;

    function disable(btn) {
      if (!btn) return;
      btn.disabled = true;
      btn.style.cursor = 'not-allowed';
      btn.style.opacity = '0.6';
    }
    function enable(btn) {
      if (!btn) return;
      btn.disabled = false;
      btn.style.cursor = 'pointer';
      btn.style.opacity = '1';
    }

    if (accessDenied) {
      if (ctaMainText) ctaMainText.textContent = 'Acesso restrito';
      if (ctaMainIcon) { ctaMainIcon.className = 'fas fa-lock'; }
      if (btnCtaMain) { btnCtaMain.className = 'btn btn-outline btn-lg'; btnCtaMain.style.width = '100%'; btnCtaMain.style.marginBottom = '12px'; }
      disable(btnCtaMain);
      disable(btnEntrarAgora);
      hide('participants-section');
      show('access-denied-section');
      return;
    } else {
      show('participants-section');
      hide('access-denied-section');
    }

    if (ended || cancelled) {
      if (cancelled) {
        if (ctaMainText) ctaMainText.textContent = 'Assembleia cancelada';
        if (ctaMainIcon) ctaMainIcon.className = 'fas fa-times-circle';
      } else {
        if (ctaMainText) ctaMainText.textContent = 'Assembleia encerrada';
        if (ctaMainIcon) ctaMainIcon.className = 'fas fa-flag-checkered';
      }
      if (btnCtaMain) { btnCtaMain.className = 'btn btn-outline btn-lg'; btnCtaMain.style.width = '100%'; btnCtaMain.style.marginBottom = '12px'; }
      disable(btnCtaMain);
      disable(btnEntrarAgora);
      return;
    }

    if (live) {
      if (ctaMainText) ctaMainText.textContent = 'Entrar agora';
      if (ctaMainIcon) ctaMainIcon.className = 'fas fa-video';
      if (btnCtaMain) { btnCtaMain.className = 'btn btn-primary btn-lg'; btnCtaMain.style.width = '100%'; btnCtaMain.style.marginBottom = '12px'; }
      enable(btnCtaMain);
      enable(btnEntrarAgora);
      return;
    }

    var startDate = getAssemblyStartDate(a);
    var now = new Date().getTime();
    var diff = startDate ? (startDate.getTime() - now) : Infinity;

    if (diff > 0 && diff <= THIRTY_MINUTES_MS) {
      if (ctaMainText) ctaMainText.textContent = 'Entrar na sala de preparação';
      if (ctaMainIcon) ctaMainIcon.className = 'fas fa-door-open';
      if (btnCtaMain) { btnCtaMain.className = 'btn btn-primary btn-lg'; btnCtaMain.style.width = '100%'; btnCtaMain.style.marginBottom = '12px'; }
      enable(btnCtaMain);
      disable(btnEntrarAgora);
      return;
    }

    if (diff <= 0) {
      if (ctaMainText) ctaMainText.textContent = 'Entrar na assembleia';
      if (ctaMainIcon) ctaMainIcon.className = 'fas fa-video';
      if (btnCtaMain) { btnCtaMain.className = 'btn btn-primary btn-lg'; btnCtaMain.style.width = '100%'; btnCtaMain.style.marginBottom = '12px'; }
      enable(btnCtaMain);
      if (btnEntrarAgora) {
        btnEntrarAgora.style.display = '';
      }
      enable(btnEntrarAgora);
      return;
    }

    if (ctaMainText) ctaMainText.textContent = 'Aguardando início';
    if (ctaMainIcon) ctaMainIcon.className = 'fas fa-clock';
    if (btnCtaMain) { btnCtaMain.className = 'btn btn-outline btn-lg'; btnCtaMain.style.width = '100%'; btnCtaMain.style.marginBottom = '12px'; }
    disable(btnCtaMain);
    disable(btnEntrarAgora);
  }

  function renderAll() {
    renderHero();
    renderCountdown();
    renderGeneralInfo();
    renderAgenda();
    renderPolls();
    renderDocuments();
    renderParticipants();
    renderLinks();
    updateCtaButtons();
    startCountdown();
    updateUserHeader();
  }

  function updateUserHeader() {
    var user = state.currentUser;
    if (!user) return;
    var nameEl = el('user-name');
    var typeEl = el('user-type');
    var avatarEl = el('user-avatar');
    var name = user.name || user.full_name || user.user_name || 'Usuário';
    if (nameEl) nameEl.textContent = name;
    var ut = getRoleLabel(user.user_type || user.role || user.type);
    if (typeEl) typeEl.textContent = ut;
    if (avatarEl) {
      if (user.profilePhoto || user.profile_photo || user.photo_url) {
        var photo = user.profilePhoto || user.profile_photo || user.photo_url;
        avatarEl.innerHTML = '<img src="' + photo + '" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
        avatarEl.style.background = 'none';
        avatarEl.style.overflow = 'hidden';
      } else if (window.AssemblyUtils && typeof window.AssemblyUtils.getInitials === 'function') {
        avatarEl.textContent = AssemblyUtils.getInitials(name);
        avatarEl.style.background = '';
      }
    }
    var condoName = document.querySelector('.condo-name');
    var cName = null;
    try {
      var condo = user.condominium;
      if (condo && typeof condo === 'string') condo = JSON.parse(condo);
      if (condo) cName = condo.name || condo.condominium_name || ('CEP ' + (condo.cep || state.assembly.cep || ''));
    } catch (_) {
      try {
        var meta = user.app_metadata || user.user_metadata;
        if (meta && meta.condominium) cName = meta.condominium.name || ('CEP ' + (meta.condominium.cep || ''));
      } catch (__) {}
    }
    if (!cName && state.assembly && state.assembly.cep) cName = 'CEP ' + state.assembly.cep;
    if (condoName && cName) condoName.textContent = cName;
  }

  function showError(title, message) {
    hide('loading-state');
    hide('detail-content');
    show('error-state');
    text('error-title', title || 'Ops!');
    text('error-message', message || 'Não foi possível carregar os detalhes.');
  }

  async function loadAll() {
    hide('error-state');
    hide('detail-content');
    show('loading-state');

    var id = null;
    if (window.AssemblyUtils && typeof window.AssemblyUtils.getQueryParam === 'function') {
      id = AssemblyUtils.getQueryParam('id');
    } else {
      var params = new URLSearchParams(window.location.search);
      id = params.get('id');
    }
    state.assemblyId = id;

    if (!id) {
      showError('ID da assembleia não informado', 'O identificador da assembleia não foi fornecido na URL.');
      return;
    }

    var user = null;
    try {
      if (window.AssemblyAuth && typeof window.AssemblyAuth.getCurrentUser === 'function') {
        user = AssemblyAuth.getCurrentUser();
      }
    } catch (_) { user = null; }
    state.currentUser = user;

    var userCep = null;
    try {
      if (window.AssemblyAuth && typeof window.AssemblyAuth.getUserCep === 'function') {
        userCep = await AssemblyAuth.getUserCep(user);
      }
    } catch (_) { userCep = null; }
    state.userCep = userCep;

    try {
      var assemblyData = await supabaseGet('/scheduled_assemblies?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1');
      var assembly = Array.isArray(assemblyData) ? (assemblyData[0] || null) : assemblyData;
      if (!assembly) {
        showError('Assembleia não encontrada (404)', 'Esta assembleia não existe ou foi removida.');
        return;
      }
      state.assembly = assembly;

      var accessAllowed = false;
      if (window.AssemblyAuth && typeof window.AssemblyAuth.checkAssemblyAccess === 'function') {
        try {
          var res = await AssemblyAuth.checkAssemblyAccess(user, assembly.cep);
          accessAllowed = !!res.allowed;
          state.accessReason = res.reason;
        } catch (_) { accessAllowed = false; }
      } else {
        var normUserCep = normalizeCep(userCep);
        var normAssemblyCep = normalizeCep(assembly.cep);
        accessAllowed = !!(normUserCep && normAssemblyCep && normUserCep === normAssemblyCep);
        if (window.AssemblyAuth && typeof window.AssemblyAuth.isSindico === 'function' && AssemblyAuth.isSindico(user)) {
          accessAllowed = true;
        }
      }
      state.accessAllowed = !!accessAllowed;

      var agendaPromise;
      try {
        agendaPromise = supabaseGet('/assembly_agenda_items?assembly_id=eq.' + encodeURIComponent(id) + '&order=display_order.asc,id.asc');
      } catch (_) { agendaPromise = Promise.resolve([]); }

      var docsPromise;
      try {
        docsPromise = supabaseGet('/assembly_documents?assembly_id=eq.' + encodeURIComponent(id) + '&order=created_at.asc');
      } catch (_) { docsPromise = Promise.resolve([]); }

      var confsPromise;
      try {
        confsPromise = supabaseGet('/assembly_participant_confirmations?assembly_id=eq.' + encodeURIComponent(id) + '&order=confirmed_at.desc');
      } catch (_) { confsPromise = Promise.resolve([]); }

      var attendancePromise;
      try {
        attendancePromise = supabaseGet('/assembly_attendance?assembly_id=eq.' + encodeURIComponent(id) + '&select=count');
      } catch (_) { attendancePromise = Promise.resolve([]); }

      var pollsPromise;
      try {
        pollsPromise = supabaseGet('/assembly_polls?assembly_id=eq.' + encodeURIComponent(id) + '&order=created_at.asc');
      } catch (_) { pollsPromise = Promise.resolve([]); }

      var results = await Promise.all([agendaPromise, docsPromise, confsPromise, attendancePromise, pollsPromise]);
      state.agendaItems = Array.isArray(results[0]) ? results[0] : [];
      state.documents = Array.isArray(results[1]) ? results[1] : [];
      state.confirmations = Array.isArray(results[2]) ? results[2] : [];
      var attendanceRes = results[3];
      if (Array.isArray(attendanceRes)) state.attendanceCount = attendanceRes.length;
      else if (attendanceRes && typeof attendanceRes === 'object' && attendanceRes.count != null) state.attendanceCount = attendanceRes.count;
      else state.attendanceCount = 0;
      state.polls = Array.isArray(results[4]) ? results[4] : [];

      hide('loading-state');
      show('detail-content');
      renderAll();

    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
      if (err && err.status === 404) {
        showError('Assembleia não encontrada (404)', 'Esta assembleia não existe ou foi removida.');
      } else if (err && (err.message || '').toLowerCase().indexOf('network') >= 0) {
        showError('Erro de conexão', 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
      } else {
        showError('Erro ao carregar', (err && err.message) || 'Não foi possível carregar os detalhes da assembleia.');
      }
    }
  }

  async function togglePresence() {
    if (!state.accessAllowed) {
      showToast('Você não tem permissão para participar desta assembleia', 'warning');
      return;
    }
    var user = state.currentUser;
    if (!user) {
      showToast('Você precisa estar logado para confirmar presença', 'error');
      return;
    }
    var userEmail = user.email || user.user_email;
    if (!userEmail) {
      showToast('Dados do usuário incompletos', 'error');
      return;
    }
    var assembly = state.assembly;
    if (!assembly) return;
    if (isEndedStatus(assembly.status)) {
      showToast('Esta assembleia já foi encerrada', 'warning');
      return;
    }
    if (assembly.status === 'cancelada' || assembly.status === 'cancelled') {
      showToast('Esta assembleia foi cancelada', 'warning');
      return;
    }
    var current = state.currentConfirmation;
    var newWillAttend = current && current.will_attend ? false : true;

    var payload = {
      assembly_id: state.assemblyId,
      cep: assembly.cep,
      user_email: userEmail,
      participant_name: user.name || user.full_name || user.user_name || userEmail,
      participant_role: user.role || user.user_type || 'morador',
      will_attend: newWillAttend,
      confirmed_at: new Date().toISOString()
    };

    try {
      var btn = el('btn-confirm-presence');
      if (btn) {
        btn.disabled = true;
        var originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
      }
      var result;
      try {
        result = await supabaseUpsert('/assembly_participant_confirmations', payload, 'assembly_id,user_email');
      } catch (upsertErr) {
        if (window.AssemblyAPI && typeof window.AssemblyAPI.confirmPresence === 'function') {
          result = await AssemblyAPI.confirmPresence(state.assemblyId, assembly.cep, newWillAttend);
        } else {
          throw upsertErr;
        }
      }
      var refreshed;
      try {
        refreshed = await supabaseGet('/assembly_participant_confirmations?assembly_id=eq.' + encodeURIComponent(state.assemblyId) + '&order=confirmed_at.desc');
      } catch (_) { refreshed = []; }
      state.confirmations = Array.isArray(refreshed) ? refreshed : state.confirmations;
      renderParticipants();
      updateCtaButtons();
      showToast(newWillAttend ? 'Presença confirmada com sucesso!' : 'Confirmação de presença cancelada.', 'success');
    } catch (err) {
      console.error('Erro ao confirmar presença:', err);
      showToast((err && err.message) || 'Não foi possível confirmar presença. Tente novamente.', 'error');
      renderParticipants();
    }
  }

  function enterAssembly() {
    if (!state.accessAllowed) {
      showToast('Esta assembleia pertence a outro condomínio', 'warning');
      return;
    }
    var a = state.assembly;
    if (!a) return;
    var status = a.status;
    var cancelled = status === 'cancelada' || status === 'cancelled';
    var ended = isEndedStatus(status);
    if (cancelled) {
      showToast('Esta assembleia foi cancelada', 'warning');
      return;
    }
    if (ended) {
      showToast('Esta assembleia já foi encerrada', 'warning');
      if (state.assemblyId) {
        window.location.href = 'assembleia-resumo.html?id=' + encodeURIComponent(state.assemblyId);
      }
      return;
    }
    var live = isLiveStatus(status);
    var startDate = getAssemblyStartDate(a);
    var now = new Date().getTime();
    var diff = startDate ? (startDate.getTime() - now) : Infinity;

    if (live || diff <= 0) {
      window.location.href = 'assembleia-preparacao.html?id=' + encodeURIComponent(state.assemblyId);
      return;
    }
    if (diff <= THIRTY_MINUTES_MS) {
      window.location.href = 'assembleia-preparacao.html?id=' + encodeURIComponent(state.assemblyId);
      return;
    }
    var totalMin = Math.ceil(diff / 60000);
    var hours = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    var timeStr = hours > 0 ? hours + 'h ' + mins + 'min' : mins + ' min';
    showToast('Aguardando início da assembleia. Faltam ' + timeStr + ' para o início.', 'info');
  }

  function cleanup() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function render() {
    renderAll();
  }

  async function init() {
    try {
      await loadAll();
    } catch (e) {
      console.error('Falha na inicialização:', e);
      showError('Erro inesperado', (e && e.message) || 'Ocorreu um erro ao carregar a página.');
    }
  }

  window.AssemblyDetail = {
    init: init,
    render: render,
    enterAssembly: enterAssembly,
    togglePresence: togglePresence,
    state: state
  };

  if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('beforeunload', cleanup);
  }
})();
