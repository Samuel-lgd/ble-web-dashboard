import { POLLING } from './config.js';

/**
 * Toyota Yaris Hybrid 2020 — Proprietary PID definitions.
 *
 * These use mode 0x21 / 0x22 and require switching the ELM327 header
 * with ATSH to target the correct ECU before sending the PID command.
 *
 * ECU addresses:
 *   7E0 — Engine ECU (ICE)
 *   7E2 — HV ECU (hybrid transaxle — MG1/MG2)
 *   7E4 — Hybrid Battery ECU (HV battery pack)
 *
 * IMPORTANT:
 *   - Parse formulas below are based on commonly reported values from the
 *     Toyota Hybrid community, OBD Fusion PID packs, and Torque Pro configs.
 *   - Some formulas may need calibration against Toyota Techstream or a
 *     known-good reference tool. Formulas marked [VERIFY] are best-effort
 *     and should be confirmed with real vehicle data.
 *   - Response bytes are counted AFTER the service/PID echo (e.g., for a
 *     mode 21 response "61 XX AA BB", AA is byte index 0).
 *
 * Adding a new Toyota PID:
 *   1. Add an entry to the TOYOTA_PIDS array below.
 *   2. Set `header` to the ECU address (e.g. '7E2').
 *   3. Set `pid` to the mode + PID hex string (e.g. '2101').
 *   4. Write a `parse(raw)` function that extracts data bytes and applies the formula.
 *   5. That's it — the PIDManager and ATSHManager will handle header switching automatically.
 *
 * @typedef {import('./pids-standard.js').PIDDefinition} PIDDefinition
 */

/**
 * Parse helper for Toyota proprietary responses.
 * Responses look like: "61 XX AA BB CC ..." (mode 21) or "62 XX YY AA BB ..." (mode 22).
 * This extracts all bytes after the echo prefix.
 * @param {string} raw - Cleaned response.
 * @param {number} echoBytes - Number of echo bytes to skip (2 for mode 21, 3 for mode 22).
 * @returns {number[] | null} Data bytes as integers.
 */
function parseToyotaBytes(raw, echoBytes) {
  const parts = raw.split(' ').filter((s) => /^[0-9A-Fa-f]{2}$/.test(s));
  if (parts.length <= echoBytes) return null;
  return parts.slice(echoBytes).map((h) => parseInt(h, 16));
}

/** @type {PIDDefinition[]} */
export const TOYOTA_PIDS = [
  // ── Hybrid Battery ECU (7E4) ─────────────────────────────────────────

  {
    pid: '2101',
    name: 'HV Battery SOC (HR)',
    unit: '%',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] High-resolution SOC — byte 6 of response, scale 0–100 or 0–200 / 2
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 7) return null;
      return b[6] / 2;
    },
  },
  {
    pid: '2101',
    name: 'HV Battery Current',
    unit: 'A',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] Signed 16-bit at bytes 2-3. Offset by 0x7FFF, scale /100 or /10
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      const raw16 = (b[2] * 256) + b[3];
      return (raw16 - 32768) / 100;
    },
  },
  {
    pid: '2101',
    name: 'HV Battery Voltage',
    unit: 'V',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] Bytes 0-1, scale /2 to get pack voltage
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 2;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp Cell 1',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] Cell temperature block — first cell at byte 2, offset -40
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 3) return null;
      return b[2] - 40;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp Cell 2',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] Second cell temperature at byte 3
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      return b[3] - 40;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp Cell 3',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] Third cell temperature at byte 4
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 5) return null;
      return b[4] - 40;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp Cell 4',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    parse(raw) {
      // [VERIFY] Fourth cell temperature at byte 5
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 6) return null;
      return b[5] - 40;
    },
  },

  // ── HV ECU / Transaxle (7E2) ────────────────────────────────────────

  {
    pid: '2101',
    name: 'MG1 RPM (Generator)',
    unit: 'rpm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    parse(raw) {
      // [VERIFY] MG1 speed — signed 16-bit at bytes 0-1, may need scale factor
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      let rpm = (b[0] * 256) + b[1];
      if (rpm > 32767) rpm -= 65536; // signed
      return rpm;
    },
  },
  {
    pid: '2101',
    name: 'MG2 RPM (Motor)',
    unit: 'rpm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    parse(raw) {
      // [VERIFY] MG2 speed — signed 16-bit at bytes 2-3
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      let rpm = (b[2] * 256) + b[3];
      if (rpm > 32767) rpm -= 65536;
      return rpm;
    },
  },
  {
    pid: '2103',
    name: 'MG1 Torque',
    unit: 'Nm',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    parse(raw) {
      // [VERIFY] MG1 torque — signed 16-bit at bytes 0-1, scale /8 or /10
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      let val = (b[0] * 256) + b[1];
      if (val > 32767) val -= 65536;
      return val / 8;
    },
  },
  {
    pid: '2103',
    name: 'MG2 Torque',
    unit: 'Nm',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    parse(raw) {
      // [VERIFY] MG2 torque — signed 16-bit at bytes 2-3, scale /8 or /10
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      let val = (b[2] * 256) + b[3];
      if (val > 32767) val -= 65536;
      return val / 8;
    },
  },

  // ── Engine ECU (7E0) ─────────────────────────────────────────────────

  {
    pid: '2101',
    name: 'Coolant Temp (HR)',
    unit: '\u00B0C',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    parse(raw) {
      // [VERIFY] High-res coolant temp — byte 0, offset -40
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '2103',
    name: 'Fuel Consumption',
    unit: 'cc/min',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    parse(raw) {
      // [VERIFY] Instantaneous fuel — 16-bit at bytes 0-1, scale /10
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 10;
    },
  },
];
