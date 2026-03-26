const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fileManager = require('./src/backend/file-manager');
const stateManager = require('./src/backend/state-manager');
const promptCache = require('./src/backend/prompt-cache');
const imageDecoder = require('./src/backend/image-decoder');
const settingsManager = require('./src/backend/settings-manager');

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
  return settingsManager.loadSettings(folderPath);
});

ipcMain.handle('save-settings', async (_, folderPath, settings) => {
  return settingsManager.saveSettings(folderPath, settings);
});

ipcMain.handle('export-xlsx', async (_, filePath, rows) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Reviewed');
  XLSX.writeFile(wb, filePath);
  return true;
});
