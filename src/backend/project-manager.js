const fs = require('fs');
const path = require('path');
const os = require('os');

const { atomicWrite } = require('./util/file-utils');

const INPROGRESS_DIR = '_INPROGRESS';
const PROJECT_FILENAME = '_project.json';
const LEASE_DURATION_MS = 5 * 60 * 1000; // 5-minute lease

function getProjectPath(folderPath) {
  return path.join(folderPath, INPROGRESS_DIR, PROJECT_FILENAME);
}

function ensureInProgressDir(folderPath) {
  const dir = path.join(folderPath, INPROGRESS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Load project state from _INPROGRESS/_project.json.
 * Returns null if no project state exists.
 */
function loadProject(folderPath) {
  const projectPath = getProjectPath(folderPath);
  try {
    if (!fs.existsSync(projectPath)) return null;
    const raw = fs.readFileSync(projectPath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load project state:', e.message);
    return null;
  }
}

/**
 * Save project state to _INPROGRESS/_project.json with atomic write.
 */
function saveProject(folderPath, projectState) {
  ensureInProgressDir(folderPath);
  projectState.last_modified = new Date().toISOString();
  projectState.save_seq = (projectState.save_seq || 0) + 1;
  atomicWrite(getProjectPath(folderPath), projectState);
  return true;
}

/**
 * Build a lock object for the current process with a lease expiry.
 */
function buildLockPayload() {
  return {
    pid: process.pid,
    hostname: os.hostname(),
    username: os.userInfo().username,
    acquired_at: new Date().toISOString(),
    lease_expires_at: new Date(Date.now() + LEASE_DURATION_MS).toISOString(),
  };
}

/**
 * Acquire an advisory lock on the project.
 * Returns { success: true } if lock acquired.
 * Returns { success: false, holder: {...}, stale?: boolean } if another process holds the lock.
 *
 * Lease+hostname-aware model (issue #3):
 * - Same hostname: uses PID liveness check
 * - Different hostname: uses lease expiry (stale if expired)
 */
function acquireLock(folderPath) {
  ensureInProgressDir(folderPath);
  const projectPath = getProjectPath(folderPath);

  let project = null;
  try {
    if (fs.existsSync(projectPath)) {
      const raw = fs.readFileSync(projectPath, 'utf-8');
      project = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to read project for lock check:', e.message);
  }

  // Check existing lock
  if (project && project.lock) {
    const lock = project.lock;
    if (lock.pid && lock.pid !== process.pid) {
      const sameHost = lock.hostname === os.hostname();
      if (sameHost) {
        // Same machine: PID check is reliable
        try {
          process.kill(lock.pid, 0); // Signal 0 = check if alive
          return { success: false, holder: lock, stale: false };
        } catch {
          // Process is dead — stale lock, we can take over
          console.warn(`Stale lock from PID ${lock.pid} cleared (dead process)`);
        }
      } else {
        // Different machine: cannot check PID — use lease expiry
        const expires = lock.lease_expires_at
          ? new Date(lock.lease_expires_at).getTime() : 0;
        if (Date.now() < expires) {
          // Lease is still active — lock is held
          return { success: false, holder: lock, stale: false };
        }
        // Lease expired — report as stale so UI can ask user for takeover
        return { success: false, holder: lock, stale: true };
      }
    }
    // If lock.pid === process.pid, we already hold it — refresh below
  }

  // Acquire the lock
  if (!project) {
    project = { version: 1 };
  }
  project.lock = buildLockPayload();
  atomicWrite(projectPath, project);
  return { success: true };
}

/**
 * Force-acquire the lock, overriding any existing lock.
 * Used when user confirms takeover of a stale foreign-host lock.
 */
function forceAcquireLock(folderPath) {
  ensureInProgressDir(folderPath);
  const projectPath = getProjectPath(folderPath);

  let project = null;
  try {
    if (fs.existsSync(projectPath)) {
      const raw = fs.readFileSync(projectPath, 'utf-8');
      project = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to read project for force lock:', e.message);
  }

  if (!project) project = { version: 1 };
  project.lock = buildLockPayload();
  atomicWrite(projectPath, project);
  return { success: true };
}

/**
 * Refresh the lease expiry on our lock (heartbeat).
 * Should be called periodically while the project is open.
 */
function refreshLease(folderPath) {
  const projectPath = getProjectPath(folderPath);
  try {
    if (!fs.existsSync(projectPath)) return false;
    const raw = fs.readFileSync(projectPath, 'utf-8');
    const project = JSON.parse(raw);
    if (project.lock && project.lock.pid === process.pid && project.lock.hostname === os.hostname()) {
      project.lock.lease_expires_at = new Date(Date.now() + LEASE_DURATION_MS).toISOString();
      atomicWrite(projectPath, project);
      return true;
    }
  } catch (e) {
    console.warn('Failed to refresh lease:', e.message);
  }
  return false;
}

/**
 * Release the lock on the project (only if we hold it).
 */
function releaseLock(folderPath) {
  const projectPath = getProjectPath(folderPath);
  try {
    if (!fs.existsSync(projectPath)) return true;
    const raw = fs.readFileSync(projectPath, 'utf-8');
    const project = JSON.parse(raw);
    if (project.lock && project.lock.pid === process.pid && project.lock.hostname === os.hostname()) {
      delete project.lock;
      atomicWrite(projectPath, project);
    }
  } catch (e) {
    console.warn('Failed to release lock:', e.message);
  }
  return true;
}

/**
 * Synchronously flush all pending writes at once.
 * Called from beforeunload via sendSync — must be fully synchronous.
 *
 * payload: {
 *   project: { ...project state },
 *   inProgress: [ { filename, data } ],
 *   history: { ...history data }
 * }
 */
function flushAll(folderPath, payload) {
  const inprogressManager = require('./inprogress-manager');
  const historyManager = require('./history-manager');

  const errors = [];

  // Save project state
  if (payload.project) {
    try {
      saveProject(folderPath, payload.project);
    } catch (e) {
      errors.push({ target: '_project.json', error: e.message });
    }
  }

  // Save all dirty in-progress specimens
  if (payload.inProgress && Array.isArray(payload.inProgress)) {
    for (const { filename, data } of payload.inProgress) {
      try {
        inprogressManager.writeInProgress(folderPath, filename, data);
      } catch (e) {
        errors.push({ target: filename, error: e.message });
      }
    }
  }

  // Save rewind history
  if (payload.history) {
    try {
      historyManager.saveHistory(folderPath, payload.history);
    } catch (e) {
      errors.push({ target: '_history.json', error: e.message });
    }
  }

  if (errors.length > 0) {
    const summary = errors.map(e => `${e.target}: ${e.error}`).join('; ');
    throw new Error(`flushAll partial failure (${errors.length}): ${summary}`);
  }

  return true;
}

module.exports = {
  loadProject,
  saveProject,
  acquireLock,
  forceAcquireLock,
  refreshLease,
  releaseLock,
  flushAll,
  PROJECT_FILENAME,
  LEASE_DURATION_MS,
};
