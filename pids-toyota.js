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
 * @typedef {import('./pids-standard.js').PIDDefinition} PIDDefinition
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

  /*
  // ❌ DISABLED — 7E4 is not a valid diagnostic node on Toyota THS-II / NHP130.
  //
  // ROOT CAUSE: The Toyota Battery ECU (BMS) is at address 7E3 → 7EB on all documented
  // Toyota THS-II platforms, not 7E4. No Toyota hybrid uses 7E4 for BMS.
  // Sources:
  //   - Ircama/ELM327-emulator: ECU_ADDR_B = "7E3" (Toyota Auris Hybrid, elm/obd_message.py)
  //   - eaa-phev.org Prius Gen2 real CAN captures: battery requests 07E3h → responses 07EBh
  //
  // NHP130 additional note: The second-generation Aqua uses a bipolar NiMH pack whose
  // cell-balancing is inherently passive. Toyota may have integrated the BMS logic into
  // the HV-ECU (7E2) rather than a dedicated 7E3 node. To test:
  //   1. ATSH 7E3 → send "2100" → check if 7EB responds with a PID support bitmap.
  //   2. If it does, uncomment and use the 7E3 PID block below.
  //   3. If it returns NO DATA, the BMS is integrated into 7E2 and no separate SOC
  //      PID is needed — standard PID 015B (Hybrid Battery SOC) is answered by the
  //      HV-ECU at 7E2 via functional broadcast and provides an adequate reading.
  //
  // See also: standard PID 015B (currently active) which provides hybrid SOC at 0.4%
  // resolution without requiring a header switch. Formula: A * 100 / 255.
  {
    pid: '2101',
    name: 'HV Battery SOC (HR)',
    unit: '%',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E3',
    source: 'Community hypothesis — PID 2101 byte 6 on 7E3; eaa-phev.org Prius Gen2 data shows Battery ECU at 7E3.',
    verified: false,
    calibrationNeeded: true,
    notes:
      'High-res SOC from Battery ECU (7E3 → 7EB). Byte 6 / 2 = 0.5% resolution. ' +
      'Byte offset is unconfirmed for NHP130 — capture full 2101 response from 7EB ' +
      'and compare against standard PID 015B reading to identify the SOC byte. ' +
      'Moved from 7E4 (wrong address — no Toyota hybrid uses 7E4 for BMS).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 7) return null;
      return b[6] / 2;
    },
  },
  */
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
  /*
  // ❌ DISABLED — 7E4 is not a valid diagnostic node on Toyota THS-II / NHP130.
  // See HV Battery SOC (HR) comment block above for full root-cause analysis and
  // probe instructions. Uncomment when 7E3 / 7EB is confirmed to respond.
  //
  // If 7E3 does not respond on NHP130, battery pack voltage can be inferred as:
  //   power_W  = HV Battery Current (PID 2198 on 7E2) × nominal_pack_voltage
  // Toyota NHP10/NHP130 NiMH pack nominal: ~201.6 V (168 cells × 1.2 V)
  // No reliable single-shot voltage PID has been found for 7E2 on compact Toyota hybrids.
  // Absence from all documented THS-II OBD2 captures (Auris emulator, Prius eaa-phev data)
  // excludes PIDs 21B3 and 21B6 as likely candidates despite community rumour.
  {
    pid: '2101',
    name: 'HV Battery Voltage',
    unit: 'V',
    interval: POLLING.FAST,
    protocol: 'toyota',
    header: '7E3',
    source: 'Community hypothesis — PID 2101 bytes 0-1 on 7E3; eaa-phev.org Prius Gen2 data shows Battery ECU at 7E3.',
    verified: false,
    calibrationNeeded: true,
    notes:
      'Total HV pack voltage from Battery ECU (7E3 → 7EB). Bytes 0-1 / 2 = 0-327.67 V. ' +
      'Byte offset is unconfirmed for NHP130 — capture raw 2101 response from 7EB. ' +
      'Toyota NHP10/NHP130 NiMH pack: ~201.6 V nominal (168 cells × 1.2 V). ' +
      'Moved from 7E4 (wrong address — no Toyota hybrid uses 7E4 for BMS).',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 2) return null;
      return ((b[0] * 256) + b[1]) / 2;
    },
  },
  */
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
  /*
  // ❌ UNUSED — Commented out to reduce polling overhead
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
  */
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
  /*
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
  */

  // ══════════════════════════════════════════════════════════════════════════
  // ⚙️ MOTOR / GENERATOR (MG1 & MG2)
  // ══════════════════════════════════════════════════════════════════════════

  /*
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
  */
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
  /*
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
  */
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

  /*
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
  */

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
    pid: '2129',
    name: 'Fuel Tank Level',
    unit: 'L',
    interval: POLLING.SLOW,
    protocol: 'toyota',
    header: '7C0',
    source: 'Ircama/ELM327-emulator obd_message.py L3323–3346 — CUSTOM_FUEL_LEVEL (Toyota Auris Hybrid real-capture)',
    verified: true,
    notes:
      'Fuel tank level in Liters from ICE/instrument ECU (7C0 → 7C8). ' +
      'Response frame: "7C8 03 61 29 [A]". Formula: A / 2. Range: 0–50 L. ' +
      'NHP130 Aqua Gen2 tank capacity: 36 L. ' +
      'README validation: ATSH 7C0 → 2129 → 7C8 03 61 29 1F → 31/2 = 15.5 L ✓. ' +
      '⚠ PID collision: same bytes 2129 sent to 7C4 (A/C ECU) return driver set-temperature — ' +
      'ATSH 7C0 must be set before every poll.',
    parse(raw) {
      const b = parseToyotaBytes(raw, 2);
      if (!b || b.length < 1) return null;
      return b[0] / 2;
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
  // ⚡ ENERGY & CONSUMPTION
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 12V system voltage is covered by standard PID 0142 in pids-standard.js.
  // The PIDs below provide additional Toyota-specific energy parameters.

  /*
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
  */

  // ══════════════════════════════════════════════════════════════════════════
  // 🚗 VEHICLE DYNAMICS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Vehicle speed and accelerator pedal position are covered by standard PIDs
  // 010D and 0149 in pids-standard.js.

  /*
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
  */
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
  /*
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
  */
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
