import { POLLING } from './config.js';

/**
 * @typedef {Object} PIDDefinition
 * @property {string} pid - The OBD2 command to send (e.g. '010C').
 * @property {string} name - Human-readable name.
 * @property {string} unit - Unit of measurement.
 * @property {function(string): number | null} parse - Parse hex response into a numeric value.
 * @property {number} interval - Polling interval in ms.
 * @property {'standard' | 'toyota'} protocol - Protocol badge.
 * @property {string} [header] - ATSH header required before sending (Toyota PIDs only).
 * @property {string} [source] - Source URL or reference for the PID formula.
 * @property {boolean} [verified] - true only if formula confirmed by 2+ independent sources.
 * @property {string} [notes] - Explanation of formula derivation and known caveats.
 * @property {boolean} [calibrationNeeded] - true if formula is uncertain and needs real vehicle testing.
 */

/**
 * Parse helper: extract data bytes from a standard OBD2 response (mode 01/02).
 *
 * With ATH1 enabled (headers ON), a standard single-frame response looks like:
 *   "7E8 04 41 0C 1A F8"
 *    ─── ── ── ── ─────
 *    hdr PCI mode PID data_bytes
 *
 * The 3-char header "7E8" is auto-filtered by the 2-char regex.
 * Remaining tokens: [PCI, mode_echo, PID_echo, data_A, data_B, ...]
 * We skip 3 (PCI + mode echo + PID echo) to reach the data bytes.
 *
 * @param {string} raw - Cleaned response string.
 * @param {number} expectedBytes - Number of data bytes expected.
 * @returns {number[] | null} Array of byte values, or null on parse failure.
 */
export function parseBytes(raw, expectedBytes) {
  const parts = raw.split(' ').filter((s) => /^[0-9A-Fa-f]{2}$/.test(s));
  // With ATH1: [PCI, 41, XX, data...] → skip 3 to reach data
  // The PCI byte (e.g. 04 for 4-byte payload) is the first 2-char token
  // after the 3-char header is filtered out.
  const SKIP = 3; // PCI byte + mode echo (41) + PID echo
  if (parts.length < SKIP + expectedBytes) return null;
  const data = parts.slice(SKIP, SKIP + expectedBytes);
  return data.map((h) => parseInt(h, 16));
}

/** @type {PIDDefinition[]} */
export const STANDARD_PIDS = [
  {
    pid: '010C',
    name: 'Engine RPM',
    unit: 'rpm',
    interval: POLLING.FAST,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 2);
      if (!b) return null;
      return ((b[0] * 256) + b[1]) / 4;
    },
  },
  {
    pid: '0104',
    name: 'Engine Load',
    unit: '%',
    interval: POLLING.FAST,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return (b[0] * 100) / 255;
    },
  },
  {
    pid: '010D',
    name: 'Vehicle Speed',
    unit: 'km/h',
    interval: POLLING.FAST,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return b[0];
    },
  },
  {
    pid: '0105',
    name: 'Coolant Temp',
    unit: '\u00B0C',
    interval: POLLING.NORMAL,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '010F',
    name: 'Intake Air Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '0111',
    name: 'Throttle Position',
    unit: '%',
    interval: POLLING.FAST,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return (b[0] * 100) / 255;
    },
  },
  {
    pid: '015B',
    name: 'Hybrid Battery SOC',
    unit: '%',
    interval: POLLING.NORMAL,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return (b[0] * 100) / 255;
    },
  },
  {
    pid: '015C',
    name: 'Engine Oil Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '015E',
    name: 'Fuel Rate',
    unit: 'L/h',
    interval: POLLING.NORMAL,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 2);
      if (!b) return null;
      return ((b[0] * 256) + b[1]) / 20;
    },
  },
  {
    pid: '0143',
    name: 'Absolute Load',
    unit: '%',
    interval: POLLING.NORMAL,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 2);
      if (!b) return null;
      return ((b[0] * 256) + b[1]) * 100 / 255;
    },
  },
  {
    pid: '0146',
    name: 'Ambient Air Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '0149',
    name: 'Accel Pedal Pos',
    unit: '%',
    interval: POLLING.FAST,
    protocol: 'standard',
    source: 'SAE J1979 — PID 0x49 Accelerator Pedal Position D',
    verified: true,
    notes: 'Standard OBD2 PID 49h. Returns absolute pedal position (0-100%). Scale: A*100/255.',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return (b[0] * 100) / 255;
    },
  },
  {
    pid: '0142',
    name: '12V System Voltage',
    unit: 'V',
    interval: POLLING.SLOW,
    protocol: 'standard',
    source: 'SAE J1979 — PID 0x42 Control Module Voltage',
    verified: true,
    notes: 'Standard OBD2 PID 42h. Measures the 12V system (control module) voltage. Scale: (A*256+B)/1000.',
    parse(raw) {
      const b = parseBytes(raw, 2);
      if (!b) return null;
      return ((b[0] * 256) + b[1]) / 1000;
    },
  },
  {
    pid: '012F',
    name: 'Fuel Tank Level',
    unit: '%',
    interval: POLLING.SLOW,
    protocol: 'standard',
    source: 'SAE J1979 — PID 0x2F Fuel Tank Level Input',
    verified: true,
    notes: 'Standard OBD2 PID 2Fh. Returns fuel tank fill level as a percentage. Scale: A*100/255.',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return (b[0] * 100) / 255;
    },
  },
];
