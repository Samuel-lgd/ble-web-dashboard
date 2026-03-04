/**
 * @file IndexedDB persistence layer for trip data.
 * Hand-written thin wrapper — no external libraries.
 *
 * Stores full trip objects in one store and lightweight summaries in another.
 * Implements auto-compression of old snapshots (>7 days: keep 1 per 10s).
 *
 * @typedef {import('./trip-types.js').Trip} Trip
 * @typedef {import('./trip-types.js').TripSummary} TripSummary
 */

const DB_NAME = 'obd2_trips';
const DB_VERSION = 1;
const STORE_TRIPS = 'trips';
const STORE_SUMMARIES = 'summaries';

export class TripStorage {
  constructor() {
    /** @type {IDBDatabase|null} */
    this._db = null;
    /** @type {Promise<IDBDatabase>} */
    this._ready = this._open();
  }

  /**
   * Open (or create) the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  _open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_TRIPS)) {
          db.createObjectStore(STORE_TRIPS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SUMMARIES)) {
          db.createObjectStore(STORE_SUMMARIES, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve(this._db);
      };

      request.onerror = (event) => {
        reject(new Error(`IndexedDB open failed: ${event.target.error}`));
      };
    });
  }

  /**
   * Get a transaction and object store.
   * @param {string} storeName
   * @param {"readonly"|"readwrite"} mode
   * @returns {Promise<IDBObjectStore>}
   */
  async _store(storeName, mode) {
    const db = await this._ready;
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Wrap an IDBRequest in a Promise.
   * @param {IDBRequest} request
   * @returns {Promise<*>}
   */
  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Extract a lightweight summary from a full trip object.
   * @param {Trip} trip
   * @returns {TripSummary}
   */
  _toSummary(trip) {
    return {
      id: trip.id,
      startTime: trip.startTime,
      endTime: trip.endTime,
      status: trip.status,
      stats: trip.stats,
      meta: trip.meta,
    };
  }

  /**
   * Save a trip (full object + summary).
   * @param {Trip} trip
   */
  async save(trip) {
    const db = await this._ready;
    const tx = db.transaction([STORE_TRIPS, STORE_SUMMARIES], 'readwrite');
    tx.objectStore(STORE_TRIPS).put(trip);
    tx.objectStore(STORE_SUMMARIES).put(this._toSummary(trip));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load a full trip by ID.
   * @param {string} id
   * @returns {Promise<Trip|undefined>}
   */
  async load(id) {
    const store = await this._store(STORE_TRIPS, 'readonly');
    return this._promisify(store.get(id));
  }

  /**
   * Load all trip summaries (lightweight, no snapshots).
   * @returns {Promise<TripSummary[]>}
   */
  async loadAllSummaries() {
    const store = await this._store(STORE_SUMMARIES, 'readonly');
    const summaries = await this._promisify(store.getAll());
    // Sort by start time descending (newest first)
    summaries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    return summaries;
  }

  /**
   * Load all full trip objects.
   * @returns {Promise<Trip[]>}
   */
  async loadAll() {
    const store = await this._store(STORE_TRIPS, 'readonly');
    const trips = await this._promisify(store.getAll());
    trips.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    return trips;
  }

  /**
   * Delete a trip by ID (both full and summary).
   * @param {string} id
   */
  async delete(id) {
    const db = await this._ready;
    const tx = db.transaction([STORE_TRIPS, STORE_SUMMARIES], 'readwrite');
    tx.objectStore(STORE_TRIPS).delete(id);
    tx.objectStore(STORE_SUMMARIES).delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Delete all trips. */
  async clear() {
    const db = await this._ready;
    const tx = db.transaction([STORE_TRIPS, STORE_SUMMARIES], 'readwrite');
    tx.objectStore(STORE_TRIPS).clear();
    tx.objectStore(STORE_SUMMARIES).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Auto-compress snapshots for trips older than 7 days.
   * Keeps 1 snapshot per 10 seconds instead of per 1 second.
   */
  async compressOldTrips() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trips = await this.loadAll();

    for (const trip of trips) {
      if (trip.status !== 'completed') continue;
      if (!trip.endTime) continue;
      if (new Date(trip.endTime).getTime() > sevenDaysAgo) continue;
      if (trip._compressed) continue; // Already compressed

      const original = trip.snapshots.length;
      if (original === 0) continue;

      // Keep 1 snapshot per 10-second bucket
      const compressed = [];
      let lastKeptTime = 0;
      for (const s of trip.snapshots) {
        const t = new Date(s.timestamp).getTime();
        if (t - lastKeptTime >= 10_000 || lastKeptTime === 0) {
          compressed.push(s);
          lastKeptTime = t;
        }
      }

      // Also thin the route points
      if (trip.route && trip.route.length > 0) {
        const compressedRoute = [];
        let lastRouteTime = 0;
        for (const p of trip.route) {
          const t = new Date(p.timestamp).getTime();
          if (t - lastRouteTime >= 10_000 || lastRouteTime === 0) {
            compressedRoute.push(p);
            lastRouteTime = t;
          }
        }
        trip.route = compressedRoute;
      }

      trip.snapshots = compressed;
      trip._compressed = true;
      await this.save(trip);
    }
  }

  /**
   * Check storage quota usage. Returns usage info.
   * @param {number} warningThresholdPercent
   * @returns {Promise<{ usedMB: number, quotaMB: number, percentUsed: number, warning: boolean }>}
   */
  async checkStorageQuota(warningThresholdPercent = 80) {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usedMB: 0, quotaMB: 0, percentUsed: 0, warning: false };
    }

    const estimate = await navigator.storage.estimate();
    const usedMB = (estimate.usage || 0) / (1024 * 1024);
    const quotaMB = (estimate.quota || 0) / (1024 * 1024);
    const percentUsed = quotaMB > 0 ? (usedMB / quotaMB) * 100 : 0;
    const warning = percentUsed > warningThresholdPercent;

    return { usedMB, quotaMB, percentUsed, warning };
  }
}
