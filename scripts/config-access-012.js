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
                    <label><span>Código de acesso</span><input id="changeCondoPassword012" type="password" autocomplete="off" placeholder="Ex.: A1B2-C3D4" required></label>
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
            const form = event.currentTarget;
            const submit = form.querySelector('button[type="submit"]');
            const fb = document.getElementById('changeCondoFeedback012');
            const rawCep = document.getElementById('changeCondoCep012')?.value || '';
            const cepDigits = String(rawCep).replace(/\D/g, '');
            const password = document.getElementById('changeCondoPassword012')?.value || '';
            const apartment = document.getElementById('changeCondoApartment012')?.value?.trim() || null;
            const block = document.getElementById('changeCondoBlock012')?.value?.trim() || null;

            if (cepDigits.length !== 8 || !password.trim()) {
                feedback(fb, 'Informe um CEP válido e o código de acesso do condomínio.', 'error');
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

    function packageRecipientLabel(user) {
        return String(user?.name || user?.email || 'Usuário').trim();
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
                    <label><span>Destinatário</span><input id="packageRecipient012" type="text" readonly value="${escapeHtml(packageRecipientLabel(user))}" aria-readonly="true"></label>
                    <label><span>E-mail do destinatário</span><input id="packageRecipientEmail012" type="email" readonly value="${escapeHtml(String(user.email || '').trim().toLowerCase())}" aria-readonly="true"></label>
                    <label><span>Dia previsto de chegada</span><input id="packageExpectedDate012" type="date" required></label>
                    <label><span>Horário previsto de chegada</span><input id="packageExpectedTime012" type="time" required></label>
                    <label class="visitor-access-email"><span>Descrição da encomenda</span><input id="packageDescription012" type="text" maxlength="250" placeholder="Ex.: Caixa pequena da Amazon" required></label>
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

        body.querySelector('[data-cancel]').addEventListener('click', () => closeOverlay(overlay));

        const expectedDateInput =
            body.querySelector('#packageExpectedDate012');

        if (expectedDateInput) {
            const today =
                new Date();

            expectedDateInput.min =
                `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }

        openOverlay(overlay);

        body.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            const fb = document.getElementById('packageFeedback012');
            const recipientEmail = String(user.email || '').trim().toLowerCase();
            const recipientName = String(user.name || user.email || '').trim();
            const description = document.getElementById('packageDescription012')?.value.trim() || '';
            const carrier = document.getElementById('packageCarrier012')?.value.trim() || null;
            const tracking = document.getElementById('packageTracking012')?.value.trim() || null;
            const observations = document.getElementById('packageObservations012')?.value.trim() || null;
            const expectedArrivalDate = document.getElementById('packageExpectedDate012')?.value || '';
            const expectedArrivalTime = document.getElementById('packageExpectedTime012')?.value || '';

            if (!recipientEmail || !recipientName || !description || !expectedArrivalDate || !expectedArrivalTime) {
                feedback(fb, 'Preencha a descrição, o dia e o horário previstos de chegada.', 'error');
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
                        expected_arrival_date: expectedArrivalDate,
                        expected_arrival_time: expectedArrivalTime,
                        observations
                    })
                });

                if (!Array.isArray(rows) || !rows[0]?.id) {
                    throw new Error('O banco não confirmou o registro da encomenda.');
                }

                feedback(fb, 'Encomenda registrada com sucesso.', 'success');
                window.showToast?.('Encomenda registrada com sucesso.', 'success');
                form.reset();
                setTimeout(() => closeOverlay(overlay), 700);
            } catch (error) {
                feedback(fb, error?.message || 'Não foi possível registrar a encomenda.', 'error');
            } finally {
                submit.disabled = false;
                submit.textContent = 'Registrar encomenda';
            }
        });
    }


    function currentCondominiumCep(user = currentUser()) {
        const condo = user?.condominium && typeof user.condominium === 'object' ? user.condominium : {};
        return String(condo.cep || condo.condominium_id || condo.condominium_cep || user?.cep || '').trim();
    }

    async function openCondominiumAccessCodeModal() {
        const user = currentUser();
        if (!user?.email || userType(user) !== 'sindico') {
            window.showToast?.('Apenas o síndico pode gerar códigos de acesso.', 'error');
            return;
        }

        const cep = currentCondominiumCep(user);
        if (!cep) {
            window.showToast?.('Não foi possível identificar o condomínio.', 'error');
            return;
        }

        const overlay = ensureOverlay(
            'condominiumAccessCodeModal026',
            'Código de acesso do condomínio',
            'Gere um código temporário para moradores e porteiros entrarem no condomínio. Ao gerar um novo código, o anterior é revogado.'
        );
        const body = overlay.querySelector('[data-body]');
        body.innerHTML = `
            <form id="condominiumAccessCodeForm026" class="visitor-access-form">
                ${formGridHtml(`
                    <label><span>Validade</span>
                        <select id="accessCodeHours026">
                            <option value="24">24 horas</option>
                            <option value="72">3 dias</option>
                            <option value="168" selected>7 dias</option>
                            <option value="720">30 dias</option>
                        </select>
                    </label>
                    <label><span>Limite de usos</span><input id="accessCodeUses026" type="number" min="1" max="10000" value="50" required></label>
                `)}
                <div id="accessCodeResult026" class="visitor-feedback"></div>
                <div class="reservas-modal-footer visitor-access-footer">
                    <button type="button" class="btn-edit-profile" data-cancel>Cancelar</button>
                    <button type="submit" class="btn-edit-profile visitor-submit-btn"><i class="fas fa-key"></i> Gerar novo código</button>
                </div>
            </form>
        `;

        body.querySelector('[data-cancel]').addEventListener('click', () => closeOverlay(overlay));
        body.querySelector('form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const submit = event.currentTarget.querySelector('button[type="submit"]');
            const resultEl = document.getElementById('accessCodeResult026');
            const hours = Number(document.getElementById('accessCodeHours026')?.value || 168);
            const uses = Number(document.getElementById('accessCodeUses026')?.value || 50);
            submit.disabled = true;
            submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            feedback(resultEl, 'Criando código seguro...', 'info');
            try {
                const result = await rpc('condomit_create_condominium_access_code', {
                    target_cep: cep,
                    valid_hours: hours,
                    allowed_uses: uses
                });
                const accessCode = String(result?.code || '').trim();
                if (!accessCode) throw new Error('O banco não retornou o código gerado.');
                resultEl.style.display = 'block';
                resultEl.style.background = '#ecfdf5';
                resultEl.style.color = '#065f46';
                resultEl.innerHTML = `
                    <strong style="display:block;margin-bottom:8px;">Código criado</strong>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <code style="font-size:1.35rem;font-weight:800;letter-spacing:.08em;background:#fff;padding:8px 12px;border-radius:8px;border:1px solid #a7f3d0;">${escapeHtml(accessCode)}</code>
                        <button type="button" id="copyAccessCode026" class="btn-edit-profile"><i class="fas fa-copy"></i> Copiar</button>
                    </div>
                    <small style="display:block;margin-top:9px;">Compartilhe somente com pessoas autorizadas. Este código é exibido apenas agora.</small>
                `;
                document.getElementById('copyAccessCode026')?.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(accessCode);
                        window.showToast?.('Código copiado.', 'success');
                    } catch (_) {
                        window.showToast?.(`Código: ${accessCode}`, 'info');
                    }
                });
            } catch (error) {
                feedback(resultEl, error?.message || 'Não foi possível gerar o código.', 'error');
            } finally {
                submit.disabled = false;
                submit.innerHTML = '<i class="fas fa-key"></i> Gerar novo código';
            }
        });
        openOverlay(overlay);
    }

    window.openChangeCondominiumModal = openChangeCondominiumModal;
    window.openPackageRegistrationModal = openPackageRegistrationModal;
    window.openCondominiumAccessCodeModal = openCondominiumAccessCodeModal;

    document.addEventListener('DOMContentLoaded', () => {
        const codeRow = document.getElementById('condominiumAccessCodeRow');
        if (codeRow) codeRow.hidden = userType(currentUser()) !== 'sindico';
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
