async function fetchApprovedPayment(email) {
    try {
        const response = await fetch(`/api/pagamento?email=${encodeURIComponent(email)}`);
        if (!response.ok) return null;
        const payments = await response.json();
        return payments.find(p => p.status_pagamento === 'aprovado');
    } catch (error) {
        console.error('Error checking payment:', error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    let currentUser = null;
    try {
        const raw = sessionStorage.getItem('condominiumUser');
        if (raw) currentUser = JSON.parse(raw);
    } catch (_) {}
    if (!currentUser) {
        currentUser = await restorePersistentLogin();
    }
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }

    if (typeof refreshCurrentUserFromDb === 'function') {
        currentUser = await refreshCurrentUserFromDb();
    }

    // Se for síndico, verificar se tem plano ou pagamento aprovado
    if (currentUser.type === 'sindico') {
        const approvedPayment = await fetchApprovedPayment(currentUser.email);
        if (!approvedPayment && !currentUser.plan) {
            window.location.href = 'checkout.html';
            return;
        }
        // Atualizar o usuário com o plano se houver pagamento aprovado
        if (approvedPayment && !currentUser.plan) {
            currentUser.plan = approvedPayment.plano_id;
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
        }
    }

    // Se for morador e não tem o nome do condomínio no sessionStorage, busca via API
    if (currentUser.type === 'morador' && currentUser.condominium?.condominium_id && !currentUser.condominium?.name) {
        try {
            const proxyFetch = async (path, options = {}) => {
                const response = await fetch(path, options);
                const data = await response.json().catch(() => null);
                if (!response.ok) {
                    const message = data?.error || data?.message || response.statusText || 'Erro no servidor';
                    throw new Error(message);
                }
                return data;
            };

            const condominiumResponse = await proxyFetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(currentUser.condominium.condominium_id)}`
            );

            if (condominiumResponse && condominiumResponse.length > 0) {
                currentUser.condominium.name = condominiumResponse[0].condominium_name;
                sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
            }
        } catch (error) {
            console.error('Erro ao buscar nome do condomínio:', error);
        }
    }

    updateUIWithUserData(currentUser);
    initPreferences();
    initEditProfileModal();

    const params = new URLSearchParams(window.location.search || '');
    const openTarget = params.get('open') || '';
    const hashTarget = String(window.location.hash || '').replace('#', '');

    if (openTarget === 'editar-perfil' || openTarget === 'perfil' || hashTarget === 'editar-perfil') {
        try { openConfigSection('editar-perfil'); } catch (_) {}
    }
});

function getCurrentUser() {
    try {
        const raw = sessionStorage.getItem('condominiumUser');
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
}

function setCurrentUser(user) {
    try {
        sessionStorage.setItem('condominiumUser', JSON.stringify(user));
        if (user && user.email) {
            const persistent = { email: user.email, name: user.name || null, type: user.type || null, t: Date.now() };
            localStorage.setItem('condominiumPersistentUser', JSON.stringify(persistent));
        }
    } catch (_) {}
    updateUIWithUserData(user);
    if (typeof syncAllAvatars === 'function') syncAllAvatars(user);
}

async function restorePersistentLogin() {
    try {
        const inSession = getCurrentUser();
        if (inSession && inSession.email) return inSession;
    } catch (_) {}
    try {
        const raw = localStorage.getItem('condominiumPersistentUser');
        if (!raw) return null;
        const persist = JSON.parse(raw);
        if (!persist || !persist.email) return null;
        if (typeof fetchUserByEmail !== 'function') return null;
        const fresh = await fetchUserByEmail(persist.email).catch(() => null);
        if (!fresh) {
            localStorage.removeItem('condominiumPersistentUser');
            return null;
        }
        const user = { ...fresh, password: fresh.password || null };
        try { sessionStorage.setItem('condominiumUser', JSON.stringify(user)); } catch(_) {}
        if (typeof syncAllAvatars === 'function') syncAllAvatars(user);
        return user;
    } catch (_) {
        return null;
    }
}

function clearLoginPersistent() {
    try { sessionStorage.removeItem('condominiumUser'); } catch(_) {}
    try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
}

function updateUIWithUserData(currentUser) {
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const normalizedUserType = typeof getNormalizedUserType === 'function'
        ? getNormalizedUserType(currentUser)
        : String(currentUser.type || '').trim().toLowerCase();
    const userTypeLabel = normalizedUserType === 'sindico'
        ? 'Síndico'
        : normalizedUserType === 'porteiro'
            ? 'Porteiro'
            : 'Morador';

    // Top bar avatar
    const topAvatar = document.getElementById('user-avatar-top');
    if (topAvatar) {
        if (currentUser.profilePhoto) {
            topAvatar.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Avatar" />`;
            topAvatar.style.background = 'none';
        } else {
            topAvatar.textContent = initials;
            topAvatar.style.background = '';
        }
    }

    // Top bar user info
    const topName = document.getElementById('user-name-top');
    const topType = document.getElementById('user-type-top');

    if (topName) topName.textContent = currentUser.name;
    if (topType) topType.textContent = userTypeLabel;

    // Profile preview card
    const cardName = document.getElementById('profile-name-card');
    const cardType = document.getElementById('profile-type-card');
    const cardEmail = document.getElementById('profile-email-card');
    const cardAvatar = document.getElementById('profile-avatar-card');

    if (cardName) cardName.textContent = currentUser.name;
    if (cardType) cardType.textContent = userTypeLabel;
    if (cardEmail) cardEmail.textContent = currentUser.email || 'Não informado';

    if (cardAvatar) {
        if (currentUser.profilePhoto) {
            cardAvatar.innerHTML = `<img src="${currentUser.profilePhoto}" alt="Avatar" />`;
            cardAvatar.style.background = 'none';
        } else {
            cardAvatar.textContent = initials;
            cardAvatar.style.background = '';
        }
    }

    // Profile details list
    const fullNameEl = document.getElementById('detail-full-name');
    const unitEl = document.getElementById('detail-unit');
    const typeEl = document.getElementById('detail-user-type');
    const emailEl = document.getElementById('detail-email');
    const phoneEl = document.getElementById('detail-phone');

    if (fullNameEl) fullNameEl.textContent = currentUser.name;
    if (typeEl) typeEl.textContent = userTypeLabel;
    if (emailEl) emailEl.textContent = currentUser.email || 'Não informado';
    if (phoneEl) phoneEl.textContent = currentUser.phone || 'Não informado';

    if (unitEl) {
        if (normalizedUserType === 'sindico') {
            unitEl.textContent = 'Administração';
        } else if (normalizedUserType === 'porteiro') {
            unitEl.textContent = 'Portaria';
        } else {
            const apt = currentUser.condominium?.apartment || '---';
            const bloco = currentUser.condominium?.block || '---';
            unitEl.textContent = `Apt ${apt} - Bloco ${bloco}`;
        }
    }

    // Sidebar condo name
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

    const inicioLink = document.getElementById('inicio-link');
    if (inicioLink) {
        const userType = (currentUser.type || '').toLowerCase();
        const targetPage = userType === 'morador'
            ? 'index-morador.html'
            : (userType === 'porteiro' ? 'index-porteiro.html' : 'index.html');
        inicioLink.href = targetPage;
        inicioLink.addEventListener('click', function(event) {
            event.preventDefault();
            window.location.href = targetPage;
        });
    }
}

function logout() {
    if (confirm(cfgT('confirm_logout'))) {
        sessionStorage.removeItem('condominiumUser');
        try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
        window.location.href = '../inicio.html';
    }
}

function openConfigSection(sectionKey) {
    if (sectionKey === 'foto-de-perfil') {
        if (window.profilePhotoEditor && typeof window.profilePhotoEditor.open === 'function') {
            window.profilePhotoEditor.open();
        } else {
            console.warn('ProfilePhotoEditor não carregado; abrindo input de fallback.');
            document.getElementById('profile-photo-input')?.click();
        }
        return;
    }
    switch (sectionKey) {
        case 'editar-perfil':
        case 'dados-pessoais':
            if (typeof openEditProfileModal === 'function') {
                openEditProfileModal();
            } else {
                alert('Editor de perfil está carregando...');
            }
            break;
        case 'alterar-senha':
            if (confirm(cfgT('confirm_change_password'))) {
                window.location.href = 'redefinir-senha.html?source=configuracoes';
            }
            break;
        case 'controle-acesso':
            openVisitorAccessModal();
            break;
        case 'minha-unidade':
        case 'meus-condominos':
        case 'autenticacao-2fa':
        case 'comunicados-sindico':
        case 'avisos-gerais':
        case 'reserva-areas':
        case 'encomendas':
        case 'lembretes-reserva':
        case 'confirmacao-cancelamento':
        case 'reserva-area-comum':
        case 'politica-privacidade':
        case 'termos-uso':
        case 'consentimentos':
        case 'contato-uteis':
        case 'prestadores-servicos':
        case 'sobre-empresa':
        case 'versao-app':
        case 'novas-atualizacoes':
            alert(`Funcionalidade ainda não implementada: ${sectionKey.replace(/-/g, ' ')}`);
            break;
        case 'minhas-reservas':
            openReservationsModal();
            break;
        case 'info-condominio':
            openCondominiumInfoModal();
            break;
        default:
            console.warn('Seção desconhecida de configurações:', sectionKey);
    }
}

function closeEditProfileModal() {
    const m = document.getElementById('edit-profile-modal');
    if (m) m.style.display = 'none';
}

function openEditProfileModal() {
    const user = getCurrentUser();
    if (!user) return;

    let modal = document.getElementById('edit-profile-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-profile-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML = `
            <div class="edit-profile-modal-content" style="position:relative;background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
                <div style="flex-shrink:0;padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;">
                    <h3 style="margin:0;font-size:1.15rem;color:#111827;">${cfgT('edit_profile_title')}</h3>
                    <button type="button" id="ep-close" style="background:transparent;border:none;font-size:1.25rem;cursor:pointer;color:#6b7280;padding:4px 8px;border-radius:6px;">✕</button>
                </div>
                <div class="ep-body" style="flex:1 1 auto;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:18px;">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div id="ep-avatar-preview" class="ep-avatar-preview" style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.5rem;overflow:hidden;flex-shrink:0;"></div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <button type="button" id="ep-choose-photo" class="btn-edit-profile" style="margin:0;padding:8px 14px;font-size:0.9rem;">${cfgT('change_photo')}</button>
                            <span style="font-size:0.8rem;color:#6b7280;">${cfgT('photo_hint')}</span>
                            <input type="file" id="ep-photo-input" accept="image/jpeg,image/jpg,image/png,image/webp" style="display:none;" />
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label for="ep-name" style="font-size:0.85rem;font-weight:600;color:#374151;">${cfgT('full_name')}</label>
                        <input type="text" id="ep-name" style="padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;outline:none;" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label for="ep-email" style="font-size:0.85rem;font-weight:600;color:#374151;">E-mail</label>
                        <input type="email" id="ep-email" style="padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;outline:none;" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label for="ep-phone" style="font-size:0.85rem;font-weight:600;color:#374151;">${cfgT('phone_mobile')}</label>
                        <input type="tel" id="ep-phone" placeholder="(11) 90000-0000" style="padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;outline:none;" />
                    </div>
                    <p id="ep-message" style="margin:0;font-size:0.85rem;display:none;padding:10px 12px;border-radius:8px;"></p>
                </div>
                <div style="flex-shrink:0;padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:12px;">
                    <button type="button" id="ep-cancel" class="btn-edit-profile" style="margin:0;padding:10px 18px;">${cfgT('cancel')}</button>
                    <button type="button" id="ep-save" class="btn-edit-profile" style="margin:0;padding:10px 22px;background:#1d4ed8 !important;color:#fff !important;border-color:#1d4ed8 !important;">${cfgT('save')}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#ep-close').addEventListener('click', closeEditProfileModal);
        modal.querySelector('#ep-cancel').addEventListener('click', closeEditProfileModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeEditProfileModal(); });
        modal.querySelector('#ep-save').addEventListener('click', saveProfileChanges);

        const photoBtn = modal.querySelector('#ep-choose-photo');
        const photoInput = modal.querySelector('#ep-photo-input');
        photoBtn.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', handleEditProfilePhotoChange);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') closeEditProfileModal();
        });
    }

    const nameEl = modal.querySelector('#ep-name');
    const emailEl = modal.querySelector('#ep-email');
    const phoneEl = modal.querySelector('#ep-phone');
    const msgEl = modal.querySelector('#ep-message');
    nameEl.value = user.name || '';
    emailEl.value = user.email || '';
    phoneEl.value = user.phone || '';
    msgEl.style.display = 'none';

    const photoInput = modal.querySelector('#ep-photo-input');
    photoInput.value = '';

    renderEditProfileAvatarPreview(user.profilePhoto, user.name);

    modal.style.display = 'flex';
}

window.openEditProfileModal = openEditProfileModal;
window.closeEditProfileModal = closeEditProfileModal;

function renderEditProfileAvatarPreview(photoUrl, fallbackName) {
    const preview = document.getElementById('ep-avatar-preview');
    if (!preview) return;
    if (photoUrl) {
        preview.innerHTML = `<img src="${photoUrl}" alt="Foto de perfil" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
        const initials = (fallbackName || 'US').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        preview.innerHTML = '';
        preview.textContent = initials;
    }
}

async function handleEditProfilePhotoChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        setEditProfileMessage('Formato inválido. Use JPG, PNG ou WebP.', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        setEditProfileMessage('Arquivo muito grande (max. 10 MB).', 'error');
        return;
    }
    try {
        const dataUrl = await fileToCompressedDataUrl(file, 512, 'image/png', 0.92);
        renderEditProfileAvatarPreview(dataUrl);
        const modal = document.getElementById('edit-profile-modal');
        if (modal) modal.dataset._pendingPhoto = dataUrl;
    } catch (err) {
        console.error(err);
        setEditProfileMessage('Não foi possível processar a imagem.', 'error');
    }
}

function setEditProfileMessage(text, kind) {
    const msg = document.getElementById('ep-message');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = 'block';
    if (kind === 'error') {
        msg.style.background = '#fef2f2';
        msg.style.color = '#b91c1c';
    } else if (kind === 'success') {
        msg.style.background = '#ecfdf5';
        msg.style.color = '#065f46';
    } else {
        msg.style.background = '#eff6ff';
        msg.style.color = '#1e40af';
    }
}

function fileToCompressedDataUrl(file, maxSize = 512, type = 'image/png', quality = 0.92) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read_fail'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('image_fail'));
            img.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL(type, quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function saveProfileChanges() {
    const user = getCurrentUser();
    if (!user) return;
    const nameEl = document.getElementById('ep-name');
    const emailEl = document.getElementById('ep-email');
    const phoneEl = document.getElementById('ep-phone');
    const modal = document.getElementById('edit-profile-modal');
    const saveBtn = document.getElementById('ep-save');

    const newName = (nameEl.value || '').trim();
    const newEmail = (emailEl.value || '').trim().toLowerCase();
    const newPhone = (phoneEl.value || '').trim();
    const pendingPhoto = modal ? modal.dataset._pendingPhoto || null : null;

    if (!newName) return setEditProfileMessage('Informe o nome.', 'error');
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return setEditProfileMessage('Informe um e-mail válido.', 'error');
    }

    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.6';
    setEditProfileMessage('Salvando...', 'info');

    try {
        const hasEmailChanged = newEmail !== (user.email || '').toLowerCase();
        if (hasEmailChanged) {
            const existing = await fetchUserByEmail(newEmail).catch(() => null);
            if (existing) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '';
                return setEditProfileMessage('Este e-mail já está sendo usado por outra conta.', 'error');
            }
        }

        const patchPayload = {
            name: newName,
            email: newEmail,
            phone: newPhone
        };
        if (pendingPhoto) patchPayload.profilePhoto = pendingPhoto;

        const patchTarget = hasEmailChanged ? user.email : newEmail;
        let updatedRecord = await updateUserByEmail(patchTarget, patchPayload);
        if (!updatedRecord || (hasEmailChanged && updatedRecord && updatedRecord.email !== newEmail)) {
            if (hasEmailChanged) {
                try {
                    await updateUserByEmail(user.email, { ...patchPayload, email: newEmail });
                } catch (_) {}
                try {
                    updatedRecord = await fetchUserByEmail(newEmail);
                } catch (_) {}
            }
        }

        const mergedUser = { ...user, ...(updatedRecord || patchPayload), email: newEmail };
        if (pendingPhoto) mergedUser.profilePhoto = pendingPhoto;
        else if (updatedRecord && updatedRecord.profilePhoto) mergedUser.profilePhoto = updatedRecord.profilePhoto;
        setCurrentUser(mergedUser);

        if (pendingPhoto && typeof profilePhotoEditor !== 'undefined' && profilePhotoEditor && typeof profilePhotoEditor.addToRecentAvatars === 'function') {
            try { profilePhotoEditor.addToRecentAvatars(pendingPhoto); } catch (_) {}
        }

        renderEditProfileAvatarPreview(mergedUser.profilePhoto, mergedUser.name);
        if (modal) delete modal.dataset._pendingPhoto;

        setEditProfileMessage('Perfil atualizado com sucesso!', 'success');
        setTimeout(() => {
            closeEditProfileModal();
        }, 900);
    } catch (err) {
        console.error('Erro ao salvar perfil:', err);
        setEditProfileMessage('Não foi possível salvar as alterações. Tente novamente.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '';
    }
}

function initEditProfileModal() {
    window.openConfigSection = (function (original) {
        return function(sectionKey) {
            if (sectionKey === 'foto-de-perfil') {
                if (window.profilePhotoEditor) window.profilePhotoEditor.open();
                else document.getElementById('profile-photo-input')?.click();
                return;
            }
            return original.apply(this, arguments);
        };
    })(window.openConfigSection || openConfigSection);
}

function setTheme(theme) {
    if (typeof applyTheme === 'function') {
        applyTheme(theme);
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app-theme', theme);
        updateControlButtons('theme', theme);
    }
}

function setFontSize(size) {
    if (typeof applyFontSize === 'function') {
        applyFontSize(size);
    } else {
        document.documentElement.setAttribute('data-font', size);
        localStorage.setItem('app-font-size', size);
        updateControlButtons('font', size);
    }
}

function setLanguage(lang) {
    localStorage.setItem('app-language', lang);
    if (typeof window.applyGlobalAppLanguage === 'function') {
        window.applyGlobalAppLanguage(lang);
    }
    applyTranslations(lang);
}

function getConfigLocale() {
    return localStorage.getItem('app-language') || 'pt';
}

function cfgT(key) {
    const lang = getConfigLocale();
    return translations[lang]?.[key] ?? translations.pt?.[key] ?? key;
}

async function fetchCurrentUserReservations() {
    const currentUser = getCurrentUser();
    if (!currentUser?.email) return [];

    try {
        const response = await fetch('/api/reserva');
        if (!response.ok) {
            throw new Error('Não foi possível carregar as reservas.');
        }

        const reservations = await response.json();
        return (Array.isArray(reservations) ? reservations : [])
            .filter((reservation) => String(reservation.email || '').toLowerCase() === String(currentUser.email).toLowerCase())
            .sort((a, b) => {
                const aDate = new Date(`${a.data_reserva || ''}T${a.horario_inicio || '00:00:00'}`).getTime();
                const bDate = new Date(`${b.data_reserva || ''}T${b.horario_inicio || '00:00:00'}`).getTime();
                return bDate - aDate;
            });
    } catch (error) {
        console.error('Erro ao carregar reservas do usuário:', error);
        throw error;
    }
}

function ensureReservationsModal() {
    const modal = document.getElementById('reservasModal');
    if (!modal || modal.dataset.bound === 'true') return modal;

    document.getElementById('reservasModalClose')?.addEventListener('click', closeReservationsModal);
    document.getElementById('reservasModalAction')?.addEventListener('click', () => {
        window.location.href = 'reservas.html';
    });
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeReservationsModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeReservationsModal();
        }
    });
    modal.dataset.bound = 'true';
    return modal;
}

async function openReservationsModal() {
    const modal = ensureReservationsModal();
    const body = document.getElementById('reservasModalBody');
    if (!modal || !body) return;

    body.innerHTML = `
        <div class="reservas-empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${escapeReservationHtml(cfgT('reservations_loading'))}</p>
        </div>
    `;
    modal.classList.add('open');

    try {
        const reservations = await fetchCurrentUserReservations();
        renderReservationsModal(reservations);
    } catch (error) {
        body.innerHTML = `
            <div class="reservas-empty-state">
                <i class="fas fa-circle-exclamation"></i>
                <p>${escapeReservationHtml(cfgT('reservations_error'))}</p>
            </div>
        `;
    }
}

function closeReservationsModal() {
    document.getElementById('reservasModal')?.classList.remove('open');
}

function renderReservationsModal(reservations) {
    const body = document.getElementById('reservasModalBody');
    if (!body) return;

    if (!reservations.length) {
        body.innerHTML = `
            <div class="reservas-empty-state">
                <i class="fas fa-calendar-xmark"></i>
                <p>${escapeReservationHtml(cfgT('reservations_empty'))}</p>
            </div>
        `;
        return;
    }

    body.innerHTML = reservations.map((reservation) => {
        const date = formatReservationDate(reservation.data_reserva);
        const time = `${formatReservationTime(reservation.horario_inicio)} - ${formatReservationTime(reservation.horario_fim)}`;
        const statusClass = String(reservation.status || '').toLowerCase();
        const statusLabel = getReservationStatusLabel(reservation.status);

        return `
            <article class="reserva-item-card">
                <div class="reserva-item-top">
                    <div>
                        <h4>${escapeReservationHtml(reservation.nome_local || 'Área comum')}</h4>
                        <p>Reserva feita com a conta ${escapeReservationHtml(reservation.email || '')}</p>
                    </div>
                    <span class="reserva-status-badge ${statusClass}">
                        <i class="fas fa-circle"></i>
                        ${statusLabel}
                    </span>
                </div>
                <div class="reserva-item-meta">
                    <span><i class="fas fa-calendar-day"></i>${date}</span>
                    <span><i class="fas fa-clock"></i>${time}</span>
                </div>
            </article>
        `;
    }).join('');
}

function formatReservationDate(value) {
    if (!value) return 'Data não informada';
    const date = new Date(`${value}T00:00:00`);
    return isNaN(date.getTime())
        ? 'Data não informada'
        : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatReservationTime(value) {
    if (!value) return '--:--';
    return String(value).slice(0, 5);
}

function getReservationStatusLabel(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'indisponivel') return 'Confirmada';
    if (normalized === 'disponivel') return 'Disponível';
    return status || 'Em processamento';
}

function escapeReservationHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function ensureCondominiumModal() {
    const modal = document.getElementById('condominioModal');
    if (!modal || modal.dataset.bound === 'true') return modal;

    document.getElementById('condominioModalClose')?.addEventListener('click', closeCondominiumInfoModal);
    document.getElementById('condominioModalAction')?.addEventListener('click', closeCondominiumInfoModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeCondominiumInfoModal();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeCondominiumInfoModal();
        }
    });
    modal.dataset.bound = 'true';
    return modal;
}

async function openCondominiumInfoModal() {
    const modal = ensureCondominiumModal();
    const body = document.getElementById('condominioModalBody');
    if (!modal || !body) return;

    body.innerHTML = `
        <div class="reservas-empty-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>${escapeReservationHtml(cfgT('condo_loading'))}</p>
        </div>
    `;
    modal.classList.add('open');

    try {
        const condominium = await fetchCurrentCondominiumInfo();
        renderCondominiumInfoModal(condominium);
    } catch (error) {
        console.error('Erro ao carregar informações do condomínio:', error);
        body.innerHTML = `
            <div class="reservas-empty-state">
                <i class="fas fa-circle-exclamation"></i>
                <p>${escapeReservationHtml(cfgT('condo_error'))}</p>
            </div>
        `;
    }
}

function closeCondominiumInfoModal() {
    document.getElementById('condominioModal')?.classList.remove('open');
}

let visitorAccessFormBound = false;

function ensureVisitorAccessModal() {
    const modal = document.getElementById('visitorAccessModal');
    if (!modal) return null;

    if (modal.dataset.bound !== 'true') {
        document.getElementById('visitorAccessModalClose')?.addEventListener('click', closeVisitorAccessModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeVisitorAccessModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('open')) {
                closeVisitorAccessModal();
            }
        });
        modal.dataset.bound = 'true';
    }

    if (!visitorAccessFormBound && window.visitorRegistration) {
        const form = document.getElementById('visitorAccessForm');
        const currentUser = getCurrentUser();
        if (form && currentUser) {
            window.visitorRegistration.initForm(form, {
                currentUser,
                lockResponsibleToCurrentUser: true,
                onCancel: closeVisitorAccessModal
            });
            visitorAccessFormBound = true;
        }
    }

    return modal;
}

function openVisitorAccessModal() {
    const modal = ensureVisitorAccessModal();
    if (!modal) return;
    const form = document.getElementById('visitorAccessForm');
    const currentUser = getCurrentUser();
    form?.reset();
    if (form && currentUser && window.visitorRegistration?.syncLockedResponsible) {
        window.visitorRegistration.syncLockedResponsible(form, currentUser);
    }
    const feedback = form?.querySelector('[data-role="visitor-feedback"]');
    if (feedback) {
        feedback.textContent = '';
        feedback.dataset.state = 'info';
        feedback.style.display = 'none';
    }
    modal.classList.add('open');
}

function closeVisitorAccessModal() {
    document.getElementById('visitorAccessModal')?.classList.remove('open');
}

async function fetchCurrentCondominiumInfo() {
    const currentUser = getCurrentUser();
    const localCondo = currentUser?.condominium && typeof currentUser.condominium === 'object'
        ? currentUser.condominium
        : {};
    const cep = localCondo.cep || localCondo.condominium_id || localCondo.condominiumId || currentUser?.cep || '';

    if (!cep) return localCondo;

    try {
        const response = await fetch(`/api/condominiums?cep=eq.${encodeURIComponent(cep)}`);
        if (!response.ok) throw new Error('Falha ao consultar condomínio.');
        const data = await response.json();
        const fromApi = Array.isArray(data) ? data[0] : data;
        const condominium = { ...localCondo, ...(fromApi || {}), cep };
        const manager = await fetchCurrentCondominiumManager(condominium, currentUser);
        return mergeCondominiumManagerInfo(condominium, manager);
    } catch (_) {
        const condominium = { ...localCondo, cep };
        const manager = await fetchCurrentCondominiumManager(condominium, currentUser);
        return mergeCondominiumManagerInfo(condominium, manager);
    }
}

async function fetchCurrentCondominiumManager(condominium, currentUser = getCurrentUser()) {
    if (typeof supabaseFetch !== 'function') return null;

    const normalizedCondoIdentifiers = getCondominiumIdentifiersForModal(condominium, currentUser);
    if (!normalizedCondoIdentifiers.length) return null;

    try {
        const users = await supabaseFetch('/users?select=name,phone,email,type,user_type,condominium');
        if (!Array.isArray(users)) return null;

        return users.find((user) => {
            const userType = String(user?.type || user?.user_type || '').trim().toLowerCase();
            if (userType !== 'sindico') return false;

            const userIdentifiers = getCondominiumIdentifiersForModal(user?.condominium, user);
            return userIdentifiers.some((identifier) => normalizedCondoIdentifiers.includes(identifier));
        }) || null;
    } catch (error) {
        console.error('Erro ao buscar síndico responsável do condomínio:', error);
        return null;
    }
}

function getCondominiumIdentifiersForModal(condominium, user) {
    const condoObject = condominium && typeof condominium === 'object' ? condominium : {};
    const identifiers = [
        condoObject?.cep,
        condoObject?.condominium_cep,
        condoObject?.condominium_id,
        condoObject?.condominiumId,
        user?.cep,
        user?.condominium_cep,
        user?.condominium_id,
        user?.condominiumId
    ]
        .map((value) => String(value || '').replace(/\D/g, ''))
        .filter(Boolean);

    return [...new Set(identifiers)];
}

function mergeCondominiumManagerInfo(condominium, manager) {
    if (!manager) return condominium;

    return {
        ...condominium,
        manager_name: manager?.name || condominium?.manager_name || condominium?.syndic_name || '',
        syndic_name: manager?.name || condominium?.syndic_name || condominium?.manager_name || '',
        contact_phone: manager?.phone || condominium?.contact_phone || condominium?.phone || '',
        phone: manager?.phone || condominium?.phone || condominium?.contact_phone || '',
        manager_email: manager?.email || condominium?.manager_email || ''
    };
}

function renderCondominiumInfoModal(condominium) {
    const body = document.getElementById('condominioModalBody');
    if (!body) return;

    const managerName = condominium?.manager_name || condominium?.syndic_name || cfgT('not_informed');
    const managerContact = condominium?.contact_phone || condominium?.phone || cfgT('not_informed');

    const items = [
        [cfgT('condo_name'), condominium?.condominium_name || condominium?.name || cfgT('not_informed')],
        [cfgT('condo_identifier'), condominium?.cep || condominium?.condominium_id || condominium?.condominiumId || cfgT('not_informed')],
        [cfgT('condo_address'), condominium?.address || condominium?.logradouro || cfgT('not_informed')],
        [cfgT('condo_city_state'), buildCityStateLabel(condominium)],
        [cfgT('condo_block'), condominium?.block || cfgT('not_informed')],
        [cfgT('condo_apartment'), condominium?.apartment || cfgT('not_informed')],
        [cfgT('condo_manager'), managerName],
        [cfgT('condo_contact'), managerContact]
    ];

    body.innerHTML = `
        <div class="condominio-info-grid">
            ${items.map(([label, value]) => `
                <article class="condominio-info-item">
                    <span>${escapeReservationHtml(label)}</span>
                    <strong>${escapeReservationHtml(value)}</strong>
                </article>
            `).join('')}
        </div>
    `;
}

function buildCityStateLabel(condominium) {
    const city = condominium?.city || condominium?.cidade || '';
    const state = condominium?.state || condominium?.estado || condominium?.uf || '';
    const label = [city, state].filter(Boolean).join(' / ');
    return label || cfgT('not_informed');
}

const translations = {
    pt: {
        config_title: 'Configurações',
        config_subtitle: 'Personalize e gerencie as configurações do sistema',
        user_profile: 'Perfil do usuário',
        edit: 'Editar',
        logout: 'Sair da Conta',
        delete_account: 'Excluir Conta',
        account_profile: 'Conta e Perfil',
        personal_data: 'Dados pessoais',
        my_unit: 'Minha unidade',
        my_housemates: 'Meus condôminos',
        profile_photo: 'Foto de perfil',
        security: 'Segurança e acesso',
        change_password: 'Alterar senha',
        two_factor_auth: 'Autenticação de dois fatores',
        access_control: 'Controle de acesso',
        notifications: 'Notificações',
        syndic_messages: 'Comunicados do síndico',
        general_notices: 'Avisos gerais do condomínio',
        common_areas_reservation: 'Reserva de áreas comuns',
        packages_mail: 'Encomendas e correspondências',
        reservations_title: 'Reserva e áreas comuns',
        my_reservations: 'Minhas reservas',
        reservation_reminders: 'Lembretes da reserva',
        cancel_confirmation: 'Confirmação/lembrete cancelamento',
        reserve_common_area: 'Reserva da área comum',
        privacy: 'Privacidade',
        privacy_policy: 'Política de privacidade',
        terms_of_use: 'Termos de uso',
        manage_consents: 'Gerenciar consentimentos',
        condominium: 'Condomínio',
        condominium_info: 'Informações do condomínio',
        useful_contacts: 'Contato úteis',
        service_providers: 'Prestadores de serviços',
        appearance_accessibility: 'Aparência e acessibilidade',
        theme_label: 'Tema',
        theme_light: 'Claro',
        theme_dark: 'Escuro',
        font_size_label: 'Tamanho da fonte',
        font_medium: 'médio',
        language_label: 'Idioma',
        about: 'Sobre',
        about_company: 'Sobre a empresa',
        app_version: 'Versão do app: 1.0.0',
        updates: 'Verifique novas atualizações',
        footer_condo: '© 2026 condomínio tal.',
        footer_rights: 'Todos os direitos reservados',
        reservations_modal_title: 'Minhas reservas',
        reservations_modal_subtitle: 'Veja todas as reservas feitas na sua conta.',
        reservations_modal_action: 'Ir para reservas',
        condo_modal_title: 'Informações do condomínio',
        condo_modal_subtitle: 'Veja os dados cadastrados do seu condomínio.',
        modal_close: 'Fechar',
        confirm_logout: 'Tem certeza que deseja sair da conta?',
        confirm_change_password: 'Deseja alterar a sua senha agora?',
        edit_profile_title: 'Editar perfil',
        change_photo: 'Alterar foto',
        photo_hint: 'Use JPG, PNG ou WebP (até 10 MB)',
        full_name: 'Nome completo',
        phone_mobile: 'Telefone / Celular',
        cancel: 'Cancelar',
        save: 'Salvar',
        delete_modal_title: 'Excluir minha conta',
        delete_modal_subtitle: 'Esta ação é irreversível. Leia com atenção antes de continuar.',
        delete_modal_label: 'Para confirmar, digite abaixo:',
        delete_keyword: 'EXCLUIR',
        delete_permanent: 'Excluir permanentemente',
        delete_warning_account: 'Sua conta será permanentemente removida e não pode ser recuperada.',
        delete_warning_condo: 'O condomínio cadastrado por você também será excluído permanentemente.',
        delete_warning_residents: 'Dados de moradores e configurações do condomínio serão removidos.',
        delete_warning_link: 'Seu vínculo com o condomínio será desfeito imediatamente.',
        delete_warning_history: 'Pagamentos e histórico não serão reembolsados automaticamente.',
        language_option_pt: 'Português',
        language_option_en: 'English',
        reservations_loading: 'Carregando suas reservas...',
        reservations_error: 'Não foi possível carregar suas reservas agora.',
        reservations_empty: 'Você ainda não fez nenhuma reserva.',
        condo_loading: 'Carregando informações do condomínio...',
        condo_error: 'Não foi possível carregar as informações do condomínio.',
        condo_name: 'Nome do condomínio',
        condo_identifier: 'CEP / Identificador',
        condo_address: 'Endereço',
        condo_city_state: 'Cidade / Estado',
        condo_block: 'Bloco',
        condo_apartment: 'Apartamento',
        condo_manager: 'Síndico responsável',
        condo_contact: 'Contato',
        not_informed: 'Não informado'
    },
    en: {
        config_title: 'Settings',
        config_subtitle: 'Customize and manage system settings',
        user_profile: 'User Profile',
        edit: 'Edit',
        logout: 'Sign Out',
        delete_account: 'Delete Account',
        account_profile: 'Account and Profile',
        personal_data: 'Personal Data',
        my_unit: 'My Unit',
        my_housemates: 'My Housemates',
        profile_photo: 'Profile Photo',
        security: 'Security and Access',
        change_password: 'Change Password',
        two_factor_auth: 'Two-Factor Authentication',
        access_control: 'Access Control',
        notifications: 'Notifications',
        syndic_messages: 'Syndic Messages',
        general_notices: 'General Condominium Notices',
        common_areas_reservation: 'Common Area Reservations',
        packages_mail: 'Packages and Mail',
        reservations_title: 'Reservations and Common Areas',
        my_reservations: 'My Reservations',
        reservation_reminders: 'Reservation Reminders',
        cancel_confirmation: 'Cancellation Reminder/Confirmation',
        reserve_common_area: 'Reserve Common Area',
        privacy: 'Privacy',
        privacy_policy: 'Privacy Policy',
        terms_of_use: 'Terms of Use',
        manage_consents: 'Manage Consents',
        condominium: 'Condominium',
        condominium_info: 'Condominium Information',
        useful_contacts: 'Useful Contacts',
        service_providers: 'Service Providers',
        appearance_accessibility: 'Appearance and Accessibility',
        theme_label: 'Theme',
        theme_light: 'Light',
        theme_dark: 'Dark',
        font_size_label: 'Font Size',
        font_medium: 'medium',
        language_label: 'Language',
        about: 'About',
        about_company: 'About the Company',
        app_version: 'App version: 1.0.0',
        updates: 'Check for updates',
        footer_condo: '© 2026 sample condominium.',
        footer_rights: 'All rights reserved',
        reservations_modal_title: 'My Reservations',
        reservations_modal_subtitle: 'See all reservations made on your account.',
        reservations_modal_action: 'Go to reservations',
        condo_modal_title: 'Condominium Information',
        condo_modal_subtitle: 'See all registered condominium details.',
        modal_close: 'Close',
        confirm_logout: 'Are you sure you want to sign out?',
        confirm_change_password: 'Do you want to change your password now?',
        edit_profile_title: 'Edit Profile',
        change_photo: 'Change Photo',
        photo_hint: 'Use JPG, PNG or WebP (up to 10 MB)',
        full_name: 'Full Name',
        phone_mobile: 'Phone / Mobile',
        cancel: 'Cancel',
        save: 'Save',
        delete_modal_title: 'Delete My Account',
        delete_modal_subtitle: 'This action cannot be undone. Read carefully before continuing.',
        delete_modal_label: 'To confirm, type below:',
        delete_keyword: 'DELETE',
        delete_permanent: 'Delete permanently',
        delete_warning_account: 'Your account will be permanently removed and cannot be recovered.',
        delete_warning_condo: 'The condominium you registered will also be permanently deleted.',
        delete_warning_residents: 'Resident data and condominium settings will be removed.',
        delete_warning_link: 'Your association with the condominium will be removed immediately.',
        delete_warning_history: 'Payments and history will not be automatically refunded.',
        language_option_pt: 'Portuguese',
        language_option_en: 'English',
        reservations_loading: 'Loading your reservations...',
        reservations_error: 'We could not load your reservations right now.',
        reservations_empty: 'You have not made any reservations yet.',
        condo_loading: 'Loading condominium details...',
        condo_error: 'We could not load the condominium information.',
        condo_name: 'Condominium Name',
        condo_identifier: 'ZIP / Identifier',
        condo_address: 'Address',
        condo_city_state: 'City / State',
        condo_block: 'Block',
        condo_apartment: 'Apartment',
        condo_manager: 'Responsible Manager',
        condo_contact: 'Contact',
        not_informed: 'Not informed'
    }
};

function applyText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
}

function applyTranslations(lang) {
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';

    applyText('.top-bar-left h1', translations[lang].config_title);
    applyText('.top-bar-left p', translations[lang].config_subtitle);

    const cardTitles = document.querySelectorAll('.config-card > h3');
    const titleKeys = [
        'user_profile',
        'account_profile',
        'security',
        'notifications',
        'reservations_title',
        'privacy',
        'condominium',
        'appearance_accessibility',
        'about'
    ];
    cardTitles.forEach((title, index) => {
        const key = titleKeys[index];
        if (key && translations[lang][key]) title.textContent = translations[lang][key];
    });

    applyText('.profile-card-actions .btn-edit-profile', translations[lang].edit);
    applyText('#btn-logout-main', translations[lang].logout);
    applyText('.btn-delete-account', translations[lang].delete_account);

    const selectorMap = {
        '[onclick="openConfigSection(\'dados-pessoais\')"] span': 'personal_data',
        '[onclick="openConfigSection(\'minha-unidade\')"] span': 'my_unit',
        '[onclick="openConfigSection(\'meus-condominos\')"] span': 'my_housemates',
        '[onclick="openConfigSection(\'foto-de-perfil\')"] span': 'profile_photo',
        '[onclick="openConfigSection(\'alterar-senha\')"] span': 'change_password',
        '[onclick="openConfigSection(\'autenticacao-2fa\')"] span': 'two_factor_auth',
        '[onclick="openConfigSection(\'controle-acesso\')"] span': 'access_control',
        '[onclick="openConfigSection(\'comunicados-sindico\')"] span': 'syndic_messages',
        '[onclick="openConfigSection(\'avisos-gerais\')"] span': 'general_notices',
        '[onclick="openConfigSection(\'reserva-areas\')"] span': 'common_areas_reservation',
        '[onclick="openConfigSection(\'encomendas\')"] span': 'packages_mail',
        '[onclick="openConfigSection(\'minhas-reservas\')"] span': 'my_reservations',
        '[onclick="openConfigSection(\'lembretes-reserva\')"] span': 'reservation_reminders',
        '[onclick="openConfigSection(\'confirmacao-cancelamento\')"] span': 'cancel_confirmation',
        '[onclick="openConfigSection(\'reserva-area-comum\')"] span': 'reserve_common_area',
        '[onclick="openConfigSection(\'politica-privacidade\')"] span': 'privacy_policy',
        '[onclick="openConfigSection(\'termos-uso\')"] span': 'terms_of_use',
        '[onclick="openConfigSection(\'consentimentos\')"] span': 'manage_consents',
        '[onclick="openConfigSection(\'info-condominio\')"] span': 'condominium_info',
        '[onclick="openConfigSection(\'contato-uteis\')"] span': 'useful_contacts',
        '[onclick="openConfigSection(\'prestadores-servicos\')"] span': 'service_providers',
        '[onclick="openConfigSection(\'sobre-empresa\')"] span': 'about_company',
        '[onclick="openConfigSection(\'versao-app\')"] span': 'app_version',
        '[onclick="openConfigSection(\'novas-atualizacoes\')"] span': 'updates',
        '.theme-selector label': 'theme_label',
        '.font-size-selector label': 'font_size_label',
        '.language-selector label': 'language_label'
    };

    Object.entries(selectorMap).forEach(([selector, key]) => {
        applyText(selector, translations[lang][key]);
    });

    applyText('#theme-light', translations[lang].theme_light);
    applyText('#theme-dark', translations[lang].theme_dark);
    applyText('#font-medium', translations[lang].font_medium);

    const languageSelect = document.getElementById('language-select');
    if (languageSelect?.options[0]) languageSelect.options[0].textContent = translations[lang].language_option_pt;
    if (languageSelect?.options[1]) languageSelect.options[1].textContent = translations[lang].language_option_en;

    const footerItems = document.querySelectorAll('.config-footer div');
    if (footerItems[0]) footerItems[0].textContent = translations[lang].footer_condo;
    if (footerItems[1]) footerItems[1].textContent = translations[lang].footer_rights;

    applyText('#reservasModal .reservas-modal-header h3', translations[lang].reservations_modal_title);
    applyText('#reservasModal .reservas-modal-header p', translations[lang].reservations_modal_subtitle);
    applyText('#reservasModalAction', translations[lang].reservations_modal_action);
    applyText('#condominioModal .reservas-modal-header h3', translations[lang].condo_modal_title);
    applyText('#condominioModal .reservas-modal-header p', translations[lang].condo_modal_subtitle);
    applyText('#condominioModalAction', translations[lang].modal_close);
}

function updateControlButtons(type, value) {
    if (type === 'theme') {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`theme-${value}`);
        if (activeBtn) activeBtn.classList.add('active');
    } else if (type === 'font') {
        document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`font-${value}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
}

function initPreferences() {
    const theme = localStorage.getItem('app-theme') || 'light';
    const fontSize = localStorage.getItem('app-font-size') || 'medium';
    const language = localStorage.getItem('app-language') || 'pt';

    setTheme(theme);
    setFontSize(fontSize);
    setLanguage(language);

    const languageSelect = document.getElementById('language-select');
    if (languageSelect) {
        languageSelect.value = language;
    }
    ensureReservationsModal();
    ensureCondominiumModal();
    ensureVisitorAccessModal();
}

/* ============ EXCLUIR CONTA ============ */

function ensureDeleteAccountModal() {
    let modal = document.getElementById('delete-account-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'delete-account-modal';
    modal.className = 'delete-account-modal';
    modal.innerHTML = `
        <div class="delete-account-box">
            <div class="dam-header">
                <div class="dam-icon-circle"><i class="fas fa-triangle-exclamation"></i></div>
                <h3>${cfgT('delete_modal_title')}</h3>
                <p>${cfgT('delete_modal_subtitle')}</p>
            </div>
            <div class="dam-body">
                <ul class="dam-warning-list" id="dam-warning-list">
                    <!-- Populado dinamicamente -->
                </ul>
                <div class="dam-confirm-input">
                    <label for="dam-confirm-text">${cfgT('delete_modal_label')} <strong id="dam-confirm-expected">${cfgT('delete_keyword')}</strong></label>
                    <input type="text" id="dam-confirm-text" autocomplete="off" spellcheck="false" />
                </div>
                <div class="dam-message" id="dam-message">&nbsp;</div>
            </div>
            <div class="dam-footer">
                <button type="button" class="dam-btn dam-btn-cancel" id="dam-cancel">${cfgT('cancel')}</button>
                <button type="button" class="dam-btn dam-btn-confirm" id="dam-confirm" disabled>
                    <i class="fas fa-trash-alt" style="margin-right:6px;"></i>${cfgT('delete_permanent')}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if (e.target === modal) closeDeleteAccountModal(); });
    modal.querySelector('#dam-cancel').addEventListener('click', closeDeleteAccountModal);
    modal.querySelector('#dam-confirm').addEventListener('click', executeDeleteAccount);
    modal.querySelector('#dam-confirm-text').addEventListener('input', validateDeleteConfirmation);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeDeleteAccountModal();
    });

    return modal;
}

function openDeleteAccountModal() {
    const user = getCurrentUser();
    if (!user) return;
    const modal = ensureDeleteAccountModal();
    const warnings = [];
    warnings.push({ icon: 'fa-user-slash', text: cfgT('delete_warning_account') });
    if (user.type === 'sindico') {
        warnings.push({ icon: 'fa-building', text: cfgT('delete_warning_condo') });
        warnings.push({ icon: 'fa-users', text: cfgT('delete_warning_residents') });
    } else {
        warnings.push({ icon: 'fa-house', text: cfgT('delete_warning_link') });
    }
    warnings.push({ icon: 'fa-receipt', text: cfgT('delete_warning_history') });

    const list = modal.querySelector('#dam-warning-list');
    list.innerHTML = warnings.map(w => `<li><i class="fas ${w.icon}"></i><span>${w.text}</span></li>`).join('');

    const txt = modal.querySelector('#dam-confirm-text');
    txt.value = '';
    modal.querySelector('#dam-message').innerHTML = '&nbsp;';
    const btn = modal.querySelector('#dam-confirm');
    btn.disabled = true;
    btn.classList.remove('loading');
    modal.classList.add('open');
    setTimeout(() => txt.focus(), 120);
}
window.openDeleteAccountModal = openDeleteAccountModal;

function closeDeleteAccountModal() {
    const modal = document.getElementById('delete-account-modal');
    if (modal) modal.classList.remove('open');
}
window.closeDeleteAccountModal = closeDeleteAccountModal;

function validateDeleteConfirmation() {
    const modal = document.getElementById('delete-account-modal');
    if (!modal) return;
    const val = (modal.querySelector('#dam-confirm-text').value || '').trim().toUpperCase();
    const btn = modal.querySelector('#dam-confirm');
    btn.disabled = val !== cfgT('delete_keyword');
}

async function executeDeleteAccount() {
    const user = getCurrentUser();
    if (!user) return;
    const modal = document.getElementById('delete-account-modal');
    if (!modal) return;
    const btn = modal.querySelector('#dam-confirm');
    const msg = modal.querySelector('#dam-message');
    if (btn.disabled) return;

    btn.classList.add('loading');
    btn.disabled = true;
    msg.style.color = '#dc2626';
    msg.textContent = 'Excluindo conta, aguarde...';

    try {
        if (user.type === 'sindico' && user.condominium && user.condominium.cep) {
            try {
                const delCondo = await fetch(`/api/condominiums?cep=${encodeURIComponent(user.condominium.cep)}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log('[DeleteAccount] Exclusao condominio status:', delCondo.status);
            } catch (condoErr) {
                console.warn('[DeleteAccount] Aviso ao excluir condominio:', condoErr);
            }
        }

        const delUser = await fetch(`/api/users?email=${encodeURIComponent(user.email)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!delUser.ok && delUser.status !== 404) {
            throw new Error('Não foi possível remover a conta no servidor (status ' + delUser.status + ')');
        }

        clearLoginPersistent();
        try { sessionStorage.removeItem('selectedPlan'); } catch(_) {}
        try { sessionStorage.removeItem('condominiumUser'); } catch(_) {}
        try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
        try { localStorage.removeItem('app-theme'); } catch(_) {}
        try { localStorage.removeItem('app-font-size'); } catch(_) {}
        try { localStorage.removeItem('app-language'); } catch(_) {}

        msg.style.color = '#16a34a';
        msg.textContent = 'Conta excluída com sucesso. Redirecionando...';
        setTimeout(() => { window.location.href = '../inicio.html'; }, 900);
    } catch (err) {
        console.error('[DeleteAccount] Erro:', err);
        btn.classList.remove('loading');
        btn.disabled = false;
        msg.style.color = '#dc2626';
        msg.textContent = 'Erro ao excluir conta: ' + (err.message || 'Tente novamente.');
    }
}
