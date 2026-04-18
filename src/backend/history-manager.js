const fs = require('fs');
const path = require('path');

const { atomicWrite } = require('./util/file-utils');

const INPROGRESS_DIR = '_INPROGRESS';
const HISTORY_FILENAME = '_history.json';
// Legacy path (for migration detection)
const LEGACY_HISTORY_FILENAME = '_vvgo_editor_history.json';

function getHistoryPath(folderPath) {
  return path.join(folderPath, INPROGRESS_DIR, HISTORY_FILENAME);
}

function getLegacyHistoryPath(folderPath) {
  return path.join(folderPath, LEGACY_HISTORY_FILENAME);
}

/**
 * Load history checkpoint from disk. Returns null if none exists.
 * Checks new path first, then legacy path (with auto-migration).
 */
function loadHistory(folderPath) {
  const newPath = getHistoryPath(folderPath);
  const legacyPath = getLegacyHistoryPath(folderPath);

  // Try new path first
  try {
    if (fs.existsSync(newPath)) {
      const raw = fs.readFileSync(newPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load history from new path:', e.message);
  }

  // Try legacy path and migrate if found
  try {
    if (fs.existsSync(legacyPath)) {
      const raw = fs.readFileSync(legacyPath, 'utf-8');
      const data = JSON.parse(raw);

      // Auto-migrate: atomic write to new path, then remove old
      try {
        atomicWrite(newPath, raw);
        fs.unlinkSync(legacyPath);
      } catch (e) {
        console.warn('Failed to migrate history file:', e.message);
      }

      return data;
    }
  } catch (e) {
    console.warn('Failed to load legacy history:', e.message);
  }

  return null;
}

/**
 * Save history checkpoint to disk with atomic write.
 * Writes to _INPROGRESS/_history.json.
 */
function saveHistory(folderPath, historyData) {
  // History files can be large; preserve compact serialization by pre-stringifying.
  atomicWrite(getHistoryPath(folderPath), JSON.stringify(historyData));
  return true;
}

module.exports = { loadHistory, saveHistory, HISTORY_FILENAME, LEGACY_HISTORY_FILENAME };
