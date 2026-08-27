let sugestoesData = [];
let sugestoesFiltradas = [...sugestoesData];
let paginaAtual = 1;
const itensPorPagina = 7;
const totalItens = 0;
let sugestaoAtualDetalhes = null;
let currentUser = null;

const categoriaLabelMap = {
    'areas-comuns': 'Áreas Comuns',
    'seguranca': 'Segurança',
    'lazer': 'Lazer',
    'estacionamento': 'Estacionamento',
    'manutencao': 'Manutenção',
    'sustentabilidade': 'Sustentabilidade'
};

const statusLabelMap = {
    'pendente': 'Pendente',
    'em análise': 'Em análise',
    'em andamento': 'Em andamento',
    'concluída': 'Concluída',
    'recusado': 'Recusado'
};

const iconePorCategoria = {
    'areas-comuns': { icone: 'fa-tree', classe: 'icon-areas-comuns' },
    'seguranca': { icone: 'fa-shield-alt', classe: 'icon-seguranca' },
    'lazer': { icone: 'fa-paw', classe: 'icon-lazer' },
    'estacionamento': { icone: 'fa-car', classe: 'icon-estacionamento' },
    'manutencao': { icone: 'fa-lightbulb', classe: 'icon-manutencao' },
    'sustentabilidade': { icone: 'fa-recycle', classe: 'icon-sustentabilidade' }
};

function logout() {
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    try { sessionStorage.removeItem('condominiumUser'); } catch(_) {}
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
    window.location.href = '../inicio.html';
}

async function getSuggestionsByCep(userCep) {
    try {
        const data = await supabaseFetch(`/suggestions?select=*&cep=eq.${encodeURIComponent(userCep)}&order=suggestion_date.desc,suggestion_time.desc`);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Erro ao buscar sugestões:', error);
        return [];
    }
}

async function saveSuggestion(suggestion) {
    const data = await supabaseFetch('/suggestions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(suggestion)
    });
    return Array.isArray(data) ? data[0] : data;
}

async function updateSuggestionStatus(title, newStatus) {
    const data = await supabaseFetch(`/suggestions?title=eq.${encodeURIComponent(title)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: newStatus })
    });
    return Array.isArray(data) ? data[0] : data;
}

function formatDateToBr(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function formatDateToDb(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function dbSuggestionToFrontend(dbItem, index) {
    const categoria = dbItem.category || 'areas-comuns';
    const iconeInfo = iconePorCategoria[categoria] || { icone: 'fa-lightbulb', classe: 'icon-areas-comuns' };
    const status = dbItem.status || 'pendente';

    const moradorStr = dbItem.resident || 'Morador';
    const moradorParts = moradorStr.split('|');
    const nomeMorador = moradorParts[0]?.trim() || moradorStr;
    const aptoMorador = moradorParts[1]?.trim() || '';

    return {
        id: index !== undefined ? index + 1 : Date.now(),
        title: dbItem.title,
        titulo: dbItem.title,
        descricao: dbItem.suggestion || '',
        categoria: categoria,
        categoriaLabel: categoriaLabelMap[categoria] || categoria,
        status: status,
        statusLabel: statusLabelMap[status] || status,
        data: formatDateToBr(dbItem.suggestion_date),
        hora: dbItem.suggestion_time ? dbItem.suggestion_time.slice(0, 5) : '',
        morador: nomeMorador,
        apto: aptoMorador,
        icone: iconeInfo.icone,
        iconeClasse: iconeInfo.classe,
        curtidas: 0,
        usuarioCurtiu: false
    };
}

function frontendSuggestionToDb(frontItem, userCep) {
    const residentField = frontItem.apto
        ? `${frontItem.morador} | ${frontItem.apto}`
        : frontItem.morador;

    return {
        title: frontItem.titulo,
        cep: userCep,
        category: frontItem.categoria,
        resident: residentField,
        status: 'pendente',
        suggestion_date: formatDateToDb(frontItem.data),
        suggestion_time: frontItem.hora + ':00',
        suggestion: frontItem.descricao
    };
}

async function loadSuggestions() {
    const userCep = currentUser?.condominium?.cep;
    if (!userCep) {
        console.warn('CEP do usuário não encontrado.');
        sugestoesData = [];
        sugestoesFiltradas = [];
        renderizarSugestoes();
        return;
    }

    const dbSugestoes = await getSuggestionsByCep(userCep);
    sugestoesData = dbSugestoes.map((item, idx) => dbSuggestionToFrontend(item, idx));
    sugestoesFiltradas = [...sugestoesData];
    renderizarSugestoes();
}

function renderizarSugestoes() {
    const tbody = document.getElementById('sugestoesTableBody');
    if (!tbody) return;

    if (sugestoesFiltradas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 60px 24px; color: #6b7280;">
                    <i class="fas fa-inbox" style="font-size: 2.5rem; margin-bottom: 12px; display: block; color: #d1d5db;"></i>
                    <strong>Nenhuma sugestão encontrada</strong>
                    <p style="margin-top: 6px; font-size: 0.9rem;">Clique em "Nova Sugestão" para enviar a primeira ideia.</p>
                </td>
            </tr>
        `;
        atualizarPaginacao(0);
        return;
    }

    tbody.innerHTML = sugestoesFiltradas.map(sugestao => `
        <tr data-title="${encodeURIComponent(sugestao.title || sugestao.titulo)}">
            <td>
                <div class="sugestao-info">
                    <div class="sugestao-icon ${sugestao.iconeClasse}">
                        <i class="fas ${sugestao.icone}"></i>
                    </div>
                    <div class="sugestao-text">
                        <div class="sugestao-titulo">${sugestao.titulo}</div>
                        <div class="sugestao-descricao">${sugestao.descricao}</div>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge badge-categoria ${sugestao.categoria}">${sugestao.categoriaLabel}</span>
            </td>
            <td>
                <span class="badge badge-status ${sugestao.status.replace(/ /g, '-').replace(/á/g, 'a').replace(/í/g, 'i').replace(/ã/g, 'a').replace(/é/g, 'e').replace(/ê/g, 'e').replace(/ô/g, 'o').replace(/ç/g, 'c')}">${sugestao.statusLabel}</span>
            </td>
            <td>
                <div class="data-sugestao">
                    ${sugestao.data}
                    <span class="hora">${sugestao.hora}</span>
                </div>
            </td>
            <td>
                <div class="morador-info">
                    <span class="morador-nome">${sugestao.morador}</span>
                    <span class="morador-apto">${sugestao.apto}</span>
                </div>
            </td>
            <td>
                <button class="btn-expandir" title="Ver detalhes">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </td>
        </tr>
    `).join('');

    atualizarPaginacao(sugestoesFiltradas.length);
}

function atualizarPaginacao(qtd) {
    const info = document.getElementById('paginationInfo');
    if (info) {
        if (qtd === 0) {
            info.textContent = 'Nenhuma sugestão cadastrada';
        } else {
            info.textContent = `Mostrando 1 a ${qtd} de ${qtd} sugestões`;
        }
    }
}

function aplicarFiltros() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const categoriaFilter = document.getElementById('categoriaFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    sugestoesFiltradas = sugestoesData.filter(s => {
        const matchSearch = !searchTerm ||
            s.titulo.toLowerCase().includes(searchTerm) ||
            s.descricao.toLowerCase().includes(searchTerm) ||
            s.morador.toLowerCase().includes(searchTerm);

        const matchCategoria = !categoriaFilter || s.categoria === categoriaFilter;
        const matchStatus = !statusFilter || s.status === statusFilter;

        return matchSearch && matchCategoria && matchStatus;
    });

    paginaAtual = 1;
    renderizarSugestoes();
}

function abrirModal() {
    const modal = document.getElementById('modalNovaSugestao');
    if (modal) {
        modal.classList.add('active');
    }
}

function fecharModal() {
    const modal = document.getElementById('modalNovaSugestao');
    if (modal) {
        modal.classList.remove('active');
        document.getElementById('sugestaoTitulo').value = '';
        document.getElementById('sugestaoCategoria').value = '';
        document.getElementById('sugestaoDescricao').value = '';
    }
}

function isSindico() {
    return currentUser && currentUser.type === 'sindico';
}

function abrirModalDetalhes(sugestao) {
    sugestaoAtualDetalhes = sugestao;

    const body = document.getElementById('modalDetalhesBody');
    if (!body) return;

    const sindico = isSindico();

    let statusSindicoSection = '';
    if (sindico) {
        statusSindicoSection = `
            <div class="detalhes-status-sindico">
                <div class="detalhes-info-label">Alterar Status da Sugestão</div>
                <select class="form-input" id="sindicoStatusSelect">
                    ${Object.keys(statusLabelMap).map(k => `
                        <option value="${k}" ${k === sugestao.status ? 'selected' : ''}>${statusLabelMap[k]}</option>
                    `).join('')}
                </select>
                <button class="btn-salvar-status" id="btnSalvarStatus">
                    <i class="fas fa-save"></i> Salvar Status
                </button>
            </div>
        `;
    }

    body.innerHTML = `
        <div class="detalhes-cabecalho">
            <div class="detalhes-icon ${sugestao.iconeClasse}">
                <i class="fas ${sugestao.icone}"></i>
            </div>
            <div class="detalhes-titulo-group">
                <h2 class="detalhes-titulo">${sugestao.titulo}</h2>
                <div class="detalhes-badges">
                    <span class="badge badge-categoria ${sugestao.categoria}">${sugestao.categoriaLabel}</span>
                    <span class="badge badge-status ${sugestao.status.replace(/ /g, '-').replace(/á/g, 'a').replace(/í/g, 'i').replace(/ã/g, 'a').replace(/é/g, 'e').replace(/ê/g, 'e').replace(/ô/g, 'o').replace(/ç/g, 'c')}">${sugestao.statusLabel}</span>
                </div>
            </div>
        </div>

        <div class="detalhes-info-grid">
            <div class="detalhes-info-item">
                <div class="detalhes-info-label">Categoria</div>
                <div class="detalhes-info-value">${sugestao.categoriaLabel}</div>
            </div>
            <div class="detalhes-info-item">
                <div class="detalhes-info-label">Status Atual</div>
                <div class="detalhes-info-value">${sugestao.statusLabel}</div>
            </div>
            <div class="detalhes-info-item">
                <div class="detalhes-info-label">Data e Hora</div>
                <div class="detalhes-info-value">
                    ${sugestao.data}
                    <span class="sub">às ${sugestao.hora}</span>
                </div>
            </div>
            <div class="detalhes-info-item">
                <div class="detalhes-info-label">Morador</div>
                <div class="detalhes-info-value">
                    ${sugestao.morador}
                    <span class="sub">${sugestao.apto}</span>
                </div>
            </div>
        </div>

        ${statusSindicoSection}

        <div class="detalhes-descricao-section">
            <div class="detalhes-descricao-label">Descrição da Sugestão</div>
            <div class="detalhes-descricao-text">${sugestao.descricao}</div>
        </div>
    `;

    if (sindico) {
        const btnSalvar = document.getElementById('btnSalvarStatus');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', salvarStatusSindico);
        }
    }

    atualizarBotaoCurtir();

    const modal = document.getElementById('modalDetalhes');
    if (modal) {
        modal.classList.add('active');
    }
}

async function salvarStatusSindico() {
    if (!sugestaoAtualDetalhes) return;

    const select = document.getElementById('sindicoStatusSelect');
    if (!select) return;

    const novoStatus = select.value;
    const tituloSugestao = sugestaoAtualDetalhes.title || sugestaoAtualDetalhes.titulo;

    try {
        await updateSuggestionStatus(tituloSugestao, novoStatus);

        sugestaoAtualDetalhes.status = novoStatus;
        sugestaoAtualDetalhes.statusLabel = statusLabelMap[novoStatus];

        const item = sugestoesData.find(s => (s.title || s.titulo) === tituloSugestao);
        if (item) {
            item.status = novoStatus;
            item.statusLabel = statusLabelMap[novoStatus];
        }

        abrirModalDetalhes(sugestaoAtualDetalhes);
        aplicarFiltros();
    } catch (error) {
        window.showToast('Erro ao atualizar status: ' + (error.message || 'Tente novamente.'), 'error');
    }
}

function fecharModalDetalhes() {
    const modal = document.getElementById('modalDetalhes');
    if (modal) {
        modal.classList.remove('active');
    }
    sugestaoAtualDetalhes = null;
}

function atualizarBotaoCurtir() {
    if (!sugestaoAtualDetalhes) return;

    const btn = document.getElementById('likeBtn');
    const icon = btn?.querySelector('i');
    const texto = btn?.querySelector('span:not(.like-count)');
    const count = document.getElementById('likeCount');

    if (btn) {
        if (sugestaoAtualDetalhes.usuarioCurtiu) {
            btn.classList.add('liked');
            if (icon) {
                icon.className = 'fas fa-thumbs-up';
            }
            if (texto) {
                texto.textContent = 'Curtiu';
            }
        } else {
            btn.classList.remove('liked');
            if (icon) {
                icon.className = 'far fa-thumbs-up';
            }
            if (texto) {
                texto.textContent = 'Curtir';
            }
        }
    }

    if (count) {
        count.textContent = sugestaoAtualDetalhes.curtidas;
    }
}

function toggleCurtida() {
    if (!sugestaoAtualDetalhes) return;

    if (sugestaoAtualDetalhes.usuarioCurtiu) {
        sugestaoAtualDetalhes.curtidas--;
        sugestaoAtualDetalhes.usuarioCurtiu = false;
    } else {
        sugestaoAtualDetalhes.curtidas++;
        sugestaoAtualDetalhes.usuarioCurtiu = true;
    }

    atualizarBotaoCurtir();
}

async function enviarSugestao() {
    const titulo = document.getElementById('sugestaoTitulo').value.trim();
    const categoria = document.getElementById('sugestaoCategoria').value;
    const descricao = document.getElementById('sugestaoDescricao').value.trim();

    if (!titulo || !categoria || !descricao) {
        window.showToast('Por favor, preencha todos os campos.', 'warning');
        return;
    }

    const userCep = currentUser?.condominium?.cep;
    if (!userCep) {
        window.showToast('Erro: CEP do condomínio não identificado.', 'error');
        return;
    }

    const hoje = new Date();
    const dataStr = hoje.toLocaleDateString('pt-BR');
    const horaStr = hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const iconeInfo = iconePorCategoria[categoria] || { icone: 'fa-lightbulb', classe: 'icon-areas-comuns' };

    const userName = currentUser ? currentUser.name : 'Morador';
    const userApto = currentUser && currentUser.apartment ? `Apto ${currentUser.apartment}` : '';

    const novaSugestaoFront = {
        titulo,
        descricao,
        categoria,
        categoriaLabel: categoriaLabelMap[categoria],
        status: 'pendente',
        statusLabel: 'Pendente',
        data: dataStr,
        hora: horaStr,
        morador: userName,
        apto: userApto,
        icone: iconeInfo.icone,
        iconeClasse: iconeInfo.classe,
        curtidas: 0,
        usuarioCurtiu: false
    };

    const sugestaoDb = frontendSuggestionToDb(novaSugestaoFront, userCep);

    try {
        await saveSuggestion(sugestaoDb);

        novaSugestaoFront.title = titulo;
        novaSugestaoFront.id = (sugestoesData[0]?.id || 0) + 1;
        sugestoesData.unshift(novaSugestaoFront);
        aplicarFiltros();
        fecharModal();
    } catch (error) {
        window.showToast('Erro ao enviar sugestão: ' + (error.message || 'Tente novamente. Certifique-se de que o título é único.'), 'error');
    }
}

function handlePagination(e) {
    const btn = e.target.closest('.pagination-btn');
    if (!btn) return;

    if (btn.disabled) return;

    const controls = document.querySelectorAll('.pagination-controls .pagination-btn');
    controls.forEach(b => {
        if (b === btn) {
            b.classList.add('active');
        } else if (!b.innerHTML.includes('Anterior') && !b.innerHTML.includes('Próxima')) {
            b.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', async function () {
    let raw = null;
    try { raw = sessionStorage.getItem('condominiumUser'); } catch(_) {}
    if (!raw) {
        try {
            const persistRaw = localStorage.getItem('condominiumPersistentUser');
            if (persistRaw) {
                const persist = JSON.parse(persistRaw);
                if (persist && persist.email && typeof fetchUserByEmail === 'function') {
                    const fresh = await fetchUserByEmail(persist.email).catch(() => null);
                    if (fresh) {
                        const restored = { ...fresh, password: fresh.password || null };
                        sessionStorage.setItem('condominiumUser', JSON.stringify(restored));
                        raw = sessionStorage.getItem('condominiumUser');
                        if (typeof syncAllAvatars === 'function') syncAllAvatars(restored);
                    }
                }
            }
        } catch (_) {}
    }
    try { currentUser = raw ? JSON.parse(raw) : null; } catch (_) { currentUser = null; }

    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }

    const userName = currentUser.name || 'Usuário';
    const userTypeText = currentUser.type === 'sindico' ? 'Síndico' : (currentUser.type === 'morador' ? 'Morador' : 'Usuário');
    const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const avatarEl = document.getElementById('user-avatar-top');
    const nameEl = document.getElementById('user-name-top');
    const typeEl = document.getElementById('user-type-top');

    if (avatarEl) avatarEl.textContent = initials;
    if (nameEl) nameEl.textContent = userName;
    if (typeEl) typeEl.textContent = userTypeText;

    if (typeof syncAllAvatars === 'function') {
        syncAllAvatars(currentUser);
    }

    if (currentUser.condominium) {
        const sidebarCondoNameEl = document.querySelector('.condo-name');
        if (sidebarCondoNameEl) {
            const words = currentUser.condominium.name.split(' ');
            if (words.length > 2) {
                sidebarCondoNameEl.innerHTML = `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`;
            } else {
                sidebarCondoNameEl.textContent = currentUser.condominium.name;
            }
        }
    }

    loadSuggestions();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', aplicarFiltros);
    }

    const categoriaFilter = document.getElementById('categoriaFilter');
    if (categoriaFilter) {
        categoriaFilter.addEventListener('change', aplicarFiltros);
    }

    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', aplicarFiltros);
    }

    const btnNova = document.getElementById('btnNovaSugestao');
    if (btnNova) {
        btnNova.addEventListener('click', abrirModal);
    }

    const btnFechar = document.getElementById('modalClose');
    if (btnFechar) {
        btnFechar.addEventListener('click', fecharModal);
    }

    const btnCancelar = document.getElementById('btnCancelarSugestao');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', fecharModal);
    }

    const btnEnviar = document.getElementById('btnEnviarSugestao');
    if (btnEnviar) {
        btnEnviar.addEventListener('click', enviarSugestao);
    }

    const modalOverlay = document.getElementById('modalNovaSugestao');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function (e) {
            if (e.target === modalOverlay) {
                fecharModal();
            }
        });
    }

    const btnDetalhesFechar = document.getElementById('modalDetalhesClose');
    if (btnDetalhesFechar) {
        btnDetalhesFechar.addEventListener('click', fecharModalDetalhes);
    }

    const btnFecharDetalhes = document.getElementById('btnFecharDetalhes');
    if (btnFecharDetalhes) {
        btnFecharDetalhes.addEventListener('click', fecharModalDetalhes);
    }

    const modalDetalhesOverlay = document.getElementById('modalDetalhes');
    if (modalDetalhesOverlay) {
        modalDetalhesOverlay.addEventListener('click', function (e) {
            if (e.target === modalDetalhesOverlay) {
                fecharModalDetalhes();
            }
        });
    }

    const btnLike = document.getElementById('likeBtn');
    if (btnLike) {
        btnLike.addEventListener('click', toggleCurtida);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            fecharModal();
            fecharModalDetalhes();
        }
    });

    const paginationControls = document.querySelector('.pagination-controls');
    if (paginationControls) {
        paginationControls.addEventListener('click', handlePagination);
    }

    const tbody = document.getElementById('sugestoesTableBody');
    if (tbody) {
        tbody.addEventListener('click', function (e) {
            const row = e.target.closest('tr[data-title]');
            if (row) {
                const titleEncoded = row.getAttribute('data-title');
                const title = decodeURIComponent(titleEncoded);
                const sugestao = sugestoesData.find(s => (s.title || s.titulo) === title);
                if (sugestao) {
                    abrirModalDetalhes(sugestao);
                }
            }
        });
    }
});
