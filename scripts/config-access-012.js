(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function currentUser() {
        try {
            return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null');
        } catch (_) {
            return null;
        }
    }

    function userType(user) {
        if (typeof window.getNormalizedUserType === 'function') {
            return window.getNormalizedUserType(user);
        }
        return String(user?.type || user?.user_type || '').trim().toLowerCase();
    }

    async function rpc(name, payload = {}) {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase indisponível.');
        }
        return window.supabaseFetch(`/rpc/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    function ensureOverlay(id, title, subtitle) {
        let overlay = document.getElementById(id);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'reservas-modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="reservas-modal-card condo-modal-card" style="max-width:640px;">
                <div class="reservas-modal-header">
                    <div>
                        <h3>${escapeHtml(title)}</h3>
                        <p>${escapeHtml(subtitle)}</p>
                    </div>
                    <button type="button" class="reservas-modal-close" data-close aria-label="Fechar"><i class="fas fa-times"></i></button>
                </div>
                <div class="reservas-modal-body" data-body></div>
            </div>
        `;
        overlay.querySelector('[data-close]').addEventListener('click', () => closeOverlay(overlay));
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeOverlay(overlay);
        });
        document.body.appendChild(overlay);
        return overlay;
    }

    function openOverlay(overlay) {
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function closeOverlay(overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function feedback(el, text, kind = 'info') {
        if (!el) return;
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
        el.style.padding = text ? '10px 12px' : '';
        el.style.borderRadius = '8px';
        el.style.marginTop = text ? '8px' : '';
        if (kind === 'error') {
            el.style.background = '#fef2f2';
            el.style.color = '#b91c1c';
        } else if (kind === 'success') {
            el.style.background = '#ecfdf5';
            el.style.color = '#047857';
        } else {
            el.style.background = '#eff6ff';
            el.style.color = '#1d4ed8';
        }
    }

    function formGridHtml(inner) {
        return `<div class="visitor-access-grid">${inner}</div>`;
    }

    async function openChangeCondominiumModal() {
        const user = currentUser();
        if (!user?.email) {
            window.showToast?.('Sua sessão expirou. Entre novamente.', 'error');
            return;
        }

        const overlay = ensureOverlay(
            'changeCondominiumModal012',
            'Mudar de condomínio',
            'Informe o novo condomínio. A alteração só é concluída após a validação.'
        );
        const body = overlay.querySelector('[data-body]');
        const role = userType(user);
        const needsUnit = role === 'morador';

        body.innerHTML = `
            <form id="changeCondominiumForm012" class="visitor-access-form">
                ${formGridHtml(`
                    <label><span>CEP do condomínio</span><input id="changeCondoCep012" type="text" maxlength="9" placeholder="00000-000" required></label>
                    <label><span>Senha do condomínio</span><input id="changeCondoPassword012" type="password" required></label>
                    ${needsUnit ? '<label><span>Apartamento</span><input id="changeCondoApartment012" type="text" required></label>' : ''}
                    ${needsUnit ? '<label><span>Bloco</span><input id="changeCondoBlock012" type="text" required></label>' : ''}
                `)}
                <div id="changeCondoFeedback012" class="visitor-feedback"></div>
                <div class="reservas-modal-footer visitor-access-footer">
                    <button type="button" class="btn-edit-profile" data-cancel>Cancelar</button>
                    <button type="submit" class="btn-edit-profile visitor-submit-btn">Mudar condomínio</button>
                </div>
            </form>
        `;

        body.querySelector('[data-cancel]').addEventListener('click', () => closeOverlay(overlay));
        body.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            const fb = document.getElementById('changeCondoFeedback012');
            const rawCep = document.getElementById('changeCondoCep012')?.value || '';
            const cepDigits = String(rawCep).replace(/\D/g, '');
            const password = document.getElementById('changeCondoPassword012')?.value || '';
            const apartment = document.getElementById('changeCondoApartment012')?.value?.trim() || null;
            const block = document.getElementById('changeCondoBlock012')?.value?.trim() || null;

            if (cepDigits.length !== 8 || !password.trim()) {
                feedback(fb, 'Informe um CEP válido e a senha do condomínio.', 'error');
                return;
            }

            submit.disabled = true;
            submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Alterando...';
            feedback(fb, 'Validando condomínio...', 'info');
            try {
                const result = await rpc('condomit_change_my_condominium', {
                    target_cep: `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`,
                    condominium_password: password,
                    target_apartment: apartment,
                    target_block: block
                });

                const updatedCondo = result && typeof result === 'object' ? result : {};
                const updatedUser = { ...user, condominium: updatedCondo };
                sessionStorage.setItem('condominiumUser', JSON.stringify(updatedUser));
                feedback(fb, 'Condomínio alterado com sucesso.', 'success');
                window.showToast?.('Condomínio alterado com sucesso.', 'success');
                setTimeout(() => {
                    closeOverlay(overlay);
                    if (typeof window.redirectToHome === 'function') window.redirectToHome();
                    else window.location.reload();
                }, 700);
            } catch (error) {
                feedback(fb, error?.message || 'Não foi possível mudar de condomínio.', 'error');
            } finally {
                submit.disabled = false;
                submit.textContent = 'Mudar condomínio';
            }
        });

        openOverlay(overlay);
    }

    async function loadPackageRecipients(select) {
        select.innerHTML = '<option value="">Carregando moradores...</option>';
        const rows = await rpc('condomit_list_package_recipients', {});
        const residents = Array.isArray(rows) ? rows : [];
        if (!residents.length) {
            select.innerHTML = '<option value="">Nenhum morador vinculado ao condomínio</option>';
            return [];
        }
        select.innerHTML = '<option value="">Selecione o destinatário</option>' + residents.map((resident) => {
            const unit = [resident.block ? `Bloco ${resident.block}` : '', resident.apartment ? `Apto ${resident.apartment}` : ''].filter(Boolean).join(' • ');
            return `<option value="${escapeHtml(resident.email)}" data-name="${escapeHtml(resident.name)}">${escapeHtml(resident.name)}${unit ? ` — ${escapeHtml(unit)}` : ''}</option>`;
        }).join('');
        return residents;
    }

    async function openPackageRegistrationModal() {
        const user = currentUser();
        if (!user?.email) {
            window.showToast?.('Sua sessão expirou. Entre novamente.', 'error');
            return;
        }

        const overlay = ensureOverlay(
            'packageRegistrationModal012',
            'Registrar encomenda',
            'A encomenda ficará disponível para a portaria e para a página de autorização de entregas.'
        );
        const body = overlay.querySelector('[data-body]');
        body.innerHTML = `
            <form id="packageRegistrationForm012" class="visitor-access-form">
                ${formGridHtml(`
                    <label class="visitor-access-email"><span>Destinatário</span><select id="packageRecipient012" required></select></label>
                    <label><span>Descrição da encomenda</span><input id="packageDescription012" type="text" maxlength="250" placeholder="Ex.: Caixa pequena da Amazon" required></label>
                    <label><span>Transportadora</span><input id="packageCarrier012" type="text" maxlength="120" placeholder="Opcional"></label>
                    <label><span>Código de rastreio</span><input id="packageTracking012" type="text" maxlength="120" placeholder="Opcional"></label>
                    <label class="visitor-access-email"><span>Observações</span><textarea id="packageObservations012" maxlength="500" placeholder="Opcional" style="min-height:90px;"></textarea></label>
                `)}
                <div id="packageFeedback012" class="visitor-feedback"></div>
                <div class="reservas-modal-footer visitor-access-footer">
                    <button type="button" class="btn-edit-profile" data-cancel>Cancelar</button>
                    <button type="submit" class="btn-edit-profile visitor-submit-btn">Registrar encomenda</button>
                </div>
            </form>
        `;

        const select = document.getElementById('packageRecipient012');
        body.querySelector('[data-cancel]').addEventListener('click', () => closeOverlay(overlay));
        openOverlay(overlay);

        try {
            await loadPackageRecipients(select);
        } catch (error) {
            feedback(document.getElementById('packageFeedback012'), error?.message || 'Não foi possível carregar os moradores.', 'error');
        }

        body.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            const fb = document.getElementById('packageFeedback012');
            const recipientEmail = select.value;
            const selected = select.options[select.selectedIndex];
            const recipientName = selected?.dataset?.name || selected?.textContent?.split(' — ')[0]?.trim() || '';
            const description = document.getElementById('packageDescription012')?.value.trim() || '';
            const carrier = document.getElementById('packageCarrier012')?.value.trim() || null;
            const tracking = document.getElementById('packageTracking012')?.value.trim() || null;
            const observations = document.getElementById('packageObservations012')?.value.trim() || null;

            if (!recipientEmail || !recipientName || !description) {
                feedback(fb, 'Selecione o destinatário e informe a descrição da encomenda.', 'error');
                return;
            }

            submit.disabled = true;
            submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            feedback(fb, 'Registrando encomenda...', 'info');
            try {
                let cep = '';
                if (typeof window.resolveUserCondominiumCep === 'function') {
                    cep = await window.resolveUserCondominiumCep(user).catch(() => '');
                }
                if (!cep) {
                    const rpcCep = await rpc('condomit_current_user_cep', {});
                    cep = typeof rpcCep === 'string' ? rpcCep : '';
                }
                if (!cep) throw new Error('Não foi possível identificar o condomínio.');

                const rows = await window.supabaseFetch('/packages', {
                    method: 'POST',
                    headers: { Prefer: 'return=representation' },
                    body: JSON.stringify({
                        cep,
                        recipient_email: recipientEmail,
                        recipient_name: recipientName,
                        package_description: description,
                        carrier,
                        tracking_code: tracking,
                        received_by: user.name || user.email,
                        status: 'Aguardando retirada',
                        observations
                    })
                });

                if (!Array.isArray(rows) || !rows[0]?.id) {
                    throw new Error('O banco não confirmou o registro da encomenda.');
                }

                feedback(fb, 'Encomenda registrada com sucesso.', 'success');
                window.showToast?.('Encomenda registrada com sucesso.', 'success');
                event.currentTarget.reset();
                setTimeout(() => closeOverlay(overlay), 700);
            } catch (error) {
                feedback(fb, error?.message || 'Não foi possível registrar a encomenda.', 'error');
            } finally {
                submit.disabled = false;
                submit.textContent = 'Registrar encomenda';
            }
        });
    }

    window.openChangeCondominiumModal = openChangeCondominiumModal;
    window.openPackageRegistrationModal = openPackageRegistrationModal;

    document.addEventListener('DOMContentLoaded', () => {
        if (window.location.hash === '#registrar-encomenda') {
            setTimeout(() => openPackageRegistrationModal(), 100);
        }
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            ['changeCondominiumModal012', 'packageRegistrationModal012'].forEach((id) => {
                const overlay = document.getElementById(id);
                if (overlay?.classList.contains('open')) closeOverlay(overlay);
            });
        });
    });
})();
