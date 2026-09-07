'use strict';

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': statusCode === 200 ? 'public, max-age=300, s-maxage=300' : 'no-store',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function resolveRepository() {
  const explicit = String(process.env.CONDOMIT_DESKTOP_GITHUB_REPO || process.env.GITHUB_REPOSITORY || '').trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(explicit)) return explicit;
  const repositoryUrl = String(process.env.REPOSITORY_URL || '').trim();
  const match = repositoryUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : '';
}

function classify(asset) {
  const name = String(asset?.name || '');
  if (/\.exe$/i.test(name)) return 'windows';
  if (/\.(dmg|pkg)$/i.test(name)) return 'macos';
  if (/\.(AppImage|deb|rpm)$/i.test(name)) return 'linux';
  return null;
}

function releaseDownloads(release) {
  const downloads = { windows: [], macos: [], linux: [] };
  for (const asset of Array.isArray(release?.assets) ? release.assets : []) {
    const platform = classify(asset);
    if (!platform) continue;
    downloads[platform].push({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      downloads: asset.download_count || 0
    });
  }
  return downloads;
}

function hasDesktopAssets(release) {
  return Object.values(releaseDownloads(release)).some(items => items.length > 0);
}

async function githubJson(url, headers) {
  const response = await fetch(url, { headers });
  if (response.status === 404) return { response, value: null };
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GitHub ${response.status}: ${text.slice(0, 180)}`);
  }
  return { response, value: await response.json() };
}

async function resolveRelease(repository, headers) {
  const base = `https://api.github.com/repos/${repository}`;

  // Primeiro tenta a release estável mais recente.
  const latest = await githubJson(`${base}/releases/latest`, headers);
  if (latest.value && hasDesktopAssets(latest.value)) return latest.value;

  // Se não houver "latest" (ou se ela ainda não tiver os binários), procura
  // releases recentes, inclusive prereleases. Isso evita falso erro 404.
  const list = await githubJson(`${base}/releases?per_page=20`, headers);
  const releases = Array.isArray(list.value) ? list.value : [];
  return releases.find(release => !release?.draft && hasDesktopAssets(release)) || null;
}

exports.handler = async () => {
  const repository = resolveRepository();
  if (!repository) {
    // Configuração ausente não é erro para o visitante: apenas não há build publicado.
    return json(200, {
      configured: false,
      published: false,
      downloads: { windows: [], macos: [], linux: [] }
    });
  }

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Condomit-Desktop-Downloads',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const token = String(process.env.CONDOMIT_DESKTOP_GITHUB_TOKEN || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const release = await resolveRelease(repository, headers);
    if (!release) {
      return json(200, {
        configured: true,
        published: false,
        releaseUrl: `https://github.com/${repository}/releases`,
        downloads: { windows: [], macos: [], linux: [] }
      });
    }

    const downloads = releaseDownloads(release);
    return json(200, {
      configured: true,
      published: true,
      version: release.tag_name || release.name || '',
      publishedAt: release.published_at || null,
      releaseUrl: release.html_url,
      downloads
    });
  } catch (error) {
    console.error('[desktop-downloads]', error);
    // Uma falha temporária de consulta não deve quebrar a página pública.
    return json(200, {
      configured: true,
      published: false,
      temporaryUnavailable: true,
      downloads: { windows: [], macos: [], linux: [] }
    });
  }
};
