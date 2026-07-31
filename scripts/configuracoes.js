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
    const userTypeLabel = currentUser.type === 'sindico' ? 'Síndico' : 'Morador';

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
        if (currentUser.type === 'sindico') {
            unitEl.textContent = 'Administração';
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
        const targetPage = userType === 'morador' ? 'index-morador.html' : 'index.html';
        inicioLink.href = targetPage;
        inicioLink.addEventListener('click', function(event) {
            event.preventDefault();
            window.location.href = targetPage;
        });
    }
}

function logout() {
    if (confirm('Tem certeza que deseja sair da conta?')) {
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
        case 'minha-unidade':
        case 'meus-condominos':
        case 'alterar-senha':
        case 'autenticacao-2fa':
        case 'controle-acesso':
        case 'comunicados-sindico':
        case 'avisos-gerais':
        case 'reserva-areas':
        case 'encomendas':
        case 'minhas-reservas':
        case 'lembretes-reserva':
        case 'confirmacao-cancelamento':
        case 'reserva-area-comum':
        case 'politica-privacidade':
        case 'termos-uso':
        case 'consentimentos':
        case 'info-condominio':
        case 'contato-uteis':
        case 'prestadores-servicos':
        case 'sobre-empresa':
        case 'versao-app':
        case 'novas-atualizacoes':
            alert(`Funcionalidade ainda não implementada: ${sectionKey.replace(/-/g, ' ')}`);
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
                    <h3 style="margin:0;font-size:1.15rem;color:#111827;">Editar perfil</h3>
                    <button type="button" id="ep-close" style="background:transparent;border:none;font-size:1.25rem;cursor:pointer;color:#6b7280;padding:4px 8px;border-radius:6px;">✕</button>
                </div>
                <div class="ep-body" style="flex:1 1 auto;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:18px;">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div id="ep-avatar-preview" class="ep-avatar-preview" style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.5rem;overflow:hidden;flex-shrink:0;"></div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <button type="button" id="ep-choose-photo" class="btn-edit-profile" style="margin:0;padding:8px 14px;font-size:0.9rem;">Alterar foto</button>
                            <span style="font-size:0.8rem;color:#6b7280;">Use JPG, PNG ou WebP (até 10 MB)</span>
                            <input type="file" id="ep-photo-input" accept="image/jpeg,image/jpg,image/png,image/webp" style="display:none;" />
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label for="ep-name" style="font-size:0.85rem;font-weight:600;color:#374151;">Nome completo</label>
                        <input type="text" id="ep-name" style="padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;outline:none;" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label for="ep-email" style="font-size:0.85rem;font-weight:600;color:#374151;">E-mail</label>
                        <input type="email" id="ep-email" style="padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;outline:none;" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <label for="ep-phone" style="font-size:0.85rem;font-weight:600;color:#374151;">Telefone / Celular</label>
                        <input type="tel" id="ep-phone" placeholder="(11) 90000-0000" style="padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:1rem;outline:none;" />
                    </div>
                    <p id="ep-message" style="margin:0;font-size:0.85rem;display:none;padding:10px 12px;border-radius:8px;"></p>
                </div>
                <div style="flex-shrink:0;padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:12px;">
                    <button type="button" id="ep-cancel" class="btn-edit-profile" style="margin:0;padding:10px 18px;">Cancelar</button>
                    <button type="button" id="ep-save" class="btn-edit-profile" style="margin:0;padding:10px 22px;background:#1d4ed8 !important;color:#fff !important;border-color:#1d4ed8 !important;">Salvar</button>
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
    applyTranslations(lang);
}

const translations = {
    pt: {
        config_title: 'Configurações',
        config_subtitle: 'Personalize e gerencie as configurações do sistema',
        theme_label: 'Tema',
        font_size_label: 'Tamanho da fonte',
        language_label: 'Idioma',
        user_profile: 'Perfil do usuário',
        account_profile: 'Conta e Perfil',
        security: 'Segurança e acesso',
        notifications: 'Notificações',
        about: 'Sobre',
        logout: 'Sair da Conta',
    },
    en: {
        config_title: 'Settings',
        config_subtitle: 'Personalize and manage system settings',
        theme_label: 'Theme',
        font_size_label: 'Font size',
        language_label: 'Language',
        user_profile: 'User Profile',
        account_profile: 'Account and Profile',
        security: 'Security and Access',
        notifications: 'Notifications',
        about: 'About',
        logout: 'Sign Out',
    }
};

function applyTranslations(lang) {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });
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
}


