(() => {
  'use strict';
  const PT_EN = {
  "Condomit - Gestão Inteligente para Condomínios": "Condomit - Smart Condominium Management",
  "Início": "Home",
  "Sobre": "About",
  "Recursos": "Features",
  "Planos": "Plans",
  "Dúvidas": "FAQ",
  "Contato": "Contact",
  "Entrar": "Sign in",
  "Cadastre-se": "Sign up",
  "Gestão inteligente para condomínios modernos": "Smart management for modern condominiums",
  "Controle comunicações, finanças, ocorrências, visitantes, assembleias e muito mais em um único lugar.": "Manage communications, finances, incidents, visitors, meetings and much more in one place.",
  "Saiba mais": "Learn more",
  "Instalar Condomit": "Install Condomit",
  "Planejamento": "Planning",
  "Economia Mensal": "Monthly savings",
  "Gestão de Ocorrências": "Incident management",
  "Acesso Inteligente": "Smart access",
  "Tecnologia que transforma a vida em condomínio": "Technology that transforms condominium living",
  "Integramos as melhores soluções para facilitar a gestão, aumentar a segurança e melhorar a comunicação no seu condomínio.": "We bring together the right tools to simplify management, strengthen security and improve communication in your condominium.",
  "Para síndicos": "For managers",
  "Relatórios em tempo": "Real-time reports",
  "Equipe dedicada": "Dedicated team",
  "Suporte completo": "Complete support",
  "condomínios": "condominiums",
  "moradores": "residents",
  "comunicados enviados": "notices sent",
  "Escolha o plano ideal para o seu condomínio": "Choose the right plan for your condominium",
  "Planos personalizados para condomínios de pequeno, médio e grande porte.": "Plans designed for small, medium and large condominiums.",
  "Plano Essencial": "Essential Plan",
  "Plano Pro": "Pro Plan",
  "Plano Premium": "Premium Plan",
  "/mês": "/month",
  "Mural de avisos e notificações": "Notice board and notifications",
  "Canal de sugestões": "Suggestion channel",
  "Gestão de moradores": "Resident management",
  "IA para dúvidas do condomínio": "AI for condominium questions",
  "Quero este plano": "Choose this plan",
  "Mural, sugestões, notificações e gestão de moradores": "Notice board, suggestions, notifications and resident management",
  "IA para dúvidas, dados pessoais, Minha unidade e configurações": "AI for questions, personal data, My Unit and settings",
  "Chats, achados e perdidos e assembleias digitais": "Chats, lost and found, and digital meetings",
  "Reservas e manutenção preventiva": "Reservations and preventive maintenance",
  "Controle de acesso, encomendas e acesso completo para porteiros": "Access control, deliveries and full doorman access",
  "Todos os recursos do Essencial e do Pro": "Everything in Essential and Pro",
  "Chats, assembleias, reservas, manutenção e controle de acesso": "Chats, meetings, reservations, maintenance and access control",
  "Porteiros, encomendas, achados e perdidos e gestão de moradores": "Doormen, deliveries, lost and found, and resident management",
  "Ocorrências e Marketplace do condomínio": "Incidents and condominium Marketplace",
  "Gestão Avançada e todos os recursos vinculados": "Advanced Management and all related features",
  "IA para comunicados automáticos": "AI for automated notices",
  "Perguntas frequentes": "Frequently asked questions",
  "Como funciona o sistema?": "How does the system work?",
  "A Condomit é uma plataforma web que permite gerenciar todos os aspectos do seu condomínio em um único lugar, desde comunicados até finanças.": "Condomit is a web platform that lets you manage your condominium in one place, from notices to finances.",
  "Quais são os planos disponíveis?": "Which plans are available?",
  "Temos três planos: Essencial, Pro e Premium, cada um adaptado às necessidades de diferentes tamanhos de condomínios.": "We offer three plans: Essential, Pro and Premium, each designed for different condominium needs.",
  "É seguro armazenar os dados?": "Is my data stored securely?",
  "Sim! Todos os dados são criptografados e armazenados em servidores seguros com certificado SSL e backups automáticos.": "Yes. Data is protected and stored on secure infrastructure with SSL and automated backups.",
  "Preciso instalar algo?": "How do I install Condomit?",
  "No computador, abra a Condomit no Chrome ou Edge e clique em “Instalar Condomit” (ou no ícone de instalação da barra de endereço). No Android, use o Chrome e toque em “Instalar app”. No iPhone ou iPad, abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.": "On a computer, open Condomit in Chrome or Edge and click “Install Condomit” (or the install icon in the address bar). On Android, use Chrome and tap “Install app”. On iPhone or iPad, open it in Safari, tap Share and choose “Add to Home Screen”.",
  "Como podemos ajudar?": "How can we help?",
  "Entre em contato conosco e teremos prazer em responder todas as suas dúvidas.": "Contact us and we will be happy to answer your questions.",
  "Empresa": "Company",
  "Sobre nós": "About us",
  "Privacidade": "Privacy",
  "Suporte": "Support",
  "Excluir conta": "Delete account",
  "© 2026 Condomit. Todos os direitos reservados.": "© 2026 Condomit. All rights reserved.",
  "Idioma": "Language",
  "Português": "Portuguese"
};
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  const titlePt = 'Condomit - Gestão Inteligente para Condomínios';

  function getLanguage() {
    try { return localStorage.getItem('app-language') === 'en' ? 'en' : 'pt'; } catch (_) { return 'pt'; }
  }

  function translateTextNode(node, lang) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue || '');
    const base = originalText.get(node);
    const clean = base.trim();
    if (!clean || !PT_EN[clean]) {
      if (node.nodeValue !== base) node.nodeValue = base;
      return;
    }
    const start = base.indexOf(clean);
    const next = base.slice(0, start) + (lang === 'en' ? PT_EN[clean] : clean) + base.slice(start + clean.length);
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function translateElementAttributes(el, lang) {
    if (!originalAttrs.has(el)) originalAttrs.set(el, {});
    const cache = originalAttrs.get(el);
    for (const attr of ['title','aria-label']) {
      if (!el.hasAttribute(attr)) continue;
      if (!(attr in cache)) cache[attr] = el.getAttribute(attr);
      const base = cache[attr] || '';
      const clean = base.trim();
      el.setAttribute(attr, lang === 'en' && PT_EN[clean] ? PT_EN[clean] : base);
    }
  }

  function translateTree(root, lang) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const tag = node.parentElement?.tagName;
        return ['SCRIPT','STYLE','NOSCRIPT'].includes(tag) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    while ((node = walker.nextNode())) translateTextNode(node, lang);
    if (root.nodeType === Node.ELEMENT_NODE) translateElementAttributes(root, lang);
    root.querySelectorAll?.('[title],[aria-label]').forEach(el => translateElementAttributes(el, lang));
  }

  function applyLanguage(lang) {
    lang = lang === 'en' ? 'en' : 'pt';
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    document.title = lang === 'en' ? PT_EN[titlePt] : titlePt;
    translateTree(document.body, lang);
    const select = document.getElementById('landing-language-select');
    if (select) select.value = lang;
    try { localStorage.setItem('app-language', lang); } catch (_) {}
    window.dispatchEvent(new CustomEvent('condomit:language-changed', { detail: { language: lang } }));
  }

  function boot() {
    const select = document.getElementById('landing-language-select');
    if (select) select.addEventListener('change', () => applyLanguage(select.value));
    applyLanguage(getLanguage());
    const observer = new MutationObserver(mutations => {
      const lang = getLanguage();
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTextNode(mutation.target, lang);
        mutation.addedNodes?.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, lang);
          else if (node.nodeType === Node.ELEMENT_NODE) translateTree(node, lang);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  window.setLandingLanguage = applyLanguage;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
