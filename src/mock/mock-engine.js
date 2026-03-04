/**
 * Mock data engine — replaces BLE + ELM327 + PIDManager for UI development.
 *
 * Exports:
 *   MockAdapter   — Drop-in for BLEAdapter (same event API)
 *   MockELM       — Drop-in for ELM327 (same event API)
 *   MockEngine    — Simulation orchestrator; feeds store.js directly
 *
 * Usage in src/main.jsx (mock mode):
 *   const adapter = new MockAdapter();
 *   const elm     = new MockELM();
 *   const mock    = new MockEngine(store, tripManager, adapter, elm);
 *   mock.start();
 */

import {
  computeSpeed,
  computeEngineRpm,
  computeFuelRate,
  computeSocDelta,
  computeHvVoltage,
  computeHvCurrent,
  computeCoolantTemp,
  computeOilTemp,
  computeMg2Rpm,
  computeMg1Rpm,
  computeMg2Torque,
  computeMg1Torque,
  computeAcPower,
  computeShiftPosition,
  computeBatteryTemp,
  computeInjectorVolume,
  shouldEngineBeOn,
  clamp,
  noise,
} from './mock-physics.js';
import { MockStoreBridge } from './mock-store-bridge.js';
import { SCENARIO_CITY }    from './scenarios/scenario-city.js';
import { SCENARIO_HIGHWAY } from './scenarios/scenario-highway.js';
import { SCENARIO_MIXED }   from './scenarios/scenario-mixed.js';
import { SCENARIO_STRESS }  from './scenarios/scenario-stress.js';

// ─── Mock Transport Layer ─────────────────────────────────────────────────────

/**
 * Minimal BLEAdapter stand-in.
 * Fires the same state-change events as the real adapter.
 */
export class MockAdapter {
  constructor() {
    this.state = 'disconnected';
    this._listeners = [];
  }

  onStateChange(cb) {
    this._listeners.push(cb);
  }

  _emit(state) {
    this.state = state;
    for (const cb of this._listeners) cb(state);
  }

  /** No-op — connection is driven by MockEngine timing, not user gestures. */
  connect() { return Promise.resolve(); }

  disconnect() {
    this._emit('disconnected');
  }
}

/**
 * Minimal ELM327 stand-in.
 * Fires 'initializing' and 'ready' events on cue from MockEngine.
 */
export class MockELM {
  constructor() {
    this.state = 'idle';
    this._stateListeners = [];
    this._logListeners   = [];
  }

  onStateChange(cb) { this._stateListeners.push(cb); }
  onLog(cb)         { this._logListeners.push(cb); }

  _emitState(state) {
    this.state = state;
    for (const cb of this._stateListeners) cb(state);
  }

  /** No-op — initialization is driven by MockEngine timing. */
  initialize() { return Promise.resolve(); }
}

// ─── Scenario Registry ────────────────────────────────────────────────────────

const SCENARIOS = {
  city:     SCENARIO_CITY,
  highway:  SCENARIO_HIGHWAY,
  mixed:    SCENARIO_MIXED,
  stress:   SCENARIO_STRESS,
};

// ─── Default Simulation State ─────────────────────────────────────────────────

function createInitialState(ambientTemp = 14) {
  return {
    // Dynamics
    speedKmh:       0,
    targetSpeedKmh: 0,
    accelerationMs2: 0,

    // Thermal engine
    engineRpm:       0,
    engineOn:        false,
    engineStartProgress: 0,   // 0→1 over 2 seconds during startup surge
    coolantTempC:    ambientTemp,
    oilTempC:        ambientTemp,
    intakeTempC:     ambientTemp - 2,
    throttlePercent: 0,
    fuelRateLh:      0,
    injectorVolumeMl: 0,

    // Hybrid system
    hvSocPercent:    58,
    hvCurrentA:      0,
    hvVoltageV:      201,
    hvBatteryTempC:  ambientTemp + 2,
    mg1Rpm:          0,
    mg2Rpm:          0,
    mg1TorqueNm:     0,
    mg2TorqueNm:     0,
    evMode:          false,
    regenTorqueNm:   0,

    // Ancillaries
    acPowerW:        0,
    acOn:            false,
    shiftPosition:   5,       // P (park)
    brakePressureBar: 0,
    ambientTempC:    ambientTemp,

    // Trip counters
    odometer:        0,
    tripDistanceKm:  0,
    elapsedSeconds:  0,
  };
}

// ─── MockEngine ───────────────────────────────────────────────────────────────

export class MockEngine {
  /**
   * @param {import('../../store.js').Store} store
   * @param {import('../../src/trips/trip-manager.js').TripManager} tripManager
   * @param {MockAdapter} mockAdapter
   * @param {MockELM} mockElm
   */
  constructor(store, tripManager, mockAdapter, mockElm) {
    this._store       = store;
    this._tripManager = tripManager;
    this._adapter     = mockAdapter;
    this._elm         = mockElm;
    this._bridge      = new MockStoreBridge(store);

    this._scenarioName  = 'city';
    this._scenario      = SCENARIO_CITY;
    this._waypointIdx   = 0;
    this._waypointTimer = 0;   // seconds spent in current waypoint
    this._speedMultiplier = 1;
    this._tickMs        = 500; // base tick rate in ms

    this._state = createInitialState();

    this._intervalId   = null;
    this._running      = false;

    // Manual override flags (set by control panel)
    this._forceRegenTicks  = 0;
    this._forceAccelTicks  = 0;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start the simulation. Fires a simulated BLE connection sequence first
   * (connecting → initializing → ready) over ~3 seconds, then begins ticking.
   */
  start() {
    if (this._running) return;

    // Simulate 3s BLE connection delay so connection UI can be tested
    setTimeout(() => {
      this._adapter._emit('connecting');

      setTimeout(() => {
        this._elm._emitState('initializing');

        setTimeout(() => {
          this._elm._emitState('ready');
          this._tripManager.enableAutoDetect();
          this._beginLoop();
        }, 800);
      }, 800);
    }, 1500);
  }

  /** Stop the simulation loop. */
  stop() {
    this._running = false;
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._adapter._emit('disconnected');
    this._tripManager.disableAutoDetect();
  }

  /**
   * Switch to a named scenario. Resets waypoint position but keeps physics state.
   * @param {'city'|'highway'|'mixed'|'stress'} scenarioName
   */
  setScenario(scenarioName) {
    if (!SCENARIOS[scenarioName]) {
      console.warn(`[MockEngine] Unknown scenario: ${scenarioName}`);
      return;
    }
    this._scenarioName  = scenarioName;
    this._scenario      = SCENARIOS[scenarioName];
    this._waypointIdx   = 0;
    this._waypointTimer = 0;
  }

  /**
   * Get a shallow copy of the current internal state (for debug/control panel).
   * @returns {object}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Accelerate or slow down the simulation clock.
   * @param {1|2|5} multiplier
   */
  setSpeedMultiplier(multiplier) {
    this._speedMultiplier = multiplier;
    if (this._running) {
      // Restart loop at new rate
      clearInterval(this._intervalId);
      this._startTicking();
    }
  }

  /** Override SOC directly (control panel slider). */
  setSoc(percent) {
    this._state.hvSocPercent = clamp(percent, 40, 70);
  }

  /** Trigger 5 seconds of simulated hard braking / regen. */
  forceRegen() {
    this._forceRegenTicks = Math.ceil(5000 / this._tickMs);
  }

  /** Trigger 5 seconds of simulated heavy electric acceleration. */
  forceAccel() {
    this._forceAccelTicks = Math.ceil(5000 / this._tickMs);
  }

  /** Toggle A/C compressor. */
  toggleAC() {
    this._state.acOn = !this._state.acOn;
  }

  /** Get list of available scenario names. */
  get scenarioNames() {
    return Object.keys(SCENARIOS);
  }

  /** Current scenario name. */
  get scenarioName() {
    return this._scenarioName;
  }

  // ── Internal tick loop ─────────────────────────────────────────────────────

  _beginLoop() {
    this._running = true;
    this._startTicking();
  }

  _startTicking() {
    const effectiveTickMs = this._tickMs / this._speedMultiplier;
    this._intervalId = setInterval(() => this._tick(), effectiveTickMs);
  }

  _tick() {
    const dtSec = (this._tickMs / 1000);  // real simulation seconds per tick

    // ── Advance scenario waypoint ───────────────────────────────────────────
    this._waypointTimer += dtSec * this._speedMultiplier;
    const waypoint = this._getCurrentWaypoint();

    // Apply waypoint directives to state
    this._applyWaypoint(waypoint);

    // Override with manual control panel events
    if (this._forceRegenTicks > 0) {
      this._state.targetSpeedKmh = Math.max(0, this._state.speedKmh - 20);
      this._state.throttlePercent = 0;
      this._state.brakePressureBar = 10;
      this._forceRegenTicks--;
    } else if (this._forceAccelTicks > 0) {
      this._state.targetSpeedKmh = Math.min(80, this._state.speedKmh + 30);
      this._state.throttlePercent = 80;
      this._state.brakePressureBar = 0;
      this._forceAccelTicks--;
    }

    // ── Physics update ──────────────────────────────────────────────────────
    this._updatePhysics(dtSec);

    // ── Write to store ──────────────────────────────────────────────────────
    this._bridge.update(this._state);
  }

  // ── Scenario management ────────────────────────────────────────────────────

  _getCurrentWaypoint() {
    const wp = this._scenario[this._waypointIdx];

    // Check if it's time to advance
    if (this._waypointTimer >= wp.duration) {
      this._waypointTimer = 0;
      this._waypointIdx = (this._waypointIdx + 1) % this._scenario.length;
      return this._scenario[this._waypointIdx];
    }
    return wp;
  }

  _applyWaypoint(wp) {
    const s = this._state;

    if (wp.targetSpeed !== undefined) s.targetSpeedKmh = wp.targetSpeed;

    // Throttle: explicit, or auto from target speed change
    if (wp.throttle !== undefined) {
      s.throttlePercent = wp.throttle;
    } else if (!wp.brake) {
      // Auto throttle: ramp toward 40% when accelerating, coast at 10%
      const speedDiff = s.targetSpeedKmh - s.speedKmh;
      s.throttlePercent = speedDiff > 5 ? 40 : (speedDiff < -5 ? 5 : 15);
    }

    // Brake pressure
    s.brakePressureBar = wp.brake ? 8 : 0;

    // A/C toggle (only when explicitly specified in this waypoint)
    if (wp.acOn !== undefined) s.acOn = wp.acOn;

    // Engine state override
    if (wp.engineState === 'off') {
      s._engineForce = 'off';
    } else if (wp.engineState === 'starting' || wp.engineState === 'on') {
      s._engineForce = 'on';
    } else {
      s._engineForce = null; // auto-managed by physics
    }
  }

  // ── Physics ────────────────────────────────────────────────────────────────

  _updatePhysics(dtSec) {
    const s = this._state;
    const braking = s.brakePressureBar > 0;

    // Speed
    const { speed, acceleration } = computeSpeed(
      s.speedKmh, s.targetSpeedKmh, s.throttlePercent, braking, dtSec
    );
    s.speedKmh       = speed;
    s.accelerationMs2 = acceleration;

    // Distance
    const distDelta = (speed / 3600) * dtSec; // km
    s.odometer       += distDelta;
    s.tripDistanceKm += distDelta;
    s.elapsedSeconds += dtSec;

    // Engine on/off
    const forcedEngineState = s._engineForce === 'off'
      ? 'off'
      : s._engineForce === 'on'
        ? 'starting'
        : null;

    const nextEngineOn = shouldEngineBeOn(
      s.engineOn, s.speedKmh, s.hvSocPercent, s.throttlePercent, forcedEngineState
    );

    if (!s.engineOn && nextEngineOn) {
      // Engine starting — reset startup progress
      s.engineStartProgress = 0;
    }
    s.engineOn = nextEngineOn;

    // Startup progress (0→1 over 2 seconds)
    if (s.engineOn && s.engineStartProgress < 1) {
      s.engineStartProgress = Math.min(1, s.engineStartProgress + dtSec / 2);
    }

    // EV mode: engine off AND vehicle moving (or ready)
    s.evMode = !s.engineOn && (s.speedKmh > 0 || s.brakePressureBar > 0);

    // Regen: braking AND moving
    const isRegen = braking && s.speedKmh > 2;

    // RPM
    s.engineRpm = computeEngineRpm(s.speedKmh, s.throttlePercent, s.engineOn, s.engineStartProgress);

    // Fuel
    s.fuelRateLh      = computeFuelRate(s.engineOn, s.speedKmh, s.throttlePercent);
    s.injectorVolumeMl = computeInjectorVolume(s.fuelRateLh, s.engineRpm);

    // Temperatures
    s.coolantTempC   = computeCoolantTemp(s.coolantTempC, s.engineOn, s.ambientTempC, dtSec);
    s.oilTempC       = computeOilTemp(s.oilTempC, s.engineOn, s.ambientTempC, dtSec);
    s.intakeTempC    = noise(s.ambientTempC + (s.engineOn ? 5 : 0), 0.02);
    s.hvBatteryTempC = computeBatteryTemp(
      s.hvBatteryTempC, isRegen, s.evMode, s.throttlePercent, s.ambientTempC, dtSec
    );

    // SOC
    const socDelta = computeSocDelta(s.evMode, s.engineOn, isRegen, s.throttlePercent);
    s.hvSocPercent = clamp(s.hvSocPercent + socDelta, 40, 70);

    // HV Voltage & Current
    s.hvVoltageV = computeHvVoltage(s.hvSocPercent);
    s.hvCurrentA = computeHvCurrent(isRegen, s.evMode, s.engineOn, s.throttlePercent, s.hvVoltageV);

    // Motors
    s.mg2Rpm = computeMg2Rpm(s.speedKmh);
    s.mg1Rpm = computeMg1Rpm(s.engineRpm, s.mg2Rpm, s.engineOn);

    s.mg2TorqueNm = computeMg2Torque(
      s.throttlePercent, isRegen, braking, s.brakePressureBar, s.evMode, s.engineOn
    );
    s.mg1TorqueNm = computeMg1Torque(s.engineRpm, s.engineOn, s.throttlePercent);

    s.regenTorqueNm = s.mg2TorqueNm < 0 ? -s.mg2TorqueNm : 0;

    // A/C
    s.acPowerW = computeAcPower(s.acOn);

    // Shift position
    const engineStateStr = s.engineOn ? 'on' : 'off';
    s.shiftPosition = computeShiftPosition(s.speedKmh, engineStateStr);
  }
}
