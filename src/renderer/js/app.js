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
    catColors: { cat0: '#7fbfff', cat1: '#f6a14f', cat2: '#48ca48', cat3: '#a855a8', cat4: '#ff7f7f', cat5: '#7fffff', cat6: '#ffff7f', catMisc: '#888888' },
  },

  // Category color assignments
  categoryColors: ['var(--cat-0)', 'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'],
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

  if (APP.specimens.length === 0) {
    alert('No VoucherVisionGO JSON files found in this folder.');
    return;
  }

  // Load settings
  APP.settings = await window.api.loadSettings(folderPath);
  APP.mapTheme = APP.settings.mapTheme || 'dark';
  applyThemeColors();

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
      <div id="ocr-panel-container"></div>
      <div id="wfo-panel-container"></div>
      <div id="elevation-panel-container"></div>
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
  renderElevationPanel();
  renderPromptPanel();

  // Vertical resize for image panel
  initResizeHandleV('image-resize-handle-v', 'panel-right-image', 'panel-left', 0.25, 0.75);
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

  makeCollapsiblePanel('map-viewer-container', 'Map',
    `<div class="map-container" id="map-container"></div>`,
    'mapCollapsed', extraHeaderHtml);

  // Setup slide switch (after DOM insertion)
  mapSwitch.setup();

  if (APP.mapCollapsed) return;

  initMap(lat, lng);

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
    const totalFields = Object.keys(fj).length;
    const resolvedFields = specState ? Object.keys(specState.accepted_fields || {}).length : 0;

    if (resolvedFields >= totalFields) continue; // Fully resolved

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
        !specState?.accepted_fields?.[f]
      );

      if (pending.length > 0) {
        return { specimenIndex: idx, categoryName: catName, firstPendingField: pending[0] };
      }
    }

    // Check MISC fields
    const miscFields = allFields.filter(f => !assignedFields.has(f));
    const miscPending = miscFields.filter(f => !specState?.accepted_fields?.[f]);
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
      const reviewedValue = isResolved ? accepted.value : '';
      const source = isResolved ? accepted.source : 'pending';
      const isEmpty = aiValue === '';
      const isLongField = aiValue.length > 80 || ['habitat', 'specimenDescription', 'locality', 'additionalText', 'identificationHistory'].includes(field);

      return `
        <div class="field-row ${isResolved ? 'resolved' : ''}" data-field="${field}">
          <div class="field-label" style="color: ${isResolved ? 'var(--text-muted)' : cat.color}">
            ${escapeHtml(field)}
            <span class="field-status ${source}">${getStatusLabel(source)}</span>
          </div>
          <div class="field-ai-value ${isEmpty ? 'empty' : ''}">
            ${isEmpty ? '(empty)' : escapeHtml(aiValue)}
          </div>
          <div class="field-actions">
            ${!isEmpty
              ? `<button class="btn-icon field-accept-btn" data-field="${field}" data-value="${escapeAttr(aiValue)}" title="Accept AI value">&#8594;</button>`
              : `<button class="btn-icon field-accept-btn field-confirm-empty-btn" data-field="${field}" title="Confirm empty">&#8594;</button>`
            }
          </div>
          <div class="field-reviewed">
            ${isLongField
              ? `<textarea class="field-input ${isResolved ? 'resolved' : ''}" data-field="${field}" rows="3">${escapeHtml(reviewedValue)}</textarea>`
              : `<input type="text" class="field-input ${isResolved ? 'resolved' : ''}" data-field="${field}" value="${escapeAttr(reviewedValue)}">`
            }
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

  el.querySelectorAll('.field-input').forEach(input => {
    input.addEventListener('input', () => {
      const field = input.dataset.field;
      const value = input.value;
      const fj = APP.currentSpecimen.formatted_json || {};
      const aiValue = fj[field] !== undefined ? String(fj[field]) : '';

      let source;
      if (value === '' && aiValue === '') source = 'confirmed_empty';
      else if (value === aiValue) source = 'ai';
      else if (aiValue === '' && value !== '') source = 'user_added';
      else source = 'edited';

      acceptField(field, value, source, false);
    });

    // Tab key moves to next field
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const allInputs = [...el.querySelectorAll('.field-input')];
        const idx = allInputs.indexOf(input);
        if (idx < allInputs.length - 1) allInputs[idx + 1].focus();
      }
    });
  });
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
      input.value = value;
    }
    input.classList.add('resolved');
  }

  // Update status label and field label color
  const row = document.querySelector(`.field-row[data-field="${field}"]`);
  if (row) {
    row.classList.add('resolved');
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
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--error);border-radius:var(--radius);padding:24px;max-width:450px;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--error)">Final Warning</div>
      <div style="font-size:13px;margin-bottom:16px;color:var(--text-secondary);line-height:1.6">
        All ${incomplete.length} incomplete specimens will be marked as complete and assumed to be fully reviewed.
        Their current accepted values will be used as-is. Unreviewed fields will remain empty in the export.
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="final-cancel">Cancel</button>
        <button class="btn-sm" style="background:var(--error);color:#fff;border-color:var(--error)" id="final-confirm">Yes, Export All</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());

  document.getElementById('final-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('final-confirm').addEventListener('click', async () => {
    overlay.remove();

    // Mark all incomplete as complete
    for (const item of incomplete) {
      const spec = APP.specimens[item.index - 1];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      const specState = APP.state.specimens[spec.filename];

      // Confirm all categories
      const categories = getCategoriesForSpecimen(spec.filename);
      specState.categories_confirmed = categories.map(c => c.name);

      // Auto-accept any unresolved fields with AI values
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

      // Write reviewed file
      await autoSaveReviewed(spec.filename);
    }

    scheduleSaveState();
    await doExport();
  });
}

async function doExport() {
  // Build rows for XLSX
  const rows = [];
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    if (!specState) continue;

    const row = { filename: spec.filename };
    for (const [field, info] of Object.entries(specState.accepted_fields)) {
      row[field] = info.value;
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

// ── Batch Table View ────────────────────────────────────────

const tableDataCache = {};
let tableSelectedIndex = 0;
let tableImageType = 'collage';
let tableEditingLocked = true;

async function renderTableView() {
  const el = document.getElementById('table-view');
  if (!el) return;

  // Load all specimen data
  for (const spec of APP.specimens) {
    if (!tableDataCache[spec.filename]) {
      try { tableDataCache[spec.filename] = await window.api.readSpecimen(APP.folderPath, spec.filename); }
      catch { tableDataCache[spec.filename] = null; }
    }
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

  // Filter
  document.getElementById('table-filter').addEventListener('input', (e) => {
    renderTableBody(allFields, e.target.value.toLowerCase());
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

function renderTableBody(allFields, filter, sortCol = 'index', sortAsc = true) {
  const tbody = document.getElementById('table-body');
  if (!tbody) return;

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
    for (const f of allFields) {
      if (specState?.accepted_fields?.[f] !== undefined) {
        fieldValues[f] = specState.accepted_fields[f].value;
        fieldAccepted[f] = true;
      } else {
        fieldValues[f] = originalFj[f] !== undefined ? String(originalFj[f]) : '';
        fieldAccepted[f] = false;
      }
    }

    rows.push({ index: i, filename: spec.filename, status, fieldValues, fieldAccepted });
  }

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

  tbody.innerHTML = filtered.map(r => `
    <tr class="status-${r.status} ${r.index === tableSelectedIndex ? 'selected' : ''}" data-index="${r.index}">
      <td class="cell-goto" data-index="${r.index}" title="Open in form view" style="cursor:pointer;text-align:center;font-size:12px">&#9998;</td>
      <td>${r.index + 1}</td>
      <td class="cell-filename" data-index="${r.index}">${escapeHtml(r.filename)}</td>
      <td><span class="status-badge ${r.status}">${r.status.replace('-', ' ')}</span></td>
      ${allFields.map(f => {
        const accepted = r.fieldAccepted[f];
        const val = r.fieldValues[f];
        return `<td class="${accepted ? 'cell-accepted' : 'cell-unaccepted'}" data-field="${escapeAttr(f)}" data-index="${r.index}" title="${escapeAttr(val)}">${escapeHtml(val)}</td>`;
      }).join('')}
    </tr>
  `).join('');

  // Click eye icon to go to form view
  tbody.querySelectorAll('.cell-goto').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(td.dataset.index);
      showView('review');
      loadSpecimen(idx);
    });
  });

  // Click on data cell to inline-edit
  tbody.querySelectorAll('td[data-field]').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(td.dataset.index);
      if (idx !== tableSelectedIndex) selectTableRow(idx);
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
        <div style="font-size:13px;margin-bottom:8px;color:var(--text-secondary);line-height:1.6">
          When you enable <strong>Table Editing</strong>, clicking on a cell indicates that you have <strong>CONFIRMED</strong> the content to be accurate even if you have not made any edits to the text!
        </div>
        <div style="font-size:13px;margin-bottom:16px;color:var(--text-secondary);line-height:1.6">
          Please be careful and lock the table when edits are not desired.
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
  if (td.querySelector('.cell-edit-input')) return;

  const spec = APP.specimens[specimenIndex];
  const cached = tableDataCache[spec.filename];
  const originalFj = cached?.formatted_json || {};
  const specState = APP.state?.specimens?.[spec.filename];

  const currentValue = specState?.accepted_fields?.[fieldName]?.value
    ?? (originalFj[fieldName] !== undefined ? String(originalFj[fieldName]) : '');

  const originalText = td.textContent;
  const wasAccepted = td.classList.contains('cell-accepted');

  td.innerHTML = `<input type="text" class="cell-edit-input" value="${escapeAttr(currentValue)}">`;
  const input = td.querySelector('.cell-edit-input');
  input.focus();
  input.select();

  const commit = () => {
    const newValue = input.value;
    td.textContent = newValue;

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);

    const aiValue = originalFj[fieldName] !== undefined ? String(originalFj[fieldName]) : '';
    let source;
    if (newValue === aiValue && aiValue !== '') source = 'ai';
    else if (aiValue === '' && newValue !== '') source = 'user_added';
    else if (newValue === '') source = 'confirmed_empty';
    else source = 'edited';

    APP.state.specimens[spec.filename].accepted_fields[fieldName] = { value: newValue, source };
    APP.state.specimens[spec.filename].last_touched = new Date().toISOString();

    td.classList.remove('cell-unaccepted');
    td.classList.add('cell-accepted');
    td.title = newValue;
    autoConfirmCategories(spec.filename);
    scheduleSaveState();
    scheduleAutoSaveReviewed(spec.filename);
  };

  const cancel = () => {
    td.textContent = originalText;
    td.classList.toggle('cell-accepted', wasAccepted);
    td.classList.toggle('cell-unaccepted', !wasAccepted);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.removeEventListener('blur', commit);
      commit();
      const nextTd = document.querySelector(`.batch-table td[data-field="${fieldName}"][data-index="${specimenIndex + 1}"]`);
      if (nextTd) {
        selectTableRow(specimenIndex + 1);
        startCellEdit(nextTd, specimenIndex + 1, fieldName, allFields);
      }
    } else if (e.key === 'Escape') {
      input.removeEventListener('blur', commit);
      cancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      input.removeEventListener('blur', commit);
      commit();
      const fieldIdx = allFields.indexOf(fieldName);
      const nextField = allFields[e.shiftKey ? fieldIdx - 1 : fieldIdx + 1];
      if (nextField) {
        const nextTd = document.querySelector(`.batch-table td[data-field="${nextField}"][data-index="${specimenIndex}"]`);
        if (nextTd) startCellEdit(nextTd, specimenIndex, nextField, allFields);
      }
    }
  });
}

// ── Focus View ──────────────────────────────────────────────

let focusField = null;
let focusFilter = null; // clicked facet value or null

async function renderFocusView() {
  const el = document.getElementById('focus-view');
  if (!el) return;

  // Ensure all specimen data is loaded
  for (const spec of APP.specimens) {
    if (!tableDataCache[spec.filename]) {
      try { tableDataCache[spec.filename] = await window.api.readSpecimen(APP.folderPath, spec.filename); }
      catch { tableDataCache[spec.filename] = null; }
    }
  }

  // Get categories and fields
  const categories = getFocusCategories();
  if (!focusField && categories.length > 0 && categories[0].fields.length > 0) {
    focusField = categories[0].fields[0];
  }

  el.innerHTML = `
    <div class="review-nav">
      <div class="nav-view-toggle" id="focus-view-switch-container"></div>
      <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Focus Mode</span>
      <span class="text-muted" style="font-size:11px">${APP.specimens.length} specimens</span>
    </div>
    <div class="focus-body">
      <div class="focus-sidebar" id="focus-sidebar"></div>
      <div class="focus-main" id="focus-main"></div>
      <div class="resize-handle" id="focus-resize-handle"></div>
      <div class="table-image-panel" id="focus-image-panel">
        <div class="image-viewer-header">
          <span>Image</span>
          <div id="focus-image-switch-container"></div>
        </div>
        <div class="table-image-container" id="focus-image-container">
          <div class="table-image-placeholder">Select a specimen</div>
        </div>
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
  });
  document.getElementById('focus-image-switch-container').innerHTML = focusImgSw.html;
  focusImgSw.setup();

  renderFocusSidebar(categories);
  renderFocusMain();

  // Resizable image panel
  initResizeHandle('focus-resize-handle', 'focus-main', 'focus-view', 0.50, 0.75);
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
              <span class="focus-field-confirm ${allResolved ? 'confirmed' : ''}" data-field="${escapeAttr(f)}" title="Confirm all values for this field">&#10003;</span>
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

  // Confirm-all buttons
  el.querySelectorAll('.focus-field-confirm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const field = btn.dataset.field;
      showConfirmAllFieldPopup(field);
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

function showConfirmAllFieldPopup(field) {
  const unresolved = APP.specimens.filter(spec => {
    const specState = APP.state.specimens[spec.filename];
    return !specState?.accepted_fields?.[field];
  });

  const total = APP.specimens.length;
  const alreadyDone = total - unresolved.length;

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:450px;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:16px;font-weight:600;margin-bottom:12px;color:var(--text-primary)">Confirm All: ${escapeHtml(field)}</div>
      <div style="font-size:13px;margin-bottom:8px;color:var(--text-secondary);line-height:1.6">
        This will accept the current value for <strong>${escapeHtml(field)}</strong> across all ${total} specimens.
      </div>
      <div style="font-size:12px;margin-bottom:16px;color:var(--text-muted)">
        ${alreadyDone} already resolved, ${unresolved.length} will be confirmed now.
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="confirm-field-cancel">Back</button>
        <button class="btn-sm btn-primary" id="confirm-field-go" ${unresolved.length === 0 ? 'disabled' : ''}>
          ${unresolved.length === 0 ? 'All Done' : `Confirm ${unresolved.length} Values`}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-field-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-field-go').addEventListener('click', () => {
    overlay.remove();
    confirmAllFieldValues(field);
  });
}

function confirmAllFieldValues(field) {
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    if (specState?.accepted_fields?.[field]) continue; // Already resolved

    const cached = tableDataCache[spec.filename];
    const fj = cached?.formatted_json || {};
    const val = fj[field] !== undefined ? String(fj[field]) : '';
    const source = val === '' ? 'confirmed_empty' : 'ai';

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    APP.state.specimens[spec.filename].accepted_fields[field] = { value: val, source };
    APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
  }

  scheduleSaveState();
  renderFocusSidebar(getFocusCategories());
  renderFocusMain();
}

function countFieldIssues(field) {
  const values = getAllValuesForField(field);
  const clusters = fingerprintCluster(values);
  return clusters.length;
}

function getAllValuesForField(field) {
  const result = [];
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    const cached = tableDataCache[spec.filename];
    const fj = cached?.formatted_json || {};

    // Use accepted value if exists, else original
    let value;
    if (specState?.accepted_fields?.[field] !== undefined) {
      value = specState.accepted_fields[field].value;
    } else {
      value = fj[field] !== undefined ? String(fj[field]) : '';
    }
    result.push({ filename: spec.filename, value, index: APP.specimens.indexOf(spec) });
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
const focusSectionState = { values: false, clusters: true, tools: true, dates: true, catalog: true, specimens: false };

function renderFocusMain() {
  const el = document.getElementById('focus-main');
  if (!el || !focusField) {
    if (el) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Select a field from the sidebar</div>';
    return;
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

  const section = (key, title, badgeHtml, bodyHtml) => `
    <div class="focus-section ${focusSectionState[key] ? 'minimized' : ''}" data-section="${key}">
      <div class="collapsible-panel" style="display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden">
        <div class="focus-section-header" data-section="${key}">
          <span>${title}${badgeHtml}</span>
          <span class="section-arrow">${focusSectionState[key] ? '&#9654;' : '&#9660;'}</span>
        </div>
        <div class="focus-section-body">${bodyHtml}</div>
      </div>
    </div>
  `;

  el.innerHTML = `
    ${section('values', 'Values', ` &middot; ${facets.length} unique`, `
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

    ${section('clusters', 'Clusters', clusters.length > 0 ? ` &middot; <span style="color:var(--warning)">${clusters.length}</span>` : '', `
      ${clusters.length === 0
        ? '<div class="focus-no-clusters">No inconsistencies detected</div>'
        : clusters.map((c, ci) => `
          <div class="cluster-group">
            <div class="cluster-values">
              ${c.variants.map(v => `<span class="cluster-chip">${escapeHtml(v.value)}<span class="chip-count">&times;${v.count}</span></span>`).join('')}
            </div>
            <div class="cluster-merge-row">
              <span style="font-size:11px;color:var(--text-muted)">Merge to:</span>
              <input type="text" class="cluster-merge-input" id="cluster-input-${ci}" value="${escapeAttr(c.bestValue)}">
              <button class="btn-sm btn-primary" data-cluster="${ci}">Merge</button>
            </div>
          </div>
        `).join('')}
    `)}

    ${section('tools', 'Find &amp; Replace / Case', '', `
      <div class="tools-body">
        <div class="tool-group">
          <div class="tool-group-label">Find &amp; Replace</div>
          <div class="find-replace-row">
            <input type="text" id="focus-find" placeholder="Find...">
            <span style="color:var(--text-muted)">&#8594;</span>
            <input type="text" id="focus-replace" placeholder="Replace...">
            <button class="btn-sm" id="focus-apply-replace">Apply</button>
          </div>
        </div>
        <div class="tool-group">
          <div class="tool-group-label">Case</div>
          <div style="display:flex;gap:4px">
            <button class="btn-sm" id="focus-title-case">Title Case</button>
            <button class="btn-sm" id="focus-upper-case">UPPER</button>
            <button class="btn-sm" id="focus-lower-case">lower</button>
          </div>
        </div>
      </div>
    `)}

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
              <div style="max-height:120px;overflow-y:auto">
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
              <div style="max-height:120px;overflow-y:auto">
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

    ${section('specimens', 'Specimens', focusFilter !== null ? ' &middot; filtered' : '', `
      <div class="focus-specimens-list" id="focus-specimens-list"></div>
    `)}
  `;

  // Wire section header toggles
  el.querySelectorAll('.focus-section-header').forEach(header => {
    header.addEventListener('click', () => {
      const key = header.dataset.section;
      focusSectionState[key] = !focusSectionState[key];
      const sec = header.closest('.focus-section');
      sec.classList.toggle('minimized');
      header.querySelector('.section-arrow').innerHTML = focusSectionState[key] ? '&#9654;' : '&#9660;';
    });
  });

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

  renderFocusSpecimens();
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

function renderFocusSpecimens() {
  const list = document.getElementById('focus-specimens-list');
  if (!list) return;

  const fieldValues = getAllValuesForField(focusField);
  const filtered = focusFilter !== null
    ? fieldValues.filter(v => v.value === focusFilter)
    : fieldValues;

  list.innerHTML = filtered.map(v => `
    <div class="focus-specimen-row focus-clickable-row" data-index="${v.index}">
      <span style="font-size:10px;color:var(--text-muted);min-width:24px">#${v.index + 1}</span>
      <span class="spec-filename">${escapeHtml(v.filename)}</span>
      <span class="spec-value focus-editable-cell" data-index="${v.index}" data-field="${escapeAttr(focusField)}">${v.value === '' ? '<em style="color:var(--text-muted)">(empty)</em>' : escapeHtml(v.value)}</span>
    </div>
  `).join('');

  list.querySelectorAll('.focus-specimen-row').forEach(row => {
    row.addEventListener('click', () => {
      loadFocusImage(parseInt(row.dataset.index));
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

async function loadFocusImage(index) {
  const container = document.getElementById('focus-image-container');
  if (!container || index < 0 || index >= APP.specimens.length) return;
  tableSelectedIndex = index;
  const spec = APP.specimens[index];
  container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, tableImageType);
  if (dataUrl) {
    container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(spec.filename)}">`;
    container.querySelector('img').addEventListener('click', () => openImageModal(dataUrl));
  } else {
    container.innerHTML = '<div class="table-image-placeholder">No image</div>';
  }
}

function startFocusCellEdit(cell, specimenIndex, fieldName) {
  if (cell.querySelector('input')) return;

  const spec = APP.specimens[specimenIndex];
  const cached = tableDataCache[spec.filename];
  const fj = cached?.formatted_json || {};
  const specState = APP.state.specimens[spec.filename];

  const currentValue = specState?.accepted_fields?.[fieldName]?.value
    ?? (fj[fieldName] !== undefined ? String(fj[fieldName]) : '');

  const originalText = cell.textContent;
  const originalStyle = cell.getAttribute('style') || '';

  cell.innerHTML = `<input type="text" class="cell-edit-input" value="${escapeAttr(currentValue)}" style="font-size:11px;padding:1px 4px;width:100%">`;
  const input = cell.querySelector('input');
  input.focus();
  input.select();

  const commit = () => {
    const newValue = input.value;
    cell.textContent = newValue;
    cell.setAttribute('style', originalStyle);

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);

    const aiValue = fj[fieldName] !== undefined ? String(fj[fieldName]) : '';
    let source;
    if (newValue === aiValue && aiValue !== '') source = 'ai';
    else if (aiValue === '' && newValue !== '') source = 'user_added';
    else if (newValue === '') source = 'confirmed_empty';
    else source = 'edited';

    APP.state.specimens[spec.filename].accepted_fields[fieldName] = { value: newValue, source };
    APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    scheduleSaveState();
    scheduleAutoSaveReviewed(spec.filename);

    // Refresh focus panels
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  };

  const cancel = () => {
    cell.textContent = originalText;
    cell.setAttribute('style', originalStyle);
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.removeEventListener('blur', commit); commit(); }
    else if (e.key === 'Escape') { input.removeEventListener('blur', commit); cancel(); }
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
      APP.state.specimens[spec.filename].accepted_fields[focusField] = { value: mergeValue, source: 'edited' };
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      autoConfirmCategories(spec.filename);
      scheduleAutoSaveReviewed(spec.filename);
    }
  }

  scheduleSaveState();
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
}

function applyFindReplace(findVal, replaceVal) {
  let count = 0;
  const regex = new RegExp(escapeRegex(findVal), 'gi');

  for (const spec of APP.specimens) {
    const cached = tableDataCache[spec.filename];
    const fj = cached?.formatted_json || {};
    const specState = APP.state.specimens[spec.filename];

    let currentVal;
    if (specState?.accepted_fields?.[focusField] !== undefined) {
      currentVal = specState.accepted_fields[focusField].value;
    } else {
      currentVal = fj[focusField] !== undefined ? String(fj[focusField]) : '';
    }

    const newVal = currentVal.replace(regex, replaceVal);
    if (newVal !== currentVal) {
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      APP.state.specimens[spec.filename].accepted_fields[focusField] = { value: newVal, source: 'edited' };
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      autoConfirmCategories(spec.filename);
      scheduleAutoSaveReviewed(spec.filename);
      count++;
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
  for (const spec of APP.specimens) {
    const cached = tableDataCache[spec.filename];
    const fj = cached?.formatted_json || {};
    const specState = APP.state.specimens[spec.filename];

    let currentVal;
    if (specState?.accepted_fields?.[focusField] !== undefined) {
      currentVal = specState.accepted_fields[focusField].value;
    } else {
      currentVal = fj[focusField] !== undefined ? String(fj[focusField]) : '';
    }

    if (currentVal === '') continue;

    let newVal;
    if (type === 'title') newVal = currentVal.replace(/\b\w/g, c => c.toUpperCase());
    else if (type === 'upper') newVal = currentVal.toUpperCase();
    else newVal = currentVal.toLowerCase();

    if (newVal !== currentVal) {
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      APP.state.specimens[spec.filename].accepted_fields[focusField] = { value: newVal, source: 'edited' };
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      autoConfirmCategories(spec.filename);
      scheduleAutoSaveReviewed(spec.filename);
      count++;
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
  root.style.setProperty('--cat-0', cc.cat0 || '#7fbfff');
  root.style.setProperty('--cat-1', cc.cat1 || '#f6a14f');
  root.style.setProperty('--cat-2', cc.cat2 || '#48ca48');
  root.style.setProperty('--cat-3', cc.cat3 || '#a855a8');
  root.style.setProperty('--cat-4', cc.cat4 || '#ff7f7f');
  root.style.setProperty('--cat-5', cc.cat5 || '#7fffff');
  root.style.setProperty('--cat-6', cc.cat6 || '#ffff7f');
  root.style.setProperty('--cat-misc', cc.catMisc || '#888888');
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
            ['cat0', 'Geography', '#7fbfff'],
            ['cat1', 'Taxonomy', '#f6a14f'],
            ['cat2', 'Collecting', '#48ca48'],
            ['cat3', 'Locality', '#a855a8'],
            ['cat4', 'Cat 5', '#ff7f7f'],
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

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:12px;border-top:1px solid var(--border)">
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

  const catDefaults = { cat0: '#7fbfff', cat1: '#f6a14f', cat2: '#48ca48', cat3: '#a855a8', cat4: '#ff7f7f', cat5: '#7fffff', cat6: '#ffff7f', catMisc: '#888888' };
  document.getElementById('setting-cat-reset').addEventListener('click', () => {
    APP.settings.catColors = { ...catDefaults };
    document.querySelectorAll('.setting-cat-color').forEach(input => {
      input.value = catDefaults[input.dataset.key];
    });
    applyThemeColors();
  });
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
  const activeIdx = options.findIndex(o => o.value === activeValue);
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
