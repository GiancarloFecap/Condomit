
(function () {
  function getLang() {
    try { return ((window.getCondomitResolvedLanguage?.() || ((localStorage.getItem('app-language') || 'auto') === 'auto' ? (/^pt(?:-|$)/i.test((navigator.languages || [navigator.language || 'pt'])[0]) ? 'pt' : 'en') : localStorage.getItem('app-language'))) === 'en' ? 'en' : 'pt'); } catch (_) { return /^pt/i.test(navigator.language || 'pt')?'pt':'en'; }
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
        eyebrow: 'Escolha o tipo de usuário',
        heroTitle: 'Quem vai acessar a Condomit?',
        heroText: 'Selecione o perfil que melhor representa você para continuarmos o cadastro.',
        groupLabel: 'Escolha o tipo de usuário',
        residentTitle: 'Morador',
        residentDesc: 'Acompanhar avisos, reservas e informações do condomínio.',
        managerTitle: 'Síndico',
        managerDesc: 'Administrar moradores, assembleias e a gestão do condomínio.',
        porterTitle: 'Porteiro',
        porterDesc: 'Controlar acessos, visitantes e a rotina da portaria.',
        continue: 'Continuar',
        hasAccount: 'Já tem uma conta?',
        loginAction: 'Entrar'
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
        eyebrow: 'Select user type',
        heroTitle: 'Who will access Condomit?',
        heroText: 'Select the profile that best represents you so we can continue the registration.',
        groupLabel: 'Choose user type',
        residentTitle: 'Resident',
        residentDesc: 'Follow notices, reservations and condominium information.',
        managerTitle: 'Property manager',
        managerDesc: 'Manage residents, assemblies and the condominium operations.',
        porterTitle: 'Doorman',
        porterDesc: 'Control access, visitors and the front desk routine.',
        continue: 'Continue',
        hasAccount: 'Already have an account?',
        loginAction: 'Sign in'
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
    setText('.tipo-back-label', t.back);
    setText('#tipoEyebrow', t.eyebrow);
    setText('#tipoTitle', t.heroTitle);
    setText('#tipoSubtitle', t.heroText);
    setAttr('.tipo-options', 'aria-label', t.groupLabel);
    setText('.profile:nth-of-type(1) .tipo-role-title', t.residentTitle);
    setText('.profile:nth-of-type(1) .tipo-role-subtitle', t.residentDesc);
    setText('.profile:nth-of-type(2) .tipo-role-title', t.managerTitle);
    setText('.profile:nth-of-type(2) .tipo-role-subtitle', t.managerDesc);
    setText('.profile:nth-of-type(3) .tipo-role-title', t.porterTitle);
    setText('.profile:nth-of-type(3) .tipo-role-subtitle', t.porterDesc);
    setText('#continueLabel', t.continue);
    setText('#hasAccountText', t.hasAccount);
    setText('#loginActionText', t.loginAction);
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
