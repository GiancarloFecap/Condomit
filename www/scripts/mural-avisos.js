const wallState = {
    currentUser: null,
    activeCategory: 'Todas',
    notices: [],
    selectedNoticeId: null
};

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await loadWallUser();
    if (!currentUser) return;

    wallState.currentUser = currentUser;
    setupWallShell(currentUser);
    setupWallActions();
    await renderWallPage();
});

async function loadWallUser() {
    let user = window.communityHub?.getCurrentUser?.() || null;
    if (!user && typeof refreshCurrentUserFromDb === 'function') {
        user = await refreshCurrentUserFromDb().catch(() => null);
    }
    if (!user) {
        window.location.href = 'entrar.html';
        return null;
    }
    return user;
}

function setupWallShell(currentUser) {
    const isSindico = window.communityHub.getUserType(currentUser) === 'sindico';
    const createButton = document.getElementById('createWallNoticeBtn');
    const subtitle = document.getElementById('wallSubtitle');

    if (createButton) createButton.style.display = isSindico ? 'inline-flex' : 'none';
    if (subtitle) {
        subtitle.textContent = isSindico
            ? 'Publique avisos para todos os moradores do condomínio.'
            : 'Acompanhe todos os avisos publicados pelo síndico do seu condomínio.';
    }

    const profileNameTop = document.getElementById('profileNameTop');
    const profileTypeTop = document.getElementById('profileTypeTop');
    const profileAvatarTop = document.getElementById('profileAvatarTop');
    if (profileNameTop) profileNameTop.textContent = currentUser.name || 'Usuário';
    if (profileTypeTop) profileTypeTop.textContent = window.communityHub.getUserTypeLabel(currentUser);
    if (profileAvatarTop) profileAvatarTop.textContent = window.communityHub.getInitials(currentUser.name);
}

function setupWallActions() {
    document.getElementById('createWallNoticeBtn')?.addEventListener('click', openWallCreateModal);
    document.getElementById('closeWallCreateModal')?.addEventListener('click', closeWallCreateModal);
    document.getElementById('cancelWallCreateModal')?.addEventListener('click', closeWallCreateModal);
    document.getElementById('wallCreateModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'wallCreateModal') closeWallCreateModal();
    });

    document.getElementById('closeWallDetailModal')?.addEventListener('click', closeWallDetailModal);
    document.getElementById('closeWallDetailAction')?.addEventListener('click', closeWallDetailModal);
    document.getElementById('wallDetailModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'wallDetailModal') closeWallDetailModal();
    });

    document.getElementById('wallNoticeForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const category = document.getElementById('wallNoticeCategory')?.value || 'Avisos';
        const title = document.getElementById('wallNoticeTitle')?.value.trim() || '';
        const message = document.getElementById('wallNoticeMessage')?.value.trim() || '';
        const attachmentUrl = document.getElementById('wallNoticeAttachment')?.value.trim() || null;
        const pinned = document.getElementById('wallNoticePinned')?.checked === true;
        const commentsEnabled = document.getElementById('wallNoticeComments')?.checked !== false;
        if (!title || !message) return;

        const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            const savedNotice = await window.communityHub.createWallNotice({
                category,
                title,
                message,
                details: message,
                source: 'manual'
            }, wallState.currentUser);

            if (savedNotice?.dbId && (pinned || !commentsEnabled || attachmentUrl)) {
                await window.supabaseFetch('/rpc/condomit_set_notice_options', {
                    method:'POST',
                    body:JSON.stringify({
                        target_notice_id:Number(savedNotice.dbId),
                        target_pinned:pinned,
                        target_comments_enabled:commentsEnabled,
                        target_attachment_url:attachmentUrl
                    })
                });
            }

            event.target.reset();
            closeWallCreateModal();
            wallState.activeCategory = 'Todas';
            await renderWallPage();
            window.showToast?.('Aviso publicado no Mural de Avisos e moradores notificados.', 'success');
        } catch (error) {
            console.error('Erro ao publicar aviso no mural:', error);
            window.showToast?.(error?.message || 'Não foi possível publicar o aviso.', 'error');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

async function renderWallPage() {
    try {
        wallState.notices = await window.communityHub.getWallNotices(wallState.currentUser);
        /* 027: mescla opções do feed (fixado/comentários/anexo) sem exigir
           alteração do RPC legado condomit_list_wall_notices. */
        try {
            const extras = await window.supabaseFetch('/condominium_notices?select=id,is_pinned,comments_enabled,attachment_url');
            const byId = new Map((Array.isArray(extras) ? extras : []).map(row => [Number(row.id), row]));
            wallState.notices = wallState.notices.map(notice => ({ ...notice, ...(byId.get(Number(notice.dbId)) || {}) }));
            wallState.notices.sort((a,b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || new Date(b.createdAt) - new Date(a.createdAt));
        } catch (_) {}
    } catch (error) {
        console.error('Erro ao carregar Mural de Avisos:', error);
        wallState.notices = [];
        window.showToast?.(error?.message || 'Não foi possível carregar o Mural de Avisos.', 'error');
    }

    const filtered = wallState.activeCategory === 'Todas'
        ? wallState.notices
        : wallState.notices.filter((notice) => notice.category === wallState.activeCategory);

    renderWallCategoryTabs(wallState.notices);
    renderWallNotices(filtered);
    renderWallSummary(wallState.notices);
}

function renderWallCategoryTabs(notices) {
    const container = document.getElementById('wallCategoryTabs');
    if (!container) return;

    const categories = ['Todas', 'Avisos', 'Reservas', 'Assembleias', 'Entregas'];
    const counts = notices.reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
    }, {});

    container.innerHTML = categories.map((category) => {
        const count = category === 'Todas' ? notices.length : (counts[category] || 0);
        return `
            <button class="category-pill ${wallState.activeCategory === category ? 'active' : ''}" type="button" data-wall-category="${category}">
                <span>${category}</span>
                <strong>${count}</strong>
            </button>`;
    }).join('');

    container.querySelectorAll('[data-wall-category]').forEach((button) => {
        button.addEventListener('click', () => {
            wallState.activeCategory = button.dataset.wallCategory;
            renderWallPage();
        });
    });
}

function renderWallNotices(notices) {
    const list = document.getElementById('wallNoticesList');
    const counter = document.getElementById('wallCounter');
    if (!list) return;

    if (counter) counter.textContent = `${notices.length} ${notices.length === 1 ? 'aviso' : 'avisos'}`;

    if (!notices.length) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bullhorn"></i>
                <p>Nenhum aviso publicado neste filtro.</p>
            </div>`;
        return;
    }

    list.innerHTML = notices.map((notice) => `
        <article class="notification-item wall-notice-item" data-id="${escapeWallHtml(notice.id)}" data-category="${escapeWallHtml(notice.category)}" tabindex="0" role="button" aria-label="Abrir aviso ${escapeWallHtml(notice.title)}">
            <div class="notification-icon"><i class="${iconForWallCategory(notice.category)}"></i></div>
            <div class="notification-content">
                <div class="notification-meta">
                    <div class="notification-text">
                        <h4>${escapeWallHtml(notice.title)}</h4>
                        <p>${escapeWallHtml(notice.message)}</p>
                    </div>
                    <small class="muted">${formatWallDate(notice.createdAt)}</small>
                </div>
                <div class="notification-badges">
                    ${notice.is_pinned ? '<span class="tag wall-pinned"><i class="fas fa-thumbtack"></i> Fixado</span>' : ''}
                    <span class="tag category">${escapeWallHtml(notice.category)}</span>
                    <span class="tag category">${escapeWallHtml(notice.author || 'Condomit')}</span>
                </div>
            </div>
            <i class="fas fa-chevron-right wall-chevron" aria-hidden="true"></i>
        </article>
    `).join('');

    list.querySelectorAll('.wall-notice-item').forEach((item) => {
        const open = () => openWallDetail(item.dataset.id);
        item.addEventListener('click', open);
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });
    });
}

function renderWallSummary(notices) {
    const total = document.getElementById('totalWallNotices');
    const month = document.getElementById('monthWallNotices');
    const latest = document.getElementById('latestWallNotice');

    if (total) total.textContent = String(notices.length);

    const now = new Date();
    const monthCount = notices.filter((notice) => {
        const date = new Date(notice.createdAt);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).length;
    if (month) month.textContent = String(monthCount);
    if (latest) latest.textContent = notices[0] ? formatWallDate(notices[0].createdAt) : '--';
}

function syncWallModalBodyLock() {
    const hasOpenModal = Boolean(document.querySelector('.modal-backdrop.open'));
    document.body.classList.toggle('condomit-modal-open', hasOpenModal);
}

function openWallCreateModal() {
    const modal = document.getElementById('wallCreateModal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
    syncWallModalBodyLock();
}

function closeWallCreateModal() {
    const modal = document.getElementById('wallCreateModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    syncWallModalBodyLock();
}

async function openWallDetail(noticeId) {
    const notice = window.communityHub.getWallNoticeById(noticeId);
    if (!notice) return;

    wallState.selectedNoticeId = noticeId;

    setText('wallDetailTitle', notice.title || 'Detalhes do aviso');
    setText('wallDetailSubtitle', 'Informações completas do aviso publicado no condomínio.');
    setText('wallDetailCategory', notice.category || 'Avisos');
    setText('wallDetailAuthor', notice.author || 'Condomit');
    setText('wallDetailDate', formatWallDate(notice.createdAt, true));
    setText('wallDetailMessage', notice.message || '--');
    setText('wallDetailFullText', notice.details || notice.message || '--');
    setText('wallDetailSource', labelForWallSource(notice.source));
    const attachment=document.getElementById('wallDetailAttachment');
    if(attachment){
        const url=String(notice.attachment_url||'').trim();
        attachment.hidden=!url;
        if(url)attachment.href=url;
    }

    const detailModal = document.getElementById('wallDetailModal');
    detailModal?.classList.add('open');
    detailModal?.setAttribute('aria-hidden', 'false');
    syncWallModalBodyLock();
    detailModal?.querySelector('.modal-close')?.focus?.({ preventScroll: true });
    await renderWallInteractions(notice);
}

async function resolveWallCep() {
    try {
        const value = await window.supabaseFetch('/rpc/condomit_current_user_cep', { method: 'POST', body: '{}' });
        return typeof value === 'string' ? value : String(value?.cep || '');
    } catch (_) {
        const condo = wallState.currentUser?.condominium || {};
        return String(condo?.cep || condo?.condominium_id || '');
    }
}

function ensureWallInteractionRoot() {
    const modal = document.getElementById('wallDetailModal');
    if (!modal) return null;
    let root = modal.querySelector('#wallInteractions027');
    if (!root) {
        const action = document.getElementById('closeWallDetailAction');
        root = document.createElement('section');
        root.id = 'wallInteractions027';
        root.className = 'wall-interactions';
        root.innerHTML = `<div class="wall-reaction-row"><button data-wall-reaction="curtir">👍 Curtir</button><button data-wall-reaction="apoio">🤝 Apoio</button><button data-wall-reaction="importante">⭐ Importante</button></div><div class="wall-read-row"><span id="wallReadState027">Abrindo...</span><span id="wallReadStats027" class="wall-read-stats" hidden></span><button id="wallPin027" type="button" hidden></button></div><div id="wallReactionCounts027" class="wall-counts"></div><div id="wallComments027" class="wall-comments"></div><form id="wallCommentForm027" class="wall-comment-form"><input id="wallCommentInput027" maxlength="1000" placeholder="Escreva um comentário..." required><button type="submit">Enviar</button></form>`;
        action?.parentElement?.parentElement?.insertBefore(root, action.parentElement);
        root.addEventListener('click', async event => {
            const reaction = event.target.closest('[data-wall-reaction]')?.dataset.wallReaction;
            if (reaction) await saveWallReaction(reaction);
            if (event.target.closest('#wallPin027')) await toggleWallPin();
        });
        root.querySelector('#wallCommentForm027')?.addEventListener('submit', async event => { event.preventDefault(); await saveWallComment(); });
    }
    return root;
}

async function renderWallInteractions(notice) {
    const root = ensureWallInteractionRoot();
    if (!root || !notice?.dbId) return;
    root.dataset.noticeId = notice.dbId;
    const cep = await resolveWallCep();
    const email = String(wallState.currentUser?.email || '').toLowerCase();
    const management = window.communityHub?.getUserType?.(wallState.currentUser) === 'sindico';
    const pin = root.querySelector('#wallPin027');
    if (pin) { pin.hidden = !management; pin.textContent = notice.is_pinned ? 'Desafixar aviso' : 'Fixar aviso'; }
    const form = root.querySelector('#wallCommentForm027');
    if (form) form.hidden = notice.comments_enabled === false;
    try {
        await window.supabaseFetch('/communication_reads?on_conflict=resource_type,resource_id,user_email', { method:'POST', headers:{Prefer:'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify({cep,resource_type:'mural',resource_id:String(notice.dbId),user_email:email,acknowledged:true,read_at:new Date().toISOString()}) });
        root.querySelector('#wallReadState027').textContent = '✓ Leitura confirmada';
    } catch (_) { root.querySelector('#wallReadState027').textContent = 'Leitura registrada localmente'; }
    const [comments,reactions,reads,residents] = await Promise.all([
        window.supabaseFetch(`/wall_comments?select=*&notice_id=eq.${notice.dbId}&order=created_at.asc`).catch(()=>[]),
        window.supabaseFetch(`/wall_reactions?select=reaction,user_email&notice_id=eq.${notice.dbId}`).catch(()=>[]),
        management ? window.supabaseFetch(`/communication_reads?select=user_email,acknowledged&resource_type=eq.mural&resource_id=eq.${notice.dbId}&cep=eq.${encodeURIComponent(cep)}`).catch(()=>[]) : Promise.resolve([]),
        management ? window.supabaseFetch('/rpc/condomit_list_condo_residents',{method:'POST',body:'{}'}).catch(()=>[]) : Promise.resolve([])
    ]);
    const commentsRoot=root.querySelector('#wallComments027');
    commentsRoot.innerHTML=(Array.isArray(comments)?comments:[]).map(c=>`<article><strong>${escapeWallHtml(c.user_name||c.user_email)}</strong><p>${escapeWallHtml(c.comment)}</p><small>${formatWallDate(c.created_at,true)}</small></article>`).join('') || '<p class="muted">Nenhum comentário ainda.</p>';
    const counts=(Array.isArray(reactions)?reactions:[]).reduce((a,r)=>(a[r.reaction]=(a[r.reaction]||0)+1,a),{});
    root.querySelector('#wallReactionCounts027').textContent = `👍 ${counts.curtir||0} · 🤝 ${counts.apoio||0} · ⭐ ${counts.importante||0}`;
    const readStats=root.querySelector('#wallReadStats027');
    if(readStats){
        const total=Array.isArray(residents)?residents.length:0;
        const readCount=new Set((Array.isArray(reads)?reads:[]).filter(r=>r.acknowledged!==false).map(r=>String(r.user_email||'').toLowerCase()).filter(Boolean)).size;
        readStats.hidden=!management;
        if(management)readStats.textContent=`${readCount} de ${total} moradores confirmaram a leitura`;
    }
    root.querySelectorAll('[data-wall-reaction]').forEach(btn=>btn.classList.toggle('active',(reactions||[]).some(r=>String(r.user_email).toLowerCase()===email&&r.reaction===btn.dataset.wallReaction)));
}

async function saveWallReaction(reaction) {
    const root=ensureWallInteractionRoot(); const notice=window.communityHub.getWallNoticeById(wallState.selectedNoticeId); if(!notice)return;
    const cep=await resolveWallCep(); const email=String(wallState.currentUser?.email||'').toLowerCase();
    try { await window.supabaseFetch('/wall_reactions?on_conflict=notice_id,user_email',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({notice_id:notice.dbId,cep,user_email:email,reaction})}); await renderWallInteractions(notice); } catch(e){window.showToast?.(e?.message||'Não foi possível reagir.','error');}
}

async function saveWallComment() {
    const root=ensureWallInteractionRoot(); const input=root?.querySelector('#wallCommentInput027'); const notice=window.communityHub.getWallNoticeById(wallState.selectedNoticeId); const comment=String(input?.value||'').trim(); if(!notice||!comment)return;
    try { const cep=await resolveWallCep(); await window.supabaseFetch('/wall_comments',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({notice_id:notice.dbId,cep,user_email:wallState.currentUser.email,user_name:wallState.currentUser.name||'',comment})}); input.value=''; await renderWallInteractions(notice); } catch(e){window.showToast?.(e?.message||'Não foi possível comentar.','error');}
}

async function toggleWallPin() {
    const notice=window.communityHub.getWallNoticeById(wallState.selectedNoticeId); if(!notice)return;
    try { await window.supabaseFetch('/rpc/condomit_set_notice_options',{method:'POST',body:JSON.stringify({target_notice_id:notice.dbId,target_pinned:!notice.is_pinned,target_comments_enabled:null,target_attachment_url:null})}); notice.is_pinned=!notice.is_pinned; await renderWallPage(); await renderWallInteractions(notice); } catch(e){window.showToast?.(e?.message||'Não foi possível fixar o aviso.','error');}
}


function closeWallDetailModal() {
    wallState.selectedNoticeId = null;
    const modal = document.getElementById('wallDetailModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    syncWallModalBodyLock();
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function iconForWallCategory(category) {
    if (category === 'Reservas') return 'fas fa-calendar-check';
    if (category === 'Assembleias') return 'fas fa-users';
    if (category === 'Entregas') return 'fas fa-box-open';
    return 'fas fa-bullhorn';
}

function labelForWallSource(source) {
    if (source === 'ai-comunicados') return 'Comunicado criado com IA';
    if (source === 'role_transfer') return 'Alteração de síndico';
    if (source === 'legacy') return 'Aviso anterior';
    return 'Publicado pelo síndico';
}

function formatWallDate(value, withTime = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('pt-BR', withTime ? {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    } : {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function escapeWallHtml(text) {
    return String(text ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function logout() {
    if (typeof window.performFullLogout === 'function') {
        window.performFullLogout();
        return;
    }
    sessionStorage.removeItem('condominiumUser');
    window.location.href = '../inicio.html';
}
