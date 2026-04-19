const fs = require('fs');
const path = require('path');
const CompletionEvaluator = require('../shared/completion');
const { atomicWrite } = require('./util/file-utils');

const STATE_FILENAME = '_vvgo_editor_state.json';
const REVIEWED_SUFFIX = '__REVIEWED';
const REVIEWED_DIR = '_REVIEWED';
const EXPORT_DIR = 'Reviewed_Data';
const INPROGRESS_DIR = '_INPROGRESS';
const INPROGRESS_SUFFIX = '__INPROGRESS';

// ── Path Validation ──────────────────────────────────────────

/**
 * Validate that a target path is within the project folder.
 * Prevents path traversal attacks.
 */
function validatePathWithinProject(folderPath, targetPath) {
  const resolved = path.resolve(targetPath);
  const folder = path.resolve(folderPath);
  return resolved === folder || resolved.startsWith(folder + path.sep);
}

/**
 * Assert a path is within the project folder. Throws if not.
 */
function assertPathWithinProject(folderPath, targetPath) {
  if (!validatePathWithinProject(folderPath, targetPath)) {
    throw new Error(`Path outside project folder: ${targetPath}`);
  }
}

// ── Directory Helpers ────────────────────────────────────────

function ensureReviewedDir(folderPath) {
  const dir = path.join(folderPath, REVIEWED_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureExportDir(folderPath) {
  const dir = path.join(folderPath, EXPORT_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Scanning ─────────────────────────────────────────────────

/**
 * Scan a folder for VoucherVisionGO JSON files.
 * Checks _INPROGRESS/ for progress state and _REVIEWED/ for reviewed status.
 * Also checks root-level __REVIEWED.json for migration detection.
 * Returns array of {filename, hasReviewed, reviewComplete, hasInProgress, prompt} objects.
 */
function scanFolder(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const jsonFiles = [];
  const reviewedMap = {}; // originalName -> {hasReviewed, reviewComplete}

  // Check _REVIEWED/ subfolder for reviewed files (new format)
  const reviewedDir = path.join(folderPath, REVIEWED_DIR);
  if (fs.existsSync(reviewedDir)) {
    try {
      const reviewedEntries = fs.readdirSync(reviewedDir, { withFileTypes: true });
      for (const entry of reviewedEntries) {
        if (!entry.isFile()) continue;
        if (entry.name.endsWith(`${REVIEWED_SUFFIX}.json`)) {
          const originalName = entry.name.replace(`${REVIEWED_SUFFIX}.json`, '.json');
          let complete = false;
          try {
            const raw = fs.readFileSync(path.join(reviewedDir, entry.name), 'utf-8');
            const data = JSON.parse(raw);
            complete = !!(data.review_metadata && data.review_metadata.complete);
          } catch (e) {
            console.warn(`Failed to read reviewed file ${entry.name}:`, e.message);
          }
          reviewedMap[originalName] = { hasReviewed: true, reviewComplete: complete };
        }
      }
    } catch (e) {
      console.warn('Failed to scan _REVIEWED/ directory:', e.message);
    }
  }

  // Also check root-level __REVIEWED.json (old format, for migration detection)
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(`${REVIEWED_SUFFIX}.json`)) {
      const originalName = entry.name.replace(`${REVIEWED_SUFFIX}.json`, '.json');
      // Don't overwrite if already found in _REVIEWED/ subfolder
      if (!reviewedMap[originalName]) {
        let complete = false;
        try {
          const raw = fs.readFileSync(path.join(folderPath, entry.name), 'utf-8');
          const data = JSON.parse(raw);
          complete = !!(data.review_metadata && data.review_metadata.complete);
        } catch (e) {
          console.warn(`Failed to read legacy reviewed file ${entry.name}:`, e.message);
        }
        reviewedMap[originalName] = { hasReviewed: true, reviewComplete: complete, legacy: true };
      }
    }
  }

  // Check _INPROGRESS/ subfolder for in-progress state
  const inProgressMap = {};
  const inProgressDir = path.join(folderPath, INPROGRESS_DIR);
  if (fs.existsSync(inProgressDir)) {
    try {
      const ipEntries = fs.readdirSync(inProgressDir, { withFileTypes: true });
      for (const entry of ipEntries) {
        if (!entry.isFile()) continue;
        if (entry.name.endsWith(`${INPROGRESS_SUFFIX}.json`)) {
          const originalName = entry.name.replace(`${INPROGRESS_SUFFIX}.json`, '.json');
          inProgressMap[originalName] = true;
        }
      }
    } catch (e) {
      console.warn('Failed to scan _INPROGRESS/ directory:', e.message);
    }
  }

  // Collect candidate specimen JSON files (not reviewed, not state, not internal)
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
      hasInProgress: !!inProgressMap[entry.name],
      prompt
    });
  }

  // Sort by filename
  jsonFiles.sort((a, b) => a.filename.localeCompare(b.filename));
  return jsonFiles;
}

/**
 * Collect the union of all field keys across all specimens.
 * Returns a sorted array of unique field names.
 */
function collectFieldSchema(folderPath, specimens) {
  const allKeys = new Set();
  for (const spec of specimens) {
    try {
      const raw = fs.readFileSync(path.join(folderPath, spec.filename), 'utf-8');
      const data = JSON.parse(raw);
      if (data.formatted_json) {
        for (const key of Object.keys(data.formatted_json)) {
          allKeys.add(key);
        }
      }
    } catch (e) {
      console.warn(`Failed to read field schema from ${spec.filename}:`, e.message);
    }
  }
  return [...allKeys];
}

/**
 * Validate that all specimens share the same field schema.
 * Returns { valid: true } if all match, or { valid: false, violations: [...] }
 * listing specimens whose field keys differ from the first specimen's.
 */
function validateSharedFieldSchema(folderPath, specimens) {
  if (!specimens || specimens.length === 0) return { valid: true, violations: [] };

  const schemasBySpecimen = {};
  for (const spec of specimens) {
    try {
      const raw = fs.readFileSync(path.join(folderPath, spec.filename), 'utf-8');
      const data = JSON.parse(raw);
      schemasBySpecimen[spec.filename] = Object.keys(data.formatted_json || {}).sort();
    } catch (e) {
      console.warn(`Failed to read schema from ${spec.filename}:`, e.message);
      schemasBySpecimen[spec.filename] = [];
    }
  }

  const canonicalKeys = schemasBySpecimen[specimens[0].filename] || [];
  const canonicalStr = JSON.stringify(canonicalKeys);
  const canonicalSet = new Set(canonicalKeys);
  const violations = [];

  for (const [fn, keys] of Object.entries(schemasBySpecimen)) {
    if (JSON.stringify(keys) !== canonicalStr) {
      const keySet = new Set(keys);
      const extra = keys.filter(k => !canonicalSet.has(k));
      const missing = canonicalKeys.filter(k => !keySet.has(k));
      violations.push({ filename: fn, extra, missing });
    }
  }

  return violations.length === 0
    ? { valid: true, violations: [] }
    : { valid: false, violations, referenceSpecimen: specimens[0].filename };
}

// ── Reading ──────────────────────────────────────────────────

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
    delete result.collage_info.base64image_input_resized;
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

// ── Reviewed File Generation (export-only) ───────────────────

/**
 * Generate a reviewed JSON object from original specimen data + in-progress state.
 * Deep-copies the original to avoid reference sharing.
 * This is the ONLY place reviewed content is assembled.
 *
 * @param {Object} original - Raw original specimen JSON (with base64)
 * @param {Object} inProgressData - Per-specimen in-progress state
 * @param {string} username - Reviewer username
 * @param {string} editorVersion - App version string
 * @param {string[]} [promptFieldSchema] - Canonical field list from the project
 * @param {Array<{name:string, fields:string[]}>} [categories] - Category objects
 * @returns {Object} Complete reviewed JSON ready to write
 */
function generateReviewed(original, inProgressData, username, editorVersion, promptFieldSchema, categories) {
  // Deep copy original to avoid reference sharing (issue #16)
  const reviewed = structuredClone(original);

  // Rebuild formatted_json: start with all keys as empty (zero-trust), fill only accepted
  const originalFj = original.formatted_json || {};
  const newFormattedJson = {};

  for (const key of Object.keys(originalFj)) {
    newFormattedJson[key] = '';
  }

  const accepted = inProgressData.accepted_fields || {};
  for (const [field, info] of Object.entries(accepted)) {
    newFormattedJson[field] = info.value;
  }

  reviewed.formatted_json = newFormattedJson;

  // Build source classification
  const fieldsBy = { ai: [], edited: [], user_added: [], confirmed_empty: [] };
  for (const [field, info] of Object.entries(accepted)) {
    if (fieldsBy[info.source]) fieldsBy[info.source].push(field);
  }

  // Build review metadata using shared completion evaluator
  const effectiveSchema = (promptFieldSchema && promptFieldSchema.length > 0)
    ? promptFieldSchema
    : Object.keys(originalFj);
  const effectiveCategories = categories || [];
  const completion = CompletionEvaluator.evaluateCompletion(
    inProgressData, effectiveSchema, effectiveCategories
  );

  reviewed.review_metadata = {
    reviewed_at: new Date().toISOString(),
    reviewed_by: username || '',
    editor_version: editorVersion || '1.0.0',
    complete: completion.isComplete,
    fields_resolved: completion.resolvedFields,
    fields_total: completion.totalFields,
    fields_accepted_from_ai: fieldsBy.ai,
    fields_manually_edited: fieldsBy.edited,
    fields_user_added: fieldsBy.user_added,
    fields_confirmed_empty: fieldsBy.confirmed_empty,
    flagged: inProgressData.flagged || false,
    flag_note: inProgressData.flag_note || '',
    flag_tags: inProgressData.flag_tags || [],
    escalation_tags: inProgressData.escalation_tags || [],
  };

  return reviewed;
}

/**
 * Write a reviewed JSON file to the _REVIEWED/ subfolder.
 * "foo.json" -> "_REVIEWED/foo__REVIEWED.json"
 */
function writeReviewedToFolder(folderPath, filename, reviewedData) {
  ensureReviewedDir(folderPath);
  const reviewedFilename = filename.replace(/\.json$/, `${REVIEWED_SUFFIX}.json`);
  const filePath = path.join(folderPath, REVIEWED_DIR, reviewedFilename);

  assertPathWithinProject(folderPath, filePath);

  atomicWrite(filePath, reviewedData);
  return reviewedFilename;
}

// ── Legacy Write (kept for migration, deprecated) ────────────

/**
 * @deprecated Use writeReviewedToFolder instead.
 * Write the __REVIEWED JSON file to root level (old format).
 */
function writeReviewed(folderPath, filename, reviewedData) {
  const reviewedFilename = filename.replace(/\.json$/, `${REVIEWED_SUFFIX}.json`);
  const filePath = path.join(folderPath, reviewedFilename);
  atomicWrite(filePath, reviewedData);
  return reviewedFilename;
}

// ── Stats ────────────────────────────────────────────────────

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
    inProgress: 0, // Enriched by renderer-side state
    flagged: 0,
    percentage: total > 0 ? Math.round((reviewed / total) * 100) : 0
  };
}

// ── Migration Helpers ────────────────────────────────────────

/**
 * Detect if this folder uses the old format (root-level state + reviewed files).
 */
function detectLegacyFormat(folderPath) {
  const hasOldState = fs.existsSync(path.join(folderPath, STATE_FILENAME));
  const hasInProgressDir = fs.existsSync(path.join(folderPath, INPROGRESS_DIR));

  // Check for root-level __REVIEWED.json files
  let hasRootReviewed = false;
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(`${REVIEWED_SUFFIX}.json`)) {
        hasRootReviewed = true;
        break;
      }
    }
  } catch {}

  return {
    isLegacy: hasOldState || (hasRootReviewed && !hasInProgressDir),
    hasOldState,
    hasRootReviewed,
    hasInProgressDir,
  };
}

/**
 * Move root-level __REVIEWED.json files into _REVIEWED/ subfolder.
 */
function migrateReviewedFiles(folderPath) {
  ensureReviewedDir(folderPath);
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const moved = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(`${REVIEWED_SUFFIX}.json`)) continue;

    const src = path.join(folderPath, entry.name);
    const dest = path.join(folderPath, REVIEWED_DIR, entry.name);
    try {
      fs.renameSync(src, dest);
      moved.push(entry.name);
    } catch (e) {
      console.warn(`Failed to migrate ${entry.name}:`, e.message);
    }
  }

  return moved;
}

module.exports = {
  scanFolder,
  readSpecimen,
  readSpecimenRaw,
  writeReviewed,
  writeReviewedToFolder,
  generateReviewed,
  collectFieldSchema,
  validateSharedFieldSchema,
  getStats,
  detectLegacyFormat,
  migrateReviewedFiles,
  ensureReviewedDir,
  ensureExportDir,
  validatePathWithinProject,
  assertPathWithinProject,
  REVIEWED_SUFFIX,
  REVIEWED_DIR,
  EXPORT_DIR,
  STATE_FILENAME,
};
