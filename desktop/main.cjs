'use strict';

const { app, BrowserWindow, shell, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const APP_URL = process.env.CONDOMIT_DESKTOP_URL || 'https://condomit.netlify.app/inicio.html';
const APP_ORIGIN = new URL(APP_URL).origin;
const GITHUB_REPOSITORY = 'GiancarloFecap/Condomit';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`;
let mainWindow = null;
let cachedUpdate = null;
let updateDownloadInProgress = false;

function isTrustedUrl(value) {
  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch (_) {
    return false;
  }
}

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').split('-')[0];
}

function versionParts(value) {
  return normalizeVersion(value).split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const length = Math.max(aa.length, bb.length, 3);
  for (let index = 0; index < length; index += 1) {
    const left = aa[index] || 0;
    const right = bb[index] || 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }
  return 0;
}

function updateAssetForPlatform(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const platform = process.platform;
  const find = (predicate) => assets.find((asset) => predicate(String(asset?.name || '').toLowerCase()));

  if (platform === 'win32') {
    return find((name) => name.endsWith('.exe') && name.includes('windows') && name.includes('setup'))
      || find((name) => name.endsWith('.exe') && name.includes('windows'));
  }
  if (platform === 'darwin') {
    return find((name) => name.endsWith('.dmg') && name.includes('macos'))
      || find((name) => name.endsWith('.dmg'));
  }
  if (platform === 'linux') {
    if (process.env.APPIMAGE) {
      return find((name) => name.endsWith('.appimage')) || find((name) => name.endsWith('.deb'));
    }
    return find((name) => name.endsWith('.deb')) || find((name) => name.endsWith('.appimage'));
  }
  return null;
}

async function githubLatestRelease() {
  const response = await fetch(`${GITHUB_API}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Condomit-Desktop/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub ${response.status}: ${detail.slice(0, 180) || 'não foi possível consultar a versão mais recente.'}`);
  }
  return await response.json();
}

async function checkDesktopUpdate() {
  const currentVersion = app.getVersion();
  const release = await githubLatestRelease();
  const latestVersion = normalizeVersion(release?.tag_name || release?.name || '');
  const asset = updateAssetForPlatform(release);
  const hasUpdate = Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0);

  cachedUpdate = { release, asset, currentVersion, latestVersion, hasUpdate };
  return {
    ok: true,
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    hasUpdate,
    canInstall: Boolean(hasUpdate && asset?.browser_download_url),
    releaseUrl: release?.html_url || `https://github.com/${GITHUB_REPOSITORY}/releases`,
    releaseName: release?.name || release?.tag_name || '',
    publishedAt: release?.published_at || null,
    assetName: asset?.name || null,
    platform: process.platform
  };
}

function safeUpdateFileName(assetName) {
  const source = String(assetName || 'Condomit-update').replace(/[\\/:*?"<>|]+/g, '-');
  return source || 'Condomit-update';
}

async function downloadUpdateAsset(webContents) {
  if (updateDownloadInProgress) throw new Error('Uma atualização já está sendo baixada.');
  let info = cachedUpdate;
  if (!info?.hasUpdate || !info?.asset?.browser_download_url) {
    await checkDesktopUpdate();
    info = cachedUpdate;
  }
  if (!info?.hasUpdate) return { ok: true, noUpdate: true, currentVersion: app.getVersion() };
  if (!info?.asset?.browser_download_url) throw new Error('A nova versão ainda não possui instalador compatível com este sistema.');

  updateDownloadInProgress = true;
  const target = path.join(app.getPath('temp'), safeUpdateFileName(info.asset.name));
  try {
    const response = await fetch(info.asset.browser_download_url, {
      headers: { 'User-Agent': `Condomit-Desktop/${app.getVersion()}` },
      redirect: 'follow'
    });
    if (!response.ok || !response.body) throw new Error(`Falha ao baixar atualização (${response.status}).`);

    const total = Number(response.headers.get('content-length') || info.asset.size || 0);
    let downloaded = 0;
    const source = Readable.fromWeb(response.body);
    source.on('data', (chunk) => {
      downloaded += chunk.length;
      const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
      if (!webContents?.isDestroyed?.()) {
        webContents.send('condomit:update-progress', { downloaded, total, percent });
      }
    });
    await pipeline(source, fs.createWriteStream(target));

    if (process.platform === 'linux' && target.toLowerCase().endsWith('.appimage')) {
      fs.chmodSync(target, 0o755);
    }

    return { ok: true, filePath: target, assetName: info.asset.name, latestVersion: info.latestVersion };
  } finally {
    updateDownloadInProgress = false;
  }
}

async function launchDownloadedUpdate(result) {
  if (!result?.filePath) throw new Error('Arquivo da atualização não encontrado.');
  const filePath = result.filePath;

  if (process.platform === 'win32') {
    const child = spawn(filePath, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    setTimeout(() => app.quit(), 900);
    return { ok: true, launched: true, willQuit: true };
  }

  if (process.platform === 'darwin') {
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
    return {
      ok: true,
      launched: true,
      willQuit: false,
      manualMessage: 'A nova versão foi aberta. Conclua a instalação pelo instalador do macOS.'
    };
  }

  if (process.platform === 'linux') {
    if (filePath.toLowerCase().endsWith('.appimage')) {
      const child = spawn(filePath, [], { detached: true, stdio: 'ignore' });
      child.unref();
      return {
        ok: true,
        launched: true,
        willQuit: false,
        manualMessage: 'A nova AppImage foi aberta. Depois de confirmar que ela iniciou corretamente, substitua a versão anterior.'
      };
    }
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
    return {
      ok: true,
      launched: true,
      willQuit: false,
      manualMessage: 'O pacote da nova versão foi aberto no instalador do sistema. Conclua a atualização por ele.'
    };
  }

  throw new Error('Atualização automática não disponível para esta plataforma.');
}

function registerDesktopIpc() {
  ipcMain.handle('condomit:desktop-info', () => ({
    isDesktop: true,
    platform: process.platform,
    version: app.getVersion(),
    repository: GITHUB_REPOSITORY
  }));

  ipcMain.handle('condomit:check-updates', async () => {
    try {
      return await checkDesktopUpdate();
    } catch (error) {
      console.error('[Condomit Desktop] Falha ao verificar atualizações:', error);
      return { ok: false, error: error?.message || 'Não foi possível verificar atualizações.', currentVersion: app.getVersion() };
    }
  });

  ipcMain.handle('condomit:install-update', async (event) => {
    try {
      const downloaded = await downloadUpdateAsset(event.sender);
      if (downloaded?.noUpdate) return downloaded;
      const launched = await launchDownloadedUpdate(downloaded);
      return { ...downloaded, ...launched };
    } catch (error) {
      console.error('[Condomit Desktop] Falha ao instalar atualização:', error);
      return { ok: false, error: error?.message || 'Não foi possível atualizar a Condomit.' };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Condomit',
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f3f4f6',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) {
      mainWindow?.loadURL(url);
    } else {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url).catch(() => {});
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Condomit Desktop] Renderer encerrado:', details?.reason || details);
  });

  mainWindow.loadURL(APP_URL).catch((error) => {
    console.error('[Condomit Desktop] Falha ao abrir o site:', error);
    mainWindow?.loadFile(path.join(__dirname, 'offline.html'));
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.setAppUserModelId('com.condomit.desktop');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
registerDesktopIpc();

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (requestingOrigin !== APP_ORIGIN) return false;
    return ['media', 'notifications', 'fullscreen', 'display-capture'].includes(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
    const source = details.requestingUrl || webContents?.getURL?.() || '';
    const trusted = isTrustedUrl(source);
    const allowed = trusted && ['media', 'notifications', 'fullscreen', 'display-capture'].includes(permission);
    callback(Boolean(allowed));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
