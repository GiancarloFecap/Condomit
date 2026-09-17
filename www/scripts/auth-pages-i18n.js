
(function () {
  function getLang() {
    try { return localStorage.getItem('app-language') === 'en' ? 'en' : 'pt'; } catch (_) { return 'pt'; }
  }

  const text = {
    pt: {
      login: {
        title: 'Condomit • Entrar',
        heading: 'Entrar no Condomit',
        subtitle: 'Bem-vindo de volta!',
        email: 'E-mail',
        emailPlaceholder: 'Digite seu e-mail',
        password: 'Senha',
        passwordPlaceholder: 'Digite sua senha',
        showPassword: 'Mostrar senha',
        hidePassword: 'Ocultar senha',
        forgot: 'Esqueceu sua senha?',
        submit: 'Entrar',
        signupPrefix: 'Ainda não possui conta?',
        signupAction: 'Criar conta',
        terms: 'Termos de uso',
        back: 'Voltar para a página inicial'
      },
      tipo: {
        title: 'Condomit • Escolha seu perfil',
        back: 'Voltar',
        login: 'Já tenho conta',
        heroTitle: 'Qual é o seu perfil no condomínio?',
        heroText: 'Escolha a opção que melhor representa você. A Condomit personaliza o cadastro e as funcionalidades disponíveis de acordo com o seu perfil.',
        groupLabel: 'Escolha o tipo de usuário',
        residentTag: 'Uso cotidiano',
        residentTitle: 'Morador',
        residentDesc: 'Para quem deseja acompanhar o condomínio, receber informações e resolver tarefas do dia a dia.',
        residentF1: 'Avisos, notificações e comunicados',
        residentF2: 'Reservas e serviços do condomínio',
        residentChoose: 'Selecionar Morador',
        managerTag: 'Administração',
        managerTitle: 'Síndico',
        managerDesc: 'Para quem administra o condomínio e precisa centralizar gestão, moradores e processos.',
        managerF1: 'Gestão de moradores e unidades',
        managerF2: 'Assembleias e ferramentas administrativas',
        managerChoose: 'Selecionar Síndico',
        porterTag: 'Operação e segurança',
        porterTitle: 'Porteiro',
        porterDesc: 'Para a equipe responsável pela portaria, controle de acessos e rotina operacional do condomínio.',
        porterF1: 'Visitantes e controle de acesso',
        porterF2: 'Encomendas e rotinas da portaria',
        porterChoose: 'Selecionar Porteiro',
        hint: 'Você poderá revisar seus dados antes de concluir o cadastro.',
        continue: 'Continuar'
      },
      cadastroCommon: {
        back: 'Voltar',
        secureTitle: 'Acesso seguro',
        secureText: 'Todas as informações são protegidas e criptografadas para sua segurança.',
        secureFooter: 'Sistema seguro e monitorado',
        name: 'Nome completo',
        namePlaceholder: 'Digite seu nome completo',
        email: 'E-mail',
        emailPlaceholder: 'Digite seu e-mail',
        phone: 'Telefone',
        cpf: 'CPF',
        password: 'Senha',
        passwordPlaceholder: 'Digite sua senha',
        confirmPassword: 'Confirmar senha',
        confirmPasswordPlaceholder: 'Confirme sua senha',
        strengthPrefix: 'Força da senha:',
        weak: 'Fraca',
        fair: 'Razoável',
        good: 'Bom',
        strong: 'Forte',
        reqLength: 'Mínimo de 8 caracteres',
        reqUpper: 'Letras maiúsculas e minúsculas',
        reqNumber: 'Números',
        reqSpecial: 'Pelo menos um caractere especial (!@#$%&*)',
        signupAction: 'Cadastrar no Condomit',
        loginPrefix: 'Já possui conta?',
        loginAction: 'Entrar',
        copyright: '© 2025 Condomit. Todos os direitos reservados.'
      },
      cadastroMorador: {
        title: 'Condomit - Cadastro do Morador',
        heading: 'Cadastro do ',
        role: 'Morador',
        subtitle: 'Cadastre-se para acessar as informações do seu condomínio.'
      },
      cadastroSindico: {
        title: 'Condomit - Cadastro do Síndico',
        heading: 'Cadastro do ',
        role: 'Síndico',
        subtitle: 'Crie sua conta para gerenciar seu condomínio.'
      },
      cadastroPorteiro: {
        title: 'Condomit - Cadastro do Porteiro',
        heading: 'Cadastro do ',
        role: 'Porteiro',
        subtitle: 'Cadastre-se para acessar o sistema de portaria.'
      }
    },
    en: {
      login: {
        title: 'Condomit • Sign in',
        heading: 'Sign in to Condomit',
        subtitle: 'Welcome back!',
        email: 'Email',
        emailPlaceholder: 'Enter your email',
        password: 'Password',
        passwordPlaceholder: 'Enter your password',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        forgot: 'Forgot your password?',
        submit: 'Sign in',
        signupPrefix: "Don't have an account yet?",
        signupAction: 'Create account',
        terms: 'Terms of use',
        back: 'Back to home page'
      },
      tipo: {
        title: 'Condomit • Choose your profile',
        back: 'Back',
        login: 'I already have an account',
        heroTitle: 'What is your role in the condominium?',
        heroText: 'Choose the option that best represents you. Condomit customizes the registration flow and the available features according to your profile.',
        groupLabel: 'Choose user type',
        residentTag: 'Daily use',
        residentTitle: 'Resident',
        residentDesc: 'For those who want to follow condominium updates, receive information and handle everyday tasks.',
        residentF1: 'Notices, notifications and announcements',
        residentF2: 'Reservations and condominium services',
        residentChoose: 'Select Resident',
        managerTag: 'Management',
        managerTitle: 'Property manager',
        managerDesc: 'For those who manage the condominium and need to centralize operations, residents and processes.',
        managerF1: 'Resident and unit management',
        managerF2: 'Assemblies and management tools',
        managerChoose: 'Select Property manager',
        porterTag: 'Operations and security',
        porterTitle: 'Doorman',
        porterDesc: 'For the staff responsible for reception, access control and the operational routine of the condominium.',
        porterF1: 'Visitors and access control',
        porterF2: 'Packages and front desk routines',
        porterChoose: 'Select Doorman',
        hint: 'You will be able to review your information before finishing the registration.',
        continue: 'Continue'
      },
      cadastroCommon: {
        back: 'Back',
        secureTitle: 'Secure access',
        secureText: 'All information is protected and encrypted for your security.',
        secureFooter: 'Secure and monitored system',
        name: 'Full name',
        namePlaceholder: 'Enter your full name',
        email: 'Email',
        emailPlaceholder: 'Enter your email',
        phone: 'Phone',
        cpf: 'CPF',
        password: 'Password',
        passwordPlaceholder: 'Enter your password',
        confirmPassword: 'Confirm password',
        confirmPasswordPlaceholder: 'Confirm your password',
        strengthPrefix: 'Password strength:',
        weak: 'Weak',
        fair: 'Fair',
        good: 'Good',
        strong: 'Strong',
        reqLength: 'At least 8 characters',
        reqUpper: 'Uppercase and lowercase letters',
        reqNumber: 'Numbers',
        reqSpecial: 'At least one special character (!@#$%&*)',
        signupAction: 'Sign up on Condomit',
        loginPrefix: 'Already have an account?',
        loginAction: 'Sign in',
        copyright: '© 2025 Condomit. All rights reserved.'
      },
      cadastroMorador: {
        title: 'Condomit - Resident Sign up',
        heading: 'Sign up as ',
        role: 'Resident',
        subtitle: 'Sign up to access your condominium information.'
      },
      cadastroSindico: {
        title: 'Condomit - Property Manager Sign up',
        heading: 'Sign up as ',
        role: 'Property manager',
        subtitle: 'Create your account to manage your condominium.'
      },
      cadastroPorteiro: {
        title: 'Condomit - Doorman Sign up',
        heading: 'Sign up as ',
        role: 'Doorman',
        subtitle: 'Sign up to access the concierge system.'
      }
    }
  };

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element && value != null) element.textContent = value;
  }
  function setHtml(selector, value) {
    const element = document.querySelector(selector);
    if (element && value != null) element.innerHTML = value;
  }
  function setAttr(selector, attr, value) {
    const element = document.querySelector(selector);
    if (element && value != null) element.setAttribute(attr, value);
  }
  function setIconText(selector, htmlPrefix, textValue) {
    const element = document.querySelector(selector);
    if (!element || textValue == null) return;
    element.innerHTML = `${htmlPrefix}${textValue}`;
  }

  function applyLogin(lang) {
    const t = text[lang].login;
    document.title = t.title;
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    setAttr('.login-back', 'aria-label', t.back);
    setText('#loginTitle', t.heading);
    setText('.login-modern-subtitle', t.subtitle);
    setText('label[for="email"]', t.email);
    setAttr('#email', 'placeholder', t.emailPlaceholder);
    setText('label[for="password"]', t.password);
    setAttr('#password', 'placeholder', t.passwordPlaceholder);
    setAttr('#togglePassword', 'aria-label', t.showPassword);
    setText('.login-forgot', t.forgot);
    setText('.login-submit', t.submit);
    const signup = document.querySelector('.login-signup');
    if (signup) {
      const a = signup.querySelector('a');
      signup.innerHTML = `${t.signupPrefix} `;
      if (a) {
        a.textContent = t.signupAction;
        signup.appendChild(a);
      }
    }
    setText('.login-terms', t.terms);
  }

  function applyTipo(lang) {
    const t = text[lang].tipo;
    document.title = t.title;
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    setIconText('.top-actions .back-link', '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H6m5-5-5 5 5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> ', t.back);
    setIconText('.top-actions .login-link', '', t.login + ' <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    setText('#page-title', t.heroTitle);
    setText('.hero p', t.heroText);
    setAttr('.cards', 'aria-label', t.groupLabel);
    const cards = document.querySelectorAll('.profile');
    if (cards[0]) {
      const card = cards[0];
      setText('.profile:nth-of-type(1) .role-tag', t.residentTag);
      setText('.profile:nth-of-type(1) h2', t.residentTitle);
      setText('.profile:nth-of-type(1) .description', t.residentDesc);
      const lis = card.querySelectorAll('.feature-list li');
      if (lis[0]) lis[0].childNodes[lis[0].childNodes.length-1].textContent = ' ' + t.residentF1;
      if (lis[1]) lis[1].childNodes[lis[1].childNodes.length-1].textContent = ' ' + t.residentF2;
      setText('.profile:nth-of-type(1) .choose span:first-child', t.residentChoose);
    }
    if (cards[1]) {
      const card = cards[1];
      setText('.profile:nth-of-type(2) .role-tag', t.managerTag);
      setText('.profile:nth-of-type(2) h2', t.managerTitle);
      setText('.profile:nth-of-type(2) .description', t.managerDesc);
      const lis = card.querySelectorAll('.feature-list li');
      if (lis[0]) lis[0].childNodes[lis[0].childNodes.length-1].textContent = ' ' + t.managerF1;
      if (lis[1]) lis[1].childNodes[lis[1].childNodes.length-1].textContent = ' ' + t.managerF2;
      setText('.profile:nth-of-type(2) .choose span:first-child', t.managerChoose);
    }
    if (cards[2]) {
      const card = cards[2];
      setText('.profile:nth-of-type(3) .role-tag', t.porterTag);
      setText('.profile:nth-of-type(3) h2', t.porterTitle);
      setText('.profile:nth-of-type(3) .description', t.porterDesc);
      const lis = card.querySelectorAll('.feature-list li');
      if (lis[0]) lis[0].childNodes[lis[0].childNodes.length-1].textContent = ' ' + t.porterF1;
      if (lis[1]) lis[1].childNodes[lis[1].childNodes.length-1].textContent = ' ' + t.porterF2;
      setText('.profile:nth-of-type(3) .choose span:first-child', t.porterChoose);
    }
    setText('.hint span:last-child', t.hint);
    setIconText('#continueButton', '', t.continue + ' <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  }

  function applyCadastro(lang, typeKey) {
    const c = text[lang].cadastroCommon;
    const t = text[lang][typeKey];
    document.title = t.title;
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    setIconText('.btn-back', '<i class="fas fa-arrow-left"></i> ', c.back);
    setText('.security-text h3', c.secureTitle);
    setText('.security-text p', c.secureText);
    setText('.security-footer span', c.secureFooter);
    const heading = document.querySelector('.signup-header h1');
    if (heading) {
      heading.innerHTML = `${t.heading}<span class="highlight-text">${t.role}</span>`;
    }
    setText('.signup-header p', t.subtitle);
    setText('label[for="name"]', c.name);
    setAttr('#name', 'placeholder', c.namePlaceholder);
    setText('label[for="email"]', c.email);
    setAttr('#email', 'placeholder', c.emailPlaceholder);
    setText('label[for="phone"]', c.phone);
    setText('label[for="cpf"]', c.cpf);
    setText('label[for="password"]', c.password);
    setAttr('#password', 'placeholder', c.passwordPlaceholder);
    const strengthText = document.getElementById('strengthText');
    if (strengthText) {
      strengthText.innerHTML = `${c.strengthPrefix} <span id="strengthLabel">${c.weak}</span>`;
    }
    setText('#req-length span', c.reqLength);
    setText('#req-uppercase span', c.reqUpper);
    setText('#req-number span', c.reqNumber);
    setText('#req-special span', c.reqSpecial);
    setText('label[for="confirmPassword"]', c.confirmPassword);
    setAttr('#confirmPassword', 'placeholder', c.confirmPasswordPlaceholder);
    setIconText('#submitBtn', '<i class="fas fa-arrow-right-from-bracket"></i> ', c.signupAction);
    const loginLink = document.querySelector('.login-link');
    if (loginLink) {
      const a = loginLink.querySelector('a');
      loginLink.innerHTML = `${c.loginPrefix} `;
      if (a) {
        a.textContent = c.loginAction;
        loginLink.appendChild(a);
      }
    }
    const footerSpan = document.querySelector('.footer-text');
    if (footerSpan) {
      footerSpan.innerHTML = '<i class="fas fa-lock"></i> ' + c.secureFooter;
    }
    setText('.copyright', c.copyright);
  }

  function applyTranslations() {
    const path = window.location.pathname;
    const lang = getLang();
    if (path.endsWith('/entrar.html') || path.endsWith('entrar.html')) return applyLogin(lang);
    if (path.endsWith('/tipo-usuario.html') || path.endsWith('tipo-usuario.html')) return applyTipo(lang);
    if (path.endsWith('/cadastro-morador.html') || path.endsWith('cadastro-morador.html')) return applyCadastro(lang, 'cadastroMorador');
    if (path.endsWith('/cadastro-sindico.html') || path.endsWith('cadastro-sindico.html')) return applyCadastro(lang, 'cadastroSindico');
    if (path.endsWith('/cadastro-porteiro.html') || path.endsWith('cadastro-porteiro.html')) return applyCadastro(lang, 'cadastroPorteiro');
  }

  window.getCondomitAuthLanguage = getLang;
  window.getCondomitAuthTerms = function () { return text[getLang()].cadastroCommon; };
  document.addEventListener('DOMContentLoaded', applyTranslations);
  window.addEventListener('storage', function (event) {
    if (event.key === 'app-language') applyTranslations();
  });
  window.addEventListener('condomit:language-changed', applyTranslations);
})();
