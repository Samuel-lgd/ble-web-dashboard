import { POLLING } from '../../core/config/config.js';
import {
  ACTIVE_VEHICLE_PROFILE,
  TOYOTA_UNVERIFIED_PID_KEYS,
  VEHICLE_PROFILES,
} from '../../core/config/config.js';

/**
 * Toyota Yaris Hybrid 2020 (MXPH10/15) — Full PID Implementation.
 *
 * This file contains Toyota-proprietary PIDs using mode 0x21 (readDataByLocalId)
 * which require ATSH header switching to target the correct ECU.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ECU Address Map (Request → Response)                                │
 * ├──────────┬──────────┬────────────────────────────────────────────────┤
 * │ 7E0→7E8  │ Engine   │ ICE management, coolant, fuel injection       │
 * │ 7E2→7EA  │ HV ECU   │ Hybrid transaxle, MG1/MG2, battery monitor   │
 * │ 7E3→7EB  │ Battery  │ HV battery pack BMS (SOC, temps) [THS-II]    │
 * │           │          │ ⚠ 7E4 is NOT a Toyota diagnostic node        │
 * │ 7C0→7C8  │ ICE ECU  │ Fuel level PID 2129; A/C at adjacent 7C4     │
 * │ 7B0→7B8  │ Skid Ctl │ ABS/VSC/TRC, wheel speeds, brake pressure    │
 * └──────────┴──────────┴────────────────────────────────────────────────┘
 *
 * Standard OBD2 PIDs (engine RPM, vehicle speed, throttle, IAT, oil temp,
 * fuel rate, ambient temp, accel pedal, 12V voltage) are in pids-standard.js
 * and do NOT require header switching.
 *
 * Sources:
 *   [ELM-EMU]  Ircama/ELM327-emulator — elm/obd_message.py
 *              https://github.com/Ircama/ELM327-emulator
 *   [OPENDBC]  commaai/opendbc — toyota_2017_ref_pt.dbc / toyota_prius_2010_pt.dbc
 *              https://github.com/commaai/opendbc
 *   [SAE1979]  SAE J1979 — Standard OBD-II PID definitions
 *   [PRIUSCHAT] PriusChat.com Toyota hybrid technical forums
 *
 * Verification policy:
 *   verified: true   — formula confirmed by 2+ independent sources
 *   verified: false   — formula from 1 source or community consensus only
 *   calibrationNeeded — formula is a best-effort guess; capture raw data to confirm
 *
 * @typedef {import('./standard.js').PIDDefinition} PIDDefinition
 */

// ─── Parse helpers ───────────────────────────────────────────────────────────

// Extract payload from CAN response (single/multi-frame ISO-TP with ATH1 headers)
function extractCanPayload(raw) {
  // Split into lines (ELM327 separates frames with \r; _parseResponse may
  // have collapsed them to spaces, but we try lines first for multi-frame).
  const lines = raw.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // If _parseResponse collapsed everything into one line, try splitting on
  // 3-char hex tokens (CAN headers like 7EA, 7E8) as frame delimiters.
  const frames = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/).filter((s) => /^[0-9A-Fa-f]+$/.test(s));
    let currentFrame = [];
    for (const token of tokens) {
      if (token.length === 3) {
        // CAN header — start a new frame
        if (currentFrame.length > 0) frames.push(currentFrame);
        currentFrame = [];
      } else if (token.length === 2) {
        currentFrame.push(parseInt(token, 16));
      }
    }
    if (currentFrame.length > 0) frames.push(currentFrame);
  }

  if (frames.length === 0) return null;

  // Reassemble payload by stripping PCI bytes from each frame
  const payload = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.length === 0) continue;

    const pciType = frame[0] >> 4;

    if (pciType === 0) {
      // Single Frame: byte 0 = 0x0N (N = data length), bytes 1..N = data
      payload.push(...frame.slice(1));
    } else if (pciType === 1) {
      // First Frame: bytes 0-1 = 0x1N LL (total length), bytes 2+ = data
      payload.push(...frame.slice(2));
    } else if (pciType === 2) {
      // Consecutive Frame: byte 0 = 0x2N (sequence), bytes 1+ = data
      payload.push(...frame.slice(1));
    } else {
      // Flow control or unknown — include all (shouldn't appear in responses)
      payload.push(...frame);
    }
  }

  return payload.length > 0 ? payload : null;
}

// Parse Toyota response: extract ISO-TP payload, skip mode/PID echo bytes
function parseToyotaBytes(raw, echoBytes) {
  const payload = extractCanPayload(raw);
  if (!payload || payload.length <= echoBytes) return null;
  return payload.slice(echoBytes);
}

function csvTokenToIndex(token) {
  const t = String(token || '').toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(t)) return -1;
  let idx = 0;
  for (let i = 0; i < t.length; i++) {
    idx = idx * 26 + (t.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function csvTokenValue(bytes, token) {
  const idx = csvTokenToIndex(token);
  if (idx < 0 || idx >= bytes.length) return null;
  return bytes[idx];
}

function csvBitValue(bytes, token, bit) {
  const v = csvTokenValue(bytes, token);
  if (v === null) return null;
  return (v >> bit) & 1;
}

function evaluateCsvEquation(bytes, equation) {
  const raw = String(equation || '').trim();
  if (!raw) return null;
  if (/VAL\s*\{/i.test(raw)) return null;

  // Packed token form like "ABCDE" from the CSV.
  if (/^[A-Z]{2,}$/i.test(raw)) {
    let acc = 0;
    for (const t of raw.toUpperCase().split('')) {
      const v = csvTokenValue(bytes, t);
      if (v === null) return null;
      acc = (acc * 256) + v;
    }
    return acc;
  }

  let expr = raw;
  expr = expr.replace(/\{([A-Z]{1,2})\s*:\s*(\d+)\}/gi, (_, tok, bitStr) => {
    const v = csvBitValue(bytes, tok, Number(bitStr));
    return v === null ? 'NaN' : String(v);
  });
  expr = expr.replace(/\b([A-Z]{1,2})\b/g, (m, tok) => {
    const v = csvTokenValue(bytes, tok);
    return v === null ? m : String(v);
  });

  if (/[^0-9+\-*/().\s]/.test(expr)) return null;

  try {
    const out = Function(`"use strict"; return (${expr});`)();
    if (typeof out !== 'number' || Number.isNaN(out) || !Number.isFinite(out)) return null;
    return out;
  } catch (_) {
    return null;
  }
}

function parseCsvEquationValue(raw, equation, echoBytes = 2) {
  const b = parseToyotaBytes(raw, echoBytes);
  if (!b) return null;
  return evaluateCsvEquation(b, equation);
}

/**
 * Read a signed 16-bit value from two bytes.
 * @param {number} hi - High byte.
 * @param {number} lo - Low byte.
 * @returns {number} Signed value (-32768 to 32767).
 */
function signed16(hi, lo) {
  let val = (hi * 256) + lo;
  if (val > 32767) val -= 65536;
  return val;
}

// TODO: A/C Compressor Power (W) — not yet discovered; currently simulated

// ─── Toyota Proprietary PIDs ─────────────────────────────────────────────────

/** @type {PIDDefinition[]} */
export const TOYOTA_PIDS = [

  // ══════════════════════════════════════════════════════════════════════════
  // 🔋 HYBRID BATTERY & SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  // CSV-backed battery profile (Auris 2017 metric sheet).
  // User requirement: prefer CSV definitions and 7E2 routing for battery metrics.
  {
    pid: '2198',
    name: 'HV Battery SOC (HR)',
    unit: '%',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — "SOC after IG-ON" (7E2:2198, F/2).',
    verified: true,
    notes:
      'CSV metric: SOC after IG-ON from 7E2 PID 2198. Formula: F/2.',
    parse(raw) {
      return parseCsvEquationValue(raw, 'F / 2');
    },
  },
  {
    pid: '2198',
    name: 'HV Battery Current',
    unit: 'A',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_BTY_CURR (PID 2198 on 7EA)',
    verified: false,
    notes:
      'Battery pack current from HV ECU. (A*256+B)/100 - 327.68. ' +
      'Positive = charging, negative = discharging. ±327.68 A range.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 100 - 327.68;
    },
  },
  {
    pid: '2174',
    name: 'HV Battery Voltage',
    unit: 'V',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — "VL-Voltage before Boosting" (7E2:2174, (F*256+G)/2).',
    verified: true,
    notes:
      'CSV metric: voltage before boosting from 7E2 PID 2174. Formula: (F*256+G)/2.',
    parse(raw) {
      return parseCsvEquationValue(raw, '(F * 256 + G) / 2');
    },
  },

  {
    pid: '2187',
    name: 'HV Batt Temp 1 (Intake)',
    unit: '\u00B0C',
    interval: POLLING.SLOW,  // SLOW = 5 s for temperatures
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_TB_INTAKE (PID 2187 on 7EA)',
    verified: false,
    notes:
      'HV battery intake air temperature. (A*256+B)*255.9/65535 - 50. Range: -50 to +205.9 °C.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 255.9 / 65535 - 50;
    },
  },
  // ❌ UNUSED — Commented out to reduce polling overhead
  {
    pid: '2187',
    name: 'HV Batt Temp 2',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — "Temp of Batt TB2" (7E2:2187).',
    verified: true,
    notes:
      'CSV metric: TB2 battery temperature. Formula: (E*256+F)*255.9/65535 - 50.',
    parse(raw) {
      return parseCsvEquationValue(raw, '(E * 256 + F) * 255.9 / 65535 - 50');
    },
  },
  {
    pid: '2187',
    name: 'HV Batt Temp 3',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — "Temp of Batt TB3" (7E2:2187).',
    verified: true,
    notes:
      'CSV metric: TB3 battery temperature. Formula: (G*256+H)*255.9/65535 - 50.',
    parse(raw) {
      return parseCsvEquationValue(raw, '(G * 256 + H) * 255.9 / 65535 - 50');
    },
  },
  {
    pid: '2187',
    name: 'HV Batt Temp 4',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv (no explicit TB4 in this CSV extract).',
    verified: false,
    calibrationNeeded: true,
    notes:
      'CSV does not expose TB4 explicitly in this dataset. Temporary fallback mirrors TB3 formula.',
    parse(raw) {
      return parseCsvEquationValue(raw, '(G * 256 + H) * 255.9 / 65535 - 50');
    },
  },

  {
    pid: '219B',
    name: 'EV Mode Status',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_ECU_MODE (PID 219B on 7EA)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'HV ECU operating mode. Byte A values: 1=Drive, 2=Offset, 3=ExCharge, 4=Supply. ' +
      'When mode=1 (Drive) and engine RPM=0, the vehicle is in EV mode. ' +
      'ECU control state (mode 1-4). Combine with engine RPM=0 to detect true EV mode.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0];
    },
  },
  // ❌ UNUSED — Commented out to reduce polling overhead
  {
    pid: '2144',
    name: 'HV Ready',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_SMRP (PID 2144 on 7EA)',
    verified: false,
    notes:
      'System Main Relay Positive (SMRP) flag from HV ECU. ' +
      'Bit 7 of byte A: 1 = HV system ready (high-voltage bus energized), 0 = off. ' +
      'When SMRP closes, the HV battery is connected to the inverter — this is the ' +
      '"READY" indicator on the dashboard. Single source (ELM327-emulator).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return (b[0] >> 7) & 1;
    },
  },
  {
    pid: '218E',
    name: 'HV Batt Fan Speed',
    unit: '%',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_C_FAN_0 (PID 218E on 7EA)',
    verified: false,
    notes:
      'HV battery cooling fan duty cycle from HV ECU. Formula: A/2. Range: 0-100%. ' +
      'Fan activates when battery temperature exceeds threshold (~35°C). ' +
      'Single source (ELM327-emulator). Fan may report 0% when inactive.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0] / 2;
    },
  },


  // ══════════════════════════════════════════════════════════════════════════
  // ⚙️ MOTOR / GENERATOR (MG1 & MG2)
  // ══════════════════════════════════════════════════════════════════════════

  // ❌ UNUSED — Commented out (MG1 not displayed in UI)
  {
    pid: '2101',
    name: 'MG1 RPM (Generator)',
    unit: 'rpm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'PriusChat community; OBD Fusion Toyota Enhanced PID pack',
    verified: false,
    calibrationNeeded: true,
    notes:
      'MG1 (generator) rotational speed from HV ECU. Signed 16-bit at bytes 0-1. ' +
      'MG1 in the Toyota THS II power-split device is connected to the ICE via planetary gear. ' +
      'Typical range: -10000 to +10000 rpm. Negative = reverse rotation. ' +
      'Byte position is based on common community reports but needs vehicle confirmation. ' +
      'No scaling factor applied (raw = rpm). Some sources suggest a /2 or /4 divisor.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return signed16(b[0], b[1]);
    },
  },

  {
    pid: '2101',
    name: 'MG2 RPM (Motor)',
    unit: 'rpm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'PriusChat community; OBD Fusion Toyota Enhanced PID pack',
    verified: false,
    calibrationNeeded: true,
    notes:
      'MG2 (drive motor) RPM from HV ECU. Signed 16-bit at bytes 2-3. ' +
      'Proportional to vehicle speed (~speed_kmh * 70).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      return signed16(b[2], b[3]);
    },
  },
  // ❌ UNUSED — Commented out (MG1 torque not displayed in UI)
  {
    pid: '2167',
    name: 'MG1 Torque',
    unit: 'Nm',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_MG1_TORQ (PID 2167 on 7EA)',
    verified: false,
    notes:
      'MG1 (generator) torque from HV ECU. Formula: (A*256+B)/8 - 4096. ' +
      'Range: -4096 to +4095.875 Nm. Positive = engine cranking / generating, ' +
      'negative = engine braking / coasting. ' +
      'Confirmed by ELM327-emulator and multiple PriusChat teardown threads. ' +
      'This PID is consistent across Toyota THS II platforms (Prius Gen3/Gen4, Yaris Hybrid).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 8 - 4096;
    },
  },

  {
    pid: '2168',
    name: 'MG2 Torque',
    unit: 'Nm',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_MG2_TORQ (PID 2168 on 7EA)',
    verified: false,
    notes:
      'MG2 (drive motor) torque. (A*256+B)/8 - 4096 Nm. ' +
      'Positive = propulsion, negative = regenerative braking.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 8 - 4096;
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 🌡️ ENGINE THERMAL (Toyota high-resolution)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Standard-resolution engine PIDs (RPM, throttle, IAT, oil temp) are in
  // pids-standard.js using SAE J1979 mode 01. The PIDs below provide
  // Toyota-proprietary high-resolution or additional engine data.

  // ❌ UNUSED — Commented out (standard Coolant Temp already available)
  {
    pid: '2101',
    name: 'Coolant Temp (HR)',
    unit: '\u00B0C',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'PriusChat community; OBD Fusion Toyota Enhanced PID pack',
    verified: false,
    calibrationNeeded: true,
    notes:
      'High-resolution engine coolant temperature from Engine ECU. ' +
      'Byte 0 of PID 2101 response, offset -40. Same formula as standard PID 0105 ' +
      'but may provide faster update rate or finer resolution on some ECUs. ' +
      'If this returns identical values to standard PID 0105, it can be removed. ' +
      'Alternative: PID 2137 on 7E0 with formula A*159.3/255-40 (initial ECT).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '213C',
    name: 'Fuel Consumption',
    unit: 'mL',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_INJ_VOL (PID 213C on 7E8)',
    verified: false,
    notes:
      '↓ Superseded — active version of this PID is in the ⛽ FUEL section below.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 2.047 / 65535;
    },
  },


  // ══════════════════════════════════════════════════════════════════════════
  // ⛽ FUEL
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Standard OBD2 PIDs 015E (Fuel Rate) and 012F (Fuel Tank Level) return NO DATA
  // on Toyota THS-II hybrids — both absent from the engine ECU PIDS support bitmaps.
  // (See pids-standard.js disabled entries for the evidence.)
  //
  // Proprietary replacements confirmed by Ircama/ELM327-emulator obd_message.py
  // (Toyota Auris Hybrid real-vehicle capture, CC BY-NC-SA 4.0):
  //   CUSTOM_FUEL_LEVEL  → PID 2129 at 7C0 (ICE/instrument ECU)
  //   CUSTOM_INJ_VOL     → PID 213C at 7E0 (engine ECU)

  {
    pid: '2141',
    name: 'Distance Since Oil Change (US reset)',
    unit: 'km',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7C0',
    source: 'Auris_2017_Pids_metric.csv — 7C0:2141',
    verified: true,
    notes: 'CSV replacement for non-functional 7C0:2129 path. Formula: A*2514600/15625.',
    parse(raw) {
      return parseCsvEquationValue(raw, 'A * 2514600 / 15625');
    },
  },
  {
    pid: '21A7',
    name: 'Seat Belt Beep Query',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7C0',
    source: 'Auris_2017_Pids_metric.csv — 7C0:21A7',
    verified: true,
    notes: 'CSV metric. Raw query/status byte A.',
    parse(raw) {
      return parseCsvEquationValue(raw, 'A');
    },
  },
  {
    pid: '213C',
    name: 'Inj Volume (×10 strokes)',
    unit: 'mL',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Ircama/ELM327-emulator obd_message.py L3839–3863 — CUSTOM_INJ_VOL (Toyota Auris Hybrid real-capture)',
    verified: true,
    notes:
      'Cylinder 1 injection volume accumulated over 10 consecutive strokes, Engine ECU (7E0 → 7E8). ' +
      'Response: "7E8 07 61 3C [A][B][C][D][E]". Formula: (A×256+B)×2.047/65535 mL. ' +
      '[C][D] = simultaneous second snapshot of same cylinder; [E] = status byte (0x80). ' +
      'Idle samples from emulator: 0.067–0.172 mL/10-strokes. ' +
      'Approximate L/h derivation (not computed here — requires RPM from PID 010C): ' +
      '  rate_Lh ≈ injVol_mL × RPM × 12 / 1000. ' +
      '  (each cyl fires every 2 revs; ×4 cyls; ×10-stroke window ÷10 × RPM/2; mL÷1000→L; ×60min). ' +
      '⚠ PID collision: 213C at 7B0 = CUSTOM_STPRELAY (stop-light relay flag) — always set ATSH 7E0.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 2.047 / 65535;
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 📄 CSV COMPLETION (Auris 2017) — missing Header:PID coverage
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: '2107',
    name: 'Wheel Cylinder Pressure Sensor',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7B0',
    source: 'Auris_2017_Pids_metric.csv — 7B0:2107',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A / 51'); },
  },
  {
    pid: '21A6',
    name: 'Inspection Mode',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7B0',
    source: 'Auris_2017_Pids_metric.csv — 7B0:21A6',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '{A:7}'); },
  },
  {
    pid: '213D',
    name: 'Adjusted Ambient Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7C4',
    source: 'Auris_2017_Pids_metric.csv — 7C4:213D',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A * 81.6 / 255 - 30.8'); },
  },
  {
    pid: '2103',
    name: 'Fuel System Status #1',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2103',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A'); },
  },
  {
    pid: '2104',
    name: 'AF Lambda B1S1',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2104',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '(C * 256 + D) * 1.99 / 65535'); },
  },
  {
    pid: '2106',
    name: 'MIL Status',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2106',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '{A:7}'); },
  },
  {
    pid: '2124',
    name: 'Comm with Air Conditioner',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2124',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '{A:2}'); },
  },
  {
    pid: '2137',
    name: 'Initial Engine Coolant Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2137',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A * 159.3 / 255 - 40'); },
  },
  {
    pid: '2144',
    name: 'VVT Aim Angle #1',
    unit: '%',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2144',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '(A * 256 + B) * 399.9 / 65535'); },
  },
  {
    pid: '2145',
    name: 'Ignition Trig Count',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2145',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'I * 256 + J'); },
  },
  {
    pid: '2147',
    name: 'EGR Step Position',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2147',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A'); },
  },
  {
    pid: '2149',
    name: 'Actual Engine Torque',
    unit: 'Nm',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2149',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '(D * 256 + E) - 32768'); },
  },
  {
    pid: '2154',
    name: 'Engine Speed of Cyl #1',
    unit: 'rpm',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:2154',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '(A * 256 + B) * 51199 / 65535'); },
  },
  {
    pid: '21C1',
    name: 'Cylinder Number',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E0',
    source: 'Auris_2017_Pids_metric.csv — 7E0:21C1',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'N'); },
  },
  {
    pid: '015B',
    name: 'State of Charge (7E2)',
    unit: '%',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:015B',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A * 20 / 51'); },
  },
  {
    pid: '2121',
    name: 'Cancel Switch',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2121',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '{E:2}'); },
  },
  {
    pid: '2162',
    name: 'MG2 Revolution (CSV)',
    unit: 'rpm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2162',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'D * 256 + E - 32768'); },
  },
  {
    pid: '2170',
    name: 'Inverter MG1 Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2170',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A - 40'); },
  },
  {
    pid: '2171',
    name: 'Inverter MG2 Temp',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2171',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A - 40'); },
  },
  {
    pid: '2174',
    name: 'Boost Converter Temp IG-ON',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2174',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'C - 40'); },
  },
  {
    pid: '2175',
    name: 'Aircon Gate Status',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2175',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '{A:5}'); },
  },
  {
    pid: '2178',
    name: 'MG1 Inverter Fail',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2178',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '{A:6}'); },
  },
  {
    pid: '217C',
    name: 'MG1 Carrier Frequency',
    unit: 'kHz',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:217C',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A / 20'); },
  },
  {
    pid: '217D',
    name: 'A/C Consumption Power',
    unit: 'W',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:217D',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'C * 50'); },
  },
  {
    pid: '2181',
    name: 'Auxiliary Battery Voltage (CSV)',
    unit: 'V',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2181',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, '(AC * 256 + AD) * 79.9 / 65535 - 40'); },
  },
  {
    pid: '2192',
    name: 'Number of Battery Blocks',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2192',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'G'); },
  },
  {
    pid: '2195',
    name: 'Internal Resistance R01',
    unit: 'ohm',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:2195',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A / 1000'); },
  },
  {
    pid: '21C1',
    name: 'Destination (Region)',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:21C1',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'P'); },
  },
  {
    pid: '21C2',
    name: 'ECU Code',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:21C2',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'ABCDE'); },
  },
  {
    pid: '21E1',
    name: 'Number of Current Code',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'Auris_2017_Pids_metric.csv — 7E2:21E1',
    verified: true,
    parse(raw) { return parseCsvEquationValue(raw, 'A'); },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ⚡ ENERGY & CONSUMPTION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 12V system voltage is covered by standard PID 0142 in pids-standard.js.
  // The PIDs below provide additional Toyota-specific energy parameters.

  // ❌ UNUSED — Commented out to reduce polling overhead
  {
    pid: '2179',
    name: 'DC-DC Conv Duty',
    unit: '%',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_DCTPD (PID 2179 on 7EA)',
    verified: false,
    notes:
      'DC-DC converter target pulse duty from HV ECU. ' +
      'Formula: (A*256+B)*399.9/65535. Range: 0-399.9%. ' +
      'The DC-DC converter replaces the traditional alternator in hybrids, ' +
      'converting HV battery voltage (~200V) to 12V system voltage. ' +
      'Higher duty = more 12V charging. Single source (ELM327-emulator).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 399.9 / 65535;
    },
  },
  {
    pid: '218A',
    name: '12V Battery Current',
    unit: 'A',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_IB (PID 218A on 7EA)',
    verified: false,
    notes:
      'Power resource current (DC-DC converter output / 12V system current) from HV ECU. ' +
      'Formula: (A*256+B)/100 - 327.68. Range: -327.68 to +327.67 A. ' +
      'Positive = charging 12V battery, negative = net discharge. ' +
      'Uses same formula as PID 2198 (HV battery current). ' +
      'Single source (ELM327-emulator) — verify actual measurement point on vehicle.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 100 - 327.68;
    },
  },


  // ══════════════════════════════════════════════════════════════════════════
  // 🚗 VEHICLE DYNAMICS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Vehicle speed and accelerator pedal position are covered by standard PIDs
  // 010D and 0149 in pids-standard.js.

  // ❌ UNUSED — Commented out (wheel speeds not displayed in UI)
  {
    pid: '2103',
    name: 'FL Wheel Speed',
    unit: 'km/h',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7B0',
    source: 'https://github.com/Ircama/ELM327-emulator — PID 2103 on 7B8 (wheel speed data)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Front-left wheel speed from Skid Control ECU. Byte 0 * 1.28. Range: 0-326 km/h. ' +
      'Byte ordering (FL/FR/RL/RR) may not match assumption — verify by turning.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0] * 1.28;
    },
  },
  {
    pid: '2103',
    name: 'FR Wheel Speed',
    unit: 'km/h',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7B0',
    source: 'https://github.com/Ircama/ELM327-emulator — PID 2103 on 7B8 (wheel speed data)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Front-right wheel speed. Assumed at byte 1. See FL Wheel Speed notes.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return b[1] * 1.28;
    },
  },
  {
    pid: '2103',
    name: 'RL Wheel Speed',
    unit: 'km/h',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7B0',
    source: 'https://github.com/Ircama/ELM327-emulator — PID 2103 on 7B8 (wheel speed data)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Rear-left wheel speed. Assumed at byte 2. See FL Wheel Speed notes.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 3) return null;
      return b[2] * 1.28;
    },
  },
  {
    pid: '2103',
    name: 'RR Wheel Speed',
    unit: 'km/h',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7B0',
    source: 'https://github.com/Ircama/ELM327-emulator — PID 2103 on 7B8 (wheel speed data)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Rear-right wheel speed. Assumed at byte 3. See FL Wheel Speed notes.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      return b[3] * 1.28;
    },
  },
  {
    pid: '2101',
    name: 'Brake Pressure',
    unit: 'kPa',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7B0',
    source: 'https://github.com/commaai/opendbc — CAN ID 0x226 BRAKE_PRESSURE (cross-reference)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Master cylinder / brake fluid hydraulic pressure from Skid Control ECU. ' +
      'PLACEHOLDER FORMULA: bytes 0-1 of PID 2101 on 7B0, unsigned 16-bit * 4 kPa. ' +
      'This is an educated guess based on opendbc CAN ID 0x226 having 9-bit brake pressure. ' +
      'The diagnostic response format differs from raw CAN — capture raw response ' +
      'while pressing brake pedal at known force to calibrate. ' +
      'Typical range: 0-25000 kPa (0-250 bar).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 4;
    },
  },

  {
    pid: '2168',
    name: 'Regen Brake Torque',
    unit: 'Nm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — derived from CUSTOM_MG2_TORQ (PID 2168)',
    verified: false,
    notes:
      'Actual regenerative braking torque, derived from MG2 Torque (PID 2168). ' +
      'MG2 torque is negative during regen braking — this PID returns |torque| when ' +
      'MG2 is in regen mode, and 0 when MG2 is in drive mode. ' +
      'Formula: same as MG2 Torque ((A*256+B)/8-4096), but clamp positive to 0 and negate. ' +
      'This is the ACTUAL regen torque being applied to the wheels.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      const torque = ((b[0] * 256) + b[1]) / 8 - 4096;
      return torque < 0 ? -torque : 0;
    },
  },
  // ❌ UNUSED — Commented out (transmission data not displayed in UI)
  {
    pid: '2141',
    name: 'Shift Position',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_SHIFT_J (PID 2141 on 7EA)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Shift joystick position from HV ECU. Multi-byte response encoding P/R/N/D/B. ' +
      'Byte 0 encodes the current position. Typical mapping: ' +
      '0=Unknown, 1=B (engine brake), 2=D (drive), 3=N (neutral), 4=R (reverse), 5=P (park). ' +
      'Mapping may differ — also check PID 2125 bit 7 for Park sensor flag. ' +
      'Returns raw numeric code; UI should map to letter enum.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0];
    },
  },
  {
    pid: '2161',
    name: 'Transaxle Temp (MG1)',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_MG1T (PID 2161 on 7EA)',
    verified: false,
    notes:
      'MG1 (generator) winding temperature from HV ECU. Formula: A - 40. ' +
      'Used as a proxy for transaxle oil temperature since MG1 is submerged in ' +
      'the transaxle fluid. Actual ATF temperature sensor PID is unknown. ' +
      'Range: -40 to +215 °C. Normal operating: 40-80°C, warning >120°C. ' +
      'Single source (ELM327-emulator). Also see PID 2162 (MG2 temp) and ' +
      '2170/2171 (inverter temps) for complete thermal picture.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0] - 40;
    },
  },
  {
    pid: '219B',
    name: 'Drive Mode',
    unit: '',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_ECU_MODE (PID 219B on 7EA)',
    verified: false,
    calibrationNeeded: true,
    notes:
      'HV ECU operating mode. Byte A values: 1=Drive, 2=Offset, 3=ExCharge, 4=Supply. ' +
      'IMPORTANT: This is the ECU internal control mode, NOT the driver-selected mode ' +
      '(Normal/Eco/Power/EV button). The driver mode selector PID is unknown. ' +
      'For driver-selected mode detection, you may need to monitor CAN bus directly ' +
      'or use a different ECU (possibly body ECU 7C0). ' +
      'Returns raw mode number (1-4); same PID as EV Mode Status but parsed for display.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0];
    },
  },
  {
    pid: '2101',
    name: 'TRC Active',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7B0',
    source: 'Inferred from Skid Control ECU diagnostic structure; opendbc VSC1S07 flags',
    verified: false,
    calibrationNeeded: true,
    notes:
      'PLACEHOLDER: Traction Control (TRC) active status from Skid Control ECU. ' +
      'Assumed at a bit flag in PID 2101 response on 7B0. ' +
      'Returns 1 when TRC is actively intervening, 0 otherwise. ' +
      'Byte 6 bit 0 is a guess — capture raw response during wheel spin to identify. ' +
      'opendbc has VSC1S07 message (CAN 0x320) with control flags but diagnostic PID ' +
      'byte mapping differs from CAN layout.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 7) return null;
      return b[6] & 1;
    },
  },
  {
    pid: '2101',
    name: 'VSC Active',
    unit: '',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7B0',
    source: 'Inferred from Skid Control ECU diagnostic structure; opendbc VSC1S07 flags',
    verified: false,
    calibrationNeeded: true,
    notes:
      'PLACEHOLDER: Vehicle Stability Control (VSC) active status from Skid Control ECU. ' +
      'Assumed at byte 6 bit 1 of PID 2101 on 7B0. ' +
      'Returns 1 when VSC is actively intervening, 0 otherwise. ' +
      'See TRC Active notes for calibration guidance.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 7) return null;
      return (b[6] >> 1) & 1;
    },
  },

];

// ── Auto-populate rxHeader from CAN address map ─────────────────────────────
// Each ECU has a fixed response address = request address + 8.
// rxHeader is needed by ATSHManager for CAN receive identification and
// by PIDManager for startup validation.
const activeProfile = VEHICLE_PROFILES[ACTIVE_VEHICLE_PROFILE] || VEHICLE_PROFILES.DEFAULT_TOYOTA_HYBRID;
export const ECU_RX_MAP = Object.values(activeProfile.ecuMap).reduce((acc, ecu) => {
  acc[ecu.tx] = ecu.rx;
  return acc;
}, /** @type {Record<string, string>} */ ({}));

// Source: active profile mapping from config.js VEHICLE_PROFILES.
// If a runtime ECU response uses a different header, PIDManager updates
// pid.rxHeader dynamically as a safety fallback.
for (const pid of TOYOTA_PIDS) {
  if (pid.header && !pid.rxHeader) {
    pid.rxHeader = ECU_RX_MAP[pid.header];
  }

  // Enforce config-level UNVERIFIED registry from Block 4 audit.
  const pidKey = `${pid.header || ''}:${pid.pid}:${pid.name}`;
  if (TOYOTA_UNVERIFIED_PID_KEYS.includes(pidKey)) {
    pid.verified = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PIDs NOT IMPLEMENTED — no verifiable source found
// ══════════════════════════════════════════════════════════════════════════════
//
// The following PIDs were requested but could not be implemented due to
// lack of verifiable PID codes, byte positions, or formulas:
//
//   - A/C Compressor Power (W or %)
//     ECU: 7C4 (HVAC). The HVAC ECU exists and responds to mode 21/22, but
//     no specific PID for compressor power consumption was found in any source.
//     Try: PID 2101 on 7C4 and analyze raw response while toggling A/C.
//
//   - Electric Water Pump Speed (rpm or %)
//     ECU: Unknown (possibly 7E0 or dedicated pump controller).
//     Toyota hybrids use an electric water pump for ICE coolant circulation,
//     but no OBD2 diagnostic PID has been documented.
//
//   - Output Shaft Speed (rpm)
//     ECU: 7E2. In the Toyota e-CVT, there is no traditional output shaft.
//     MG2 RPM is directly proportional to vehicle speed through a fixed
//     reduction gear (ratio ~2.636:1 for Yaris Hybrid). Calculate as:
//     output_shaft_rpm = MG2_RPM / reduction_ratio.
//
//   - Master Cylinder Pressure (kPa) — separate from brake pressure above
//     Some diagnostic definitions distinguish master cylinder pressure from
//     wheel cylinder pressures. The single "Brake Pressure" PID above may
//     map to either. Capture raw data to differentiate.
//
// To implement any of these, use the following procedure:
//   1. Send the candidate PID to the target ECU (e.g., "2101" to 7C4)
//   2. Capture the raw multi-frame response
//   3. Toggle the relevant system (A/C, pump, etc.) and note byte changes
//   4. Derive the formula from observed value ranges
//   5. Add the PID definition with calibrationNeeded: true until confirmed
