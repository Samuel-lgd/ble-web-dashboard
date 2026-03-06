import { PID_KEYS } from './src/pid-keys.js';

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

function makePidMap(standardPids, toyotaPids) {
  const map = new Map();
  for (const pid of [...standardPids, ...toyotaPids]) {
    const key = `${pid.protocol}:${pid.header || ''}:${pid.pid}:${pid.name}`;
    map.set(key, pid);
  }
  return map;
}

/**
 * Build the active PID list from explicit key usage.
 *
 * This enforces "poll only what is consumed" and avoids silently polling
 * stale/debug-only definitions.
 */
export function selectPolledPids(standardPids, toyotaPids, { includeAll = false } = {}) {
  if (includeAll) {
    return {
      selected: [...standardPids, ...toyotaPids],
      missingKeys: [],
      selectedKeys: [],
    };
  }

  const byKey = makePidMap(standardPids, toyotaPids);
  const selected = [];
  const missingKeys = [];

  for (const key of DEFAULT_POLL_KEYS) {
    const pid = byKey.get(key);
    if (!pid) {
      missingKeys.push(key);
      continue;
    }
    selected.push(pid);
  }

  return {
    selected,
    missingKeys,
    selectedKeys: [...DEFAULT_POLL_KEYS],
  };
}
