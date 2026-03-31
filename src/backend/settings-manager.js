const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SETTINGS_FILENAME = '_vvgo_editor_settings.json';

const DEFAULT_SETTINGS = {
  version: 1,
  acceptAllEnabled: false,
  mapTheme: 'dark',
  rowColorOdd: '#2f2f2f',
  rowColorEven: '#242424',
  imageCacheSize: 500,
  catColors: {
    cat0: '#479EF5',
    cat1: '#CA50F7',
    cat2: '#48CA48',
    cat3: '#A0A220',
    cat4: '#FF5C5C',
    cat5: '#7fffff',
    cat6: '#ffff7f',
    catMisc: '#888888',
  },
};

let appDataPath = null;

function getAppDataSettingsPath() {
  if (!appDataPath) {
    appDataPath = path.join(app.getPath('userData'), 'settings.json');
  }
  return appDataPath;
}

function getProjectSettingsPath(folderPath) {
  return path.join(folderPath, SETTINGS_FILENAME);
}

function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * Load settings. Reads from appData first, then project folder as fallback.
 * Merges with defaults so new settings always have values.
 */
function loadSettings(folderPath) {
  let settings = { ...DEFAULT_SETTINGS };

  // Try appData first
  try {
    const appDataFile = getAppDataSettingsPath();
    if (fs.existsSync(appDataFile)) {
      const raw = fs.readFileSync(appDataFile, 'utf-8');
      Object.assign(settings, JSON.parse(raw));
    }
  } catch {}

  // Try project folder (overrides appData if present)
  if (folderPath) {
    try {
      const projectFile = getProjectSettingsPath(folderPath);
      if (fs.existsSync(projectFile)) {
        const raw = fs.readFileSync(projectFile, 'utf-8');
        Object.assign(settings, JSON.parse(raw));
      }
    } catch {}
  }

  return settings;
}

/**
 * Save settings to both appData and project folder.
 */
function saveSettings(folderPath, settings) {
  settings.version = DEFAULT_SETTINGS.version;

  // Write to appData
  try {
    atomicWrite(getAppDataSettingsPath(), settings);
  } catch {}

  // Write to project folder
  if (folderPath) {
    try {
      atomicWrite(getProjectSettingsPath(folderPath), settings);
    } catch {}
  }

  return true;
}

module.exports = { loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_FILENAME };
