(() => {
  'use strict';

  const labels = {
    windows: { name: 'Windows', preferred: [/Windows-x64\.exe$/i, /\.exe$/i] },
    macos: { name: 'macOS', preferred: [/macOS-universal\.dmg$/i, /\.dmg$/i, /\.zip$/i] },
    linux: { name: 'Linux', preferred: [/Linux-x64\.AppImage$/i, /\.AppImage$/i, /\.deb$/i] }
  };

  function detectPlatform() {
    const platform = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
    if (platform.includes('win')) return 'windows';
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('linux') || platform.includes('x11')) return 'linux';
    return '';
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / (1024 ** index)).toFixed(index >= 2 ? 1 : 0)} ${units[index]}`;
  }

  function rankAssets(platform, assets) {
    const preferred = labels[platform]?.preferred || [];
    return [...assets].sort((a, b) => {
      const score = item => {
        const idx = preferred.findIndex(re => re.test(item.name || ''));
        return idx < 0 ? 999 : idx;
      };
      return score(a) - score(b);
    });
  }

  function buttonLabel(platform, asset, index) {
    const name = String(asset?.name || '');
    if (platform === 'windows' && /portable/i.test(name)) return 'Baixar versão portátil';
    if (platform === 'windows') return index === 0 ? 'Baixar para Windows' : 'Outro instalador Windows';
    if (platform === 'macos' && /\.dmg$/i.test(name)) return 'Baixar para macOS';
    if (platform === 'linux' && /AppImage$/i.test(name)) return 'Baixar AppImage';
    if (platform === 'linux' && /\.deb$/i.test(name)) return 'Baixar pacote .deb';
    return `Baixar ${labels[platform]?.name || 'instalador'}`;
  }

  function renderDownloads(platform, assets) {
    const host = document.querySelector(`[data-download-list="${platform}"]`);
    if (!host) return;
    host.replaceChildren();
    const ranked = rankAssets(platform, Array.isArray(assets) ? assets : []);
    if (!ranked.length) {
      const unavailable = document.createElement('button');
      unavailable.type = 'button';
      unavailable.disabled = true;
      unavailable.className = 'download-button loading';
      unavailable.textContent = 'Ainda não publicado';
      host.appendChild(unavailable);
      return;
    }

    ranked.slice(0, 2).forEach((asset, index) => {
      const link = document.createElement('a');
      link.className = `download-button${index ? ' secondary' : ''}`;
      link.href = asset.url;
      link.rel = 'noopener';
      link.innerHTML = `<i class="fa-solid fa-download"></i> ${buttonLabel(platform, asset, index)}`;
      host.appendChild(link);
      const meta = document.createElement('div');
      meta.className = 'asset-meta';
      meta.textContent = [asset.name, formatBytes(asset.size)].filter(Boolean).join(' · ');
      host.appendChild(meta);
    });
  }

  async function load() {
    const detected = detectPlatform();
    if (detected) {
      const card = document.querySelector(`[data-platform-card="${detected}"]`);
      card?.classList.add('recommended');
      const pill = card?.querySelector('.recommended-pill');
      if (pill) pill.hidden = false;
      const notice = document.getElementById('detectedPlatform');
      if (notice) {
        notice.hidden = false;
        notice.textContent = `Detectamos ${labels[detected].name} neste computador.`;
      }
    }

    const status = document.getElementById('downloadStatus');
    try {
      const response = await fetch('/.netlify/functions/desktop-downloads', { headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Downloads indisponíveis.');
      renderDownloads('windows', payload.downloads?.windows);
      renderDownloads('macos', payload.downloads?.macos);
      renderDownloads('linux', payload.downloads?.linux);

      const hasDownloads = ['windows', 'macos', 'linux'].some(platform =>
        Array.isArray(payload.downloads?.[platform]) && payload.downloads[platform].length > 0
      );

      if (status) {
        status.hidden = true;
        status.removeAttribute('style');
        status.textContent = '';
      }

      if (payload.version && hasDownloads && status) {
        status.hidden = false;
        status.classList.add('available');
        status.textContent = `Versão desktop disponível: ${payload.version}`;
      }
    } catch (error) {
      console.warn('[desktop-downloads]', error);
      ['windows', 'macos', 'linux'].forEach(platform => renderDownloads(platform, []));
      // Uma indisponibilidade temporária do GitHub não deve aparecer ao usuário
      // como um erro da Condomit. Os cards já deixam claro quando não há build publicado.
      if (status) {
        status.hidden = true;
        status.removeAttribute('style');
        status.textContent = '';
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
