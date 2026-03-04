/**
 * @file Geolocation API integration, GPX export, and reverse geocoding.
 *
 * @typedef {import('./trip-types.js').GeoPoint} GeoPoint
 * @typedef {import('./trip-types.js').Trip} Trip
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/reverse';
const GEOCODE_CACHE_PREFIX = 'geocode_';

export class GeoManager {
  constructor() {
    /** @type {number|null} */
    this._watchId = null;
    /** @type {GeoPoint|null} */
    this._lastPoint = null;
    /** @type {Array<function(GeoPoint): void>} */
    this._listeners = [];
    /** @type {number} Last Nominatim request timestamp for rate limiting */
    this._lastGeocodeFetch = 0;
  }

  /**
   * Start watching GPS position.
   * Calls listeners on each position update.
   */
  start() {
    if (this._watchId !== null) return;
    if (!navigator.geolocation) return;

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date(pos.timestamp).toISOString(),
          speed: pos.coords.speed !== null ? pos.coords.speed * 3.6 : 0, // m/s -> km/h
          altitude: pos.coords.altitude,
        };
        this._lastPoint = point;
        for (const cb of this._listeners) {
          cb(point);
        }
      },
      (_err) => {
        // GPS unavailable — trip continues without geo data
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 5000,
      }
    );
  }

  /** Stop watching GPS position. */
  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    this._lastPoint = null;
  }

  /**
   * Subscribe to GPS position updates.
   * @param {function(GeoPoint): void} callback
   */
  onPosition(callback) {
    this._listeners.push(callback);
  }

  /**
   * Get the latest GPS point, or null if unavailable.
   * @returns {GeoPoint|null}
   */
  getLastPoint() {
    return this._lastPoint;
  }

  /**
   * Reverse geocode a lat/lng to an address string.
   * Uses Nominatim with rate limiting (max 1 req/s) and sessionStorage caching.
   * @param {number} lat
   * @param {number} lng
   * @returns {Promise<string|null>}
   */
  async reverseGeocode(lat, lng) {
    // Round to 5 decimal places for cache key (~1m precision)
    const cacheKey = `${GEOCODE_CACHE_PREFIX}${lat.toFixed(5)}_${lng.toFixed(5)}`;

    // Check sessionStorage cache
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;

    // Rate limit: wait until at least 1s since last request
    const now = Date.now();
    const elapsed = now - this._lastGeocodeFetch;
    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }

    try {
      this._lastGeocodeFetch = Date.now();
      const url = `${NOMINATIM_BASE}?lat=${lat}&lon=${lng}&format=json&zoom=16`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'OBD2-Dashboard-PWA/1.0' },
      });

      if (!response.ok) return null;

      const data = await response.json();
      const address = data.display_name || null;
      if (address) {
        sessionStorage.setItem(cacheKey, address);
      }
      return address;
    } catch (_) {
      return null;
    }
  }

  /**
   * Generate a valid GPX 1.1 XML string from a trip.
   * @param {Trip} trip
   * @returns {string}
   */
  exportGPX(trip) {
    const points = trip.route || [];
    // Fall back to snapshots with lat/lng if route is empty
    const trackPoints = points.length > 0 ? points : trip.snapshots.filter(s => s.lat != null && s.lng != null);

    const trkpts = trackPoints.map(p => {
      const lat = p.lat;
      const lng = p.lng;
      const ele = p.altitude != null ? `    <ele>${p.altitude}</ele>\n` : '';
      const time = p.timestamp ? `    <time>${new Date(p.timestamp).toISOString()}</time>\n` : '';
      const speed = p.speed != null ? `    <speed>${(p.speed / 3.6).toFixed(2)}</speed>\n` : '';
      return `   <trkpt lat="${lat}" lon="${lng}">\n${ele}${time}${speed}   </trkpt>`;
    }).join('\n');

    const name = trip.meta?.label || `Trip ${trip.startTime}`;
    const desc = `Distance: ${trip.stats.distanceKm.toFixed(2)} km, Duration: ${Math.round(trip.stats.durationSeconds / 60)} min`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="OBD2-Dashboard-PWA"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
 <metadata>
  <name>${_escapeXml(name)}</name>
  <desc>${_escapeXml(desc)}</desc>
  <time>${trip.startTime}</time>
 </metadata>
 <trk>
  <name>${_escapeXml(name)}</name>
  <trkseg>
${trkpts}
  </trkseg>
 </trk>
</gpx>`;
  }
}

/**
 * Escape special characters for XML.
 * @param {string} str
 * @returns {string}
 */
function _escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
