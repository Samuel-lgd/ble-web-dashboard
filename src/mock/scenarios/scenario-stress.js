/**
 * Stress test scenario — rapid state changes to stress UI rendering.
 *
 * Exercises:
 *   - Speed oscillating 0↔120 every 15s (component scale jumps)
 *   - Engine on/off cycling every ~10s (EV↔Hybrid transitions)
 *   - Strong regen events (sparkline spikes)
 *   - A/C toggling every ~20s (power delta jumps)
 *   - SOC approaching low/high boundaries (gauge extremes)
 */
export const SCENARIO_STRESS = [
  // Speed oscillation + engine cycling
  { duration: 15, targetSpeed: 120, throttle: 80, engineState: 'starting', label: 'Sprint + engine on' },
  { duration: 15, targetSpeed: 0,   brake: true,  engineState: 'off',      label: 'Full stop + engine off' },
  { duration: 15, targetSpeed: 120, throttle: 80, engineState: 'starting', label: 'Sprint again' },
  { duration: 15, targetSpeed: 0,   brake: true,  engineState: 'off',      label: 'Stop again' },

  // A/C toggle under load
  { duration: 20, targetSpeed: 80,  throttle: 60, acOn: true,              label: 'Cruise + A/C on' },
  { duration: 20, targetSpeed: 80,  throttle: 60, acOn: false,             label: 'Cruise + A/C off' },

  // Rapid engine cycling at low speed
  { duration: 5,  targetSpeed: 30,  throttle: 20, engineState: 'starting', label: 'Engine on' },
  { duration: 5,  targetSpeed: 30,  throttle: 20, engineState: 'off',      label: 'Engine off' },
  { duration: 5,  targetSpeed: 30,  throttle: 20, engineState: 'starting', label: 'Engine on' },
  { duration: 5,  targetSpeed: 30,  throttle: 20, engineState: 'off',      label: 'Engine off' },

  // SOC boundary push — low speed to force EV drain toward 40%
  { duration: 25, targetSpeed: 40,  throttle: 15, engineState: 'off',      label: 'EV only — drain SOC' },

  // Then force charge recovery
  { duration: 20, targetSpeed: 70,  throttle: 55, engineState: 'starting', label: 'Engine charge' },

  // High-speed regen burst
  { duration: 10, targetSpeed: 110, throttle: 70, engineState: 'starting', label: 'High speed' },
  { duration: 10, targetSpeed: 0,   brake: true,  engineState: 'off',      label: 'Emergency decel' },
];
