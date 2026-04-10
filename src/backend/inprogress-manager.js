const fs = require('fs');
const path = require('path');

const INPROGRESS_DIR = '_INPROGRESS';
const INPROGRESS_SUFFIX = '__INPROGRESS';

function getInProgressDir(folderPath) {
  return path.join(folderPath, INPROGRESS_DIR);
}

function ensureInProgressDir(folderPath) {
  const dir = getInProgressDir(folderPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get the path for a specimen's in-progress file.
 * "foo.json" -> "_INPROGRESS/foo__INPROGRESS.json"
 */
function getInProgressPath(folderPath, filename) {
  const base = filename.replace(/\.json$/, '');
  return path.join(getInProgressDir(folderPath), `${base}${INPROGRESS_SUFFIX}.json`);
}

/**
 * Read a single specimen's in-progress state. Returns null if absent.
 */
function readInProgress(folderPath, filename) {
  const filePath = getInProgressPath(folderPath, filename);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to read in-progress file for ${filename}:`, e.message);
    return null;
  }
}

/**
 * Write a specimen's in-progress state with atomic write.
 */
function writeInProgress(folderPath, filename, data) {
  ensureInProgressDir(folderPath);
  const filePath = getInProgressPath(folderPath, filename);
  const tmpPath = filePath + '.tmp';

  data.last_modified = new Date().toISOString();

  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
  return true;
}

/**
 * Read all in-progress files from _INPROGRESS/.
 * Returns { "specimen1.json": {...data}, "specimen2.json": {...data} }
 */
function readAllInProgress(folderPath) {
  const dir = getInProgressDir(folderPath);
  const result = {};

  if (!fs.existsSync(dir)) return result;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(`${INPROGRESS_SUFFIX}.json`)) continue;

    // Derive original filename: "foo__INPROGRESS.json" -> "foo.json"
    const originalFilename = entry.name.replace(`${INPROGRESS_SUFFIX}.json`, '.json');

    try {
      const raw = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
      result[originalFilename] = JSON.parse(raw);
    } catch (e) {
      console.warn(`Failed to read in-progress file ${entry.name}:`, e.message);
    }
  }

  return result;
}

/**
 * Delete a single specimen's in-progress file.
 */
function deleteInProgress(folderPath, filename) {
  const filePath = getInProgressPath(folderPath, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Delete the entire _INPROGRESS directory.
 */
function deleteAllInProgress(folderPath) {
  const dir = getInProgressDir(folderPath);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Check if an _INPROGRESS directory exists for this project.
 */
function hasInProgressDir(folderPath) {
  return fs.existsSync(getInProgressDir(folderPath));
}

module.exports = {
  ensureInProgressDir,
  getInProgressPath,
  readInProgress,
  writeInProgress,
  readAllInProgress,
  deleteInProgress,
  deleteAllInProgress,
  hasInProgressDir,
  INPROGRESS_DIR,
  INPROGRESS_SUFFIX,
};
