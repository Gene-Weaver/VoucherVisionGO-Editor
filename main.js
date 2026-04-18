const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const fileManager = require('./src/backend/file-manager');
const stateManager = require('./src/backend/state-manager');
const promptCache = require('./src/backend/prompt-cache');
const imageDecoder = require('./src/backend/image-decoder');
const settingsManager = require('./src/backend/settings-manager');
const ThemeDefaults = require('./src/shared/theme-defaults');
const historyManager = require('./src/backend/history-manager');
const inprogressManager = require('./src/backend/inprogress-manager');
const projectManager = require('./src/backend/project-manager');

// ── Auto-updater configuration ──────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function isPortableWindows() {
  return process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_DIR != null;
}

async function checkGitHubRelease() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(
      'https://api.github.com/repos/Gene-Weaver/VoucherVisionGO-Editor/releases/latest',
      { headers: { 'User-Agent': 'VoucherVisionGO-Editor' }, signal: controller.signal }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const release = await res.json();
    return {
      version: release.tag_name ? release.tag_name.replace(/^v/, '') : null,
      releaseUrl: release.html_url,
      publishedAt: release.published_at,
      body: release.body
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Install a minimal application menu that keeps standard text-editing
// accelerators (Undo/Redo/Cut/Copy/Paste/Select-All) but removes the
// system accelerators we want the app to claim — Cmd+H (Hide), Cmd+M
// (Minimize), Cmd+R (Reload), Cmd+F (Find), etc. Those keys now fall
// through to the renderer's keydown handler, which only fires when our
// window is focused, so the OS shortcuts still work normally in every
// other app.
function installAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        // Intentionally no { role: 'hide' } — Cmd+H is reclaimed by the app.
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' } // Cmd+Q stays (user said to preserve it)
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },    // Cmd+Z
        { role: 'redo' },    // Cmd+Shift+Z / Cmd+Y
        { type: 'separator' },
        { role: 'cut' },     // Cmd+X
        { role: 'copy' },    // Cmd+C
        { role: 'paste' },   // Cmd+V
        { role: 'selectAll' } // Cmd+A
      ]
    },
    {
      label: 'View',
      submenu: [
        // No reload role (Cmd+R is reclaimed by the app)
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        // No minimize role (Cmd+M is reclaimed by the app)
        { role: 'close' } // Cmd+W still closes the window
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'VoucherVisionGO Editor',
    backgroundColor: ThemeDefaults.colors.bg.primary,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
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
  installAppMenu();
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

// Release lock on quit
app.on('before-quit', () => {
  // Release any held lock and stop heartbeat — best-effort (issue #3)
  stopLeaseHeartbeat();
  if (_activeLockedFolder) {
    try {
      projectManager.releaseLock(_activeLockedFolder);
    } catch (e) {
      console.warn('Failed to release lock on quit:', e.message);
    }
    _activeLockedFolder = null;
  }
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

ipcMain.handle('get-image', async (_, folderPath, filename, imageType, variant) => {
  return imageDecoder.getImage(folderPath, filename, imageType, variant);
});

ipcMain.handle('warm-image-cache', async (_, folderPath, filenames) => {
  imageDecoder.warmThumbnailCache(folderPath, filenames);
  return true;
});

ipcMain.handle('read-specimen-raw', async (_, folderPath, filename) => {
  return fileManager.readSpecimenRaw(folderPath, filename);
});

ipcMain.handle('fetch-prompt', async (_, promptName, folderPath) => {
  return promptCache.fetchPrompt(promptName, folderPath);
});

ipcMain.handle('get-stats', async (_, folderPath) => {
  return fileManager.getStats(folderPath);
});

ipcMain.handle('collect-field-schema', async (_, folderPath, specimens) => {
  return fileManager.collectFieldSchema(folderPath, specimens);
});

ipcMain.handle('validate-field-schema', async (_, folderPath, specimens) => {
  return fileManager.validateSharedFieldSchema(folderPath, specimens);
});

ipcMain.handle('detect-legacy-format', async (_, folderPath) => {
  return fileManager.detectLegacyFormat(folderPath);
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

// ── Legacy IPC Handlers (kept for migration, will be removed in Phase 3B) ──

ipcMain.handle('write-reviewed', async (_, folderPath, filename, reviewedData) => {
  return fileManager.writeReviewed(folderPath, filename, reviewedData);
});

ipcMain.handle('load-state', async (_, folderPath) => {
  return stateManager.loadState(folderPath);
});

ipcMain.handle('save-state', async (_, folderPath, state) => {
  return stateManager.saveState(folderPath, state);
});

// write-file: REMOVED — arbitrary filesystem write vulnerability (issue #3)
// Replaced by project-scoped write handlers below.

// ── New Three-Tier IPC Handlers ─────────────────────────────

ipcMain.handle('write-inprogress', async (_, folderPath, filename, data) => {
  fileManager.assertPathWithinProject(folderPath, inprogressManager.getInProgressPath(folderPath, filename));
  return inprogressManager.writeInProgress(folderPath, filename, data);
});

ipcMain.handle('read-inprogress', async (_, folderPath, filename) => {
  return inprogressManager.readInProgress(folderPath, filename);
});

ipcMain.handle('read-all-inprogress', async (_, folderPath) => {
  return inprogressManager.readAllInProgress(folderPath);
});

ipcMain.handle('load-project', async (_, folderPath) => {
  return projectManager.loadProject(folderPath);
});

ipcMain.handle('save-project', async (_, folderPath, projectState) => {
  return projectManager.saveProject(folderPath, projectState);
});

// ── Lock management with heartbeat (issue #3) ──
let _activeLockedFolder = null;
let _leaseHeartbeatInterval = null;

function startLeaseHeartbeat(folderPath) {
  stopLeaseHeartbeat();
  _activeLockedFolder = folderPath;
  _leaseHeartbeatInterval = setInterval(() => {
    if (_activeLockedFolder) {
      projectManager.refreshLease(_activeLockedFolder);
    }
  }, 2 * 60 * 1000); // Refresh every 2 minutes
}

function stopLeaseHeartbeat() {
  if (_leaseHeartbeatInterval) {
    clearInterval(_leaseHeartbeatInterval);
    _leaseHeartbeatInterval = null;
  }
}

ipcMain.handle('acquire-lock', async (_, folderPath) => {
  const result = projectManager.acquireLock(folderPath);
  if (result.success) {
    startLeaseHeartbeat(folderPath);
  }
  return result;
});

ipcMain.handle('force-acquire-lock', async (_, folderPath) => {
  const result = projectManager.forceAcquireLock(folderPath);
  if (result.success) {
    startLeaseHeartbeat(folderPath);
  }
  return result;
});

ipcMain.handle('release-lock', async (_, folderPath) => {
  if (_activeLockedFolder === folderPath) {
    stopLeaseHeartbeat();
    _activeLockedFolder = null;
  }
  return projectManager.releaseLock(folderPath);
});

/**
 * Generate a reviewed JSON for a specimen and write it to _REVIEWED/.
 * Reads the raw original, combines with in-progress data, writes to _REVIEWED/.
 */
ipcMain.handle('generate-and-write-reviewed', async (_, folderPath, filename, inProgressData, username, editorVersion, promptFieldSchema, categories) => {
  const original = fileManager.readSpecimenRaw(folderPath, filename);
  const reviewed = fileManager.generateReviewed(original, inProgressData, username, editorVersion, promptFieldSchema, categories);
  const reviewedFilename = fileManager.writeReviewedToFolder(folderPath, filename, reviewed);
  return { reviewedFilename, complete: reviewed.review_metadata.complete };
});

/**
 * Migrate root-level __REVIEWED.json files into _REVIEWED/ subfolder.
 */
ipcMain.handle('migrate-reviewed-files', async (_, folderPath) => {
  return fileManager.migrateReviewedFiles(folderPath);
});

/**
 * Synchronous flush-saves handler for beforeunload.
 * Uses ipcMain.on (not handle) + event.returnValue for synchronous IPC.
 */
ipcMain.on('flush-saves', (event, folderPath, payload) => {
  try {
    projectManager.flushAll(folderPath, payload);
    event.returnValue = { success: true };
  } catch (e) {
    console.error('flush-saves failed:', e.message);
    event.returnValue = { success: false, error: e.message };
  }
});

// ── Settings IPC ─────────────────────────────────────────────

ipcMain.handle('load-settings', async (_, folderPath) => {
  const settings = settingsManager.loadSettings(folderPath);
  if (settings.imageCacheSize) imageDecoder.setMaxCacheSize(settings.imageCacheSize);
  return settings;
});

ipcMain.handle('save-settings', async (_, folderPath, settings) => {
  if (settings.imageCacheSize !== undefined) {
    imageDecoder.setMaxCacheSize(settings.imageCacheSize);
  }
  return settingsManager.saveSettings(folderPath, settings);
});

ipcMain.handle('save-history', async (_, folderPath, historyData) => {
  return historyManager.saveHistory(folderPath, historyData);
});

ipcMain.handle('load-history', async (_, folderPath) => {
  return historyManager.loadHistory(folderPath);
});

// ── Reset Project (scoped to app-owned artifacts only) ───────

ipcMain.handle('reset-project', async (_, folderPath) => {
  // Only delete app-managed directories (issue #11: don't delete arbitrary .xlsx)
  const appDirs = ['_INPROGRESS', '_REVIEWED', '_prompts', 'Reviewed_Data', '._img_cache'];
  for (const dir of appDirs) {
    const dirPath = path.join(folderPath, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  // Also clean up legacy root-level files if present
  const legacyFiles = [
    '_vvgo_editor_state.json',
    '_vvgo_editor_settings.json',
    '_vvgo_editor_history.json',
  ];
  for (const file of legacyFiles) {
    const filePath = path.join(folderPath, file);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  // Clean up legacy root-level __REVIEWED.json files
  const entries = fs.readdirSync(folderPath);
  for (const entry of entries) {
    if (entry.endsWith('__REVIEWED.json')) {
      fs.unlinkSync(path.join(folderPath, entry));
    }
  }

  return true;
});

// ── Export XLSX ───────────────────────────────────────────────

ipcMain.handle('export-xlsx', async (_, filePath, rows) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Reviewed');
  XLSX.writeFile(wb, filePath);
  return true;
});

ipcMain.handle('ensure-export-dir', async (_, folderPath) => {
  return fileManager.ensureExportDir(folderPath);
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
