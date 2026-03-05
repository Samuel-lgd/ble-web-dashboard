/**
 * Maps the internal simulation state to store.update() calls.
 * Uses exactly the same PID key strings as PIDManager — the UI layer
 * cannot distinguish mock data from real OBD2 data.
 *
 * Responsibilities:
 *   1. Register all PID keys at construction time (so DashboardContext
 *      can build its Toyota name map on first render).
 *   2. On each simulation tick, write every PID value to the store.
 */

import { PID_KEYS } from '../pid-keys.js';

export class MockStoreBridge {
  /**
   * @param {import('../../store.js').Store} store
   */
  constructor(store) {
    this._store = store;
    this._registerAll();
  }

  /** Register every known PID key so the store is ready before first tick. */
  _registerAll() {
    for (const key of Object.values(PID_KEYS)) {
      this._store.register(key);
    }
  }

  /**
   * Write all simulation state values to the store.
   * Called on every simulation tick.
   * @param {object} s - Current simulation state from MockEngine.
   */
  update(s) {
    const { _store: store } = this;
    const u = (key, value) => store.update(key, value);

    // ── Standard OBD2 PIDs ──────────────────────────────────────────────────
    u(PID_KEYS.ENGINE_RPM,         s.engineRpm);
    u(PID_KEYS.ENGINE_LOAD,        s.engineOn ? Math.min(100, (s.engineRpm / 5800) * s.throttlePercent) : 0);
    u(PID_KEYS.VEHICLE_SPEED,      s.speedKmh);
    u(PID_KEYS.COOLANT_TEMP,       s.coolantTempC);
    u(PID_KEYS.INTAKE_AIR_TEMP,    s.intakeTempC);
    u(PID_KEYS.THROTTLE_POSITION,  s.throttlePercent);
    u(PID_KEYS.HYBRID_BATTERY_SOC, s.hvSocPercent);
    u(PID_KEYS.ENGINE_OIL_TEMP,    s.oilTempC);
    u(PID_KEYS.FUEL_RATE,          s.fuelRateLh);
    // Absolute Load approximates throttle position for standard OBD2
    u(PID_KEYS.ABSOLUTE_LOAD,      s.throttlePercent);
    u(PID_KEYS.AMBIENT_AIR_TEMP,   s.ambientTempC);
    // Accel pedal tracks throttle (same signal in sim)
    u(PID_KEYS.ACCEL_PEDAL_POS,    s.throttlePercent);
    // 12V system: nominal 14.2V when engine on, 12.4V otherwise
    u(PID_KEYS.VOLTAGE_12V,        s.engineOn ? 14.2 : 12.4);

    // ── Toyota HV Battery (7E4) ─────────────────────────────────────────────
    u(PID_KEYS.HV_BATTERY_SOC_HR,  s.hvSocPercent);
    u(PID_KEYS.HV_BATTERY_VOLTAGE, s.hvVoltageV);
    // Simulate 3-4 temp sensors with slight spread around hvBatteryTempC
    u(PID_KEYS.HV_BATT_TEMP_2,     s.hvBatteryTempC + 0.5);
    u(PID_KEYS.HV_BATT_TEMP_3,     s.hvBatteryTempC - 0.3);
    u(PID_KEYS.HV_BATT_TEMP_4,     s.hvBatteryTempC + 0.8);

    // ── Toyota HV Battery / System (7E2) ────────────────────────────────────
    u(PID_KEYS.HV_BATTERY_CURRENT, s.hvCurrentA);
    u(PID_KEYS.HV_BATT_TEMP_INTAKE, s.hvBatteryTempC);
    // EV Mode Status: 1=Drive/EV, 2=Offset (engine charging)
    u(PID_KEYS.EV_MODE_STATUS,     s.engineOn ? 2 : 1);
    u(PID_KEYS.DRIVE_MODE,         s.engineOn ? 2 : 1);
    // HV Ready: 1 when HV system is energised (READY light)
    u(PID_KEYS.HV_READY,           s.speedKmh > 0 || s.engineOn ? 1 : 0);
    // Battery fan: on when battery temp > 30°C
    u(PID_KEYS.HV_BATT_FAN_SPEED,  s.hvBatteryTempC > 30 ? Math.min(100, (s.hvBatteryTempC - 30) * 5) : 0);

    // ── Toyota Motor / Generator (7E2) ──────────────────────────────────────
    u(PID_KEYS.MG1_RPM,             s.mg1Rpm);
    u(PID_KEYS.MG2_RPM,             s.mg2Rpm);
    u(PID_KEYS.MG1_TORQUE,          s.mg1TorqueNm);
    u(PID_KEYS.MG2_TORQUE,          s.mg2TorqueNm);
    // Regen Brake Torque = |MG2 torque| when MG2 is in regen (negative torque)
    u(PID_KEYS.REGEN_BRAKE_TORQUE,  s.mg2TorqueNm < 0 ? -s.mg2TorqueNm : 0);

    // ── Toyota Engine Thermal (7E0) ─────────────────────────────────────────
    u(PID_KEYS.COOLANT_TEMP_HR,    s.coolantTempC);
    u(PID_KEYS.FUEL_CONSUMPTION,   s.injectorVolumeMl);

    // ── Toyota Energy (7E2) ─────────────────────────────────────────────────
    // DC-DC converter duty: proportional to 12V load (rough approximation)
    u(PID_KEYS.DCDC_CONV_DUTY,     s.engineOn ? 45 : 20);
    // 12V battery current: small charge when engine on
    u(PID_KEYS.BATTERY_12V_CURRENT, s.engineOn ? 4.5 : 0.2);

    // ── Toyota Vehicle Dynamics — Wheel Speeds (7B0) ────────────────────────
    // All four wheels at vehicle speed (no wheel-speed difference in sim)
    u(PID_KEYS.FL_WHEEL_SPEED, s.speedKmh);
    u(PID_KEYS.FR_WHEEL_SPEED, s.speedKmh);
    u(PID_KEYS.RL_WHEEL_SPEED, s.speedKmh);
    u(PID_KEYS.RR_WHEEL_SPEED, s.speedKmh);

    // Brake Pressure (kPa): ~1000 kPa per bar
    u(PID_KEYS.BRAKE_PRESSURE,       s.brakePressureBar * 1000);
    // Regen Torque Request: proportional to brake pressure when regen is active
    u(PID_KEYS.REGEN_TORQUE_REQUEST, s.regenTorqueNm);
    // TRC / VSC: not active in normal simulation
    u(PID_KEYS.TRC_ACTIVE, 0);
    u(PID_KEYS.VSC_ACTIVE, 0);

    // ── Toyota Transmission (7E2) ───────────────────────────────────────────
    u(PID_KEYS.SHIFT_POSITION,    s.shiftPosition);
    // Transaxle temp (MG1 winding) correlates with oil temp
    u(PID_KEYS.TRANSAXLE_TEMP_MG1, s.oilTempC + 5);

    // ── A/C System ─────────────────────────────────────────────────────────
    u(PID_KEYS.AC_COMPRESSOR_POWER, s.acOn ? (s.acPowerW ?? 1200) : 0);
  }
}
