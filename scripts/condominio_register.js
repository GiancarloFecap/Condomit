document.addEventListener('DOMContentLoaded', function() {

    // Check if user is logged in and is a sindico

    let currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }
    if (currentUser.type !== 'sindico') {
        window.location.href = 'assembleia.html';
        return;
    }
    
    // If sindico already has a condo, check for plan/payment
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

    let blockCounter = 0;

    cepInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 8) value = value.slice(0, 8);
        if (value.length > 5) {
            value = `${value.slice(0, 5)}-${value.slice(5)}`;
        }
        e.target.value = value;
        
        if (value.length === 9) {
            buscarCep(value);
        }
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

    cnpjInput.addEventListener('input', function(e) {
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

    phoneInput.addEventListener('input', function(e) {
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

    totalBlocksInput.addEventListener('input', function() {
        const numBlocks = parseInt(this.value) || 0;
        updateBlockInputs(numBlocks);
    });

    addBlockBtn.addEventListener('click', function() {
        const currentCount = parseInt(totalBlocksInput.value) || 0;
        totalBlocksInput.value = currentCount + 1;
        updateBlockInputs(currentCount + 1);
    });

    function updateBlockInputs(num) {
        blockNamesInputs.innerHTML = '';
        for (let i = 0; i < num; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'block-input-wrapper';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Bloco ${i + 1}`;
            input.required = true;
            input.className = 'block-name-input-field';
            
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn-remove';
            removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            removeBtn.addEventListener('click', function() {
                const currentCount = parseInt(totalBlocksInput.value) || 1;
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

    addSpaceBtn.addEventListener('click', function() {
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
        const deleteBtn = newRow.querySelector('.btn-delete');
        deleteBtn.addEventListener('click', function() {
            newRow.remove();
        });
        spacesBody.appendChild(newRow);
    });

    spacesBody.addEventListener('click', function(e) {
        if (e.target.closest('.btn-delete')) {
            const row = e.target.closest('.space-row');
            row.remove();
        }
    });

    cancelBtn.addEventListener('click', function() {
        if (confirm('Tem certeza que deseja cancelar? As alterações não serão salvas.')) {
            condoForm.reset();
            spacesBody.innerHTML = '';
            updateBlockInputs(0);
        }
    });

    condoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const condoName = document.getElementById('condoName').value.trim();
        const cep = document.getElementById('cep').value.trim();
        const address = document.getElementById('address').value.trim();
        const number = document.getElementById('number').value.trim();
        const complement = document.getElementById('complement').value.trim();
        const neighborhood = document.getElementById('neighborhood').value.trim();
        const city = document.getElementById('city').value.trim();
        const state = document.getElementById('state').value;
        
        const totalBlocks = parseInt(document.getElementById('totalBlocks').value) || 0;
        const totalApartments = parseInt(document.getElementById('totalApartments').value) || 0;
        
        const blockInputs = document.querySelectorAll('.block-name-input-field');
        const blockNames = [];
        blockInputs.forEach(input => {
            if (input.value.trim()) {
                blockNames.push(input.value.trim());
            }
        });
        
        const spaceRows = document.querySelectorAll('.space-row');
        const spaces = [];
        spaceRows.forEach(row => {
            const name = row.querySelector('.space-name').value.trim();
            const capacity = row.querySelector('.space-capacity').value;
            const desc = row.querySelector('.space-desc').value.trim();
            if (name) {
                spaces.push({
                    name,
                    capacity: capacity ? parseInt(capacity) : null,
                    description: desc
                });
            }
        });
        
        const cnpj = document.getElementById('cnpj').value.trim();
        const inscricao = document.getElementById('inscricao').value.trim();
        const emailCondo = document.getElementById('emailCondo').value.trim();
        const phone = document.getElementById('phone').value.trim();

        currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
        if (!currentUser) {
            window.location.href = 'entrar.html';
            return;
        }

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
            cnpj,
            municipal_registration: inscricao,
            condominium_email: emailCondo,
            condominium_phone: phone
        };

        try {
            await createCondominium(condominiumData);
            const userUpdates = {
                condominium: {
                    name: condoName,
                    totalApartments,
                    totalBlocks,
                    blockNames,
                    cep,
                    address,
                    address_number: number,
                    complement,
                    neighborhood,
                    city,
                    state,
                    condominium_spaces: spaces
                }
            };
            await updateUserByEmail(currentUser.email, userUpdates);

            const updatedUser = { ...currentUser, ...userUpdates };
            sessionStorage.setItem('condominiumUser', JSON.stringify(updatedUser));

            alert('Condomínio registrado com sucesso!');

            // Now redirect to checkout (if no plan/payment)

            window.location.href = 'checkout.html';
        } catch (error) {
            console.error('Erro ao registrar condomínio:', error);
            alert(`Não foi possível registrar o condomínio: ${error.message || error}`);
        }
    });

    updateBlockInputs(0);
});
