document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in and is a sindico
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }
    if (currentUser.type !== 'sindico') {
        window.location.href = 'assembleia.html';
        return;
    }

    // If sindico doesn't have a plan, redirect to checkout
    if (!currentUser.plan) {
        window.location.href = 'checkout.html';
        return;
    }
    
    // If sindico already has a condo, redirect to index
    if (currentUser.condominium) {
        window.location.href = 'index.html';
        return;
    }
    
    const condoForm = document.getElementById('condoForm');
    const cepInput = document.getElementById('cep');
    const totalBlocksInput = document.getElementById('totalBlocks');
    const blockNamesInputs = document.getElementById('blockNamesInputs');

    // CEP mask
    cepInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 8) value = value.slice(0, 8);
        
        if (value.length > 5) {
            value = `${value.slice(0, 5)}-${value.slice(5)}`;
        }
        
        e.target.value = value;
    });

    // Generate block name inputs
    totalBlocksInput.addEventListener('input', function() {
        const numBlocks = parseInt(this.value) || 0;
        blockNamesInputs.innerHTML = '';
        
        for (let i = 1; i <= numBlocks; i++) {
            const inputDiv = document.createElement('div');
            inputDiv.className = 'block-name-input';
            inputDiv.style = 'display: flex; gap: 10px; margin-bottom: 10px;';
            
            const label = document.createElement('label');
            label.textContent = `Bloco ${i}:`;
            label.style = 'min-width: 70px;';
            
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `blockName${i}`;
            input.placeholder = 'Ex: A';
            input.required = true;
            input.style = 'flex: 1; padding: 14px 16px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 1rem;';
            
            inputDiv.appendChild(label);
            inputDiv.appendChild(input);
            blockNamesInputs.appendChild(inputDiv);
        }
    });

    // Form submission
    condoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const totalApartments = parseInt(document.getElementById('totalApartments').value, 10);
        const totalBlocks = parseInt(document.getElementById('totalBlocks').value, 10);
        const cep = document.getElementById('cep').value.trim();
        const condoName = document.getElementById('condoName').value.trim();
        
        const blockNames = [];
        for (let i = 1; i <= totalBlocks; i++) {
            const blockInput = document.getElementById(`blockName${i}`);
            if (blockInput) {
                blockNames.push(blockInput.value.trim());
            }
        }

        const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
        if (!currentUser) {
            window.location.href = 'entrar.html';
            return;
        }

        const condominiumData = {
            cep: cep,
            condominium_name: condoName,
            total_apartments: totalApartments,
            total_blocks: totalBlocks,
            block_names: blockNames
        };

        try {
            await createCondominium(condominiumData);
            const userUpdates = {
                condominium: {
                    name: condoName,
                    totalApartments: totalApartments,
                    totalBlocks: totalBlocks,
                    blockNames: blockNames,
                    cep: cep
                }
            };
            await updateUserByEmail(currentUser.email, userUpdates);

            // Merge the new updates into the existing currentUser to preserve all fields (like plan!)
            const updatedUser = { ...currentUser, ...userUpdates };
            sessionStorage.setItem('condominiumUser', JSON.stringify(updatedUser));

            alert('Condomínio registrado com sucesso!');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Erro ao registrar condomínio:', error);
            alert(`Não foi possível registrar o condomínio: ${error.message || error}`);
        }
    });
});
