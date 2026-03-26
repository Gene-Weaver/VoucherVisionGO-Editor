const fs = require('fs');
const path = require('path');

const STATE_FILENAME = '_vvgo_editor_state.json';

function getStatePath(folderPath) {
  return path.join(folderPath, STATE_FILENAME);
}

/**
 * Load state from the working folder. Returns null if no state exists.
 */
function loadState(folderPath) {
  const statePath = getStatePath(folderPath);
  try {
    if (!fs.existsSync(statePath)) return null;
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save state to the working folder with atomic write.
 */
function saveState(folderPath, state) {
  const statePath = getStatePath(folderPath);
  const tmpPath = statePath + '.tmp';

  state.last_modified = new Date().toISOString();

  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, statePath);
  return true;
}

module.exports = { loadState, saveState, STATE_FILENAME };
