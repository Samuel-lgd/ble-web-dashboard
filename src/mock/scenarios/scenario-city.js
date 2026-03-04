/**
 * City driving scenario — ~15 minutes of urban traffic.
 * Exercises: cold start, EV mode, traffic stops, main road burst.
 *
 * Each waypoint:
 *   duration     — seconds to stay in this waypoint before advancing
 *   targetSpeed  — km/h the engine interpolates toward
 *   throttle     — explicit throttle %, auto-computed from speed change if omitted
 *   brake        — true = brake pedal applied
 *   engineState  — 'off' | 'starting' | null (auto-managed by physics)
 *   acOn         — toggle A/C compressor
 *   label        — human-readable phase name
 */
export const SCENARIO_CITY = [
  { duration: 10, targetSpeed: 0,  engineState: 'off',      label: 'Parked' },
  { duration: 5,  targetSpeed: 0,  engineState: 'starting',  label: 'Cold start' },
  { duration: 20, targetSpeed: 30, throttle: 40,              label: 'City acceleration' },
  { duration: 30, targetSpeed: 28, throttle: 15,              label: 'City cruise EV' },
  { duration: 5,  targetSpeed: 0,  brake: true,               label: 'Traffic stop' },
  { duration: 15, targetSpeed: 50, throttle: 55,              label: 'Main road' },
  { duration: 20, targetSpeed: 45,                            label: 'City cruise mixed' },
  { duration: 8,  targetSpeed: 0,  brake: true,               label: 'Red light' },
  { duration: 25, targetSpeed: 35,                            label: 'Residential' },
  { duration: 10, targetSpeed: 0,  brake: true,               label: 'Parking' },
  { duration: 15, targetSpeed: 0,  engineState: 'off',        label: 'Arrived' },
];
