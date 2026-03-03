import { ELM327 as CFG } from './config.js';

/**
 * @typedef {'idle' | 'initializing' | 'ready' | 'error'} ELM327State
 */

/**
 * ELM327 protocol handler.
 * Manages initialization, command queuing (one-at-a-time), response parsing,
 * timeouts, and retries.
 */
export class ELM327 {
  /**
   * @param {import('./ble-adapter.js').BLEAdapter} adapter
   */
  constructor(adapter) {
    /** @type {import('./ble-adapter.js').BLEAdapter} */
    this._adapter = adapter;
    /** @type {ELM327State} */
    this.state = 'idle';
    /** @type {Array<function(ELM327State): void>} */
    this._stateCallbacks = [];
    /** @type {Array<function(string, string): void>} */
    this._logCallbacks = [];

    // Response accumulator
    /** @type {string} */
    this._buffer = '';
    /** @type {function(string): void | null} */
    this._resolve = null;
    /** @type {number | null} */
    this._timeoutId = null;

    // Command queue
    /** @type {Array<{command: string, resolve: function, reject: function, timeout: number, retries: number}>} */
    this._queue = [];
    /** @type {boolean} */
    this._busy = false;

    // Wire incoming data
    this._adapter.onData((chunk) => this._onData(chunk));
  }

  /**
   * Run the full ELM327 initialization sequence.
   * @returns {Promise<void>}
   */
  async initialize() {
    this._setState('initializing');
    try {
      for (let i = 0; i < CFG.INIT_SEQUENCE.length; i++) {
        const cmd = CFG.INIT_SEQUENCE[i];
        // ATZ reset needs extra time
        if (cmd === 'ATZ') {
          await this.send(cmd, CFG.RESET_DELAY_MS + CFG.COMMAND_TIMEOUT_MS);
          await this._delay(CFG.RESET_DELAY_MS);
        } else {
          await this.send(cmd);
        }
      }
      this._setState('ready');
    } catch (err) {
      this._setState('error');
      throw err;
    }
  }

  /**
   * Send a command and return the parsed response.
   * Commands are queued and executed one at a time.
   * @param {string} command - AT or OBD command (no terminator needed).
   * @param {number} [timeout] - Override timeout in ms.
   * @returns {Promise<string>} Cleaned response text.
   */
  send(command, timeout = CFG.COMMAND_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      this._queue.push({
        command,
        resolve,
        reject,
        timeout,
        retries: 0,
      });
      this._processQueue();
    });
  }

  /**
   * Register a callback for state changes.
   * @param {function(ELM327State): void} callback
   */
  onStateChange(callback) {
    this._stateCallbacks.push(callback);
  }

  /**
   * Register a callback for raw command/response log entries.
   * @param {function(string, string): void} callback - (direction, text) where direction is 'TX' or 'RX'.
   */
  onLog(callback) {
    this._logCallbacks.push(callback);
  }

  /** Process the next item in the command queue if idle. */
  _processQueue() {
    if (this._busy || this._queue.length === 0) return;
    this._busy = true;
    const item = this._queue[0];
    this._executeCommand(item);
  }

  /**
   * Execute a single queued command.
   * @param {{command: string, resolve: function, reject: function, timeout: number, retries: number}} item
   */
  _executeCommand(item) {
    this._buffer = '';
    this._log('TX', item.command);

    // Set up response timeout
    this._timeoutId = setTimeout(() => {
      this._resolve = null;
      this._timeoutId = null;
      if (item.retries < CFG.MAX_RETRIES) {
        item.retries++;
        this._log('RX', `[TIMEOUT — retry ${item.retries}/${CFG.MAX_RETRIES}]`);
        this._executeCommand(item);
      } else {
        this._queue.shift();
        this._busy = false;
        item.reject(new Error(`Timeout: no response for "${item.command}" after ${CFG.MAX_RETRIES} retries`));
        this._processQueue();
      }
    }, item.timeout);

    // Set up response resolver
    this._resolve = (raw) => {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
      this._resolve = null;
      this._log('RX', raw);
      const parsed = this._parseResponse(raw, item.command);
      this._queue.shift();
      this._busy = false;
      item.resolve(parsed);
      this._processQueue();
    };

    // Send the command
    this._adapter.send(item.command).catch((err) => {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
      this._resolve = null;
      this._queue.shift();
      this._busy = false;
      item.reject(err);
      this._processQueue();
    });
  }

  /**
   * Handle incoming BLE data fragments. Accumulates until a `>` prompt.
   * @param {string} chunk
   */
  _onData(chunk) {
    this._buffer += chunk;
    // ELM327 signals end of response with '>'
    if (this._buffer.includes('>')) {
      const response = this._buffer;
      this._buffer = '';
      if (this._resolve) {
        this._resolve(response);
      }
    }
  }

  /**
   * Clean an ELM327 response: strip echo, whitespace, prompts, statuses.
   * @param {string} raw - Raw response string.
   * @param {string} command - The command that was sent (for echo stripping).
   * @returns {string} Cleaned hex data or status.
   */
  _parseResponse(raw, command) {
    let text = raw;
    // Remove > prompt
    text = text.replace(/>/g, '');
    // Remove echo of the command
    text = text.replace(new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    // Remove status messages
    text = text.replace(/SEARCHING\.\.\./gi, '');
    text = text.replace(/BUS INIT:\s*(OK|\.\.\.)/gi, '');
    // Strip carriage returns and collapse whitespace
    text = text.replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
  }

  /**
   * @param {string} direction
   * @param {string} text
   */
  _log(direction, text) {
    for (const cb of this._logCallbacks) {
      cb(direction, text);
    }
  }

  /** @param {ELM327State} state */
  _setState(state) {
    this.state = state;
    for (const cb of this._stateCallbacks) {
      cb(state);
    }
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
