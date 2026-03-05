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

/**
 * BLE GATT profiles for known OBD2 adapters.
 *
 * VLinker MC+ (VGATE, STN2120 chipset):
 *   Uses a single bidirectional characteristic (Write-Without-Response + Notify).
 *   BLE name broadcast: "V-LINK" (also "IOS-Vlink", "Android-Vlink").
 *   Confirmed via nRF Connect scans and community reverse-engineering.
 *
 * Generic ELM327 BLE clone (FFF0 profile):
 *   Common Chinese clones using 0xFFF0 service with separate write/notify chars.
 *
 * HM-10 module (FFE0 profile):
 *   Some adapters use the TI CC254x HM-10 serial profile with a single
 *   bidirectional characteristic on 0xFFE0/0xFFE1.
 *
 * Sources:
 *   - ScanTool.net OBDLink Family Reference & Programming Manual (STN chipset docs)
 *   - Community nRF Connect scan reports for VLinker MC+ V2.2
 *   - ELM327 BLE adapter reverse-engineering (multiple GitHub projects)
 */
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
  /**
   * Initialization commands sent in order after connection.
   *
  * ATH1  — Headers ON. Required for Toyota proprietary PIDs where the
   *          ECU address (7EA, 7EC, 7E8…) must be visible to route and parse
   *          responses correctly. With CAN (ISO 15765), ATH1 prepends the
   *          3-hex-char CAN ID and the PCI byte to each frame.
  * ATS1  — Spaces ON. Keeps byte tokenization deterministic for parsers that
  *          split by hex-byte tokens.
   * ATSP0 — Auto-detect protocol (ISO 15765-4 CAN 11-bit or 29-bit, 500K or 250K).
  * ATDP  — Display currently detected protocol string.
  *          If ATDP reports a CAN variant, lock it with ATSP6/7/8/9 to avoid
  *          silent protocol drift across reconnects.
   * ATAL  — Allow Long messages (>7 bytes). Required for ISO-TP multi-frame
   *          responses from Toyota proprietary PIDs. Without this, responses
   *          longer than 7 data bytes may be silently truncated by the adapter.
   * ATAT2 — Adaptive Timing level 2. More aggressive timing than ATAT1,
   *          reduces inter-byte delays for faster polling while still adapting
   *          to ECU response speed. Safe for STN2120 (VLinker MC+).
   */
  // Sources:
  // - ATSP protocol mapping 0..9 + ATDP examples: https://obdtester.com/elm-usb-commands
  // - ATS0/ATS1 and ATCAF behavior references: https://github.com/Ircama/ELM327-emulator
  INIT_SEQUENCE: ['ATZ', 'ATE0', 'ATL0', 'ATS1', 'ATH1', 'ATSP0', 'ATDP', 'ATAL', 'ATAT2'],
  /** Delay in ms after ATZ reset before sending next command */
  RESET_DELAY_MS: 1500,
  /** Default timeout in ms waiting for a command response */
  COMMAND_TIMEOUT_MS: 2000,
  /** Max retries per command on timeout or transient error */
  MAX_RETRIES: 2,
  /** Log a warning when a multi-frame ISO-TP response is truncated
   *  (fewer consecutive frames than declared in the First Frame). */
  TRUNCATION_CHECK: true,
  /** Line terminator sent after every command */
  TERMINATOR: '\r',
};

/** Polling speed tiers in milliseconds */
export const POLLING = {
  FAST: 500,
  NORMAL: 1000,
  SLOW: 5000,
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

/**
 * Vehicle-specific diagnostic addressing profiles.
 *
 * Source A (Toyota ecosystem):
 * https://github.com/commaai/opendbc/blob/master/opendbc/car/toyota/fingerprints.py
 * - Repeatedly shows engine on 0x7E0 (and legacy 0x700), ABS on 0x7B0.
 *
 * Source B (Toyota hybrid diagnostics emulator):
 * https://github.com/Ircama/ELM327-emulator/blob/master/elm/obd_message.py
 * - Defines HV ECU 7E2->7EA, Engine 7E0->7E8, Skid 7B0->7B8.
 *
 * NHP130 battery ECU pair 7E4->7EC remains UNVERIFIED from primary OEM docs.
 * Dynamic fallback in PIDManager updates rxHeader when runtime response header differs.
 */
export const VEHICLE_PROFILES = {
  DEFAULT_TOYOTA_HYBRID: {
    id: 'DEFAULT_TOYOTA_HYBRID',
    name: 'Toyota Hybrid (generic)',
    ecuMap: {
      ENGINE: { tx: '7E0', rx: '7E8', verified: true },
      HV_ECU: { tx: '7E2', rx: '7EA', verified: true },
      BATTERY: { tx: '7E4', rx: '7EC', verified: false },
      ABS_SKID: { tx: '7B0', rx: '7B8', verified: true },
    },
  },
  NHP130: {
    id: 'NHP130',
    name: 'Toyota Yaris Hybrid NHP130',
    ecuMap: {
      ENGINE: { tx: '7E0', rx: '7E8', verified: true },
      HV_ECU: { tx: '7E2', rx: '7EA', verified: true },
      BATTERY: { tx: '7E4', rx: '7EC', verified: false },
      ABS_SKID: { tx: '7B0', rx: '7B8', verified: true },
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
