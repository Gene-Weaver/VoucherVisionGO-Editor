// ── VoucherVisionGO Editor — Rewind History Engine ──────────

const REWIND = {
  stack: [],          // Array of history entries, newest first (index 0 = most recent)
  maxEntries: 50,
  _saveTimeout: null,
};

function cloneAcceptedFieldEntry(entry) {
  return entry ? structuredClone(entry) : undefined;
}

// ── Capture & Record ────────────────────────────────────────

/**
 * Capture the current state of specific fields for specific specimens.
 * Call BEFORE the mutation happens.
 * @param {string[]} filenames - specimen filenames to capture
 * @param {string[]} fields - field names to capture (within accepted_fields / unconfirmed_fields)
 * @param {Object} [options] - extra keys to capture: { categories_confirmed: true, flagged: true }
 * @returns {Object} snapshot keyed by filename
 */
function rewindCapture(filenames, fields, options = {}) {
  const snapshot = {};
  for (const fn of filenames) {
    const st = APP.state.specimens[fn] || {
      accepted_fields: {},
      unconfirmed_fields: {},
      categories_confirmed: [],
      flagged: false,
      flag_note: '',
      flag_tags: [],
    };

    const snap = { accepted_fields: {}, unconfirmed_fields: {} };

    for (const field of fields) {
      // Deep-copy accepted_fields entry (or undefined if not set)
      snap.accepted_fields[field] = cloneAcceptedFieldEntry(st.accepted_fields?.[field]);

      // Deep-copy unconfirmed_fields entry (or undefined if not set)
      snap.unconfirmed_fields[field] = st.unconfirmed_fields?.[field] !== undefined
        ? st.unconfirmed_fields[field]
        : undefined;
    }

    if (options.categories_confirmed) {
      snap.categories_confirmed = st.categories_confirmed ? [...st.categories_confirmed] : [];
    }
    if (options.flagged) {
      snap.flagged = st.flagged || false;
      snap.flag_note = st.flag_note || '';
      snap.flag_tags = [...(st.flag_tags || [])];
    }

    snapshot[fn] = snap;
  }
  return snapshot;
}

/**
 * Record an action after the mutation has happened.
 * Diffs the before-snapshot against current state to produce a minimal diff entry.
 * @param {string} action - machine-readable action type
 * @param {string} label - action name for the UI
 * @param {string} summary - context summary for the UI
 * @param {Object} beforeSnapshot - from rewindCapture()
 */
function rewindRecord(action, label, summary, beforeSnapshot) {
  const diffs = {};
  let hasDiffs = false;

  for (const [fn, before] of Object.entries(beforeSnapshot)) {
    const st = APP.state.specimens[fn];
    if (!st) continue;
    const specDiff = {};

    // Diff accepted_fields
    if (before.accepted_fields) {
      const afDiff = {};
      for (const [field, oldVal] of Object.entries(before.accepted_fields)) {
        const newVal = cloneAcceptedFieldEntry(st.accepted_fields?.[field]);

        const oldStr = oldVal ? JSON.stringify(oldVal) : 'undefined';
        const newStr = newVal ? JSON.stringify(newVal) : 'undefined';
        if (oldStr !== newStr) {
          afDiff[field] = { old: oldVal, new: newVal };
        }
      }
      if (Object.keys(afDiff).length > 0) specDiff.accepted_fields = afDiff;
    }

    // Diff unconfirmed_fields
    if (before.unconfirmed_fields) {
      const ufDiff = {};
      for (const [field, oldVal] of Object.entries(before.unconfirmed_fields)) {
        const newVal = st.unconfirmed_fields?.[field] !== undefined
          ? st.unconfirmed_fields[field]
          : undefined;

        if (oldVal !== newVal) {
          ufDiff[field] = { old: oldVal, new: newVal };
        }
      }
      if (Object.keys(ufDiff).length > 0) specDiff.unconfirmed_fields = ufDiff;
    }

    // Diff categories_confirmed
    if (before.categories_confirmed !== undefined) {
      const newCats = st.categories_confirmed ? [...st.categories_confirmed] : [];
      const oldStr = JSON.stringify(before.categories_confirmed.sort());
      const newStr = JSON.stringify(newCats.sort());
      if (oldStr !== newStr) {
        specDiff.categories_confirmed = { old: before.categories_confirmed, new: newCats };
      }
    }

    // Diff flagged
    if (before.flagged !== undefined) {
      const newTags = [...(st.flag_tags || [])];
      const oldTagsStr = JSON.stringify([...(before.flag_tags || [])].sort());
      const newTagsStr = JSON.stringify([...newTags].sort());
      const tagsChanged = oldTagsStr !== newTagsStr;
      if (before.flagged !== st.flagged || before.flag_note !== (st.flag_note || '') || tagsChanged) {
        specDiff.flagged = { old: before.flagged, new: st.flagged || false };
        specDiff.flag_note = { old: before.flag_note, new: st.flag_note || '' };
        specDiff.flag_tags = { old: [...(before.flag_tags || [])], new: newTags };
      }
    }

    if (Object.keys(specDiff).length > 0) {
      diffs[fn] = specDiff;
      hasDiffs = true;
    }
  }

  // Don't record if nothing actually changed
  if (!hasDiffs) return;

  const entry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    username: APP.username || '',
    session_id: APP.sessionId || null,
    action,
    label,
    summary,
    diffs,
  };

  REWIND.stack.unshift(entry);

  // Trim to max
  if (REWIND.stack.length > REWIND.maxEntries) {
    REWIND.stack.length = REWIND.maxEntries;
  }

  // Update rewind button visibility
  updateRewindButton();

  // Save to disk
  scheduleRewindCheckpoint();

  if (typeof recordProgressTrackerEntry === 'function') {
    recordProgressTrackerEntry(entry);
  }
}

/**
 * Wrap a mutation in capture + record. Use ONLY for atomic mutations.
 * Keystroke-level edits that should aggregate into a single history entry
 * must use the registerPendingRewindInput/commitPendingRewindInput subsystem
 * instead.
 *
 * @param {Object} spec
 * @param {string} spec.action                    Machine-readable action type
 * @param {string} spec.label                     Short human-readable label
 * @param {string|function} spec.summary          Summary string, or a function
 *                                                 that receives mutationFn's
 *                                                 return value and produces one.
 * @param {string[]} spec.filenames
 * @param {string[]} [spec.fields=[]]
 * @param {Object} [spec.opts={}]                 Extra capture flags
 *                                                 (categories_confirmed, flagged)
 * @param {function} mutationFn                   Performs the mutation; may
 *                                                 return any value that gets
 *                                                 forwarded through to the
 *                                                 caller (and to the summary fn).
 * @returns whatever mutationFn returned
 */
function withRewind({ action, label, summary, filenames, fields = [], opts = {} }, mutationFn) {
  const before = rewindCapture(filenames, fields, opts);
  const result = mutationFn();
  const resolvedSummary = typeof summary === 'function' ? summary(result) : summary;
  rewindRecord(action, label, resolvedSummary, before);
  return result;
}

/**
 * Capture rewind state now and commit it later. Use this for rare flows where
 * the user-visible mutation is synchronous but the history label/summary is
 * finalized after a follow-up prompt or deferred callback.
 */
function startRewindEntry({ action, label, summary, filenames, fields = [], opts = {} }) {
  const before = rewindCapture(filenames, fields, opts);
  return (result) => {
    const resolvedSummary = typeof summary === 'function' ? summary(result) : summary;
    rewindRecord(action, label, resolvedSummary, before);
    return result;
  };
}

// ── Rewind ──────────────────────────────────────────────────

/**
 * Reverse-apply a single history entry's diffs.
 * Returns an array of filenames that were skipped (specimen no longer exists).
 */
function applyDiffReverse(entry) {
  const skipped = [];
  for (const [fn, specDiff] of Object.entries(entry.diffs)) {
    const st = APP.state.specimens[fn];
    if (!st) { skipped.push(fn); continue; }

    // Restore accepted_fields
    if (specDiff.accepted_fields) {
      for (const [field, diff] of Object.entries(specDiff.accepted_fields)) {
        if (diff.old === undefined) {
          delete st.accepted_fields?.[field];
        } else {
          if (!st.accepted_fields) st.accepted_fields = {};
          st.accepted_fields[field] = cloneAcceptedFieldEntry(diff.old);
        }
      }
    }

    // Restore unconfirmed_fields
    if (specDiff.unconfirmed_fields) {
      for (const [field, diff] of Object.entries(specDiff.unconfirmed_fields)) {
        if (diff.old === undefined) {
          if (st.unconfirmed_fields) delete st.unconfirmed_fields[field];
        } else {
          if (!st.unconfirmed_fields) st.unconfirmed_fields = {};
          st.unconfirmed_fields[field] = diff.old;
        }
      }
    }

    // Restore categories_confirmed
    if (specDiff.categories_confirmed) {
      st.categories_confirmed = [...specDiff.categories_confirmed.old];
    }

    // Restore flagged
    if (specDiff.flagged) {
      st.flagged = specDiff.flagged.old;
      st.flag_note = specDiff.flag_note.old;
      if (specDiff.flag_tags) st.flag_tags = [...specDiff.flag_tags.old];
    }

    st.last_touched = new Date().toISOString();
  }
  return skipped;
}

/**
 * Rewind from the most recent action back to and including the entry at stackIndex.
 * Removes rewound entries from the stack permanently.
 */
function rewindTo(stackIndex) {
  // Collect affected specimens BEFORE applying diffs (issue #14)
  const affectedFilenames = new Set();
  const allSkipped = new Set();
  for (let i = 0; i <= stackIndex; i++) {
    for (const fn of Object.keys(REWIND.stack[i].diffs)) {
      affectedFilenames.add(fn);
    }
    const skipped = applyDiffReverse(REWIND.stack[i]);
    for (const fn of skipped) allSkipped.add(fn);
  }

  // Remove rewound entries
  REWIND.stack.splice(0, stackIndex + 1);

  // Save only affected specimens (not all)
  for (const fn of affectedFilenames) {
    scheduleInProgressSave(fn);
  }

  scheduleProjectSave();
  reRenderCurrentView();
  updateRewindButton();
  scheduleRewindCheckpoint();

  // Warn user if some specimens were skipped (no longer in session)
  if (allSkipped.size > 0) {
    const names = [...allSkipped].map(fn => fn.replace(/\.[^.]+$/, '')).join(', ');
    console.warn('Rewind skipped specimens no longer in session:', names);
    alert(`Rewind completed, but changes to ${allSkipped.size} specimen(s) could not be restored because they are no longer in this session:\n\n${names}`);
  }
}

/**
 * Re-render whichever view is currently active.
 */
function reRenderCurrentView() {
  switch (APP.currentView) {
    case 'review':
      renderCategoryTabs();
      renderCategoryForm();
      renderCategoryFooter();
      renderBounceBar();
      // Update flag button (it lives in the review nav, not in the sub-renders)
      const spec = APP.specimens[APP.currentIndex];
      const specState = spec ? APP.state.specimens[spec.filename] : null;
      const flagBtn = document.getElementById('btn-flag');
      if (flagBtn && specState) {
        flagBtn.classList.toggle('flagged', specState.flagged);
        flagBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px">${flagIconSvg(specState.flagged)} ${specState.flagged ? 'Flagged' : 'Flag'}</span>`;
      }
      break;
    case 'table':
      renderTableView();
      break;
    case 'focus':
      renderFocusSidebar(getFocusCategories());
      renderFocusMain();
      break;
  }
  updateNavBar();
}

// ── Disk Persistence ────────────────────────────────────────

function scheduleRewindCheckpoint() {
  if (REWIND._saveTimeout) clearTimeout(REWIND._saveTimeout);
  REWIND._saveTimeout = setTimeout(() => {
    saveRewindCheckpoint();
  }, 1000);
}

async function saveRewindCheckpoint() {
  if (!APP.folderPath) return;
  try {
    await window.api.saveHistory(APP.folderPath, {
      version: 1,
      saved_at: new Date().toISOString(),
      folder_path: APP.folderPath,
      stack: REWIND.stack,
    });
  } catch (e) {
    console.warn('Failed to save rewind checkpoint:', e);
  }
}

async function loadRewindCheckpoint() {
  if (!APP.folderPath) return;
  try {
    const data = await window.api.loadHistory(APP.folderPath);
    if (data && data.version === 1 && Array.isArray(data.stack)) {
      // Identity check: only load history if it belongs to this project folder
      if (data.folder_path && data.folder_path !== APP.folderPath) {
        console.warn('Rewind history belongs to a different folder, discarding');
        REWIND.stack = [];
      } else {
        REWIND.stack = data.stack.slice(0, REWIND.maxEntries);
      }
    }
  } catch (e) {
    console.warn('Failed to load rewind checkpoint:', e);
    REWIND.stack = [];
  }
  updateRewindButton();
}

// ── Rewind UI ───────────────────────────────────────────────

function updateRewindButton() {
  const btn = document.getElementById('btn-rewind');
  if (!btn) return;
  btn.style.display = REWIND.stack.length > 0 ? '' : 'none';
  btn.textContent = `Rewind (${REWIND.stack.length})`;
}

function openRewindPopup() {
  if (REWIND.stack.length === 0) return;

  // Toggle existing popup if any
  const shell = createPopupShell({
    overlayId: 'rewind-overlay',
    overlayClass: 'rewind-overlay',
    zIndex: 10000,
  });
  if (!shell) return;
  const overlay = shell.overlay;
  const close = shell.close;

  let selectedCount = 1; // default: rewind 1 action

  function render() {
    overlay.innerHTML = `
      <div class="rewind-popup" onclick="event.stopPropagation()">
        <div class="rewind-header">
          <span class="rewind-title">Rewind <span style="font-size:var(--fs-11);color:var(--text-muted);font-weight:normal">(${REWIND.stack.length} / ${REWIND.maxEntries} actions stored)</span></span>
          <button class="btn-sm btn-icon popup-close-btn" id="rewind-close" title="Close"><img src="icons/close.svg" alt="Close"></button>
        </div>
        <div class="rewind-body">
          <div class="rewind-timeline">
            <div class="rewind-entry rewind-current">
              <div class="rewind-connector rewind-connector-down ${REWIND.stack.length > 0 && selectedCount > 0 ? 'selected' : ''}"></div>
              <div class="rewind-dot current"></div>
              <div class="rewind-entry-text">
                <div class="rewind-entry-label">Current State</div>
              </div>
            </div>
            ${REWIND.stack.map((entry, i) => `
              <div class="rewind-entry ${i < selectedCount ? 'rewind-selected' : ''}" data-index="${i}">
                <div class="rewind-connector ${i < selectedCount ? 'selected' : ''} ${i === selectedCount - 1 ? 'selected-last' : ''}"></div>
                <div class="rewind-dot ${i < selectedCount ? 'selected' : ''}"></div>
                <div class="rewind-entry-text">
                  <div class="rewind-entry-label">${escapeHtml(entry.label)}</div>
                  <div class="rewind-entry-summary">${escapeHtml(entry.summary)}</div>
                  <div class="rewind-entry-time">${formatRewindTime(entry.timestamp)}</div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="rewind-slider-container">
            <input type="range" class="rewind-slider" id="rewind-slider"
              min="1" max="${REWIND.stack.length}" value="${selectedCount}"
              orient="vertical">
          </div>
        </div>
        <div class="rewind-footer">
          <button class="btn-sm" id="rewind-cancel">Cancel</button>
          <button class="btn-sm btn-danger" id="rewind-go">Rewind ${selectedCount} action${selectedCount > 1 ? 's' : ''}</button>
        </div>
      </div>
    `;

    // Wire events
    overlay.querySelector('#rewind-close').addEventListener('click', close);
    overlay.querySelector('#rewind-cancel').addEventListener('click', close);

    overlay.querySelector('#rewind-slider').addEventListener('input', (e) => {
      selectedCount = parseInt(e.target.value);
      render();
    });

    // Click on timeline entries to select
    overlay.querySelectorAll('.rewind-entry[data-index]').forEach(el => {
      el.addEventListener('click', () => {
        selectedCount = parseInt(el.dataset.index) + 1;
        render();
      });
    });

    overlay.querySelector('#rewind-go').addEventListener('click', () => {
      close();
      showRewindConfirmation(selectedCount);
    });
  }

  render();
}

function showRewindConfirmation(count) {
  const entries = REWIND.stack.slice(0, count);
  const shell = createPopupShell({
    overlayClass: 'rewind-overlay',
    zIndex: 10000,
  });
  const overlay = shell.overlay;
  const close = shell.close;

  overlay.innerHTML = `
    <div class="rewind-confirm-popup" style="position:relative" onclick="event.stopPropagation()">
      <button class="btn-sm btn-icon popup-close-btn popup-close-btn-floating" id="rewind-confirm-close" title="Close"><img src="icons/close.svg" alt="Close"></button>
      <div class="rewind-confirm-title" style="padding-right:24px">Rewind ${count} action${count > 1 ? 's' : ''}?</div>
      <div class="rewind-confirm-body">
        <div class="rewind-confirm-text">This will undo the following:</div>
        <ul class="rewind-confirm-list">
          ${entries.map(e => `<li>${escapeHtml(e.label)} — ${escapeHtml(e.summary)}</li>`).join('')}
        </ul>
        <div class="rewind-confirm-warning">This cannot be undone.</div>
      </div>
      <div class="rewind-confirm-footer">
        <button class="btn-sm" id="rewind-confirm-cancel">Cancel</button>
        <button class="btn-sm btn-danger" id="rewind-confirm-go">I understand, rewind</button>
      </div>
    </div>
  `;

  overlay.querySelector('#rewind-confirm-close').addEventListener('click', close);
  overlay.querySelector('#rewind-confirm-cancel').addEventListener('click', close);
  overlay.querySelector('#rewind-confirm-go').addEventListener('click', () => {
    close();
    rewindTo(count - 1);
  });
}

function formatRewindTime(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

// beforeunload save is now handled by the unified handler in app.js
// which calls flushSaves() synchronously with rewind history included.
