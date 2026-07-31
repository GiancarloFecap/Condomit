// AI Condomit - JavaScript

// DOM Elements
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');
const chatMessages = document.getElementById('chatMessages');
const welcomeCard = document.getElementById('welcomeCard');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');
const firstNameEl = document.getElementById('firstName');
const profileNameTop = document.getElementById('profileNameTop');
const profileAvatarTop = document.getElementById('profileAvatarTop');
const sidebarApartment = document.getElementById('sidebarApartment');

// Estado
let conversationHistory = [];

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    loadUserData();
    setupEventListeners();
});

// Carregar dados do usuário
function loadUserData() {
    const currentUser = JSON.parse(sessionStorage.getItem('condominiumUser'));
    
    if (!currentUser) {
        window.location.href = 'entrar.html';
        return;
    }
    
    // Show correct sidebar based on user type
    const sidebarSindico = document.getElementById('sidebarSindico');
    const sidebarMorador = document.getElementById('sidebarMorador');
    
    if (currentUser.type === 'sindico') {
        if (sidebarSindico) sidebarSindico.style.display = 'block';
        if (sidebarMorador) sidebarMorador.style.display = 'none';
    } else {
        if (sidebarSindico) sidebarSindico.style.display = 'none';
        if (sidebarMorador) sidebarMorador.style.display = 'block';
    }
    
    const userName = currentUser.name || 'Usuário';
    const firstName = userName.split(' ')[0];
    firstNameEl.textContent = firstName;
    profileNameTop.textContent = userName;
    profileAvatarTop.textContent = getInitials(userName);
    
    const userTypeEl = document.querySelector('.user-info-small .type');
    if (userTypeEl) {
        userTypeEl.textContent = currentUser.type === 'sindico' ? 'Síndico' : 'Morador';
    }
    
    // Update sidebar condo name
    if (currentUser.condominium) {
        if (sidebarApartment) {
            const words = currentUser.condominium.name.split(' ');
            if (words.length > 2) {
                sidebarApartment.innerHTML = `${words.slice(0, 2).join(' ')}<br>${words.slice(2).join(' ')}`;
            } else {
                sidebarApartment.textContent = currentUser.condominium.name;
            }
        }
    }
}

// Obter iniciais do nome
function getInitials(name) {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

// Configurar event listeners
function setupEventListeners() {
    // Input de texto
    chatInput.addEventListener('input', handleInputChange);
    
    // Enviar mensagem ao clicar no botão
    sendBtn.addEventListener('click', sendMessage);
    
    // Enviar mensagem ao pressionar Enter (sem Shift)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Sugestões de perguntas
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const question = btn.dataset.question;
            chatInput.value = question;
            updateCharCount();
            sendMessage();
        });
    });
}

// Atualizar contador de caracteres
function handleInputChange() {
    updateCharCount();
    autoResizeTextarea();
}

function updateCharCount() {
    const length = chatInput.value.length;
    charCount.textContent = `${length}/500`;
}

function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
}

// Enviar mensagem
function sendMessage() {
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Esconder card de boas-vindas
    if (welcomeCard) {
        welcomeCard.style.display = 'none';
        welcomeCard.style.margin = '0';
    }
    
    // Adicionar mensagem do usuário
    addMessage('user', message);
    
    // Limpar input
    chatInput.value = '';
    updateCharCount();
    autoResizeTextarea();
    
    // Mostrar indicador de digitação
    showTypingIndicator();
    
    // Simular resposta da IA (após 1-2 segundos)
    setTimeout(() => {
        hideTypingIndicator();
        const response = generateAIResponse(message);
        addMessage('ai', response);
    }, 1000 + Math.random() * 1000);
}

// Adicionar mensagem ao chat
function addMessage(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    
    if (type === 'user') {
        avatarDiv.textContent = getInitials(profileNameTop.textContent || 'Usuário');
    } else {
        avatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getCurrentTime();
    
    contentDiv.appendChild(bubbleDiv);
    contentDiv.appendChild(timeDiv);
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll para o final
    scrollToBottom();
    
    // Salvar no histórico
    conversationHistory.push({ type, text, time: getCurrentTime() });
}

// Obter hora atual formatada
function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Mostrar indicador de digitação
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai';
    typingDiv.id = 'typingIndicator';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = '<i class="fas fa-robot"></i>';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    
    bubbleDiv.appendChild(typingIndicator);
    contentDiv.appendChild(bubbleDiv);
    typingDiv.appendChild(avatarDiv);
    typingDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
}

// Esconder indicador de digitação
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// Scroll para o final do chat
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Gerar resposta simulada da IA
function generateAIResponse(question) {
    const lowerQuestion = question.toLowerCase();
    
    // Base de conhecimento simulada
    if (lowerQuestion.includes('salão de festas') || lowerQuestion.includes('salao de festas')) {
        return 'O salão de festas pode ser reservado de segunda a domingo, das 08:00 às 22:00. É necessário reservar com pelo menos 24 horas de antecedência pelo menu "Reserva de Locais".';
    }
    
    if (lowerQuestion.includes('churrasqueira')) {
        return 'A churrasqueira está disponível para reserva todos os dias. Para reservar, acesse "Reserva de Locais" no menu lateral e selecione a churrasqueira.';
    }
    
    if (lowerQuestion.includes('boletos') || lowerQuestion.includes('boleto')) {
        return 'Seus boletos estão disponíveis na seção "Financeiro" do painel. Lá você pode visualizar, baixar e pagar os boletos em aberto, além de conferir o histórico de pagamentos.';
    }
    
    if (lowerQuestion.includes('visitantes')) {
        return 'Para cadastrar visitantes, acesse a seção "Visitantes" no menu lateral. Você pode pré-cadastrar convidados e consultar o histórico de visitas anteriores.';
    }
    
    if (lowerQuestion.includes('regras') || lowerQuestion.includes('regimento')) {
        return 'O regimento interno completo está disponível na seção "Documentos". Lá você encontra todas as regras do condomínio, incluindo horários de silêncio, uso das áreas comuns e normas de convivência.';
    }
    
    if (lowerQuestion.includes('assembleia')) {
        return 'As assembleias são realizadas periodicamente e você pode participar online pelo menu "Assembleias". Lá você encontra o calendário, documentos e pode votar nas deliberações.';
    }
    
    if (lowerQuestion.includes('reservas')) {
        return 'Para fazer reservas de áreas comuns (salão de festas, churrasqueira, piscina), acesse o menu "Reserva de Locais". Selecione o local, data e horário desejados e confirme a reserva.';
    }
    
    // Resposta padrão
    return 'Olá! Sou a AI Condomit. Posso ajudar com dúvidas sobre regras do condomínio, reservas de áreas comuns, boletos, visitantes, assembleias e muito mais. Faça uma pergunta específica para eu poder ajudar melhor!';
}

function logout() {
    sessionStorage.removeItem('condominiumUser');
    window.location.href = '../inicio.html';
}
