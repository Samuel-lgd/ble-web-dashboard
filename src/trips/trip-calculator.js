/**
 * @file Pure computation functions for trip statistics.
 * No side effects — called by trip-manager.js on every snapshot.
 *
 * @typedef {import('./trip-types.js').Snapshot} Snapshot
 * @typedef {import('./trip-types.js').TripStats} TripStats
 * @typedef {import('./trip-types.js').TripConfig} TripConfig
 * @typedef {import('./trip-types.js').BoundingBox} BoundingBox
 */

/**
 * Compute live statistics during recording.
 * @param {Snapshot[]} snapshots
 * @param {TripConfig} config
 * @returns {TripStats}
 */
export function computeLiveStats(snapshots, config) {
  return _computeStats(snapshots, config, true);
}

/**
 * Compute final statistics at trip end.
 * @param {Snapshot[]} snapshots
 * @param {TripConfig} config
 * @returns {TripStats}
 */
export function computeFinalStats(snapshots, config) {
  return _computeStats(snapshots, config, false);
}

/**
 * Trapezoidal integration of speed over time to compute distance.
 * @param {Snapshot[]} snapshots
 * @returns {number} Distance in km.
 */
export function integrateDistance(snapshots) {
  let distanceKm = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const s0 = prev.speed ?? 0;
    const s1 = curr.speed ?? 0;
    const dtHours = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 3_600_000;
    if (dtHours > 0 && dtHours < 0.01) { // skip gaps > 36s
      distanceKm += ((s0 + s1) / 2) * dtHours;
    }
  }
  return distanceKm;
}

/**
 * Integrate fuel rate (L/h) over time to compute total fuel consumed.
 * @param {Snapshot[]} snapshots
 * @returns {number} Fuel consumed in liters.
 */
export function integrateFuelConsumption(snapshots) {
  let fuelL = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const r0 = prev.fuelRate ?? 0;
    const r1 = curr.fuelRate ?? 0;
    const dtHours = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 3_600_000;
    if (dtHours > 0 && dtHours < 0.01) {
      fuelL += ((r0 + r1) / 2) * dtHours;
    }
  }
  return fuelL;
}

/**
 * Integrate electric power (V * A) over time to compute energy in Wh.
 * Only counts positive power draw (discharging).
 * @param {Snapshot[]} snapshots
 * @returns {number} Electric energy consumed in Wh.
 */
export function integrateElectricEnergy(snapshots) {
  let energyWh = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const p0 = (prev.hybridVoltage ?? 0) * (prev.hybridCurrent ?? 0);
    const p1 = (curr.hybridVoltage ?? 0) * (curr.hybridCurrent ?? 0);
    // Positive power = discharging (driving)
    const avgPowerW = ((p0 + p1) / 2);
    if (avgPowerW > 0) {
      const dtHours = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 3_600_000;
      if (dtHours > 0 && dtHours < 0.01) {
        energyWh += avgPowerW * dtHours;
      }
    }
  }
  return energyWh;
}

/**
 * Detect hard braking and acceleration events from speed deltas.
 * Threshold: 3 m/s^2.
 * @param {Snapshot[]} snapshots
 * @returns {{ hardBrakingCount: number, hardAccelerationCount: number }}
 */
export function detectHardEvents(snapshots) {
  let hardBrakingCount = 0;
  let hardAccelerationCount = 0;
  const THRESHOLD = 3; // m/s^2

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const s0 = prev.speed ?? 0;
    const s1 = curr.speed ?? 0;
    const dtSeconds = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000;
    if (dtSeconds <= 0 || dtSeconds > 10) continue;

    // Convert km/h to m/s: divide by 3.6
    const accel = ((s1 - s0) / 3.6) / dtSeconds;
    if (accel > THRESHOLD) hardAccelerationCount++;
    if (accel < -THRESHOLD) hardBrakingCount++;
  }
  return { hardBrakingCount, hardAccelerationCount };
}

/**
 * Compute total time spent in EV mode.
 * @param {Snapshot[]} snapshots
 * @returns {number} Time in EV mode in seconds.
 */
export function computeEvModeTime(snapshots) {
  let evSeconds = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    // Count interval as EV if the current snapshot indicates EV mode
    if (curr.evMode) {
      const dt = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000;
      if (dt > 0 && dt < 30) {
        evSeconds += dt;
      }
    }
  }
  return evSeconds;
}

/**
 * Estimate CO2 emissions and savings.
 * @param {number} fuelConsumedL
 * @param {number} evModePercent
 * @param {number} distanceKm
 * @param {TripConfig} config
 * @returns {{ co2EmittedGrams: number, savedCo2Grams: number }}
 */
export function estimateCo2(fuelConsumedL, evModePercent, distanceKm, config) {
  const co2EmittedGrams = fuelConsumedL * config.co2PerLiterPetrol;
  // Pure ICE reference: what a non-hybrid would have emitted
  const pureIceCo2Grams = distanceKm * config.pureIceCo2Per100km / 100 * 1000;
  const savedCo2Grams = Math.max(0, pureIceCo2Grams - co2EmittedGrams);
  return { co2EmittedGrams, savedCo2Grams };
}

/**
 * Auto-tag a trip based on computed stats.
 * @param {TripStats} stats
 * @param {Snapshot[]} snapshots
 * @returns {string[]}
 */
export function autoTag(stats, snapshots) {
  const tags = [];

  if (stats.avgSpeedKmh > 80) tags.push('highway');
  if (stats.avgSpeedKmh < 40 && stats.distanceKm > 2) tags.push('city');

  // Cold start: coolant temp at trip start < 40 C
  if (snapshots.length > 0) {
    const firstCoolant = snapshots[0].coolantTemp;
    if (firstCoolant !== null && firstCoolant < 40) tags.push('cold-start');
  }

  if (stats.evModePercent > 60) tags.push('ev-dominant');
  if ((stats.hardBrakingCount + stats.hardAccelerationCount) > 10) tags.push('aggressive');
  if (stats.distanceKm > 100) tags.push('long-trip');
  if (stats.distanceKm < 5) tags.push('short-trip');
  if (stats.idleTimeSeconds > 300) tags.push('idling');

  return tags;
}

// ---- Internal helpers ----

/**
 * Core stats computation shared by live and final modes.
 * @param {Snapshot[]} snapshots
 * @param {TripConfig} config
 * @param {boolean} isLive
 * @returns {TripStats}
 */
function _computeStats(snapshots, config, isLive) {
  if (snapshots.length === 0) return _emptyStats();

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const durationSeconds = (new Date(last.timestamp) - new Date(first.timestamp)) / 1000;

  const distanceKm = integrateDistance(snapshots);
  const fuelConsumedL = integrateFuelConsumption(snapshots);
  const electricConsumptionWh = integrateElectricEnergy(snapshots);
  const { hardBrakingCount, hardAccelerationCount } = detectHardEvents(snapshots);
  const evModeTimeS = computeEvModeTime(snapshots);

  const avgSpeedKmh = durationSeconds > 0 ? (distanceKm / durationSeconds) * 3600 : 0;

  let maxSpeedKmh = 0;
  let maxRpm = 0;
  let socSum = 0;
  let socCount = 0;
  let coolantSum = 0;
  let coolantCount = 0;
  let idleTimeSeconds = 0;
  let engineOnSeconds = 0;
  let regenEnergyWh = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    if (s.speed !== null && s.speed > maxSpeedKmh) maxSpeedKmh = s.speed;
    if (s.rpm !== null && s.rpm > maxRpm) maxRpm = s.rpm;
    if (s.hybridSOC !== null) { socSum += s.hybridSOC; socCount++; }
    if (s.coolantTemp !== null) { coolantSum += s.coolantTemp; coolantCount++; }

    if (i > 0) {
      const prev = snapshots[i - 1];
      const dt = (new Date(s.timestamp) - new Date(prev.timestamp)) / 1000;
      if (dt > 0 && dt < 30) {
        // Idle: speed=0 and engine running (rpm > 0)
        if ((s.speed ?? 0) === 0 && (s.rpm ?? 0) > 0) {
          idleTimeSeconds += dt;
        }
        // Engine on: rpm > 0
        if ((s.rpm ?? 0) > 0) {
          engineOnSeconds += dt;
        }
        // Regen energy: negative power (charging) from regen torque * MG2 rpm
        // Use voltage * |negative current| as proxy for regen power
        const current = s.hybridCurrent ?? 0;
        const voltage = s.hybridVoltage ?? 0;
        if (current < 0 && voltage > 0) {
          const prevCurrent = prev.hybridCurrent ?? 0;
          const prevVoltage = prev.hybridVoltage ?? 0;
          const p0 = prevVoltage * Math.abs(Math.min(0, prevCurrent));
          const p1 = voltage * Math.abs(current);
          const dtHours = dt / 3600;
          regenEnergyWh += ((p0 + p1) / 2) * dtHours;
        }
      }
    }
  }

  const evModePercent = durationSeconds > 0 ? (evModeTimeS / durationSeconds) * 100 : 0;
  const engineOnPercent = durationSeconds > 0 ? (engineOnSeconds / durationSeconds) * 100 : 0;
  const avgHybridSOC = socCount > 0 ? socSum / socCount : 0;
  const avgCoolantTemp = coolantCount > 0 ? coolantSum / coolantCount : 0;

  const firstSOC = _findFirstNonNull(snapshots, 'hybridSOC');
  const lastSOC = _findLastNonNull(snapshots, 'hybridSOC');
  const socDelta = (firstSOC !== null && lastSOC !== null) ? lastSOC - firstSOC : 0;

  const avgConsumptionL100km = distanceKm > 0 ? (fuelConsumedL / distanceKm) * 100 : 0;

  // Instant consumption: rolling 10s window
  let instantConsumptionL100km = 0;
  if (isLive && snapshots.length > 1) {
    const windowMs = 10_000;
    const cutoff = new Date(last.timestamp) - windowMs;
    const windowSnapshots = snapshots.filter(s => new Date(s.timestamp) >= cutoff);
    if (windowSnapshots.length > 1) {
      const windowDist = integrateDistance(windowSnapshots);
      const windowFuel = integrateFuelConsumption(windowSnapshots);
      instantConsumptionL100km = windowDist > 0 ? (windowFuel / windowDist) * 100 : 0;
    }
  }

  const fuelCostEur = fuelConsumedL * config.fuelPricePerLiter;
  const { co2EmittedGrams, savedCo2Grams } = estimateCo2(
    fuelConsumedL, evModePercent, distanceKm, config
  );

  const boundingBox = _computeBoundingBox(snapshots);

  return {
    distanceKm,
    durationSeconds,
    fuelConsumedL,
    fuelCostEur,
    avgSpeedKmh,
    maxSpeedKmh,
    avgConsumptionL100km,
    instantConsumptionL100km,
    electricConsumptionWh,
    evModePercent,
    avgHybridSOC,
    socDelta,
    regenEnergyWh,
    engineOnPercent,
    avgCoolantTemp,
    idleTimeSeconds,
    hardBrakingCount,
    hardAccelerationCount,
    maxRpm,
    co2EmittedGrams,
    savedCo2Grams,
    boundingBox,
    startAddress: null,
    endAddress: null,
  };
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
  };
}

/**
 * Compute GPS bounding box from snapshots that have coordinates.
 * @param {Snapshot[]} snapshots
 * @returns {BoundingBox|null}
 */
function _computeBoundingBox(snapshots) {
  let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;
  let found = false;
  for (const s of snapshots) {
    if (s.lat != null && s.lng != null) {
      found = true;
      if (s.lat > north) north = s.lat;
      if (s.lat < south) south = s.lat;
      if (s.lng > east) east = s.lng;
      if (s.lng < west) west = s.lng;
    }
  }
  return found ? { north, south, east, west } : null;
}

/**
 * Find first non-null value for a given field in snapshots.
 * @param {Snapshot[]} snapshots
 * @param {string} field
 * @returns {number|null}
 */
function _findFirstNonNull(snapshots, field) {
  for (const s of snapshots) {
    if (s[field] !== null && s[field] !== undefined) return s[field];
  }
  return null;
}

/**
 * Find last non-null value for a given field in snapshots.
 * @param {Snapshot[]} snapshots
 * @param {string} field
 * @returns {number|null}
 */
function _findLastNonNull(snapshots, field) {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i][field] !== null && snapshots[i][field] !== undefined) {
      return snapshots[i][field];
    }
  }
  return null;
}
