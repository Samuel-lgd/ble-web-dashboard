/**
 * PIDManager — orchestrates polling multiple PIDs in rotation.
 *
 * Groups PIDs by their polling interval tier and cycles through each group
 * according to its schedule. Handles both standard OBD2 PIDs and Toyota
 * proprietary PIDs (with automatic header switching via ATSHManager).
 *
 * Only one command is ever in-flight at a time (enforced by ELM327 queue).
 */
export class PIDManager {
  /**
   * @param {import('./elm327.js').ELM327} elm
   * @param {import('./atsh-manager.js').ATSHManager} atshManager
   * @param {import('./store.js').Store} store
   */
  constructor(elm, atshManager, store) {
    this._elm = elm;
    this._atsh = atshManager;
    this._store = store;

    /** @type {import('./pids-standard.js').PIDDefinition[]} */
    this._pids = [];
    /** @type {boolean} */
    this._running = false;
    /** @type {number | null} */
    this._loopTimeout = null;

    /**
     * Tracks the last poll time per PID (by unique key).
     * @type {Map<string, number>}
     */
    this._lastPoll = new Map();
  }

  /**
   * Register PID definitions to be polled.
   * Validates that Toyota PIDs have rxHeader defined.
   * @param {import('./pids-standard.js').PIDDefinition[]} pids
   */
  addPIDs(pids) {
    for (const pid of pids) {
      if (pid.protocol === 'toyota' && pid.header && !pid.rxHeader) {
        console.warn(`[PIDManager] Toyota PID "${pid.name}" (${pid.pid} on ${pid.header}) missing rxHeader`);
      }
      this._pids.push(pid);
      this._store.register(this._pidKey(pid));
    }
  }

  /**
   * Start the polling loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._loop();
  }

  /**
   * Stop the polling loop.
   */
  stop() {
    this._running = false;
    if (this._loopTimeout !== null) {
      clearTimeout(this._loopTimeout);
      this._loopTimeout = null;
    }
  }

  /**
   * Main polling loop. On each tick, finds the next PID that is due
   * for polling and sends its command.
   */
  async _loop() {
    if (!this._running) return;

    try {
      // Backpressure guard: do not enqueue a new poll while transport is busy.
      if (typeof this._elm.isBusy === 'function' && this._elm.isBusy()) {
        if (this._running) {
          this._loopTimeout = setTimeout(() => this._loop(), 50);
        }
        return;
      }

      const pid = this._nextDuePID();
      if (pid) {
        await this._pollPID(pid);
      }
    } catch (err) {
      // Invalidate ATSH state so next poll re-sends the full header + FC sequence
      this._atsh.invalidate();
      console.error('[PIDManager] poll error:', err.message);
    }

    if (this._running) {
      // Small delay to avoid tight-looping when no PIDs are due
      this._loopTimeout = setTimeout(() => this._loop(), 50);
    }
  }

  /**
   * Find the next PID that is due for polling based on its interval.
   * Prioritizes PIDs that are most overdue.
   * @returns {import('./pids-standard.js').PIDDefinition | null}
   */
  _nextDuePID() {
    const now = Date.now();
    let best = null;
    let bestOverdue = -Infinity;

    for (const pid of this._pids) {
      const key = this._pidKey(pid);
      const last = this._lastPoll.get(key) || 0;
      const elapsed = now - last;
      const overdue = elapsed - pid.interval;
      if (overdue > 0 && overdue > bestOverdue) {
        bestOverdue = overdue;
        best = pid;
      }
    }
    return best;
  }

  /**
   * Poll a single PID: switch header if needed, send command, parse response,
   * update the store.
   * @param {import('./pids-standard.js').PIDDefinition} pid
   */
  async _pollPID(pid) {
    const key = this._pidKey(pid);
    this._lastPoll.set(key, Date.now());

    // Handle header switching for Toyota PIDs
    if (pid.protocol === 'toyota' && pid.header) {
      await this._atsh.switchTo(pid.header, pid.rxHeader);
    } else if (pid.protocol === 'standard' && this._atsh.currentHeader !== null) {
      await this._atsh.resetToDefault();
    }

    const raw = await this._elm.send(pid.pid);

    if (pid.protocol === 'toyota' && pid.header) {
      const observedRx = this._extractResponseHeader(raw);
      if (observedRx && pid.rxHeader && observedRx !== pid.rxHeader) {
        console.warn(
          `[PIDManager] rxHeader mismatch for ${pid.name} (${pid.pid}) on ${pid.header}: ` +
          `expected ${pid.rxHeader}, observed ${observedRx}. Using observed header (dynamic fallback).`
        );
        pid.rxHeader = observedRx;
      }
    }

    // Check for error responses
    if (/NO DATA|ERROR|UNABLE|STOPPED/i.test(raw)) {
      return; // Skip — don't update store with bad data
    }

    const value = pid.parse(raw);
    if (value !== null && value !== undefined && !isNaN(value)) {
      this._store.update(key, value);
    }
  }

  /**
   * Generate a unique key for a PID definition.
   * Combines protocol, header (if any), pid command, and name to handle
   * multiple PIDs that share the same command but parse different bytes.
   * @param {import('./pids-standard.js').PIDDefinition} pid
   * @returns {string}
   */
  _pidKey(pid) {
    const h = pid.header || '';
    return `${pid.protocol}:${h}:${pid.pid}:${pid.name}`;
  }

  /**
   * Extract first 11-bit CAN header token from an ELM response string.
   * Expects ATH1 enabled responses like: "7EA 10 13 ...".
   * @param {string} raw
   * @returns {string | null}
   */
  _extractResponseHeader(raw) {
    const m = String(raw || '').match(/\b([0-9A-Fa-f]{3})\b/);
    return m ? m[1].toUpperCase() : null;
  }
}
