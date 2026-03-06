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

// Extract data bytes from standard OBD2 response (mode 01/02)
// With ATH1: 3-char header + PCI + mode echo + PID echo + data_bytes
// We skip first 3 tokens ([PCI, 41, XX]) to reach data
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
    interval: POLLING.NORMAL,
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
    interval: POLLING.NORMAL,
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
    interval: POLLING.SLOW,
    protocol: 'standard',
    parse(raw) {
      const b = parseBytes(raw, 1);
      if (!b) return null;
      return b[0] - 40;
    },
  },
  /*
  // ❌ UNUSED — Commented out to reduce polling overhead
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
  */
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
  /*
  // ❌ UNUSED — Commented out to reduce polling overhead
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
  */
  /*
  // ❌ DISABLED — Not supported on Toyota NHP130 / THS-II hybrids
  //
  // Mode 01 PID 0x5E is absent from the Toyota Auris Hybrid PIDS_C bitmap
  // (response 41 40 44 CC 00 21 — bit for 0x5E = 0).
  // The Atkinson-cycle engine under HV-ECU load management does not compute
  // instantaneous fuel flow in a form OBD Mode 01 can serve. Use Toyota
  // proprietary PID 0x213C on 7E0 (injector volume) for fuel data instead.
  // Source: Ircama/ELM327-emulator elm/obd_message.py Toyota Auris capture.
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
  */
  /*
  // ❌ UNUSED — Commented out to reduce polling overhead
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
  */
  /*
  // ❌ DISABLED — Not supported on Toyota NHP130 / THS-II hybrids
  //
  // Mode 01 PID 0x2F is absent from the Toyota engine ECU (7E0) PIDS_B bitmap
  // (response 41 20 90 15 B0 15 — bit for 0x2F = 0).
  // Toyota compact hybrids manage fuel level via the body/ICE ECU at 7C0
  // using proprietary service 21, PID 0x29 (ATSH 7C0 → command 2129).
  // Source: Ircama/ELM327-emulator elm/obd_message.py Toyota Auris capture.
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
  */
];
