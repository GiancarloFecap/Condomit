document.addEventListener('DOMContentLoaded', function () {
    let currentUser = readCurrentUser();
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }

    const normalizedType = String(currentUser.type || currentUser.user_type || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (normalizedType !== 'sindico') {
        window.location.href = 'assembleia.html';
        return;
    }

    // Se o síndico já possui condomínio, o cadastro não deve ser repetido.
    if (currentUser.condominium) {
        window.location.href = 'index.html';
        return;
    }

    const condoForm = document.getElementById('condoForm');
    const cepInput = document.getElementById('cep');
    const cnpjInput = document.getElementById('cnpj');
    const phoneInput = document.getElementById('phone');
    const totalBlocksInput = document.getElementById('totalBlocks');
    const blockNamesInputs = document.getElementById('blockNamesInputs');
    const addBlockBtn = document.getElementById('addBlockBtn');
    const addSpaceBtn = document.getElementById('addSpaceBtn');
    const spacesBody = document.getElementById('spacesBody');
    const cancelBtn = document.querySelector('.btn-cancel');
    const submitBtn = condoForm?.querySelector('.btn-submit');
    const regulationInput = document.getElementById('regulamento');
    const logoInput = document.getElementById('logoCondo');

    const uploadedDuringSubmit = [];

    cepInput?.addEventListener('input', function (e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 8) value = value.slice(0, 8);
        if (value.length > 5) value = `${value.slice(0, 5)}-${value.slice(5)}`;
        e.target.value = value;
        if (value.length === 9) buscarCep(value);
    });

    async function buscarCep(cep) {
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, '')}/json/`);
            const data = await response.json();
            if (!data.erro) {
                document.getElementById('address').value = data.logradouro || '';
                document.getElementById('neighborhood').value = data.bairro || '';
                document.getElementById('city').value = data.localidade || '';
                document.getElementById('state').value = data.uf || '';
            }
        } catch (error) {
            console.error('Erro ao buscar CEP:', error);
        }
    }

    cnpjInput?.addEventListener('input', function (e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 14) value = value.slice(0, 14);
        if (value.length > 12) {
            value = `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8, 12)}-${value.slice(12)}`;
        } else if (value.length > 8) {
            value = `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5, 8)}/${value.slice(8)}`;
        } else if (value.length > 5) {
            value = `${value.slice(0, 2)}.${value.slice(2, 5)}.${value.slice(5)}`;
        } else if (value.length > 2) {
            value = `${value.slice(0, 2)}.${value.slice(2)}`;
        }
        e.target.value = value;
    });

    phoneInput?.addEventListener('input', function (e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        if (value.length > 10) {
            value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
        } else if (value.length > 6) {
            value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
        } else if (value.length > 2) {
            value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
        } else if (value.length > 0) {
            value = `(${value}`;
        }
        e.target.value = value;
    });

    totalBlocksInput?.addEventListener('input', function () {
        const numBlocks = Math.max(0, parseInt(this.value, 10) || 0);
        updateBlockInputs(numBlocks);
    });

    addBlockBtn?.addEventListener('click', function () {
        const currentCount = Math.max(0, parseInt(totalBlocksInput.value, 10) || 0);
        totalBlocksInput.value = currentCount + 1;
        updateBlockInputs(currentCount + 1);
    });

    /**
     * Mantém os nomes já digitados ao aumentar/diminuir a quantidade.
     * Ao diminuir, somente os últimos blocos são descartados.
     */
    function updateBlockInputs(num) {
        const requestedCount = Math.max(0, Number(num) || 0);
        const previousValues = Array.from(
            blockNamesInputs.querySelectorAll('.block-name-input-field')
        ).map((input) => input.value);

        blockNamesInputs.innerHTML = '';

        for (let i = 0; i < requestedCount; i += 1) {
            const wrapper = document.createElement('div');
            wrapper.className = 'block-input-wrapper';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Bloco ${i + 1}`;
            input.required = true;
            input.className = 'block-name-input-field';
            input.value = previousValues[i] || '';
            input.autocomplete = 'off';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-remove';
            removeBtn.title = 'Remover o último bloco';
            removeBtn.setAttribute('aria-label', 'Remover o último bloco');
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.addEventListener('click', function () {
                const currentCount = Math.max(1, parseInt(totalBlocksInput.value, 10) || 1);
                if (currentCount > 1) {
                    totalBlocksInput.value = currentCount - 1;
                    updateBlockInputs(currentCount - 1);
                }
            });

            wrapper.appendChild(input);
            wrapper.appendChild(removeBtn);
            blockNamesInputs.appendChild(wrapper);
        }
    }

    addSpaceBtn?.addEventListener('click', function () {
        const newRow = document.createElement('tr');
        newRow.className = 'space-row';
        newRow.innerHTML = `
            <td><input type="text" class="space-name" placeholder="Nome do espaço"></td>
            <td><input type="number" class="space-capacity" placeholder="0"></td>
            <td><input type="text" class="space-desc" placeholder="Descrição"></td>
            <td>
                <button type="button" class="btn-edit"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-delete"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        spacesBody.appendChild(newRow);
    });

    spacesBody?.addEventListener('click', function (e) {
        if (e.target.closest('.btn-delete')) {
            e.target.closest('.space-row')?.remove();
        }
    });

    bindFilePresentation(regulationInput, 'Word (.doc ou .docx) até 10MB');
    bindFilePresentation(logoInput, 'PNG ou JPG até 2MB');

    cancelBtn?.addEventListener('click', function () {
        if (confirm('Tem certeza que deseja cancelar? As alterações não serão salvas.')) {
            condoForm.reset();
            spacesBody.innerHTML = '';
            updateBlockInputs(0);
            window.location.href = '../inicio.html';
        }
    });

    condoForm?.addEventListener('submit', async function (e) {
        e.preventDefault();
        uploadedDuringSubmit.length = 0;

        const condoName = document.getElementById('condoName').value.trim();
        const cep = document.getElementById('cep').value.trim();
        const address = document.getElementById('address').value.trim();
        const number = document.getElementById('number').value.trim();
        const complement = document.getElementById('complement').value.trim();
        const neighborhood = document.getElementById('neighborhood').value.trim();
        const city = document.getElementById('city').value.trim();
        const state = document.getElementById('state').value;
        const totalBlocks = parseInt(document.getElementById('totalBlocks').value, 10) || 0;
        const totalApartments = parseInt(document.getElementById('totalApartments').value, 10) || 0;

        const blockNames = Array.from(document.querySelectorAll('.block-name-input-field'))
            .map((input) => input.value.trim())
            .filter(Boolean);

        if (blockNames.length !== totalBlocks) {
            window.showToast?.('Preencha o nome de todos os blocos cadastrados.', 'warning');
            return;
        }

        const spaces = Array.from(document.querySelectorAll('.space-row'))
            .map((row) => {
                const name = row.querySelector('.space-name')?.value.trim() || '';
                const capacity = row.querySelector('.space-capacity')?.value || '';
                const description = row.querySelector('.space-desc')?.value.trim() || '';
                return name
                    ? { name, capacity: capacity ? parseInt(capacity, 10) : null, description }
                    : null;
            })
            .filter(Boolean);

        const cnpj = document.getElementById('cnpj').value.trim();
        const inscricao = document.getElementById('inscricao').value.trim();
        const emailCondo = document.getElementById('emailCondo').value.trim();
        const phone = document.getElementById('phone').value.trim();

        currentUser = readCurrentUser();
        if (!currentUser) {
            window.location.href = 'entrar.html';
            return;
        }

        setSubmitting(true);

        try {
            const assetInfo = await uploadOptionalCondominiumAssets();

            const condominiumData = {
                cep,
                condominium_name: condoName,
                address,
                address_number: number,
                complement,
                neighborhood,
                city,
                state,
                total_apartments: totalApartments,
                total_blocks: totalBlocks,
                block_names: blockNames,
                condominium_spaces: spaces,
                cnpj: cnpj || null,
                municipal_registration: inscricao || null,
                condominium_email: emailCondo || null,
                condominium_phone: phone || null,
                logo_url: assetInfo.logoUrl || null,
                logo_storage_path: assetInfo.logoPath || null,
                internal_regulation_path: assetInfo.regulationPath || null,
                internal_regulation_name: assetInfo.regulationName || null,
                internal_regulation_mime: assetInfo.regulationMime || null,
                internal_regulation_uploaded_at: assetInfo.regulationPath ? new Date().toISOString() : null
            };

            await createCondominium(condominiumData);

            const userUpdates = {
                condominium: {
                    name: condoName,
                    condominium_name: condoName,
                    totalApartments,
                    totalBlocks,
                    blockNames,
                    cep,
                    condominium_id: cep,
                    address,
                    address_number: number,
                    complement,
                    neighborhood,
                    city,
                    state,
                    condominium_spaces: spaces,
                    logo_url: assetInfo.logoUrl || null,
                    logoUrl: assetInfo.logoUrl || null,
                    internal_regulation_path: assetInfo.regulationPath || null,
                    internal_regulation_name: assetInfo.regulationName || null
                }
            };

            await updateUserByEmail(currentUser.email, userUpdates);

            const updatedUser = { ...currentUser, ...userUpdates };
            sessionStorage.setItem('condominiumUser', JSON.stringify(updatedUser));
            try { window.persistCondomitUser?.(updatedUser); } catch (_) {}

            window.showToast?.('Condomínio registrado com sucesso!', 'success');
            window.location.href = 'checkout.html';
        } catch (error) {
            console.error('Erro ao registrar condomínio:', error);
            await cleanupUploadedAssets();
            window.showToast?.(
                `Não foi possível registrar o condomínio: ${error?.message || error}`,
                'error'
            );
        } finally {
            setSubmitting(false);
        }
    });

    function readCurrentUser() {
        try {
            const raw = sessionStorage.getItem('condominiumUser');
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function setSubmitting(active) {
        if (!submitBtn) return;
        submitBtn.disabled = Boolean(active);
        if (active) {
            if (!submitBtn.dataset.originalHtml) submitBtn.dataset.originalHtml = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
        } else {
            submitBtn.innerHTML = submitBtn.dataset.originalHtml || 'Registrar Condomínio';
        }
    }

    function bindFilePresentation(input, defaultText) {
        if (!input) return;
        const container = input.closest('.file-upload');
        const info = container?.querySelector('.file-info');
        input.addEventListener('change', () => {
            if (!info) return;
            info.textContent = input.files?.[0]?.name || defaultText;
        });
    }

    async function waitForSupabaseClient() {
        for (let i = 0; i < 80; i += 1) {
            if (window.supabase?.storage && window.supabase?.auth) return window.supabase;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('O serviço de armazenamento não foi carregado. Atualize a página e tente novamente.');
    }

    function getFileExtension(fileName) {
        const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        return match ? match[1] : '';
    }

    function validateRegulation(file) {
        if (!file) return;
        const ext = getFileExtension(file.name);
        if (!['doc', 'docx'].includes(ext)) {
            throw new Error('O regulamento interno deve ser um arquivo Word (.doc ou .docx).');
        }
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('O regulamento interno deve ter no máximo 10 MB.');
        }
    }

    function validateLogo(file) {
        if (!file) return;
        const ext = getFileExtension(file.name);
        if (!['png', 'jpg', 'jpeg'].includes(ext)) {
            throw new Error('A logo do condomínio deve ser PNG ou JPG.');
        }
        if (file.size > 2 * 1024 * 1024) {
            throw new Error('A logo do condomínio deve ter no máximo 2 MB.');
        }
    }

    async function uploadOptionalCondominiumAssets() {
        const regulation = regulationInput?.files?.[0] || null;
        const logo = logoInput?.files?.[0] || null;

        validateRegulation(regulation);
        validateLogo(logo);

        if (!regulation && !logo) {
            return {
                logoUrl: null,
                logoPath: null,
                regulationPath: null,
                regulationName: null,
                regulationMime: null
            };
        }

        const supabase = await waitForSupabaseClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user?.id) {
            throw new Error('Sua sessão expirou. Entre novamente antes de registrar o condomínio.');
        }

        const ownerId = authData.user.id;
        const result = {
            logoUrl: null,
            logoPath: null,
            regulationPath: null,
            regulationName: null,
            regulationMime: null
        };

        if (logo) {
            const ext = getFileExtension(logo.name) === 'jpeg' ? 'jpg' : getFileExtension(logo.name);
            const path = `${ownerId}/condominio-logo-${Date.now()}.${ext}`;
            const { error } = await supabase.storage
                .from('condomit-condominium-logos')
                .upload(path, logo, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: logo.type || (ext === 'png' ? 'image/png' : 'image/jpeg')
                });
            if (error) throw new Error(`Não foi possível armazenar a logo do condomínio: ${error.message}`);

            uploadedDuringSubmit.push({ bucket: 'condomit-condominium-logos', path });
            const { data: publicData } = supabase.storage
                .from('condomit-condominium-logos')
                .getPublicUrl(path);

            result.logoPath = path;
            result.logoUrl = publicData?.publicUrl || null;
        }

        if (regulation) {
            const ext = getFileExtension(regulation.name);
            const path = `${ownerId}/regulamento-interno-${Date.now()}.${ext}`;
            const mime = regulation.type || (
                ext === 'docx'
                    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    : 'application/msword'
            );
            const { error } = await supabase.storage
                .from('condomit-condominium-regulations')
                .upload(path, regulation, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: mime
                });
            if (error) throw new Error(`Não foi possível armazenar o regulamento interno: ${error.message}`);

            uploadedDuringSubmit.push({ bucket: 'condomit-condominium-regulations', path });
            result.regulationPath = path;
            result.regulationName = regulation.name;
            result.regulationMime = mime;
        }

        return result;
    }

    async function cleanupUploadedAssets() {
        if (!uploadedDuringSubmit.length || !window.supabase?.storage) return;
        const copy = [...uploadedDuringSubmit];
        uploadedDuringSubmit.length = 0;
        for (const item of copy) {
            try {
                await window.supabase.storage.from(item.bucket).remove([item.path]);
            } catch (_) {}
        }
    }

    updateBlockInputs(0);
});
