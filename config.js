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

/** BLE GATT service and characteristic UUIDs for ELM327-based adapters */
export const BLE = {
  /** Primary GATT service UUID (Vlinker MC+ default: 0xFFF0) */
  SERVICE_UUID: 0xfff0,
  /** Write characteristic UUID — send AT/OBD commands here */
  WRITE_CHARACTERISTIC_UUID: 0xfff2,
  /** Notify characteristic UUID — receive responses here */
  NOTIFY_CHARACTERISTIC_UUID: 0xfff1,
};

/** ELM327 protocol settings */
export const ELM327 = {
  /** Initialization commands sent in order after connection */
  INIT_SEQUENCE: ['ATZ', 'ATE0', 'ATH0', 'ATSP0', 'ATL0', 'ATAT1'],
  /** Delay in ms after ATZ reset before sending next command */
  RESET_DELAY_MS: 1500,
  /** Default timeout in ms waiting for a command response */
  COMMAND_TIMEOUT_MS: 2000,
  /** Max retries per command on timeout or transient error */
  MAX_RETRIES: 2,
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
