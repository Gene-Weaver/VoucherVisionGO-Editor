const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Folder & Specimen I/O ─────────────────────────────────
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  readSpecimen: (folderPath, filename) => ipcRenderer.invoke('read-specimen', folderPath, filename),
  readSpecimenRaw: (folderPath, filename) => ipcRenderer.invoke('read-specimen-raw', folderPath, filename),
  getImage: (folderPath, filename, imageType, variant) => ipcRenderer.invoke('get-image', folderPath, filename, imageType, variant),
  warmImageCache: (folderPath, filenames) => ipcRenderer.invoke('warm-image-cache', folderPath, filenames),
  fetchPrompt: (promptName, folderPath) => ipcRenderer.invoke('fetch-prompt', promptName, folderPath),
  getStats: (folderPath) => ipcRenderer.invoke('get-stats', folderPath),
  collectFieldSchema: (folderPath, specimens) => ipcRenderer.invoke('collect-field-schema', folderPath, specimens),
  validateFieldSchema: (folderPath, specimens) => ipcRenderer.invoke('validate-field-schema', folderPath, specimens),
  detectLegacyFormat: (folderPath) => ipcRenderer.invoke('detect-legacy-format', folderPath),

  // ── Three-Tier: In-Progress ───────────────────────────────
  writeInProgress: (folderPath, filename, data) => ipcRenderer.invoke('write-inprogress', folderPath, filename, data),
  readInProgress: (folderPath, filename) => ipcRenderer.invoke('read-inprogress', folderPath, filename),
  readAllInProgress: (folderPath) => ipcRenderer.invoke('read-all-inprogress', folderPath),

  // ── Three-Tier: Project State ─────────────────────────────
  loadProject: (folderPath) => ipcRenderer.invoke('load-project', folderPath),
  saveProject: (folderPath, projectState) => ipcRenderer.invoke('save-project', folderPath, projectState),
  acquireLock: (folderPath) => ipcRenderer.invoke('acquire-lock', folderPath),
  forceAcquireLock: (folderPath) => ipcRenderer.invoke('force-acquire-lock', folderPath),
  releaseLock: (folderPath) => ipcRenderer.invoke('release-lock', folderPath),

  // ── Three-Tier: Reviewed (export-only) ────────────────────
  generateAndWriteReviewed: (folderPath, filename, inProgressData, username, editorVersion, promptFieldSchema, categories) =>
    ipcRenderer.invoke('generate-and-write-reviewed', folderPath, filename, inProgressData, username, editorVersion, promptFieldSchema, categories),
  migrateReviewedFiles: (folderPath) => ipcRenderer.invoke('migrate-reviewed-files', folderPath),

  // ── Synchronous flush for beforeunload ────────────────────
  flushSaves: (folderPath, payload) => ipcRenderer.sendSync('flush-saves', folderPath, payload),

  // ── Legacy (kept for migration, will be removed) ──────────
  writeReviewed: (folderPath, filename, reviewedData) => ipcRenderer.invoke('write-reviewed', folderPath, filename, reviewedData),
  loadState: (folderPath) => ipcRenderer.invoke('load-state', folderPath),
  saveState: (folderPath, state) => ipcRenderer.invoke('save-state', folderPath, state),

  // ── Settings & History ────────────────────────────────────
  loadSettings: (folderPath) => ipcRenderer.invoke('load-settings', folderPath),
  saveSettings: (folderPath, settings) => ipcRenderer.invoke('save-settings', folderPath, settings),
  saveHistory: (folderPath, data) => ipcRenderer.invoke('save-history', folderPath, data),
  loadHistory: (folderPath) => ipcRenderer.invoke('load-history', folderPath),

  // ── Export ────────────────────────────────────────────────
  selectSavePath: (defaultName) => ipcRenderer.invoke('select-save-path', defaultName),
  exportXlsx: (filePath, rows) => ipcRenderer.invoke('export-xlsx', filePath, rows),
  ensureExportDir: (folderPath) => ipcRenderer.invoke('ensure-export-dir', folderPath),
  resetProject: (folderPath) => ipcRenderer.invoke('reset-project', folderPath),

  // ── Update ────────────────────────────────────────────────
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, data) => callback(data))
});
