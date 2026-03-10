/**
 * @file Main trip recording orchestrator.
 * Subscribes to the existing store.js event emitter, captures OBD snapshots,
 * manages trip lifecycle, computes live stats, and persists to IndexedDB.
 *
 * @typedef {import('./trip-types.js').Trip} Trip
 * @typedef {import('./trip-types.js').Snapshot} Snapshot
 * @typedef {import('./trip-types.js').TripStats} TripStats
 * @typedef {import('./trip-types.js').GeoPoint} GeoPoint
 * @typedef {import('../core/store/store.js').Store} Store
 */

import { TripStorage } from './trip-storage.js';
import { ConfigManager } from './config-manager.js';
import { GeoManager } from './geo-manager.js';
import { WeatherManager } from './weather-manager.js';
import {
  computeLiveStats,
  computeFinalStats,
  autoTag,
} from './trip-calculator.js';
import { exportJSON, exportGPX, exportCSV, exportSummaryCSV } from './trip-exporter.js';
import { PID_KEYS } from '../pids/keys.js';

/**
 * PID key mappings — maps store keys to snapshot fields.
 * Keys follow the format: protocol:header:pid:name
 */
const PID_MAP = {
  [PID_KEYS.VEHICLE_SPEED]: 'speed',
  [PID_KEYS.ENGINE_RPM]: 'rpm',
  [PID_KEYS.COOLANT_TEMP]: 'coolantTemp',
  [PID_KEYS.INTAKE_AIR_TEMP]: 'intakeTemp',
  [PID_KEYS.THROTTLE_POSITION]: 'throttle',
  [PID_KEYS.FUEL_RATE]: 'fuelRate',
  [PID_KEYS.HYBRID_BATTERY_SOC]: 'hybridSOC',
  [PID_KEYS.AMBIENT_AIR_TEMP]: 'ambientTemp',
  [PID_KEYS.ABSOLUTE_LOAD]: 'fuelLoad',
};

/**
 * Toyota PID keys — these use partial matching on the name suffix
 * since headers and PID bytes are part of the key.
 */
const TOYOTA_NAME_MAP = {
  'HV Battery Current': 'hybridCurrent',
  'HV Battery Voltage': 'hybridVoltage',
  'HV Batt Temp 1 (Intake)': 'hybridBatteryTemp',
  'MG1 RPM (Generator)': 'mg1Rpm',
  'MG2 RPM (Motor)': 'mg2Rpm',
  'MG1 Torque': 'mg1Torque',
  'MG2 Torque': 'mg2Torque',
  'EV Mode Status': '_evModeRaw',
  'Regen Brake Torque': 'regenTorque',
  'HV Battery SOC (HR)': '_hybridSOCHR',
};

export class TripManager {
  /**
   * @param {Store} store - The existing reactive PID store.
   */
  constructor(store) {
    this._store = store;
    this._storage = new TripStorage();
    this._config = new ConfigManager();
    this._geo = new GeoManager();
    this._weather = new WeatherManager();

    /** @type {Trip|null} */
    this._currentTrip = null;
    /** @type {boolean} */
    this._paused = false;
    /** @type {number|null} Snapshot interval timer */
    this._snapshotTimer = null;

    // Auto-detection state
    /** @type {number} Consecutive seconds with speed > 0 */
    this._speedActiveCount = 0;
    /** @type {number} Consecutive seconds with speed=0 AND rpm=0 */
    this._inactiveCount = 0;
    /** @type {number|null} Auto-detection check timer */
    this._autoDetectTimer = null;

    // Latest PID values — updated on every store change
    /** @type {Object<string, number|null>} */
    this._latestValues = {};

    // Event listeners
    /** @type {Object<string, Array<function>>} */
    this._eventListeners = {};

    // Build reverse lookup for Toyota PIDs
    this._toyotaKeyMap = new Map();

    // Subscribe to store updates
    this._store.onChange((key, entry) => {
      this._onStoreUpdate(key, entry);
    });

    // Build Toyota key mappings after store has registered PIDs
    // Defer to allow PID registration to complete
    setTimeout(() => this._buildToyotaKeyMap(), 0);

    // Run compression on startup
    this._storage.compressOldTrips().catch(() => {});

    // Check storage quota on startup
    this._checkStorage();

    // Recover any 'recording' trips left by a previous crash / forced close
    this._recoverInterruptedTrips().catch(() => {});

    // Save current trip when the page is hidden (background switch, close, phone sleep)
    this._attachPageLifecycleListeners();
  }

  // ---- Public API ----

  /**
   * Manually start a new trip.
   * @returns {Trip}
   */
  startTrip() {
    if (this._currentTrip && this._currentTrip.status === 'recording') {
      return this._currentTrip;
    }

    const trip = this._createTrip();
    this._currentTrip = trip;
    this._paused = false;

    // Start GPS tracking
    if (this._config.get('gpsEnabled')) {
      this._geo.start();
    }

    // Start snapshot collection
    this._startSnapshotTimer();

    // Start auto-stop detection
    this._startAutoDetect();

    this._emit('trip:started', trip);
    return trip;
  }

  /**
   * Stop the current trip.
   * Finalizes stats, saves to storage, fetches weather.
   * @returns {Promise<Trip|null>}
   */
  async stopTrip() {
    if (!this._currentTrip) return null;

    const trip = this._currentTrip;

    // Discard trips shorter than 1 minute
    if (!this._isTripLongEnough(trip)) {
      this._stopSnapshotTimer();
      this._stopAutoDetect();
      this._geo.stop();
      this._currentTrip = null;
      this._emit('trip:discarded', trip);
      return null;
    }

    trip.endTime = new Date().toISOString();
    trip.status = 'completed';

    // Stop timers
    this._stopSnapshotTimer();
    this._stopAutoDetect();
    this._geo.stop();

    // Compute final stats
    const config = this._config.getAll();
    trip.stats = computeFinalStats(trip.snapshots, config);

    // Auto-tag
    const tags = autoTag(trip.stats, trip.snapshots);
    trip.meta.tags = [...new Set([...trip.meta.tags, ...tags])];

    // Reverse geocode start/end addresses
    await this._geocodeTrip(trip);

    // Fetch weather
    if (this._config.get('weatherEnabled') && trip.route.length > 0) {
      const firstPoint = trip.route[0];
      trip.meta.weather = await this._weather.fetchWeather(
        firstPoint.lat, firstPoint.lng, trip.startTime
      );
    }

    // Persist
    await this._storage.save(trip);
    this._currentTrip = null;

    this._emit('trip:stopped', trip);
    return trip;
  }

  /** Pause snapshot collection. */
  pauseTrip() {
    if (!this._currentTrip || this._paused) return;
    this._paused = true;
    this._stopSnapshotTimer();
    this._emit('trip:paused', this._currentTrip);
  }

  /** Resume snapshot collection. */
  resumeTrip() {
    if (!this._currentTrip || !this._paused) return;
    this._paused = false;
    this._startSnapshotTimer();
    this._emit('trip:resumed', this._currentTrip);
  }

  /**
   * Get the current trip with live stats.
   * @returns {Trip|null}
   */
  getCurrentTrip() {
    return this._currentTrip;
  }

  /**
   * Get all stored trip summaries (lightweight).
   * @returns {Promise<import('./trip-types.js').TripSummary[]>}
   */
  async getTrips() {
    return this._storage.loadAllSummaries();
  }

  /**
   * Get a full trip by ID.
   * @param {string} id
   * @returns {Promise<Trip|undefined>}
   */
  async getTrip(id) {
    return this._storage.load(id);
  }

  /**
   * Delete a trip by ID.
   * @param {string} id
   */
  async deleteTrip(id) {
    return this._storage.delete(id);
  }

  /**
   * Export a trip in the given format.
   * @param {string} id
   * @param {"json"|"gpx"|"csv"} format
   */
  async exportTrip(id, format) {
    const trip = await this._storage.load(id);
    if (!trip) throw new Error(`Trip ${id} not found`);

    switch (format) {
      case 'json': exportJSON(trip); break;
      case 'gpx':  exportGPX(trip);  break;
      case 'csv':  exportCSV(trip);  break;
      default: throw new Error(`Unknown format: ${format}`);
    }
  }

  /**
   * Export a summary CSV of all trips.
   */
  async exportAllSummary() {
    const trips = await this._storage.loadAll();
    exportSummaryCSV(trips);
  }

  /**
   * Subscribe to trip events.
   * @param {string} event - Event name (trip:started, trip:stopped, etc.)
   * @param {function} callback
   */
  on(event, callback) {
    if (!this._eventListeners[event]) {
      this._eventListeners[event] = [];
    }
    this._eventListeners[event].push(callback);
  }

  /**
   * Get the config manager for reading/writing settings.
   * @returns {ConfigManager}
   */
  getConfig() {
    return this._config;
  }

  /**
   * Enable auto-start/auto-stop detection.
   * Called when OBD connects.
   */
  enableAutoDetect() {
    if (this._config.get('autoStartTrip')) {
      this._startAutoDetect();
    }
  }

  /**
   * Disable auto-detection.
   * Called when OBD disconnects.
   */
  disableAutoDetect() {
    this._stopAutoDetect();
    // If recording, mark as interrupted
    if (this._currentTrip && this._currentTrip.status === 'recording') {
      this._interruptTrip();
    }
  }

  // ---- Private: Trip lifecycle ----

  /**
   * Create a new trip object with empty state.
   * @returns {Trip}
   */
  _createTrip() {
    return {
      id: _uuid(),
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'recording',
      route: [],
      snapshots: [],
      stats: _emptyStats(),
      meta: {
        label: null,
        notes: null,
        tags: [],
        fuelPricePerLiter: this._config.get('fuelPricePerLiter'),
        weather: null,
      },
    };
  }

  /**
   * Mark current trip as interrupted and save.
   */
  async _interruptTrip() {
    if (!this._currentTrip) return;
    const trip = this._currentTrip;

    // Discard trips shorter than 1 minute
    if (!this._isTripLongEnough(trip)) {
      this._stopSnapshotTimer();
      this._geo.stop();
      this._currentTrip = null;
      return;
    }

    trip.endTime = new Date().toISOString();
    trip.status = 'interrupted';

    this._stopSnapshotTimer();
    this._geo.stop();

    const config = this._config.getAll();
    trip.stats = computeFinalStats(trip.snapshots, config);
    const tags = autoTag(trip.stats, trip.snapshots);
    trip.meta.tags = [...new Set([...trip.meta.tags, ...tags])];

    // Geocode even on interrupt — save first with partial data, then update
    await this._storage.save(trip).catch(() => {});
    this._geocodeTrip(trip).then(() => this._storage.save(trip).catch(() => {})).catch(() => {});

    this._currentTrip = null;
    this._emit('trip:stopped', trip);
  }

  // ---- Private: Snapshot collection ----

  _startSnapshotTimer() {
    if (this._snapshotTimer) return;
    const interval = this._config.get('snapshotIntervalMs');
    this._snapshotTimer = setInterval(() => this._captureSnapshot(), interval);
  }

  _stopSnapshotTimer() {
    if (this._snapshotTimer) {
      clearInterval(this._snapshotTimer);
      this._snapshotTimer = null;
    }
  }

  /** Capture a single snapshot from current PID values. */
  _captureSnapshot() {
    if (!this._currentTrip || this._paused) return;

    const v = this._latestValues;

    // Determine EV mode from raw status (1 = EV Drive)
    const evMode = v._evModeRaw != null ? v._evModeRaw === 1 : null;

    // Use high-res SOC if available, fallback to standard
    const hybridSOC = v._hybridSOCHR ?? v.hybridSOC ?? null;

    /** @type {Snapshot} */
    const snapshot = {
      timestamp: new Date().toISOString(),
      odometer: null, // Will be computed from distance
      speed: v.speed ?? null,
      rpm: v.rpm ?? null,
      coolantTemp: v.coolantTemp ?? null,
      intakeTemp: v.intakeTemp ?? null,
      throttle: v.throttle ?? null,
      fuelRate: v.fuelRate ?? null,
      hybridSOC,
      hybridCurrent: v.hybridCurrent ?? null,
      hybridVoltage: v.hybridVoltage ?? null,
      hybridBatteryTemp: v.hybridBatteryTemp ?? null,
      mg1Rpm: v.mg1Rpm ?? null,
      mg2Rpm: v.mg2Rpm ?? null,
      mg1Torque: v.mg1Torque ?? null,
      mg2Torque: v.mg2Torque ?? null,
      evMode,
      regenTorque: v.regenTorque ?? null,
      ambientTemp: v.ambientTemp ?? null,
      fuelLoad: v.fuelLoad ?? null,
      lat: null,
      lng: null,
      altitude: null,
    };

    // Attach GPS data if available
    const geoPoint = this._geo.getLastPoint();
    if (geoPoint) {
      snapshot.lat = geoPoint.lat;
      snapshot.lng = geoPoint.lng;
      snapshot.altitude = geoPoint.altitude;

      this._currentTrip.route.push({
        lat: geoPoint.lat,
        lng: geoPoint.lng,
        timestamp: geoPoint.timestamp,
        speed: geoPoint.speed,
        altitude: geoPoint.altitude,
      });
    }

    this._currentTrip.snapshots.push(snapshot);

    // Update odometer (distance from trip start)
    const config = this._config.getAll();
    const stats = computeLiveStats(this._currentTrip.snapshots, config);
    snapshot.odometer = stats.distanceKm;
    this._currentTrip.stats = stats;

    this._emit('trip:snapshot', snapshot);
    this._emit('trip:stats-updated', stats);

    // Periodic save (every 30 snapshots)
    if (this._currentTrip.snapshots.length % 30 === 0) {
      this._storage.save(this._currentTrip).catch(() => {});
    }
  }

  // ---- Private: Store integration ----

  /**
   * Handle store updates — map PID keys to latest values.
   * @param {string} key
   * @param {{ value: number|null }} entry
   */
  _onStoreUpdate(key, entry) {
    // Direct match for standard PIDs
    const field = PID_MAP[key];
    if (field) {
      this._latestValues[field] = entry.value;
      return;
    }

    // Toyota PIDs: match by name suffix
    const toyotaField = this._toyotaKeyMap.get(key);
    if (toyotaField) {
      this._latestValues[toyotaField] = entry.value;
    }
  }

  /**
   * Build Toyota key mapping by scanning registered store keys
   * and matching against the TOYOTA_NAME_MAP.
   */
  _buildToyotaKeyMap() {
    const storeKeys = this._store.keys();
    for (const storeKey of storeKeys) {
      // Key format: protocol:header:pid:name
      const parts = storeKey.split(':');
      if (parts.length < 4) continue;
      const name = parts.slice(3).join(':'); // Rejoin in case name contains colons
      const field = TOYOTA_NAME_MAP[name];
      if (field) {
        this._toyotaKeyMap.set(storeKey, field);
      }
    }
  }

  // ---- Private: Auto-detection ----

  _startAutoDetect() {
    if (this._autoDetectTimer) return;
    this._speedActiveCount = 0;
    this._inactiveCount = 0;

    this._autoDetectTimer = setInterval(() => {
      const speed = this._latestValues.speed ?? 0;
      const rpm = this._latestValues.rpm ?? 0;

      if (!this._currentTrip) {
        // Auto-start: speed > 0 for 10 consecutive seconds
        if (speed > 0) {
          this._speedActiveCount++;
          if (this._speedActiveCount >= 10 && this._config.get('autoStartTrip')) {
            this.startTrip();
            this._speedActiveCount = 0;
          }
        } else {
          this._speedActiveCount = 0;
        }
      } else if (this._currentTrip.status === 'recording') {
        // Auto-stop: speed=0 AND rpm=0 for autoStopDelay seconds
        if (speed === 0 && rpm === 0) {
          this._inactiveCount++;
          if (this._inactiveCount >= this._config.get('autoStopDelay')) {
            this.stopTrip();
            this._inactiveCount = 0;
          }
        } else {
          this._inactiveCount = 0;
        }
      }
    }, 1000);
  }

  _stopAutoDetect() {
    if (this._autoDetectTimer) {
      clearInterval(this._autoDetectTimer);
      this._autoDetectTimer = null;
    }
    this._speedActiveCount = 0;
    this._inactiveCount = 0;
  }

  // ---- Private: Geocoding ----

  /**
   * Reverse geocode the start and end points of a trip.
   * @param {Trip} trip
   */
  async _geocodeTrip(trip) {
    const snapWithGeo = trip.snapshots.filter(s => s.lat != null && s.lng != null);
    if (snapWithGeo.length === 0) return;

    const first = snapWithGeo[0];
    const last = snapWithGeo[snapWithGeo.length - 1];

    try {
      const startDetails = await this._geo.reverseGeocodeDetails(first.lat, first.lng);
      trip.stats.startLocation = startDetails;
      trip.stats.startAddress = startDetails?.full ?? null;
    } catch (_) {
      trip.stats.startLocation = null;
      trip.stats.startAddress = null;
    }

    try {
      const endDetails = await this._geo.reverseGeocodeDetails(last.lat, last.lng);
      trip.stats.endLocation = endDetails;
      trip.stats.endAddress = endDetails?.full ?? null;
    } catch (_) {
      trip.stats.endLocation = null;
      trip.stats.endAddress = null;
    }
  }

  // ---- Private: Page lifecycle & emergency save ----

  /**
   * Returns true if the trip has been running for at least 60 seconds.
   * @param {Trip} trip
   * @returns {boolean}
   */
  _isTripLongEnough(trip) {
    const MIN_MS = 60_000;
    const elapsed = Date.now() - new Date(trip.startTime).getTime();
    if (elapsed >= MIN_MS) return true;
    const interval = this._config.get('snapshotIntervalMs') || 1000;
    return trip.snapshots.length * interval >= MIN_MS;
  }

  /**
   * Register visibilitychange / pagehide listeners so trip data is persisted
   * when the user backgrounds or closes the app.
   */
  _attachPageLifecycleListeners() {
    this._onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') this._emergencySave();
    };
    this._onPageHide = () => this._emergencySave();
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('pagehide', this._onPageHide);
  }

  /**
   * Immediately persist the current trip state (best-effort, fire-and-forget).
   * Keeps status as 'recording' so the trip can be resumed or recovered.
   */
  _emergencySave() {
    if (!this._currentTrip) return;
    if (this._currentTrip.snapshots.length > 0) {
      this._currentTrip.stats = computeFinalStats(
        this._currentTrip.snapshots,
        this._config.getAll(),
      );
    }
    this._storage.save(this._currentTrip).catch(() => {});
  }

  /**
   * On startup: finalize any trips left in 'recording' state by a previous crash.
   * Trips >= 1 min are saved as 'interrupted'; shorter ones are deleted.
   */
  async _recoverInterruptedTrips() {
    const summaries = await this._storage.loadAllSummaries();
    const stale = summaries.filter(s => s.status === 'recording');
    if (stale.length === 0) return;

    const config = this._config.getAll();
    const interval = this._config.get('snapshotIntervalMs') || 1000;

    for (const s of stale) {
      const trip = await this._storage.load(s.id);
      if (!trip) continue;

      const durationMs = trip.snapshots.length * interval;
      if (durationMs >= 60_000) {
        trip.status = 'interrupted';
        if (!trip.endTime) {
          trip.endTime = trip.snapshots.at(-1)?.timestamp ?? new Date().toISOString();
        }
        trip.stats = computeFinalStats(trip.snapshots, config);
        const tags = autoTag(trip.stats, trip.snapshots);
        trip.meta.tags = [...new Set([...trip.meta.tags, ...tags])];
        await this._storage.save(trip).catch(() => {});
      } else {
        await this._storage.delete(trip.id).catch(() => {});
      }
    }
  }

  // ---- Private: Storage management ----

  async _checkStorage() {
    const threshold = this._config.get('storageWarningThresholdPercent');
    const quota = await this._storage.checkStorageQuota(threshold);
    if (quota.warning) {
      this._emit('trip:storage-warning', quota);
    }
  }

  // ---- Private: Event emitter ----

  /**
   * Emit an event to all registered listeners.
   * @param {string} event
   * @param {*} data
   */
  _emit(event, data) {
    const listeners = this._eventListeners[event];
    if (listeners) {
      for (const cb of listeners) {
        cb(data);
      }
    }
  }
}

// ---- Utility ----

/**
 * Generate a UUID v4.
 * @returns {string}
 */
function _uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** @returns {TripStats} */
function _emptyStats() {
  return {
    distanceKm: 0, durationSeconds: 0, fuelConsumedL: 0, fuelCostEur: 0,
    avgSpeedKmh: 0, maxSpeedKmh: 0, avgConsumptionL100km: 0,
    instantConsumptionL100km: 0, electricConsumptionWh: 0, evModePercent: 0,
    avgHybridSOC: 0, socDelta: 0, regenEnergyWh: 0, engineOnPercent: 0,
    avgCoolantTemp: 0, idleTimeSeconds: 0, hardBrakingCount: 0,
    hardAccelerationCount: 0, maxRpm: 0, co2EmittedGrams: 0, savedCo2Grams: 0,
    boundingBox: null, startAddress: null, endAddress: null,
    startLocation: null, endLocation: null,
  };
}
