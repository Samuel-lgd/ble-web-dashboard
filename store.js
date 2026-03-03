import { STORE } from './config.js';

/**
 * @typedef {Object} PIDEntry
 * @property {number | null} value - Latest value.
 * @property {number | null} timestamp - Timestamp of latest value (ms since epoch).
 * @property {Array<{value: number, timestamp: number}>} history - Rolling history.
 */

/**
 * Simple reactive data store. Holds the latest value and a rolling history
 * for each registered PID. Emits events on value updates.
 */
export class Store {
  constructor() {
    /** @type {Map<string, PIDEntry>} */
    this._data = new Map();
    /** @type {Array<function(string, PIDEntry): void>} */
    this._listeners = [];
  }

  /**
   * Register a PID key in the store.
   * @param {string} key - Unique PID identifier.
   */
  register(key) {
    if (!this._data.has(key)) {
      this._data.set(key, {
        value: null,
        timestamp: null,
        history: [],
      });
    }
  }

  /**
   * Update a PID value. Adds to history and notifies listeners.
   * @param {string} key - PID key.
   * @param {number} value - New value.
   */
  update(key, value) {
    const entry = this._data.get(key);
    if (!entry) return;

    const now = Date.now();
    entry.value = value;
    entry.timestamp = now;

    // Add to history
    entry.history.push({ value, timestamp: now });

    // Trim history to the configured window
    const cutoff = now - (STORE.HISTORY_SECONDS * 1000);
    while (entry.history.length > 0 && entry.history[0].timestamp < cutoff) {
      entry.history.shift();
    }

    // Notify listeners
    for (const cb of this._listeners) {
      cb(key, entry);
    }
  }

  /**
   * Get the current entry for a PID key.
   * @param {string} key
   * @returns {PIDEntry | undefined}
   */
  get(key) {
    return this._data.get(key);
  }

  /**
   * Get all registered keys.
   * @returns {string[]}
   */
  keys() {
    return [...this._data.keys()];
  }

  /**
   * Subscribe to value updates.
   * @param {function(string, PIDEntry): void} callback - Called with (key, entry) on every update.
   */
  onChange(callback) {
    this._listeners.push(callback);
  }
}
