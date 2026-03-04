/**
 * Highway scenario — ~20 minutes on the motorway.
 * Exercises: on-ramp burst, sustained cruise, overtaking, exit deceleration.
 * Engine stays on throughout — SOC management via charge-while-cruise.
 */
export const SCENARIO_HIGHWAY = [
  { duration: 5,  targetSpeed: 0,   label: 'Start' },
  { duration: 15, targetSpeed: 80,  throttle: 70, label: 'On-ramp acceleration' },
  { duration: 60, targetSpeed: 110, throttle: 45, label: 'Highway cruise' },
  { duration: 10, targetSpeed: 130, throttle: 65, label: 'Overtaking' },
  { duration: 40, targetSpeed: 110, throttle: 40, label: 'Cruise' },
  { duration: 20, targetSpeed: 60,  brake: true,  label: 'Exit deceleration' },
  { duration: 10, targetSpeed: 0,                 label: 'Stop' },
];
