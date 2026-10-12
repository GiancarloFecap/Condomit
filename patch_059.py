from pathlib import Path
root=Path('/mnt/data/condomit_tipo_059')

html = '''<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0A2A6B" />
  <title>Condomit • Escolha seu perfil</title>
  <link rel="icon" type="image/png" href="../assets/favicon.png" />
  <link rel="stylesheet" href="../styles/tipo-usuario.css?v=059" />
  <link rel="manifest" href="../manifest.webmanifest" />
  <meta name="robots" content="noindex, nofollow">
</head>
<body>
  <div class="tipo-page-shell">
    <div class="tipo-floating-control tipo-language-control" title="Idioma">
      <i class="fas fa-globe" aria-hidden="true"></i>
      <select id="landing-language-select" aria-label="Idioma">
        <option value="auto">Padrão</option>
        <option value="pt">Português</option>
        <option value="en">English</option>
      </select>
      <i class="fas fa-chevron-down tipo-language-arrow" aria-hidden="true"></i>
    </div>

    <a href="../inicio.html" class="tipo-floating-logo" aria-label="Condomit - Página inicial">
      <img src="../assets/logo-condomit-auth-hq.png" alt="Condomit - O app do seu condomínio" />
    </a>

    <main class="tipo-card" aria-labelledby="tipoTitle">
      <a class="tipo-back-button" href="../inicio.html" aria-label="Voltar">
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span class="tipo-back-label">Voltar</span>
      </a>

      <div class="tipo-card-content">
        <div class="tipo-heading">
          <p class="tipo-eyebrow" id="tipoEyebrow">Escolha o tipo de usuário</p>
          <h1 id="tipoTitle">Quem vai acessar a Condomit?</h1>
          <p id="tipoSubtitle">Selecione o perfil que melhor representa você para continuarmos o cadastro.</p>
        </div>

        <section class="tipo-options" role="radiogroup" aria-label="Escolha o tipo de usuário">
          <article class="tipo-option profile" data-profile="morador" role="radio" aria-checked="false" tabindex="0">
            <span class="tipo-option-check" aria-hidden="true"><i class="fas fa-check"></i></span>
            <div class="tipo-avatar" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none">
                <path d="M14 30.5 32 16l18 14.5" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 28v20h26V28" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
                <circle cx="32" cy="35" r="5" fill="currentColor"/>
                <path d="M24.5 48c1.3-5.4 4.4-8.4 7.5-8.4s6.2 3 7.5 8.4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </div>
            <h2 class="tipo-role-title">Morador</h2>
            <p class="tipo-role-subtitle">Acompanhar avisos, reservas e informações do condomínio.</p>
          </article>

          <article class="tipo-option profile" data-profile="sindico" role="radio" aria-checked="false" tabindex="0">
            <span class="tipo-option-check" aria-hidden="true"><i class="fas fa-check"></i></span>
            <div class="tipo-avatar" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="20" r="9" stroke="currentColor" stroke-width="3.5"/>
                <path d="M17 49c1.2-10.2 7-16 15-16s13.8 5.8 15 16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
                <path d="m28.5 34 3.5 6 3.5-6M32 40v8" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/>
              </svg>
            </div>
            <h2 class="tipo-role-title">Síndico</h2>
            <p class="tipo-role-subtitle">Administrar moradores, assembleias e a gestão do condomínio.</p>
          </article>

          <article class="tipo-option profile" data-profile="porteiro" role="radio" aria-checked="false" tabindex="0">
            <span class="tipo-option-check" aria-hidden="true"><i class="fas fa-check"></i></span>
            <div class="tipo-avatar" aria-hidden="true">
              <svg viewBox="0 0 64 64" fill="none">
                <path d="M32 12 50 18v15c0 12-6.4 20.3-18 25-11.6-4.7-18-13-18-25V18l18-6Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
                <path d="m25.5 34 4.5 4.5 8.5-9.5" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h2 class="tipo-role-title">Porteiro</h2>
            <p class="tipo-role-subtitle">Controlar acessos, visitantes e a rotina da portaria.</p>
          </article>
        </section>

        <div class="tipo-actions">
          <button id="continueButton" class="continue" type="button" disabled>
            <span id="continueLabel">Continuar</span>
          </button>
          <p class="tipo-login-text"><span id="hasAccountText">Já tem uma conta?</span> <a href="entrar.html" id="loginActionText">Entrar</a></p>
        </div>
      </div>
    </main>
  </div>

  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="../scripts/auth-pages-i18n.js?v=059"></script>
  <script src="../scripts/tipo-usuario.js?v=059"></script>
</body>
</html>
'''

css = '''
:root {
  --condomit-navy:#0a2a6b;
  --condomit-blue:#1d4fd8;
  --condomit-cyan:#19cfd0;
  --condomit-blue-soft:#edf4ff;
  --condomit-text:#22304d;
  --condomit-muted:#71809c;
  --condomit-line:#d7e1ef;
  --condomit-shadow:0 18px 40px rgba(16,35,74,.14);
}
*{box-sizing:border-box}
html{color-scheme:light}
body{
  margin:0;
  min-height:100vh;
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:var(--condomit-text);
  background:linear-gradient(180deg,#d8f5ff 0%, #bfeefe 100%);
  overflow-x:hidden;
}
.tipo-page-shell{
  position:relative;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:112px 24px 48px;
}
.tipo-floating-control,
.tipo-floating-logo{
  position:fixed;
  z-index:5;
}
.tipo-language-control{
  top:22px;
  left:22px;
  display:inline-flex;
  align-items:center;
  gap:10px;
  min-height:48px;
  padding:0 14px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.48);
  background:rgba(10,42,107,.74);
  color:#fff;
  box-shadow:0 10px 28px rgba(10,42,107,.18);
  backdrop-filter:blur(10px);
}
.tipo-language-control select{
  appearance:none;
  border:0;
  background:transparent;
  color:inherit;
  font:inherit;
  font-weight:700;
  outline:none;
  padding-right:18px;
  cursor:pointer;
}
.tipo-language-control select option{color:#0f172a}
.tipo-language-arrow{pointer-events:none;font-size:.84rem}
.tipo-floating-logo{
  top:22px;
  right:22px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
}
.tipo-floating-logo img{
  width:156px;
  height:auto;
  display:block;
  filter:drop-shadow(0 12px 22px rgba(9,36,92,.15));
}
.tipo-card{
  width:min(860px,100%);
  background:rgba(255,255,255,.96);
  border:1px solid rgba(130,153,191,.28);
  border-radius:24px;
  box-shadow:var(--condomit-shadow);
  padding:26px 34px 30px;
  position:relative;
}
.tipo-back-button{
  position:absolute;
  top:20px;
  right:22px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  text-decoration:none;
  color:var(--condomit-navy);
  font-weight:700;
  font-size:.96rem;
  padding:10px 12px;
  border-radius:12px;
  background:#f5f8fe;
  border:1px solid #e0e7f2;
}
.tipo-back-button:hover{background:#eef4ff}
.tipo-card-content{
  display:flex;
  flex-direction:column;
  align-items:center;
}
.tipo-heading{
  text-align:center;
  max-width:560px;
  margin:10px auto 18px;
}
.tipo-eyebrow{
  margin:0 0 10px;
  color:var(--condomit-muted);
  font-size:1rem;
  font-weight:600;
}
.tipo-heading h1{
  margin:0 0 10px;
  font-size:clamp(2rem,4vw,2.6rem);
  line-height:1.06;
  color:var(--condomit-navy);
}
.tipo-heading > p{
  margin:0;
  color:var(--condomit-muted);
  font-size:1rem;
  line-height:1.6;
}
.tipo-options{
  width:100%;
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:20px;
  margin:24px 0 28px;
}
.tipo-option{
  position:relative;
  border:1.5px solid var(--condomit-line);
  border-radius:22px;
  background:#fff;
  min-height:246px;
  padding:24px 18px 20px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  text-align:center;
  cursor:pointer;
  transition:transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease;
  outline:none;
}
.tipo-option:hover{
  transform:translateY(-4px);
  box-shadow:0 16px 26px rgba(29,79,216,.08);
  border-color:#b9cae7;
}
.tipo-option:focus-visible{box-shadow:0 0 0 4px rgba(29,79,216,.12)}
.tipo-option-check{
  position:absolute;
  top:14px;
  right:14px;
  width:28px;
  height:28px;
  border-radius:50%;
  background:#fff;
  border:1.5px solid #d9e2ef;
  color:transparent;
  display:grid;
  place-items:center;
  box-shadow:0 8px 18px rgba(15,23,42,.06);
}
.tipo-avatar{
  width:94px;
  height:94px;
  border-radius:50%;
  border:1.5px solid #dfe7f2;
  background:linear-gradient(180deg,#fff,#f6f9ff);
  display:grid;
  place-items:center;
  color:#9ca9bf;
  margin-bottom:18px;
}
.tipo-avatar svg{width:54px;height:54px}
.tipo-role-title{
  margin:0 0 8px;
  font-size:1.28rem;
  color:#24314b;
}
.tipo-role-subtitle{
  margin:0;
  color:var(--condomit-muted);
  line-height:1.55;
  font-size:.95rem;
}
.tipo-option.is-selected{
  border-color:var(--condomit-cyan);
  box-shadow:0 18px 30px rgba(25,207,208,.13);
  background:linear-gradient(180deg,#fff,#f6ffff);
}
.tipo-option.is-selected .tipo-option-check{
  background:linear-gradient(135deg,var(--condomit-cyan),var(--condomit-blue));
  border-color:transparent;
  color:#fff;
}
.tipo-option.is-selected .tipo-avatar{
  border-color:rgba(25,207,208,.42);
  color:var(--condomit-blue);
  box-shadow:0 0 0 8px rgba(25,207,208,.08);
}
.tipo-option.is-selected .tipo-role-title{color:var(--condomit-blue)}
.tipo-actions{
  width:100%;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:12px;
}
.continue{
  min-width:216px;
  min-height:54px;
  border:0;
  border-radius:12px;
  background:linear-gradient(135deg,var(--condomit-blue),var(--condomit-cyan));
  color:#fff;
  font-weight:800;
  font-size:1rem;
  cursor:pointer;
  box-shadow:0 14px 28px rgba(29,79,216,.22);
  transition:transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.continue:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 18px 34px rgba(29,79,216,.24)}
.continue:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
.tipo-login-text{
  margin:0;
  color:var(--condomit-muted);
  font-size:.97rem;
}
.tipo-login-text a{
  color:var(--condomit-blue);
  font-weight:800;
  text-decoration:none;
}
.tipo-login-text a:hover{text-decoration:underline}
@media (max-width:900px){
  .tipo-card{padding:22px 22px 26px}
  .tipo-options{gap:14px}
  .tipo-option{min-height:232px;padding:22px 14px 18px}
}
@media (max-width:760px){
  .tipo-page-shell{padding:104px 16px 32px;align-items:flex-start}
  .tipo-floating-logo img{width:124px}
  .tipo-language-control{top:14px;left:14px;min-height:44px}
  .tipo-floating-logo{top:16px;right:14px}
  .tipo-card{margin-top:72px;padding:54px 16px 22px}
  .tipo-back-button{top:14px;right:14px;padding:9px 10px}
  .tipo-back-label{display:none}
  .tipo-options{grid-template-columns:1fr;gap:14px;margin:20px 0 24px}
  .tipo-option{min-height:auto}
  .continue{width:100%;max-width:320px}
}
'''

js = '''(() => {
  'use strict';

  const routes = {
    morador: 'cadastro-morador.html',
    sindico: 'cadastro-sindico.html',
    porteiro: 'cadastro-porteiro.html'
  };

  const profiles = [...document.querySelectorAll('.profile')];
  const continueButton = document.getElementById('continueButton');
  const languageSelect = document.getElementById('landing-language-select');
  let selectedProfile = null;

  function resolveLanguage(choice) {
    if (choice === 'auto') {
      const nav = (navigator.languages || [navigator.language || 'pt-BR'])[0] || 'pt-BR';
      return /^en/i.test(nav) ? 'en' : 'pt';
    }
    return choice === 'en' ? 'en' : 'pt';
  }

  function syncLanguageSelect() {
    if (!languageSelect) return;
    let choice = 'auto';
    try { choice = localStorage.getItem('app-language') || 'auto'; } catch (_) {}
    languageSelect.value = choice;
  }

  function applyLanguageChoice(choice, persist = true) {
    try {
      if (persist) localStorage.setItem('app-language', choice);
    } catch (_) {}
    syncLanguageSelect();
    window.dispatchEvent(new CustomEvent('condomit:language-changed', {
      detail: { language: resolveLanguage(choice), selection: choice }
    }));
  }

  function selectProfile(profileCard, options = {}) {
    if (!profileCard) return;

    profiles.forEach((card) => {
      const active = card === profileCard;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    selectedProfile = profileCard.dataset.profile || null;
    if (continueButton) continueButton.disabled = !selectedProfile;

    if (selectedProfile) {
      try { sessionStorage.setItem('condomit_user_type', selectedProfile); } catch (_) {}
    }

    if (options.focus) profileCard.focus({ preventScroll: true });
  }

  function continueRegistration() {
    if (!selectedProfile) return;
    const target = routes[selectedProfile];
    if (target) window.location.href = target;
  }

  profiles.forEach((card) => {
    card.addEventListener('click', () => selectProfile(card));
    card.addEventListener('keydown', (event) => {
      const currentIndex = profiles.indexOf(card);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectProfile(card);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        selectProfile(profiles[(currentIndex + 1) % profiles.length], { focus: true });
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        selectProfile(profiles[(currentIndex - 1 + profiles.length) % profiles.length], { focus: true });
      }
    });
  });

  continueButton?.addEventListener('click', continueRegistration);

  try {
    const stored = sessionStorage.getItem('condomit_user_type');
    const storedCard = profiles.find((card) => card.dataset.profile === stored);
    if (storedCard) selectProfile(storedCard);
  } catch (_) {}

  syncLanguageSelect();
  languageSelect?.addEventListener('change', (event) => applyLanguageChoice(event.target.value, true));
  window.addEventListener('storage', (event) => {
    if (event.key === 'app-language') syncLanguageSelect();
  });
})();
'''

# patch auth i18n applyTipo section by replacing function body/content roughly
for rel in ['pages/tipo-usuario.html','www/pages/tipo-usuario.html']:
    (root/rel).write_text(html, encoding='utf-8')
for rel in ['styles/tipo-usuario.css','www/styles/tipo-usuario.css']:
    (root/rel).write_text(css, encoding='utf-8')
for rel in ['scripts/tipo-usuario.js','www/scripts/tipo-usuario.js']:
    (root/rel).write_text(js, encoding='utf-8')

for rel in ['scripts/auth-pages-i18n.js','www/scripts/auth-pages-i18n.js']:
    p=root/rel
    txt=p.read_text(encoding='utf-8')
    # update text dictionary specific entries
    txt = txt.replace("title: 'Condomit • Escolha seu perfil',\n        back: 'Voltar',\n        login: 'Já tenho conta',\n        heroTitle: 'Qual é o seu perfil no condomínio?',\n        heroText: 'Escolha a opção que melhor representa você. A Condomit personaliza o cadastro e as funcionalidades disponíveis de acordo com o seu perfil.',\n        groupLabel: 'Escolha o tipo de usuário',\n        residentTag: 'Uso cotidiano',\n        residentTitle: 'Morador',\n        residentDesc: 'Para quem deseja acompanhar o condomínio, receber informações e resolver tarefas do dia a dia.',\n        residentF1: 'Avisos, notificações e comunicados',\n        residentF2: 'Reservas e serviços do condomínio',\n        residentChoose: 'Selecionar Morador',\n        managerTag: 'Administração',\n        managerTitle: 'Síndico',\n        managerDesc: 'Para quem administra o condomínio e precisa centralizar gestão, moradores e processos.',\n        managerF1: 'Gestão de moradores e unidades',\n        managerF2: 'Assembleias e ferramentas administrativas',\n        managerChoose: 'Selecionar Síndico',\n        porterTag: 'Operação e segurança',\n        porterTitle: 'Porteiro',\n        porterDesc: 'Para a equipe responsável pela portaria, controle de acessos e rotina operacional do condomínio.',\n        porterF1: 'Visitantes e controle de acesso',\n        porterF2: 'Encomendas e rotinas da portaria',\n        porterChoose: 'Selecionar Porteiro',\n        hint: 'Você poderá revisar seus dados antes de concluir o cadastro.',\n        continue: 'Continuar'", "title: 'Condomit • Escolha seu perfil',\n        back: 'Voltar',\n        eyebrow: 'Escolha o tipo de usuário',\n        heroTitle: 'Quem vai acessar a Condomit?',\n        heroText: 'Selecione o perfil que melhor representa você para continuarmos o cadastro.',\n        groupLabel: 'Escolha o tipo de usuário',\n        residentTitle: 'Morador',\n        residentDesc: 'Acompanhar avisos, reservas e informações do condomínio.',\n        managerTitle: 'Síndico',\n        managerDesc: 'Administrar moradores, assembleias e a gestão do condomínio.',\n        porterTitle: 'Porteiro',\n        porterDesc: 'Controlar acessos, visitantes e a rotina da portaria.',\n        continue: 'Continuar',\n        hasAccount: 'Já tem uma conta?',\n        loginAction: 'Entrar'")
    txt = txt.replace("title: 'Condomit • Choose your profile',\n        back: 'Back',\n        login: 'I already have an account',\n        heroTitle: 'What is your role in the condominium?',\n        heroText: 'Choose the option that best represents you. Condomit customizes the registration flow and the available features according to your profile.',\n        groupLabel: 'Choose user type',\n        residentTag: 'Daily use',\n        residentTitle: 'Resident',\n        residentDesc: 'For those who want to follow condominium updates, receive information and handle everyday tasks.',\n        residentF1: 'Notices, notifications and announcements',\n        residentF2: 'Reservations and condominium services',\n        residentChoose: 'Select Resident',\n        managerTag: 'Management',\n        managerTitle: 'Property manager',\n        managerDesc: 'For those who manage the condominium and need to centralize operations, residents and processes.',\n        managerF1: 'Resident and unit management',\n        managerF2: 'Assemblies and management tools',\n        managerChoose: 'Select Property manager',\n        porterTag: 'Operations and security',\n        porterTitle: 'Doorman',\n        porterDesc: 'For the staff responsible for reception, access control and the operational routine of the condominium.',\n        porterF1: 'Visitors and access control',\n        porterF2: 'Packages and front desk routines',\n        porterChoose: 'Select Doorman',\n        hint: 'You will be able to review your information before finishing the registration.',\n        continue: 'Continue'", "title: 'Condomit • Choose your profile',\n        back: 'Back',\n        eyebrow: 'Select user type',\n        heroTitle: 'Who will access Condomit?',\n        heroText: 'Select the profile that best represents you so we can continue the registration.',\n        groupLabel: 'Choose user type',\n        residentTitle: 'Resident',\n        residentDesc: 'Follow notices, reservations and condominium information.',\n        managerTitle: 'Property manager',\n        managerDesc: 'Manage residents, assemblies and the condominium operations.',\n        porterTitle: 'Doorman',\n        porterDesc: 'Control access, visitors and the front desk routine.',\n        continue: 'Continue',\n        hasAccount: 'Already have an account?',\n        loginAction: 'Sign in'")
    start = txt.find('  function applyTipo(lang) {')
    end = txt.find('  function applyCadastro', start)
    new_func = '''  function applyTipo(lang) {\n    const t = text[lang].tipo;\n    document.title = t.title;\n    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';\n    setText('.tipo-back-label', t.back);\n    setText('#tipoEyebrow', t.eyebrow);\n    setText('#tipoTitle', t.heroTitle);\n    setText('#tipoSubtitle', t.heroText);\n    setAttr('.tipo-options', 'aria-label', t.groupLabel);\n    setText('.profile:nth-of-type(1) .tipo-role-title', t.residentTitle);\n    setText('.profile:nth-of-type(1) .tipo-role-subtitle', t.residentDesc);\n    setText('.profile:nth-of-type(2) .tipo-role-title', t.managerTitle);\n    setText('.profile:nth-of-type(2) .tipo-role-subtitle', t.managerDesc);\n    setText('.profile:nth-of-type(3) .tipo-role-title', t.porterTitle);\n    setText('.profile:nth-of-type(3) .tipo-role-subtitle', t.porterDesc);\n    setText('#continueLabel', t.continue);\n    setText('#hasAccountText', t.hasAccount);\n    setText('#loginActionText', t.loginAction);\n  }\n\n'''
    if start != -1 and end != -1:
        txt = txt[:start] + new_func + txt[end:]
    p.write_text(txt, encoding='utf-8')
print('patched')
