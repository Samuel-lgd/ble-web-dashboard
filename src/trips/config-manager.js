/**
 * @file Persistent user settings stored in localStorage.
 * @typedef {import('./trip-types.js').TripConfig} TripConfig
 */

const STORAGE_KEY = 'obd2_trip_config';

/** @type {TripConfig} */
const DEFAULTS = {
  fuelPricePerLiter: 1.85,
  fuelType: 'hybrid',
  vehicleName: 'Yaris Hybrid 2020',
  co2PerLiterPetrol: 2392,
  pureIceCo2Per100km: 120,
  autoStartTrip: true,
  autoStopDelay: 60,
  snapshotIntervalMs: 1000,
  gpsEnabled: true,
  weatherEnabled: true,
  storageWarningThresholdPercent: 80,
};

export class ConfigManager {
  constructor() {
    /** @type {TripConfig} */
    this._config = this._load();
  }

  /**
   * Load config from localStorage, merging with defaults.
   * @returns {TripConfig}
   */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULTS, ...JSON.parse(raw) };
      }
    } catch (_) {
      // Corrupted data — fall back to defaults
    }
    return { ...DEFAULTS };
  }

  /** Persist current config to localStorage. */
  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._config));
  }

  /**
   * Get a single config value.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._config[key];
  }

  /**
   * Set a single config value and persist.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this._config[key] = value;
    this._save();
  }

  /**
   * Get all config values.
   * @returns {TripConfig}
   */
  getAll() {
    return { ...this._config };
  }

  /** Reset all settings to defaults and persist. */
  reset() {
    this._config = { ...DEFAULTS };
    this._save();
  }
}
