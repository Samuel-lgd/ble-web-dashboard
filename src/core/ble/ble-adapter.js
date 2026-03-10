import { BLE_PROFILES } from '../config/config.js';

/**
 * @typedef {'disconnected' | 'connecting' | 'connected'} BLEState
 */

/**
 * Web Bluetooth adapter for ELM327-based OBD2 dongles.
 * Handles GATT connection, characteristic discovery, and raw byte I/O.
 *
 * Supports multiple BLE profiles (VLinker MC+, generic ELM327, HM-10) via
 * automatic discovery: after GATT connection, each known profile is tried
 * in priority order until a matching service is found.
 */
export class BLEAdapter {
  constructor() {
    /** @type {BluetoothDevice | null} */
    this._device = null;
    /** @type {BluetoothRemoteGATTCharacteristic | null} */
    this._writeCh = null;
    /** @type {BluetoothRemoteGATTCharacteristic | null} */
    this._notifyCh = null;
    /** @type {BLEState} */
    this.state = 'disconnected';
    /** @type {Array<function(string): void>} */
    this._dataCallbacks = [];
    /** @type {Array<function(BLEState): void>} */
    this._stateCallbacks = [];
    /** Bound handler kept for removal */
    this._onDisconnected = this._handleDisconnect.bind(this);
    /** Decoder for incoming bytes */
    this._decoder = new TextDecoder();
    /** Encoder for outgoing strings */
    this._encoder = new TextEncoder();
    /** @type {typeof BLE_PROFILES[0] | null} The BLE profile that matched */
    this._activeProfile = null;
    /** Bound characteristic notification handler */
    this._onCharacteristicValueChanged = this._handleCharacteristicValueChanged.bind(this);
    /** True when disconnect() was explicitly requested by the app */
    this._manualDisconnect = false;
    /** Reconnect policy for transient Android BLE drops */
    this._reconnectMaxAttempts = 5;
    this._reconnectBaseDelayMs = 750;
    /** @type {'without-response' | 'with-response'} */
    this._writeMode = 'without-response';
    /** Runtime chunk size used for outgoing writes */
    this._writeChunkSize = 20;
  }

  /**
   * Request a BLE device, connect to GATT, and set up characteristics.
   * Tries each known BLE profile in order until one is discovered.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.state !== 'disconnected') return;
    this._manualDisconnect = false;
    this._setState('connecting');

    try {
      // Build filters: match known device name prefixes + known service UUIDs
      const nameFilters = [];
      const allServices = [];
      for (const profile of BLE_PROFILES) {
        for (const prefix of profile.namePrefix) {
          nameFilters.push({ namePrefix: prefix });
        }
        allServices.push(profile.service);
      }

      try {
        this._device = await navigator.bluetooth.requestDevice({
          filters: nameFilters.length > 0 ? nameFilters : [{ services: [allServices[0]] }],
          optionalServices: allServices,
        });
      } catch (err) {
        // Source: https://developer.chrome.com/docs/capabilities/bluetooth
        // If name filters miss a firmware variant, fallback to acceptAllDevices
        // and keep strict service discovery after connection.
        if (err && err.name === 'NotFoundError') {
          this._device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: allServices,
          });
        } else {
          throw err;
        }
      }

      this._device.addEventListener('gattserverdisconnected', this._onDisconnected);

      await this._connectAndDiscover();

      this._setState('connected');
    } catch (err) {
      this._cleanup({ keepDevice: false });
      this._setState('disconnected');
      throw err;
    }
  }

  /**
   * Disconnect from the device and clean up resources.
   */
  disconnect() {
    this._manualDisconnect = true;
    if (this._device && this._device.gatt.connected) {
      this._device.gatt.disconnect();
    }
    this._cleanup({ keepDevice: false });
    this._setState('disconnected');
  }

  /**
   * Send a raw string command to the adapter (appends \\r).
   * @param {string} command - The AT or OBD command without terminator.
   * @returns {Promise<void>}
   */
  async send(command) {
    if (!this._writeCh) {
      throw new Error('BLE not connected');
    }
    const data = this._encoder.encode(command + '\r');
    await this._writeAdaptive(data);
  }

  /**
   * Register a callback for incoming data fragments.
   * @param {function(string): void} callback
   */
  onData(callback) {
    this._dataCallbacks.push(callback);
  }

  /**
   * Register a callback for connection state changes.
   * @param {function(BLEState): void} callback
   */
  onStateChange(callback) {
    this._stateCallbacks.push(callback);
  }

  /**
   * Return the BLE profile that matched during connect(), or null.
   * @returns {typeof BLE_PROFILES[0] | null}
   */
  getActiveProfile() {
    return this._activeProfile;
  }

  /**
   * Probe the adapter by sending ATZ and checking for "ELM327" in the response.
   * Confirms that the correct BLE profile is active and the adapter is responsive.
   * @returns {Promise<{ok: boolean, version: string}>}
   */
  async probe() {
    if (this.state !== 'connected') {
      return { ok: false, version: '' };
    }

    return new Promise((resolve) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        cleanup();
        resolve({ ok: false, version: '' });
      }, 3000);

      const handler = (chunk) => {
        buffer += chunk;
        if (buffer.includes('>')) {
          cleanup();
          const ok = /ELM327/i.test(buffer);
          const match = buffer.match(/ELM327\s*v[\d.]+/i);
          resolve({ ok, version: match ? match[0] : '' });
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        const idx = this._dataCallbacks.indexOf(handler);
        if (idx !== -1) this._dataCallbacks.splice(idx, 1);
      };

      this._dataCallbacks.push(handler);
      this.send('ATZ').catch(() => {
        cleanup();
        resolve({ ok: false, version: '' });
      });
    });
  }

  /** @param {BLEState} state */
  _setState(state) {
    this.state = state;
    for (const cb of this._stateCallbacks) {
      cb(state);
    }
  }

  _handleDisconnect() {
    const shouldReconnect = !this._manualDisconnect;
    this._cleanup({ keepDevice: shouldReconnect });
    this._setState('disconnected');
    if (shouldReconnect) {
      this._attemptReconnect();
    }
  }

  _cleanup({ keepDevice = false } = {}) {
    if (this._notifyCh) {
      try { this._notifyCh.stopNotifications(); } catch (_) { /* ignore */ }
      this._notifyCh.removeEventListener('characteristicvaluechanged', this._onCharacteristicValueChanged);
    }
    if (!keepDevice && this._device) {
      this._device.removeEventListener('gattserverdisconnected', this._onDisconnected);
    }
    this._writeCh = null;
    this._notifyCh = null;
    if (!keepDevice) this._device = null;
    this._activeProfile = null;
    this._writeMode = 'without-response';
    this._writeChunkSize = 20;
  }

  async _connectAndDiscover() {
    const server = await this._device.gatt.connect();

    let matched = false;
    for (const profile of BLE_PROFILES) {
      try {
        const service = await server.getPrimaryService(profile.service);
        if (profile.write === profile.notify) {
          const ch = await service.getCharacteristic(profile.write);
          this._writeCh = ch;
          this._notifyCh = ch;
        } else {
          this._writeCh = await service.getCharacteristic(profile.write);
          this._notifyCh = await service.getCharacteristic(profile.notify);
        }
        this._activeProfile = profile;
        matched = true;
        console.log(`[BLE] Matched profile: ${profile.name}`);
        break;
      } catch (_) {
        continue;
      }
    }

    if (!matched) {
      throw new Error(
        'No compatible BLE service found. Supported profiles: ' +
        BLE_PROFILES.map((p) => p.name).join(', ')
      );
    }

    await this._notifyCh.startNotifications();
    this._notifyCh.addEventListener('characteristicvaluechanged', this._onCharacteristicValueChanged);
    this._configureWriteStrategy();
  }

  _handleCharacteristicValueChanged(e) {
    /** @type {DataView} */
    const value = e.target.value;
    const text = this._decoder.decode(value);
    for (const cb of this._dataCallbacks) {
      cb(text);
    }
  }

  _configureWriteStrategy() {
    const props = this._writeCh?.properties;
    if (!props) {
      this._writeMode = 'without-response';
      this._writeChunkSize = 20;
      return;
    }

    // Source: https://developer.mozilla.org/en-US/docs/Web/API/BluetoothCharacteristicProperties
    // Choose write mode from characteristic capabilities instead of hard-coding.
    if (props.writeWithoutResponse) {
      this._writeMode = 'without-response';
      // UNVERIFIED: Web Bluetooth does not expose negotiated MTU/requestMtu API.
      // Source: https://github.com/WebBluetoothCG/web-bluetooth/issues/383
      // Start optimistic on Chrome Android, then fallback to 20 on write errors.
      this._writeChunkSize = 64;
    } else if (props.write) {
      this._writeMode = 'with-response';
      this._writeChunkSize = 20;
    } else {
      throw new Error('Selected characteristic does not support write operations');
    }
  }

  async _writeAdaptive(data) {
    let chunkSize = Math.max(1, this._writeChunkSize);
    let mode = this._writeMode;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this._writeChunked(data, chunkSize, mode);
        this._writeChunkSize = chunkSize;
        this._writeMode = mode;
        return;
      } catch (err) {
        const canFallbackToWithResponse = this._writeCh?.properties?.write;
        if (chunkSize > 20) {
          chunkSize = 20;
          continue;
        }
        if (mode === 'without-response' && canFallbackToWithResponse) {
          mode = 'with-response';
          continue;
        }
        throw err;
      }
    }

    throw new Error('BLE write failed after adaptive fallback attempts');
  }

  async _writeChunked(data, chunkSize, mode) {
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      if (mode === 'without-response') {
        await this._writeCh.writeValueWithoutResponse(chunk);
      } else {
        await this._writeCh.writeValueWithResponse(chunk);
      }
    }
  }

  async _attemptReconnect() {
    // Source: https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect.html
    // Retry with exponential backoff on unexpected BLE disconnects.
    for (let attempt = 1; attempt <= this._reconnectMaxAttempts; attempt++) {
      if (this._manualDisconnect || !this._device) return;
      const delayMs = this._reconnectBaseDelayMs * (2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (this._manualDisconnect || !this._device) return;

      try {
        this._setState('connecting');
        await this._connectAndDiscover();
        this._setState('connected');
        return;
      } catch (err) {
        console.warn(`[BLE] Reconnect attempt ${attempt} failed`, err);
        this._cleanup({ keepDevice: true });
        this._setState('disconnected');
      }
    }
  }
}
