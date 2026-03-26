const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  readSpecimen: (folderPath, filename) => ipcRenderer.invoke('read-specimen', folderPath, filename),
  getImage: (folderPath, filename, imageType) => ipcRenderer.invoke('get-image', folderPath, filename, imageType),
  writeReviewed: (folderPath, filename, reviewedData) => ipcRenderer.invoke('write-reviewed', folderPath, filename, reviewedData),
  loadState: (folderPath) => ipcRenderer.invoke('load-state', folderPath),
  saveState: (folderPath, state) => ipcRenderer.invoke('save-state', folderPath, state),
  fetchPrompt: (promptName, folderPath) => ipcRenderer.invoke('fetch-prompt', promptName, folderPath),
  getStats: (folderPath) => ipcRenderer.invoke('get-stats', folderPath),
  readSpecimenRaw: (folderPath, filename) => ipcRenderer.invoke('read-specimen-raw', folderPath, filename),
  selectSavePath: (defaultName) => ipcRenderer.invoke('select-save-path', defaultName),
  writeFile: (filePath, data, encoding) => ipcRenderer.invoke('write-file', filePath, data, encoding),
  exportXlsx: (filePath, rows) => ipcRenderer.invoke('export-xlsx', filePath, rows),
  loadSettings: (folderPath) => ipcRenderer.invoke('load-settings', folderPath),
  saveSettings: (folderPath, settings) => ipcRenderer.invoke('save-settings', folderPath, settings)
});
