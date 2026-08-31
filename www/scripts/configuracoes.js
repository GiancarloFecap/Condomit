async function fetchCondominiumBillingStatus(force = false) {
    try {
        if (typeof window.getCondomitBillingStatus === 'function') {
            return await window.getCondomitBillingStatus(force);
        }
        if (typeof window.supabaseFetch === 'function') {
            return await window.supabaseFetch('/rpc/condomit_get_billing_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
        }
    } catch (error) {
        console.error('[Billing] Error checking condominium billing:', error);
    }
    return null;
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

    // A mensalidade é do condomínio (CEP), não da pessoa que ocupa o cargo.
    if (currentUser.type === 'sindico' && currentUser.condominium) {
        const billing = await fetchCondominiumBillingStatus(true);

        if (billing?.plan_id && currentUser.plan !== billing.plan_id) {
            currentUser.plan = billing.plan_id;
            sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser));
        }

        if (billing && !billing.can_use) {
            if (typeof window.enforceCondomitBillingAccess === 'function') {
                await window.enforceCondomitBillingAccess({ force: true });
            }
            return;
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
        const user = { ...fresh, profilePhoto: fresh.profile_photo || fresh.profilePhoto || null };
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

    // O código de acesso do condomínio é uma função administrativa exclusiva do síndico.
    // Esta regra independe do plano e é reaplicada ao atualizar os dados do usuário.
    const accessCodeRow = document.getElementById('condominiumAccessCodeRow');
    if (accessCodeRow) {
        const canManageAccessCode = normalizedUserType === 'sindico';
        accessCodeRow.hidden = !canManageAccessCode;
        accessCodeRow.setAttribute('aria-hidden', canManageAccessCode ? 'false' : 'true');
        accessCodeRow.style.display = canManageAccessCode ? '' : 'none';
    }

    // Top bar avatar
    const topAvatar = document.getElementById('user-avatar-top');
    if (topAvatar) {
        if (currentUser.profilePhoto || currentUser.profile_photo) {
            const photo = currentUser.profilePhoto || currentUser.profile_photo;
            topAvatar.innerHTML = `<img src="${photo}" alt="Avatar" />`;
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
        if (currentUser.profilePhoto || currentUser.profile_photo) {
            const photo = currentUser.profilePhoto || currentUser.profile_photo;
            cardAvatar.innerHTML = `<img src="${photo}" alt="Avatar" />`;
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
    if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
    if (confirm(cfgT('confirm_logout'))) {
        sessionStorage.removeItem('condominiumUser');
        try { localStorage.removeItem('condominiumPersistentUser'); } catch(_) {}
        window.location.href = '../inicio.html';
    }
}

function openConfigSection(sectionKey) {
    const proOnlySections = new Set([
        'controle-acesso',
        'reserva-areas',
        'encomendas',
        'minhas-reservas',
        'lembretes-reserva',
        'confirmacao-cancelamento',
        'reserva-area-comum',
        'prestadores-servicos'
    ]);

    if (proOnlySections.has(sectionKey) && typeof window.requireCondomitMinimumPlan === 'function') {
        if (!window.requireCondomitMinimumPlan('Pro')) return;
    }

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
                window.showToast('Editor de perfil está carregando...', 'info');
            }
            break;
        case 'alterar-senha':
            window.showModal({
                title: 'Alterar senha',
                message: cfgT('confirm_change_password'),
                type: 'warning',
                confirmText: 'Sim, alterar',
                cancelText: 'Cancelar',
                onConfirm: () => {
                    window.location.href = 'redefinir-senha.html?source=configuracoes';
                }
            });
            break;
        case 'controle-acesso':
            openVisitorAccessModal();
            break;
        case 'autenticacao-2fa':
            openTwoFactorSettingsModal();
            break;
        case 'minha-unidade':
        case 'meus-condominos':
        case 'comunicados-sindico':
        case 'avisos-gerais':
        case 'reserva-areas':
        case 'encomendas':
        case 'lembretes-reserva':
        case 'confirmacao-cancelamento':
        case 'reserva-area-comum':
        case 'politica-privacidade':
            openPrivacyPolicyModal();
            break;
        case 'termos-uso':
            openTermsOfUseModal();
            break;
        case 'contato-uteis':
            openUsefulContactsModal();
            break;
        case 'prestadores-servicos':
            openServiceProvidersModal();
            break;
        case 'sobre-empresa':
            openAboutCompanyModal();
            break;
        case 'consentimentos':
        case 'versao-app':
        case 'novas-atualizacoes':
            window.showToast(`Funcionalidade ainda não implementada: ${sectionKey.replace(/-/g, ' ')}`, 'info');
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
        if (pendingPhoto) patchPayload.profile_photo = pendingPhoto;

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
        else if (updatedRecord && (updatedRecord.profile_photo || updatedRecord.profilePhoto)) mergedUser.profilePhoto = updatedRecord.profile_photo || updatedRecord.profilePhoto;
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
let accessRegistrationBound = false;

function setAccessFeedback(role, message = '', state = 'info') {
    const el = document.querySelector(`[data-role="${role}"]`);
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;
    el.style.display = message ? 'block' : 'none';
}

function showAccessRegistrationStep(kind = 'selector') {
    const selector = document.getElementById('accessKindSelector');
    const visitorForm = document.getElementById('visitorAccessForm');
    const dependentForm = document.getElementById('dependentAccessForm');
    const vehicleForm = document.getElementById('vehicleAccessForm');
    const title = document.getElementById('accessRegistrationTitle');
    const subtitle = document.getElementById('accessRegistrationSubtitle');

    if (selector) selector.hidden = kind !== 'selector';
    if (visitorForm) visitorForm.hidden = kind !== 'visitor';
    if (dependentForm) dependentForm.hidden = kind !== 'dependent';
    if (vehicleForm) vehicleForm.hidden = kind !== 'vehicle';

    const copy = {
        selector: ['Controle de acesso', 'Escolha o que deseja registrar.'],
        visitor: ['Registrar visitante', 'Cadastre o visitante. O responsável será você.'],
        dependent: ['Registrar dependente', 'Cadastre uma pessoa vinculada à sua unidade.'],
        vehicle: ['Registrar carro', 'Cadastre um veículo autorizado para sua unidade.']
    }[kind] || ['Controle de acesso', 'Escolha o que deseja registrar.'];

    if (title) title.textContent = copy[0];
    if (subtitle) subtitle.textContent = copy[1];
}

async function getAccessRegistrationContext() {
    const currentUser = getCurrentUser();
    if (!currentUser?.email) {
        throw new Error('Sessão inválida. Entre novamente.');
    }

    let cep = '';
    if (typeof window.resolveUserCondominiumCep === 'function') {
        cep = await window.resolveUserCondominiumCep(currentUser).catch(() => '');
    }

    if (!cep) {
        const condo = typeof currentUser.condominium === 'object' ? currentUser.condominium : {};
        const digits = String(condo?.cep || condo?.condominium_id || currentUser?.cep || '').replace(/\D/g, '');
        if (digits.length === 8) cep = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    }

    if (!cep) {
        throw new Error('Não foi possível identificar o condomínio da sua unidade.');
    }

    return {
        currentUser,
        email: String(currentUser.email).trim().toLowerCase(),
        cep
    };
}

function ensureVisitorAccessModal() {
    const modal = document.getElementById('visitorAccessModal');
    if (!modal) return null;

    if (modal.dataset.bound !== 'true') {
        document.getElementById('visitorAccessModalClose')?.addEventListener('click', closeVisitorAccessModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeVisitorAccessModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('open')) closeVisitorAccessModal();
        });
        modal.dataset.bound = 'true';
    }

    if (!accessRegistrationBound) {
        modal.querySelectorAll('[data-access-kind]').forEach((button) => {
            button.addEventListener('click', () => showAccessRegistrationStep(button.dataset.accessKind));
        });
        modal.querySelectorAll('[data-access-back]').forEach((button) => {
            button.addEventListener('click', () => showAccessRegistrationStep('selector'));
        });

        document.getElementById('dependentAccessForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            const original = submit?.innerHTML;
            if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
            setAccessFeedback('dependent-feedback');
            try {
                const ctx = await getAccessRegistrationContext();
                const fullName = document.getElementById('dependentFullName')?.value.trim() || '';
                const cpf = String(document.getElementById('dependentCpf')?.value || '').replace(/\D/g, '');
                const relationship = document.getElementById('dependentRelationship')?.value.trim() || '';
                const phone = document.getElementById('dependentPhone')?.value.trim() || '';
                const birthDate = document.getElementById('dependentBirthDate')?.value || '';
                if (!fullName || cpf.length !== 11 || !relationship || !phone || !birthDate) {
                    throw new Error('Preencha nome, CPF, parentesco, telefone e data de nascimento.');
                }
                const rows = await window.supabaseFetch('/dependents', {
                    method: 'POST',
                    headers: { Prefer: 'return=representation' },
                    body: JSON.stringify({
                        cpf,
                        cep: ctx.cep,
                        responsible_email: ctx.email,
                        full_name: fullName,
                        relationship,
                        phone,
                        birth_date: birthDate
                    })
                });
                if (!Array.isArray(rows) || !rows[0]?.cpf) throw new Error('O banco não confirmou o dependente.');
                form.reset();
                window.showToast?.('Dependente registrado com sucesso.', 'success');
                closeVisitorAccessModal();
            } catch (error) {
                setAccessFeedback('dependent-feedback', error.message || 'Erro ao registrar dependente.', 'error');
            } finally {
                if (submit) { submit.disabled = false; submit.innerHTML = original || 'Registrar dependente'; }
            }
        });

        document.getElementById('vehicleAccessForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            const original = submit?.innerHTML;
            if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
            setAccessFeedback('vehicle-feedback');
            try {
                const ctx = await getAccessRegistrationContext();
                const plate = document.getElementById('vehiclePlate')?.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
                const model = document.getElementById('vehicleModel')?.value.trim() || '';
                const color = document.getElementById('vehicleColor')?.value.trim() || '';
                const observations = document.getElementById('vehicleNotes')?.value.trim() || null;
                if (plate.length < 7 || !model || !color) throw new Error('Informe placa, modelo e cor do veículo.');
                const rows = await window.supabaseFetch('/vehicles', {
                    method: 'POST',
                    headers: { Prefer: 'return=representation' },
                    body: JSON.stringify({
                        plate,
                        cep: ctx.cep,
                        responsible_email: ctx.email,
                        model,
                        color,
                        observations
                    })
                });
                if (!Array.isArray(rows) || !rows[0]?.plate) throw new Error('O banco não confirmou o veículo.');
                form.reset();
                window.showToast?.('Carro registrado com sucesso.', 'success');
                closeVisitorAccessModal();
            } catch (error) {
                const message = /duplicate|unique|23505/i.test(String(error?.message || ''))
                    ? 'Este veículo já está cadastrado no condomínio.'
                    : (error.message || 'Erro ao registrar veículo.');
                setAccessFeedback('vehicle-feedback', message, 'error');
            } finally {
                if (submit) { submit.disabled = false; submit.innerHTML = original || 'Registrar carro'; }
            }
        });
        accessRegistrationBound = true;
    }

    if (!visitorAccessFormBound && window.visitorRegistration) {
        const form = document.getElementById('visitorAccessForm');
        const currentUser = getCurrentUser();
        if (form && currentUser) {
            window.visitorRegistration.initForm(form, {
                currentUser,
                lockResponsibleToCurrentUser: true,
                onCancel: () => showAccessRegistrationStep('selector'),
                onSuccess: () => closeVisitorAccessModal()
            });
            visitorAccessFormBound = true;
        }
    }

    return modal;
}

function openVisitorAccessModal() {
    const modal = ensureVisitorAccessModal();
    if (!modal) return;
    document.getElementById('visitorAccessForm')?.reset();
    document.getElementById('dependentAccessForm')?.reset();
    document.getElementById('vehicleAccessForm')?.reset();
    setAccessFeedback('visitor-feedback');
    setAccessFeedback('dependent-feedback');
    setAccessFeedback('vehicle-feedback');
    showAccessRegistrationStep('selector');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeVisitorAccessModal() {
    const modal = document.getElementById('visitorAccessModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    showAccessRegistrationStep('selector');
}

async function fetchCurrentCondominiumInfo() {
    const currentUser = getCurrentUser();
    const localCondo = currentUser?.condominium && typeof currentUser.condominium === 'object'
        ? currentUser.condominium
        : {};

    if (typeof window.supabaseFetch === 'function') {
        try {
            const result = await window.supabaseFetch('/rpc/condomit_current_condominium_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            const rpcInfo = Array.isArray(result) ? result[0] : result;
            if (rpcInfo && typeof rpcInfo === 'object') {
                return { ...localCondo, ...rpcInfo };
            }
        } catch (error) {
            console.warn('RPC de informações do condomínio indisponível, usando fallback:', error?.message || error);
        }
    }
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
        change_condominium: 'Mudar de condomínio',
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
        useful_contacts: 'Contatos úteis',
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
        footer_condo: '© 2026 Condomit.',
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
        change_condominium: 'Change Condominium',
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
        footer_condo: '© 2026 Condomit.',
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
        '[onclick="openChangeCondominiumModal()"] span': 'change_condominium',
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
        const accessToken = typeof window.resolveSupabaseAccessToken === 'function'
            ? await window.resolveSupabaseAccessToken()
            : (typeof window.getSupabaseAccessToken === 'function' ? window.getSupabaseAccessToken() : null);

        if (!accessToken) {
            throw new Error('Sua sessão expirou. Entre novamente antes de excluir a conta.');
        }

        const authenticatedHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        };

        if (user.type === 'sindico' && user.condominium && user.condominium.cep) {
            try {
                const delCondo = await fetch(`/api/condominiums?cep=${encodeURIComponent(user.condominium.cep)}`, {
                    method: 'DELETE',
                    headers: authenticatedHeaders
                });
                console.log('[DeleteAccount] Exclusao condominio status:', delCondo.status);
            } catch (condoErr) {
                console.warn('[DeleteAccount] Aviso ao excluir condominio:', condoErr);
            }
        }

        const delUser = await fetch(`/api/users?email=${encodeURIComponent(user.email)}`, {
            method: 'DELETE',
            headers: authenticatedHeaders
        });

        if (!delUser.ok && delUser.status !== 404) {
            const payload = await delUser.json().catch(() => null);
            const detail = payload?.error || payload?.message || '';
            throw new Error(detail || ('Não foi possível remover a conta no servidor (status ' + delUser.status + ')'));
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


/* ============================================================
   CONFIGURAÇÕES 014 - CONTEÚDO INSTITUCIONAL / PRIVACIDADE /
   TERMOS / CONTATOS / PRESTADORES
============================================================ */

const CONDOMIT_COMPANY_EMAIL = 'contato.condomit@gmail.com';
const CONDOMIT_COMPANY_PHONE = '(11)97440-9806';

function ensureSettingsContentModal() {
    let modal = document.getElementById('settingsContentModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'settingsContentModal';
    modal.className = 'reservas-modal-overlay settings-content-overlay';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="reservas-modal-card settings-content-card" role="dialog" aria-modal="true" aria-labelledby="settingsContentTitle">
            <div class="reservas-modal-header">
                <div>
                    <h3 id="settingsContentTitle">Informações</h3>
                    <p id="settingsContentSubtitle"></p>
                </div>
                <button type="button" class="reservas-modal-close" id="settingsContentClose" aria-label="Fechar">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="reservas-modal-body settings-content-body" id="settingsContentBody"></div>
            <div class="reservas-modal-footer settings-content-footer" id="settingsContentFooter">
                <button type="button" class="btn-edit-profile" id="settingsContentCloseAction">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const close = () => closeSettingsContentModal();
    modal.querySelector('#settingsContentClose')?.addEventListener('click', close);
    modal.querySelector('#settingsContentCloseAction')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) close();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('open')) close();
    });

    return modal;
}

function openSettingsContentModal({ title, subtitle = '', html = '', footerHtml = '' } = {}) {
    const modal = ensureSettingsContentModal();
    const titleEl = modal.querySelector('#settingsContentTitle');
    const subtitleEl = modal.querySelector('#settingsContentSubtitle');
    const bodyEl = modal.querySelector('#settingsContentBody');
    const footerEl = modal.querySelector('#settingsContentFooter');

    if (titleEl) titleEl.textContent = title || 'Informações';
    if (subtitleEl) subtitleEl.textContent = subtitle || '';
    if (bodyEl) bodyEl.innerHTML = html || '';
    if (footerEl) {
        footerEl.innerHTML = footerHtml || `
            <button type="button" class="btn-edit-profile" data-settings-close>Fechar</button>
        `;
        footerEl.querySelectorAll('[data-settings-close]').forEach((button) => {
            button.addEventListener('click', closeSettingsContentModal);
        });
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-modal-open');
    return modal;
}

function closeSettingsContentModal() {
    const modal = document.getElementById('settingsContentModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-modal-open');
}

function settingsSection(title, content) {
    return `
        <section class="settings-document-section">
            <h4>${escapeReservationHtml(title)}</h4>
            <div>${content}</div>
        </section>
    `;
}

function settingsParagraph(text) {
    return `<p>${escapeReservationHtml(text)}</p>`;
}

function settingsList(items) {
    return `<ul>${items.map((item) => `<li>${escapeReservationHtml(item)}</li>`).join('')}</ul>`;
}

function openAboutCompanyModal() {
    const html = `
        <div class="settings-company-hero">
            <img src="../assets/logo-lado.png" alt="Condomit">
            <div>
                <h4>Condomit</h4>
                <p>Gestão condominial digital, integrada e orientada à comunidade.</p>
            </div>
        </div>
        ${settingsSection('O que é a Condomit',
            settingsParagraph('A Condomit é uma plataforma criada para centralizar rotinas de condomínios em um único ambiente digital, aproximando síndicos, moradores e porteiros e reduzindo processos manuais.')
        )}
        ${settingsSection('Propósito',
            settingsParagraph('Facilitar a administração do condomínio, melhorar a comunicação entre as pessoas e tornar processos do dia a dia mais organizados, transparentes, seguros e acessíveis.')
        )}
        ${settingsSection('Para quem foi criada',
            settingsList([
                'Síndicos, que precisam administrar comunicação, moradores, assembleias, manutenção e rotinas do condomínio.',
                'Moradores, que precisam acompanhar avisos, reservas, assembleias, visitantes, encomendas e serviços da comunidade.',
                'Porteiros, que precisam controlar visitantes, prestadores, entregas e registros de acesso.'
            ])
        )}
        ${settingsSection('Principais recursos',
            settingsList([
                'Assembleias on-line com presença, chat, pautas, votações e registro de acontecimentos.',
                'Central de notificações, avisos e comunicação entre síndico, moradores e portaria.',
                'Controle de visitantes, prestadores, dependentes, veículos, entregas e registros de entrada e saída.',
                'Reservas de áreas comuns, manutenção preventiva, sugestões, marketplace e achados e perdidos.',
                'Painéis específicos para síndico, morador e porteiro.',
                'Recursos de inteligência artificial para apoio à comunicação e organização.'
            ])
        )}
        ${settingsSection('Missão',
            settingsParagraph('Simplificar a vida em condomínio por meio de tecnologia que reúna gestão, comunicação, segurança e participação em um só lugar.')
        )}
        ${settingsSection('Visão',
            settingsParagraph('Evoluir continuamente como uma plataforma de referência para gestão condominial digital, oferecendo uma experiência prática e confiável para toda a comunidade.')
        )}
        ${settingsSection('Valores',
            settingsList([
                'Inovação',
                'Transparência',
                'Segurança',
                'Organização',
                'Comunidade',
                'Praticidade',
                'Confiabilidade',
                'Evolução contínua'
            ])
        )}
        ${settingsSection('Diferencial',
            settingsParagraph('A Condomit integra a gestão cotidiana do condomínio com assembleias on-line e participação digital, permitindo que informações e decisões importantes permaneçam organizadas no mesmo ecossistema.')
        )}
        ${settingsSection('Contato',
            `<p><strong>E-mail:</strong> <a href="mailto:${CONDOMIT_COMPANY_EMAIL}">${CONDOMIT_COMPANY_EMAIL}</a></p>
             <p><strong>Telefone:</strong> ${escapeReservationHtml(CONDOMIT_COMPANY_PHONE)}</p>`
        )}
        ${settingsSection('Versão',
            settingsParagraph('Aplicativo Condomit — versão 1.0.0. © 2026 Condomit. Todos os direitos reservados.')
        )}
    `;

    openSettingsContentModal({
        title: 'Sobre a Condomit',
        subtitle: 'Conheça a empresa, o propósito e os principais recursos da plataforma.',
        html
    });
}

function openPrivacyPolicyModal() {
    const html = `
        <div class="settings-document-intro">
            <strong>Política de Privacidade da Condomit</strong>
            <span>Última atualização: 10 de agosto de 2026</span>
        </div>
        ${settingsSection('1. Objetivo e abrangência',
            settingsParagraph('Esta Política de Privacidade descreve como a Condomit trata informações utilizadas nas funcionalidades da plataforma, incluindo dados de cadastro, condomínio, comunicação, assembleias, acessos, visitantes, prestadores, encomendas, reservas e demais recursos disponibilizados no sistema.')
        )}
        ${settingsSection('2. Dados que podem ser tratados',
            settingsList([
                'Dados de identificação e contato, como nome, e-mail, telefone e CPF quando exigido por uma funcionalidade.',
                'Dados de vínculo condominial, como CEP, condomínio, bloco, apartamento e tipo de usuário.',
                'Dados informados sobre visitantes, dependentes, veículos, prestadores e encomendas.',
                'Conteúdos enviados pelo usuário, como mensagens, comentários, sugestões, anúncios, arquivos e informações de assembleias.',
                'Registros técnicos necessários para autenticação, segurança, sessão e funcionamento da plataforma.'
            ])
        )}
        ${settingsSection('3. Finalidades do tratamento',
            settingsList([
                'Criar e autenticar contas e manter o usuário conectado quando autorizado.',
                'Vincular usuários ao condomínio correto e separar informações por CEP.',
                'Executar as funcionalidades solicitadas pelo usuário.',
                'Permitir comunicação entre pessoas do mesmo condomínio.',
                'Registrar ações relevantes de segurança, portaria, assembleias e gestão.',
                'Prevenir abuso, fraude, acesso indevido e falhas de segurança.',
                'Melhorar a experiência, estabilidade e evolução da plataforma.'
            ])
        )}
        ${settingsSection('4. Bases e autorizações',
            settingsParagraph('O tratamento deve ocorrer de acordo com a finalidade do serviço, as autorizações fornecidas pelo usuário, as obrigações aplicáveis à administração condominial e a legislação de proteção de dados aplicável. Determinadas operações podem depender do consentimento ou de outra base legal adequada ao contexto.')
        )}
        ${settingsSection('5. Compartilhamento de dados',
            settingsParagraph('A Condomit não deve disponibilizar dados pessoais a pessoas de outros condomínios. Informações podem ser acessadas por usuários do mesmo condomínio apenas quando a funcionalidade e o perfil de acesso permitirem. Prestadores tecnológicos usados para autenticação, banco de dados, hospedagem, comunicação, pagamentos e videoconferência podem processar dados estritamente para viabilizar o serviço.')
        )}
        ${settingsSection('6. Segurança e controle de acesso',
            settingsParagraph('A plataforma utiliza autenticação, políticas de segurança no banco de dados, separação por condomínio, controles de perfil e outros mecanismos técnicos para reduzir acessos indevidos. Nenhum sistema é totalmente imune a incidentes, por isso credenciais e dispositivos também devem ser protegidos pelo usuário.')
        )}
        ${settingsSection('7. Armazenamento e conservação',
            settingsParagraph('Os dados são mantidos pelo período necessário para prestar os serviços, preservar registros importantes da administração, cumprir obrigações aplicáveis e permitir o funcionamento das funcionalidades. Dados podem ser excluídos ou anonimizados quando deixarem de ser necessários, observadas as hipóteses de conservação aplicáveis.')
        )}
        ${settingsSection('8. Direitos do titular',
            settingsList([
                'Solicitar acesso aos próprios dados.',
                'Solicitar correção de informações incompletas ou incorretas.',
                'Solicitar exclusão, anonimização ou limitação quando aplicável.',
                'Solicitar informações sobre uso e compartilhamento dos dados.',
                'Revogar consentimentos quando o tratamento depender de consentimento.',
                'Entrar em contato para esclarecer dúvidas sobre privacidade.'
            ])
        )}
        ${settingsSection('9. Cookies, armazenamento local e sessão',
            settingsParagraph('A Condomit pode utilizar recursos do navegador, como armazenamento local e de sessão, para autenticação, preferências, estado de leitura, favoritos e continuidade de uso. Esses recursos não devem ser usados para vender dados pessoais a terceiros.')
        )}
        ${settingsSection('10. Comunicações e conteúdo de usuários',
            settingsParagraph('Mensagens, comentários, arquivos, anúncios e outros conteúdos enviados pelo usuário permanecem vinculados às funcionalidades em que foram publicados. O usuário deve evitar inserir dados pessoais desnecessários ou informações de terceiros sem autorização.')
        )}
        ${settingsSection('11. Atualizações desta política',
            settingsParagraph('Esta Política pode ser atualizada para acompanhar mudanças na plataforma, em requisitos de segurança ou em obrigações aplicáveis. A versão vigente deve permanecer disponível nesta área de Configurações.')
        )}
        ${settingsSection('12. Contato sobre privacidade',
            `<p>Dúvidas e solicitações relacionadas à privacidade podem ser enviadas para <a href="mailto:${CONDOMIT_COMPANY_EMAIL}?subject=Privacidade%20-%20Condomit">${CONDOMIT_COMPANY_EMAIL}</a>.</p>`
        )}
    `;

    openSettingsContentModal({
        title: 'Política de Privacidade',
        subtitle: 'Como a Condomit trata e protege as informações usadas na plataforma.',
        html
    });
}

function openTermsOfUseModal() {
    const html = `
        <div class="settings-document-intro">
            <strong>Termos de Uso da Condomit</strong>
            <span>Última atualização: 10 de agosto de 2026</span>
        </div>
        ${settingsSection('1. Aceitação',
            settingsParagraph('Ao criar uma conta, acessar ou utilizar a Condomit, o usuário concorda em utilizar a plataforma de forma compatível com estes Termos, com as regras do seu condomínio e com a legislação aplicável.')
        )}
        ${settingsSection('2. Conta e credenciais',
            settingsList([
                'O usuário deve fornecer informações verdadeiras e manter seus dados atualizados.',
                'Credenciais de acesso são pessoais e não devem ser compartilhadas.',
                'O usuário é responsável por proteger seus dispositivos e comunicar suspeitas de acesso indevido.',
                'A Condomit pode exigir confirmação de e-mail ou outras verificações para proteger a conta.'
            ])
        )}
        ${settingsSection('3. Vínculo com o condomínio',
            settingsParagraph('O acesso às informações de um condomínio depende do vínculo cadastrado no sistema. O usuário não deve tentar acessar dados de outro condomínio, alterar identificadores para contornar permissões ou utilizar credenciais de terceiros.')
        )}
        ${settingsSection('4. Perfis de usuário',
            settingsParagraph('Síndicos, moradores e porteiros possuem permissões diferentes. Cada perfil deve utilizar somente as funções compatíveis com suas atribuições e com as permissões concedidas pela plataforma e pelo condomínio.')
        )}
        ${settingsSection('5. Comunicação e conteúdo',
            settingsParagraph('O usuário é responsável pelo conteúdo que envia em chats, assembleias, comentários, sugestões, anúncios e demais áreas. Não é permitido publicar conteúdo ilícito, enganoso, ofensivo, discriminatório, que viole direitos de terceiros ou que comprometa a segurança da comunidade.')
        )}
        ${settingsSection('6. Assembleias e votações',
            settingsParagraph('As ferramentas de assembleia registram dados digitais disponibilizados pela plataforma, como presença, chat, pautas e votos. Regras formais de convocação, validade, quórum e documentação continuam sujeitas às normas do condomínio e às exigências aplicáveis.')
        )}
        ${settingsSection('7. Marketplace',
            settingsParagraph('O marketplace aproxima usuários do mesmo condomínio. A Condomit não é proprietária dos itens anunciados e não garante estado, qualidade, entrega ou negociação entre as partes. O anunciante é responsável pelas informações publicadas e por remover ou atualizar anúncios que deixem de ser válidos.')
        )}
        ${settingsSection('8. Pagamentos e serviços de terceiros',
            settingsParagraph('Determinadas funcionalidades podem utilizar serviços externos de pagamento, autenticação, envio de e-mails, hospedagem ou videoconferência. O uso desses serviços também pode estar sujeito aos respectivos termos e políticas.')
        )}
        ${settingsSection('9. Uso proibido',
            settingsList([
                'Tentar acessar contas, condomínios ou dados sem autorização.',
                'Explorar falhas, burlar políticas de segurança ou interferir no funcionamento da aplicação.',
                'Enviar malware, spam ou arquivos destinados a causar dano.',
                'Usar dados obtidos na plataforma para assédio, fraude ou finalidade incompatível com a gestão condominial.',
                'Falsificar identidade, permissões, registros ou informações de acesso.'
            ])
        )}
        ${settingsSection('10. Disponibilidade e alterações',
            settingsParagraph('A plataforma pode passar por manutenção, atualizações e indisponibilidades temporárias. Funcionalidades podem ser aperfeiçoadas, substituídas ou descontinuadas quando necessário para segurança, evolução técnica ou melhoria do serviço.')
        )}
        ${settingsSection('11. Propriedade intelectual',
            settingsParagraph('Marca, identidade visual, software, interfaces e materiais próprios da Condomit são protegidos pelos direitos aplicáveis. O uso da plataforma não transfere ao usuário titularidade sobre esses elementos.')
        )}
        ${settingsSection('12. Suspensão e encerramento',
            settingsParagraph('Contas podem ter o acesso limitado ou encerrado em caso de violação destes Termos, risco de segurança, fraude, solicitação válida do responsável pelo condomínio ou encerramento da relação com a plataforma, respeitadas as condições aplicáveis.')
        )}
        ${settingsSection('13. Responsabilidades',
            settingsParagraph('A Condomit oferece ferramentas tecnológicas de apoio à gestão e à comunicação. Decisões administrativas, autorizações de acesso, conteúdo publicado, negociações entre usuários e atos praticados por usuários permanecem sob responsabilidade de quem os realiza, dentro das regras aplicáveis.')
        )}
        ${settingsSection('14. Privacidade',
            settingsParagraph('O tratamento de informações pessoais é descrito na Política de Privacidade disponível nesta mesma área de Configurações.')
        )}
        ${settingsSection('15. Atualização dos termos',
            settingsParagraph('Estes Termos podem ser atualizados conforme a plataforma evoluir. A versão vigente deve permanecer disponível ao usuário.')
        )}
        ${settingsSection('16. Contato',
            `<p>Para dúvidas sobre estes Termos, entre em contato pelo e-mail <a href="mailto:${CONDOMIT_COMPANY_EMAIL}?subject=Termos%20de%20Uso%20-%20Condomit">${CONDOMIT_COMPANY_EMAIL}</a>.</p>`
        )}
    `;

    openSettingsContentModal({
        title: 'Termos de Uso',
        subtitle: 'Regras para utilização responsável e segura da plataforma Condomit.',
        html
    });
}

function openUsefulContactsModal() {
    const html = `
        <div class="settings-contact-grid">
            <a class="settings-contact-card" href="mailto:${CONDOMIT_COMPANY_EMAIL}?subject=Contato%20Condomit">
                <i class="fas fa-envelope"></i>
                <div>
                    <span>E-mail</span>
                    <strong>${CONDOMIT_COMPANY_EMAIL}</strong>
                </div>
            </a>
            <div class="settings-contact-card">
                <i class="fas fa-phone"></i>
                <div>
                    <span>Telefone</span>
                    <strong>${escapeReservationHtml(CONDOMIT_COMPANY_PHONE)}</strong>
                </div>
            </div>
        </div>
    `;

    openSettingsContentModal({
        title: 'Contatos da Condomit',
        subtitle: 'Canais úteis para falar com a equipe da plataforma.',
        html
    });
}

function getSettingsUserType() {
    const user = getCurrentUser();
    if (typeof window.getNormalizedUserType === 'function') {
        return window.getNormalizedUserType(user);
    }
    return String(user?.type || user?.user_type || 'morador').trim().toLowerCase();
}

async function getSettingsCondoCep() {
    const user = getCurrentUser();
    if (typeof window.resolveUserCondominiumCep === 'function') {
        try {
            const resolved = await window.resolveUserCondominiumCep(user);
            if (resolved) return resolved;
        } catch (_) {}
    }
    const condo = user?.condominium && typeof user.condominium === 'object' ? user.condominium : {};
    return condo.cep || condo.condominium_id || condo.condominiumId || user?.cep || '';
}

function openServiceProvidersModal() {
    const role = getSettingsUserType();
    const canRegister = ['sindico', 'síndico', 'porteiro', 'admin'].includes(role);
    const html = `
        <div class="settings-choice-grid">
            <button type="button" class="settings-choice-card" id="viewProvidersChoice">
                <i class="fas fa-address-book"></i>
                <strong>Ver prestadores registrados</strong>
                <span>Consulte os prestadores vinculados ao seu condomínio.</span>
            </button>
            <button type="button" class="settings-choice-card" id="registerProviderChoice" ${canRegister ? '' : 'disabled'}>
                <i class="fas fa-user-plus"></i>
                <strong>Registrar prestador</strong>
                <span>${canRegister ? 'Cadastre um novo prestador para o condomínio.' : 'Disponível para síndicos e porteiros.'}</span>
            </button>
        </div>
    `;

    const modal = openSettingsContentModal({
        title: 'Prestadores de serviços',
        subtitle: 'Escolha o que deseja fazer.',
        html
    });

    modal.querySelector('#viewProvidersChoice')?.addEventListener('click', renderRegisteredProvidersInSettings);
    modal.querySelector('#registerProviderChoice')?.addEventListener('click', renderProviderRegistrationInSettings);
}

async function renderRegisteredProvidersInSettings() {
    const modal = ensureSettingsContentModal();
    const body = modal.querySelector('#settingsContentBody');
    const subtitle = modal.querySelector('#settingsContentSubtitle');
    if (subtitle) subtitle.textContent = 'Prestadores registrados no condomínio atual.';
    if (body) {
        body.innerHTML = `
            <div class="reservas-empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando prestadores...</p>
            </div>
        `;
    }

    try {
        const cep = await getSettingsCondoCep();
        const rows = typeof window.listServiceProvidersByCep === 'function'
            ? await window.listServiceProvidersByCep(cep)
            : [];

        if (!Array.isArray(rows) || !rows.length) {
            body.innerHTML = `
                <div class="reservas-empty-state">
                    <i class="fas fa-user-slash"></i>
                    <p>Nenhum prestador registrado neste condomínio.</p>
                </div>
            `;
            return;
        }

        body.innerHTML = `
            <div class="settings-provider-list">
                ${rows.map((provider) => `
                    <article class="settings-provider-card">
                        <div class="settings-provider-avatar"><i class="fas fa-user-gear"></i></div>
                        <div>
                            <strong>${escapeReservationHtml(provider.provider_name || provider.name || 'Prestador')}</strong>
                            <span>${escapeReservationHtml(provider.service || 'Serviço não informado')}</span>
                            <small>${escapeReservationHtml(provider.company || '')}${provider.phone ? ` • ${escapeReservationHtml(provider.phone)}` : ''}</small>
                        </div>
                        <span class="settings-provider-status">${escapeReservationHtml(provider.initial_status || 'agendado')}</span>
                    </article>
                `).join('')}
            </div>
        `;
    } catch (error) {
        body.innerHTML = `
            <div class="reservas-empty-state">
                <i class="fas fa-circle-exclamation"></i>
                <p>${escapeReservationHtml(error?.message || 'Não foi possível carregar os prestadores.')}</p>
            </div>
        `;
    }
}

async function renderProviderRegistrationInSettings() {
    const role = getSettingsUserType();
    if (!['sindico', 'síndico', 'porteiro', 'admin'].includes(role)) {
        window.showToast?.('Seu perfil pode consultar prestadores, mas não registrar novos.', 'warning');
        return;
    }

    const modal = ensureSettingsContentModal();
    const body = modal.querySelector('#settingsContentBody');
    const subtitle = modal.querySelector('#settingsContentSubtitle');
    if (subtitle) subtitle.textContent = 'Cadastre um prestador para o condomínio atual.';

    body.innerHTML = `
        <form class="settings-provider-form" id="settingsProviderForm">
            <label>Nome do prestador<input id="settingsProviderName" type="text" required maxlength="120"></label>
            <label>Empresa<input id="settingsProviderCompany" type="text" required maxlength="120"></label>
            <label>Serviço<input id="settingsProviderService" type="text" required maxlength="160"></label>
            <label>Categoria
                <select id="settingsProviderCategory" required>
                    <option value="electrical">Elétrica</option>
                    <option value="cleaning">Limpeza</option>
                    <option value="hydraulic">Hidráulica</option>
                    <option value="security">Segurança</option>
                    <option value="gardening">Jardinagem</option>
                    <option value="painting">Pintura</option>
                    <option value="elevator">Elevadores</option>
                </select>
            </label>
            <label>Telefone<input id="settingsProviderPhone" type="text" required maxlength="30" placeholder="(11) 99999-9999"></label>
            <label>E-mail<input id="settingsProviderEmail" type="email" required maxlength="160"></label>
            <label>Data do serviço<input id="settingsProviderDate" type="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
            <label>Horário / janela<input id="settingsProviderWindow" type="text" required maxlength="80" placeholder="09:00 - 12:00"></label>
            <label>Status
                <select id="settingsProviderStatus">
                    <option value="agendado">Agendado</option>
                    <option value="em andamento">Em andamento</option>
                    <option value="concluído">Concluído</option>
                    <option value="cancelado">Cancelado</option>
                </select>
            </label>
            <div class="settings-provider-form-actions">
                <button type="button" class="ghost-btn" id="settingsProviderBack">Voltar</button>
                <button type="submit" class="btn-edit-profile"><i class="fas fa-floppy-disk"></i> Salvar prestador</button>
            </div>
        </form>
    `;

    body.querySelector('#settingsProviderBack')?.addEventListener('click', openServiceProvidersModal);
    body.querySelector('#settingsProviderForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = event.currentTarget.querySelector('button[type="submit"]');
        try {
            submit.disabled = true;
            const cep = await getSettingsCondoCep();
            if (typeof window.createServiceProvider !== 'function') {
                throw new Error('Serviço de cadastro de prestadores indisponível.');
            }

            await window.createServiceProvider({
                cep,
                provider_name: body.querySelector('#settingsProviderName')?.value || '',
                company: body.querySelector('#settingsProviderCompany')?.value || '',
                service: body.querySelector('#settingsProviderService')?.value || '',
                category: body.querySelector('#settingsProviderCategory')?.value || 'cleaning',
                phone: body.querySelector('#settingsProviderPhone')?.value || '',
                email: body.querySelector('#settingsProviderEmail')?.value || '',
                service_date: body.querySelector('#settingsProviderDate')?.value || '',
                service_window: body.querySelector('#settingsProviderWindow')?.value || '',
                initial_status: body.querySelector('#settingsProviderStatus')?.value || 'agendado'
            });

            window.showToast?.('Prestador registrado com sucesso.', 'success');
            await renderRegisteredProvidersInSettings();
        } catch (error) {
            window.showToast?.(error?.message || 'Não foi possível registrar o prestador.', 'error');
        } finally {
            submit.disabled = false;
        }
    });
}


/* ============================================================
   CONFIGURAÇÕES 016 - VERIFICAÇÃO EM DUAS ETAPAS POR E-MAIL
============================================================ */

async function openTwoFactorSettingsModal() {
    if (!window.condomitTwoFactor?.status) {
        window.showToast?.(
            'O módulo de autenticação em duas etapas ainda não foi carregado.',
            'error'
        );
        return;
    }

    /*
     * Abre o popup imediatamente. Antes a página esperava a consulta ao
     * backend terminar para só então exibir o modal, dando a impressão de
     * que o botão não havia funcionado.
     */
    const modal = openSettingsContentModal({
        title: 'Autenticação de dois fatores',
        subtitle: 'Consultando a proteção da sua conta...',
        html: `
            <div class="two-factor-confirmation-sent">
                <div class="two-factor-settings-icon active">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <h4>Carregando...</h4>
                <p>Estamos verificando se a autenticação em duas etapas está ativa.</p>
            </div>
        `,
        footerHtml: `
            <button type="button" class="btn-edit-profile" data-settings-close>Fechar</button>
        `
    });

    modal.querySelectorAll('[data-settings-close]').forEach((button) => {
        button.addEventListener('click', closeSettingsContentModal);
    });

    let state;
    try {
        state = await window.condomitTwoFactor.status();
    } catch (error) {
        const body = modal.querySelector('#settingsContentBody');
        const footer = modal.querySelector('#settingsContentFooter');
        const subtitle = modal.querySelector('#settingsContentSubtitle');

        if (subtitle) subtitle.textContent = 'Não foi possível consultar a proteção da conta.';
        if (body) {
            body.innerHTML = `
                <div class="two-factor-confirmation-sent">
                    <div class="two-factor-settings-icon">
                        <i class="fas fa-triangle-exclamation"></i>
                    </div>
                    <h4>Falha ao carregar</h4>
                    <p>${escapeReservationHtml(error?.message || 'Não foi possível consultar a autenticação em duas etapas.')}</p>
                </div>
            `;
        }
        if (footer) {
            footer.innerHTML = `
                <button type="button" class="btn-edit-profile" data-settings-close>Fechar</button>
                <button type="button" class="btn-edit-profile visitor-submit-btn" id="retryTwoFactorStatus">
                    <i class="fas fa-rotate-right"></i> Tentar novamente
                </button>
            `;
            footer.querySelectorAll('[data-settings-close]').forEach((button) => {
                button.addEventListener('click', closeSettingsContentModal);
            });
            footer.querySelector('#retryTwoFactorStatus')?.addEventListener('click', openTwoFactorSettingsModal);
        }
        return;
    }

    const enabled = state?.enabled === true;
    const email = state?.email || getCurrentUser()?.email || '';
    const safeEmail = escapeReservationHtml(email);
    const subtitle = modal.querySelector('#settingsContentSubtitle');
    const body = modal.querySelector('#settingsContentBody');
    const footer = modal.querySelector('#settingsContentFooter');

    if (subtitle) {
        subtitle.textContent = enabled
            ? 'A proteção adicional por e-mail está ativa.'
            : 'Adicione uma segunda etapa ao entrar na sua conta.';
    }

    if (body) {
        body.innerHTML = `
            <div class="two-factor-settings-card">
                <div class="two-factor-settings-icon ${enabled ? 'active' : ''}">
                    <i class="fas ${enabled ? 'fa-shield-circle-check' : 'fa-shield-halved'}"></i>
                </div>
                <div class="two-factor-settings-copy">
                    <span class="two-factor-status ${enabled ? 'active' : ''}">
                        ${enabled ? 'Ativada' : 'Desativada'}
                    </span>
                    <h4>${enabled ? 'Verificação em duas etapas ativa' : 'Deseja ativar a verificação em duas etapas?'}</h4>
                    <p>
                        ${enabled
                            ? `Sempre que você sair da conta e fizer login novamente, um código de 6 dígitos será enviado para <strong>${safeEmail}</strong>.`
                            : `Ao ativar, sempre que você sair da conta e fizer login novamente, um código de 6 dígitos será enviado para <strong>${safeEmail}</strong>.`
                        }
                    </p>
                    <p class="two-factor-settings-note">
                        ${enabled
                            ? 'Para desativar, enviaremos um link temporário de confirmação para esse mesmo e-mail.'
                            : 'Para ativar, enviaremos primeiro um link temporário de confirmação para esse e-mail.'
                        }
                    </p>
                </div>
            </div>
        `;
    }

    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn-edit-profile" data-settings-close>Cancelar</button>
            <button type="button"
                    class="btn-edit-profile visitor-submit-btn two-factor-action-btn ${enabled ? 'danger' : ''}"
                    id="twoFactorSettingsAction">
                <i class="fas ${enabled ? 'fa-shield-xmark' : 'fa-shield-halved'}"></i>
                ${enabled ? 'Desativar autenticação' : 'Ativar autenticação'}
            </button>
        `;
    }

    modal.querySelectorAll('[data-settings-close]').forEach((button) => {
        button.addEventListener('click', closeSettingsContentModal);
    });

    const actionButton = modal.querySelector('#twoFactorSettingsAction');
    actionButton?.addEventListener('click', async () => {
        actionButton.disabled = true;
        const original = actionButton.innerHTML;
        actionButton.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Enviando confirmação...';

        try {
            const result =
                await window.condomitTwoFactor.requestChange(!enabled);

            const shownEmail =
                escapeReservationHtml(
                    result?.email ||
                    email
                );

            modal.querySelector('#settingsContentBody').innerHTML = `
                <div class="two-factor-confirmation-sent">
                    <div class="two-factor-settings-icon active">
                        <i class="fas fa-envelope-circle-check"></i>
                    </div>
                    <h4>Confira seu e-mail</h4>
                    <p>
                        Enviamos um link temporário para
                        <strong>${shownEmail}</strong>.
                    </p>
                    <p>
                        Clique no link recebido para
                        ${enabled ? 'confirmar a desativação' : 'confirmar a ativação'}
                        da autenticação em duas etapas.
                    </p>
                    <small>O link expira em aproximadamente 15 minutos.</small>
                </div>
            `;

            modal.querySelector('#settingsContentFooter').innerHTML = `
                <button type="button" class="btn-edit-profile visitor-submit-btn" data-settings-close>
                    Entendido
                </button>
            `;

            modal.querySelectorAll('[data-settings-close]').forEach((button) => {
                button.addEventListener('click', closeSettingsContentModal);
            });

        } catch (error) {
            window.showToast?.(
                error?.message ||
                'Não foi possível enviar o e-mail de confirmação.',
                'error'
            );
            actionButton.disabled = false;
            actionButton.innerHTML = original;
        }
    });
}
window.openTwoFactorSettingsModal = openTwoFactorSettingsModal;

// ============================================================
// Condomit 0.41 - Código seguro de acesso ao condomínio
// Disponível para síndicos em qualquer plano; porteiros continuam limitados a Pro/Premium.
// O código bruto é retornado somente no momento da geração.
// ============================================================
function ensureCondominiumAccessCodeModal() {
    let modal = document.getElementById('condomitAccessCodeModal');
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'condomitAccessCodeModalStyles';
    style.textContent = `
        .condomit-access-code-overlay{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.62);display:none;align-items:center;justify-content:center;padding:18px}
        .condomit-access-code-overlay.open{display:flex}
        .condomit-access-code-card{width:min(100%,520px);max-height:calc(100vh - 36px);overflow:auto;background:#fff;border-radius:22px;box-shadow:0 28px 80px rgba(15,23,42,.28);padding:26px}
        .condomit-access-code-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
        .condomit-access-code-head h3{margin:0;color:#172554;font-size:1.35rem}
        .condomit-access-code-head p{margin:5px 0 0;color:#64748b;font-size:.9rem;line-height:1.5}
        .condomit-access-code-close{border:0;background:#f1f5f9;color:#334155;width:38px;height:38px;border-radius:10px;cursor:pointer;flex:0 0 auto}
        .condomit-access-code-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}
        .condomit-access-code-fields label{display:grid;gap:7px;color:#334155;font-size:.86rem;font-weight:700}
        .condomit-access-code-fields select,.condomit-access-code-fields input{width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:9px 11px;background:#fff;color:#0f172a;font:inherit}
        .condomit-access-code-actions{display:flex;gap:10px;flex-wrap:wrap}
        .condomit-access-code-btn{border:0;border-radius:11px;min-height:44px;padding:0 16px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}
        .condomit-access-code-btn.primary{background:#1e40af;color:#fff;flex:1}
        .condomit-access-code-btn.secondary{background:#eef2ff;color:#1e3a8a}
        .condomit-access-code-btn.danger{background:#fff1f2;color:#be123c}
        .condomit-access-code-btn:disabled{opacity:.65;cursor:wait}
        .condomit-access-code-result{margin-top:18px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:15px;padding:16px;display:none}
        .condomit-access-code-result.visible{display:block}
        .condomit-access-code-result small{display:block;color:#475569;line-height:1.45}
        .condomit-access-code-value{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0 8px;background:#fff;border:1px solid #93c5fd;border-radius:12px;padding:13px 14px}
        .condomit-access-code-value strong{font-size:clamp(1.3rem,5vw,1.8rem);letter-spacing:.12em;color:#172554;overflow-wrap:anywhere}
        .condomit-access-code-copy{border:0;background:#dbeafe;color:#1d4ed8;width:42px;height:42px;border-radius:10px;cursor:pointer;flex:0 0 auto}
        .condomit-access-code-feedback{min-height:20px;margin-top:12px;color:#64748b;font-size:.86rem;line-height:1.4}
        .condomit-access-code-feedback.error{color:#b91c1c}.condomit-access-code-feedback.success{color:#047857}
        @media(max-width:560px){.condomit-access-code-card{padding:20px 16px;border-radius:18px}.condomit-access-code-fields{grid-template-columns:1fr}.condomit-access-code-actions{display:grid;grid-template-columns:1fr}.condomit-access-code-btn{width:100%}}
    `;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'condomitAccessCodeModal';
    modal.className = 'condomit-access-code-overlay';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <section class="condomit-access-code-card" role="dialog" aria-modal="true" aria-labelledby="condomitAccessCodeTitle">
            <div class="condomit-access-code-head">
                <div>
                    <h3 id="condomitAccessCodeTitle"><i class="fas fa-key"></i> Código de acesso do condomínio</h3>
                    <p>Gere um código temporário para moradores entrarem no condomínio. Porteiros só podem ser vinculados em planos Pro ou Premium.</p>
                </div>
                <button type="button" class="condomit-access-code-close" aria-label="Fechar"><i class="fas fa-times"></i></button>
            </div>
            <div class="condomit-access-code-fields">
                <label>Validade
                    <select id="condomitAccessCodeHours">
                        <option value="24">24 horas</option>
                        <option value="72">3 dias</option>
                        <option value="168" selected>7 dias</option>
                        <option value="720">30 dias</option>
                    </select>
                </label>
                <label>Quantidade máxima de usos
                    <input id="condomitAccessCodeUses" type="number" min="1" max="10000" value="50" inputmode="numeric">
                </label>
            </div>
            <div class="condomit-access-code-actions">
                <button type="button" id="condomitGenerateAccessCode" class="condomit-access-code-btn primary"><i class="fas fa-wand-magic-sparkles"></i> Gerar novo código</button>
                <button type="button" id="condomitRevokeAccessCode" class="condomit-access-code-btn danger"><i class="fas fa-ban"></i> Revogar códigos</button>
            </div>
            <div id="condomitAccessCodeResult" class="condomit-access-code-result">
                <small>Este código é mostrado em texto somente agora. Guarde ou compartilhe-o com quem precisa entrar no condomínio.</small>
                <div class="condomit-access-code-value">
                    <strong id="condomitAccessCodeValue">----</strong>
                    <button type="button" id="condomitCopyAccessCode" class="condomit-access-code-copy" aria-label="Copiar código"><i class="fas fa-copy"></i></button>
                </div>
                <small id="condomitAccessCodeMeta"></small>
            </div>
            <div id="condomitAccessCodeFeedback" class="condomit-access-code-feedback" aria-live="polite"></div>
        </section>
    `;
    document.body.appendChild(modal);

    const close = () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    };
    modal.querySelector('.condomit-access-code-close')?.addEventListener('click', close);
    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('open')) close();
    });
    document.getElementById('condomitGenerateAccessCode')?.addEventListener('click', generateCondominiumAccessCode);
    document.getElementById('condomitRevokeAccessCode')?.addEventListener('click', revokeCondominiumAccessCodes);
    document.getElementById('condomitCopyAccessCode')?.addEventListener('click', copyCondominiumAccessCode);
    return modal;
}

async function resolveCondominiumAccessCodeCep() {
    const user = getCurrentUser();
    if (!user?.email) throw new Error('Sessão inválida. Entre novamente.');

    if (typeof window.resolveUserCondominiumCep === 'function') {
        const resolved = await window.resolveUserCondominiumCep(user).catch(() => '');
        if (resolved) return String(resolved).trim();
    }

    const condominium = user.condominium && typeof user.condominium === 'object' ? user.condominium : {};
    const cep = condominium.cep || condominium.condominium_id || user.condominium_cep || user.cep || '';
    if (!String(cep).trim()) throw new Error('Não foi possível identificar o condomínio desta conta.');
    return String(cep).trim();
}

function setCondominiumAccessCodeFeedback(message = '', state = '') {
    const el = document.getElementById('condomitAccessCodeFeedback');
    if (!el) return;
    el.textContent = message;
    el.className = `condomit-access-code-feedback${state ? ` ${state}` : ''}`;
}

async function openCondominiumAccessCodeModal() {
    const user = getCurrentUser();
    const role = typeof window.getNormalizedUserType === 'function'
        ? window.getNormalizedUserType(user || {})
        : String(user?.type || '').trim().toLowerCase();

    if (role !== 'sindico') {
        window.showToast?.('Apenas o síndico pode gerar o código de acesso.', 'error');
        return;
    }
    const modal = ensureCondominiumAccessCodeModal();
    setCondominiumAccessCodeFeedback('Ao gerar um novo código, qualquer código anterior ativo será revogado automaticamente.');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

async function generateCondominiumAccessCode() {
    const button = document.getElementById('condomitGenerateAccessCode');
    const resultBox = document.getElementById('condomitAccessCodeResult');
    const valueEl = document.getElementById('condomitAccessCodeValue');
    const metaEl = document.getElementById('condomitAccessCodeMeta');
    const validHours = Number(document.getElementById('condomitAccessCodeHours')?.value || 168);
    const allowedUses = Number(document.getElementById('condomitAccessCodeUses')?.value || 50);

    if (!Number.isInteger(allowedUses) || allowedUses < 1 || allowedUses > 10000) {
        setCondominiumAccessCodeFeedback('Informe uma quantidade de usos entre 1 e 10.000.', 'error');
        return;
    }

    const original = button?.innerHTML;
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; }
    setCondominiumAccessCodeFeedback('Gerando código seguro...');

    try {
        if (typeof window.supabaseFetch !== 'function') throw new Error('Conexão segura com o Supabase indisponível.');
        const cep = await resolveCondominiumAccessCodeCep();
        const payload = await window.supabaseFetch('/rpc/condomit_create_condominium_access_code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_cep: cep, valid_hours: validHours, allowed_uses: allowedUses })
        });
        const data = Array.isArray(payload) ? payload[0] : payload;
        const code = String(data?.code || '').trim();
        if (!code) throw new Error('O servidor não retornou o código gerado.');

        if (valueEl) valueEl.textContent = code;
        if (metaEl) {
            const expiry = data?.expires_at ? new Date(data.expires_at) : null;
            const expiryText = expiry && !Number.isNaN(expiry.getTime())
                ? expiry.toLocaleString('pt-BR')
                : 'sem data informada';
            metaEl.textContent = `Validade: ${expiryText} • Máximo de ${Number(data?.max_uses || allowedUses)} usos.`;
        }
        resultBox?.classList.add('visible');
        // O banco guarda apenas o hash. Mantemos o código puro somente nesta sessão
        // para que a IA Condomit consiga informá-lo ao próprio síndico sem reduzir a segurança.
        try {
            const normalizedCep = String(data?.cep || cep || '').replace(/\D/g, '');
            sessionStorage.setItem(`condomitAccessCode:${normalizedCep}`, JSON.stringify({
                code,
                cep: normalizedCep,
                expiresAt: data?.expires_at || null,
                maxUses: Number(data?.max_uses || allowedUses),
                createdAt: new Date().toISOString()
            }));
        } catch (_) {}
        setCondominiumAccessCodeFeedback('Código gerado com sucesso. O código anterior, se existia, foi revogado.', 'success');
    } catch (error) {
        console.error('[Código de acesso] Erro ao gerar:', error);
        setCondominiumAccessCodeFeedback(error?.message || 'Não foi possível gerar o código de acesso.', 'error');
    } finally {
        if (button) { button.disabled = false; button.innerHTML = original || '<i class="fas fa-wand-magic-sparkles"></i> Gerar novo código'; }
    }
}

async function revokeCondominiumAccessCodes() {
    const button = document.getElementById('condomitRevokeAccessCode');
    const original = button?.innerHTML;
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Revogando...'; }
    setCondominiumAccessCodeFeedback('Revogando códigos ativos...');

    try {
        if (typeof window.supabaseFetch !== 'function') throw new Error('Conexão segura com o Supabase indisponível.');
        const cep = await resolveCondominiumAccessCodeCep();
        const affected = await window.supabaseFetch('/rpc/condomit_revoke_condominium_access_codes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_cep: cep })
        });
        document.getElementById('condomitAccessCodeResult')?.classList.remove('visible');
        try {
            const cep = await resolveCondominiumAccessCodeCep();
            sessionStorage.removeItem(`condomitAccessCode:${String(cep || '').replace(/\D/g, '')}`);
        } catch (_) {}
        setCondominiumAccessCodeFeedback(`Códigos ativos revogados. Registros afetados: ${Number(affected || 0)}.`, 'success');
    } catch (error) {
        console.error('[Código de acesso] Erro ao revogar:', error);
        setCondominiumAccessCodeFeedback(error?.message || 'Não foi possível revogar os códigos.', 'error');
    } finally {
        if (button) { button.disabled = false; button.innerHTML = original || '<i class="fas fa-ban"></i> Revogar códigos'; }
    }
}

async function copyCondominiumAccessCode() {
    const code = String(document.getElementById('condomitAccessCodeValue')?.textContent || '').trim();
    if (!code || code === '----') return;
    try {
        await navigator.clipboard.writeText(code);
        setCondominiumAccessCodeFeedback('Código copiado para a área de transferência.', 'success');
    } catch (_) {
        setCondominiumAccessCodeFeedback(`Código: ${code}`, 'success');
    }
}
