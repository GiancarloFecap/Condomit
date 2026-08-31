const sidebarTextNodes = new WeakMap();
const sidebarPlaceholderNodes = new WeakMap();
const sidebarRuntime = {
    currentPage: '',
    currentUser: null,
    currentUserType: 'sindico'
};
const sidebarCondoLogoCache = new Map();

const sidebarI18n = {
    pt: {
        your_condo: 'Seu Condomínio',
        support_center: 'Central de Suporte',
        sign_out: 'Sair',
        home: 'Início',
        notice_engagement: 'Comunicado e Engajamento',
        relationships: 'Comunicação e Relacionamento',
        resident_management: 'Gestão',
        advanced_management: 'Gestão Avançada',
        reservations_maintenance: 'Reserva e Manutenção',
        ai_automation: 'IA e Automação',
        settings: 'Configurações',
        notices_communications: 'Avisos e Comunicações',
        assemblies: 'Assembleias',
        reservations_services: 'Reservas e Serviços',
        access_control: 'Controle de Acesso',
        emergency_services: 'Emergência e Serviços',
        mural: 'Mural de Avisos',
        suggestions: 'Canal de Sugestões',
        suggestions_long: 'Canal de Sugestões',
        indications: 'Indicações',
        chat_residents: 'Chat com Moradores',
        chat_syndic: 'Chat com Síndico',
        chat_porter: 'Chat com Porteiro',
        chat_gatehouse: 'Chat com Portaria',
        lost_found: 'Achados e Perdidos',
        marketplace: 'Market Place',
        assembly: 'Assembleia',
        assembly_plural: 'Assembleias',
        calls: 'Chamadas',
        assembly_notices: 'Avisos de Assembleia',
        resident_management_link: 'Gestão de Moradores',
        location_reservations: 'Reserva de Locais',
        preventive_maintenance: 'Manutenção Preventiva',
        ai_questions: 'IA - Dúvidas do Condomínio',
        ai_notices: 'IA - Comunicados Automáticos',
        notifications: 'Notificações',
        mail: 'Correio',
        reservations: 'Reservas',
        documents: 'Documentos',
        visitor_release: 'Liberação de Visitantes',
        register_visitor: 'Registrar Visitante',
        visitor_entry_exit: 'Registro de Entrada e Saída',
        released_visitors: 'Visitantes Liberados',
        access_history: 'Histórico de Acesso',
        emergency_button: 'Botão de Emergência',
        deliveries_authorization: 'Autorização de Entregas',
        provider_control: 'Controle de Prestadores',
        occurrences: 'Ocorrências'
    },
    en: {
        your_condo: 'Your Condo',
        support_center: 'Support Center',
        sign_out: 'Sign Out',
        home: 'Home',
        notice_engagement: 'Communication and Engagement',
        relationships: 'Communication and Relationships',
        resident_management: 'Management',
        advanced_management: 'Advanced Management',
        reservations_maintenance: 'Reservations and Maintenance',
        ai_automation: 'AI and Automation',
        settings: 'Settings',
        notices_communications: 'Notices and Communications',
        assemblies: 'Assemblies',
        reservations_services: 'Reservations and Services',
        access_control: 'Access Control',
        emergency_services: 'Emergency and Services',
        mural: 'Notice Board',
        suggestions: 'Suggestions Channel',
        suggestions_long: 'Suggestions Channel',
        indications: 'Recommendations',
        chat_residents: 'Chat with Residents',
        chat_syndic: 'Chat with Manager',
        chat_porter: 'Chat with Porter',
        chat_gatehouse: 'Chat with Gatehouse',
        lost_found: 'Lost and Found',
        marketplace: 'Marketplace',
        assembly: 'Assembly',
        assembly_plural: 'Assemblies',
        calls: 'Calls',
        assembly_notices: 'Assembly Notices',
        resident_management_link: 'Resident Management',
        location_reservations: 'Location Reservations',
        preventive_maintenance: 'Preventive Maintenance',
        ai_questions: 'AI - Condominium Questions',
        ai_notices: 'AI - Automatic Notices',
        notifications: 'Notifications',
        mail: 'Mail',
        reservations: 'Reservations',
        documents: 'Documents',
        visitor_release: 'Visitor Release',
        register_visitor: 'Register Visitor',
        visitor_entry_exit: 'Entry and Exit Log',
        released_visitors: 'Released Visitors',
        access_history: 'Access History',
        emergency_button: 'Emergency Button',
        deliveries_authorization: 'Delivery Authorization',
        provider_control: 'Provider Control',
        occurrences: 'Incident Reports'
    }
};

const textTranslations = {
    en: {
        'Configurações': 'Settings',
        'Personalize e gerencie as configurações do sistema': 'Customize and manage system settings',
        'Notificações': 'Notifications',
        'Fique por dentro do que acontece dentro do condomínio.': 'Stay on top of what happens inside the condominium.',
        'Marketplace': 'Marketplace',
        'Compre, venda ou doe itens com seus vizinhos.': 'Buy, sell or donate items with your neighbors.',
        'Achados e Perdidos': 'Lost and Found',
        'Encontre objetos perdidos ou veja o que foi encontrado no condomínio.': 'Find lost objects or see what was found in the condominium.',
        'Gestão de Moradores': 'Resident Management',
        'Gestão Avançada': 'Advanced Management',
        'Gestão': 'Management',
        'Gerencie os moradores do seu condomínio de forma prática e segura.': 'Manage condominium residents in a practical and secure way.',
        'Manutenção Preventiva': 'Preventive Maintenance',
        'Acompanhe e gerencie as manutenções preventivas do condomínio.': 'Track and manage the condominium preventive maintenance tasks.',
        'Nova manutenção': 'New maintenance',
        'Buscar por tarefa ou local...': 'Search by task or location...',
        'Todas as categorias': 'All categories',
        'Todos os status': 'All statuses',
        'Limpar filtros': 'Clear filters',
        'Manutenções programadas': 'Scheduled maintenance',
        'Calendário': 'Calendar',
        'Próximas manutenções': 'Upcoming maintenance',
        'Documentos e registros': 'Documents and records',
        'Ver documentos': 'View documents',
        'Bom dia, Porteiro!': 'Good morning, Porter!',
        'Hoje': 'Today',
        'Acesso rápido': 'Quick Access',
        'Atalhos para as operações mais usadas na portaria.': 'Shortcuts for the most used gatehouse operations.',
        'Visitantes aguardando': 'Visitors waiting',
        'Entregas na portaria': 'Deliveries at the gatehouse',
        'Prestadores autorizados': 'Authorized providers',
        'Liberação de Visitantes': 'Visitor Release',
        'Libere a entrada de visitantes pré-cadastrados.': 'Allow entry for pre-registered visitors.',
        'Ir para liberação': 'Go to release',
        'Registrar Visitante': 'Register Visitor',
        'Cadastre um novo visitante no sistema.': 'Register a new visitor in the system.',
        'Novo registro': 'New registration',
        'Registro de Entrada e Saída': 'Entry and Exit Log',
        'Controle as entradas e saídas de moradores e visitantes.': 'Track entries and exits of residents and visitors.',
        'Registrar acesso': 'Register access',
        'Visitantes Liberados': 'Released Visitors',
        'Consulte a lista de visitantes liberados hoje.': 'Check the list of visitors released today.',
        'Ver lista': 'View list',
        'Histórico de Acesso': 'Access History',
        'Visualize os últimos registros da portaria.': 'View the latest gatehouse logs.',
        'Ver histórico': 'View history',
        'Prioridade máxima': 'Highest priority',
        'Botão de emergência': 'Emergency Button',
        'Acione o protocolo interno rapidamente em caso de ocorrência.': 'Trigger the internal protocol quickly in case of an incident.',
        'Acionar emergência': 'Trigger emergency',
        'Autorização de entregas': 'Delivery Authorization',
        'Controle de prestadores': 'Provider Control',
        'Portaria': 'Gatehouse',
        'Serviços': 'Services',
        'Registrar Visitantes': 'Register Visitors',
        'Cadastre a entrada de visitantes no condomínio.': 'Register visitor entry into the condominium.',
        'Ver histórico de acessos': 'View access history',
        'Novo visitante': 'New Visitor',
        'Nome completo': 'Full Name',
        'E-mail': 'Email',
        'CPF': 'CPF',
        'RG': 'ID / RG',
        'CPF do responsável': 'Responsible CPF',
        'Nome do responsável': 'Responsible Name',
        'Telefone do responsável': 'Responsible Phone',
        'Apartamento': 'Apartment',
        'Bloco': 'Block',
        'Telefone do visitante': 'Visitor Phone',
        'Data da visita': 'Visit Date',
        'Horário previsto': 'Scheduled Time',
        'Previsão de saída': 'Estimated Exit Time',
        'Observações': 'Notes',
        'Informações adicionais (opcional)': 'Additional information (optional)',
        'Cadastre apenas as informações do visitante. O responsável será você.': 'Register only the visitor information. You will be the responsible resident.',
        'Segurança em primeiro lugar': 'Safety first',
        'Todos os visitantes são registrados e sua entrada é autorizada pelo morador responsável.': 'All visitors are registered and their entry is authorized by the responsible resident.',
        'Cancelar': 'Cancel',
        'Registrar visitante': 'Register visitor',
        'Visitantes presentes': 'Visitors present',
        'Acessos de hoje': 'Today\'s accesses',
        'Total de visitantes': 'Total visitors',
        'Motivos mais frequentes': 'Most frequent reasons',
        'Visita a moradores': 'Visits to residents',
        'Prestador de serviço': 'Service provider',
        'Entrega': 'Delivery',
        'Outros': 'Others',
        'Dica de segurança': 'Safety tip',
        'Sempre confirme a identidade do visitante e comunique o morador responsável.': 'Always confirm the visitor identity and notify the responsible resident.',
        'Lista de moradores': 'Resident list',
        'Exportar lista': 'Export list',
        'Distribuição por bloco': 'Distribution by block',
        'Status dos moradores': 'Resident status',
        'Ações rápidas': 'Quick actions',
        'Adicionar novo morador': 'Add new resident',
        'Gerenciar dependentes': 'Manage dependents',
        'Enviar comunicado': 'Send notice',
        'Exportar contatos': 'Export contacts',
        'Dica': 'Tip',
        'Como funciona?': 'How does it work?',
        'Itens encontrados': 'Found items',
        'Itens perdidos': 'Lost items',
        'Precisa de ajuda?': 'Need help?',
        'Marcar todas como lidas': 'Mark all as read',
        'Resumo': 'Summary',
        'Preferências': 'Preferences',
        'Filtrar por categoria': 'Filter by category',
        'Configurar preferências': 'Set preferences',
        'Criar notificação': 'Create notification',
        'Informações do condomínio': 'Condominium Information',
        'Minhas reservas': 'My Reservations',
        'Controle de acesso': 'Access Control',
        'Usuário': 'User',
        'Síndico': 'Manager',
        'Morador': 'Resident',
        'Porteiro': 'Porter',
        'Ocorrências': 'Incident Reports',
        'Registre e acompanhe acontecimentos do condomínio de forma organizada e segura.': 'Register and track condominium incidents in an organized and secure way.'
    }
};

const placeholderTranslations = {
    en: {
        'Buscar por nome, apartamento ou bloco...': 'Search by name, apartment or block...',
        'Buscar por item, local ou data...': 'Search by item, place or date...',
        'Buscar por itens, categorias...': 'Search items, categories...',
        'Buscar por tarefa ou local...': 'Search by task or location...',
        'Digite o nome completo': 'Enter full name',
        'Digite o CPF': 'Enter CPF',
        'Digite o RG': 'Enter RG',
        'Digite o CPF do responsável': 'Enter responsible CPF',
        'Digite o nome do responsável': 'Enter responsible name',
        'Ex: 101': 'Ex: 101',
        'Ex: A': 'Ex: A',
        '(11) 99999-9999': '(11) 99999-9999',
        'Informações adicionais (opcional)': 'Additional information (optional)',
        'Buscar por responsável, unidade, autor ou descrição...': 'Search by responsible person, unit, author or description...',
        'visitante@email.com': 'visitor@email.com'
    }
};

// 022 - Cobertura de tradução das páginas autenticadas.
Object.assign(textTranslations.en, {
    "Controle de Prestadores": "Provider Control",
    "Novo prestador": "New Provider",
    "Prestadores ativos": "Active Providers",
    "Ativos": "Active",
    "Agendados para hoje": "Scheduled Today",
    "Agendados": "Scheduled",
    "Serviços em andamento": "Services in Progress",
    "Em andamento": "In Progress",
    "Inadimplentes": "Non-compliant",
    "Irregular": "Irregular",
    "Inativos": "Inactive",
    "Bloqueados": "Blocked",
    "Todos": "All",
    "Prestador": "Provider",
    "Empresa / Serviço": "Company / Service",
    "Categoria": "Category",
    "Contato": "Contact",
    "Entrada / Saída": "Entry / Exit",
    "Status": "Status",
    "Ações": "Actions",
    "10 por página": "10 per page",
    "20 por página": "20 per page",
    "Categorias": "Categories",
    "Documentos necessários": "Required Documents",
    "Documento de identificação": "Identification Document",
    "RG ou CNH atualizados": "Updated ID or Driver License",
    "Comprovante de empresa": "Company Documentation",
    "CNPJ ou contrato do serviço": "CNPJ or Service Contract",
    "Certificados e licenças": "Certificates and Licenses",
    "Quando exigidos pela atividade": "When required for the activity",
    "Seguro de responsabilidade": "Liability Insurance",
    "Para serviços com maior exposição": "For higher-risk services",
    "NRs e treinamentos": "Safety Standards and Training",
    "Conforme o tipo de manutenção": "According to the maintenance type",
    "Cadastre um prestador para o condomínio atual.": "Register a provider for the current condominium.",
    "Nome do prestador": "Provider Name",
    "Empresa": "Company",
    "Serviço": "Service",
    "Elétrica": "Electrical",
    "Limpeza": "Cleaning",
    "Hidráulica": "Plumbing",
    "Segurança": "Security",
    "Jardinagem": "Gardening",
    "Pintura": "Painting",
    "Elevadores": "Elevators",
    "Telefone": "Phone",
    "Data do atendimento": "Service Date",
    "Janela do atendimento": "Service Window",
    "Status inicial": "Initial Status",
    "Agendado": "Scheduled",
    "Concluído": "Completed",
    "Cancelado": "Canceled",
    "Salvar prestador": "Save Provider",
    "Total de manutenções": "Total Maintenance",
    "Este mês": "This Month",
    "Concluídas": "Completed",
    "Pendentes": "Pending",
    "Atrasadas": "Overdue",
    "Pendente": "Pending",
    "Concluída": "Completed",
    "Atrasada": "Overdue",
    "Tarefa": "Task",
    "Local": "Location",
    "Periodicidade": "Frequency",
    "Próxima execução": "Next Execution",
    "Carregando manutenções...": "Loading maintenance...",
    "Mostrar todos os dias": "Show All Days",
    "Dom": "Sun",
    "Seg": "Mon",
    "Ter": "Tue",
    "Qua": "Wed",
    "Qui": "Thu",
    "Sex": "Fri",
    "Sáb": "Sat",
    "Cadastre uma nova atividade preventiva para acompanhar no cronograma.": "Register a new preventive activity to track in the schedule.",
    "Mensal": "Monthly",
    "Bimestral": "Every Two Months",
    "Trimestral": "Quarterly",
    "Semestral": "Every Six Months",
    "Anual": "Yearly",
    "Descrição": "Description",
    "Salvar manutenção": "Save Maintenance",
    "Acesse relatórios, históricos e comprovantes das manutenções.": "Access maintenance reports, history and receipts.",
    "0 manutenções encontradas": "0 maintenance items found",
    "Registrar achado": "Register Found Item",
    "Todos os tipos": "All Types",
    "Itens perdidos": "Lost Items",
    "Disponível": "Available",
    "Devolvido": "Returned",
    "Em análise": "Under Review",
    "Veja itens que foram encontrados": "View found items",
    "Veja itens que foram perdidos": "View lost items",
    "0 resultados": "0 results",
    "Encontrou algo?": "Found Something?",
    "Registre o item encontrado com o máximo de detalhes possível.": "Register the found item with as much detail as possible.",
    "Publicamos para todos": "Published to Everyone",
    "Seu registro ajuda o proprietário a localizar o objeto mais rápido.": "Your report helps the owner locate the item faster.",
    "Devolução segura": "Safe Return",
    "Combine a entrega pela portaria ou com a administração.": "Arrange the return through the gatehouse or administration.",
    "Dicas importantes": "Important Tips",
    "Verifique sempre fotos e local do item antes do contato.": "Always check photos and the item location before making contact.",
    "Combine a devolução na portaria sempre que possível.": "Arrange the return at the gatehouse whenever possible.",
    "Em caso de dúvida, fale com o síndico ou administração.": "If in doubt, contact the manager or administration.",
    "Fale com o apoio do condomínio.": "Contact condominium support.",
    "Cadastre um item perdido ou encontrado.": "Register a lost or found item.",
    "Tipo": "Type",
    "Encontrado": "Found",
    "Perdido": "Lost",
    "Nome do item": "Item Name",
    "Data": "Date",
    "Imagem do item": "Item Image",
    "Adicione uma imagem para identificar o item.": "Add an image to identify the item.",
    "Salvar registro": "Save Record",
    "Veja e gerencie as sugestões enviadas pelos moradores.": "View and manage suggestions submitted by residents.",
    "Áreas Comuns": "Common Areas",
    "Lazer": "Leisure",
    "Estacionamento": "Parking",
    "Sustentabilidade": "Sustainability",
    "Recusado": "Rejected",
    "Nova Sugestão": "New Suggestion",
    "SUGESTÃO": "SUGGESTION",
    "CATEGORIA": "CATEGORY",
    "STATUS": "STATUS",
    "DATA": "DATE",
    "MORADOR": "RESIDENT",
    "Nenhuma sugestão encontrada": "No suggestions found",
    "Anterior": "Previous",
    "Próxima": "Next",
    "Título da sugestão": "Suggestion Title",
    "Selecione uma categoria": "Select a Category",
    "Enviar Sugestão": "Submit Suggestion",
    "Detalhes da Sugestão": "Suggestion Details",
    "Curtir": "Like",
    "Fechar": "Close",
    "Descreva o que quer comunicar e deixe a IA escrever para você.": "Describe what you want to communicate and let AI write it for you.",
    "Descreva o comunicado": "Describe the Notice",
    "O que você quer comunicar hoje?": "What do you want to communicate today?",
    "Descreva em poucas palavras o objetivo do comunicado. A IA irá gerar um texto profissional, claro e adequado para os moradores.": "Briefly describe the purpose of the notice. AI will generate professional, clear text suitable for residents.",
    "Gerar rascunho com IA": "Generate AI Draft",
    "Resultado da IA": "AI Result",
    "Rascunho do comunicado": "Notice Draft",
    "Confira o comunicado gerado. Você pode refinar, copiar o texto ou enviar diretamente para o mural de avisos.": "Review the generated notice. You can refine it, copy it or send it directly to the notice board.",
    "Título aparecerá aqui": "Title Will Appear Here",
    "Refinar": "Refine",
    "Copiar texto": "Copy Text",
    "Enviar comunicado": "Send Notice",
    "Histórico": "History",
    "Comunicados recentes": "Recent Notices",
    "Acesse os últimos comunicados gerados pela IA.": "Access the latest notices generated by AI.",
    "Nenhum comunicado gerado ainda.": "No notices generated yet.",
    "Dicas": "Tips",
    "Sugestões de uso": "Usage Suggestions",
    "Saiba como aproveitar melhor a IA para seus comunicados.": "Learn how to make better use of AI for your notices.",
    "Inclua datas e horários para maior clareza": "Include dates and times for greater clarity",
    "Especifique o bloco/apartamento se for algo pontual": "Specify the block/apartment for a specific issue",
    "Use o botão \"Refinar\" para ajustar o tom do texto": "Use the \"Refine\" button to adjust the tone",
    "Sempre revise antes de enviar para os moradores": "Always review before sending to residents",
    "Categorize: Manutenção, Eventos, Avisos, Regras, etc.": "Categorize: Maintenance, Events, Notices, Rules, etc.",
    "Para comunicados urgentes, mencione \"urgente\" na descrição": "For urgent notices, mention \"urgent\" in the description",
    "Bem-vindo ao painel de gestão do condomínio": "Welcome to the condominium management dashboard",
    "Status do Condomínio": "Condominium Status",
    "Nome do Condomínio": "Condominium Name",
    "Total de Apartamentos": "Total Apartments",
    "Moradores Ativos": "Active Residents",
    "Próxima Assembleia": "Next Assembly",
    "Avisos Pendentes": "Pending Notices",
    "Enviar Aviso": "Send Notice",
    "Agendar Reunião": "Schedule Meeting",
    "Gerar Boleto": "Generate Invoice",
    "Chat": "Chat",
    "Lista de Condomínio": "Condominium List",
    "Proprietário": "Owner",
    "Carregando moradores...": "Loading residents...",
    "Carregando manutenções programadas...": "Loading scheduled maintenance...",
    "Resumo do Mês": "Monthly Summary",
    "Despesas": "Expenses",
    "Receitas": "Revenue",
    "Comunicação": "Communication",
    "Ver Relatório Completo": "View Full Report",
    "Ir para Painel Morador/Comunidade Digital": "Go to Resident/Digital Community Dashboard",
    "Chat com o Síndico": "Chat with the Manager",
    "Fale diretamente com o síndico do seu condomínio.": "Talk directly to your condominium manager.",
    "Carregando síndico...": "Loading manager...",
    "Buscando o síndico do seu condomínio": "Finding your condominium manager",
    "Chat com Porteiro": "Chat with Porter",
    "Converse com a portaria do seu condomínio.": "Chat with your condominium gatehouse.",
    "Conversas": "Conversations",
    "Selecione uma conversa": "Select a Conversation",
    "Escolha uma conversa para começar": "Choose a conversation to start",
    "Nenhuma conversa selecionada": "No conversation selected",
    "Escolha uma conversa na lista ao lado.": "Choose a conversation from the list.",
    "Chat com Moradores": "Chat with Residents",
    "Converse diretamente com os moradores do condomínio.": "Chat directly with condominium residents.",
    "Escolha um morador para começar": "Choose a resident to start",
    "Escolha um morador na lista ao lado para começar a conversar.": "Choose a resident from the list to start chatting.",
    "Registrar encomenda": "Register Package",
    "Aguardando retirada": "Awaiting Pickup",
    "Na portaria": "At Gatehouse",
    "Recebidas hoje": "Received Today",
    "Registradas hoje": "Registered Today",
    "Retiradas hoje": "Picked Up Today",
    "Entregues ao morador": "Delivered to Resident",
    "Devolvidas hoje": "Returned Today",
    "Devolvidas": "Returned",
    "Retiradas": "Picked Up",
    "Todos os blocos": "All Blocks",
    "Todas": "All",
    "Unidade": "Unit",
    "Transportadora": "Carrier",
    "Recebida em": "Received On",
    "Recebido por": "Received By",
    "Como funciona": "How It Works",
    "Ao autorizar uma entrega, a portaria recebe a informação para validação no momento da chegada.": "When a delivery is authorized, the gatehouse receives the information for validation upon arrival.",
    "Controle total de quem pode retirar ou deixar encomendas dentro do condomínio.": "Full control over who can pick up or leave packages inside the condominium.",
    "Praticidade": "Convenience",
    "Agende entregas com antecedência e organize o fluxo da portaria.": "Schedule deliveries in advance and organize gatehouse flow.",
    "Receba alertas rápidos sobre o status das entregas cadastradas.": "Receive quick alerts about registered delivery status.",
    "Registre uma entrega para o condomínio atual.": "Register a delivery for the current condominium.",
    "Código da entrega": "Delivery Code",
    "Loja": "Store",
    "Data prevista": "Expected Date",
    "Janela de entrega": "Delivery Window",
    "Salvar autorização": "Save Authorization",
    "Barra de pesquisa": "Search Bar",
    "Total de moradores": "Total Residents",
    "Total de unidades": "Total Units",
    "Unidades": "Units",
    "Novos este mês": "New This Month",
    "Cadastros": "Registrations",
    "Dependentes": "Dependents",
    "Cadastrados": "Registered",
    "Mantenha os dados dos moradores sempre atualizados para uma comunicação mais eficiente e segura.": "Keep resident data up to date for safer and more efficient communication.",
    "Acompanhe os avisos do seu condomínio.": "Follow your condominium notices.",
    "Avisos do condomínio": "Condominium Notices",
    "Acompanhe os avisos publicados pelo síndico para o condomínio.": "Follow notices published by the manager for the condominium.",
    "Publicar aviso": "Publish Notice",
    "0 avisos": "0 notices",
    "Resumo do mural": "Notice Board Summary",
    "Total de avisos": "Total Notices",
    "Publicados neste mês": "Published This Month",
    "Última atualização": "Last Update",
    "Notificações automáticas": "Automatic Notifications",
    "Quando um novo aviso for adicionado, os usuários do condomínio recebem uma atualização na página de Notificações.": "When a new notice is added, condominium users receive an update on the Notifications page.",
    "Publicar novo aviso": "Publish New Notice",
    "O aviso será publicado no Mural de Avisos para os moradores do condomínio.": "The notice will be published on the Notice Board for condominium residents.",
    "Avisos": "Notices",
    "Reservas": "Reservations",
    "Assembleias": "Assemblies",
    "Entregas": "Deliveries",
    "Título": "Title",
    "Aviso": "Notice",
    "Publicar no mural": "Publish to Board",
    "Detalhes do aviso": "Notice Details",
    "Informações completas do aviso.": "Complete notice information.",
    "Publicado por": "Published By",
    "Data da publicação": "Publication Date",
    "Origem": "Source",
    "Publicado pelo síndico": "Published by the Manager",
    "Informações do aviso": "Notice Information",
    "Livro digital de ocorrências": "Digital Incident Log",
    "Central de ocorrências do condomínio": "Condominium Incident Center",
    "Utilize esta área para registrar uma nova ocorrência ou consultar os registros feitos por você. Síndicos também podem consultar as ocorrências do condomínio.": "Use this area to register a new incident or view records submitted by you. Managers can also view condominium incidents.",
    "Minhas ocorrências": "My Incidents",
    "Veja todos os registros feitos por você.": "View all records submitted by you.",
    "Registrar uma ocorrência": "Register an Incident",
    "Preencha o livro digital e assine o registro.": "Fill out the digital log and sign the record.",
    "Ver ocorrências": "View Incidents",
    "Recolher ocorrências": "Collapse Incidents",
    "Feche a consulta de registros do condomínio.": "Close the condominium records view.",
    "Consulte os registros do condomínio com busca e filtros.": "View condominium records with search and filters.",
    "Ocorrências do condomínio": "Condominium Incidents",
    "Carregando ocorrências...": "Loading incidents...",
    "Recolher": "Collapse",
    "Pesquisar ocorrências": "Search Incidents",
    "Função": "Role",
    "Todo o período": "All Time",
    "Últimos 7 dias": "Last 7 Days",
    "Últimos 30 dias": "Last 30 Days",
    "Últimos 90 dias": "Last 90 Days",
    "Registro": "Record",
    "Ocorrência": "Incident",
    "Responsável": "Responsible Person",
    "Unidade envolvida": "Unit Involved",
    "Ação": "Action",
    "Carregando...": "Loading...",
    "Histórico pessoal": "Personal History",
    "Livro de Registro de Ocorrências": "Incident Record Book",
    "Preencha os dados abaixo. Os dados do responsável pelo registro são identificados automaticamente.": "Fill in the information below. The responsible user information is identified automatically.",
    "Data do registro": "Record Date",
    "Hora do registro": "Record Time",
    "Responsável pelo registro": "Responsible for Record",
    "Data da ocorrência": "Incident Date",
    "Hora da ocorrência": "Incident Time",
    "Autor da ocorrência": "Incident Author",
    "Descrição da ocorrência": "Incident Description",
    "Assinatura": "Signature",
    "Desenhe sua assinatura na área abaixo usando o mouse ou o toque.": "Draw your signature in the area below using the mouse or touch.",
    "Limpar assinatura": "Clear Signature",
    "Assine aqui": "Sign Here",
    "Faça sua assinatura antes de registrar a ocorrência.": "Sign before registering the incident.",
    "Registrar ocorrência": "Register Incident",
    "Registro completo": "Full Record",
    "Detalhes da ocorrência": "Incident Details",
    "Ver registro": "View Record",
    "Ver": "View",
    "Não informada": "Not Informed",
    "Não informado": "Not Informed",
    "Período": "Period",
    "Você ainda não registrou nenhuma ocorrência.": "You have not registered any incidents yet.",
    "Não foi possível carregar suas ocorrências.": "Could not load your incidents.",
    "Não foi possível carregar os registros.": "Could not load the records.",
    "Nenhuma ocorrência corresponde aos filtros selecionados.": "No incidents match the selected filters.",
    "Ocorrência registrada com sucesso.": "Incident registered successfully.",
    "Assinatura indisponível": "Signature unavailable",
    "Data não informada": "Date not provided",
    "Não foi possível identificar o condomínio da sua conta.": "Could not identify the condominium linked to your account.",
    "Não foi possível identificar o e-mail do usuário.": "Could not identify the user's email.",
    "A conexão com o Supabase não está disponível nesta página.": "The Supabase connection is not available on this page.",
    "Preencha a data, a hora e a descrição da ocorrência.": "Fill in the incident date, time and description.",
    "A área de assinatura não está disponível.": "The signature area is not available.",
    "Registrando...": "Registering...",
    "Erro ao carregar suas ocorrências.": "Error loading your incidents.",
    "Erro ao carregar ocorrências.": "Error loading incidents.",
    "Sempre verifique a documentação e libere o acesso apenas para prestadores autorizados e vinculados ao serviço esperado.": "Always verify the documentation and allow access only to authorized providers linked to the expected service.",
    "Detalhes da Assembleia": "Assembly Details",
    "Visualize todas as informações e participe ativamente": "View all information and participate actively",
    "Carregando detalhes da assembleia...": "Loading assembly details...",
    "Ops!": "Oops!",
    "Não foi possível carregar os detalhes da assembleia.": "Could not load the assembly details.",
    "Voltar para Assembleias": "Back to Assemblies",
    "Agendada": "Scheduled",
    "Título da Assembleia": "Assembly Title",
    "Descrição da assembleia": "Assembly Description",
    "Horário": "Time",
    "Duração": "Duration",
    "Ordinária": "Ordinary",
    "Condomínio": "Condominium",
    "Tempo restante para o início": "Time Remaining Until Start",
    "Dias": "Days",
    "Horas": "Hours",
    "Minutos": "Minutes",
    "Segundos": "Seconds",
    "Entrar agora": "Join Now",
    "Assembleia encerrada": "Assembly Ended",
    "Esta assembleia já foi encerrada. Você pode acessar os resultados abaixo.": "This assembly has ended. You can access the results below.",
    "Assembleia cancelada": "Assembly Canceled",
    "Esta assembleia foi cancelada.": "This assembly was canceled.",
    "Iniciando agora...": "Starting now...",
    "Informações gerais": "General Information",
    "Organizador": "Organizer",
    "Regras": "Rules",
    "Não informadas": "Not Informed",
    "Quórum necessário": "Required Quorum",
    "Maioria simples": "Simple Majority",
    "Participantes presentes": "Participants Present",
    "participantes": "participants",
    "Pautas": "Agenda Items",
    "0 itens": "0 items",
    "Nenhuma pauta cadastrada": "No agenda items registered",
    "As pautas serão adicionadas em breve.": "Agenda items will be added soon.",
    "Votações previstas": "Planned Votes",
    "Sem votações previstas": "No planned votes",
    "As votações serão criadas durante a assembleia.": "Votes will be created during the assembly.",
    "Documentos": "Documents",
    "0 arquivos": "0 files",
    "Nenhum documento disponível": "No documents available",
    "Os documentos serão disponibilizados antes da assembleia.": "Documents will be made available before the assembly.",
    "Acesso Restrito": "Restricted Access",
    "Esta assembleia pertence a outro condomínio. Você não tem permissão para acessar os detalhes ou participar.": "This assembly belongs to another condominium. You do not have permission to access the details or participate.",
    "Participantes confirmados": "Confirmed Participants",
    "0 confirmados": "0 confirmed",
    "Confirmar presença": "Confirm Attendance",
    "Nenhum participante confirmou presença ainda.": "No participant has confirmed attendance yet.",
    "Entrar na Assembleia": "Join Assembly",
    "Aguardando início": "Waiting to Start",
    "Voltar": "Back",
    "Materiais da Assembleia": "Assembly Materials",
    "Ver resultados e votações": "View Results and Votes",
    "Ata da assembleia": "Assembly Minutes",
    "Gravação da assembleia": "Assembly Recording",
    "Ata da Assembleia": "Assembly Minutes",
    "Histórico consolidado da reunião realizada.": "Consolidated history of the completed meeting.",
    "Voltar para assembleias": "Back to Assemblies",
    "Carregando assembleia...": "Loading assembly...",
    "Resumo / Ata": "Summary / Minutes",
    "Votações": "Votes",
    "Comentários": "Comments",
    "Eventos persistidos pelo Condomit em ordem cronológica.": "Events stored by Condomit in chronological order.",
    "Votações realizadas": "Votes Held",
    "Opções originais e totais registrados durante a assembleia.": "Original options and totals recorded during the assembly.",
    "Comentários após a reunião": "Post-meeting Comments",
    "Comentários ficam identificados por autor e horário.": "Comments are identified by author and time.",
    "Comentar": "Comment",
    "Avisos e Comunicações": "Notices and Communications",
    "Correio": "Mail",
    "Chat com Síndico": "Chat with Manager",
    "Chat com Portaria": "Chat with Gatehouse",
    "Reservas e Manutenção": "Reservations and Maintenance",
    "Reservas de Locais": "Location Reservations",
    "Faça aqui a reserva dos espaços do condomínio.": "Reserve condominium spaces here.",
    "Ver todas as reservas": "View All Reservations",
    "Salão de Festas": "Party Hall",
    "Capacidade: 80 pessoas": "Capacity: 80 People",
    "Espaço equipado com mesas, cadeiras, ar condicionado, cozinha com geladeira, freezer, fogão e churrasqueira.": "Space equipped with tables, chairs, air conditioning, kitchen with refrigerator, freezer, stove and barbecue grill.",
    "Ver regras de utilização": "View Usage Rules",
    "Selecione a data": "Select Date",
    "Indisponível": "Unavailable",
    "Selecione o horário": "Select Time",
    "Resumo da reserva": "Reservation Summary",
    "Nenhum selecionado": "None Selected",
    "Agendar": "Schedule",
    "Seu assistente inteligente para dúvidas sobre o condomínio.": "Your intelligent assistant for condominium questions.",
    "Assistente Condomit": "Condomit Assistant",
    "Conectando ao seu condomínio...": "Connecting to your condominium...",
    "Nova conversa": "New Conversation",
    "Dúvidas do seu condomínio": "Your Condominium Questions",
    "! Como posso ajudar?": "! How can I help?",
    "Pergunte sobre funcionalidades da Condomit e navegue rapidamente para reservas, visitantes, assembleias, notificações, prestadores e outras áreas do seu condomínio.": "Ask about Condomit features and quickly navigate to reservations, visitors, assemblies, notifications, providers and other condominium areas.",
    "Locais, horários e minhas reservas": "Locations, Times and My Reservations",
    "Visitantes": "Visitors",
    "Cadastro e controle de acesso": "Registration and Access Control",
    "Entrada, votação e atas": "Entry, Voting and Minutes",
    "Avisos publicados no condomínio": "Notices Published in the Condominium",
    "Como falar com o síndico?": "How do I contact the manager?",
    "Como registrar uma encomenda?": "How do I register a package?",
    "Como altero minha foto?": "How do I change my photo?",
    "O assistente usa as funcionalidades disponíveis na Condomit como referência. Para decisões importantes, confirme com o síndico ou com a administração.": "The assistant uses Condomit features as reference. For important decisions, confirm with the manager or administration.",
    "Bem-vindo(a) ao painel. Acompanhe avisos, reservas e informações do condomínio.": "Welcome to the dashboard. Follow notices, reservations and condominium information.",
    "Avisos e comunicações": "Notices and Communications",
    "Mural de avisos": "Notice Board",
    "Confira os últimos avisos do seu condomínio.": "Check the latest notices from your condominium.",
    "Ver mural": "View Board",
    "Canal de Sugestão": "Suggestion Channel",
    "Envie suas sugestões e melhorias.": "Send your suggestions and improvements.",
    "Enviar sugestão": "Send Suggestion",
    "Fique por dentro das novidades.": "Stay up to date.",
    "Ver notificações": "View Notifications",
    "Comunicação e relacionamento": "Communication and Relationships",
    "Chats": "Chats",
    "Converse com o síndico ou portaria.": "Talk with the manager or gatehouse.",
    "Abrir chat": "Open Chat",
    "Perdeu algo? Procure aqui.": "Lost something? Search here.",
    "Acessar": "Open",
    "MarketPlace": "Marketplace",
    "Anuncie ou compre itens dos vizinhos.": "List or buy items from neighbors.",
    "Acessar MarketPlace": "Open Marketplace",
    "Ver detalhes": "View Details",
    "Entrar": "Join",
    "Reservas de locais": "Location Reservations",
    "Reserva de locais": "Location Reservation",
    "Agende o salão de festas, churrasqueira ou outros espaços.": "Schedule the party hall, barbecue area or other spaces.",
    "Fazer reserva": "Make Reservation",
    "Solicitações de manutenção": "Maintenance Requests",
    "Sem solicitações pendentes.": "No pending requests.",
    "IA e serviços": "AI and Services",
    "IA - Dúvidas do condo": "AI - Condo Questions",
    "Tire suas dúvidas sobre o regimento interno.": "Ask questions about condominium rules.",
    "Perguntar agora": "Ask Now",
    "Comunicados Automáticos": "Automatic Notices",
    "Gerencie seus avisos automáticos por IA.": "Manage your automatic AI notices.",
    "Gerenciar Preferências": "Manage Preferences",
    "Aguardando liberação": "Awaiting Release",
    "Liberados hoje": "Released Today",
    "Recusados hoje": "Rejected Today",
    "Total hoje": "Total Today",
    "Liberados": "Released",
    "Recusados": "Rejected",
    "Todos os períodos": "All Periods",
    "Registrar visitante": "Register Visitor",
    "Cadastrar nova entrada": "Register New Entry",
    "Lista de autorizados": "Authorized List",
    "Ver liberados do dia": "View Today’s Released Visitors",
    "Histórico de acessos": "Access History",
    "Visualizar movimentações": "View Activity",
    "Informações importantes": "Important Information",
    "A liberação do visitante deve ser confirmada com base no morador responsável e no condomínio do porteiro logado.": "Visitor release must be confirmed based on the responsible resident and the logged-in porter’s condominium.",
    "Atividade de hoje": "Today’s Activity",
    "Aguardando": "Waiting",
    "Confirme sempre a identidade do visitante e valide o bloco e apartamento do responsável antes de liberar o acesso.": "Always confirm the visitor’s identity and validate the responsible resident’s block and apartment before allowing access.",
    "Compre, venda ou doe itens com segurança entre vizinhos.": "Buy, sell or donate items safely among neighbors.",
    "MarketPlace do condomínio": "Condominium Marketplace",
    "Encontre boas oportunidades sem sair da sua comunidade.": "Find good opportunities without leaving your community.",
    "Anunciar item": "List Item",
    "Móveis": "Furniture",
    "Eletrodomésticos": "Appliances",
    "Eletrônicos": "Electronics",
    "Infantil": "Kids",
    "Esportes": "Sports",
    "Livros": "Books",
    "Favoritos": "Favorites",
    "Meus anúncios": "My Listings",
    "Itens disponíveis": "Available Items",
    "Novo anúncio": "New Listing",
    "Publique um item para vender, doar ou negociar.": "Publish an item to sell, donate or negotiate.",
    "Preço": "Price",
    "Selecione uma imagem para pré-visualizar o anúncio.": "Select an image to preview the listing.",
    "Publicar anúncio": "Publish Listing",
    "Bem-vindo ao painel de gestao do condominio": "Welcome to the condominium management dashboard",
    "Portal de Assembleias": "Assembly Portal",
    "Seja bem-vindo ao portal oficial de assembleias do condominio. Participe ativamente das decisoes que envolvem nosso lar.": "Welcome to the official condominium assembly portal. Participate actively in decisions that affect our community.",
    "Assembleias Agendadas": "Scheduled Assemblies",
    "Agendar Nova Assembleia": "Schedule New Assembly",
    "Titulo da Assembleia": "Assembly Title",
    "Horario de Inicio": "Start Time",
    "Agendar Assembleia": "Schedule Assembly",
    "Assembleias Realizadas": "Completed Assemblies",
    "Preparar entrada": "Prepare to Join",
    "Revise microfone e camera antes de entrar na sala.": "Review microphone and camera before joining the room.",
    "Usuario": "User",
    "Condominio atual": "Current Condominium",
    "Sua camera esta desligada no momento.": "Your camera is currently off.",
    "Pronto para revisar": "Ready to Review",
    "Entrada personalizada": "Custom Entry",
    "Microfone": "Microphone",
    "Camera": "Camera",
    "So audio": "Audio Only",
    "Entrar em silencio": "Join Muted",
    "Microfone desligado": "Microphone Off",
    "Camera desligada": "Camera Off",
    "Permissoes pendentes": "Permissions Pending",
    "Teste de microfone": "Microphone Test",
    "Sem captura": "No Capture",
    "Carregando dispositivos...": "Loading devices...",
    "Saida de audio": "Audio Output",
    "Padrao do sistema": "System Default",
    "Entrar na assembleia": "Join Assembly",
    "Sala pronta para participacao.": "Room ready for participation.",
    "Conectando sala": "Connecting Room",
    "1 participante": "1 participant",
    "Chat da Assembleia": "Assembly Chat",
    "Resumo da Assembleia": "Assembly Summary",
    "Resumo da assembleia sera exibido aqui.": "Assembly summary will be displayed here.",
    "Votacao": "Vote",
    "Voce aprova o projeto?": "Do you approve the project?",
    "A Favor": "In Favor",
    "Contra": "Against",
    "Voto registrado com sucesso!": "Vote registered successfully!",
    "Total de Votos": "Total Votes",
    "Comentarios da Assembleia": "Assembly Comments",
    "Enviar Comentario": "Send Comment",
    "Veja as mudanças e acontecimentos importantes do seu condomínio.": "See important changes and events in your condominium.",
    "Central de Notificações": "Notification Center",
    "Mudanças no Mural de Avisos, assembleias, reservas e outras atualizações aparecem aqui.": "Changes to the Notice Board, assemblies, reservations and other updates appear here.",
    "Atualizações do condomínio": "Condominium Updates",
    "Total": "Total",
    "Não lidas": "Unread",
    "Lidas": "Read",
    "Os avisos completos e permanentes ficam no Mural de Avisos.": "Complete and permanent notices remain on the Notice Board.",
    "Abrir Mural de Avisos": "Open Notice Board",
    "Detalhes da notificação": "Notification Details",
    "Veja as informações desta atualização.": "View the information for this update.",
    "Lida": "Read",
    "Informações": "Information",
    "Acompanhe os visitantes autorizados a entrar no condomínio.": "Track visitors authorized to enter the condominium.",
    "Liberar visitante": "Release Visitor",
    "Visitantes liberados hoje": "Visitors Released Today",
    "Acessos válidos": "Valid Access",
    "Próximos acessos": "Upcoming Access",
    "Total liberados (mês)": "Total Released (Month)",
    "Todos os liberados": "All Released Visitors",
    "Hoje até 7 dias": "Today Through 7 Days",
    "Hoje até 15 dias": "Today Through 15 Days",
    "Hoje até 30 dias": "Today Through 30 Days",
    "Filtros": "Filters",
    "Visitante": "Visitor",
    "Documento": "Document",
    "Data e Horário": "Date and Time",
    "Motivo da Visita": "Visit Reason",
    "7 por página": "7 per page",
    "15 por página": "15 per page",
    "30 por página": "30 per page",
    "Entradas hoje": "Entries Today",
    "Movimentações de entrada": "Entry Movements",
    "Saídas hoje": "Exits Today",
    "Movimentações de saída": "Exit Movements",
    "Movimentações registradas": "Recorded Movements",
    "Pico de movimento": "Peak Movement",
    "Horário de maior fluxo": "Busiest Time",
    "Movimentações recentes": "Recent Movements",
    "A lista considera os visitantes cadastrados e as liberações feitas pelo porteiro no mesmo condomínio.": "The list includes registered visitors and releases made by the porter in the same condominium.",
    "Somente entradas": "Entries Only",
    "Somente saídas": "Exits Only",
    "Nome / Descrição": "Name / Description",
    "Mostrando 0 registros": "Showing 0 records",
    "Atualizar visualização": "Refresh View",
    "Filtros rápidos": "Quick Filters",
    "Todos os registros": "All Records",
    "Exibir todas as movimentações": "Show All Movements",
    "Mostrar apenas entradas": "Show Entries Only",
    "Mostrar apenas saídas": "Show Exits Only",
    "Resumo de atividade": "Activity Summary",
    "Entradas": "Entries",
    "Saídas": "Exits",
    "Todos os registros exibidos pertencem ao mesmo CEP de condomínio do porteiro logado e mostram a unidade do morador responsável.": "All displayed records belong to the same condominium ZIP code as the logged-in porter and show the responsible resident’s unit."
});

Object.assign(textTranslations.en, {
    "Conta e Perfil": "Account and Profile",
    "Foto de perfil": "Profile Photo",
    "Carregando reservas...": "Loading reservations...",
    "Mural de Avisos": "Notice Board",
    "IA - Comunicados Automáticos": "AI - Automatic Notices",
    "Canal de Sugestões": "Suggestions Channel",
    "Assembleia": "Assembly",
    "Autorização de Entregas": "Delivery Authorization",
    "Perfil do usuário": "User Profile",
    "Sair da Conta": "Sign Out",
    "Segurança e acesso": "Security and Access",
    "Autenticação de dois fatores": "Two-Factor Authentication",
    "Mudar de condomínio": "Change Condominium",
    "Comunicados do síndico": "Manager Notices",
    "Avisos gerais do condomínio": "General Condominium Notices",
    "Reserva de áreas comuns": "Common Area Reservations",
    "Reserva e áreas comuns": "Reservations and Common Areas",
    "Lembretes da reserva": "Reservation Reminders",
    "Confirmação/lembrete cancelamento": "Cancellation Reminder/Confirmation",
    "Reserva da área comum": "Reserve Common Area",
    "Política de privacidade": "Privacy Policy",
    "Contatos úteis": "Useful Contacts",
    "Prestadores de serviços": "Service Providers",
    "médio": "medium",
    "Versão do app: 1.0.0": "App version: 1.0.0",
    "Verifique novas atualizações": "Check for updates",
    "Todos os direitos reservados": "All rights reserved",
    "Veja todas as reservas feitas na sua conta.": "See all reservations made on your account.",
    "Veja os dados cadastrados do seu condomínio.": "See the registered details of your condominium.",
    "Carregando informações do condomínio...": "Loading condominium information...",
    "Escolha o que deseja registrar.": "Choose what you want to register.",
    "Cadastre um dependente ligado à sua unidade.": "Register a dependent linked to your unit.",
    "Cadastre um veículo autorizado no condomínio.": "Register a vehicle authorized in the condominium.",
    "Registrar dependente": "Register Dependent",
    "Registrar carro": "Register Vehicle",
    "Manutenção": "Maintenance",
    "Olá,": "Hello,",
    "AVISOS E COMUNICADOS": "NOTICES AND COMMUNICATIONS",
    "COMUNICAÇÃO E RELACIONAMENTO": "COMMUNICATION AND RELATIONSHIPS",
    "ASSEMBLEIA E RESERVAS": "ASSEMBLIES AND RESERVATIONS",
    "IA E SERVIÇOS": "AI AND SERVICES",
    "Descreva o comunicado no passo acima para que a IA gere um rascunho profissional e personalizado para o seu condomínio. Você pode incluir detalhes como: • Data, horário e local do evento ou manutenção • Bloco e apartamento afetados (se aplicável) • Prazo para resposta ou ação dos moradores • Tom do comunicado (formal, amigável, urgente)": "Describe the notice in the step above so AI can generate a professional, customized draft for your condominium. You can include details such as: • Date, time and location of the event or maintenance • Affected block and apartment (if applicable) • Deadline for residents to respond or take action • Notice tone (formal, friendly, urgent)",
    "Use o botão \"Refinar\" para ajustar o tom do texto": "Use the \"Refine\" button to adjust the tone",
    "Para comunicados urgentes, mencione \"urgente\" na descrição": "For urgent notices, mention \"urgent\" in the description",
    "Assembleia de Condominio": "Condominium Assembly",
    "Assembleia Geral Ordinaria": "Ordinary General Assembly",
    "Assembleia Extraordinaria - Reforma do Hall Principal": "Extraordinary Assembly - Main Hall Renovation"
});

Object.assign(placeholderTranslations.en, {
    "Ex.: Filho(a), responsável": "Ex.: Child, guardian",
    "Ex: Assembleia Geral Ordinaria": "Ex: Ordinary General Assembly",
    "Buscar por itens, categorias ou vendedor...": "Search by items, categories or seller...",
    "Buscar por nome, empresa ou serviço...": "Search by name, company or service...",
    "Nome completo": "Full name",
    "Ex: Instalação elétrica": "Ex: Electrical installation",
    "Escreva um comentário sobre a assembleia...": "Write a comment about the assembly...",
    "Buscar conversa...": "Search conversation...",
    "Digite sua mensagem...": "Type your message...",
    "Ex: Manutenção do elevador do bloco A amanhã das 8h às 12h. Pedimos que os moradores utilizem o elevador social. Agradecemos a compreensão.": "Ex: Maintenance on the Block A elevator tomorrow from 8 AM to 12 PM. Please use the service elevator. Thank you for your understanding.",
    "Buscar por nome, documento ou responsável...": "Search by name, document or responsible person...",
    "Buscar sugestões...": "Search suggestions...",
    "Digite o título da sua sugestão": "Enter your suggestion title",
    "Descreva detalhadamente a sua sugestão...": "Describe your suggestion in detail...",
    "Pergunte algo sobre a Condomit ou seu condomínio...": "Ask something about Condomit or your condominium...",
    "Buscar por nome do visitante ou responsável...": "Search by visitor or responsible person...",
    "Nome, apartamento ou identificação (se conhecido)": "Name, apartment or identification (if known)",
    "Descreva o que aconteceu com clareza, incluindo informações importantes para o registro.": "Clearly describe what happened, including important information for the record.",
    "Buscar por morador, entrega ou código...": "Search by resident, delivery or code...",
    "Nome do morador": "Resident name",
    "Informações adicionais sobre a entrega": "Additional delivery information"
});

const dynamicTextPatternsEn = [
    [/^Ocorrência #(\d+)$/i, 'Incident #$1'],
    [/^Ocorrência #(\d+)\s*•\s*registrada em\s*(.+)$/i, 'Incident #$1 • recorded on $2'],
    [/^Olá,\s*(.+)!\s*:\)$/i, 'Hello, $1! :)'],
    [/^Eletricista liberado até\s+(.+)$/i, 'Electrician authorized until $1'],
    [/^Limpeza da piscina às\s+(.+)$/i, 'Pool cleaning at $1'],
    [/^Manutenção elevador amanhã às\s+(.+)$/i, 'Elevator maintenance tomorrow at $1'],
    [/^Entrega para\s+(.+)$/i, 'Delivery for $1'],
    [/^Encomenda para\s+(.+)$/i, 'Package for $1'],
    [/(\d+) manuten(?:ção|ções) encontrada(?:s)?/gi, '$1 maintenance item(s) found'],
    [/(\d+) ocorrência encontrada/gi, '$1 incident found'],
    [/(\d+) ocorrências encontradas/gi, '$1 incidents found'],
    [/(\d+) ocorrência registrada por você/gi, '$1 incident registered by you'],
    [/(\d+) ocorrências registradas por você/gi, '$1 incidents registered by you'],
    [/(\d+) moradores encontrados/gi, '$1 residents found'],
    [/(\d+) avisos/gi, '$1 notices'],
    [/Mostrando (\d+) registros/gi, 'Showing $1 records'],
    [/Mostrando (\d+) prestadores/gi, 'Showing $1 providers'],
    [/Carregando ocorrências/gi, 'Loading incidents'],
    [/Carregando manutenções/gi, 'Loading maintenance'],
    [/Carregando moradores/gi, 'Loading residents']
];


document.addEventListener('DOMContentLoaded', () => {
    sidebarRuntime.currentPage = window.location.pathname.split('/').pop() || '';
    sidebarRuntime.currentUser = getSidebarCurrentUser();
    sidebarRuntime.currentUserType = getSidebarUserType(sidebarRuntime.currentUser);

    window.navigateTo = function navigateTo(routeKey) {
        const target = getTargetForRoute(routeKey, sidebarRuntime.currentUserType);
        if (!target) return;

        if (typeof window.canCondomitUseRoute === 'function' && !window.canCondomitUseRoute(routeKey)) {
            const requiredLevel = getSidebarRouteMinPlanLevel(routeKey);
            const access = {
                plan_name: sidebarRuntime.currentUser?.plan_name || null,
                level: Number(sidebarRuntime.currentUser?.plan_level || 0)
            };
            if (typeof window.showCondomitPlanLock === 'function') {
                window.showCondomitPlanLock(access, requiredLevel);
            }
            return;
        }

        window.location.href = target;
    };

    window.applyGlobalAppLanguage = function applyGlobalAppLanguage(lang = getAppLanguage()) {
        sidebarRuntime.currentPage = window.location.pathname.split('/').pop() || '';
        sidebarRuntime.currentUser = getSidebarCurrentUser();
        sidebarRuntime.currentUserType = getSidebarUserType(sidebarRuntime.currentUser);
        document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
        renderSidebar(sidebarRuntime.currentUser, sidebarRuntime.currentUserType, sidebarRuntime.currentPage, lang);
        refreshSidebarCondominiumLogo(sidebarRuntime.currentUser);
        bindSupportButtons('mailto:contato.condomit@gmail.com?subject=Contato%20Condomit');
        translateDocument(lang);
    };

    window.applyGlobalAppLanguage(getAppLanguage());
    installLanguageObserver();
});

window.addEventListener('storage', (event) => {
    if (event.key === 'app-language' && typeof window.applyGlobalAppLanguage === 'function') {
        window.applyGlobalAppLanguage(event.newValue || 'pt');
    }
});

window.addEventListener('condomit:plan-access-ready', () => {
    sidebarRuntime.currentUser = getSidebarCurrentUser();
    sidebarRuntime.currentUserType = getSidebarUserType(sidebarRuntime.currentUser);
    if (typeof window.applyGlobalAppLanguage === 'function') {
        window.applyGlobalAppLanguage(getAppLanguage());
    }
});

function getAppLanguage() {
    try {
        return localStorage.getItem('app-language') || 'pt';
    } catch (_) {
        return 'pt';
    }
}

function t(key, lang = getAppLanguage()) {
    return sidebarI18n[lang]?.[key] ?? sidebarI18n.pt[key] ?? key;
}

function getSidebarCurrentUser() {
    try {
        const raw = sessionStorage.getItem('condominiumUser');
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function getSidebarUserType(user) {
    try {
        const normalizedType = typeof window.getNormalizedUserType === 'function'
            ? window.getNormalizedUserType(user)
            : (user?.type || user?.user_type || '').toString().trim().toLowerCase();

        if (String(normalizedType).startsWith('porteir')) return 'porteiro';
        if (String(normalizedType).startsWith('mora')) return 'morador';
        return 'sindico';
    } catch (_) {
        return 'sindico';
    }
}

function getHomePage(userType) {
    if (userType === 'morador') return 'index-morador.html';
    if (userType === 'porteiro') return 'index-porteiro.html';
    return 'index.html';
}

function getTargetForRoute(routeKey, userType) {
    const routeMap = {
        inicio: getHomePage(userType),
        mural: 'mural-avisos.html',
        sugestoes: 'sugestoes.html',
        notificacoes: 'notificacoes.html',
        correio: 'notificacoes.html',
        indicacoes: 'notificacoes.html',
        'chat-sindico': 'chat-sindico.html',
        'chat-moradores': 'chat-moradores.html',
        'chat-porteiro': 'chat-porteiro.html',
        'chat-portaria': 'chat-porteiro.html',
        'achados-perdidos': 'achados-perdidos.html',
        marketplace: 'marketplace.html',
        assembleias: 'assembleia.html',
        'gestao-moradores': 'gestao-moradores.html',
        'gestao-avancada': 'gestao-avancada.html',
        reservas: 'reservas.html',
        manutencao: 'manutencao-preventiva.html',
        'ia-duvidas': 'ai-condomit.html',
        comunicados: 'ai-comunicados.html',
        configuracoes: 'configuracoes.html',
        'porteiro-liberacao': 'liberacao-visitantes.html',
        'porteiro-registrar': 'registrar-visitantes.html',
        'porteiro-registro': 'registro-entrada-saida.html',
        'porteiro-visitantes': 'visitantes-liberados.html',
        'porteiro-historico': 'registro-entrada-saida.html',
        'porteiro-emergencia': 'index-porteiro.html#emergencia',
        'porteiro-entregas': 'autorizacao-entregas.html',
        'porteiro-prestadores': 'controle-prestadores.html',
        ocorrencias: 'ocorrencias.html'
    };

    return routeMap[routeKey] || '';
}

function getSidebarRouteMinPlanLevel(routeKey) {
    const proRoutes = new Set([
        'chat-sindico', 'chat-moradores', 'chat-porteiro', 'chat-portaria',
        'achados-perdidos', 'assembleias', 'reservas', 'manutencao',
        'porteiro-liberacao', 'porteiro-registrar', 'porteiro-registro',
        'porteiro-visitantes', 'porteiro-historico', 'porteiro-entregas',
        'porteiro-prestadores', 'porteiro-emergencia'
    ]);
    const premiumRoutes = new Set([
        'ocorrencias', 'marketplace', 'gestao-avancada', 'comunicados'
    ]);
    if (premiumRoutes.has(routeKey)) return 3;
    if (proRoutes.has(routeKey)) return 2;
    return 1;
}

function getSidebarCurrentPlanLevel(user) {
    const explicit = Number(user?.plan_level || 0);
    if (explicit > 0) return explicit;
    const name = String(user?.plan_name || '').trim().toLowerCase();
    if (name.includes('premium')) return 3;
    if (name === 'pro' || name.includes(' pro')) return 2;
    // Enquanto o plano é resolvido pelo guard global, exibimos somente o Essencial.
    return 1;
}

function renderSidebar(currentUser, userType, currentPage, lang = getAppLanguage()) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    sidebar.classList.toggle('porteiro-sidebar', userType === 'porteiro');
    sidebar.classList.toggle('sindico-sidebar', userType !== 'porteiro' && userType !== 'morador');
    sidebar.classList.toggle('morador-sidebar', userType === 'morador');
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img src="${escapeSidebarHtml(getImmediateSidebarLogo(currentUser))}" alt="Logo do condomínio" class="sidebar-logo" onerror="this.onerror=null;this.src='../assets/logo-lado.png';">
            <h2 class="condo-name" id="sidebarApartment">${formatSidebarCondoName(getSidebarCondoName(currentUser, lang), lang)}</h2>
        </div>
        ${buildSidebarNav(userType, currentPage, lang)}
        <div class="sidebar-footer">
            <button class="btn-support" type="button">
                <i class="fas fa-headset"></i>
                <span>${t('support_center', lang)}</span>
            </button>
            <button class="btn-logout-sidebar" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i>
                <span>${t('sign_out', lang)}</span>
            </button>
        </div>
    `;
}


function getImmediateSidebarLogo(user) {
    const condominium = user?.condominium && typeof user.condominium === 'object'
        ? user.condominium
        : {};
    return condominium.logo_url || condominium.logoUrl || condominium.condominium_logo_url || '../assets/logo-lado.png';
}

function getSidebarCondominiumCep(user) {
    const condominium = user?.condominium && typeof user.condominium === 'object'
        ? user.condominium
        : {};
    return String(
        condominium.cep ||
        condominium.condominium_id ||
        user?.condominium_cep ||
        user?.cep ||
        ''
    ).trim();
}

async function refreshSidebarCondominiumLogo(user) {
    const logoElements = Array.from(document.querySelectorAll('.sidebar-logo'));
    if (!logoElements.length) return;

    const fallback = '../assets/logo-lado.png';
    const immediate = getImmediateSidebarLogo(user);
    if (immediate && immediate !== fallback) {
        logoElements.forEach((img) => {
            img.onerror = () => {
                img.onerror = null;
                img.src = fallback;
            };
            img.src = immediate;
        });
        return;
    }

    const cep = getSidebarCondominiumCep(user);
    if (!cep) {
        logoElements.forEach((img) => { img.src = fallback; });
        return;
    }

    if (sidebarCondoLogoCache.has(cep)) {
        const cached = sidebarCondoLogoCache.get(cep) || fallback;
        logoElements.forEach((img) => { img.src = cached; });
        return;
    }

    try {
        let rows = null;
        if (typeof window.supabaseFetch === 'function') {
            try {
                rows = await window.supabaseFetch(
                    `/condominiums?select=logo_url&cep=eq.${encodeURIComponent(cep)}&limit=1`
                );
            } catch (supabaseError) {
                console.warn('[Sidebar] Consulta autenticada da logo falhou; usando fallback da API.', supabaseError?.message || supabaseError);
            }
        }
        if (!rows) {
            const response = await fetch(
                `/api/condominiums?cep=eq.${encodeURIComponent(cep)}`,
                { headers: { Accept: 'application/json' } }
            );
            if (response.ok) rows = await response.json();
        }

        const row = Array.isArray(rows) ? rows[0] : rows;
        const resolved = String(row?.logo_url || '').trim() || fallback;
        sidebarCondoLogoCache.set(cep, resolved);

        logoElements.forEach((img) => {
            img.onerror = () => {
                img.onerror = null;
                img.src = fallback;
            };
            img.src = resolved;
        });

        if (resolved !== fallback && user && typeof user === 'object') {
            const updated = { ...user };
            const condominium = updated.condominium && typeof updated.condominium === 'object'
                ? { ...updated.condominium }
                : {};
            condominium.logo_url = resolved;
            condominium.logoUrl = resolved;
            updated.condominium = condominium;
            try { sessionStorage.setItem('condominiumUser', JSON.stringify(updated)); } catch (_) {}
            try { window.persistCondomitUser?.(updated); } catch (_) {}
            sidebarRuntime.currentUser = updated;
        }
    } catch (error) {
        console.warn('[Sidebar] Não foi possível carregar a logo do condomínio:', error?.message || error);
        sidebarCondoLogoCache.set(cep, fallback);
        logoElements.forEach((img) => { img.src = fallback; });
    }
}

function buildSidebarNav(userType, currentPage, lang = getAppLanguage()) {
    const planLevel = getSidebarCurrentPlanLevel(sidebarRuntime.currentUser);
    const config = getSidebarConfig(userType)
        .map((section) => ({
            ...section,
            // Porteiro é um benefício disponível apenas a partir do Pro; dentro
            // dessa área, Pro e Premium exibem o mesmo conjunto operacional.
            items: userType === 'porteiro'
                ? section.items
                : section.items.filter((item) => planLevel >= getSidebarRouteMinPlanLevel(item.route))
        }))
        .filter((section) => section.items.length > 0);
    const navId = userType === 'morador'
        ? 'sidebarMorador'
        : userType === 'porteiro'
            ? 'sidebarPorteiro'
            : 'sidebarSindico';

    return `
        <nav class="sidebar-nav" id="${navId}">
            ${config.map((section) => renderSidebarSection(section, userType, currentPage, lang)).join('')}
        </nav>
    `;
}

function renderSidebarSection(section, userType, currentPage, lang = getAppLanguage()) {
    const hasTitle = !!section.titleKey;
    const title = hasTitle
        ? `<div class="nav-section-title">${escapeSidebarHtml(t(section.titleKey, lang))}</div>`
        : '';

    const items = section.items.map((item) => {
        const target = getTargetForRoute(item.route, userType);
        const targetPage = target.split('#')[0].split('?')[0];
        const currentPathWithSearch = `${currentPage}${window.location.search || ''}`;
        const isActive = target.includes('?')
            ? target === currentPathWithSearch
            : targetPage && targetPage === currentPage && !window.location.search;
        return `
            <a href="${target || '#'}" class="nav-item ${isActive ? 'active' : ''}" data-section="${item.route}">
                <i class="${item.icon}"></i>
                <span>${escapeSidebarHtml(t(item.labelKey, lang))}</span>
            </a>
        `;
    }).join('');

    const sectionClass = 'nav-section' + (hasTitle ? '' : ' nav-section--plain');
    return `<div class="${sectionClass}">${title}${items}</div>`;
}

function getSidebarConfig(userType) {
    if (userType === 'porteiro') {
        return [
            {
                items: [
                    { labelKey: 'home', icon: 'fas fa-home', route: 'inicio' },
                    { labelKey: 'notifications', icon: 'fas fa-bell', route: 'notificacoes' },
                    { labelKey: 'occurrences', icon: 'fas fa-clipboard-list', route: 'ocorrencias' }
                ]
            },
            {
                titleKey: 'access_control',
                items: [
                    { labelKey: 'visitor_release', icon: 'fas fa-user-group', route: 'porteiro-liberacao' },
                    { labelKey: 'register_visitor', icon: 'fas fa-user-plus', route: 'porteiro-registrar' },
                    { labelKey: 'visitor_entry_exit', icon: 'fas fa-right-to-bracket', route: 'porteiro-registro' },
                    { labelKey: 'released_visitors', icon: 'fas fa-user-check', route: 'porteiro-visitantes' },
                    { labelKey: 'deliveries_authorization', icon: 'fas fa-box', route: 'porteiro-entregas' },
                    { labelKey: 'provider_control', icon: 'fas fa-file-contract', route: 'porteiro-prestadores' }
                ]
            },
            {
                titleKey: 'emergency_services',
                items: [
                    { labelKey: 'emergency_button', icon: 'fas fa-triangle-exclamation', route: 'porteiro-emergencia' }
                ]
            },
            {
                titleKey: 'relationships',
                items: [
                    { labelKey: 'chat_syndic', icon: 'fas fa-comments', route: 'chat-sindico' },
                    { labelKey: 'chat_residents', icon: 'fas fa-comments', route: 'chat-moradores' }
                ]
            },
            {
                titleKey: 'settings',
                items: [{ labelKey: 'settings', icon: 'fas fa-cog', route: 'configuracoes' }]
            }
        ];
    }

    if (userType === 'morador') {
        return [
            { items: [{ labelKey: 'home', icon: 'fas fa-home', route: 'inicio' }] },
            {
                titleKey: 'notices_communications',
                items: [
                    { labelKey: 'mural', icon: 'fas fa-bullhorn', route: 'mural' },
                    { labelKey: 'suggestions', icon: 'fas fa-lightbulb', route: 'sugestoes' },
                    { labelKey: 'notifications', icon: 'fas fa-bell', route: 'notificacoes' },
                    { labelKey: 'occurrences', icon: 'fas fa-clipboard-list', route: 'ocorrencias' }
                ]
            },
            {
                titleKey: 'relationships',
                items: [
                    { labelKey: 'chat_syndic', icon: 'fas fa-comments', route: 'chat-sindico' },
                    { labelKey: 'chat_gatehouse', icon: 'fas fa-door-open', route: 'chat-portaria' },
                    { labelKey: 'lost_found', icon: 'fas fa-search', route: 'achados-perdidos' },
                    { labelKey: 'marketplace', icon: 'fas fa-shopping-bag', route: 'marketplace' }
                ]
            },
            {
                titleKey: 'assemblies',
                items: [
                    { labelKey: 'assembly_plural', icon: 'fas fa-calendar-check', route: 'assembleias' }
                ]
            },
            {
                titleKey: 'reservations_services',
                items: [
                    { labelKey: 'location_reservations', icon: 'fas fa-calendar-alt', route: 'reservas' },
                    { labelKey: 'preventive_maintenance', icon: 'fas fa-tools', route: 'manutencao' }
                ]
            },
            {
                titleKey: 'ai_automation',
                items: [
                    { labelKey: 'ai_questions', icon: 'fas fa-robot', route: 'ia-duvidas' },
                    { labelKey: 'ai_notices', icon: 'fas fa-bell', route: 'comunicados' }
                ]
            },
            {
                titleKey: 'settings',
                items: [{ labelKey: 'settings', icon: 'fas fa-cog', route: 'configuracoes' }]
            }
        ];
    }

    return [
        { items: [{ labelKey: 'home', icon: 'fas fa-home', route: 'inicio' }] },
        {
            titleKey: 'notice_engagement',
            items: [
                { labelKey: 'mural', icon: 'fas fa-bullhorn', route: 'mural' },
                { labelKey: 'suggestions_long', icon: 'fas fa-lightbulb', route: 'sugestoes' },
                { labelKey: 'notifications', icon: 'fas fa-bell', route: 'notificacoes' },
                { labelKey: 'occurrences', icon: 'fas fa-clipboard-list', route: 'ocorrencias' }
            ]
        },
        {
            titleKey: 'relationships',
            items: [
                { labelKey: 'chat_residents', icon: 'fas fa-comments', route: 'chat-moradores' },
                { labelKey: 'chat_porter', icon: 'fas fa-door-open', route: 'chat-porteiro' },
                { labelKey: 'lost_found', icon: 'fas fa-search', route: 'achados-perdidos' },
                { labelKey: 'marketplace', icon: 'fas fa-shopping-bag', route: 'marketplace' }
            ]
        },
        {
            titleKey: 'assembly',
            items: [
                { labelKey: 'assembly', icon: 'fas fa-calendar-check', route: 'assembleias' }
            ]
        },
        {
            titleKey: 'resident_management',
            items: [
                { labelKey: 'resident_management_link', icon: 'fas fa-users-cog', route: 'gestao-moradores' },
                { labelKey: 'advanced_management', icon: 'fas fa-layer-group', route: 'gestao-avancada' }
            ]
        },
        {
            titleKey: 'reservations_maintenance',
            items: [
                { labelKey: 'location_reservations', icon: 'fas fa-calendar-alt', route: 'reservas' },
                { labelKey: 'preventive_maintenance', icon: 'fas fa-tools', route: 'manutencao' }
            ]
        },
        {
            titleKey: 'ai_automation',
            items: [
                { labelKey: 'ai_questions', icon: 'fas fa-robot', route: 'ia-duvidas' },
                { labelKey: 'ai_notices', icon: 'fas fa-magic', route: 'comunicados' }
            ]
        },
        {
            titleKey: 'settings',
            items: [{ labelKey: 'settings', icon: 'fas fa-cog', route: 'configuracoes' }]
        }
    ];
}

function bindSupportButtons(supportMailto) {
    document.querySelectorAll('.btn-support').forEach((button) => {
        button.addEventListener('click', () => {
            window.location.href = supportMailto;
        });
    });
}

function getSidebarCondoName(user, lang = getAppLanguage()) {
    if (window.communityHub && typeof window.communityHub.getCondominiumName === 'function') {
        return window.communityHub.getCondominiumName(user);
    }

    return user?.condominium?.name
        || user?.condominium?.condominium_name
        || t('your_condo', lang);
}

function formatSidebarCondoName(name, lang = getAppLanguage()) {
    if (window.communityHub && typeof window.communityHub.formatCondoName === 'function') {
        return window.communityHub.formatCondoName(name);
    }

    const words = String(name || '').split(' ').filter(Boolean);
    if (words.length > 2) {
        return `${escapeSidebarHtml(words.slice(0, 2).join(' '))}<br>${escapeSidebarHtml(words.slice(2).join(' '))}`;
    }
    return escapeSidebarHtml(words.join(' ') || t('your_condo', lang));
}

function translateDocument(lang = getAppLanguage()) {
    translateTextNodes(lang);
    translatePlaceholders(lang);
    translateTitle(lang);
}

function translateTextNodes(lang = getAppLanguage(), root = document.body) {
    if (!root) return;
    const processNode = (node) => {
        if (!node || node.nodeType !== Node.TEXT_NODE || !node.nodeValue || !node.nodeValue.trim()) return;
        const parent = node.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) return;
        if (parent.closest('[data-no-translate], [translate="no"]')) return;
        let record = sidebarTextNodes.get(node);
        if (!record || typeof record !== 'object') record = { pt: node.nodeValue, rendered: node.nodeValue };
        else if (node.nodeValue !== record.rendered) record.pt = node.nodeValue;
        const translated = translateRawText(record.pt, lang);
        record.rendered = translated;
        sidebarTextNodes.set(node, record);
        if (node.nodeValue !== translated) node.nodeValue = translated;
    };
    if (root.nodeType === Node.TEXT_NODE) { processNode(root); return; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
            if (parent.closest('[data-no-translate], [translate="no"]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    let node = walker.nextNode();
    while (node) { processNode(node); node = walker.nextNode(); }
}

function translateRawText(value, lang = getAppLanguage()) {
    if (lang === 'pt') return value;
    const original = String(value || '');
    const trimmed = original.trim();
    if (!trimmed) return original;

    /*
     * Parágrafos formatados em várias linhas no HTML possuem quebras e
     * indentação internas. Normalizamos apenas a chave de consulta; o texto
     * registrado pelo usuário não é alterado e elementos marcados com
     * data-no-translate/translate="no" são ignorados pelo walker.
     */
    const normalizedKey = trimmed.replace(/\s+/g, ' ');
    const translated =
        textTranslations[lang]?.[trimmed] ||
        textTranslations[lang]?.[normalizedKey];

    if (translated) return original.replace(trimmed, translated);
    const greetingMorning = trimmed.match(/^Bom dia,\s*(.+)!$/i);
    if (greetingMorning) return original.replace(trimmed, `Good morning, ${greetingMorning[1]}!`);
    const greetingHello = trimmed.match(/^Olá,\s*(.+)!\s*:?[)]?$/i);
    if (greetingHello) return original.replace(trimmed, `Hello, ${greetingHello[1]}!`);
    let patternTranslated = trimmed;
    dynamicTextPatternsEn.forEach(([pattern, replacement]) => { patternTranslated = patternTranslated.replace(pattern, replacement); });
    return patternTranslated !== trimmed ? original.replace(trimmed, patternTranslated) : original;
}

window.translateAppText = function translateAppText(value, lang = getAppLanguage()) {
    return translateRawText(value, lang);
};

let sidebarLanguageObserver = null;
function installLanguageObserver() {
    if (sidebarLanguageObserver) return;
    sidebarLanguageObserver = new MutationObserver((mutations) => {
        const lang = getAppLanguage();
        if (lang !== 'en') return;
        mutations.forEach((mutation) => {
            if (mutation.type === 'characterData') translateTextNodes(lang, mutation.target);
            mutation.addedNodes?.forEach((node) => translateTextNodes(lang, node));
        });
        translatePlaceholders(lang);
    });
    sidebarLanguageObserver.observe(document.body, { subtree: true, childList: true, characterData: true });
}

function translatePlaceholders(lang = getAppLanguage()) {
    document.querySelectorAll('[placeholder]').forEach((element) => {
        if (!sidebarPlaceholderNodes.has(element)) {
            sidebarPlaceholderNodes.set(element, element.getAttribute('placeholder') || '');
        }
        const original = sidebarPlaceholderNodes.get(element);
        const translated = lang === 'en'
            ? (placeholderTranslations.en[original] || original)
            : original;
        element.setAttribute('placeholder', translated);
    });
}

function translateTitle(lang = getAppLanguage()) {
    const saved = document.documentElement.getAttribute('data-title-pt');
    const original = saved || document.title || '';
    if (!saved && original) document.documentElement.setAttribute('data-title-pt', original);
    if (lang === 'pt') { if (original) document.title = original; return; }
    const explicit = {
        'Condomit - Configurações':'Condomit - Settings',
        'Condomit - Notificações':'Condomit - Notifications',
        'Condomit - Mural de Avisos':'Condomit - Notice Board',
        'Condomit - Achados e Perdidos':'Condomit - Lost and Found',
        'Condomit - Gestão de Moradores':'Condomit - Resident Management',
        'Condomit - Manutenção Preventiva':'Condomit - Preventive Maintenance',
        'Condomit - Registrar Visitantes':'Condomit - Register Visitors',
        'Condomit - Painel do Porteiro':'Condomit - Porter Dashboard',
        'Condomit - Painel do Síndico':'Condomit - Manager Dashboard',
        'Condomit - Painel do Morador':'Condomit - Resident Dashboard',
        'Condomit - Liberação de Visitantes':'Condomit - Visitor Release',
        'Condomit - Registro de Entrada e Saída':'Condomit - Entry and Exit Log',
        'Condomit - Autorização de Entregas':'Condomit - Delivery Authorization',
        'Condomit - Controle de Prestadores':'Condomit - Provider Control',
        'Condomit - Ocorrências':'Condomit - Incident Reports',
        'Condomit - Canal de Sugestões':'Condomit - Suggestions Channel',
        'Condomit - IA - Comunicados Automáticos':'Condomit - AI - Automatic Notices',
        'Condomit - Chat com o Síndico':'Condomit - Chat with Manager',
        'Condomit - Chat com Porteiro':'Condomit - Chat with Porter',
        'Condomit - Chat com Moradores':'Condomit - Chat with Residents',
        'Condomit - Reserva de Locais':'Condomit - Location Reservations',
        'Condomit - Visitantes Liberados':'Condomit - Released Visitors',
        'Condomit - Ata da Assembleia':'Condomit - Assembly Minutes',
        'Detalhes da Assembleia | Condomit':'Assembly Details | Condomit'
    };
    if (explicit[original]) { document.title = explicit[original]; return; }
    if (original.startsWith('Condomit - ')) {
        document.title = `Condomit - ${translateRawText(original.slice(10), 'en')}`;
        return;
    }
    document.title = translateRawText(original, 'en');
}

function escapeSidebarHtml(text) {
    return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
