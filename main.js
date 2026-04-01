const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const fileManager = require('./src/backend/file-manager');
const stateManager = require('./src/backend/state-manager');
const promptCache = require('./src/backend/prompt-cache');
const imageDecoder = require('./src/backend/image-decoder');
const settingsManager = require('./src/backend/settings-manager');

// ── Auto-updater configuration ──────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function isPortableWindows() {
  return process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_DIR != null;
}

function checkGitHubRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/Gene-Weaver/VoucherVisionGO-Editor/releases/latest',
      headers: { 'User-Agent': 'VoucherVisionGO-Editor' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          resolve({
            version: release.tag_name ? release.tag_name.replace(/^v/, '') : null,
            releaseUrl: release.html_url,
            publishedAt: release.published_at,
            body: release.body
          });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'VoucherVisionGO Editor',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  // Open dev tools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Remove menu bar for cleaner look (keep dev tools accessible via shortcut)
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  // Set install date on first launch
  const globalSettings = settingsManager.loadGlobalSettings();
  if (!globalSettings.installDate) {
    globalSettings.installDate = new Date().toISOString();
    settingsManager.saveGlobalSettings(globalSettings);
  }

  // Forward autoUpdater events to renderer
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', { status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-status', {
      status: 'up-to-date',
      version: info.version
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-status', {
      status: 'downloading',
      percent: progress.percent
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', {
      status: 'downloaded',
      version: info.version
    });
  });
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-status', {
      status: 'error',
      message: err?.message || 'Unknown error'
    });
  });

  // Auto-check on launch (delayed 5s to not block startup)
  if (app.isPackaged) {
    setTimeout(async () => {
      const gs = settingsManager.loadGlobalSettings();
      gs.lastUpdateCheck = new Date().toISOString();
      settingsManager.saveGlobalSettings(gs);

      if (isPortableWindows()) {
        try {
          const release = await checkGitHubRelease();
          const current = app.getVersion();
          if (release.version && release.version !== current) {
            mainWindow?.webContents.send('update-status', {
              status: 'available-manual',
              version: release.version,
              releaseUrl: release.releaseUrl
            });
          }
        } catch {} // Silent fail on launch
      } else {
        try { autoUpdater.checkForUpdates(); } catch {}
      }
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select folder containing VoucherVisionGO JSON files'
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('scan-folder', async (_, folderPath) => {
  return fileManager.scanFolder(folderPath);
});

ipcMain.handle('read-specimen', async (_, folderPath, filename) => {
  return fileManager.readSpecimen(folderPath, filename);
});

ipcMain.handle('get-image', async (_, folderPath, filename, imageType) => {
  return imageDecoder.getImage(folderPath, filename, imageType);
});

ipcMain.handle('write-reviewed', async (_, folderPath, filename, reviewedData) => {
  return fileManager.writeReviewed(folderPath, filename, reviewedData);
});

ipcMain.handle('load-state', async (_, folderPath) => {
  return stateManager.loadState(folderPath);
});

ipcMain.handle('save-state', async (_, folderPath, state) => {
  return stateManager.saveState(folderPath, state);
});

ipcMain.handle('fetch-prompt', async (_, promptName, folderPath) => {
  return promptCache.fetchPrompt(promptName, folderPath);
});

ipcMain.handle('get-stats', async (_, folderPath) => {
  return fileManager.getStats(folderPath);
});

ipcMain.handle('read-specimen-raw', async (_, folderPath, filename) => {
  return fileManager.readSpecimenRaw(folderPath, filename);
});

ipcMain.handle('select-save-path', async (_, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Project',
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('write-file', async (_, filePath, data, encoding) => {
  const fs = require('fs');
  if (encoding === 'base64') {
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  } else {
    fs.writeFileSync(filePath, data, encoding || 'utf-8');
  }
  return true;
});

ipcMain.handle('load-settings', async (_, folderPath) => {
  const settings = settingsManager.loadSettings(folderPath);
  if (settings.imageCacheSize) imageDecoder.setMaxCacheSize(settings.imageCacheSize);
  return settings;
});

ipcMain.handle('save-settings', async (_, folderPath, settings) => {
  // Update image cache size if changed
  if (settings.imageCacheSize !== undefined) {
    imageDecoder.setMaxCacheSize(settings.imageCacheSize);
  }
  return settingsManager.saveSettings(folderPath, settings);
});

ipcMain.handle('reset-project', async (_, folderPath) => {
  const fs = require('fs');
  const path = require('path');

  // Delete all __REVIEWED.json files and .xlsx spreadsheets
  const entries = fs.readdirSync(folderPath);
  for (const entry of entries) {
    if (entry.endsWith('__REVIEWED.json') || entry.endsWith('.xlsx')) {
      fs.unlinkSync(path.join(folderPath, entry));
    }
  }

  // Delete state file
  const stateFile = path.join(folderPath, '_vvgo_editor_state.json');
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

  // Delete settings file
  const settingsFile = path.join(folderPath, '_vvgo_editor_settings.json');
  if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);

  // Delete _prompts directory
  const promptsDir = path.join(folderPath, '_prompts');
  if (fs.existsSync(promptsDir)) {
    fs.rmSync(promptsDir, { recursive: true, force: true });
  }

  return true;
});

ipcMain.handle('export-xlsx', async (_, filePath, rows) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Reviewed');
  XLSX.writeFile(wb, filePath);
  return true;
});

// ── Update IPC Handlers ──────────────────────────────────────

ipcMain.handle('get-update-info', async () => {
  const gs = settingsManager.loadGlobalSettings();
  return {
    currentVersion: app.getVersion(),
    installDate: gs.installDate || null,
    lastUpdateCheck: gs.lastUpdateCheck || null,
    isPortable: isPortableWindows(),
    platform: process.platform
  };
});

ipcMain.handle('check-for-update', async () => {
  const gs = settingsManager.loadGlobalSettings();
  gs.lastUpdateCheck = new Date().toISOString();
  settingsManager.saveGlobalSettings(gs);

  if (isPortableWindows()) {
    try {
      const release = await checkGitHubRelease();
      const current = app.getVersion();
      if (release.version && release.version !== current) {
        return { status: 'available-manual', version: release.version, releaseUrl: release.releaseUrl };
      }
      return { status: 'up-to-date', version: current };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  } else {
    try {
      await autoUpdater.checkForUpdates();
      return { status: 'checking' };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  }
});

ipcMain.handle('download-update', async () => {
  autoUpdater.downloadUpdate();
  return true;
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall();
});
