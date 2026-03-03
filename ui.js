import { UI } from './config.js';
import { STANDARD_PIDS } from './pids-standard.js';
import { TOYOTA_PIDS } from './pids-toyota.js';

/**
 * Minimal functional UI — renders connection controls, a raw log panel,
 * and a PID data grid. No styling effort, purely functional.
 */
export class DashboardUI {
  /**
   * @param {import('./store.js').Store} store
   */
  constructor(store) {
    this._store = store;
    /** @type {string[]} */
    this._logLines = [];
    /** @type {Map<string, {name: string, unit: string, protocol: string}>} */
    this._pidMeta = new Map();

    // Build PID metadata lookup
    const allPids = [...STANDARD_PIDS, ...TOYOTA_PIDS];
    for (const p of allPids) {
      const key = this._pidKey(p);
      this._pidMeta.set(key, {
        name: p.name,
        unit: p.unit,
        protocol: p.protocol,
      });
    }

    // DOM references (set after render)
    /** @type {HTMLButtonElement | null} */
    this._connectBtn = null;
    /** @type {HTMLElement | null} */
    this._statusEl = null;
    /** @type {HTMLPreElement | null} */
    this._logEl = null;
    /** @type {HTMLElement | null} */
    this._gridEl = null;
    /** @type {Map<string, HTMLElement>} */
    this._pidRows = new Map();
  }

  /**
   * Build the initial DOM structure inside the given container.
   * @param {HTMLElement} container
   */
  render(container) {
    container.innerHTML = `
      <h1>BLE OBD2 Dashboard</h1>
      <div id="connection">
        <button id="connect-btn">Connect</button>
        <span id="status">disconnected</span>
      </div>
      <h2>Raw Log</h2>
      <pre id="log"></pre>
      <h2>PID Data</h2>
      <table id="pid-grid">
        <thead>
          <tr>
            <th>Protocol</th>
            <th>Name</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Age</th>
          </tr>
        </thead>
        <tbody id="pid-tbody"></tbody>
      </table>
    `;

    this._connectBtn = /** @type {HTMLButtonElement} */ (document.getElementById('connect-btn'));
    this._statusEl = document.getElementById('status');
    this._logEl = /** @type {HTMLPreElement} */ (document.getElementById('log'));
    this._gridEl = document.getElementById('pid-tbody');

    // Create a row for each registered PID
    for (const key of this._store.keys()) {
      this._createPIDRow(key);
    }

    // Subscribe to store updates
    this._store.onChange((key) => this._updatePIDRow(key));

    // Periodically refresh the "age" column
    setInterval(() => this._refreshAges(), 500);
  }

  /**
   * Set the click handler for the connect button.
   * @param {function(): void} handler
   */
  onConnect(handler) {
    if (this._connectBtn) {
      this._connectBtn.addEventListener('click', handler);
    }
  }

  /**
   * Update the connection status display.
   * @param {string} status
   */
  setStatus(status) {
    if (this._statusEl) {
      this._statusEl.textContent = status;
    }
    if (this._connectBtn) {
      this._connectBtn.disabled = (status === 'connecting' || status === 'initializing');
      this._connectBtn.textContent = (status === 'disconnected') ? 'Connect' : 'Disconnect';
    }
  }

  /**
   * Add a line to the raw log panel.
   * @param {string} direction - 'TX' or 'RX'.
   * @param {string} text
   */
  addLog(direction, text) {
    const line = `[${direction}] ${text}`;
    this._logLines.push(line);
    while (this._logLines.length > UI.LOG_LINES) {
      this._logLines.shift();
    }
    if (this._logEl) {
      this._logEl.textContent = this._logLines.join('\n');
      this._logEl.scrollTop = this._logEl.scrollHeight;
    }
  }

  /**
   * Create a table row for a PID.
   * @param {string} key
   */
  _createPIDRow(key) {
    if (!this._gridEl) return;
    const meta = this._pidMeta.get(key);
    if (!meta) return;

    const tr = document.createElement('tr');
    const badge = meta.protocol === 'toyota' ? 'TOYOTA' : 'STD';
    tr.innerHTML = `
      <td><span class="badge badge-${meta.protocol}">${badge}</span></td>
      <td>${meta.name}</td>
      <td class="pid-value">--</td>
      <td>${meta.unit}</td>
      <td class="pid-age">--</td>
    `;
    this._gridEl.appendChild(tr);
    this._pidRows.set(key, tr);
  }

  /**
   * Update the value cell for a PID row.
   * @param {string} key
   */
  _updatePIDRow(key) {
    const row = this._pidRows.get(key);
    if (!row) return;
    const entry = this._store.get(key);
    if (!entry || entry.value === null) return;

    const valueCell = row.querySelector('.pid-value');
    if (valueCell) {
      // Format number: integers stay as-is, floats get 1 decimal
      const formatted = Number.isInteger(entry.value)
        ? entry.value.toString()
        : entry.value.toFixed(1);
      valueCell.textContent = formatted;
    }
  }

  /** Refresh the age column for all PID rows. */
  _refreshAges() {
    const now = Date.now();
    for (const [key, row] of this._pidRows) {
      const entry = this._store.get(key);
      const ageCell = row.querySelector('.pid-age');
      if (!ageCell) continue;
      if (!entry || entry.timestamp === null) {
        ageCell.textContent = '--';
      } else {
        const ageSec = ((now - entry.timestamp) / 1000).toFixed(1);
        ageCell.textContent = `${ageSec}s`;
      }
    }
  }

  /**
   * Generate the same PID key as PIDManager.
   * @param {import('./pids-standard.js').PIDDefinition} pid
   * @returns {string}
   */
  _pidKey(pid) {
    const h = pid.header || '';
    return `${pid.protocol}:${h}:${pid.pid}:${pid.name}`;
  }
}
