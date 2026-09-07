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

exports.handler = async () => {
  const repository = resolveRepository();
  if (!repository) {
    return json(503, {
      configured: false,
      message: 'Os instaladores desktop ainda não foram vinculados ao site.'
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

    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`GitHub ${response.status}: ${text.slice(0, 180)}`);
    }

    const release = await response.json();
    const downloads = { windows: [], macos: [], linux: [] };
    for (const asset of Array.isArray(release.assets) ? release.assets : []) {
      const platform = classify(asset);
      if (!platform) continue;
      downloads[platform].push({
        name: asset.name,
        url: asset.browser_download_url,
        size: asset.size,
        downloads: asset.download_count || 0
      });
    }

    return json(200, {
      configured: true,
      version: release.tag_name || release.name || '',
      publishedAt: release.published_at || null,
      releaseUrl: release.html_url,
      downloads
    });
  } catch (error) {
    console.error('[desktop-downloads]', error);
    return json(502, {
      configured: true,
      message: 'Não foi possível consultar os instaladores desktop agora.'
    });
  }
};
