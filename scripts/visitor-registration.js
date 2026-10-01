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

    async function findResponsibleByCpf(cpf) {
        const normalizedCpf = normalizeCpf(cpf);

        if (normalizedCpf.length !== 11) {
            return null;
        }

        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase não está disponível nesta página.');
        }

        const rows = await window.supabaseFetch(
            '/rpc/condomit_find_responsible_by_cpf',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    target_cpf: normalizedCpf
                })
            }
        );

        return Array.isArray(rows)
            ? (rows[0] || null)
            : (rows || null);
    }

    async function resolveCurrentCondominiumCep(currentUser) {
        if (
            typeof window.resolveUserCondominiumCep === 'function'
        ) {
            const resolved = await window.resolveUserCondominiumCep(
                currentUser
            );

            if (resolved) {
                return resolved;
            }
        }

        let condominium = currentUser?.condominium || {};

        if (typeof condominium === 'string') {
            try {
                condominium = JSON.parse(condominium);
            } catch (_) {
                condominium = {};
            }
        }

        const candidates = [
            condominium?.cep,
            condominium?.condominium_cep,
            condominium?.condominium_id,
            condominium?.condominiumId,
            currentUser?.cep,
            currentUser?.condominium_cep,
            currentUser?.condominium_id,
            currentUser?.condominiumId
        ];

        for (const candidate of candidates) {
            const digits = String(candidate || '').replace(/\D/g, '');

            if (digits.length === 8) {
                return `${digits.slice(0, 5)}-${digits.slice(5)}`;
            }
        }

        return '';
    }

    async function createVisitorSafe(visitor, responsibleUser, currentUser) {
        if (typeof window.supabaseFetch !== 'function') {
            throw new Error('Supabase não está disponível nesta página.');
        }

        if (
            typeof window.resolveSupabaseAccessToken === 'function'
        ) {
            const token = await window.resolveSupabaseAccessToken();

            if (!token) {
                throw new Error(
                    'Sua sessão expirou. Saia da conta, entre novamente e tente cadastrar o visitante.'
                );
            }
        }

        const cep = await resolveCurrentCondominiumCep(currentUser);

        if (!cep) {
            throw new Error(
                'Não foi possível identificar o CEP do condomínio do usuário.'
            );
        }

        const visitorCpf = normalizeCpf(visitor?.cpf);
        const responsibleCpf = String(
            responsibleUser?.cpf || ''
        ).trim();

        if (visitorCpf.length !== 11) {
            throw new Error(
                'Informe um CPF válido para o visitante.'
            );
        }

        if (!responsibleCpf) {
            throw new Error(
                'CPF do responsável não encontrado neste condomínio.'
            );
        }

        const payload = {
            cep,
            cpf: visitorCpf,
            full_name: String(visitor?.full_name || '').trim(),
            rg: String(visitor?.rg || '').trim(),
            phone: String(visitor?.phone || '').trim() || null,
            email: String(visitor?.email || '').trim().toLowerCase() || null,

            /*
             * Mantém exatamente o formato salvo em users.cpf.
             * Isso é necessário porque visitors.responsible_cpf é FK.
             */
            responsible_cpf: responsibleCpf
        };

        if (!payload.full_name) {
            throw new Error(
                'Informe o nome completo do visitante.'
            );
        }

        if (!payload.rg) {
            throw new Error(
                'Informe o RG do visitante.'
            );
        }

        try {
            const data = await window.supabaseFetch(
                '/visitors',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify(payload)
                }
            );

            const saved = Array.isArray(data)
                ? (data[0] || null)
                : (data || null);

            if (!saved) {
                throw new Error(
                    'O Supabase não confirmou o cadastro do visitante.'
                );
            }

            return saved;
        } catch (error) {
            const message = String(
                error?.message || error || ''
            );

            if (
                message.includes('visitors_responsible_cpf_fkey') ||
                message.toLowerCase().includes('foreign key')
            ) {
                throw new Error(
                    'O CPF do responsável não corresponde a um usuário cadastrado.'
                );
            }

            if (
                message.includes('23505') ||
                message.toLowerCase().includes('duplicate key')
            ) {
                throw new Error(
                    'Já existe um visitante cadastrado com este CPF.'
                );
            }

            throw error;
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

        setFeedback(
            form,
            'Buscando responsável...',
            'info'
        );

        try {
            const user = await findResponsibleByCpf(
                normalizedCpf
            );

            if (!user) {
                setValue(form.responsibleName, '');
                setValue(form.responsiblePhone, '');
                setValue(form.responsibleApartment, '');
                setValue(form.responsibleBlock, '');

                setFeedback(
                    form,
                    'CPF do responsável não encontrado neste condomínio.',
                    'error'
                );

                return null;
            }

            const responsible =
                extractResponsibleData(user);

            setValue(
                form.responsibleName,
                responsible.name
            );

            setValue(
                form.responsiblePhone,
                formatPhone(
                    responsible.phone
                )
            );

            setValue(
                form.responsibleApartment,
                responsible.apartment
            );

            setValue(
                form.responsibleBlock,
                responsible.block
            );

            setFeedback(
                form,
                '',
                'info'
            );

            return user;
        } catch (error) {
            console.error(
                'Erro ao buscar responsável:',
                error
            );

            setValue(form.responsibleName, '');
            setValue(form.responsiblePhone, '');
            setValue(form.responsibleApartment, '');
            setValue(form.responsibleBlock, '');

            setFeedback(
                form,
                error?.message ||
                    'Não foi possível buscar o responsável.',
                'error'
            );

            return null;
        }
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
        const currentUser =
            options.currentUser ||
            getCurrentUser();

        const payload = {
            cpf:
                form.visitorCpf?.value ||
                '',

            full_name:
                form.visitorFullName?.value ||
                '',

            rg:
                form.visitorRg?.value ||
                '',

            phone:
                form.visitorPhone?.value ||
                '',

            email:
                form.visitorEmail?.value ||
                '',

            responsible_cpf:
                form.responsibleCpf?.value ||
                ''
        };

        if (
            !payload.full_name.trim() ||
            !normalizeCpf(payload.cpf) ||
            !payload.rg.trim() ||
            !normalizeCpf(payload.responsible_cpf)
        ) {
            setFeedback(
                form,
                'Preencha os campos obrigatórios do visitante e do responsável.',
                'error'
            );

            return null;
        }

        if (
            normalizeCpf(payload.cpf).length !==
            11
        ) {
            setFeedback(
                form,
                'O CPF do visitante deve ter 11 dígitos.',
                'error'
            );

            return null;
        }

        if (
            normalizeCpf(
                payload.responsible_cpf
            ).length !== 11
        ) {
            setFeedback(
                form,
                'O CPF do responsável deve ter 11 dígitos.',
                'error'
            );

            return null;
        }

        if (form.submit) {
            form.submit.disabled =
                true;

            form.submit.classList
                .add('loading');
        }

        setFeedback(
            form,
            'Validando responsável...',
            'info'
        );

        try {
            /*
             * Busca o responsável pelo CPF ignorando
             * pontuação e recupera o valor EXATO de users.cpf.
             */
            const responsibleUser =
                await findResponsibleByCpf(
                    payload.responsible_cpf
                );

            if (!responsibleUser?.cpf) {
                throw new Error(
                    'CPF do responsável não encontrado neste condomínio.'
                );
            }

            setFeedback(
                form,
                'Registrando visitante...',
                'info'
            );

            const created =
                await createVisitorSafe(
                    payload,
                    responsibleUser,
                    currentUser
                );

            pushRecentLog(
                buildRecentLog(
                    form,
                    currentUser
                ),
                currentUser
            );

            setFeedback(
                form,
                'Visitante registrado com sucesso.',
                'success'
            );

            if (
                !options
                    .preserveResponsible
            ) {
                form.root.reset();
            } else {
                form.root.reset();

                applyLockedResponsible(
                    form,
                    {
                        ...(currentUser || {}),

                        cpf:
                            responsibleUser.cpf,

                        phone:
                            options
                                .lockedResponsible
                                ?.phone ||
                            currentUser
                                ?.phone ||
                            '',

                        name:
                            options
                                .lockedResponsible
                                ?.name ||
                            currentUser
                                ?.name ||
                            '',

                        condominium: {
                            ...(currentUser
                                ?.condominium ||
                                {}),

                            apartment:
                                options
                                    .lockedResponsible
                                    ?.apartment ||
                                '',

                            block:
                                options
                                    .lockedResponsible
                                    ?.block ||
                                ''
                        }
                    }
                );
            }

            if (
                typeof options
                    .onSuccess ===
                'function'
            ) {
                options.onSuccess(
                    created
                );
            }

            return created;

        } catch (error) {
            console.error(
                'Erro ao registrar visitante:',
                error
            );

            setFeedback(
                form,
                error?.message ||
                    'Não foi possível registrar o visitante.',
                'error'
            );

            return null;

        } finally {
            if (form.submit) {
                form.submit.disabled =
                    false;

                form.submit.classList
                    .remove('loading');
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
        findResponsibleByCpf,
        createVisitorSafe,
        getRecentLogs,
        syncLockedResponsible(root, currentUser = getCurrentUser()) {
            if (!root) return null;
            const form = buildFieldMap(root);
            form.root = root;
            return applyLockedResponsible(form, currentUser);
        }
    };
})();
