/**
 * @file Trip export functions. JSON, GPX, CSV, and multi-trip summary CSV.
 * All exports trigger browser download via URL.createObjectURL.
 *
 * @typedef {import('./trip-types.js').Trip} Trip
 * @typedef {import('./trip-types.js').Snapshot} Snapshot
 */

import { GeoManager } from './geo-manager.js';

/**
 * Trigger a browser download of a Blob.
 * @param {string} content - File content.
 * @param {string} filename - Download filename.
 * @param {string} mimeType - MIME type.
 */
function _download(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format a date for use in filenames.
 * @param {string} isoString
 * @returns {string}
 */
function _fileDate(isoString) {
  return isoString.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/**
 * Export a trip as pretty-printed JSON and trigger download.
 * @param {Trip} trip
 */
export function exportJSON(trip) {
  const json = JSON.stringify(trip, null, 2);
  const filename = `trip_${_fileDate(trip.startTime)}.json`;
  _download(json, filename, 'application/json');
}

/**
 * Export a trip as GPX 1.1 and trigger download.
 * @param {Trip} trip
 */
export function exportGPX(trip) {
  const geo = new GeoManager();
  const gpx = geo.exportGPX(trip);
  const filename = `trip_${_fileDate(trip.startTime)}.gpx`;
  _download(gpx, filename, 'application/gpx+xml');
}

/**
 * Export trip snapshots as CSV and trigger download.
 * @param {Trip} trip
 */
export function exportCSV(trip) {
  const fields = [
    'timestamp', 'odometer', 'speed', 'rpm', 'coolantTemp', 'intakeTemp',
    'throttle', 'fuelRate', 'hybridSOC', 'hybridCurrent', 'hybridVoltage',
    'hybridBatteryTemp', 'mg1Rpm', 'mg2Rpm', 'mg1Torque', 'mg2Torque',
    'evMode', 'regenTorque', 'ambientTemp', 'fuelLoad', 'lat', 'lng', 'altitude',
  ];

  const header = fields.join(',');
  const rows = trip.snapshots.map(s =>
    fields.map(f => {
      const val = s[f];
      if (val === null || val === undefined) return '';
      if (typeof val === 'boolean') return val ? '1' : '0';
      return String(val);
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  const filename = `trip_${_fileDate(trip.startTime)}.csv`;
  _download(csv, filename, 'text/csv');
}

/**
 * Export multiple trips as a summary CSV (one row per trip) and trigger download.
 * @param {Trip[]} trips
 */
export function exportSummaryCSV(trips) {
  const fields = [
    'id', 'startTime', 'endTime', 'status', 'label',
    'distanceKm', 'durationSeconds', 'fuelConsumedL', 'fuelCostEur',
    'avgSpeedKmh', 'maxSpeedKmh', 'avgConsumptionL100km',
    'electricConsumptionWh', 'evModePercent', 'avgHybridSOC', 'socDelta',
    'regenEnergyWh', 'engineOnPercent', 'avgCoolantTemp',
    'idleTimeSeconds', 'hardBrakingCount', 'hardAccelerationCount',
    'maxRpm', 'co2EmittedGrams', 'savedCo2Grams', 'tags',
  ];

  const header = fields.join(',');
  const rows = trips.map(trip => {
    const s = trip.stats;
    const m = trip.meta;
    const values = {
      id: trip.id,
      startTime: trip.startTime,
      endTime: trip.endTime || '',
      status: trip.status,
      label: m.label || '',
      distanceKm: s.distanceKm.toFixed(2),
      durationSeconds: Math.round(s.durationSeconds),
      fuelConsumedL: s.fuelConsumedL.toFixed(3),
      fuelCostEur: s.fuelCostEur.toFixed(2),
      avgSpeedKmh: s.avgSpeedKmh.toFixed(1),
      maxSpeedKmh: s.maxSpeedKmh.toFixed(1),
      avgConsumptionL100km: s.avgConsumptionL100km.toFixed(2),
      electricConsumptionWh: s.electricConsumptionWh.toFixed(1),
      evModePercent: s.evModePercent.toFixed(1),
      avgHybridSOC: s.avgHybridSOC.toFixed(1),
      socDelta: s.socDelta.toFixed(1),
      regenEnergyWh: s.regenEnergyWh.toFixed(1),
      engineOnPercent: s.engineOnPercent.toFixed(1),
      avgCoolantTemp: s.avgCoolantTemp.toFixed(1),
      idleTimeSeconds: Math.round(s.idleTimeSeconds),
      hardBrakingCount: s.hardBrakingCount,
      hardAccelerationCount: s.hardAccelerationCount,
      maxRpm: s.maxRpm,
      co2EmittedGrams: Math.round(s.co2EmittedGrams),
      savedCo2Grams: Math.round(s.savedCo2Grams),
      tags: `"${(m.tags || []).join(';')}"`,
    };
    return fields.map(f => values[f]).join(',');
  });

  const csv = [header, ...rows].join('\n');
  const filename = `trips_summary_${_fileDate(new Date().toISOString())}.csv`;
  _download(csv, filename, 'text/csv');
}
