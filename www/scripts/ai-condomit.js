(() => {
    'use strict';

    const state = { user: null, history: [] };
    const $ = (id) => document.getElementById(id);
    const appLanguage = () => { try { return localStorage.getItem('app-language') === 'en' ? 'en' : 'pt'; } catch (_) { return 'pt'; } };
    const isEnglish = () => appLanguage() === 'en';

    const AI_EN_REPLACEMENTS = [
        ['O código de acesso do condomínio é uma informação administrativa exclusiva do síndico. Entre em contato com o síndico do seu condomínio para receber as orientações necessárias.', 'The condominium access code is administrative information available only to the property manager. Contact your property manager for the necessary instructions.'],
        ['Como síndico, você pode gerar o código em Configurações → Condomínio → Gerar código de acesso. O novo código revoga automaticamente o anterior. Se preferir, posso gerar um código agora pelo próprio chat.', 'As the property manager, you can generate the code in Settings → Condominium → Generate access code. A new code automatically revokes the previous one. If you prefer, I can generate one now in this chat.'],
        ['Não encontrei manutenções preventivas atrasadas neste momento.', 'I did not find any overdue preventive maintenance items at this time.'],
        ['Nova conversa iniciada.', 'New conversation started.'],
        ['Não consegui consultar o código de acesso agora.', 'I could not check the access code right now.'],
        ['tente novamente.', 'please try again.'],
        ['Você pode fazer reservas pela página de Reservas. Nela você consulta locais disponíveis, horários e acompanha as suas próprias reservas.', 'You can make reservations on the Reservations page. There you can check available common areas and times and manage your own reservations.'],
        ['Como porteiro, você pode consultar os visitantes do condomínio, liberar ou revogar entradas e acompanhar os registros de acesso.', 'As a doorman, you can view condominium visitors, authorize or revoke entry and monitor access records.'],
        ['Você pode cadastrar um visitante em Configurações, na área Segurança e acesso. O cadastro fica vinculado ao seu condomínio para que a portaria possa consultá-lo.', 'You can register a visitor in Settings, under Security and access. The registration is linked to your condominium so the front desk can view it.'],
        ['Na área de Assembleias você acompanha reuniões agendadas e realizadas. Durante a chamada é possível participar do chat, levantar a mão e votar. Depois do encerramento, a ata reúne os registros persistidos e as votações.', 'In Assemblies you can follow scheduled and completed meetings. During the video meeting you can use chat, raise your hand and vote without leaving Condomit. After it ends, the minutes consolidate the saved records and voting results.'],
        ['Na página Mural de Avisos o síndico pode publicar comunicados permanentes para os moradores e acompanhar todo o histórico.', 'On the Notice Board, the property manager can publish permanent announcements for residents and review the full history.'],
        ['Na página Mural de Avisos você encontra todos os avisos permanentes publicados para o seu condomínio.', 'On the Notice Board you can find all permanent notices published for your condominium.'],
        ['Use o Chat com Síndico para enviar mensagens diretamente ao síndico vinculado ao mesmo CEP do seu condomínio.', 'Use Property Manager Chat to send messages directly to the property manager linked to your condominium.'],
        ['O Chat com Porteiro conecta você aos porteiros vinculados ao mesmo condomínio. Quando houver telefone cadastrado, o botão de ligação do chat também pode iniciar uma chamada telefônica.', 'Doorman Chat connects you to the doormen linked to the same condominium. When a phone number is available, the call button can also start a phone call.'],
        ['Em Configurações, na área Segurança e acesso, você pode registrar uma encomenda para a própria conta. As encomendas registradas ficam disponíveis na área de autorização de entregas.', 'In Settings, under Security and access, you can register a package for your own account. Registered packages become available in the delivery authorization area.'],
        ['Abra Configurações e selecione Foto de perfil. Você pode enviar uma imagem, reposicioná-la e também resetar a foto para voltar ao avatar padrão.', 'Open Settings and select Profile photo. You can upload an image, reposition it and reset it to return to the default avatar.'],
        ['A Condomit possui uma área para controle de prestadores, com consulta e cadastro dos serviços vinculados ao condomínio.', 'Condomit has a service-provider management area where authorized users can view and register services linked to the condominium.'],
        ['O controle de prestadores é administrado pela gestão e pela portaria do condomínio.', 'Service-provider control is managed by condominium management and the front desk.'],
        ['O Marketplace mostra anúncios dos moradores do mesmo condomínio. Você pode publicar itens, favoritar anúncios e gerenciar os seus próprios anúncios.', 'Marketplace shows listings from residents of the same condominium. You can publish items, favorite listings and manage your own listings.'],
        ['Na Condomit, as reservas dos espaços cadastrados em ', 'In Condomit, reservations for common areas registered in '],
        [' ficam na página Reserva de Locais. Você pode escolher o local, a data e um horário disponível. Também é possível consultar suas próprias reservas.', ' are available on the Reservations page. You can choose the location, date and an available time, and you can also review your own reservations.'],
        ['Você está usando uma conta de síndico. Para conversar com moradores ou com a portaria, use as páginas de chat correspondentes.', 'You are using a property-manager account. To talk to residents or the front desk, use the corresponding chat pages.'],
        ['Abrir Reserva de Locais', 'Open Reservations'],
        ['Liberação de visitantes', 'Visitor authorization'],
        ['Registro de entrada e saída', 'Entry and exit log'],
        ['Abrir Configurações', 'Open Settings'],
        ['Abrir Assembleias', 'Open Assemblies'],
        ['Chat com Moradores', 'Residents Chat'],
        ['Chat com Síndico', 'Property Manager Chat'],
        ['Chat com Porteiro', 'Doorman Chat'],
        ['Registrar encomenda', 'Register package'],
        ['Controle de Prestadores', 'Service Providers']
    ];

    function translateAiTextToEnglish(value) {
        let text = String(value ?? '');
        AI_EN_REPLACEMENTS.forEach(([pt, en]) => { text = text.split(pt).join(en); });
        const patterns = [
            [/Há (\d+) chamado\(s\) aberto\(s\), sendo (\d+) fora do prazo de SLA\./g, 'There are $1 open ticket(s), with $2 past the SLA deadline.'],
            [/Existem (\d+) manutenções atrasadas\. As primeiras são: /g, 'There are $1 overdue maintenance items. The first ones are: '],
            [/Sugestão de comunicado:/g, 'Suggested announcement:'],
            [/Prezados moradores,/g, 'Dear residents,'],
            [/Informamos /g, 'We would like to inform you about '],
            [/Pedimos que acompanhem as orientações publicadas no Condomit e, em caso de dúvidas, entrem em contato com a administração\./g, 'Please follow the guidance published in Condomit and contact management if you have any questions.'],
            [/Atenciosamente,/g, 'Sincerely,'],
            [/Administração do condomínio\./g, 'Condominium Management.'],
            [/Como faço/g, 'How do I'],
            [/Abrir /g, 'Open '],
            [/Gerar código de acesso/g, 'Generate access code'],
            [/Configurações/g, 'Settings'],
            [/Manutenção Preventiva/g, 'Preventive Maintenance'],
            [/Gestão Avançada/g, 'Advanced Management'],
            [/IA de Comunicados/g, 'Announcement AI'],
            [/Mural de Avisos/g, 'Notice Board']
        ];
        patterns.forEach(([rx, en]) => { text = text.replace(rx, en); });
        return text;
    }

    function localizeAnswer(answer) {
        if (!isEnglish() || !answer) return answer;
        return {
            ...answer,
            text: translateAiTextToEnglish(answer.text),
            actions: (answer.actions || []).map(action => ({ ...action, label: translateAiTextToEnglish(action.label) }))
        };
    }

    function applyAiPageLanguage() {
        if (!isEnglish()) return;
        document.documentElement.lang = 'en';
        document.title = 'Condomit - AI Assistant';
        const topTitle = document.querySelector('.top-bar-left h1');
        if (topTitle) topTitle.textContent = 'Condomit AI';
        const topSubtitle = document.querySelector('.top-bar-left p');
        if (topSubtitle) topSubtitle.textContent = 'Your smart assistant for condominium questions.';
        const identity = document.querySelector('.ai-assistant-identity strong');
        if (identity) identity.textContent = 'Condomit Assistant';
        const newChat = $('newAiConversationBtn');
        if (newChat) newChat.innerHTML = '<i class="fas fa-pen-to-square"></i> New conversation';
        const kicker = document.querySelector('.welcome-kicker');
        if (kicker) kicker.innerHTML = '<i class="fas fa-shield-heart"></i> Questions about your condominium';
        const title = document.querySelector('.welcome-title');
        if (title) title.innerHTML = `Hello, <span id="firstName">${String(state.user?.name || 'Resident').split(/\s+/)[0]}</span>! How can I help?`;
        const desc = document.querySelector('.welcome-description');
        if (desc) desc.textContent = 'Ask about Condomit features and quickly navigate to reservations, visitors, assemblies, notifications, service providers and other areas of your condominium.';
        const questions = [
            ['How do I reserve a common area?', 'Reservations', 'Common areas, times and my reservations'],
            ['How do I register or authorize a visitor?', 'Visitors', 'Registration and access authorization'],
            ['How do online assemblies work?', 'Assemblies', 'Video meetings, voting and minutes'],
            ['Where can I see condominium notifications?', 'Notifications', 'Alerts and condominium updates']
        ];
        document.querySelectorAll('.ai-category-card').forEach((button, index) => {
            const item = questions[index]; if (!item) return;
            button.dataset.question = item[0];
            const strong = button.querySelector('strong'); if (strong) strong.textContent = item[1];
            const small = button.querySelector('small'); if (small) small.textContent = item[2];
        });
        const suggestions = [
            'How do I contact the property manager?',
            'How do I register a package?',
            'How do I change my profile photo?'
        ];
        document.querySelectorAll('.suggestion-btn').forEach((button, index) => {
            if (!suggestions[index]) return;
            button.dataset.question = suggestions[index];
            const icon = button.querySelector('i')?.outerHTML || '';
            button.innerHTML = `${icon} ${suggestions[index]}`;
        });
        const input = $('chatInput'); if (input) input.placeholder = 'Ask something about Condomit or your condominium...';
    }

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        state.user = getStoredUser();
        if (!state.user) {
            window.location.href = 'entrar.html';
            return;
        }

        if (typeof window.refreshCurrentUserFromDb === 'function') {
            try { state.user = await window.refreshCurrentUserFromDb() || state.user; } catch (_) {}
        }

        setupShell();
        applyAiPageLanguage();
        bindEvents();
        resetConversation(false);
    }

    function getStoredUser() {
        try { return JSON.parse(sessionStorage.getItem('condominiumUser') || 'null'); }
        catch (_) { return null; }
    }

    function normalizeRole(user) {
        const value = String(user?.user_type || user?.type || '').trim().toLowerCase();
        return value.includes('sind') ? 'sindico' : value.includes('porteir') ? 'porteiro' : 'morador';
    }

    function condoName(user) {
        const condo = user?.condominium && typeof user.condominium === 'object' ? user.condominium : {};
        return condo.name || condo.condominium_name || 'seu condomínio';
    }

    function setupShell() {
        const user = state.user;
        const role = normalizeRole(user);
        const userName = user?.name || 'Usuário';
        const firstName = userName.split(/\s+/)[0] || 'Usuário';
        const firstNameEl = $('firstName');
        const profileNameTop = $('profileNameTop');
        const profileAvatarTop = $('profileAvatarTop');
        const typeEl = document.querySelector('.user-info-small .type');
        const sidebarApartment = $('sidebarApartment');
        const sidebarSindico = $('sidebarSindico');
        const sidebarMorador = $('sidebarMorador');

        if (firstNameEl) firstNameEl.textContent = firstName;
        if (profileNameTop) profileNameTop.textContent = userName;
        if (profileAvatarTop) profileAvatarTop.textContent = initials(userName);
        if (typeEl) typeEl.textContent = isEnglish() ? (role === 'sindico' ? 'Property manager' : role === 'porteiro' ? 'Doorman' : 'Resident') : (role === 'sindico' ? 'Síndico' : role === 'porteiro' ? 'Porteiro' : 'Morador');
        if (sidebarSindico) sidebarSindico.style.display = role === 'sindico' ? 'block' : 'none';
        if (sidebarMorador) sidebarMorador.style.display = role === 'sindico' ? 'none' : 'block';

        const name = condoName(user);
        if (sidebarApartment) sidebarApartment.textContent = name;
        if ($('aiCondoContext')) $('aiCondoContext').textContent = `${isEnglish() ? 'Context' : 'Contexto'}: ${name}`;
        window.syncAllAvatars?.(user);
    }

    function bindEvents() {
        const input = $('chatInput');
        $('sendBtn')?.addEventListener('click', sendMessage);
        $('newAiConversationBtn')?.addEventListener('click', () => resetConversation(true));

        input?.addEventListener('input', () => {
            updateCharCount();
            input.style.height = 'auto';
            input.style.height = `${Math.min(input.scrollHeight, 190)}px`;
        });
        input?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });

        document.querySelectorAll('[data-question]').forEach((button) => {
            button.addEventListener('click', () => {
                if (!input) return;
                input.value = button.dataset.question || '';
                updateCharCount();
                sendMessage();
            });
        });
    }

    function resetConversation(showNotice) {
        state.history = [];
        const messages = $('chatMessages');
        const welcome = $('welcomeCard');
        if (messages) messages.innerHTML = '';
        if (welcome) welcome.style.display = '';
        const input = $('chatInput');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        updateCharCount();
        if (showNotice) window.showToast?.(isEnglish() ? 'New conversation started.' : 'Nova conversa iniciada.', 'success');
    }

    function updateCharCount() {
        const input = $('chatInput');
        const count = $('charCount');
        if (count) count.textContent = `${input?.value.length || 0}/700`;
    }

    async function sendMessage() {
        const input = $('chatInput');
        const message = String(input?.value || '').trim();
        if (!message) return;

        $('welcomeCard')?.style.setProperty('display', 'none');
        addMessage('user', message);
        input.value = '';
        input.style.height = 'auto';
        updateCharCount();
        showTyping();

        await new Promise((resolve) => setTimeout(resolve, 350));
        hideTyping();
        const answer = localizeAnswer(await buildAnswer(message));
        addMessage('ai', answer.text, answer.actions || []);
    }

    async function buildAnswer(question) {
        const q = normalize(question);
        const role = normalizeRole(state.user);
        const condo = condoName(state.user);
        const isPorter = role === 'porteiro';
        const isSindico = role === 'sindico';

        // Código de acesso é informação administrativa exclusiva do síndico.
        // Moradores e porteiros não recebem o código nem instruções para gerenciá-lo.
        const asksAccessCode = includesAny(q, [
            'codigo de acesso', 'chave de acesso', 'codigo do condominio', 'access code', 'condominium code',
            'codigo do condomínio', 'meu codigo', 'meu código'
        ]);
        if (asksAccessCode && !isSindico) {
            return {
                text: 'O código de acesso do condomínio é uma informação administrativa exclusiva do síndico. Entre em contato com o síndico do seu condomínio para receber as orientações necessárias.',
                actions: []
            };
        }

        if (isSindico && asksAccessCode) {
            const asksHow = includesAny(q, [
                'como gerar', 'como criar', 'onde gerar', 'onde criar', 'onde fica', 'how to generate', 'how do i generate', 'where can i generate',
                'como faco', 'como faço', 'como consigo', 'onde encontro'
            ]);
            const asksGenerateNow = includesAny(q, [
                'gerar codigo de acesso', 'gerar código de acesso', 'generate access code', 'create access code',
                'criar codigo de acesso', 'criar código de acesso',
                'gere um codigo de acesso', 'gere um código de acesso'
            ]) && !asksHow;

            if (asksGenerateNow) return await generateAccessCodeFromAi();
            if (asksHow) {
                return {
                    text: 'Como síndico, você pode gerar o código em Configurações → Condomínio → Gerar código de acesso. O novo código revoga automaticamente o anterior. Se preferir, posso gerar um código agora pelo próprio chat.',
                    actions: [{ label: 'Gerar código de acesso', command: 'generate-access-code', icon: 'fa-key' }]
                };
            }
            return await answerCurrentAccessCode();
        }

        // 027 - Copiloto do síndico: responde com dados reais do condomínio.
        if (isSindico && includesAny(q, ['resumo do condominio', 'resumo do condomínio', 'painel', 'indicadores', 'como esta o condominio', 'como está o condomínio'])) {
            const summary = await buildManagementSummary();
            if (summary) return summary;
        }
        if (isSindico && includesAny(q, ['manutencao atrasada', 'manutencoes atrasadas', 'manutenção atrasada', 'manutenções atrasadas'])) {
            const data = await getOperationalRows('maintenance_items', 'title,next_date,status', 'status=neq.concluida&order=next_date.asc&limit=20');
            const overdue = data.filter((item) => item.next_date && new Date(item.next_date) < new Date());
            return { text: overdue.length ? `Existem ${overdue.length} manutenções atrasadas. As primeiras são: ${overdue.slice(0, 5).map((item) => `${item.title} (${formatAiDate(item.next_date)})`).join('; ')}.` : 'Não encontrei manutenções preventivas atrasadas neste momento.', actions: [{ label: 'Abrir Manutenção Preventiva', href: 'manutencao-preventiva.html', icon: 'fa-screwdriver-wrench' }] };
        }
        if (isSindico && includesAny(q, ['chamados abertos', 'tickets abertos', 'sla'])) {
            const data = await getOperationalRows('service_tickets', 'id,title,status,sla_due_at', 'order=created_at.desc&limit=100');
            const open = data.filter((item) => !['resolvido','cancelado'].includes(item.status));
            const late = open.filter((item) => item.sla_due_at && new Date(item.sla_due_at) < new Date());
            return { text: `Há ${open.length} chamado(s) aberto(s), sendo ${late.length} fora do prazo de SLA.`, actions: [{ label: 'Abrir Gestão Avançada', href: 'gestao-avancada.html', icon: 'fa-headset' }] };
        }
        if (isSindico && includesAny(q, ['gere um comunicado', 'gerar comunicado', 'crie um comunicado', 'criar comunicado'])) {
            const raw=String(question||'').trim();
            const topic=raw.replace(/^(por favor,?\s*)?(gere|gerar|crie|criar)\s+(um\s+)?comunicado\s*(sobre|a respeito de|para)?\s*/i,'').trim() || 'uma atualização importante do condomínio';
            return {
                text: `Sugestão de comunicado:\n\nPrezados moradores,\n\nInformamos ${topic}. Pedimos que acompanhem as orientações publicadas no Condomit e, em caso de dúvidas, entrem em contato com a administração.\n\nAtenciosamente,\nAdministração do condomínio.`,
                actions: [
                    { label: 'Abrir IA de Comunicados', href: 'ai-comunicados.html', icon: 'fa-wand-magic-sparkles' },
                    { label: 'Abrir Mural de Avisos', href: 'mural-avisos.html', icon: 'fa-bullhorn' }
                ]
            };
        }

        // 027 - RAG local simples: pesquisa os documentos cadastrados no próprio condomínio.
        const documentAnswer = await answerFromCondominiumDocuments(question);
        if (documentAnswer) return documentAnswer;

        if (includesAny(q, ['reserva', 'churrasqueira', 'salao de festas', 'salao', 'area comum', 'reservation', 'reserve', 'common area', 'party room', 'barbecue'])) {
            return {
                text: `Na Condomit, as reservas dos espaços cadastrados em ${condo} ficam na página Reserva de Locais. Você pode escolher o local, a data e um horário disponível. Também é possível consultar suas próprias reservas.`,
                actions: [{ label: 'Abrir Reserva de Locais', href: 'reservas.html', icon: 'fa-calendar-check' }]
            };
        }

        if (includesAny(q, ['visitante', 'visita', 'liberar entrada', 'liberacao', 'visitor', 'authorize visitor', 'visitor access'])) {
            if (isPorter) return {
                text: 'Como porteiro, você pode consultar os visitantes do condomínio, liberar ou revogar entradas e acompanhar os registros de acesso.',
                actions: [
                    { label: 'Liberação de visitantes', href: 'liberacao-visitantes.html', icon: 'fa-user-check' },
                    { label: 'Registro de entrada e saída', href: 'registro-entrada-saida.html', icon: 'fa-right-left' }
                ]
            };
            return {
                text: 'Você pode cadastrar um visitante em Configurações, na área Segurança e acesso. O cadastro fica vinculado ao seu condomínio para que a portaria possa consultá-lo.',
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-gear' }]
            };
        }

        if (includesAny(q, ['assembleia', 'votacao', 'votar', 'ata', 'assembly', 'assemblies', 'vote', 'voting', 'minutes'])) {
            return {
                text: 'Na área de Assembleias você acompanha reuniões agendadas e realizadas. Durante a chamada é possível participar do chat, levantar a mão e votar. Depois do encerramento, a ata reúne os registros persistidos e as votações.',
                actions: [{ label: 'Abrir Assembleias', href: 'assembleia.html', icon: 'fa-users-rectangle' }]
            };
        }

        if (includesAny(q, ['notificacao', 'aviso', 'comunicado', 'notification', 'notifications', 'notice', 'announcement'])) {
            return {
                text: isSindico
                    ? 'Na página Mural de Avisos o síndico pode publicar comunicados permanentes para os moradores e acompanhar todo o histórico.'
                    : 'Na página Mural de Avisos você encontra todos os avisos permanentes publicados para o seu condomínio.',
                actions: [{ label: 'Abrir Mural de Avisos', href: 'mural-avisos.html', icon: 'fa-bullhorn' }]
            };
        }

        if (includesAny(q, ['sindico', 'falar com sindico', 'contato sindico', 'property manager', 'manager', 'contact the property manager'])) {
            return {
                text: isSindico ? 'Você está usando uma conta de síndico. Para conversar com moradores ou com a portaria, use as páginas de chat correspondentes.' : 'Use o Chat com Síndico para enviar mensagens diretamente ao síndico vinculado ao mesmo CEP do seu condomínio.',
                actions: [{ label: isSindico ? 'Chat com Moradores' : 'Chat com Síndico', href: isSindico ? 'chat-moradores.html' : 'chat-sindico.html', icon: 'fa-comments' }]
            };
        }

        if (includesAny(q, ['porteiro', 'portaria', 'doorman', 'front desk', 'concierge'])) {
            return {
                text: 'O Chat com Porteiro conecta você aos porteiros vinculados ao mesmo condomínio. Quando houver telefone cadastrado, o botão de ligação do chat também pode iniciar uma chamada telefônica.',
                actions: [{ label: 'Chat com Porteiro', href: 'chat-porteiro.html', icon: 'fa-door-open' }]
            };
        }

        if (includesAny(q, ['encomenda', 'entrega', 'pacote', 'package', 'delivery'])) {
            return {
                text: 'Em Configurações, na área Segurança e acesso, você pode registrar uma encomenda para a própria conta. As encomendas registradas ficam disponíveis na área de autorização de entregas.',
                actions: [{ label: 'Registrar encomenda', href: 'configuracoes.html#registrar-encomenda', icon: 'fa-box' }]
            };
        }

        if (includesAny(q, ['foto', 'perfil', 'avatar', 'photo', 'profile', 'profile picture'])) {
            return {
                text: 'Abra Configurações e selecione Foto de perfil. Você pode enviar uma imagem, reposicioná-la e também resetar a foto para voltar ao avatar padrão.',
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-user-pen' }]
            };
        }

        if (includesAny(q, ['prestador', 'manutencao', 'servico', 'service provider', 'maintenance', 'service'])) {
            return {
                text: isSindico || isPorter
                    ? 'A Condomit possui uma área para controle de prestadores, com consulta e cadastro dos serviços vinculados ao condomínio.'
                    : 'O controle de prestadores é administrado pela gestão e pela portaria do condomínio.',
                actions: (isSindico || isPorter) ? [{ label: 'Controle de Prestadores', href: 'controle-prestadores.html', icon: 'fa-screwdriver-wrench' }] : []
            };
        }

        if (includesAny(q, ['marketplace', 'anuncio', 'vender', 'listing', 'sell'])) {
            return {
                text: 'O Marketplace mostra anúncios dos moradores do mesmo condomínio. Você pode publicar itens, favoritar anúncios e gerenciar os seus próprios anúncios.',
                actions: [{ label: 'Abrir Marketplace', href: 'marketplace.html', icon: 'fa-store' }]
            };
        }

        return {
            text: isEnglish()
                ? `I can guide you through the Condomit features available for ${condo}: reservations, visitors, assemblies, notifications, chats, packages, profile, marketplace and service providers. Tell me what you want to do and I will show you where to find it in the system.`
                : `Posso orientar você sobre as áreas disponíveis na Condomit para ${condo}: reservas, visitantes, assembleias, notificações, chats, encomendas, perfil, marketplace e prestadores. Escreva o que você deseja fazer e eu indico o caminho dentro do sistema.`,
            actions: []
        };
    }


    async function getAiCep() {
        try {
            if (typeof window.supabaseFetch === 'function') {
                const value = await window.supabaseFetch('/rpc/condomit_current_user_cep', { method: 'POST', body: '{}' });
                if (typeof value === 'string' && value) return value;
            }
        } catch (_) {}
        const condo = state.user?.condominium && typeof state.user.condominium === 'object' ? state.user.condominium : {};
        return String(condo.cep || condo.condominium_id || '').replace(/\D/g, '');
    }

    function getAccessCodeCacheKey(cep) {
        return `condomitAccessCode:${String(cep || '').replace(/\D/g, '')}`;
    }

    function readCachedAccessCode(cep) {
        try {
            const raw = sessionStorage.getItem(getAccessCodeCacheKey(cep));
            if (!raw) return null;
            const cached = JSON.parse(raw);
            if (!cached?.code) return null;
            if (cached.expiresAt) {
                const expiry = new Date(cached.expiresAt);
                if (!Number.isNaN(expiry.getTime()) && expiry <= new Date()) {
                    sessionStorage.removeItem(getAccessCodeCacheKey(cep));
                    return null;
                }
            }
            return cached;
        } catch (_) { return null; }
    }

    async function answerCurrentAccessCode() {
        const cep = await getAiCep();
        if (!cep) {
            return { text: 'Não consegui identificar o condomínio vinculado à sua conta de síndico.', actions: [] };
        }

        const cached = readCachedAccessCode(cep);
        try {
            if (typeof window.supabaseFetch !== 'function') throw new Error('Conexão segura indisponível.');
            const payload = await window.supabaseFetch('/rpc/condomit_get_condominium_access_code_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_cep: cep })
            });
            const status = Array.isArray(payload) ? payload[0] : payload;
            if (!status?.has_active_code) {
                try { sessionStorage.removeItem(getAccessCodeCacheKey(cep)); } catch (_) {}
                return {
                    text: 'Não há nenhum código de acesso ativo vinculado ao condomínio neste momento.',
                    actions: [{ label: 'Gerar código de acesso', command: 'generate-access-code', icon: 'fa-key' }]
                };
            }

            const serverCode = String(status?.code || '').trim();
            const expiry = status?.expires_at ? new Date(status.expires_at) : null;
            const expiryText = expiry && !Number.isNaN(expiry.getTime())
                ? ` válido até ${expiry.toLocaleString('pt-BR')}`
                : '';
            const remaining = Number.isFinite(Number(status?.remaining_uses))
                ? Number(status.remaining_uses)
                : Math.max(0, Number(status?.max_uses || 0) - Number(status?.uses || 0));
            const usageText = Number(status?.max_uses || 0) > 0
                ? ` e possui ${remaining} uso(s) restante(s)`
                : '';

            if (serverCode) {
                try {
                    sessionStorage.setItem(getAccessCodeCacheKey(cep), JSON.stringify({
                        code: serverCode,
                        cep: String(cep).replace(/\D/g, ''),
                        expiresAt: status?.expires_at || null,
                        maxUses: Number(status?.max_uses || 0),
                        createdAt: status?.created_at || new Date().toISOString()
                    }));
                } catch (_) {}
                return {
                    text: `O código de acesso atual do condomínio é ${serverCode}.${expiryText}${usageText}.`,
                    actions: [{ label: 'Gerar novo código', command: 'generate-access-code', icon: 'fa-rotate' }]
                };
            }

            // Código criado antes da migration 031: o banco possui o hash, mas
            // não o valor recuperável. Se ele ainda estiver nesta sessão, usamos
            // o cache; caso contrário oferecemos a criação de um novo.
            if (cached?.code) {
                return {
                    text: `O código ativo desta sessão é ${cached.code}.${expiryText}${usageText}.`,
                    actions: [{ label: 'Gerar novo código', command: 'generate-access-code', icon: 'fa-rotate' }]
                };
            }

            return {
                text: `Existe um código de acesso ativo${expiryText}${usageText}, mas ele foi criado antes da atualização que permite recuperá-lo com segurança. Gere um novo código para que ele fique disponível ao síndico durante toda a validade.`,
                actions: [{ label: 'Gerar novo código', command: 'generate-access-code', icon: 'fa-rotate' }]
            };
        } catch (error) {
            if (cached?.code) {
                return {
                    text: `O último código disponível nesta sessão é ${cached.code}. Não consegui confirmar o status dele no servidor agora.`,
                    actions: [{ label: 'Gerar novo código', command: 'generate-access-code', icon: 'fa-rotate' }]
                };
            }
            return {
                text: error?.message || 'Não consegui consultar o código de acesso agora.',
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-gear' }]
            };
        }
    }

    async function generateAccessCodeFromAi() {
        if (normalizeRole(state.user) !== 'sindico') {
            return { text: 'Somente o síndico pode gerar o código de acesso do condomínio.', actions: [] };
        }
        try {
            if (typeof window.supabaseFetch !== 'function') throw new Error('Conexão segura com o Supabase indisponível.');
            const cep = await getAiCep();
            if (!cep) throw new Error('Não foi possível identificar o condomínio desta conta.');
            const payload = await window.supabaseFetch('/rpc/condomit_create_condominium_access_code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_cep: cep, valid_hours: 168, allowed_uses: 50 })
            });
            const data = Array.isArray(payload) ? payload[0] : payload;
            const code = String(data?.code || '').trim();
            if (!code) throw new Error('O servidor não retornou o código gerado.');

            try {
                sessionStorage.setItem(getAccessCodeCacheKey(data?.cep || cep), JSON.stringify({
                    code,
                    cep: String(data?.cep || cep).replace(/\D/g, ''),
                    expiresAt: data?.expires_at || null,
                    maxUses: Number(data?.max_uses || 50),
                    createdAt: new Date().toISOString()
                }));
            } catch (_) {}

            const expiry = data?.expires_at ? new Date(data.expires_at) : null;
            const expiryText = expiry && !Number.isNaN(expiry.getTime())
                ? expiry.toLocaleString('pt-BR')
                : '7 dias';
            return {
                text: `Código de acesso gerado com sucesso: ${code}. Validade: ${expiryText}. O código anterior foi revogado automaticamente.`,
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-gear' }]
            };
        } catch (error) {
            return {
                text: `Não foi possível gerar o código de acesso: ${error?.message || 'tente novamente.'}`,
                actions: [{ label: 'Abrir Configurações', href: 'configuracoes.html', icon: 'fa-gear' }]
            };
        }
    }

    async function handleAiCommand(command) {
        if (command !== 'generate-access-code') return;
        const input = $('chatInput');
        $('welcomeCard')?.style.setProperty('display', 'none');
        addMessage('user', 'Gerar código de acesso');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        updateCharCount();
        showTyping();
        const answer = await generateAccessCodeFromAi();
        hideTyping();
        addMessage('ai', answer.text, answer.actions || []);
    }

    async function getOperationalRows(table, select, extra = '') {
        try {
            if (typeof window.supabaseFetch !== 'function') return [];
            const cep = await getAiCep();
            if (!cep) return [];
            const suffix = extra ? `&${extra}` : '';
            const rows = await window.supabaseFetch(`/${table}?select=${encodeURIComponent(select)}&cep=eq.${encodeURIComponent(cep)}${suffix}`);
            return Array.isArray(rows) ? rows : [];
        } catch (_) { return []; }
    }

    async function answerFromCondominiumDocuments(question) {
        try {
            const docs = await getOperationalRows('condominium_documents', 'id,title,category,description,content,file_url,version,visibility,updated_at', 'order=updated_at.desc&limit=150');
            if (!docs.length) return null;
            const terms = normalize(question).split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !['qual','quais','como','onde','quando','sobre','para','isso','essa','este','esta','condominio','condomínio'].includes(term));
            if (!terms.length) return null;
            const scored = docs.map((doc) => {
                const hay = normalize(`${doc.title} ${doc.category} ${doc.description} ${doc.content}`);
                const score = terms.reduce((sum, term) => sum + (hay.includes(term) ? (normalize(doc.title).includes(term) ? 3 : 1) : 0), 0);
                return { doc, score };
            }).filter((entry) => entry.score > 0).sort((a,b) => b.score - a.score);
            if (!scored.length || scored[0].score < 2) return null;
            const best = scored[0].doc;
            const sourceText = String(best.content || best.description || '').trim();
            const excerpt = sourceText ? sourceText.slice(0, 650) : 'O documento foi localizado, mas ainda não possui conteúdo textual cadastrado para consulta.';
            return {
                text: `Encontrei essa informação na Central de Documentos, em “${best.title}” (versão ${best.version || 1}): ${excerpt}${sourceText.length > 650 ? '…' : ''}`,
                actions: [
                    { label: 'Abrir Central de Documentos', href: 'gestao-avancada.html', icon: 'fa-folder-open' },
                    ...(best.file_url ? [{ label: 'Abrir arquivo', href: best.file_url, icon: 'fa-arrow-up-right-from-square' }] : [])
                ]
            };
        } catch (_) { return null; }
    }

    async function buildManagementSummary() {
        try {
            const [tickets, maintenance, alerts, finance] = await Promise.all([
                getOperationalRows('service_tickets', 'id,status,sla_due_at', 'limit=500'),
                getOperationalRows('maintenance_items', 'id,status,next_date', 'limit=500'),
                getOperationalRows('emergency_alerts', 'id,active', 'limit=100'),
                getOperationalRows('financial_entries', 'entry_type,amount,status', 'limit=1000')
            ]);
            const openTickets = tickets.filter((x) => !['resolvido','cancelado'].includes(x.status));
            const lateTickets = openTickets.filter((x) => x.sla_due_at && new Date(x.sla_due_at) < new Date());
            const pendingMaintenance = maintenance.filter((x) => x.status !== 'concluida');
            const lateMaintenance = pendingMaintenance.filter((x) => x.next_date && new Date(x.next_date) < new Date());
            const emergencies = alerts.filter((x) => x.active).length;
            const balance = finance.reduce((sum, x) => sum + (x.entry_type === 'receita' ? 1 : -1) * Number(x.amount || 0), 0);
            return {
                text: `Resumo atual: ${openTickets.length} chamado(s) aberto(s) (${lateTickets.length} fora do SLA), ${pendingMaintenance.length} manutenção(ões) pendente(s) (${lateMaintenance.length} atrasada(s)), ${emergencies} alerta(s) de emergência ativo(s) e saldo registrado de ${balance.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`,
                actions: [{ label: 'Abrir Gestão Avançada', href: 'gestao-avancada.html', icon: 'fa-chart-line' }]
            };
        } catch (_) { return null; }
    }

    function formatAiDate(value) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value || '--') : date.toLocaleDateString('pt-BR');
    }


    function addMessage(type, text, actions = []) {
        const messages = $('chatMessages');
        if (!messages) return;
        const item = document.createElement('article');
        item.className = `message ${type}`;
        item.innerHTML = `
            <div class="message-avatar">${type === 'ai' ? '<i class="fas fa-robot"></i>' : escapeHtml(initials(state.user?.name || 'US'))}</div>
            <div class="message-content">
                <div class="message-bubble">${escapeHtml(text)}</div>
                ${actions.length ? `<div class="ai-message-actions">${actions.map((action) => action.command
                    ? `<button type="button" class="ai-action-link ai-action-button" data-ai-command="${escapeHtml(action.command)}"><i class="fas ${escapeHtml(action.icon || 'fa-arrow-right')}"></i>${escapeHtml(action.label)}</button>`
                    : `<a href="${escapeHtml(action.href)}" class="ai-action-link"><i class="fas ${escapeHtml(action.icon || 'fa-arrow-right')}"></i>${escapeHtml(action.label)}</a>`).join('')}</div>` : ''}
                <div class="message-time">${new Date().toLocaleTimeString(isEnglish() ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>`;
        messages.appendChild(item);
        item.querySelectorAll('[data-ai-command]').forEach((button) => {
            button.addEventListener('click', () => {
                button.disabled = true;
                handleAiCommand(button.dataset.aiCommand || '').finally(() => { button.disabled = false; });
            });
        });
        state.history.push({ type, text, actions });
        messages.scrollTop = messages.scrollHeight;
    }

    function showTyping() {
        const messages = $('chatMessages');
        if (!messages || $('typingIndicator')) return;
        const item = document.createElement('article');
        item.className = 'message ai';
        item.id = 'typingIndicator';
        item.innerHTML = '<div class="message-avatar"><i class="fas fa-robot"></i></div><div class="message-content"><div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>';
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() { $('typingIndicator')?.remove(); }
    function normalize(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    function includesAny(value, terms) { return terms.some((term) => value.includes(term)); }
    function initials(name) { return String(name || 'US').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 2) || 'US'; }
    function escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

    window.logout = function logout() {
        if (typeof window.performFullLogout === 'function') { window.performFullLogout(); return; }
        sessionStorage.removeItem('condominiumUser');
        window.location.href = '../inicio.html';
    };
})();
