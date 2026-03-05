/**
 * Shared PID key constants.
 * These match exactly what PIDManager generates via _pidKey():
 *   `${protocol}:${header ?? ''}:${pid}:${name}`
 *
 * Import this file anywhere PID keys are needed as string literals,
 * so refactoring a PID's name propagates automatically.
 */

// ─── Standard OBD2 PIDs ───────────────────────────────────────────────────────
// Format: standard::<PID>:<Name>  (header is empty → double colon)

export const PID_KEYS = {
  // Standard PIDs
  ENGINE_RPM:          'standard::010C:Engine RPM',
  ENGINE_LOAD:         'standard::0104:Engine Load',
  VEHICLE_SPEED:       'standard::010D:Vehicle Speed',
  COOLANT_TEMP:        'standard::0105:Coolant Temp',
  INTAKE_AIR_TEMP:     'standard::010F:Intake Air Temp',
  THROTTLE_POSITION:   'standard::0111:Throttle Position',
  HYBRID_BATTERY_SOC:  'standard::015B:Hybrid Battery SOC',
  ENGINE_OIL_TEMP:     'standard::015C:Engine Oil Temp',
  FUEL_RATE:           'standard::015E:Fuel Rate',
  ABSOLUTE_LOAD:       'standard::0143:Absolute Load',
  AMBIENT_AIR_TEMP:    'standard::0146:Ambient Air Temp',
  ACCEL_PEDAL_POS:     'standard::0149:Accel Pedal Pos',
  VOLTAGE_12V:         'standard::0142:12V System Voltage',

  // ─── Toyota Proprietary PIDs ────────────────────────────────────────────────
  // Format: toyota:<HEADER>:<PID>:<Name>

  // HV Battery & System (7E4)
  HV_BATTERY_SOC_HR:       'toyota:7E4:2101:HV Battery SOC (HR)',
  HV_BATTERY_VOLTAGE:      'toyota:7E4:2101:HV Battery Voltage',
  HV_BATT_TEMP_2:          'toyota:7E4:2103:HV Batt Temp 2',
  HV_BATT_TEMP_3:          'toyota:7E4:2103:HV Batt Temp 3',
  HV_BATT_TEMP_4:          'toyota:7E4:2103:HV Batt Temp 4',

  // HV Battery & System (7E2)
  HV_BATTERY_CURRENT:      'toyota:7E2:2198:HV Battery Current',
  HV_BATT_TEMP_INTAKE:     'toyota:7E2:2187:HV Batt Temp 1 (Intake)',
  EV_MODE_STATUS:          'toyota:7E2:219B:EV Mode Status',
  HV_READY:                'toyota:7E2:2144:HV Ready',
  HV_BATT_FAN_SPEED:       'toyota:7E2:218E:HV Batt Fan Speed',

  // Motor / Generator (7E2)
  MG1_RPM:                 'toyota:7E2:2101:MG1 RPM (Generator)',
  MG2_RPM:                 'toyota:7E2:2101:MG2 RPM (Motor)',
  MG1_TORQUE:              'toyota:7E2:2167:MG1 Torque',
  MG2_TORQUE:              'toyota:7E2:2168:MG2 Torque',
  REGEN_BRAKE_TORQUE:      'toyota:7E2:2168:Regen Brake Torque',

  // Engine Thermal (7E0)
  COOLANT_TEMP_HR:         'toyota:7E0:2101:Coolant Temp (HR)',
  FUEL_CONSUMPTION:        'toyota:7E0:213C:Fuel Consumption',

  // Energy & Power (7E2)
  DCDC_CONV_DUTY:          'toyota:7E2:2179:DC-DC Conv Duty',
  BATTERY_12V_CURRENT:     'toyota:7E2:218A:12V Battery Current',

  // Vehicle Dynamics (7B0)
  FL_WHEEL_SPEED:          'toyota:7B0:2103:FL Wheel Speed',
  FR_WHEEL_SPEED:          'toyota:7B0:2103:FR Wheel Speed',
  RL_WHEEL_SPEED:          'toyota:7B0:2103:RL Wheel Speed',
  RR_WHEEL_SPEED:          'toyota:7B0:2103:RR Wheel Speed',
  BRAKE_PRESSURE:          'toyota:7B0:2101:Brake Pressure',
  REGEN_TORQUE_REQUEST:    'toyota:7B0:2101:Regen Torque Request',
  TRC_ACTIVE:              'toyota:7B0:2101:TRC Active',
  VSC_ACTIVE:              'toyota:7B0:2101:VSC Active',

  // Transmission & Traction (7E2)
  SHIFT_POSITION:          'toyota:7E2:2141:Shift Position',
  TRANSAXLE_TEMP_MG1:      'toyota:7E2:2161:Transaxle Temp (MG1)',
  DRIVE_MODE:              'toyota:7E2:219B:Drive Mode',

  // A/C System (TO IMPLEMENT — PID unknown, simulated in mock)
  AC_COMPRESSOR_POWER:     'toyota:7E0:XXXX:A/C Compressor Power',
};
