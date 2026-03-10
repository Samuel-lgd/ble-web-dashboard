import { pidKeyFromDefinition } from '../../pids/catalog.js';

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
  * @param {import('../ble/elm327.js').ELM327} elm
  * @param {import('../ble/atsh-manager.js').ATSHManager} atshManager
  * @param {import('../store/store.js').Store} store
   */
  constructor(elm, atshManager, store) {
    this._elm = elm;
    this._atsh = atshManager;
    this._store = store;

    /** @type {import('../../pids/definitions/standard.js').PIDDefinition[]} */
    this._pids = [];
    /** @type {Map<string, object>} */
    this._pidMeta = new Map();
    /** @type {Map<string, import('../../pids/definitions/standard.js').PIDDefinition>} */
    this._pidDefs = new Map();
    /** @type {Set<string>} */
    this._activePidKeys = new Set();
    /** @type {boolean} */
    this._running = false;
    /** @type {number | null} */
    this._loopTimeout = null;

    /**
     * Tracks the last poll time per PID (by unique key).
     * @type {Map<string, number>}
     */
    this._lastPoll = new Map();

    /** Sticky route to reduce ATSH/header churn between polls. */
    this._lastRouteKey = null;

    /** Runtime performance counters for audit and debug UI. */
    this._metrics = {
      startedAt: Date.now(),
      pollsTotal: 0,
      pollsOk: 0,
      pollsError: 0,
      pollsNoData: 0,
      headerSwitches: 0,
      schedulerIdleSleeps: 0,
      schedulerBusyDefers: 0,
      latencyAvgMs: 0,
      latencyMaxMs: 0,
      loopHz: 0,
      byPid: {},
    };
    this._metricsCallbacks = [];
    this._metricsWindow = {
      ts: Date.now(),
      loopTicks: 0,
    };
  }

  /**
   * Register PID definitions to be polled.
   * Validates that Toyota PIDs have rxHeader defined.
  * @param {import('../../pids/definitions/standard.js').PIDDefinition[]} pids
   */
  addPIDs(pids, { active = true } = {}) {
    for (const pid of pids) {
      const key = this._pidKey(pid);
      if (!this._pidMeta.has(key)) {
        if (pid.protocol === 'toyota' && pid.header && !pid.rxHeader) {
          console.warn(`[PIDManager] Toyota PID "${pid.name}" (${pid.pid} on ${pid.header}) missing rxHeader`);
        }
        this._pids.push(pid);
        this._pidMeta.set(key, {
          key,
          protocol: pid.protocol,
          header: pid.header || '',
          rxHeader: pid.rxHeader || '',
          pid: pid.pid,
          name: pid.name,
          unit: pid.unit,
          interval: pid.interval,
        });
        this._pidDefs.set(key, pid);
        this._store.register(key);
      }
      if (active) {
        this._activePidKeys.add(key);
      }
    }
  }

  /**
   * Replace the active polling set.
   * Unknown keys are ignored.
   * @param {string[]} keys
   */
  setActivePidKeys(keys) {
    const next = new Set();
    for (const key of keys || []) {
      if (this._pidMeta.has(key)) next.add(key);
    }
    this._activePidKeys = next;
  }

  /**
   * Mark a registered PID as active.
   * @param {string} key
   * @returns {boolean}
   */
  activatePid(key) {
    if (!this._pidMeta.has(key)) return false;
    this._activePidKeys.add(key);
    return true;
  }

  /**
   * Mark a registered PID as inactive.
   * @param {string} key
   * @returns {boolean}
   */
  deactivatePid(key) {
    if (!this._pidMeta.has(key)) return false;
    this._activePidKeys.delete(key);
    return true;
  }

  /**
   * Return a snapshot of active PID keys.
   * @returns {string[]}
   */
  getActivePidKeys() {
    return [...this._activePidKeys];
  }

  /**
   * Poll a registered PID once, regardless of active scheduler state.
   * Useful for manual debug/testing.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async pollOnceByKey(key) {
    const pid = this._pidDefs.get(key);
    if (!pid) return false;
    await this._pollPID(pid);
    return true;
  }

  /**
   * Return the currently registered polling set.
   * @returns {Array<object>}
   */
  getRegisteredPids() {
    return [...this._pidMeta.values()].map((row) => ({ ...row }));
  }

  /**
   * Start the polling loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._metrics.startedAt = Date.now();
    this._metricsWindow = { ts: Date.now(), loopTicks: 0 };
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
   * Subscribe to periodic polling metrics updates.
   * @param {function(object): void} callback
   */
  onMetrics(callback) {
    this._metricsCallbacks.push(callback);
  }

  /**
   * Return a read-only metrics snapshot.
   * @returns {object}
   */
  getMetricsSnapshot() {
    return JSON.parse(JSON.stringify(this._metrics));
  }

  /**
   * Main polling loop. On each tick, finds the next PID that is due
   * for polling and sends its command.
   */
  async _loop() {
    if (!this._running) return;
    this._metricsWindow.loopTicks++;
    this._flushLoopHz();

    try {
      // Backpressure guard: do not enqueue a new poll while transport is busy.
      if (typeof this._elm.isBusy === 'function' && this._elm.isBusy()) {
        this._metrics.schedulerBusyDefers++;
        if (this._running) {
          // Keep defer short to avoid adding artificial pacing latency.
          this._loopTimeout = setTimeout(() => this._loop(), 5);
        }
        return;
      }

      const pid = this._nextDuePID(this._lastRouteKey);
      if (pid) {
        await this._pollPID(pid);
        // If more work is due, schedule immediately (0 ms) to maximize bus usage.
        if (this._running) {
          this._loopTimeout = setTimeout(() => this._loop(), 0);
        }
        return;
      }
    } catch (err) {
      // Invalidate ATSH state so next poll re-sends the full header + FC sequence
      this._atsh.invalidate();
      console.error('[PIDManager] poll error:', err.message);
    }

    if (this._running) {
      // Idle delay should be small so due PIDs are picked quickly.
      this._metrics.schedulerIdleSleeps++;
      this._loopTimeout = setTimeout(() => this._loop(), 10);
    }
  }

  /**
   * Find the next PID that is due for polling based on its interval.
   * Prioritizes PIDs that are most overdue.
  * @returns {import('../../pids/definitions/standard.js').PIDDefinition | null}
   */
  _nextDuePID(preferredRouteKey = null) {
    const now = Date.now();
    let best = null;
    let bestOverdue = -Infinity;
    let preferred = null;
    let preferredOverdue = -Infinity;

    for (const pid of this._pids) {
      const key = this._pidKey(pid);
      if (!this._activePidKeys.has(key)) {
        continue;
      }
      const last = this._lastPoll.get(key) || 0;
      const elapsed = now - last;
      const overdue = elapsed - pid.interval;
      if (overdue > 0 && overdue > bestOverdue) {
        bestOverdue = overdue;
        best = pid;
      }

      if (preferredRouteKey && this._routeKey(pid) === preferredRouteKey && overdue > 0 && overdue > preferredOverdue) {
        preferredOverdue = overdue;
        preferred = pid;
      }
    }

    // Keep route stickiness unless it is significantly less urgent.
    // Threshold chosen from internal benchmark script (scripts/polling-benchmark.mjs).
    if (preferred && best && (bestOverdue - preferredOverdue) < 400) {
      return preferred;
    }
    return best;
  }

  /**
   * Poll a single PID: switch header if needed, send command, parse response,
   * update the store.
  * @param {import('../../pids/definitions/standard.js').PIDDefinition} pid
   */
  async _pollPID(pid) {
    const key = this._pidKey(pid);
    const routeKey = this._routeKey(pid);
    const startedAt = Date.now();

    this._metrics.pollsTotal++;
    this._ensurePidMetricsRow(key);
    this._lastPoll.set(key, Date.now());

    // Handle header switching for Toyota PIDs
    if (pid.protocol === 'toyota' && pid.header) {
      if (this._atsh.currentHeader !== pid.header) {
        this._metrics.headerSwitches++;
      }
      await this._atsh.switchTo(pid.header, pid.rxHeader);
    } else if (pid.protocol === 'standard' && this._atsh.currentHeader !== null) {
      this._metrics.headerSwitches++;
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
      this._metrics.pollsNoData++;
      this._metrics.byPid[key].noData += 1;
      this._metrics.byPid[key].lastResult = 'no-data';
      this._recordLatency(key, Date.now() - startedAt);
      this._lastRouteKey = routeKey;
      this._emitMetrics();
      return; // Skip — don't update store with bad data
    }

    const value = pid.parse(raw);
    if (value !== null && value !== undefined && !isNaN(value)) {
      this._store.update(key, value);
      this._metrics.pollsOk++;
      this._metrics.byPid[key].ok += 1;
      this._metrics.byPid[key].lastResult = 'ok';
      this._metrics.byPid[key].lastValue = value;
    } else {
      this._metrics.pollsError++;
      this._metrics.byPid[key].error += 1;
      this._metrics.byPid[key].lastResult = 'parse-error';
    }

    this._recordLatency(key, Date.now() - startedAt);
    this._lastRouteKey = routeKey;
    this._emitMetrics();
  }

  /**
   * Generate a unique key for a PID definition.
   * Combines protocol, header (if any), pid command, and name to handle
   * multiple PIDs that share the same command but parse different bytes.
  * @param {import('../../pids/definitions/standard.js').PIDDefinition} pid
   * @returns {string}
   */
  _pidKey(pid) {
    return pidKeyFromDefinition(pid);
  }

  /**
   * Group key used for scheduler stickiness and header churn reduction.
  * @param {import('../../pids/definitions/standard.js').PIDDefinition} pid
   * @returns {string}
   */
  _routeKey(pid) {
    return pid.protocol === 'toyota' ? `toyota:${pid.header || 'unknown'}` : 'standard';
  }

  _recordLatency(pidKey, latencyMs) {
    this._metrics.latencyMaxMs = Math.max(this._metrics.latencyMaxMs, latencyMs);
    const total = this._metrics.pollsTotal;
    this._metrics.latencyAvgMs = total <= 1
      ? latencyMs
      : ((this._metrics.latencyAvgMs * (total - 1)) + latencyMs) / total;

    const row = this._ensurePidMetricsRow(pidKey);
    row.polls += 1;
    row.maxMs = Math.max(row.maxMs, latencyMs);
    row.lastMs = latencyMs;
    row.lastTs = Date.now();
    row.avgMs = row.polls === 1 ? latencyMs : ((row.avgMs * (row.polls - 1)) + latencyMs) / row.polls;
    this._metrics.byPid[pidKey] = row;
  }

  _ensurePidMetricsRow(pidKey) {
    if (!this._metrics.byPid[pidKey]) {
      this._metrics.byPid[pidKey] = {
        polls: 0,
        ok: 0,
        noData: 0,
        error: 0,
        avgMs: 0,
        maxMs: 0,
        lastMs: 0,
        lastTs: 0,
        lastResult: 'never',
        lastValue: null,
      };
    }
    return this._metrics.byPid[pidKey];
  }

  _flushLoopHz() {
    const now = Date.now();
    const dt = now - this._metricsWindow.ts;
    if (dt < 1000) return;
    this._metrics.loopHz = (this._metricsWindow.loopTicks * 1000) / dt;
    this._metricsWindow.ts = now;
    this._metricsWindow.loopTicks = 0;
  }

  _emitMetrics() {
    if (this._metricsCallbacks.length === 0) return;
    const snapshot = this.getMetricsSnapshot();
    for (const cb of this._metricsCallbacks) {
      cb(snapshot);
    }
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
