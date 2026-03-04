/**
 * Pure physics simulation functions for the mock engine.
 * No side effects — all functions take state and return computed values.
 * Use noise() instead of Math.random() directly so tests can stub it.
 */

// ─── Noise & Utilities ────────────────────────────────────────────────────────

/**
 * Add normally-distributed noise to a value.
 * Uses Box-Muller transform for Gaussian noise.
 * @param {number} value - Base value.
 * @param {number} percent - Max noise as a percentage of value (e.g., 0.02 = ±2%).
 * @returns {number}
 */
export function noise(value, percent) {
  // Box-Muller: two uniform → one Gaussian (σ≈1)
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  // Scale to ±(percent * |value|), clamp gaussian to ±2σ
  const delta = value * percent * Math.max(-2, Math.min(2, z)) * 0.5;
  return value + delta;
}

/**
 * Clamp a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linearly interpolate toward target by a fixed step per second.
 * @param {number} current
 * @param {number} target
 * @param {number} ratePerSec - Max change per second.
 * @param {number} dtSec - Elapsed time in seconds.
 * @returns {number}
 */
export function lerp(current, target, ratePerSec, dtSec) {
  const maxStep = ratePerSec * dtSec;
  const diff = target - current;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

// ─── Speed & Acceleration ─────────────────────────────────────────────────────

/**
 * Update vehicle speed, interpolating toward target at realistic acceleration.
 * @param {number} current - Current speed km/h.
 * @param {number} target - Target speed km/h.
 * @param {number} throttle - Throttle 0-100%.
 * @param {boolean} braking - True if brake is applied.
 * @param {number} dtSec - Tick size in seconds.
 * @returns {{ speed: number, acceleration: number }}
 */
export function computeSpeed(current, target, throttle, braking, dtSec) {
  let accelMs2;
  if (braking) {
    // Hard braking: decelerate quickly
    accelMs2 = -3.0;
  } else if (target > current) {
    // Accelerating — rate proportional to throttle
    accelMs2 = clamp((throttle / 100) * 2.5, 0.3, 3.0);
  } else {
    // Decelerating / coasting
    accelMs2 = clamp((throttle / 100) * -1.5, -2.0, -0.1);
  }

  // Convert m/s² to km/h per second, apply
  const deltaKmhPerSec = accelMs2 * 3.6;
  let newSpeed = current + deltaKmhPerSec * dtSec;
  newSpeed = clamp(newSpeed, 0, 200);

  // Snap to zero if near target and target is 0
  if (target === 0 && newSpeed < 0.5) newSpeed = 0;

  return {
    speed: newSpeed,
    acceleration: accelMs2,
  };
}

// ─── Engine State ─────────────────────────────────────────────────────────────

/**
 * Decide whether the hybrid engine should be running, based on driving conditions.
 * Implements Toyota THS-II hybrid logic approximation.
 * @param {boolean} currentlyOn
 * @param {number} speedKmh
 * @param {number} socPercent
 * @param {number} throttle
 * @param {'off'|'starting'|'on'|null} forcedState - Waypoint override.
 * @returns {boolean}
 */
export function shouldEngineBeOn(currentlyOn, speedKmh, socPercent, throttle, forcedState) {
  if (forcedState === 'off') return false;
  if (forcedState === 'starting' || forcedState === 'on') return true;

  // Turn OFF when: low speed + high SOC + light throttle
  if (currentlyOn && speedKmh < 50 && socPercent > 45 && throttle < 30) return false;
  if (currentlyOn && speedKmh === 0 && socPercent > 48) return false;

  // Turn ON when: high speed or low SOC or heavy throttle
  if (!currentlyOn && (speedKmh > 60 || socPercent < 42 || throttle > 60)) return true;

  return currentlyOn;
}

/**
 * Compute engine RPM from speed and throttle.
 * @param {number} speedKmh
 * @param {number} throttle - 0-100%.
 * @param {boolean} engineOn
 * @param {number} startupProgress - 0-1, used during engine start surge.
 * @returns {number}
 */
export function computeEngineRpm(speedKmh, throttle, engineOn, startupProgress) {
  if (!engineOn) return 0;

  let rpm;
  if (speedKmh < 5) {
    // Idle
    rpm = 750 + throttle * 5;
    // Startup surge: 800 → 1200 → settle
    if (startupProgress < 1) {
      const surge = Math.sin(startupProgress * Math.PI) * 400;
      rpm += surge;
    }
  } else {
    rpm = speedKmh * 30 + throttle * 20;
  }

  return noise(clamp(rpm, 700, 7000), 0.02);
}

// ─── Fuel Rate ────────────────────────────────────────────────────────────────

/**
 * Compute instantaneous fuel consumption.
 * @param {boolean} engineOn
 * @param {number} speedKmh
 * @param {number} throttle - 0-100%.
 * @returns {number} Fuel rate in L/h.
 */
export function computeFuelRate(engineOn, speedKmh, throttle) {
  if (!engineOn) return 0;
  if (speedKmh < 3) {
    // Idle
    return noise(0.5, 0.1);
  }
  const rate = (throttle * 0.08) + (speedKmh * 0.004);
  return noise(clamp(rate, 0, 15), 0.03);
}

// ─── HV Battery ───────────────────────────────────────────────────────────────

/**
 * Compute per-tick SOC change.
 * @param {boolean} evMode - True when driving purely on battery.
 * @param {boolean} engineOn
 * @param {boolean} regen - True when regenerative braking is active.
 * @param {number} throttle - 0-100%.
 * @returns {number} Delta SOC percent (positive = charge, negative = discharge).
 */
export function computeSocDelta(evMode, engineOn, regen, throttle) {
  if (regen) {
    // Regenerating: charge battery
    return noise(0.04, 0.3);
  }
  if (evMode) {
    // EV propulsion: drain battery, proportional to throttle
    const base = 0.01 + (throttle / 100) * 0.04;
    return -noise(base, 0.2);
  }
  if (engineOn) {
    // Engine charging battery slightly
    return noise(0.01, 0.3);
  }
  // Parked with engine off: tiny parasitic drain
  return -0.001;
}

/**
 * Compute HV battery voltage from SOC.
 * Toyota Yaris Hybrid nominal pack: ~195V (low) to ~214V (full in range).
 * @param {number} socPercent
 * @returns {number} Voltage in V.
 */
export function computeHvVoltage(socPercent) {
  // Linear approximation: 40% SOC → 195V, 70% SOC → 214V
  const v = 195 + (socPercent - 40) * (19 / 30);
  return noise(v, 0.005);
}

/**
 * Compute HV battery current.
 * Positive = charging (regen / engine charging), negative = discharging (propulsion).
 * @param {boolean} regen
 * @param {boolean} evMode
 * @param {boolean} engineOn
 * @param {number} throttle - 0-100%.
 * @param {number} hvVoltage
 * @returns {number} Current in A.
 */
export function computeHvCurrent(regen, evMode, engineOn, throttle, hvVoltage) {
  if (regen) {
    // Charging during regen
    const regenPower = 5000 + throttle * 100; // W
    return noise(regenPower / hvVoltage, 0.05);
  }
  if (evMode) {
    // Discharging for EV drive
    const drivePower = 2000 + throttle * 150; // W
    return -noise(drivePower / hvVoltage, 0.05);
  }
  if (engineOn) {
    // Small charge from engine
    return noise(5, 0.2);
  }
  return noise(0, 0.5);
}

// ─── Coolant Temperature ──────────────────────────────────────────────────────

/**
 * Update coolant temperature with realistic warm-up curve.
 * @param {number} current - Current temp °C.
 * @param {boolean} engineOn
 * @param {number} ambientTemp - Ambient air temp °C.
 * @param {number} dtSec
 * @returns {number}
 */
export function computeCoolantTemp(current, engineOn, ambientTemp, dtSec) {
  const target = engineOn ? 90 : ambientTemp;
  const rate = engineOn ? 0.5 : 0.1; // °C per second
  return lerp(current, target, rate, dtSec);
}

/**
 * Update oil temperature (warms slower than coolant).
 * @param {number} current - Current temp °C.
 * @param {boolean} engineOn
 * @param {number} ambientTemp
 * @param {number} dtSec
 * @returns {number}
 */
export function computeOilTemp(current, engineOn, ambientTemp, dtSec) {
  const target = engineOn ? 85 : ambientTemp;
  const rate = engineOn ? 0.25 : 0.08;
  return lerp(current, target, rate, dtSec);
}

// ─── Motor / Generator ────────────────────────────────────────────────────────

/**
 * Compute MG2 (drive motor) RPM from vehicle speed.
 * MG2 RPM ≈ speed × 70 (Toyota Yaris Hybrid gear ratio approximation).
 * @param {number} speedKmh
 * @returns {number}
 */
export function computeMg2Rpm(speedKmh) {
  return noise(speedKmh * 70, 0.01);
}

/**
 * Compute MG1 (generator) RPM from engine RPM and MG2 RPM.
 * In THS-II power-split: MG1_RPM = (engineRpm × 2.6) - MG2_RPM (rough approximation).
 * @param {number} engineRpm
 * @param {number} mg2Rpm
 * @param {boolean} engineOn
 * @returns {number}
 */
export function computeMg1Rpm(engineRpm, mg2Rpm, engineOn) {
  if (!engineOn) return noise(-mg2Rpm * 0.3, 0.02);
  return noise(engineRpm * 2.6 - mg2Rpm * 0.3, 0.02);
}

/**
 * Compute MG2 torque (drive/regen torque).
 * Positive = propulsion, negative = regen braking.
 * @param {number} throttle - 0-100%.
 * @param {boolean} regen
 * @param {boolean} braking
 * @param {number} brakePressure - Bar.
 * @param {boolean} evMode
 * @param {boolean} engineOn
 * @returns {number} Torque in Nm.
 */
export function computeMg2Torque(throttle, regen, braking, brakePressure, evMode, engineOn) {
  if (regen || braking) {
    // Negative torque (regen)
    const regenNm = -(20 + brakePressure * 8);
    return noise(regenNm, 0.05);
  }
  if (evMode || engineOn) {
    // Propulsion
    const propNm = throttle * 2.0;
    return noise(propNm, 0.05);
  }
  return 0;
}

/**
 * Compute MG1 torque (generation torque from engine).
 * @param {number} engineRpm
 * @param {boolean} engineOn
 * @param {number} throttle
 * @returns {number} Torque in Nm.
 */
export function computeMg1Torque(engineRpm, engineOn, throttle) {
  if (!engineOn) return 0;
  const torque = 30 + (throttle / 100) * 80;
  return noise(torque, 0.05);
}

// ─── A/C ──────────────────────────────────────────────────────────────────────

/**
 * Compute A/C compressor power draw.
 * @param {boolean} acOn
 * @returns {number} Power in Watts.
 */
export function computeAcPower(acOn) {
  if (!acOn) return 0;
  return noise(1100, 0.05); // ±5% of ~1100W
}

// ─── Shift Position ───────────────────────────────────────────────────────────

/**
 * Compute shift position code from vehicle state.
 * Toyota mapping: 0=Unknown, 1=B, 2=D, 3=N, 4=R, 5=P
 * @param {number} speedKmh
 * @param {string} engineStateStr - 'off' | 'starting' | 'on'.
 * @returns {number}
 */
export function computeShiftPosition(speedKmh, engineStateStr) {
  if (speedKmh === 0 && engineStateStr === 'off') return 5; // P
  if (speedKmh === 0) return 2; // D (ready to drive)
  return 2; // D
}

// ─── HV Battery Temperature ───────────────────────────────────────────────────

/**
 * Compute battery temperature (warms slightly under load).
 * @param {number} current - Current temp °C.
 * @param {boolean} regen
 * @param {boolean} evMode
 * @param {number} throttle
 * @param {number} ambientTemp
 * @param {number} dtSec
 * @returns {number}
 */
export function computeBatteryTemp(current, regen, evMode, throttle, ambientTemp, dtSec) {
  const loadFactor = (regen ? 0.5 : 0) + (evMode ? throttle / 100 * 0.3 : 0);
  const target = ambientTemp + 8 + loadFactor * 15;
  return lerp(current, target, 0.05, dtSec);
}

// ─── Fuel Consumption (Toyota PID) ───────────────────────────────────────────

/**
 * Approximate injector volume from fuel rate and RPM.
 * Toyota PID 213C returns mL per injection.
 * @param {number} fuelRateLh - L/h.
 * @param {number} engineRpm
 * @returns {number} mL per injection.
 */
export function computeInjectorVolume(fuelRateLh, engineRpm) {
  if (engineRpm === 0) return 0;
  // 4 cylinders, 2 injections per rev (4-stroke), convert L/h to mL/injection
  const injectionsPerSec = (engineRpm / 60) * 2;
  const mlPerSec = (fuelRateLh / 3600) * 1000;
  return clamp(mlPerSec / injectionsPerSec, 0, 2.047);
}
