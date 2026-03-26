const fs = require('fs');
const path = require('path');

const STATE_FILENAME = '_vvgo_editor_state.json';
const REVIEWED_SUFFIX = '__REVIEWED';

/**
 * Scan a folder for VoucherVisionGO JSON files.
 * Returns array of {filename, hasReviewed, prompt} objects.
 */
function scanFolder(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const jsonFiles = [];
  const reviewedMap = {}; // originalName -> {hasReviewed, reviewComplete}

  // First pass: collect all __REVIEWED filenames and read their complete status
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(`${REVIEWED_SUFFIX}.json`)) {
      const originalName = entry.name.replace(`${REVIEWED_SUFFIX}.json`, '.json');
      let complete = false;
      try {
        const raw = fs.readFileSync(path.join(folderPath, entry.name), 'utf-8');
        const data = JSON.parse(raw);
        complete = !!(data.review_metadata && data.review_metadata.complete);
      } catch {}
      reviewedMap[originalName] = { hasReviewed: true, reviewComplete: complete };
    }
  }

  // Second pass: collect candidate JSON files (not reviewed, not state)
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.json')) continue;
    if (entry.name === STATE_FILENAME) continue;
    if (entry.name.endsWith(`${REVIEWED_SUFFIX}.json`)) continue;
    if (entry.name.startsWith('_')) continue;

    // Quick peek to verify this is a VoucherVisionGO output file
    let prompt = null;
    try {
      const raw = fs.readFileSync(path.join(folderPath, entry.name), 'utf-8');
      const data = JSON.parse(raw);
      if (data.formatted_json && data.prompt) {
        prompt = data.prompt;
      } else {
        continue; // Not a VoucherVisionGO output file
      }
    } catch {
      continue; // Invalid JSON or read error
    }

    const reviewInfo = reviewedMap[entry.name] || { hasReviewed: false, reviewComplete: false };
    jsonFiles.push({
      filename: entry.name,
      hasReviewed: reviewInfo.hasReviewed,
      reviewComplete: reviewInfo.reviewComplete,
      prompt
    });
  }

  // Sort by filename
  jsonFiles.sort((a, b) => a.filename.localeCompare(b.filename));
  return jsonFiles;
}

/**
 * Read a single specimen JSON file, excluding the base64 image data
 * to keep IPC payloads small.
 */
function readSpecimen(folderPath, filename) {
  const filePath = path.join(folderPath, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  // Strip base64 image from the payload sent to renderer
  // (images are served separately via getImage)
  const result = { ...data };
  if (result.collage_info) {
    result.collage_info = { ...result.collage_info };
    delete result.collage_info.base64image_text_collage;
    delete result.collage_info.base64image_original;
  }

  return result;
}

/**
 * Read a single specimen JSON file raw (preserving base64 images).
 */
function readSpecimenRaw(folderPath, filename) {
  const filePath = path.join(folderPath, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Write the __REVIEWED JSON file.
 * reviewedData is the full JSON with user-accepted formatted_json + review_metadata.
 */
function writeReviewed(folderPath, filename, reviewedData) {
  // Build reviewed filename: "foo.json" -> "foo__REVIEWED.json"
  const reviewedFilename = filename.replace(/\.json$/, `${REVIEWED_SUFFIX}.json`);
  const filePath = path.join(folderPath, reviewedFilename);
  const tmpPath = filePath + '.tmp';

  // Atomic write
  fs.writeFileSync(tmpPath, JSON.stringify(reviewedData, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);

  return reviewedFilename;
}

/**
 * Get batch stats for a folder.
 */
function getStats(folderPath) {
  const specimens = scanFolder(folderPath);
  const total = specimens.length;
  const reviewed = specimens.filter(s => s.hasReviewed).length;

  return {
    total,
    reviewed,
    inProgress: 0, // Will be enriched by state data on the renderer side
    flagged: 0,
    percentage: total > 0 ? Math.round((reviewed / total) * 100) : 0
  };
}

module.exports = { scanFolder, readSpecimen, readSpecimenRaw, writeReviewed, getStats, REVIEWED_SUFFIX, STATE_FILENAME };
