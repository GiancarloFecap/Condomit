(function () {
    const recentLogState = {
        storagePrefix: 'condomit.visitor-recent.'
    };

    function normalizeCpf(value) {
        return String(value || '').replace(/\D/g, '').slice(0, 11);
    }

    function formatCpf(value) {
        const digits = normalizeCpf(value);
        if (digits.length > 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
        if (digits.length > 6) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
        if (digits.length > 3) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
        return digits;
    }

    function formatPhone(value) {
        const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length > 6) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        if (digits.length > 2) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        if (digits.length > 0) return `(${digits})`;
        return '';
    }

    function getCurrentUser() {
        try {
            const raw = sessionStorage.getItem('condominiumUser');
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function getCondominiumKey(user) {
        const condominium = user?.condominium && typeof user.condominium === 'object'
            ? user.condominium
            : {};
        return String(
            condominium.cep ||
            condominium.condominium_id ||
            condominium.condominiumId ||
            user?.cep ||
            'geral'
        ).replace(/\D/g, '') || 'geral';
    }

    function getRecentLogs(user = getCurrentUser()) {
        try {
            return JSON.parse(localStorage.getItem(`${recentLogState.storagePrefix}${getCondominiumKey(user)}`) || '[]');
        } catch (_) {
            return [];
        }
    }

    function pushRecentLog(entry, user = getCurrentUser()) {
        const logs = getRecentLogs(user);
        logs.unshift(entry);
        localStorage.setItem(
            `${recentLogState.storagePrefix}${getCondominiumKey(user)}`,
            JSON.stringify(logs.slice(0, 30))
        );
    }

    function setValue(field, value) {
        if (!field) return;
        field.value = value || '';
    }

    function getResponsibleSnapshot(user) {
        return {
            cpf: user?.cpf || '',
            ...extractResponsibleData(user)
        };
    }

    function setFeedback(form, message, type = 'info') {
        const feedback = form.feedback;
        if (!feedback) return;
        feedback.textContent = message || '';
        feedback.dataset.state = type;
        feedback.style.display = message ? 'block' : 'none';
    }

    function buildFieldMap(root, customMap = {}) {
        const selectors = {
            visitorFullName: '[data-field="visitor-full-name"]',
            visitorCpf: '[data-field="visitor-cpf"]',
            visitorRg: '[data-field="visitor-rg"]',
            visitorPhone: '[data-field="visitor-phone"]',
            visitorEmail: '[data-field="visitor-email"]',
            responsibleCpf: '[data-field="responsible-cpf"]',
            responsibleName: '[data-field="responsible-name"]',
            responsiblePhone: '[data-field="responsible-phone"]',
            responsibleApartment: '[data-field="responsible-apartment"]',
            responsibleBlock: '[data-field="responsible-block"]',
            visitDate: '[data-field="visit-date"]',
            visitTime: '[data-field="visit-time"]',
            visitExitTime: '[data-field="visit-exit-time"]',
            visitNotes: '[data-field="visit-notes"]',
            submit: '[data-action="submit-visitor"]',
            cancel: '[data-action="cancel-visitor"]',
            feedback: '[data-role="visitor-feedback"]'
        };

        const resolved = {};
        Object.entries({ ...selectors, ...customMap }).forEach(([key, selector]) => {
            resolved[key] = selector ? root.querySelector(selector) : null;
        });
        return resolved;
    }

    function extractResponsibleData(user) {
        let condominium = user?.condominium || {};
        if (typeof condominium === 'string') {
            try {
                condominium = JSON.parse(condominium);
            } catch (_) {
                condominium = {};
            }
        }

        return {
            name: user?.name || '',
            phone: user?.phone || '',
            apartment: condominium?.apartment || '',
            block: condominium?.block || ''
        };
    }

    function applyLockedResponsible(form, user) {
        const responsible = getResponsibleSnapshot(user);
        setValue(form.responsibleCpf, formatCpf(responsible.cpf));
        setValue(form.responsibleName, responsible.name);
        setValue(form.responsiblePhone, formatPhone(responsible.phone));
        setValue(form.responsibleApartment, responsible.apartment);
        setValue(form.responsibleBlock, responsible.block);
        form.responsibleCpf?.setAttribute('readonly', 'readonly');
        form.responsibleCpf?.setAttribute('aria-readonly', 'true');
        return responsible;
    }

    async function fillResponsibleByCpf(form, cpf) {
        const normalizedCpf = normalizeCpf(cpf);
        if (normalizedCpf.length !== 11) {
            setValue(form.responsibleName, '');
            setValue(form.responsiblePhone, '');
            setValue(form.responsibleApartment, '');
            setValue(form.responsibleBlock, '');
            return null;
        }

        const currentUser = getCurrentUser();
        const condoIdentifiers = new Set(
            [
                currentUser?.condominium?.cep,
                currentUser?.condominium?.condominium_id,
                currentUser?.condominium?.condominiumId,
                currentUser?.condominium?.id,
                currentUser?.cep,
                currentUser?.condominium_id,
                currentUser?.condominiumId
            ]
                .map((x) => String(x || '').replace(/\D/g, ''))
                .filter(Boolean)
        );

        setFeedback(form, 'Buscando responsável...', 'info');

        let user = null;
        if (typeof window.fetchUserByCpf === 'function') {
            try {
                user = await window.fetchUserByCpf(normalizedCpf);
            } catch (fetchErr) {
                console.warn('Erro ao buscar responsável por CPF:', fetchErr?.message || fetchErr);
                user = null;
            }
        }

        if (user) {
            try {
                const responsibleIdentifiers = new Set(
                    [
                        user.condominium?.cep,
                        user.condominium?.condominium_id,
                        user.condominium?.condominiumId,
                        user.condominium?.id,
                        user.cep,
                        user.condominium_id,
                        user.condominiumId
                    ]
                        .map((x) => String(x || '').replace(/\D/g, ''))
                        .filter(Boolean)
                );

                const userCondo = user?.condominium && typeof user.condominium === 'string'
                    ? (() => { try { return JSON.parse(user.condominium); } catch (_) { return null; } })()
                    : (user?.condominium || null);
                if (userCondo && !responsibleIdentifiers.size) {
                    [
                        userCondo.cep,
                        userCondo.condominium_id,
                        userCondo.condominiumId,
                        userCondo.id
                    ].forEach((val) => {
                        const cleaned = String(val || '').replace(/\D/g, '');
                        if (cleaned) responsibleIdentifiers.add(cleaned);
                    });
                }

                const belongsToCondo =
                    condoIdentifiers.size === 0 ||
                    responsibleIdentifiers.size === 0 ||
                    [...condoIdentifiers].some((x) => responsibleIdentifiers.has(x));

                if (!belongsToCondo) {
                    setFeedback(form, 'CPF do responsável não pertence a este condomínio.', 'error');
                    setValue(form.responsibleName, '');
                    setValue(form.responsiblePhone, '');
                    setValue(form.responsibleApartment, '');
                    setValue(form.responsibleBlock, '');
                    return null;
                }
                if (userCondo && !user.condominium) user.condominium = userCondo;
            } catch (_) {
                console.warn('Aviso: não foi possível validar condomínio do responsável.', _?.message || _);
            }
        }

        if (!user) {
            setValue(form.responsibleName, '');
            setValue(form.responsiblePhone, '');
            setValue(form.responsibleApartment, '');
            setValue(form.responsibleBlock, '');
            setFeedback(form, 'CPF do responsável não encontrado.', 'error');
            return null;
        }

        const responsible = extractResponsibleData(user);
        setValue(form.responsibleName, responsible.name);
        setValue(form.responsiblePhone, formatPhone(responsible.phone));
        setValue(form.responsibleApartment, responsible.apartment);
        setValue(form.responsibleBlock, responsible.block);
        setFeedback(form, '', 'info');
        return user;
    }

    function buildRecentLog(form, currentUser) {
        return {
            fullName: form.visitorFullName?.value.trim() || '',
            cpf: form.visitorCpf?.value.trim() || '',
            responsibleName: form.responsibleName?.value.trim() || currentUser?.name || '',
            apartment: form.responsibleApartment?.value.trim() || '',
            block: form.responsibleBlock?.value.trim() || '',
            phone: form.visitorPhone?.value.trim() || '',
            visitDate: form.visitDate?.value || new Date().toISOString().slice(0, 10),
            visitTime: form.visitTime?.value || new Date().toTimeString().slice(0, 5),
            createdAt: new Date().toISOString()
        };
    }

    async function submitVisitorForm(form, options = {}) {
        const currentUser = options.currentUser || getCurrentUser();
        const payload = {
            cpf: form.visitorCpf?.value || '',
            full_name: form.visitorFullName?.value || '',
            rg: form.visitorRg?.value || '',
            phone: form.visitorPhone?.value || '',
            email: form.visitorEmail?.value || '',
            responsible_cpf: form.responsibleCpf?.value || ''
        };

        if (!payload.full_name.trim() || !normalizeCpf(payload.cpf) || !payload.rg.trim() || !normalizeCpf(payload.responsible_cpf)) {
            setFeedback(form, 'Preencha os campos obrigatórios do visitante e do responsável.', 'error');
            return null;
        }

        if (normalizeCpf(payload.cpf).length !== 11) {
            setFeedback(form, 'O CPF do visitante deve ter 11 dígitos.', 'error');
            return null;
        }

        if (normalizeCpf(payload.responsible_cpf).length !== 11) {
            setFeedback(form, 'O CPF do responsável deve ter 11 dígitos.', 'error');
            return null;
        }

        if (form.submit) {
            form.submit.disabled = true;
            form.submit.classList.add('loading');
        }

        setFeedback(form, 'Registrando visitante...', 'info');

        try {
            if (typeof window.createVisitor !== 'function') {
                throw new Error('Função de cadastro de visitantes não disponível.');
            }

            const created = typeof window.createVisitor === 'function'
                ? await window.createVisitor(payload, currentUser)
                : null;
            if (!created) {
                throw new Error('Não foi possível salvar o visitante no banco de dados. Tente novamente.');
            }
            pushRecentLog(buildRecentLog(form, currentUser), currentUser);
            setFeedback(form, 'Visitante registrado com sucesso.', 'success');

            if (!options.preserveResponsible) {
                form.root.reset();
            } else {
                form.root.reset();
                applyLockedResponsible(form, {
                    ...(currentUser || {}),
                    cpf: payload.responsible_cpf,
                    phone: options.lockedResponsible?.phone || currentUser?.phone || '',
                    name: options.lockedResponsible?.name || currentUser?.name || '',
                    condominium: {
                        ...(currentUser?.condominium || {}),
                        apartment: options.lockedResponsible?.apartment || '',
                        block: options.lockedResponsible?.block || ''
                    }
                });
            }

            if (typeof options.onSuccess === 'function') {
                options.onSuccess(created);
            }

            return created;
        } catch (error) {
            console.error('Erro ao registrar visitante:', error);
            setFeedback(form, error?.message || 'Não foi possível registrar o visitante.', 'error');
            return null;
        } finally {
            if (form.submit) {
                form.submit.disabled = false;
                form.submit.classList.remove('loading');
            }
        }
    }

    function initForm(root, options = {}) {
        const form = buildFieldMap(root, options.fieldMap);
        form.root = root;

        form.visitorCpf?.addEventListener('input', (event) => {
            event.target.value = formatCpf(event.target.value);
        });

        form.responsibleCpf?.addEventListener('input', (event) => {
            event.target.value = formatCpf(event.target.value);
            if (normalizeCpf(event.target.value).length === 11 && !options.lockResponsibleToCurrentUser) {
                fillResponsibleByCpf(form, event.target.value);
            }
        });

        form.visitorPhone?.addEventListener('input', (event) => {
            event.target.value = formatPhone(event.target.value);
        });

        if (!options.lockResponsibleToCurrentUser) {
            form.responsibleCpf?.addEventListener('blur', () => {
                fillResponsibleByCpf(form, form.responsibleCpf.value);
            });
        }

        if (options.lockResponsibleToCurrentUser && options.currentUser) {
            applyLockedResponsible(form, options.currentUser);
        }

        root.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submitVisitorForm(form, {
                ...options,
                currentUser: options.currentUser || getCurrentUser(),
                preserveResponsible: Boolean(options.lockResponsibleToCurrentUser),
                lockedResponsible: options.currentUser ? extractResponsibleData(options.currentUser) : null
            });
        });

        form.cancel?.addEventListener('click', () => {
            if (typeof options.onCancel === 'function') {
                options.onCancel();
            } else {
                root.reset();
                if (options.lockResponsibleToCurrentUser && options.currentUser) {
                    applyLockedResponsible(form, options.currentUser);
                }
                setFeedback(form, '', 'info');
            }
        });

        return form;
    }

    window.visitorRegistration = {
        initForm,
        formatCpf,
        formatPhone,
        normalizeCpf,
        fillResponsibleByCpf,
        getRecentLogs,
        syncLockedResponsible(root, currentUser = getCurrentUser()) {
            if (!root) return null;
            const form = buildFieldMap(root);
            form.root = root;
            return applyLockedResponsible(form, currentUser);
        }
    };
})();
