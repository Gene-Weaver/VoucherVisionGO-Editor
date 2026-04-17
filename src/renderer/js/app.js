// ── VoucherVisionGO Editor — Main Application ──────────────

// ── State ───────────────────────────────────────────────────

const APP = {
  folderPath: null,
  specimens: [],          // [{filename, hasReviewed, hasInProgress, prompt}]
  currentIndex: 0,
  currentSpecimen: null,  // Full specimen JSON (minus base64)
  currentPrompt: null,    // Parsed prompt object
  state: null,            // In-memory state: { specimens: { filename: {...inprogress data} } }
  project: null,          // Project-level UI state from _INPROGRESS/_project.json
  activeCategory: null,
  imageType: 'collage',
  currentView: 'folder-picker', // 'folder-picker', 'review', 'table'
  projectSaveTimeout: null,
  ocrCollapsed: false,
  focusOcrCollapsed: false,
  promptCollapsed: true,
  mapCollapsed: false,
  mapTheme: 'light',
  wfoCollapsed: false,
  elevationCollapsed: false,
  username: '',
  sessionId: null,
  settings: {
    acceptAllEnabled: false, confirmRecordsEnabled: true, mapTheme: 'light',
    rowColorOdd: '#2f2f2f', rowColorEven: '#242424',
    catColors: { cat0: '#479EF5', cat1: '#CA50F7', cat2: '#48CA48', cat3: '#A0A220', cat4: '#FF5C5C', cat5: '#7fffff', cat6: '#ffff7f', catMisc: '#888888' },
  },

  // Category color assignments
  categoryColors: ['var(--cat-0)', 'var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'],
  updateStatus: null,
  dirtySpecimens: new Set(),    // Filenames with unsaved in-progress changes
  dirtyProject: false,          // Whether project state needs saving
  progressDisplayMode: 'specimens',
};

// ── Constants ───────────────────────────────────────────────

const CATEGORY_COLORS = {
  GEOGRAPHY: 'var(--cat-0)',
  TAXONOMY: 'var(--cat-1)',
  COLLECTING: 'var(--cat-2)',
  LOCALITY: 'var(--cat-3)',
  MISC: 'var(--cat-misc)',
};

function isDemoMode() {
  return !!globalThis.__VVGO_DEMO__;
}

// ── Loading Spinner ─────────────────────────────────────────

let _spinnerCount = 0;

function showNavSpinner() {
  _spinnerCount++;
  if (_spinnerCount === 1) {
    let el = document.getElementById('global-spinner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'global-spinner';
      el.className = 'global-spinner-overlay';
      el.innerHTML = '<div class="global-spinner-ring"></div>';
      document.body.appendChild(el);
    }
    el.style.display = '';
  }
}

function hideNavSpinner() {
  _spinnerCount = Math.max(0, _spinnerCount - 1);
  if (_spinnerCount === 0) {
    const el = document.getElementById('global-spinner');
    if (el) el.style.display = 'none';
  }
}

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
  // Save table scroll position before leaving table view
  if (APP.currentView === 'table' && viewName !== 'table') {
    const wrapper = document.querySelector('.batch-table-wrapper');
    if (wrapper) _tableSavedScroll = { scrollTop: wrapper.scrollTop, scrollLeft: wrapper.scrollLeft };
  }
  APP.currentView = viewName;
  if (viewName !== 'table') { tableSelectedCell = null; tableSelectedField = null; }
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
    <button class="footer-user-chip" id="btn-nav-progress-tracker" title="Open Progress Tracker">
      <img src="icons/user-search.svg" alt="" aria-hidden="true">
      <span id="nav-username-label"></span>
    </button>
    <div class="nav-folder">
      <span class="nav-folder-path" id="nav-folder-path"></span>
      <button class="btn-sm" id="nav-change-folder" style="display:none">Change</button>
    </div>
    <div class="nav-stats" id="nav-stats"></div>
    <div class="nav-view-toggle" id="nav-view-toggle"></div>
  `;

  document.getElementById('nav-change-folder').addEventListener('click', openFolderDialog);
  document.getElementById('btn-nav-progress-tracker').addEventListener('click', openProgressTrackerPopup);
}

function getCompactFolderDisplay(folderPath) {
  if (!folderPath) return '';
  const parts = folderPath.split(/[\\/]/).filter(Boolean);
  const last = parts[parts.length - 1] || folderPath;
  return `../${last}`;
}

function updateNavBar() {
  const pathEl = document.getElementById('nav-folder-path');
  const changeBtnEl = document.getElementById('nav-change-folder');
  const statsEl = document.getElementById('nav-stats');
  const toggleEl = document.getElementById('nav-view-toggle');
  const usernameEl = document.getElementById('nav-username-label');

  if (usernameEl) usernameEl.textContent = APP.username || 'Unknown';

  if (APP.folderPath) {
    pathEl.textContent = getCompactFolderDisplay(APP.folderPath);
    pathEl.title = 'Click to copy full path';
    pathEl.onclick = async () => {
      try {
        await navigator.clipboard.writeText(APP.folderPath);
      } catch (err) {
        console.warn('Failed to copy folder path:', err);
      }
    };
    changeBtnEl.style.display = isDemoMode() ? 'none' : '';

    // Stats
    const stats = getStatsFromState();
    statsEl.innerHTML = `
      <div class="progress-bar-container">
        <span class="progress-text">${stats.progressCount}/${stats.progressTotal} ${stats.progressLabel}</span>
        <button class="btn-sm btn-icon progress-mode-btn" id="btn-progress-mode" title="${stats.toggleTitle}" style="padding:0 6px;min-width:26px;line-height:1"><img src="icons/refresh-ccw.svg" alt="" aria-hidden="true"></button>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width: ${stats.percentage}%"></div>
        </div>
        <span class="progress-text">${stats.percentage}%</span>
      </div>
      ${stats.flagged > 0 ? `<span class="text-error flagged-count-link" id="btn-view-flagged" title="View flagged specimens">${stats.flagged} flagged <img src="icons/view.svg" alt="" aria-hidden="true"></span>` : ''}
    `;

    const hasChecklist = APP.currentPrompt?.checklist?.length > 0;
    toggleEl.innerHTML = `
      <button class="btn-sm btn-rewind" id="btn-rewind" title="Rewind actions" style="display:none">Rewind (0)</button>
      ${hasChecklist ? '<button class="btn-sm btn-icon checklist-icon-btn" id="btn-checklist" title="Checklist"><img src="icons/list-todo.svg" alt="" aria-hidden="true"></button>' : ''}
      <button class="btn-sm btn-icon hotkeys-icon-btn" id="btn-hotkeys" title="Hotkeys"><img src="icons/hotkey.svg" alt="" aria-hidden="true"></button>
      <button class="btn-sm btn-icon settings-icon-btn" id="btn-settings" title="Settings"><img src="icons/settings.svg" alt="" aria-hidden="true"></button>
    `;
    document.getElementById('btn-rewind').addEventListener('click', openRewindPopup);
    document.getElementById('btn-checklist')?.addEventListener('click', openChecklistPopup);
    document.getElementById('btn-hotkeys')?.addEventListener('click', openHotkeysPopup);
    document.getElementById('btn-settings').addEventListener('click', openSettingsPopup);
    document.getElementById('btn-view-flagged')?.addEventListener('click', openFlaggedSpecimensPopup);
    document.getElementById('btn-progress-mode')?.addEventListener('click', () => {
      APP.progressDisplayMode = APP.progressDisplayMode === 'cells' ? 'specimens' : 'cells';
      updateNavBar();
    });
    updateRewindButton();
    updateChecklistIcon();
  } else {
    pathEl.textContent = '';
    pathEl.title = '';
    pathEl.onclick = null;
    changeBtnEl.style.display = 'none';
    statsEl.innerHTML = '';
    toggleEl.innerHTML = '';
  }
}

// ── Stats ───────────────────────────────────────────────────

function getStatsFromState() {
  const total = APP.specimens.length;
  const fieldSchema = APP.project?.prompt_field_schema || Object.keys(APP.currentSpecimen?.formatted_json || {});
  const totalCells = total * fieldSchema.length;
  let completeSpecimens = 0;
  let reviewedCells = 0;
  let inProgress = 0;
  let flagged = 0;

  if (APP.state && APP.state.specimens) {
    for (const spec of APP.specimens) {
      const progress = getSpecimenProgressSnapshot(spec.filename);
      if (progress.isComplete) completeSpecimens++;
      reviewedCells += progress.resolvedFields;
      if (progress.hasProgress && !progress.isComplete) inProgress++;
      if (progress.flagged) flagged++;
    }
  }

  const mode = APP.progressDisplayMode === 'cells' ? 'cells' : 'specimens';
  const progressCount = mode === 'cells' ? reviewedCells : completeSpecimens;
  const progressTotal = mode === 'cells' ? totalCells : total;

  return {
    total,
    reviewed: completeSpecimens,
    reviewedCells,
    totalCells,
    progressCount,
    progressTotal,
    progressLabel: mode === 'cells' ? 'Cells Reviewed' : 'Specimens Complete',
    toggleTitle: mode === 'cells' ? 'Show specimen completion progress' : 'Show cell review progress',
    inProgress,
    flagged,
    percentage: progressTotal > 0 ? Math.round((progressCount / progressTotal) * 100) : 0
  };
}

function getSpecimenProgressSnapshot(filename) {
  const specState = APP.state?.specimens?.[filename];
  const fieldSchema = APP.project?.prompt_field_schema || Object.keys(APP.currentSpecimen?.formatted_json || {});
  const categories = APP.currentPrompt ? getCategoriesForSpecimen(filename) : [];
  const completion = specState
    ? CompletionEvaluator.evaluateCompletion(specState, fieldSchema, categories)
    : null;
  const resolvedFields = completion ? completion.resolvedFields : 0;
  const isComplete = completion ? completion.isComplete : false;
  const unconfirmedCount = Object.keys(specState?.unconfirmed_fields || {}).length;
  const flagged = !!specState?.flagged;
  const hasProgress = resolvedFields > 0
    || unconfirmedCount > 0
    || (specState?.categories_confirmed || []).length > 0
    || flagged
    || !!specState?.flag_note;

  return { isComplete, resolvedFields, hasProgress, flagged };
}

function getSpecimenStatusBadgeHtml(filename, options = {}) {
  const { includeNotStarted = false } = options;
  const progress = getSpecimenProgressSnapshot(filename);

  let status = 'not-started';
  if (progress.isComplete) status = 'reviewed';
  else if (progress.hasProgress) status = 'in-progress';
  if (progress.flagged) status = 'flagged';

  if (status === 'not-started' && !includeNotStarted) return '';

  const label = status === 'not-started' ? 'Pending' : status.replace('-', ' ');
  return `<span class="status-badge ${status}">${label}</span>`;
}

function refreshReviewStatusBadge() {
  const spec = APP.specimens[APP.currentIndex];
  const badgeEl = document.getElementById('review-status-badge');
  if (!spec || !badgeEl) return;
  badgeEl.innerHTML = getSpecimenStatusBadgeHtml(spec.filename);
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
      <label style="font-size:var(--fs-12);color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px">Reviewer Name</label>
      <input type="text" id="picker-username" placeholder="Enter your name" style="width:280px;text-align:center;font-size:var(--fs-14)" value="${escapeAttr(APP.username)}">
    </div>
    <button class="btn-primary picker-btn" id="picker-open-btn">Open Folder</button>
    <div id="picker-error" style="color:var(--error);font-size:var(--fs-12);margin-top:8px;display:none"></div>
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
  requestAnimationFrame(() => {
    const nameInput = document.getElementById('picker-username');
    nameInput?.focus();
  });
}

async function openFolderDialog() {
  if (isDemoMode()) return;
  const folderPath = await window.api.selectFolder();
  if (!folderPath) return;
  await loadFolder(folderPath);
}

// Shows a small modal confirming an unrecognized username. Resolves to true
// if the user clicks "Assign and Continue", false if they click "Back" (or
// dismiss by overlay click / Esc). Used as a typo guard on project open.
function confirmNewUsernameAssignment(name) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    overlay.style.cursor = 'default';
    overlay.innerHTML = `
      <div style="position:relative;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:22px 24px;max-width:440px;width:min(440px,calc(100vw - 32px));cursor:default" onclick="event.stopPropagation()">
        <div style="font-size:var(--fs-14);font-weight:600;margin-bottom:10px;color:var(--text-primary)">Assign new username?</div>
        <div style="font-size:var(--fs-12);line-height:1.6;color:var(--text-secondary);margin-bottom:16px">
          Do you want to assign <strong style="color:var(--text-primary);font-family:var(--font-mono)">${escapeHtml(name)}</strong> to this project? This username was not previously associated with this project.
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-sm" id="new-username-back">Back</button>
          <button class="btn-sm btn-primary" id="new-username-assign">Assign and Continue</button>
        </div>
      </div>
    `;
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      overlay.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(accepted);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    };
    overlay.addEventListener('click', () => finish(false));
    document.body.appendChild(overlay);
    overlay.querySelector('#new-username-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(false);
    });
    overlay.querySelector('#new-username-assign')?.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(true);
    });
    document.addEventListener('keydown', onKey, true);
    // Focus the Assign button so Enter confirms, Esc cancels
    requestAnimationFrame(() => {
      overlay.querySelector('#new-username-assign')?.focus();
    });
  });
}

async function loadFolder(folderPath) {
  showNavSpinner();

  // ── Build a temporary nextSession — APP is NOT mutated until commit point ──
  const next = {};
  let lockAcquired = false;

  try {
    // Step 1: Scan for JSON files
    next.specimens = await window.api.scanFolder(folderPath);
    if (next.specimens.length === 0) {
      hideNavSpinner();
      alert('No VoucherVisionGO JSON files found in this folder.');
      return;
    }

    // Step 2: Acquire project lock (issue #10: concurrent access)
    const lockResult = await window.api.acquireLock(folderPath);
    if (!lockResult.success) {
      hideNavSpinner();
      const h = lockResult.holder;
      if (lockResult.stale) {
        // Issue #3: stale foreign-host lock — ask user before takeover
        const takeover = confirm(
          `A stale lock was found for this project.\n\n` +
          `Holder: ${h.username || 'unknown'}@${h.hostname} (PID ${h.pid})\n` +
          `Since: ${h.acquired_at}\n\n` +
          `The lock lease has expired. Take over?`
        );
        if (!takeover) return;
        // Force acquire by passing through — acquireLock already cleared stale
        await window.api.forceAcquireLock(folderPath);
      } else {
        alert(`This project is already open in another instance.\n\nHolder: PID ${h.pid} on ${h.hostname}\nSince: ${h.acquired_at}\n\nClose that instance first.`);
        return;
      }
    }
    lockAcquired = true;

    // Step 3: Validate single prompt (issue #12: mixed-prompt folders)
    const promptNames = [...new Set(next.specimens.map(s => s.prompt).filter(Boolean))];
    if (promptNames.length > 1) {
      const list = promptNames.map(p => {
        const count = next.specimens.filter(s => s.prompt === p).length;
        return `  ${p} (${count} specimens)`;
      }).join('\n');
      alert(`Mixed prompts detected — this folder contains specimens with different prompt files:\n\n${list}\n\nAll specimens in a project folder must use the same prompt. Please separate them into different folders.`);
      await window.api.releaseLock(folderPath);
      hideNavSpinner();
      return;
    }
    const validatedPromptName = promptNames[0] || '';

    // Step 4: Collect field schema (union of all specimen field keys, issue #5)
    const fieldSchema = await window.api.collectFieldSchema(folderPath, next.specimens);

    // Step 4b: Validate shared field schema (issue #7: detect mismatched schemas)
    const schemaValidation = await window.api.validateFieldSchema(folderPath, next.specimens);
    if (!schemaValidation.valid) {
      const vList = schemaValidation.violations.map(v => {
        const parts = [];
        if (v.extra.length > 0) parts.push(`extra: ${v.extra.join(', ')}`);
        if (v.missing.length > 0) parts.push(`missing: ${v.missing.join(', ')}`);
        return `  ${v.filename}: ${parts.join('; ')}`;
      }).join('\n');
      const proceed = confirm(
        `Schema mismatch detected — not all specimens have the same fields.\n\n` +
        `Reference: ${schemaValidation.referenceSpecimen}\n` +
        `Differences:\n${vList}\n\n` +
        `The union of all fields will be used. Continue anyway?`
      );
      if (!proceed) {
        await window.api.releaseLock(folderPath);
        hideNavSpinner();
        return;
      }
    }

    // Step 5: Load settings
    next.settings = await window.api.loadSettings(folderPath);

    // Step 6: Check for legacy format and migrate if needed (Phase 3A)
    const legacy = await window.api.detectLegacyFormat(folderPath);
    if (legacy.isLegacy && legacy.hasOldState) {
      const migrate = confirm(
        'This project uses an older format.\n\n' +
        'Would you like to migrate to the new format? (Recommended)\n\n' +
        'Your original JSON files will not be modified. ' +
        'A backup of the old state file will be kept.'
      );
      if (migrate) {
        await migrateFromLegacy(folderPath);
      }
    } else if (legacy.hasRootReviewed && !legacy.hasInProgressDir) {
      await window.api.migrateReviewedFiles(folderPath);
    }

    // Step 7: Load or create project state
    next.project = await window.api.loadProject(folderPath);
    if (!next.project) {
      next.project = {
        version: 1,
        folder_path: folderPath,
        last_modified: new Date().toISOString(),
        current_specimen: next.specimens[0].filename,
        checklist_checked: [],
        prompt_name: validatedPromptName,
        prompt_field_schema: fieldSchema,
        save_seq: 0,
      };
      await window.api.saveProject(folderPath, next.project);
    } else {
      next.project.prompt_name = validatedPromptName;
      next.project.prompt_field_schema = fieldSchema;

      // Username typo guard. We derive the set of previously-seen usernames
      // from the progress tracker's sessions (each session already stores a
      // username), so no new project property is needed. If the current
      // username is new and the project has at least one prior session, ask
      // the user to confirm before proceeding.
      const priorUsernames = new Set(
        Object.values(next.project.progress_tracker?.sessions || {})
          .map(s => s?.username)
          .filter(u => u && u !== 'Unknown')
      );
      const currentUser = APP.username;
      if (currentUser && priorUsernames.size > 0 && !priorUsernames.has(currentUser)) {
        hideNavSpinner();
        const accepted = await confirmNewUsernameAssignment(currentUser);
        if (!accepted) {
          await window.api.releaseLock(folderPath);
          renderFolderPicker();
          return;
        }
        showNavSpinner();
      }
    }
    ensureProgressTracker(next.project);

    // Step 8: Load per-specimen in-progress state
    const allInProgress = await window.api.readAllInProgress(folderPath);
    next.state = {
      version: 1,
      folder_path: folderPath,
      current_specimen: next.project.current_specimen || next.specimens[0].filename,
      specimens: {},
    };
    for (const spec of next.specimens) {
      if (allInProgress[spec.filename]) {
        next.state.specimens[spec.filename] = allInProgress[spec.filename];
      }
    }

    // Step 9: Determine starting specimen index
    next.currentIndex = 0;
    if (next.project.current_specimen) {
      const idx = next.specimens.findIndex(s => s.filename === next.project.current_specimen);
      if (idx >= 0) next.currentIndex = idx;
    }

    // ═══════════════════════════════════════════════════════════
    // COMMIT POINT: everything validated — now swap APP state
    // ═══════════════════════════════════════════════════════════

    // Release old project lock and flush if switching folders
    if (APP.folderPath && APP.folderPath !== folderPath) {
      clearAllPendingTimers();
      // Flush old project before releasing — surface failures so user knows data may be lost
      const projectPayload = structuredClone(APP.project || {});
      if (projectPayload) {
        const tracker = ensureProgressTracker(projectPayload);
        const session = APP.sessionId ? tracker?.sessions?.[APP.sessionId] : null;
        if (session) {
          const now = new Date().toISOString();
          session.last_activity_at = session.last_activity_at || now;
          session.ended_at = now;
        }
      }
      if (APP.state) {
        projectPayload.current_specimen = APP.project?.current_specimen || APP.specimens[APP.currentIndex]?.filename || '';
      }
      const flushResult = window.api.flushSaves(APP.folderPath, {
        project: projectPayload,
        inProgress: collectDirtySpecimens(),
        history: {
          version: 1,
          saved_at: new Date().toISOString(),
          folder_path: APP.folderPath,
          stack: REWIND.stack,
        },
      });
      if (flushResult && !flushResult.success) {
        const proceed = confirm(
          `Warning: failed to save current project data before switching.\n\n` +
          `${flushResult.error}\n\n` +
          `Continue switching folders? Unsaved changes may be lost.`
        );
        if (!proceed) {
          hideNavSpinner();
          // Release the new lock we acquired since user is staying on old project
          await window.api.releaseLock(folderPath).catch(() => {});
          return;
        }
      }
      await window.api.releaseLock(APP.folderPath).catch(() => {});
      APP.dirtySpecimens.clear();
      APP.dirtyProject = false;
      REWIND.stack = [];
    }

    // Atomically commit all new state to APP
    _tableSavedScroll = null;
    APP.folderPath = folderPath;
    APP.specimens = next.specimens;
    APP.settings = next.settings;
    APP.mapTheme = APP.settings.mapTheme || 'light';
    APP.project = next.project;
    APP.sessionId = null;
    APP.state = next.state;
    APP.currentIndex = next.currentIndex;
    startProgressTrackingSession(APP.project);

    // Apply UI settings
    applyThemeColors();
    applyTypographySettings();
    document.body.classList.add('compact-view');

    rebuildSpecimenIndexMap();
    invalidateFocusAnalysisCaches(true);

    // Invalidate focus view so it rebuilds on next visit
    const focusEl = document.getElementById('focus-view');
    if (focusEl) focusEl.innerHTML = '';

    // Compute completion status for all loaded specimens
    for (const spec of APP.specimens) {
      if (APP.state.specimens[spec.filename]) {
        updateSpecimenCompletionStatus(spec.filename);
      }
    }

    // Load rewind history checkpoint
    await loadRewindCheckpoint();

    showView('review');
    await loadSpecimen(APP.currentIndex);
    window.api.warmImageCache(folderPath, APP.specimens.map(s => s.filename)).catch(err => {
      console.warn('Failed to start image cache warming:', err);
    });
    hideNavSpinner();
  } catch (err) {
    // Rollback: release the lock we acquired for the new folder, leave APP untouched
    if (lockAcquired) {
      await window.api.releaseLock(folderPath).catch(() => {});
    }
    hideNavSpinner();
    alert(`Failed to open folder: ${err.message || err}`);
  }
}

/**
 * Migrate from legacy format (_vvgo_editor_state.json) to new three-tier format.
 */
async function migrateFromLegacy(folderPath) {
  try {
    // Load old state
    const oldState = await window.api.loadState(folderPath);
    if (!oldState) return;

    // Write each specimen's state as an in-progress file
    if (oldState.specimens) {
      for (const [filename, specState] of Object.entries(oldState.specimens)) {
        const ipData = {
          version: 1,
          original_filename: filename,
          prompt_name: '',
          last_modified: specState.last_touched || new Date().toISOString(),
          accepted_fields: specState.accepted_fields || {},
          unconfirmed_fields: specState.unconfirmed_fields || {},
          categories_confirmed: specState.categories_confirmed || [],
          flagged: specState.flagged || false,
          flag_note: specState.flag_note || '',
          flag_tags: specState.flag_tags || [],
          status: specState.status || 'in_progress',
        };
        await window.api.writeInProgress(folderPath, filename, ipData);
      }
    }

    // Move root-level __REVIEWED files to _REVIEWED/
    await window.api.migrateReviewedFiles(folderPath);

    // The old state file will be superseded by _project.json (created in loadFolder)
    // Keep a backup
    // Note: old history and settings files are auto-migrated by their respective managers
  } catch (e) {
    console.warn('Migration failed:', e);
    alert('Migration encountered an error. Your original files are unchanged.');
  }
}

// ── Specimen Loading ────────────────────────────────────────

async function loadSpecimen(index) {
  if (index < 0 || index >= APP.specimens.length) return;
  showNavSpinner();
  APP.currentIndex = index;

  const spec = APP.specimens[index];
  APP.currentSpecimen = await window.api.readSpecimen(APP.folderPath, spec.filename);

  // Fetch prompt
  if (APP.currentSpecimen.prompt) {
    APP.currentPrompt = await window.api.fetchPrompt(APP.currentSpecimen.prompt, APP.folderPath);
  } else {
    APP.currentPrompt = { mapping: {}, rules: {}, metadata: {}, checklist: [], review_not_required: [] };
  }

  // Initialize specimen state if not exists
  if (!APP.state.specimens[spec.filename]) {
    initSpecimenState(spec.filename);
  }

  // Update current specimen in project state
  if (APP.project) {
    APP.project.current_specimen = spec.filename;
  }

  // Set active category
  const categories = getCategories();
  if (categories.length > 0) {
    APP.activeCategory = categories[0].name;
  }

  renderReviewView();
  updateNavBar();
  scheduleProjectSave();
  hideNavSpinner();
}

function initSpecimenState(filename) {
  APP.state.specimens[filename] = {
    version: 1,
    original_filename: filename,
    prompt_name: APP.project?.prompt_name || '',
    status: 'in_progress',
    accepted_fields: {},
    unconfirmed_fields: {},
    categories_confirmed: [],
    flagged: false,
    flag_note: '',
    flag_tags: [],
    last_touched: new Date().toISOString()
  };
}

// ── Progress Tracker ────────────────────────────────────────

function ensureProgressTracker(project) {
  if (!project) return null;
  if (!project.progress_tracker || typeof project.progress_tracker !== 'object') {
    project.progress_tracker = { version: 1, sessions: {} };
  }
  if (!project.progress_tracker.sessions || typeof project.progress_tracker.sessions !== 'object' || Array.isArray(project.progress_tracker.sessions)) {
    project.progress_tracker.sessions = {};
  }
  return project.progress_tracker;
}

function startProgressTrackingSession(project = APP.project) {
  if (!project) return null;
  const tracker = ensureProgressTracker(project);
  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  tracker.sessions[sessionId] = {
    id: sessionId,
    username: APP.username || 'Unknown',
    started_at: now,
    ended_at: null,
    last_activity_at: now,
    action_count: 0,
    unique_cells_reviewed: [],
    unique_specimens_reviewed: [],
  };
  APP.sessionId = sessionId;
  return tracker.sessions[sessionId];
}

function closeCurrentProgressSession(project = APP.project) {
  if (!project || !APP.sessionId) return;
  const tracker = ensureProgressTracker(project);
  const session = tracker.sessions?.[APP.sessionId];
  if (!session) return;
  const now = new Date().toISOString();
  session.last_activity_at = session.last_activity_at || now;
  session.ended_at = now;
}

function recordProgressTrackerEntry(entry) {
  if (!APP.project || !entry?.session_id) return;
  const tracker = ensureProgressTracker(APP.project);
  const session = tracker.sessions?.[entry.session_id];
  if (!session) return;

  const cellKeys = new Set(session.unique_cells_reviewed || []);
  const specimenKeys = new Set(session.unique_specimens_reviewed || []);

  for (const [filename, specDiff] of Object.entries(entry.diffs || {})) {
    let touchedSpecimen = false;
    if (specDiff.accepted_fields) {
      for (const field of Object.keys(specDiff.accepted_fields)) {
        cellKeys.add(`${filename}::${field}`);
        touchedSpecimen = true;
      }
    }
    if (specDiff.unconfirmed_fields) {
      for (const field of Object.keys(specDiff.unconfirmed_fields)) {
        cellKeys.add(`${filename}::${field}`);
        touchedSpecimen = true;
      }
    }
    if (touchedSpecimen) specimenKeys.add(filename);
  }

  session.username = entry.username || session.username || 'Unknown';
  session.last_activity_at = new Date(entry.timestamp || Date.now()).toISOString();
  session.action_count = (session.action_count || 0) + 1;
  session.unique_cells_reviewed = [...cellKeys];
  session.unique_specimens_reviewed = [...specimenKeys];
  scheduleProjectSave();
}

function getProgressTrackerSummary(project = APP.project) {
  const tracker = ensureProgressTracker(project);
  const sessions = Object.values(tracker?.sessions || {}).map(session => {
    const cellKeys = new Set(session.unique_cells_reviewed || []);
    const specimenKeys = new Set(session.unique_specimens_reviewed || []);
    const startedAt = session.started_at || session.last_activity_at || null;
    const endedAt = session.ended_at || session.last_activity_at || startedAt;
    const durationMs = startedAt && endedAt
      ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
      : 0;
    return {
      ...session,
      username: session.username || 'Unknown',
      cellKeys,
      specimenKeys,
      durationMs,
      isCurrent: session.id === APP.sessionId && !session.ended_at,
    };
  }).sort((a, b) => new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime());

  const reviewerMap = new Map();
  const allCellKeys = new Set();
  const allSpecimenKeys = new Set();

  for (const session of sessions) {
    session.cellKeys.forEach(key => allCellKeys.add(key));
    session.specimenKeys.forEach(key => allSpecimenKeys.add(key));

    if (!reviewerMap.has(session.username)) {
      reviewerMap.set(session.username, {
        username: session.username,
        sessionCount: 0,
        actionCount: 0,
        durationMs: 0,
        cellKeys: new Set(),
        specimenKeys: new Set(),
        firstStartedAt: session.started_at || null,
        lastActivityAt: session.last_activity_at || session.started_at || null,
      });
    }
    const reviewer = reviewerMap.get(session.username);
    reviewer.sessionCount += 1;
    reviewer.actionCount += session.action_count || 0;
    reviewer.durationMs += session.durationMs;
    session.cellKeys.forEach(key => reviewer.cellKeys.add(key));
    session.specimenKeys.forEach(key => reviewer.specimenKeys.add(key));

    if (!reviewer.firstStartedAt || new Date(session.started_at || 0) < new Date(reviewer.firstStartedAt || 0)) {
      reviewer.firstStartedAt = session.started_at || reviewer.firstStartedAt;
    }
    if (!reviewer.lastActivityAt || new Date(session.last_activity_at || session.started_at || 0) > new Date(reviewer.lastActivityAt || 0)) {
      reviewer.lastActivityAt = session.last_activity_at || session.started_at || reviewer.lastActivityAt;
    }
  }

  const reviewers = [...reviewerMap.values()]
    .map(reviewer => ({
      ...reviewer,
      uniqueCellsReviewed: reviewer.cellKeys.size,
      uniqueSpecimensReviewed: reviewer.specimenKeys.size,
    }))
    .sort((a, b) => (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) - (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0));

  return {
    sessions: sessions.map(session => ({
      ...session,
      uniqueCellsReviewed: session.cellKeys.size,
      uniqueSpecimensReviewed: session.specimenKeys.size,
    })),
    reviewers,
    totals: {
      reviewerCount: reviewers.length,
      sessionCount: sessions.length,
      uniqueCellsReviewed: allCellKeys.size,
      uniqueSpecimensReviewed: allSpecimenKeys.size,
      actionCount: sessions.reduce((sum, session) => sum + (session.action_count || 0), 0),
      durationMs: sessions.reduce((sum, session) => sum + session.durationMs, 0),
    },
  };
}

function formatTrackerTimestamp(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatTrackerDuration(ms) {
  if (!ms || ms < 60000) return ms && ms > 0 ? '< 1m' : '0m';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function openProgressTrackerPopup() {
  const summary = getProgressTrackerSummary();
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  const reviewerHtml = summary.reviewers.length > 0
    ? summary.reviewers.map(reviewer => `
        <div class="progress-tracker-reviewer-card">
          <div class="progress-tracker-reviewer-head">
            <span class="progress-tracker-reviewer-name">${escapeHtml(reviewer.username)}</span>
            <span class="progress-tracker-reviewer-meta">${reviewer.sessionCount} session${reviewer.sessionCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="progress-tracker-reviewer-stats">
            <span>${reviewer.uniqueCellsReviewed} cells</span>
            <span>${reviewer.uniqueSpecimensReviewed} specimens</span>
            <span>${reviewer.actionCount} actions</span>
            <span>${formatTrackerDuration(reviewer.durationMs)}</span>
          </div>
          <div class="progress-tracker-reviewer-subtle">Last activity: ${escapeHtml(formatTrackerTimestamp(reviewer.lastActivityAt))}</div>
        </div>
      `).join('')
    : '<div class="progress-tracker-empty">No tracked review activity has been recorded in this project yet.</div>';

  const sessionRows = summary.sessions.length > 0
    ? summary.sessions.map(session => `
        <div class="progress-tracker-session-row">
          <span>${escapeHtml(session.username)}</span>
          <span>${escapeHtml(formatTrackerTimestamp(session.started_at))}</span>
          <span>${escapeHtml(session.ended_at ? formatTrackerTimestamp(session.ended_at) : session.isCurrent ? 'Current session' : formatTrackerTimestamp(session.last_activity_at))}</span>
          <span>${formatTrackerDuration(session.durationMs)}</span>
          <span>${session.uniqueCellsReviewed}</span>
          <span>${session.uniqueSpecimensReviewed}</span>
          <span>${session.action_count || 0}</span>
        </div>
      `).join('')
    : '<div class="progress-tracker-empty">Tracking begins once review actions are performed in this version of the editor.</div>';

  overlay.innerHTML = `
    <div class="progress-tracker-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <span>Progress Tracker</span>
        ${popupCloseBtnHtml('progress-tracker-close')}
      </div>
      <div class="progress-tracker-intro">
        Supervisor view of reviewer activity for this project. Session lengths and review totals are based on tracked editing actions saved with the project.
      </div>
      <div class="progress-tracker-summary-grid">
        <div class="progress-tracker-summary-card"><span class="progress-tracker-summary-value">${summary.totals.reviewerCount}</span><span class="progress-tracker-summary-label">Reviewers</span></div>
        <div class="progress-tracker-summary-card"><span class="progress-tracker-summary-value">${summary.totals.sessionCount}</span><span class="progress-tracker-summary-label">Sessions</span></div>
        <div class="progress-tracker-summary-card"><span class="progress-tracker-summary-value">${summary.totals.uniqueCellsReviewed}</span><span class="progress-tracker-summary-label">Unique Cells Reviewed</span></div>
        <div class="progress-tracker-summary-card"><span class="progress-tracker-summary-value">${summary.totals.uniqueSpecimensReviewed}</span><span class="progress-tracker-summary-label">Unique Specimens Reviewed</span></div>
        <div class="progress-tracker-summary-card"><span class="progress-tracker-summary-value">${summary.totals.actionCount}</span><span class="progress-tracker-summary-label">Tracked Actions</span></div>
        <div class="progress-tracker-summary-card"><span class="progress-tracker-summary-value">${formatTrackerDuration(summary.totals.durationMs)}</span><span class="progress-tracker-summary-label">Tracked Time</span></div>
      </div>
      <div class="progress-tracker-section">
        <div class="progress-tracker-section-title">Reviewer Totals</div>
        <div class="progress-tracker-reviewer-grid">${reviewerHtml}</div>
      </div>
      <div class="progress-tracker-section">
        <div class="progress-tracker-section-title">Sessions</div>
        <div class="progress-tracker-session-table">
          <div class="progress-tracker-session-header">
            <span>Reviewer</span>
            <span>Started</span>
            <span>Ended</span>
            <span>Duration</span>
            <span>Cells</span>
            <span>Specimens</span>
            <span>Actions</span>
          </div>
          ${sessionRows}
        </div>
      </div>
      <div class="progress-tracker-footer">
        <button class="btn-sm btn-primary" id="progress-tracker-done">Done</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  overlay.querySelector('#progress-tracker-close')?.addEventListener('click', close);
  overlay.querySelector('#progress-tracker-done')?.addEventListener('click', close);
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
      ${renderCaseControls('form')}
      ${renderWebSearchModule('form')}
      <div class="review-nav-jump ml-auto">
        <span class="text-muted" style="font-size:var(--fs-11)">Jump to:</span>
        <input type="number" min="1" max="${APP.specimens.length}" value="${APP.currentIndex + 1}" id="input-jump" style="width:60px">
        <button class="btn-sm" id="btn-jump">Go</button>
      </div>
      <div id="bounce-bar" style="display:inline-flex"></div>
    </div>
    <div class="nav-bar-form">
      <div class="nav-bar-form-section nav-bar-form-left">
        <button class="btn-icon flag-btn ${specState.flagged ? 'flagged' : ''}" id="btn-flag" title="${specState.flagged ? 'Unflag specimen' : 'Flag specimen'}">${flagAndTagHtml(spec.filename, 16, 'form')}</button>
        <div class="flag-note-wrapper">
          <input
            class="flag-note-input"
            id="flag-note-input"
            type="text"
            value="${escapeAttr(specState.flag_note || '')}"
            placeholder="Flag message"
            aria-label="Flag message"
          >
          <div class="flag-note-flair" id="flag-note-flair"></div>
        </div>
      </div>
      <div class="nav-bar-form-section nav-bar-form-center">
        <span class="review-nav-filename">${escapeHtml(getDisplayFilename(spec.filename))}</span>
        <span id="review-status-badge">${getSpecimenStatusBadgeHtml(spec.filename)}</span>
      </div>
      <div class="nav-bar-form-section nav-bar-form-right"></div>
    </div>
    <div class="review-body resizable-container" id="review-resizable">
      <div class="panel-left" id="review-panel-left">
        <div class="review-specimen-nav-wrap">
          <nav class="review-specimen-nav" aria-label="Specimen navigation">
            <button class="btn-sm btn-icon" id="btn-prev" ${APP.currentIndex === 0 ? 'disabled' : ''}><img src="icons/arrow-left.svg" alt="Previous specimen"></button>
            <span class="review-specimen-nav-label" id="btn-current-specimen">Specimen ${APP.currentIndex + 1} of ${APP.specimens.length}</span>
            <button class="btn-sm btn-icon" id="btn-next" ${APP.currentIndex === APP.specimens.length - 1 ? 'disabled' : ''}><img src="icons/arrow-right.svg" alt="Next specimen"></button>
          </nav>
        </div>
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
  const formFlagBtn = document.getElementById('btn-flag');
  formFlagBtn.addEventListener('click', (e) => {
    // Let inner tag.svg button handle its own click
    if (e.target.closest('.flag-tag-btn')) return;
    toggleFlag();
  });
  const currentSpec = APP.specimens[APP.currentIndex];
  const initialFlagged = !!(currentSpec && APP.state.specimens[currentSpec.filename]?.flagged);
  updateFormFlagButtonUi(initialFlagged);
  wireFormFlagNote();
  wireCaseControls('form');
  wireWebSearch('form');

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
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, APP.imageType, 'full');

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
  overlay.innerHTML = `
    <div style="position:relative;display:inline-block" onclick="event.stopPropagation()">
      ${popupCloseBtnHtml('image-modal-close', 'Close', true)}
      <img src="${dataUrl}" alt="Specimen image zoomed">
    </div>
  `;
  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  overlay.querySelector('#image-modal-close').addEventListener('click', close);
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
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'satellite', label: 'Satellite' },
    { value: 'topo', label: 'Topo' }
  ], APP.mapTheme, (val) => {
    APP.mapTheme = val;
    switchMapTiles();
  });

  const extraHeaderHtml = `
    <span style="font-size:var(--fs-11);color:var(--text-secondary);font-family:var(--font-mono)">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
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
            <button type="button" class="elev-calc-swap-btn" id="elev-swap-btn" title="Swap meters and feet values"><span class="elev-calc-swap-icon" aria-hidden="true"></span></button>
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
    // Which field holds the user's "real" value (the one they typed). The
    // other is always the computed conversion. Initial data populates meters,
    // so default the real field to meters.
    let elevRealField = 'meters';
    metersEl.addEventListener('input', () => {
      elevRealField = 'meters';
      const m = parseFloat(metersEl.textContent.replace(/[^\d.\-]/g, ''));
      feetEl.textContent = isNaN(m) ? '' : (m * 3.28084).toFixed(1);
    });
    feetEl.addEventListener('input', () => {
      elevRealField = 'feet';
      const ft = parseFloat(feetEl.textContent.replace(/[^\d.\-]/g, ''));
      metersEl.textContent = isNaN(ft) ? '' : (ft / 3.28084).toFixed(1);
    });
    // Prevent newlines
    [metersEl, feetEl].forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    });
    // Swap button: take the real value, move it into the other field, and
    // fire that field's input event so the conversion recalculates the
    // originating field. Self-inverse — clicking twice restores the original
    // state — and never cascades into a runaway recalculation because only
    // user-like input events (not programmatic textContent writes) trigger
    // the listeners.
    document.getElementById('elev-swap-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (elevRealField === 'meters') {
        const val = metersEl.textContent;
        feetEl.textContent = val;
        feetEl.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const val = feetEl.textContent;
        metersEl.textContent = val;
        metersEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
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
    if (body) body.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:var(--fs-12)">Map unavailable</div>';
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
      ${wfo.WFO_override_OCR ? `<div class="info-row"><span class="info-row-label">Override OCR</span><span class="info-row-value">${escapeHtml(wfo.WFO_override_OCR)}</span></div>` : ''}
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

  const elevHtml = `<span style="font-size:var(--fs-11);color:var(--text-secondary);margin-left:auto">${escapeHtml(String(elev))} m</span>`;
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
      ${meta.prompt_description ? `<div style="margin-top:6px;font-size:var(--fs-11);color:var(--text-muted)">${escapeHtml(meta.prompt_description)}</div>` : ''}
    </div>
    ${raw ? `<div class="scrollable-content yaml-content">${formattedYaml}</div>` : ''}
  `;

  const nameLabel = `<span style="font-size:var(--fs-10);color:var(--text-muted);margin-left:auto;font-family:var(--font-mono)">${escapeHtml(meta.prompt_name || APP.currentSpecimen.prompt || '')}</span>`;
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
    <button class="btn-sm bounce-btn" id="btn-bounce"><span class="bounce-btn-icon" aria-hidden="true"></span>${label}</button>
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

  el.innerHTML = categories.map(cat => {
    const isActive = cat.name === APP.activeCategory;
    const isConfirmed = isCategoryResolved(spec.filename, cat.fields);
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
  return fields.filter(f =>
    specState.accepted_fields?.[f] !== undefined
    && specState.unconfirmed_fields?.[f] === undefined
  ).length;
}

function isCategoryResolved(filename, fields) {
  return getResolvedFieldCount(filename, fields) === fields.length;
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
      const notRequired = isReviewNotRequiredField(field);
      const batchAccepted = notRequired && isFieldBatchAcceptedWithVoucherVision(field);
      const fieldWarnHtml = notRequired && !batchAccepted
        ? `<span class="focus-field-warning" title="This field does NOT require manual review. Please use the Batch-Accept VoucherVision Content tool located in the VoucherVision tools panel">&#9888;</span>`
        : '';

      return `
        <div class="field-row ${isResolved && !hasUnconfirmed ? 'resolved' : ''} ${hasUnconfirmed ? 'unconfirmed' : ''}" data-field="${field}" data-source="${source}" data-status="${hasUnconfirmed ? 'Unconfirmed Change' : getStatusLabel(source)}">
          <div class="field-label" style="color: ${isResolved && !hasUnconfirmed ? 'var(--text-muted)' : hasUnconfirmed ? 'var(--warning)' : cat.color}">
            ${fieldWarnHtml}${escapeHtml(field)}
            ${!hasUnconfirmed ? `<button class="btn-icon field-uncertain-btn" data-field="${field}" title="Set status to Unconfirmed Change">&#8635;</button>` : ''}
            <span class="field-status ${source}">${hasUnconfirmed ? 'Unconfirmed Change' : getStatusLabel(source)}</span>
          </div>
          <div class="field-ai-value ${isEmpty ? 'empty' : ''}">
            ${isEmpty ? '(empty)' : escapeHtml(aiValue)}
          </div>
          <div class="field-actions">
            ${hasUnconfirmed
              ? `<button class="btn-icon field-confirm-unconfirmed-btn field-action-icon-btn field-action-confirm" data-field="${field}" title="Confirm this change"></button>`
              : !isEmpty
                ? `<button class="btn-icon field-accept-btn field-action-icon-btn field-action-accept" data-field="${field}" data-value="${escapeAttr(aiValue)}" title="Accept AI value"></button>`
                : `<button class="btn-icon field-accept-btn field-confirm-empty-btn field-action-icon-btn field-action-accept" data-field="${field}" title="Confirm empty"></button>`
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

      const _rwBefore = rewindCapture([spec.filename], [field], { categories_confirmed: true });

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

      rewindRecord('markUncertain', 'Mark Uncertain', `"${field}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);

      scheduleSaveState(spec.filename);
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
      const specState = APP.state.specimens[spec.filename];
      if (!specState) return;

      // Read the latest value from the contenteditable div (user may have edited further)
      const inputEl = el.querySelector(`.field-input[data-field="${field}"]`);
      const latestValue = inputEl
        ? inputEl.textContent.replace(/\n/g, ' ').trim()
        : specState.unconfirmed_fields?.[field] || '';
      confirmPendingField(field, latestValue);
    });
  });

  el.querySelectorAll('.field-input').forEach(input => {
    let _rwEntry = null; // Tracked globally via pendingRewindInputs registry
    let skipBlurStaging = false;
    const field = input.dataset.field;
    const spec = APP.specimens[APP.currentIndex];
    const specState = APP.state.specimens[spec.filename];
    if (!specState) return;
    const initialSnapshot = snapshotFieldState(specState, field);
    const initialValue = input.textContent.replace(/\n/g, ' ').trim();

    // Issue #6 fix: ALL typing stages to unconfirmed_fields first.
    // Only explicit actions (blur, Enter, confirm button) accept the field.
    input.addEventListener('input', () => {
      const value = input.textContent.replace(/\n/g, ' ').trim();
      const currentSpecState = APP.state.specimens[spec.filename];
      if (!currentSpecState) return;
      const changedFromInitial = value !== initialValue;

      // Capture before first keystroke in this typing burst
      if (changedFromInitial && (!_rwEntry || !_rwEntry.before)) {
        _rwEntry = registerPendingRewindInput(spec.filename, field, rewindCapture([spec.filename], [field]));
      }

      if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, field, value);
      else restoreFieldState(currentSpecState, field, initialSnapshot);
      currentSpecState.last_touched = new Date().toISOString();

      // Visual feedback
      const row = input.closest('.field-row');
      if (row) {
        const stillUnconfirmed = changedFromInitial || initialSnapshot.unconfirmed !== undefined;
        row.classList.toggle('resolved', !stillUnconfirmed && initialSnapshot.accepted !== undefined);
        row.classList.toggle('unconfirmed', stillUnconfirmed);
        const statusEl = row.querySelector('.field-status');
        if (statusEl) {
          if (stillUnconfirmed) {
            statusEl.className = 'field-status unconfirmed';
            statusEl.textContent = 'Unconfirmed Change';
          } else if (initialSnapshot.accepted) {
            statusEl.className = `field-status ${initialSnapshot.accepted.source}`;
            statusEl.textContent = getStatusLabel(initialSnapshot.accepted.source);
          } else {
            statusEl.className = 'field-status pending';
            statusEl.textContent = 'pending';
          }
        }
        const labelEl = row.querySelector('.field-label');
        if (labelEl) {
          labelEl.style.color = stillUnconfirmed
            ? 'var(--warning)'
            : initialSnapshot.accepted
              ? 'var(--text-muted)'
              : cat.color;
        }
      }

      scheduleInProgressSave(spec.filename);

      // Debounce the rewind record
      if (_rwEntry) {
        if (_rwEntry.timeout) clearTimeout(_rwEntry.timeout);
        _rwEntry.timeout = setTimeout(() => {
          commitPendingRewindInput(_rwEntry);
          _rwEntry = null;
        }, 1000);
      }
    });

    // Confirm on blur (issue #6: explicit confirmation, not auto-accept)
    input.addEventListener('blur', () => {
      if (skipBlurStaging) {
        skipBlurStaging = false;
        return;
      }
      const currentSpecState = APP.state.specimens[spec.filename];
      if (!currentSpecState) return;
      const value = input.textContent.replace(/\n/g, ' ').trim();

      if (value !== initialValue) stageFieldAsUnconfirmed(currentSpecState, field, value);
      else restoreFieldState(currentSpecState, field, initialSnapshot);
      currentSpecState.last_touched = new Date().toISOString();

      if (_rwEntry && _rwEntry.before) {
        commitPendingRewindInput(_rwEntry);
        _rwEntry = null;
      }

      scheduleInProgressSave(spec.filename);
      scheduleReviewFormRerender();
    });

    input.addEventListener('keydown', (e) => {
      if (isEnterKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        const currentSpecState = APP.state.specimens[spec.filename];
        if (!currentSpecState) return;
        const latestValue = input.textContent.replace(/\n/g, ' ').trim();

        if (_rwEntry && _rwEntry.before) {
          commitPendingRewindInput(_rwEntry);
          _rwEntry = null;
        }

        const hasPendingValue = currentSpecState.unconfirmed_fields?.[field] !== undefined
          || initialSnapshot.unconfirmed !== undefined
          || latestValue !== initialValue;
        if (!hasPendingValue) return;

        skipBlurStaging = true;
        confirmPendingField(field, latestValue, false);
      }
    });
  });

  // Align all field labels to the widest one
  alignFieldLabels(el);
}

function alignFieldLabels(container) {
  const labels = container.querySelectorAll('.field-label');
  if (labels.length === 0) return;
  const actionColumnWidth = '42px';
  const statusColumnWidth = '72px';

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
    row.style.gridTemplateColumns = `${widthPx} minmax(0, 1fr) ${actionColumnWidth} minmax(0, 1fr) ${statusColumnWidth}`;
  });
  const headers = container.querySelector('.field-row-headers');
  if (headers) headers.style.gridTemplateColumns = `${widthPx} minmax(0, 1fr) ${actionColumnWidth} minmax(0, 1fr) ${statusColumnWidth}`;
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

function isEnterKey(event) {
  return event.key === 'Enter'
    || event.code === 'Enter'
    || event.code === 'NumpadEnter'
    || event.keyCode === 13;
}

function getStatusLegendItems() {
  return [
    { className: 'pending', label: 'Pending', swatchStyle: 'background:#000' },
    { className: 'unconfirmed', label: 'Unconfirmed', swatchStyle: 'background:var(--warning)' },
    { className: 'ai', label: 'Accepted', swatchStyle: 'background:transparent;border:1px solid var(--border)' },
    { className: 'edited', label: 'Accepted (edited)', swatchStyle: 'background:#2d5a7a' },
    { className: 'user_added', label: 'Accepted (added)', swatchStyle: 'background:var(--accent)' },
    { className: 'confirmed_empty', label: 'Accepted (empty)', swatchStyle: 'background:rgba(255,255,255,0.08);border:1px solid var(--border)' },
  ];
}

function renderStatusLegend(className = 'status-key') {
  return `
    <div class="${className}">
      ${getStatusLegendItems().map(item => `
        <span class="status-key-item status-key-item-${item.className}">
          <span class="status-key-swatch" style="${item.swatchStyle}"></span>${item.label}
        </span>
      `).join('')}
    </div>
  `;
}

function getCaseModuleLabel(mode) {
  return 'Case - apply to selection';
}

function renderCaseControls(mode) {
  return `
    <div class="case-module case-module-${mode}">
      <div class="case-module-label">${getCaseModuleLabel(mode)}</div>
      <div class="case-module-buttons">
        <button class="btn-sm" data-case-type="title">Title Case</button>
        <button class="btn-sm" data-case-type="lower">lower</button>
        <button class="btn-sm" data-case-type="upper">UPPER</button>
      </div>
    </div>
  `;
}

const _isMac = navigator.userAgent.includes('Mac');
const _searchModifierKey = _isMac ? '⌘' : 'Ctrl';
const HOTKEY_CARD_DEFS = [
  {
    title: '*G*oogle Search',
    keys: ['mod', 'G'],
    description: 'Opens a Google search for the currently highlighted text',
    icon: 'icons/search.svg',
  },
  {
    title: '*F*ind Specimens With...',
    keys: ['mod', 'F'],
    description: 'Show a list of specimens that contain your query',
    icon: 'icons/view.svg',
  },
  {
    title: '*B*ounce',
    keys: ['mod', 'B'],
    description: 'Bounce to next unresolved field (Form mode only)',
    icon: 'icons/lightning.svg',
  },
  {
    title: '*D*o toggle case',
    keys: ['mod', 'D'],
    description: 'Toggle the case for selected text, applies in this order: Title → lower → UPPER',
    icon: 'icons/case.svg',
  },
  {
    title: '*E*very Flag',
    keys: ['mod', 'E'],
    description: 'Open Flagged Specimen Viewer',
    icon: 'icons/flag.svg',
  },
  {
    title: '*R*ewind',
    keys: ['mod', 'R'],
    description: 'Undo an action via the Rewind Tool',
    icon: 'icons/refresh-ccw.svg',
  },
  {
    title: '*M*ode Swap',
    keys: ['mod', 'M'],
    description: 'Toggle between Form, Table, Focus modes',
    icon: 'icons/swap.svg',
  },
  {
    title: '*S*ettings',
    keys: ['mod', 'S'],
    description: 'Open Settings',
    icon: 'icons/settings.svg',
  },
  {
    title: 'Checklis*T*',
    keys: ['mod', 'T'],
    description: 'Open the Checklist',
    icon: 'icons/list-todo.svg',
  },
  // Keep this Hotkeys entry last in the list.
  {
    title: '*H*otkeys',
    keys: ['mod', 'H'],
    description: 'Open Hotkeys',
    icon: 'icons/hotkey.svg',
  },
];

function cycleModeView() {
  const modeOrder = ['review', 'table', 'focus'];
  const currentIndex = modeOrder.indexOf(APP.currentView);
  if (currentIndex === -1) return;
  const nextView = modeOrder[(currentIndex + 1) % modeOrder.length];
  if (nextView === 'review') {
    showView('review');
    renderReviewView();
  } else if (nextView === 'table') {
    showView('table');
    renderTableView();
  } else {
    showView('focus');
    renderFocusView();
  }
}

function renderWebSearchModule(mode) {
  return `
    <div class="case-module case-module-${mode}">
      <div class="case-module-label">Web Search or ${_searchModifierKey}+G selected text</div>
      <div class="case-module-buttons">
        <input type="text" class="web-search-input" id="web-search-input-${mode}" placeholder="Search..." style="width:140px;font-size:var(--fs-11);padding:2px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-primary);color:var(--text-primary)">
        <button class="btn-sm web-search-btn" data-mode="${mode}">Go</button>
      </div>
    </div>
  `;
}

function openWebSearchPopup(query) {
  if (!query || !query.trim()) return;
  const q = query.trim();
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  const bodyHtml = isDemoMode()
    ? `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--text-secondary);font-size:var(--fs-14);line-height:1.5">
        In the real version, this would open a Google search for:<br><br>
        <strong style="color:var(--text-primary)">${escapeHtml(q)}</strong>
      </div>
    `
    : `<webview src="https://www.google.com/search?q=${encodeURIComponent(q)}" style="flex:1" allowpopups></webview>`;
  overlay.innerHTML = `
    <div style="width:80vw;height:80vh;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);display:flex;flex-direction:column;overflow:hidden;cursor:default" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;padding:8px 12px;gap:8px;border-bottom:1px solid var(--border)">
        <span style="font-size:var(--fs-12);color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Search: ${escapeHtml(q)}</span>
        ${popupCloseBtnHtml('web-search-close')}
      </div>
      ${bodyHtml}
    </div>
  `;
  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  overlay.querySelector('#web-search-close').addEventListener('click', close);
}

function wireWebSearch(mode) {
  const input = document.getElementById(`web-search-input-${mode}`);
  const btn = document.querySelector(`.web-search-btn[data-mode="${mode}"]`);
  if (!input || !btn) return;
  const doSearch = () => openWebSearchPopup(input.value);
  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });
}

// Global Ctrl+G / Cmd+G shortcut: search selected text
// Returns true if the event target is a text input, textarea, or contenteditable
// element — a "typing context" where clipboard and standard editing shortcuts
// should pass through to the browser untouched.
function isTypingContext(e) {
  const t = e.target;
  if (!t) return false;
  const tag = (t.tagName || '').toLowerCase();
  if (tag === 'input') {
    const type = (t.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
  }
  if (tag === 'textarea') return true;
  if (t.isContentEditable) return true;
  return false;
}

document.addEventListener('keydown', (e) => {
  // Require the platform's primary modifier (Cmd on Mac, Ctrl elsewhere).
  // Bail early on any event without it so we never interfere with plain typing.
  const primaryMod = _isMac ? e.metaKey : e.ctrlKey;
  if (!primaryMod || e.shiftKey || e.altKey) return;

  // Never intercept clipboard/edit/select-all/undo/redo — the application menu
  // owns these accelerators globally, and in typing contexts the browser's
  // default behavior must pass through untouched.
  if (['c', 'v', 'x', 'a', 'z', 'y'].includes(e.key)) return;

  // Every other Cmd+<key> handler below runs unconditionally whenever the app
  // window is focused (renderer keydown only fires for the focused window, so
  // clicking away to another app automatically disables the overrides).
  if (e.key === 'g') {
    const selected = window.getSelection().toString().trim();
    if (selected) {
      e.preventDefault();
      openWebSearchPopup(selected);
    }
    return;
  }

  if (e.key === 'm') {
    if (['review', 'table', 'focus'].includes(APP.currentView)) {
      e.preventDefault();
      cycleModeView();
    }
    return;
  }

  if (e.key === 'r') {
    e.preventDefault();
    openRewindPopup();
    return;
  }

  if (e.key === 's') {
    e.preventDefault();
    openSettingsPopup();
    return;
  }

  if (e.key === 't') {
    e.preventDefault();
    openChecklistPopup();
    return;
  }

  if (e.key === 'h') {
    e.preventDefault();
    openHotkeysPopup();
    return;
  }

  if (e.key === 'f') {
    e.preventDefault();
    openFindPopup();
    return;
  }

  if (e.key === 'b') {
    if (APP.currentView === 'review') {
      const bounceBtn = document.getElementById('btn-bounce');
      if (bounceBtn && !bounceBtn.disabled) {
        e.preventDefault();
        bounceBtn.click();
      }
    }
    return;
  }

  if (e.key === 'e') {
    e.preventDefault();
    openFlaggedSpecimensPopup();
    return;
  }

  if (e.key === 'd') {
    // Toggle-case cycle for the currently-selected text.
    // Order: Title → lower → UPPER → Title → ...
    // The cycle resets whenever the user changes the selection (new element
    // or the selected text no longer matches the last transform's output),
    // so pressing Ctrl+D on a fresh selection always lands on Title first.
    const context = captureCaseSelectionForCurrentContext();
    if (!context || !context.selectedText) return;
    e.preventDefault();
    const cycle = ['title', 'lower', 'upper'];

    const isContinuation =
      _caseToggleLastElement === context.element &&
      _caseToggleLastExpectedText === context.selectedText;
    _caseToggleCycleIndex = isContinuation
      ? (_caseToggleCycleIndex + 1) % cycle.length
      : 0;

    const nextType = cycle[_caseToggleCycleIndex];
    applyCaseTransformToSelection(nextType, context);
    _caseToggleLastElement = context.element;
    _caseToggleLastExpectedText = transformCaseText(context.selectedText, nextType);
    return;
  }
});

// Ctrl+D toggle-case state. The cycle restarts whenever the user changes
// selection so pressing Ctrl+D always lands on Title first for new selections.
let _caseToggleCycleIndex = -1;
let _caseToggleLastElement = null;
let _caseToggleLastExpectedText = null;

// Picks the correct capture function based on which popup/view the user is
// currently interacting with. Tries the most specific context first (cluster
// popup overlay) then falls back to the main view's capture.
function captureCaseSelectionForCurrentContext() {
  // Cluster popup takes precedence when its overlay is open
  if (document.querySelector('.focus-cluster-popup')) {
    const ctx = captureClusterPopupCaseSelection();
    if (ctx && ctx.selectedText) return ctx;
  }
  if (APP.currentView === 'review') return captureCaseSelectionContext('form');
  if (APP.currentView === 'table') return captureCaseSelectionContext('table');
  if (APP.currentView === 'focus') return captureCaseSelectionContext('focus');
  return null;
}

function transformCaseText(value, type) {
  if (type === 'title') return value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  if (type === 'upper') return value.toUpperCase();
  return value.toLowerCase();
}

function getSelectionHostElement(node) {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function captureContenteditableCaseSelection(selector, metaExtractor) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const startHost = getSelectionHostElement(range.startContainer);
  const endHost = getSelectionHostElement(range.endContainer);
  const root = startHost?.closest(selector);
  if (!root || !endHost || !root.contains(endHost)) return null;

  const selectedText = range.toString();
  if (!selectedText) return null;

  const meta = metaExtractor(root);
  if (!meta) return null;

  return {
    kind: 'contenteditable',
    element: root,
    range: range.cloneRange(),
    selectedText,
    ...meta,
  };
}

function captureTextareaCaseSelection(selector, metaExtractor) {
  const el = document.querySelector(selector);
  if (!el || document.activeElement !== el) return null;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return null;

  const meta = metaExtractor(el);
  if (!meta) return null;

  return {
    kind: 'textarea',
    element: el,
    start,
    end,
    selectedText: el.value.slice(start, end),
    ...meta,
  };
}

function captureInputCaseSelection(selector, metaExtractor) {
  const el = document.querySelector(selector);
  if (!el || document.activeElement !== el) return null;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return null;

  const meta = metaExtractor(el);
  if (!meta) return null;

  return {
    kind: 'input',
    element: el,
    start,
    end,
    selectedText: el.value.slice(start, end),
    ...meta,
  };
}

function captureFormCaseSelection() {
  const spec = APP.specimens[APP.currentIndex];
  if (!spec) return null;
  return captureContenteditableCaseSelection('.field-input', (input) => {
    const field = input.dataset.field;
    return field ? { filename: spec.filename, field, view: 'form' } : null;
  });
}

function captureTableCaseSelection() {
  return captureContenteditableCaseSelection('.batch-table .cell-edit-input', (input) => {
    const td = input.closest('td[data-field][data-index]');
    if (!td) return null;
    const index = parseInt(td.dataset.index, 10);
    const field = td.dataset.field;
    const spec = APP.specimens[index];
    if (Number.isNaN(index) || !field || !spec) return null;
    return { filename: spec.filename, field, index, view: 'table' };
  });
}

function captureFocusCaseSelection() {
  const textareaContext = captureTextareaCaseSelection('#focus-view textarea.cell-edit-input', (input) => {
    const index = parseInt(input.dataset.index, 10);
    const field = input.dataset.field;
    const spec = APP.specimens[index];
    if (Number.isNaN(index) || !field || !spec) return null;
    return { filename: spec.filename, field, index, view: 'focus' };
  });
  if (textareaContext) return textareaContext;

  return captureContenteditableCaseSelection('#ocr-compare-editable', (editable) => {
    const index = parseInt(editable.dataset.index, 10);
    const field = editable.dataset.field;
    const spec = APP.specimens[index];
    if (Number.isNaN(index) || !field || !spec) return null;
    return { filename: spec.filename, field, index, view: 'focus' };
  });
}

function captureClusterPopupCaseSelection() {
  return captureInputCaseSelection('.focus-cluster-popup .focus-cluster-merge-input', (input) => {
    const field = document.querySelector('#cluster-review-field')?.value || '';
    return field ? { field, view: 'cluster-popup' } : null;
  });
}

function captureCaseSelectionContext(mode) {
  if (mode === 'form') return captureFormCaseSelection();
  if (mode === 'table') return captureTableCaseSelection();
  if (mode === 'focus') return captureFocusCaseSelection();
  if (mode === 'cluster-popup') return captureClusterPopupCaseSelection();
  return null;
}

function applyCaseTransformToSelection(type, context) {
  if (!context || !context.selectedText) return null;

  const replacement = transformCaseText(context.selectedText, type);
  if (replacement === context.selectedText) return false;

  if (context.kind === 'textarea') {
    context.element.focus();
    context.element.setSelectionRange(context.start, context.end);
    context.element.setRangeText(replacement, context.start, context.end, 'select');
    context.element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  if (context.kind === 'input') {
    context.element.focus();
    context.element.setSelectionRange(context.start, context.end);
    context.element.setRangeText(replacement, context.start, context.end, 'select');
    context.element.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  const range = context.range.cloneRange();
  range.deleteContents();
  const textNode = document.createTextNode(replacement);
  range.insertNode(textNode);
  const selection = window.getSelection();
  const nextRange = document.createRange();
  nextRange.setStart(textNode, 0);
  nextRange.setEnd(textNode, replacement.length);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  context.element.normalize();
  context.element.dispatchEvent(new Event('input', { bubbles: true }));
  context.element.focus();
  return true;
}

function wireCaseControls(mode) {
  let capturedSelection = null;
  document.querySelectorAll(`.case-module-${mode} [data-case-type]`).forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      capturedSelection = captureCaseSelectionContext(mode);
      e.preventDefault();
    });

    btn.addEventListener('click', () => {
      const type = btn.dataset.caseType;
      const selectionResult = applyCaseTransformToSelection(type, capturedSelection || captureCaseSelectionContext(mode));
      capturedSelection = null;
      if (selectionResult !== null) return;
      if (mode === 'focus') confirmCaseTransform(type);
      else if (mode === 'table') confirmTableCaseTransform(type);
    });
  });
}

function cloneAcceptedField(entry) {
  return entry ? { value: entry.value, source: entry.source } : undefined;
}

function snapshotFieldState(specState, field) {
  return {
    accepted: cloneAcceptedField(specState?.accepted_fields?.[field]),
    unconfirmed: specState?.unconfirmed_fields?.[field],
  };
}

function restoreFieldState(specState, field, snapshot) {
  if (!specState.accepted_fields) specState.accepted_fields = {};
  if (!specState.unconfirmed_fields) specState.unconfirmed_fields = {};

  if (snapshot.accepted === undefined) delete specState.accepted_fields[field];
  else specState.accepted_fields[field] = cloneAcceptedField(snapshot.accepted);

  if (snapshot.unconfirmed === undefined) delete specState.unconfirmed_fields[field];
  else specState.unconfirmed_fields[field] = snapshot.unconfirmed;
}

function stageFieldAsUnconfirmed(specState, field, value) {
  if (!specState.unconfirmed_fields) specState.unconfirmed_fields = {};
  specState.unconfirmed_fields[field] = value;
  if (specState.accepted_fields?.[field]) delete specState.accepted_fields[field];
}

function deriveAcceptedSource(aiValue, reviewedValue) {
  const aiStr = aiValue !== undefined ? String(aiValue) : '';
  if (reviewedValue === aiStr && aiStr !== '') return 'ai';
  if (reviewedValue === '' && aiStr === '') return 'confirmed_empty';
  if (aiStr === '' && reviewedValue !== '') return 'user_added';
  return 'edited';
}

function scheduleReviewFormRerender() {
  setTimeout(() => {
    if (APP.currentView !== 'review') return;
    if (!APP.currentSpecimen || !APP.specimens[APP.currentIndex]) return;
    renderCategoryForm();
    renderCategoryTabs();
    renderCategoryFooter();
    renderBounceBar();
  }, 0);
}

function confirmPendingField(field, latestValue, updateInput = true) {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  const _rwBefore = rewindCapture([spec.filename], [field], { categories_confirmed: true });
  if (specState.unconfirmed_fields) delete specState.unconfirmed_fields[field];

  const aiValue = APP.currentSpecimen.formatted_json?.[field];
  const source = deriveAcceptedSource(aiValue, latestValue);

  specState.accepted_fields[field] = { value: latestValue, source };
  specState.last_touched = new Date().toISOString();

  const input = document.querySelector(`.field-input[data-field="${field}"]`);
  if (input && updateInput) input.textContent = latestValue;

  autoConfirmCategories(spec.filename);
  rewindRecord('confirmUnconfirmed', 'Confirm Field', `"${field}" = "${latestValue}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);

  updateSpecimenCompletionStatus(spec.filename);
  scheduleInProgressSave(spec.filename);
  scheduleReviewFormRerender();
}

function acceptField(field, value, source, updateInput = true) {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  const _rwBefore = rewindCapture([spec.filename], [field], { categories_confirmed: true });
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

  rewindRecord('acceptField', 'Accept Field', `"${field}" = "${value}" (${source}) on ${getDisplayFilename(spec.filename)}`, _rwBefore);

  // Re-render tabs to update counts
  renderCategoryForm();
  renderCategoryTabs();
  renderCategoryFooter();
  renderBounceBar();
  updateSpecimenCompletionStatus(spec.filename);
  scheduleInProgressSave(spec.filename);
}

function autoConfirmCategories(filename) {
  const specState = APP.state.specimens[filename];
  if (!specState) return;

  const categories = getCategories();
  const confirmed = new Set(specState.categories_confirmed || []);

  for (const cat of categories) {
    if (isCategoryResolved(filename, cat.fields)) {
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
  const allResolved = isCategoryResolved(spec.filename, cat.fields);
  const allCategoriesConfirmed = categories.every(c => isCategoryResolved(spec.filename, c.fields));

  const catHasUnresolved = !allResolved;

  el.innerHTML = `
    <div class="category-footer-main">
      ${renderStatusLegend('status-key form-status-key form-status-key-bottom')}
      <div class="category-footer-summary">
        ${allResolved
          ? `<span class="text-success" style="font-size:var(--fs-12)">&#10003; ${cat.name} complete</span>`
          : `<span class="text-muted" style="font-size:var(--fs-12)">${cat.fields.length - resolvedCount} of ${cat.fields.length} fields pending</span>`
        }
        ${(APP.settings.confirmRecordsEnabled !== false || APP.settings.acceptAllEnabled) && catHasUnresolved
          ? `<div class="case-module" style="flex-direction:row;gap:8px;padding:4px 10px">
              <div class="case-module-label" style="text-transform:none;letter-spacing:0;font-size:var(--fs-10);white-space:nowrap">For ${escapeHtml(cat.name)}:</div>
              <div class="case-module-buttons">
                ${APP.settings.confirmRecordsEnabled !== false ? `<button class="btn-sm" id="btn-confirm-records" style="background:#1a3a1a;color:var(--accent);border-color:var(--accent)">Confirm Records</button>` : ''}
                ${APP.settings.acceptAllEnabled ? `<button class="btn-sm" id="btn-accept-all" style="background:#3a2020;color:var(--warning);border-color:var(--warning)">Accept VoucherVision</button>` : ''}
              </div>
            </div>`
          : ''}
        ${allCategoriesConfirmed ? '<span class="text-success" style="font-size:var(--fs-12);font-weight:600">&#10003; All categories complete</span>' : ''}
      </div>
    </div>
  `;

  document.getElementById('btn-confirm-records')?.addEventListener('click', confirmRecordsFields);
  document.getElementById('btn-accept-all')?.addEventListener('click', acceptAllFields);
}

// ── Auto-Save In-Progress File ──────────────────────────────

const inProgressSaveTimers = {};
const inProgressSaveVersions = {};

// Global registry of pending rewind-input debounces so beforeunload can flush them.
// Each entry: { before: snapshot, timeout: timerId, field: string, filename: string }
const pendingRewindInputs = [];

/**
 * Register a pending rewind-input debounce. Returns an object that the caller
 * should hold onto; call flushPendingRewindInput(entry) or let beforeunload do it.
 */
function registerPendingRewindInput(filename, field, before) {
  const entry = { before, timeout: null, field, filename };
  pendingRewindInputs.push(entry);
  return entry;
}

/**
 * Commit a single pending rewind input entry (called on debounce fire or on blur).
 */
function commitPendingRewindInput(entry) {
  if (!entry || !entry.before) return;
  rewindRecord('editField', 'Edit Field', `"${entry.field}" on ${getDisplayFilename(entry.filename)}`, entry.before);
  entry.before = null; // mark consumed
  if (entry.timeout) { clearTimeout(entry.timeout); entry.timeout = null; }
  const idx = pendingRewindInputs.indexOf(entry);
  if (idx !== -1) pendingRewindInputs.splice(idx, 1);
}

/**
 * Flush ALL pending rewind-input debounces. Called from beforeunload / clearAllPendingTimers.
 */
function flushAllPendingRewindInputs() {
  while (pendingRewindInputs.length > 0) {
    const entry = pendingRewindInputs[0];
    if (entry.timeout) { clearTimeout(entry.timeout); entry.timeout = null; }
    if (entry.before) {
      rewindRecord('editField', 'Edit Field', `"${entry.field}" on ${getDisplayFilename(entry.filename)}`, entry.before);
      entry.before = null;
    }
    pendingRewindInputs.shift();
  }
}

function markSpecimenDirty(filename) {
  APP.dirtySpecimens.add(filename);
  inProgressSaveVersions[filename] = (inProgressSaveVersions[filename] || 0) + 1;
  return inProgressSaveVersions[filename];
}

function scheduleInProgressSave(filename, options = {}) {
  const { invalidate = true } = options;
  if (invalidate) invalidateFocusAnalysisCaches();
  const saveVersion = markSpecimenDirty(filename);
  if (inProgressSaveTimers[filename]) clearTimeout(inProgressSaveTimers[filename]);
  inProgressSaveTimers[filename] = setTimeout(() => saveInProgress(filename, saveVersion), 500);
}

async function saveInProgress(filename, saveVersion) {
  const specState = APP.state.specimens[filename];
  if (!specState) return;
  try {
    const payload = structuredClone(specState);
    await window.api.writeInProgress(APP.folderPath, filename, payload);
    if ((inProgressSaveVersions[filename] || 0) === saveVersion) {
      APP.dirtySpecimens.delete(filename);
    }
  } catch (e) {
    console.warn('Failed to save in-progress for', filename, e);
  }
}

// Legacy alias — all old call sites redirect here
function scheduleAutoSaveReviewed(filename) {
  scheduleInProgressSave(filename, { invalidate: false });
}

/**
 * Update in-memory completion status for a specimen.
 * In the new architecture, __REVIEWED files are only generated at export time.
 * This function updates the UI-facing status indicators.
 */
function updateSpecimenCompletionStatus(filename) {
  const spec = APP.specimens.find(s => s.filename === filename);
  if (!spec) return;

  const specState = APP.state.specimens[filename];
  if (!specState) return;

  const categories = getCategoriesForSpecimen(filename);
  const fieldSchema = APP.project?.prompt_field_schema || [];
  const result = CompletionEvaluator.evaluateCompletion(specState, fieldSchema, categories);
  const unconfirmedCount = Object.keys(specState.unconfirmed_fields || {}).length;

  spec.hasInProgress = result.resolvedFields > 0 || unconfirmedCount > 0;
  spec.reviewComplete = result.isComplete;

  // Update the status badge in-place if this is the current specimen
  if (APP.specimens[APP.currentIndex]?.filename === filename) {
    refreshReviewStatusBadge();
  }

  updateNavBar();
}

function getCategoriesForSpecimen(filename) {
  if (!APP.currentPrompt) return [];

  // Use prompt_field_schema (union of all specimen field keys) when available.
  // This fixes issue #9: no longer falls back to wrong specimen's data.
  const fieldSchema = APP.project?.prompt_field_schema;
  let allFields;
  if (fieldSchema && fieldSchema.length > 0) {
    allFields = fieldSchema;
  } else {
    // Fallback: use cached data or current specimen (only if it matches)
    const cached = tableDataCache[filename];
    const specData = cached || (APP.specimens[APP.currentIndex]?.filename === filename ? APP.currentSpecimen : null);
    if (!specData) return [];
    allFields = Object.keys(specData.formatted_json || {});
  }

  const mapping = APP.currentPrompt.mapping || {};
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

    const categories = getCategoriesForSpecimen(spec.filename);
    const fieldSchema = APP.project?.prompt_field_schema || [];
    const result = CompletionEvaluator.evaluateCompletion(specState, fieldSchema, categories);

    if (!result.isComplete) {
      incomplete.push({
        index: i + 1,
        filename: spec.filename,
        reason: result.incompleteReasons.join(', ') || 'incomplete'
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
    `<div style="padding:3px 0;font-size:var(--fs-12);font-family:var(--font-mono)"><span style="color:var(--warning);min-width:30px;display:inline-block">#${s.index}</span> ${escapeHtml(getDisplayFilename(s.filename))} <span style="color:var(--text-muted)">(${s.reason})</span></div>`
  ).join('');

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:600px;max-height:80vh;overflow:auto;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:var(--fs-16);font-weight:600;margin-bottom:12px;color:var(--warning)">Incomplete Reviews</div>
      <div style="font-size:var(--fs-13);margin-bottom:12px;color:var(--text-secondary)">
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
  // Count total unreviewed fields using shared completion evaluator
  let totalUnreviewed = 0;
  for (const item of incomplete) {
    const spec = APP.specimens[item.index - 1];
    const specState = APP.state.specimens[spec.filename];
    const categories = getCategoriesForSpecimen(spec.filename);
    const fieldSchema = APP.project?.prompt_field_schema || [];
    const result = CompletionEvaluator.evaluateCompletion(specState, fieldSchema, categories);
    totalUnreviewed += (result.totalFields - result.resolvedFields);
  }

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:1px solid var(--error);border-radius:var(--radius);padding:24px;max-width:520px;cursor:default" onclick="event.stopPropagation()">
      <div style="font-size:var(--fs-16);font-weight:600;margin-bottom:12px;color:var(--error)">Export Incomplete Records</div>
      <div style="font-size:var(--fs-13);margin-bottom:12px;color:var(--text-secondary);line-height:1.6">
        ${incomplete.length} specimens have a total of <strong>${totalUnreviewed}</strong> unreviewed fields.
        How should unreviewed fields be handled in the export?
      </div>

      <div style="margin-bottom:16px;display:flex;flex-direction:column;gap:10px">
        <div style="padding:12px;border:2px solid var(--accent);border-radius:var(--radius);background:rgba(46,204,113,0.08);cursor:pointer" id="option-blank">
          <div style="font-size:var(--fs-13);font-weight:600;color:var(--accent);margin-bottom:4px">Leave unreviewed fields blank (Recommended)</div>
          <div style="font-size:var(--fs-11);color:var(--text-muted);line-height:1.4">
            Unreviewed fields will be exported as empty strings. This preserves the zero-trust workflow — only values you have explicitly confirmed will appear in the output.
          </div>
        </div>

        <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer" id="option-populate">
          <div style="font-size:var(--fs-13);font-weight:600;color:var(--warning);margin-bottom:4px">Populate with VoucherVision suggestions</div>
          <div style="font-size:var(--fs-11);color:var(--text-muted);line-height:1.4">
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

  // Option 1: Leave blank (recommended) — NO state mutation (issue #1)
  document.getElementById('option-blank').addEventListener('click', async () => {
    overlay.remove();
    await doExport('blank', incomplete);
  });

  // Option 2: Populate with VV suggestions — NO state mutation (issue #1)
  document.getElementById('option-populate').addEventListener('click', async () => {
    overlay.remove();
    await doExport('populate', incomplete);
  });
}

/**
 * Execute the export. Builds temporary export rows WITHOUT mutating APP.state.
 *
 * @param {string} [strategy] - 'blank' or 'populate' for incomplete specimens
 * @param {Array} [incomplete] - list of incomplete specimen info objects
 */
async function doExport(strategy, incomplete) {
  // Use prompt_field_schema for column set (issue #5: all specimens' fields, not just first)
  let allFieldKeys = APP.project?.prompt_field_schema || [];
  if (allFieldKeys.length === 0 && APP.specimens.length > 0) {
    const firstData = tableDataCache[APP.specimens[0].filename]
      || await window.api.readSpecimen(APP.folderPath, APP.specimens[0].filename);
    if (firstData) allFieldKeys = Object.keys(firstData.formatted_json || {});
  }

  // Build a set of incomplete filenames for fast lookup
  const incompleteSet = new Set((incomplete || []).map(i => APP.specimens[i.index - 1]?.filename));

  // Build rows for XLSX — zero-trust: only accepted values appear
  // Strategy fills are applied to temporary rows ONLY, never to APP.state (issue #1)
  const rows = [];
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    const row = { filename: spec.filename };

    // Start all fields as empty
    for (const key of allFieldKeys) {
      row[key] = '';
    }

    // Fill in accepted values
    if (specState?.accepted_fields) {
      for (const [field, info] of Object.entries(specState.accepted_fields)) {
        row[field] = info.value;
      }
    }

    // Apply strategy for incomplete specimens (temporary, export-only)
    if (strategy && incompleteSet.has(spec.filename)) {
      if (strategy === 'populate') {
        const cached = tableDataCache[spec.filename] || await window.api.readSpecimen(APP.folderPath, spec.filename);
        const originalFj = cached?.formatted_json || {};
        for (const [field, val] of Object.entries(originalFj)) {
          if (row[field] === '' && !specState?.accepted_fields?.[field]) {
            row[field] = val !== undefined ? String(val) : '';
          }
        }
      }
      // 'blank' strategy: unreviewed fields already '' — no action needed
    }

    rows.push(row);
  }

  // Show save dialog BEFORE writing any files (issue #1: user can still cancel)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultName = `VoucherVisionGO_Export_${timestamp}.xlsx`;
  const savePath = await window.api.selectSavePath(defaultName);
  if (!savePath) return; // User cancelled — nothing was modified

  try {
    showNavSpinner();

    // Phase 1: Generate _REVIEWED/ files FIRST (issue #2: fail before writing XLSX)
    const reviewedFailures = [];
    let reviewedCount = 0;
    for (const spec of APP.specimens) {
      const specState = APP.state.specimens[spec.filename];
      if (!specState) continue;

      // Build a temporary in-progress-like object for reviewed generation
      // If strategy was applied, augment the accepted_fields temporarily
      let exportState = specState;
      if (strategy && incompleteSet.has(spec.filename)) {
        exportState = {
          ...specState,
          accepted_fields: { ...specState.accepted_fields },
          categories_confirmed: getCategoriesForSpecimen(spec.filename).map(c => c.name),
        };
        const cached = tableDataCache[spec.filename] || await window.api.readSpecimen(APP.folderPath, spec.filename);
        const originalFj = cached?.formatted_json || {};
        for (const field of Object.keys(originalFj)) {
          if (!exportState.accepted_fields[field]) {
            if (strategy === 'populate') {
              const strVal = String(originalFj[field] ?? '');
              exportState.accepted_fields[field] = { value: strVal, source: strVal === '' ? 'confirmed_empty' : 'ai' };
            } else {
              exportState.accepted_fields[field] = { value: '', source: 'confirmed_empty' };
            }
          }
        }
      }

      try {
        const specCategories = getCategoriesForSpecimen(spec.filename);
        await window.api.generateAndWriteReviewed(
          APP.folderPath, spec.filename, exportState, APP.username, '1.0.0',
          APP.project?.prompt_field_schema || [], specCategories
        );
        spec.hasReviewed = true;
        reviewedCount++;
      } catch (e) {
        reviewedFailures.push({ filename: spec.filename, error: e.message || String(e) });
      }
    }

    // If any _REVIEWED files failed, abort before writing XLSX
    if (reviewedFailures.length > 0) {
      hideNavSpinner();
      const failList = reviewedFailures.map(f => `  ${f.filename}: ${f.error}`).join('\n');
      alert(
        `Export aborted — ${reviewedFailures.length} _REVIEWED file(s) failed to generate:\n\n` +
        `${failList}\n\nXLSX was NOT written.`
      );
      return;
    }

    // Phase 2: Write XLSX (all _REVIEWED succeeded)
    await window.api.exportXlsx(savePath, rows);

    hideNavSpinner();
    updateNavBar();
    alert(`Export complete: ${savePath}\n\n${reviewedCount} _REVIEWED files written.`);
  } catch (err) {
    hideNavSpinner();
    alert(`Export failed: ${err.message || err}`);
  }
}

// ── Flag Toggle ─────────────────────────────────────────────

function toggleSpecimenFlagState(spec, options = {}) {
  if (!spec) return false;
  if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return false;

  const {
    promptForNote = true,
    updateUi = null,
    tool = null,
  } = options;

  const _rwBefore = rewindCapture([spec.filename], [], { flagged: true });

  let didFlag = false;
  let didUnflag = false;

  if (!specState.flagged) {
    // Unflagged → flag + add this tool's tag (if tool provided)
    specState.flagged = true;
    if (tool) addTagToSpecimen(spec.filename, tool);
    didFlag = true;
  } else if (tool) {
    // Already flagged + tool context: behave like the tag.svg toggle.
    // Nuclear reset (full unflag) only if this action would leave zero tags.
    const tags = specState.flag_tags || [];
    if (tags.includes(tool)) {
      if (tags.length <= 1) {
        // Only this tool's tag (or none) → nuclear reset
        specState.flagged = false;
        specState.flag_tags = [];
        specState.flag_note = '';
        didUnflag = true;
      } else {
        // Other tags remain → remove just this tool's tag, stay flagged
        removeTagFromSpecimen(spec.filename, tool);
      }
    } else {
      // This tool's tag not present → add it (specimen stays flagged)
      addTagToSpecimen(spec.filename, tool);
    }
  } else {
    // No tool context (e.g. Clear Specimen Flags) → nuclear reset
    specState.flagged = false;
    specState.flag_tags = [];
    specState.flag_note = '';
    didUnflag = true;
  }

  if (typeof updateUi === 'function') updateUi(specState.flagged, specState);
  updateNavBar();
  scheduleInProgressSave(spec.filename);

  if (didFlag && promptForNote) {
    setTimeout(() => {
      const note = prompt('Flag note (optional):');
      specState.flag_note = note || '';
      rewindRecord('toggleFlag', 'Toggle Flag', `Flagged ${getDisplayFilename(spec.filename)}`, _rwBefore);
      scheduleSaveState(spec.filename);
    }, 50);
  } else {
    let label;
    if (didFlag) label = 'Flagged';
    else if (didUnflag) label = 'Unflagged';
    else label = 'Tag changed';
    rewindRecord('toggleFlag', 'Toggle Flag', `${label} ${getDisplayFilename(spec.filename)}`, _rwBefore);
    scheduleSaveState(spec.filename);
  }

  return specState.flagged;
}

// Refreshes all flag-related UI for a specimen in views other than the
// Flagged Specimens popup. Used when the popup mutates state and we need
// the form flag button, flag-note input, and focus lists to stay in sync
// without waiting for a full re-render.
function refreshSpecimenFlagUi(filename) {
  updateNavBar();
  const currentSpec = APP.specimens[APP.currentIndex];
  if (currentSpec && currentSpec.filename === filename) {
    const st = APP.state.specimens?.[filename];
    if (document.getElementById('btn-flag')) {
      updateFormFlagButtonUi(!!st?.flagged);
      const noteInput = document.getElementById('flag-note-input');
      if (noteInput && !st?.flagged) noteInput.value = '';
    }
  }
  if (document.getElementById('focus-specimens-list')) {
    renderFocusSpecimens();
  }
}

function renderFormFlagFlair() {
  const container = document.getElementById('flag-note-flair');
  if (!container) return;
  const spec = APP.specimens[APP.currentIndex];
  if (!spec) { container.innerHTML = ''; return; }
  const tags = getSpecimenTags(spec.filename);
  container.innerHTML = tags.map(t => {
    const label = FLAG_TOOL_LABELS[t] || t;
    return `<span class="flag-tag-pill flag-tag-pill-sm">${escapeHtml(label)}<button class="flag-tag-pill-x" data-file="${escapeAttr(spec.filename)}" data-tool="${escapeAttr(t)}" title="Remove ${escapeAttr(label)} tag"><img src="icons/close.svg" alt="×"></button></span>`;
  }).join('');

  // Wire X buttons — remove that tag. If it was the last tag, also unflag.
  container.querySelectorAll('.flag-tag-pill-x').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const filename = btn.dataset.file;
      const tool = btn.dataset.tool;
      const st = APP.state.specimens?.[filename];
      if (!st) return;
      const _rwBefore = rewindCapture([filename], [], { flagged: true });
      removeTagFromSpecimen(filename, tool);
      // If no tags remain, auto-unflag (nuclear reset for this specimen)
      if ((st.flag_tags || []).length === 0) {
        st.flagged = false;
        st.flag_note = '';
      }
      st.last_touched = new Date().toISOString();
      rewindRecord('tagFlag', 'Remove Flag Tag', `Removed ${FLAG_TOOL_LABELS[tool] || tool} tag from ${getDisplayFilename(filename)}`, _rwBefore);
      scheduleSaveState(filename);
      updateNavBar();
      updateFormFlagButtonUi(!!st.flagged);
      // Also clear the flag note input when unflagged
      if (!st.flagged) {
        const input = document.getElementById('flag-note-input');
        if (input) input.value = '';
      }
    });
  });
}

function updateFormFlagButtonUi(isFlagged) {
  const flagBtn = document.getElementById('btn-flag');
  const spec = APP.specimens[APP.currentIndex];
  if (!flagBtn || !spec) return;
  flagBtn.classList.toggle('flagged', isFlagged);
  flagBtn.title = isFlagged ? 'Unflag specimen' : 'Flag specimen';
  flagBtn.innerHTML = flagAndTagHtml(spec.filename, 16, 'form');
  wireTagIconButtons(flagBtn, () => {
    const current = !!APP.state.specimens[spec.filename]?.flagged;
    updateFormFlagButtonUi(current);
  });
  renderFormFlagFlair();
  refreshReviewStatusBadge();
}

function toggleFlag() {
  const spec = APP.specimens[APP.currentIndex];
  const flagInput = document.getElementById('flag-note-input');
  toggleSpecimenFlagState(spec, {
    promptForNote: false,
    tool: 'form',
    updateUi: (isFlagged, specState) => {
      updateFormFlagButtonUi(isFlagged);
      if (flagInput && !isFlagged) {
        flagInput.value = specState?.flag_note || '';
      }
    }
  });
}

function wireFormFlagNote() {
  const input = document.getElementById('flag-note-input');
  if (!input) return;

  const spec = APP.specimens[APP.currentIndex];
  if (!spec) return;

  let before = null;
  let originalValue = input.value;

  const ensureFlagged = () => {
    const specState = APP.state.specimens?.[spec.filename];
    if (specState?.flagged) return;
    toggleSpecimenFlagState(spec, {
      promptForNote: false,
      tool: 'form',
      updateUi: (isFlagged) => updateFormFlagButtonUi(isFlagged)
    });
  };

  const commit = () => {
    const specState = APP.state.specimens?.[spec.filename];
    if (!specState?.flagged) {
      before = null;
      return;
    }

    const nextValue = input.value;
    if (nextValue === originalValue) return;

    if (!before) before = rewindCapture([spec.filename], [], { flagged: true });
    specState.flag_note = nextValue;
    specState.last_touched = new Date().toISOString();
    rewindRecord('flagNote', 'Flag Note', `Updated flag note on ${getDisplayFilename(spec.filename)}`, before);
    before = null;
    originalValue = nextValue;
    scheduleSaveState(spec.filename);
  };

  input.addEventListener('focus', () => {
    before = rewindCapture([spec.filename], [], { flagged: true });
    originalValue = input.value;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('input', () => {
    // Typing in the flag-note auto-flags the specimen with the 'form' tag.
    // Deleting text does NOT unflag (per spec).
    if (input.value.length > 0) ensureFlagged();
    const specState = APP.state.specimens?.[spec.filename];
    if (!specState?.flagged) return;
    specState.flag_note = input.value;
    specState.last_touched = new Date().toISOString();
    scheduleInProgressSave(spec.filename, { invalidate: false });
  });
  input.addEventListener('blur', commit);
}

// ── State Persistence ───────────────────────────────────────

/**
 * Save project-level UI state (current specimen, checklist, etc.)
 * Does NOT save per-specimen content — that's handled by scheduleInProgressSave().
 */
function scheduleProjectSave() {
  APP.dirtyProject = true;
  if (APP.projectSaveTimeout) clearTimeout(APP.projectSaveTimeout);
  APP.projectSaveTimeout = setTimeout(async () => {
    if (APP.folderPath && APP.project) {
      try {
        await window.api.saveProject(APP.folderPath, APP.project);
        APP.dirtyProject = false;
      } catch (e) {
        console.warn('Failed to save project state:', e);
      }
    }
  }, 500);
}

function normalizeSaveTargets(targets) {
  if (!targets) return [];
  const list = Array.isArray(targets) ? targets : [targets];
  return [...new Set(list.filter(Boolean))];
}

/**
 * Legacy alias: calls both project save and in-progress save for current specimen.
 * Existing call sites that used scheduleSaveState() are gradually migrated.
 */
function scheduleSaveState(targets) {
  invalidateFocusAnalysisCaches();
  scheduleProjectSave();
  updateNavBar();

  const filenames = normalizeSaveTargets(targets);
  if (filenames.length > 0) {
    filenames.forEach(filename => scheduleInProgressSave(filename, { invalidate: false }));
    return;
  }

  // Default fallback: save the current specimen's in-progress data if we have one
  const spec = APP.specimens[APP.currentIndex];
  if (spec) scheduleInProgressSave(spec.filename, { invalidate: false });
}

/**
 * Cancel all pending debounce timers. Called before flush.
 */
function clearAllPendingTimers() {
  if (APP.projectSaveTimeout) { clearTimeout(APP.projectSaveTimeout); APP.projectSaveTimeout = null; }
  for (const key of Object.keys(inProgressSaveTimers)) {
    clearTimeout(inProgressSaveTimers[key]);
    delete inProgressSaveTimers[key];
  }
  if (REWIND._saveTimeout) { clearTimeout(REWIND._saveTimeout); REWIND._saveTimeout = null; }
  // Commit any pending rewind-input debounces so they're captured in the history flush
  flushAllPendingRewindInputs();
}

/**
 * Collect all dirty specimens' state for synchronous flush.
 */
function collectDirtySpecimens() {
  const pending = [];
  for (const fn of APP.dirtySpecimens) {
    const data = APP.state.specimens[fn];
    if (data) pending.push({ filename: fn, data });
  }
  return pending;
}

// Save all state on window close — synchronous flush (issue #4)
window.addEventListener('beforeunload', (e) => {
  // Only flush if we have a fully committed session (issue #1: never flush partial state)
  if (!APP.folderPath || !APP.state || !APP.project) return;

  clearAllPendingTimers();
  closeCurrentProgressSession(APP.project);

  // Build project state for flush
  const projectPayload = APP.project || {};
  if (APP.state) {
    projectPayload.current_specimen = APP.project?.current_specimen || APP.specimens[APP.currentIndex]?.filename || '';
  }

  const flushResult = window.api.flushSaves(APP.folderPath, {
    project: projectPayload,
    inProgress: collectDirtySpecimens(),
    history: {
      version: 1,
      saved_at: new Date().toISOString(),
      folder_path: APP.folderPath,
      stack: REWIND.stack,
    },
  });

  if (flushResult && !flushResult.success) {
    // Cannot use confirm() in beforeunload — use returnValue to trigger the
    // browser's native "are you sure you want to leave?" dialog, which gives
    // the user a chance to cancel the close and manually save/retry.
    console.error('Flush on close failed:', flushResult.error);
    e.preventDefault();
    e.returnValue = 'Unsaved changes could not be written to disk. Close anyway?';
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

function initHorizontalSplitResize(handleId, leftId, rightId, containerId, minRatio, maxRatio, onChange = null) {
  const handle = document.getElementById(handleId);
  const left = document.getElementById(leftId);
  const right = document.getElementById(rightId);
  const container = document.getElementById(containerId);
  if (!handle || !left || !right || !container) return;

  const applyRatio = (rawRatio) => {
    const ratio = Math.max(minRatio, Math.min(maxRatio, rawRatio));
    left.style.width = `${ratio * 100}%`;
    left.style.flex = 'none';
    right.style.width = `${(1 - ratio) * 100}%`;
    right.style.flex = 'none';
    if (typeof onChange === 'function') onChange(ratio);
  };

  if (handle.dataset.lastRatio) {
    applyRatio(parseFloat(handle.dataset.lastRatio));
  }
  if (handle.dataset.resizeInit === '1') return;
  handle.dataset.resizeInit = '1';

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent) => {
      const rect = container.getBoundingClientRect();
      const ratio = (moveEvent.clientX - rect.left) / rect.width;
      handle.dataset.lastRatio = String(ratio);
      applyRatio(ratio);
    };

    const onUp = () => {
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
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
  table.querySelectorAll('th').forEach((th, index) => {
    const key = getTableColumnKeyByIndex(index);
    if (!key) return;
    widths[key] = th.offsetWidth;
  });
  APP.state.tableColumnWidths = widths;
  scheduleProjectSave();
}

function initColumnResize(container, allFields = tableAllFields, autoWidths = _tableAutoColumnWidths || {}) {
  const table = container.querySelector('.batch-table');
  if (!table) return;

  const ths = table.querySelectorAll('th');
  const saved = APP.state?.tableColumnWidths || {};

  // Restore saved widths or apply precomputed auto widths to the full table.
  ths.forEach((th, index) => {
    const key = getTableColumnKeyByIndex(index, allFields);
    const width = saved[key] || autoWidths[key] || th.offsetWidth;
    setTableColumnWidth(table, index, width);
  });

  ths.forEach((th, index) => {
    const handle = document.createElement('div');
    handle.className = 'th-resize-handle';
    th.appendChild(handle);

    handle.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = getTableColumnKeyByIndex(index, allFields);
      if (!key) return;
      const width = measureTableColumnWidth(key, prepareTableRows(allFields));
      setTableColumnWidth(table, index, width, key);
      saveColumnWidths();
    });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = getTableColumnKeyByIndex(index, allFields);
      const startX = e.clientX;
      const startWidth = th.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev) => {
        const diff = ev.clientX - startX;
        const newWidth = Math.max(40, startWidth + diff);
        setTableColumnWidth(table, index, newWidth, key);
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

/**
 * Ensure all specimens are loaded into tableDataCache.
 * Uses parallel fetch for uncached specimens.
 */
async function ensureAllSpecimensCached() {
  const uncached = APP.specimens.filter(s => !tableDataCache[s.filename]);
  if (uncached.length > 0) {
    const results = await Promise.all(uncached.map(s =>
      window.api.readSpecimen(APP.folderPath, s.filename).catch(() => null)
    ));
    uncached.forEach((s, i) => { tableDataCache[s.filename] = results[i]; });
  }
}
function rebuildSpecimenIndexMap() {
  specimenIndexMap.clear();
  APP.specimens.forEach((s, i) => specimenIndexMap.set(s.filename, i));
}
let tableSelectedIndex = 0;
let tableImageType = 'collage';
let tableEditingLocked = true;
let tableSelectedCell = null;   // Currently highlighted td element
let tableSelectedField = null;  // Field name of last selected cell (survives virtual scroll)
let tableAllFields = [];        // Cached field list for keyboard nav
let _tableSavedScroll = null;   // { scrollTop, scrollLeft } preserved across view switches
let focusThumbSize = 52;
let _tableAutoColumnWidths = null;

function getTableColumnKeyByIndex(index, allFields = tableAllFields) {
  if (index === 0) return '__goto';
  if (index === 1) return '__flag';
  if (index === 2) return 'index';
  if (index === 3) return 'filename';
  if (index === 4) return 'status';
  return allFields[index - 5] || '';
}

function getTableColumnHeaderLabel(key) {
  if (key === '__goto') return '';
  if (key === '__flag') return '';
  if (key === 'index') return '#';
  if (key === 'filename') return 'Filename';
  if (key === 'status') return 'Status';
  return key;
}

function getTableColumnDisplayValue(row, key) {
  if (key === '__goto') return '';
  if (key === '__flag') return '';
  if (key === 'index') return String(row.index + 1);
  if (key === 'filename') return getDisplayFilename(row.filename);
  if (key === 'status') return row.status === 'not-started' ? 'pending' : row.status.replace('-', ' ');
  const value = row.fieldValues?.[key];
  return value === '' || value === undefined || value === null ? '(empty)' : String(value);
}

let _tableMeasureCanvas = null;

function measureTableTextWidth(text, font) {
  if (!_tableMeasureCanvas) _tableMeasureCanvas = document.createElement('canvas');
  const ctx = _tableMeasureCanvas.getContext('2d');
  if (!ctx) return String(text || '').length * 8;
  ctx.font = font;
  return Math.ceil(ctx.measureText(String(text || '')).width);
}

function getTableMeasureFonts() {
  const bodyStyle = getComputedStyle(document.body);
  const rootStyle = getComputedStyle(document.documentElement);
  const baseFamily = bodyStyle.fontFamily || 'sans-serif';
  const monoFamily = rootStyle.getPropertyValue('--font-mono').trim() || baseFamily;
  return {
    header: `600 10px ${baseFamily}`,
    cell: `400 12px ${baseFamily}`,
    mono: `400 12px ${monoFamily}`,
  };
}

function getTableColumnClampRange(key) {
  if (key === '__goto') return { min: 30, max: 30 };
  if (key === '__flag') return { min: 66, max: 66 };
  if (key === 'index') return { min: 56, max: 72 };
  if (key === 'filename') return { min: 180, max: 280 };
  if (key === 'status') return { min: 124, max: 156 };
  return { min: 90, max: 300 };
}

function measureTableColumnWidth(key, rows) {
  const fonts = getTableMeasureFonts();
  const clamp = getTableColumnClampRange(key);
  if (clamp.min === clamp.max) return clamp.min;

  let maxWidth = measureTableTextWidth(getTableColumnHeaderLabel(key), fonts.header);
  const font = key === 'filename' ? fonts.mono : fonts.cell;

  for (const row of rows) {
    maxWidth = Math.max(maxWidth, measureTableTextWidth(getTableColumnDisplayValue(row, key), font));
  }

  const padded = maxWidth + 24;
  return Math.max(clamp.min, Math.min(clamp.max, padded));
}

function computeAutoTableColumnWidths(allFields) {
  const rows = prepareTableRows(allFields);
  const widths = {};
  const keys = ['__goto', '__flag', 'index', 'filename', 'status', ...allFields];
  keys.forEach(key => {
    widths[key] = measureTableColumnWidth(key, rows);
  });
  return widths;
}

function setTableColumnWidth(table, colIndex, width, key = null) {
  const th = table.querySelectorAll('th')[colIndex];
  const col = table.querySelectorAll('col')[colIndex];
  if (th) {
    th.style.width = width + 'px';
    th.style.minWidth = width + 'px';
  }
  if (col) {
    col.style.width = width + 'px';
    col.style.minWidth = width + 'px';
  }
  if (key && APP.state) {
    if (!APP.state.tableColumnWidths) APP.state.tableColumnWidths = {};
    APP.state.tableColumnWidths[key] = width;
  }
}

async function renderTableView() {
  const el = document.getElementById('table-view');
  if (!el) return;
  showNavSpinner();

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
  tableAllFields = allFields;
  _tableAutoColumnWidths = null;
  tableSelectedCell = null;
  tableSelectedField = null;
  const autoColumnWidths = computeAutoTableColumnWidths(allFields);
  _tableAutoColumnWidths = autoColumnWidths;

  el.innerHTML = `
    <div class="review-nav">
      <div class="nav-view-toggle" id="table-view-switch-container"></div>
      <div class="table-nav-left">
        ${renderCaseControls('table')}
        ${renderWebSearchModule('table')}
        <input type="text" class="table-filter" id="table-filter" placeholder="Filter specimens..." style="width:200px">
      </div>
      <div class="table-nav-right">
        <div class="table-lock-toggle ${tableEditingLocked ? 'locked' : 'unlocked'}" id="btn-table-lock">
          <div class="toggle-track"><div class="toggle-thumb"></div></div>
          <span class="table-lock-label">${tableEditingLocked ? '&#128274; Table Editing Locked' : '&#128275; Table Editing Allowed'}</span>
        </div>
      </div>
    </div>
    <div class="table-body-row resizable-container" id="table-resizable">
      <div class="table-left" id="table-left-panel">
        <div class="batch-table-wrapper">
          <table class="batch-table" id="batch-table">
            <colgroup id="table-colgroup">
              ${['__goto', '__flag', 'index', 'filename', 'status', ...allFields].map(key => `<col data-col-key="${escapeAttr(key)}">`).join('')}
            </colgroup>
            <thead>
              <tr>
                <th style="width:30px"></th>
                <th style="width:66px"></th>
                <th data-sort="index">#</th>
                <th data-sort="filename">Filename</th>
                <th data-sort="status">Status</th>
                ${allFields.map(f => {
                  const notRequired = isReviewNotRequiredField(f);
                  const batchAccepted = notRequired && isFieldBatchAcceptedWithVoucherVision(f);
                  const warnHtml = notRequired && !batchAccepted
                    ? `<span class="focus-field-warning" title="This field does NOT require manual review. Please use the Batch-Accept VoucherVision Content tool located in the VoucherVision tools panel">&#9888;</span>`
                    : '';
                  return `<th data-sort="${escapeAttr(f)}">${warnHtml}${escapeHtml(f)}</th>`;
                }).join('')}
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
        <div class="table-key-container">
          <div class="table-key-title">Table Key</div>
          <div class="table-key-grid">
            <div class="table-key-label">Unreviewed VoucherVision entry</div>
            <div class="table-key-sample batch-table"><span class="cell-unaccepted">Example text</span></div>
            <div class="table-key-label">Unreviewed VoucherVision empty entry, no text</div>
            <div class="table-key-sample batch-table"><span class="cell-unaccepted"><span class="cell-empty-placeholder">(empty)</span></span></div>
            <div class="table-key-label">Unconfirmed user-modified entry that differs from the VoucherVision suggestion</div>
            <div class="table-key-sample batch-table"><span class="cell-limbo">Example text</span></div>
            <div class="table-key-label">User-confirmed entry</div>
            <div class="table-key-sample batch-table"><span class="cell-accepted">Example text</span></div>
            <div class="table-key-label">User-confirmed empty entry, no text</div>
            <div class="table-key-sample batch-table"><span class="cell-accepted"><span class="cell-empty-placeholder">(empty)</span></span></div>
          </div>
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
  wireCaseControls('table');
  wireWebSearch('table');

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
  initColumnResize(el, allFields, autoColumnWidths);

  // Resizable: left panel min 50%, max 75% (image gets 25-50%)
  initResizeHandle('table-resize-handle', 'table-left-panel', 'table-resizable', 0.50, 0.75);

  // Load image for first row
  if (APP.specimens.length > 0) loadTableImage(0);

  // Restore saved scroll position (e.g. returning from form/focus view)
  if (_tableSavedScroll) {
    requestAnimationFrame(() => {
      const w = document.querySelector('.batch-table-wrapper');
      if (w) { w.scrollTop = _tableSavedScroll.scrollTop; w.scrollLeft = _tableSavedScroll.scrollLeft; }
    });
  }

  hideNavSpinner();
}

async function loadTableImage(index) {
  const container = document.getElementById('table-image-container');
  if (!container || index < 0 || index >= APP.specimens.length) return;
  tableSelectedIndex = index;
  const spec = APP.specimens[index];
  container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, tableImageType, 'full');
  if (dataUrl) {
    container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(spec.filename))}">`;
    container.querySelector('img').addEventListener('click', () => openImageModal(dataUrl));
  } else {
    container.innerHTML = `<div class="table-image-placeholder">${tableImageType === 'original' ? 'Original not available' : 'No image'}</div>`;
  }
}

// Schedule a table re-render after an edit finishes, but only if no new edit
// was immediately started (Enter/Tab start editing the next cell).
function scheduleTableRerender() {
  requestAnimationFrame(() => {
    const tbody = document.getElementById('table-body');
    if (tbody && !tbody.querySelector('.cell-edit-input')) {
      renderTableBody(tableAllFields, _tableCurrentFilter, _tableCurrentSortCol, _tableCurrentSortAsc);
    }
  });
}

// Cache prepared table rows to avoid recomputing on scroll
let _tableRowsCache = null;
let _tableFilteredCache = null;
let _tableCurrentFilter = '';
let _tableCurrentSortCol = 'index';
let _tableCurrentSortAsc = true;

function prepareTableRows(allFields) {
  if (_tableRowsCache) return _tableRowsCache;
  const rows = [];
  for (let i = 0; i < APP.specimens.length; i++) {
    const spec = APP.specimens[i];
    const specState = APP.state?.specimens?.[spec.filename];
    const cached = tableDataCache[spec.filename];
    const originalFj = cached?.formatted_json || {};

    const progress = getSpecimenProgressSnapshot(spec.filename);
    let status = 'not-started';
    if (progress.isComplete) status = 'reviewed';
    else if (progress.hasProgress) status = 'in-progress';
    if (progress.flagged) status = 'flagged';

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

  _tableCurrentFilter = filter;
  _tableCurrentSortCol = sortCol;
  _tableCurrentSortAsc = sortAsc;

  const filtered = filterAndSortTableRows(allFields, filter, sortCol, sortAsc);
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

function filterAndSortTableRows(allFields, filter, sortCol, sortAsc) {
  _tableRowsCache = null; // always recompute from current APP.state
  const rows = prepareTableRows(allFields);

  const filtered = filter
    ? rows.filter(r => r.filename.toLowerCase().includes(filter) ||
        Object.values(r.fieldValues).some(v => v.toLowerCase().includes(filter)))
    : [...rows];

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

  return filtered;
}

function renderVisibleTableRows(allFields, wrapper, filtered, ROW_HEIGHT) {
  const tbody = document.getElementById('table-body');
  if (!tbody || !wrapper) return;

  // Guard: never destroy the DOM while a cell is being edited
  if (tbody.querySelector('.cell-edit-input')) return;

  // If no pre-filtered data passed (scroll event), recompute from current state
  if (!filtered) {
    filtered = filterAndSortTableRows(allFields, _tableCurrentFilter, _tableCurrentSortCol, _tableCurrentSortAsc);
    _tableFilteredCache = filtered;
  }

  const scrollTop = wrapper.scrollTop;
  const viewHeight = wrapper.clientHeight;
  const buffer = 10;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - buffer);
  const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + buffer);

  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = (filtered.length - endIdx) * ROW_HEIGHT;
  const visible = filtered.slice(startIdx, endIdx);

  tbody.innerHTML = `
    <tr class="table-spacer-row" style="height:${topPad}px"><td colspan="999"></td></tr>
    ${visible.map((r, visibleIdx) => {
      const rowIsFlagged = !!APP.state.specimens?.[r.filename]?.flagged;
      return `
    <tr class="${(startIdx + visibleIdx) % 2 === 0 ? 'row-even' : 'row-odd'} status-${r.status} ${r.index === tableSelectedIndex ? 'selected' : ''}" data-index="${r.index}">
      <td class="cell-goto" data-index="${r.index}" title="Open in form view" style="cursor:pointer;text-align:center"><img src="icons/goto.svg" style="width:13px;height:13px;filter:brightness(0) invert(1);opacity:0.6"></td>
      <td class="cell-flag" style="text-align:center"><span class="focus-flag ${rowIsFlagged ? 'flagged' : ''}" data-index="${r.index}" data-file="${escapeAttr(r.filename)}" data-tool="table" title="${rowIsFlagged ? 'Unflag specimen' : 'Flag specimen'}">${flagAndTagHtml(r.filename, 13, 'table')}</span></td>
      <td>${r.index + 1}</td>
      <td class="cell-filename" data-index="${r.index}">${escapeHtml(getDisplayFilename(r.filename))}</td>
      <td><span class="status-badge ${r.status}">${r.status === 'not-started' ? 'pending' : r.status.replace('-', ' ')}</span></td>
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
  `;
    }).join('')}
    <tr class="table-spacer-row" style="height:${bottomPad}px"><td colspan="999"></td></tr>
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

  // Flag column click handler
  tbody.querySelectorAll('.cell-flag .focus-flag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Let inner tag.svg button handle its own click
      if (e.target.closest('.flag-tag-btn')) return;
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const spec = APP.specimens[idx];
      toggleSpecimenFlagState(spec, {
        promptForNote: false,
        tool: 'table',
        updateUi: (isFlagged) => {
          btn.classList.toggle('flagged', isFlagged);
          btn.innerHTML = flagAndTagHtml(spec.filename, 13, 'table');
          btn.title = isFlagged ? 'Unflag specimen' : 'Flag specimen';
        }
      });
      wireTagIconButtons(tbody);
    });
  });
  wireTagIconButtons(tbody);

  // Single click: select cell (when locked) or expand+edit (when unlocked)
  tbody.querySelectorAll('td[data-field]').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(td.dataset.index);
      if (idx !== tableSelectedIndex) selectTableRow(idx);

      if (tableEditingLocked) {
        // Just select/highlight the cell
        selectTableCell(td);
      } else {
        // Collapse other expanded cells
        tbody.querySelectorAll('td.expanded').forEach(other => {
          if (other !== td) other.classList.remove('expanded');
        });
        td.classList.add('expanded');

        // Start editing immediately
        startCellEdit(td, idx, td.dataset.field, allFields);
      }
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

function selectTableCell(td) {
  if (tableSelectedCell) tableSelectedCell.classList.remove('cell-selected');
  tableSelectedCell = td;
  tableSelectedField = td.dataset.field || null;
  td.classList.add('cell-selected');

  // Make the table wrapper focusable so it receives key events
  const wrapper = document.querySelector('.batch-table-wrapper');
  if (wrapper && !wrapper.hasAttribute('tabindex')) {
    wrapper.setAttribute('tabindex', '-1');
    wrapper.style.outline = 'none';
  }
  if (wrapper) wrapper.focus();

  // Scroll cell into view
  td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Arrow key navigation for table view (when editing is locked)
document.addEventListener('keydown', (e) => {
  if (APP.currentView !== 'table') return;
  if (!tableEditingLocked) return;
  if (!tableSelectedCell) return;
  // Don't intercept if a modal/overlay is open or an input is focused
  if (document.querySelector('.image-modal-overlay, .rewind-overlay')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

  const { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  if (![ArrowUp, ArrowDown, ArrowLeft, ArrowRight].includes(e.key)) return;

  e.preventDefault();

  const currentField = tableSelectedCell.dataset.field;
  const currentIndex = parseInt(tableSelectedCell.dataset.index);
  let nextField = currentField;
  let nextIndex = currentIndex;

  if (e.key === ArrowLeft) {
    const fi = tableAllFields.indexOf(currentField);
    if (fi > 0) nextField = tableAllFields[fi - 1];
  } else if (e.key === ArrowRight) {
    const fi = tableAllFields.indexOf(currentField);
    if (fi < tableAllFields.length - 1) nextField = tableAllFields[fi + 1];
  } else if (e.key === ArrowUp) {
    // Find previous visible row
    const currentRow = tableSelectedCell.closest('tr');
    const prevRow = currentRow?.previousElementSibling;
    if (prevRow && prevRow.dataset.index !== undefined) {
      nextIndex = parseInt(prevRow.dataset.index);
    }
  } else if (e.key === ArrowDown) {
    // Find next visible row
    const currentRow = tableSelectedCell.closest('tr');
    const nextRow = currentRow?.nextElementSibling;
    if (nextRow && nextRow.dataset.index !== undefined) {
      nextIndex = parseInt(nextRow.dataset.index);
    }
  }

  // Find the target cell
  const targetTd = document.querySelector(`.batch-table td[data-field="${CSS.escape(nextField)}"][data-index="${nextIndex}"]`);
  if (targetTd) {
    // Update row selection + image if row changed
    if (nextIndex !== currentIndex) {
      selectTableRow(nextIndex);
    }
    selectTableCell(targetTd);
  }
});

// Arrow key navigation in Focus mode
document.addEventListener('keydown', (e) => {
  if (APP.currentView !== 'focus') return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  // Don't intercept when editing text in inputs or contenteditables
  const active = document.activeElement;
  if (active?.isContentEditable) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName)) return;
  if (document.querySelector('.image-modal-overlay, .rewind-overlay')) return;

  e.preventDefault();
  const specimens = focusFilter !== null
    ? getAllValuesForField(focusField).filter(v => v.value === focusFilter).map(v => v.index)
    : APP.specimens.map((_, i) => i);
  if (specimens.length === 0) return;

  const curPos = specimens.indexOf(tableSelectedIndex);
  let nextPos;
  if (e.key === 'ArrowUp') {
    nextPos = curPos <= 0 ? specimens.length - 1 : curPos - 1;
  } else {
    nextPos = curPos >= specimens.length - 1 ? 0 : curPos + 1;
  }
  loadFocusImage(specimens[nextPos]);
});

function toggleTableLock() {
  if (tableEditingLocked) {
    // Skip warning if disabled in settings
    if (APP.settings.editLockWarning === false) {
      tableEditingLocked = false;
      tableSelectedCell = null;
      updateTableLockButton();
      return;
    }
    // Unlocking — show warning
    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    overlay.style.cursor = 'default';

    overlay.innerHTML = `
      <div style="background:var(--bg-secondary);border:1px solid var(--warning);border-radius:var(--radius);padding:24px;max-width:480px;cursor:default" onclick="event.stopPropagation()">
        <div style="font-size:var(--fs-16);font-weight:600;margin-bottom:12px;color:var(--warning)">&#9888; Enable Table Editing</div>
        <div style="font-size:var(--fs-13);margin-bottom:12px;color:var(--text-secondary);line-height:1.8">
          <div style="margin-bottom:4px"><strong>Click</strong> a cell to open it for editing.</div>
          <div style="margin-bottom:4px"><strong>Enter</strong> confirms the value into the reviewed record.</div>
          <div style="margin-bottom:4px"><strong>Tab</strong> or <strong>clicking away</strong> without Enter leaves the cell as an <strong style="color:var(--warning)">Unconfirmed Change</strong> (orange outline).</div>
          <div style="margin-bottom:4px"><strong>Escape</strong> discards changes and reverts to the original value.</div>
        </div>
        <div style="font-size:var(--fs-12);margin-bottom:16px;color:var(--text-muted);line-height:1.6">
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
      tableSelectedCell = null;
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

  const currentValue = specState?.unconfirmed_fields?.[fieldName]
    ?? specState?.accepted_fields?.[fieldName]?.value
    ?? (originalFj[fieldName] !== undefined ? String(originalFj[fieldName]) : '');

  const originalText = td.textContent;
  const wasAccepted = td.classList.contains('cell-accepted');
  tableSelectedCell = td;

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

  let _rwEntry = null;
  const initialSnapshot = snapshotFieldState(APP.state.specimens[spec.filename], fieldName);
  input.addEventListener('input', () => {
    const value = input.textContent.replace(/\n/g, ' ').trim();
    const changedFromInitial = value !== currentValue;
    if (changedFromInitial && (!_rwEntry || !_rwEntry.before)) {
      _rwEntry = registerPendingRewindInput(spec.filename, fieldName, rewindCapture([spec.filename], [fieldName]));
    }

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const currentSpecState = APP.state.specimens[spec.filename];
    if (!currentSpecState) return;

    if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, fieldName, value);
    else restoreFieldState(currentSpecState, fieldName, initialSnapshot);
    currentSpecState.last_touched = new Date().toISOString();
    markSpecimenDirty(spec.filename);

    if (changedFromInitial) {
      if (_rwEntry.timeout) clearTimeout(_rwEntry.timeout);
      _rwEntry.timeout = setTimeout(() => {
        commitPendingRewindInput(_rwEntry);
        _rwEntry = null;
      }, 1000);
    }
  });

  const commitPendingRw = () => {
    if (_rwEntry && _rwEntry.before) {
      commitPendingRewindInput(_rwEntry);
      _rwEntry = null;
    }
  };

  const commit = () => {
    commitPendingRw();
    const newValue = input.textContent.replace(/\n/g, ' ').trim();
    td.textContent = newValue;
    td.classList.remove('cell-limbo', 'expanded');
    delete td.dataset.limboValue;

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);

    const _rwBefore = rewindCapture([spec.filename], [fieldName], { categories_confirmed: true });

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
    rewindRecord('cellEdit', 'Cell Edit', `"${fieldName}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);
    scheduleSaveState(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
    scheduleTableRerender();
  };

  const goLimbo = () => {
    commitPendingRw();
    const newValue = input.textContent.replace(/\n/g, ' ').trim();
    td.textContent = newValue;
    td.classList.add('cell-limbo');
    td.classList.remove('expanded');
    td.title = newValue;
    td.dataset.limboValue = newValue;

    // Persist unconfirmed change to state
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const _rwBefore = rewindCapture([spec.filename], [fieldName]);
    if (!APP.state.specimens[spec.filename].unconfirmed_fields) {
      APP.state.specimens[spec.filename].unconfirmed_fields = {};
    }
    APP.state.specimens[spec.filename].unconfirmed_fields[fieldName] = newValue;
    rewindRecord('cellEdit', 'Cell Edit (limbo)', `"${fieldName}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);
    scheduleSaveState(spec.filename);
    scheduleTableRerender();
  };

  const cancel = () => {
    commitPendingRw();
    td.textContent = originalText;
    td.classList.toggle('cell-accepted', wasAccepted);
    td.classList.toggle('cell-unaccepted', !wasAccepted);
    td.classList.remove('cell-limbo', 'expanded');
    delete td.dataset.limboValue;

    // Clear unconfirmed state
    if (APP.state.specimens[spec.filename]?.unconfirmed_fields?.[fieldName] !== undefined) {
      const _rwBefore = rewindCapture([spec.filename], [fieldName]);
      delete APP.state.specimens[spec.filename].unconfirmed_fields[fieldName];
      rewindRecord('cellCancel', 'Cancel Edit', `"${fieldName}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);
      scheduleSaveState(spec.filename);
    }
    scheduleTableRerender();
  };

  let committed = false;
  const onBlur = () => {
    if (committed) return;
    // Only go to limbo if the value was actually changed
    if (input.textContent.replace(/\n/g, ' ').trim() !== currentValue) {
      goLimbo();
    } else {
      // No change — just collapse back to normal
      td.textContent = originalText;
      td.classList.toggle('cell-accepted', wasAccepted);
      td.classList.toggle('cell-unaccepted', !wasAccepted);
      td.classList.remove('expanded');
      scheduleTableRerender();
    }
  };
  input.addEventListener('blur', onBlur);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent newline in contenteditable
      committed = true;
      input.removeEventListener('blur', onBlur);
      commit();
      const nextTd = document.querySelector(`.batch-table td[data-field="${fieldName}"][data-index="${specimenIndex + 1}"]`);
      if (nextTd) {
        selectTableRow(specimenIndex + 1);
        nextTd.classList.add('expanded');
        startCellEdit(nextTd, specimenIndex + 1, fieldName, allFields);
      }
    } else if (e.key === 'Escape') {
      committed = true;
      input.removeEventListener('blur', onBlur);
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
let _focusCarouselRenderKey = null;
let focusSidebarWidthRatio = null;
let focusTopRowWidthRatio = null;

async function renderFocusView() {
  const el = document.getElementById('focus-view');
  if (!el) return;
  showNavSpinner();

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
    <div class="review-nav">
      <div class="nav-view-toggle" id="focus-view-switch-container"></div>
      <div class="focus-nav-tools">
        ${renderCaseControls('focus')}
        ${renderWebSearchModule('focus')}
        <div class="find-replace-row focus-nav-find-replace">
          <input type="text" id="focus-find" placeholder="Find...">
          <span style="color:var(--text-muted)">&#8594;</span>
          <input type="text" id="focus-replace" placeholder="Replace...">
          <button class="btn-sm" id="focus-apply-replace">Apply</button>
        </div>
      </div>
    </div>
    <div class="focus-columns" id="focus-columns">
      <div class="focus-left-col" id="focus-left-col">
        <div class="focus-body" id="focus-body">
          <div class="focus-sidebar" id="focus-sidebar"></div>
          <div class="resize-handle focus-inline-resize" id="focus-sidebar-resize"></div>
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
        <div class="focus-ocr-panel" id="focus-ocr-panel">
          <div class="collapsible-panel">
            <div class="collapsible-header" id="focus-ocr-header">
              <span>OCR Text</span>
              <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
                <span class="collapse-arrow" id="focus-ocr-arrow">${APP.focusOcrCollapsed ? '&#9654;' : '&#9660;'}</span>
              </div>
            </div>
            <div class="collapsible-body ${APP.focusOcrCollapsed ? 'collapsed' : ''}" id="focus-ocr-body">
              <div class="scrollable-content ocr-text" id="focus-ocr-text" style="max-height:200px;overflow:auto;padding:8px 10px;font-size:var(--fs-11);white-space:pre-wrap;word-break:break-word;color:var(--text-secondary)">Select a specimen to view OCR text</div>
            </div>
          </div>
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
    renderFocusCarousel();
  });
  document.getElementById('focus-image-switch-container').innerHTML = focusImgSw.html;
  focusImgSw.setup();

  // OCR panel collapse toggle
  document.getElementById('focus-ocr-header')?.addEventListener('click', () => {
    APP.focusOcrCollapsed = !APP.focusOcrCollapsed;
    document.getElementById('focus-ocr-body')?.classList.toggle('collapsed');
    const arrow = document.getElementById('focus-ocr-arrow');
    if (arrow) arrow.innerHTML = APP.focusOcrCollapsed ? '&#9654;' : '&#9660;';
  });

  renderFocusSidebar(categories);
  renderFocusMain();

  // Resizable split between left and right columns (left: 50%-80%, right: 20%-50%)
  initResizeHandle('focus-col-resize', 'focus-left-col', 'focus-columns', 0.50, 0.80);
  initHorizontalSplitResize('focus-sidebar-resize', 'focus-sidebar', 'focus-main', 'focus-body', 0.12, 0.30, (ratio) => {
    focusSidebarWidthRatio = ratio;
  });
  if (focusSidebarWidthRatio !== null) {
    const sidebar = document.getElementById('focus-sidebar');
    const main = document.getElementById('focus-main');
    if (sidebar && main) {
      sidebar.style.width = `${focusSidebarWidthRatio * 100}%`;
      sidebar.style.flex = 'none';
      main.style.width = `${(1 - focusSidebarWidthRatio) * 100}%`;
      main.style.flex = 'none';
    }
  }

  // Start with no specimen selected — user must click to select
  tableSelectedIndex = -1;
  hideNavSpinner();
}

function getCategoryColorForField(field) {
  const mapping = APP.currentPrompt?.mapping || {};
  for (const [catName, fields] of Object.entries(mapping)) {
    if (fields.includes(field)) return CATEGORY_COLORS[catName] || CATEGORY_COLORS.MISC;
  }
  return CATEGORY_COLORS.MISC;
}

function getReviewNotRequiredFields() {
  return Array.isArray(APP.currentPrompt?.review_not_required)
    ? APP.currentPrompt.review_not_required.filter(Boolean)
    : [];
}

function isReviewNotRequiredField(field) {
  return getReviewNotRequiredFields().includes(field);
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
    ${categories.map(cat => `
      <div class="focus-sidebar-group">
        <div class="focus-sidebar-group-label">${escapeHtml(cat.name)}</div>
        ${cat.fields.map(f => {
          const issues = countFieldIssues(f);
          const allResolved = isFieldFullyResolved(f);
          const reviewNotRequired = isReviewNotRequiredField(f);
          const batchAccepted = reviewNotRequired && isFieldBatchAcceptedWithVoucherVision(f);
          return `
            <div class="focus-field-item ${f === focusField ? 'active' : ''}" data-field="${escapeAttr(f)}">
              <span class="focus-field-confirm ${allResolved ? 'confirmed' : ''} ${batchAccepted ? 'batch-confirmed' : ''}" ${batchAccepted ? 'title="This field was batch-edited with the \'Batch-Accept VoucherVision Content\' tool"' : ''}>&#10003;</span>
              ${reviewNotRequired && !batchAccepted ? `<span class="focus-field-warning" title="This field does NOT require manual review. Please use the Batch-Accept VoucherVision Content tool located in the VoucherVision tools panel">&#9888;</span>` : ''}
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

function isFieldBatchAcceptedWithVoucherVision(field) {
  for (const spec of APP.specimens) {
    const specState = APP.state.specimens[spec.filename];
    if (!specState?.accepted_fields?.[field]?.batch_accepted_vouchervision) return false;
  }
  return true;
}


function showConfirmAllPopup(field) {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div style="position:relative;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:450px;cursor:default" onclick="event.stopPropagation()">
      ${popupCloseBtnHtml('confirm-all-close', 'Close', true)}
      <div style="font-size:var(--fs-13);margin-bottom:16px;color:var(--text-secondary);line-height:1.6;padding-right:24px">
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
  document.getElementById('confirm-all-close').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-all-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-all-go').addEventListener('click', () => {
    overlay.remove();
    confirmAllFieldValues(field);
  });
}

async function confirmAllFieldValues(field) {
  // Ensure all specimens have state BEFORE capture so rewind can track them (bug fix)
  for (const spec of APP.specimens) {
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
  }
  // Ensure all specimens are in tableDataCache so original values are available
  await ensureAllSpecimensCached();

  const allFilenames = APP.specimens.map(s => s.filename);
  const _rwBefore = rewindCapture(allFilenames, [field], { categories_confirmed: true });

  for (const spec of APP.specimens) {
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

  rewindRecord('confirmAll', 'Confirm All', `"${field}" across ${APP.specimens.length} specimens`, _rwBefore);
  scheduleSaveState(APP.specimens.map(s => s.filename));
  renderFocusSidebar(getFocusCategories());
  renderFocusMain();
}

async function confirmModifiedField(field) {
  await ensureAllSpecimensCached();

  const modifiedFilenames = APP.specimens.filter(s => APP.state.specimens[s.filename]?.unconfirmed_fields?.[field] !== undefined).map(s => s.filename);
  const _rwBefore = rewindCapture(modifiedFilenames, [field], { categories_confirmed: true });

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

  rewindRecord('confirmModified', 'Confirm Modified', `"${field}" on ${modifiedFilenames.length} specimen${modifiedFilenames.length !== 1 ? 's' : ''}`, _rwBefore);
  scheduleSaveState(modifiedFilenames);
  renderFocusSidebar(getFocusCategories());
  renderFocusMain();
}

function renderFocusConfirmFooter() {
  return `
    <div class="focus-confirm-footer" id="focus-confirm-footer">
      <div class="focus-confirm-footer-inner">
        <div class="focus-confirm-label">For <span id="focus-confirm-field-label">${escapeHtml(focusField || '—')}</span>:</div>
        <div class="focus-confirm-buttons">
          <button class="btn-sm focus-confirm-btn focus-confirm-modified-btn" id="focus-confirm-modified" disabled>
            Confirm <span class="focus-confirm-square"></span> entries
          </button>
          <button class="btn-sm focus-confirm-btn focus-confirm-all-btn" id="focus-confirm-all" disabled>Confirm ALL</button>
        </div>
      </div>
    </div>
  `;
}

function updateFocusConfirmButtons() {
  const modBtn = document.getElementById('focus-confirm-modified');
  const allBtn = document.getElementById('focus-confirm-all');
  const modLabel = document.getElementById('focus-confirm-field-label');
  if (!modBtn || !allBtn) return;

  const field = focusField || '—';
  modLabel.textContent = field;

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
let _focusAnalysisVersion = 0;
const _focusFieldValuesCache = new Map();
const _focusClusterCache = new Map();
const _fingerprintCache = new Map();
const _ngramCache = new Map();
const _ocrLookupCache = new Map();
const _ocrHighlightCache = new Map();

function invalidateFieldIssueCounts() { _fieldIssueCountsVersion++; }

function invalidateFocusAnalysisCaches(resetLongLived = false) {
  _focusAnalysisVersion++;
  invalidateFieldIssueCounts();
  _focusFieldValuesCache.clear();
  _focusClusterCache.clear();
  _ocrHighlightCache.clear();
  if (resetLongLived) {
    _ocrLookupCache.clear();
    _fingerprintCache.clear();
    _ngramCache.clear();
  }
}

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
  const cacheKey = `${_focusAnalysisVersion}|${field}`;
  const cachedResult = _focusFieldValuesCache.get(cacheKey);
  if (cachedResult) return cachedResult;

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
  _focusFieldValuesCache.set(cacheKey, result);
  return result;
}

// ── Clustering Algorithms ───────────────────────────────────

function fingerprint(str) {
  const key = str || '';
  if (_fingerprintCache.has(key)) return _fingerprintCache.get(key);
  const result = key.toLowerCase().trim()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
  _fingerprintCache.set(key, result);
  return result;
}

function ngrams(str, n = 2) {
  const cacheKey = `${n}|${str || ''}`;
  if (_ngramCache.has(cacheKey)) return _ngramCache.get(cacheKey);
  const s = (str || '').toLowerCase().replace(/\s+/g, '');
  const result = new Set();
  for (let i = 0; i <= s.length - n; i++) {
    result.add(s.slice(i, i + n));
  }
  _ngramCache.set(cacheKey, result);
  return result;
}

function ngramSimilarityFromSets(na, nb) {
  if (na.size === 0 && nb.size === 0) return 1;
  let intersection = 0;
  for (const g of na) {
    if (nb.has(g)) intersection++;
  }
  return intersection / Math.max(na.size, nb.size);
}

function ngramSimilarity(a, b) {
  return ngramSimilarityFromSets(ngrams(a), ngrams(b));
}

function fingerprintCluster(fieldValues) {
  // Group values by fingerprint
  const groups = new Map();
  const valueCounts = {};

  for (const { value } of fieldValues) {
    if (value === '') continue;
    valueCounts[value] = (valueCounts[value] || 0) + 1;
    const fp = fingerprint(value);
    if (!groups.has(fp)) groups.set(fp, new Set());
    groups.get(fp).add(value);
  }

  const uniqueEntries = Object.entries(valueCounts).map(([value, count]) => {
    const compact = value.toLowerCase().replace(/\s+/g, '');
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    return {
      value,
      count,
      fingerprint: fingerprint(value),
      gramSet: ngrams(value),
      compact,
      length: compact.length,
      firstChar: compact[0] || '',
      tokenCount: tokens.length,
    };
  });

  // Only return groups with >1 distinct value (i.e., inconsistencies)
  const clusters = [];
  for (const [fp, values] of groups.entries()) {
    if (values.size > 1) {
      const variants = [...values].map(v => ({ value: v, count: valueCounts[v] || 0 }));
      variants.sort((a, b) => b.count - a.count);
      clusters.push({ fingerprint: fp, variants, bestValue: variants[0].value });
    }
  }

  // Also check n-gram similarity for values that didn't cluster by fingerprint.
  // Compare only within cheap pre-buckets to avoid the full O(n^2) blow-up.
  const sortedEntries = uniqueEntries.slice().sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.value.localeCompare(b.value);
  });
  const pairClusters = new Set();

  for (let i = 0; i < sortedEntries.length; i++) {
    const a = sortedEntries[i];
    for (let j = i + 1; j < sortedEntries.length; j++) {
      const b = sortedEntries[j];
      const lengthDiff = b.length - a.length;
      if (lengthDiff > 3) break;
      if (Math.abs(a.tokenCount - b.tokenCount) > 1) continue;
      if (a.firstChar && b.firstChar && a.firstChar !== b.firstChar) continue;
      if (a.fingerprint === b.fingerprint) continue;

      const pairKey = a.value < b.value ? `${a.value}\u0000${b.value}` : `${b.value}\u0000${a.value}`;
      if (pairClusters.has(pairKey)) continue;

      const sim = ngramSimilarityFromSets(a.gramSet, b.gramSet);
      if (sim > 0.6 && sim < 1.0) {
        const variants = [
          { value: a.value, count: a.count },
          { value: b.value, count: b.count }
        ].sort((x, y) => y.count - x.count);
        clusters.push({ fingerprint: `ngram:${a.value}|${b.value}`, variants, bestValue: variants[0].value });
        pairClusters.add(pairKey);
      }
    }
  }

  return clusters;
}

function getClusterAnalysis(field, fieldValues, filterValue) {
  const filterKey = filterValue === null ? '__ALL__' : filterValue;
  const cacheKey = `${_focusAnalysisVersion}|${field}|${filterKey}`;
  const cached = _focusClusterCache.get(cacheKey);
  if (cached) return cached;

  let clusterInput = fieldValues;
  if (filterValue !== null) {
    const filterNgrams = ngrams(filterValue);
    clusterInput = fieldValues.filter(v => (
      v.value === filterValue ||
      ngramSimilarityFromSets(ngrams(v.value), filterNgrams) > 0.5
    ));
  }

  const clusters = fingerprintCluster(clusterInput);
  _focusClusterCache.set(cacheKey, clusters);
  return clusters;
}

// ── Focus Main Panel ────────────────────────────────────────

// Track which sections are minimized
const focusSectionState = { values: false, clusters: false, dates: false, dateViolations: false, catalog: false, specimens: false, standardize: false, authorship: false, voucherVision: false, wfoBackbone: false, elevation: false, nameparser: false, ocrComparison: false };
let focusToolCategory = null; // null = no tools shown
// Tracks which scrollable panel last received a click so arrow keys scroll it.
// Possible values: 'specimens', 'values', or a tool section key (e.g. 'dates', 'catalog', 'dateViolations')
let _focusActivePanel = 'specimens';

const TOOL_CATEGORIES = ['dates', 'taxonomy', 'vouchervision', 'geography', 'collectors', 'patterns', 'ocr'];

function getEditorToolCategories() {
  return [...TOOL_CATEGORIES];
}

function showApplyCancelPopup(title, bodyHtml, onApply, applyLabel = 'Apply') {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div style="position:relative;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:20px;max-width:460px;width:min(460px,calc(100vw - 32px));cursor:default" onclick="event.stopPropagation()">
      ${popupCloseBtnHtml('apply-cancel-popup-close', 'Close', true)}
      <div style="font-size:var(--fs-14);font-weight:600;margin-bottom:12px;padding-right:24px">${title}</div>
      <div style="font-size:var(--fs-12);line-height:1.6;color:var(--text-secondary);margin-bottom:16px">${bodyHtml}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" id="apply-cancel-popup-cancel">Cancel</button>
        <button class="btn-sm btn-primary" id="apply-cancel-popup-apply">${applyLabel}</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);

  overlay.querySelector('#apply-cancel-popup-close')?.addEventListener('click', close);
  overlay.querySelector('#apply-cancel-popup-cancel')?.addEventListener('click', close);
  overlay.querySelector('#apply-cancel-popup-apply')?.addEventListener('click', () => {
    close();
    onApply();
  });
}

function renderFocusToolLauncher({ description, summaryItems = [], buttonId, buttonLabel = 'Open Review', disabled = false, note = '' }) {
  return `
    <div class="focus-tool-launcher">
      <div class="focus-tool-launcher-copy">
        <div class="focus-tool-launcher-desc">${description}</div>
      </div>
      <div class="focus-tool-launcher-actions">
        <button class="btn-sm btn-primary" id="${buttonId}" ${disabled ? 'disabled' : ''}>${buttonLabel}</button>
      </div>
    </div>
  `;
}

function getPopupFieldSelectorHtml(controlId, selectedField, options = {}) {
  const {
    includeEmpty = false,
    emptyLabel = 'Select field...',
    fields = getAvailableProjectFields(),
    prevNext = false,
    selectedFieldLabel = 'Field',
  } = options;

  return `
    <div class="focus-popup-header-controls">
      ${prevNext ? `
        <button class="btn-sm" type="button" data-field-nav="prev" title="Previous field">&#8592;</button>
        <button class="btn-sm" type="button" data-field-nav="next" title="Next field">&#8594;</button>
      ` : ''}
      <label class="focus-popup-field-label">
        <span>${escapeHtml(selectedFieldLabel)}</span>
        <select id="${controlId}" class="focus-popup-field-select">
          ${includeEmpty ? `<option value="">${escapeHtml(emptyLabel)}</option>` : ''}
          ${fields.map(field => `<option value="${escapeAttr(field)}" ${field === selectedField ? 'selected' : ''}>${escapeHtml(field)}</option>`).join('')}
        </select>
      </label>
    </div>
  `;
}

function getAdjacentFieldName(currentField, direction, fields = getAvailableProjectFields()) {
  if (!fields.length) return '';
  const currentIndex = fields.indexOf(currentField);
  if (currentIndex === -1) return fields[0];
  if (direction === 'prev') return fields[(currentIndex - 1 + fields.length) % fields.length];
  return fields[(currentIndex + 1) % fields.length];
}

function getPopupScopedFilter(field) {
  if (!field) return null;
  return field === focusField ? focusFilter : null;
}

function getMergeArrowSvg() {
  return '<img src="icons/merge-arrow.svg" alt="" aria-hidden="true">';
}

// Returns the HTML for the shared popup close button (Lucide circle-x SVG).
// If `floating` is true, the button is absolutely positioned in the popup's
// top-right corner — use for popups that have no header row.
function popupCloseBtnHtml(id, title = 'Close', floating = false) {
  const cls = floating ? 'popup-close-btn popup-close-btn-floating' : 'popup-close-btn';
  return `<button class="btn-sm btn-icon ${cls}" id="${id}" title="${escapeAttr(title)}"><img src="icons/close.svg" alt="Close"></button>`;
}

function sharedAssetIconHtml(iconClass, size, extraClass = '') {
  const classes = ['shared-asset-icon', iconClass, extraClass].filter(Boolean).join(' ');
  return `<span class="${classes}" style="--icon-size:${size}px" aria-hidden="true"></span>`;
}

// Returns a shared-asset flag icon. It still uses currentColor via CSS masks,
// so parent color states continue to drive the icon appearance.
function flagIconSvg(isFlagged, size = 14) {
  return sharedAssetIconHtml(isFlagged ? 'shared-asset-icon-flag-filled' : 'shared-asset-icon-flag', size);
}

// ── Flag Tags (Tool Attribution) ────────────────────────────

// Tool context keys used by the flag tag system. 'form' is the only one that
// also stores a user message in flag_note; all others just add a tag.
const FLAG_TOOL_LABELS = {
  form: 'Form',
  table: 'Table',
  ocr: 'OCR',
  wfo: 'WFO',
  authorship: 'Authorship',
  clusters: 'Clusters',
  dates: 'Dates',
  'date-violations': 'Date Violations',
  patterns: 'Patterns',
  collectors: 'Collectors',
  elevation: 'Elevation',
  focus: 'Focus',
  find: 'Find',
};

function getSpecimenTags(filename) {
  return APP.state.specimens?.[filename]?.flag_tags || [];
}

function specimenHasTagForTool(filename, tool) {
  if (!tool) return false;
  return getSpecimenTags(filename).includes(tool);
}

function addTagToSpecimen(filename, tool) {
  if (!tool) return;
  if (!APP.state.specimens[filename]) initSpecimenState(filename);
  const st = APP.state.specimens[filename];
  if (!st.flag_tags) st.flag_tags = [];
  if (!st.flag_tags.includes(tool)) st.flag_tags.push(tool);
}

function removeTagFromSpecimen(filename, tool) {
  const st = APP.state.specimens?.[filename];
  if (!st?.flag_tags) return;
  st.flag_tags = st.flag_tags.filter(t => t !== tool);
}

// Shared-asset tag indicator. Uses currentColor through CSS masks.
function tagIconSvg(size = 11) {
  return sharedAssetIconHtml('shared-asset-icon-tag', size);
}

// Returns combined HTML: the flag icon plus an adjacent slot for the tag.svg
// indicator. When flagged + tool context is provided, the slot becomes a
// clickable button (red = tool has tag, gray = can add tag). Otherwise the
// slot renders as an invisible placeholder so row widths stay consistent.
function flagAndTagHtml(filename, flagSize = 12, tool = null) {
  const isFlagged = !!APP.state.specimens?.[filename]?.flagged;
  const flagHtml = flagIconSvg(isFlagged, flagSize);
  const iconSize = Math.max(flagSize - 1, 10);

  if (!tool || !isFlagged) {
    // Invisible placeholder to preserve layout spacing
    return `${flagHtml}<span class="flag-tag-btn flag-tag-btn-placeholder" aria-hidden="true">${tagIconSvg(iconSize)}</span>`;
  }

  const hasMine = specimenHasTagForTool(filename, tool);
  const colorClass = hasMine ? 'flag-tag-btn-active' : 'flag-tag-btn-inactive';
  const label = FLAG_TOOL_LABELS[tool] || tool;
  const title = hasMine ? `Remove ${label} tag` : `Add ${label} tag`;
  // Use a <span role="button"> (not <button>) so it can be safely nested
  // inside other <button> elements without being relocated by the parser.
  const btn = `<span role="button" tabindex="0" class="flag-tag-btn ${colorClass}" data-file="${escapeAttr(filename)}" data-tool="${escapeAttr(tool)}" title="${escapeAttr(title)}">${tagIconSvg(iconSize)}</span>`;
  return `${flagHtml}${btn}`;
}

function createFocusToolPopup({ title, intro = '', summaryHtml = '', popupClass = 'focus-review-popup', bodyClass = 'focus-review-body', bodyHtml = '', topHtml = '', footerHtml = '', headerRightHtml = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="${popupClass}" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <div class="focus-popup-title-block">
          <div class="focus-popup-title">${title}</div>
          ${intro ? `<div class="tool-instructions">${intro}</div>` : ''}
        </div>
        <button class="btn-sm btn-icon popup-close-btn" data-focus-popup-close title="Close"><img src="icons/close.svg" alt="Close"></button>
      </div>
      ${headerRightHtml ? `<div class="focus-popup-subheader-row">${headerRightHtml}</div>` : ''}
      ${topHtml}
      ${summaryHtml ? `<div class="focus-review-summary">${summaryHtml}</div>` : ''}
      <div class="${bodyClass}">${bodyHtml}</div>
      ${footerHtml ? `<div class="focus-review-footer">${footerHtml}</div>` : ''}
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  overlay.querySelector('[data-focus-popup-close]')?.addEventListener('click', close);

  return {
    overlay,
    close,
    body: overlay.querySelector(`.${bodyClass.split(' ').join('.')}`),
    summary: overlay.querySelector('.focus-review-summary'),
    footer: overlay.querySelector('.focus-review-footer'),
  };
}

function renderFocusPopupSpecimenRow(item, options = {}) {
  const {
    value = item.value || '',
    valueHtml = '',
    valueClass = '',
    detail = '',
    detailClass = '',
    field = '',
    fieldClass = '',
    includeCheckbox = false,
    checked = false,
    checkboxDisabled = false,
    includeFlagButton = false,
    flagTool = null,
    includePhotoButton = false,
    photoFieldLabel = '',
    photoFieldValue = value,
    rowClass = '',
    rowAttrs = '',
    statusField = focusField,
  } = options;
  const displayValue = value === ''
    ? '<span class="cell-empty-placeholder">(empty)</span>'
    : escapeHtml(String(value));

  const quickTools = renderPopupQuickTools(item, {
    tool: flagTool,
    photoFieldLabel: photoFieldLabel || field || '',
    photoFieldValue,
    statusField,
    includePhoto: includePhotoButton,
    includeFlag: includeFlagButton,
  });

  return `
    <div class="focus-popup-specimen-row ${rowClass}" ${rowAttrs}>
      ${includeCheckbox ? `<label class="focus-popup-row-check"><input type="checkbox" data-index="${item.index}" ${checked ? 'checked' : ''} ${checkboxDisabled ? 'disabled' : ''}></label>` : ''}
      ${quickTools}
      <span class="focus-popup-row-file" title="${escapeAttr(getDisplayFilename(item.filename))}">${escapeHtml(getDisplayFilename(item.filename, 24))}</span>
      ${field ? `<span class="focus-popup-row-field ${fieldClass}">${escapeHtml(field)}</span>` : ''}
      <span class="focus-popup-row-value ${valueClass}">${valueHtml || displayValue}</span>
      ${detail ? `<span class="focus-popup-row-detail ${detailClass}">${detail}</span>` : ''}
    </div>
  `;
}

function showSpecimenImageReferencePopup(filename, title = '', fieldLabel = '', fieldValue = '') {
  if (!filename) return;
  const displayValue = fieldValue === ''
    ? '<span class="cell-empty-placeholder">(empty)</span>'
    : escapeHtml(String(fieldValue));
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="cluster-gallery-popup focus-image-reference-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <span>${escapeHtml(title || getDisplayFilename(filename))}</span>
        ${popupCloseBtnHtml('focus-image-reference-close')}
      </div>
      <div class="cluster-gallery-toggle" id="focus-image-reference-toggle"></div>
      <div class="focus-image-reference-meta">
        <div class="focus-image-reference-field">${escapeHtml(fieldLabel || '')}</div>
        <div class="focus-image-reference-value">${displayValue}</div>
      </div>
      <div class="wfo-reference-images" id="focus-image-reference-images">
        <div class="table-image-placeholder">Loading...</div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  overlay.querySelector('#focus-image-reference-close')?.addEventListener('click', close);

  let imageType = tableImageType;
  const loadImage = async () => {
    const container = overlay.querySelector('#focus-image-reference-images');
    if (!container) return;
    container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, filename, imageType, 'full');
    if (!container.isConnected) return;
    if (dataUrl) {
      container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(filename))}">`;
      container.querySelector('img')?.addEventListener('click', () => openImageModal(dataUrl));
    } else {
      container.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
    }
  };

  const switchControl = createSlideSwitch('focus-image-reference-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadImage();
  });
  const switchContainer = overlay.querySelector('#focus-image-reference-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = switchControl.html;
    switchControl.setup();
  }

  loadImage();
}

function renderFocusReviewGroup({ title, meta = [], actionsHtml = '', bodyHtml = '' }) {
  return `
    <div class="focus-review-group">
      <div class="focus-review-group-header">
        <div class="focus-review-group-title-wrap">
          <span class="focus-review-group-title">${title}</span>
          ${meta.map(item => `<span class="focus-review-group-meta">${item}</span>`).join('')}
        </div>
        ${actionsHtml ? `<div class="focus-review-group-actions">${actionsHtml}</div>` : ''}
      </div>
      <div class="focus-review-group-body">${bodyHtml}</div>
    </div>
  `;
}

function getFocusScopedFieldValues(fieldValues = null, useFacetFilter = true) {
  const values = fieldValues || getAllValuesForField(focusField);
  if (!useFacetFilter || focusFilter === null) return values;
  return values.filter(item => item.value === focusFilter);
}

function renderClusterLauncherSection(fieldValues, selectedField = focusField) {
  const container = document.getElementById('focus-cluster-content');
  if (!container) return;
  const availableFields = getAvailableProjectFields();
  container.innerHTML = renderFocusToolLauncher({
    description: 'Review near-duplicate values and merge clusters into one shared value after choosing a field in the popup.',
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
      'choose field in popup'
    ],
    buttonId: 'btn-open-cluster-review',
    buttonLabel: 'Open N-Gram Clustering',
    disabled: availableFields.length === 0,
    note: 'Bubble clicks now open a specimen thumbnail gallery for that exact value.'
  });
  document.getElementById('btn-open-cluster-review')?.addEventListener('click', () => showClusterReviewPopup(''));
}

function renderDateFormatsLauncherSection(fieldValues) {
  const container = document.getElementById('focus-dates-content');
  if (!container) return;
  const availableFields = getAvailableProjectFields().filter(field => /date/i.test(field));
  container.innerHTML = renderFocusToolLauncher({
    description: 'Group a selected field by detected date format so you can stage bins for review.',
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
      'choose field in popup'
    ],
    buttonId: 'btn-open-date-format-review',
    buttonLabel: 'Open Date Format Review',
    disabled: availableFields.length === 0,
    note: 'The popup starts with no field selected so you can choose the date field there.'
  });
  document.getElementById('btn-open-date-format-review')?.addEventListener('click', () => showDateFormatsReviewPopup(''));
}

function renderDateViolationsLauncherSection(fieldValues) {
  const container = document.getElementById('focus-dateviolations-content');
  if (!container) return;
  const availableFields = getAvailableProjectFields().filter(field => /date/i.test(field));
  container.innerHTML = renderFocusToolLauncher({
    description: 'Review suspicious date values such as swapped month/day positions, very old years, and future years.',
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
      'choose field in popup'
    ],
    buttonId: 'btn-open-date-violation-review',
    buttonLabel: 'Open Date Violation Review',
    disabled: availableFields.length === 0,
    note: 'The popup starts with no field selected so you can choose the date field there.'
  });
  document.getElementById('btn-open-date-violation-review')?.addEventListener('click', () => showDateViolationsReviewPopup(''));
}

function renderCatalogPatternsLauncherSection(fieldValues) {
  const container = document.getElementById('focus-patterns-content');
  if (!container) return;
  const availableFields = getAvailableProjectFields();
  container.innerHTML = renderFocusToolLauncher({
    description: `Inspect structural catalog-number patterns and drill into sequence gaps or duplicates from the same popup.`,
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
      'choose a field in the popup'
    ],
    buttonId: 'btn-open-pattern-review',
    buttonLabel: 'Open Catalog Pattern Review',
    disabled: availableFields.length === 0,
    note: 'The popup starts with no field selected so you can choose the pattern-review target there.'
  });
  document.getElementById('btn-open-pattern-review')?.addEventListener('click', () => showCatalogPatternReviewPopup(''));
}

function renderOcrComparisonLauncherSection(fieldValues) {
  const container = document.getElementById('focus-ocr-comparison-list');
  if (!container) return;
  const availableFields = getAvailableProjectFields();
  container.innerHTML = renderFocusToolLauncher({
    description: `Open a dedicated OCR review workspace with flagged OCR disagreements on the left and image plus OCR reference on the right.`,
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
      focusFilter !== null ? `filtered to ${escapeHtml(focusFilter || '(empty)')}` : 'all visible specimens'
    ],
    buttonId: 'btn-open-ocr-review',
    buttonLabel: 'Open OCR Review',
    disabled: availableFields.length === 0,
    note: 'Choose a field in the popup, then quickly flag OCR disagreements for review.'
  });
  document.getElementById('btn-open-ocr-review')?.addEventListener('click', () => showOcrComparisonPopup(''));
}

function renderElevationLauncherSection() {
  const container = document.getElementById('focus-elevation-list');
  if (!container) return;
  const elevationFields = getElevationReviewFields();
  container.innerHTML = renderFocusToolLauncher({
    description: 'Review elevation fields in a dedicated popup, compare them to COP90 when available, and still catch extreme or impossible values when COP90 is missing.',
    summaryItems: [
      `${elevationFields.length} field${elevationFields.length !== 1 ? 's' : ''} available`,
      'choose field in popup'
    ],
    buttonId: 'btn-open-elevation-review',
    buttonLabel: 'Open Elevation Review',
    disabled: elevationFields.length === 0,
    note: elevationFields.length === 0
      ? 'No elevation or altitude fields were found in the project.'
      : 'Choose the target field in the popup. With no COP90 match, the tool still surfaces extreme or impossible values.'
  });
  document.getElementById('btn-open-elevation-review')?.addEventListener('click', () => showElevationDiscrepancyPopup(''));
}

function renderNameParserSection() {
  const container = document.getElementById('focus-name-parser-list');
  if (!container) return;
  if (focusToolCategory !== 'collectors') { container.innerHTML = ''; return; }

  const availableFields = getAvailableProjectFields();
  container.innerHTML = renderFocusToolLauncher({
    description: 'Parse and standardize collector names across all specimens after choosing the target field in the popup.',
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
      'choose field in popup'
    ],
    buttonId: 'btn-open-name-parser',
    buttonLabel: 'Open Name Parser',
    disabled: availableFields.length === 0,
    note: 'Use the popup controls to choose the name format and parsing options before staging changes.'
  });

  document.getElementById('btn-open-name-parser')?.addEventListener('click', () => showCollectorNamePopup(''));
}

// ── Attribution Tool ────────────────────────────────────────────────
// Drag-and-drop name reassignment across multiple collector attribution
// fields. Step 1: pick 2–5 fields. Step 2: drag name tiles between cells.

function renderAttributionToolSection() {
  const container = document.getElementById('focus-attribution-tool-list');
  if (!container) return;
  if (focusToolCategory !== 'collectors') { container.innerHTML = ''; return; }

  const availableFields = getAvailableProjectFields();
  container.innerHTML = renderFocusToolLauncher({
    description: 'Drag and drop names between attribution fields to reassign collector roles across specimens.',
    summaryItems: [
      `${availableFields.length} field${availableFields.length !== 1 ? 's' : ''} available`,
    ],
    buttonId: 'btn-open-attribution-tool',
    buttonLabel: 'Open Attribution Tool',
    disabled: availableFields.length < 2,
    note: availableFields.length < 2
      ? 'At least 2 fields are required to use this tool.'
      : 'Choose which fields to compare, then drag names between them.'
  });

  document.getElementById('btn-open-attribution-tool')?.addEventListener('click', () => {
    const saved = APP.project?.attribution_fields;
    if (Array.isArray(saved) && saved.length >= 2) {
      // Validate saved fields still exist in the project
      const available = new Set(getAvailableProjectFields());
      const valid = saved.filter(f => available.has(f));
      if (valid.length >= 2) {
        showAttributionEditorPopup(valid);
        return;
      }
    }
    showAttributionFieldPickerPopup();
  });
}

function showAttributionFieldPickerPopup() {
  const allFields = getAvailableProjectFields();
  const NUM_SLOTS = 5;
  const saved = APP.project?.attribution_fields || [];

  const dropdownRowsHtml = Array.from({ length: NUM_SLOTS }, (_, i) => {
    const n = i + 1;
    const preselected = saved[i] || '';
    return `
      <div class="attribution-field-picker-row">
        <span class="attribution-field-picker-label">attribution_${n}</span>
        <select class="attribution-field-picker-select focus-popup-field-select" id="attr-field-select-${n}" data-slot="${n}">
          <option value="">\u2014 none \u2014</option>
          ${allFields.map(f => `<option value="${escapeAttr(f)}" ${f === preselected ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
        </select>
      </div>
    `;
  }).join('');

  const popup = createFocusToolPopup({
    title: 'Attribution Tool \u2014 Select Fields',
    intro: 'Choose 2 to 5 fields that represent attribution roles (e.g.\u00a0primary collector, secondary collector). Each field can only be assigned to one slot.',
    popupClass: 'focus-review-popup attribution-field-picker-popup',
    bodyHtml: dropdownRowsHtml,
    footerHtml: '<button class="btn-sm btn-primary" id="attr-picker-continue" disabled>Continue</button>',
  });

  const selects = Array.from({ length: NUM_SLOTS }, (_, i) =>
    popup.overlay.querySelector(`#attr-field-select-${i + 1}`)
  );

  function syncDropdowns() {
    const chosen = new Map();
    selects.forEach((sel, i) => { if (sel.value) chosen.set(sel.value, i); });

    selects.forEach((sel, idx) => {
      Array.from(sel.options).forEach(opt => {
        if (!opt.value) return;
        const owner = chosen.get(opt.value);
        opt.disabled = owner !== undefined && owner !== idx;
      });
    });

    const count = chosen.size;
    const btn = popup.overlay.querySelector('#attr-picker-continue');
    if (btn) btn.disabled = count < 2;
  }

  selects.forEach(sel => sel?.addEventListener('change', syncDropdowns));
  syncDropdowns(); // apply mutual exclusion for pre-populated values

  popup.overlay.querySelector('#attr-picker-continue')?.addEventListener('click', () => {
    const selectedFields = selects
      .map(sel => sel.value)
      .filter(Boolean);
    // Persist selection to project
    if (APP.project) {
      APP.project.attribution_fields = selectedFields;
      scheduleProjectSave();
    }
    popup.close();
    showAttributionEditorPopup(selectedFields);
  });
}

function showAttributionEditorPopup(attributionFields) {
  // Build row data from all specimens
  const isEtAl = (n) => /^et\s+al\.?$/i.test(n.trim());
  const rows = [];
  for (const spec of APP.specimens) {
    const idx = specimenIndexMap.get(spec.filename);
    const cells = attributionFields.map(field => {
      const raw = getCurrentFieldValue(spec, field);
      const { names } = splitCollectorNames(raw, false);
      return { field, names: [...names] };
    });
    // Skip specimens that have no names in any selected field
    const hasAny = cells.some(c => c.names.length > 0);
    if (!hasAny) continue;
    rows.push({ filename: spec.filename, index: idx, cells });
  }

  let activeFilename = rows[0]?.filename || null;
  let imageType = tableImageType;
  let editorMode = 'dnd'; // 'dnd' or 'preview'

  // Build header labels
  const headerCols = attributionFields.map(f =>
    `<span class="attribution-header-col">${escapeHtml(f)}</span>`
  ).join('');

  const popup = createFocusToolPopup({
    title: 'Attribution Tool',
    intro: 'Drag name tiles between cells to reassign attribution. Orange outlines indicate unsaved changes.',
    popupClass: 'focus-review-popup attribution-editor-popup',
    bodyClass: 'attribution-editor-layout',
    bodyHtml: `
      <div class="attribution-editor-list-wrapper" id="attribution-editor-left">
        <div class="attribution-mode-toggle" id="attribution-mode-toggle"></div>
        <div class="attribution-header-row">
          <span class="attribution-header-qt"></span>
          <span class="attribution-header-file">Filename</span>
          ${headerCols}
        </div>
        <div class="attribution-editor-list" id="attribution-editor-list"></div>
      </div>
      <div class="attribution-editor-resize" id="attribution-editor-resize"></div>
      <div class="attribution-editor-preview" id="attribution-editor-right">
        <div class="cluster-gallery-toggle" id="attribution-preview-toggle"></div>
        <div class="attribution-preview-filename" id="attribution-preview-filename"></div>
        <div class="wfo-reference-images" id="attribution-preview-image">
          <div class="table-image-placeholder">Select a specimen</div>
        </div>
      </div>
    `,
  });

  // Helper: refresh row data from state after confirm operations
  function refreshRowData() {
    for (const row of rows) {
      for (const cell of row.cells) {
        const raw = getCurrentFieldValue({ filename: row.filename }, cell.field);
        const { names } = splitCollectorNames(raw, false);
        cell.names = [...names];
      }
    }
    renderRows();
    updateAttrConfirmButtons();
  }

  // Header buttons — insert left of the close button
  const closeBtn = popup.overlay.querySelector('[data-focus-popup-close]');
  if (closeBtn) {
    const headerParent = closeBtn.parentNode;

    // "Confirm [■] Entries" — green accent, confirms only unconfirmed fields
    const confirmModBtn = document.createElement('button');
    confirmModBtn.className = 'btn-sm focus-confirm-btn focus-confirm-modified-btn';
    confirmModBtn.id = 'attr-confirm-modified';
    confirmModBtn.innerHTML = 'Confirm <span class="focus-confirm-square"></span> Entries';
    confirmModBtn.title = 'Confirm all unconfirmed entries across attribution fields';
    headerParent.insertBefore(confirmModBtn, closeBtn);

    // "Confirm ALL" — orange accent
    const confirmAllBtn = document.createElement('button');
    confirmAllBtn.className = 'btn-sm focus-confirm-btn focus-confirm-all-btn';
    confirmAllBtn.id = 'attr-confirm-all';
    confirmAllBtn.innerHTML = 'Confirm ALL';
    confirmAllBtn.title = 'Confirm all entries across attribution fields';
    headerParent.insertBefore(confirmAllBtn, closeBtn);

    // "Change Fields"
    const changeBtn = document.createElement('button');
    changeBtn.className = 'btn-sm';
    changeBtn.textContent = 'Change Fields';
    changeBtn.title = 'Change attribution field selections';
    headerParent.insertBefore(changeBtn, closeBtn);

    // "Rewind" — immediately left of the close button
    const rewindBtn = document.createElement('button');
    rewindBtn.className = 'btn-sm btn-rewind';
    rewindBtn.id = 'attr-rewind-btn';
    rewindBtn.textContent = `Rewind (${REWIND.stack.length})`;
    rewindBtn.title = 'Rewind actions';
    rewindBtn.style.display = REWIND.stack.length > 0 ? '' : 'none';
    headerParent.insertBefore(rewindBtn, closeBtn);

    changeBtn.addEventListener('click', () => {
      popup.close();
      showAttributionFieldPickerPopup();
    });

    rewindBtn.addEventListener('click', () => {
      openRewindPopup();
      // Watch for the rewind overlay to close, then refresh popup state
      const observer = new MutationObserver(() => {
        if (!document.getElementById('rewind-overlay')) {
          observer.disconnect();
          refreshRowData();
          updateAttrRewindButton();
        }
      });
      observer.observe(document.body, { childList: true });
    });

    confirmModBtn.addEventListener('click', () => {
      let limboCount = 0;
      for (const spec of APP.specimens) {
        const st = APP.state.specimens[spec.filename];
        for (const field of attributionFields) {
          if (st?.unconfirmed_fields?.[field] !== undefined) limboCount++;
        }
      }
      const fieldList = attributionFields.map(f => `<strong>${escapeHtml(f)}</strong>`).join(', ');
      showApplyCancelPopup(
        'Confirm Unconfirmed Entries?',
        `Accept <strong>${limboCount}</strong> unconfirmed entr${limboCount !== 1 ? 'ies' : 'y'} across attribution fields: ${fieldList}.`,
        async () => {
          for (const field of attributionFields) {
            await confirmModifiedField(field);
          }
          refreshRowData();
        },
        'Confirm'
      );
    });

    confirmAllBtn.addEventListener('click', () => {
      const totalSpecimens = APP.specimens.length;
      const fieldList = attributionFields.map(f => `<strong>${escapeHtml(f)}</strong>`).join(', ');
      showApplyCancelPopup(
        'Confirm ALL Attribution Entries?',
        `Accept the current values for all <strong>${totalSpecimens}</strong> specimens across ${attributionFields.length} attribution fields: ${fieldList}.`,
        async () => {
          for (const field of attributionFields) {
            await confirmAllFieldValues(field);
          }
          refreshRowData();
        },
        'Confirm ALL'
      );
    });
  }

  function updateAttrConfirmButtons() {
    const modBtn = popup.overlay.querySelector('#attr-confirm-modified');
    const allBtn = popup.overlay.querySelector('#attr-confirm-all');
    if (!modBtn || !allBtn) return;

    let limboCount = 0;
    let unresolvedCount = 0;
    for (const spec of APP.specimens) {
      const st = APP.state.specimens[spec.filename];
      for (const field of attributionFields) {
        if (st?.unconfirmed_fields?.[field] !== undefined) limboCount++;
        if (!st?.accepted_fields?.[field]) unresolvedCount++;
      }
    }
    modBtn.disabled = limboCount === 0;
    allBtn.disabled = limboCount === 0 && unresolvedCount === 0;
  }

  function updateAttrRewindButton() {
    const btn = popup.overlay.querySelector('#attr-rewind-btn');
    if (!btn) return;
    btn.textContent = `Rewind (${REWIND.stack.length})`;
    btn.style.display = REWIND.stack.length > 0 ? '' : 'none';
  }

  // Setup collage/original toggle
  const switchId = `attr-preview-switch-${Date.now()}`;
  const sw = createSlideSwitch(switchId, [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => { imageType = val; loadPreviewImage(); });
  const toggleContainer = popup.overlay.querySelector('#attribution-preview-toggle');
  if (toggleContainer) { toggleContainer.innerHTML = sw.html; sw.setup(); }

  // Setup mode toggle (Drag and Drop / Preview Literal Entries)
  const modeSwitchId = `attr-mode-switch-${Date.now()}`;
  const modeSw = createSlideSwitch(modeSwitchId, [
    { value: 'dnd', label: 'Drag and Drop' },
    { value: 'preview', label: 'Preview Literal Entries' }
  ], editorMode, (val) => { editorMode = val; renderRows(); });
  const modeToggleContainer = popup.overlay.querySelector('#attribution-mode-toggle');
  if (modeToggleContainer) { modeToggleContainer.innerHTML = modeSw.html; modeSw.setup(); }

  // Init resizable splitter: left 50–90%, right 10–50%
  if (popup.body) popup.body.id = 'attribution-editor-container';
  initHorizontalSplitResize(
    'attribution-editor-resize',
    'attribution-editor-left',
    'attribution-editor-right',
    'attribution-editor-container',
    0.50, 0.90
  );

  const listContainer = popup.overlay.querySelector('#attribution-editor-list');

  async function loadPreviewImage() {
    const imgEl = popup.overlay.querySelector('#attribution-preview-image');
    const fnEl = popup.overlay.querySelector('#attribution-preview-filename');
    if (!imgEl || !activeFilename) return;
    if (fnEl) fnEl.textContent = getDisplayFilename(activeFilename);
    imgEl.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, activeFilename, imageType, 'full');
    if (!imgEl.isConnected) return;
    imgEl.innerHTML = dataUrl
      ? `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(activeFilename))}">`
      : '<div class="table-image-placeholder">No image available</div>';
  }

  function reconstructFieldValue(names) {
    // Ensure "et al." is always last
    const regular = [];
    let hasEtAl = false;
    for (const n of names) {
      if (isEtAl(n)) { hasEtAl = true; }
      else { regular.push(n); }
    }
    if (hasEtAl) regular.push('et al.');
    return regular.join(', ');
  }

  function renderRows() {
    if (!listContainer) return;

    listContainer.innerHTML = rows.map(row => {
      const isActive = row.filename === activeFilename;
      const quickTools = renderPopupQuickTools(row, {
        tool: 'attribution',
        includeStatus: false,
        includePhoto: true,
        includeFlag: true,
        photoFieldLabel: attributionFields[0] || '',
        photoFieldValue: '',
      });

      const cellsHtml = row.cells.map((cell) => {
        const isUnconfirmed = APP.state.specimens[row.filename]?.unconfirmed_fields?.[cell.field] !== undefined;
        if (editorMode === 'preview') {
          const raw = getCurrentFieldValue({ filename: row.filename }, cell.field);
          const isAccepted = APP.state.specimens[row.filename]?.accepted_fields?.[cell.field] !== undefined;
          let stateClass;
          if (isUnconfirmed) stateClass = 'attribution-literal-limbo';
          else if (isAccepted) stateClass = 'attribution-literal-accepted';
          else stateClass = 'attribution-literal-unaccepted';
          const displayVal = raw
            ? `<span class="attribution-literal-value ${stateClass}">${escapeHtml(raw)}</span>`
            : `<span class="cell-empty-placeholder ${stateClass}">(empty)</span>`;
          return `<div class="attribution-cell attribution-cell-preview">${displayVal}</div>`;
        }
        const tilesHtml = cell.names.map((name, nameIdx) => `
          <div class="attribution-tile ${isUnconfirmed ? 'attribution-tile-moved' : ''}"
               draggable="true"
               data-file="${escapeAttr(row.filename)}"
               data-field="${escapeAttr(cell.field)}"
               data-name-index="${nameIdx}"
               data-name-text="${escapeAttr(name)}">
            <span class="attribution-tile-order">${nameIdx + 1}</span>
            <span class="attribution-tile-name">${escapeHtml(name)}</span>
            <button type="button" class="attribution-tile-dup" title="Duplicate name to another field"
                    data-file="${escapeAttr(row.filename)}" data-field="${escapeAttr(cell.field)}" data-name-index="${nameIdx}">
              <img src="icons/duplicate.svg" alt="" aria-hidden="true">
            </button>
            <button type="button" class="attribution-tile-del" title="Remove name from this field"
                    data-file="${escapeAttr(row.filename)}" data-field="${escapeAttr(cell.field)}" data-name-index="${nameIdx}">
              <img src="icons/close.svg" alt="" aria-hidden="true">
            </button>
          </div>
        `).join('');
        return `<div class="attribution-cell" data-file="${escapeAttr(row.filename)}" data-field="${escapeAttr(cell.field)}">${tilesHtml}</div>`;
      }).join('');

      return `
        <div class="attribution-row ${isActive ? 'active' : ''}" data-file="${escapeAttr(row.filename)}">
          ${quickTools}
          <span class="attribution-col-file" title="${escapeAttr(getDisplayFilename(row.filename))}">${escapeHtml(getDisplayFilename(row.filename, 24))}</span>
          ${cellsHtml}
        </div>
      `;
    }).join('');

    // Wire quick tools
    wirePopupQuickTools(listContainer, { closeFn: () => popup.close(), onFlagRefresh: renderRows });

    // Wire row clicks for image preview
    listContainer.querySelectorAll('.attribution-row').forEach(rowEl => {
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('.attribution-tile, .popup-quicktools')) return;
        activeFilename = rowEl.dataset.file;
        listContainer.querySelectorAll('.attribution-row.active').forEach(r => r.classList.remove('active'));
        rowEl.classList.add('active');
        loadPreviewImage();
      });
    });

    // Wire inline editing on tile name click
    listContainer.querySelectorAll('.attribution-tile-name').forEach(nameSpan => {
      nameSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const tile = nameSpan.closest('.attribution-tile');
        if (!tile || nameSpan.querySelector('input')) return;
        tile.setAttribute('draggable', 'false');
        const filename = tile.dataset.file;
        const field = tile.dataset.field;
        const nameIdx = parseInt(tile.dataset.nameIndex, 10);
        const row = rows.find(r => r.filename === filename);
        if (!row) return;
        const cell = row.cells.find(c => c.field === field);
        if (!cell) return;
        const currentVal = cell.names[nameIdx];

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'attribution-tile-editor';
        input.value = currentVal;
        nameSpan.textContent = '';
        nameSpan.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
          const newVal = input.value.trim();
          if (newVal !== currentVal) {
            const _rwBefore = rewindCapture([filename], [field]);
            if (newVal === '') {
              // Delete the name
              cell.names.splice(nameIdx, 1);
            } else {
              cell.names[nameIdx] = newVal;
            }
            if (!APP.state.specimens[filename]) initSpecimenState(filename);
            const specState = APP.state.specimens[filename];
            stageFieldAsUnconfirmed(specState, field, reconstructFieldValue(cell.names));
            specState.last_touched = new Date().toISOString();
            rewindRecord('attribution', newVal === '' ? 'Attribution Delete' : 'Attribution Edit',
              `${newVal === '' ? 'Removed' : 'Edited'} name in ${field} on ${getDisplayFilename(filename)}`, _rwBefore);
            scheduleSaveState(filename);
          }
          renderRows();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') { evt.preventDefault(); input.removeEventListener('blur', save); save(); }
          else if (evt.key === 'Escape') { evt.preventDefault(); renderRows(); }
        });
      });
    });

    // Wire duplicate buttons — duplicate stays in the same column
    listContainer.querySelectorAll('.attribution-tile-dup').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const filename = btn.dataset.file;
        const field = btn.dataset.field;
        const nameIdx = parseInt(btn.dataset.nameIndex, 10);
        const row = rows.find(r => r.filename === filename);
        if (!row) return;
        const cell = row.cells.find(c => c.field === field);
        if (!cell) return;
        const name = cell.names[nameIdx];

        const _rwBefore = rewindCapture([filename], [field]);
        cell.names.splice(nameIdx + 1, 0, name);

        if (!APP.state.specimens[filename]) initSpecimenState(filename);
        const specState = APP.state.specimens[filename];
        stageFieldAsUnconfirmed(specState, field, reconstructFieldValue(cell.names));
        specState.last_touched = new Date().toISOString();
        rewindRecord('attribution', 'Attribution Duplicate', `Duplicated "${name}" in ${field} on ${getDisplayFilename(filename)}`, _rwBefore);
        scheduleSaveState(filename);
        renderRows();
      });
    });

    // Wire delete buttons
    listContainer.querySelectorAll('.attribution-tile-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const filename = btn.dataset.file;
        const field = btn.dataset.field;
        const nameIdx = parseInt(btn.dataset.nameIndex, 10);
        const row = rows.find(r => r.filename === filename);
        if (!row) return;
        const cell = row.cells.find(c => c.field === field);
        if (!cell) return;
        const removedName = cell.names[nameIdx];

        const _rwBefore = rewindCapture([filename], [field]);
        cell.names.splice(nameIdx, 1);

        if (!APP.state.specimens[filename]) initSpecimenState(filename);
        const specState = APP.state.specimens[filename];
        stageFieldAsUnconfirmed(specState, field, reconstructFieldValue(cell.names));
        specState.last_touched = new Date().toISOString();
        rewindRecord('attribution', 'Attribution Delete', `Removed "${removedName}" from ${field} on ${getDisplayFilename(filename)}`, _rwBefore);
        scheduleSaveState(filename);
        renderRows();
      });
    });

    // Wire drag-and-drop
    wireDragAndDrop();

    // Update header button states
    updateAttrConfirmButtons();
    updateAttrRewindButton();
  }

  function wireDragAndDrop() {
    let dragSourceFile = null;

    listContainer.querySelectorAll('.attribution-tile').forEach(tile => {
      tile.addEventListener('dragstart', (e) => {
        dragSourceFile = tile.dataset.file;
        e.dataTransfer.setData('application/x-attribution', JSON.stringify({
          name: tile.dataset.nameText,
          sourceFile: tile.dataset.file,
          sourceField: tile.dataset.field,
          sourceIndex: parseInt(tile.dataset.nameIndex, 10),
        }));
        e.dataTransfer.effectAllowed = 'move';
        tile.classList.add('attribution-tile-dragging');
      });
      tile.addEventListener('dragend', () => {
        tile.classList.remove('attribution-tile-dragging');
        dragSourceFile = null;
        listContainer.querySelectorAll('.attribution-cell-dragover').forEach(c => c.classList.remove('attribution-cell-dragover'));
        listContainer.querySelectorAll('.attribution-drop-indicator').forEach(el => el.remove());
      });
    });

    listContainer.querySelectorAll('.attribution-cell').forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        if (dragSourceFile !== cell.dataset.file) return; // same-row only
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('attribution-cell-dragover');

        // Positional insertion indicator
        cell.querySelectorAll('.attribution-drop-indicator').forEach(el => el.remove());
        const tiles = Array.from(cell.querySelectorAll('.attribution-tile:not(.attribution-tile-dragging)'));
        const mouseY = e.clientY;
        let insertIdx = tiles.length;
        for (let i = 0; i < tiles.length; i++) {
          const rect = tiles[i].getBoundingClientRect();
          if (mouseY < rect.top + rect.height / 2) {
            insertIdx = i;
            break;
          }
        }
        const indicator = document.createElement('div');
        indicator.className = 'attribution-drop-indicator';
        if (insertIdx < tiles.length) {
          cell.insertBefore(indicator, tiles[insertIdx]);
        } else {
          cell.appendChild(indicator);
        }
      });

      cell.addEventListener('dragleave', (e) => {
        if (!cell.contains(e.relatedTarget)) {
          cell.classList.remove('attribution-cell-dragover');
          cell.querySelectorAll('.attribution-drop-indicator').forEach(el => el.remove());
        }
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('attribution-cell-dragover');
        cell.querySelectorAll('.attribution-drop-indicator').forEach(el => el.remove());

        const raw = e.dataTransfer.getData('application/x-attribution');
        if (!raw) return;
        const data = JSON.parse(raw);

        // Same-row only
        if (data.sourceFile !== cell.dataset.file) return;

        const targetField = cell.dataset.field;
        const filename = data.sourceFile;

        // Find the row
        const row = rows.find(r => r.filename === filename);
        if (!row) return;
        const sourceCell = row.cells.find(c => c.field === data.sourceField);
        const targetCell = row.cells.find(c => c.field === targetField);
        if (!sourceCell || !targetCell) return;

        // Compute insertion index from mouse position
        const tiles = Array.from(cell.querySelectorAll('.attribution-tile:not(.attribution-tile-dragging)'));
        const mouseY = e.clientY;
        let insertIdx = tiles.length;
        for (let i = 0; i < tiles.length; i++) {
          const rect = tiles[i].getBoundingClientRect();
          if (mouseY < rect.top + rect.height / 2) {
            insertIdx = i;
            break;
          }
        }

        // Capture undo state
        const _rwBefore = rewindCapture([filename], [data.sourceField, targetField]);

        // Remove from source
        const [movedName] = sourceCell.names.splice(data.sourceIndex, 1);

        // If same field, adjust insert index if source was before target
        if (data.sourceField === targetField && data.sourceIndex < insertIdx) {
          insertIdx = Math.max(0, insertIdx - 1);
        }

        // Insert into target
        targetCell.names.splice(insertIdx, 0, movedName);

        // Stage as unconfirmed
        if (!APP.state.specimens[filename]) initSpecimenState(filename);
        const specState = APP.state.specimens[filename];
        stageFieldAsUnconfirmed(specState, data.sourceField, reconstructFieldValue(sourceCell.names));
        if (data.sourceField !== targetField) {
          stageFieldAsUnconfirmed(specState, targetField, reconstructFieldValue(targetCell.names));
        }
        specState.last_touched = new Date().toISOString();


        // Record undo
        rewindRecord('attribution', 'Attribution Move', `Moved "${movedName}" from ${data.sourceField} to ${targetField} on ${getDisplayFilename(filename)}`, _rwBefore);

        scheduleSaveState(filename);
        renderRows();
      });
    });
  }

  // Initial render
  renderRows();
  updateAttrConfirmButtons();
  loadPreviewImage();
}

function showClusterReviewPopup(selectedField = focusField) {
  const field = selectedField;
  const fieldValues = field ? getAllValuesForField(field) : [];
  const popupFilter = getPopupScopedFilter(field);
  const clusters = field ? getClusterAnalysis(field, fieldValues, popupFilter) : [];
  const popup = createFocusToolPopup({
    title: 'N-Gram Clustering',
    popupClass: 'focus-review-popup focus-cluster-popup',
    headerRightHtml: getPopupFieldSelectorHtml('cluster-review-field', field, { includeEmpty: true, emptyLabel: 'Select field...' }),
    topHtml: `
      <div class="focus-review-toolbar focus-cluster-toolbar">
        <div class="focus-cluster-toolbar-copy">
          ${field
            ? `Review near-duplicate values in <strong>${escapeHtml(field)}</strong>${popupFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(popupFilter || '(empty)')}</strong>` : ''}.`
            : 'Choose a field to review near-duplicate values and merge clusters.'}
        </div>
        ${renderCaseControls('cluster-popup')}
      </div>
    `,
    summaryHtml: field
      ? `${clusters.length} cluster${clusters.length !== 1 ? 's' : ''} detected.`
      : 'No field selected yet.',
  });

  popup.overlay.querySelector('#cluster-review-field')?.addEventListener('change', (e) => {
    popup.close();
    showClusterReviewPopup(e.target.value);
  });
  wireCaseControls('cluster-popup');

  popup.body.innerHTML = !field
    ? '<div class="focus-review-empty">Select a field to open N-gram clustering.</div>'
    : clusters.length === 0
    ? '<div class="focus-review-empty">No inconsistencies detected.</div>'
    : `
      <div class="focus-cluster-review-list">
        ${clusters.map((cluster, clusterIndex) => `
          <div class="focus-cluster-review-row">
            <div class="focus-cluster-review-variants">
              ${cluster.variants.map(variant => `
                <span class="cluster-chip" data-cluster-gallery="${escapeAttr(variant.value)}" title="Open specimen gallery for this value">
                  ${escapeHtml(variant.value)}<span class="chip-count">&times;${variant.count}</span><img class="cluster-chip-icon" src="icons/image.svg" alt="" aria-hidden="true">
                </span>
              `).join('')}
            </div>
            <span class="focus-cluster-review-arrow">${getMergeArrowSvg()}</span>
            <input type="text" class="cluster-merge-input focus-cluster-merge-input" id="cluster-popup-input-${clusterIndex}" value="${escapeAttr(cluster.bestValue)}">
            <button class="btn-sm btn-primary focus-cluster-merge-btn" data-cluster-apply="${clusterIndex}">Merge</button>
          </div>
        `).join('')}
      </div>
    `;

  popup.overlay.querySelectorAll('[data-cluster-gallery]').forEach(chip => {
    chip.addEventListener('click', () => {
      showClusterValueGalleryPopup(field, chip.dataset.clusterGallery);
    });
  });

  popup.overlay.querySelectorAll('[data-cluster-apply]').forEach(btn => {
    btn.addEventListener('click', () => {
      const clusterIndex = parseInt(btn.dataset.clusterApply, 10);
      const cluster = clusters[clusterIndex];
      const input = popup.overlay.querySelector(`#cluster-popup-input-${clusterIndex}`);
      const mergeValue = input ? input.value.trim() : cluster.bestValue;
      const count = cluster.variants.reduce((sum, variant) => sum + variant.count, 0);
      showApplyCancelPopup(
        'Apply Cluster Merge?',
        `Merge <strong>${count}</strong> specimen value${count !== 1 ? 's' : ''} in <strong>${escapeHtml(field)}</strong>${popupFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(popupFilter || '(empty)')}</strong>` : ''} to <strong>${escapeHtml(mergeValue)}</strong>?`,
        () => {
          mergeCluster(cluster, mergeValue, field);
          popup.close();
          showClusterReviewPopup(field);
        },
        'Apply'
      );
    });
  });
}

function showClusterValueGalleryPopup(field, value) {
  if (!field) return;
  const matchingRows = getAllValuesForField(field).filter(item => item.value === value);
  if (matchingRows.length === 1) {
    const row = matchingRows[0];
    window.api.getImage(APP.folderPath, row.filename, tableImageType, 'full').then(fullUrl => {
      if (fullUrl) openImageModal(fullUrl);
    });
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="cluster-gallery-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <span>${escapeHtml(field)} · ${escapeHtml(value || '(empty)')}</span>
        ${popupCloseBtnHtml('cluster-gallery-close')}
      </div>
      <div class="cluster-gallery-toggle" id="cluster-gallery-toggle"></div>
      <div class="cluster-gallery-grid" id="cluster-gallery-grid">
        <div class="focus-review-empty">Loading thumbnails...</div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  document.getElementById('cluster-gallery-close')?.addEventListener('click', close);

  let imageType = tableImageType;

  const renderGrid = async () => {
    const grid = overlay.querySelector('#cluster-gallery-grid');
    if (!grid) return;
    if (matchingRows.length === 0) {
      grid.innerHTML = '<div class="focus-review-empty">No specimens use this exact value.</div>';
      return;
    }

    grid.innerHTML = matchingRows.map(row => `
      <button class="cluster-gallery-thumb" data-file="${escapeAttr(row.filename)}" type="button">
        <div class="table-image-placeholder">${escapeHtml(getDisplayFilename(row.filename, 14))}</div>
      </button>
    `).join('');

    await Promise.all(matchingRows.map(async row => {
      const btn = grid.querySelector(`.cluster-gallery-thumb[data-file="${CSS.escape(row.filename)}"]`);
      if (!btn) return;
      const thumbUrl = await window.api.getImage(APP.folderPath, row.filename, imageType, 'thumb');
      if (!btn.isConnected) return;
      if (thumbUrl) {
        btn.innerHTML = `<img src="${thumbUrl}" alt="${escapeAttr(getDisplayFilename(row.filename))}"><span class="cluster-gallery-caption">${escapeHtml(getDisplayFilename(row.filename, 16))}</span>`;
      } else {
        btn.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div><span class="cluster-gallery-caption">${escapeHtml(getDisplayFilename(row.filename, 16))}</span>`;
      }
      btn.addEventListener('click', async () => {
        const fullUrl = await window.api.getImage(APP.folderPath, row.filename, imageType, 'full');
        if (fullUrl) openImageModal(fullUrl);
      });
    }));
  };

  const switchControl = createSlideSwitch('cluster-gallery-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    renderGrid();
  });
  const switchContainer = overlay.querySelector('#cluster-gallery-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = switchControl.html;
    switchControl.setup();
  }

  renderGrid();
}

function showDateFormatsReviewPopup(selectedField = '') {
  const field = selectedField;
  const dateFields = getAvailableProjectFields().filter(item => /date/i.test(item));
  const fieldValues = field ? getAllValuesForField(field) : [];
  const analysis = field ? analyzeDateFormats(fieldValues) : { formats: [], dominantFormat: 'none' };
  const allItems = analysis.formats.flatMap(format => format.items);
  let activeIndex = allItems[0]?.index ?? -1;
  let imageType = tableImageType;
  const refreshPopup = () => {
    popup.close();
    showDateFormatsReviewPopup(field);
  };
  const popup = createFocusToolPopup({
    title: 'Date Format Review',
    popupClass: 'focus-review-popup date-review-popup',
    bodyClass: 'date-review-layout',
    bodyHtml: `
      <div class="date-review-groups" id="date-format-review-list"></div>
      <div class="date-review-preview-pane">
        <div class="cluster-gallery-toggle" id="date-format-review-toggle"></div>
        <div class="focus-image-reference-meta">
          <div class="focus-image-reference-field">${escapeHtml(field || '')}</div>
          <div class="focus-image-reference-value" id="date-format-review-value"><span class="cell-empty-placeholder">${field ? 'Select a specimen' : 'Select a field'}</span></div>
        </div>
        <div class="wfo-reference-images" id="date-format-review-image"><div class="table-image-placeholder">${field ? 'Select a specimen' : 'Select a field'}</div></div>
      </div>
    `,
    headerRightHtml: getPopupFieldSelectorHtml('date-format-review-field', field, {
      includeEmpty: true,
      emptyLabel: 'Select field...',
      fields: dateFields,
    }),
    intro: field
      ? `Review the detected date-format bins for <strong>${escapeHtml(field)}</strong> and stage whole bins as <strong>Unconfirmed</strong> when they need manual review.`
      : 'Choose a field to review its detected date-format bins.',
    summaryHtml: field
      ? `${analysis.formats.length} format${analysis.formats.length !== 1 ? 's' : ''} detected. Dominant format: <strong>${escapeHtml(analysis.dominantFormat || 'none')}</strong>.`
      : 'No field selected yet.',
  });

  popup.overlay.querySelector('#date-format-review-field')?.addEventListener('change', (e) => {
    popup.close();
    showDateFormatsReviewPopup(e.target.value);
  });

  const getItemValueClass = (item, isWarning = false) => (
    item.cellState === 'unaccepted'
      ? 'focus-popup-row-value-pending'
      : (isWarning ? 'focus-popup-row-value-warning' : '')
  );

  const renderEditableDateValue = (item, isWarning = false) => {
    const displayValue = item.value === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(item.value));
    return `
      <button class="catalog-pattern-editable ${getItemValueClass(item, isWarning)}" type="button" data-date-edit="${escapeAttr(item.filename)}" title="Click to edit this value">
        ${displayValue}
      </button>
    `;
  };

  const renderGroups = () => {
    const listEl = popup.overlay.querySelector('#date-format-review-list');
    if (!listEl) return;
    listEl.innerHTML = !field
      ? '<div class="focus-review-empty">Select a field to review date formats.</div>'
      : analysis.formats.length === 0
      ? '<div class="focus-review-empty">No date patterns detected.</div>'
      : analysis.formats.map((format, formatIndex) => {
      const isDominant = format.pattern === analysis.dominantFormat;
      const rowsHtml = format.items.map(item => renderFocusPopupSpecimenRow(item, {
        valueHtml: renderEditableDateValue(item, !isDominant),
        includeFlagButton: true,
        flagTool: 'dates',
        includePhotoButton: true,
        photoFieldLabel: field,
        photoFieldValue: item.value,
        statusField: field,
        rowClass: `date-review-row ${item.index === activeIndex ? 'active' : ''}`,
        rowAttrs: `data-date-review-index="${item.index}"`,
      })).join('');
      return renderFocusReviewGroup({
        title: escapeHtml(format.pattern),
        meta: [
          `${format.count} specimen${format.count !== 1 ? 's' : ''}`,
          isDominant ? 'dominant' : 'minority'
        ],
        actionsHtml: `
          <button class="btn-sm btn-primary" data-date-bin-confirm="${formatIndex}">Confirm</button>
        `,
        bodyHtml: rowsHtml
      });
    }).join('');

    listEl.querySelectorAll('[data-date-review-index]').forEach(rowEl => {
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-date-edit], textarea')) return;
        activeIndex = parseInt(rowEl.dataset.dateReviewIndex, 10);
        renderGroups();
        loadPreview();
      });
    });
    listEl.querySelectorAll('[data-date-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.querySelector('textarea')) return;
        const item = allItems.find(entry => entry.filename === btn.dataset.dateEdit);
        if (!item) return;
        const spec = APP.specimens[item.index];
        if (!spec) return;
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        const currentSpecState = APP.state.specimens[spec.filename];
        const initialSnapshot = snapshotFieldState(currentSpecState, field);
        const currentValue = item.value;

        btn.classList.add('is-editing');
        btn.innerHTML = `<textarea class="catalog-pattern-editor">${escapeHtml(String(currentValue))}</textarea>`;
        const input = btn.querySelector('textarea');
        if (!input) return;
        input.focus();
        input.select();
        input.style.height = input.scrollHeight + 'px';

        const save = () => {
          const nextValue = input.value;
          const changedFromInitial = nextValue !== currentValue;
          let rwBefore = null;
          if (changedFromInitial) rwBefore = rewindCapture([spec.filename], [field]);

          if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, field, nextValue);
          else restoreFieldState(currentSpecState, field, initialSnapshot);
          currentSpecState.last_touched = new Date().toISOString();
          markSpecimenDirty(spec.filename);

          if (changedFromInitial && rwBefore) {
            rewindRecord('dateFormatEdit', 'Date Format Review', `"${field}" on ${getDisplayFilename(spec.filename)}`, rwBefore);
          }
          scheduleSaveState(spec.filename);
          renderFocusSidebar(getFocusCategories());
          renderFocusMain();
          refreshPopup();
        };

        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';
        });
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' && !evt.shiftKey) {
            evt.preventDefault();
            input.removeEventListener('blur', save);
            save();
          } else if (evt.key === 'Escape') {
            evt.preventDefault();
            btn.classList.remove('is-editing');
            btn.innerHTML = currentValue === ''
              ? '<span class="cell-empty-placeholder">(empty)</span>'
              : escapeHtml(String(currentValue));
          }
        });
      });
    });
    listEl.querySelectorAll('[data-date-bin-confirm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = analysis.formats[parseInt(btn.dataset.dateBinConfirm, 10)];
        showApplyCancelPopup(
          'Confirm Date Format Bin?',
          `Stage <strong>${format.count}</strong> specimen${format.count !== 1 ? 's' : ''} in the <strong>${escapeHtml(format.pattern)}</strong> bin for <strong>${escapeHtml(field)}</strong> as <strong>Unconfirmed</strong>?`,
          () => {
            bulkBinMarkUnconfirmed(format.items, field);
            renderFocusSidebar(getFocusCategories());
            renderFocusMain();
            refreshPopup();
          },
          'Apply'
        );
      });
    });
    wirePopupQuickTools(listEl, { closeFn: popup.close, onFlagRefresh: renderGroups });
  };

  const loadPreview = async () => {
    const valueEl = popup.overlay.querySelector('#date-format-review-value');
    const imageEl = popup.overlay.querySelector('#date-format-review-image');
    const activeItem = allItems.find(item => item.index === activeIndex) || allItems[0];
    if (!valueEl || !imageEl) return;
    if (!field || !activeItem) {
      valueEl.innerHTML = '<span class="cell-empty-placeholder">Select a specimen</span>';
      imageEl.innerHTML = '<div class="table-image-placeholder">Select a specimen</div>';
      return;
    }
    valueEl.innerHTML = activeItem.value === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(activeItem.value));
    imageEl.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, activeItem.filename, imageType, 'full');
    if (!imageEl.isConnected) return;
    if (dataUrl) {
      imageEl.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(activeItem.filename))}">`;
      imageEl.querySelector('img')?.addEventListener('click', () => openImageModal(dataUrl));
    } else {
      imageEl.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
    }
  };

  const switchControl = createSlideSwitch('date-format-review-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadPreview();
  });
  const switchContainer = popup.overlay.querySelector('#date-format-review-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = switchControl.html;
    switchControl.setup();
  }

  renderGroups();
  loadPreview();

}

function showDateViolationsReviewPopup(selectedField = '') {
  const field = selectedField;
  const dateFields = getAvailableProjectFields().filter(item => /date/i.test(item));
  const fieldValues = field ? getAllValuesForField(field) : [];
  const { violations, totalViolations } = field
    ? analyzeDateViolations(fieldValues)
    : { violations: { swapped: [], tooOld: [], future: [] }, totalViolations: 0 };
  const allItems = [...violations.swapped, ...violations.tooOld, ...violations.future];
  let activeIndex = allItems[0]?.index ?? -1;
  let imageType = tableImageType;
  const refreshPopup = () => {
    popup.close();
    showDateViolationsReviewPopup(field);
  };
  const groups = [
    { title: 'Swapped Month/Day', items: violations.swapped, detail: 'month position > 12' },
    { title: 'Year < 1400', items: violations.tooOld, detail: 'very old year' },
    { title: `Year > ${_dateViolationCurrentYear}`, items: violations.future, detail: 'future year' },
  ].filter(group => group.items.length > 0);

  const popup = createFocusToolPopup({
    title: 'Date Violation Review',
    popupClass: 'focus-review-popup date-review-popup',
    bodyClass: 'date-review-layout',
    bodyHtml: `
      <div class="date-review-groups" id="date-violation-review-list"></div>
      <div class="date-review-preview-pane">
        <div class="cluster-gallery-toggle" id="date-violation-review-toggle"></div>
        <div class="focus-image-reference-meta">
          <div class="focus-image-reference-field">${escapeHtml(field || '')}</div>
          <div class="focus-image-reference-value" id="date-violation-review-value"><span class="cell-empty-placeholder">${field ? 'Select a specimen' : 'Select a field'}</span></div>
        </div>
        <div class="wfo-reference-images" id="date-violation-review-image"><div class="table-image-placeholder">${field ? 'Select a specimen' : 'Select a field'}</div></div>
      </div>
    `,
    headerRightHtml: getPopupFieldSelectorHtml('date-violation-review-field', field, {
      includeEmpty: true,
      emptyLabel: 'Select field...',
      fields: dateFields,
    }),
    intro: field
      ? `Review suspicious date values in <strong>${escapeHtml(field)}</strong> and stage affected bins as <strong>Unconfirmed</strong>.`
      : 'Choose a field to review suspicious date values.',
    summaryHtml: field
      ? `${totalViolations} suspicious value${totalViolations !== 1 ? 's' : ''} detected across ${groups.length} violation group${groups.length !== 1 ? 's' : ''}.`
      : 'No field selected yet.',
  });

  popup.overlay.querySelector('#date-violation-review-field')?.addEventListener('change', (e) => {
    popup.close();
    showDateViolationsReviewPopup(e.target.value);
  });

  const getItemValueClass = (item) => (
    item.cellState === 'unaccepted'
      ? 'focus-popup-row-value-pending'
      : 'focus-popup-row-value-warning'
  );

  const renderEditableDateValue = (item) => {
    const displayValue = item.value === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(item.value));
    return `
      <button class="catalog-pattern-editable ${getItemValueClass(item)}" type="button" data-date-edit="${escapeAttr(item.filename)}" title="Click to edit this value">
        ${displayValue}
      </button>
    `;
  };

  const renderGroups = () => {
    const listEl = popup.overlay.querySelector('#date-violation-review-list');
    if (!listEl) return;
    listEl.innerHTML = !field
      ? '<div class="focus-review-empty">Select a field to review date violations.</div>'
      : groups.length === 0
      ? '<div class="focus-review-empty">No date violations were detected.</div>'
      : groups.map((group, groupIndex) => renderFocusReviewGroup({
      title: escapeHtml(group.title),
      meta: [`${group.items.length} specimen${group.items.length !== 1 ? 's' : ''}`],
      actionsHtml: `
        <button class="btn-sm btn-primary" data-date-violation-confirm="${groupIndex}">Confirm</button>
      `,
      bodyHtml: group.items.map(item => renderFocusPopupSpecimenRow(item, {
        valueHtml: renderEditableDateValue(item),
        includeFlagButton: true,
        flagTool: 'date-violations',
        includePhotoButton: true,
        photoFieldLabel: field,
        photoFieldValue: item.value,
        detail: escapeHtml(item.detail || group.detail),
        statusField: field,
        rowClass: `date-review-row ${item.index === activeIndex ? 'active' : ''}`,
        rowAttrs: `data-date-review-index="${item.index}"`,
      })).join('')
    })).join('');

    listEl.querySelectorAll('[data-date-review-index]').forEach(rowEl => {
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-date-edit], textarea')) return;
        activeIndex = parseInt(rowEl.dataset.dateReviewIndex, 10);
        renderGroups();
        loadPreview();
      });
    });
    listEl.querySelectorAll('[data-date-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.querySelector('textarea')) return;
        const item = allItems.find(entry => entry.filename === btn.dataset.dateEdit);
        if (!item) return;
        const spec = APP.specimens[item.index];
        if (!spec) return;
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        const currentSpecState = APP.state.specimens[spec.filename];
        const initialSnapshot = snapshotFieldState(currentSpecState, field);
        const currentValue = item.value;

        btn.classList.add('is-editing');
        btn.innerHTML = `<textarea class="catalog-pattern-editor">${escapeHtml(String(currentValue))}</textarea>`;
        const input = btn.querySelector('textarea');
        if (!input) return;
        input.focus();
        input.select();
        input.style.height = input.scrollHeight + 'px';

        const save = () => {
          const nextValue = input.value;
          const changedFromInitial = nextValue !== currentValue;
          let rwBefore = null;
          if (changedFromInitial) rwBefore = rewindCapture([spec.filename], [field]);

          if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, field, nextValue);
          else restoreFieldState(currentSpecState, field, initialSnapshot);
          currentSpecState.last_touched = new Date().toISOString();
          markSpecimenDirty(spec.filename);

          if (changedFromInitial && rwBefore) {
            rewindRecord('dateViolationEdit', 'Date Violation Review', `"${field}" on ${getDisplayFilename(spec.filename)}`, rwBefore);
          }
          scheduleSaveState(spec.filename);
          renderFocusSidebar(getFocusCategories());
          renderFocusMain();
          refreshPopup();
        };

        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';
        });
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter' && !evt.shiftKey) {
            evt.preventDefault();
            input.removeEventListener('blur', save);
            save();
          } else if (evt.key === 'Escape') {
            evt.preventDefault();
            btn.classList.remove('is-editing');
            btn.innerHTML = currentValue === ''
              ? '<span class="cell-empty-placeholder">(empty)</span>'
              : escapeHtml(String(currentValue));
          }
        });
      });
    });
    listEl.querySelectorAll('[data-date-violation-confirm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = groups[parseInt(btn.dataset.dateViolationConfirm, 10)];
        showApplyCancelPopup(
          'Confirm Date Violations?',
          `Stage <strong>${group.items.length}</strong> suspicious specimen${group.items.length !== 1 ? 's' : ''} in <strong>${escapeHtml(field)}</strong> as <strong>Unconfirmed</strong>?`,
          () => {
            bulkBinMarkUnconfirmed(group.items, field);
            renderFocusSidebar(getFocusCategories());
            renderFocusMain();
            refreshPopup();
          },
          'Apply'
        );
      });
    });
    wirePopupQuickTools(listEl, { closeFn: popup.close, onFlagRefresh: renderGroups });
  };

  const loadPreview = async () => {
    const valueEl = popup.overlay.querySelector('#date-violation-review-value');
    const imageEl = popup.overlay.querySelector('#date-violation-review-image');
    const activeItem = allItems.find(item => item.index === activeIndex) || allItems[0];
    if (!valueEl || !imageEl) return;
    if (!field || !activeItem) {
      valueEl.innerHTML = '<span class="cell-empty-placeholder">Select a specimen</span>';
      imageEl.innerHTML = '<div class="table-image-placeholder">Select a specimen</div>';
      return;
    }
    valueEl.innerHTML = activeItem.value === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(activeItem.value));
    imageEl.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, activeItem.filename, imageType, 'full');
    if (!imageEl.isConnected) return;
    if (dataUrl) {
      imageEl.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(activeItem.filename))}">`;
      imageEl.querySelector('img')?.addEventListener('click', () => openImageModal(dataUrl));
    } else {
      imageEl.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
    }
  };

  const switchControl = createSlideSwitch('date-violation-review-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadPreview();
  });
  const switchContainer = popup.overlay.querySelector('#date-violation-review-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = switchControl.html;
    switchControl.setup();
  }

  renderGroups();
  loadPreview();
}

function showCatalogPatternReviewPopup(selectedField = '') {
  const field = selectedField;
  const fieldValues = field ? getAllValuesForField(field) : [];
  const patterns = field ? analyzeCatalogPatterns(fieldValues) : { patterns: [], dominantPattern: '' };
  const sequence = field ? analyzeSequenceGaps(fieldValues) : { totalPatterns: 0, groups: [] };
  const draftValues = new Map();
  let patternsCollapsed = false;
  let gapsCollapsed = false;
  const refreshPopup = () => {
    popup.close();
    showCatalogPatternReviewPopup(field);
  };
  const popup = createFocusToolPopup({
    title: 'Catalog Pattern Review',
    popupClass: 'focus-review-popup focus-compact-review-popup',
    bodyClass: 'focus-review-body catalog-pattern-review-body',
    headerRightHtml: getPopupFieldSelectorHtml('catalog-pattern-review-field', field, { includeEmpty: true, emptyLabel: 'Select field...' }),
    intro: field
      ? `Review structural catalog-number patterns for <strong>${escapeHtml(field)}</strong>. Sequence gaps and duplicates are shown below automatically for the same field.`
      : 'Choose a field to review catalog-number patterns plus sequence gaps and duplicate values.',
    summaryHtml: field
      ? `${patterns.patterns.length} catalog pattern${patterns.patterns.length !== 1 ? 's' : ''} detected. Dominant pattern: <strong>${escapeHtml(patterns.dominantPattern || 'none')}</strong>.`
      : 'No field selected yet.',
  });

  popup.overlay.querySelector('#catalog-pattern-review-field')?.addEventListener('change', (e) => {
    popup.close();
    showCatalogPatternReviewPopup(e.target.value);
  });

  const patternActionButtons = (patternIndex) => `
    <button class="btn-icon" data-pattern-confirm="${patternIndex}" title="Mark this pattern bin as unconfirmed" style="font-size:var(--fs-14);color:var(--accent);padding:0 2px">&#10003;</button>
  `;

  const getDraftValue = (item) => draftValues.has(item.filename) ? draftValues.get(item.filename) : item.value;
  const renderEditablePatternValue = (item, isDominant) => {
    const draftValue = getDraftValue(item);
    const displayValue = draftValue === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(draftValue));
    return `
      <button class="catalog-pattern-editable ${isDominant ? '' : 'catalog-pattern-editable-warning'}" type="button" data-pattern-edit="${escapeAttr(item.filename)}" title="Click to edit this value">
        ${displayValue}
      </button>
    `;
  };

  const wirePatternEditors = () => {
    popup.overlay.querySelectorAll('[data-pattern-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.querySelector('textarea')) return;
        const filename = btn.dataset.patternEdit;
        const item = fieldValues.find(entry => entry.filename === filename);
        if (!item) return;
        const currentValue = getDraftValue(item);
        btn.classList.add('is-editing');
        btn.innerHTML = `<textarea class="catalog-pattern-editor">${escapeHtml(String(currentValue))}</textarea>`;
        const input = btn.querySelector('textarea');
        if (!input) return;
        input.focus();
        input.select();
        input.style.height = input.scrollHeight + 'px';

        const save = () => {
          const spec = APP.specimens[item.index];
          if (!spec) {
            refreshPopup();
            return;
          }

          if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
          const currentSpecState = APP.state.specimens[spec.filename];
          if (!currentSpecState) {
            refreshPopup();
            return;
          }

          const nextValue = input.value;
          const initialSnapshot = snapshotFieldState(currentSpecState, field);
          const changedFromInitial = nextValue !== item.value;
          let rwBefore = null;
          if (changedFromInitial) rwBefore = rewindCapture([spec.filename], [field]);

          if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, field, nextValue);
          else restoreFieldState(currentSpecState, field, initialSnapshot);
          currentSpecState.last_touched = new Date().toISOString();
          markSpecimenDirty(spec.filename);

          if (changedFromInitial && rwBefore) {
            rewindRecord('catalogPatternEdit', 'Catalog Pattern Review', `"${field}" on ${getDisplayFilename(spec.filename)}`, rwBefore);
          }
          scheduleSaveState(spec.filename);
          renderFocusSidebar(getFocusCategories());
          renderFocusMain();
          refreshPopup();
        };

        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';
        });
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            input.removeEventListener('blur', save);
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            btn.classList.remove('is-editing');
            btn.innerHTML = currentValue === ''
              ? '<span class="cell-empty-placeholder">(empty)</span>'
              : escapeHtml(String(currentValue));
          }
        });
      });
    });
  };

  const renderGapSectionContent = () => {
    if (!field) return '<div class="focus-review-empty">Select a field to analyze sequence structure.</div>';
    if (sequence.totalPatterns === 0) return '<div class="focus-review-empty">No numeric sequences were detected for this field.</div>';
    if (sequence.groups.length === 0) return '<div class="focus-review-empty">No gaps or duplicates were detected.</div>';

    return sequence.groups.map(group => `
      <div class="focus-review-group">
        <div class="focus-review-group-header">
          <div class="focus-review-group-title-wrap">
            <span class="focus-review-group-title">${escapeHtml(group.example)}</span>
            ${group.start !== null && group.end !== null ? `<span class="focus-review-group-meta">Range ${group.start}-${group.end}</span>` : ''}
            <span class="focus-review-group-meta">${group.uniqueCount} present</span>
            <span class="focus-review-group-meta">${group.missingCount} missing</span>
            <span class="focus-review-group-meta">${group.duplicateEntries} duplicate ${group.duplicateEntries === 1 ? 'entry' : 'entries'}</span>
          </div>
        </div>
        <div class="focus-review-group-body">
          ${group.missingCount > 0 ? group.missingValues.map(value => `
            <div class="focus-popup-specimen-row">
              <span class="focus-popup-row-file">missing</span>
              <span class="focus-popup-row-value focus-popup-row-value-warning">${escapeHtml(value)}</span>
            </div>
          `).join('') : '<div class="focus-review-empty" style="padding:14px 20px">No missing sequence numbers.</div>'}
          ${group.duplicateValues.length > 0 ? group.duplicateValues.map(item => `
            <div class="focus-popup-specimen-row">
              <span class="focus-popup-row-file">duplicate</span>
              <span class="focus-popup-row-value focus-popup-row-value-warning">${escapeHtml(item.value)} <span class="focus-review-group-meta">x${item.count}</span></span>
              <span class="focus-popup-row-detail">${escapeHtml(item.filenames.join(', '))}</span>
            </div>
          `).join('') : '<div class="focus-review-empty" style="padding:14px 20px">No duplicate values.</div>'}
          ${group.truncated ? `<div class="focus-review-empty" style="padding:10px 20px">Missing list truncated after ${group.missingValues.length} entries.</div>` : ''}
          ${group.duplicatesTruncated ? `<div class="focus-review-empty" style="padding:10px 20px">Duplicate list truncated after ${group.duplicateValues.length} values.</div>` : ''}
        </div>
      </div>
    `).join('');
  };

  const renderPanels = () => {
    popup.body.innerHTML = !field
      ? '<div class="focus-review-empty">Select a field to review catalog patterns.</div>'
      : `
        <div class="collapsible-panel catalog-inline-panel ${gapsCollapsed ? 'catalog-inline-panel-collapsed' : ''}">
          <div class="collapsible-header" data-catalog-panel="gaps">
            <span>Gaps & Duplicates</span>
            <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
              <span class="focus-review-group-meta">${sequence.totalPatterns} numeric sequence pattern${sequence.totalPatterns !== 1 ? 's' : ''}${sequence.groups.length > 0 ? `, ${sequence.groups.length} with issues` : ''}</span>
              <span class="collapse-arrow">${gapsCollapsed ? '&#9654;' : '&#9660;'}</span>
            </div>
          </div>
          <div class="collapsible-body ${gapsCollapsed ? 'collapsed' : ''}">
            ${renderGapSectionContent()}
          </div>
        </div>
        <div class="collapsible-panel catalog-inline-panel ${patternsCollapsed ? 'catalog-inline-panel-collapsed' : ''}">
          <div class="collapsible-header" data-catalog-panel="patterns">
            <span>Patterns</span>
            <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
              <span class="focus-review-group-meta">${patterns.patterns.length} pattern${patterns.patterns.length !== 1 ? 's' : ''}</span>
              <span class="collapse-arrow">${patternsCollapsed ? '&#9654;' : '&#9660;'}</span>
            </div>
          </div>
          <div class="collapsible-body ${patternsCollapsed ? 'collapsed' : ''}">
            ${patterns.patterns.length === 0
              ? '<div class="focus-review-empty">No catalog patterns detected.</div>'
              : patterns.patterns.map((pattern, patternIndex) => {
                  const isDominant = pattern.pattern === patterns.dominantPattern;
                  return renderFocusReviewGroup({
                    title: escapeHtml(pattern.pattern),
                    meta: [
                      `${pattern.count} specimen${pattern.count !== 1 ? 's' : ''}`,
                      `example: ${escapeHtml(pattern.example)}`,
                      isDominant ? 'dominant' : 'outlier'
                    ],
                    actionsHtml: patternActionButtons(patternIndex),
                    bodyHtml: pattern.items.map(item => renderFocusPopupSpecimenRow(item, {
                      valueHtml: renderEditablePatternValue(item, isDominant),
                      includeFlagButton: true,
                      flagTool: 'patterns',
                      includePhotoButton: true,
                      photoFieldLabel: field,
                      photoFieldValue: getDraftValue(item),
                      statusField: field,
                    })).join('')
                  });
                }).join('')}
          </div>
        </div>
      `;

    wirePatternEditors();
    wirePopupQuickTools(popup.body, { closeFn: popup.close, onFlagRefresh: renderPanels });

    popup.body.querySelectorAll('[data-catalog-panel="patterns"]').forEach(header => {
      header.addEventListener('click', () => {
        patternsCollapsed = !patternsCollapsed;
        renderPanels();
      });
    });
    popup.body.querySelectorAll('[data-catalog-panel="gaps"]').forEach(header => {
      header.addEventListener('click', () => {
        gapsCollapsed = !gapsCollapsed;
        renderPanels();
      });
    });

    popup.body.querySelectorAll('[data-pattern-confirm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pattern = patterns.patterns[parseInt(btn.dataset.patternConfirm, 10)];
        const changedCount = pattern.items.filter(item => getDraftValue(item) !== item.value).length;
        showApplyCancelPopup(
          'Mark Catalog Pattern Bin as Unconfirmed?',
          `Stage <strong>${pattern.count}</strong> specimen${pattern.count !== 1 ? 's' : ''} in the <strong>${escapeHtml(pattern.pattern)}</strong> pattern bin as <strong>Unconfirmed</strong> for <strong>${escapeHtml(field)}</strong>? This includes <strong>${changedCount}</strong> edited value${changedCount !== 1 ? 's' : ''}.`,
          () => {
            const affectedFilenames = pattern.items.map(item => item.filename);
            const _rwBefore = rewindCapture(affectedFilenames, [field]);
            for (const item of pattern.items) {
              const spec = APP.specimens[item.index];
              if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
              const st = APP.state.specimens[spec.filename];
              stageFieldAsUnconfirmed(st, field, getDraftValue(item));
              st.last_touched = new Date().toISOString();
              autoConfirmCategories(spec.filename);
            }
            rewindRecord('catalogPatternReview', 'Catalog Pattern Review', `${pattern.count} specimen${pattern.count !== 1 ? 's' : ''} staged in "${field}"`, _rwBefore);
            scheduleSaveState(affectedFilenames);
            renderFocusSidebar(getFocusCategories());
            renderFocusMain();
            refreshPopup();
          },
          'Apply'
        );
      });
    });
  };

  renderPanels();
}

function getOcrMismatchInfo(text, ocrLookup) {
  if (!text || !ocrLookup?.textLower) return { html: escapeHtml(text || ''), count: 0 };
  let mismatchCount = 0;
  const html = text.split(/(\s+)/).map(part => {
    if (/^\s+$/.test(part)) return part;
    if (part === '') return '';
    const stripped = part.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    if (stripped === '') return escapeHtml(part);
    if (ocrLookup.wordSet.has(stripped) || ocrLookup.textLower.includes(stripped)) {
      return escapeHtml(part);
    }
    mismatchCount++;
    return `<span class="ocr-mismatch">${escapeHtml(part)}</span>`;
  }).join('');
  return { html, count: mismatchCount };
}

function getOcrWarningIconSvg() {
  return '<img src="icons/triangle-alert.svg" alt="" aria-hidden="true">';
}

function getOcrDisagreementCountsByField(fields = getAvailableProjectFields()) {
  const counts = {};
  for (const field of fields) {
    const popupFilter = getPopupScopedFilter(field);
    const scopedValues = getFocusScopedFieldValues(getAllValuesForField(field), popupFilter !== null);
    let mismatchCount = 0;
    for (const item of scopedValues) {
      const ocrLookup = getOcrLookupForSpecimen(item.index);
      const currentValue = getCurrentFieldValue(APP.specimens[item.index], field);
      mismatchCount += getOcrMismatchInfo(currentValue, ocrLookup).count > 0 ? 1 : 0;
    }
    counts[field] = mismatchCount;
  }
  return counts;
}

function getOcrPopupFieldSelectorHtml(controlId, selectedField, fields, mismatchCounts) {
  const selectedHasWarnings = !!(selectedField && mismatchCounts[selectedField] > 0);
  return `
    <div class="focus-popup-header-controls">
      <button class="btn-sm" type="button" data-field-nav="prev" title="Previous field">&#8592;</button>
      <button class="btn-sm" type="button" data-field-nav="next" title="Next field">&#8594;</button>
      <label class="focus-popup-field-label ocr-popup-field-label">
        <span>Field</span>
        ${selectedHasWarnings ? `<span class="ocr-popup-field-warning" title="This field contains OCR disagreements">${getOcrWarningIconSvg()}</span>` : ''}
        <select id="${controlId}" class="focus-popup-field-select">
          <option value="">Select field...</option>
          ${fields.map(itemField => {
            const hasWarnings = (mismatchCounts[itemField] || 0) > 0;
            const label = `${hasWarnings ? '⚠ ' : ''}${itemField}`;
            return `<option value="${escapeAttr(itemField)}" ${itemField === selectedField ? 'selected' : ''}>${escapeHtml(label)}</option>`;
          }).join('')}
        </select>
      </label>
    </div>
  `;
}

function showOcrComparisonPopup(selectedField = '', options = {}) {
  const field = selectedField;
  const fields = getAvailableProjectFields();
  const mismatchCountsByField = getOcrDisagreementCountsByField(fields);
  const popupFilter = getPopupScopedFilter(field);
  const scopedValues = field ? getFocusScopedFieldValues(getAllValuesForField(field), popupFilter !== null) : [];
  const rows = field ? scopedValues.map(item => {
    const ocrLookup = getOcrLookupForSpecimen(item.index);
    const currentValue = getCurrentFieldValue(APP.specimens[item.index], field);
    const mismatchInfo = getOcrMismatchInfo(currentValue, ocrLookup);
    return {
      index: item.index,
      filename: item.filename,
      currentValue,
      mismatchCount: mismatchInfo.count,
      mismatchHtml: mismatchInfo.html,
    };
  }) : [];

  const mismatchRows = rows.filter(row => row.mismatchCount > 0);
  const noMismatchRows = rows.filter(row => row.mismatchCount === 0);
  let activeIndex = options.activeIndex ?? -1;
  let imageType = options.imageType || tableImageType;
  let showNoMismatchRows = !!options.showNoMismatchRows;

  const popup = createFocusToolPopup({
    title: 'OCR Comparison',
    headerRightHtml: getOcrPopupFieldSelectorHtml('ocr-review-field', field, fields, mismatchCountsByField),
    intro: field
      ? `Review <strong>${escapeHtml(field)}</strong> against OCR text in a dedicated workspace. Purple highlights mark tokens that do not appear in the OCR output. Click a reviewed value to edit it as <strong>Unconfirmed</strong>, and use the specimen flag control for follow-up.`
      : 'Choose a field to review OCR disagreements. Purple highlights will mark tokens that do not appear in the OCR output.',
    summaryHtml: field
      ? `${rows.length} specimen${rows.length !== 1 ? 's' : ''}${popupFilter !== null ? ` in the current filtered selection <strong>${escapeHtml(popupFilter || '(empty)')}</strong>` : ''}. ${mismatchRows.length} row${mismatchRows.length !== 1 ? 's' : ''} contain OCR disagreements.`
      : 'No field selected yet.',
    popupClass: 'focus-review-popup ocr-review-popup',
    bodyClass: 'ocr-review-layout',
    bodyHtml: `
      <div class="ocr-review-left">
        <div class="focus-review-toolbar">
          <span class="focus-review-toolbar-note" id="ocr-review-count"></span>
        </div>
        <div class="ocr-review-list" id="ocr-review-list"></div>
      </div>
      <div class="ocr-review-right">
        <div class="ocr-review-toggle" id="ocr-review-toggle"></div>
        <div class="ocr-review-image" id="ocr-review-image"><div class="table-image-placeholder">${field ? 'Loading...' : 'Select a field'}</div></div>
        <div class="ocr-review-ocr">
          <div class="focus-review-toolbar"><span class="focus-review-toolbar-note" id="ocr-review-ocr-title">OCR text</span></div>
          <div class="scrollable-content ocr-text" id="ocr-review-ocr-text"></div>
        </div>
      </div>
    `,
    footerHtml: `
      <button class="btn-sm" id="ocr-review-close">Close</button>
    `
  });

  const refreshPopup = (nextField = field, nextOptions = {}) => {
    popup.close();
    showOcrComparisonPopup(nextField, {
      activeIndex,
      showNoMismatchRows,
      imageType,
      ...nextOptions,
    });
  };

  popup.overlay.querySelector('#ocr-review-field')?.addEventListener('change', (e) => {
    refreshPopup(e.target.value, { activeIndex: -1 });
  });
  popup.overlay.querySelectorAll('[data-field-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextField = getAdjacentFieldName(field || fields[0] || '', btn.dataset.fieldNav, fields);
      refreshPopup(nextField, { activeIndex: -1 });
    });
  });

  if (!field) {
    popup.overlay.querySelector('#ocr-review-count').textContent = 'Choose a field to begin OCR review.';
    popup.overlay.querySelector('#ocr-review-ocr-text').textContent = 'Select a field to view OCR text.';
    popup.overlay.querySelector('#ocr-review-close')?.addEventListener('click', popup.close);
    return;
  }

  if (activeIndex < 0 || !rows.some(row => row.index === activeIndex)) {
    activeIndex = (mismatchRows[0] || rows[0])?.index ?? -1;
  }
  let lastLoadedImageUrl = '';

  const updateCount = () => {
    const flaggedRows = rows.filter(row => !!APP.state.specimens[row.filename]?.flagged);
    const countEl = popup.overlay.querySelector('#ocr-review-count');
    if (countEl) {
      countEl.textContent = `${flaggedRows.length} flagged specimen${flaggedRows.length !== 1 ? 's' : ''} · ${mismatchRows.length} mismatch row${mismatchRows.length !== 1 ? 's' : ''} visible`;
    }
  };

  const startOcrPopupValueEdit = (valueEl, row) => {
    if (valueEl.querySelector('textarea')) return;
    const spec = APP.specimens[row.index];
    if (!spec) return;
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const currentValue = getCurrentFieldValue(spec, field);
    const initialSnapshot = snapshotFieldState(APP.state.specimens[spec.filename], field);
    let _rwEntry = null;

    valueEl.innerHTML = `<textarea class="cell-edit-input ocr-review-editor">${escapeHtml(currentValue)}</textarea>`;
    const input = valueEl.querySelector('textarea');
    if (!input) return;
    input.focus();
    input.select();
    input.style.height = input.scrollHeight + 'px';

    const commitPendingRw = () => {
      if (_rwEntry && _rwEntry.before) {
        commitPendingRewindInput(_rwEntry);
        _rwEntry = null;
      }
    };

    const save = (force) => {
      const newValue = input.value;
      if (force || newValue !== currentValue) {
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        stageFieldAsUnconfirmed(APP.state.specimens[spec.filename], field, newValue);
        APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
        scheduleSaveState(spec.filename);
      } else {
        restoreFieldState(APP.state.specimens[spec.filename], field, initialSnapshot);
        markSpecimenDirty(spec.filename);
        scheduleSaveState(spec.filename);
      }
      renderFocusSidebar(getFocusCategories());
      renderFocusMain();
      refreshPopup(field, { activeIndex: row.index });
    };

    const cancel = () => {
      restoreFieldState(APP.state.specimens[spec.filename], field, initialSnapshot);
      markSpecimenDirty(spec.filename);
      scheduleSaveState(spec.filename);
      refreshPopup(field, { activeIndex: row.index });
    };

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
      const value = input.value;
      const changedFromInitial = value !== currentValue;
      if (changedFromInitial && (!_rwEntry || !_rwEntry.before)) {
        _rwEntry = registerPendingRewindInput(spec.filename, field, rewindCapture([spec.filename], [field]));
      }

      const currentSpecState = APP.state.specimens[spec.filename];
      if (!currentSpecState) return;

      if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, field, value);
      else restoreFieldState(currentSpecState, field, initialSnapshot);
      currentSpecState.last_touched = new Date().toISOString();
      markSpecimenDirty(spec.filename);

      if (changedFromInitial) {
        if (_rwEntry.timeout) clearTimeout(_rwEntry.timeout);
        _rwEntry.timeout = setTimeout(() => {
          commitPendingRewindInput(_rwEntry);
          _rwEntry = null;
        }, 1000);
      }
    });

    const onBlur = () => {
      commitPendingRw();
      save(false);
    };
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        input.removeEventListener('blur', onBlur);
        commitPendingRw();
        save(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.removeEventListener('blur', onBlur);
        commitPendingRw();
        cancel();
      }
    });
  };

  const renderRow = (row, options = {}) => `
    <div class="ocr-review-row ${row.index === activeIndex ? 'active' : ''} ${options.noMismatch ? 'no-mismatch' : ''}" data-index="${row.index}">
      ${renderPopupQuickTools(row, {
        tool: 'ocr',
        photoFieldLabel: field || '',
        photoFieldValue: row.currentValue ?? '',
        statusField: field,
      })}
      <span class="ocr-review-row-file" title="${escapeAttr(getDisplayFilename(row.filename))}">${escapeHtml(getDisplayFilename(row.filename, 24))}</span>
      <span class="ocr-review-row-badge ${row.mismatchCount > 0 ? 'has-mismatch' : ''}">${row.mismatchCount} mismatch${row.mismatchCount !== 1 ? 'es' : ''}</span>
      <div class="ocr-review-value ocr-review-editable ${row.mismatchCount > 0 ? 'has-mismatch' : ''}" data-file="${escapeAttr(row.filename)}" title="Click to edit this reviewed value">${row.mismatchCount > 0 ? row.mismatchHtml : escapeHtml(row.currentValue || '') || '<span class="cell-empty-placeholder">(empty)</span>'}</div>
    </div>
  `;

  const loadActivePreview = async () => {
    const activeRow = rows.find(row => row.index === activeIndex) || rows[0];
    if (!activeRow) return;
    const imageEl = popup.overlay.querySelector('#ocr-review-image');
    const ocrEl = popup.overlay.querySelector('#ocr-review-ocr-text');
    const titleEl = popup.overlay.querySelector('#ocr-review-ocr-title');
    if (titleEl) titleEl.textContent = `OCR text · ${getDisplayFilename(activeRow.filename)}`;
    if (ocrEl) {
      const cached = tableDataCache[activeRow.filename];
      ocrEl.textContent = cached?.ocr || '(No OCR text available for this specimen)';
    }
    if (imageEl) {
      imageEl.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
      const dataUrl = await window.api.getImage(APP.folderPath, activeRow.filename, imageType, 'full');
      if (!imageEl.isConnected) return;
      lastLoadedImageUrl = dataUrl || '';
      if (dataUrl) {
        imageEl.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(activeRow.filename))}">`;
        imageEl.querySelector('img')?.addEventListener('click', () => {
          if (lastLoadedImageUrl) openImageModal(lastLoadedImageUrl);
        });
      } else {
        imageEl.innerHTML = '<div class="table-image-placeholder">No image</div>';
      }
    }
  };

  const renderList = () => {
    const list = popup.overlay.querySelector('#ocr-review-list');
    if (!list) return;
    list.innerHTML = `
      ${mismatchRows.map(row => renderRow(row)).join('') || '<div class="focus-review-empty">No OCR disagreements were detected for this field.</div>'}
      ${noMismatchRows.length > 0 ? `
        <button class="wfo-nochange-toggle" id="ocr-nochange-toggle" type="button">
          <span>${showNoMismatchRows ? '&#9660;' : '&#9654;'} ${noMismatchRows.length} row${noMismatchRows.length !== 1 ? 's' : ''} with no OCR disagreement</span>
          <span class="wfo-nochange-subtitle">hidden for now</span>
        </button>
        <div class="wfo-nochange-list" id="ocr-nochange-list" style="display:${showNoMismatchRows ? '' : 'none'}">
          ${noMismatchRows.map(row => renderRow(row, { noMismatch: true })).join('')}
        </div>
      ` : ''}
    `;

    list.querySelectorAll('.ocr-review-row').forEach(rowEl => {
      rowEl.addEventListener('click', (e) => {
        if (e.target.closest('.popup-quicktools, .ocr-review-flag, .ocr-review-editable, textarea')) return;
        activeIndex = parseInt(rowEl.dataset.index, 10);
        renderList();
        loadActivePreview();
      });
    });
    list.querySelectorAll('.ocr-review-editable').forEach(valueEl => {
      valueEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = rows.find(item => item.filename === valueEl.dataset.file);
        if (!row) return;
        activeIndex = row.index;
        startOcrPopupValueEdit(valueEl, row);
      });
    });
    list.querySelector('#ocr-nochange-toggle')?.addEventListener('click', () => {
      showNoMismatchRows = !showNoMismatchRows;
      renderList();
    });
    wirePopupQuickTools(list, { closeFn: popup.close, onFlagRefresh: renderList });
    updateCount();
  };

  const switchControl = createSlideSwitch('ocr-review-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadActivePreview();
  });
  const switchContainer = popup.overlay.querySelector('#ocr-review-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = switchControl.html;
    switchControl.setup();
  }

  popup.overlay.querySelector('#ocr-review-close')?.addEventListener('click', popup.close);
  popup.overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (e.target.closest('textarea, input:not(select), [contenteditable="true"]')) return;
    e.preventDefault();
    const nextField = getAdjacentFieldName(field || fields[0] || '', e.key === 'ArrowUp' ? 'prev' : 'next', fields);
    refreshPopup(nextField, { activeIndex: -1 });
  });

  renderList();
  loadActivePreview();
}

function showElevationDiscrepancyPopup(selectedField = '') {
  const field = selectedField;
  const elevationFields = getElevationReviewFields();
  const analysis = field
    ? analyzeElevationDiscrepancy(field)
    : { items: [], groups: [], numericCount: 0, comparedCount: 0, flaggedCount: 0, hasAnyCop90: false };
  const items = analysis.items;
  const groups = analysis.groups;
  let activeIndex = items[0]?.index ?? -1;
  let imageType = tableImageType;
  const refreshPopup = () => {
    popup.close();
    showElevationDiscrepancyPopup(field);
  };
  const popup = createFocusToolPopup({
    title: 'Elevation Review',
    popupClass: 'focus-review-popup date-review-popup focus-elevation-popup',
    bodyClass: 'date-review-layout',
    bodyHtml: `
      <div class="date-review-groups" id="elevation-review-list"></div>
      <div class="date-review-preview-pane">
        <div class="focus-image-reference-meta">
          <div class="focus-image-reference-field">${escapeHtml(field || '')}</div>
          <div class="focus-image-reference-value" id="elevation-review-value"><span class="cell-empty-placeholder">${field ? 'Select a specimen' : 'Select a field'}</span></div>
          <div class="focus-review-group-meta" id="elevation-review-detail">${field ? 'Select a specimen' : 'Select a field'}</div>
        </div>
        <div class="elev-review-panel">
          <div class="elev-review-row elev-review-row-converter">
            <span class="elev-review-row-label">Converter</span>
            <div class="elev-review-pair">
              <div class="elev-review-cell">
                <span class="elev-review-unit">m</span>
                <div class="elev-calc-input" contenteditable="true" id="popup-elev-meters" inputmode="decimal"></div>
              </div>
              <span class="elev-review-eq">=</span>
              <div class="elev-review-cell">
                <span class="elev-review-unit">ft</span>
                <div class="elev-calc-input" contenteditable="true" id="popup-elev-feet" inputmode="decimal"></div>
              </div>
            </div>
          </div>
          <div class="elev-review-row elev-review-row-cop90">
            <span class="elev-review-row-label">COP90 reference</span>
            <div class="elev-review-pair">
              <div class="elev-review-cell elev-review-cell-readonly">
                <span class="elev-review-unit">m</span>
                <span class="elev-review-value" id="popup-elev-cop90-m">—</span>
              </div>
              <span class="elev-review-eq">=</span>
              <div class="elev-review-cell elev-review-cell-readonly">
                <span class="elev-review-unit">ft</span>
                <span class="elev-review-value" id="popup-elev-cop90-ft">—</span>
              </div>
            </div>
          </div>
        </div>
        <div class="cluster-gallery-toggle" id="elevation-review-toggle"></div>
        <div class="wfo-reference-images" id="elevation-review-image"><div class="table-image-placeholder">${field ? 'Select a specimen' : 'Select a field'}</div></div>
      </div>
    `,
    headerRightHtml: getPopupFieldSelectorHtml('elevation-review-field', field, {
      includeEmpty: true,
      emptyLabel: 'Select field...',
      fields: elevationFields,
    }),
    intro: field
      ? analysis.hasAnyCop90
        ? `Review flagged values in <strong>${escapeHtml(field)}</strong>, compare them against Copernicus GLO-90 (COP90) satellite elevation estimates based on the actual or inferred GPS coordinates, when available, and stage affected bins as <span class="field-status unconfirmed bin-status-square" style="display:inline-block;width:10px;height:10px;padding:0;border-radius:2px;border:1px solid var(--text-muted);box-sizing:border-box;vertical-align:middle;margin:0 2px"></span> <strong>Unconfirmed</strong>.`
        : `Review flagged values in <strong>${escapeHtml(field)}</strong>. No COP90 data was found for these rows, so only extreme or impossible values are shown.`
      : 'Choose an elevation field to review suspicious elevation values.',
    summaryHtml: field
      ? `${analysis.flaggedCount} flagged specimen${analysis.flaggedCount !== 1 ? 's' : ''} across ${analysis.numericCount} numeric value${analysis.numericCount !== 1 ? 's' : ''}${analysis.hasAnyCop90 ? ` &middot; ${analysis.comparedCount} with COP90 matches` : ' &middot; no COP90 matches'}.`
      : 'No field selected yet.',
  });

  popup.overlay.querySelector('#elevation-review-field')?.addEventListener('change', (e) => {
    popup.close();
    showElevationDiscrepancyPopup(e.target.value);
  });

  const metersEl = popup.overlay.querySelector('#popup-elev-meters');
  const feetEl = popup.overlay.querySelector('#popup-elev-feet');
  const cop90MEl = popup.overlay.querySelector('#popup-elev-cop90-m');
  const cop90FtEl = popup.overlay.querySelector('#popup-elev-cop90-ft');
  if (metersEl && feetEl) {
    metersEl.addEventListener('input', () => {
      const value = parseFloat(metersEl.textContent.replace(/[^\d.\-]/g, ''));
      feetEl.textContent = Number.isNaN(value) ? '' : (value * 3.28084).toFixed(1);
    });
    feetEl.addEventListener('input', () => {
      const value = parseFloat(feetEl.textContent.replace(/[^\d.\-]/g, ''));
      metersEl.textContent = Number.isNaN(value) ? '' : (value / 3.28084).toFixed(1);
    });
  }

  const renderEditableElevationValue = (item) => {
    const displayValue = item.valueLabel === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(item.valueLabel));
    return `
      <button class="catalog-pattern-editable" type="button" data-elevation-edit="${escapeAttr(item.filename)}" title="Click to edit this value">
        ${displayValue}
      </button>
    `;
  };

  const startElevationPopupValueEdit = (btn, item) => {
    if (btn.querySelector('textarea')) return;
    const spec = APP.specimens[item.index];
    if (!spec) return;
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const currentSpecState = APP.state.specimens[spec.filename];
    const initialSnapshot = snapshotFieldState(currentSpecState, field);
    const currentValue = getCurrentFieldValue(spec, field);

    btn.classList.add('is-editing');
    btn.innerHTML = `<textarea class="catalog-pattern-editor">${escapeHtml(String(currentValue))}</textarea>`;
    const input = btn.querySelector('textarea');
    if (!input) return;
    input.focus();
    input.select();
    input.style.height = input.scrollHeight + 'px';

    const save = () => {
      const nextValue = input.value;
      const changedFromInitial = nextValue !== currentValue;
      let rwBefore = null;
      if (changedFromInitial) rwBefore = rewindCapture([spec.filename], [field]);

      if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, field, nextValue);
      else restoreFieldState(currentSpecState, field, initialSnapshot);
      currentSpecState.last_touched = new Date().toISOString();
      markSpecimenDirty(spec.filename);

      if (changedFromInitial && rwBefore) {
        rewindRecord('elevationReviewEdit', 'Elevation Review', `"${field}" on ${getDisplayFilename(spec.filename)}`, rwBefore);
      }
      scheduleSaveState(spec.filename);
      renderFocusSidebar(getFocusCategories());
      renderFocusMain();
      refreshPopup();
    };

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    });
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        input.removeEventListener('blur', save);
        save();
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        btn.classList.remove('is-editing');
        btn.innerHTML = currentValue === ''
          ? '<span class="cell-empty-placeholder">(empty)</span>'
          : escapeHtml(String(currentValue));
      }
    });
  };

  const renderList = () => {
    const listEl = popup.overlay.querySelector('#elevation-review-list');
    if (!listEl) return;
    listEl.innerHTML = !field
      ? '<div class="focus-review-empty">Select a field to review elevation values.</div>'
      : analysis.numericCount === 0
      ? '<div class="focus-review-empty">No numeric elevation values were found for this field.</div>'
      : groups.length === 0
      ? '<div class="focus-review-empty">No extreme values or COP90 discrepancies were detected.</div>'
      : groups.map((group, groupIndex) => renderFocusReviewGroup({
        title: escapeHtml(group.title),
        meta: [`${group.items.length} specimen${group.items.length !== 1 ? 's' : ''}`],
        actionsHtml: `
          <button class="btn-sm btn-primary" data-elevation-confirm="${groupIndex}">Confirm</button>
        `,
        bodyHtml: group.items.map(item => renderFocusPopupSpecimenRow(item, {
          valueHtml: renderEditableElevationValue(item),
          includeFlagButton: true,
          flagTool: 'elevation',
          includePhotoButton: true,
          photoFieldLabel: field,
          photoFieldValue: item.value,
          detail: `
            ${item.hasCop90 ? `<span class="focus-review-group-meta">${escapeHtml(String(item.cop90Label))} COP90</span>` : '<span class="focus-review-group-meta">No COP90</span>'}
            ${item.hasCop90 ? `<span class="focus-review-group-meta">${escapeHtml(String(item.diff))}m diff</span>` : ''}
            <span class="elev-status ${item.statusCls}">${escapeHtml(item.status)}</span>
          `,
          statusField: field,
          rowClass: `focus-popup-elev-row date-review-row ${item.index === activeIndex ? 'active' : ''}`,
          rowAttrs: `data-elevation-review-index="${item.index}"`,
        })).join('')
      })).join('');

    listEl.querySelectorAll('[data-elevation-review-index]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-elevation-edit], textarea')) return;
        activeIndex = parseInt(row.dataset.elevationReviewIndex, 10);
        renderList();
        loadPreview();
      });
    });
    listEl.querySelectorAll('[data-elevation-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = items.find(entry => entry.filename === btn.dataset.elevationEdit);
        if (!item) return;
        activeIndex = item.index;
        startElevationPopupValueEdit(btn, item);
      });
    });
    listEl.querySelectorAll('[data-elevation-confirm]').forEach(btn => {
      btn.addEventListener('click', () => {
        const group = groups[parseInt(btn.dataset.elevationConfirm, 10)];
        showApplyCancelPopup(
          'Confirm Elevation Review?',
          `Stage <strong>${group.items.length}</strong> suspicious specimen${group.items.length !== 1 ? 's' : ''} in <strong>${escapeHtml(field)}</strong> as <strong>Unconfirmed</strong>?`,
          () => {
            bulkBinMarkUnconfirmed(group.items, field);
            renderFocusSidebar(getFocusCategories());
            renderFocusMain();
            refreshPopup();
          },
          'Apply'
        );
      });
    });
    wirePopupQuickTools(listEl, { closeFn: popup.close, onFlagRefresh: renderList });
  };

  const loadPreview = async () => {
    const valueEl = popup.overlay.querySelector('#elevation-review-value');
    const detailEl = popup.overlay.querySelector('#elevation-review-detail');
    const imageEl = popup.overlay.querySelector('#elevation-review-image');
    const activeItem = items.find(item => item.index === activeIndex) || items[0];
    if (!valueEl || !detailEl || !imageEl) return;
    if (!field || !activeItem) {
      valueEl.innerHTML = '<span class="cell-empty-placeholder">Select a specimen</span>';
      detailEl.textContent = field ? 'Select a specimen' : 'Select a field';
      imageEl.innerHTML = `<div class="table-image-placeholder">${field ? 'Select a specimen' : 'Select a field'}</div>`;
      if (cop90MEl) cop90MEl.textContent = '—';
      if (cop90FtEl) cop90FtEl.textContent = '—';
      if (metersEl) metersEl.textContent = '';
      if (feetEl) feetEl.textContent = '';
      return;
    }

    valueEl.innerHTML = activeItem.valueLabel === ''
      ? '<span class="cell-empty-placeholder">(empty)</span>'
      : escapeHtml(String(activeItem.valueLabel));
    detailEl.innerHTML = activeItem.hasCop90
      ? `${escapeHtml(activeItem.status)} &middot; ${escapeHtml(String(activeItem.diff))} m difference`
      : `${escapeHtml(activeItem.status)} &middot; No COP90 match`;

    if (metersEl) metersEl.textContent = Number.isFinite(activeItem.value) ? String(activeItem.value) : '';
    if (feetEl) feetEl.textContent = Number.isFinite(activeItem.value) ? (activeItem.value * 3.28084).toFixed(1) : '';
    if (cop90MEl) {
      cop90MEl.textContent = activeItem.hasCop90 ? `${activeItem.cop90Label}` : '—';
    }
    if (cop90FtEl) {
      cop90FtEl.textContent = activeItem.hasCop90 ? (activeItem.cop90 * 3.28084).toFixed(1) : '—';
    }

    imageEl.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, activeItem.filename, imageType, 'full');
    if (!imageEl.isConnected) return;
    if (dataUrl) {
      imageEl.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(activeItem.filename))}">`;
      imageEl.querySelector('img')?.addEventListener('click', () => openImageModal(dataUrl));
    } else {
      imageEl.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
    }
  };

  const switchControl = createSlideSwitch('elevation-review-image-switch', [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadPreview();
  });
  const switchContainer = popup.overlay.querySelector('#elevation-review-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = switchControl.html;
    switchControl.setup();
  }

  renderList();
  loadPreview();
}

// Section-to-category mapping — built dynamically
function getFocusToolCategories() {
  const cats = getEditorToolCategories();
  const result = {};
  // n-gram clustering section → patterns category
  if (cats.includes('patterns')) result.clusters = ['patterns'];
  // dates section → dates category
  if (cats.includes('dates')) result.dates = ['dates'];
  // catalog/patterns section → patterns category
  if (cats.includes('patterns')) result.catalog = ['patterns'];
  // standardize section → all categories that have standardization tools
  const stdCats = ['taxonomy', 'geography', 'collectors'];
  result.standardize = stdCats.filter(c => cats.includes(c));
  // authorship → taxonomy
  if (cats.includes('taxonomy')) result.authorship = ['taxonomy'];
  if (cats.includes('vouchervision')) result.voucherVision = ['vouchervision'];
  if (cats.includes('taxonomy')) result.wfoBackbone = ['taxonomy'];
  // elevation discrepancy → lives under the geography category
  if (cats.includes('geography')) result.elevation = ['geography'];
  // ocr comparison → ocr
  if (cats.includes('ocr')) result.ocrComparison = ['ocr'];
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
    intent: 'Genus',
    label: 'Genus → Title Case',
    categories: ['taxonomy'],
    transform: (v, field) => {
      if (!/genus/i.test(field) || /specific|epithet/i.test(field)) return null;
      return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : null;
    }
  },
  {
    id: 'epithet-lowercase',
    intent: 'Specific Epithet',
    label: 'Specific Epithet → lowercase',
    categories: ['taxonomy'],
    transform: (v, field) => {
      if (!/epithet/i.test(field)) return null;
      return (v && v !== v.toLowerCase()) ? v.toLowerCase() : null;
    }
  },
  {
    id: 'taxon-rank-normalize',
    intent: 'Taxon Rank',
    label: 'Normalize taxon rank (e.g. ssp. → subsp.)',
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
    id: 'variety-normalize',
    intent: 'Taxon Rank',
    label: 'Normalize variety (var, var. → var.)',
    categories: ['taxonomy'],
    transform: (v) => {
      if (!v) return null;
      const fixed = v.replace(/\bvar(?:iety)?\.?\b/gi, 'var.');
      return fixed !== v ? fixed : null;
    }
  },
  {
    id: 'forma-normalize',
    intent: 'Taxon Rank',
    label: 'Normalize forma (forma, fo. → f.)',
    categories: ['taxonomy'],
    transform: (v) => {
      if (!v) return null;
      const fixed = v.replace(/\bforma?\b/gi, 'f.').replace(/\bfo\.?\b/gi, 'f.');
      return fixed !== v ? fixed : null;
    }
  },
  {
    id: 'geo-title-case',
    intent: 'Title Case',
    label: 'Geography → ALL-CAPS to Title Case',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/country|state|province|county|continent|locality|municipality/i.test(field)) return null;
      if (!v || !/^[^a-z]*$/.test(v) || v.length < 2) return null;
      return v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
  },
  {
    id: 'usa-standardize',
    intent: 'USA Variants',
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
    intent: 'USA States',
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
    intent: 'USA County',
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
    id: 'municipality-suffix-strip',
    intent: 'Municipality',
    label: 'Strip "Municipality" suffixes',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/county|municipality|admin/i.test(field)) return null;
      if (!v) return null;
      const stripped = v.replace(/\s+Municipality\s*$/i, '').trim();
      return stripped !== v.trim() ? stripped : null;
    }
  },
  {
    id: 'prefecture-suffix-strip',
    intent: 'Prefecture',
    label: 'Strip "Prefecture" suffixes',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/county|state|province|prefecture|admin/i.test(field)) return null;
      if (!v) return null;
      const stripped = v.replace(/\s+Prefecture\s*$/i, '').trim();
      return stripped !== v.trim() ? stripped : null;
    }
  },
  {
    id: 'province-suffix-strip',
    intent: 'Province',
    label: 'Strip "Province" / "Prov." suffixes',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/state|province|admin/i.test(field)) return null;
      if (!v) return null;
      const stripped = v.replace(/\s+Prov(?:ince|\.?)?\s*$/i, '').trim();
      return stripped !== v.trim() ? stripped : null;
    }
  },
  {
    id: 'department-suffix-strip',
    intent: 'Department',
    label: 'Strip "Department" / "Dept." suffixes',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/county|state|province|department|admin/i.test(field)) return null;
      if (!v) return null;
      const stripped = v.replace(/\s+Dep(?:t|artment|\.?)?\s*$/i, '').trim();
      return stripped !== v.trim() ? stripped : null;
    }
  },
  {
    id: 'district-suffix-strip',
    intent: 'District',
    label: 'Strip "District" / "Dist." suffixes',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/county|state|province|district|admin/i.test(field)) return null;
      if (!v) return null;
      const stripped = v.replace(/\s+Dist(?:rict|\.?)?\s*$/i, '').trim();
      return stripped !== v.trim() ? stripped : null;
    }
  },
  {
    id: 'collector-title-case',
    intent: 'Names',
    label: 'Collectors → ALL-CAPS to Title Case',
    categories: ['collectors'],
    transform: (v, field) => {
      if (!/collect|associat/i.test(field)) return null;
      if (!v || /[a-z]/.test(v)) return null;
      return v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
  },
  {
    id: 'datum-normalize',
    intent: 'Datum',
    label: 'Standardize datum → "WGS84"',
    categories: ['geography'],
    transform: (v, field) => {
      if (!/datum/i.test(field)) return null;
      if (!v) return null;
      if (/^WGS\s*84$/i.test(v) && v !== 'WGS84') return 'WGS84';
      return null;
    }
  },
  {
    id: 'cultivated-normalize',
    intent: 'Cultivated',
    label: 'Standardize cultivated → 0 or 1',
    categories: ['taxonomy'],
    transform: (v, field) => {
      if (!/cultivat/i.test(field)) return null;
      if (v === '0' || v === '1') return null;
      if (!v || v.trim() === '' || /^(no|false|none|n|0)$/i.test(v.trim())) return '0';
      if (/^(yes|true|y|1|cultivated)$/i.test(v.trim())) return '1';
      return '1';
    }
  }
];

// ── Collector Name Parsing Engine ────────────────────────────

const NAME_HONORIFICS = new Set([
  'dr', 'dr.', 'prof', 'prof.', 'professor',
  'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'mx', 'mx.',
  'miss', 'master', 'sir', 'madam', 'madame', 'dame', 'lord', 'lady',
  'rev', 'rev.', 'reverend', 'fr', 'fr.', 'father', 'pastor', 'pr', 'pr.',
]);
const NAME_SUFFIXES = new Set([
  'jr', 'jr.', 'jnr', 'jnr.',
  'sr', 'sr.', 'snr', 'snr.',
  'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii',
  'esq', 'esq.',
  'phd', 'ph.d.', 'ph.d', 'ph.d,',
  'md', 'm.d.', 'm.d',
  'ba', 'b.a.', 'b.a', 'bs', 'b.s.', 'b.s', 'bsc', 'b.sc.', 'b.sc',
  'ma', 'm.a.', 'm.a', 'msc', 'm.sc.', 'm.sc',
  'dds', 'd.d.s.', 'd.d.s',
  'dvm', 'd.v.m.', 'd.v.m',
  'dphil', 'd.phil.', 'd.phil',
  'fil', 'fil.', // botanical: "filius"
]);
const LAST_NAME_PREFIXES = ['van der', 'van de', 'van den', 'von der', 'de la', 'de los', 'de las', 'van', 'von', 'de', 'du', 'da', 'del', 'della', 'di', 'le', 'la', 'el', 'al'];
const ORG_KEYWORDS = /\b(university|museum|garden|institute|herbarium|department|society|foundation|college|laboratory|botanical|academy|bureau|service|survey)\b/i;

const NAME_FORMATS = [
  { id: 'full',           label: 'Full Name',       example: 'William J. Smith' },
  { id: 'fm-dot',         label: 'F.M. Last',       example: 'W.J. Smith' },
  { id: 'fm-dot-spaced',  label: 'F. M. Last',      example: 'W. J. Smith' },
  { id: 'fm-nodot',       label: 'FM Last',          example: 'WJ Smith' },
  { id: 'f-dot',          label: 'F. Last',          example: 'W. Smith' },
  { id: 'f-nodot',        label: 'F Last',           example: 'W Smith' },
  { id: 'last-fm',        label: 'Last, F.M.',       example: 'Smith, W.J.' },
  { id: 'last-fm-spaced', label: 'Last, F. M.',      example: 'Smith, W. J.' },
  { id: 'last-first',     label: 'Last, First M.',   example: 'Smith, William J.' },
];

function nameToTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase().replace(/(?:^|\s|-)(\S)/g, (m, c, offset, full) => {
    // Keep lowercase for known prefixes unless at start
    const word = full.slice(offset).split(/[\s-]/)[0].toLowerCase();
    if (offset > 0 && LAST_NAME_PREFIXES.includes(word) && word.length <= 3) {
      return m; // keep lowercase "van", "de", etc.
    }
    return m.slice(0, -1) + c.toUpperCase();
  }).replace(/\bMc(\w)/g, (_, c) => 'Mc' + c.toUpperCase())
    .replace(/\bMac(\w{3,})/g, (_, rest) => 'Mac' + rest.charAt(0).toUpperCase() + rest.slice(1));
}

function isInitialToken(token) {
  const clean = token.replace(/\./g, '');
  return clean.length <= 2 && /^[A-Za-z]+$/.test(clean);
}

function isAllCaps(str) {
  const letters = str.replace(/[^A-Za-z]/g, '');
  return letters.length > 1 && letters === letters.toUpperCase();
}

function splitCollectorNames(rawValue, inputInverted) {
  if (!rawValue || !rawValue.trim()) return { names: [], separator: '' };
  let val = rawValue.trim();

  // Extract "et al." trailing
  let etAl = null;
  const etAlMatch = val.match(/,?\s*(et\s+al\.?)$/i);
  if (etAlMatch) {
    etAl = 'et al.';
    val = val.slice(0, etAlMatch.index).trim();
  }

  let names, separator;

  // Try semicolons first
  if (val.includes(';')) {
    names = val.split(';').map(s => s.trim()).filter(Boolean);
    separator = '; ';
  }
  // Try " and " / " & "
  else if (/\s+(?:and|&)\s+/i.test(val)) {
    names = val.split(/\s+(?:and|&)\s+/i).map(s => s.trim()).filter(Boolean);
    separator = ' & ';
  }
  // Commas: if inverted, pair up "Last, First" tokens; otherwise treat as separators
  else if (val.includes(',')) {
    const tokens = val.split(',').map(s => s.trim()).filter(Boolean);
    if (inputInverted) {
      // Pair consecutive tokens: "Last", "First M." → "Last First M."
      names = [];
      for (let i = 0; i < tokens.length; i += 2) {
        if (tokens[i + 1] !== undefined) {
          names.push(tokens[i + 1] + ' ' + tokens[i]);
        } else {
          names.push(tokens[i]);
        }
      }
      separator = ', ';
    } else {
      names = tokens;
      separator = ', ';
    }
  }
  // Try colons
  else if (val.includes(':')) {
    names = val.split(':').map(s => s.trim()).filter(Boolean);
    separator = ': ';
  } else {
    names = [val];
    separator = '';
  }

  if (etAl) {
    names.push(etAl);
    if (!separator) separator = ' ';
  }

  // Post-pass: if any split-out "name" is actually just a suffix (e.g. "Jr."
  // after a comma split), merge it back into the preceding name. Handles:
  //   "A.B. Simmons, Jr."       → ["A.B. Simmons", "Jr."]        → ["A.B. Simmons Jr."]
  //   "Simmons, A.B., Jr."      → ["A.B. Simmons", "Jr."]        → ["A.B. Simmons Jr."]
  //   "Smith, Jr.; Jones, Sr."  → ["Smith", "Jr.", "Jones", "Sr."] → ["Smith Jr.", "Jones Sr."]
  const onlySuffixRe = new RegExp(`^(?:${[...NAME_SUFFIXES].map(s => s.replace(/\./g, '\\.')).join('|')})$`, 'i');
  const isOnlySuffix = (s) => onlySuffixRe.test(s.trim());
  const mergedNames = [];
  for (const name of names) {
    if (mergedNames.length > 0 && isOnlySuffix(name)) {
      mergedNames[mergedNames.length - 1] += ' ' + name.trim();
    } else {
      mergedNames.push(name);
    }
  }
  return { names: mergedNames, separator };
}

function parseName(nameStr) {
  let raw = nameStr.trim();
  // Clean OCR artifacts: trailing dots, repeated punctuation
  raw = raw.replace(/\.{2,}$/g, '').replace(/[,;:]+$/g, '').trim();
  if (!raw) return { raw: nameStr.trim(), last: null };

  // Handle "et al."
  if (/^et\s+al\.?$/i.test(raw)) {
    return { isEtAl: true, raw };
  }

  // Handle organizations
  if (ORG_KEYWORDS.test(raw)) {
    return { isOrganization: true, raw, allCaps: isAllCaps(raw) };
  }

  let working = raw;
  const allCaps = isAllCaps(raw);


  let tokens = working.split(/\s+/).filter(Boolean);

  // Strip stray commas that cling to tokens (e.g. "A.B.," → "A.B.")
  tokens = tokens.map(t => t.replace(/,+$/, '')).filter(Boolean);

  // Expand compound initials: "A.B." → ["A.", "B."], "A.B.C." → ["A.", "B.", "C."],
  // "A.B.C" (trailing dot missing) → ["A.", "B.", "C."], "A.B" → ["A.", "B."]
  tokens = tokens.flatMap(t => {
    // Must be 2+ letters separated by dots, optionally missing the final dot.
    // Examples that should match: A.B., A.B, A.B.C., A.B.C
    // Examples that must NOT match: A. (single initial), Alfred, Simmons
    if (/^([A-Za-z]\.){1,}[A-Za-z]\.?$/.test(t) || /^([A-Za-z]\.){2,}$/.test(t)) {
      const letters = t.match(/[A-Za-z]/g) || [];
      if (letters.length >= 2) return letters.map(c => c + '.');
    }
    return [t];
  });

  // Extract honorifics (loop to handle "Dr. Prof. Alfred Simmons")
  const honorifics = [];
  while (tokens.length > 1 && NAME_HONORIFICS.has(tokens[0].toLowerCase().replace(/,+$/, ''))) {
    let h = tokens.shift().replace(/,+$/, '');
    // Normalize honorific to title case with period
    h = h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
    if (!h.endsWith('.')) h += '.';
    honorifics.push(h);
  }
  const honorific = honorifics.length > 0 ? honorifics.join(' ') : null;

  // Extract suffixes (loop to handle "Simmons Jr. PhD")
  const suffixes = [];
  while (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1].toLowerCase().replace(/,+$/, ''))) {
    let s = tokens.pop().replace(/,+$/, '');
    // Normalize suffix
    const sl = s.toLowerCase().replace(/\./g, '');
    if (['jr', 'sr', 'jnr', 'snr', 'esq'].includes(sl)) {
      s = sl.charAt(0).toUpperCase() + sl.slice(1) + '.';
    } else if (['ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'].includes(sl)) {
      s = sl.toUpperCase();
    } else if (['phd', 'md', 'ba', 'bs', 'ma', 'dds', 'dvm'].includes(sl)) {
      s = sl.toUpperCase().split('').join('.') + '.';
    } else if (['bsc', 'msc', 'dphil'].includes(sl)) {
      // Multi-character segment: uppercase with single trailing dot
      s = sl.charAt(0).toUpperCase() + sl.slice(1) + '.';
    } else if (sl === 'fil') {
      s = 'fil.';
    }
    suffixes.unshift(s);
  }
  const suffix = suffixes.length > 0 ? suffixes.join(' ') : null;

  if (tokens.length === 0) return { raw, honorific, suffix, last: null, allCaps };

  // Detect multi-word last name prefix
  let last = null;
  if (tokens.length > 1) {
    const lower = tokens.map(t => t.toLowerCase());
    for (const prefix of LAST_NAME_PREFIXES) {
      const parts = prefix.split(' ');
      const startIdx = tokens.length - parts.length - 1;
      if (startIdx < 0) continue;
      const candidate = lower.slice(startIdx, startIdx + parts.length).join(' ');
      if (candidate === prefix) {
        const lastParts = tokens.slice(startIdx, startIdx + parts.length + 1);
        last = lastParts.join(' ');
        tokens = tokens.slice(0, startIdx);
        break;
      }
    }
  }

  if (!last && tokens.length > 0) {
    last = tokens.pop();
  }

  const first = tokens.length > 0 ? tokens.shift() : null;
  const middle = tokens; // whatever's left

  // Title-case if ALL-CAPS
  const tcLast = allCaps && last ? nameToTitleCase(last) : last;
  const tcFirst = allCaps && first ? nameToTitleCase(first) : first;
  const tcMiddle = allCaps ? middle.map(m => nameToTitleCase(m)) : [...middle];

  return {
    raw,
    honorific,
    first: tcFirst,
    middle: tcMiddle,
    last: tcLast,
    suffix,
    firstIsInitial: first ? isInitialToken(first) : false,
    middleAreInitials: tcMiddle.every(m => isInitialToken(m)),
    allCaps
  };
}

function toInitial(name, withDot) {
  if (!name) return '';
  const c = name.replace(/\./g, '').charAt(0).toUpperCase();
  return withDot ? c + '.' : c;
}

function formatName(parsed, formatId, options) {
  if (!parsed) return '';
  if (parsed.isEtAl) return 'et al.';
  if (parsed.isOrganization) return parsed.allCaps ? nameToTitleCase(parsed.raw) : parsed.raw;
  if (!parsed.last) return parsed.raw;

  const hon = (options.honorifics === 'keep' && parsed.honorific) ? parsed.honorific + ' ' : '';
  const suf = (options.suffixes === 'keep' && parsed.suffix) ? ' ' + parsed.suffix : '';
  const first = parsed.first;
  const middles = parsed.middle || [];
  const last = parsed.last;

  // Build first/middle portions per format
  let result;
  switch (formatId) {
    case 'full': {
      // Use full names where known, initials with dots where only initials exist
      const f = first ? (parsed.firstIsInitial ? toInitial(first, true) : first) : '';
      const m = middles.map(mi => isInitialToken(mi) ? toInitial(mi, true) : mi).join(' ');
      result = hon + [f, m, last].filter(Boolean).join(' ') + suf;
      break;
    }
    case 'fm-dot': {
      const f = first ? toInitial(first, true) : '';
      const m = middles.map(mi => toInitial(mi, true)).join('');
      result = hon + [f + m, last].filter(Boolean).join(' ') + suf;
      break;
    }
    case 'fm-dot-spaced': {
      // "F. M. Last" — initials with dots and spaces between them
      const f = first ? toInitial(first, true) : '';
      const m = middles.map(mi => toInitial(mi, true)).join(' ');
      result = hon + [f, m, last].filter(Boolean).join(' ') + suf;
      break;
    }
    case 'fm-nodot': {
      const f = first ? toInitial(first, false) : '';
      const m = middles.map(mi => toInitial(mi, false)).join('');
      result = hon + [f + m, last].filter(Boolean).join(' ') + suf;
      break;
    }
    case 'f-dot': {
      const f = first ? toInitial(first, true) : '';
      result = hon + [f, last].filter(Boolean).join(' ') + suf;
      break;
    }
    case 'f-nodot': {
      const f = first ? toInitial(first, false) : '';
      result = hon + [f, last].filter(Boolean).join(' ') + suf;
      break;
    }
    case 'last-fm': {
      const f = first ? toInitial(first, true) : '';
      const m = middles.map(mi => toInitial(mi, true)).join('');
      const initials = f + m;
      result = initials ? last + ', ' + hon + initials + suf : hon + last + suf;
      break;
    }
    case 'last-fm-spaced': {
      // "Last, F. M." — last name first, initials with dots and spaces
      const f = first ? toInitial(first, true) : '';
      const m = middles.map(mi => toInitial(mi, true)).join(' ');
      const initials = [f, m].filter(Boolean).join(' ');
      result = initials ? last + ', ' + hon + initials + suf : hon + last + suf;
      break;
    }
    case 'last-first': {
      const f = first ? (parsed.firstIsInitial ? toInitial(first, true) : first) : '';
      const m = middles.map(mi => toInitial(mi, true)).join(' ');
      const rest = [f, m].filter(Boolean).join(' ');
      result = rest ? last + ', ' + hon + rest + suf : hon + last + suf;
      break;
    }
    default:
      result = parsed.raw;
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}

function transformCollectorField(rawValue, formatId, options) {
  const { names, separator } = splitCollectorNames(rawValue, options.inputInverted);
  if (names.length === 0) return rawValue;

  const formatted = names.map(name => {
    const parsed = parseName(name);
    const result = formatName(parsed, formatId, options);
    // If the name already matches the target format, keep original to avoid lossy re-parsing
    const normOrig = name.trim().replace(/\s+/g, ' ');
    const normResult = result.replace(/\s+/g, ' ');
    return normOrig === normResult ? name.trim() : result;
  });

  const output = formatted.join(separator);
  // Final safeguard: if the full output matches the input, return the original unchanged
  return output === rawValue.trim() ? rawValue : output;
}

// ── Collector Name Parser Popup ──────────────────────────────

function showCollectorNamePopup(selectedField = focusField) {
  const field = selectedField;

  // Gather all specimen values
  const rows = [];
  if (field) {
    for (const spec of APP.specimens) {
      const val = getCurrentFieldValue(spec, field);
      if (!val || !val.trim()) continue;
      const idx = specimenIndexMap.get(spec.filename);
      rows.push({ filename: spec.filename, index: idx, oldVal: val });
    }
  }

  let currentFormat = 'fm-dot';
  let currentOptions = { honorifics: 'remove', suffixes: 'keep', inputInverted: false };
  const checkStates = new Map(); // filename -> boolean

  function computePreview() {
    return rows.map(r => {
      const newVal = transformCollectorField(r.oldVal, currentFormat, currentOptions);
      const hasChange = newVal !== r.oldVal;
      if (!checkStates.has(r.filename)) checkStates.set(r.filename, hasChange);
      return { ...r, newVal, hasChange };
    });
  }

  function renderNameParserRow(r, options = {}) {
    const {
      includeCheckbox = true,
      includeFlagButton = true,
      includePhotoButton = true,
      checked = false,
      rowClass = '',
    } = options;

    const { names: oldNames, separator: oldSep } = splitCollectorNames(r.oldVal, currentOptions.inputInverted);
    const newNames = r.hasChange ? splitCollectorNames(r.newVal, false).names : [];
    const sepLabel = oldSep.trim() || ',';
    const formatNameLines = (names, cls) => names.map(n => `<div class="${cls}">${escapeHtml(n)}</div>`).join('');

    const npPhotoBtnHtml = includePhotoButton
      ? `<button type="button" class="btn-icon popup-quicktools-photo wfo-photo-btn np-photo-btn" data-file="${escapeAttr(r.filename)}" title="Open specimen image reference"><img src="icons/image.svg" alt="" aria-hidden="true"></button>`
      : '';
    const npQuickTools = renderPopupQuickTools(r, {
      tool: 'collectors',
      statusField: field,
      includePhoto: includePhotoButton,
      includeFlag: includeFlagButton,
      includeStatus: !!field,
      photoButtonHtml: npPhotoBtnHtml,
    });
    return `
      <div class="name-parser-row ${r.hasChange ? '' : 'no-change'} ${rowClass}">
        ${npQuickTools}
        <span class="np-check">${includeCheckbox ? `<input type="checkbox" data-file="${escapeAttr(r.filename)}" ${checked ? 'checked' : ''} ${!r.hasChange ? 'disabled' : ''}>` : ''}</span>
        <span class="np-filename" title="${escapeAttr(getDisplayFilename(r.filename))}">${escapeHtml(getDisplayFilename(r.filename, 24))}</span>
        <div class="np-names-col np-old">${formatNameLines(oldNames, 'np-name-line')}</div>
        ${r.hasChange ? `<span class="np-arrow">&rarr;</span><div class="np-names-col np-new">${formatNameLines(newNames, 'np-name-line')}</div>` : ''}
        ${oldNames.length > 1 ? `<span class="np-sep-hint">joined by "${escapeHtml(sepLabel)}"</span>` : ''}
      </div>
    `;
  }

  function showNameParserSpecimenReferencePopup(row) {
    const switchId = `np-ref-switch-${Date.now()}`;
    let imageType = tableImageType;

    const overlay = document.createElement('div');
    overlay.className = 'image-modal-overlay';
    overlay.style.cursor = 'default';
    overlay.innerHTML = `
      <div class="wfo-reference-popup np-reference-popup" onclick="event.stopPropagation()">
        <div class="name-parser-header">
          <span>${escapeHtml(getDisplayFilename(row.filename))}</span>
          ${popupCloseBtnHtml('np-ref-close')}
        </div>
        <div class="wfo-reference-toggle" id="np-reference-toggle"></div>
        <div class="wfo-reference-preview">
          ${renderNameParserRow(row, {
            includeCheckbox: false,
            includeFlagButton: false,
            includePhotoButton: false,
            rowClass: 'wfo-table-row-readonly',
          })}
        </div>
        <div class="wfo-reference-images" id="np-reference-images">
          <div class="table-image-placeholder">Loading...</div>
        </div>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);
    document.getElementById('np-ref-close')?.addEventListener('click', close);

    const sw = createSlideSwitch(switchId, [
      { value: 'collage', label: 'Collage' },
      { value: 'original', label: 'Original' }
    ], imageType, (val) => {
      imageType = val;
      loadNameParserReferenceImage();
    });
    const switchContainer = document.getElementById('np-reference-toggle');
    if (switchContainer) {
      switchContainer.innerHTML = sw.html;
      sw.setup();
    }

    async function loadNameParserReferenceImage() {
      const container = document.getElementById('np-reference-images');
      if (!container) return;
      container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
      const dataUrl = await window.api.getImage(APP.folderPath, row.filename, imageType, 'full');
      if (!container.isConnected) return;
      if (dataUrl) {
        container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(row.filename))}">`;
        container.querySelector('img')?.addEventListener('click', () => openImageModal(dataUrl));
      } else {
        container.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
      }
    }

    loadNameParserReferenceImage();
  }

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div class="name-parser-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <div class="focus-popup-title-block">
          <div class="focus-popup-title">Collector Name Standardization</div>
          <div class="tool-instructions">Standardize collector names into a shared format before accepting the proposed changes.</div>
        </div>
        ${popupCloseBtnHtml('np-close')}
      </div>
      <div class="focus-popup-subheader-row">
        ${getPopupFieldSelectorHtml('name-parser-field', field, { includeEmpty: true, emptyLabel: 'Select field...' })}
      </div>
      <div class="name-parser-options">
        <label>Format
          <select id="np-format">
            ${NAME_FORMATS.map(f => `<option value="${f.id}" ${f.id === currentFormat ? 'selected' : ''}>${escapeHtml(f.label)} (${escapeHtml(f.example)})</option>`).join('')}
          </select>
        </label>
        <label>Honorifics
          <select id="np-honorifics">
            <option value="remove" selected>Remove</option>
            <option value="keep">Keep</option>
          </select>
        </label>
        <label>Suffixes
          <select id="np-suffixes">
            <option value="keep" selected>Keep</option>
            <option value="remove">Remove</option>
          </select>
        </label>
        <label style="margin-left:auto;cursor:pointer">
          <input type="checkbox" id="np-inverted" style="accent-color:var(--accent);cursor:pointer">
          Input is Last, First
        </label>
      </div>
      <div class="name-parser-summary">
        <span id="np-count"></span>
        <button class="btn-sm btn-primary" id="np-accept">Accept Selected</button>
      </div>
      <div class="name-parser-list" id="np-list"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  function renderList() {
    const acceptBtn = document.getElementById('np-accept');
    const listEl = document.getElementById('np-list');
    const countEl = document.getElementById('np-count');

    if (!field) {
      if (countEl) countEl.textContent = 'No field selected yet';
      if (listEl) listEl.innerHTML = '<div class="focus-review-empty">Select a field to review collector names.</div>';
      if (acceptBtn) acceptBtn.disabled = true;
      return;
    }

    if (rows.length === 0) {
      if (countEl) countEl.textContent = 'No values to parse for this field';
      if (listEl) listEl.innerHTML = '<div class="focus-review-empty">No non-empty values were found in this field.</div>';
      if (acceptBtn) acceptBtn.disabled = true;
      return;
    }

    const preview = computePreview();
    const changeCount = preview.filter(r => r.hasChange).length;
    document.getElementById('np-count').textContent = changeCount > 0
      ? `${changeCount} change${changeCount !== 1 ? 's' : ''} found`
      : 'No changes for this format';
    if (acceptBtn) acceptBtn.disabled = changeCount === 0;

    listEl.innerHTML = preview.map(r => renderNameParserRow(r, {
      checked: checkStates.get(r.filename),
    })).join('');

    // Wire checkboxes
    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        checkStates.set(cb.dataset.file, cb.checked);
      });
    });
    wirePopupQuickTools(listEl, { closeFn: () => overlay.remove(), onFlagRefresh: renderList });
    listEl.querySelectorAll('.np-photo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const row = preview.find(item => item.filename === btn.dataset.file);
        if (row) showNameParserSpecimenReferencePopup(row);
      });
    });
  }

  renderList();

  document.getElementById('name-parser-field')?.addEventListener('change', (e) => {
    overlay.remove();
    showCollectorNamePopup(e.target.value);
  });

  // Dropdown changes
  document.getElementById('np-format').addEventListener('change', (e) => {
    currentFormat = e.target.value;
    // Reset check states for re-evaluation
    checkStates.clear();
    renderList();
  });
  document.getElementById('np-honorifics').addEventListener('change', (e) => {
    currentOptions.honorifics = e.target.value;
    checkStates.clear();
    renderList();
  });
  document.getElementById('np-suffixes').addEventListener('change', (e) => {
    currentOptions.suffixes = e.target.value;
    checkStates.clear();
    renderList();
  });
  document.getElementById('np-inverted').addEventListener('change', (e) => {
    currentOptions.inputInverted = e.target.checked;
    checkStates.clear();
    renderList();
  });

  // Close
  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.getElementById('np-close').addEventListener('click', close);

  // Accept selected
  document.getElementById('np-accept').addEventListener('click', () => {
    if (!field || rows.length === 0) return;
    const preview = computePreview();
    const accepted = preview.filter(r => r.hasChange && checkStates.get(r.filename));
    if (accepted.length === 0) { overlay.remove(); return; }

    const affectedFilenames = accepted.map(r => APP.specimens[r.index].filename);
    const _rwBefore = rewindCapture(affectedFilenames, [field]);

    for (const r of accepted) {
      const spec = APP.specimens[r.index];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields)
        APP.state.specimens[spec.filename].unconfirmed_fields = {};
      APP.state.specimens[spec.filename].unconfirmed_fields[field] = r.newVal;
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
    }

    rewindRecord('nameParser', 'Name Parser', `${currentFormat} (${accepted.length} specimen${accepted.length !== 1 ? 's' : ''})`, _rwBefore);
    scheduleSaveState(affectedFilenames);
    overlay.remove();
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  });
}

// ── Standardization Preview + Apply Engine ──────────────────

function getStandardizePreview(tool) {
  const results = [];
  // Operate on the currently selected field
  const allFields = focusField ? [focusField] : [];

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

  const affectedFilenames = [...new Set(preview.map(p => APP.specimens[p.index].filename))];
  const affectedFields = [...new Set(preview.map(p => p.field))];
  const _rwBefore = rewindCapture(affectedFilenames, affectedFields);

  for (const item of preview) {
    const spec = APP.specimens[item.index];
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
    APP.state.specimens[spec.filename].unconfirmed_fields[item.field] = item.newVal;
    APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
  }

  rewindRecord('standardize', 'Standardize', `${tool.label} (${preview.length} change${preview.length !== 1 ? 's' : ''})`, _rwBefore);
  scheduleSaveState(affectedFilenames);
  return preview.length;
}

function renderVoucherVisionBatchSection() {
  const container = document.getElementById('focus-vouchervision-list');
  if (!container) return;
  if (focusToolCategory !== 'vouchervision') { container.innerHTML = ''; return; }

  const fields = getReviewNotRequiredFields();
  container.innerHTML = renderFocusToolLauncher({
    description: 'Review fields marked review_not_required in the prompt and batch-accept VoucherVision content or replace it with one shared fallback value.',
    summaryItems: [
      `${fields.length} field${fields.length !== 1 ? 's' : ''} available`,
      `${APP.specimens.length} specimen${APP.specimens.length !== 1 ? 's' : ''}`
    ],
    buttonId: 'btn-open-vouchervision-batch',
    buttonLabel: 'Open Batch-Accept VoucherVision Content',
    disabled: fields.length === 0,
    note: fields.length === 0
      ? 'No prompt fields are currently marked review_not_required.'
      : 'This tool works across the whole project and ends in an Apply / Cancel confirmation.'
  });

  document.getElementById('btn-open-vouchervision-batch')?.addEventListener('click', showVoucherVisionBatchPopup);
}

function showVoucherVisionBatchPopup(initialChoices = null) {
  const fields = getReviewNotRequiredFields();
  if (fields.length === 0) return;

  const choices = Object.fromEntries(fields.map(field => {
    const initial = initialChoices?.[field];
    return [field, {
      mode: initial?.mode === 'replace' ? 'replace' : 'keep',
      value: initial?.value ?? '',
    }];
  }));
  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="vv-batch-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <div class="focus-popup-title-block">
          <div class="focus-popup-title">Batch-Accept VoucherVision Content</div>
          <div class="tool-instructions">Fields marked <strong>review_not_required</strong> do not need manual review. Choose whether to accept VoucherVision content verbatim into the Reviewed Record, or replace every cell in that field with a shared fallback value.</div>
        </div>
        ${popupCloseBtnHtml('vv-batch-close')}
      </div>
      <div class="vv-batch-summary">
        <span>${fields.length} field${fields.length !== 1 ? 's' : ''}</span>
        <span>${APP.specimens.length} specimen${APP.specimens.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="vv-batch-list" id="vv-batch-list">
        ${fields.map(field => `
          <div class="vv-batch-card" data-field="${escapeAttr(field)}">
            <div class="vv-batch-card-header">
              <span class="vv-batch-field-name">${escapeHtml(field)}</span>
              <span class="vv-batch-field-tag">No manual review required</span>
            </div>
            <div class="vv-batch-card-options">
              <button class="btn-sm vv-batch-choice active" type="button" data-field="${escapeAttr(field)}" data-mode="keep">Keep VoucherVision</button>
              <button class="btn-sm vv-batch-choice" type="button" data-field="${escapeAttr(field)}" data-mode="replace">Replace with</button>
              <input class="vv-batch-input" data-field="${escapeAttr(field)}" type="text" placeholder="Fallback value (leave blank for empty string)" style="display:none">
            </div>
            <div class="vv-batch-helper" data-field="${escapeAttr(field)}">Reviewed Record will keep VoucherVision content for every specimen in this field.</div>
          </div>
        `).join('')}
      </div>
      <div class="vv-batch-footer">
        <button class="btn-sm" id="vv-batch-cancel">Cancel</button>
        <button class="btn-sm btn-primary" id="vv-batch-apply">Apply Choices</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);

  const updateFieldUi = (field) => {
    const choice = choices[field];
    const card = overlay.querySelector(`.vv-batch-card[data-field="${CSS.escape(field)}"]`);
    if (!card) return;
    card.querySelectorAll('.vv-batch-choice').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === choice.mode);
    });
    const input = card.querySelector('.vv-batch-input');
    const helper = card.querySelector('.vv-batch-helper');
    if (input) {
      input.style.display = choice.mode === 'replace' ? '' : 'none';
      input.value = choice.value;
    }
    if (helper) {
      helper.textContent = choice.mode === 'keep'
        ? 'Reviewed Record will keep VoucherVision content for every specimen in this field.'
        : 'Reviewed Record will ignore VoucherVision content and use the fallback value for every specimen in this field.';
    }
  };

  fields.forEach(updateFieldUi);

  overlay.querySelectorAll('.vv-batch-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      choices[field].mode = btn.dataset.mode;
      updateFieldUi(field);
    });
  });
  overlay.querySelectorAll('.vv-batch-input').forEach(input => {
    input.addEventListener('input', () => {
      choices[input.dataset.field].value = input.value;
    });
  });

  document.getElementById('vv-batch-close')?.addEventListener('click', close);
  document.getElementById('vv-batch-cancel')?.addEventListener('click', close);
  document.getElementById('vv-batch-apply')?.addEventListener('click', async () => {
    await ensureAllSpecimensCached();
    const preview = buildVoucherVisionBatchPreview(choices);
    showApplyCancelPopup(
      'Apply Batch-Accept VoucherVision Content?',
      renderVoucherVisionBatchPreviewHtml(preview),
      async () => {
        await applyVoucherVisionBatchChoices(choices);
        close();
        showVoucherVisionBatchPopup(choices);
      },
      'Apply'
    );
  });
}

function buildVoucherVisionBatchPreview(choices) {
  const fields = Object.keys(choices || {});
  const specimens = APP.specimens || [];
  const totalCells = fields.length * specimens.length;
  const fieldSummaries = [];
  const sourceCounts = { ai: 0, edited: 0, user_added: 0, confirmed_empty: 0 };

  for (const field of fields) {
    const choice = choices[field];
    let fieldCellCount = 0;
    let fieldSourceCounts = { ai: 0, edited: 0, user_added: 0, confirmed_empty: 0 };

    for (const spec of specimens) {
      const aiValueRaw = tableDataCache[spec.filename]?.formatted_json?.[field];
      const aiValue = aiValueRaw !== undefined ? String(aiValueRaw) : '';
      const nextValue = choice.mode === 'keep' ? aiValue : choice.value;
      const source = choice.mode === 'keep'
        ? (nextValue === '' ? 'confirmed_empty' : 'ai')
        : deriveAcceptedSource(aiValue, nextValue);

      fieldCellCount++;
      fieldSourceCounts[source] = (fieldSourceCounts[source] || 0) + 1;
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }

    fieldSummaries.push({
      field,
      mode: choice.mode,
      value: choice.value,
      cellCount: fieldCellCount,
      sourceCounts: fieldSourceCounts,
    });
  }

  return {
    fields,
    specimens: specimens.length,
    totalCells,
    fieldSummaries,
    sourceCounts,
  };
}

function renderVoucherVisionBatchPreviewHtml(preview) {
  const sourceLabel = {
    ai: 'accepted',
    edited: 'accepted (edited)',
    user_added: 'accepted (added)',
    confirmed_empty: 'accepted (empty)',
  };

  const sourceSummary = ['ai', 'edited', 'user_added', 'confirmed_empty']
    .filter(key => (preview.sourceCounts[key] || 0) > 0)
    .map(key => `<strong>${preview.sourceCounts[key]}</strong> ${sourceLabel[key]}`)
    .join(' &middot; ');

  const fieldLines = preview.fieldSummaries.map(item => {
    const modeText = item.mode === 'keep'
      ? 'Keep VoucherVision content'
      : `Replace with <strong>${escapeHtml(item.value === '' ? '(empty string)' : item.value)}</strong>`;
    return `<div><strong>${escapeHtml(item.field)}</strong>: ${modeText} for <strong>${item.cellCount}</strong> cell${item.cellCount !== 1 ? 's' : ''}</div>`;
  }).join('');

  return `
    <div style="margin-bottom:10px">
      Confirm <strong>${preview.totalCells}</strong> cell${preview.totalCells !== 1 ? 's' : ''} across <strong>${preview.fields.length}</strong> field${preview.fields.length !== 1 ? 's' : ''} and <strong>${preview.specimens}</strong> specimen${preview.specimens !== 1 ? 's' : ''}.
    </div>
    <div style="margin-bottom:10px">${sourceSummary || 'No cells will be updated.'}</div>
    <div style="display:flex;flex-direction:column;gap:6px">${fieldLines}</div>
  `;
}

async function applyVoucherVisionBatchChoices(choices) {
  const fields = Object.keys(choices || {});
  if (fields.length === 0) return;

  await ensureAllSpecimensCached();
  const affectedFilenames = APP.specimens.map(spec => spec.filename);
  const _rwBefore = rewindCapture(affectedFilenames, fields, { categories_confirmed: true });

  for (const spec of APP.specimens) {
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const specState = APP.state.specimens[spec.filename];
    if (!specState.accepted_fields) specState.accepted_fields = {};
    if (!specState.unconfirmed_fields) specState.unconfirmed_fields = {};

    for (const field of fields) {
      const aiValueRaw = tableDataCache[spec.filename]?.formatted_json?.[field];
      const aiValue = aiValueRaw !== undefined ? String(aiValueRaw) : '';
      const choice = choices[field];
      const nextValue = choice.mode === 'keep' ? aiValue : choice.value;
      const source = choice.mode === 'keep'
        ? (nextValue === '' ? 'confirmed_empty' : 'ai')
        : deriveAcceptedSource(aiValue, nextValue);

      specState.accepted_fields[field] = {
        value: nextValue,
        source,
        batch_accepted_vouchervision: true,
      };
      delete specState.unconfirmed_fields[field];
    }

    specState.last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
  }

  const keptFields = fields.filter(field => choices[field].mode === 'keep');
  const replacedFields = fields.filter(field => choices[field].mode === 'replace');
  const summaryParts = [];
  if (keptFields.length > 0) summaryParts.push(`kept VV for ${keptFields.length} field${keptFields.length !== 1 ? 's' : ''}`);
  if (replacedFields.length > 0) summaryParts.push(`replaced ${replacedFields.length} field${replacedFields.length !== 1 ? 's' : ''}`);
  rewindRecord('batchAcceptVoucherVision', 'Batch-Accept VoucherVision Content', `${summaryParts.join(', ')} across ${APP.specimens.length} specimen${APP.specimens.length !== 1 ? 's' : ''}`, _rwBefore);
  scheduleSaveState(affectedFilenames);
  renderFocusSidebar(getFocusCategories());
  renderFocusMain();
}

function renderStandardizeSection() {
  const container = document.getElementById('focus-standardize-list');
  if (!container) return;

  // Skip expensive preview computation if standardize section isn't visible
  const activeCat = focusToolCategory;
  const stdCats = ['taxonomy', 'geography', 'collectors'];
  if (!activeCat || !stdCats.includes(activeCat)) {
    container.innerHTML = '';
    return;
  }
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
          ${tool.intent ? `<span class="std-tool-intent">${escapeHtml(tool.intent)}</span>` : ''}<span class="std-tool-label">${escapeHtml(tool.label)}</span>
          <span class="std-tool-fields">${[...new Set(preview.map(p => p.field))].map(f => escapeHtml(f)).join(', ')}</span>
          <span class="std-tool-count ${count > 0 ? 'has-changes' : ''}">${count > 0 ? count + ' affected' : 'no changes'}</span>
          <button class="btn-sm btn-primary std-tool-apply" data-tool-id="${tool.id}" ${count === 0 ? 'disabled' : ''}>Apply</button>
        </div>
        ${count > 0 ? `
          <div class="std-tool-preview">
            ${preview.slice(0, 20).map(p => `
              <div class="std-preview-row">
                <span class="spec-filename" style="min-width:100px">${escapeHtml(getDisplayFilename(p.filename, 20))}</span>
                <span style="font-size:var(--fs-10);color:var(--text-muted)">${escapeHtml(p.field)}</span>
                <span class="std-old-val">${escapeHtml(p.oldVal)}</span>
                <span style="color:var(--text-muted)">→</span>
                <span class="std-new-val">${escapeHtml(p.newVal)}</span>
              </div>
            `).join('')}
            ${preview.length > 20 ? `<div style="padding:4px 12px;font-size:var(--fs-10);color:var(--text-muted)">…and ${preview.length - 20} more</div>` : ''}
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
      const preview = getStandardizePreview(tool);
      showApplyCancelPopup(
        `Apply ${escapeHtml(tool.label)}?`,
        preview.length > 0
          ? `Apply <strong>${escapeHtml(tool.label)}</strong> to <strong>${preview.length}</strong> cell${preview.length !== 1 ? 's' : ''} within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`
          : `No changes would be made by <strong>${escapeHtml(tool.label)}</strong> within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`,
        () => {
          if (preview.length === 0) return;
          applyStandardizeTool(tool);
          renderFocusMain();
          renderFocusSidebar(getFocusCategories());
        },
        'Apply'
      );
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
  const count = detections.length;

  container.innerHTML = renderFocusToolLauncher({
    description: 'Detect authorship strings in scientificName and review the split into a dedicated destination field.',
    summaryItems: [
      `${count} specimen${count !== 1 ? 's' : ''} detected`,
      'review changes in popup'
    ],
    buttonId: 'btn-open-authorship',
    buttonLabel: 'Open Authorship Splitter',
    disabled: count === 0,
    note: count === 0 ? 'No authorship strings were detected in scientificName.' : 'Choose whether to remove or move authorship inside the popup before accepting changes.'
  });

  document.getElementById('btn-open-authorship')?.addEventListener('click', showAuthorshipPopup);
}

const WFO_BACKBONE_KEYS = [
  { id: 'order', label: 'Order' },
  { id: 'family', label: 'Family' },
  { id: 'genus', label: 'Genus' },
  { id: 'specificEpithet', label: 'Specific Epithet' },
  { id: 'species', label: 'Species (Genus species)' },
  { id: 'authorship', label: 'Authorship' },
  { id: 'fullSpeciesName', label: 'Full Species Name (Genus species Authorship)' },
];

let wfoBackboneFieldMap = {};

function getAvailableProjectFields() {
  const schema = APP.project?.prompt_field_schema;
  if (Array.isArray(schema) && schema.length > 0) return [...schema];
  const first = APP.specimens[0] ? tableDataCache[APP.specimens[0].filename] : null;
  return first ? Object.keys(first.formatted_json || {}) : [];
}

function pickPreferredField(allFields, candidates) {
  const lookup = new Map(allFields.map(field => [field.toLowerCase(), field]));
  for (const candidate of candidates) {
    const match = lookup.get(candidate.toLowerCase());
    if (match) return match;
  }
  return '';
}

function getDefaultWfoBackboneFieldMap(allFields) {
  return {
    order: pickPreferredField(allFields, ['order']),
    family: pickPreferredField(allFields, ['family']),
    genus: pickPreferredField(allFields, ['genus']),
    specificEpithet: pickPreferredField(allFields, ['specificEpithet', 'specific_epithet', 'epithet', 'specific epithet']),
    species: pickPreferredField(allFields, ['species', 'speciesBinomial', 'species_binomial', 'binomial']),
    authorship: pickPreferredField(allFields, ['scientificNameAuthorship', 'scientific_name_authorship', 'authorship']),
    fullSpeciesName: pickPreferredField(allFields, ['scientificName', 'scientific_name', 'fullSpeciesName', 'full_species_name']),
  };
}

function getNormalizedWfoBackboneFieldMap(allFields) {
  const defaults = getDefaultWfoBackboneFieldMap(allFields);
  const next = {};
  for (const key of WFO_BACKBONE_KEYS) {
    const saved = wfoBackboneFieldMap[key.id];
    next[key.id] = saved && allFields.includes(saved) ? saved : (defaults[key.id] || '');
  }
  return next;
}

function getWfoBackboneSourceName(wfo) {
  if (!wfo || typeof wfo !== 'object') return '';
  if (wfo.WFO_exact_match) return String(wfo.WFO_exact_match_name || '').trim();
  return String(wfo.WFO_best_match || wfo.WFO_exact_match_name || '').trim();
}

function parseWfoPlacement(placement) {
  const segments = String(placement || '')
    .split('|')
    .map(part => part.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { order: '', family: '', genus: '', specificEpithet: '', species: '', terminal: '', isTypicalSpecies: false };
  }

  const terminal = segments[segments.length - 1];
  const terminalParts = terminal.split(/\s+/).filter(Boolean);
  let order = [...segments].reverse().find(part => /ales$/i.test(part)) || '';
  let family = [...segments].reverse().find(part => /ceae$/i.test(part)) || '';
  let genus = '';
  let specificEpithet = '';
  let species = '';
  const isTypicalSpecies = terminalParts.length === 2;

  if (isTypicalSpecies) {
    species = terminal;
    genus = terminalParts[0];
    specificEpithet = terminalParts[1];
  } else if (/ceae$/i.test(terminal)) {
    family = terminal;
  } else {
    genus = terminal;
  }

  if (!family) {
    const familyIdx = isTypicalSpecies ? segments.length - 2 : segments.findIndex(part => part === genus) - 1;
    const candidate = familyIdx >= 0 ? segments[familyIdx] : '';
    if (candidate && /ceae$/i.test(candidate)) family = candidate;
  }

  if (!order && family) {
    const familyIndex = segments.lastIndexOf(family);
    const candidate = familyIndex > 0 ? segments[familyIndex - 1] : '';
    if (candidate && candidate !== family) order = candidate;
  }

  return { order, family, genus, specificEpithet, species, terminal, isTypicalSpecies };
}

function deriveWfoAuthorship(fullSpeciesName, species) {
  const value = String(fullSpeciesName || '').trim();
  if (!value) return '';
  if (species && value.toLowerCase().startsWith((species + ' ').toLowerCase())) {
    return value.slice(species.length).trim();
  }
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 2 ? parts.slice(2).join(' ') : '';
}

function getWfoBackboneSuggestion(spec) {
  const cached = tableDataCache[spec.filename] || {};
  const wfo = cached.WFO_info;
  if (!wfo || typeof wfo !== 'object') return null;

  const placement = parseWfoPlacement(wfo.WFO_placement);
  const fullSpeciesName = getWfoBackboneSourceName(wfo);
  const authorship = deriveWfoAuthorship(fullSpeciesName, placement.species);
  const hasSignal = !!(fullSpeciesName || wfo.WFO_placement);
  if (!hasSignal) return null;

  return {
    matchLabel: wfo.WFO_exact_match ? 'Exact' : (wfo.WFO_best_match ? 'Best' : 'No Match'),
    matchClass: wfo.WFO_exact_match ? 'exact' : (wfo.WFO_best_match ? 'best' : 'no-match'),
    matchGroup: wfo.WFO_exact_match ? 'exact' : (wfo.WFO_best_match ? 'best' : 'no_match'),
    order: placement.order || '',
    family: placement.family || '',
    genus: placement.genus || '',
    specificEpithet: placement.specificEpithet || '',
    species: placement.species || '',
    authorship,
    fullSpeciesName,
  };
}

function computeWfoBackboneRows(fieldMap) {
  const selectedKeys = WFO_BACKBONE_KEYS.filter(key => fieldMap[key.id]);
  const rows = [];

  for (const spec of APP.specimens) {
    const suggestion = getWfoBackboneSuggestion(spec);
    if (!suggestion) continue;

    const index = specimenIndexMap.get(spec.filename);
    const cells = selectedKeys.map(key => {
      const field = fieldMap[key.id];
      const currentValue = getCurrentFieldValue(spec, field);
      const suggestedValue = suggestion[key.id] || '';
      const wouldChange = currentValue !== suggestedValue;
      return { ...key, field, currentValue, suggestedValue, wouldChange };
    });

    rows.push({
      filename: spec.filename,
      index,
      matchLabel: suggestion.matchLabel,
      matchClass: suggestion.matchClass,
      matchGroup: suggestion.matchGroup,
      cells,
      hasChange: cells.some(cell => cell.wouldChange),
    });
  }

  return { rows, selectedKeys };
}

function renderWfoBackboneSection() {
  const container = document.getElementById('focus-wfo-backbone-list');
  if (!container) return;
  if (focusToolCategory !== 'taxonomy') { container.innerHTML = ''; return; }

  const availableCount = APP.specimens.filter(spec => !!getWfoBackboneSuggestion(spec)).length;
  container.innerHTML = renderFocusToolLauncher({
    description: 'Use WFO placement and exact or best-match names to populate taxonomy fields and review proposed corrections.',
    summaryItems: [
      `${availableCount} specimen${availableCount !== 1 ? 's' : ''} with WFO data`,
      'mapping + review popup'
    ],
    buttonId: 'btn-open-wfo-backbone',
    buttonLabel: 'Open WFO Backbone Assistant',
    disabled: availableCount === 0,
    note: availableCount === 0 ? 'No WFO backbone data is available in the current project.' : 'Start by mapping WFO keys to your record fields, then review exact, best, and no-match groups.'
  });

  document.getElementById('btn-open-wfo-backbone')?.addEventListener('click', showWfoBackboneFieldPopup);
}

function showWfoBackboneFieldPopup() {
  const allFields = getAvailableProjectFields();
  const currentMap = getNormalizedWfoBackboneFieldMap(allFields);

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="wfo-map-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <div class="focus-popup-title-block">
          <div class="focus-popup-title">WFO Backbone Assistant</div>
          <div class="tool-instructions">Choose which record fields should receive each WFO-derived value. Leave a dropdown blank if your schema does not have a matching field.</div>
        </div>
        ${popupCloseBtnHtml('wfo-map-close')}
      </div>
      <div class="wfo-map-body">
        <div class="wfo-map-grid">
          ${WFO_BACKBONE_KEYS.map(key => `
            <label class="wfo-map-row">
              <span class="wfo-map-label">${escapeHtml(key.label)}</span>
              <select data-wfo-key="${key.id}">
                <option value="">(none)</option>
                ${allFields.map(field => `<option value="${escapeAttr(field)}" ${currentMap[key.id] === field ? 'selected' : ''}>${escapeHtml(field)}</option>`).join('')}
              </select>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="wfo-map-footer">
        <button class="btn-sm" id="wfo-map-cancel">Cancel</button>
        <button class="btn-sm btn-primary" id="wfo-map-continue">Review Suggestions</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);

  const readMapping = () => {
    const next = {};
    overlay.querySelectorAll('select[data-wfo-key]').forEach(select => {
      next[select.dataset.wfoKey] = select.value || '';
    });
    return next;
  };

  document.getElementById('wfo-map-close')?.addEventListener('click', close);
  document.getElementById('wfo-map-cancel')?.addEventListener('click', close);
  document.getElementById('wfo-map-continue')?.addEventListener('click', () => {
    const nextMap = readMapping();
    if (!Object.values(nextMap).some(Boolean)) return;
    wfoBackboneFieldMap = nextMap;
    close();
    showWfoBackbonePopup(nextMap);
  });
}

function renderWfoComparisonCell(cell, options = {}) {
  const {
    editable = false,
    draftValue = '',
    filename = '',
    inputKey = '',
    inputContext = 'main',
  } = options;

  if (editable) {
    const currentDisplay = cell.currentValue !== ''
      ? `<span class="wfo-old-val" title="${escapeAttr(cell.currentValue)}">${escapeHtml(cell.currentValue)}</span>`
      : '<span class="wfo-old-val wfo-empty-val">(empty)</span>';
    return `
      <div class="wfo-compare-cell-inner wfo-compare-cell-editable">
        ${currentDisplay}
        <span class="wfo-inline-arrow">&rarr;</span>
        <input
          type="text"
          class="wfo-inline-input"
          data-file="${escapeAttr(filename)}"
          data-key="${escapeAttr(inputKey)}"
          data-context="${escapeAttr(inputContext)}"
          value="${escapeAttr(draftValue)}"
          placeholder="Enter value">
      </div>
    `;
  }

  if (!cell.wouldChange) return '<span class="auth-no-change">no change</span>';

  const renderValue = (value, className) => value !== ''
    ? `<span class="${className}" title="${escapeAttr(value)}">${escapeHtml(value)}</span>`
    : `<span class="${className} wfo-empty-val">(empty)</span>`;

  return `
    <div class="wfo-compare-cell-inner">
      ${renderValue(cell.currentValue, 'wfo-old-val')}
      <span class="wfo-inline-arrow">&rarr;</span>
      ${renderValue(cell.suggestedValue, 'wfo-new-val')}
    </div>
  `;
}

function renderPopupFlagButton(filename, tool = null) {
  const isFlagged = !!APP.state.specimens[filename]?.flagged;
  return `<button class="ocr-review-flag ${isFlagged ? 'flagged' : ''}" data-file="${escapeAttr(filename)}" data-tool="${escapeAttr(tool || '')}" title="${isFlagged ? 'Unflag specimen' : 'Flag specimen'}">${flagAndTagHtml(filename, 14, tool)}</button>`;
}

function wirePopupFlagButtons(container, onRefresh = () => {}) {
  container.querySelectorAll('.ocr-review-flag[data-file]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // If click landed on the inner tag.svg button, let wireTagIconButtons handle it
      if (e.target.closest('.flag-tag-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      const filename = btn.dataset.file;
      const tool = btn.dataset.tool || null;
      const spec = APP.specimens.find(item => item.filename === filename);
      toggleSpecimenFlagState(spec, {
        promptForNote: false,
        tool,
        updateUi: () => {
          renderFocusSidebar(getFocusCategories());
          renderFocusMain();
        }
      });
      onRefresh();
    });
  });
  wireTagIconButtons(container, onRefresh);
}

// Wires click handlers for .flag-tag-btn buttons (the tag.svg indicators).
// Clicking a red (active) tag removes this tool's tag; clicking a gray
// (inactive) tag adds this tool's tag. If removing a tag leaves zero tags,
// the specimen is auto-unflagged (nuclear reset).
function wireTagIconButtons(container, onRefresh = () => {}) {
  container.querySelectorAll('.flag-tag-btn[data-file][data-tool]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const filename = btn.dataset.file;
      const tool = btn.dataset.tool;
      if (!APP.state.specimens[filename]) initSpecimenState(filename);
      const st = APP.state.specimens[filename];
      if (!st.flagged) return;

      const _rwBefore = rewindCapture([filename], [], { flagged: true });
      if (specimenHasTagForTool(filename, tool)) {
        removeTagFromSpecimen(filename, tool);
        if ((st.flag_tags || []).length === 0) {
          st.flagged = false;
          st.flag_note = '';
        }
      } else {
        addTagToSpecimen(filename, tool);
      }
      st.last_touched = new Date().toISOString();
      rewindRecord('tagFlag', 'Tag Flag', `Tag ${FLAG_TOOL_LABELS[tool] || tool} on ${getDisplayFilename(filename)}`, _rwBefore);
      scheduleSaveState(filename);
      updateNavBar();
      onRefresh();
    });
  });
}

function wirePopupImageButtons(container) {
  container.querySelectorAll('[data-popup-image-file]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const filename = btn.dataset.popupImageFile;
      if (!filename) return;
      showSpecimenImageReferencePopup(
        filename,
        getDisplayFilename(filename),
        btn.dataset.popupImageFieldLabel || '',
        btn.dataset.popupImageFieldValue || ''
      );
    });
  });
}

// ── Popup QuickTools (shared per-row cluster) ───────────────────
// Centralized helper that renders the per-row action cluster shared across
// every tool popup (Date Format/Violation, Catalog Pattern, Elevation, OCR,
// WFO, Authorship, Name Parser). Order is fixed:
//   # index | image popup | goto form | flag | status square
// The goto button carries data-popup-goto-index and is wired by
// wirePopupGotoButtons. The photo button carries data-popup-image-file and is
// picked up by the existing wirePopupImageButtons. The flag button reuses
// renderPopupFlagButton and is picked up by wirePopupFlagButtons.
function renderPopupQuickTools(item, options = {}) {
  const {
    tool = null,
    photoFieldLabel = '',
    photoFieldValue = '',
    statusField = focusField,
    includePhoto = true,
    includeFlag = true,
    includeStatus = true,
    // Optional override: if provided, this HTML replaces the default image-popup
    // button. Used by tools that open a specialized reference popup instead of
    // the generic specimen image (e.g. WFO Backbone taxonomy comparison).
    photoButtonHtml = null,
  } = options;

  const indexHtml = `<span class="popup-quicktools-index">#${item.index + 1}</span>`;

  const photoHtml = !includePhoto ? '' : (photoButtonHtml !== null ? photoButtonHtml : `
    <button type="button"
            class="btn-icon popup-quicktools-photo"
            data-popup-image-file="${escapeAttr(item.filename)}"
            data-popup-image-field-label="${escapeAttr(photoFieldLabel || '')}"
            data-popup-image-field-value="${escapeAttr(String(photoFieldValue ?? ''))}"
            title="Open specimen image reference">
      <img src="icons/image.svg" alt="" aria-hidden="true">
    </button>
  `);

  const gotoHtml = `
    <button type="button"
            class="popup-quicktools-goto"
            data-popup-goto-index="${item.index}"
            title="Open in form view">
      <img src="icons/goto.svg" alt="" aria-hidden="true">
    </button>
  `;

  const flagHtml = includeFlag ? renderPopupFlagButton(item.filename, tool) : '';
  const statusHtml = includeStatus && statusField ? binStatusSquareHtml(item.index, statusField) : '';

  return `<span class="popup-quicktools">${indexHtml}${photoHtml}${gotoHtml}${flagHtml}${statusHtml}</span>`;
}

// Wire the goto-form buttons rendered by renderPopupQuickTools. closeFn is
// called to dismiss the popup before navigating; if omitted, the handler
// walks up to the nearest .image-modal-overlay and removes it.
function wirePopupGotoButtons(container, closeFn) {
  container.querySelectorAll('[data-popup-goto-index]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(btn.dataset.popupGotoIndex);
      if (isNaN(idx)) return;
      if (typeof closeFn === 'function') {
        closeFn();
      } else {
        btn.closest('.image-modal-overlay')?.remove();
      }
      showView('review');
      loadSpecimen(idx);
    });
  });
}

// One-call convenience that wires every button inside a popup quicktools
// cluster: image-popup, flag (+ tag toggles), and goto-form.
function wirePopupQuickTools(container, { closeFn = null, onFlagRefresh = () => {} } = {}) {
  wirePopupImageButtons(container);
  wirePopupFlagButtons(container, onFlagRefresh);
  wirePopupGotoButtons(container, closeFn);
}

function renderWfoPopupRow(row, selectedKeys, options = {}) {
  const {
    includeCheckbox = true,
    includeFlagButton = true,
    includePhotoButton = true,
    includeStatusSquare = true,
    checked = false,
    gridTemplate,
    isSelectable = row.hasChange,
    editableNoMatch = false,
    getDraftValue = () => '',
    inputContext = 'main',
    statusField = row.cells.find(item => item.field)?.field || '',
  } = options;
  const rowClass = options.rowClass || '';
  const checkCell = includeCheckbox
    ? `<span class="wfo-col-check"><input type="checkbox" data-file="${escapeAttr(row.filename)}" ${checked ? 'checked' : ''} ${!isSelectable ? 'disabled' : ''}></span>`
    : '<span class="wfo-col-check"></span>';

  const wfoPhotoBtnHtml = includePhotoButton
    ? `<button type="button" class="btn-icon popup-quicktools-photo wfo-photo-btn" data-file="${escapeAttr(row.filename)}" title="Open specimen image reference"><img src="icons/image.svg" alt="" aria-hidden="true"></button>`
    : '';
  const quickTools = renderPopupQuickTools(row, {
    tool: 'wfo',
    statusField,
    includePhoto: includePhotoButton,
    includeFlag: includeFlagButton,
    includeStatus: includeStatusSquare,
    photoButtonHtml: wfoPhotoBtnHtml,
  });

  const noChangeClass = (!editableNoMatch && !row.hasChange) ? 'no-change' : '';

  return `
    <div class="wfo-table-row ${noChangeClass} ${rowClass}" style="grid-template-columns:${gridTemplate}">
      ${quickTools}
      ${checkCell}
      <span class="wfo-col-file" title="${escapeAttr(getDisplayFilename(row.filename))}">${escapeHtml(getDisplayFilename(row.filename, 20))}</span>
      <span class="wfo-col-match"><span class="wfo-match-badge ${row.matchClass}">${escapeHtml(row.matchLabel)}</span></span>
      ${selectedKeys.map(key => {
        const cell = row.cells.find(item => item.id === key.id);
        return `<span class="wfo-col-field">${cell ? renderWfoComparisonCell(cell, {
          editable: editableNoMatch,
          draftValue: getDraftValue(cell),
          filename: row.filename,
          inputKey: cell.id,
          inputContext,
        }) : '<span class="auth-no-change">not mapped</span>'}</span>`;
      }).join('')}
    </div>
  `;
}

function showWfoSpecimenReferencePopup(row, selectedKeys, options = {}) {
  const switchId = `wfo-ref-switch-${Date.now()}`;
  let imageType = tableImageType;
  const gridTemplate = `146px 26px 110px 60px ${selectedKeys.map(() => 'minmax(150px, 1fr)').join(' ')}`;
  const {
    editableNoMatch = false,
    getDraftValue = () => '',
    setDraftValue = () => {},
    onClose = () => {},
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="wfo-reference-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <span>${escapeHtml(getDisplayFilename(row.filename))}</span>
        ${popupCloseBtnHtml('wfo-ref-close')}
      </div>
      <div class="wfo-reference-toggle" id="wfo-reference-toggle"></div>
      <div class="wfo-reference-preview">
        <div class="wfo-table-header wfo-reference-header" style="grid-template-columns:${gridTemplate}">
          <span class="popup-quicktools-header"></span>
          <span class="wfo-col-check"></span>
          <span class="wfo-col-file">Specimen</span>
          <span class="wfo-col-match">WFO</span>
          ${selectedKeys.map(key => `
            <span class="wfo-col-field-head">
              <span>${escapeHtml(key.label)}</span>
              <span class="wfo-col-field-name">${escapeHtml(row.cells.find(cell => cell.id === key.id)?.field || '')}</span>
            </span>
          `).join('')}
        </div>
        ${renderWfoPopupRow(row, selectedKeys, {
          includeCheckbox: false,
          includeFlagButton: false,
          includePhotoButton: false,
          gridTemplate,
          rowClass: 'wfo-table-row-readonly',
          editableNoMatch,
          getDraftValue,
          inputContext: 'reference'
        })}
      </div>
      <div class="wfo-reference-images" id="wfo-reference-images">
        <div class="table-image-placeholder">Loading...</div>
      </div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    onClose();
  };
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  document.getElementById('wfo-ref-close')?.addEventListener('click', close);
  overlay.querySelectorAll('.wfo-inline-input').forEach(input => {
    input.addEventListener('input', () => {
      setDraftValue(input.dataset.file, input.dataset.key, input.value);
    });
  });

  const sw = createSlideSwitch(switchId, [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadWfoReferenceImage();
  });
  const switchContainer = document.getElementById('wfo-reference-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = sw.html;
    sw.setup();
  }

  async function loadWfoReferenceImage() {
    const container = document.getElementById('wfo-reference-images');
    if (!container) return;
    container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, row.filename, imageType, 'full');
    if (!container.isConnected) return;
    if (dataUrl) {
      container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(row.filename))}">`;
    } else {
      container.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
    }
  }

  loadWfoReferenceImage();
}

function showWfoBackbonePopup(fieldMap, options = {}) {
  const { rows, selectedKeys } = computeWfoBackboneRows(fieldMap);
  const statusField = selectedKeys.map(key => fieldMap[key.id]).find(Boolean) || '';
  const gridTemplate = `146px 26px 110px 60px ${selectedKeys.map(() => 'minmax(150px, 1fr)').join(' ')}`;
  const checkStates = new Map();
  const manualNoMatchEdits = new Map();
  const matchCounts = {
    exact: rows.filter(row => row.matchGroup === 'exact').length,
    best: rows.filter(row => row.matchGroup === 'best').length,
    no_match: rows.filter(row => row.matchGroup === 'no_match').length,
  };
  let matchFilter = options.matchFilter && matchCounts[options.matchFilter] > 0
    ? options.matchFilter
    : ['exact', 'best', 'no_match'].find(group => matchCounts[group] > 0) || 'exact';
  let showNoChangeRows = false;

  rows.forEach(row => {
    if (!checkStates.has(row.filename)) checkStates.set(row.filename, row.matchGroup === 'no_match' ? false : row.hasChange);
  });

  const getMatchFilterLabel = (group) => {
    if (group === 'exact') return 'Exact';
    if (group === 'best') return 'Best';
    return 'No Match';
  };
  const getManualEditKey = (filename, key) => `${filename}::${key}`;
  const getDraftValue = (row, cell) => {
    if (row.matchGroup !== 'no_match') return cell.suggestedValue;
    const key = getManualEditKey(row.filename, cell.id);
    return manualNoMatchEdits.has(key) ? manualNoMatchEdits.get(key) : cell.currentValue;
  };
  const setDraftValue = (filename, key, value) => {
    manualNoMatchEdits.set(getManualEditKey(filename, key), value);
  };
  const isSelectableRow = (row) => row.matchGroup === 'no_match' ? true : row.hasChange;

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="wfo-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <div class="focus-popup-title-block">
          <div class="focus-popup-title">WFO Backbone Assistant</div>
          <div class="tool-instructions">Exact matches use <strong>WFO_exact_match_name</strong>; non-exact records fall back to <strong>WFO_best_match</strong>. Placement is parsed from <strong>WFO_placement</strong> to populate order, family, genus, and species parts.</div>
        </div>
        ${popupCloseBtnHtml('wfo-close')}
      </div>
      <div class="wfo-filter-bar">
        <div id="wfo-match-filter"></div>
      </div>
      <div class="name-parser-summary">
        <span id="wfo-count"></span>
        <button class="btn-sm btn-primary" id="wfo-accept">Accept WFO Suggestions</button>
      </div>
      <div class="wfo-table-header" style="grid-template-columns:${gridTemplate}">
        <span class="popup-quicktools-header"></span>
        <span class="wfo-col-check"></span>
        <span class="wfo-col-file">Specimen</span>
        <span class="wfo-col-match">WFO</span>
        ${selectedKeys.map(key => `
          <span class="wfo-col-field-head">
            <span>${escapeHtml(key.label)}</span>
            <span class="wfo-col-field-name">${escapeHtml(fieldMap[key.id])}</span>
          </span>
        `).join('')}
      </div>
      <div class="name-parser-list" id="wfo-list"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const filterSwitch = createSlideSwitch('wfo-match-filter', [
    { value: 'exact', label: `Exact (${matchCounts.exact})` },
    { value: 'best', label: `Best (${matchCounts.best})` },
    { value: 'no_match', label: `No Match (${matchCounts.no_match})` }
  ], matchFilter, (val) => {
    matchFilter = val;
    showNoChangeRows = false;
    renderList();
  });
  const filterContainer = document.getElementById('wfo-match-filter');
  if (filterContainer) {
    filterContainer.innerHTML = filterSwitch.html;
    filterSwitch.setup();
  }

  function renderList() {
    const filteredRows = rows.filter(row => row.matchGroup === matchFilter);
    const editableNoMatch = matchFilter === 'no_match';
    const changeRows = editableNoMatch ? filteredRows : filteredRows.filter(row => row.hasChange);
    const noChangeRows = editableNoMatch ? [] : filteredRows.filter(row => !row.hasChange);
    const changedCells = filteredRows.reduce((sum, row) => (
      sum + row.cells.filter(cell => getDraftValue(row, cell) !== cell.currentValue).length
    ), 0);
    const changedSpecimens = filteredRows.filter(row => row.cells.some(cell => getDraftValue(row, cell) !== cell.currentValue)).length;
    document.getElementById('wfo-count').textContent = editableNoMatch
      ? (changedCells > 0
          ? `${changedCells} manual edit${changedCells !== 1 ? 's' : ''} across ${changedSpecimens} specimen${changedSpecimens !== 1 ? 's' : ''}`
          : `${filteredRows.length} specimen${filteredRows.length !== 1 ? 's' : ''} ready for manual review`)
      : (changedCells > 0
          ? `${changedCells} field update${changedCells !== 1 ? 's' : ''} across ${changeRows.length} specimen${changeRows.length !== 1 ? 's' : ''}`
          : 'No changes needed in this group');

    const listEl = document.getElementById('wfo-list');
    listEl.innerHTML = `
      ${changeRows.length > 0
        ? changeRows.map(row => renderWfoPopupRow(row, selectedKeys, {
            includeCheckbox: true,
            includePhotoButton: true,
            checked: checkStates.get(row.filename),
            gridTemplate,
            statusField,
            isSelectable: isSelectableRow(row),
            editableNoMatch,
            getDraftValue: (cell) => getDraftValue(row, cell),
            inputContext: 'main'
          })).join('')
        : `<div class="wfo-empty-state">No rows in this match group currently require changes.</div>`
      }
      ${noChangeRows.length > 0 ? `
        <button class="wfo-nochange-toggle" id="wfo-nochange-toggle" type="button">
          <span>${showNoChangeRows ? '&#9660;' : '&#9654;'} ${noChangeRows.length} row${noChangeRows.length !== 1 ? 's' : ''} with no suggested changes</span>
          <span class="wfo-nochange-subtitle">hidden for now</span>
        </button>
        <div class="wfo-nochange-list" id="wfo-nochange-list" style="display:${showNoChangeRows ? '' : 'none'}">
          ${noChangeRows.map(row => renderWfoPopupRow(row, selectedKeys, {
            includeCheckbox: false,
            includePhotoButton: true,
            checked: false,
            gridTemplate,
            statusField,
            isSelectable: false,
            editableNoMatch: false,
            getDraftValue: (cell) => getDraftValue(row, cell)
          })).join('')}
        </div>
      ` : ''}
    `;

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => checkStates.set(cb.dataset.file, cb.checked));
    });
    wirePopupQuickTools(listEl, { closeFn: () => overlay.remove(), onFlagRefresh: renderList });
    listEl.querySelectorAll('.wfo-inline-input[data-context="main"]').forEach(input => {
      input.addEventListener('input', () => {
        setDraftValue(input.dataset.file, input.dataset.key, input.value);
      });
    });
    listEl.querySelector('#wfo-nochange-toggle')?.addEventListener('click', () => {
      showNoChangeRows = !showNoChangeRows;
      renderList();
    });
    listEl.querySelectorAll('.wfo-photo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rowData = rows.find(item => item.filename === btn.dataset.file);
        if (rowData) {
          showWfoSpecimenReferencePopup(rowData, selectedKeys, {
            editableNoMatch: rowData.matchGroup === 'no_match',
            getDraftValue: (cell) => getDraftValue(rowData, cell),
            setDraftValue,
            onClose: () => {
              if (matchFilter === 'no_match') renderList();
            }
          });
        }
      });
    });
  }

  renderList();

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.getElementById('wfo-close')?.addEventListener('click', close);

  const applyAcceptedRows = (accepted) => {
    if (accepted.length === 0) return;

    const affectedFilenames = accepted.map(row => APP.specimens[row.index].filename);
    const affectedFields = [...new Set(accepted.flatMap(row => row.cells.map(cell => cell.field)))];
    const _rwBefore = rewindCapture(affectedFilenames, affectedFields);

    for (const row of accepted) {
      const spec = APP.specimens[row.index];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};

      row.cells.forEach(cell => {
        stageFieldAsUnconfirmed(APP.state.specimens[spec.filename], cell.field, getDraftValue(row, cell));
      });
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      autoConfirmCategories(spec.filename);
    }

    const reviewedCells = accepted.reduce((sum, row) => sum + row.cells.length, 0);
    rewindRecord('wfoBackbone', 'WFO Backbone Assistant', `${reviewedCells} reviewed field${reviewedCells !== 1 ? 's' : ''} across ${accepted.length} specimen${accepted.length !== 1 ? 's' : ''}`, _rwBefore);
    scheduleSaveState(affectedFilenames);
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
    overlay.remove();
    showWfoBackbonePopup(fieldMap, { matchFilter });
  };

  document.getElementById('wfo-accept')?.addEventListener('click', () => {
    const accepted = rows.filter(row => row.matchGroup === matchFilter && isSelectableRow(row) && checkStates.get(row.filename));
    if (accepted.length === 0) return;

    const changedCells = accepted.reduce((sum, row) => sum + row.cells.filter(cell => getDraftValue(row, cell) !== cell.currentValue).length, 0);
    const unchangedCells = accepted.reduce((sum, row) => sum + row.cells.filter(cell => getDraftValue(row, cell) === cell.currentValue).length, 0);
    const changedFields = [...new Set(accepted.flatMap(row => row.cells.filter(cell => getDraftValue(row, cell) !== cell.currentValue).map(cell => cell.field)))];
    const unchangedFields = [...new Set(accepted.flatMap(row => row.cells.filter(cell => getDraftValue(row, cell) === cell.currentValue).map(cell => cell.field)))];
    const subsetLabel = getMatchFilterLabel(matchFilter);

    const parts = [];
    parts.push(`Apply the currently selected <strong>${subsetLabel}</strong> WFO subset for <strong>${accepted.length}</strong> specimen${accepted.length !== 1 ? 's' : ''}.`);
    parts.push(`This will stage <strong>${changedCells}</strong> ${matchFilter === 'no_match' ? 'manual edit' : 'suggested change'}${changedCells !== 1 ? 's' : ''}${changedFields.length > 0 ? ` across <strong>${escapeHtml(changedFields.join(', '))}</strong>` : ''} as <strong>Unconfirmed</strong>.`);
    if (unchangedCells > 0) {
      parts.push(`It will also tentatively confirm <strong>${unchangedCells}</strong> hidden unchanged cell${unchangedCells !== 1 ? 's' : ''}${unchangedFields.length > 0 ? ` across <strong>${escapeHtml(unchangedFields.join(', '))}</strong>` : ''} as part of this review pass.`);
    }

    showApplyCancelPopup(
      'Accept WFO Suggestions?',
      parts.join(' '),
      () => applyAcceptedRows(accepted),
      'Apply'
    );
  });
}

function renderAuthorshipPopupRow(row, options = {}) {
  const {
    checked = false,
    showDest = false,
    includeCheckbox = true,
    includeFlagButton = true,
    includePhotoButton = true,
    statusField = 'scientificName',
    rowClass = '',
  } = options;

  const authPhotoBtnHtml = includePhotoButton
    ? `<button type="button" class="btn-icon popup-quicktools-photo wfo-photo-btn auth-photo-btn" data-file="${escapeAttr(row.filename)}" title="Open specimen image reference"><img src="icons/image.svg" alt="" aria-hidden="true"></button>`
    : '';
  const authQuickTools = renderPopupQuickTools(row, {
    tool: 'authorship',
    statusField,
    includePhoto: includePhotoButton,
    includeFlag: includeFlagButton,
    includeStatus: !!statusField,
    photoButtonHtml: authPhotoBtnHtml,
  });
  return `
    <div class="auth-table-row ${row.hasChange ? '' : 'no-change'} ${rowClass}">
      ${authQuickTools}
      <span class="auth-col-check">${includeCheckbox ? `<input type="checkbox" data-file="${escapeAttr(row.filename)}" ${checked ? 'checked' : ''} ${!row.hasChange ? 'disabled' : ''}>` : ''}</span>
      <span class="auth-col-file" title="${escapeAttr(getDisplayFilename(row.filename))}">${escapeHtml(getDisplayFilename(row.filename, 20))}</span>
      <span class="auth-col-orig ${row.sciWouldChange ? 'auth-val-old' : ''}" title="${escapeAttr(row.original)}">${escapeHtml(row.original)}</span>
      <span class="auth-col-arrow">${row.sciWouldChange ? '&rarr;' : ''}</span>
      <span class="auth-col-new ${row.sciWouldChange ? 'auth-val-new' : ''}">${row.sciWouldChange ? escapeHtml(row.newSciName) : '<span class="auth-no-change">no change</span>'}</span>
      <span class="auth-col-split">${escapeHtml(row.authorship)}</span>
      <span class="auth-col-dest" style="${showDest ? '' : 'display:none'}" title="${escapeAttr(row.existingDest)}">${row.existingDest ? escapeHtml(row.existingDest) : '<em class="auth-empty">empty</em>'}</span>
      <span class="auth-col-arrow auth-col-dest-arrow" style="${showDest ? '' : 'display:none'}">${row.destWouldChange ? '&rarr;' : ''}</span>
      <span class="auth-col-dest" style="${showDest ? '' : 'display:none'}">${row.destWouldChange ? `<span class="auth-val-dest">${escapeHtml(row.authorship)}</span>` : '<span class="auth-no-change">no change</span>'}</span>
    </div>
  `;
}

function showAuthorshipSpecimenReferencePopup(row, options = {}) {
  const switchId = `auth-ref-switch-${Date.now()}`;
  let imageType = tableImageType;
  const { showDest = false, destField = '' } = options;

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';
  overlay.innerHTML = `
    <div class="wfo-reference-popup auth-reference-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <span>${escapeHtml(getDisplayFilename(row.filename))}</span>
        ${popupCloseBtnHtml('auth-ref-close')}
      </div>
      <div class="wfo-reference-toggle" id="auth-reference-toggle"></div>
      <div class="wfo-reference-preview">
        <div class="auth-table-header auth-reference-header">
          <span class="popup-quicktools-header"></span>
          <span class="auth-col-check"></span>
          <span class="auth-col-file">Specimen</span>
          <span class="auth-col-orig">scientificName (current)</span>
          <span class="auth-col-arrow"></span>
          <span class="auth-col-new">scientificName (after)</span>
          <span class="auth-col-split">Authorship</span>
          <span class="auth-col-dest" style="${showDest ? '' : 'display:none'}">${escapeHtml(destField)} (current)</span>
          <span class="auth-col-arrow auth-col-dest-arrow" style="${showDest ? '' : 'display:none'}"></span>
          <span class="auth-col-dest" style="${showDest ? '' : 'display:none'}">${escapeHtml(destField)} (after)</span>
        </div>
        ${renderAuthorshipPopupRow(row, {
          includeCheckbox: false,
          includeFlagButton: false,
          includePhotoButton: false,
          showDest,
          rowClass: 'wfo-table-row-readonly',
        })}
      </div>
      <div class="wfo-reference-images" id="auth-reference-images">
        <div class="table-image-placeholder">Loading...</div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  document.getElementById('auth-ref-close')?.addEventListener('click', close);

  const sw = createSlideSwitch(switchId, [
    { value: 'collage', label: 'Collage' },
    { value: 'original', label: 'Original' }
  ], imageType, (val) => {
    imageType = val;
    loadAuthReferenceImage();
  });
  const switchContainer = document.getElementById('auth-reference-toggle');
  if (switchContainer) {
    switchContainer.innerHTML = sw.html;
    sw.setup();
  }

  async function loadAuthReferenceImage() {
    const container = document.getElementById('auth-reference-images');
    if (!container) return;
    container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
    const dataUrl = await window.api.getImage(APP.folderPath, row.filename, imageType, 'full');
    if (!container.isConnected) return;
    if (dataUrl) {
      container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(row.filename))}">`;
      container.querySelector('img')?.addEventListener('click', () => openImageModal(dataUrl));
    } else {
      container.innerHTML = `<div class="table-image-placeholder">${imageType === 'original' ? 'Original not available' : 'No image'}</div>`;
    }
  }

  loadAuthReferenceImage();
}

function showAuthorshipPopup() {
  const detections = detectAuthorship();
  if (detections.length === 0) { alert('No authorship strings detected.'); return; }

  const first = APP.specimens[0] ? tableDataCache[APP.specimens[0].filename] : null;
  const allFields = first ? Object.keys(first.formatted_json || {}) : [];
  const defaultDest = allFields.includes('scientificNameAuthorship') ? 'scientificNameAuthorship' : (allFields[0] || '');

  let mode = 'move'; // 'remove' or 'move'
  let destField = defaultDest;
  const checkStates = new Map();

  function computeRows() {
    return detections.map(d => {
      const spec = APP.specimens[d.index];
      const newSciName = d.cleanName;
      const sciWouldChange = d.original !== newSciName;
      let existingDest = '', destWouldChange = false;
      if (mode === 'move' && destField) {
        existingDest = getCurrentFieldValue(spec, destField);
        destWouldChange = existingDest !== d.authorship;
      }
      const hasChange = sciWouldChange || destWouldChange;
      if (!checkStates.has(d.filename)) checkStates.set(d.filename, hasChange);
      return { ...d, newSciName, existingDest, destWouldChange, sciWouldChange, hasChange };
    });
  }

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div class="auth-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <div class="focus-popup-title-block">
          <div class="focus-popup-title">Authorship Splitter</div>
          <div class="tool-instructions">Detect authorship strings in scientificName and review the split into a dedicated destination field.</div>
        </div>
        ${popupCloseBtnHtml('auth-close')}
      </div>

      <div class="auth-mode-bar">
        <label class="auth-mode-option">
          <input type="radio" name="auth-mode" value="remove"> Remove authorship from <strong>scientificName</strong>
        </label>
        <label class="auth-mode-option">
          <input type="radio" name="auth-mode" value="move" checked> Move authorship to
          <select id="auth-dest-field">
            ${allFields.map(f => `<option value="${escapeAttr(f)}" ${f === destField ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="name-parser-summary">
        <span id="auth-count"></span>
        <button class="btn-sm btn-primary" id="auth-accept">Accept Selected</button>
      </div>
      <div class="auth-table-header" id="auth-table-header">
        <span class="popup-quicktools-header"></span>
        <span class="auth-col-check"></span>
        <span class="auth-col-file">Specimen</span>
        <span class="auth-col-orig">scientificName (current)</span>
        <span class="auth-col-arrow"></span>
        <span class="auth-col-new">scientificName (after)</span>
        <span class="auth-col-split">Authorship</span>
        <span class="auth-col-dest" id="auth-col-dest-header">${escapeHtml(destField)} (current)</span>
        <span class="auth-col-arrow"></span>
        <span class="auth-col-dest" id="auth-col-dest-after">${escapeHtml(destField)} (after)</span>
      </div>
      <div class="name-parser-list" id="auth-list"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  function updateHeaderVisibility() {
    const destCols = overlay.querySelectorAll('.auth-col-dest, .auth-col-dest-arrow');
    const show = mode === 'move' && destField;
    destCols.forEach(el => el.style.display = show ? '' : 'none');
    // Update header text
    if (show) {
      document.getElementById('auth-col-dest-header').textContent = destField + ' (current)';
      document.getElementById('auth-col-dest-after').textContent = destField + ' (after)';
    }
  }

  function renderList() {
    const rows = computeRows();
    const changeCount = rows.filter(r => r.hasChange).length;
    document.getElementById('auth-count').textContent = changeCount > 0
      ? `${changeCount} change${changeCount !== 1 ? 's' : ''}`
      : 'No changes needed';

    const showDest = mode === 'move' && destField;

    const listEl = document.getElementById('auth-list');
    listEl.innerHTML = rows.map(r => renderAuthorshipPopupRow(r, {
      checked: checkStates.get(r.filename),
      showDest,
    })).join('');

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => checkStates.set(cb.dataset.file, cb.checked));
    });
    wirePopupQuickTools(listEl, { closeFn: () => overlay.remove(), onFlagRefresh: renderList });
    listEl.querySelectorAll('.auth-photo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rowData = rows.find(item => item.filename === btn.dataset.file);
        if (rowData) showAuthorshipSpecimenReferencePopup(rowData, { showDest, destField });
      });
    });

    updateHeaderVisibility();
  }

  renderList();

  // Mode toggle
  overlay.querySelectorAll('input[name="auth-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      mode = radio.value;
      const sel = document.getElementById('auth-dest-field');
      sel.style.opacity = mode === 'move' ? '1' : '0.3';
      sel.style.pointerEvents = mode === 'move' ? '' : 'none';
      checkStates.clear();
      renderList();
    });
  });

  // Destination field change
  document.getElementById('auth-dest-field').addEventListener('change', (e) => {
    destField = e.target.value;
    checkStates.clear();
    renderList();
  });

  // Close
  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.getElementById('auth-close').addEventListener('click', close);

  // Accept selected
  document.getElementById('auth-accept').addEventListener('click', () => {
    const rows = computeRows();
    const accepted = rows.filter(r => r.hasChange && checkStates.get(r.filename));
    if (accepted.length === 0) { overlay.remove(); return; }

    // Determine which fields will be touched
    const affectedFields = ['scientificName'];
    if (mode === 'move' && destField) affectedFields.push(destField);
    const affectedFilenames = accepted.map(r => APP.specimens[r.index].filename);
    const _rwBefore = rewindCapture(affectedFilenames, affectedFields);

    for (const r of accepted) {
      const spec = APP.specimens[r.index];
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields)
        APP.state.specimens[spec.filename].unconfirmed_fields = {};
      if (r.sciWouldChange) {
        APP.state.specimens[spec.filename].unconfirmed_fields['scientificName'] = r.newSciName;
      }
      if (mode === 'move' && destField && r.destWouldChange) {
        APP.state.specimens[spec.filename].unconfirmed_fields[destField] = r.authorship;
      }
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
    }

    rewindRecord('authorshipSplit', 'Authorship Split', `${mode} (${accepted.length} specimen${accepted.length !== 1 ? 's' : ''})`, _rwBefore);
    scheduleSaveState(affectedFilenames);
    overlay.remove();
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  });
}

// ── Elevation Discrepancy Tool ───────────────────────────────

function getElevationReviewFields() {
  return getAvailableProjectFields().filter(field => /elevation|altitude/i.test(field));
}

function analyzeElevationDiscrepancy(selectedField = '') {
  const field = selectedField;
  if (!field) {
    return { items: [], groups: [], numericCount: 0, comparedCount: 0, flaggedCount: 0, hasAnyCop90: false };
  }

  const results = [];
  let numericCount = 0;
  let comparedCount = 0;

  for (const spec of APP.specimens) {
    const cached = tableDataCache[spec.filename];
    if (!cached) continue;
    const idx = specimenIndexMap.get(spec.filename);
    const rawValue = getCurrentFieldValue(spec, field);
    if (!rawValue || String(rawValue).trim() === '') continue;

    const elev = parseFloat(String(rawValue).replace(/,/g, ''));
    if (!Number.isFinite(elev)) continue;
    numericCount++;

    const cop90 = parseFloat(cached.COP90_elevation_m);
    const hasCop90 = Number.isFinite(cop90);

    let title = '';
    let status = '';
    let statusCls = '';
    let sortOrder = 99;
    let diff = null;

    if (elev > 8800) {
      title = 'Impossible (> 8800 m)';
      status = 'Impossible';
      statusCls = 'elev-error';
      sortOrder = 0;
    } else if (elev > 5000) {
      title = 'Extreme High (> 5000 m)';
      status = 'Extreme high';
      statusCls = 'elev-warn-high';
      sortOrder = 1;
    } else if (elev < -500) {
      title = 'Extreme Low (< -500 m)';
      status = 'Extreme low';
      statusCls = 'elev-warn-high';
      sortOrder = 2;
    } else if (hasCop90) {
      diff = Math.round(Math.abs(elev - cop90));
      if (diff > 1000) {
        title = 'COP90 Discrepancy 1000+ m';
        status = 'Check 1000+';
        statusCls = 'elev-warn-high';
        sortOrder = 3;
      } else if (diff > 500) {
        title = 'COP90 Discrepancy 500-1000 m';
        status = 'Check 500-1000';
        statusCls = 'elev-warn';
        sortOrder = 4;
      }
    }

    if (!title) continue;
    if (hasCop90) comparedCount++;

    results.push({
      filename: spec.filename,
      index: idx,
      field,
      value: elev,
      valueLabel: String(rawValue),
      cop90: hasCop90 ? cop90 : null,
      cop90Label: hasCop90 ? Math.round(cop90) : '',
      diff,
      hasCop90,
      status,
      statusCls,
      title,
      sortOrder,
    });
  }

  const groupMap = new Map();
  results.forEach(item => {
    if (!groupMap.has(item.title)) {
      groupMap.set(item.title, {
        title: item.title,
        sortOrder: item.sortOrder,
        items: [],
      });
    }
    groupMap.get(item.title).items.push(item);
  });

  const groups = [...groupMap.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  return {
    items: results,
    groups,
    numericCount,
    comparedCount,
    flaggedCount: results.length,
    hasAnyCop90: comparedCount > 0,
  };
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
  if (focusToolCategory !== 'geography') { container.innerHTML = ''; return; }

  const analysis = analyzeElevationDiscrepancy(focusField);
  const items = analysis.items;
  if (items.length === 0) {
    container.innerHTML = '<div class="focus-no-clusters">No extreme values or COP90 discrepancies detected for the current field</div>';
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
        <span style="font-size:var(--fs-10);color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
        <span class="spec-filename">${escapeHtml(getDisplayFilename(item.filename))}</span>
        <span style="font-size:var(--fs-10);color:var(--text-muted);min-width:60px;text-align:right">${escapeHtml(item.field)}</span>
        <span style="font-family:var(--font-mono);font-size:var(--fs-11);min-width:60px;text-align:right">${item.value}</span>
        <span style="font-family:var(--font-mono);font-size:var(--fs-11);min-width:60px;text-align:right;color:var(--text-muted)">${item.cop90}</span>
        <span style="font-family:var(--font-mono);font-size:var(--fs-11);min-width:50px;text-align:right">${item.diff}m</span>
        <span class="elev-status ${item.statusCls}">${item.status}</span>
      </div>
    `).join('')}
  `;

  container.querySelectorAll('.focus-clickable-row').forEach(row => {
    row.addEventListener('click', () => loadFocusImage(parseInt(row.dataset.index)));
  });
}


function applyFocusToolCategory(container) {
  const cat = focusToolCategory;
  const rows = container.querySelectorAll('.focus-tool-row');

  rows.forEach(row => {
    const cats = (row.dataset.toolCats || '').split(',');
    // Rows with deferred-visibility are hidden by default and shown only
    // by their deferred renderer when relevant content exists.
    const deferred = row.dataset.deferredVisibility === 'true';
    const visible = !deferred && cat ? cats.includes(cat) : false;
    row.style.display = visible ? '' : 'none';
  });
}

function renderFocusMain() {
  invalidateFieldIssueCounts(); // fresh counts for this render cycle

  const el = document.getElementById('focus-main');
  if (!el || !focusField) {
    if (el) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Select a field from the sidebar</div>';
    return;
  }

  // Preserve user-adjusted row heights and scroll positions across re-renders
  const _savedRowHeights = {};
  el.querySelectorAll('#focus-row-0, #focus-tools-area').forEach(row => {
    if (row.style.height) _savedRowHeights[row.id] = { height: row.style.height, flex: row.style.flex };
  });
  const _savedScrollPositions = {};
  el.querySelectorAll('.focus-section-body, .focus-specimens-list, .focus-facet-list').forEach(scrollable => {
    if (scrollable.scrollTop > 0) {
      const section = scrollable.closest('[data-section]');
      const key = section ? section.dataset.section : scrollable.className;
      _savedScrollPositions[key] = scrollable.scrollTop;
    }
  });

  const fieldValues = getAllValuesForField(focusField);

  // Tool analysis (clusters, dates, patterns) is deferred — runs after initial
  // paint so the spinner is visible. See renderDeferred*() at end of function.
  const clusteredValues = new Set(); // populated by deferred cluster analysis

  // Build facet data
  const valueCounts = {};
  for (const { value } of fieldValues) {
    valueCounts[value || ''] = (valueCounts[value || ''] || 0) + 1;
  }
  const facets = Object.entries(valueCounts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  const maxCount = facets.length > 0 ? facets[0].count : 1;

  const fixedSection = (key, title, badgeHtml, bodyHtml, extraHtml = '', extraAttrs = '') => `
    <div class="focus-section" id="focus-${key}-section" data-section="${key}" ${extraAttrs}>
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
    <div class="focus-key-strip">
      ${renderStatusLegend('status-key focus-key')}
    </div>

    <div class="focus-top-row" id="focus-row-0">
      ${fixedSection('values', 'Filter by Value', ` &middot; ${facets.length} unique`, `
        <div class="facet-list">
          ${facets.map(f => {
            const isClustered = clusteredValues.has(f.value) && focusToolCategory === 'patterns';
            return `
            <div class="facet-row ${focusFilter === f.value ? 'active' : ''} ${isClustered ? 'facet-clustered' : ''}" data-value="${escapeAttr(f.value)}">
              <span class="facet-value ${f.value === '' ? 'empty-val' : ''}">${f.value === '' ? '(empty)' : escapeHtml(f.value)}</span>
              <div class="facet-bar-container"><div class="facet-bar" style="width:${(f.count / maxCount) * 100}%${isClustered ? ';background:var(--warning)' : ''}"></div></div>
              <span class="facet-count" ${isClustered ? 'style="color:var(--warning)"' : ''}>${f.count}</span>
              ${isClustered ? '<span class="facet-flag">!</span>' : ''}
            </div>
          `}).join('')}
        </div>
      `)}
      <div class="resize-handle focus-inline-resize" id="focus-top-row-resize"></div>
      ${fixedSection('specimens', 'Specimens', focusFilter !== null ? ' &middot; filtered' : '', `
        <div class="focus-specimens-list" id="focus-specimens-list"></div>
      `, '<span style="flex:1"></span><span style="font-size:var(--fs-9);font-weight:400;color:var(--text-muted);text-transform:none;letter-spacing:0">Click text to edit</span>')}
    </div>

    <div class="focus-v-resize" id="focus-v-resize-top" data-above="focus-row-0" data-below="focus-tools-area"></div>

    <div class="focus-tools-area" id="focus-tools-area">
      <div class="focus-tool-category-bar">
        <div id="focus-tool-category-switch-container"></div>
      </div>
      <div class="focus-tool-sections" id="focus-tool-sections">
      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-1" data-tool-cats="patterns">
      ${section('clusters', 'N-Gram Clustering', '', `
        <div id="focus-cluster-content"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-2" data-tool-cats="dates">
      ${section('dates', 'Date Formats', '', `
        <div id="focus-dates-content"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-dateviolations" data-tool-cats="dates">
      ${section('dateViolations', 'Date Violations', '', `
        <div id="focus-dateviolations-content"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-nameparser" data-tool-cats="collectors">
      ${section('nameparser', 'Name Parser', '', `
        <div id="focus-name-parser-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-attribution" data-tool-cats="collectors">
      ${section('attribution', 'Attribution Tool', '', `
        <div id="focus-attribution-tool-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-auth" data-tool-cats="taxonomy">
      ${section('authorship', 'Authorship Detection', '', `
        <div id="focus-authorship-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-vouchervision" data-tool-cats="vouchervision">
      ${section('voucherVision', 'VoucherVision Tools', '', `
        <div id="focus-vouchervision-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-wfo-backbone" data-tool-cats="taxonomy">
      ${section('wfoBackbone', 'WFO Backbone Assistant', '', `
        <div id="focus-wfo-backbone-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-3" data-tool-cats="patterns">
      ${section('catalog', 'Catalog Patterns', '', `
        <div id="focus-patterns-content"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-ocr" data-tool-cats="ocr">
      ${section('ocrComparison', 'OCR Comparison', '', `
        <div id="focus-ocr-comparison-list"></div>
      `)}
      </div>

      <div class="focus-row focus-tool-row focus-tool-row-compact" id="focus-row-elev" data-tool-cats="geography">
        ${section('elevation', 'Elevation Discrepancy', '', `
          <div id="focus-elevation-list"></div>
        `)}
      </div>

      <!-- Standardization Tools is intentionally the LAST tool row so it
           always appears below the other tools within whichever category
           it's visible in (taxonomy / geography / collectors). -->
      <div class="focus-row focus-tool-row focus-tool-row-expand" id="focus-row-std" data-tool-cats="taxonomy,geography,collectors">
      ${section('standardize', 'Standardization Tools', '', `
        <div id="focus-standardize-list"></div>
      `)}
      </div>
      ${renderFocusConfirmFooter()}
    </div>
    </div>
  `;

  // Apply tool category visibility
  applyFocusToolCategory(el);

  // Restore user-adjusted row heights from before re-render
  for (const [id, saved] of Object.entries(_savedRowHeights)) {
    const row = document.getElementById(id);
    if (row) { row.style.height = saved.height; row.style.flex = saved.flex; }
  }

  // Restore scroll positions from before re-render
  el.querySelectorAll('.focus-section-body, .focus-specimens-list, .focus-facet-list').forEach(scrollable => {
    const section = scrollable.closest('[data-section]');
    const key = section ? section.dataset.section : scrollable.className;
    if (_savedScrollPositions[key]) scrollable.scrollTop = _savedScrollPositions[key];
  });

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
  initHorizontalSplitResize('focus-top-row-resize', 'focus-values-section', 'focus-specimens-section', 'focus-row-0', 0.20, 0.80, (ratio) => {
    focusTopRowWidthRatio = ratio;
  });
  if (focusTopRowWidthRatio !== null) {
    const valuesSection = document.getElementById('focus-values-section');
    const specimensSection = document.getElementById('focus-specimens-section');
    if (valuesSection && specimensSection) {
      valuesSection.style.width = `${focusTopRowWidthRatio * 100}%`;
      valuesSection.style.flex = 'none';
      specimensSection.style.width = `${(1 - focusTopRowWidthRatio) * 100}%`;
      specimensSection.style.flex = 'none';
    }
  }

  // Wire facet clicks — re-render everything when a value is selected
  el.querySelectorAll('.facet-row').forEach(row => {
    row.addEventListener('click', () => {
      const val = row.dataset.value;
      focusFilter = (focusFilter === val) ? null : val;
      renderFocusMain();
    });
  });

  // Track which panel the user last clicked in for arrow-key scrolling
  const specList = document.getElementById('focus-specimens-list');
  if (specList) specList.addEventListener('mousedown', () => { _focusActivePanel = 'specimens'; });
  const valSection = el.querySelector('[data-section="values"]');
  if (valSection) valSection.addEventListener('mousedown', () => { _focusActivePanel = 'values'; });
  el.querySelectorAll('.focus-tool-row .focus-section').forEach(sec => {
    const key = sec.dataset.section;
    if (key) sec.addEventListener('mousedown', () => { _focusActivePanel = key; });
  });

  // Complex review tools now launch dedicated popups from their section bodies.

  // Wire find & replace
  document.getElementById('focus-apply-replace')?.addEventListener('click', () => {
    const findVal = document.getElementById('focus-find').value;
    const replaceVal = document.getElementById('focus-replace').value;
    const preview = previewFindReplace(findVal, replaceVal);
    showApplyCancelPopup(
      'Apply Find & Replace?',
      preview.replaceEmptyCells
        ? (preview.count > 0
            ? `Replace <strong>empty</strong> cells with <strong>${escapeHtml(replaceVal)}</strong> in <strong>${preview.count}</strong> cell${preview.count !== 1 ? 's' : ''} across <strong>${preview.specimens.length}</strong> specimen${preview.specimens.length !== 1 ? 's' : ''} within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`
            : `No empty cells were found within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`)
        : (preview.count > 0
            ? `Replace <strong>${escapeHtml(findVal || '(empty)')}</strong> with <strong>${escapeHtml(replaceVal || '(empty)')}</strong> in <strong>${preview.count}</strong> cell${preview.count !== 1 ? 's' : ''} across <strong>${preview.specimens.length}</strong> specimen${preview.specimens.length !== 1 ? 's' : ''} within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`
            : `No matches were found for <strong>${escapeHtml(findVal || '(empty)')}</strong> within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`),
      () => { if (preview.count > 0) applyFindReplace(findVal, replaceVal); },
      'Apply'
    );
  });

  // Wire case transforms
  wireCaseControls('focus');
  wireWebSearch('focus');

  document.getElementById('focus-confirm-modified')?.addEventListener('click', () => {
    if (focusField) confirmModifiedField(focusField);
  });
  document.getElementById('focus-confirm-all')?.addEventListener('click', () => {
    if (focusField) showConfirmAllPopup(focusField);
  });

  // Tool category switch (supports deselection by clicking active option)
  const toolCats = getEditorToolCategories();
  if (focusToolCategory && !toolCats.includes(focusToolCategory)) {
    focusToolCategory = null;
  }
  const prevCat = focusToolCategory;
  const catOptions = toolCats.map(c => ({
    value: c,
    label: c === 'ocr' ? 'OCR' : c === 'vouchervision' ? 'VoucherVision' : c.charAt(0).toUpperCase() + c.slice(1)
  }));
  const catSw = createSlideSwitch('focus-tool-category-switch', catOptions, focusToolCategory || '', (val) => {
    if (val === prevCat) {
      focusToolCategory = null;
    } else {
      focusToolCategory = val;
    }
    renderFocusMain();
  });
  const catContainer = document.getElementById('focus-tool-category-switch-container');
  if (catContainer) {
    catContainer.innerHTML = catSw.html;
    catSw.setup();
  }

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
  renderClusterLauncherSection(fieldValues);
  renderDateFormatsLauncherSection(fieldValues);
  renderDateViolationsLauncherSection(fieldValues);
  renderStandardizeSection();
  renderVoucherVisionBatchSection();
  renderNameParserSection();
  renderAttributionToolSection();
  renderAuthorshipSection();
  renderWfoBackboneSection();
  renderCatalogPatternsLauncherSection(fieldValues);
  renderElevationLauncherSection();
  renderOcrComparisonLauncherSection(fieldValues);
  maybeRenderFocusCarousel(fieldValues);
  updateFocusPrimaryState();
  updateFocusConfirmButtons();

  // If the selected specimen isn't in the current filtered list, clear the image
  const visibleIndices = new Set(
    (focusFilter !== null ? fieldValues.filter(v => v.value === focusFilter) : fieldValues)
      .map(v => v.index)
  );
  if (tableSelectedIndex >= 0 && !visibleIndices.has(tableSelectedIndex)) {
    tableSelectedIndex = -1;
    const imgContainer = document.getElementById('focus-image-container');
    if (imgContainer) imgContainer.innerHTML = '<div class="table-image-placeholder">Select a specimen</div>';
    updateFocusOcrPanel(-1);
  }

}

function getFocusCarouselRenderKey() {
  const filterKey = focusFilter === null ? '__ALL__' : focusFilter;
  return `${_focusAnalysisVersion}|${focusField || ''}|${filterKey}|${tableImageType}`;
}

function maybeRenderFocusCarousel(fieldValues) {
  const carousel = document.getElementById('focus-carousel');
  if (!carousel) return;
  const nextKey = getFocusCarouselRenderKey();
  if (_focusCarouselRenderKey === nextKey && carousel.children.length > 0) {
    return;
  }
  _focusCarouselRenderKey = nextKey;
  renderFocusCarousel(fieldValues);
}

function renderDeferredClusters(fieldValues) {
  const container = document.getElementById('focus-cluster-content');
  if (!container) return;
  container.className = ''; // Remove spinner styles

  const nonEmptyValues = fieldValues
    .map(v => v.value)
    .filter(v => v !== '');
  if (nonEmptyValues.length > 1) {
    const uniqueCount = new Set(nonEmptyValues).size;
    if (uniqueCount === nonEmptyValues.length) {
      container.innerHTML = `<div class="focus-no-clusters">All entries in ${escapeHtml(focusField)} are unique</div>`;
      return;
    }
  }

  const clusters = getClusterAnalysis(focusField, fieldValues, focusFilter);

  // Update section header badge
  const header = container.closest('.focus-section')?.querySelector('.focus-section-header span');
  if (header && clusters.length > 0) {
    header.innerHTML = `Clusters &middot; <span style="color:var(--warning)">${clusters.length}</span>`;
  }

  if (clusters.length === 0) {
    container.innerHTML = '<div class="focus-no-clusters">No inconsistencies detected</div>';
  } else {
    container.innerHTML = clusters.map((c, ci) => `
      <div class="cluster-group">
        <div class="cluster-values">
          ${c.variants.map(v => `<span class="cluster-chip" data-filter-value="${escapeAttr(v.value)}" style="cursor:pointer" title="Click to filter">${escapeHtml(v.value)}<span class="chip-count">&times;${v.count}</span></span>`).join('')}
        </div>
        <div class="cluster-merge-row">
          <span style="font-size:var(--fs-11);color:var(--text-muted)">Merge to:</span>
          <input type="text" class="cluster-merge-input" id="cluster-input-${ci}" value="${escapeAttr(c.bestValue)}">
          <button class="btn-sm btn-primary" data-cluster="${ci}">Merge</button>
        </div>
      </div>
    `).join('');

    // Wire merge buttons
    container.querySelectorAll('[data-cluster]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ci = parseInt(btn.dataset.cluster);
        const input = document.getElementById(`cluster-input-${ci}`);
        if (!input) return;
        const mergeValue = input.value.trim();
        const count = clusters[ci].variants.reduce((sum, v) => sum + v.count, 0);
        showApplyCancelPopup(
          'Apply Cluster Merge?',
          `Merge <strong>${count}</strong> specimen value${count !== 1 ? 's' : ''} in <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''} to <strong>${escapeHtml(mergeValue)}</strong>?`,
          () => mergeCluster(clusters[ci], mergeValue),
          'Apply'
        );
      });
    });

    // Wire chip filter clicks
    container.querySelectorAll('.cluster-chip[data-filter-value]').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.dataset.filterValue;
        focusFilter = focusFilter === val ? null : val;
        const nextValues = getAllValuesForField(focusField);
        renderFocusSpecimens(nextValues);
        renderFocusCarousel(nextValues);
        updateFocusPrimaryState();
      });
    });
  }

  // Update facet clustered highlights
  for (const c of clusters) {
    for (const v of c.variants) {
      document.querySelectorAll(`.facet-row[data-value="${CSS.escape(v.value)}"]`).forEach(row => {
        row.classList.add('facet-clustered');
      });
    }
  }
}

// ── Bin specimen status helper ───────────────────────────────

function getFieldStatusClass(specimenIndex, field) {
  const spec = APP.specimens[specimenIndex];
  if (!spec) return 'pending';
  const st = APP.state.specimens?.[spec.filename];
  if (!st) return 'pending';
  if (st.unconfirmed_fields?.[field] !== undefined) return 'unconfirmed';
  if (st.accepted_fields?.[field]) return st.accepted_fields[field].source;
  return 'pending';
}

function binStatusSquareHtml(specimenIndex, field) {
  const cls = getFieldStatusClass(specimenIndex, field);
  return `<span class="field-status bin-status-square ${cls}" style="display:inline-block;width:8px;height:8px;padding:0;border-radius:2px;border:1px solid var(--text-muted);box-sizing:border-box;flex-shrink:0"></span>`;
}

// ── Bulk bin confirm / mark-unconfirmed helpers ─────────────
// In focus-mode bin review, "confirm" stages items as unconfirmed (orange
// square) so the user will double-check them later during specimen review.

function bulkBinMarkUnconfirmed(items, field) {
  const filenames = [];
  const _rwBefore = rewindCapture(items.map(i => APP.specimens[i.index]?.filename).filter(Boolean), [field], { categories_confirmed: true });
  for (const item of items) {
    const spec = APP.specimens[item.index];
    if (!spec) continue;
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const st = APP.state.specimens[spec.filename];
    const currentValue = getCurrentFieldValue(spec, field);
    stageFieldAsUnconfirmed(st, field, currentValue);
    st.last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    scheduleSaveState(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
    filenames.push(spec.filename);
  }
  if (filenames.length > 0) {
    rewindRecord('binMarkUnconfirmed', 'Bin Mark Unconfirmed', `"${field}" on ${filenames.length} specimen${filenames.length !== 1 ? 's' : ''}`, _rwBefore);
  }
}

function bulkBinClearUnconfirmed(items, field) {
  const filenames = [];
  const _rwBefore = rewindCapture(items.map(i => APP.specimens[i.index]?.filename).filter(Boolean), [field], { categories_confirmed: true });
  for (const item of items) {
    const spec = APP.specimens[item.index];
    if (!spec) continue;
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const st = APP.state.specimens[spec.filename];
    if (st.unconfirmed_fields?.[field] !== undefined) delete st.unconfirmed_fields[field];
    st.last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    scheduleSaveState(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
    filenames.push(spec.filename);
  }
  if (filenames.length > 0) {
    rewindRecord('binClearUnconfirmed', 'Bin Clear Unconfirmed', `"${field}" on ${filenames.length} specimen${filenames.length !== 1 ? 's' : ''}`, _rwBefore);
  }
}

function wireBinButtons(container) {
  container.querySelectorAll('.bin-confirm-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const binIdx = parseInt(btn.dataset.bin);
      const binEl = container.querySelectorAll('[data-bin-group]')[binIdx];
      if (!binEl) return;
      const indices = JSON.parse(binEl.dataset.binItems || '[]');
      const items = indices.map(i => ({ index: i }));
      bulkBinMarkUnconfirmed(items, focusField);
      renderFocusSidebar(getFocusCategories());
      renderFocusMain();
    });
  });
  container.querySelectorAll('.bin-uncertain-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const binIdx = parseInt(btn.dataset.bin);
      const binEl = container.querySelectorAll('[data-bin-group]')[binIdx];
      if (!binEl) return;
      const indices = JSON.parse(binEl.dataset.binItems || '[]');
      const items = indices.map(i => ({ index: i }));
      bulkBinClearUnconfirmed(items, focusField);
      renderFocusSidebar(getFocusCategories());
      renderFocusMain();
    });
  });
}

function renderDeferredDates(fieldValues) {
  const container = document.getElementById('focus-dates-content');
  if (!container) return;
  container.className = '';

  const dateFormats = analyzeDateFormats(fieldValues);

  // Update section header badge
  const header = container.closest('.focus-section')?.querySelector('.focus-section-header span');
  if (header && dateFormats.formats.length > 0) {
    header.innerHTML = `Date Formats &middot; ${dateFormats.formats.length} formats${dateFormats.inconsistent ? ' <span style="color:var(--warning)">!</span>' : ''}`;
  }

  if (dateFormats.formats.length === 0) {
    container.innerHTML = '<div class="focus-no-clusters">No date patterns detected</div>';
  } else {
    container.innerHTML = dateFormats.formats.map((f, fi) => {
      const isDominant = f.pattern === dateFormats.dominantFormat;
      const binIndices = JSON.stringify(f.items.map(i => i.index));
      return `
        <div style="border-bottom:1px solid var(--border)" data-bin-group="${fi}" data-bin-items='${binIndices}'>
          <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-tertiary)">
            <span style="font-family:var(--font-mono);font-size:var(--fs-11);font-weight:600;color:${isDominant ? 'var(--text-primary)' : 'var(--warning)'}">${escapeHtml(f.pattern)}</span>
            <div class="facet-bar-container"><div class="facet-bar" style="width:${(f.count / dateFormats.maxCount) * 100}%"></div></div>
            <span style="font-size:var(--fs-10);color:var(--text-muted)">${f.count}</span>
            ${!isDominant ? '<span style="font-size:var(--fs-9);color:var(--warning)">minority</span>' : ''}
            <span style="flex:1"></span>
            <button class="btn-icon bin-confirm-btn" data-bin="${fi}" title="Mark all in bin as unconfirmed (for review)" style="font-size:var(--fs-14);color:var(--accent);padding:0 2px">&#10003;</button>
            <button class="btn-icon bin-uncertain-btn" data-bin="${fi}" title="Clear unconfirmed status for all in bin" style="font-size:var(--fs-14);color:var(--text-muted);padding:0 2px">&#8635;</button>
          </div>
          <div>
            ${f.items.map(item => `
              <div class="focus-specimen-row focus-clickable-row" data-index="${item.index}" style="padding:2px 12px 2px 24px">
                <span style="font-size:var(--fs-10);color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
                ${binStatusSquareHtml(item.index, focusField)}
                <span class="spec-filename">${escapeHtml(getDisplayFilename(item.filename))}</span>
                <span class="spec-value focus-editable-cell" data-index="${item.index}" data-field="${escapeAttr(focusField)}" style="${!isDominant ? 'color:var(--accent)' : ''}">${escapeHtml(item.value)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Wire clickable rows
    container.querySelectorAll('.focus-clickable-row').forEach(row => {
      row.addEventListener('click', () => loadFocusImage(parseInt(row.dataset.index)));
    });
    container.querySelectorAll('.focus-editable-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(cell.dataset.index);
        loadFocusImage(idx);
        startFocusCellEdit(cell, idx, cell.dataset.field);
      });
    });
    wireBinButtons(container);
  }
}

function renderDeferredDateViolations(fieldValues) {
  const container = document.getElementById('focus-dateviolations-content');
  const row = document.getElementById('focus-row-dateviolations');
  if (!container || !row) return;
  container.className = '';

  const { violations, totalViolations } = analyzeDateViolations(fieldValues);

  // Hide entire row when there are no violations
  if (totalViolations === 0) {
    row.style.display = 'none';
    return;
  }
  row.style.display = '';

  // Update header badge
  const header = container.closest('.focus-section')?.querySelector('.focus-section-header span');
  if (header) {
    header.innerHTML = `Date Violations &middot; <span style="color:var(--warning)">${totalViolations}</span>`;
  }

  let binCounter = 0;
  const renderGroup = (title, items, color) => {
    if (items.length === 0) return '';
    const bi = binCounter++;
    const binIndices = JSON.stringify(items.map(i => i.index));
    return `
      <div style="border-bottom:1px solid var(--border)" data-bin-group="${bi}" data-bin-items='${binIndices}'>
        <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-tertiary)">
          <span style="font-family:var(--font-mono);font-size:var(--fs-11);font-weight:600;color:${color}">${title}</span>
          <span style="font-size:var(--fs-10);color:var(--text-muted)">${items.length}</span>
          <span style="flex:1"></span>
          <button class="btn-icon bin-confirm-btn" data-bin="${bi}" title="Mark all in bin as unconfirmed (for review)" style="font-size:var(--fs-14);color:var(--accent);padding:0 2px">&#10003;</button>
          <button class="btn-icon bin-uncertain-btn" data-bin="${bi}" title="Clear unconfirmed status for all in bin" style="font-size:var(--fs-14);color:var(--text-muted);padding:0 2px">&#8635;</button>
        </div>
        <div>
          ${items.map(item => `
            <div class="focus-specimen-row focus-clickable-row" data-index="${item.index}" style="padding:2px 12px 2px 24px">
              <span style="font-size:var(--fs-10);color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
              ${binStatusSquareHtml(item.index, focusField)}
              <span class="spec-filename">${escapeHtml(getDisplayFilename(item.filename))}</span>
              <span class="spec-value focus-editable-cell" data-index="${item.index}" data-field="${escapeAttr(focusField)}" style="color:var(--accent)">${escapeHtml(item.value)}</span>
              <span style="font-size:var(--fs-9);color:var(--text-muted);margin-left:auto">${escapeHtml(item.detail)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  container.innerHTML =
    renderGroup('Swapped Month/Day (DD > 12 in month position)', violations.swapped, 'var(--warning)') +
    renderGroup('Suspicious: Year < 1400', violations.tooOld, 'var(--warning)') +
    renderGroup(`Suspicious: Year > ${_dateViolationCurrentYear} (future)`, violations.future, 'var(--warning)');

  // Wire clickable rows
  container.querySelectorAll('.focus-clickable-row').forEach(row => {
    row.addEventListener('click', () => loadFocusImage(parseInt(row.dataset.index)));
  });
  container.querySelectorAll('.focus-editable-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(cell.dataset.index);
      loadFocusImage(idx);
      startFocusCellEdit(cell, idx, cell.dataset.field);
    });
  });
  wireBinButtons(container);
}

function renderDeferredPatterns(fieldValues) {
  const container = document.getElementById('focus-patterns-content');
  if (!container) return;
  container.className = '';

  const catalogPatterns = analyzeCatalogPatterns(fieldValues);
  const sequenceGapAnalysis = analyzeSequenceGaps(fieldValues);
  const hasSequencePatterns = sequenceGapAnalysis.totalPatterns > 0;
  const hasSequenceIssues = sequenceGapAnalysis.groups.length > 0;
  const sequenceSummary = hasSequencePatterns
    ? `${sequenceGapAnalysis.totalPatterns} numeric pattern${sequenceGapAnalysis.totalPatterns !== 1 ? 's' : ''} detected${hasSequenceIssues ? `, ${sequenceGapAnalysis.groups.length} with gaps or duplicates` : ''}`
    : 'No numeric sequences detected in this field';

  // Update section header badge
  const header = container.closest('.focus-section')?.querySelector('.focus-section-header span');
  if (header && catalogPatterns.patterns.length > 0) {
    const outliers = catalogPatterns.patterns.length > 1
      ? catalogPatterns.patterns.slice(1).reduce((s, p) => s + p.count, 0)
      : 0;
    header.innerHTML = `Catalog Patterns &middot; ${outliers > 0 ? '<span style="color:var(--warning)">' + outliers + ' outliers</span>' : 'consistent'}`;
  }

  if (catalogPatterns.patterns.length === 0) {
    container.innerHTML = `
      <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:var(--bg-tertiary)">
        <button class="btn-sm btn-primary" id="btn-open-gap-check" ${hasSequencePatterns ? '' : 'disabled'}>Check for gaps in sequence</button>
        <span style="font-size:var(--fs-11);color:var(--text-muted)">
          ${sequenceSummary}
        </span>
      </div>
      <div class="focus-no-clusters">No catalog patterns detected</div>
    `;
  } else {
    container.innerHTML = `
      <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:var(--bg-tertiary)">
        <button class="btn-sm btn-primary" id="btn-open-gap-check" ${hasSequencePatterns ? '' : 'disabled'}>Check for gaps in sequence</button>
        <span style="font-size:var(--fs-11);color:var(--text-muted)">
          ${sequenceSummary}
        </span>
      </div>
      ${catalogPatterns.patterns.map((p, pi) => {
        const isDominant = p.pattern === catalogPatterns.dominantPattern;
        const binIndices = JSON.stringify(p.items.map(i => i.index));
        return `
          <div style="border-bottom:1px solid var(--border)" data-bin-group="${pi}" data-bin-items='${binIndices}'>
            <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-tertiary)">
              <span style="font-family:var(--font-mono);font-size:var(--fs-11);font-weight:600;color:${isDominant ? 'var(--text-primary)' : 'var(--warning)'}">${escapeHtml(p.pattern)}</span>
              <span style="font-size:var(--fs-10);color:var(--text-muted)">(e.g. ${escapeHtml(p.example)})</span>
              <div class="facet-bar-container" style="margin-left:auto"><div class="facet-bar" style="width:${(p.count / catalogPatterns.maxCount) * 100}%"></div></div>
              <span style="font-size:var(--fs-10);color:var(--text-muted)">${p.count}</span>
              <button class="btn-icon bin-confirm-btn" data-bin="${pi}" title="Mark all in bin as unconfirmed (for review)" style="font-size:var(--fs-14);color:var(--accent);padding:0 2px">&#10003;</button>
              <button class="btn-icon bin-uncertain-btn" data-bin="${pi}" title="Clear unconfirmed status for all in bin" style="font-size:var(--fs-14);color:var(--text-muted);padding:0 2px">&#8635;</button>
            </div>
            <div>
              ${p.items.map(item => `
                <div class="focus-specimen-row focus-clickable-row" data-index="${item.index}" style="padding:2px 12px 2px 24px">
                  <span style="font-size:var(--fs-10);color:var(--text-muted);min-width:24px">#${item.index + 1}</span>
                  ${binStatusSquareHtml(item.index, focusField)}
                  <span class="spec-filename">${escapeHtml(getDisplayFilename(item.filename))}</span>
                  <span class="spec-value focus-editable-cell" data-index="${item.index}" data-field="${escapeAttr(focusField)}" style="${!isDominant ? 'color:var(--accent)' : ''}">${escapeHtml(item.value)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;

    // Wire clickable rows
    container.querySelectorAll('.focus-clickable-row').forEach(row => {
      row.addEventListener('click', () => loadFocusImage(parseInt(row.dataset.index)));
    });
    container.querySelectorAll('.focus-editable-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(cell.dataset.index);
        loadFocusImage(idx);
        startFocusCellEdit(cell, idx, cell.dataset.field);
      });
    });
    wireBinButtons(container);
  }

  document.getElementById('btn-open-gap-check')?.addEventListener('click', () => {
    showSequenceGapPopup(fieldValues, focusField);
  });
}

// ── Date Format Analyzer ────────────────────────────────────

function analyzeDateFormats(fieldValues) {
  // Zero-placeholder patterns must be checked first (most specific → least)
  // because they also match the generic \d{4}-\d{2}-\d{2} pattern.
  const datePatterns = [
    { regex: /^0000-00-00$/, name: '0000-00-00 (unknown)' },
    { regex: /^0000-00-\d{2}$/, name: '0000-00-DD (day only)' },
    { regex: /^0000-\d{2}-00$/, name: '0000-MM-00 (month only)' },
    { regex: /^0000-\d{2}-\d{2}$/, name: '0000-MM-DD (no year)' },
    { regex: /^\d{4}-00-00$/, name: 'YYYY-00-00 (year only)' },
    { regex: /^\d{4}-\d{2}-00$/, name: 'YYYY-MM-00 (no day)' },
    { regex: /^\d{4}-00-\d{2}$/, name: 'YYYY-00-DD (no month)' },
    { regex: /^\d{4}-\d{2}-\d{2}$/, name: 'YYYY-MM-DD' },
    { regex: /^\d{4}\/\d{2}\/\d{2}$/, name: 'YYYY/MM/DD' },
    { regex: /^\d{2}-\d{2}-\d{4}$/, name: 'DD-MM-YYYY' },
    { regex: /^\d{2}\/\d{2}\/\d{4}$/, name: 'DD/MM/YYYY' },
    { regex: /^\d{2}\.\d{2}\.\d{4}$/, name: 'DD.MM.YYYY' },
    { regex: /^\d{1,2}\s+\w+\s+\d{4}$/, name: 'D Month YYYY' },
    { regex: /^\w+\s+\d{1,2},?\s+\d{4}$/, name: 'Month D, YYYY' },
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

  // Sort minority (outlier) patterns first so reviewers see them immediately;
  // the dominant pattern goes last.
  if (formats.length > 1) {
    const dominant = formats.shift();          // remove the largest
    formats.sort((a, b) => a.count - b.count); // smallest outliers first
    formats.push(dominant);                     // dominant at the end
  }

  return { formats, maxCount, dominantFormat, inconsistent };
}

// ── Date Violation Analyzer ─────────────────────────────────

// Loaded once per session — today's year for future-date checks
const _dateViolationCurrentYear = new Date().getFullYear();

function analyzeDateViolations(fieldValues) {
  const violations = {
    swapped: [],   // YYYY-DD-MM where DD > 12 (month/day swap)
    tooOld: [],    // year < 1400
    future: [],    // year > current year
  };

  for (const item of fieldValues) {
    if (!item.value || item.value.trim() === '') continue;
    const v = item.value.trim();

    // Only check YYYY-MM-DD and YYYY/MM/DD formatted dates
    const m = v.match(/^(\d{4})([-/])(\d{2})\2(\d{2})$/);
    if (!m) continue;

    const year = parseInt(m[1], 10);
    const part2 = parseInt(m[3], 10); // should be month
    const part3 = parseInt(m[4], 10); // should be day

    // Skip if zeros (handled by date format bins)
    if (year === 0 && part2 === 0 && part3 === 0) continue;

    // Check for swapped month/day: if the "month" slot > 12, it's likely a day
    if (part2 > 12) {
      violations.swapped.push({ ...item, detail: `month position = ${part2}` });
    }

    // Skip year checks for placeholder years
    if (year === 0) continue;

    if (year < 1400) {
      violations.tooOld.push({ ...item, detail: `year = ${year}` });
    } else if (year > _dateViolationCurrentYear) {
      violations.future.push({ ...item, detail: `year = ${year}` });
    }
  }

  const totalViolations = violations.swapped.length + violations.tooOld.length + violations.future.length;
  return { violations, totalViolations };
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

  // Sort minority (outlier) patterns first so reviewers see them immediately;
  // the dominant pattern goes last.
  if (patterns.length > 1) {
    const dominant = patterns.shift();
    patterns.sort((a, b) => a.count - b.count);
    patterns.push(dominant);
  }

  return { patterns, maxCount, dominantPattern };
}

function extractSequenceToken(value) {
  const str = String(value || '');
  const matches = [...str.matchAll(/\d+/g)];
  if (matches.length === 0) return null;

  let best = matches[0];
  for (const match of matches) {
    if (match[0].length > best[0].length) best = match;
  }

  const index = best.index || 0;
  const numberStr = best[0];
  return {
    original: str,
    prefix: str.slice(0, index),
    numberStr,
    suffix: str.slice(index + numberStr.length),
    width: numberStr.length,
    number: parseInt(numberStr, 10),
  };
}

function formatSequenceNumber(prefix, number, width, suffix) {
  return `${prefix}${String(number).padStart(width, '0')}${suffix}`;
}

function analyzeSequenceGaps(fieldValues) {
  const groups = new Map();
  const MAX_MISSING_TO_LIST = 5000;
  const MAX_DUPLICATES_TO_LIST = 500;

  for (const item of fieldValues) {
    if (!item.value || item.value.trim() === '') continue;
    const token = extractSequenceToken(item.value);
    if (!token || Number.isNaN(token.number)) continue;

    const key = `${token.prefix}\u0000${token.suffix}\u0000${token.width}`;
    if (!groups.has(key)) {
      groups.set(key, {
        prefix: token.prefix,
        suffix: token.suffix,
        width: token.width,
        example: item.value,
        entries: [],
      });
    }
    groups.get(key).entries.push({ ...item, ...token });
  }

  const result = [];
  let totalPatterns = 0;
  for (const group of groups.values()) {
    totalPatterns++;
    const entriesByNumber = new Map();
    for (const entry of group.entries) {
      if (!entriesByNumber.has(entry.number)) entriesByNumber.set(entry.number, []);
      entriesByNumber.get(entry.number).push(entry);
    }

    const sortedNumbers = [...entriesByNumber.keys()].sort((a, b) => a - b);

    const missingValues = [];
    let missingCount = 0;
    let truncated = false;
    if (sortedNumbers.length >= 2) {
      for (let i = 1; i < sortedNumbers.length; i++) {
        for (let n = sortedNumbers[i - 1] + 1; n < sortedNumbers[i]; n++) {
          missingCount++;
          if (missingValues.length < MAX_MISSING_TO_LIST) {
            missingValues.push(formatSequenceNumber(group.prefix, n, group.width, group.suffix));
          } else {
            truncated = true;
          }
        }
      }
    }

    const duplicateValues = [];
    let duplicateCount = 0;
    let duplicateEntries = 0;
    let duplicatesTruncated = false;
    for (const number of sortedNumbers) {
      const entries = entriesByNumber.get(number) || [];
      if (entries.length <= 1) continue;
      duplicateCount++;
      duplicateEntries += entries.length - 1;
      if (duplicateValues.length < MAX_DUPLICATES_TO_LIST) {
        duplicateValues.push({
          value: formatSequenceNumber(group.prefix, number, group.width, group.suffix),
          count: entries.length,
          filenames: entries.map(entry => entry.filename),
        });
      } else {
        duplicatesTruncated = true;
      }
    }

    if (missingCount === 0 && duplicateCount === 0) continue;

    result.push({
      ...group,
      start: sortedNumbers[0] ?? null,
      end: sortedNumbers[sortedNumbers.length - 1] ?? null,
      uniqueCount: sortedNumbers.length,
      missingCount,
      missingValues,
      truncated,
      duplicateCount,
      duplicateEntries,
      duplicateValues,
      duplicatesTruncated,
    });
  }

  result.sort((a, b) => {
    if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
    if (b.duplicateEntries !== a.duplicateEntries) return b.duplicateEntries - a.duplicateEntries;
    return a.example.localeCompare(b.example);
  });

  return { groups: result, totalPatterns };
}

function showSequenceGapPopup(cachedFieldValues, selectedField = focusField) {
  const field = selectedField;
  if (!field) return;

  const fieldValues = cachedFieldValues || getAllValuesForField(field);
  const analysis = analyzeSequenceGaps(fieldValues);

  const overlay = document.createElement('div');
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  const totalMissing = analysis.groups.reduce((sum, g) => sum + g.missingCount, 0);
  const totalDuplicateValues = analysis.groups.reduce((sum, g) => sum + g.duplicateCount, 0);
  const totalDuplicateEntries = analysis.groups.reduce((sum, g) => sum + g.duplicateEntries, 0);
  const summary = analysis.totalPatterns === 0
    ? `No numeric sequences were detected for ${field}.`
    : analysis.groups.length === 0
      ? `${analysis.totalPatterns} sequence pattern${analysis.totalPatterns !== 1 ? 's' : ''} detected for ${field}, with no gaps or duplicates found.`
      : `${analysis.groups.length} of ${analysis.totalPatterns} sequence pattern${analysis.totalPatterns !== 1 ? 's' : ''} found with ${totalMissing} missing number${totalMissing !== 1 ? 's' : ''} and ${totalDuplicateEntries} duplicate entr${totalDuplicateEntries === 1 ? 'y' : 'ies'} across ${totalDuplicateValues} repeated value${totalDuplicateValues === 1 ? '' : 's'}.`;

  overlay.innerHTML = `
    <div class="name-parser-popup" onclick="event.stopPropagation()">
      <div class="name-parser-header">
        <span>Check for gaps and duplicates</span>
        ${popupCloseBtnHtml('gap-close')}
      </div>
      <div class="name-parser-summary">
        <span>${escapeHtml(summary)}</span>
        <span style="font-family:var(--font-mono);font-size:var(--fs-11);color:var(--text-muted)">${escapeHtml(field)}</span>
      </div>
      <div class="name-parser-list" id="gap-list"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const listEl = document.getElementById('gap-list');
  if (analysis.totalPatterns === 0) {
    listEl.innerHTML = '<div class="focus-no-clusters" style="padding:24px">No numeric sequences detected</div>';
  } else if (analysis.groups.length === 0) {
    listEl.innerHTML = '<div class="focus-no-clusters" style="padding:24px">No gaps or duplicates detected</div>';
  } else {
    listEl.innerHTML = analysis.groups.map(group => `
      <div style="border-bottom:1px solid var(--border)">
        <div style="padding:10px 20px;background:var(--bg-tertiary);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-family:var(--font-mono);font-size:var(--fs-11);color:var(--text-primary);font-weight:600">${escapeHtml(group.example)}</span>
          ${group.start !== null && group.end !== null ? `<span style="font-size:var(--fs-10);color:var(--text-muted)">Range ${group.start}–${group.end}</span>` : ''}
          <span style="font-size:var(--fs-10);color:var(--text-muted)">${group.uniqueCount} present</span>
          <span style="font-size:var(--fs-10);color:${group.missingCount > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${group.missingCount} missing</span>
          <span style="font-size:var(--fs-10);color:${group.duplicateEntries > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${group.duplicateEntries} duplicate entr${group.duplicateEntries === 1 ? 'y' : 'ies'}</span>
        </div>
        ${group.missingCount === 0 && group.duplicateEntries === 0 ? `
          <div class="focus-no-clusters" style="padding:16px">No gaps or duplicates in this sequence</div>
        ` : `
          <div style="max-height:220px;overflow-y:auto;padding:8px 0">
            ${group.missingCount === 0 ? `
              <div class="name-parser-row" style="padding:6px 20px;color:var(--text-muted)">
                <span>No missing sequence numbers</span>
              </div>
            ` : ''}
            ${group.missingValues.map(value => `
              <div class="name-parser-row" style="padding:4px 20px">
                <span class="np-filename" style="min-width:60px;max-width:60px">missing</span>
                <span style="font-family:var(--font-mono);font-size:var(--fs-11);color:var(--warning)">${escapeHtml(value)}</span>
              </div>
            `).join('')}
            ${group.truncated ? `
              <div class="name-parser-row" style="padding:6px 20px;color:var(--text-muted)">
                <span>List truncated after ${group.missingValues.length} entries</span>
              </div>
            ` : ''}
            ${group.duplicateValues.length === 0 ? `
              <div class="name-parser-row" style="padding:6px 20px;color:var(--text-muted)">
                <span>No duplicates detected</span>
              </div>
            ` : ''}
            ${group.duplicateValues.map(item => `
              <div class="name-parser-row" style="padding:4px 20px;align-items:flex-start">
                <span class="np-filename" style="min-width:60px;max-width:60px">duplicate</span>
                <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
                  <span style="font-family:var(--font-mono);font-size:var(--fs-11);color:var(--warning)">${escapeHtml(item.value)} <span style="color:var(--text-muted)">x${item.count}</span></span>
                  <span style="font-size:var(--fs-10);color:var(--text-muted)">${escapeHtml(item.filenames.join(', '))}</span>
                </div>
              </div>
            `).join('')}
            ${group.duplicatesTruncated ? `
              <div class="name-parser-row" style="padding:6px 20px;color:var(--text-muted)">
                <span>Duplicate list truncated after ${group.duplicateValues.length} values</span>
              </div>
            ` : ''}
          </div>
        `}
      </div>
    `).join('');
  }

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.getElementById('gap-close').addEventListener('click', close);
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
        <span style="font-size:var(--fs-10);color:var(--text-muted);min-width:24px">#${v.index + 1}</span>
        <span class="focus-flag ${isFlagged ? 'flagged' : ''}" data-index="${v.index}" data-file="${escapeAttr(v.filename)}" data-tool="focus" title="${isFlagged ? 'Unflag specimen' : 'Flag specimen'}">${flagAndTagHtml(v.filename, 12, 'focus')}</span>
        <span class="focus-goto" data-index="${v.index}" title="Open in form view"><img src="icons/goto.svg" style="width:12px;height:12px;filter:brightness(0) invert(1);opacity:0.6"></span>
        <span class="focus-flair" style="background:${flairColor}"></span>
        <span class="spec-filename">${escapeHtml(getDisplayFilename(v.filename))}</span>
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
      // Let inner tag.svg button handle its own click
      if (e.target.closest('.flag-tag-btn')) return;
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const spec = APP.specimens[idx];
      toggleSpecimenFlagState(spec, {
        promptForNote: false,
        tool: 'focus',
        updateUi: (isFlagged) => {
          btn.classList.toggle('flagged', isFlagged);
          btn.innerHTML = flagAndTagHtml(spec.filename, 12, 'focus');
          btn.title = isFlagged ? 'Unflag specimen' : 'Flag specimen';
        }
      });
      wireTagIconButtons(list, () => renderFocusSpecimens());
    });
  });

  wireTagIconButtons(list, () => renderFocusSpecimens());

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
  _focusCarouselRenderKey = getFocusCarouselRenderKey();

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
        <div class="thumb-placeholder">${escapeHtml(getDisplayFilename(v.filename, 12))}</div>
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
      window.api.getImage(APP.folderPath, spec.filename, tableImageType, 'thumb').then(dataUrl => {
        if (dataUrl && thumb.isConnected) {
          thumb.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(spec.filename))}">`;
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
  // Scroll the active panel's selected row into view
  scrollActivePanelToSelected();
}

function scrollActivePanelToSelected() {
  if (tableSelectedIndex < 0) return;
  let scrollContainer = null;

  if (_focusActivePanel === 'specimens') {
    scrollContainer = document.getElementById('focus-specimens-list');
  } else if (_focusActivePanel === 'values') {
    // The values/facet section — scroll the matching facet row
    const sec = document.querySelector('[data-section="values"]');
    const body = sec?.querySelector('.focus-section-body');
    if (body) {
      const primarySpec = APP.specimens[tableSelectedIndex];
      if (primarySpec && focusField) {
        const primaryVal = getCurrentFieldValue(primarySpec, focusField);
        const facetRow = body.querySelector(`.facet-row[data-value="${CSS.escape(primaryVal)}"]`);
        if (facetRow) facetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
    return;
  } else {
    // Tool section — find by data-section attribute
    const sec = document.querySelector(`[data-section="${_focusActivePanel}"]`);
    scrollContainer = sec?.querySelector('.focus-section-body');
  }

  if (!scrollContainer) return;
  const row = scrollContainer.querySelector(`.focus-specimen-row.is-primary, .focus-specimen-row[data-index="${tableSelectedIndex}"]`);
  if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateFocusOcrPanel(index) {
  const ocrEl = document.getElementById('focus-ocr-text');
  if (!ocrEl) return;
  if (index < 0 || index >= APP.specimens.length) {
    ocrEl.textContent = 'Select a specimen to view OCR text';
    return;
  }
  const spec = APP.specimens[index];
  const cached = tableDataCache[spec.filename];
  const ocrText = cached?.ocr || '';
  if (!ocrText) {
    ocrEl.textContent = '(No OCR text available for this specimen)';
  } else {
    ocrEl.textContent = ocrText;
  }
  // Also refresh OCR comparison highlights if the section is visible
  updateOcrComparisonHighlights();
}

function getOcrLookupForSpecimen(index) {
  if (index < 0 || index >= APP.specimens.length) return '';
  const spec = APP.specimens[index];
  const cached = tableDataCache[spec.filename];
  const cacheKey = `${APP.folderPath}|${spec.filename}`;
  const cachedLookup = _ocrLookupCache.get(cacheKey);
  if (cachedLookup) return cachedLookup;

  const textLower = (cached?.ocr || '').toLowerCase();
  const wordSet = new Set(textLower.split(/[^\w]+/).filter(Boolean));
  const lookup = { textLower, wordSet };
  _ocrLookupCache.set(cacheKey, lookup);
  return lookup;
}

function highlightNonOcrWords(text, ocrLookup) {
  if (!text || !ocrLookup?.textLower) return escapeHtml(text || '');
  // Split text into words, check each against the OCR text
  // We consider a "word" to be a contiguous sequence of non-whitespace characters
  return text.split(/(\s+)/).map(part => {
    if (/^\s+$/.test(part)) return part; // whitespace
    if (part === '') return '';
    // Strip leading/trailing punctuation for matching purposes, but keep for display
    const stripped = part.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    if (stripped === '') return escapeHtml(part); // pure punctuation
    if (ocrLookup.wordSet.has(stripped) || ocrLookup.textLower.includes(stripped)) {
      return escapeHtml(part);
    } else {
      return `<span class="ocr-mismatch">${escapeHtml(part)}</span>`;
    }
  }).join('');
}

function renderOcrComparisonSection() {
  const container = document.getElementById('focus-ocr-comparison-list');
  if (!container) return;

  const idx = tableSelectedIndex;
  if (idx < 0 || idx >= APP.specimens.length || !focusField) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:var(--fs-12)">Select a specimen to compare</div>';
    return;
  }

  const spec = APP.specimens[idx];
  const specState = APP.state.specimens[spec.filename];
  const value = getCurrentFieldValue(spec, focusField);
  const ocrLookup = getOcrLookupForSpecimen(idx);
  const highlightCacheKey = `${APP.folderPath}|${spec.filename}|${focusField}|${value}`;
  const valHtml = value === ''
    ? '<span class="cell-empty-placeholder" style="font-size:var(--fs-17)">(empty)</span>'
    : (_ocrHighlightCache.get(highlightCacheKey)
      || (() => {
        const html = highlightNonOcrWords(value, ocrLookup);
        _ocrHighlightCache.set(highlightCacheKey, html);
        return html;
      })());

  // Determine status
  const unconfirmedVal = specState?.unconfirmed_fields?.[focusField];
  const accepted = specState?.accepted_fields?.[focusField];
  let statusLabel, statusClass;
  if (unconfirmedVal !== undefined) {
    statusLabel = 'Unconfirmed Change';
    statusClass = 'unconfirmed';
  } else if (accepted) {
    statusLabel = getStatusLabel(accepted.source);
    statusClass = accepted.source;
  } else {
    statusLabel = 'pending';
    statusClass = 'pending';
  }

  const isUnconfirmed = unconfirmedVal !== undefined;

  container.innerHTML = `
    <div class="ocr-compare-header">
      <span style="font-size:var(--fs-10);color:var(--text-muted)">#${idx + 1}</span>
      <span style="font-size:var(--fs-11);color:var(--cat-0);font-weight:500">${escapeHtml(getDisplayFilename(spec.filename))}</span>
      <span class="field-status ${statusClass}" style="font-size:var(--fs-10);margin-left:4px">${statusLabel}</span>
      <span style="flex:1"></span>
      <button class="btn-icon ocr-confirm-btn" title="Confirm current value" style="font-size:var(--fs-14);color:var(--accent)">&#10003;</button>
      ${!isUnconfirmed ? `<button class="btn-icon ocr-uncertain-btn" title="Set status to Unconfirmed Change" style="font-size:var(--fs-14);color:var(--text-muted)">&#8635;</button>` : ''}
    </div>
    <div class="ocr-compare-content ocr-compare-cell" id="ocr-compare-editable" contenteditable="true" data-index="${idx}" data-field="${escapeAttr(focusField)}">${valHtml}</div>
  `;

  // Shared confirm logic — accepts the current (possibly edited) value
  const confirmOcrValue = () => {
    const editable = document.getElementById('ocr-compare-editable');
    let newValue = editable ? editable.textContent.replace(/\n/g, ' ').trim() : value;
    // The placeholder "(empty)" is display-only, not a real value
    if (newValue === '(empty)') newValue = '';
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const st = APP.state.specimens[spec.filename];
    const _rwBefore = rewindCapture([spec.filename], [focusField], { categories_confirmed: true });
    const aiValue = (tableDataCache[spec.filename]?.formatted_json || {})[focusField];
    const aiStr = aiValue !== undefined ? String(aiValue) : '';
    let source;
    if (newValue === aiStr && aiStr !== '') source = 'ai';
    else if (aiStr === '' && newValue !== '') source = 'user_added';
    else if (newValue === '') source = 'confirmed_empty';
    else source = 'edited';
    st.accepted_fields[focusField] = { value: newValue, source };
    if (st.unconfirmed_fields?.[focusField] !== undefined) delete st.unconfirmed_fields[focusField];
    st.last_touched = new Date().toISOString();
    autoConfirmCategories(spec.filename);
    rewindRecord('ocrEdit', 'OCR Edit', `"${focusField}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);
    scheduleSaveState(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
  };

  // Advance to next specimen in the current filtered list
  const advanceToNextSpecimen = () => {
    const specimens = focusFilter !== null
      ? getAllValuesForField(focusField).filter(v => v.value === focusFilter).map(v => v.index)
      : APP.specimens.map((_, i) => i);
    if (specimens.length === 0) return;
    const curPos = specimens.indexOf(idx);
    const nextPos = curPos >= specimens.length - 1 ? 0 : curPos + 1;
    loadFocusImage(specimens[nextPos]);
  };

  // Wire the contenteditable
  const editable = document.getElementById('ocr-compare-editable');
  if (editable) {
    editable._originalValue = value;
    editable._confirmed = false;
    let _rwEntry = null; // Tracked globally via pendingRewindInputs registry
    const initialSnapshot = snapshotFieldState(APP.state.specimens[spec.filename], focusField);

    // Stage every keystroke so beforeunload can flush even if blur doesn't fire
    editable.addEventListener('input', () => {
      let newValue = editable.textContent.replace(/\n/g, ' ').trim();
      if (newValue === '(empty)') newValue = '';
      const changedFromInitial = newValue !== editable._originalValue;
      if (changedFromInitial && (!_rwEntry || !_rwEntry.before)) {
        _rwEntry = registerPendingRewindInput(spec.filename, focusField, rewindCapture([spec.filename], [focusField]));
      }

      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      const currentSpecState = APP.state.specimens[spec.filename];
      if (!currentSpecState) return;

      if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, focusField, newValue);
      else restoreFieldState(currentSpecState, focusField, initialSnapshot);
      currentSpecState.last_touched = new Date().toISOString();
      markSpecimenDirty(spec.filename);

      if (changedFromInitial) {
        // Debounce the rewind record
        if (_rwEntry.timeout) clearTimeout(_rwEntry.timeout);
        _rwEntry.timeout = setTimeout(() => {
          commitPendingRewindInput(_rwEntry);
          _rwEntry = null;
        }, 1000);
      }
    });

    // On blur, confirm only if value changed and Enter didn't already handle it
    editable.addEventListener('blur', () => {
      if (editable._confirmed) return;
      let newValue = editable.textContent.replace(/\n/g, ' ').trim();
      if (newValue === '(empty)') newValue = '';
      if (newValue !== editable._originalValue) {
        // Commit pending rewind-input before confirmOcrValue creates its own rewind record
        if (_rwEntry && _rwEntry.before) { commitPendingRewindInput(_rwEntry); _rwEntry = null; }
        confirmOcrValue();
        renderFocusSidebar(getFocusCategories());
        renderFocusMain();
      }
    });

    // Enter = confirm + advance to next specimen
    editable.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editable._confirmed = true;
        // Commit pending rewind-input before confirmOcrValue creates its own rewind record
        if (_rwEntry && _rwEntry.before) { commitPendingRewindInput(_rwEntry); _rwEntry = null; }
        confirmOcrValue();
        renderFocusSidebar(getFocusCategories());
        advanceToNextSpecimen();
      }
    });
  }

  // Wire confirm (checkmark) button
  container.querySelector('.ocr-confirm-btn')?.addEventListener('click', () => {
    confirmOcrValue();
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  });

  // Wire the uncertain (loop) button
  container.querySelector('.ocr-uncertain-btn')?.addEventListener('click', () => {
    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const st = APP.state.specimens[spec.filename];
    const _rwBefore = rewindCapture([spec.filename], [focusField], { categories_confirmed: true });

    const currentValue = getCurrentFieldValue(spec, focusField);
    if (!st.unconfirmed_fields) st.unconfirmed_fields = {};
    st.unconfirmed_fields[focusField] = currentValue;
    if (st.accepted_fields?.[focusField]) delete st.accepted_fields[focusField];
    autoConfirmCategories(spec.filename);

    rewindRecord('markUncertain', 'Mark Uncertain', `"${focusField}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);
    scheduleSaveState(spec.filename);
    scheduleAutoSaveReviewed(spec.filename);
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  });
}

function updateOcrComparisonHighlights() {
  // OCR review now lives in its own popup workflow, so the inline focus tool
  // section stays as a launcher and does not need live specimen-driven updates.
}

async function loadFocusImage(index) {
  const container = document.getElementById('focus-image-container');
  if (!container || index < 0 || index >= APP.specimens.length) return;
  tableSelectedIndex = index;
  const spec = APP.specimens[index];
  container.innerHTML = '<div class="table-image-placeholder">Loading...</div>';
  updateFocusPrimaryState();
  updateFocusElevCalcForSpecimen(index);
  updateFocusOcrPanel(index);
  showNavSpinner();
  const dataUrl = await window.api.getImage(APP.folderPath, spec.filename, tableImageType, 'full');
  hideNavSpinner();
  if (dataUrl) {
    container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttr(getDisplayFilename(spec.filename))}">`;
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
  cell.innerHTML = `<textarea class="cell-edit-input" data-index="${specimenIndex}" data-field="${escapeAttr(fieldName)}" style="font-size:var(--fs-11);padding:2px 4px;width:100%;resize:vertical;min-height:1.6em;font-family:var(--font-mono);line-height:1.4">${escapeHtml(currentValue)}</textarea>`;
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
      const _rwBefore = rewindCapture([spec.filename], [fieldName]);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields) {
        APP.state.specimens[spec.filename].unconfirmed_fields = {};
      }
      APP.state.specimens[spec.filename].unconfirmed_fields[fieldName] = newValue;
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      rewindRecord('focusCellEdit', 'Cell Edit', `"${fieldName}" on ${getDisplayFilename(spec.filename)}`, _rwBefore);
      scheduleSaveState(spec.filename);
    }

    // Refresh focus panels
    renderFocusSidebar(getFocusCategories());
    renderFocusMain();
  };

  const cancel = () => {
    cell.textContent = originalText;
    cell.setAttribute('style', originalStyle);
  };

  // Stage every keystroke to unconfirmed_fields so beforeunload can flush it
  // even if blur never fires (e.g., window closed while editing)
  let _rwEntry = null;
  const initialSnapshot = snapshotFieldState(APP.state.specimens[spec.filename], fieldName);
  input.addEventListener('input', () => {
    const value = input.value;
    const changedFromInitial = value !== currentValue;
    if (changedFromInitial && (!_rwEntry || !_rwEntry.before)) {
      _rwEntry = registerPendingRewindInput(spec.filename, fieldName, rewindCapture([spec.filename], [fieldName]));
    }

    if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
    const currentSpecState = APP.state.specimens[spec.filename];
    if (!currentSpecState) return;

    if (changedFromInitial) stageFieldAsUnconfirmed(currentSpecState, fieldName, value);
    else restoreFieldState(currentSpecState, fieldName, initialSnapshot);
    currentSpecState.last_touched = new Date().toISOString();
    markSpecimenDirty(spec.filename);

    if (changedFromInitial) {
      if (_rwEntry.timeout) clearTimeout(_rwEntry.timeout);
      _rwEntry.timeout = setTimeout(() => {
        commitPendingRewindInput(_rwEntry);
        _rwEntry = null;
      }, 1000);
    }
  });

  const commitPendingRw = () => {
    if (_rwEntry && _rwEntry.before) { commitPendingRewindInput(_rwEntry); _rwEntry = null; }
  };
  const onBlur = () => { commitPendingRw(); save(false); };
  input.addEventListener('blur', onBlur);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); input.removeEventListener('blur', onBlur); commitPendingRw(); save(true); }
    else if (e.key === 'Escape') { input.removeEventListener('blur', onBlur); commitPendingRw(); cancel(); }
  });
}

// ── Focus Actions ───────────────────────────────────────────

function mergeCluster(cluster, mergeValue, field = focusField) {
  if (!field) return 0;
  const valuesToMerge = new Set(cluster.variants.map(v => v.value));

  // Identify affected specimens before mutation
  const affectedFilenames = [];
  for (const spec of APP.specimens) {
    const currentVal = getCurrentFieldValue(spec, field);
    if (valuesToMerge.has(currentVal) && currentVal !== mergeValue) {
      affectedFilenames.push(spec.filename);
    }
  }
  if (affectedFilenames.length === 0) return 0;

  const _rwBefore = rewindCapture(affectedFilenames, [field]);

  for (const spec of APP.specimens) {
    const currentVal = getCurrentFieldValue(spec, field);

    if (valuesToMerge.has(currentVal) && currentVal !== mergeValue) {
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      const specState = APP.state.specimens[spec.filename];
      stageFieldAsUnconfirmed(specState, field, mergeValue);
      specState.last_touched = new Date().toISOString();
      autoConfirmCategories(spec.filename);
    }
  }

  rewindRecord('clusterMerge', 'Cluster Merge', `"${field}" → "${mergeValue}" across ${affectedFilenames.length} specimen${affectedFilenames.length !== 1 ? 's' : ''}`, _rwBefore);
  scheduleSaveState(affectedFilenames);
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
  return affectedFilenames.length;
}

function getFieldsForToolScope() {
  return focusField ? [focusField] : [];
}

function getSpecimensForToolScope() {
  if (!focusField || focusFilter === null) {
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

function getCurrentTableCaseField() {
  const editingCell = document.querySelector('.batch-table .cell-edit-input')?.closest('td[data-field]');
  if (editingCell?.dataset.field) return editingCell.dataset.field;
  if (tableSelectedCell?.isConnected && tableSelectedCell.dataset.field) return tableSelectedCell.dataset.field;
  const selectedCell = document.querySelector('.batch-table td.cell-selected[data-field]');
  if (selectedCell?.dataset.field) return selectedCell.dataset.field;
  // Fallback: field name persisted from last selection (survives virtual scroll re-render)
  return tableSelectedField || null;
}

function getTableCaseScopeRows() {
  if (Array.isArray(_tableFilteredCache)) return _tableFilteredCache;
  return filterAndSortTableRows(tableAllFields, _tableCurrentFilter, _tableCurrentSortCol, _tableCurrentSortAsc);
}

function isEmptyCellReplace(findVal, replaceVal) {
  return findVal === '' && replaceVal !== '';
}

function getFindReplaceSummaryLabel(findVal, replaceVal) {
  const fromLabel = findVal === '' ? '(empty)' : findVal;
  const toLabel = replaceVal === '' ? '(empty)' : replaceVal;
  return `"${fromLabel}" → "${toLabel}"`;
}

function previewFindReplace(findVal, replaceVal) {
  const fields = getFieldsForToolScope();
  const specimens = getSpecimensForToolScope();
  const replaceEmptyCells = isEmptyCellReplace(findVal, replaceVal);
  let count = 0;

  for (const spec of specimens) {
    for (const field of fields) {
      const currentVal = getCurrentFieldValue(spec, field);
      if (replaceEmptyCells) {
        if (currentVal === '') count++;
        continue;
      }

      const regex = new RegExp(escapeRegex(findVal), 'gi');
      if (currentVal.replace(regex, replaceVal) !== currentVal) count++;
    }
  }

  return { count, specimens, fields, replaceEmptyCells };
}

function applyFindReplace(findVal, replaceVal) {
  let count = 0;
  const fields = getFieldsForToolScope();
  const specimens = getSpecimensForToolScope();
  const replaceEmptyCells = isEmptyCellReplace(findVal, replaceVal);

  // Capture before state for all specimens/fields in scope
  const allFilenames = specimens.map(s => s.filename);
  const _rwBefore = rewindCapture(allFilenames, fields);

  for (const spec of specimens) {
    for (const field of fields) {
      const currentVal = getCurrentFieldValue(spec, field);
      const newVal = replaceEmptyCells
        ? (currentVal === '' ? replaceVal : currentVal)
        : currentVal.replace(new RegExp(escapeRegex(findVal), 'gi'), replaceVal);
      if (newVal !== currentVal) {
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
        APP.state.specimens[spec.filename].unconfirmed_fields[field] = newVal;
        APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
        count++;
      }
    }
  }

  rewindRecord('findReplace', 'Find & Replace', `${getFindReplaceSummaryLabel(findVal, replaceVal)} (${count} change${count !== 1 ? 's' : ''})`, _rwBefore);
  scheduleSaveState(allFilenames);
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
  return count;
}

function previewCaseTransform(type) {
  const fields = getFieldsForToolScope();
  const specimens = getSpecimensForToolScope();
  let count = 0;

  for (const spec of specimens) {
    for (const field of fields) {
      const currentVal = getCurrentFieldValue(spec, field);
      if (currentVal === '') continue;

      const newVal = transformCaseText(currentVal, type);

      if (newVal !== currentVal) count++;
    }
  }

  return { count, specimens, fields };
}

function applyCaseTransform(type) {
  let count = 0;
  const fields = getFieldsForToolScope();
  const specimens = getSpecimensForToolScope();

  const allFilenames = specimens.map(s => s.filename);
  const _rwBefore = rewindCapture(allFilenames, fields);

  for (const spec of specimens) {
    for (const field of fields) {
      const currentVal = getCurrentFieldValue(spec, field);
      if (currentVal === '') continue;

      const newVal = transformCaseText(currentVal, type);

      if (newVal !== currentVal) {
        if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
        if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
        APP.state.specimens[spec.filename].unconfirmed_fields[field] = newVal;
        APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
        count++;
      }
    }
  }

  const typeLabel = type === 'title' ? 'Title Case' : type === 'upper' ? 'UPPERCASE' : 'lowercase';
  rewindRecord('caseTransform', 'Case Transform', `${typeLabel} (${count} change${count !== 1 ? 's' : ''})`, _rwBefore);
  scheduleSaveState(allFilenames);
  renderFocusMain();
  renderFocusSidebar(getFocusCategories());
  return count;
}

function confirmCaseTransform(type) {
  const preview = previewCaseTransform(type);
  const typeLabel = type === 'title' ? 'Title Case' : type === 'upper' ? 'UPPERCASE' : 'lowercase';
  showApplyCancelPopup(
    `Apply ${typeLabel}?`,
    preview.count > 0
      ? `Apply <strong>${typeLabel}</strong> to <strong>${preview.count}</strong> cell${preview.count !== 1 ? 's' : ''} across <strong>${preview.specimens.length}</strong> specimen${preview.specimens.length !== 1 ? 's' : ''} within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`
      : `No changes would be made by applying <strong>${typeLabel}</strong> within <strong>${escapeHtml(focusField)}</strong>${focusFilter !== null ? ` for the current filtered selection <strong>${escapeHtml(focusFilter || '(empty)')}</strong>` : ''}.`,
    () => { if (preview.count > 0) applyCaseTransform(type); },
    'Apply'
  );
}

function previewTableCaseTransform(type) {
  const field = getCurrentTableCaseField();
  const rows = getTableCaseScopeRows();
  const specimens = rows.map(r => APP.specimens[r.index]).filter(Boolean);
  let count = 0;

  if (!field) return { field: null, count, specimens };

  for (const spec of specimens) {
    const currentVal = getCurrentFieldValue(spec, field);
    if (currentVal === '') continue;
    if (transformCaseText(currentVal, type) !== currentVal) count++;
  }

  return { field, count, specimens };
}

function applyTableCaseTransform(type) {
  const preview = previewTableCaseTransform(type);
  if (!preview.field) return 0;

  const allFilenames = preview.specimens.map(s => s.filename);
  const _rwBefore = rewindCapture(allFilenames, [preview.field]);
  let count = 0;

  for (const spec of preview.specimens) {
    const currentVal = getCurrentFieldValue(spec, preview.field);
    if (currentVal === '') continue;

    const newVal = transformCaseText(currentVal, type);
    if (newVal !== currentVal) {
      if (!APP.state.specimens[spec.filename]) initSpecimenState(spec.filename);
      if (!APP.state.specimens[spec.filename].unconfirmed_fields) APP.state.specimens[spec.filename].unconfirmed_fields = {};
      APP.state.specimens[spec.filename].unconfirmed_fields[preview.field] = newVal;
      APP.state.specimens[spec.filename].last_touched = new Date().toISOString();
      count++;
    }
  }

  const typeLabel = type === 'title' ? 'Title Case' : type === 'upper' ? 'UPPERCASE' : 'lowercase';
  rewindRecord('caseTransform', 'Case Transform', `${typeLabel} (${count} change${count !== 1 ? 's' : ''})`, _rwBefore);
  scheduleSaveState(allFilenames);
  renderTableBody(tableAllFields, _tableCurrentFilter, _tableCurrentSortCol, _tableCurrentSortAsc);
  return count;
}

function confirmTableCaseTransform(type) {
  const preview = previewTableCaseTransform(type);
  if (!preview.field) return;

  const typeLabel = type === 'title' ? 'Title Case' : type === 'upper' ? 'UPPERCASE' : 'lowercase';
  showApplyCancelPopup(
    `Apply ${typeLabel}?`,
    preview.count > 0
      ? `Apply <strong>${typeLabel}</strong> to <strong>${preview.count}</strong> cell${preview.count !== 1 ? 's' : ''} across <strong>${preview.specimens.length}</strong> specimen${preview.specimens.length !== 1 ? 's' : ''} within <strong>${escapeHtml(preview.field)}</strong>${_tableCurrentFilter ? ' for the current filtered table rows' : ''}.`
      : `No changes would be made by applying <strong>${typeLabel}</strong> within <strong>${escapeHtml(preview.field)}</strong>${_tableCurrentFilter ? ' for the current filtered table rows' : ''}.`,
    () => { if (preview.count > 0) applyTableCaseTransform(type); },
    'Apply'
  );
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

function applyTypographySettings() {
  const root = document.documentElement;
  const scale = APP.settings.fontScale || 1.0;
  const baseSizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 32];

  for (const base of baseSizes) {
    const scaled = Math.max(base, Math.round(base * scale));
    root.style.setProperty(`--fs-${base}`, `${scaled}px`);
  }

  const family = APP.settings.fontFamily || 'system-sans';
  let fontValue;
  switch (family) {
    case 'system-serif':
      fontValue = "Georgia, 'Times New Roman', Times, serif";
      break;
    case 'atkinson':
      fontValue = "'Atkinson Hyperlegible Next', system-ui, sans-serif";
      break;
    case 'opendyslexic':
      fontValue = "'OpenDyslexic', system-ui, sans-serif";
      break;
    case 'system-sans':
    default:
      fontValue = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
      break;
  }
  root.style.setProperty('--font', fontValue);

  // Italic emphasis
  root.style.setProperty('--italic', APP.settings.italicEmphasis !== false ? 'italic' : 'normal');
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
  toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-secondary);border:1px solid var(--accent);border-radius:var(--radius);padding:21px 27px;z-index:10000;box-shadow:0 6px 30px rgba(0,0,0,0.5);max-width:510px;cursor:pointer;pointer-events:auto';
  toast.innerHTML = `
    <div style="font-size:var(--fs-20);font-weight:600;color:var(--text-primary);margin-bottom:6px">Update Available: v${escapeHtml(data.version)}</div>
    <div style="font-size:var(--fs-16);color:var(--text-muted)">Open Settings to update</div>
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
      statusLine.innerHTML = `<span style="color:var(--accent)">&#9432; Update available: v${escapeHtml(data.version)}</span><br><span style="color:var(--text-muted);font-size:var(--fs-11)">Portable build — download from GitHub Releases</span>`;
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

// ── Flagged Specimens Popup ─────────────────────────────────

function openFlaggedSpecimensPopup() {
  const existing = document.getElementById('flagged-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'flagged-overlay';
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  const collectFlagged = () => {
    const flagged = [];
    for (let i = 0; i < APP.specimens.length; i++) {
      const spec = APP.specimens[i];
      const st = APP.state.specimens?.[spec.filename];
      if (st?.flagged) {
        flagged.push({
          index: i,
          filename: spec.filename,
          note: st.flag_note || '',
          tags: [...(st.flag_tags || [])],
        });
      }
    }
    return flagged;
  };

  const eyeSvgHtml = sharedAssetIconHtml('shared-asset-icon-eye', 16);

  const renderPill = (filename, tool) => {
    const label = FLAG_TOOL_LABELS[tool] || tool;
    return `<span class="flag-tag-pill">${escapeHtml(label)}<button class="flag-tag-pill-x" data-file="${escapeAttr(filename)}" data-tool="${escapeAttr(tool)}" title="Remove ${escapeAttr(label)} tag"><img src="icons/close.svg" alt="×"></button></span>`;
  };

  const renderRows = () => {
    const flagged = collectFlagged();
    if (flagged.length === 0) return { html: '', count: 0 };
    const html = flagged.map(f => `
      <div class="flagged-popup-row" data-index="${f.index}" data-file="${escapeAttr(f.filename)}">
        <div class="flagged-popup-row-content">
          <span class="flagged-popup-row-filename">${escapeHtml(getDisplayFilename(f.filename))}</span>
          ${f.tags.length > 0 ? `<div class="flagged-popup-row-tags">${f.tags.map(t => renderPill(f.filename, t)).join('')}</div>` : ''}
          ${f.note ? `<span class="flagged-popup-row-note">${escapeHtml(f.note)}</span>` : ''}
        </div>
        <div class="flagged-popup-row-actions">
          <button class="flagged-popup-clear-btn" data-file="${escapeAttr(f.filename)}" title="Unflag and clear all tags">Clear Specimen Flags</button>
          <button class="flagged-popup-eye-btn" data-index="${f.index}" title="Open in form view">${eyeSvgHtml}</button>
        </div>
      </div>
    `).join('');
    return { html, count: flagged.length };
  };

  const render = () => {
    const { html, count } = renderRows();
    if (count === 0) {
      overlay.remove();
      return;
    }
    overlay.innerHTML = `
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:20px;max-width:720px;width:min(720px,calc(100vw - 32px));max-height:80vh;display:flex;flex-direction:column;cursor:default" onclick="event.stopPropagation()">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <span style="font-size:var(--fs-14);font-weight:600;color:var(--text-error);display:inline-flex;align-items:center;gap:6px">${flagIconSvg(true, 16)} ${count} Flagged Specimen${count !== 1 ? 's' : ''}</span>
          ${popupCloseBtnHtml('flagged-popup-close')}
        </div>
        <div class="flagged-popup-key">
          <span class="flagged-popup-key-item">
            ${flagIconSvg(true, 12)}${sharedAssetIconHtml('shared-asset-icon-tag', 11, 'flag-tag-btn-active-preview')}
            Flagged by this tool
          </span>
          <span class="flagged-popup-key-sep">&middot;</span>
          <span class="flagged-popup-key-item">
            ${flagIconSvg(true, 12)}${sharedAssetIconHtml('shared-asset-icon-tag', 11, 'flag-tag-btn-inactive-preview')}
            Flagged by another tool
          </span>
          <span class="flagged-popup-key-sep">&middot;</span>
          <span class="flagged-popup-key-note">Toggling inside a tool only affects that tool\u2019s tag. Use this popup to clear all tags.</span>
        </div>
        <div class="flagged-popup-list" style="overflow-y:auto;flex:1;min-height:0">
          ${html}
        </div>
      </div>
    `;
    wireRowHandlers();
  };

  const close = () => overlay.remove();

  const wireRowHandlers = () => {
    overlay.querySelector('#flagged-popup-close')?.addEventListener('click', close);

    // Pill X: remove just that tag. If it was the last tag, also unflag.
    overlay.querySelectorAll('.flag-tag-pill-x').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filename = btn.dataset.file;
        const tool = btn.dataset.tool;
        const st = APP.state.specimens?.[filename];
        if (!st) return;
        const _rwBefore = rewindCapture([filename], [], { flagged: true });
        removeTagFromSpecimen(filename, tool);
        if ((st.flag_tags || []).length === 0) {
          st.flagged = false;
          st.flag_note = '';
        }
        st.last_touched = new Date().toISOString();
        rewindRecord('tagFlag', 'Remove Flag Tag', `Removed ${FLAG_TOOL_LABELS[tool] || tool} tag from ${getDisplayFilename(filename)}`, _rwBefore);
        scheduleSaveState(filename);
        refreshSpecimenFlagUi(filename);
        render();
      });
    });

    // Clear Specimen Flags: nuclear reset
    overlay.querySelectorAll('.flagged-popup-clear-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const filename = btn.dataset.file;
        const spec = APP.specimens.find(item => item.filename === filename);
        if (!spec) return;
        toggleSpecimenFlagState(spec, { promptForNote: false, tool: null });
        refreshSpecimenFlagUi(filename);
        render();
      });
    });

    // Eye icon: open in form view
    overlay.querySelectorAll('.flagged-popup-eye-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        if (isNaN(idx)) return;
        close();
        showView('review');
        loadSpecimen(idx);
      });
    });
  };

  const initialFlagged = collectFlagged();
  if (initialFlagged.length === 0) return;

  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  render();
}

// ── Checklist ───────────────────────────────────────────────

function updateChecklistIcon() {
  const btn = document.getElementById('btn-checklist');
  if (!btn) return;
  const checklist = APP.currentPrompt?.checklist || [];
  if (checklist.length === 0) return;
  const checked = APP.project.checklist_checked || [];
  const allDone = checklist.length > 0 && checklist.every((_, i) => checked.includes(i));
  btn.innerHTML = '<img src="icons/list-todo.svg" alt="" aria-hidden="true">';
  btn.classList.toggle('complete', allDone);
}

function openChecklistPopup() {
  const checklist = APP.currentPrompt?.checklist || [];
  if (checklist.length === 0) return;
  if (!APP.project.checklist_checked) APP.project.checklist_checked = [];
  const checked = APP.project.checklist_checked;
  const existing = document.getElementById('checklist-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  // Map tool category names for bracket-link matching
  const toolCatMap = {};
  for (const cat of TOOL_CATEGORIES) {
    toolCatMap[cat.toLowerCase()] = cat;
  }

  const overlay = document.createElement('div');
  overlay.id = 'checklist-overlay';
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  const renderItems = () => checklist.map((item, i) => {
    const isChecked = checked.includes(i);
    // Parse [BracketedWords] into clickable links if they match a tool category
    const itemHtml = escapeHtml(item).replace(/\[([^\]]+)\]/g, (match, word) => {
      const catKey = word.toLowerCase();
      if (toolCatMap[catKey]) {
        return `<a class="checklist-tool-link" data-tool-cat="${escapeAttr(toolCatMap[catKey])}" title="Open ${word} tool in Focus mode">[${escapeHtml(word)}]</a>`;
      }
      return match;
    });
    return `
      <div class="checklist-item ${isChecked ? 'checked' : ''}" data-index="${i}">
        <span class="checklist-checkbox">${isChecked ? '&#9745;' : '&#9744;'}</span>
        <span class="checklist-text">${itemHtml}</span>
      </div>
    `;
  }).join('');

  overlay.innerHTML = `
    <div class="checklist-popup" onclick="event.stopPropagation()">
      <div class="checklist-header">
        <span style="font-weight:600;font-size:var(--fs-14)">Checklist</span>
        <span style="flex:1"></span>
        ${popupCloseBtnHtml('checklist-close')}
      </div>
      <div class="checklist-body" id="checklist-body">
        ${renderItems()}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => overlay.remove());
  document.getElementById('checklist-close').addEventListener('click', () => overlay.remove());

  const wireItems = () => {
    const body = document.getElementById('checklist-body');
    if (!body) return;

    body.querySelectorAll('.checklist-item').forEach(el => {
      // Toggle check on click (but not on tool link clicks)
      el.addEventListener('click', (e) => {
        if (e.target.closest('.checklist-tool-link')) return;
        const idx = parseInt(el.dataset.index);
        const pos = checked.indexOf(idx);
        if (pos >= 0) {
          checked.splice(pos, 1);
        } else {
          checked.push(idx);
        }
        scheduleProjectSave();
        updateChecklistIcon();
        body.innerHTML = renderItems();
        wireItems();
      });
    });

    // Wire tool category links
    body.querySelectorAll('.checklist-tool-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const cat = link.dataset.toolCat;
        overlay.remove();
        focusToolCategory = cat;
        showView('focus');
        renderFocusView();
      });
    });
  };
  wireItems();
}

function renderHotkeyTitleHtml(label) {
  return escapeHtml(label).replace(/\*([^*]+)\*/g, '<strong><u>$1</u></strong>');
}

function renderHotkeyShortcutHtml(keys) {
  return keys.map(key => {
    const display = key === 'mod' ? _searchModifierKey : key;
    return `<span class="hotkey-keycap">${escapeHtml(display)}</span>`;
  }).join('<span class="hotkey-plus">+</span>');
}

function openHotkeysPopup() {
  const existing = document.getElementById('hotkeys-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'hotkeys-overlay';
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div class="hotkeys-popup" onclick="event.stopPropagation()">
      <div class="hotkeys-header">
        <span class="hotkeys-title">Hotkeys</span>
        ${popupCloseBtnHtml('hotkeys-close', 'Close hotkeys')}
      </div>
      <div class="hotkeys-grid">
        ${HOTKEY_CARD_DEFS.map(card => `
          <div class="hotkey-card">
            <span class="hotkey-card-icon">
              <img src="${escapeAttr(card.icon)}" alt="" aria-hidden="true">
            </span>
            <div class="hotkey-card-title">${renderHotkeyTitleHtml(card.title)}</div>
            <div class="hotkey-card-command">
              <div class="hotkey-card-shortcut">${renderHotkeyShortcutHtml(card.keys)}</div>
            </div>
            <div class="hotkey-card-desc">${escapeHtml(card.description)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  overlay.querySelector('#hotkeys-close')?.addEventListener('click', close);
}

// ── Find Popup ──────────────────────────────────────────────

async function openFindPopup() {
  const existing = document.getElementById('find-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  // Ensure all specimens are loaded so we can search their fields
  await ensureAllSpecimensCached();

  const availableFields = getAvailableProjectFields();

  const overlay = document.createElement('div');
  overlay.id = 'find-overlay';
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div class="find-popup" onclick="event.stopPropagation()">
      <div class="find-header">
        <span class="find-title">Find</span>
        ${popupCloseBtnHtml('find-close')}
      </div>
      <div class="find-controls">
        <input type="text" class="find-input" id="find-input" placeholder="Find..." autocomplete="off">
        <select class="find-field-select" id="find-field-select">
          <option value="">All fields</option>
          ${availableFields.map(f => `<option value="${escapeAttr(f)}">${escapeHtml(f)}</option>`).join('')}
        </select>
      </div>
      <div class="find-summary" id="find-summary" style="display:none"></div>
      <div class="find-body" id="find-body"></div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  overlay.querySelector('#find-close')?.addEventListener('click', close);

  const input = overlay.querySelector('#find-input');
  const fieldSelect = overlay.querySelector('#find-field-select');
  const body = overlay.querySelector('#find-body');
  const summary = overlay.querySelector('#find-summary');

  let renderTimer = null;
  const scheduleRender = () => {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => renderFindResults(body, summary, input.value, fieldSelect.value), 80);
  };

  input.addEventListener('input', scheduleRender);
  fieldSelect.addEventListener('change', scheduleRender);
  input.focus();
}

function renderFindResults(body, summary, query, fieldRestriction) {
  const q = (query || '').trim();
  if (!q) {
    body.innerHTML = '';
    summary.style.display = 'none';
    return;
  }

  const qLower = q.toLowerCase();
  const availableFields = getAvailableProjectFields();
  const fieldsToSearch = fieldRestriction ? [fieldRestriction] : availableFields;

  const results = [];
  for (let i = 0; i < APP.specimens.length; i++) {
    const spec = APP.specimens[i];
    const matches = [];
    for (const field of fieldsToSearch) {
      // Use the current (possibly edited) value, not just the AI value
      const val = getCurrentFieldValue(spec, field);
      if (val && String(val).toLowerCase().includes(qLower)) {
        matches.push({ field, value: String(val) });
      }
    }
    if (matches.length > 0) {
      results.push({ index: i, filename: spec.filename, matches });
    }
  }

  summary.style.display = '';
  summary.textContent = results.length === 0
    ? `No matches for "${q}"`
    : `${results.length} specimen${results.length !== 1 ? 's' : ''} with ${results.reduce((s, r) => s + r.matches.length, 0)} match${results.reduce((s, r) => s + r.matches.length, 0) !== 1 ? 'es' : ''}`;

  if (results.length === 0) {
    body.innerHTML = '<div class="find-empty">No specimens match your query.</div>';
    return;
  }

  // Render at most 500 specimens to keep UI responsive
  const MAX_RESULTS = 500;
  const truncated = results.length > MAX_RESULTS;
  const displayResults = truncated ? results.slice(0, MAX_RESULTS) : results;

  body.innerHTML = displayResults.map(r => {
    const spec = APP.specimens[r.index];
    const isFlagged = APP.state.specimens?.[spec.filename]?.flagged;
    // Use first matching field for status square
    const statusField = r.matches[0].field;
    return `
      <div class="find-row" data-index="${r.index}">
        <span class="find-row-idx">#${r.index + 1}</span>
        <button class="btn-icon find-row-photo" data-find-image-file="${escapeAttr(spec.filename)}" data-find-image-field="${escapeAttr(statusField)}" data-find-image-value="${escapeAttr(r.matches[0].value)}" title="Open specimen image reference">
          <img src="icons/image.svg" alt="" aria-hidden="true" style="width:14px;height:14px;filter:brightness(0) invert(1);opacity:0.7">
        </button>
        <span class="focus-flag ${isFlagged ? 'flagged' : ''}" data-index="${r.index}" data-file="${escapeAttr(spec.filename)}" data-tool="find" title="${isFlagged ? 'Unflag specimen' : 'Flag specimen'}">${flagAndTagHtml(spec.filename, 12, 'find')}</span>
        ${binStatusSquareHtml(r.index, statusField)}
        <span class="focus-goto" data-index="${r.index}" title="Open in form view" style="color:var(--accent);display:inline-flex;align-items:center">${sharedAssetIconHtml('shared-asset-icon-eye', 14, 'find-goto-icon')}</span>
        <span class="find-row-filename" title="${escapeAttr(getDisplayFilename(spec.filename))}">${escapeHtml(getDisplayFilename(spec.filename))}</span>
        <div class="find-row-matches">
          ${r.matches.map(m => `
            <div class="find-match-cell">
              <button class="find-match-expand-btn" title="Expand to show full text">${sharedAssetIconHtml('shared-asset-icon-chevron-right', 12, 'find-match-expand-icon')}</button>
              <div class="find-match-content">
                <div class="find-match-field">${escapeHtml(m.field)}</div>
                <div class="find-match-value" title="${escapeAttr(m.value)}">${highlightFindMatch(m.value, q)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('') + (truncated ? `<div class="find-empty">Showing first ${MAX_RESULTS} of ${results.length} matching specimens. Refine your query to narrow results.</div>` : '');

  // Wire goto (open in form view)
  body.querySelectorAll('.focus-goto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      document.getElementById('find-overlay')?.remove();
      showView('review');
      loadSpecimen(idx);
    });
  });

  // Wire flag toggle
  body.querySelectorAll('.focus-flag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Let inner tag.svg button handle its own click
      if (e.target.closest('.flag-tag-btn')) return;
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const spec = APP.specimens[idx];
      toggleSpecimenFlagState(spec, {
        promptForNote: false,
        tool: 'find',
        updateUi: (isFlagged) => {
          btn.classList.toggle('flagged', isFlagged);
          btn.innerHTML = flagAndTagHtml(spec.filename, 12, 'find');
          btn.title = isFlagged ? 'Unflag specimen' : 'Flag specimen';
        }
      });
      wireTagIconButtons(body);
    });
  });

  wireTagIconButtons(body);

  // Wire expand/collapse on match cells
  body.querySelectorAll('.find-match-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.closest('.find-match-cell')?.classList.toggle('expanded');
    });
  });

  // Wire image reference button
  body.querySelectorAll('.find-row-photo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSpecimenImageReferencePopup(
        btn.dataset.findImageFile,
        getDisplayFilename(btn.dataset.findImageFile),
        btn.dataset.findImageField,
        btn.dataset.findImageValue
      );
    });
  });
}

function highlightFindMatch(value, query) {
  if (!query) return escapeHtml(String(value));
  const str = String(value);
  const lower = str.toLowerCase();
  const qLower = query.toLowerCase();
  const parts = [];
  let i = 0;
  while (i < str.length) {
    const idx = lower.indexOf(qLower, i);
    if (idx === -1) {
      parts.push(escapeHtml(str.slice(i)));
      break;
    }
    if (idx > i) parts.push(escapeHtml(str.slice(i, idx)));
    parts.push(`<mark>${escapeHtml(str.slice(idx, idx + query.length))}</mark>`);
    i = idx + query.length;
  }
  return parts.join('');
}

function openSettingsPopup() {
  const existing = document.getElementById('settings-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.className = 'image-modal-overlay';
  overlay.style.cursor = 'default';

  overlay.innerHTML = `
    <div class="settings-popup" onclick="event.stopPropagation()">
      <div class="settings-header">
        <div class="settings-header-side">
          <span style="font-size:var(--fs-16);font-weight:600;color:var(--text-primary)">&#9881; Settings</span>
        </div>
        <div class="settings-header-center">
          <button class="btn-sm btn-primary" id="settings-export-project">Export Project</button>
        </div>
        <div class="settings-header-side settings-header-side-right">
          <span style="display:flex;align-items:center;gap:6px;padding:3px 10px;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:var(--fs-11);font-family:var(--font-mono)">&#9998; ${escapeHtml(APP.username)}</span>
          ${popupCloseBtnHtml('settings-close-top')}
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:0 2px">

      <!-- ── Top: two-column layout ── -->
      <div style="display:flex;gap:20px;margin-bottom:16px">

        <!-- Left column -->
        <div style="flex:7;display:flex;flex-direction:column;gap:0">

          <div class="settings-row">
            <div class="settings-label">
              <div>Progress Tracker</div>
              <div class="settings-desc">Supervisor summary of reviewer activity, sessions, cells reviewed, and specimens touched for this project</div>
            </div>
            <button class="btn-sm" id="btn-open-progress-tracker">Open Tracker</button>
          </div>

          <div class="settings-row">
            <div class="settings-label">
              <div>Confirm Records Button</div>
              <div class="settings-desc">Show a button that confirms all reviewed record values as-is for the current category</div>
            </div>
            <div class="table-lock-toggle ${APP.settings.confirmRecordsEnabled !== false ? 'unlocked' : 'locked'}" id="setting-confirm-records">
              <div class="toggle-track"><div class="toggle-thumb"></div></div>
              <span class="table-lock-label" style="text-transform:none">${APP.settings.confirmRecordsEnabled !== false ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-label">
              <div>Accept VoucherVision Button</div>
              <div class="settings-desc">Show a button that accepts all AI values at once for the current category</div>
            </div>
            <div class="table-lock-toggle ${APP.settings.acceptAllEnabled ? 'unlocked' : 'locked'}" id="setting-accept-all">
              <div class="toggle-track"><div class="toggle-thumb"></div></div>
              <span class="table-lock-label" style="text-transform:none">${APP.settings.acceptAllEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-label">
              <div>Table Edit Lock Warning</div>
              <div class="settings-desc">Show the warning popup when unlocking table editing</div>
            </div>
            <div class="table-lock-toggle ${APP.settings.editLockWarning !== false ? 'unlocked' : 'locked'}" id="setting-edit-lock-warning">
              <div class="toggle-track"><div class="toggle-thumb"></div></div>
              <span class="table-lock-label" style="text-transform:none">${APP.settings.editLockWarning !== false ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-label">
              <div>Image Cache Size</div>
              <div class="settings-desc">Number of cached images kept in memory (100–6000). Default 2000. Higher values speed up browsing large projects at the cost of more memory use.</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="range" min="100" max="6000" step="100" id="setting-image-cache" value="${APP.settings.imageCacheSize || 2000}" style="width:140px;accent-color:var(--accent)">
              <span id="setting-image-cache-label" style="font-family:var(--font-mono);font-size:var(--fs-12);color:var(--text-secondary);min-width:40px">${APP.settings.imageCacheSize || 2000}</span>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-label">
              <div>Enable Italic Emphasis</div>
              <div class="settings-desc">Use italics to signal provisional, empty, or informational content</div>
            </div>
            <div class="table-lock-toggle ${APP.settings.italicEmphasis !== false ? 'unlocked' : 'locked'}" id="setting-italic-emphasis">
              <div class="toggle-track"><div class="toggle-thumb"></div></div>
              <span class="table-lock-label" style="text-transform:none">${APP.settings.italicEmphasis !== false ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

        </div>

        <!-- Right column -->
        <div style="flex:3;display:flex;flex-direction:column;gap:0">

          <div class="settings-row" id="settings-update-section" style="flex-direction:column;align-items:stretch">
            <div class="settings-label" style="margin-bottom:10px">
              <div>Updates</div>
              <div class="settings-desc">Check for new versions of VoucherVisionGO Editor</div>
            </div>
            <div id="update-info-container" style="font-size:var(--fs-12);color:var(--text-secondary);line-height:1.8">
              <div>Current version: <span id="update-current-version" style="font-family:var(--font-mono);color:var(--text-primary)">...</span></div>
              <div>Installed: <span id="update-install-date" style="color:var(--text-muted)">...</span></div>
              <div>Last checked: <span id="update-last-check" style="color:var(--text-muted)">...</span></div>
              <div id="update-status-line" style="margin-top:6px"></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:10px">
              <button class="btn-sm btn-primary" id="btn-check-update" style="font-size:var(--fs-11)">Check for Updates</button>
              <button class="btn-sm" id="btn-download-update" style="font-size:var(--fs-11);display:none">Download Update</button>
              <button class="btn-sm" id="btn-install-update" style="font-size:var(--fs-11);display:none;background:#1a5c1a;color:#4caf50;border-color:#4caf50">Restart to Update</button>
              <a id="btn-github-releases" href="#" style="font-size:var(--fs-11);color:var(--accent);text-decoration:none;margin-left:auto">View releases on GitHub &#x2197;</a>
            </div>
          </div>

        </div>

      </div>

      <!-- ── Bottom: full-width expanders ── -->

      <details class="settings-expander" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">
        <summary style="padding:10px 12px;cursor:pointer;font-size:var(--fs-13);font-weight:600;color:var(--text-primary);user-select:none">Accent Colors</summary>
        <div style="padding:4px 12px 12px">

          <div class="settings-row" style="flex-direction:column;align-items:stretch">
            <div class="settings-label" style="margin-bottom:8px">
              <div>Row Colors (Gray)</div>
              <div class="settings-desc">Alternating background shades for form and table rows</div>
            </div>
            <div style="display:flex;align-items:center;gap:16px">
              <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-11);color:var(--text-secondary);flex:1">
                Odd
                <input type="range" min="0" max="120" id="setting-row-odd" value="${hexToGray(APP.settings.rowColorOdd)}" style="flex:1;accent-color:var(--accent)">
                <span id="setting-row-odd-preview" style="width:28px;height:20px;border-radius:3px;border:1px solid var(--border);background:${APP.settings.rowColorOdd}"></span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:var(--fs-11);color:var(--text-secondary);flex:1">
                Even
                <input type="range" min="0" max="120" id="setting-row-even" value="${hexToGray(APP.settings.rowColorEven)}" style="flex:1;accent-color:var(--accent)">
                <span id="setting-row-even-preview" style="width:28px;height:20px;border-radius:3px;border:1px solid var(--border);background:${APP.settings.rowColorEven}"></span>
              </label>
              <button class="btn-sm" id="setting-row-reset" style="font-size:var(--fs-10)">Reset</button>
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
                <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-11);color:var(--text-secondary)">
                  <input type="color" class="setting-cat-color" data-key="${key}" value="${(APP.settings.catColors && APP.settings.catColors[key]) || def}" style="width:28px;height:22px;border:none;background:none;cursor:pointer;padding:0">
                  ${label}
                </label>
              `).join('')}
              <button class="btn-sm" id="setting-cat-reset" style="font-size:var(--fs-10)">Reset</button>
            </div>
          </div>

        </div>
      </details>

      <details class="settings-expander" style="border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px">
        <summary style="padding:10px 12px;cursor:pointer;font-size:var(--fs-13);font-weight:600;color:var(--text-primary);user-select:none">Font and Font Size</summary>
        <div style="padding:4px 12px 12px">

          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:12px">
              <label style="font-size:var(--fs-11);color:var(--text-secondary);min-width:70px">Font Family</label>
              <div id="setting-font-family" class="font-picker" style="position:relative">
                <div class="font-picker-selected" style="padding:4px 8px;font-size:var(--fs-12);background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;display:flex;justify-content:space-between;align-items:center;min-width:180px">
                  <span id="font-picker-label">${({
                    'system-sans': 'System Sans-Serif',
                    'system-serif': 'System Serif',
                    'atkinson': 'Atkinson Hyperlegible',
                    'opendyslexic': 'OpenDyslexic',
                  })[APP.settings.fontFamily || 'system-sans']}</span>
                  <span style="font-size:var(--fs-10);color:var(--text-muted);margin-left:8px">&#9662;</span>
                </div>
                <div class="font-picker-dropdown" id="font-picker-dropdown" style="display:none;position:absolute;top:100%;left:0;min-width:100%;z-index:9999;background:var(--bg-primary);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:2px;box-shadow:var(--shadow-lg)">
                  <div class="font-picker-option" data-value="system-sans" style="padding:6px 8px;cursor:pointer;font-size:var(--fs-12);white-space:nowrap">System Sans-Serif</div>
                  <div class="font-picker-option" data-value="system-serif" style="padding:6px 8px;cursor:pointer;font-size:var(--fs-12);white-space:nowrap">System Serif</div>
                  <div class="font-picker-option" data-value="atkinson" style="padding:6px 8px;cursor:pointer;font-size:var(--fs-12);white-space:nowrap">Atkinson Hyperlegible</div>
                  <div class="font-picker-option" data-value="opendyslexic" style="padding:6px 8px;cursor:pointer;font-size:var(--fs-12);white-space:nowrap">OpenDyslexic</div>
                </div>
              </div>
              <span id="font-preview-text" style="font-size:var(--fs-12);color:var(--text-secondary);white-space:nowrap"> Do you want to use this font for the VoucherVisionGO-Editor?</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <label style="font-size:var(--fs-11);color:var(--text-secondary);min-width:70px">Font Scale</label>
              <input type="range" min="1.0" max="2.0" step="0.1" id="setting-font-scale" value="${APP.settings.fontScale || 1.0}" style="flex:1;max-width:200px;accent-color:var(--accent)">
              <span id="setting-font-scale-label" style="font-family:var(--font-mono);font-size:var(--fs-12);color:var(--text-secondary);min-width:36px">${(APP.settings.fontScale || 1.0).toFixed(1)}x</span>
            </div>
          </div>

        </div>
      </details>

      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          <img src="icons/danger.svg" alt="" style="width:16px;height:16px;filter:brightness(0) saturate(100%) invert(40%) sepia(90%) saturate(2000%) hue-rotate(345deg)">
          <span style="font-size:var(--fs-13);font-weight:600;color:var(--error)">Danger Zone</span>
        </div>
        <button class="btn-sm" id="settings-reset-project" style="background:#3a1515;color:var(--error);border-color:var(--error);font-size:var(--fs-11)">Reset Project</button>
      </div>

      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', () => { overlay.remove(); saveCurrentSettings(); });

  document.getElementById('settings-close-top').addEventListener('click', () => {
    overlay.remove();
    saveCurrentSettings();
  });
  document.getElementById('settings-export-project')?.addEventListener('click', exportProject);
  document.getElementById('btn-open-progress-tracker')?.addEventListener('click', () => {
    openProgressTrackerPopup();
  });

  // Confirm Records toggle
  document.getElementById('setting-confirm-records').addEventListener('click', () => {
    APP.settings.confirmRecordsEnabled = !(APP.settings.confirmRecordsEnabled !== false);
    const toggle = document.getElementById('setting-confirm-records');
    toggle.classList.toggle('locked', !APP.settings.confirmRecordsEnabled);
    toggle.classList.toggle('unlocked', APP.settings.confirmRecordsEnabled);
    toggle.querySelector('.table-lock-label').textContent = APP.settings.confirmRecordsEnabled ? 'Enabled' : 'Disabled';
  });

  // Accept All toggle
  document.getElementById('setting-accept-all').addEventListener('click', () => {
    APP.settings.acceptAllEnabled = !APP.settings.acceptAllEnabled;
    const toggle = document.getElementById('setting-accept-all');
    toggle.classList.toggle('locked', !APP.settings.acceptAllEnabled);
    toggle.classList.toggle('unlocked', APP.settings.acceptAllEnabled);
    toggle.querySelector('.table-lock-label').textContent = APP.settings.acceptAllEnabled ? 'Enabled' : 'Disabled';
  });

  // Edit lock warning toggle
  document.getElementById('setting-edit-lock-warning').addEventListener('click', () => {
    const current = APP.settings.editLockWarning !== false;
    APP.settings.editLockWarning = !current;
    const toggle = document.getElementById('setting-edit-lock-warning');
    toggle.classList.toggle('locked', current);
    toggle.classList.toggle('unlocked', !current);
    toggle.querySelector('.table-lock-label').textContent = !current ? 'Enabled' : 'Disabled';
  });

  // Italic emphasis toggle
  document.getElementById('setting-italic-emphasis').addEventListener('click', () => {
    const current = APP.settings.italicEmphasis !== false;
    APP.settings.italicEmphasis = !current;
    const toggle = document.getElementById('setting-italic-emphasis');
    toggle.classList.toggle('locked', current);
    toggle.classList.toggle('unlocked', !current);
    toggle.querySelector('.table-lock-label').textContent = !current ? 'Enabled' : 'Disabled';
    applyTypographySettings();
  });

  // Image cache slider
  document.getElementById('setting-image-cache').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    APP.settings.imageCacheSize = val;
    document.getElementById('setting-image-cache-label').textContent = val;
  });

  // Font family custom dropdown
  const fontPicker = document.getElementById('setting-font-family');
  const fontDropdown = document.getElementById('font-picker-dropdown');
  const fontLabel = document.getElementById('font-picker-label');
  const fontPreview = document.getElementById('font-preview-text');
  const fontFamilyStacks = {
    'system-sans': "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif",
    'system-serif': "Georgia,'Times New Roman',Times,serif",
    'atkinson': "'Atkinson Hyperlegible Next',system-ui,sans-serif",
    'opendyslexic': "'OpenDyslexic',system-ui,sans-serif",
  };
  const fontDisplayNames = {
    'system-sans': 'System Sans-Serif',
    'system-serif': 'System Serif',
    'atkinson': 'Atkinson Hyperlegible',
    'opendyslexic': 'OpenDyslexic',
  };

  // Set initial preview font
  fontPreview.style.fontFamily = fontFamilyStacks[APP.settings.fontFamily || 'system-sans'];

  fontPicker.querySelector('.font-picker-selected').addEventListener('click', () => {
    fontDropdown.style.display = fontDropdown.style.display === 'none' ? 'block' : 'none';
  });
  fontDropdown.querySelectorAll('.font-picker-option').forEach(opt => {
    opt.addEventListener('mouseenter', () => { opt.style.background = 'var(--bg-hover)'; });
    opt.addEventListener('mouseleave', () => { opt.style.background = 'none'; });
    opt.addEventListener('click', () => {
      const val = opt.dataset.value;
      APP.settings.fontFamily = val;
      fontLabel.textContent = fontDisplayNames[val];
      fontPreview.style.fontFamily = fontFamilyStacks[val];
      fontDropdown.style.display = 'none';
      applyTypographySettings();
    });
  });
  // Close dropdown when clicking outside
  overlay.addEventListener('click', (e) => {
    if (!fontPicker.contains(e.target)) fontDropdown.style.display = 'none';
  }, true);

  // Font scale slider
  document.getElementById('setting-font-scale').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    APP.settings.fontScale = val;
    document.getElementById('setting-font-scale-label').textContent = val.toFixed(1) + 'x';
    applyTypographySettings();
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
      <div style="font-size:var(--fs-16);font-weight:700;margin-bottom:12px;color:var(--error)">&#9888; Danger: Reset Project</div>
      <div style="font-size:var(--fs-13);margin-bottom:12px;color:var(--text-secondary);line-height:1.6">
        Resetting this project will <strong>permanently delete</strong> all review progress:
      </div>
      <div style="padding:10px;background:var(--bg-primary);border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:16px;font-family:var(--font-mono);font-size:var(--fs-12);color:var(--text-secondary);line-height:1.8">
        <div style="color:var(--error)">_INPROGRESS/ (all review progress)</div>
        <div style="color:var(--error)">_REVIEWED/ (all reviewed files)</div>
        <div style="color:var(--error)">Reviewed_Data/ (exported spreadsheets)</div>
        <div>_prompts/ (cached prompts)</div>
      </div>
      <div style="font-size:var(--fs-12);margin-bottom:16px;color:var(--text-muted)">
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

  // Clear all pending save timers first
  clearAllPendingTimers();
  APP.dirtySpecimens.clear();
  APP.dirtyProject = false;

  await window.api.resetProject(APP.folderPath);

  // Reset in-memory state
  REWIND.stack = [];
  updateRewindButton();
  APP.state = { version: 1, folder_path: APP.folderPath, specimens: {} };
  APP.project = null;
  APP.settings = { acceptAllEnabled: false, confirmRecordsEnabled: true, mapTheme: 'light', rowColorOdd: '#2f2f2f', rowColorEven: '#242424', catColors: {}, fontFamily: 'system-sans', fontScale: 1.0, italicEmphasis: true };
  APP.currentIndex = 0;

  // Re-load folder from scratch (re-acquires lock, validates prompt, etc.)
  await loadFolder(APP.folderPath);
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

  const _rwBefore = rewindCapture([spec.filename], cat.fields, { categories_confirmed: true });

  for (const field of cat.fields) {
    if (specState.accepted_fields[field]) continue; // Already accepted
    const val = fj[field];
    const strVal = val !== undefined ? String(val) : '';
    const source = strVal === '' ? 'confirmed_empty' : 'ai';
    specState.accepted_fields[field] = { value: strVal, source };
  }

  specState.last_touched = new Date().toISOString();
  autoConfirmCategories(spec.filename);

  rewindRecord('acceptAll', 'Accept All Fields', `${cat.fields.length} fields in ${cat.name} on ${getDisplayFilename(spec.filename)}`, _rwBefore);

  renderCategoryTabs();
  renderCategoryForm();
  renderCategoryFooter();
  renderBounceBar();
  scheduleSaveState(spec.filename);
  scheduleAutoSaveReviewed(spec.filename);
}

function confirmRecordsFields() {
  const spec = APP.specimens[APP.currentIndex];
  const specState = APP.state.specimens[spec.filename];
  if (!specState) return;

  const fj = APP.currentSpecimen.formatted_json || {};
  const categories = getCategories();
  const cat = categories.find(c => c.name === APP.activeCategory);
  if (!cat) return;

  const _rwBefore = rewindCapture([spec.filename], cat.fields, { categories_confirmed: true });

  for (const field of cat.fields) {
    // Confirm whatever is currently in the Reviewed Record column as-is.
    // This mirrors pressing Enter on every field: unconfirmed edits get
    // accepted, already-accepted fields stay as they are, and untouched
    // fields get accepted as empty (zero-trust: VoucherVision content is
    // NOT pulled in).
    const hasUnconfirmed = specState.unconfirmed_fields?.[field] !== undefined;
    const hasAccepted = specState.accepted_fields?.[field] !== undefined;
    if (hasAccepted && !hasUnconfirmed) continue; // already confirmed — skip
    const reviewedVal = hasUnconfirmed
      ? specState.unconfirmed_fields[field]
      : (hasAccepted ? specState.accepted_fields[field].value : '');
    const aiVal = fj[field];
    const source = deriveAcceptedSource(aiVal, reviewedVal);
    specState.accepted_fields[field] = { value: reviewedVal, source };
    if (hasUnconfirmed) delete specState.unconfirmed_fields[field];
  }

  specState.last_touched = new Date().toISOString();
  autoConfirmCategories(spec.filename);

  rewindRecord('confirmRecords', 'Confirm Records', `${cat.fields.length} fields in ${cat.name} on ${getDisplayFilename(spec.filename)}`, _rwBefore);

  renderCategoryTabs();
  renderCategoryForm();
  renderCategoryFooter();
  renderBounceBar();
  scheduleSaveState(spec.filename);
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

function getDisplayFilename(filename, maxLength = null) {
  const stripped = String(filename ?? '').replace(/\.json$/i, '');
  return typeof maxLength === 'number' ? stripped.slice(0, maxLength) : stripped;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
