(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    let currentUser = null;
    let pendingPhoto = null;
    const ADMIN_SWITCH_EMAIL = 'contato.condomit@gmail.com';

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        currentUser = readUser();
        if (!currentUser) {
            window.location.href = 'entrar.html';
            return;
        }
        try {
            if (typeof window.refreshCurrentUserFromDb === 'function') {
                currentUser = await window.refreshCurrentUserFromDb() || currentUser;
            }
        } catch (error) {
            console.warn('Não foi possível atualizar o perfil antes de exibi-lo.', error);
        }
        render();
        bindEvents();
    }

    function readUser() {
        try { return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null'); }
        catch (_) { return null; }
    }

    function normalizedRole(user) {
        const raw = String(user?.user_type || user?.type || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (raw.includes('sind')) return 'sindico';
        if (raw.includes('porteir')) return 'porteiro';
        return 'morador';
    }

    function roleLabel(role) {
        return role === 'sindico' ? 'Síndico' : role === 'porteiro' ? 'Porteiro' : 'Morador';
    }

    function initials(name) {
        return String(name || 'US').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'US';
    }

    function condoData(user) {
        const condo = user?.condominium && typeof user.condominium === 'object' ? user.condominium : {};
        return {
            name: condo.name || condo.condominium_name || user?.condominium_name || 'Não informado',
            cep: condo.cep || user?.condominium_cep || user?.cep || 'Não informado'
        };
    }

    function render() {
        const role = normalizedRole(currentUser);
        const label = roleLabel(role);
        const condo = condoData(currentUser);
        const name = currentUser?.name || 'Usuário';
        const photo = currentUser?.profile_photo || currentUser?.profilePhoto || null;

        $('profileHeroName').textContent = name;
        $('profileNameInput').value = name;
        $('profilePhoneInput').value = currentUser?.phone || '';
        $('profileEmailInput').value = currentUser?.email || '';
        $('profileRoleBadge').innerHTML = `<i class="fas fa-id-badge"></i> ${label}`;
        $('profileRoleText').textContent = label;
        $('profileCondoBadge').innerHTML = `<i class="fas fa-building"></i> ${escapeHtml(condo.name)}`;
        $('profileCondoName').textContent = condo.name;
        $('profileCondoCep').textContent = condo.cep;
        $('profileNameTop').textContent = name;
        $('profileTypeTop').textContent = label;
        $('sidebarApartment').textContent = condo.name;
        $('profilePhotoInitials').textContent = initials(name);
        $('profileAvatarTop').textContent = initials(name);

        const canSwitchRole = String(currentUser?.email || '').trim().toLowerCase() === ADMIN_SWITCH_EMAIL;
        $('profileSwitchRole').hidden = !canSwitchRole;
        setPhoto(photo);
        window.syncAllAvatars?.(currentUser);
    }

    function bindEvents() {
        $('profilePhotoButton')?.addEventListener('click', () => $('profilePhotoInput')?.click());
        $('profilePhotoInput')?.addEventListener('change', handlePhotoChange);
        $('profileForm')?.addEventListener('submit', saveProfile);
    }

    function setPhoto(src) {
        const image = $('profilePhotoImage');
        const initialsEl = $('profilePhotoInitials');
        if (src) {
            image.src = src;
            image.hidden = false;
            initialsEl.hidden = true;
        } else {
            image.removeAttribute('src');
            image.hidden = true;
            initialsEl.hidden = false;
        }
    }

    function handlePhotoChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
            window.showToast?.('Escolha uma imagem PNG, JPG ou WebP.', 'error');
            event.target.value = '';
            return;
        }
        if (file.size > 1.5 * 1024 * 1024) {
            window.showToast?.('A foto deve ter no máximo 1,5 MB.', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            pendingPhoto = String(reader.result || '');
            setPhoto(pendingPhoto);
        };
        reader.onerror = () => window.showToast?.('Não foi possível ler a imagem.', 'error');
        reader.readAsDataURL(file);
    }

    async function saveProfile(event) {
        event.preventDefault();
        const name = String($('profileNameInput')?.value || '').trim();
        const phone = String($('profilePhoneInput')?.value || '').trim();
        if (name.length < 2) {
            window.showToast?.('Informe seu nome completo.', 'warning');
            return;
        }
        const button = $('profileSaveBtn');
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        try {
            if (typeof updateUserByEmail !== 'function') throw new Error('Serviço de atualização de perfil indisponível.');
            const payload = { name, phone };
            if (pendingPhoto) payload.profile_photo = pendingPhoto;
            const updated = await updateUserByEmail(currentUser.email, payload);
            currentUser = { ...currentUser, ...(updated || {}), name, phone };
            if (pendingPhoto) {
                currentUser.profile_photo = pendingPhoto;
                currentUser.profilePhoto = pendingPhoto;
            }
            try { sessionStorage.setItem('condominiumUser', JSON.stringify(currentUser)); } catch (_) {}
            pendingPhoto = null;
            try {
                if (typeof window.refreshCurrentUserFromDb === 'function') currentUser = await window.refreshCurrentUserFromDb() || currentUser;
            } catch (_) {}
            render();
            window.showToast?.('Perfil atualizado com sucesso.', 'success');
        } catch (error) {
            console.error(error);
            window.showToast?.(error?.message || 'Não foi possível atualizar o perfil.', 'error');
        } finally {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-check"></i> Salvar alterações';
        }
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
    }
})();
