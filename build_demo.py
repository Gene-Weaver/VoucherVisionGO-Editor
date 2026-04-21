#!/usr/bin/env python3
"""Build a self-contained demo.html with embedded test data."""

import base64
import json
import mimetypes
import os
import re
import urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
TEST_DIR = os.path.join(BASE, 'demo_data')
OUT_FILE = os.path.join(BASE, 'build', 'demo.html')
ICON_DIR = os.path.join(BASE, 'src', 'renderer', 'icons')
PACKAGE_JSON = os.path.join(BASE, 'package.json')
THEME_DEFAULTS = os.path.join(BASE, 'src', 'shared', 'theme-defaults.js')
RENDERER_DIR = os.path.join(BASE, 'src', 'renderer')
CSS_DIR = os.path.join(RENDERER_DIR, 'css')

# Load specimens
specimens = []
for f in sorted(os.listdir(TEST_DIR)):
    if f.endswith('.json') and not f.startswith('_') and '__REVIEWED' not in f:
        with open(os.path.join(TEST_DIR, f)) as fh:
            data = json.load(fh)
            if 'formatted_json' in data and 'prompt' in data:
                specimens.append({'filename': f, 'data': data})

print(f'Loaded {len(specimens)} specimens')

# Load CSS
with open(os.path.join(BASE, 'src', 'renderer', 'css', 'style.css')) as f:
    css = f.read()

# Load shared theme defaults before app.js, matching src/renderer/index.html
with open(THEME_DEFAULTS) as f:
    theme_defaults_js = f.read()

# Load app.js and history.js
with open(os.path.join(BASE, 'src', 'renderer', 'js', 'app.js')) as f:
    app_js = f.read()

with open(os.path.join(BASE, 'src', 'renderer', 'js', 'history.js')) as f:
    history_js = f.read()

with open(os.path.join(BASE, 'src', 'shared', 'completion.js')) as f:
    completion_js = f.read()

with open(os.path.join(BASE, 'src', 'shared', 'special-characters.js')) as f:
    special_chars_js = f.read()

# Load leaflet
with open(os.path.join(BASE, 'src', 'renderer', 'js', 'lib', 'leaflet.min.js')) as f:
    leaflet_js = f.read()

with open(os.path.join(BASE, 'src', 'renderer', 'js', 'lib', 'leaflet.min.css')) as f:
    leaflet_css = f.read()

import yaml


def read_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def collect_field_schema(items):
    seen = set()
    ordered = []
    for item in items:
        for key in item['data'].get('formatted_json', {}).keys():
            if key not in seen:
                seen.add(key)
                ordered.append(key)
    return ordered


def svg_data_url(path):
    with open(path, encoding='utf-8') as fh:
        svg = fh.read().strip()
    return 'data:image/svg+xml;charset=utf-8,' + urllib.parse.quote(svg, safe='')


def file_data_url(path):
    mime_type, _ = mimetypes.guess_type(path)
    mime_type = mime_type or 'application/octet-stream'
    if path.endswith('.svg'):
        return svg_data_url(path)
    with open(path, 'rb') as fh:
        encoded = base64.b64encode(fh.read()).decode('ascii')
    return f'data:{mime_type};base64,{encoded}'


def inline_icon_refs(text):
    if not os.path.isdir(ICON_DIR):
        return text
    for icon_name in os.listdir(ICON_DIR):
        if not icon_name.endswith('.svg'):
            continue
        data_url = svg_data_url(os.path.join(ICON_DIR, icon_name))
        text = text.replace(f"../icons/{icon_name}", data_url)
        text = text.replace(f"icons/{icon_name}", data_url)
    return text


def resolve_renderer_asset(ref, anchor_dir):
    ref = ref.strip().strip('"\'')
    if not ref or ref.startswith(('data:', 'http:', 'https:', '#')):
        return None
    candidate = os.path.normpath(os.path.join(anchor_dir, ref))
    if os.path.isfile(candidate):
        return candidate

    # Some font references in style.css still point at older nested vendor
    # paths. Fall back to matching by basename so demo packaging remains
    # self-contained even if the source path changed.
    basename = os.path.basename(ref)
    for root, _, files in os.walk(RENDERER_DIR):
        if basename in files:
            return os.path.join(root, basename)

    stem, _ = os.path.splitext(basename)
    if stem:
        for root, _, files in os.walk(RENDERER_DIR):
            for name in files:
                if os.path.splitext(name)[0] == stem:
                    return os.path.join(root, name)
    return None


def inline_css_url_refs(text, anchor_dir):
    def replacer(match):
        raw_ref = match.group(1).strip()
        asset_path = resolve_renderer_asset(raw_ref, anchor_dir)
        if not asset_path:
            return match.group(0)
        data_url = file_data_url(asset_path)
        return f'url("{data_url}")'

    return re.sub(r'url\(([^)]+)\)', replacer, text)

prompt_parsed = None
prompt_raw_text = ''
prompt_name = ''
package_meta = read_json(PACKAGE_JSON)
app_version = package_meta.get('version', '0.0.0')

# Find the prompt name from first specimen
for s in specimens:
    pname = s['data'].get('prompt', '')
    if pname:
        prompt_name = pname
        break

# Search for the prompt file in multiple locations
prompt_search_dirs = [
    os.path.join(TEST_DIR, '_prompts'),
    os.path.join(BASE, 'test_data', '_prompts'),
    os.path.join(BASE, 'test_data_2', '_prompts'),
]

for pdir in prompt_search_dirs:
    ppath = os.path.join(pdir, prompt_name)
    if os.path.isfile(ppath):
        with open(ppath) as f:
            prompt_raw_text = f.read()
        doc = yaml.safe_load(prompt_raw_text)
        prompt_parsed = {
            'promptName': prompt_name,
            'mapping': doc.get('mapping', {}),
            'rules': doc.get('rules', {}),
            'metadata': {
                'prompt_author': doc.get('prompt_author', ''),
                'prompt_author_institution': doc.get('prompt_author_institution', ''),
                'prompt_name': doc.get('prompt_name', prompt_name),
                'prompt_version': doc.get('prompt_version', ''),
                'prompt_description': doc.get('prompt_description', ''),
                'LLM': doc.get('LLM', ''),
            },
            'checklist': doc.get('checklist', []),
            'review_not_required': doc.get('review_not_required', []),
            'field_default_values': doc.get('field_default_values', {}),
            'custom_flags': [],  # Parsed in the browser via parseCustomFlag-equivalent below
            'raw': prompt_raw_text,
        }
        # Mirror prompt-cache.js:parseCustomFlag so demo gets the same { key, pill, label } shape.
        raw_flags = doc.get('custom_flags') or []
        if isinstance(raw_flags, list):
            import re
            for raw in raw_flags:
                if not isinstance(raw, str):
                    continue
                s = raw.strip()
                if not s:
                    continue
                m = re.match(r'^\(([^)]+)\)\s*(.*)$', s)
                if m:
                    pill = m.group(1).strip()
                    if not pill:
                        continue
                    label = m.group(2).strip() or pill
                    prompt_parsed['custom_flags'].append({'key': pill, 'pill': pill, 'label': label})
                else:
                    prompt_parsed['custom_flags'].append({'key': s, 'pill': s, 'label': s})
        print(f'Loaded prompt: {prompt_name} from {pdir}')
        print(f'  Mapping categories: {list(prompt_parsed["mapping"].keys())}')
        break

if not prompt_parsed:
    print(f'WARNING: Could not find prompt {prompt_name}')

field_schema = collect_field_schema(specimens)

css = inline_css_url_refs(css, CSS_DIR)
app_js = inline_icon_refs(app_js)
history_js = inline_icon_refs(history_js)

# Build specimen data JS
specimen_js_data = json.dumps([{
    'filename': s['filename'],
    'data': s['data']
} for s in specimens])

# Build the mock API layer
prompt_js = json.dumps(prompt_parsed) if prompt_parsed else 'null'
field_schema_js = json.dumps(field_schema)
version_js = json.dumps(app_version)

mock_api = f"""
// ── Demo Mock API Layer ─────────────────────────────────
const DEMO_SPECIMENS = {specimen_js_data};
const DEMO_PARSED_PROMPT = {prompt_js};
const DEMO_FIELD_SCHEMA = {field_schema_js};
const DEMO_VERSION = {version_js};
const DEMO_FOLDER = '/demo/specimens';
globalThis.__VVGO_DEMO__ = true;
const cloneDemo = (value) => JSON.parse(JSON.stringify(value));
const DEMO_STATE = {{ version: 1, folder_path: DEMO_FOLDER, current_specimen: '', specimens: {{}} }};
const DEMO_SETTINGS = {{
  acceptAllEnabled: true,
  confirmRecordsEnabled: true,
  editLockWarning: true,
  mapTheme: 'light',
  rowColorOdd: '#2f2f2f',
  rowColorEven: '#242424',
  imageCacheSize: 2000,
  catColors: {{}}
}};
const DEMO_PROJECT = {{
  version: 1,
  folder_path: DEMO_FOLDER,
  last_modified: new Date().toISOString(),
  current_specimen: DEMO_SPECIMENS[0]?.filename || '',
  checklist_checked: [],
  prompt_name: DEMO_PARSED_PROMPT?.promptName || '',
  prompt_field_schema: DEMO_FIELD_SCHEMA,
  save_seq: 0
}};

// Mock window.api
window.api = {{
  selectFolder: async () => DEMO_FOLDER,
  scanFolder: async () => DEMO_SPECIMENS.map(s => ({{
    filename: s.filename,
    hasReviewed: false,
    reviewComplete: false,
    hasInProgress: !!DEMO_STATE.specimens[s.filename],
    prompt: s.data.prompt
  }})),
  readSpecimen: async (folder, filename) => {{
    const spec = DEMO_SPECIMENS.find(s => s.filename === filename);
    if (!spec) return null;
    const result = cloneDemo(spec.data);
    if (result.collage_info) {{
      delete result.collage_info.base64image_text_collage;
      delete result.collage_info.base64image_input_resized;
    }}
    return result;
  }},
  readSpecimenRaw: async (folder, filename) => {{
    const spec = DEMO_SPECIMENS.find(s => s.filename === filename);
    return spec ? cloneDemo(spec.data) : null;
  }},
  getImage: async (folder, filename, type) => {{
    const spec = DEMO_SPECIMENS.find(s => s.filename === filename);
    if (!spec || !spec.data.collage_info) return null;
    const fmt = spec.data.collage_image_format || 'jpeg';
    const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    let b64 = null;
    if (type === 'collage') b64 = spec.data.collage_info.base64image_text_collage;
    else if (type === 'original') b64 = spec.data.collage_info.base64image_input_resized;
    return b64 ? 'data:' + mime + ';base64,' + b64 : null;
  }},
  warmImageCache: async () => true,
  fetchPrompt: async () => cloneDemo(DEMO_PARSED_PROMPT || {{ mapping: {{}}, rules: {{}}, metadata: {{}}, checklist: [], review_not_required: [], raw: '' }}),
  writeReviewed: async (folder, filename, data) => filename.replace('.json', '__REVIEWED.json'),
  getStats: async () => ({{ total: DEMO_SPECIMENS.length, reviewed: 0 }}),
  collectFieldSchema: async () => cloneDemo(DEMO_FIELD_SCHEMA),
  validateFieldSchema: async () => ({{
    valid: true,
    referenceSpecimen: DEMO_SPECIMENS[0]?.filename || '',
    violations: []
  }}),
  detectLegacyFormat: async () => ({{
    isLegacy: false,
    hasOldState: false,
    hasRootReviewed: false,
    hasInProgressDir: true
  }}),
  writeInProgress: async (folder, filename, data) => {{
    DEMO_STATE.specimens[filename] = cloneDemo(data);
    DEMO_STATE.current_specimen = filename;
    DEMO_PROJECT.current_specimen = filename;
    DEMO_PROJECT.last_modified = new Date().toISOString();
    return true;
  }},
  readInProgress: async (folder, filename) => cloneDemo(DEMO_STATE.specimens[filename] || null),
  readAllInProgress: async () => cloneDemo(DEMO_STATE.specimens),
  loadProject: async () => cloneDemo(DEMO_PROJECT),
  saveProject: async (folder, projectState) => {{
    Object.assign(DEMO_PROJECT, cloneDemo(projectState || {{}}));
    DEMO_PROJECT.last_modified = new Date().toISOString();
    return true;
  }},
  acquireLock: async () => ({{ success: true }}),
  forceAcquireLock: async () => ({{ success: true }}),
  releaseLock: async () => true,
  generateAndWriteReviewed: async (folder, filename, inProgressData) => ({{
    filename: filename.replace('.json', '__REVIEWED.json'),
    data: cloneDemo(inProgressData || {{}})
  }}),
  migrateReviewedFiles: async () => true,
  flushSaves: () => ({{ success: true }}),
  loadState: async () => cloneDemo(DEMO_STATE),
  saveState: async (folder, state) => {{ Object.assign(DEMO_STATE, cloneDemo(state || {{}})); return true; }},
  loadSettings: async () => cloneDemo(DEMO_SETTINGS),
  saveSettings: async (folder, settings) => {{ Object.assign(DEMO_SETTINGS, cloneDemo(settings || {{}})); return true; }},
  selectSavePath: async () => null,
  exportXlsx: async () => true,
  ensureExportDir: async () => '/demo/export',
  writeFile: async () => true,
  loadHistory: async () => null,
  saveHistory: async () => true,
  getUpdateInfo: async () => ({{ currentVersion: DEMO_VERSION, installDate: null, lastUpdateCheck: null, isPortable: false, platform: 'demo' }}),
  checkForUpdate: async () => ({{ status: 'up-to-date' }}),
  downloadUpdate: async () => {{}},
  installUpdate: async () => {{}},
  resetProject: async () => true,
  onUpdateStatus: null,
}};
"""

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VoucherVisionGO Editor — Demo</title>
  <style>{leaflet_css}</style>
  <style>{css}</style>
  <style>
    /* Demo banner */
    html, body {{ height: 100%; overflow: hidden; }}
    body {{ display: flex; flex-direction: column; }}
    .demo-banner {{
      background: linear-gradient(90deg, #2d7a2d, #1a4a1a);
      color: #fff;
      text-align: center;
      padding: 4px 16px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }}
    .demo-banner a {{ color: #7fbfff; }}
    #app {{ flex: 1; height: 0; }}
  </style>
</head>
<body>
  <div class="demo-banner">
    DEMO MODE — Changes are not saved. Some tools are disabled/non-functional in this preview. <a href="https://github.com/Gene-Weaver/VoucherVisionGO-Editor/releases" target="_blank">Download the full app</a> to review your own data.
  </div>
  <div id="app">
    <header id="nav-bar"></header>
    <main id="main-content">
      <div id="folder-picker-view" class="view active"></div>
      <div id="review-view" class="view"></div>
      <div id="table-view" class="view"></div>
      <div id="focus-view" class="view"></div>
    </main>
  </div>
  <script>{leaflet_js}</script>
  <script>{mock_api}</script>
  <script>{theme_defaults_js}</script>
  <script>{completion_js}</script>
  <script>{special_chars_js}</script>
  <script>{history_js}</script>
  <script>{app_js}</script>
  <script>
    // Auto-load demo data after entering name
    const origRenderFolderPicker = renderFolderPicker;
    renderFolderPicker = function() {{
      const el = document.getElementById('folder-picker-view');
      // Tear down any previous stripe-gravity loop before replacing the DOM.
      if (typeof _pickerStripeCleanup !== 'undefined') {{
        _pickerStripeCleanup?.();
      }}
      // Mirror the live app's splash stripes so the curtain loader, wiggle,
      // and cursor gravity all work in the demo.
      const stripesHtml = `<div class="picker-stripes" aria-hidden="true">${{
        Array.from({{ length: 37 }}, (_, i) => {{
          const offset = Math.abs(i - 18);
          const dir = i < 18 ? -1 : i > 18 ? 1 : 0;
          return `<span class="picker-stripe" style="--i:${{i}};--offset:${{offset}};--dir:${{dir}}"></span>`;
        }}).join('')
      }}</div>`;
      el.innerHTML = `
        ${{stripesHtml}}
        <div class="picker-logo">VoucherVisionGO Editor</div>
        <div class="picker-subtitle" style="text-align:left">
          <div style="margin-bottom:6px">&mdash; This is a live demo with herbarium specimens designed to showcase the Editor's utility.</div>
          <div style="margin-bottom:6px">&mdash; For full functionality with your transcriptions, please <a href="https://github.com/Gene-Weaver/VoucherVisionGO-Editor/releases" target="_blank" style="color:var(--accent)">download the app</a>.</div>
          <div style="margin-bottom:6px">&mdash; The <strong>Table</strong> and <strong>Focus</strong> modes can be used to batch edit fields and is often faster than the <strong>Form</strong> mode.</div>
          <div style="margin-bottom:6px">&mdash; Enter a <em>fictitious</em> username and click Start to explore the review workflow.</div>
          <div>&mdash; Refresh the page to reset the demo.</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:8px">
          <label style="font-size:var(--fs-12);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Reviewer Name</label>
          <input type="text" id="picker-username" placeholder="Enter your name" style="width:280px;text-align:center;font-size:var(--fs-14)" value="">
        </div>
        <button class="btn-primary picker-btn" id="picker-open-btn">Start Demo</button>
        <div id="picker-error" style="color:var(--error);font-size:var(--fs-12);margin-top:8px;display:none"></div>
      `;
      if (typeof setupPickerStripeGravity === 'function') {{
        _pickerStripeCleanup = setupPickerStripeGravity(el);
      }}
      document.getElementById('picker-open-btn').addEventListener('click', async () => {{
        const nameInput = document.getElementById('picker-username');
        const name = nameInput.value.trim();
        if (!name) {{
          const errEl = document.getElementById('picker-error');
          errEl.textContent = 'Please enter your name.';
          errEl.style.display = '';
          nameInput.style.borderColor = 'var(--error)';
          nameInput.focus();
          return;
        }}
        APP.username = name;
        await loadFolder('/demo/specimens');
      }});
      document.getElementById('picker-username').addEventListener('keydown', (e) => {{
        if (e.key === 'Enter') document.getElementById('picker-open-btn').click();
      }});
    }};
  </script>
</body>
</html>"""

os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
with open(OUT_FILE, 'w', encoding='utf-8') as f:
    f.write(html)

size_mb = os.path.getsize(OUT_FILE) / 1024 / 1024
print(f'Built {OUT_FILE} ({size_mb:.1f} MB)')
