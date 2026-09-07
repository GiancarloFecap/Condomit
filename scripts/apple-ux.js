/* Condomit 072 — Apple-inspired interaction/accessibility polish. */
(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 900px)';
  const ICON_LABELS = [
    ['fa-comments', 'Conversas'],
    ['fa-comment', 'Conversas'],
    ['fa-video', 'Chamadas'],
    ['fa-bell', 'Notificações'],
    ['fa-user-circle', 'Perfil'],
    ['fa-user', 'Perfil'],
    ['fa-search', 'Buscar'],
    ['fa-magnifying-glass', 'Buscar'],
    ['fa-gear', 'Configurações'],
    ['fa-cog', 'Configurações'],
    ['fa-xmark', 'Fechar'],
    ['fa-times', 'Fechar'],
    ['fa-chevron-left', 'Voltar'],
    ['fa-arrow-left', 'Voltar'],
    ['fa-ellipsis', 'Mais opções']
  ];

  function iconLabel(button) {
    if (!button || button.getAttribute('aria-label') || button.textContent.trim()) return;
    const icon = button.querySelector('i');
    if (!icon) return;
    for (const [className, label] of ICON_LABELS) {
      if (icon.classList.contains(className)) {
        button.setAttribute('aria-label', label);
        if (!button.getAttribute('title')) button.setAttribute('title', label);
        return;
      }
    }
  }

  function improveAccessibility(root = document) {
    root.querySelectorAll('button').forEach(iconLabel);

    root.querySelectorAll('img:not([alt])').forEach(img => {
      img.alt = '';
    });

    root.querySelectorAll('a[target="_blank"]').forEach(link => {
      const rel = new Set(String(link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      link.setAttribute('rel', [...rel].join(' '));
    });
  }

  function currentHref(link) {
    try {
      const url = new URL(link.href, location.href);
      return url.pathname.split('/').pop() || '';
    } catch (_) {
      return '';
    }
  }

  function readableTabLabel(text) {
    const value = String(text || '').trim();
    const replacements = [
      [/^mural de avisos$/i, 'Mural'],
      [/^canal de sugestões$/i, 'Sugestões'],
      [/^gestão de moradores$/i, 'Moradores'],
      [/^reserva de locais$/i, 'Reservas'],
      [/^manutenção preventiva$/i, 'Manutenção'],
      [/^achados e perdidos$/i, 'Achados'],
      [/^registrar visitantes?$/i, 'Visitantes'],
      [/^registro de entrada.*$/i, 'Acessos'],
      [/^autorização de entregas$/i, 'Entregas'],
      [/^notificações$/i, 'Alertas']
    ];
    for (const [pattern, label] of replacements) if (pattern.test(value)) return label;
    return value.split(/\s+/).slice(0, 2).join(' ');
  }

  function pickTabItems(sidebar) {
    const links = [...sidebar.querySelectorAll('a.nav-item')].filter(link => {
      const raw = String(link.getAttribute('href') || '').trim();
      const text = String(link.textContent || '').trim();
      const style = getComputedStyle(link);
      return raw && raw !== '#' && !/^javascript:/i.test(raw) && text && style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (!links.length) return [];

    const desired = [
      /in[ií]cio|home/i,
      /mural de avisos|comunicados/i,
      /assembleia/i,
      /reserva|visitante|acesso|entrada|encomenda/i,
      /gest[aã]o de moradores|achados|chat/i
    ];

    const picked = [];
    for (const pattern of desired) {
      const match = links.find(link => pattern.test(link.textContent || '') && !picked.includes(link));
      if (match) picked.push(match);
      if (picked.length >= 4) break;
    }

    for (const link of links) {
      if (picked.length >= 4) break;
      if (!picked.includes(link)) picked.push(link);
    }

    return picked.slice(0, 4);
  }

  function buildMobileTabbar() {
    if (!document.body.classList.contains('condomit-app-page')) return;
    if (document.querySelector('.condomit-mobile-tabbar')) return;

    const sidebar = document.querySelector('.dashboard-sindico > .sidebar, .sidebar');
    if (!sidebar) return;

    const items = pickTabItems(sidebar);
    if (!items.length) return;

    const bar = document.createElement('nav');
    bar.className = 'condomit-mobile-tabbar';
    bar.setAttribute('aria-label', 'Navegação principal');

    const current = location.pathname.split('/').pop() || '';

    for (const source of items) {
      const link = document.createElement('a');
      link.href = source.href;
      link.dataset.sourceHref = source.getAttribute('href') || '';
      link.setAttribute('aria-label', String(source.textContent || '').trim());

      const sourceIcon = source.querySelector('i');
      if (sourceIcon) {
        const icon = document.createElement('i');
        icon.className = sourceIcon.className;
        icon.setAttribute('aria-hidden', 'true');
        link.appendChild(icon);
      }

      const label = document.createElement('span');
      label.textContent = readableTabLabel(source.textContent);
      link.appendChild(label);

      const file = currentHref(source);
      if (source.classList.contains('active') || (file && file === current)) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
      bar.appendChild(link);
    }

    const more = document.createElement('button');
    more.type = 'button';
    more.setAttribute('aria-label', 'Abrir mais opções');
    more.innerHTML = '<i class="fas fa-ellipsis" aria-hidden="true"></i><span>Mais</span>';
    more.addEventListener('click', () => {
      const menuButton = document.querySelector('.mobile-menu-btn');
      if (menuButton) {
        menuButton.click();
        return;
      }
      sidebar.classList.add('open');
      document.body.classList.add('mobile-sidebar-open');
    });
    bar.appendChild(more);

    document.body.appendChild(bar);
  }

  function watchTopbarShadow() {
    const topbar = document.querySelector('.top-bar');
    if (!topbar) return;
    const update = () => topbar.classList.toggle('is-scrolled', window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function syncThemeColor() {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const dark = document.documentElement.dataset.theme === 'dark';
    meta.content = dark ? '#101827' : '#183B86';
  }

  function boot() {
    document.documentElement.classList.add('condomit-apple-ui');
    improveAccessibility();
    watchTopbarShadow();
    buildMobileTabbar();
    syncThemeColor();

    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) improveAccessibility(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const themeObserver = new MutationObserver(syncThemeColor);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const media = window.matchMedia(MOBILE_QUERY);
    const ensureBar = () => {
      if (media.matches) buildMobileTabbar();
    };
    if (media.addEventListener) media.addEventListener('change', ensureBar);
    else if (media.addListener) media.addListener(ensureBar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
