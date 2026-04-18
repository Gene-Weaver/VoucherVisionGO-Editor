const fs = require('fs');
const path = require('path');

/**
 * Atomic write helper shared by every backend module.
 *
 * Writes to a sibling `.tmp` file first, then renames over the target. On
 * Windows `renameSync` throws EEXIST when the target already exists, so we
 * explicitly unlink the target there before the rename.
 *
 * @param {string} filePath - absolute destination path
 * @param {string|object} data - string written as-is; objects are JSON.stringified with 2-space indent
 */
function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, payload, 'utf-8');
  if (process.platform === 'win32' && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
  fs.renameSync(tmp, filePath);
}

module.exports = { atomicWrite };
