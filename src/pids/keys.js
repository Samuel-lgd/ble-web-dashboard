import { STANDARD_PIDS } from './definitions/standard.js';
import { TOYOTA_PIDS } from './definitions/toyota.js';

function toPidKey(pid) {
  return `${pid.protocol}:${pid.header || ''}:${pid.pid}:${pid.name}`;
}

const ALL_PIDS = [...STANDARD_PIDS, ...TOYOTA_PIDS];

/**
 * Resolve a PID key from live definitions.
 * Falls back to a stable string if the definition is currently disabled.
 */
function resolvePidKey({ protocol, pid, name, header = undefined, fallback }) {
  const found = ALL_PIDS.find((entry) => {
    if (entry.protocol !== protocol) return false;
    if (entry.pid !== pid) return false;
    if (entry.name !== name) return false;
    if (header === undefined) return true;
    return (entry.header || '') === (header || '');
  });
  return found ? toPidKey(found) : fallback;
}

export const PID_KEYS = {
  ENGINE_RPM: resolvePidKey({
    protocol: 'standard', pid: '010C', name: 'Engine RPM', fallback: 'standard::010C:Engine RPM',
  }),
  ENGINE_LOAD: resolvePidKey({
    protocol: 'standard', pid: '0104', name: 'Engine Load', fallback: 'standard::0104:Engine Load',
  }),
  VEHICLE_SPEED: resolvePidKey({
    protocol: 'standard', pid: '010D', name: 'Vehicle Speed', fallback: 'standard::010D:Vehicle Speed',
  }),
  COOLANT_TEMP: resolvePidKey({
    protocol: 'standard', pid: '0105', name: 'Coolant Temp', fallback: 'standard::0105:Coolant Temp',
  }),
  INTAKE_AIR_TEMP: resolvePidKey({
    protocol: 'standard', pid: '010F', name: 'Intake Air Temp', fallback: 'standard::010F:Intake Air Temp',
  }),
  THROTTLE_POSITION: resolvePidKey({
    protocol: 'standard', pid: '0111', name: 'Throttle Position', fallback: 'standard::0111:Throttle Position',
  }),
  HYBRID_BATTERY_SOC: resolvePidKey({
    protocol: 'standard', pid: '015B', name: 'Hybrid Battery SOC', fallback: 'standard::015B:Hybrid Battery SOC',
  }),
  ENGINE_OIL_TEMP: resolvePidKey({
    protocol: 'standard', pid: '015C', name: 'Engine Oil Temp', fallback: 'standard::015C:Engine Oil Temp',
  }),
  FUEL_RATE: resolvePidKey({
    protocol: 'standard', pid: '015E', name: 'Fuel Rate', fallback: 'standard::015E:Fuel Rate',
  }),
  FUEL_TANK_LEVEL: resolvePidKey({
    protocol: 'standard', pid: '012F', name: 'Fuel Tank Level', fallback: 'standard::012F:Fuel Tank Level',
  }),
  ABSOLUTE_LOAD: resolvePidKey({
    protocol: 'standard', pid: '0143', name: 'Absolute Load', fallback: 'standard::0143:Absolute Load',
  }),
  AMBIENT_AIR_TEMP: resolvePidKey({
    protocol: 'standard', pid: '0146', name: 'Ambient Air Temp', fallback: 'standard::0146:Ambient Air Temp',
  }),
  ACCEL_PEDAL_POS: resolvePidKey({
    protocol: 'standard', pid: '0149', name: 'Accel Pedal Pos', fallback: 'standard::0149:Accel Pedal Pos',
  }),
  VOLTAGE_12V: resolvePidKey({
    protocol: 'standard', pid: '0142', name: '12V System Voltage', fallback: 'standard::0142:12V System Voltage',
  }),

  HV_BATTERY_SOC_HR: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2198', name: 'HV Battery SOC (HR)',
    fallback: 'toyota:7E2:2198:HV Battery SOC (HR)',
  }),
  HV_BATTERY_VOLTAGE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2174', name: 'HV Battery Voltage',
    fallback: 'toyota:7E2:2174:HV Battery Voltage',
  }),
  HV_BATT_TEMP_2: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2187', name: 'HV Batt Temp 2',
    fallback: 'toyota:7E2:2187:HV Batt Temp 2',
  }),
  HV_BATT_TEMP_3: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2187', name: 'HV Batt Temp 3',
    fallback: 'toyota:7E2:2187:HV Batt Temp 3',
  }),
  HV_BATT_TEMP_4: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2187', name: 'HV Batt Temp 4',
    fallback: 'toyota:7E2:2187:HV Batt Temp 4',
  }),

  HV_BATTERY_CURRENT: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2198', name: 'HV Battery Current', fallback: 'toyota:7E2:2198:HV Battery Current',
  }),
  HV_BATT_TEMP_INTAKE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2187', name: 'HV Batt Temp 1 (Intake)', fallback: 'toyota:7E2:2187:HV Batt Temp 1 (Intake)',
  }),
  EV_MODE_STATUS: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '219B', name: 'EV Mode Status', fallback: 'toyota:7E2:219B:EV Mode Status',
  }),
  HV_READY: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2144', name: 'HV Ready', fallback: 'toyota:7E2:2144:HV Ready',
  }),
  HV_BATT_FAN_SPEED: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '218E', name: 'HV Batt Fan Speed', fallback: 'toyota:7E2:218E:HV Batt Fan Speed',
  }),

  MG1_RPM: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2101', name: 'MG1 RPM (Generator)', fallback: 'toyota:7E2:2101:MG1 RPM (Generator)',
  }),
  MG2_RPM: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2101', name: 'MG2 RPM (Motor)', fallback: 'toyota:7E2:2101:MG2 RPM (Motor)',
  }),
  MG1_TORQUE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2167', name: 'MG1 Torque', fallback: 'toyota:7E2:2167:MG1 Torque',
  }),
  MG2_TORQUE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2168', name: 'MG2 Torque', fallback: 'toyota:7E2:2168:MG2 Torque',
  }),
  REGEN_BRAKE_TORQUE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2168', name: 'Regen Brake Torque', fallback: 'toyota:7E2:2168:Regen Brake Torque',
  }),

  COOLANT_TEMP_HR: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2101', name: 'Coolant Temp (HR)', fallback: 'toyota:7E0:2101:Coolant Temp (HR)',
  }),
  FUEL_CONSUMPTION: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '213C', name: 'Fuel Consumption', fallback: 'toyota:7E0:213C:Fuel Consumption',
  }),

  DCDC_CONV_DUTY: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2179', name: 'DC-DC Conv Duty', fallback: 'toyota:7E2:2179:DC-DC Conv Duty',
  }),
  BATTERY_12V_CURRENT: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '218A', name: '12V Battery Current', fallback: 'toyota:7E2:218A:12V Battery Current',
  }),

  FL_WHEEL_SPEED: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2103', name: 'FL Wheel Speed', fallback: 'toyota:7B0:2103:FL Wheel Speed',
  }),
  FR_WHEEL_SPEED: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2103', name: 'FR Wheel Speed', fallback: 'toyota:7B0:2103:FR Wheel Speed',
  }),
  RL_WHEEL_SPEED: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2103', name: 'RL Wheel Speed', fallback: 'toyota:7B0:2103:RL Wheel Speed',
  }),
  RR_WHEEL_SPEED: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2103', name: 'RR Wheel Speed', fallback: 'toyota:7B0:2103:RR Wheel Speed',
  }),
  BRAKE_PRESSURE: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2101', name: 'Brake Pressure', fallback: 'toyota:7B0:2101:Brake Pressure',
  }),
  REGEN_TORQUE_REQUEST: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2101', name: 'Regen Torque Request', fallback: 'toyota:7B0:2101:Regen Torque Request',
  }),
  TRC_ACTIVE: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2101', name: 'TRC Active', fallback: 'toyota:7B0:2101:TRC Active',
  }),
  VSC_ACTIVE: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2101', name: 'VSC Active', fallback: 'toyota:7B0:2101:VSC Active',
  }),

  SHIFT_POSITION: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2141', name: 'Shift Position', fallback: 'toyota:7E2:2141:Shift Position',
  }),
  TRANSAXLE_TEMP_MG1: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2161', name: 'Transaxle Temp (MG1)', fallback: 'toyota:7E2:2161:Transaxle Temp (MG1)',
  }),
  DRIVE_MODE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '219B', name: 'Drive Mode', fallback: 'toyota:7E2:219B:Drive Mode',
  }),

  // CSV-expanded Toyota mappings
  WHEEL_CYL_PRESSURE_SENSOR: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '2107', name: 'Wheel Cylinder Pressure Sensor',
    fallback: 'toyota:7B0:2107:Wheel Cylinder Pressure Sensor',
  }),
  INSPECTION_MODE: resolvePidKey({
    protocol: 'toyota', header: '7B0', pid: '21A6', name: 'Inspection Mode',
    fallback: 'toyota:7B0:21A6:Inspection Mode',
  }),
  DIST_SINCE_OIL_CHANGE_US: resolvePidKey({
    protocol: 'toyota', header: '7C0', pid: '2141', name: 'Distance Since Oil Change (US reset)',
    fallback: 'toyota:7C0:2141:Distance Since Oil Change (US reset)',
  }),
  SEAT_BELT_BEEP_QUERY: resolvePidKey({
    protocol: 'toyota', header: '7C0', pid: '21A7', name: 'Seat Belt Beep Query',
    fallback: 'toyota:7C0:21A7:Seat Belt Beep Query',
  }),
  ADJUSTED_AMBIENT_TEMP: resolvePidKey({
    protocol: 'toyota', header: '7C4', pid: '213D', name: 'Adjusted Ambient Temp',
    fallback: 'toyota:7C4:213D:Adjusted Ambient Temp',
  }),
  FUEL_SYSTEM_STATUS_1: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2103', name: 'Fuel System Status #1',
    fallback: 'toyota:7E0:2103:Fuel System Status #1',
  }),
  AF_LAMBDA_B1S1: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2104', name: 'AF Lambda B1S1',
    fallback: 'toyota:7E0:2104:AF Lambda B1S1',
  }),
  MIL_STATUS: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2106', name: 'MIL Status',
    fallback: 'toyota:7E0:2106:MIL Status',
  }),
  COMM_WITH_AIR_CONDITIONER: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2124', name: 'Comm with Air Conditioner',
    fallback: 'toyota:7E0:2124:Comm with Air Conditioner',
  }),
  INITIAL_ENGINE_COOLANT_TEMP: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2137', name: 'Initial Engine Coolant Temp',
    fallback: 'toyota:7E0:2137:Initial Engine Coolant Temp',
  }),
  INJ_VOLUME_10_STROKES: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '213C', name: 'Inj Volume (×10 strokes)',
    fallback: 'toyota:7E0:213C:Inj Volume (×10 strokes)',
  }),
  VVT_AIM_ANGLE_1: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2144', name: 'VVT Aim Angle #1',
    fallback: 'toyota:7E0:2144:VVT Aim Angle #1',
  }),
  IGNITION_TRIG_COUNT: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2145', name: 'Ignition Trig Count',
    fallback: 'toyota:7E0:2145:Ignition Trig Count',
  }),
  EGR_STEP_POSITION: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2147', name: 'EGR Step Position',
    fallback: 'toyota:7E0:2147:EGR Step Position',
  }),
  ACTUAL_ENGINE_TORQUE: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2149', name: 'Actual Engine Torque',
    fallback: 'toyota:7E0:2149:Actual Engine Torque',
  }),
  ENGINE_SPEED_CYL_1: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '2154', name: 'Engine Speed of Cyl #1',
    fallback: 'toyota:7E0:2154:Engine Speed of Cyl #1',
  }),
  CYLINDER_NUMBER: resolvePidKey({
    protocol: 'toyota', header: '7E0', pid: '21C1', name: 'Cylinder Number',
    fallback: 'toyota:7E0:21C1:Cylinder Number',
  }),
  STATE_OF_CHARGE_7E2: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '015B', name: 'State of Charge (7E2)',
    fallback: 'toyota:7E2:015B:State of Charge (7E2)',
  }),
  CANCEL_SWITCH: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2121', name: 'Cancel Switch',
    fallback: 'toyota:7E2:2121:Cancel Switch',
  }),
  MG2_REVOLUTION_CSV: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2162', name: 'MG2 Revolution (CSV)',
    fallback: 'toyota:7E2:2162:MG2 Revolution (CSV)',
  }),
  INVERTER_MG1_TEMP: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2170', name: 'Inverter MG1 Temp',
    fallback: 'toyota:7E2:2170:Inverter MG1 Temp',
  }),
  INVERTER_MG2_TEMP: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2171', name: 'Inverter MG2 Temp',
    fallback: 'toyota:7E2:2171:Inverter MG2 Temp',
  }),
  BOOST_CONVERTER_TEMP_IG_ON: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2174', name: 'Boost Converter Temp IG-ON',
    fallback: 'toyota:7E2:2174:Boost Converter Temp IG-ON',
  }),
  AIRCON_GATE_STATUS: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2175', name: 'Aircon Gate Status',
    fallback: 'toyota:7E2:2175:Aircon Gate Status',
  }),
  MG1_INVERTER_FAIL: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2178', name: 'MG1 Inverter Fail',
    fallback: 'toyota:7E2:2178:MG1 Inverter Fail',
  }),
  MG1_CARRIER_FREQUENCY: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '217C', name: 'MG1 Carrier Frequency',
    fallback: 'toyota:7E2:217C:MG1 Carrier Frequency',
  }),
  AC_CONSUMPTION_POWER: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '217D', name: 'A/C Consumption Power',
    fallback: 'toyota:7E2:217D:A/C Consumption Power',
  }),
  AUX_BATTERY_VOLTAGE_CSV: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2181', name: 'Auxiliary Battery Voltage (CSV)',
    fallback: 'toyota:7E2:2181:Auxiliary Battery Voltage (CSV)',
  }),
  NUMBER_OF_BATTERY_BLOCKS: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2192', name: 'Number of Battery Blocks',
    fallback: 'toyota:7E2:2192:Number of Battery Blocks',
  }),
  INTERNAL_RESISTANCE_R01: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '2195', name: 'Internal Resistance R01',
    fallback: 'toyota:7E2:2195:Internal Resistance R01',
  }),
  DESTINATION_REGION: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '21C1', name: 'Destination (Region)',
    fallback: 'toyota:7E2:21C1:Destination (Region)',
  }),
  ECU_CODE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '21C2', name: 'ECU Code',
    fallback: 'toyota:7E2:21C2:ECU Code',
  }),
  NUMBER_OF_CURRENT_CODE: resolvePidKey({
    protocol: 'toyota', header: '7E2', pid: '21E1', name: 'Number of Current Code',
    fallback: 'toyota:7E2:21E1:Number of Current Code',
  }),

  AC_COMPRESSOR_POWER: 'toyota:7E0:XXXX:A/C Compressor Power',
};
