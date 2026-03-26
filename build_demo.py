#!/usr/bin/env python3
"""Build a self-contained demo.html with embedded test data."""

import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
TEST_DIR = os.path.join(BASE, 'demo_data')
OUT_FILE = os.path.join(BASE, 'build', 'demo.html')

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

# Load app.js
with open(os.path.join(BASE, 'src', 'renderer', 'js', 'app.js')) as f:
    app_js = f.read()

# Load leaflet
with open(os.path.join(BASE, 'src', 'renderer', 'js', 'lib', 'leaflet.min.js')) as f:
    leaflet_js = f.read()

with open(os.path.join(BASE, 'src', 'renderer', 'js', 'lib', 'leaflet.min.css')) as f:
    leaflet_css = f.read()

# Load and parse prompt with proper YAML parser
import yaml

prompt_parsed = None
prompt_raw_text = ''
prompt_name = ''

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
            'raw': prompt_raw_text,
        }
        print(f'Loaded prompt: {prompt_name} from {pdir}')
        print(f'  Mapping categories: {list(prompt_parsed["mapping"].keys())}')
        break

if not prompt_parsed:
    print(f'WARNING: Could not find prompt {prompt_name}')

# Build specimen data JS
specimen_js_data = json.dumps([{
    'filename': s['filename'],
    'data': s['data']
} for s in specimens])

# Build the mock API layer
prompt_js = json.dumps(prompt_parsed) if prompt_parsed else 'null'

mock_api = f"""
// ── Demo Mock API Layer ─────────────────────────────────
const DEMO_SPECIMENS = {specimen_js_data};
const DEMO_PARSED_PROMPT = {prompt_js};
const DEMO_STATE = {{ version: 1, specimens: {{}} }};

// Mock window.api
window.api = {{
  selectFolder: async () => '/demo/specimens',
  scanFolder: async () => DEMO_SPECIMENS.map(s => ({{
    filename: s.filename,
    hasReviewed: false,
    reviewComplete: false,
    prompt: s.data.prompt
  }})),
  readSpecimen: async (folder, filename) => {{
    const spec = DEMO_SPECIMENS.find(s => s.filename === filename);
    if (!spec) return null;
    const result = JSON.parse(JSON.stringify(spec.data));
    if (result.collage_info) {{
      delete result.collage_info.base64image_text_collage;
      delete result.collage_info.base64image_input_resized;
    }}
    return result;
  }},
  readSpecimenRaw: async (folder, filename) => {{
    const spec = DEMO_SPECIMENS.find(s => s.filename === filename);
    return spec ? JSON.parse(JSON.stringify(spec.data)) : null;
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
  loadState: async () => DEMO_STATE,
  saveState: async (folder, state) => {{ Object.assign(DEMO_STATE, state); return true; }},
  loadSettings: async () => ({{ acceptAllEnabled: true, mapTheme: 'dark', rowColorOdd: '#2f2f2f', rowColorEven: '#242424', catColors: {{}} }}),
  saveSettings: async () => true,
  fetchPrompt: async () => DEMO_PARSED_PROMPT,
  writeReviewed: async (folder, filename, data) => filename.replace('.json', '__REVIEWED.json'),
  getStats: async () => ({{ total: DEMO_SPECIMENS.length, reviewed: 0 }}),
  selectSavePath: async () => null,
  exportXlsx: async () => true,
  writeFile: async () => true,
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
    DEMO MODE — Changes are not saved. <a href="https://github.com/Gene-Weaver/VoucherVisionGO-Editor/releases" target="_blank">Download the full app</a> to review your own data.
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
  <script>{app_js}</script>
  <script>
    // Auto-load demo data after entering name
    const origRenderFolderPicker = renderFolderPicker;
    renderFolderPicker = function() {{
      const el = document.getElementById('folder-picker-view');
      el.innerHTML = `
        <div class="picker-logo">VoucherVisionGO Editor</div>
        <div class="picker-subtitle" style="text-align:left">
          <div style="margin-bottom:6px">&mdash; This is a live demo with herbarium specimens designed to showcase the Editor's utility.</div>
          <div style="margin-bottom:6px">&mdash; For full functionality with your transcriptions, please <a href="https://github.com/Gene-Weaver/VoucherVisionGO-Editor/releases" target="_blank" style="color:var(--accent)">download the app</a>.</div>
          <div style="margin-bottom:6px">&mdash; The <strong>Table</strong> and <strong>Focus</strong> modes can be used to batch edit fields and is often faster than the <strong>Form</strong> mode.</div>
          <div style="margin-bottom:6px">&mdash; Enter a <em>fictitious</em> username and click Start to explore the review workflow.</div>
          <div>&mdash; Refresh the page to reset the demo.</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:8px">
          <label style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Reviewer Name</label>
          <input type="text" id="picker-username" placeholder="Enter your name" style="width:280px;text-align:center;font-size:14px" value="">
        </div>
        <button class="btn-primary picker-btn" id="picker-open-btn">Start Demo</button>
        <div id="picker-error" style="color:var(--error);font-size:12px;margin-top:8px;display:none"></div>
      `;
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
with open(OUT_FILE, 'w') as f:
    f.write(html)

size_mb = os.path.getsize(OUT_FILE) / 1024 / 1024
print(f'Built {OUT_FILE} ({size_mb:.1f} MB)')
