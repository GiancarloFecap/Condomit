document.addEventListener('DOMContentLoaded', async function () {
    let visitorList = [];
    let currentUser = null;

    const state = {
        page: 1,
        pageSize: 7,
        search: '',
        filterBlock: '',
        filterDate: '7'
    };

    const tableBody = document.getElementById('visitantesTableBody');
    const searchInput = document.getElementById('searchInput');
    const blockSelect = document.getElementById('blockSelect');
    const dateSelect = document.getElementById('dateSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const tableInfo = document.getElementById('tableInfo');
    const btnLiberar = document.getElementById('btnLiberarVisitante');
    const btnFiltros = document.getElementById('btnFiltros');
    const todayCountEl = document.getElementById('todayCount');
    const upcomingCountEl = document.getElementById('upcomingCount');
    const monthCountEl = document.getElementById('monthCount');

    function normalizeString(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function formatCpf(value) {
        const digits = String(value || '').replace(/\D/g, '');
        if (digits.length !== 11) return value || '';
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }

    function formatPhone(value) {
        const d = String(value || '').replace(/\D/g, '');
        if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
        if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return value || '';
    }

    function formatDatePt(value) {
        if (!value) return '--';
        const d = new Date(value);
        if (isNaN(d.getTime())) {
            const parts = String(value).split(/[-/ T]/).filter(Boolean);
            if (parts.length >= 3 && parts[0].length === 4) {
                return `${parts[2].slice(0, 2)}/${parts[1]}/${parts[0]}`;
            }
            return String(value).slice(0, 10);
        }
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${d.getFullYear()}`;
    }

    function formatDateTimeRange(visitor) {
        const dateValue = visitor?.visit_date || visitor?.date || visitor?.created_at || visitor?.scheduled_at || '';
        const startTime = visitor?.start_time || visitor?.visit_time || visitor?.time_from || '';
        const endTime = visitor?.end_time || visitor?.time_until || '';
        const dateLabel = formatDatePt(dateValue);
        let timeLabel = '--:--';
        if (startTime && endTime) timeLabel = `${String(startTime).slice(0, 5)} - ${String(endTime).slice(0, 5)}`;
        else if (startTime) timeLabel = `${String(startTime).slice(0, 5)}`;
        else {
            const d = dateValue ? new Date(dateValue) : null;
            if (d && !isNaN(d.getTime())) {
                timeLabel = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            }
        }
        return { dateLabel, timeLabel };
    }

    function statusLabel(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'liberado' || s === 'approved' || s === 'released' || s === 'confirmed') return 'Liberado';
        if (s === 'pendente' || s === 'pending' || s === 'awaiting') return 'Pendente';
        if (s === 'negado' || s === 'rejected' || s === 'denied') return 'Negado';
        return 'Pendente';
    }

    function statusKey(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'liberado' || s === 'approved' || s === 'released' || s === 'confirmed') return 'liberado';
        if (s === 'negado' || s === 'rejected' || s === 'denied') return 'negado';
        return 'pendente';
    }

    function avatarInitials(fullName) {
        const name = normalizeString(fullName || '');
        if (!name) return '??';
        const parts = name.split(/\s+/).filter(Boolean);
        if (!parts.length) return '??';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    const avatarColors = [
        '#1e40af', '#86198f', '#0f766e', '#9d174d', '#92400e',
        '#155e75', '#4c1d95', '#831843', '#065f46', '#b45309',
        '#1d4ed8', '#9f1239', '#166534', '#4338ca', '#b91c1c',
        '#115e59', '#7c3aed', '#c2410c', '#be185d', '#0369a1'
    ];

    function avatarColorFor(seed) {
        const s = normalizeString(seed || '');
        let sum = 0;
        for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
        return avatarColors[sum % avatarColors.length];
    }

    function getCurrentUser() {
        try {
            const raw = sessionStorage.getItem('condominiumUser') ||
                (typeof refreshCurrentUserFromDb === 'function' ? null : null);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return null;
    }

    function getStoredReleaseStatuses() {
        try {
            const key = `release_statuses:${normalizeString(currentUser?.email || 'all')}`;
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    function setReleaseVisitorStatus(visitorCpf, status, payload = {}) {
        try {
            const key = `release_statuses:${normalizeString(currentUser?.email || 'all')}`;
            const all = getStoredReleaseStatuses();
            all[String(visitorCpf || '').replace(/\D/g, '')] = {
                status,
                updatedAt: new Date().toISOString(),
                ...payload
            };
            localStorage.setItem(key, JSON.stringify(all));
        } catch (_) {}
    }

    function transformVisitorRow(raw) {
        const responsible = raw?.responsible || null;
        const respCondo = responsible?.condominium || {};
        const visitorCondo = typeof raw?.condominium === 'string'
            ? (() => { try { return JSON.parse(raw.condominium); } catch (_) { return {}; } })()
            : (raw?.condominium || {});

        const schedule = raw?.schedule || {};
        const visitDate = raw?.visit_date || schedule?.date || visitorCondo?.visit_date || raw?.created_at;
        const startTime = raw?.start_time || schedule?.start_time || raw?.time_from || '';
        const endTime = raw?.end_time || schedule?.end_time || raw?.time_until || '';
        const reason = raw?.reason || raw?.purpose || raw?.visit_reason || raw?.motivo || 'Visita';
        const stored = getStoredReleaseStatuses();
        const storedStatus = stored[String(raw?.cpf || '').replace(/\D/g, '')]?.status || null;
        const statusRaw = storedStatus || raw?.status || raw?.liberacao_status || raw?.access_status || 'pendente';

        const unidade = raw?.apartment || raw?.unit || visitorCondo?.unit || visitorCondo?.apartamento || respCondo?.apartment || respCondo?.unit || '--';
        const bloco = raw?.block || visitorCondo?.block || visitorCondo?.bloco || respCondo?.block || respCondo?.bloco || '--';
        const unidadeLabel = unidade ? `Apto ${String(unidade).replace(/^Apto\s*/i, '')}` : '';
        const blocoLabel = bloco ? (String(bloco).startsWith('Bloco') ? bloco : `Bloco ${bloco}`) : '';
        const respUnidade = [blocoLabel, unidadeLabel].filter(Boolean).join(' / ') || 'Unidade --';

        return {
            id: raw?.id || raw?.cpf || `v-${Math.random().toString(36).slice(2)}`,
            raw,
            nome: raw?.full_name || raw?.nome || raw?.name || 'Visitante sem nome',
            documento: formatCpf(raw?.cpf || raw?.documento || raw?.rg || '') || (raw?.rg ? `RG ${raw.rg}` : '--'),
            documentoTipo: raw?.cpf ? 'CPF' : (raw?.rg ? 'RG' : 'Doc'),
            rg: raw?.rg || '',
            cpf: raw?.cpf || '',
            phone: raw?.phone || raw?.telefone || '',
            email: raw?.email || '',
            reason,
            visitDate,
            startTime,
            endTime,
            responsavelNome: responsible?.name || responsible?.full_name || responsible?.nome || raw?.responsible_name || 'Responsável não informado',
            responsavelCpf: responsible?.cpf || raw?.responsible_cpf || '',
            responsavelPhone: responsible?.phone || '',
            responsavelEmail: responsible?.email || '',
            responsavelUnidade: respUnidade,
            responsavelCondo: respCondo,
            condominiumId: respCondo?.cep || respCondo?.condominium_id || respCondo?.condominiumId || visitorCondo?.cep || visitorCondo?.condominium_id || '',
            condominiumName: respCondo?.name || respCondo?.condominium_name || visitorCondo?.name || '',
            unidadeBloco: blocoLabel || '--',
            unidadeApto: unidadeLabel || '--',
            avatarIniciais: avatarInitials(raw?.full_name || raw?.nome || raw?.name || ''),
            avatarColor: avatarColorFor(raw?.cpf || raw?.full_name || raw?.nome || ''),
            status: statusKey(statusRaw),
            created_at: raw?.created_at
        };
    }

    async function loadCurrentUser() {
        try {
            if (typeof refreshCurrentUserFromDb === 'function') {
                currentUser = await refreshCurrentUserFromDb();
            }
            if (!currentUser) {
                currentUser = getCurrentUser();
            }
        } catch (_) {
            currentUser = getCurrentUser();
        }
        if (!currentUser) {
            window.location.href = 'entrar.html';
        }
    }

    async function loadVisitorListFromDb() {
        try {
            if (typeof window.getVisitorsForCondominium !== 'function') return [];
            const rows = await window.getVisitorsForCondominium(currentUser || {});
            return (Array.isArray(rows) ? rows : []).map(transformVisitorRow);
        } catch (err) {
            console.error('Erro ao carregar visitantes:', err);
            return [];
        }
    }

    function getFilteredVisitors() {
        const searchNorm = normalizeString(state.search);
        const today = new Date();
        const dateWindow = parseInt(state.filterDate, 10);

        return visitorList.filter(v => {
            if (state.filterBlock && v.unidadeBloco !== state.filterBlock) return false;

            if (searchNorm) {
                const haystack = normalizeString(
                    (v.nome || '') + ' ' +
                    (v.documento || '') + ' ' +
                    (v.responsavelNome || '') + ' ' +
                    (v.responsavelUnidade || '') + ' ' +
                    (v.rg || '') + ' ' +
                    (v.phone || '')
                );
                if (!haystack.includes(searchNorm)) return false;
            }

            if (state.filterDate !== 'all' && !isNaN(dateWindow) && v.visitDate) {
                try {
                    const vDateOnly = new Date(v.visitDate);
                    if (isNaN(vDateOnly.getTime())) {
                        const s = String(v.visitDate);
                        const parts = s.split(/[-/]/).filter(Boolean).map(n => parseInt(n, 10));
                        if (parts.length >= 3 && parts[0] < 32) {
                            const day = parts[0], month = parts[1] - 1, year = parts[2];
                            const normalized = new Date(year, month, day);
                            if (!isNaN(normalized.getTime())) {
                                normalized.setHours(0, 0, 0, 0);
                                const limit = new Date(today);
                                limit.setHours(0, 0, 0, 0);
                                limit.setDate(limit.getDate() + dateWindow);
                                if (normalized > limit) return false;
                            }
                        }
                    } else {
                        vDateOnly.setHours(0, 0, 0, 0);
                        const limit = new Date(today);
                        limit.setHours(0, 0, 0, 0);
                        limit.setDate(limit.getDate() + dateWindow);
                        if (vDateOnly > limit) return false;
                    }
                } catch (_) {}
            }
            return true;
        });
    }

    function updateMetrics() {
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 8);

        let todayCount = 0;
        let upcomingCount = 0;
        let monthCount = 0;

        visitorList.forEach(v => {
            const d = new Date(v.visitDate || v.created_at);
            if (isNaN(d.getTime())) return;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (key === todayKey) todayCount++;
            if (d >= today && d <= weekEnd) upcomingCount++;
            if (key.startsWith(monthKey)) monthCount++;
        });

        if (todayCountEl) todayCountEl.textContent = String(todayCount);
        if (upcomingCountEl) upcomingCountEl.textContent = String(upcomingCount);
        if (monthCountEl) monthCountEl.textContent = String(monthCount);
    }

    function renderTable() {
        const filtered = getFilteredVisitors();
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;

        const start = (state.page - 1) * state.pageSize;
        const pageItems = filtered.slice(start, start + state.pageSize);

        tableBody.innerHTML = pageItems.length
            ? pageItems.map(v => {
                const { dateLabel, timeLabel } = formatDateTimeRange(v);
                const dataCpf = String(v.cpf || v.id || '').replace(/"/g, '&quot;');
                return `
            <tr data-id="${String(v.id).replace(/"/g, '&quot;')}">
                <td>
                    <div class="visitante-cell">
                        <div class="visitante-avatar" style="background: ${v.avatarColor}22; color: ${v.avatarColor}; cursor: pointer;" data-action="profile" data-cpf="${dataCpf}">
                            ${v.avatarIniciais}
                        </div>
                        <span class="visitante-nome" data-action="profile" data-cpf="${dataCpf}" style="cursor: pointer;">${v.nome}</span>
                    </div>
                </td>
                <td>
                    <div class="documento-cell">
                        <div class="doc-numero">${v.documento}</div>
                        <div class="doc-label">${v.documentoTipo}</div>
                    </div>
                </td>
                <td>
                    <div class="responsavel-cell">
                        <div class="resp-nome">${v.responsavelNome}</div>
                        <div class="resp-unidade">${v.responsavelUnidade}</div>
                    </div>
                </td>
                <td>
                    <div class="unidade-cell">
                        <div class="uni-bloco">${v.unidadeBloco}</div>
                        <div class="uni-apto">${v.unidadeApto}</div>
                    </div>
                </td>
                <td>
                    <div class="data-horario-cell">
                        <i class="fas fa-calendar-alt"></i>
                        <div>
                            <span class="data-label">${dateLabel}</span>
                            <div class="horario-label">${timeLabel}</div>
                        </div>
                    </div>
                </td>
                <td>${v.reason}</td>
                <td>
                    <span class="status-badge status-${v.status}">${statusLabel(v.status)}</span>
                </td>
                <td>
                    <button class="btn-acoes" type="button" aria-label="Mais ações" data-action-id="${String(v.id).replace(/"/g, '&quot;')}" data-cpf="${dataCpf}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </td>
            </tr>
        `;
            }).join('')
            : `
            <tr>
                <td colspan="8" style="text-align:center; padding:48px 16px; color:#64748B;">
                    <i class="fas fa-users" style="font-size: 36px; opacity: .3; margin-bottom: 12px; display:block;"></i>
                    Nenhum visitante encontrado para este condomínio.
                </td>
            </tr>
        `;

        tableBody.querySelectorAll('[data-action="profile"]').forEach(el => {
            el.addEventListener('click', function () {
                const cpf = String(this.getAttribute('data-cpf') || '').replace(/\D/g, '');
                const v = visitorList.find(x => String(x.cpf || '').replace(/\D/g, '') === cpf) ||
                    visitorList[0];
                if (v) openVisitorProfileModal(v);
            });
        });

        tableBody.querySelectorAll('.btn-acoes').forEach(btn => {
            btn.addEventListener('click', function () {
                const cpf = String(this.getAttribute('data-cpf') || '').replace(/\D/g, '');
                const v = visitorList.find(x => String(x.cpf || '').replace(/\D/g, '') === cpf);
                if (v) openVisitorProfileModal(v);
            });
        });

        const startCount = totalItems > 0 ? start + 1 : 0;
        const endCount = Math.min(start + state.pageSize, totalItems);
        tableInfo.textContent = `Mostrando ${startCount} a ${endCount} de ${totalItems} visitantes`;

        renderPagination(totalPages);
        populateBlocks(filtered);
    }

    function renderPagination(totalPages) {
        const pagination = document.querySelector('.table-pagination');
        if (!pagination) return;
        const buttons = pagination.querySelectorAll('.page-btn[data-page]');
        buttons.forEach(btn => {
            const p = Number(btn.getAttribute('data-page'));
            btn.classList.toggle('page-btn-active', p === state.page);
            btn.onclick = function () {
                state.page = p;
                renderTable();
            };
        });
        const prev = document.getElementById('prevPageBtn');
        const next = document.getElementById('nextPageBtn');
        if (prev) {
            prev.disabled = state.page <= 1;
            prev.style.opacity = state.page <= 1 ? 0.45 : 1;
            prev.onclick = function () {
                if (state.page > 1) {
                    state.page--;
                    renderTable();
                }
            };
        }
        if (next) {
            next.disabled = state.page >= totalPages;
            next.style.opacity = state.page >= totalPages ? 0.45 : 1;
            next.onclick = function () {
                if (state.page < totalPages) {
                    state.page++;
                    renderTable();
                }
            };
        }
    }

    function populateBlocks(list) {
        if (blockSelect.getAttribute('data-populated') === '1') return;
        const current = blockSelect.value;
        const blocks = Array.from(
            new Set(
                (list || visitorList)
                    .map(v => String(v.unidadeBloco || '').trim())
                    .filter(v => v && v !== '--')
            )
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        blockSelect.innerHTML = '<option value="">Todos os blocos</option>' +
            blocks.map(b => `<option value="${b.replace(/"/g, '&quot;')}">${b}</option>`).join('');
        blockSelect.value = current;
        blockSelect.setAttribute('data-populated', '1');
    }

    function updateMesReferencia() {
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const now = new Date();
        const label = document.getElementById('mesReferencia');
        if (label) label.textContent = `${meses[now.getMonth()]}/${now.getFullYear()}`;
    }

    function ensureModalStructure() {
        if (document.getElementById('visitorProfileModalBackdrop')) return;
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = 'visitorProfileModalBackdrop';
        backdrop.innerHTML = `
            <div class="modal-box visitor-modal" role="dialog" aria-modal="true" aria-labelledby="visitorProfileTitle">
                <div class="modal-header">
                    <div class="modal-icon modal-icon-info" id="visitorProfileIcon"><i class="fas fa-user"></i></div>
                    <div class="modal-title-wrap">
                        <h3 class="modal-title" id="visitorProfileTitle">Perfil do visitante</h3>
                        <p class="modal-sub" id="visitorProfileSub" style="color:#64748B; margin:4px 0 0; font-size:13px;">Detalhes completos do acesso</p>
                    </div>
                    <button class="modal-close" type="button" id="visitorProfileClose" aria-label="Fechar" style="background:none; border:none; cursor:pointer; font-size:18px; color:#64748B;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="visitorProfileBody">
                </div>
                <div class="modal-footer">
                    <button type="button" class="modal-btn modal-btn-secondary" id="visitorProfileCancel">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                    <button type="button" class="modal-btn modal-btn-primary" id="visitorProfileLiberar" style="background: linear-gradient(135deg, #10b981 0%, #0f766e 100%);">
                        <i class="fas fa-check-circle"></i> Liberar visitante
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeVisitorProfileModal();
        });
        document.getElementById('visitorProfileClose').addEventListener('click', closeVisitorProfileModal);
        document.getElementById('visitorProfileCancel').addEventListener('click', closeVisitorProfileModal);
        document.getElementById('visitorProfileLiberar').addEventListener('click', function () {
            liberarVisitanteFromModal();
        });
    }

    let currentModalVisitor = null;

    function openVisitorProfileModal(visitor) {
        ensureModalStructure();
        currentModalVisitor = visitor;
        const { dateLabel, timeLabel } = formatDateTimeRange(visitor);
        const body = document.getElementById('visitorProfileBody');
        const iconDiv = document.getElementById('visitorProfileIcon');
        iconDiv.style.background = `${visitor.avatarColor}`;
        iconDiv.innerHTML = `<span style="font-size:18px; font-weight:700;">${visitor.avatarIniciais}</span>`;

        body.innerHTML = `
            <div class="visitor-modal-grid">
                <div class="info-col">
                    <h4 class="info-title"><i class="fas fa-user-circle"></i> Visitante</h4>
                    <div class="info-row"><span>Nome completo</span><strong>${visitor.nome}</strong></div>
                    <div class="info-row"><span>CPF</span><strong>${formatCpf(visitor.cpf) || '--'}</strong></div>
                    <div class="info-row"><span>RG</span><strong>${visitor.rg || '--'}</strong></div>
                    <div class="info-row"><span>Telefone</span><strong>${formatPhone(visitor.phone) || '--'}</strong></div>
                    <div class="info-row"><span>E-mail</span><strong>${visitor.email || '--'}</strong></div>
                </div>
                <div class="info-col">
                    <h4 class="info-title"><i class="fas fa-home"></i> Responsável</h4>
                    <div class="info-row"><span>Nome</span><strong>${visitor.responsavelNome}</strong></div>
                    <div class="info-row"><span>CPF</span><strong>${formatCpf(visitor.responsavelCpf) || '--'}</strong></div>
                    <div class="info-row"><span>Telefone</span><strong>${formatPhone(visitor.responsavelPhone) || '--'}</strong></div>
                    <div class="info-row"><span>E-mail</span><strong>${visitor.responsavelEmail || '--'}</strong></div>
                    <div class="info-row"><span>Unidade</span><strong>${visitor.responsavelUnidade}</strong></div>
                </div>
                <div class="info-col full">
                    <h4 class="info-title"><i class="fas fa-calendar-check"></i> Visita</h4>
                    <div class="info-row"><span>Data</span><strong>${dateLabel}</strong></div>
                    <div class="info-row"><span>Horário</span><strong>${timeLabel}</strong></div>
                    <div class="info-row"><span>Motivo</span><strong>${visitor.reason}</strong></div>
                    <div class="info-row"><span>Condomínio</span><strong>${visitor.condominiumName || visitor.condominiumId || '--'}</strong></div>
                    <div class="info-row"><span>Status</span><strong><span class="status-badge status-${visitor.status}">${statusLabel(visitor.status)}</span></strong></div>
                </div>
            </div>
        `;
        document.getElementById('visitorProfileModalBackdrop').classList.add('open');
    }

    function closeVisitorProfileModal() {
        const backdrop = document.getElementById('visitorProfileModalBackdrop');
        if (backdrop) backdrop.classList.remove('open');
        currentModalVisitor = null;
    }

    async function liberarVisitanteFromModal() {
        if (!currentModalVisitor) return;
        const v = currentModalVisitor;
        const btn = document.getElementById('visitorProfileLiberar');
        btn.disabled = true;
        try {
            setReleaseVisitorStatus(v.cpf, 'liberado', {
                by: currentUser?.email || null,
                visitor_cpf: v.cpf,
                responsible_cpf: v.responsavelCpf
            });
            const updated = visitorList.map(item =>
                (String(item.cpf || '').replace(/\D/g, '') === String(v.cpf || '').replace(/\D/g, ''))
                    ? { ...item, status: 'liberado' }
                    : item
            );
            visitorList = updated;
            updateMetrics();
            renderTable();
            if (typeof window.showToast === 'function') {
                window.showToast('Visitante liberado com sucesso!', 'success');
            } else {
                showToast('Visitante liberado com sucesso!', 'success');
            }
            closeVisitorProfileModal();
        } finally {
            btn.disabled = false;
        }
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container') || (() => {
            const d = document.createElement('div');
            d.id = 'toast-container';
            d.className = 'toast-container';
            document.body.appendChild(d);
            return d;
        })();
        const toast = document.createElement('div');
        const bgMap = {
            success: '#10b981', error: '#dc2626', warning: '#d97706', info: '#2563eb'
        };
        toast.className = `toast`;
        toast.style.cssText = `
            pointer-events:auto; background:white; border-radius:12px; padding:14px 16px; display:flex;
            align-items:center; gap:12px; box-shadow:0 10px 24px rgba(0,0,0,.18); border-left:4px solid ${bgMap[type] || '#2563eb'};
            margin-bottom: 10px; animation: toastIn 200ms ease;
        `;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}" style="color:${bgMap[type] || '#2563eb'}; font-size: 18px;"></i>
            <span style="flex:1; font-size:14px; color:#111827;">${message}</span>
            <button type="button" style="background:none; border:none; color:#94a3b8; cursor:pointer;"><i class="fas fa-times"></i></button>
        `;
        toast.querySelector('button').addEventListener('click', () => toast.remove());
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4500);
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            state.search = this.value || '';
            state.page = 1;
            renderTable();
        });
    }

    if (blockSelect) {
        blockSelect.addEventListener('change', function () {
            state.filterBlock = this.value || '';
            state.page = 1;
            renderTable();
        });
    }

    if (dateSelect) {
        dateSelect.addEventListener('change', function () {
            state.filterDate = this.value || 'all';
            state.page = 1;
            renderTable();
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener('change', function () {
            state.pageSize = parseInt(this.value, 10) || 7;
            state.page = 1;
            renderTable();
        });
    }

    if (btnLiberar) {
        btnLiberar.addEventListener('click', function () {
            if (window.navigateTo) {
                window.navigateTo('porteiro-registrar');
            } else {
                window.location.href = 'registrar-visitantes.html';
            }
        });
    }

    if (btnFiltros) {
        btnFiltros.addEventListener('click', function () {
            showToast('Painel de filtros avançados em desenvolvimento.', 'info');
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeVisitorProfileModal();
    });

    updateMesReferencia();
    await loadCurrentUser();
    visitorList = await loadVisitorListFromDb();
    updateMetrics();
    renderTable();
});
