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

        // ATZ reset needs extra time and is used to detect chipset family.
        if (cmd === 'ATZ') {
          const atz = await this.send(cmd, CFG.RESET_DELAY_MS + CFG.COMMAND_TIMEOUT_MS);
          // Source: https://obdtester.com/elm-usb-commands
          // ATZ returns adapter identification; ELM clones often show "ELM327",
          // while STN-based adapters typically include "STNxxxx".
          if (/STN\d+/i.test(atz)) {
            this._log('RX', `[INIT] Adapter chipset detected: STN (${atz})`);
          } else if (/ELM327/i.test(atz)) {
            this._log('RX', `[INIT] Adapter chipset detected: ELM327 (${atz})`);
          } else {
            this._log('RX', `[INIT] Adapter chipset UNVERIFIED (${atz || 'no id string'})`);
          }
          await this._delay(CFG.RESET_DELAY_MS);
        } else if (cmd === 'ATDP') {
          await this._detectAndLockProtocol();
        } else if (cmd === 'ATAL') {
          await this._sendOptionalInit('ATAL',
            'UNVERIFIED on some clone firmware; continuing with adapter defaults if unsupported');
        } else if (cmd === 'ATAT2') {
          const ok = await this._sendOptionalInit('ATAT2',
            'ATAT2 unsupported on this adapter, falling back to ATAT1');
          if (!ok) {
            await this._sendOptionalInit('ATAT1', 'ATAT1 fallback also unsupported');
          }
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
   * Detect current protocol after ATSP0 and lock to explicit CAN profile.
   * Mapping is based on ELM protocol numbers 6/7/8/9.
   *
   * Sources:
   * - https://obdtester.com/elm-usb-commands (ATSP table + ATDP examples)
   */
  async _detectAndLockProtocol() {
    let atdp = '';
    try {
      atdp = await this.send('ATDP');
      this._log('RX', `[ATDP] ${atdp}`);
    } catch (err) {
      this._log('RX', `[ATDP] UNVERIFIED: command failed (${err?.message || err})`);
      return;
    }

    const forced = this._mapAtdpToAtsp(atdp);
    if (!forced) {
      this._log('RX', '[PROTO-LOCK] UNVERIFIED: keeping ATSP0 (auto)');
      return;
    }

    await this.send(forced);
    // Source: https://obdtester.com/elm-usb-commands
    // ATSP protocol numbers:
    // 6=ISO15765-4 CAN 11/500, 7=29/500, 8=11/250, 9=29/250.
    this._log('RX', `[PROTO-LOCK] ${forced} (from ATDP="${atdp}")`);
  }

  /**
   * @param {string} atdp
   * @returns {string | null} ATSP command or null if unrecognized.
   */
  _mapAtdpToAtsp(atdp) {
    const text = String(atdp || '').toUpperCase();

    // Accept both forms seen in the field: "CAN 11/500" and
    // "CAN (11 BIT ID, 500 KBAUD)".
    if (/CAN\s*\(?\s*11\s*BIT|CAN\s*11\s*\/\s*500/.test(text) && /500/.test(text)) {
      return 'ATSP6';
    }
    if (/CAN\s*\(?\s*29\s*BIT|CAN\s*29\s*\/\s*500/.test(text) && /500/.test(text)) {
      return 'ATSP7';
    }
    if (/CAN\s*\(?\s*11\s*BIT|CAN\s*11\s*\/\s*250/.test(text) && /250/.test(text)) {
      return 'ATSP8';
    }
    if (/CAN\s*\(?\s*29\s*BIT|CAN\s*29\s*\/\s*250/.test(text) && /250/.test(text)) {
      return 'ATSP9';
    }
    return null;
  }

  /**
   * Send optional init command and continue if unsupported.
   * @param {string} cmd
   * @param {string} warning
   * @returns {Promise<boolean>} true if command appears accepted.
   */
  async _sendOptionalInit(cmd, warning) {
    try {
      const res = await this.send(cmd);
      if (this._isErrorLike(res)) {
        this._log('RX', `[INIT] ${cmd} not accepted (${res}) — ${warning}`);
        return false;
      }
      return true;
    } catch (err) {
      this._log('RX', `[INIT] ${cmd} failed (${err?.message || err}) — ${warning}`);
      return false;
    }
  }

  /**
   * @param {string} text
   * @returns {boolean}
   */
  _isErrorLike(text) {
    return /(\?|\bERROR\b|\bUNABLE TO CONNECT\b|\bNO DATA\b)/i.test(String(text || ''));
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
   * Set the ELM327 response timeout (ATST) for the polling phase.
   * Lower values detect NO DATA faster on CAN bus where responses arrive in <50 ms.
   * Call AFTER initialize() — init needs the default (longer) timeout.
   *
   * @param {string} hexTicks — hex ATST value (each tick = 4.096 ms).
   *   '19' = 25 ticks = 102 ms, '0A' = 10 ticks = 41 ms.
   *
   * Source: ELM327 datasheet v2.3, §"Setting Timeouts"
   * Source: https://www.scantool.net/blog/tips-to-improve-elm327-performance/
   */
  async setPollingTimeout(hexTicks) {
    await this.send(`ATST ${hexTicks}`);
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

  /**
   * True when a command is currently in-flight or waiting in queue.
   * @returns {boolean}
   */
  isBusy() {
    return this._busy || this._queue.length > 0;
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
      this._checkTruncation(raw);
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
   * Check for ISO-TP multi-frame truncation.
   * Compares the number of Consecutive Frames received against the total
   * length declared in the First Frame PCI bytes.
   *
   * First Frame format (with ATH1):
   *   "7EA 10 13 61 01 ..."
   *    ─── ── ──
   *    hdr  │  └─ low byte of length
   *         └─ PCI: 0x1N (N = high nibble of length, usually 0)
   *
   * Total ISO-TP length = ((PCI & 0x0F) << 8) | lowByte
   * First Frame carries 6 data bytes, each Consecutive Frame carries 7.
   * Expected CFs = ceil((declaredLength - 6) / 7)
   *
   * @param {string} raw - Raw response before parsing.
   */
  _checkTruncation(raw) {
    if (!CFG.TRUNCATION_CHECK) return;

    // Match First Frame: [3-hex header] [1X] [YY] where 1X = FF PCI byte
    const ffMatch = raw.match(/[0-9A-Fa-f]{3}\s+(1[0-9A-Fa-f])\s+([0-9A-Fa-f]{2})/);
    if (!ffMatch) return; // Single frame — no truncation possible

    const pci = parseInt(ffMatch[1], 16);
    const lenByte = parseInt(ffMatch[2], 16);
    const declaredLength = ((pci & 0x0F) << 8) | lenByte;

    // Count Consecutive Frames (header followed by 2X PCI byte)
    const cfMatches = raw.match(/[0-9A-Fa-f]{3}\s+2[0-9A-Fa-f]/g);
    const cfCount = cfMatches ? cfMatches.length : 0;
    const expectedCFs = Math.ceil((declaredLength - 6) / 7);

    if (cfCount < expectedCFs) {
      this._log('RX',
        `[TRUNCATED] ISO-TP declared ${declaredLength}B ` +
        `(need ${expectedCFs} CFs), received only ${cfCount} CFs`);
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
