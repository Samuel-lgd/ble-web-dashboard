import { PID_KEYS } from './keys.js';
import {
  buildPidCatalog,
  getAllAvailablePidEntries,
} from './catalog.js';

/**
 * PIDs consumed directly by the rendered dashboard widgets.
 */
export const UI_POLL_KEYS = [
  PID_KEYS.ENGINE_RPM,
  PID_KEYS.ENGINE_LOAD,
  PID_KEYS.VEHICLE_SPEED,
  PID_KEYS.COOLANT_TEMP,
  PID_KEYS.FUEL_RATE,
  PID_KEYS.FUEL_TANK_LEVEL,
  PID_KEYS.HV_BATTERY_SOC_HR,
  PID_KEYS.HV_BATTERY_CURRENT,
  PID_KEYS.HV_BATTERY_VOLTAGE,
  PID_KEYS.HV_BATT_TEMP_INTAKE,
  PID_KEYS.EV_MODE_STATUS,
  PID_KEYS.MG2_TORQUE,
  PID_KEYS.REGEN_BRAKE_TORQUE,
];

/**
 * Extra keys required by trip lifecycle logic (auto start/stop + snapshots).
 */
export const TRIP_POLL_KEYS = [
  PID_KEYS.ENGINE_RPM,
  PID_KEYS.VEHICLE_SPEED,
  PID_KEYS.HYBRID_BATTERY_SOC,
];

export const DEFAULT_POLL_KEYS = [...new Set([...UI_POLL_KEYS, ...TRIP_POLL_KEYS])];

export function buildDemandByKey() {
  const demand = new Map();

  const add = (key, consumer) => {
    const row = demand.get(key) || [];
    if (!row.includes(consumer)) row.push(consumer);
    demand.set(key, row);
  };

  for (const key of UI_POLL_KEYS) add(key, 'ui');
  for (const key of TRIP_POLL_KEYS) add(key, 'trip');

  return demand;
}

export function buildRequestedPidCatalog() {
  const demand = buildDemandByKey();
  const { entries, missingKeys } = buildPidCatalog(DEFAULT_POLL_KEYS);

  return {
    entries: entries.map((entry) => ({
      ...entry,
      consumers: demand.get(entry.key) || [],
      required: true,
    })),
    missingKeys,
  };
}

/**
 * Build the active PID list from explicit key usage.
 */
export function selectPolledPids(standardPids, toyotaPids, { includeAll = false } = {}) {
  // Kept for API compatibility with existing call sites.
  void standardPids;
  void toyotaPids;

  if (includeAll) {
    const all = getAllAvailablePidEntries();
    return {
      selected: all.map((entry) => entry.definition),
      missingKeys: [],
      selectedKeys: all.map((entry) => entry.key),
      catalog: all.map((entry) => ({
        ...entry,
        required: false,
        consumers: [],
        available: true,
      })),
    };
  }

  const { entries, missingKeys } = buildRequestedPidCatalog();
  const selected = entries
    .filter((entry) => entry.available && entry.definition)
    .map((entry) => entry.definition);

  return {
    selected,
    missingKeys,
    selectedKeys: entries.filter((entry) => entry.available).map((entry) => entry.key),
    catalog: entries,
  };
}
