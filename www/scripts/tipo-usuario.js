(() => {
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
