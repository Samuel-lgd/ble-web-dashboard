import { BLE } from './config.js';

/**
 * @typedef {'disconnected' | 'connecting' | 'connected'} BLEState
 */

/**
 * Web Bluetooth adapter for ELM327-based OBD2 dongles.
 * Handles GATT connection, characteristic discovery, and raw byte I/O.
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
  }

  /**
   * Request a BLE device, connect to GATT, and set up characteristics.
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.state !== 'disconnected') return;
    this._setState('connecting');

    try {
      this._device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE.SERVICE_UUID] }],
        optionalServices: [BLE.SERVICE_UUID],
      });

      this._device.addEventListener('gattserverdisconnected', this._onDisconnected);

      const server = await this._device.gatt.connect();
      const service = await server.getPrimaryService(BLE.SERVICE_UUID);

      this._writeCh = await service.getCharacteristic(BLE.WRITE_CHARACTERISTIC_UUID);
      this._notifyCh = await service.getCharacteristic(BLE.NOTIFY_CHARACTERISTIC_UUID);

      await this._notifyCh.startNotifications();
      this._notifyCh.addEventListener('characteristicvaluechanged', (e) => {
        /** @type {DataView} */
        const value = e.target.value;
        const text = this._decoder.decode(value);
        for (const cb of this._dataCallbacks) {
          cb(text);
        }
      });

      this._setState('connected');
    } catch (err) {
      this._cleanup();
      this._setState('disconnected');
      throw err;
    }
  }

  /**
   * Disconnect from the device and clean up resources.
   */
  disconnect() {
    if (this._device && this._device.gatt.connected) {
      this._device.gatt.disconnect();
    }
    this._cleanup();
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
    // ELM327 BLE adapters may need chunked writes for commands > 20 bytes
    const CHUNK = 20;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      await this._writeCh.writeValueWithoutResponse(chunk);
    }
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

  /** @param {BLEState} state */
  _setState(state) {
    this.state = state;
    for (const cb of this._stateCallbacks) {
      cb(state);
    }
  }

  _handleDisconnect() {
    this._cleanup();
    this._setState('disconnected');
  }

  _cleanup() {
    if (this._notifyCh) {
      try { this._notifyCh.stopNotifications(); } catch (_) { /* ignore */ }
    }
    if (this._device) {
      this._device.removeEventListener('gattserverdisconnected', this._onDisconnected);
    }
    this._writeCh = null;
    this._notifyCh = null;
    this._device = null;
  }
}
