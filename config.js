/**
 * Application configuration constants.
 * Adjust BLE UUIDs here if defaults don't match your adapter.
 * Use nRF Connect to discover the correct values.
 */

/**
 * Transport mode. Controls which data pipeline is used on boot.
 *
 *   'ble'    — Real Web Bluetooth → ELM327 → OBD2 pipeline (requires hardware)
 *   'mock'   — Simulated data from MockEngine; no hardware needed
 *   'serial' — Reserved for future Web Serial support
 *
 * Change to 'ble' before connecting to a real vehicle.
 * The mock files are loaded via dynamic import and are excluded from
 * production bundles when this is set to 'ble'.
 */
export const TRANSPORT_MODE = 'mock'; // 'ble' | 'serial' | 'mock'

// BLE GATT profiles for known OBD2 adapters (VLinker, ELM327, HM-10)
export const BLE_PROFILES = [
  {
    name: 'VLinker / iCar BLE (18F0 profile)',
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    write: '00002af1-0000-1000-8000-00805f9b34fb',
    notify: '00002af0-0000-1000-8000-00805f9b34fb',
    // Source: https://raw.githubusercontent.com/kotchasaan/Ford_OBD2_Smart_Gauge/v1.1/ble_handler.cpp
    // (community code path for IOS-Vlink/Vgate with 18F0 + 2AF0/2AF1)
    namePrefix: ['IOS-Vlink', 'vLinker MC-IOS', 'vLinker MC-Android', 'vLinker', 'V-LINK'],
  },
  {
    name: 'VLinker / iCar BLE (E781 single-char profile)',
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    notify: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    // Source: https://stackoverflow.com/questions/42570070/how-to-use-ble-obdii-peripheral
    // (IOS-Vlink example: service E781... + characteristic BEF8..., write+notify on same char)
    namePrefix: ['IOS-Vlink', 'Android-Vlink', 'V-LINK', 'VLINK', 'vLinker'],
  },
  {
    name: 'Generic ELM327 (FFF0)',
    service: 0xfff0,
    write: 0xfff2,
    notify: 0xfff1,
    namePrefix: ['OBDII', 'OBD', 'ELM327', 'OBD2'],
  },
  {
    name: 'HM-10 Module (FFE0)',
    service: 0xffe0,
    write: 0xffe1,
    notify: 0xffe1, // single bidirectional characteristic
    namePrefix: ['BLE-OBD', 'HM-10'],
  },
];

/** Legacy fallback — points to the first profile (VLinker MC+) */
export const BLE = {
  SERVICE_UUID: BLE_PROFILES[0].service,
  WRITE_CHARACTERISTIC_UUID: BLE_PROFILES[0].write,
  NOTIFY_CHARACTERISTIC_UUID: BLE_PROFILES[0].notify,
};

/** ELM327 protocol settings */
export const ELM327 = {
  // Init commands: ATZ reset, ATE0 echo off, ATL0 no linefeeds, ATS1 spaces on,
  // ATH1 headers on, ATSP0 auto-protocol, ATDP display protocol, ATAL long msgs, ATAT2 adaptive timing
  INIT_SEQUENCE: ['ATZ', 'ATE0', 'ATL0', 'ATS1', 'ATH1', 'ATSP0', 'ATDP', 'ATAL', 'ATAT2'],
  /** Delay in ms after ATZ reset before sending next command */
  RESET_DELAY_MS: 1500,
  /** Default timeout in ms waiting for a command response */
  COMMAND_TIMEOUT_MS: 2000,
  /** Max retries per command on timeout or transient error */
  MAX_RETRIES: 2,
  // Response timeout: 0x19 = 25 ticks = 102.4 ms (vs default 0x32 = 204.8 ms)
  POLL_TIMEOUT_TICKS: '19',
  // Warn when ISO-TP multi-frame response is truncated
  TRUNCATION_CHECK: true,
  /** Line terminator sent after every command */
  TERMINATOR: '\r',
};

// Polling speed tiers (ms): FAST=180, NORMAL=500, SLOW=3500
export const POLLING = {
  FAST: 180,
  NORMAL: 500,
  SLOW: 3500,
  PROFILE: 'ui',
};

/** Data store settings */
export const STORE = {
  /** How many seconds of history to keep per PID */
  HISTORY_SECONDS: 60,
};

/** UI settings */
export const UI = {
  /** Max lines shown in the raw log panel */
  LOG_LINES: 20,
};

// Vehicle-specific ECU addressing profiles (used for Toyota PID routing)
//
// BATTERY ECU address correction (2026-03-06):
//   All Toyota THS-II platforms place the Battery ECU at 7E3 → 7EB.
//   7E4 is NOT used by any production Toyota hybrid.
//   Sources:
//     - Ircama/ELM327-emulator: ECU_ADDR_B = "7E3" (Toyota Auris Hybrid)
//     - eaa-phev.org Gen2 Prius real captures: battery requests to 07E3h, responses from 07EBh
//   The NHP130 bipolar NiMH architecture may integrate BMS into the HV-ECU (7E2) with
//   no separate 7E3 node — probe by sending ATSH 7E3 / 2100 and checking for 7EB response.
export const VEHICLE_PROFILES = {
  DEFAULT_TOYOTA_HYBRID: {
    id: 'DEFAULT_TOYOTA_HYBRID',
    name: 'Toyota Hybrid (generic)',
    ecuMap: {
      ENGINE: { tx: '7E0', rx: '7E8', verified: true },
      HV_ECU: { tx: '7E2', rx: '7EA', verified: true },
      // 7E3 → 7EB: documented Battery ECU address for Toyota THS-II
      // (was incorrectly 7E4/7EC — no Toyota hybrid uses 7E4 for BMS)
      BATTERY: { tx: '7E3', rx: '7EB', verified: false },
      ABS_SKID: { tx: '7B0', rx: '7B8', verified: true },
      // 7C0: ICE/instrument ECU — fuel tank level (PID 2129), A/C set temps at adjacent 7C4
      // Source: Ircama/ELM327-emulator ECU_ADDR_I = "7C0", ECU_R_ADDR_I = "7C8"
      ICE_ECU:  { tx: '7C0', rx: '7C8', verified: true },
    },
  },
  NHP130: {
    id: 'NHP130',
    name: 'Toyota Aqua/Yaris Hybrid NHP130',
    ecuMap: {
      ENGINE: { tx: '7E0', rx: '7E8', verified: true },
      HV_ECU: { tx: '7E2', rx: '7EA', verified: true },
      // 7E3 → 7EB: corrected Battery ECU address (was 7E4/7EC — wrong for all Toyota THS-II).
      // NHP130 uses a bipolar NiMH pack where BMS may be integrated into HV-ECU (7E2);
      // test by probing 7E3 / PID 2100. If 7EB responds, a separate Battery ECU is present.
      BATTERY: { tx: '7E3', rx: '7EB', verified: false },
      ABS_SKID: { tx: '7B0', rx: '7B8', verified: true },
      // 7C0: ICE/instrument ECU — fuel tank level (PID 2129), A/C set temps at adjacent 7C4
      // Source: Ircama/ELM327-emulator ECU_ADDR_I = "7C0", ECU_R_ADDR_I = "7C8"
      ICE_ECU:  { tx: '7C0', rx: '7C8', verified: true },
    },
  },
};

/** Active vehicle profile used by Toyota proprietary PID routing. */
export const ACTIVE_VEHICLE_PROFILE = 'NHP130';

/**
 * Block 4 audit registry (source-backed verification status for Toyota enhanced PIDs).
 *
 * If a PID key is listed here, it is forced to UNVERIFIED at runtime metadata level,
 * even if a local definition was previously marked verified.
 */
export const TOYOTA_UNVERIFIED_PID_KEYS = [
  '7E2:2167:MG1 Torque',
  '7E2:2168:MG2 Torque',
  '7E2:2168:Regen Brake Torque',
];
