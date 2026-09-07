'use strict';

const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

const APP_URL = process.env.CONDOMIT_DESKTOP_URL || 'https://condomit.netlify.app/inicio.html';
const APP_ORIGIN = new URL(APP_URL).origin;
let mainWindow = null;

function isTrustedUrl(value) {
  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch (_) {
    return false;
  }
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
