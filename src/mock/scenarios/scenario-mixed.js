/**
 * Mixed real-world scenario — ~25 minutes.
 * Combines: cold start → urban → national road → brief highway → urban end.
 *
 * Designed to exercise all interesting hybrid states:
 *   - Cold start warm-up
 *   - EV-only city legs (high SOC, low speed)
 *   - Engine kick-in on national road
 *   - Strong regen on highway exit
 *   - A/C activation mid-trip
 *   - Low SOC recovery (engine charges battery)
 */
export const SCENARIO_MIXED = [
  // ── Urban exit ────────────────────────────────────────────────────────────
  { duration: 8,  targetSpeed: 0,   engineState: 'off',     label: 'Cold start prep' },
  { duration: 5,  targetSpeed: 0,   engineState: 'starting', label: 'Engine start' },
  { duration: 20, targetSpeed: 30,  throttle: 35,            label: 'Urban exit' },
  { duration: 15, targetSpeed: 25,  throttle: 20,            label: 'Slow traffic' },
  { duration: 5,  targetSpeed: 0,   brake: true,             label: 'Red light' },

  // ── National road ─────────────────────────────────────────────────────────
  { duration: 25, targetSpeed: 60,  throttle: 50,            label: 'National road' },
  { duration: 45, targetSpeed: 70,  throttle: 35,            label: 'National cruise' },

  // ── Highway spur ─────────────────────────────────────────────────────────
  { duration: 10, targetSpeed: 90,  throttle: 65,            label: 'Highway on-ramp' },
  { duration: 30, targetSpeed: 110, throttle: 45, acOn: true, label: 'Highway cruise + A/C' },
  { duration: 15, targetSpeed: 70,  brake: true,             label: 'Highway exit regen' },

  // ── Urban re-entry ────────────────────────────────────────────────────────
  { duration: 20, targetSpeed: 50,  throttle: 30,            label: 'Urban re-entry' },
  { duration: 10, targetSpeed: 20,  throttle: 15,            label: 'Residential zone' },
  { duration: 8,  targetSpeed: 0,   brake: true,             label: 'Parking approach' },
  { duration: 10, targetSpeed: 0,   engineState: 'off',      label: 'Arrived' },
];
