(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    let currentUser = null;
    let pendingPhoto = null;
    let verifiedAdminSwitch = false;
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
        verifiedAdminSwitch = await verifyAdminSwitchIdentity();
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

        const currentEmail = String(currentUser?.email || '').trim().toLowerCase();
        renderRoleSwitchButton(verifiedAdminSwitch && currentEmail === ADMIN_SWITCH_EMAIL);
        setPhoto(photo);
        window.syncAllAvatars?.(currentUser);
    }

    function renderRoleSwitchButton(canSwitch) {
        const hero = document.querySelector('.profile-hero');
        if (!hero) return;
        let button = $('profileSwitchRole');
        if (!canSwitch) {
            button?.remove();
            return;
        }
        if (button) return;
        button = document.createElement('a');
        button.href = 'acesso-demonstracao.html';
        button.className = 'profile-switch-role';
        button.id = 'profileSwitchRole';
        button.innerHTML = '<i class="fas fa-repeat"></i> Trocar tipo de usuário';
        hero.appendChild(button);
    }

    async function verifyAdminSwitchIdentity() {
        try {
            const auth = window.supabase?.auth;
            if (!auth) return false;

            if (typeof auth.getUser === 'function') {
                const { data, error } = await auth.getUser();
                if (error) throw error;
                return String(data?.user?.email || '').trim().toLowerCase() === ADMIN_SWITCH_EMAIL;
            }

            if (typeof auth.getSession === 'function') {
                const { data, error } = await auth.getSession();
                if (error) throw error;
                return String(data?.session?.user?.email || '').trim().toLowerCase() === ADMIN_SWITCH_EMAIL;
            }
        } catch (error) {
            console.warn('Não foi possível validar a permissão administrativa do perfil.', error);
        }
        return false;
    }

    function bindEvents() {
        $('profilePhotoButton')?.addEventListener('click', () => $('profilePhotoInput')?.click());
        $('profilePhotoInput')?.addEventListener('change', handlePhotoChange);
        $('profileForm')?.addEventListener('submit', saveProfile);
        $('profileLogoutBtn')?.addEventListener('click', logoutAccount);
        $('profileDeleteBtn')?.addEventListener('click', deleteAccount);
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
            button.innerHTML = '<i class="fas fa-check"></i> Salvar informações';
        }
    }

    async function logoutAccount() {
        const confirmed = window.confirm('Deseja sair da sua conta?');
        if (!confirmed) return;

        const button = $('profileLogoutBtn');
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saindo...';
        }

        try {
            if (typeof window.performFullLogout === 'function') {
                await window.performFullLogout('entrar.html');
                return;
            }
            try { await window.supabase?.auth?.signOut?.({ scope: 'global' }); } catch (_) {}
            try { sessionStorage.clear(); } catch (_) {}
            try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
            window.location.replace('entrar.html');
        } catch (error) {
            console.error(error);
            window.showToast?.('Não foi possível sair da conta.', 'error');
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-right-from-bracket"></i> Sair da conta';
            }
        }
    }

    async function deleteAccount() {
        const email = String(currentUser?.email || '').trim().toLowerCase();
        if (!email) {
            window.showToast?.('Não foi possível identificar a conta autenticada.', 'error');
            return;
        }

        const confirmed = window.confirm(
            'Excluir sua conta permanentemente?\n\nEsta ação remove sua conta e não pode ser desfeita.'
        );
        if (!confirmed) return;

        const finalConfirmation = window.confirm(
            `Confirme novamente a exclusão da conta ${email}.`
        );
        if (!finalConfirmation) return;

        const button = $('profileDeleteBtn');
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
        }

        try {
            const accessToken = typeof window.resolveSupabaseAccessToken === 'function'
                ? await window.resolveSupabaseAccessToken()
                : (typeof window.getSupabaseAccessToken === 'function' ? window.getSupabaseAccessToken() : null);

            if (!accessToken) {
                throw new Error('Sua sessão expirou. Entre novamente antes de excluir a conta.');
            }

            const response = await fetch(`/api/users?email=${encodeURIComponent(email)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || payload?.message || 'Não foi possível excluir a conta.');
            }

            try { sessionStorage.clear(); } catch (_) {}
            try { window.clearPersistedCondomitUser?.(); } catch (_) {}
            try { localStorage.removeItem('condominiumPersistentUser'); } catch (_) {}
            try { localStorage.setItem('authExplicitLogoutAt', String(Date.now())); } catch (_) {}
            window.location.replace('entrar.html?deleted=1');
        } catch (error) {
            console.error(error);
            window.showToast?.(error?.message || 'Não foi possível excluir a conta.', 'error');
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-trash-can"></i> Excluir conta';
            }
        }
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
    }
})();
