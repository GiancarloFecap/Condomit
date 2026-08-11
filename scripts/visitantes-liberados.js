document.addEventListener('DOMContentLoaded', async () => {
    const pageState = {
        currentUser: null,
        visitors: [],
        currentModalVisitor: null,
        busy: false,
        page: 1,
        pageSize: 7,
        search: '',
        filterBlock: '',
        filterDate: 'all'
    };

    const tableBody = document.getElementById('visitantesTableBody');
    const searchInput = document.getElementById('searchInput');
    const blockSelect = document.getElementById('blockSelect');
    const dateSelect = document.getElementById('dateSelect');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const tableInfo = document.getElementById('tableInfo');
    const btnLiberar = document.getElementById('btnLiberarVisitante');
    const btnFiltros = document.getElementById('btnFiltros');

    function normalizeString(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function normalizeCpf(value) {
        return String(value || '').replace(/\D/g, '').slice(0, 11);
    }

    function formatCpf(value) {
        const digits = normalizeCpf(value);
        if (digits.length !== 11) return value || '';
        return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    }

    function formatPhone(value) {
        const digits = String(value || '').replace(/\D/g, '');
        if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        return value || '--';
    }

    function safeDate(value) {
        const date = new Date(value || Date.now());
        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    function formatDatePt(value) {
        if (!value) return '--';
        return safeDate(value).toLocaleDateString('pt-BR');
    }

    function formatDateTimeRange(visitor) {
        const dateValue = visitor?.visitDate || visitor?.raw?.visit_date || visitor?.raw?.date || visitor?.created_at || '';
        const startTime = visitor?.startTime || visitor?.raw?.start_time || visitor?.raw?.visit_time || '';
        const endTime = visitor?.endTime || visitor?.raw?.end_time || '';
        const date = safeDate(dateValue);
        const dateLabel = dateValue ? date.toLocaleDateString('pt-BR') : '--';
        let timeLabel = '--:--';
        if (startTime && endTime) timeLabel = `${String(startTime).slice(0, 5)} - ${String(endTime).slice(0, 5)}`;
        else if (startTime) timeLabel = String(startTime).slice(0, 5);
        else if (dateValue) timeLabel = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return { dateLabel, timeLabel };
    }

    function normalizeReleaseStatus(raw) {
        const value = String(raw || 'aguardando').trim().toLowerCase();
        if (['liberado', 'approved', 'released', 'confirmed'].includes(value)) return 'liberado';
        if (['recusado', 'rejected', 'denied', 'negado'].includes(value)) return 'negado';
        return 'pendente';
    }

    function statusLabel(visitor) {
        if (String(visitor?.raw?.release_status || '').toLowerCase() === 'revogado') return 'Revogado';
        if (visitor.status === 'liberado') return 'Liberado';
        if (visitor.status === 'negado') return 'Negado';
        return 'Pendente';
    }

    function avatarInitials(fullName) {
        const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'VT';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }

    const avatarColors = ['#1e40af', '#86198f', '#0f766e', '#9d174d', '#92400e', '#155e75', '#4c1d95', '#065f46', '#b45309', '#0369a1'];

    function avatarColorFor(seed) {
        const text = normalizeString(seed);
        let sum = 0;
        for (let i = 0; i < text.length; i += 1) sum += text.charCodeAt(i);
        return avatarColors[sum % avatarColors.length];
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function getResponsibleCondo(raw) {
        const condo = raw?.responsible?.condominium;
        if (!condo || typeof condo !== 'object') return {};
        return {
            ...condo,
            apartment: condo.apartment || condo.apartamento || condo.unit || '',
            block: condo.block || condo.bloco || ''
        };
    }

    function transformVisitorRow(raw) {
        const responsible = raw?.responsible || {};
        const condo = getResponsibleCondo(raw);
        const visitDate = raw?.visit_date || raw?.date || raw?.created_at || raw?.scheduled_at;
        const apartment = condo.apartment || '--';
        const block = condo.block || '--';
        const blockLabel = block && block !== '--' ? (String(block).toLowerCase().startsWith('bloco') ? String(block) : `Bloco ${block}`) : '--';
        const apartmentLabel = apartment && apartment !== '--' ? `Apto ${String(apartment).replace(/^Apto\s*/i, '')}` : '--';

        return {
            id: raw?.id || raw?.cpf || `visitor-${Math.random().toString(36).slice(2)}`,
            raw,
            nome: raw?.full_name || raw?.name || 'Visitante sem nome',
            cpf: raw?.cpf || '',
            rg: raw?.rg || '',
            documento: formatCpf(raw?.cpf) || raw?.rg || '--',
            documentoTipo: raw?.cpf ? 'CPF' : 'RG',
            phone: raw?.phone || '',
            email: raw?.email || '',
            reason: raw?.reason || raw?.purpose || raw?.visit_reason || 'Visita',
            visitDate,
            startTime: raw?.start_time || raw?.visit_time || raw?.time_from || '',
            endTime: raw?.end_time || raw?.time_until || '',
            responsavelNome: responsible?.name || '--',
            responsavelCpf: responsible?.cpf || raw?.responsible_cpf || '',
            responsavelPhone: responsible?.phone || '',
            responsavelEmail: responsible?.email || '',
            responsavelUnidade: [blockLabel, apartmentLabel].filter((value) => value !== '--').join(' / ') || 'Unidade --',
            unidadeBloco: blockLabel,
            unidadeApto: apartmentLabel,
            apartment,
            block,
            condominiumId: raw?.cep || condo?.cep || condo?.condominium_id || '',
            condominiumName: condo?.name || condo?.condominium_name || '',
            avatarIniciais: avatarInitials(raw?.full_name),
            avatarColor: avatarColorFor(raw?.cpf || raw?.full_name),
            status: normalizeReleaseStatus(raw?.release_status ?? raw?.status),
            created_at: raw?.created_at,
            updated_at: raw?.release_status_updated_at || raw?.created_at
        };
    }

    async function loadCurrentUser() {
        try {
            pageState.currentUser = typeof refreshCurrentUserFromDb === 'function'
                ? await refreshCurrentUserFromDb()
                : JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
        } catch (_) {
            pageState.currentUser = null;
        }

        if (!pageState.currentUser) {
            window.location.href = 'entrar.html';
            return false;
        }

        const type = typeof getNormalizedUserType === 'function'
            ? getNormalizedUserType(pageState.currentUser)
            : String(pageState.currentUser.user_type || pageState.currentUser.type || '').toLowerCase();

        if (type !== 'porteiro') {
            if (typeof redirectToHome === 'function') redirectToHome();
            else window.location.href = 'index.html';
            return false;
        }

        return true;
    }

    async function loadVisitorListFromDb() {
        if (typeof window.supabaseFetch === 'function') {
            try {
                const rows = await window.supabaseFetch('/rpc/condomit_list_released_visitors_by_porter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}'
                });
                return (Array.isArray(rows) ? rows : [])
                    .map(transformVisitorRow)
                    .filter((visitor) => visitor.status === 'liberado');
            } catch (error) {
                console.warn('RPC de visitantes liberados indisponível, usando fallback:', error);
            }
        }

        if (typeof window.getVisitorsForCondominium !== 'function') return [];
        const rows = await window.getVisitorsForCondominium(pageState.currentUser);
        return (Array.isArray(rows) ? rows : [])
            .filter((row) => String(row?.release_status || '').toLowerCase() === 'liberado')
            .map(transformVisitorRow);
    }

    async function reloadVisitors() {
        try {
            pageState.visitors = await loadVisitorListFromDb();
            populateBlocks();
            updateMetrics();
            renderTable();
        } catch (error) {
            console.error('Erro ao carregar visitantes:', error);
            showToast(error?.message || 'Não foi possível carregar os visitantes.', 'error');
        }
    }

    function getFilteredVisitors() {
        const searchNorm = normalizeString(pageState.search);
        const now = new Date();
        const dateWindow = Number.parseInt(pageState.filterDate, 10);

        return pageState.visitors.filter((visitor) => {
            if (pageState.filterBlock && visitor.unidadeBloco !== pageState.filterBlock) return false;

            if (searchNorm) {
                const haystack = normalizeString([
                    visitor.nome,
                    visitor.documento,
                    visitor.responsavelNome,
                    visitor.responsavelUnidade,
                    visitor.rg,
                    visitor.phone,
                    statusLabel(visitor)
                ].join(' '));
                if (!haystack.includes(searchNorm)) return false;
            }

            if (pageState.filterDate !== 'all' && Number.isFinite(dateWindow) && visitor.visitDate) {
                const visitorDate = safeDate(visitor.visitDate);
                const min = new Date(now);
                const max = new Date(now);
                min.setHours(0, 0, 0, 0);
                max.setHours(23, 59, 59, 999);
                max.setDate(max.getDate() + dateWindow);
                if (visitorDate < min || visitorDate > max) return false;
            }

            return true;
        });
    }

    function updateMetrics() {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);

        const releasedToday = pageState.visitors.filter((visitor) =>
            visitor.status === 'liberado' && sameDay(visitor.updated_at, today)
        ).length;
        const upcoming = pageState.visitors.filter((visitor) => {
            const date = safeDate(visitor.visitDate || visitor.created_at);
            return date >= today && date <= weekEnd;
        }).length;
        const monthCount = pageState.visitors.filter((visitor) => {
            const date = safeDate(visitor.visitDate || visitor.created_at);
            return date.getFullYear() === year && date.getMonth() === month;
        }).length;

        setText('todayReleasedCount', releasedToday);
        setText('upcomingCount', upcoming);
        setText('monthCount', monthCount);
    }

    function renderTable() {
        if (!tableBody || !tableInfo) return;
        const filtered = getFilteredVisitors();
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageState.pageSize));
        if (pageState.page > totalPages) pageState.page = totalPages;
        const start = (pageState.page - 1) * pageState.pageSize;
        const items = filtered.slice(start, start + pageState.pageSize);

        tableBody.innerHTML = items.length
            ? items.map((visitor) => {
                const { dateLabel, timeLabel } = formatDateTimeRange(visitor);
                const cpf = normalizeCpf(visitor.cpf);
                return `
                    <tr data-cpf="${cpf}" style="cursor:pointer;">
                        <td><div class="visitante-cell"><div class="visitante-avatar" style="background:${visitor.avatarColor}22;color:${visitor.avatarColor};">${visitor.avatarIniciais}</div><span class="visitante-nome">${escapeHtml(visitor.nome)}</span></div></td>
                        <td><div class="documento-cell"><div class="doc-numero">${escapeHtml(visitor.documento)}</div><div class="doc-label">${escapeHtml(visitor.documentoTipo)}</div></div></td>
                        <td><div class="responsavel-cell"><div class="resp-nome">${escapeHtml(visitor.responsavelNome)}</div><div class="resp-unidade">${escapeHtml(visitor.responsavelUnidade)}</div></div></td>
                        <td><div class="unidade-cell"><div class="uni-bloco">${escapeHtml(visitor.unidadeBloco)}</div><div class="uni-apto">${escapeHtml(visitor.unidadeApto)}</div></div></td>
                        <td><div class="data-horario-cell"><i class="fas fa-calendar-alt"></i><div><span class="data-label">${escapeHtml(dateLabel)}</span><div class="horario-label">${escapeHtml(timeLabel)}</div></div></div></td>
                        <td>${escapeHtml(visitor.reason)}</td>
                        <td><span class="status-badge status-${visitor.status}">${escapeHtml(statusLabel(visitor))}</span></td>
                        <td><button class="btn-acoes" type="button" data-cpf="${cpf}" aria-label="Ver informações"><i class="fas fa-ellipsis-v"></i></button></td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="8" style="text-align:center;padding:48px 16px;color:#64748b;"><i class="fas fa-users" style="font-size:36px;opacity:.3;margin-bottom:12px;display:block;"></i>Nenhum visitante encontrado para este condomínio.</td></tr>';

        tableBody.querySelectorAll('tr[data-cpf]').forEach((row) => {
            row.addEventListener('click', (event) => {
                if (event.target.closest('button')) return;
                openVisitorByCpf(row.dataset.cpf);
            });
        });
        tableBody.querySelectorAll('.btn-acoes').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                openVisitorByCpf(button.dataset.cpf);
            });
        });

        const first = totalItems ? start + 1 : 0;
        const last = Math.min(start + pageState.pageSize, totalItems);
        tableInfo.textContent = `Mostrando ${first} a ${last} de ${totalItems} visitantes`;
        renderPagination(totalPages);
    }

    function renderPagination(totalPages) {
        document.querySelectorAll('.page-btn[data-page]').forEach((button) => {
            const page = Number(button.dataset.page);
            button.classList.toggle('page-btn-active', page === pageState.page);
            button.style.display = page <= totalPages ? '' : 'none';
            button.onclick = () => {
                pageState.page = page;
                renderTable();
            };
        });

        const prev = document.getElementById('prevPageBtn');
        const next = document.getElementById('nextPageBtn');
        if (prev) {
            prev.disabled = pageState.page <= 1;
            prev.onclick = () => {
                if (pageState.page > 1) {
                    pageState.page -= 1;
                    renderTable();
                }
            };
        }
        if (next) {
            next.disabled = pageState.page >= totalPages;
            next.onclick = () => {
                if (pageState.page < totalPages) {
                    pageState.page += 1;
                    renderTable();
                }
            };
        }
    }

    function populateBlocks() {
        if (!blockSelect) return;
        const current = pageState.filterBlock;
        const blocks = [...new Set(pageState.visitors.map((visitor) => visitor.unidadeBloco).filter((value) => value && value !== '--'))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        blockSelect.innerHTML = '<option value="">Todos os blocos</option>' + blocks.map((block) => `<option value="${escapeHtml(block)}">${escapeHtml(block)}</option>`).join('');
        if (blocks.includes(current)) blockSelect.value = current;
    }

    function ensureModalStructure() {
        if (document.getElementById('visitorProfileModalBackdrop')) return;

        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = 'visitorProfileModalBackdrop';
        backdrop.style.display = 'none';
        backdrop.innerHTML = `
            <div class="modal-box visitor-modal" role="dialog" aria-modal="true" aria-labelledby="visitorProfileTitle">
                <div class="modal-header">
                    <div class="modal-icon modal-icon-info" id="visitorProfileIcon"><i class="fas fa-user"></i></div>
                    <div class="modal-title-wrap"><h3 class="modal-title" id="visitorProfileTitle">Informações do visitante</h3><p style="color:#64748b;margin:4px 0 0;font-size:13px;">Dados do cadastro e situação do acesso</p></div>
                    <button class="modal-close" type="button" id="visitorProfileClose" aria-label="Fechar" style="background:none;border:none;cursor:pointer;font-size:18px;color:#64748b;"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" id="visitorProfileBody"></div>
                <div class="modal-footer">
                    <button type="button" class="modal-btn modal-btn-secondary" id="visitorProfileCancel"><i class="fas fa-times"></i> Fechar</button>
                    <button type="button" class="modal-btn modal-btn-primary" id="visitorProfileAction"></button>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeVisitorProfileModal();
        });
        document.getElementById('visitorProfileClose')?.addEventListener('click', closeVisitorProfileModal);
        document.getElementById('visitorProfileCancel')?.addEventListener('click', closeVisitorProfileModal);
        document.getElementById('visitorProfileAction')?.addEventListener('click', handleModalAction);
    }

    function openVisitorByCpf(cpf) {
        const normalized = normalizeCpf(cpf);
        const visitor = pageState.visitors.find((item) => normalizeCpf(item.cpf) === normalized);
        if (visitor) openVisitorProfileModal(visitor);
    }

    function openVisitorProfileModal(visitor) {
        ensureModalStructure();
        pageState.currentModalVisitor = visitor;
        const body = document.getElementById('visitorProfileBody');
        const icon = document.getElementById('visitorProfileIcon');
        const action = document.getElementById('visitorProfileAction');
        const { dateLabel, timeLabel } = formatDateTimeRange(visitor);

        icon.style.background = visitor.avatarColor;
        icon.innerHTML = `<span style="font-size:18px;font-weight:700;">${visitor.avatarIniciais}</span>`;
        body.innerHTML = `
            <div class="visitor-modal-grid">
                <div class="info-col"><h4 class="info-title"><i class="fas fa-user-circle"></i> Visitante</h4><div class="info-row"><span>Nome completo</span><strong>${escapeHtml(visitor.nome)}</strong></div><div class="info-row"><span>CPF</span><strong>${escapeHtml(formatCpf(visitor.cpf) || '--')}</strong></div><div class="info-row"><span>RG</span><strong>${escapeHtml(visitor.rg || '--')}</strong></div><div class="info-row"><span>Telefone</span><strong>${escapeHtml(formatPhone(visitor.phone))}</strong></div><div class="info-row"><span>E-mail</span><strong>${escapeHtml(visitor.email || '--')}</strong></div></div>
                <div class="info-col"><h4 class="info-title"><i class="fas fa-home"></i> Responsável</h4><div class="info-row"><span>Nome</span><strong>${escapeHtml(visitor.responsavelNome)}</strong></div><div class="info-row"><span>CPF</span><strong>${escapeHtml(formatCpf(visitor.responsavelCpf) || '--')}</strong></div><div class="info-row"><span>Telefone</span><strong>${escapeHtml(formatPhone(visitor.responsavelPhone))}</strong></div><div class="info-row"><span>E-mail</span><strong>${escapeHtml(visitor.responsavelEmail || '--')}</strong></div><div class="info-row"><span>Unidade</span><strong>${escapeHtml(visitor.responsavelUnidade)}</strong></div></div>
                <div class="info-col full"><h4 class="info-title"><i class="fas fa-calendar-check"></i> Visita</h4><div class="info-row"><span>Data</span><strong>${escapeHtml(dateLabel)}</strong></div><div class="info-row"><span>Horário</span><strong>${escapeHtml(timeLabel)}</strong></div><div class="info-row"><span>Motivo</span><strong>${escapeHtml(visitor.reason)}</strong></div><div class="info-row"><span>Condomínio/CEP</span><strong>${escapeHtml(visitor.condominiumName || visitor.condominiumId || '--')}</strong></div><div class="info-row"><span>Status</span><strong><span class="status-badge status-${visitor.status}">${escapeHtml(statusLabel(visitor))}</span></strong></div></div>
            </div>
        `;

        if (visitor.status === 'liberado') {
            action.dataset.nextStatus = 'revogado';
            action.innerHTML = '<i class="fas fa-ban"></i> Revogar entrada';
            action.style.background = 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)';
        } else {
            action.dataset.nextStatus = 'liberado';
            action.innerHTML = '<i class="fas fa-check-circle"></i> Liberar entrada';
            action.style.background = 'linear-gradient(135deg,#10b981 0%,#0f766e 100%)';
        }

        document.getElementById('visitorProfileModalBackdrop').style.display = 'flex';
    }

    function closeVisitorProfileModal() {
        const backdrop = document.getElementById('visitorProfileModalBackdrop');
        if (backdrop) backdrop.style.display = 'none';
        pageState.currentModalVisitor = null;
    }

    async function handleModalAction() {
        const visitor = pageState.currentModalVisitor;
        const action = document.getElementById('visitorProfileAction');
        if (!visitor || !action || pageState.busy) return;

        if (typeof window.setVisitorReleaseStatus !== 'function') {
            showToast('Execute a migration 010 para habilitar esta ação.', 'error');
            return;
        }

        pageState.busy = true;
        action.disabled = true;
        const nextStatus = action.dataset.nextStatus || 'liberado';

        try {
            await window.setVisitorReleaseStatus(visitor.cpf, nextStatus);
            closeVisitorProfileModal();
            await reloadVisitors();
            showToast(nextStatus === 'liberado' ? 'Entrada liberada com sucesso.' : 'Entrada revogada com sucesso.', 'success');
        } catch (error) {
            console.error('Erro ao alterar status do visitante:', error);
            showToast(error?.message || 'Não foi possível alterar o acesso.', 'error');
        } finally {
            pageState.busy = false;
            action.disabled = false;
        }
    }

    function updateMonthReference() {
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const now = new Date();
        setText('mesReferencia', `${meses[now.getMonth()]}/${now.getFullYear()}`);
    }

    function sameDay(left, right) {
        const a = safeDate(left);
        const b = safeDate(right);
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        const container = document.getElementById('toast-container');
        if (!container) {
            console.log(message);
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = 'background:#fff;border-radius:10px;padding:12px 16px;margin-bottom:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);border-left:4px solid ' + (type === 'error' ? '#dc2626' : type === 'success' ? '#10b981' : '#2563eb');
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4500);
    }

    searchInput?.addEventListener('input', () => {
        pageState.search = searchInput.value || '';
        pageState.page = 1;
        renderTable();
    });
    blockSelect?.addEventListener('change', () => {
        pageState.filterBlock = blockSelect.value || '';
        pageState.page = 1;
        renderTable();
    });
    dateSelect?.addEventListener('change', () => {
        pageState.filterDate = dateSelect.value || 'all';
        pageState.page = 1;
        renderTable();
    });
    pageSizeSelect?.addEventListener('change', () => {
        pageState.pageSize = Number.parseInt(pageSizeSelect.value, 10) || 7;
        pageState.page = 1;
        renderTable();
    });
    btnLiberar?.addEventListener('click', () => {
        window.location.href = 'liberacao-visitantes.html';
    });
    btnFiltros?.addEventListener('click', () => showToast('Use os filtros de bloco, período e busca disponíveis acima.', 'info'));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeVisitorProfileModal();
    });

    updateMonthReference();
    if (!await loadCurrentUser()) return;
    await reloadVisitors();

    window.setInterval(() => {
        if (!document.hidden && !pageState.busy) reloadVisitors();
    }, 15000);
});
