// ── VoucherVisionGO Editor — Main Application ──────────────

// ── State ───────────────────────────────────────────────────

const APP = {
  folderPath: null,
  specimens: [],          // [{filename, hasReviewed, prompt}]
  currentIndex: 0,
  currentSpecimen: null,  // Full specimen JSON (minus base64)
  currentPrompt: null,    // Parsed prompt object
  state: null,            // Persisted state from _vvgo_editor_state.json
  activeCategory: null,
  imageType: 'collage',
  currentView: 'folder-picker', // 'folder-picker', 'review', 'table'
  saveTimeout: null,
  ocrCollapsed: false,
  promptCollapsed: true,
  mapCollapsed: false,
  mapTheme: 'dark',
  wfoCollapsed: false,
  elevationCollapsed: false,
  username: '',
  settings: {
    acceptAllEnabled: false, mapTheme: 'dark',
    rowColorOdd: '#2f2f2f', rowColorEven: '#242424',
    catColors: { cat0: '#479EF5', cat1: '#CA50F7', cat2: '#48CA48', cat3: '#A0A220', cat4: '#FF5C5C', cat5: '#7fffff', cat6: '#ffff7f', catMisc: '#888888' },
  },

  // Category color assignments
  categoryColors: ['var(--cat-0)', 'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'],
  updateStatus: null,
};

// ── Constants ───────────────────────────────────────────────

const CATEGORY_COLORS = {
  GEOGRAPHY: 'var(--cat-0)',
  TAXONOMY: 'var(--cat-1)',
  COLLECTING: 'var(--cat-2)',
  LOCALITY: 'var(--cat-3)',
  MISC: 'var(--cat-misc)',
};

// ── Initialization ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderNavBar();
  renderFolderPicker();

  // Listen for update status events from main process
  if (window.api.onUpdateStatus) {
    window.api.onUpdateStatus((data) => {
      APP.updateStatus = data;
      updateSettingsUpdateUI(data);
      if (data.status === 'available' || data.status === 'available-manual') {
        showUpdateNotification(data);
      }
    });
  }
});

// ── View Switching ──────────────────────────────────────────

function showView(viewName) {
  APP.currentView = viewName;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewMap = { 'folder-picker': 'folder-picker', 'review': 'review', 'table': 'table', 'focus': 'focus' };
  const el = document.getElementById(`${viewMap[viewName] || viewName}-view`);
  if (el) el.classList.add('active');
  updateNavBar();
}

// ── Nav Bar ─────────────────────────────────────────────────

function renderNavBar() {
  const el = document.getElementById('nav-bar');
  el.innerHTML = `
    <div class="nav-logo">VoucherVisionGO Editor</div>
    <div class="nav-folder">
      <span class="nav-folder-path" id="nav-folder-path"></span>
      <button class="btn-sm" id="nav-change-folder" style="display:none">Change</button>
    </div>
    <div class="nav-stats" id="nav-stats"></div>
    <div class="nav-view-toggle" id="nav-view-toggle"></div>
  `;

  document.getElementById('nav-change-folder').addEventListener('click', openFolderDialog);
}

function updateNavBar() {
  const pathEl = document.getElementById('nav-folder-path');
  const changeBtnEl = document.getElementById('nav-change-folder');
  const statsEl = document.getElementById('nav-stats');
  const toggleEl = document.getElementById('nav-view-toggle');

  if (APP.folderPath) {
    pathEl.textContent = APP.folderPath;
    changeBtnEl.style.display = '';

    // Stats
    const stats = getStatsFromState();
    statsEl.innerHTML = `
      <div class="progress-bar-container">
        <span class="progress-text">${stats.reviewed}/${stats.total} Reviewed</span>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: ${stats.percentage}%"></div>
        </div>
        <span class="progress-text">${stats.percentage}%</span>
      </div>
      <span class="text-muted" style="font-size:11px">${stats.inProgress} in progress</span>
      ${stats.flagged > 0 ? `<span class="text-error" style="font-size:11px">${stats.flagged} flagged</span>` : ''}
    `;

    // Export button only in top nav
    toggleEl.innerHTML = `
      <button class="btn-sm btn-success" id="btn-export">Export Project</button>
      <button class="btn-sm btn-icon settings-icon-btn" id="btn-settings" title="Settings">&#9881;</button>
    `;
    document.getElementById('btn-export').addEventListener('click', exportProject);
    document.getElementById('btn-settings').addEventListener('click', openSettingsPopup);
  } else {
    pathEl.textContent = '';
    changeBtnEl.style.display = 'none';
    statsEl.innerHTML = '';
    toggleEl.innerHTML = '';
  }
}

// ── Stats ───────────────────────────────────────────────────

function getStatsFromState() {
  const total = APP.specimens.length;
  const reviewed = APP.specimens.filter(s => s.reviewComplete).length;
  let inProgress = 0;
  let flagged = 0;

  if (APP.state && APP.state.specimens) {
    for (const spec of APP.specimens) {
      const st = APP.state.specimens[spec.filename];
      if (st) {
        if (st.status === 'in_progress') inProgress++;
        if (st.flagged) flagged++;
      }
    }
  }

  return {
    total,
    reviewed,
    inProgress,
    flagged,
    percentage: total > 0 ? Math.round((reviewed / total) * 100) : 0
  };
}

// ── Folder Picker ───────────────────────────────────────────

function renderFolderPicker() {
  const el = document.getElementById('folder-picker-view');
  el.innerHTML = `
    <div class="picker-logo">VoucherVisionGO Editor</div>
    <div class="picker-subtitle" style="text-align:left">
      <div style="margin-bottom:6px">&mdash; Select a folder containing VoucherVisionGO JSON output files to begin reviewing specimens.</div>
      <div style="margin-bottom:6px">&mdash; Each field must be individually accepted before it is included in the final reviewed record.</div>
      <div>&mdash; The <strong>Table</strong> and <strong>Focus</strong> modes can be used to batch edit fields and is often faster than the <strong>Form</strong> mode.</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:8px">
      <label style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Reviewer Name</label>
      <input type="text" id="picker-username" placeholder="Enter your name" style="width:280px;text-align:center;font-size:14px" value="${escapeAttr(APP.username)}">
    </div>
    <button class="btn-primary picker-btn" id="picker-open-btn">Open Folder</button>
    <div id="picker-error" style="color:var(--error);font-size:12px;margin-top:8px;display:none"></div>
  `;
  document.getElementById('picker-open-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('picker-username');
    const name = nameInput.value.trim();
    if (!name) {
      const errEl = document.getElementById('picker-error');
      errEl.textContent = 'Please enter your name before proceeding.';
      errEl.style.display = '';
      nameInput.style.borderColor = 'var(--error)';
      nameInput.focus();
      return;
    }
    APP.username = name;
    openFolderDialog();
  });
  document.getElementById('picker-username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('picker-open-btn').click();
  });
}

async function openFolderDialog() {
  const folderPath = await window.api.selectFolder();
  if (!folderPath) return;
  await loadFolder(folderPath);
}

async function loadFolder(folderPath) {
  APP.folderPath = folderPath;

  // Scan for JSON files
  APP.specimens = await window.api.scanFolder(folderPath);
  rebuildSpecimenIndexMap();

  if (APP.specimens.length === 0) {
    alert('No VoucherVisionGO JSON files found in this folder.');
    return;
  }

  // Load settings
  APP.settings = await window.api.loadSettings(folderPath);
  APP.mapTheme = APP.settings.mapTheme || 'dark';
  applyThemeColors();
  document.body.classList.add('compact-view');

  // Load persisted state
  APP.state = await window.api.loadState(folderPath);
  if (!APP.state) {
    APP.state = {
      version: 1,
      folder_path: folderPath,
      last_modified: new Date().toISOString(),
      current_specimen: APP.specimens[0].filename,
      specimens: {}
    };
  }

  // Restore current specimen index
  if (APP.state.current_specimen) {
    const idx = APP.specimens.findIndex(s => s.filename === APP.state.current_specimen);
    if (idx >= 0) APP.currentIndex = idx;
  }

  showView('review');
  await loadSpecimen(APP.currentIndex);
}

// ── Specimen Loading ────────────────────────────────────────

async function loadSpecimen(index) {
  if (index < 0 || index >= APP.specimens.length) return;
  APP.currentIndex = index;

  const spec = APP.specimens[index];
  APP.currentSpecimen = await window.api.readSpecimen(APP.folderPath, spec.filename);

  // Fetch prompt
  if (APP.currentSpecimen.prompt) {
    APP.currentPrompt = await window.api.fetchPrompt(APP.currentSpecimen.prompt, APP.folderPath);
  } else {
    APP.currentPrompt = { mapping: {}, rules: {}, metadata: {} };
  }

  // Initialize specimen state if not exists
  if (!APP.state.specimens[spec.filename]) {
    initSpecimenState(spec.filename);
  }

  // Update current specimen in state
  APP.state.current_specimen = spec.filename;

  // Set active category
  const categories = getCategories();
  if (categories.length > 0) {
    APP.activeCategory = categories[0].name;
  }

  renderReviewView();
  updateNavBar();
  scheduleSaveState();
}

function initSpecimenState(filename) {
  APP.state.specimens[filename] = {
    status: 'in_progress',
    accepted_fields: {},
    categories_confirmed: [],
    flagged: false,
    flag_note: '',
    last_touched: new Date().toISOString()
  };
}

// ── Categories ──────────────────────────────────────────────

function getCategories() {
  if (!APP.currentSpecimen || !APP.currentPrompt) return [];

  const formattedJson = APP.currentSpecimen.formatted_json || {};
  const mapping = APP.currentPrompt.mapping || {};
  const allFields = Object.keys(formattedJson);
  const assignedFields = new Set();
  const categories = [];
  let colorIdx = 0;

  // Build categories from mapping
  for (const [catName, fields] of Object.entries(mapping)) {
    const catFields = fields.filter(f => allFields.includes(f));
    catFields.forEach(f => assignedFields.add(f));
    if (catFields.length > 0) {
      const color = CATEGORY_COLORS[catName] || APP.categoryColors[colorIdx % APP.categoryColors.length];
      categories.push({ name: catName, fields: catFields, color });
      colorIdx++;
    }
  }

  // MISC category for unassigned fields
  const miscFields = allFields.filter(f => !assignedFields.has(f));
  if (miscFields.length > 0) {
    categories.push({ name: 'MISC', fields: miscFields, color: 'var(--cat-misc)' });
  }

  return categories;
}

// ── Review View Rendering ───────────────────────────────────

function renderReviewView() {
  const el = document.getElementById('review-view');
  if (!APP.currentSpecimen) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">No specimen loaded</div>';
    return;
  }

  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename] || {};

  el.innerHTML = `
    <div class="review-nav">
      <div class="nav-view-toggle" id="nav-view-toggle-inline"></div>
      <button class="btn-sm btn-icon" id="btn-prev" ${APP.currentIndex === 0 ? 'disabled' : ''}>&#9664;</button>
      <span class="review-nav-label">Specimen ${APP.currentIndex + 1} of ${APP.specimens.length}</span>
      <button class="btn-sm btn-icon" id="btn-next" ${APP.currentIndex === APP.specimens.length - 1 ? 'disabled' : ''}>&#9654;</button>
      <span class="review-nav-filename">${spec.filename}</span>
      <span id="review-status-badge">${spec.reviewComplete ? '<span class="status-badge reviewed">Complete</span>' : spec.hasReviewed ? '<span class="status-badge in-progress">In Progress</span>' : ''}</span>
      <button class="btn-sm flag-btn ${specState.flagged ? 'flagged' : ''}" id="btn-flag" title="Flag this specimen">${specState.flagged ? '&#9873; Flagged' : '&#9872; Flag'}</button>
      <div class="review-nav-jump ml-auto">
        <span class="text-muted" style="font-size:11px">Jump to:</span>
        <input type="number" min="1" max="${APP.specimens.length}" value="${APP.currentIndex + 1}" id="input-jump" style="width:60px">
        <button class="btn-sm" id="btn-jump">Go</button>
      </div>
      <div id="bounce-bar" style="display:inline-flex"></div>
    </div>
    <div class="review-body resizable-container" id="review-resizable">
      <div class="panel-left" id="review-panel-left">
        <div class="category-tabs" id="category-tabs"></div>
        <div class="category-form" id="category-form"></div>
        <div class="category-form-footer" id="category-form-footer"></div>
      </div>
      <div class="resize-handle" id="review-resize-handle"></div>
      <div class="panel-right" id="panel-left"></div>
    </div>
  `;

  // Wire nav events
  document.getElementById('btn-prev').addEventListener('click', () => loadSpecimen(APP.currentIndex - 1));
  document.getElementById('btn-next').addEventListener('click', () => loadSpecimen(APP.currentIndex + 1));
  document.getElementById('btn-jump').addEventListener('click', () => {
    const val = parseInt(document.getElementById('input-jump').value);
    if (val >= 1 && val <= APP.specimens.length) loadSpecimen(val - 1);
  });
  document.getElementById('input-jump').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-jump').click();
  });
  document.getElementById('btn-flag').addEventListener('click', toggleFlag);

  // Render inline view toggle
  renderInlineViewToggle();

  // Render panels
  renderLeftPanel();
  renderBounceBar();
  renderCategoryTabs();
  renderCategoryForm();
  renderCategoryFooter();

  // Setup resizable panels (form: min 25%, max 75%)
  initResizeHandle('review-resize-handle', 'review-panel-left', 'review-resizable', 0.25, 0.75);
}

// ── Inline View Toggle ──────────────────────────────────────

function renderInlineViewToggle() {
  const el = document.getElementById('nav-view-toggle-inline');
  if (!el) return;

  const sw = createSlideSwitch('view-switch', [
    { value: 'review', label: 'Form' },
    { value: 'table', label: 'Table' },
    { value: 'focus', label: 'Focus' }
  ], APP.currentView, (val) => {
    if (val === 'review') { showView('review'); renderReviewView(); }
    else if (val === 'table') { showView('table'); renderTableView(); }
    else { showView('focus'); renderFocusView(); }
  });
  el.innerHTML = sw.html;
  sw.setup();
}

// ── Left Panel ──────────────────────────────────────────────

async function renderLeftPanel() {
  const el = document.getElementById('panel-left');
  if (!el) return;

  el.innerHTML = `
    <div class="panel-right-image" id="panel-right-image">
      <div class="image-viewer" id="image-viewer">
        <div class="image-viewer-header">
          <span>Image</span>
          <div id="image-type-switch-container"></div>
        </div>
        <div class="image-container" id="image-container">
          <div class="image-placeholder">Loading image...</div>
        </div>
      </div>
    </div>
    <div class="resize-handle-v" id="image-resize-handle-v"></div>
    <div class="panel-right-info">
      <div id="map-viewer-container"></div>
      <div class="ocr-wfo-row" id="ocr-wfo-row">
        <div class="ocr-wfo-pane" id="ocr-panel-container"></div>
        <div class="resize-handle" id="ocr-wfo-resize-handle"></div>
        <div class="ocr-wfo-pane" id="wfo-panel-container"></div>
      </div>
      <div id="prompt-panel-container"></div>
    </div>
  `;

  // Image toggle (slide switch)
  const imgSw = createSlideSwitch('image-type-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], APP.imageType, (val) => {
    APP.imageType = val;
    loadImage();
  });
  document.getElementById('image-type-switch-container').innerHTML = imgSw.html;
  imgSw.setup();

  loadImage();
  renderMap();
  renderOcrPanel();
  renderWfoPanel();
  renderPromptPanel();

  // Vertical resize for image panel
  initResizeHandleV('image-resize-handle-v', 'panel-right-image', 'panel-left', 0.25, 0.75);

  // Horizontal resize between OCR and WFO
  initResizeHandle('ocr-wfo-resize-handle', 'ocr-panel-container', 'ocr-wfo-row', 0.25, 0.75);
}

function makeCollapsiblePanel(containerId, title, contentHtml, collapsedKey, extraHeaderHtml = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isCollapsed = APP[collapsedKey];

  container.innerHTML = `
    <div class="collapsible-panel">
      <div class="collapsible-header" data-key="${collapsedKey}">
        <span>${title}</span>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          ${extraHeaderHtml}
          <span class="collapse-arrow">${isCollapsed ? '&#9654;' : '&#9660;'}</span>
        </div>
      </div>
      <div class="collapsible-body ${isCollapsed ? 'collapsed' : ''}" id="${containerId}-body">
        ${contentHtml}
      </div>
    </div>
  `;

  container.querySelector('.collapsible-header').addEventListener('click', () => {
    APP[collapsedKey] = !APP[collapsedKey];
    container.querySelector('.collapsible-body').classList.toggle('collapsed');
    container.querySelector('.collapse-arrow').innerHTML = APP[collapsedKey] ? '&#9654;' : '&#9660;';
  });
}

async function loadImage() {
  const container = document.getElementById('image-container');
  if (!container) return;

  const spec = APP.specimens[APP.currentIndex];
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, APP.imageType);

  if (dataUrl) {
    container.innerHTML = `<img src="${dataUrl}" alt="Specimen image" id="specimen-image">`;
    document.getElementById('specimen-image').addEventListener('click', () => openImageModal(dataUrl));
  } else {
    container.innerHTML = `<div class="image-placeholder">${APP.imageType === 'original' ? 'Original image not available yet' : 'No image available'}</div>`;
  }
}

function openImageModal(dataUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.innerHTML = `<img src="${dataUrl}" alt="Specimen image zoomed">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

// ── Map ─────────────────────────────────────────────────────

let mapInstance = null;

const MAP_TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OSM',
    options: { maxZoom: 19, subdomains: 'abcd' }
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OSM',
    options: { maxZoom: 19, subdomains: 'abcd' }
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    options: { maxZoom: 18 }
  },
  topo: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    options: { maxZoom: 18 }
  }
};

let currentTileLayer = null;

function renderMap() {
  const container = document.getElementById('map-viewer-container');
  if (!container) return;

  const fj = APP.currentSpecimen.formatted_json || {};
  const lat = parseFloat(fj.decimalLatitude);
  const lng = parseFloat(fj.decimalLongitude);

  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    container.innerHTML = '';
    return;
  }

  const mapSwitch = createSlideSwitch('map-theme-switch', [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'satellite', label: 'Sat' },
    { value: 'topo', label: 'Topo' }
  ], APP.mapTheme, (val) => {
    APP.mapTheme = val;
    switchMapTiles();
  });

  const extraHeaderHtml = `
    <span style="font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
    ${mapSwitch.html}
  `;

  // Find elevation value from formatted_json fields
  const fj2 = APP.currentSpecimen.formatted_json || {};
  let elevMeters = '';
  for (const [key, val] of Object.entries(fj2)) {
    if (/elevation|altitude/i.test(key) && val !== '' && val !== undefined) {
      const num = parseFloat(String(val));
      if (!isNaN(num)) { elevMeters = num; break; }
    }
  }
  // Also check COP90
  if (elevMeters === '' && APP.currentSpecimen.COP90_elevation_m !== undefined && APP.currentSpecimen.COP90_elevation_m !== '' && APP.currentSpecimen.COP90_elevation_m !== 'None') {
    const cop = parseFloat(APP.currentSpecimen.COP90_elevation_m);
    if (!isNaN(cop)) elevMeters = cop;
  }
  const elevFeet = elevMeters !== '' ? (elevMeters * 3.28084).toFixed(1) : '';

  makeCollapsiblePanel('map-viewer-container', 'Map',
    `<div class="map-elev-row">
      <div class="map-container" id="map-container"></div>
      <div class="elev-calculator">
        <div class="elev-calc-section">
          <div class="elev-calc-title">Elevation Calculator</div>
          <div class="elev-calc-fields">
            <div class="elev-calc-field">
              <label>Meters</label>
              <div class="elev-calc-input" contenteditable="true" id="elev-meters">${elevMeters !== '' ? elevMeters : ''}</div>
              <button class="elev-copy-btn elev-copyable" data-target="elev-meters">copy</button>
            </div>
            <div class="elev-calc-arrow">&#8596;</div>
            <div class="elev-calc-field">
              <label>Feet</label>
              <div class="elev-calc-input" contenteditable="true" id="elev-feet">${elevFeet}</div>
              <button class="elev-copy-btn elev-copyable" data-target="elev-feet">copy</button>
            </div>
          </div>
        </div>
        <div class="elev-toast" id="elev-toast">Copied to clipboard</div>
        ${APP.currentSpecimen.COP90_elevation_m !== undefined && APP.currentSpecimen.COP90_elevation_m !== '' && APP.currentSpecimen.COP90_elevation_m !== 'None'
          ? `<div class="elev-cop90-section">
              <div class="elev-calc-title">COP90 at GPS Location</div>
              <div class="elev-cop90-values">
                <div class="elev-cop90-item">
                  <span id="cop90-meters">${APP.currentSpecimen.COP90_elevation_m} m</span>
                  <button class="elev-copy-btn elev-copyable" data-target="cop90-meters">copy</button>
                </div>
                <span class="elev-cop90-sep">|</span>
                <div class="elev-cop90-item">
                  <span id="cop90-feet">${(parseFloat(APP.currentSpecimen.COP90_elevation_m) * 3.28084).toFixed(1)} ft</span>
                  <button class="elev-copy-btn elev-copyable" data-target="cop90-feet">copy</button>
                </div>
              </div>
            </div>`
          : ''}
      </div>
    </div>`,
    'mapCollapsed', extraHeaderHtml);

  // Setup slide switch (after DOM insertion)
  mapSwitch.setup();

  if (APP.mapCollapsed) return;

  initMap(lat, lng);

  // Elevation calculator bidirectional conversion
  const metersEl = document.getElementById('elev-meters');
  const feetEl = document.getElementById('elev-feet');
  if (metersEl && feetEl) {
    metersEl.addEventListener('input', () => {
      const m = parseFloat(metersEl.textContent.replace(/[^\d.\-]/g, ''));
      feetEl.textContent = isNaN(m) ? '' : (m * 3.28084).toFixed(1);
    });
    feetEl.addEventListener('input', () => {
      const ft = parseFloat(feetEl.textContent.replace(/[^\d.\-]/g, ''));
      metersEl.textContent = isNaN(ft) ? '' : (ft / 3.28084).toFixed(1);
    });
    // Prevent newlines
    [metersEl, feetEl].forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    });
  }

  // Copy to clipboard on click for copy buttons
  container.querySelectorAll('.elev-copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetEl = document.getElementById(btn.dataset.target);
      if (!targetEl) return;
      const text = targetEl.textContent.replace(/[^\d.\-]/g, '').trim();
      if (text) {
        navigator.clipboard.writeText(text);
        const toast = document.getElementById('elev-toast');
        if (toast) {
          toast.classList.add('visible');
          setTimeout(() => toast.classList.remove('visible'), 1500);
        }
      }
    });
  });

  // Re-init map when expanding from collapsed
  container.querySelector('.collapsible-header').addEventListener('click', () => {
    if (!APP.mapCollapsed) {
      setTimeout(() => {
        if (mapInstance) { mapInstance.invalidateSize(); }
        else { initMap(lat, lng); }
      }, 100);
    }
  });
}

function initMap(lat, lng) {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  try {
    mapInstance = L.map('map-container').setView([lat, lng], 8);
    const tile = MAP_TILES[APP.mapTheme];
    currentTileLayer = L.tileLayer(tile.url, { attribution: tile.attribution, ...tile.options }).addTo(mapInstance);

    L.circleMarker([lat, lng], {
      color: '#48ca48', fillColor: '#48ca48', fillOpacity: 0.8, radius: 8
    }).addTo(mapInstance).bindPopup(`Decimal: ${lat}, ${lng}`);

    setTimeout(() => mapInstance.invalidateSize(), 100);
  } catch {
    const body = document.getElementById('map-viewer-container-body');
    if (body) body.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px">Map unavailable</div>';
  }
}

function switchMapTiles() {
  if (!mapInstance || !currentTileLayer) return;
  mapInstance.removeLayer(currentTileLayer);
  const tile = MAP_TILES[APP.mapTheme];
  currentTileLayer = L.tileLayer(tile.url, { attribution: tile.attribution, ...tile.options }).addTo(mapInstance);
}

// ── OCR Panel ───────────────────────────────────────────

function renderOcrPanel() {
  const ocrText = APP.currentSpecimen.ocr || '';
  if (!ocrText) return;

  makeCollapsiblePanel('ocr-panel-container', 'OCR Text',
    `<div class="scrollable-content ocr-text">${escapeHtml(ocrText)}</div>`,
    'ocrCollapsed');
}

// ── WFO Info Panel ──────────────────────────────────────

function renderWfoPanel() {
  const container = document.getElementById('wfo-panel-container');
  if (!container) return;

  const wfo = APP.currentSpecimen.WFO_info;
  if (!wfo || wfo === '' || (typeof wfo === 'object' && Object.keys(wfo).length === 0)) {
    container.innerHTML = '';
    return;
  }

  const exactMatch = wfo.WFO_exact_match;
  const badgeClass = exactMatch ? 'exact' : (wfo.WFO_best_match ? 'partial' : 'none');
  const badgeText = exactMatch ? 'Exact Match' : (wfo.WFO_best_match ? 'Best Match' : 'No Match');
  const badgeHtml = `<span class="wfo-badge ${badgeClass}" style="margin-left:auto">${badgeText}</span>`;

  const bodyHtml = `
    <div class="info-panel-body">
      ${wfo.WFO_exact_match_name ? `<div class="info-row"><span class="info-row-label">Exact Name</span><span class="info-row-value">${escapeHtml(wfo.WFO_exact_match_name)}</span></div>` : ''}
      ${wfo.WFO_best_match ? `<div class="info-row"><span class="info-row-label">Best Match</span><span class="info-row-value">${escapeHtml(wfo.WFO_best_match)}</span></div>` : ''}
      ${wfo.WFO_candidate_names ? `<div class="info-row"><span class="info-row-label">Candidates</span><span class="info-row-value">${escapeHtml(String(wfo.WFO_candidate_names))}</span></div>` : ''}
      ${wfo.WFO_placement ? `<div class="info-row"><span class="info-row-label">Placement</span><span class="info-row-value">${escapeHtml(wfo.WFO_placement)}</span></div>` : ''}
      ${wfo.WFO_override_OCR ? `<div class="info-row"><span class="info-row-label">Override OCR</span><span class="info-row-value">${wfo.WFO_override_OCR}</span></div>` : ''}
    </div>
  `;

  makeCollapsiblePanel('wfo-panel-container', 'WFO Taxonomy', bodyHtml, 'wfoCollapsed', badgeHtml);
}

// ── Elevation Panel ─────────────────────────────────────

function renderElevationPanel() {
  const container = document.getElementById('elevation-panel-container');
  if (!container) return;

  const elev = APP.currentSpecimen.COP90_elevation_m;
  if (elev === undefined || elev === null || elev === '' || elev === 'None') {
    container.innerHTML = '';
    return;
  }

  const elevHtml = `<span style="font-size:11px;color:var(--text-secondary);margin-left:auto">${escapeHtml(String(elev))} m</span>`;
  makeCollapsiblePanel('elevation-panel-container', 'COP90 Elevation',
    `<div class="info-panel-body"><div class="info-row"><span class="info-row-label">Elevation</span><span class="info-row-value">${escapeHtml(String(elev))} m</span></div></div>`,
    'elevationCollapsed', elevHtml);
}

// ── Prompt Panel ────────────────────────────────────────────

function renderPromptPanel() {
  if (!APP.currentPrompt) return;

  const meta = APP.currentPrompt.metadata || {};
  const raw = APP.currentPrompt.raw || '';

  // Format YAML with syntax highlighting
  const formattedYaml = formatYaml(raw);

  const bodyHtml = `
    <div style="padding:8px 10px">
      <div class="prompt-meta-row"><span class="prompt-meta-label">Name</span><span>${escapeHtml(meta.prompt_name || APP.currentSpecimen.prompt || '')}</span></div>
      <div class="prompt-meta-row"><span class="prompt-meta-label">Version</span><span>${escapeHtml(meta.prompt_version || '')}</span></div>
      <div class="prompt-meta-row"><span class="prompt-meta-label">Author</span><span>${escapeHtml(meta.prompt_author || '')}</span></div>
      <div class="prompt-meta-row"><span class="prompt-meta-label">Institution</span><span>${escapeHtml(meta.prompt_author_institution || '')}</span></div>
      <div class="prompt-meta-row"><span class="prompt-meta-label">LLM</span><span>${escapeHtml(meta.LLM || '')}</span></div>
      ${meta.prompt_description ? `<div style="margin-top:6px;font-size:11px;color:var(--text-muted)">${escapeHtml(meta.prompt_description)}</div>` : ''}
    </div>
    ${raw ? `<div class="scrollable-content yaml-content">${formattedYaml}</div>` : ''}
  `;

  const nameLabel = `<span style="font-size:10px;color:var(--text-muted);margin-left:auto;font-family:var(--font-mono)">${escapeHtml(meta.prompt_name || APP.currentSpecimen.prompt || '')}</span>`;
  makeCollapsiblePanel('prompt-panel-container', 'Prompt', bodyHtml, 'promptCollapsed', nameLabel);
}

function formatYaml(raw) {
  if (!raw) return '';
  return escapeHtml(raw).split('\\n').join('\n').split('\n').map(line => {
    // Highlight keys (word followed by colon at start or after spaces)
    let formatted = line;
    // Top-level keys
    formatted = formatted.replace(/^(\s*)([\w_-]+)(:)/, '$1<span class="yaml-key">$2</span><span class="yaml-colon">$3</span>');
    // List items
    formatted = formatted.replace(/^(\s*)(- )/, '$1<span class="yaml-dash">$2</span>');
    // Strings in quotes
    formatted = formatted.replace(/(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="yaml-string">$1</span>');
    // Comments
    formatted = formatted.replace(/(#.*)$/, '<span class="yaml-comment">$1</span>');
    return formatted;
  }).join('\n');
}

// ── Bounce to Unresolved ────────────────────────────────────

async function renderBounceBar() {
  const el = document.getElementById('bounce-bar');
  if (!el) return;

  const target = await findNextUnresolved();

  if (!target) {
    el.innerHTML = `
      <button class="btn-sm bounce-btn all-complete" disabled>&#10003; All Specimens Complete</button>
    `;
    return;
  }

  const isSameSpecimen = target.specimenIndex === APP.currentIndex;
  const label = isSameSpecimen
    ? `Bounce to Unresolved &#8594; ${target.categoryName}`
    : `Bounce to Unresolved &#8594; #${target.specimenIndex + 1} &middot; ${target.categoryName}`;

  el.innerHTML = `
    <button class="btn-sm bounce-btn" id="btn-bounce">&#9889; ${label}</button>
  `;

  document.getElementById('btn-bounce').addEventListener('click', async () => {
    if (isSameSpecimen) {
      APP.activeCategory = target.categoryName;
      renderCategoryTabs();
      renderCategoryForm();
      renderCategoryFooter();
      // Scroll to first pending field
      setTimeout(() => scrollToFirstPending(), 50);
    } else {
      await loadSpecimen(target.specimenIndex);
      APP.activeCategory = target.categoryName;
      renderCategoryTabs();
      renderCategoryForm();
      renderCategoryFooter();
      setTimeout(() => scrollToFirstPending(), 50);
    }
    // Re-render bounce bar for next target
    renderBounceBar();
  });
}

async function findNextUnresolved() {
  // Search from current specimen + current category forward, wrapping around
  const total = APP.specimens.length;

  for (let offset = 0; offset < total; offset++) {
    const idx = (APP.currentIndex + offset) % total;
    const spec = APP.specimens[idx];
    const specState = APP.state.specimens[spec.filename];

    // Need specimen data to know total fields — load on demand
    let specimenData = (idx === APP.currentIndex) ? APP.currentSpecimen : tableDataCache[spec.filename];
    if (!specimenData) {
      try {
        specimenData = await window.api.readSpecimen(APP.folderPath, spec.filename);
        tableDataCache[spec.filename] = specimenData;
      } catch { continue; }
    }

    const fj = specimenData.formatted_json || {};
    const allFieldKeys = Object.keys(fj);
    const resolvedFields = specState ? Object.keys(specState.accepted_fields || {}).length : 0;
    const hasUnconfirmed = specState?.unconfirmed_fields && Object.keys(specState.unconfirmed_fields).length > 0;

    if (resolvedFields >= allFieldKeys.length && !hasUnconfirmed) continue; // Fully resolved, no unconfirmed

    // Find which category has pending fields
    // Use prompt mapping if available, otherwise put all in MISC
    const mapping = APP.currentPrompt?.mapping || {};
    const allFields = Object.keys(fj);
    const assignedFields = new Set();

    // If same specimen, skip categories before the active one
    const catEntries = Object.entries(mapping);
    let startCatIdx = 0;
    if (idx === APP.currentIndex && APP.activeCategory) {
      const activeCatIdx = catEntries.findIndex(([name]) => name === APP.activeCategory);
      if (activeCatIdx >= 0) startCatIdx = activeCatIdx;
    }

    for (let ci = 0; ci < catEntries.length; ci++) {
      const catIdx = (startCatIdx + ci) % catEntries.length;
      const [catName, catFields] = catEntries[catIdx];
      const fieldsInSpecimen = catFields.filter(f => allFields.includes(f));
      fieldsInSpecimen.forEach(f => assignedFields.add(f));

      const pending = fieldsInSpecimen.filter(f =>
        specState?.unconfirmed_fields?.[f] !== undefined || !specState?.accepted_fields?.[f]
      );

      if (pending.length > 0) {
        return { specimenIndex: idx, categoryName: catName, firstPendingField: pending[0] };
      }
    }

    // Check MISC fields
    const miscFields = allFields.filter(f => !assignedFields.has(f));
    const miscPending = miscFields.filter(f =>
      specState?.unconfirmed_fields?.[f] !== undefined || !specState?.accepted_fields?.[f]
    );
    if (miscPending.length > 0) {
      return { specimenIndex: idx, categoryName: 'MISC', firstPendingField: miscPending[0] };
    }
  }

  return null; // Everything complete
}

function scrollToFirstPending() {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  // Find first field-row that's still pending
  const rows = document.querySelectorAll('.field-row');
  for (const row of rows) {
    const field = row.dataset.field;
    if (field && !specState.accepted_fields[field]) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus the input
      const input = row.querySelector('.field-input');
      if (input) input.focus();
      break;
    }
  }
}

// ── Category Tabs ───────────────────────────────────────────

function renderCategoryTabs() {
  const el = document.getElementById('category-tabs');
  if (!el) return;

  const categories = getCategories();
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename] || {};
  const confirmed = specState.categories_confirmed || [];

  el.innerHTML = categories.map(cat => {
    const isActive = cat.name === APP.activeCategory;
    const isConfirmed = confirmed.includes(cat.name);
    const resolvedCount = getResolvedFieldCount(spec.filename, cat.fields);

    return `
      <div class="category-tab ${isActive ? 'active' : ''} ${isConfirmed ? 'confirmed' : ''}"
           style="${isActive ? `border-color: ${cat.color}; color: ${cat.color}` : ''}"
           data-category="${cat.name}">
        <span class="tab-check">${isConfirmed ? '&#10003;' : '&#9744;'}</span>
        <span>${cat.name}</span>
        <span class="tab-count">${resolvedCount}/${cat.fields.length}</span>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      APP.activeCategory = tab.dataset.category;
      renderCategoryTabs();
      renderCategoryForm();
      renderCategoryFooter();
    });
  });
}

function getResolvedFieldCount(filename, fields) {
  const specState = APP.state.specimens[filename];
  if (!specState) return 0;
  return fields.filter(f => specState.accepted_fields[f] !== undefined).length;
}

// ── Category Form ───────────────────────────────────────────

function renderCategoryForm() {
  const el = document.getElementById('category-form');
  if (!el) return;

  const categories = getCategories();
  const cat = categories.find(c => c.name === APP.activeCategory);
  if (!cat) { el.innerHTML = ''; return; }

  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename] || {};
  const fj = APP.currentSpecimen.formatted_json || {};
  el.innerHTML = `
    <div class="field-row-headers">
      <span class="field-col-header">From VoucherVision</span>
      <span></span>
      <span class="field-col-header">Reviewed Record</span>
    </div>
    ${cat.fields.map(field => {
      const aiValue = fj[field] !== undefined ? String(fj[field]) : '';
      const accepted = specState.accepted_fields[field];
      const isResolved = accepted !== undefined;
      const unconfirmedValue = specState.unconfirmed_fields?.[field];
      const hasUnconfirmed = unconfirmedValue !== undefined;
      const reviewedValue = hasUnconfirmed ? unconfirmedValue : (isResolved ? accepted.value : '');
      const source = hasUnconfirmed ? 'unconfirmed' : (isResolved ? accepted.source : 'pending');
      const isEmpty = aiValue === '';

      return `
        <div class="field-row ${isResolved && !hasUnconfirmed ? 'resolved' : ''} ${hasUnconfirmed ? 'unconfirmed' : ''}" data-field="${field}" data-source="${source}" data-status="${hasUnconfirmed ? 'Unconfirmed Change' : getStatusLabel(source)}">
          <div class="field-label" style="color: ${isResolved && !hasUnconfirmed ? 'var(--text-muted)' : hasUnconfirmed ? 'var(--warning)' : cat.color}">
            ${escapeHtml(field)}
            ${!hasUnconfirmed ? `<button class="btn-icon field-uncertain-btn" data-field="${field}" title="Set status to Unconfirmed Change">&#8635;</button>` : ''}
            <span class="field-status ${source}">${hasUnconfirmed ? 'Unconfirmed Change' : getStatusLabel(source)}</span>
          </div>
          <div class="field-ai-value ${isEmpty ? 'empty' : ''}">
            ${isEmpty ? '(empty)' : escapeHtml(aiValue)}
          </div>
          <div class="field-actions">
            ${hasUnconfirmed
              ? `<button class="btn-icon field-confirm-unconfirmed-btn" data-field="${field}" title="Confirm this change">&#10003;</button>`
              : !isEmpty
                ? `<button class="btn-icon field-accept-btn" data-field="${field}" data-value="${escapeAttr(aiValue)}" title="Accept AI value">&#8594;</button>`
                : `<button class="btn-icon field-accept-btn field-confirm-empty-btn" data-field="${field}" title="Confirm empty">&#8594;</button>`
            }
          </div>
          <div class="field-reviewed">
            <div class="field-input ${isResolved && !hasUnconfirmed ? 'resolved' : ''} ${hasUnconfirmed ? 'unconfirmed-input' : ''}" contenteditable="true" data-field="${field}">${escapeHtml(reviewedValue)}</div>
          </div>
        </div>
      `;
    }).join('')}
  `;

  // Wire field events
  el.querySelectorAll('.field-accept-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const value = btn.dataset.value;
      acceptField(field, value, 'ai');
    });
  });

  el.querySelectorAll('.field-confirm-empty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      acceptField(field, '', 'confirmed_empty');
    });
  });

  // Mark as uncertain buttons
  el.querySelectorAll('.field-uncertain-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const field = btn.dataset.field;
      const spec = APP.specimens[APP.currentIndex];
      const specState = APP.state.specimens[spec.filename];
      if (!specState) return;

      // Get current value: from accepted, or from the contenteditable input, or from original JSON
      const inputEl = el.querySelector(`.field-input[data-field="${field}"]`);
      const currentValue = specState.accepted_fields?.[field]?.value
        ?? (inputEl ? inputEl.textContent.replace(/\n/g, ' ').trim() : null)
        ?? (APP.currentSpecimen.formatted_json?.[field] !== undefined ? String(APP.currentSpecimen.formatted_json[field]) : '');

      // Move to unconfirmed (keep the value, just change the state)
      if (!specState.unconfirmed_fields) specState.unconfirmed_fields = {};
      specState.unconfirmed_fields[field] = currentValue;

      // Remove from accepted if it was there
      if (specState.accepted_fields[field]) delete specState.accepted_fields[field];

      // Un-confirm categories
      autoConfirmCategories(spec.filename);
      scheduleSaveState();
      scheduleAutoSaveReviewed(spec.filename);

      // Re-render
      renderCategoryForm();
      renderCategoryTabs();
      renderCategoryFooter();
      renderBounceBar();
    });
  });

  // Confirm unconfirmed change buttons
  el.querySelectorAll('.field-confirm-unconfirmed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const spec = APP.specimens[APP.currentIndex];

      // Read the latest value from the contenteditable div (user may have edited further)
      const inputEl = el.querySelector(`.field-input[data-field="${field}"]`);
      const latestValue = inputEl
        ? inputEl.textContent.replace(/\n/g, ' ').trim()
        : APP.state.specimens[spec.filename]?.unconfirmed_fields?.[field] || '';

      // Clear unconfirmed state, then accept with appropriate source
      if (APP.state.specimens[spec.filename]?.unconfirmed_fields) {
        delete APP.state.specimens[spec.filename].unconfirmed_fields[field];
      }
      const fj = APP.currentSpecimen.formatted_json || {};
      const aiValue = fj[field] !== undefined ? String(fj[field]) : '';
      let source;
      if (latestValue === aiValue && aiValue !== '') source = 'ai';
      else if (latestValue === '' && aiValue === '') source = 'confirmed_empty';
      else if (aiValue === '' && latestValue !== '') source = 'user_added';
      else source = 'edited';
      acceptField(field, latestValue, source);
      renderCategoryForm();
    });
  });

  el.querySelectorAll('.field-input').forEach(input => {
    input.addEventListener('input', () => {
      const field = input.dataset.field;
      const value = input.textContent.replace(/\n/g, ' ').trim();
      const spec = APP.specimens[APP.currentIndex];
      const specState = APP.state.specimens[spec.filename];
      const hasUnconfirmed = specState?.unconfirmed_fields?.[field] !== undefined;

      if (hasUnconfirmed) {
        // Field is in unconfirmed state — keep updating unconfirmed, don't accept yet
        specState.unconfirmed_fields[field] = value;
        scheduleSaveState();
      } else {
        // Normal flow — accept the field
        const fj = APP.currentSpecimen.formatted_json || {};
        const aiValue = fj[field] !== undefined ? String(fj[field]) : '';

        let source;
        if (value === '' && aiValue === '') source = 'confirmed_empty';
        else if (value === aiValue) source = 'ai';
        else if (aiValue === '' && value !== '') source = 'user_added';
        else source = 'edited';

        acceptField(field, value, source, false);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const allInputs = [...el.querySelectorAll('.field-input')];
        const idx = allInputs.indexOf(input);
        if (idx < allInputs.length - 1) allInputs[idx + 1].focus();
      }
    });
  });

  // Align all field labels to the widest one
  alignFieldLabels(el);
}

function alignFieldLabels(container) {
  const labels = container.querySelectorAll('.field-label');
  if (labels.length === 0) return;

  // Reset widths first so we can measure natural width
  labels.forEach(l => { l.style.minWidth = ''; l.style.width = ''; });

  // Find the widest label
  let maxWidth = 0;
  labels.forEach(l => {
    maxWidth = Math.max(maxWidth, l.scrollWidth);
  });

  // Set all labels to that width
  const widthPx = (maxWidth + 4) + 'px';
  labels.forEach(l => {
    l.style.minWidth = widthPx;
    l.style.width = widthPx;
  });

  // Update grid columns to match label width
  container.querySelectorAll('.field-row').forEach(row => {
    row.style.gridTemplateColumns = `${widthPx} 1fr auto 1fr auto`;
  });
  const headers = container.querySelector('.field-row-headers');
  if (headers) headers.style.gridTemplateColumns = `${widthPx} 1fr auto 1fr auto`;
}

function getStatusLabel(source) {
  switch (source) {
    case 'ai': return 'accepted';
    case 'edited': return 'edited';
    case 'user_added': return 'added';
    case 'confirmed_empty': return 'empty';
    default: return 'pending';
  }
}

function acceptField(field, value, source, updateInput = true) {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  specState.accepted_fields[field] = { value, source };
  specState.last_touched = new Date().toISOString();

  // Update input
  const input = document.querySelector(`.field-input[data-field="${field}"]`);
  if (input) {
    if (updateInput) {
      input.textContent = value;
    }
    input.classList.add('resolved');
  }

  // Update status label and field label color
  const row = document.querySelector(`.field-row[data-field="${field}"]`);
  if (row) {
    row.classList.add('resolved');
    row.dataset.source = source;
    row.dataset.status = getStatusLabel(source);
    const statusEl = row.querySelector('.field-status');
    if (statusEl) {
      statusEl.className = `field-status ${source}`;
      statusEl.textContent = getStatusLabel(source);
    }
    const labelEl = row.querySelector('.field-label');
    if (labelEl) {
      labelEl.style.color = 'var(--text-muted)';
    }
  }

  // Auto-confirm categories where all fields are resolved
  autoConfirmCategories(spec.filename);

  // Re-render tabs to update counts
  renderCategoryTabs();
  renderCategoryFooter();
  renderBounceBar();
  scheduleSaveState();
  scheduleAutoSaveReviewed(spec.filename);
}

function autoConfirmCategories(filename) {
  const specState = APP.state.specimens[filename];
  if (!specState) return;

  const categories = getCategories();
  const confirmed = new Set(specState.categories_confirmed || []);

  for (const cat of categories) {
    const resolvedCount = getResolvedFieldCount(filename, cat.fields);
    if (resolvedCount === cat.fields.length) {
      confirmed.add(cat.name);
    } else {
      confirmed.delete(cat.name);
    }
  }

  specState.categories_confirmed = [...confirmed];
}

// ── Category Footer ─────────────────────────────────────────

function renderCategoryFooter() {
  const el = document.getElementById('category-form-footer');
  if (!el) return;

  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename] || {};
  const categories = getCategories();
  const cat = categories.find(c => c.name === APP.activeCategory);
  if (!cat) { el.innerHTML = ''; return; }

  const resolvedCount = getResolvedFieldCount(spec.filename, cat.fields);
  const allResolved = resolvedCount === cat.fields.length;
  const allCategoriesConfirmed = categories.every(c =>
    (specState.categories_confirmed || []).includes(c.name));

  const catHasUnresolved = !allResolved;

  el.innerHTML = `
    <div class="flex items-center gap-8">
      <span style="display:flex;align-items:center;gap:6px;padding:2px 8px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:10px;font-family:var(--font-mono)">&#9998; ${escapeHtml(APP.username)}</span>
      ${allResolved
        ? `<span class="text-success" style="font-size:12px">&#10003; ${cat.name} complete</span>`
        : `<span class="text-muted" style="font-size:12px">${cat.fields.length - resolvedCount} of ${cat.fields.length} fields pending</span>`
      }
      ${APP.settings.acceptAllEnabled && catHasUnresolved
        ? `<button class="btn-sm" id="btn-accept-all" style="background:#3a2020;color:var(--warning);border-color:var(--warning)">Accept All ${cat.name}</button><span style="font-size:9px;color:var(--text-muted);margin-left:4px">(disable in &#9881; Settings)</span>`
        : ''}
      <div class="ml-auto">
        ${allCategoriesConfirmed ? '<span class="text-success" style="font-size:12px;font-weight:600">&#10003; All categories complete</span>' : ''}
      </div>
    </div>
  `;

  document.getElementById('btn-accept-all')?.addEventListener('click', acceptAllFields);
}

// ── Auto-Save Reviewed File ─────────────────────────────────

const reviewedSaveTimers = {};

function scheduleAutoSaveReviewed(filename) {
  if (reviewedSaveTimers[filename]) clearTimeout(reviewedSaveTimers[filename]);
  reviewedSaveTimers[filename] = setTimeout(() => autoSaveReviewed(filename), 1000);
}

async function autoSaveReviewed(filename) {
  const spec = APP.specimens.find(s => s.filename === filename);
  if (!spec) return;

  const specState = APP.state.specimens[filename];
  if (!specState) return;

  // Must have at least one accepted field to write
  if (Object.keys(specState.accepted_fields).length === 0) return;

  // Read full original with base64 preserved
  const original = await window.api.readSpecimenRaw(APP.folderPath, filename);

  // Rebuild formatted_json from accepted fields
  const newFormattedJson = {};
  const originalFj = original.formatted_json || {};

  // Start with all original keys as empty (zero-trust), then fill accepted
  for (const key of Object.keys(originalFj)) {
    newFormattedJson[key] = '';
  }
  for (const [field, info] of Object.entries(specState.accepted_fields)) {
    newFormattedJson[field] = info.value;
  }

  const reviewed = { ...original };
  reviewed.formatted_json = newFormattedJson;

  // Determine completeness
  const categories = getCategoriesForSpecimen(filename);
  const allCategoriesConfirmed = categories.length > 0 &&
    categories.every(c => (specState.categories_confirmed || []).includes(c.name));
  const totalFields = Object.keys(originalFj).length;
  const resolvedFields = Object.keys(specState.accepted_fields).length;

  // Build review metadata
  const fieldsBy = { ai: [], edited: [], user_added: [], confirmed_empty: [] };
  for (const [field, info] of Object.entries(specState.accepted_fields)) {
    if (fieldsBy[info.source]) fieldsBy[info.source].push(field);
  }

  reviewed.review_metadata = {
    reviewed_at: new Date().toISOString(),
    reviewed_by: APP.username,
    editor_version: '1.0.0',
    complete: allCategoriesConfirmed && resolvedFields >= totalFields,
    fields_resolved: resolvedFields,
    fields_total: totalFields,
    fields_accepted_from_ai: fieldsBy.ai,
    fields_manually_edited: fieldsBy.edited,
    fields_user_added: fieldsBy.user_added,
    fields_confirmed_empty: fieldsBy.confirmed_empty,
    flagged: specState.flagged,
    flag_note: specState.flag_note || ''
  };

  await window.api.writeReviewed(APP.folderPath, filename, reviewed);
  spec.hasReviewed = true;
  spec.reviewComplete = reviewed.review_metadata.complete;
  updateNavBar();

  // Update the status badge in-place if this is the current specimen
  if (APP.specimens[APP.currentIndex]?.filename === filename) {
    const badgeEl = document.getElementById('review-status-badge');
    if (badgeEl) {
      badgeEl.innerHTML = spec.reviewComplete
        ? '<span class="status-badge reviewed">Complete</span>'
        : '<span class="status-badge in-progress">In Progress</span>';
    }
  }
}

function getCategoriesForSpecimen(filename) {
  const cached = tableDataCache[filename];
  const specData = cached || APP.currentSpecimen;
  if (!specData || !APP.currentPrompt) return [];

  const formattedJson = specData.formatted_json || {};
  const mapping = APP.currentPrompt.mapping || {};
  const allFields = Object.keys(formattedJson);
  const assignedFields = new Set();
  const categories = [];

  for (const [catName, fields] of Object.entries(mapping)) {
    const catFields = fields.filter(f => allFields.includes(f));
    catFields.forEach(f => assignedFields.add(f));
    if (catFields.length > 0) categories.push({ name: catName, fields: catFields });
  }

  const miscFields = allFields.filter(f => !assignedFields.has(f));
  if (miscFields.length > 0) categories.push({ name: 'MISC', fields: miscFields });

  return categories;
}

// ── Export Project ───────────────────────────────────────────

async function exportProject() {
  // Check all specimens for completeness
  const incomplete = [];
  for (let i = 0; i < APP.specimens.length; i++) {
    const spec = APP.specimens[i];
    const specState = APP.state.specimens[spec.filename];

    if (!specState || !specState.accepted_fields || Object.keys(specState.accepted_fields).length === 0) {
      incomplete.push({ index: i + 1, filename: spec.filename, reason: 'not started' });
      continue;
    }

    const cached = tableDataCache[spec.filename] || await window.api.readSpecimen(APP.folderPath, spec.filename);
    const totalFields = Object.keys(cached?.formatted_json || {}).length;
    const resolvedFields = Object.keys(specState.accepted_fields).length;
    const categories = getCategoriesForSpecimen(spec.filename);
    const allCatsConfirmed = categories.length > 0 &&
      categories.every(c => (specState.categories_confirmed || []).includes(c.name));

    if (resolvedFields < totalFields || !allCatsConfirmed) {
      incomplete.push({
        index: i + 1,
        filename: spec.filename,
        reason: `${resolvedFields}/${totalFields} fields, ${allCatsConfirmed ? 'categories done' : 'categories incomplete'}`
      });
    }
  }

  if (incomplete.length > 0) {
    showExportWarningDialog(incomplete);
  } else {
    await doExport();
  }
}

function showExportWarningDialog(incomplete) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';

  const listItems = incomplete.map(s =>
    `<div style="padding:3px 0;font-size:12px;font-family:var(--font-mono)"><span style="color:var(--warning);min-width:30px;display:inline-block">#${s.index}</span> ${escapeHtml(s.filename)} <span style="color:var(--text-muted)">(${s.reason})</span></div>`
  ).join('');

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:600px;max-height:80vh;overflow:auto;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--warning)">Incomplete Reviews</div>
      <div style="font-size:13px;margin-bottom:12px;color:var(--text-secondary)">
        ${incomplete.length} of ${APP.specimens.length} specimens are not fully reviewed:
      </div>
      <div style="max-height:300px;overflow-y:auto;margin-bottom:16px;padding:8px;background:var(--bg-primary);border-radius:var(--radius-sm);border:1px solid var(--border)">
        ${listItems}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="export-cancel">Return to Review</button>
        <button class="btn-sm" style="background:#8b4513;color:#fff;border-color:#8b4513" id="export-anyway">Export Anyway</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());

  document.getElementById('export-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('export-anyway').addEventListener('click', () => {
    overlay.remove();
    showFinalExportWarning(incomplete);
  });
}

function showFinalExportWarning(incomplete) {
  // Count total unreviewed fields
  let totalUnreviewed = 0;
  for (const item of incomplete) {
    const spec = APP.specimens[item.index - 1];
    const specState = APP.state.specimens[spec.filename];
    const cached = tableDataCache[spec.filename];
    const totalFields = Object.keys(cached?.formatted_json || {}).length;
    const resolvedFields = specState ? Object.keys(specState.accepted_fields || {}).length : 0;
    totalUnreviewed += (totalFields - resolvedFields);
  }

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--error);border-radius:var(--radius);padding:24px;max-width:520px;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--error)">Export Incomplete Records</div>
      <div style="font-size:13px;margin-bottom:12px;color:var(--text-secondary);line-height:1.6">
        ${incomplete.length} specimens have a total of <strong>${totalUnreviewed}</strong> unreviewed fields.
        How should unreviewed fields be handled in the export?
      </div>

      <div style="margin-bottom:16px;display:flex;flex-direction:column;gap:10px">
        <div style="padding:12px;border:2px solid var(--accent);border-radius:var(--radius);background:rgba(46,204,113,0.08);cursor:pointer" id="option-blank">
          <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:4px">Leave unreviewed fields blank (Recommended)</div>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.4">
            Unreviewed fields will be exported as empty strings. This preserves the zero-trust workflow — only values you have explicitly confirmed will appear in the output.
          </div>
        </div>

        <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer" id="option-populate">
          <div style="font-size:13px;font-weight:600;color:var(--warning);margin-bottom:4px">Populate with VoucherVision suggestions</div>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.4">
            Unreviewed fields will be filled with VoucherVision's original values. These values have <strong>not</strong> been verified by a human reviewer. Use with caution.
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="final-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('final-cancel').addEventListener('click', () => overlay.remove());

  // Option 1: Leave blank (recommended)
  document.getElementById('option-blank').addEventListener('click', async () => {
    overlay.remove();

    // Mark all incomplete as complete but leave unreviewed fields as ""
    for (const item of incomplete) {
      const spec = APP.specimens[item.index - 1];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      const specState = APP.state.specimens[spec.filename];

      const categories = getCategoriesForSpecimen(spec.filename);
      specState.categories_confirmed = categories.map(c => c.name);

      // Accept unreviewed fields as confirmed_empty
      const cached = tableDataCache[spec.filename] || await window.api.readSpecimen(APP.folderPath, spec.filename);
      const originalFj = cached?.formatted_json || {};
      for (const field of Object.keys(originalFj)) {
        if (!specState.accepted_fields[field]) {
          specState.accepted_fields[field] = { value: '', source: 'confirmed_empty' };
        }
      }

      await autoSaveReviewed(spec.filename);
    }

    scheduleSaveState();
    await doExport();
  });

  // Option 2: Populate with VV suggestions
  document.getElementById('option-populate').addEventListener('click', async () => {
    overlay.remove();

    for (const item of incomplete) {
      const spec = APP.specimens[item.index - 1];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      const specState = APP.state.specimens[spec.filename];

      const categories = getCategoriesForSpecimen(spec.filename);
      specState.categories_confirmed = categories.map(c => c.name);

      // Auto-accept unreviewed fields with VoucherVision values
      const cached = tableDataCache[spec.filename] || await window.api.readSpecimen(APP.folderPath, spec.filename);
      const originalFj = cached?.formatted_json || {};
      for (const [field, val] of Object.entries(originalFj)) {
        if (!specState.accepted_fields[field]) {
          const strVal = String(val);
          specState.accepted_fields[field] = {
            value: strVal,
            source: strVal === '' ? 'confirmed_empty' : 'ai'
          };
        }
      }

      await autoSaveReviewed(spec.filename);
    }

    scheduleSaveState();
    await doExport();
  });
}

async function doExport() {
  // Get all possible field keys from first specimen
  let allFieldKeys = [];
  if (APP.specimens.length > 0) {
    const firstData = tableDataCache[APP.specimens[0].filename]
      || await window.api.readSpecimen(APP.folderPath, APP.specimens[0].filename);
    if (firstData) allFieldKeys = Object.keys(firstData.formatted_json || {});
  }

  // Build rows for XLSX — zero-trust: unreviewed fields stay ""
  const rows = [];
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    const row = { filename: spec.filename };

    // Start all fields as empty
    for (const key of allFieldKeys) {
      row[key] = '';
    }

    // Fill in only accepted values
    if (specState?.accepted_fields) {
      for (const [field, info] of Object.entries(specState.accepted_fields)) {
        row[field] = info.value;
      }
    }

    rows.push(row);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultName = `VoucherVisionGO_Export_${timestamp}.xlsx`;
  const savePath = await window.api.selectSavePath(defaultName);
  if (!savePath) return;

  try {
    await window.api.exportXlsx(savePath, rows);
    alert(`Export complete: ${savePath}`);
  } catch (err) {
    alert(`Export failed: ${err.message || err}`);
  }
}

// ── Flag Toggle ─────────────────────────────────────────────

function toggleFlag() {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  specState.flagged = !specState.flagged;

  // Update flag button in-place immediately
  const flagBtn = document.getElementById('btn-flag');
  if (flagBtn) {
    flagBtn.classList.toggle('flagged', specState.flagged);
    flagBtn.innerHTML = specState.flagged ? '&#9873; Flagged' : '&#9872; Flag';
  }
  updateNavBar();

  // Ask for note after DOM update (use setTimeout to let repaint happen)
  if (specState.flagged) {
    setTimeout(() => {
      const note = prompt('Flag note (optional):');
      specState.flag_note = note || '';
      scheduleSaveState();
    }, 50);
  } else {
    specState.flag_note = '';
    scheduleSaveState();
  }
}

// ── State Persistence ───────────────────────────────────────

function scheduleSaveState() {
  if (APP.saveTimeout) clearTimeout(APP.saveTimeout);
  APP.saveTimeout = setTimeout(async () => {
    if (APP.folderPath && APP.state) {
      await window.api.saveState(APP.folderPath, APP.state);
    }
  }, 500);
}

// Save state on window close
window.addEventListener('beforeunload', () => {
  if (APP.folderPath && APP.state) {
    // Use sendBeacon-style synchronous save via IPC
    window.api.saveState(APP.folderPath, APP.state);
  }
});

// ── Resizable Panels ────────────────────────────────────────

function initResizeHandle(handleId, panelId, containerId, minRatio, maxRatio) {
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  const container = document.getElementById(containerId);
  if (!handle || !panel || !container) return;

  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    let ratio = (e.clientX - rect.left) / rect.width;
    ratio = Math.max(minRatio, Math.min(maxRatio, ratio));
    panel.style.width = (ratio * 100) + '%';
    panel.style.flex = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function initResizeHandleV(handleId, panelId, containerId, minRatio, maxRatio) {
  const handle = document.getElementById(handleId);
  const panel = document.getElementById(panelId);
  const container = document.getElementById(containerId);
  if (!handle || !panel || !container) return;

  let dragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    let ratio = (e.clientY - rect.top) / rect.height;
    ratio = Math.max(minRatio, Math.min(maxRatio, ratio));
    panel.style.height = (ratio * 100) + '%';
    panel.style.flexShrink = '0';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function initFocusVerticalResizeHandles(container) {
  container.querySelectorAll('.focus-v-resize').forEach(handle => {
    const aboveId = handle.dataset.above;
    const belowId = handle.dataset.below;
    const above = document.getElementById(aboveId);
    const below = document.getElementById(belowId);
    if (!above || !below) return;

    let dragging = false;
    let startY, startAboveH, startBelowH;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startAboveH = above.getBoundingClientRect().height;
      startBelowH = below.getBoundingClientRect().height;
      handle.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    const onMove = (e) => {
      if (!dragging) return;
      const delta = e.clientY - startY;
      const total = startAboveH + startBelowH;
      const maxAbove = above.classList.contains('focus-top-row') ? total * 0.9 : total - 32;
      const newAboveH = Math.min(maxAbove, Math.max(32, startAboveH + delta));
      const newBelowH = Math.max(32, total - newAboveH);
      above.style.flex = 'none';
      above.style.height = newAboveH + 'px';
      below.style.flex = 'none';
      below.style.height = newBelowH + 'px';
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function saveColumnWidths() {
  const table = document.querySelector('.batch-table');
  if (!table || !APP.state) return;
  const widths = {};
  table.querySelectorAll('th[data-sort]').forEach(th => {
    widths[th.dataset.sort] = th.offsetWidth;
  });
  APP.state.tableColumnWidths = widths;
  scheduleSaveState();
}

function initColumnResize(container) {
  const table = container.querySelector('.batch-table');
  if (!table) return;

  const ths = table.querySelectorAll('th');
  const saved = APP.state?.tableColumnWidths || {};

  // Restore saved widths or capture auto-calculated
  ths.forEach(th => {
    const key = th.dataset.sort;
    const w = (key && saved[key]) ? saved[key] : th.offsetWidth;
    th.style.width = w + 'px';
    th.style.minWidth = w + 'px';
  });

  ths.forEach(th => {
    const handle = document.createElement('div');
    handle.className = 'th-resize-handle';
    th.appendChild(handle);

    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const colIndex = Array.from(ths).indexOf(th);
      const rows = table.querySelectorAll('tbody tr');
      let maxWidth = th.scrollWidth;

      // Measure widest cell in this column
      rows.forEach(row => {
        const cell = row.children[colIndex];
        if (cell) {
          // Temporarily remove constraints to measure natural width
          const oldW = cell.style.width;
          const oldMin = cell.style.minWidth;
          const oldMax = cell.style.maxWidth;
          cell.style.width = 'auto';
          cell.style.minWidth = 'auto';
          cell.style.maxWidth = 'none';
          cell.style.whiteSpace = 'nowrap';
          maxWidth = Math.max(maxWidth, cell.scrollWidth + 20);
          cell.style.width = oldW;
          cell.style.minWidth = oldMin;
          cell.style.maxWidth = oldMax;
          cell.style.whiteSpace = '';
        }
      });

      th.style.width = maxWidth + 'px';
      th.style.minWidth = maxWidth + 'px';
      saveColumnWidths();
    });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = th.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev) => {
        const diff = ev.clientX - startX;
        const newWidth = Math.max(40, startWidth + diff);
        th.style.width = newWidth + 'px';
        th.style.minWidth = newWidth + 'px';
      };

      const onUp = () => {
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveColumnWidths();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ── Batch Table View ────────────────────────────────────────

const tableDataCache = {};
const specimenIndexMap = new Map(); // filename → index, rebuilt when specimens change
function rebuildSpecimenIndexMap() {
  specimenIndexMap.clear();
  APP.specimens.forEach((s, i) => specimenIndexMap.set(s.filename, i));
}
let tableSelectedIndex = 0;
let tableImageType = 'collage';
let tableEditingLocked = true;
let focusThumbSize = 52;

async function renderTableView() {
  const el = document.getElementById('table-view');
  if (!el) return;

  // Load all specimen data (parallel)
  const tableUncached = APP.specimens.filter(s => !tableDataCache[s.filename]);
  if (tableUncached.length > 0) {
    const tableResults = await Promise.all(tableUncached.map(s =>
      window.api.readSpecimen(APP.folderPath, s.filename).catch(() => null)
    ));
    tableUncached.forEach((s, i) => { tableDataCache[s.filename] = tableResults[i]; });
  }

  // Get all fields from first specimen
  let allFields = [];
  if (APP.specimens.length > 0) {
    const firstData = tableDataCache[APP.specimens[0].filename];
    if (firstData) allFields = Object.keys(firstData.formatted_json || {});
  }

  el.innerHTML = `
    <div class="review-nav">
      <div class="nav-view-toggle" id="table-view-switch-container"></div>
      <div class="table-lock-toggle ${tableEditingLocked ? 'locked' : 'unlocked'}" id="btn-table-lock">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
        <span class="table-lock-label">${tableEditingLocked ? '&#128274; Table Editing Locked' : '&#128275; Table Editing Allowed'}</span>
      </div>
      <input type="text" class="table-filter" id="table-filter" placeholder="Filter specimens..." style="width:200px">
      <span class="text-muted" style="font-size:12px">${APP.specimens.length} specimens</span>
    </div>
    <div class="table-body-row resizable-container" id="table-resizable">
      <div class="table-left" id="table-left-panel">
        <div class="batch-table-wrapper">
          <table class="batch-table" id="batch-table">
            <thead>
              <tr>
                <th style="width:30px"></th>
                <th data-sort="index">#</th>
                <th data-sort="filename">Filename</th>
                <th data-sort="status">Status</th>
                ${allFields.map(f => `<th data-sort="${escapeAttr(f)}">${escapeHtml(f)}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="table-body"></tbody>
          </table>
        </div>
      </div>
      <div class="resize-handle" id="table-resize-handle"></div>
      <div class="table-image-panel" id="table-image-panel">
        <div class="image-viewer-header">
          <span>Image</span>
          <div id="table-image-switch-container"></div>
        </div>
        <div class="table-image-container" id="table-image-container">
          <div class="table-image-placeholder">Select a row to view image</div>
        </div>
      </div>
    </div>
  `;

  // Table image toggle (slide switch)
  const tableImgSw = createSlideSwitch('table-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], tableImageType, (val) => {
    tableImageType = val;
    loadTableImage(tableSelectedIndex);
  });
  document.getElementById('table-image-switch-container').innerHTML = tableImgSw.html;
  tableImgSw.setup();

  // Table view switch
  const tableSw = createSlideSwitch('table-view-switch', [
    { value: 'review', label: 'Form' },
    { value: 'table', label: 'Table' },
    { value: 'focus', label: 'Focus' }
  ], 'table', (val) => {
    if (val === 'review') { showView('review'); renderReviewView(); }
    else if (val === 'focus') { showView('focus'); renderFocusView(); }
  });
  document.getElementById('table-view-switch-container').innerHTML = tableSw.html;
  tableSw.setup();

  // Lock toggle
  document.getElementById('btn-table-lock').addEventListener('click', toggleTableLock);

  renderTableBody(allFields, '');

  // Filter (debounced)
  let filterTimeout;
  document.getElementById('table-filter').addEventListener('input', (e) => {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => renderTableBody(allFields, e.target.value.toLowerCase()), 150);
  });

  // Sort
  let sortCol = 'index';
  let sortAsc = true;
  el.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) { sortAsc = !sortAsc; }
      else { sortCol = col; sortAsc = true; }
      renderTableBody(allFields, document.getElementById('table-filter').value.toLowerCase(), sortCol, sortAsc);
    });
  });

  // Column resize handles
  initColumnResize(el);

  // Resizable: left panel min 50%, max 75% (image gets 25-50%)
  initResizeHandle('table-resize-handle', 'table-left-panel', 'table-resizable', 0.50, 0.75);

  // Load image for first row
  if (APP.specimens.length > 0) loadTableImage(0);
}

async function loadTableImage(index) {
  const container = document.getElementById('table-image-container');
  if (!container || index < 0 || index >= APP.specimens.length) return;
  tableSelectedIndex = index;
  const spec = APP.specimens[index];
  container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, tableImageType);
  if (dataUrl) {
    container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(spec.filename)}">`;
    container.querySelector('img').addEventListener('click', () => openImageModal(dataUrl));
  } else {
    container.innerHTML = `<div class="table-image-placeholder">${tableImageType === 'original' ? 'Original not available' : 'No image'}</div>`;
  }
}

// Cache prepared table rows to avoid recomputing on scroll
let _tableRowsCache = null;
let _tableFilteredCache = null;

function prepareTableRows(allFields) {
  if (_tableRowsCache) return _tableRowsCache;
  const rows = [];
  for (let i = 0; i < APP.specimens.length; i++) {
    const spec = APP.specimens[i];
    const specState = APP.state?.specimens?.[spec.filename];
    const cached = tableDataCache[spec.filename];
    const originalFj = cached?.formatted_json || {};

    let status = 'not-started';
    if (spec.reviewComplete) status = 'reviewed';
    else if (spec.hasReviewed || specState?.status === 'in_progress') status = 'in-progress';
    if (specState?.flagged) status = 'flagged';

    const fieldValues = {};
    const fieldAccepted = {};
    const fieldUnconfirmed = {};
    for (const f of allFields) {
      if (specState?.unconfirmed_fields?.[f] !== undefined) {
        fieldValues[f] = specState.unconfirmed_fields[f];
        fieldAccepted[f] = false;
        fieldUnconfirmed[f] = true;
      } else if (specState?.accepted_fields?.[f] !== undefined) {
        fieldValues[f] = specState.accepted_fields[f].value;
        fieldAccepted[f] = true;
        fieldUnconfirmed[f] = false;
      } else {
        fieldValues[f] = originalFj[f] !== undefined ? String(originalFj[f]) : '';
        fieldAccepted[f] = false;
        fieldUnconfirmed[f] = false;
      }
    }

    rows.push({ index: i, filename: spec.filename, status, fieldValues, fieldAccepted, fieldUnconfirmed });
  }
  _tableRowsCache = rows;
  return rows;
}

function renderTableBody(allFields, filter, sortCol = 'index', sortAsc = true) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;

  _tableRowsCache = null; // always recompute on explicit render
  const rows = prepareTableRows(allFields);

  // Filter
  const filtered = filter
    ? rows.filter(r => r.filename.toLowerCase().includes(filter) ||
        Object.values(r.fieldValues).some(v => v.toLowerCase().includes(filter)))
    : rows;

  // Sort
  filtered.sort((a, b) => {
    let va, vb;
    if (sortCol === 'index') { va = a.index; vb = b.index; }
    else if (sortCol === 'filename') { va = a.filename; vb = b.filename; }
    else if (sortCol === 'status') { va = a.status; vb = b.status; }
    else { va = a.fieldValues[sortCol] || ''; vb = b.fieldValues[sortCol] || ''; }
    if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  _tableFilteredCache = filtered;

  // Virtual scroll: only render visible rows + buffer
  const wrapper = tbody.closest('.batch-table-wrapper');
  const ROW_HEIGHT = 28;
  const totalHeight = filtered.length * ROW_HEIGHT;

  // Store allFields for scroll handler
  tbody._vsAllFields = allFields;

  // Set up virtual scroll listener once
  if (!tbody._virtualScrollInit && wrapper) {
    tbody._virtualScrollInit = true;
    let scrollRAF = null;
    wrapper.addEventListener('scroll', () => {
      if (scrollRAF) return;
      scrollRAF = requestAnimationFrame(() => {
        scrollRAF = null;
        renderVisibleTableRows(tbody._vsAllFields, wrapper, null, ROW_HEIGHT);
      });
    });
  }

  renderVisibleTableRows(allFields, wrapper, filtered, ROW_HEIGHT);
}

function renderVisibleTableRows(allFields, wrapper, filtered, ROW_HEIGHT) {
  if (!filtered) filtered = _tableFilteredCache || [];
  const tbody = document.getElementById('table-body');
  if (!tbody || !wrapper) return;

  const scrollTop = wrapper.scrollTop;
  const viewHeight = wrapper.clientHeight;
  const buffer = 10;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - buffer);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + buffer);

  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = (filtered.length - endIdx) * ROW_HEIGHT;
  const visible = filtered.slice(startIdx, endIdx);

  tbody.innerHTML = `
    <tr style="height:${topPad}px"><td colspan="999"></td></tr>
    ${visible.map(r => `
    <tr class="status-${r.status} ${r.index === tableSelectedIndex ? 'selected' : ''}" data-index="${r.index}">
      <td class="cell-goto" data-index="${r.index}" title="Open in form view" style="cursor:pointer;text-align:center;font-size:12px">&#9998;</td>
      <td>${r.index + 1}</td>
      <td class="cell-filename" data-index="${r.index}">${escapeHtml(r.filename)}</td>
      <td><span class="status-badge ${r.status}">${r.status.replace('-', ' ')}</span></td>
      ${allFields.map(f => {
        const accepted = r.fieldAccepted[f];
        const unconfirmed = r.fieldUnconfirmed[f];
        const val = r.fieldValues[f];
        const cls = unconfirmed ? 'cell-limbo' : (accepted ? 'cell-accepted' : 'cell-unaccepted');
        const isEmpty = val === '' || val === undefined || val === null;
        const displayVal = isEmpty ? '<span class="cell-empty-placeholder">(empty)</span>' : escapeHtml(val);
        return `<td class="${cls}" data-field="${escapeAttr(f)}" data-index="${r.index}" title="${isEmpty ? '(empty)' : escapeAttr(val)}"${unconfirmed ? ` data-limbo-value="${escapeAttr(val)}"` : ''}>${displayVal}</td>`;
      }).join('')}
    </tr>
  `).join('')}
    <tr style="height:${bottomPad}px"><td colspan="999"></td></tr>
  `;

  // Click eye icon to go to form view
  tbody.querySelectorAll('.cell-goto').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(td.dataset.index);
      showView('review');
      loadSpecimen(idx);
    });
  });

  // Single click: expand cell and start editing immediately
  tbody.querySelectorAll('td[data-field]').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(td.dataset.index);
      if (idx !== tableSelectedIndex) selectTableRow(idx);

      // Collapse other expanded cells
      tbody.querySelectorAll('td.expanded').forEach(other => {
        if (other !== td) other.classList.remove('expanded');
      });
      td.classList.add('expanded');

      // Start editing immediately
      startCellEdit(td, idx, td.dataset.field, allFields);
    });
  });

  // Click row (non-field area) to select for image
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      selectTableRow(parseInt(tr.dataset.index));
    });
  });
}

function selectTableRow(index) {
  tableSelectedIndex = index;
  document.querySelectorAll('.batch-table tr.selected').forEach(tr => tr.classList.remove('selected'));
  const row = document.querySelector(`.batch-table tr[data-index="${index}"]`);
  if (row) row.classList.add('selected');
  loadTableImage(index);
}

function toggleTableLock() {
  if (tableEditingLocked) {
    // Unlocking — show warning
    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    overlay.style.cursor = 'default';

    overlay.innerHTML = `
      <div style="background:var(--bg-secondary);border:1px solid var(--warning);border-radius:var(--radius);padding:24px;max-width:480px;cursor:default" onclick="event.stopPropagation()">
        <div style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--warning)">&#9888; Enable Table Editing</div>
        <div style="font-size:13px;margin-bottom:12px;color:var(--text-secondary);line-height:1.8">
          <div style="margin-bottom:4px"><strong>Click</strong> a cell to open it for editing.</div>
          <div style="margin-bottom:4px"><strong>Enter</strong> confirms the value into the reviewed record.</div>
          <div style="margin-bottom:4px"><strong>Tab</strong> or <strong>clicking away</strong> without Enter leaves the cell as an <strong style="color:var(--warning)">Unconfirmed Change</strong> (orange outline).</div>
          <div style="margin-bottom:4px"><strong>Escape</strong> discards changes and reverts to the original value.</div>
        </div>
        <div style="font-size:12px;margin-bottom:16px;color:var(--text-muted);line-height:1.6">
          Lock the table when you are done editing to prevent accidental changes.
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-sm" id="lock-cancel">Cancel</button>
          <button class="btn-sm" style="background:var(--warning);color:#000;border-color:var(--warning);font-weight:600" id="lock-confirm">Enable Editing</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.remove());

    document.getElementById('lock-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('lock-confirm').addEventListener('click', () => {
      overlay.remove();
      tableEditingLocked = false;
      updateTableLockButton();
    });
  } else {
    // Locking — no confirmation needed
    tableEditingLocked = true;
    updateTableLockButton();
  }
}

function updateTableLockButton() {
  const toggle = document.getElementById('btn-table-lock');
  if (!toggle) return;
  toggle.classList.toggle('locked', tableEditingLocked);
  toggle.classList.toggle('unlocked', !tableEditingLocked);
  const label = toggle.querySelector('.table-lock-label');
  if (label) {
    label.innerHTML = tableEditingLocked
      ? '&#128274; Table Editing Locked'
      : '&#128275; Table Editing Allowed';
  }
}

function startCellEdit(td, specimenIndex, fieldName, allFields) {
  if (tableEditingLocked) return;
  if (td.querySelector('.cell-edit-input')) {
    // Already editing — just focus
    td.querySelector('.cell-edit-input').focus();
    return;
  }

  const spec = APP.specimens[specimenIndex];
  const cached = tableDataCache[spec.filename];
  const originalFj = cached?.formatted_json || {};
  const specState = APP.state?.specimens?.[spec.filename];

  const currentValue = specState?.accepted_fields?.[fieldName]?.value
    ?? (originalFj[fieldName] !== undefined ? String(originalFj[fieldName]) : '');

  const originalText = td.textContent;
  const wasAccepted = td.classList.contains('cell-accepted');

  td.innerHTML = `<div class="cell-edit-input" contenteditable="true">${escapeHtml(currentValue)}</div>`;
  const input = td.querySelector('.cell-edit-input');
  input.focus();
  // Place cursor at end
  const range = document.createRange();
  const sel = window.getSelection();
  if (input.childNodes.length > 0) {
    range.setStartAfter(input.lastChild);
  } else {
    range.setStart(input, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);

  const commit = () => {
    const newValue = input.textContent.replace(/\n/g, ' ').trim();
    td.textContent = newValue;
    td.classList.remove('cell-limbo', 'expanded');

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);

    const aiValue = originalFj[fieldName] !== undefined ? String(originalFj[fieldName]) : '';
    let source;
    if (newValue === aiValue && aiValue !== '') source = 'ai';
    else if (aiValue === '' && newValue !== '') source = 'user_added';
    else if (newValue === '') source = 'confirmed_empty';
    else source = 'edited';

    APP.state.specimens[spec.filename].accepted_fields[fieldName] = { value: newValue, source };
    APP.state.specimens[spec.filename].last_touched = new Date().toISOString();

    // Clear unconfirmed state
    if (APP.state.specimens[spec.filename].unconfirmed_fields) {
      delete APP.state.specimens[spec.filename].unconfirmed_fields[fieldName];
    }

    td.classList.remove('cell-unaccepted');
    td.classList.add('cell-accepted');
    td.title = newValue;
    autoConfirmCategories(spec.filename);
    scheduleSaveState();
    scheduleAutoSaveReviewed(spec.filename);
  };

  const goLimbo = () => {
    const newValue = input.textContent.replace(/\n/g, ' ').trim();
    td.textContent = newValue;
    td.classList.add('cell-limbo');
    td.classList.remove('expanded');
    td.title = newValue;
    td.dataset.limboValue = newValue;

    // Persist unconfirmed change to state
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    if (!APP.state.specimens[spec.filename].unconfirmed_fields) {
      APP.state.specimens[spec.filename].unconfirmed_fields = {};
    }
    APP.state.specimens[spec.filename].unconfirmed_fields[fieldName] = newValue;
    scheduleSaveState();
  };

  const cancel = () => {
    td.textContent = originalText;
    td.classList.toggle('cell-accepted', wasAccepted);
    td.classList.toggle('cell-unaccepted', !wasAccepted);
    td.classList.remove('cell-limbo', 'expanded');
    delete td.dataset.limboValue;

    // Clear unconfirmed state
    if (APP.state.specimens[spec.filename]?.unconfirmed_fields) {
      delete APP.state.specimens[spec.filename].unconfirmed_fields[fieldName];
      scheduleSaveState();
    }
  };

  input.addEventListener('blur', () => {
    // Only go to limbo if the value was actually changed
    if (input.textContent.replace(/\n/g, ' ').trim() !== currentValue) {
      goLimbo();
    } else {
      // No change — just collapse back to normal
      td.textContent = originalText;
      td.classList.toggle('cell-accepted', wasAccepted);
      td.classList.toggle('cell-unaccepted', !wasAccepted);
      td.classList.remove('expanded');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent newline in contenteditable
      input.removeEventListener('blur', goLimbo);
      commit();
      const nextTd = document.querySelector(`.batch-table td[data-field="${fieldName}"][data-index="${specimenIndex + 1}"]`);
      if (nextTd) {
        selectTableRow(specimenIndex + 1);
        nextTd.classList.add('expanded');
        startCellEdit(nextTd, specimenIndex + 1, fieldName, allFields);
      }
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', goLimbo);
      cancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Tab = move to next cell without confirming (same as clicking away)
      input.blur();
      const fieldIdx = allFields.indexOf(fieldName);
      const nextField = allFields[e.shiftKey ? fieldIdx - 1 : fieldIdx + 1];
      if (nextField) {
        const nextTd = document.querySelector(`.batch-table td[data-field="${nextField}"][data-index="${specimenIndex}"]`);
        if (nextTd) {
          nextTd.classList.add('expanded');
          startCellEdit(nextTd, specimenIndex, nextField, allFields);
        }
      }
    }
  });

  // If re-entering a limbo cell, restore the limbo value
  if (td.dataset.limboValue !== undefined) {
    input.textContent = td.dataset.limboValue;
    // Place cursor at end
    const r2 = document.createRange();
    const s2 = window.getSelection();
    if (input.childNodes.length > 0) { r2.setStartAfter(input.lastChild); }
    else { r2.setStart(input, 0); }
    r2.collapse(true);
    s2.removeAllRanges();
    s2.addRange(r2);
  }
}

// ── Focus View ──────────────────────────────────────────────

let focusField = null;
let focusFilter = null; // clicked facet value or null

async function renderFocusView() {
  const el = document.getElementById('focus-view');
  if (!el) return;

  // Ensure all specimen data is loaded (parallel)
  const uncached = APP.specimens.filter(s => !tableDataCache[s.filename]);
  if (uncached.length > 0) {
    const results = await Promise.all(uncached.map(s =>
      window.api.readSpecimen(APP.folderPath, s.filename).catch(() => null)
    ));
    uncached.forEach((s, i) => { tableDataCache[s.filename] = results[i]; });
  }

  // Get categories and fields
  const categories = getFocusCategories();
  if (!focusField && categories.length > 0 && categories[0].fields.length > 0) {
    focusField = categories[0].fields[0];
  }

  el.innerHTML = `
    <div class="focus-columns" id="focus-columns">
      <div class="focus-left-col" id="focus-left-col">
        <div class="review-nav">
          <div class="nav-view-toggle" id="focus-view-switch-container"></div>
          <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Focus Mode</span>
          <span class="text-muted" style="font-size:11px">${APP.specimens.length} specimens</span>
          <span style="flex:1"></span>
          <button class="btn-sm btn-primary focus-confirm-btn" id="focus-confirm-modified" disabled>Confirm modified <span style="display:inline-block;width:8px;height:8px;background:var(--warning);border-radius:1px;vertical-align:middle;margin:0 2px"></span> entries for <span id="focus-confirm-field-label">—</span></button>
          <button class="btn-sm focus-confirm-btn" id="focus-confirm-all" disabled>Confirm ALL entries for <span id="focus-confirm-all-field-label">—</span></button>
        </div>
        <div class="focus-body" id="focus-body">
          <div class="focus-sidebar" id="focus-sidebar"></div>
          <div class="focus-main" id="focus-main"></div>
        </div>
      </div>
      <div class="resize-handle" id="focus-col-resize"></div>
      <div class="focus-right-col" id="focus-image-panel">
        <div class="image-viewer-header">
          <span>Image</span>
          <div id="focus-image-switch-container"></div>
        </div>
        <div class="table-image-container" id="focus-image-container">
          <div class="table-image-placeholder">Select a specimen</div>
        </div>
        <div class="focus-carousel" id="focus-carousel"></div>
      </div>
    </div>
  `;

  // View switch
  const focusSw = createSlideSwitch('focus-view-switch', [
    { value: 'review', label: 'Form' },
    { value: 'table', label: 'Table' },
    { value: 'focus', label: 'Focus' }
  ], 'focus', (val) => {
    if (val === 'review') { showView('review'); renderReviewView(); }
    else if (val === 'table') { showView('table'); renderTableView(); }
  });
  document.getElementById('focus-view-switch-container').innerHTML = focusSw.html;
  focusSw.setup();

  // Image switch
  const focusImgSw = createSlideSwitch('focus-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], tableImageType, (val) => {
    tableImageType = val;
    if (tableSelectedIndex >= 0) loadFocusImage(tableSelectedIndex);
    renderFocusCarousel();
  });
  document.getElementById('focus-image-switch-container').innerHTML = focusImgSw.html;
  focusImgSw.setup();

  // Confirm buttons
  document.getElementById('focus-confirm-modified').addEventListener('click', () => {
    if (focusField) confirmModifiedField(focusField);
  });
  document.getElementById('focus-confirm-all').addEventListener('click', () => {
    if (focusField) showConfirmAllPopup(focusField);
  });

  renderFocusSidebar(categories);
  renderFocusMain();

  // Resizable split between left and right columns (left: 50%-80%, right: 20%-50%)
  initResizeHandle('focus-col-resize', 'focus-left-col', 'focus-columns', 0.50, 0.80);

  // Load first specimen image on startup
  if (APP.specimens.length > 0) {
    loadFocusImage(0);
  }
}

function getCategoryColorForField(field) {
  const mapping = APP.currentPrompt?.mapping || {};
  for (const [catName, fields] of Object.entries(mapping)) {
    if (fields.includes(field)) return CATEGORY_COLORS[catName] || CATEGORY_COLORS.MISC;
  }
  return CATEGORY_COLORS.MISC;
}

function getFocusCategories() {
  // Build categories from first specimen's data + prompt mapping
  const mapping = APP.currentPrompt?.mapping || {};
  let allFields = [];
  if (APP.specimens.length > 0) {
    const first = tableDataCache[APP.specimens[0].filename];
    if (first) allFields = Object.keys(first.formatted_json || {});
  }

  const assignedFields = new Set();
  const categories = [];

  for (const [catName, fields] of Object.entries(mapping)) {
    const catFields = fields.filter(f => allFields.includes(f));
    catFields.forEach(f => assignedFields.add(f));
    if (catFields.length > 0) categories.push({ name: catName, fields: catFields });
  }

  const miscFields = allFields.filter(f => !assignedFields.has(f));
  if (miscFields.length > 0) categories.push({ name: 'MISC', fields: miscFields });

  return categories;
}

function renderFocusSidebar(categories) {
  const el = document.getElementById('focus-sidebar');
  if (!el) return;

  el.innerHTML = `
    <div class="focus-sidebar-title">Fields</div>
    ${categories.map(cat => `
      <div class="focus-sidebar-group">
        <div class="focus-sidebar-group-label">${escapeHtml(cat.name)}</div>
        ${cat.fields.map(f => {
          const issues = countFieldIssues(f);
          const allResolved = isFieldFullyResolved(f);
          return `
            <div class="focus-field-item ${f === focusField ? 'active' : ''}" data-field="${escapeAttr(f)}">
              <span class="focus-field-confirm ${allResolved ? 'confirmed' : ''}">&#10003;</span>
              <span class="focus-field-name">${escapeHtml(f)}</span>
              ${issues > 0 ? `<span class="focus-field-badge has-issues">${issues}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `).join('')}
  `;

  el.querySelectorAll('.focus-field-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't switch field if clicking the confirm button
      if (e.target.classList.contains('focus-field-confirm')) return;
      focusField = item.dataset.field;
      focusFilter = null;
      el.querySelectorAll('.focus-field-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderFocusMain();
    });
  });

}

function isFieldFullyResolved(field) {
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    if (!specState?.accepted_fields?.[field]) return false;
  }
  return true;
}


function showConfirmAllPopup(field) {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:450px;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:13px;margin-bottom:16px;color:var(--text-secondary);line-height:1.6">
        Are you sure that you want to accept the current values for all entries in the <strong style="color:var(--text-primary)">${escapeHtml(field)}</strong> field?
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="confirm-all-cancel">Back</button>
        <button class="btn-sm btn-primary" id="confirm-all-go">Confirm ALL</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-all-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-all-go').addEventListener('click', () => {
    overlay.remove();
    confirmAllFieldValues(field);
  });
}

function confirmAllFieldValues(field) {
  for (const spec of APP.specimens) {
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const st = APP.state.specimens[spec.filename];

    // Resolve unconfirmed first
    const unconfVal = st.unconfirmed_fields?.[field];
    if (unconfVal !== undefined) {
      const aiValue = (tableDataCache[spec.filename]?.formatted_json || {})[field];
      const aiStr = aiValue !== undefined ? String(aiValue) : '';
      let source;
      if (unconfVal === aiStr && aiStr !== '') source = 'ai';
      else if (aiStr === '' && unconfVal !== '') source = 'user_added';
      else if (unconfVal === '') source = 'confirmed_empty';
      else source = 'edited';
      st.accepted_fields[field] = { value: unconfVal, source };
      delete st.unconfirmed_fields[field];
    } else if (!st.accepted_fields?.[field]) {
      // Pending (unaccepted) — accept AI value as-is
      const cached = tableDataCache[spec.filename];
      const fj = cached?.formatted_json || {};
      const val = fj[field] !== undefined ? String(fj[field]) : '';
      st.accepted_fields[field] = { value: val, source: val === '' ? 'confirmed_empty' : 'ai' };
    }

    st.last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
  }

  scheduleSaveState();
  renderFocusSidebar(getFocusCategories());
  renderFocusMain();
}

function confirmModifiedField(field) {
  for (const spec of APP.specimens) {
    const st = APP.state.specimens[spec.filename];
    if (st?.unconfirmed_fields?.[field] === undefined) continue; // Only touch limbo entries

    if (!st.accepted_fields) st.accepted_fields = {};
    const val = st.unconfirmed_fields[field];
    const aiValue = (tableDataCache[spec.filename]?.formatted_json || {})[field];
    const aiStr = aiValue !== undefined ? String(aiValue) : '';
    let source;
    if (val === aiStr && aiStr !== '') source = 'ai';
    else if (aiStr === '' && val !== '') source = 'user_added';
    else if (val === '') source = 'confirmed_empty';
    else source = 'edited';

    st.accepted_fields[field] = { value: val, source };
    delete st.unconfirmed_fields[field];
    st.last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
  }

  scheduleSaveState();
  renderFocusSidebar(getFocusCategories());
  renderFocusMain();
}

function updateFocusConfirmButtons() {
  const modBtn = document.getElementById('focus-confirm-modified');
  const allBtn = document.getElementById('focus-confirm-all');
  const modLabel = document.getElementById('focus-confirm-field-label');
  const allLabel = document.getElementById('focus-confirm-all-field-label');
  if (!modBtn || !allBtn) return;

  const field = focusField || '—';
  modLabel.textContent = field;
  allLabel.textContent = field;

  if (!focusField) {
    modBtn.disabled = true;
    allBtn.disabled = true;
    return;
  }

  let limboCount = 0;
  let unresolvedCount = 0;
  for (const spec of APP.specimens) {
    const st = APP.state.specimens[spec.filename];
    if (st?.unconfirmed_fields?.[focusField] !== undefined) limboCount++;
    if (!st?.accepted_fields?.[focusField]) unresolvedCount++;
  }

  modBtn.disabled = limboCount === 0;
  allBtn.disabled = (limboCount + unresolvedCount) === 0;
}

// Batch-compute issue counts for all fields in one pass
let _fieldIssueCounts = null;
let _fieldIssueCountsVersion = 0;
let _fieldIssueCountsLastVersion = -1;

function invalidateFieldIssueCounts() { _fieldIssueCountsVersion++; }

function getFieldIssueCounts() {
  if (_fieldIssueCountsLastVersion === _fieldIssueCountsVersion && _fieldIssueCounts) return _fieldIssueCounts;
  _fieldIssueCounts = {};
  for (const spec of APP.specimens) {
    const st = APP.state.specimens[spec.filename];
    if (!st) continue;
    // Check all fields from first specimen's formatted_json
    const cached = tableDataCache[spec.filename];
    const fields = cached ? Object.keys(cached.formatted_json || {}) : [];
    for (const field of fields) {
      if (!_fieldIssueCounts[field]) _fieldIssueCounts[field] = 0;
      if (st.unconfirmed_fields?.[field] !== undefined) _fieldIssueCounts[field]++;
      else if (!st.accepted_fields?.[field]) _fieldIssueCounts[field]++;
    }
  }
  _fieldIssueCountsLastVersion = _fieldIssueCountsVersion;
  return _fieldIssueCounts;
}

function countFieldIssues(field) {
  return getFieldIssueCounts()[field] || 0;
}

function getAllValuesForField(field) {
  const result = [];
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    const cached = tableDataCache[spec.filename];
    const fj = cached?.formatted_json || {};

    const unconfirmedVal = specState?.unconfirmed_fields?.[field];
    const accepted = specState?.accepted_fields?.[field];

    // Priority: unconfirmed > accepted > original AI value
    let value;
    let cellState; // 'limbo' | 'accepted' | 'unaccepted'
    if (unconfirmedVal !== undefined) {
      value = unconfirmedVal;
      cellState = 'limbo';
    } else if (accepted !== undefined) {
      value = accepted.value;
      cellState = 'accepted';
    } else {
      value = fj[field] !== undefined ? String(fj[field]) : '';
      cellState = 'unaccepted';
    }
    result.push({ filename: spec.filename, value, index: specimenIndexMap.get(spec.filename), cellState });
  }
  return result;
}

// ── Clustering Algorithms ───────────────────────────────────

function fingerprint(str) {
  return str.toLowerCase().trim()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function ngrams(str, n = 2) {
  const s = str.toLowerCase().replace(/\s+/g, '');
  const result = new Set();
  for (let i = 0; i <= s.length - n; i++) {
    result.add(s.slice(i, i + n));
  }
  return result;
}

function ngramSimilarity(a, b) {
  const na = ngrams(a);
  const nb = ngrams(b);
  if (na.size === 0 && nb.size === 0) return 1;
  let intersection = 0;
  for (const g of na) { if (nb.has(g)) intersection++; }
  return intersection / Math.max(na.size, nb.size);
}

function fingerprintCluster(fieldValues) {
  // Group values by fingerprint
  const groups = {};
  const valueCounts = {};

  for (const { value } of fieldValues) {
    if (value === '') continue;
    valueCounts[value] = (valueCounts[value] || 0) + 1;
    const fp = fingerprint(value);
    if (!groups[fp]) groups[fp] = new Set();
    groups[fp].add(value);
  }

  // Only return groups with >1 distinct value (i.e., inconsistencies)
  const clusters = [];
  for (const [fp, values] of Object.entries(groups)) {
    if (values.size > 1) {
      const variants = [...values].map(v => ({ value: v, count: valueCounts[v] || 0 }));
      variants.sort((a, b) => b.count - a.count);
      clusters.push({ fingerprint: fp, variants, bestValue: variants[0].value });
    }
  }

  // Also check n-gram similarity for values that didn't cluster by fingerprint
  const allUniqueValues = Object.keys(valueCounts);
  for (let i = 0; i < allUniqueValues.length; i++) {
    for (let j = i + 1; j < allUniqueValues.length; j++) {
      const a = allUniqueValues[i];
      const b = allUniqueValues[j];
      // Skip if already in a fingerprint cluster together
      const fpA = fingerprint(a);
      const fpB = fingerprint(b);
      if (fpA === fpB) continue;

      const sim = ngramSimilarity(a, b);
      if (sim > 0.6 && sim < 1.0) {
        // Check not already in a cluster
        const alreadyClustered = clusters.some(c =>
          c.variants.some(v => v.value === a) && c.variants.some(v => v.value === b));
        if (!alreadyClustered) {
          const variants = [
            { value: a, count: valueCounts[a] || 0 },
            { value: b, count: valueCounts[b] || 0 }
          ].sort((x, y) => y.count - x.count);
          clusters.push({ fingerprint: `ngram:${a}|${b}`, variants, bestValue: variants[0].value });
        }
      }
    }
  }

  return clusters;
}

// ── Focus Main Panel ────────────────────────────────────────

// Track which sections are minimized
const focusSectionState = { values: false, clusters: false, dates: false, catalog: false, specimens: false, standardize: false, authorship: false, elevation: false };
let focusToolScope = 'field'; // 'field' or 'everything'
let focusToolCategory = null; // dynamic from editor_tools, null = no tools shown

// Default tool categories when prompt has no editor_tools
const DEFAULT_TOOL_CATEGORIES = ['dates', 'taxonomy', 'cluster', 'geography', 'collectors', 'coordinates', 'patterns', 'elevation'];

// Get available tool categories from prompt's editor_tools mapping
function getEditorToolCategories() {
  const et = APP.currentPrompt?.editor_tools || {};
  const fromPrompt = Object.keys(et).map(k => k.toLowerCase());
  if (fromPrompt.length > 0) return fromPrompt;

  // No editor_tools in prompt — use defaults, but also include any categories with user-added fields
  const overrides = APP.state?.toolFieldOverrides || {};
  const withUserFields = Object.keys(overrides).filter(cat =>
    overrides[cat]?.added?.length > 0
  );
  const cats = [...DEFAULT_TOOL_CATEGORIES];
  for (const c of withUserFields) {
    if (!cats.includes(c)) cats.push(c);
  }
  return cats;
}

// Get fields for a tool category from editor_tools
function getEditorToolFields(category) {
  const et = APP.currentPrompt?.editor_tools || {};
  let baseFields = [];
  for (const [k, v] of Object.entries(et)) {
    if (k.toLowerCase() === category.toLowerCase()) { baseFields = [...(v || [])]; break; }
  }

  // Apply user overrides from state
  const overrides = APP.state?.toolFieldOverrides?.[category.toLowerCase()];
  if (overrides) {
    if (overrides.added) {
      for (const f of overrides.added) {
        if (!baseFields.includes(f)) baseFields.push(f);
      }
    }
    if (overrides.removed) {
      baseFields = baseFields.filter(f => !overrides.removed.includes(f));
    }
  }
  return baseFields;
}

// Section-to-category mapping — built dynamically
function getFocusToolCategories() {
  const cats = getEditorToolCategories();
  const result = {};
  // clusters section → cluster category
  if (cats.includes('cluster')) result.clusters = ['cluster'];
  // dates section → dates category
  if (cats.includes('dates')) result.dates = ['dates'];
  // catalog/patterns section → patterns category
  if (cats.includes('patterns')) result.catalog = ['patterns'];
  // standardize section → all categories that have standardization tools
  const stdCats = ['taxonomy', 'geography', 'collectors', 'coordinates'];
  result.standardize = stdCats.filter(c => cats.includes(c));
  // authorship → taxonomy
  if (cats.includes('taxonomy')) result.authorship = ['taxonomy'];
  // elevation → elevation
  if (cats.includes('elevation')) result.elevation = ['elevation'];
  return result;
}

// ── US State Abbreviation Lookup ────────────────────────────
const US_STATE_ABBREVS = {
  'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
  'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
  'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa',
  'KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
  'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri',
  'MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey',
  'NM':'New Mexico','NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio',
  'OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina',
  'SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont',
  'VA':'Virginia','WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming',
  'DC':'District of Columbia','PR':'Puerto Rico','VI':'Virgin Islands','GU':'Guam',
  'AS':'American Samoa','MP':'Northern Mariana Islands'
};

const USA_VARIANTS = ['USA','U.S.A.','U.S.A','US','U.S.','U.S','United States of America','The United States of America','The United States'];

// ── Standardization Tool Registry ───────────────────────────
// Each tool: { id, label, categories[], transform(value, field, spec) → newValue|null }
// Tools apply to ALL fields. The transform receives the field name and returns null to skip.
const STANDARDIZE_TOOLS = [
  {
    id: 'genus-title-case',
    label: 'Genus → Title Case',
    categories: ['taxonomy'],
    transform: (v, field) => {
      if (!/genus/i.test(field) || /specific|epithet/i.test(field)) return null;
      return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : null;
    }
  },
  {
    id: 'epithet-lowercase',
    label: 'Specific Epithet → lowercase',
    categories: ['taxonomy'],
    transform: (v, field) => {
      if (!/epithet/i.test(field)) return null;
      return (v && v !== v.toLowerCase()) ? v.toLowerCase() : null;
    }
  },
  {
    id: 'taxon-rank-normalize',
    label: 'Normalize taxonRank (ssp.→subsp.)',
    categories: ['taxonomy'],
    transform: (v) => {
      if (!v) return null;
      const fixed = v.replace(/\bssp\.?\b/gi, 'subsp.')
                     .replace(/\bsubspp?\.?\b/gi, 'subsp.')
                     .replace(/\bvar\.?\b/gi, 'var.')
                     .replace(/\bforma?\b/gi, 'f.');
      return fixed !== v ? fixed : null;
    }
  },
  {
    id: 'geo-title-case',
    label: 'Geography fields → Title Case (ALL-CAPS only)',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/country|state|province|county|continent/i.test(field)) return null;
      if (!v || !/^[^a-z]*$/.test(v) || v.length < 2) return null;
      return v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
  },
  {
    id: 'usa-standardize',
    label: 'Standardize "USA" variants → "United States"',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/country/i.test(field)) return null;
      if (!v) return null;
      const upper = v.trim().toUpperCase().replace(/\./g, '');
      if (USA_VARIANTS.some(u => u.toUpperCase().replace(/\./g, '') === upper)) return 'United States';
      return null;
    }
  },
  {
    id: 'state-abbrev-expand',
    label: 'US state abbreviations → full names',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/state|province/i.test(field)) return null;
      if (!v) return null;
      const trimmed = v.trim().toUpperCase();
      return US_STATE_ABBREVS[trimmed] || null;
    }
  },
  {
    id: 'county-suffix-strip',
    label: 'Strip "County" / "Co." suffixes',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/county/i.test(field)) return null;
      if (!v) return null;
      const stripped = v.replace(/\s+Co(?:unty|\.?)?\s*$/i, '').trim();
      return stripped !== v.trim() ? stripped : null;
    }
  },
  {
    id: 'collector-title-case',
    label: 'Collectors → Title Case (ALL-CAPS only)',
    categories: ['collectors'],
    transform: (v, field) => {
      if (!/collect|associat/i.test(field)) return null;
      if (!v || /[a-z]/.test(v)) return null;
      return v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
  },
  {
    id: 'datum-normalize',
    label: 'Standardize datum → "WGS84"',
    categories: ['coordinates'],
    transform: (v, field) => {
      if (!/datum/i.test(field)) return null;
      if (!v) return null;
      if (/^WGS\s*84$/i.test(v) && v !== 'WGS84') return 'WGS84';
      return null;
    }
  },
  {
    id: 'cultivated-normalize',
    label: 'Standardize cultivated (empty or "1")',
    categories: ['taxonomy'],
    transform: (v, field) => {
      if (!/cultivat/i.test(field)) return null;
      if (v === '' || v === '1') return null;
      if (!v || v.trim() === '') return '';
      return '1';
    }
  }
];

// ── Standardization Preview + Apply Engine ──────────────────

function getStandardizePreview(tool) {
  const results = [];
  // Use editor_tools fields for the active category, fall back to all fields
  const etFields = getEditorToolFields(focusToolCategory);
  const first = APP.specimens[0] ? tableDataCache[APP.specimens[0].filename] : null;
  const allFields = etFields.length > 0 ? etFields : (first ? Object.keys(first.formatted_json || {}) : []);

  for (const spec of APP.specimens) {
    for (const field of allFields) {
      const currentVal = getCurrentFieldValue(spec, field);
      if (currentVal === '') continue;
      const newVal = tool.transform(currentVal, field, spec);
      if (newVal !== null && newVal !== currentVal) {
        const idx = specimenIndexMap.get(spec.filename);
        results.push({ filename: spec.filename, index: idx, field, oldVal: currentVal, newVal });
      }
    }
  }
  return results;
}

function applyStandardizeTool(tool) {
  const preview = getStandardizePreview(tool);
  if (preview.length === 0) return 0;
  for (const item of preview) {
    const spec = APP.specimens[item.index];
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
    APP.state.specimens[spec.filename].unconfirmed_fields[item.field] = item.newVal;
    APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
  }
  scheduleSaveState();
  return preview.length;
}

function renderStandardizeSection() {
  const container = document.getElementById('focus-standardize-list');
  if (!container) return;

  // Skip expensive preview computation if section isn't visible
  const activeCat = focusToolCategory;
  if (!activeCat) { container.innerHTML = ''; return; }
  const tools = STANDARDIZE_TOOLS.filter(t => t.categories.includes(activeCat));

  if (tools.length === 0) {
    container.innerHTML = '<div class="focus-no-clusters">No standardization tools for this category</div>';
    return;
  }

  container.innerHTML = tools.map(tool => {
    const preview = getStandardizePreview(tool);
    const count = preview.length;
    return `
      <div class="std-tool" data-tool-id="${tool.id}">
        <div class="std-tool-header">
          <span class="std-tool-label">${escapeHtml(tool.label)}</span>
          <span class="std-tool-fields">${[...new Set(preview.map(p => p.field))].map(f => escapeHtml(f)).join(', ')}</span>
          <span class="std-tool-count ${count > 0 ? 'has-changes' : ''}">${count > 0 ? count + ' affected' : 'no changes'}</span>
          <button class="btn-sm btn-primary std-tool-apply" data-tool-id="${tool.id}" ${count === 0 ? 'disabled' : ''}>Apply</button>
        </div>
        ${count > 0 ? `
          <div class="std-tool-preview">
            ${preview.slice(0, 20).map(p => `
              <div class="std-preview-row">
                <span class="spec-filename" style="min-width:100px">${escapeHtml(p.filename.replace(/\.[^.]+$/, '').slice(0, 20))}</span>
                <span style="font-size:10px;color:var(--text-muted)">${escapeHtml(p.field)}</span>
                <span class="std-old-val">${escapeHtml(p.oldVal)}</span>
                <span style="color:var(--text-muted)">→</span>
                <span class="std-new-val">${escapeHtml(p.newVal)}</span>
              </div>
            `).join('')}
            ${preview.length > 20 ? `<div style="padding:4px 12px;font-size:10px;color:var(--text-muted)">…and ${preview.length - 20} more</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Wire apply buttons
  container.querySelectorAll('.std-tool-apply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const toolId = btn.dataset.toolId;
      const tool = STANDARDIZE_TOOLS.find(t => t.id === toolId);
      if (!tool) return;
      const count = applyStandardizeTool(tool);
      renderFocusMain();
      renderFocusSidebar(getFocusCategories());
      if (count > 0) alert(`Applied to ${count} value(s)`);
    });
  });
}

// ── Authorship Detection Tool ───────────────────────────────

function detectAuthorship() {
  const results = [];
  for (const spec of APP.specimens) {
    const idx = specimenIndexMap.get(spec.filename);
    const sciName = getCurrentFieldValue(spec, 'scientificName');
    if (!sciName || sciName.trim() === '') continue;

    const parts = sciName.trim().split(/\s+/);
    // genus + epithet = 2 parts; anything after is potential authorship/infrarank
    if (parts.length <= 2) continue;

    const genus = parts[0];
    const epithet = parts[1];
    const remainder = parts.slice(2).join(' ');

    // Check if remainder looks like authorship or infrarank
    // Infrarank markers: var., subsp., ssp., f., subvar.
    const infrarankPattern = /^(var\.|subsp\.|ssp\.|f\.|subvar\.)\s+/i;
    let cleanName, authorship;

    if (infrarankPattern.test(remainder)) {
      // Has infrarank — find authorship after infrarank epithet
      // e.g. "var. lutetiana (Léman) Baker" → name="genus epithet var. lutetiana", auth="(Léman) Baker"
      const infraMatch = remainder.match(/^((?:var\.|subsp\.|ssp\.|f\.|subvar\.)\s+\S+)\s+(.+)$/i);
      if (infraMatch) {
        cleanName = genus + ' ' + epithet + ' ' + infraMatch[1];
        authorship = infraMatch[2];
      } else {
        // Just infrarank + epithet, no trailing authorship
        continue;
      }
    } else {
      // Everything after genus + epithet is authorship
      cleanName = genus + ' ' + epithet;
      authorship = remainder;
    }

    if (authorship) {
      results.push({
        filename: spec.filename,
        index: idx,
        original: sciName,
        cleanName,
        authorship,
      });
    }
  }
  return results;
}

function renderAuthorshipSection() {
  const container = document.getElementById('focus-authorship-list');
  if (!container) return;
  if (focusToolCategory !== 'taxonomy') { container.innerHTML = ''; return; }

  const detections = detectAuthorship();

  if (detections.length === 0) {
    container.innerHTML = '<div class="focus-no-clusters">No authorship strings detected in scientificName</div>';
    return;
  }

  container.innerHTML = `
    <div style="padding:6px 12px;font-size:11px;color:var(--text-secondary)">${detections.length} specimen(s) with potential authorship in scientificName</div>
    ${detections.map(d => `
      <div class="std-preview-row focus-clickable-row" data-index="${d.index}">
        <span class="spec-filename" style="min-width:100px">${escapeHtml(d.filename.replace(/\.[^.]+$/, '').slice(0, 20))}</span>
        <span class="std-old-val">${escapeHtml(d.original)}</span>
        <span style="color:var(--text-muted)">→</span>
        <span class="std-new-val">${escapeHtml(d.cleanName)}</span>
        <span style="color:var(--text-muted)">+</span>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--cat-1)">${escapeHtml(d.authorship)}</span>
      </div>
    `).join('')}
    <div style="padding:8px 12px">
      <button class="btn-sm btn-primary" id="authorship-apply-all" ${detections.length === 0 ? 'disabled' : ''}>Split All (${detections.length})</button>
    </div>
  `;

  // Wire row clicks
  container.querySelectorAll('.focus-clickable-row').forEach(row => {
    row.addEventListener('click', () => loadFocusImage(parseInt(row.dataset.index)));
  });

  // Wire apply button
  document.getElementById('authorship-apply-all')?.addEventListener('click', () => {
    for (const d of detections) {
      const spec = APP.specimens[d.index];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
      APP.state.specimens[spec.filename].unconfirmed_fields['scientificName'] = d.cleanName;
      APP.state.specimens[spec.filename].unconfirmed_fields['scientificNameAuthorship'] = d.authorship;
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
    }
    scheduleSaveState();
    renderFocusMain();
    renderFocusSidebar(getFocusCategories());
    alert(`Split authorship for ${detections.length} specimen(s)`);
  });
}

// ── Elevation Discrepancy Tool ───────────────────────────────

function analyzeElevationDiscrepancy() {
  const elevFields = getEditorToolFields('elevation');
  if (elevFields.length === 0) return [];

  const results = [];
  for (const spec of APP.specimens) {
    const cached = tableDataCache[spec.filename];
    if (!cached) continue;
    const cop90 = parseFloat(cached.COP90_elevation_m);
    if (isNaN(cop90)) continue;

    const idx = specimenIndexMap.get(spec.filename);

    for (const field of elevFields) {
      const val = getCurrentFieldValue(spec, field);
      if (!val || val.trim() === '') continue;
      const elev = parseFloat(val);
      if (isNaN(elev)) continue;

      const diff = Math.abs(elev - cop90);
      let status, statusCls;
      if (elev > 8800) {
        status = 'Must be feet or error';
        statusCls = 'elev-error';
      } else if (diff > 1000) {
        status = 'Check 1000+';
        statusCls = 'elev-warn-high';
      } else if (diff > 500) {
        status = 'Check 500-1000';
        statusCls = 'elev-warn';
      } else {
        status = 'Nominal <500';
        statusCls = 'elev-ok';
      }

      results.push({ filename: spec.filename, index: idx, field, value: elev, cop90, diff: Math.round(diff), status, statusCls });
    }
  }
  return results;
}

function initFocusElevCalc() {
  const metersEl = document.getElementById('focus-elev-meters');
  const feetEl = document.getElementById('focus-elev-feet');
  if (!metersEl || !feetEl) return;

  metersEl.addEventListener('input', () => {
    const m = parseFloat(metersEl.textContent.replace(/[^\d.\-]/g, ''));
    feetEl.textContent = isNaN(m) ? '' : (m * 3.28084).toFixed(1);
  });
  feetEl.addEventListener('input', () => {
    const ft = parseFloat(feetEl.textContent.replace(/[^\d.\-]/g, ''));
    metersEl.textContent = isNaN(ft) ? '' : (ft / 3.28084).toFixed(1);
  });

  // Copy buttons
  document.querySelectorAll('#focus-elev-calc .elev-copyable').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        navigator.clipboard.writeText(target.textContent.replace(/\s*(m|ft)$/, '').trim());
        const toast = document.getElementById('focus-elev-toast');
        if (toast) { toast.classList.add('visible'); setTimeout(() => toast.classList.remove('visible'), 1200); }
      }
    });
  });
}

function updateFocusElevCalcForSpecimen(index) {
  const spec = APP.specimens[index];
  if (!spec) return;
  const cached = tableDataCache[spec.filename];
  if (!cached) return;

  // Find elevation from formatted_json
  const fj = cached.formatted_json || {};
  let elevMeters = '';
  for (const [key, val] of Object.entries(fj)) {
    if (/elevation|altitude/i.test(key) && val !== '' && val !== undefined) {
      const num = parseFloat(String(val));
      if (!isNaN(num)) { elevMeters = num; break; }
    }
  }
  const metersEl = document.getElementById('focus-elev-meters');
  const feetEl = document.getElementById('focus-elev-feet');
  if (metersEl) metersEl.textContent = elevMeters !== '' ? elevMeters : '';
  if (feetEl) feetEl.textContent = elevMeters !== '' ? (elevMeters * 3.28084).toFixed(1) : '';

  // COP90
  const cop90 = cached.COP90_elevation_m;
  const cop90Section = document.getElementById('focus-cop90-section');
  if (cop90 !== undefined && cop90 !== '' && cop90 !== 'None' && !isNaN(parseFloat(cop90))) {
    const copVal = parseFloat(cop90);
    if (cop90Section) cop90Section.style.display = '';
    const copM = document.getElementById('focus-cop90-meters');
    const copFt = document.getElementById('focus-cop90-feet');
    if (copM) copM.textContent = copVal + ' m';
    if (copFt) copFt.textContent = (copVal * 3.28084).toFixed(1) + ' ft';
  } else {
    if (cop90Section) cop90Section.style.display = 'none';
  }
}

function renderElevationDiscrepancySection() {
  const container = document.getElementById('focus-elevation-list');
  if (!container) return;
  if (focusToolCategory !== 'elevation') { container.innerHTML = ''; return; }

  const items = analyzeElevationDiscrepancy();
  if (items.length === 0) {
    container.innerHTML = '<div class="focus-no-clusters">No elevation data to compare with COP90</div>';
    return;
  }

  container.innerHTML = `
    <div class="focus-specimen-header" style="position:sticky;top:0;z-index:1">
      <span style="min-width:24px">#</span>
      <span style="flex:1">Filename</span>
      <span style="min-width:60px;text-align:right">Field</span>
      <span style="min-width:60px;text-align:right">Value</span>
      <span style="min-width:60px;text-align:right">COP90</span>
      <span style="min-width:50px;text-align:right">Diff</span>
      <span style="min-width:100px;text-align:center">Status</span>
    </div>
    ${items.map(item => `
      <div class="focus-specimen-row focus-clickable-row" data-index="${item.index}">
        <span style="font-size:10px;color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
        <span class="spec-filename">${escapeHtml(item.filename)}</span>
        <span style="font-size:10px;color:var(--text-muted);min-width:60px;text-align:right">${escapeHtml(item.field)}</span>
        <span style="font-family:var(--font-mono);font-size:11px;min-width:60px;text-align:right">${item.value}</span>
        <span style="font-family:var(--font-mono);font-size:11px;min-width:60px;text-align:right;color:var(--text-muted)">${item.cop90}</span>
        <span style="font-family:var(--font-mono);font-size:11px;min-width:50px;text-align:right">${item.diff}m</span>
        <span class="elev-status ${item.statusCls}">${item.status}</span>
      </div>
    `).join('')}
  `;

  container.querySelectorAll('.focus-clickable-row').forEach(row => {
    row.addEventListener('click', () => loadFocusImage(parseInt(row.dataset.index)));
  });
}

function updateSidebarFieldColors() {
  const activeFields = focusToolCategory ? new Set(getEditorToolFields(focusToolCategory)) : new Set();
  document.querySelectorAll('.focus-field-name').forEach(el => {
    const field = el.closest('.focus-field-item')?.dataset.field;
    el.classList.toggle('tool-active-field', field && activeFields.has(field));
  });
}

function renderToolFieldToggle() {
  const bar = document.getElementById('focus-tool-field-bar');
  if (!bar) return;

  if (!focusToolCategory) {
    bar.innerHTML = '';
    return;
  }

  const fields = getEditorToolFields(focusToolCategory);

  // Show add button even when no fields exist
  if (fields.length === 0) {
    bar.innerHTML = `
      <button class="btn-sm focus-field-add-btn" id="focus-field-add" title="Add a field to this tool">+</button>
      <span style="font-size:11px;color:var(--text-muted)">No fields assigned — click + to add</span>
    `;
    document.getElementById('focus-field-add')?.addEventListener('click', () => {
      showAddFieldPopup(focusToolCategory, fields);
    });
    return;
  }

  // If current field isn't in this tool's fields, select the first one
  const activeField = fields.includes(focusField) ? focusField : fields[0];
  if (activeField !== focusField) {
    focusField = activeField;
    focusFilter = null;
  }

  const sw = createSlideSwitch('focus-tool-field-switch', fields.map(f => ({
    value: f,
    label: f
  })), activeField, (val) => {
    focusField = val;
    focusFilter = null;
    // Update sidebar selection
    const sidebar = document.getElementById('focus-sidebar');
    if (sidebar) {
      sidebar.querySelectorAll('.focus-field-item').forEach(i => {
        i.classList.toggle('active', i.dataset.field === val);
      });
    }
    renderFocusMain();
  });

  bar.innerHTML = `
    <button class="btn-sm focus-field-add-btn" id="focus-field-add" title="Add a field to this tool">+</button>
    ${sw.html}
    <button class="btn-sm focus-field-remove-btn" id="focus-field-remove" title="Remove selected field from this tool">&minus;</button>
  `;
  sw.setup();

  // Style the toggle with blue theme
  const switchEl = bar.querySelector('.slide-switch');
  if (switchEl) switchEl.classList.add('slide-switch-blue');

  // Add field button
  document.getElementById('focus-field-add')?.addEventListener('click', () => {
    showAddFieldPopup(focusToolCategory, fields);
  });

  // Remove field button
  document.getElementById('focus-field-remove')?.addEventListener('click', () => {
    if (!focusField || !focusToolCategory) return;
    if (!fields.includes(focusField)) return;
    if (!APP.state.toolFieldOverrides) APP.state.toolFieldOverrides = {};
    const cat = focusToolCategory.toLowerCase();
    if (!APP.state.toolFieldOverrides[cat]) APP.state.toolFieldOverrides[cat] = {};
    if (!APP.state.toolFieldOverrides[cat].removed) APP.state.toolFieldOverrides[cat].removed = [];
    if (!APP.state.toolFieldOverrides[cat].removed.includes(focusField)) {
      APP.state.toolFieldOverrides[cat].removed.push(focusField);
    }
    // Also remove from added if it was user-added
    if (APP.state.toolFieldOverrides[cat].added) {
      APP.state.toolFieldOverrides[cat].added = APP.state.toolFieldOverrides[cat].added.filter(f => f !== focusField);
    }
    scheduleSaveState();
    focusField = null;
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  });
}

function showAddFieldPopup(category, currentFields) {
  // Get all available fields
  const first = APP.specimens[0] ? tableDataCache[APP.specimens[0].filename] : null;
  const allFields = first ? Object.keys(first.formatted_json || {}) : [];
  const available = allFields.filter(f => !currentFields.includes(f));

  if (available.length === 0) {
    alert('All fields are already assigned to this tool.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:16px;max-width:350px;max-height:70vh;display:flex;flex-direction:column;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">Add field to ${escapeHtml(category)}</div>
      <div style="overflow-y:auto;flex:1">
        ${available.map(f => `
          <div class="add-field-option" data-field="${escapeAttr(f)}" style="padding:6px 12px;cursor:pointer;font-size:12px;font-family:var(--font-mono);color:var(--cat-0);border-radius:var(--radius-sm)">
            ${escapeHtml(f)}
          </div>
        `).join('')}
      </div>
      <div style="margin-top:10px;text-align:right">
        <button class="btn-sm" id="add-field-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('add-field-cancel').addEventListener('click', () => overlay.remove());

  overlay.querySelectorAll('.add-field-option').forEach(opt => {
    opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)'; });
    opt.addEventListener('mouseleave', () => { opt.style.background = ''; });
    opt.addEventListener('click', () => {
      const field = opt.dataset.field;
      if (!APP.state.toolFieldOverrides) APP.state.toolFieldOverrides = {};
      const cat = category.toLowerCase();
      if (!APP.state.toolFieldOverrides[cat]) APP.state.toolFieldOverrides[cat] = {};
      if (!APP.state.toolFieldOverrides[cat].added) APP.state.toolFieldOverrides[cat].added = [];
      if (!APP.state.toolFieldOverrides[cat].added.includes(field)) {
        APP.state.toolFieldOverrides[cat].added.push(field);
      }
      // Remove from removed list if it was there
      if (APP.state.toolFieldOverrides[cat].removed) {
        APP.state.toolFieldOverrides[cat].removed = APP.state.toolFieldOverrides[cat].removed.filter(f => f !== field);
      }
      scheduleSaveState();
      overlay.remove();
      focusField = field;
      renderFocusSidebar(getFocusCategories());
      renderFocusMain();
    });
  });
}

function applyFocusToolCategory(container) {
  const cat = focusToolCategory;
  const rows = container.querySelectorAll('.focus-tool-row');
  let prevVisible = null;
  // Remove old dynamic resize handles
  container.querySelectorAll('.focus-v-resize-dynamic').forEach(h => h.remove());

  rows.forEach(row => {
    const cats = (row.dataset.toolCats || '').split(',');
    const visible = cat ? cats.includes(cat) : false;
    row.style.display = visible ? '' : 'none';
    if (visible && prevVisible) {
      // Insert a resize handle between consecutive visible rows
      const handle = document.createElement('div');
      handle.className = 'focus-v-resize focus-v-resize-dynamic';
      handle.dataset.above = prevVisible.id;
      handle.dataset.below = row.id;
      row.parentNode.insertBefore(handle, row);
    }
    if (visible) prevVisible = row;
  });

  // Re-init resize handles for the newly inserted ones
  initFocusVerticalResizeHandles(container);
}

function renderFocusMain() {
  invalidateFieldIssueCounts(); // fresh counts for this render cycle

  const el = document.getElementById('focus-main');
  if (!el || !focusField) {
    if (el) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Select a field from the sidebar</div>';
    return;
  }

  // Auto-select first field for active tool category if needed
  if (focusToolCategory) {
    const toolFields = getEditorToolFields(focusToolCategory);
    if (toolFields.length > 0 && !toolFields.includes(focusField)) {
      focusField = toolFields[0];
      focusFilter = null;
    }
  }

  const fieldValues = getAllValuesForField(focusField);

  // If a value is selected, filter clusters/tools to that value's context
  const clusterInput = focusFilter !== null
    ? fieldValues.filter(v => v.value === focusFilter || ngramSimilarity(v.value, focusFilter) > 0.5)
    : fieldValues;
  const clusters = fingerprintCluster(clusterInput);

  // Build facet data
  const valueCounts = {};
  for (const { value } of fieldValues) {
    valueCounts[value || ''] = (valueCounts[value || ''] || 0) + 1;
  }
  const facets = Object.entries(valueCounts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  const maxCount = facets.length > 0 ? facets[0].count : 1;

  const clusteredValues = new Set();
  for (const c of clusters) for (const v of c.variants) clusteredValues.add(v.value);

  // Date format analysis
  const dateFormats = analyzeDateFormats(fieldValues);
  // Catalog pattern analysis
  const catalogPatterns = analyzeCatalogPatterns(fieldValues);

  const fixedSection = (key, title, badgeHtml, bodyHtml, extraHtml = '') => `
    <div class="focus-section" data-section="${key}">
      <div class="collapsible-panel" style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
        <div class="focus-section-header focus-section-header-fixed" data-section="${key}">
          <span>${title}${badgeHtml}</span>
          ${extraHtml}
        </div>
        <div class="focus-section-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  const section = (key, title, badgeHtml, bodyHtml, extraHtml = '') => `
    <div class="focus-section ${focusSectionState[key] ? 'minimized' : ''}" data-section="${key}">
      <div class="collapsible-panel" style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
        <div class="focus-section-header" data-section="${key}">
          <span>${title}${badgeHtml}</span>
          ${extraHtml}
          <span class="section-arrow">${focusSectionState[key] ? '&#9654;' : '&#9660;'}</span>
        </div>
        <div class="focus-section-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  el.innerHTML = `
    <div class="focus-toolbar">
      <div class="find-replace-row">
        <input type="text" id="focus-find" placeholder="Find...">
        <span style="color:var(--text-muted)">&#8594;</span>
        <input type="text" id="focus-replace" placeholder="Replace...">
        <button class="btn-sm" id="focus-apply-replace">Apply</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <button class="btn-sm" id="focus-title-case">Title Case</button>
        <button class="btn-sm" id="focus-upper-case">UPPER</button>
        <button class="btn-sm" id="focus-lower-case">lower</button>
      </div>
      <div id="focus-scope-switch-container" style="margin-left:auto"></div>
      <div class="focus-key">
        <span class="focus-key-item"><span class="focus-key-swatch" style="background:#000"></span>pending</span>
        <span class="focus-key-item"><span class="focus-key-swatch" style="background:var(--warning)"></span>unconfirmed</span>
        <span class="focus-key-item"><span class="focus-key-swatch" style="background:var(--accent)"></span>added</span>
        <span class="focus-key-item"><span class="focus-key-swatch" style="background:#2d5a7a"></span>edited</span>
        <span class="focus-key-item"><span class="focus-key-swatch" style="background:transparent;border:1px solid var(--border)"></span>confirmed</span>
      </div>
    </div>

    <div class="focus-top-row" id="focus-row-0">
      ${fixedSection('values', 'Values', ` &middot; ${facets.length} unique`, `
        <div class="facet-list">
          ${facets.map(f => `
            <div class="facet-row ${focusFilter === f.value ? 'active' : ''}" data-value="${escapeAttr(f.value)}">
              <span class="facet-value ${f.value === '' ? 'empty-val' : ''}">${f.value === '' ? '(empty)' : escapeHtml(f.value)}</span>
              <div class="facet-bar-container"><div class="facet-bar" style="width:${(f.count / maxCount) * 100}%"></div></div>
              <span class="facet-count">${f.count}</span>
              ${clusteredValues.has(f.value) ? '<span class="facet-flag">!</span>' : ''}
            </div>
          `).join('')}
        </div>
      `)}
      ${fixedSection('specimens', 'Specimens', focusFilter !== null ? ' &middot; filtered' : '', `
        <div class="focus-specimens-list" id="focus-specimens-list"></div>
      `, '<span style="flex:1"></span><span style="font-size:9px;font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0">Click text to edit</span>')}
    </div>

    <div class="focus-v-resize" id="focus-v-resize-top" data-above="focus-row-0" data-below="focus-tools-area"></div>

    <div class="focus-tools-area" id="focus-tools-area">
      <div class="focus-tool-category-bar">
        <div id="focus-tool-category-switch-container"></div>
      </div>
      <div class="focus-tool-field-bar" id="focus-tool-field-bar"></div>

      <div class="focus-tool-sections" id="focus-tool-sections">
      <div class="focus-row focus-tool-row" id="focus-row-1" data-tool-cats="cluster">
      ${section('clusters', 'Clusters', clusters.length > 0 ? ` &middot; <span style="color:var(--warning)">${clusters.length}</span>` : '', `
        ${clusters.length === 0
          ? '<div class="focus-no-clusters">No inconsistencies detected</div>'
          : clusters.map((c, ci) => `
            <div class="cluster-group">
              <div class="cluster-values">
                ${c.variants.map(v => `<span class="cluster-chip" data-filter-value="${escapeAttr(v.value)}" style="cursor:pointer" title="Click to filter">${escapeHtml(v.value)}<span class="chip-count">&times;${v.count}</span></span>`).join('')}
              </div>
              <div class="cluster-merge-row">
                <span style="font-size:11px;color:var(--text-muted)">Merge to:</span>
                <input type="text" class="cluster-merge-input" id="cluster-input-${ci}" value="${escapeAttr(c.bestValue)}">
                <button class="btn-sm btn-primary" data-cluster="${ci}">Merge</button>
              </div>
            </div>
          `).join('')}
      `)}
      </div>

      <div class="focus-row focus-tool-row" id="focus-row-2" data-tool-cats="dates">
      ${section('dates', 'Date Formats', dateFormats.formats.length > 0 ? ` &middot; ${dateFormats.formats.length} formats${dateFormats.inconsistent ? ' <span style="color:var(--warning)">!</span>' : ''}` : '', `
      ${dateFormats.formats.length === 0
        ? '<div class="focus-no-clusters">No date patterns detected</div>'
        : dateFormats.formats.map((f, fi) => {
          const isDominant = fi === 0;
          return `
            <div style="border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-tertiary)">
                <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:${isDominant ? 'var(--text-primary)' : 'var(--warning)'}">${escapeHtml(f.pattern)}</span>
                <div class="facet-bar-container"><div class="facet-bar" style="width:${(f.count / dateFormats.maxCount) * 100}%"></div></div>
                <span style="font-size:10px;color:var(--text-muted)">${f.count}</span>
                ${!isDominant ? '<span style="font-size:9px;color:var(--warning)">minority</span>' : ''}
              </div>
              <div>
                ${f.items.map(item => `
                  <div class="focus-specimen-row focus-clickable-row" data-index="${item.index}" style="padding:2px 12px 2px 24px">
                    <span style="font-size:10px;color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
                    <span class="spec-filename">${escapeHtml(item.filename)}</span>
                    <span class="spec-value focus-editable-cell" data-index="${item.index}" data-field="${escapeAttr(focusField)}" style="${!isDominant ? 'color:var(--accent)' : ''}">${escapeHtml(item.value)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
    `)}
    </div>

      <div class="focus-row focus-tool-row" id="focus-row-std" data-tool-cats="taxonomy,geography,collectors,coordinates">
      ${fixedSection('standardize', 'Standardization Tools', '', `
        <div id="focus-standardize-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row" id="focus-row-auth" data-tool-cats="taxonomy">
      ${fixedSection('authorship', 'Authorship Detection', '', `
        <div id="focus-authorship-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row" id="focus-row-3" data-tool-cats="patterns">
      ${section('catalog', 'Catalog Patterns', catalogPatterns.patterns.length > 0 ? ` &middot; ${catalogPatterns.patterns.length > 1 ? '<span style="color:var(--warning)">' + catalogPatterns.patterns.slice(1).reduce((s, p) => s + p.count, 0) + ' outliers</span>' : 'consistent'}` : '', `
      ${catalogPatterns.patterns.length === 0
        ? '<div class="focus-no-clusters">No catalog patterns detected</div>'
        : catalogPatterns.patterns.map((p, pi) => {
          const isDominant = pi === 0;
          return `
            <div style="border-bottom:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-tertiary)">
                <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:${isDominant ? 'var(--text-primary)' : 'var(--warning)'}">${escapeHtml(p.pattern)}</span>
                <span style="font-size:10px;color:var(--text-muted)">(e.g. ${escapeHtml(p.example)})</span>
                <div class="facet-bar-container" style="margin-left:auto"><div class="facet-bar" style="width:${(p.count / catalogPatterns.maxCount) * 100}%"></div></div>
                <span style="font-size:10px;color:var(--text-muted)">${p.count}</span>
              </div>
              <div>
                ${p.items.map(item => `
                  <div class="focus-specimen-row focus-clickable-row" data-index="${item.index}" style="padding:2px 12px 2px 24px">
                    <span style="font-size:10px;color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
                    <span class="spec-filename">${escapeHtml(item.filename)}</span>
                    <span class="spec-value focus-editable-cell" data-index="${item.index}" data-field="${escapeAttr(focusField)}" style="${!isDominant ? 'color:var(--accent)' : ''}">${escapeHtml(item.value)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
    `)}
      </div>

      <div class="focus-row focus-tool-row" id="focus-row-elev" data-tool-cats="elevation" style="display:flex;flex-direction:column">
        ${fixedSection('elevation', 'Elevation Discrepancy', '', `
          <div id="focus-elevation-list"></div>
        `)}
        <div class="focus-elev-calc" id="focus-elev-calc">
          <div class="elev-calculator" style="border-top:1px solid var(--border)">
            <div class="elev-calc-section">
              <div class="elev-calc-title">Elevation Calculator</div>
              <div class="elev-calc-fields">
                <div class="elev-calc-field">
                  <label>Meters</label>
                  <div class="elev-calc-input" contenteditable="true" id="focus-elev-meters"></div>
                  <button class="elev-copy-btn elev-copyable" data-target="focus-elev-meters">copy</button>
                </div>
                <div class="elev-calc-arrow">&#8596;</div>
                <div class="elev-calc-field">
                  <label>Feet</label>
                  <div class="elev-calc-input" contenteditable="true" id="focus-elev-feet"></div>
                  <button class="elev-copy-btn elev-copyable" data-target="focus-elev-feet">copy</button>
                </div>
              </div>
            </div>
            <div class="elev-toast" id="focus-elev-toast">Copied to clipboard</div>
            <div class="elev-cop90-section" id="focus-cop90-section" style="display:none">
              <div class="elev-calc-title">COP90 at GPS Location</div>
              <div class="elev-cop90-values">
                <div class="elev-cop90-item">
                  <span id="focus-cop90-meters">—</span>
                  <button class="elev-copy-btn elev-copyable" data-target="focus-cop90-meters">copy</button>
                </div>
                <span class="elev-cop90-sep">|</span>
                <div class="elev-cop90-item">
                  <span id="focus-cop90-feet">—</span>
                  <button class="elev-copy-btn elev-copyable" data-target="focus-cop90-feet">copy</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  `;

  // Apply tool category visibility
  applyFocusToolCategory(el);

  // Wire section header toggles (only collapsible ones with arrows)
  el.querySelectorAll('.focus-section-header:not(.focus-section-header-fixed)').forEach(header => {
    header.addEventListener('click', () => {
      const key = header.dataset.section;
      focusSectionState[key] = !focusSectionState[key];
      const sec = header.closest('.focus-section');
      sec.classList.toggle('minimized');
      header.querySelector('.section-arrow').innerHTML = focusSectionState[key] ? '&#9654;' : '&#9660;';

      // Reset the parent row's explicit height so flex layout takes over
      const row = sec.closest('.focus-row, .focus-top-row');
      if (row) {
        row.style.height = '';
        row.style.flex = '';
      }
    });
  });

  // Wire vertical resize handles between rows
  initFocusVerticalResizeHandles(el);

  // Wire facet clicks — re-render everything when a value is selected
  el.querySelectorAll('.facet-row').forEach(row => {
    row.addEventListener('click', () => {
      const val = row.dataset.value;
      focusFilter = (focusFilter === val) ? null : val;
      renderFocusMain();
    });
  });

  // Wire merge buttons
  el.querySelectorAll('.cluster-group button[data-cluster]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = parseInt(btn.dataset.cluster);
      const input = document.getElementById(`cluster-input-${ci}`);
      mergeCluster(clusters[ci], input.value);
    });
  });

  // Wire cluster chip clicks to filter specimens
  el.querySelectorAll('.cluster-chip[data-filter-value]').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = chip.dataset.filterValue;
      focusFilter = (focusFilter === val) ? null : val;
      renderFocusMain();
    });
  });

  // Wire find & replace
  document.getElementById('focus-apply-replace')?.addEventListener('click', () => {
    const findVal = document.getElementById('focus-find').value;
    const replaceVal = document.getElementById('focus-replace').value;
    if (findVal === '') return;
    applyFindReplace(findVal, replaceVal);
  });

  // Wire case transforms
  document.getElementById('focus-title-case')?.addEventListener('click', () => applyCaseTransform('title'));
  document.getElementById('focus-upper-case')?.addEventListener('click', () => applyCaseTransform('upper'));
  document.getElementById('focus-lower-case')?.addEventListener('click', () => applyCaseTransform('lower'));

  // Scope switch
  const fieldLabel = focusFilter !== null ? 'Field (Filtered)' : 'Field';
  const scopeSw = createSlideSwitch('focus-scope-switch', [
    { value: 'field', label: fieldLabel },
    { value: 'everything', label: 'Everything' }
  ], focusToolScope, (val) => { focusToolScope = val; });
  const scopeContainer = document.getElementById('focus-scope-switch-container');
  if (scopeContainer) { scopeContainer.innerHTML = scopeSw.html; scopeSw.setup(); }

  // Tool category switch (supports deselection by clicking active option)
  const toolCats = getEditorToolCategories();
  if (focusToolCategory && !toolCats.includes(focusToolCategory)) {
    focusToolCategory = null;
  }
  const prevCat = focusToolCategory;
  const catOptions = toolCats.map(c => ({
    value: c,
    label: c.charAt(0).toUpperCase() + c.slice(1)
  }));
  const catSw = createSlideSwitch('focus-tool-category-switch', catOptions, focusToolCategory || '', (val) => {
    if (val === prevCat) {
      // Clicking the already-active option deselects
      focusToolCategory = null;
    } else {
      focusToolCategory = val;
      // Auto-select first field for this tool category
      const fields = getEditorToolFields(val);
      if (fields.length > 0 && !fields.includes(focusField)) {
        focusField = fields[0];
        focusFilter = null;
      }
    }
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  });
  const catContainer = document.getElementById('focus-tool-category-switch-container');
  if (catContainer) {
    catContainer.innerHTML = catSw.html;
    catSw.setup();
  }

  // Field toggle for selected tool category
  renderToolFieldToggle();

  // Update sidebar field name colors based on active tool
  updateSidebarFieldColors();

  // Wire all clickable specimen rows — click row for image, click value to edit
  el.querySelectorAll('.focus-clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      loadFocusImage(parseInt(row.dataset.index));
    });
  });

  el.querySelectorAll('.focus-editable-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(cell.dataset.index);
      loadFocusImage(idx);
      startFocusCellEdit(cell, idx, cell.dataset.field);
    });
  });

  renderFocusSpecimens(fieldValues);
  renderStandardizeSection();
  renderAuthorshipSection();
  renderElevationDiscrepancySection();
  initFocusElevCalc();
  renderFocusCarousel(fieldValues);
  updateFocusPrimaryState();
  updateFocusConfirmButtons();
}

// ── Date Format Analyzer ────────────────────────────────────

function analyzeDateFormats(fieldValues) {
  const datePatterns = [
    { regex: /^\d{4}-\d{2}-\d{2}$/, name: 'YYYY-MM-DD' },
    { regex: /^\d{4}\/\d{2}\/\d{2}$/, name: 'YYYY/MM/DD' },
    { regex: /^\d{2}-\d{2}-\d{4}$/, name: 'DD-MM-YYYY' },
    { regex: /^\d{2}\/\d{2}\/\d{4}$/, name: 'DD/MM/YYYY' },
    { regex: /^\d{2}\.\d{2}\.\d{4}$/, name: 'DD.MM.YYYY' },
    { regex: /^\d{1,2}\s+\w+\s+\d{4}$/, name: 'D Month YYYY' },
    { regex: /^\w+\s+\d{1,2},?\s+\d{4}$/, name: 'Month D, YYYY' },
    { regex: /^\d{4}-\d{2}-00$/, name: 'YYYY-MM-00 (partial)' },
    { regex: /^\d{4}-00-00$/, name: 'YYYY-00-00 (year only)' },
    { regex: /^0000-00-00$/, name: '0000-00-00 (unknown)' },
  ];

  // Group specimens by format
  const groups = {}; // formatName -> [{value, filename, index}]

  for (const item of fieldValues) {
    if (!item.value || item.value.trim() === '') continue;
    let matched = false;
    for (const p of datePatterns) {
      if (p.regex.test(item.value.trim())) {
        if (!groups[p.name]) groups[p.name] = [];
        groups[p.name].push(item);
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (!groups['other']) groups['other'] = [];
      groups['other'].push(item);
    }
  }

  const formats = Object.entries(groups)
    .map(([pattern, items]) => ({ pattern, count: items.length, items }))
    .sort((a, b) => b.count - a.count);

  const maxCount = formats.length > 0 ? formats[0].count : 1;
  const dominantFormat = formats.length > 0 ? formats[0].pattern : '';
  const inconsistent = formats.length > 1;

  return { formats, maxCount, dominantFormat, inconsistent };
}

// ── Catalog Pattern Analyzer ────────────────────────────────

function catalogToPattern(val) {
  if (!val) return '';
  return val.replace(/[A-Z]+/g, 'AAA')
            .replace(/[a-z]+/g, 'aaa')
            .replace(/\d+/g, 'NNN')
            .replace(/\s+/g, ' ');
}

function analyzeCatalogPatterns(fieldValues) {
  const groups = {}; // pattern -> [{value, filename, index}]

  for (const item of fieldValues) {
    if (!item.value || item.value.trim() === '') continue;
    const p = catalogToPattern(item.value);
    if (!groups[p]) groups[p] = [];
    groups[p].push(item);
  }

  const patterns = Object.entries(groups)
    .map(([pattern, items]) => ({ pattern, count: items.length, items, example: items[0].value }))
    .sort((a, b) => b.count - a.count);

  const maxCount = patterns.length > 0 ? patterns[0].count : 1;
  const dominantPattern = patterns.length > 0 ? patterns[0].pattern : '';

  return { patterns, maxCount, dominantPattern };
}

function renderFocusSpecimens(cachedFieldValues) {
  const list = document.getElementById('focus-specimens-list');
  if (!list) return;

  const fieldValues = cachedFieldValues || getAllValuesForField(focusField);
  const filtered = focusFilter !== null
    ? fieldValues.filter(v => v.value === focusFilter)
    : fieldValues;

  list.innerHTML = `
    <div class="focus-specimen-header">
      <span class="focus-spec-hdr-status">Status</span>
      <span class="focus-spec-hdr-filename">Filename</span>
      <span class="focus-spec-hdr-field">${escapeHtml(focusField)}</span>
    </div>
  ` + filtered.map(v => {
    const stCls = v.cellState === 'limbo' ? 'focus-cell-limbo' : (v.cellState === 'accepted' ? 'focus-cell-accepted' : 'focus-cell-unaccepted');
    const valDisplay = v.value === '' ? '<span class="cell-empty-placeholder">(empty)</span>' : escapeHtml(v.value);
    // Flair color based on state
    let flairColor;
    if (v.cellState === 'limbo') {
      flairColor = 'var(--warning)';
    } else if (v.cellState === 'accepted') {
      const src = APP.state.specimens[v.filename]?.accepted_fields?.[focusField]?.source || 'ai';
      if (src === 'edited') flairColor = '#2d5a7a';
      else if (src === 'user_added') flairColor = 'var(--accent)';
      else if (src === 'confirmed_empty') flairColor = 'var(--bg-tertiary)';
      else flairColor = 'transparent';
    } else {
      flairColor = '#000';
    }
    const isFlagged = APP.state.specimens[v.filename]?.flagged;
    return `
      <div class="focus-specimen-row focus-clickable-row" data-index="${v.index}">
        <span style="font-size:10px;color:var(--text-muted);min-width:24px">#${v.index + 1}</span>
        <span class="focus-flag ${isFlagged ? 'flagged' : ''}" data-index="${v.index}" title="${isFlagged ? 'Unflag specimen' : 'Flag specimen'}">${isFlagged ? '&#9873;' : '&#9872;'}</span>
        <span class="focus-goto" data-index="${v.index}" title="Open in form view">&#9998;</span>
        <span class="focus-flair" style="background:${flairColor}"></span>
        <span class="spec-filename">${escapeHtml(v.filename)}</span>
        <span class="spec-value focus-editable-cell ${stCls}" data-index="${v.index}" data-field="${escapeAttr(focusField)}">${valDisplay}</span>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.focus-specimen-row').forEach(row => {
    row.addEventListener('click', () => {
      loadFocusImage(parseInt(row.dataset.index));
    });
  });

  list.querySelectorAll('.focus-flag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const spec = APP.specimens[idx];
      const st = APP.state.specimens[spec.filename];
      if (!st) return;
      st.flagged = !st.flagged;
      // Update icon immediately
      btn.classList.toggle('flagged', st.flagged);
      btn.innerHTML = st.flagged ? '&#9873;' : '&#9872;';
      btn.title = st.flagged ? 'Unflag specimen' : 'Flag specimen';
      updateNavBar();
      scheduleAutoSaveReviewed(spec.filename);
      if (st.flagged) {
        setTimeout(() => {
          const note = prompt('Flag note (optional):');
          st.flag_note = note || '';
          scheduleSaveState();
        }, 50);
      } else {
        st.flag_note = '';
        scheduleSaveState();
      }
    });
  });

  list.querySelectorAll('.focus-goto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      showView('review');
      loadSpecimen(idx);
    });
  });

  list.querySelectorAll('.focus-editable-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      loadFocusImage(parseInt(cell.dataset.index));
      startFocusCellEdit(cell, parseInt(cell.dataset.index), cell.dataset.field);
    });
  });
}

function renderFocusCarousel(cachedFieldValues) {
  const carousel = document.getElementById('focus-carousel');
  if (!carousel) return;

  // Use same filtered list as specimens section
  const fieldValues = cachedFieldValues || (focusField ? getAllValuesForField(focusField) : []);
  const filtered = focusFilter !== null
    ? fieldValues.filter(v => v.value === focusFilter)
    : fieldValues;

  const sz = focusThumbSize;
  carousel.innerHTML = `
    <div class="focus-carousel-zoom">
      <button id="carousel-zoom-in">+</button>
      <button id="carousel-zoom-out">&minus;</button>
    </div>
    ${filtered.map(v => `
      <div class="focus-carousel-thumb ${v.index === tableSelectedIndex ? 'active' : ''}" data-index="${v.index}" style="width:${sz}px;height:${sz}px">
        <div class="thumb-placeholder">${escapeHtml(v.filename.replace(/\.[^.]+$/, '').slice(0, 12))}</div>
      </div>
    `).join('')}
  `;

  // Mouse wheel → horizontal scroll
  carousel.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      carousel.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // Zoom handlers
  const step = 32;
  document.getElementById('carousel-zoom-in')?.addEventListener('click', () => {
    focusThumbSize = Math.min(256, focusThumbSize + step);
    applyCarouselThumbSize();
  });
  document.getElementById('carousel-zoom-out')?.addEventListener('click', () => {
    focusThumbSize = Math.max(52, focusThumbSize - step);
    applyCarouselThumbSize();
  });

  // Attach click handlers
  carousel.querySelectorAll('.focus-carousel-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      loadFocusImage(parseInt(thumb.dataset.index));
    });
  });

  // Lazy-load thumbnail images only when visible
  if (carousel._thumbObserver) carousel._thumbObserver.disconnect();
  carousel._thumbObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const thumb = entry.target;
      if (thumb.dataset.loaded) continue;
      thumb.dataset.loaded = '1';
      carousel._thumbObserver.unobserve(thumb);
      const idx = parseInt(thumb.dataset.index);
      const spec = APP.specimens[idx];
      if (!spec) continue;
      window.api.getImage(APP.folderPath, spec.filename, tableImageType).then(dataUrl => {
        if (dataUrl && thumb.isConnected) {
          thumb.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(spec.filename)}">`;
        }
      });
    }
  }, { root: carousel, rootMargin: '100px' });

  carousel.querySelectorAll('.focus-carousel-thumb').forEach(thumb => {
    carousel._thumbObserver.observe(thumb);
  });
}

function applyCarouselThumbSize() {
  const sz = focusThumbSize;
  document.querySelectorAll('.focus-carousel-thumb').forEach(thumb => {
    thumb.style.width = sz + 'px';
    thumb.style.height = sz + 'px';
  });
}

function updateFocusPrimaryState() {
  // Update specimen rows
  document.querySelectorAll('.focus-specimen-row').forEach(row => {
    const idx = parseInt(row.dataset.index);
    row.classList.toggle('is-primary', idx === tableSelectedIndex);
  });
  // Update carousel active state
  document.querySelectorAll('.focus-carousel-thumb').forEach(thumb => {
    const idx = parseInt(thumb.dataset.index);
    thumb.classList.toggle('active', idx === tableSelectedIndex);
    if (idx === tableSelectedIndex) {
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });
  // Highlight matching facet row for primary specimen's value
  const primarySpec = APP.specimens[tableSelectedIndex];
  if (primarySpec && focusField) {
    const primaryVal = getCurrentFieldValue(primarySpec, focusField);
    document.querySelectorAll('.facet-row').forEach(row => {
      const facetVal = row.dataset.value || '';
      row.classList.toggle('is-primary', facetVal === primaryVal);
    });
  }
}

async function loadFocusImage(index) {
  const container = document.getElementById('focus-image-container');
  if (!container || index < 0 || index >= APP.specimens.length) return;
  tableSelectedIndex = index;
  const spec = APP.specimens[index];
  container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
  updateFocusPrimaryState();
  updateFocusElevCalcForSpecimen(index);
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, tableImageType);
  if (dataUrl) {
    container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(spec.filename)}">`;
    container.querySelector('img').addEventListener('click', () => openImageModal(dataUrl));
  } else {
    container.innerHTML = '<div class="table-image-placeholder">No image</div>';
  }
}

function startFocusCellEdit(cell, specimenIndex, fieldName) {
  if (cell.querySelector('input, textarea')) return;

  const spec = APP.specimens[specimenIndex];
  const currentValue = getCurrentFieldValue(spec, fieldName);

  const originalText = cell.textContent;
  const originalStyle = cell.getAttribute('style') || '';

  // Allow text wrapping during edit
  cell.style.whiteSpace = 'normal';
  cell.style.overflow = 'visible';
  cell.style.textOverflow = 'unset';
  cell.innerHTML = `<textarea class="cell-edit-input" style="font-size:11px;padding:2px 4px;width:100%;resize:vertical;min-height:1.6em;font-family:var(--font-mono);line-height:1.4">${escapeHtml(currentValue)}</textarea>`;
  const input = cell.querySelector('textarea');
  // Auto-size to content
  input.style.height = input.scrollHeight + 'px';
  input.focus();
  input.select();

  const save = (force) => {
    const newValue = input.value;
    cell.textContent = newValue;
    cell.setAttribute('style', originalStyle);

    // Enter always marks as unconfirmed; blur only if value changed
    if (force || newValue !== currentValue) {
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields) {
        APP.state.specimens[spec.filename].unconfirmed_fields = {};
      }
      APP.state.specimens[spec.filename].unconfirmed_fields[fieldName] = newValue;
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      scheduleSaveState();
    }

    // Refresh focus panels
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  };

  const cancel = () => {
    cell.textContent = originalText;
    cell.setAttribute('style', originalStyle);
  };

  const onBlur = () => save(false);
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.removeEventListener('blur', onBlur); save(true); }
    else if (e.key === 'Escape') { input.removeEventListener('blur', onBlur); cancel(); }
  });
}

// ── Focus Actions ───────────────────────────────────────────

function mergeCluster(cluster, mergeValue) {
  const valuesToMerge = new Set(cluster.variants.map(v => v.value));

  for (const spec of APP.specimens) {
    const cached = tableDataCache[spec.filename];
    const fj = cached?.formatted_json || {};
    const specState = APP.state.specimens[spec.filename];

    // Get current value
    let currentVal;
    if (specState?.accepted_fields?.[focusField] !== undefined) {
      currentVal = specState.accepted_fields[focusField].value;
    } else {
      currentVal = fj[focusField] !== undefined ? String(fj[focusField]) : '';
    }

    if (valuesToMerge.has(currentVal) && currentVal !== mergeValue) {
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
      APP.state.specimens[spec.filename].unconfirmed_fields[focusField] = mergeValue;
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
    }
  }

  scheduleSaveState();
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
}

function getFieldsForToolScope() {
  if (focusToolScope === 'everything') {
    const first = APP.specimens[0] ? tableDataCache[APP.specimens[0].filename] : null;
    return first ? Object.keys(first.formatted_json || {}) : [];
  }
  return focusField ? [focusField] : [];
}

function getSpecimensForToolScope() {
  if (focusToolScope === 'everything' || !focusField || focusFilter === null) {
    return APP.specimens;
  }
  // Filtered: only specimens whose current field value matches the filter
  return APP.specimens.filter(spec => {
    return getCurrentFieldValue(spec, focusField) === focusFilter;
  });
}

function getCurrentFieldValue(spec, field) {
  const specState = APP.state.specimens[spec.filename];
  const unconf = specState?.unconfirmed_fields?.[field];
  if (unconf !== undefined) return unconf;
  if (specState?.accepted_fields?.[field] !== undefined) return specState.accepted_fields[field].value;
  const fj = (tableDataCache[spec.filename]?.formatted_json || {});
  return fj[field] !== undefined ? String(fj[field]) : '';
}

function applyFindReplace(findVal, replaceVal) {
  let count = 0;
  const regex = new RegExp(escapeRegex(findVal), 'gi');
  const fields = getFieldsForToolScope();
  const specimens = getSpecimensForToolScope();

  for (const spec of specimens) {
    for (const field of fields) {
      const currentVal = getCurrentFieldValue(spec, field);
      const newVal = currentVal.replace(regex, replaceVal);
      if (newVal !== currentVal) {
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
        APP.state.specimens[spec.filename].unconfirmed_fields[field] = newVal;
        APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
        count++;
      }
    }
  }

  scheduleSaveState();
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
  if (count > 0) alert(`Replaced in ${count} specimen(s)`);
  else alert('No matches found');
}

function applyCaseTransform(type) {
  let count = 0;
  const fields = getFieldsForToolScope();
  const specimens = getSpecimensForToolScope();

  for (const spec of specimens) {
    for (const field of fields) {
      const currentVal = getCurrentFieldValue(spec, field);
      if (currentVal === '') continue;

      let newVal;
      if (type === 'title') newVal = currentVal.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      else if (type === 'upper') newVal = currentVal.toUpperCase();
      else newVal = currentVal.toLowerCase();

      if (newVal !== currentVal) {
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
        APP.state.specimens[spec.filename].unconfirmed_fields[field] = newVal;
        APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
        count++;
      }
    }
  }

  scheduleSaveState();
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Settings ────────────────────────────────────────────────

function applyThemeColors() {
  const root = document.documentElement;
  const oddHex = APP.settings.rowColorOdd || '#2f2f2f';
  const evenHex = APP.settings.rowColorEven || '#242424';
  root.style.setProperty('--row-odd', oddHex);
  root.style.setProperty('--row-even', evenHex);

  // Compute selected row color: 10% brighter than the brightest row
  const oddG = hexToGray(oddHex);
  const evenG = hexToGray(evenHex);
  const brightest = Math.max(oddG, evenG);
  const selectedG = Math.min(255, Math.round(brightest * 1.1) + 10);
  root.style.setProperty('--row-selected', grayToHex(selectedG));
  const cc = APP.settings.catColors || {};
  root.style.setProperty('--cat-0', cc.cat0 || '#479EF5');
  root.style.setProperty('--cat-1', cc.cat1 || '#CA50F7');
  root.style.setProperty('--cat-2', cc.cat2 || '#48ca48');
  root.style.setProperty('--cat-3', cc.cat3 || '#A0A220');
  root.style.setProperty('--cat-4', cc.cat4 || '#FF5C5C');
  root.style.setProperty('--cat-5', cc.cat5 || '#7fffff');
  root.style.setProperty('--cat-6', cc.cat6 || '#ffff7f');
  root.style.setProperty('--cat-misc', cc.catMisc || '#888888');
}

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function showUpdateNotification(data) {
  if (document.querySelector('.settings-popup')) return;
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--bg-secondary);border:1px solid var(--accent);border-radius:var(--radius);padding:14px 18px;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:340px;cursor:pointer';
  toast.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Update Available: v${escapeHtml(data.version)}</div>
    <div style="font-size:11px;color:var(--text-muted)">Open Settings to update</div>
  `;
  toast.addEventListener('click', () => { toast.remove(); openSettingsPopup(); });
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 10000);
}

function updateSettingsUpdateUI(data) {
  const statusLine = document.getElementById('update-status-line');
  const btnDownload = document.getElementById('btn-download-update');
  const btnInstall = document.getElementById('btn-install-update');
  const btnCheck = document.getElementById('btn-check-update');
  if (!statusLine) return;

  switch (data.status) {
    case 'checking':
      statusLine.innerHTML = '<span style="color:var(--text-muted)">Checking for updates...</span>';
      break;
    case 'available':
      statusLine.innerHTML = `<span style="color:var(--accent)">&#9432; Update available: v${escapeHtml(data.version)}</span>`;
      if (btnDownload) { btnDownload.style.display = ''; btnDownload.textContent = 'Download Update'; }
      if (btnCheck) { btnCheck.disabled = false; btnCheck.textContent = 'Check for Updates'; }
      break;
    case 'available-manual':
      statusLine.innerHTML = `<span style="color:var(--accent)">&#9432; Update available: v${escapeHtml(data.version)}</span><br><span style="color:var(--text-muted);font-size:11px">Portable build — download from GitHub Releases</span>`;
      if (btnCheck) { btnCheck.disabled = false; btnCheck.textContent = 'Check for Updates'; }
      break;
    case 'up-to-date':
      statusLine.innerHTML = '<span style="color:#4caf50">&#10003; You are up to date</span>';
      if (btnCheck) { btnCheck.disabled = false; btnCheck.textContent = 'Check for Updates'; }
      break;
    case 'downloading':
      statusLine.innerHTML = `<span style="color:var(--text-muted)">Downloading... ${Math.round(data.percent || 0)}%</span>`;
      break;
    case 'downloaded':
      statusLine.innerHTML = `<span style="color:#4caf50">&#10003; Update v${escapeHtml(data.version)} ready to install</span>`;
      if (btnDownload) btnDownload.style.display = 'none';
      if (btnInstall) btnInstall.style.display = '';
      break;
    case 'error':
      statusLine.innerHTML = `<span style="color:var(--error)">Update check failed: ${escapeHtml(data.message || 'Unknown error')}</span>`;
      if (btnCheck) { btnCheck.disabled = false; btnCheck.textContent = 'Check for Updates'; }
      break;
  }
}

function openSettingsPopup() {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div class="settings-popup" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-size:16px;font-weight:600;color:var(--text-primary)">&#9881; Settings</span>
        <span style="display:flex;align-items:center;gap:6px;padding:3px 10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:11px;font-family:var(--font-mono)">&#9998; ${escapeHtml(APP.username)}</span>
      </div>

      <div class="settings-row">
        <div class="settings-label">
          <div>Accept All Button</div>
          <div class="settings-desc">Show a button at the bottom of the form that accepts all AI values at once for the current specimen</div>
        </div>
        <div class="table-lock-toggle ${APP.settings.acceptAllEnabled ? 'unlocked' : 'locked'}" id="setting-accept-all">
          <div class="toggle-track"><div class="toggle-thumb"></div></div>
          <span class="table-lock-label" style="text-transform:none">${APP.settings.acceptAllEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>


      <div class="settings-row">
        <div class="settings-label">
          <div>Image Cache Size</div>
          <div class="settings-desc">Number of decoded images kept in memory (100–2000). Default 500. If your device has more than 8 GB of RAM you can safely increase this to 2000 for faster browsing of large projects.</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="range" min="100" max="2000" step="100" id="setting-image-cache" value="${APP.settings.imageCacheSize || 500}" style="width:140px;accent-color:var(--accent)">
          <span id="setting-image-cache-label" style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);min-width:40px">${APP.settings.imageCacheSize || 500}</span>
        </div>
      </div>

      <div class="settings-row" style="flex-direction:column;align-items:stretch">
        <div class="settings-label" style="margin-bottom:8px">
          <div>Row Colors (Gray)</div>
          <div class="settings-desc">Alternating background shades for form and table rows</div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-secondary);flex:1">
            Odd
            <input type="range" min="0" max="120" id="setting-row-odd" value="${hexToGray(APP.settings.rowColorOdd)}" style="flex:1;accent-color:var(--accent)">
            <span id="setting-row-odd-preview" style="width:28px;height:20px;border-radius:3px;border:1px solid var(--border);background:${APP.settings.rowColorOdd}"></span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-secondary);flex:1">
            Even
            <input type="range" min="0" max="120" id="setting-row-even" value="${hexToGray(APP.settings.rowColorEven)}" style="flex:1;accent-color:var(--accent)">
            <span id="setting-row-even-preview" style="width:28px;height:20px;border-radius:3px;border:1px solid var(--border);background:${APP.settings.rowColorEven}"></span>
          </label>
          <button class="btn-sm" id="setting-row-reset" style="font-size:10px">Reset</button>
        </div>
      </div>

      <div class="settings-row" style="flex-direction:column;align-items:stretch">
        <div class="settings-label" style="margin-bottom:8px">
          <div>Category Accent Colors</div>
          <div class="settings-desc">Colors used for category tabs and field labels</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          ${[
            ['cat0', 'Geography', '#479EF5'],
            ['cat1', 'Taxonomy', '#CA50F7'],
            ['cat2', 'Collecting', '#48ca48'],
            ['cat3', 'Locality', '#A0A220'],
            ['cat4', 'Cat 5', '#FF5C5C'],
            ['cat5', 'Cat 6', '#7fffff'],
            ['cat6', 'Cat 7', '#ffff7f'],
            ['catMisc', 'Misc', '#888888'],
          ].map(([key, label, def]) => `
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary)">
              <input type="color" class="setting-cat-color" data-key="${key}" value="${(APP.settings.catColors && APP.settings.catColors[key]) || def}" style="width:28px;height:22px;border:none;background:none;cursor:pointer;padding:0">
              ${label}
            </label>
          `).join('')}
          <button class="btn-sm" id="setting-cat-reset" style="font-size:10px">Reset</button>
        </div>
      </div>

      <div class="settings-row" id="settings-update-section" style="flex-direction:column;align-items:stretch">
        <div class="settings-label" style="margin-bottom:10px">
          <div>Updates</div>
          <div class="settings-desc">Check for new versions of VoucherVisionGO Editor</div>
        </div>
        <div id="update-info-container" style="font-size:12px;color:var(--text-secondary);line-height:1.8">
          <div>Current version: <span id="update-current-version" style="font-family:var(--font-mono);color:var(--text-primary)">...</span></div>
          <div>Installed: <span id="update-install-date" style="color:var(--text-muted)">...</span></div>
          <div>Last checked: <span id="update-last-check" style="color:var(--text-muted)">...</span></div>
          <div id="update-status-line" style="margin-top:6px"></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
          <button class="btn-sm btn-primary" id="btn-check-update" style="font-size:11px">Check for Updates</button>
          <button class="btn-sm" id="btn-download-update" style="font-size:11px;display:none">Download Update</button>
          <button class="btn-sm" id="btn-install-update" style="font-size:11px;display:none;background:#1a5c1a;color:#4caf50;border-color:#4caf50">Restart to Update</button>
          <a id="btn-github-releases" href="#" style="font-size:11px;color:var(--accent);text-decoration:none;margin-left:auto">View releases on GitHub &#x2197;</a>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;margin-top:20px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn-sm" id="settings-reset-project" style="background:#3a1515;color:var(--error);border-color:var(--error);font-size:11px">Reset Project</button>
        <div style="flex:1"></div>
        <button class="btn-sm btn-primary" id="settings-close">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => { overlay.remove(); saveCurrentSettings(); });

  document.getElementById('settings-close').addEventListener('click', () => {
    overlay.remove();
    saveCurrentSettings();
  });

  // Accept All toggle
  document.getElementById('setting-accept-all').addEventListener('click', () => {
    APP.settings.acceptAllEnabled = !APP.settings.acceptAllEnabled;
    const toggle = document.getElementById('setting-accept-all');
    toggle.classList.toggle('locked', !APP.settings.acceptAllEnabled);
    toggle.classList.toggle('unlocked', APP.settings.acceptAllEnabled);
    toggle.querySelector('.table-lock-label').textContent = APP.settings.acceptAllEnabled ? 'Enabled' : 'Disabled';
  });

  // Image cache slider
  document.getElementById('setting-image-cache').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    APP.settings.imageCacheSize = val;
    document.getElementById('setting-image-cache-label').textContent = val;
  });

  // Row gray sliders
  document.getElementById('setting-row-odd').addEventListener('input', (e) => {
    APP.settings.rowColorOdd = grayToHex(parseInt(e.target.value));
    document.getElementById('setting-row-odd-preview').style.background = APP.settings.rowColorOdd;
    applyThemeColors();
  });
  document.getElementById('setting-row-even').addEventListener('input', (e) => {
    APP.settings.rowColorEven = grayToHex(parseInt(e.target.value));
    document.getElementById('setting-row-even-preview').style.background = APP.settings.rowColorEven;
    applyThemeColors();
  });
  document.getElementById('setting-row-reset').addEventListener('click', () => {
    APP.settings.rowColorOdd = '#2f2f2f';
    APP.settings.rowColorEven = '#242424';
    document.getElementById('setting-row-odd').value = 47;
    document.getElementById('setting-row-even').value = 36;
    document.getElementById('setting-row-odd-preview').style.background = '#2f2f2f';
    document.getElementById('setting-row-even-preview').style.background = '#242424';
    applyThemeColors();
  });

  // Category color pickers
  document.querySelectorAll('.setting-cat-color').forEach(input => {
    input.addEventListener('input', () => {
      if (!APP.settings.catColors) APP.settings.catColors = {};
      APP.settings.catColors[input.dataset.key] = input.value;
      applyThemeColors();
    });
  });

  const catDefaults = { cat0: '#479EF5', cat1: '#CA50F7', cat2: '#48CA48', cat3: '#A0A220', cat4: '#FF5C5C', cat5: '#7fffff', cat6: '#ffff7f', catMisc: '#888888' };
  document.getElementById('setting-cat-reset').addEventListener('click', () => {
    APP.settings.catColors = { ...catDefaults };
    document.querySelectorAll('.setting-cat-color').forEach(input => {
      input.value = catDefaults[input.dataset.key];
    });
    applyThemeColors();
  });

  // Reset Project
  document.getElementById('settings-reset-project').addEventListener('click', () => {
    showResetProjectDialog();
  });

  // ── Update section ──
  (async () => {
    try {
      const info = await window.api.getUpdateInfo();
      document.getElementById('update-current-version').textContent = 'v' + info.currentVersion;
      document.getElementById('update-install-date').textContent = info.installDate ? new Date(info.installDate).toLocaleDateString() : 'Unknown';
      document.getElementById('update-last-check').textContent = info.lastUpdateCheck ? timeAgo(info.lastUpdateCheck) : 'Never';
    } catch {}
    if (APP.updateStatus) updateSettingsUpdateUI(APP.updateStatus);
  })();

  document.getElementById('btn-github-releases').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('https://github.com/Gene-Weaver/VoucherVisionGO-Editor/releases', '_blank');
  });

  document.getElementById('btn-check-update').addEventListener('click', async () => {
    const btn = document.getElementById('btn-check-update');
    btn.disabled = true;
    btn.textContent = 'Checking...';
    const result = await window.api.checkForUpdate();
    if (result.status !== 'checking') {
      updateSettingsUpdateUI(result);
      btn.disabled = false;
      btn.textContent = 'Check for Updates';
    }
    document.getElementById('update-last-check').textContent = 'Just now';
  });

  document.getElementById('btn-download-update').addEventListener('click', async () => {
    document.getElementById('btn-download-update').style.display = 'none';
    await window.api.downloadUpdate();
  });

  document.getElementById('btn-install-update').addEventListener('click', async () => {
    await window.api.installUpdate();
  });
}

function showResetProjectDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:2px solid var(--error);border-radius:var(--radius);padding:24px;max-width:480px;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:16px;font-weight:700;margin-bottom:12px;color:var(--error)">&#9888; Danger: Reset Project</div>
      <div style="font-size:13px;margin-bottom:12px;color:var(--text-secondary);line-height:1.6">
        Resetting this project will <strong>permanently delete</strong> all review progress:
      </div>
      <div style="padding:10px;background:var(--bg-primary);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:16px;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);line-height:1.8">
        <div style="color:var(--error)">All *__REVIEWED.json files</div>
        <div style="color:var(--error)">All .xlsx spreadsheets</div>
        <div>_vvgo_editor_state.json</div>
        <div>_vvgo_editor_settings.json</div>
        <div>_prompts/</div>
      </div>
      <div style="font-size:12px;margin-bottom:16px;color:var(--text-muted)">
        Your original JSON files will <strong>not</strong> be deleted. This cannot be undone.
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="reset-cancel">Cancel</button>
        <button class="btn-sm" id="reset-confirm" style="background:var(--error);color:#fff;border-color:var(--error);font-weight:700">Delete All &amp; Reset</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('reset-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('reset-confirm').addEventListener('click', async () => {
    overlay.remove();
    // Close settings popup too
    document.querySelectorAll('.image-modal-overlay').forEach(o => o.remove());
    await performProjectReset();
  });
}

async function performProjectReset() {
  if (!APP.folderPath) return;

  await window.api.resetProject(APP.folderPath);

  // Reset in-memory state
  APP.state = { version: 1, folder_path: APP.folderPath, last_modified: new Date().toISOString(), current_specimen: '', specimens: {} };
  APP.settings = { acceptAllEnabled: false, mapTheme: 'dark', rowColorOdd: '#2f2f2f', rowColorEven: '#242424', catColors: {} };
  APP.currentIndex = 0;

  // Re-scan folder and reload
  APP.specimens = await window.api.scanFolder(APP.folderPath);
  rebuildSpecimenIndexMap();
  if (APP.specimens.length > 0) {
    await loadSpecimen(0);
  }
  applyThemeColors();
  updateNavBar();
  alert('Project has been reset. All review progress has been deleted.');
}

async function saveCurrentSettings() {
  APP.settings.mapTheme = APP.mapTheme;
  await window.api.saveSettings(APP.folderPath, APP.settings);
  // Re-render footer to show/hide Accept All button
  renderCategoryFooter();
}

function acceptAllFields() {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  const fj = APP.currentSpecimen.formatted_json || {};
  const categories = getCategories();
  const cat = categories.find(c => c.name === APP.activeCategory);
  if (!cat) return;

  for (const field of cat.fields) {
    if (specState.accepted_fields[field]) continue; // Already accepted
    const val = fj[field];
    const strVal = val !== undefined ? String(val) : '';
    const source = strVal === '' ? 'confirmed_empty' : 'ai';
    specState.accepted_fields[field] = { value: strVal, source };
  }

  specState.last_touched = new Date().toISOString();
  autoConfirmCategories(spec.filename);
  renderCategoryTabs();
  renderCategoryForm();
  renderCategoryFooter();
  renderBounceBar();
  scheduleSaveState();
  scheduleAutoSaveReviewed(spec.filename);
}

// ── Utility ─────────────────────────────────────────────────

function createSlideSwitch(id, options, activeValue, onChange) {
  const html = `
    <div class="slide-switch" id="${id}">
      <div class="slide-switch-thumb" id="${id}-thumb"></div>
      ${options.map(o => `<div class="slide-switch-option ${o.value === activeValue ? 'active' : ''}" data-value="${escapeAttr(o.value)}">${o.label}</div>`).join('')}
    </div>
  `;

  // Return html + a setup function to call after inserting into DOM
  return {
    html,
    setup() {
      const el = document.getElementById(id);
      if (!el) return;
      positionThumb(el, id);

      el.querySelectorAll('.slide-switch-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          el.querySelectorAll('.slide-switch-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          positionThumb(el, id);
          onChange(opt.dataset.value);
        });
      });
    }
  };
}

function positionThumb(container, id) {
  const thumb = document.getElementById(id + '-thumb');
  const active = container.querySelector('.slide-switch-option.active');
  if (!thumb || !active) return;
  const containerRect = container.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  thumb.style.left = (activeRect.left - containerRect.left) + 'px';
  thumb.style.width = activeRect.width + 'px';
}

function createBtnGroup(id, options, activeValue, onChange) {
  const html = `
    <div class="btn-group" id="${id}">
      ${options.map(o => `<div class="btn-group-option ${o.value === activeValue ? 'active' : ''}" data-value="${escapeAttr(o.value)}">${o.label}</div>`).join('')}
    </div>
  `;

  return {
    html,
    setup() {
      const el = document.getElementById(id);
      if (!el) return;
      el.querySelectorAll('.btn-group-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          el.querySelectorAll('.btn-group-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          onChange(opt.dataset.value);
        });
      });
    }
  };
}

function grayToHex(v) {
  const h = Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

function hexToGray(hex) {
  if (!hex || hex.length < 7) return 36;
  return parseInt(hex.slice(1, 3), 16);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
