document.addEventListener('DOMContentLoaded', function () {
    const sampleVisitors = [
        {
            id: 1,
            nome: 'Rafael Souza',
            avatarColor: '#1e40af',
            avatarIniciais: 'RS',
            documento: '123.456.789-01',
            documentoTipo: 'CPF',
            responsavelNome: 'Ana Paula',
            responsavelUnidade: 'Apto 203',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 203',
            data: '24/05/2024',
            horario: '09:00 - 12:00',
            motivo: 'Visita pessoal',
            status: 'liberado'
        },
        {
            id: 2,
            nome: 'Juliana Martins',
            avatarColor: '#86198f',
            avatarIniciais: 'JM',
            documento: '987.654.321-00',
            documentoTipo: 'CPF',
            responsavelNome: 'Carlos Alberto',
            responsavelUnidade: 'Apto 101',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 101',
            data: '24/05/2024',
            horario: '14:00 - 18:00',
            motivo: 'Reunião',
            status: 'liberado'
        },
        {
            id: 3,
            nome: 'Lucas Fernandes',
            avatarColor: '#0f766e',
            avatarIniciais: 'LF',
            documento: '456.789.123-09',
            documentoTipo: 'CPF',
            responsavelNome: 'Fernanda Lima',
            responsavelUnidade: 'Apto 302',
            unidadeBloco: 'Bloco B',
            unidadeApto: 'Apto 302',
            data: '24/05/2024',
            horario: '15:00 - 17:00',
            motivo: 'Prestação de serviço',
            status: 'liberado'
        },
        {
            id: 4,
            nome: 'Mariana Oliveira',
            avatarColor: '#9d174d',
            avatarIniciais: 'MO',
            documento: '321.654.987-11',
            documentoTipo: 'CPF',
            responsavelNome: 'Ricardo Ferreira',
            responsavelUnidade: 'Apto 104',
            unidadeBloco: 'Bloco C',
            unidadeApto: 'Apto 104',
            data: '25/05/2024',
            horario: '10:00 - 13:00',
            motivo: 'Entregas',
            status: 'liberado'
        },
        {
            id: 5,
            nome: 'Pedro Henrique',
            avatarColor: '#92400e',
            avatarIniciais: 'PH',
            documento: '159.753.456-20',
            documentoTipo: 'CPF',
            responsavelNome: 'Juliana Santos',
            responsavelUnidade: 'Apto 401',
            unidadeBloco: 'Bloco D',
            unidadeApto: 'Apto 401',
            data: '25/05/2024',
            horario: '16:00 - 20:00',
            motivo: 'Visita pessoal',
            status: 'liberado'
        },
        {
            id: 6,
            nome: 'Carla Dias',
            avatarColor: '#be185d',
            avatarIniciais: 'CD',
            documento: '753.951.852-33',
            documentoTipo: 'CPF',
            responsavelNome: 'Ana Paula',
            responsavelUnidade: 'Apto 203',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 203',
            data: '23/05/2024',
            horario: '09:00 - 11:00',
            motivo: 'Visita pessoal',
            status: 'indefinido'
        },
        {
            id: 7,
            nome: 'Roberto Almeida',
            avatarColor: '#155e75',
            avatarIniciais: 'RA',
            documento: '852.456.963-87',
            documentoTipo: 'CPF',
            responsavelNome: 'Carlos Alberto',
            responsavelUnidade: 'Apto 101',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 101',
            data: '22/05/2024',
            horario: '14:00 - 17:00',
            motivo: 'Prestação de serviço',
            status: 'indefinido'
        },
        {
            id: 8,
            nome: 'Camila Ferreira',
            avatarColor: '#4c1d95',
            avatarIniciais: 'CF',
            documento: '357.159.456-22',
            documentoTipo: 'CPF',
            responsavelNome: 'Marcos Vinícius',
            responsavelUnidade: 'Apto 301',
            unidadeBloco: 'Bloco B',
            unidadeApto: 'Apto 301',
            data: '26/05/2024',
            horario: '10:00 - 14:00',
            motivo: 'Aniversário',
            status: 'liberado'
        },
        {
            id: 9,
            nome: 'André Gomes',
            avatarColor: '#831843',
            avatarIniciais: 'AG',
            documento: '741.852.963-05',
            documentoTipo: 'CPF',
            responsavelNome: 'Beatriz Costa',
            responsavelUnidade: 'Apto 201',
            unidadeBloco: 'Bloco C',
            unidadeApto: 'Apto 201',
            data: '26/05/2024',
            horario: '18:00 - 22:00',
            motivo: 'Jantar',
            status: 'liberado'
        },
        {
            id: 10,
            nome: 'Fernanda Nascimento',
            avatarColor: '#065f46',
            avatarIniciais: 'FN',
            documento: '951.753.654-88',
            documentoTipo: 'CPF',
            responsavelNome: 'Ana Paula',
            responsavelUnidade: 'Apto 203',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 203',
            data: '27/05/2024',
            horario: '14:00 - 17:00',
            motivo: 'Entrega de encomenda',
            status: 'pendente'
        },
        {
            id: 11,
            nome: 'Gustavo Lima',
            avatarColor: '#b45309',
            avatarIniciais: 'GL',
            documento: '321.987.741-55',
            documentoTipo: 'CPF',
            responsavelNome: 'Carlos Alberto',
            responsavelUnidade: 'Apto 101',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 101',
            data: '27/05/2024',
            horario: '08:00 - 12:00',
            motivo: 'Prestação de serviço',
            status: 'pendente'
        },
        {
            id: 12,
            nome: 'Larissa Silva',
            avatarColor: '#1d4ed8',
            avatarIniciais: 'LS',
            documento: '456.789.321-44',
            documentoTipo: 'CPF',
            responsavelNome: 'João Silva',
            responsavelUnidade: 'Apto 502',
            unidadeBloco: 'Bloco D',
            unidadeApto: 'Apto 502',
            data: '28/05/2024',
            horario: '15:00 - 19:00',
            motivo: 'Visita pessoal',
            status: 'pendente'
        },
        {
            id: 13,
            nome: 'Rafael Costa',
            avatarColor: '#9f1239',
            avatarIniciais: 'RC',
            documento: '123.456.789-10',
            documentoTipo: 'CPF',
            responsavelNome: 'Fernanda Lima',
            responsavelUnidade: 'Apto 302',
            unidadeBloco: 'Bloco B',
            unidadeApto: 'Apto 302',
            data: '28/05/2024',
            horario: '09:00 - 11:00',
            motivo: 'Prestação de serviço',
            status: 'indefinido'
        },
        {
            id: 14,
            nome: 'Julio Cesar',
            avatarColor: '#166534',
            avatarIniciais: 'JC',
            documento: '654.321.789-01',
            documentoTipo: 'CPF',
            responsavelNome: 'Ricardo Ferreira',
            responsavelUnidade: 'Apto 104',
            unidadeBloco: 'Bloco C',
            unidadeApto: 'Apto 104',
            data: '29/05/2024',
            horario: '10:00 - 14:00',
            motivo: 'Visita pessoal',
            status: 'liberado'
        },
        {
            id: 15,
            nome: 'Mariana Silva',
            avatarColor: '#4338ca',
            avatarIniciais: 'MS',
            documento: '852.963.741-22',
            documentoTipo: 'CPF',
            responsavelNome: 'Juliana Santos',
            responsavelUnidade: 'Apto 401',
            unidadeBloco: 'Bloco D',
            unidadeApto: 'Apto 401',
            data: '29/05/2024',
            horario: '13:00 - 17:00',
            motivo: 'Reunião',
            status: 'liberado'
        },
        {
            id: 16,
            nome: 'Matheus Alves',
            avatarColor: '#b91c1c',
            avatarIniciais: 'MA',
            documento: '159.753.951-66',
            documentoTipo: 'CPF',
            responsavelNome: 'Ana Paula',
            responsavelUnidade: 'Apto 203',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 203',
            data: '30/05/2024',
            horario: '09:00 - 12:00',
            motivo: 'Prestação de serviço',
            status: 'indefinido'
        },
        {
            id: 17,
            nome: 'Amanda Rocha',
            avatarColor: '#115e59',
            avatarIniciais: 'AR',
            documento: '741.852.456-99',
            documentoTipo: 'CPF',
            responsavelNome: 'Carlos Alberto',
            responsavelUnidade: 'Apto 101',
            unidadeBloco: 'Bloco A',
            unidadeApto: 'Apto 101',
            data: '30/05/2024',
            horario: '16:00 - 20:00',
            motivo: 'Visita pessoal',
            status: 'pendente'
        },
        {
            id: 18,
            nome: 'Diego Martins',
            avatarColor: '#7c3aed',
            avatarIniciais: 'DM',
            documento: '963.852.741-33',
            documentoTipo: 'CPF',
            responsavelNome: 'Fernanda Lima',
            responsavelUnidade: 'Apto 302',
            unidadeBloco: 'Bloco B',
            unidadeApto: 'Apto 302',
            data: '31/05/2024',
            horario: '14:00 - 18:00',
            motivo: 'Entregas',
            status: 'pendente'
        },
        {
            id: 19,
            nome: 'Luiza Azevedo',
            avatarColor: '#c2410c',
            avatarIniciais: 'LA',
            documento: '321.654.987-12',
            documentoTipo: 'CPF',
            responsavelNome: 'Ricardo Ferreira',
            responsavelUnidade: 'Apto 104',
            unidadeBloco: 'Bloco C',
            unidadeApto: 'Apto 104',
            data: '31/05/2024',
            horario: '10:00 - 14:00',
            motivo: 'Aniversário',
            status: 'liberado'
        }
    ];

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

    function normalizeString(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function statusLabel(status) {
        if (status === 'liberado') return 'Liberado';
        if (status === 'pendente') return 'Pendente';
        return '—';
    }

    function getFilteredVisitors() {
        const searchNorm = normalizeString(state.search);
        const today = new Date();
        const dateWindow = parseInt(state.filterDate, 10);

        return sampleVisitors.filter(v => {
            if (state.filterBlock && v.unidadeBloco !== state.filterBlock) return false;

            if (searchNorm) {
                const haystack = normalizeString(
                    v.nome + ' ' +
                    v.documento + ' ' +
                    v.responsavelNome + ' ' +
                    v.responsavelUnidade
                );
                if (!haystack.includes(searchNorm)) return false;
            }

            if (state.filterDate !== 'all' && !isNaN(dateWindow)) {
                try {
                    const [dd, mm, yyyy] = v.data.split('/').map(n => parseInt(n, 10));
                    const vDate = new Date(yyyy, mm - 1, dd);
                    const limit = new Date(today);
                    limit.setDate(today.getDate() + dateWindow);
                    if (vDate > limit) return false;
                } catch (_) {}
            }

            return true;
        });
    }

    function renderTable() {
        const filtered = getFilteredVisitors();
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;

        const start = (state.page - 1) * state.pageSize;
        const pageItems = filtered.slice(start, start + state.pageSize);

        tableBody.innerHTML = pageItems.map(v => `
            <tr data-id="${v.id}">
                <td>
                    <div class="visitante-cell">
                        <div class="visitante-avatar" style="background: ${v.avatarColor}22; color: ${v.avatarColor};">${v.avatarIniciais}</div>
                        <span class="visitante-nome">${v.nome}</span>
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
                            <span class="data-label">${v.data}</span>
                            <div class="horario-label">${v.horario}</div>
                        </div>
                    </div>
                </td>
                <td>${v.motivo}</td>
                <td>
                    <span class="status-badge status-${v.status}">${statusLabel(v.status)}</span>
                </td>
                <td>
                    <button class="btn-acoes" type="button" aria-label="Mais ações" data-action-id="${v.id}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        tableBody.querySelectorAll('.btn-acoes').forEach(btn => {
            btn.addEventListener('click', function () {
                const id = Number(this.getAttribute('data-action-id'));
                const v = sampleVisitors.find(x => x.id === id);
                if (!v) return;
                showToast('Ações para o visitante ' + v.nome + ' em breve.', 'info');
            });
        });

        const startCount = totalItems > 0 ? start + 1 : 0;
        const endCount = Math.min(start + state.pageSize, totalItems);
        tableInfo.textContent = `Mostrando ${startCount} a ${endCount} de ${totalItems} visitantes`;

        renderPagination(totalPages);
        populateBlocks();
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

    function populateBlocks() {
        if (blockSelect.options.length > 1) return;
        const blocks = Array.from(new Set(sampleVisitors.map(v => v.unidadeBloco))).sort();
        blocks.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            blockSelect.appendChild(opt);
        });
    }

    function updateMesReferencia() {
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const now = new Date();
        const label = document.getElementById('mesReferencia');
        if (label) label.textContent = `${meses[now.getMonth()]}/${now.getFullYear()}`;
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

    updateMesReferencia();
    renderTable();
});
