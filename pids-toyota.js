import { POLLING } from './config.js';
import {
  ACTIVE_VEHICLE_PROFILE,
  TOYOTA_UNVERIFIED_PID_KEYS,
  VEHICLE_PROFILES,
} from './config.js';

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
 * │ 7E4→7EC  │ Battery  │ HV battery pack management (SOC, temps)       │
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
 * @typedef {import('./pids-standard.js').PIDDefinition} PIDDefinition
 */

// ─── Parse helpers ───────────────────────────────────────────────────────────

/**
 * Extract the application-layer payload from a CAN response.
 * Handles both single-frame and multi-frame ISO 15765-2 (ISO-TP) responses
 * with ATH1 enabled (CAN headers visible in response).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Response format with ATH1 (headers ON):                                │
 * │                                                                        │
 * │ Single frame:                                                          │
 * │   "7EA 05 61 01 AA BB CC DD EE"                                        │
 * │    ─── ── ─────────────────────                                        │
 * │    hdr PCI(SF, len=5) data                                             │
 * │                                                                        │
 * │ Multi-frame:                                                           │
 * │   "7EA 10 13 61 01 AA BB CC DD"   ← First Frame (FF): PCI=10 len=0x013│
 * │   "7EA 21 EE FF GG HH II JJ KK"  ← Consecutive Frame (CF): seq=1     │
 * │   "7EA 22 LL MM NN OO PP QQ RR"  ← Consecutive Frame (CF): seq=2     │
 * │                                                                        │
 * │ PCI byte types (high nibble):                                          │
 * │   0x0n = Single Frame (n = data length)                                │
 * │   0x1n = First Frame (next byte = remaining length)                    │
 * │   0x2n = Consecutive Frame (n = sequence counter 0-F)                  │
 * │   0x3n = Flow Control (not in responses to tester)                     │
 * │                                                                        │
 * │ 3-char hex tokens (e.g. "7EA") are CAN headers — stripped by the       │
 * │ 2-char hex filter. If headers are off (ATH0), line boundaries          │
 * │ separate frames instead.                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @param {string} raw - Cleaned ELM327 response (from _parseResponse).
 * @returns {number[] | null} Reassembled payload bytes (e.g. [0x61, 0x01, 0xAA, ...]).
 */
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

/**
 * Parse helper for Toyota proprietary responses.
 * Extracts the reassembled ISO-TP payload, then skips the mode/PID echo bytes.
 *
 * With ATH1 + CAN auto-formatting, a mode 21 response to PID 2101 produces:
 *   Payload after extractCanPayload: [0x61, 0x01, 0xAA, 0xBB, 0xCC, ...]
 *   After skipping echoBytes=2:      [0xAA, 0xBB, 0xCC, ...]
 *
 * @param {string} raw - Cleaned response.
 * @param {number} echoBytes - Number of echo bytes to skip (2 for mode 21, 3 for mode 22).
 * @returns {number[] | null} Data bytes as integers.
 */
function parseToyotaBytes(raw, echoBytes) {
  const payload = extractCanPayload(raw);
  if (!payload || payload.length <= echoBytes) return null;
  return payload.slice(echoBytes);
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

// ─── Missing PIDs (dashboard requires, not yet discovered) ──────────────────
// TO IMPLEMENT: A/C Compressor Power (W) — ECU 7E0, PID unknown
//   Needed by: FuelConsumptionGauge A/C overlay. Currently simulated by MockEngine.
//   Candidate: Mode 21 PID on HVAC ECU (7E0 or dedicated A/C ECU).
//   Workaround: derive from 12V current spike when A/C clutch engages.

// ─── Toyota Proprietary PIDs ─────────────────────────────────────────────────

/** @type {PIDDefinition[]} */
export const TOYOTA_PIDS = [

  // ══════════════════════════════════════════════════════════════════════════
  // 🔋 HYBRID BATTERY & SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  {
    pid: '2101',
    name: 'HV Battery SOC (HR)',
    unit: '%',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E4',
    source: 'OBD Fusion Toyota Enhanced PID pack; PriusChat community reports',
    verified: false,
    calibrationNeeded: true,
    notes:
      'High-resolution battery SOC from the Battery Management ECU (7E4). ' +
      'Byte 6 of the 2101 response, divided by 2, giving 0.5% resolution. ' +
      'Alternative: standard PID 015B (A*20/51) on any ECU gives ~0.4% resolution. ' +
      'Byte position may vary by model year — capture raw response to confirm.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 7) return null;
      return b[6] / 2;
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
      'Battery pack current from HV ECU. Formula: (A*256+B)/100 - 327.68. ' +
      'Positive = charging (regen), negative = discharging (driving). ' +
      'Range: -327.68 to +327.67 A. Multi-frame response. ' +
      'Also available as PID 218A (CUSTOM_IB) with identical formula. ' +
      'Confirmed header is 7E2 (HV ECU), NOT 7E4 (Battery ECU). ' +
      'If no response on 7E2, try header 7E4 with PID 2101 bytes 2-3.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 100 - 327.68;
    },
  },
  {
    pid: '2101',
    name: 'HV Battery Voltage',
    unit: 'V',
    interval: POLLING.NORMAL,
    protocol: 'toyota',
    header: '7E4',
    source: 'OBD Fusion Toyota Enhanced PID pack; PriusChat community reports',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Total HV battery pack voltage from Battery ECU (7E4). ' +
      'Bytes 0-1 of 2101 response, divided by 2. Range: 0-327.67 V. ' +
      'Alternative on 7E2: PID 2181 gives individual block voltage with ' +
      'formula (A*256+B)*79.99/65535 — but that is per-block, not total pack. ' +
      'Capture raw response and compare with known pack voltage (~200V nominal) to verify.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 2;
    },
  },
  {
    pid: '2187',
    name: 'HV Batt Temp 1 (Intake)',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E2',
    source: 'https://github.com/Ircama/ELM327-emulator — CUSTOM_TB_INTAKE (PID 2187 on 7EA)',
    verified: false,
    notes:
      'HV battery intake air temperature from HV ECU. ' +
      'Formula: (A*256+B)*255.9/65535 - 50. Range: -50 to +205.9 °C. ' +
      'This is the air temperature entering the battery pack cooling duct, ' +
      'not an individual cell temperature. Single source (ELM327-emulator).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 255.9 / 65535 - 50;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp 2',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    source: 'OBD Fusion Toyota Enhanced PID pack; community reverse-engineering',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Battery module temperature sensor 2 from Battery ECU (7E4). ' +
      'Assumed at byte 3 of PID 2103 response, offset -40. ' +
      'Toyota packs typically have 3-4 NTC sensors across modules. ' +
      'Byte position is unverified — capture raw 2103 response on 7E4 to confirm.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      return b[3] - 40;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp 3',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    source: 'OBD Fusion Toyota Enhanced PID pack; community reverse-engineering',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Battery module temperature sensor 3. Assumed at byte 4 of PID 2103, offset -40. ' +
      'See HV Batt Temp 2 notes for verification guidance.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 5) return null;
      return b[4] - 40;
    },
  },
  {
    pid: '2103',
    name: 'HV Batt Temp 4',
    unit: '\u00B0C',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7E4',
    source: 'OBD Fusion Toyota Enhanced PID pack; community reverse-engineering',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Battery module temperature sensor 4. Assumed at byte 5 of PID 2103, offset -40. ' +
      'See HV Batt Temp 2 notes for verification guidance.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 6) return null;
      return b[5] - 40;
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
      'This is NOT a direct "EV mode" flag — it is the ECU control state. ' +
      'To detect true EV driving, combine this with engine RPM = 0. ' +
      'Returns raw mode number (1-4); UI should interpret the value.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0];
    },
  },
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
      'MG2 (drive motor) rotational speed from HV ECU. Signed 16-bit at bytes 2-3. ' +
      'MG2 is the traction motor connected to the wheels through the reduction gear. ' +
      'Proportional to vehicle speed (MG2_RPM ≈ speed_kmh * ~70). ' +
      'See MG1 RPM notes for verification guidance.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 4) return null;
      return signed16(b[2], b[3]);
    },
  },
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
      'MG2 (drive motor) torque from HV ECU. Formula: (A*256+B)/8 - 4096. ' +
      'Positive = propulsion, negative = regenerative braking. ' +
      'Confirmed by ELM327-emulator and PriusChat. ' +
      'When value is negative and brakes are applied, this IS the actual regen torque.',
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
      'Injector volume from Engine ECU. Formula: (A*256+B)*2.047/65535 mL per injection. ' +
      'Multiply by RPM and cylinder count to get instantaneous consumption rate. ' +
      'Alternative: standard PID 015E gives fuel rate in L/h directly. ' +
      'This Toyota PID gives raw injection volume which is useful for precise calculation ' +
      'but requires additional math for L/100km display. ' +
      'Single source (ELM327-emulator) — formula may need vehicle calibration.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) * 2.047 / 65535;
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ⚡ ENERGY & CONSUMPTION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 12V system voltage is covered by standard PID 0142 in pids-standard.js.
  // The PIDs below provide additional Toyota-specific energy parameters.

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
      'Front-left wheel speed from Skid Control ECU (ABS). ' +
      'Assumed at byte 0 of PID 2103 response. Formula: A * 1.28 (32/25). ' +
      'Range: 0-326 km/h. The ELM327-emulator confirms PID 2103 on 7B0 for ' +
      'wheel speed but lists only "FR Wheel Speed". Byte ordering (FL/FR/RL/RR) ' +
      'may not match assumption — capture raw response and compare with GPS speed ' +
      'while turning to identify each wheel. ' +
      'Alternative: opendbc CAN ID 0xAA uses 15-bit values with factor 0.01 offset -67.67.',
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
  {
    pid: '2101',
    name: 'Regen Torque Request',
    unit: 'Nm',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7B0',
    source: 'No single verifiable source — inferred from Skid Control ECU diagnostic structure',
    verified: false,
    calibrationNeeded: true,
    notes:
      'PLACEHOLDER: Requested regenerative brake torque from Skid Control ECU. ' +
      'The brake ECU calculates how much regen to request from the HV ECU based on ' +
      'brake pedal position. No verified PID/byte position available. ' +
      'Bytes 4-5 of PID 2101 on 7B0 is an educated guess. ' +
      'Capture raw response while braking at various intensities to locate this value. ' +
      'Compare against actual regen torque (MG2 Torque negative) to verify.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 6) return null;
      return ((b[4] * 256) + b[5]) / 8;
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // 🔧 TRANSMISSION & TRACTION
  // ══════════════════════════════════════════════════════════════════════════

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
