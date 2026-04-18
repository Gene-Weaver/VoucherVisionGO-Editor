const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Gene-Weaver/VoucherVision/main/custom_prompts/';

// In-memory cache
const memoryCache = {};

/**
 * Fetch a prompt YAML by name. Checks:
 * 1. In-memory cache
 * 2. Local file in working folder (_prompts/ subfolder)
 * 3. GitHub raw URL
 *
 * Returns parsed prompt object with mapping, rules, and metadata.
 */
async function fetchPrompt(promptName, folderPath) {
  // 1. Check memory cache
  if (memoryCache[promptName]) {
    return memoryCache[promptName];
  }

  // 2. Check local cache in working folder
  const promptsDir = path.join(folderPath, '_prompts');
  const localPath = path.join(promptsDir, promptName);

  try {
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, 'utf-8');
      const parsed = parsePromptYaml(raw, promptName);
      memoryCache[promptName] = parsed;
      return parsed;
    }
  } catch {
    // Fall through to GitHub fetch
  }

  // 3. Fetch from GitHub
  try {
    const raw = await fetchFromGitHub(promptName);
    const parsed = parsePromptYaml(raw, promptName);

    // Save local copy
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    fs.writeFileSync(localPath, raw, 'utf-8');

    memoryCache[promptName] = parsed;
    return parsed;
  } catch (err) {
    // Return a fallback with no mapping (fields will go to MISC tab)
    return {
      promptName,
      error: `Failed to fetch prompt: ${err.message}`,
      mapping: {},
      rules: {},
      metadata: {},
      review_not_required: [],
      checklist: [],
    };
  }
}

async function fetchFromGitHub(promptName) {
  const url = GITHUB_RAW_BASE + promptName;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function parsePromptYaml(rawYaml, promptName) {
  const doc = yaml.load(rawYaml);

  return {
    promptName,
    mapping: doc.mapping || {},
    rules: doc.rules || {},
    metadata: {
      prompt_author: doc.prompt_author || '',
      prompt_author_institution: doc.prompt_author_institution || '',
      prompt_name: doc.prompt_name || promptName,
      prompt_version: doc.prompt_version || '',
      prompt_description: doc.prompt_description || '',
      LLM: doc.LLM || ''
    },
    instructions: doc.instructions || '',
    checklist: doc.checklist || [],
    review_not_required: doc.review_not_required || [],
    field_default_values: doc.field_default_values || {},
    raw: rawYaml
  };
}

module.exports = { fetchPrompt };
