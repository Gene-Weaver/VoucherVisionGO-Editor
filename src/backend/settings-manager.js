const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const INPROGRESS_DIR = '_INPROGRESS';
const SETTINGS_FILENAME = '_settings.json';
// Legacy path (for migration detection)
const LEGACY_SETTINGS_FILENAME = '_vvgo_editor_settings.json';

const DEFAULT_SETTINGS = {
  version: 1,
  acceptAllEnabled: false,
  mapTheme: 'dark',
  rowColorOdd: '#2f2f2f',
  rowColorEven: '#242424',
  imageCacheSize: 2000,
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
  lastUpdateCheck: null,
  installDate: null,
};

let appDataPath = null;

function getAppDataSettingsPath() {
  if (!appDataPath) {
    appDataPath = path.join(app.getPath('userData'), 'settings.json');
  }
  return appDataPath;
}

function getProjectSettingsPath(folderPath) {
  return path.join(folderPath, INPROGRESS_DIR, SETTINGS_FILENAME);
}

function getLegacySettingsPath(folderPath) {
  return path.join(folderPath, LEGACY_SETTINGS_FILENAME);
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
 * Checks new path first, then legacy path (with auto-migration).
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
  } catch (e) {
    console.warn('Failed to load app-level settings:', e.message);
  }

  // Try project folder (overrides appData if present)
  if (folderPath) {
    let loaded = false;

    // New path: _INPROGRESS/_settings.json
    try {
      const projectFile = getProjectSettingsPath(folderPath);
      if (fs.existsSync(projectFile)) {
        const raw = fs.readFileSync(projectFile, 'utf-8');
        Object.assign(settings, JSON.parse(raw));
        loaded = true;
      }
    } catch (e) {
      console.warn('Failed to load project settings from new path:', e.message);
    }

    // Legacy path: _vvgo_editor_settings.json (auto-migrate)
    if (!loaded) {
      try {
        const legacyFile = getLegacySettingsPath(folderPath);
        if (fs.existsSync(legacyFile)) {
          const raw = fs.readFileSync(legacyFile, 'utf-8');
          Object.assign(settings, JSON.parse(raw));

          // Auto-migrate to new path
          try {
            atomicWrite(getProjectSettingsPath(folderPath), settings);
            fs.unlinkSync(legacyFile);
          } catch (e) {
            console.warn('Failed to migrate settings file:', e.message);
          }
        }
      } catch (e) {
        console.warn('Failed to load legacy project settings:', e.message);
      }
    }
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
  } catch (e) {
    console.warn('Failed to save app-level settings:', e.message);
  }

  // Write to project folder (_INPROGRESS/_settings.json)
  if (folderPath) {
    try {
      atomicWrite(getProjectSettingsPath(folderPath), settings);
    } catch (e) {
      console.warn('Failed to save project settings:', e.message);
    }
  }

  return true;
}

/**
 * Load only the global (appData) settings — for app-wide metadata like update timestamps.
 */
function loadGlobalSettings() {
  let settings = {};
  try {
    const appDataFile = getAppDataSettingsPath();
    if (fs.existsSync(appDataFile)) {
      const raw = fs.readFileSync(appDataFile, 'utf-8');
      settings = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load global settings:', e.message);
  }
  return settings;
}

/**
 * Save only to the global (appData) settings file.
 */
function saveGlobalSettings(settings) {
  try {
    atomicWrite(getAppDataSettingsPath(), settings);
  } catch (e) {
    console.warn('Failed to save global settings:', e.message);
  }
}

module.exports = { loadSettings, saveSettings, loadGlobalSettings, saveGlobalSettings, DEFAULT_SETTINGS, SETTINGS_FILENAME, LEGACY_SETTINGS_FILENAME };
