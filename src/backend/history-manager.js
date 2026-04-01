const fs = require('fs');
const path = require('path');

const HISTORY_FILENAME = '_vvgo_editor_history.json';

function getHistoryPath(folderPath) {
  return path.join(folderPath, HISTORY_FILENAME);
}

/**
 * Load history checkpoint from disk. Returns null if none exists.
 */
function loadHistory(folderPath) {
  const histPath = getHistoryPath(folderPath);
  try {
    if (!fs.existsSync(histPath)) return null;
    const raw = fs.readFileSync(histPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save history checkpoint to disk with atomic write.
 */
function saveHistory(folderPath, historyData) {
  const histPath = getHistoryPath(folderPath);
  const tmpPath = histPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(historyData), 'utf-8');
  fs.renameSync(tmpPath, histPath);
  return true;
}

module.exports = { loadHistory, saveHistory, HISTORY_FILENAME };
