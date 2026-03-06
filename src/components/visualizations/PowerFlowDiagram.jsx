import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { BezelDefs, GaugeBezel, GlowFilter, ORBITRON } from '../gauges/gauge-utils.jsx';

/**
 * Power flow diagram — replaces BatteryCurrentGauge in right column.
 * Shows energy direction schematic:
 *   Battery → Wheels, Engine → Wheels, Wheels → Battery (regen), Engine → Battery
 *   Plus A/C consumption as a drain indicator.
 */
export default function PowerFlowDiagram() {
  const hvCurrent = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const hvVoltage = usePid(PID_KEYS.HV_BATTERY_VOLTAGE) ?? 200;
  const fuelRate = usePid(PID_KEYS.FUEL_RATE) ?? 0;
  const speed = usePid(PID_KEYS.VEHICLE_SPEED) ?? 0;
  const evMode = usePid(PID_KEYS.EV_MODE_STATUS);
  const acPower = usePid(PID_KEYS.AC_COMPRESSOR_POWER);

  const kwDraw = (hvVoltage * hvCurrent) / 1000; // positive = discharge, negative = charge
  const engineOn = fuelRate > 0.1;
  const isMoving = speed > 3;
  const isRegen = hvCurrent < -1;
  const isDischarging = hvCurrent > 1;
  const isEv = evMode === 1 || evMode === true;
  const acActive = acPower !== null && acPower > 50;
  const acKw = acPower ? acPower / 1000 : 0;

  // Flow states
  const batteryToWheels = isDischarging && isMoving;
  const engineToWheels = engineOn && isMoving;
  const wheelsToBattery = isRegen;
  const engineToBattery = engineOn && hvCurrent < -1 && !isMoving;

  const font = ORBITRON;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-44 -44 88 88" className="w-full h-full">
        <defs>
          <BezelDefs id="pf" />
          <GlowFilter id="pf-glow-green" />
          <GlowFilter id="pf-glow-blue" />
          <GlowFilter id="pf-glow-amber" />
        </defs>

        {/* Chrome bezel */}
        <GaugeBezel id="pf" outerR={42} innerR={39} outerStrokeWidth={0.6} shadowStrokeWidth={1} />

        {/* === Node: ENGINE (top left) === */}
        <rect x="-34" y="-32" width="24" height="11" rx="2"
          fill={engineOn ? 'rgba(245,158,11,0.15)' : 'rgba(80,80,80,0.08)'}
          stroke={engineOn ? '#f59e0b' : '#333'}
          strokeWidth="0.5" />
        <text x="-22" y="-25" fill={engineOn ? '#f59e0b' : '#555'} fontSize="4"
          textAnchor="middle" dominantBaseline="central" style={{ ...font, fontWeight: 600 }}>
          ENG
        </text>

        {/* === Node: BATTERY (top right) === */}
        <rect x="10" y="-32" width="24" height="11" rx="2"
          fill={isDischarging ? 'rgba(0,207,255,0.15)' : isRegen ? 'rgba(34,197,94,0.15)' : 'rgba(80,80,80,0.08)'}
          stroke={isDischarging ? '#00cfff' : isRegen ? '#22c55e' : '#333'}
          strokeWidth="0.5" />
        <text x="22" y="-25" fill={isDischarging ? '#00cfff' : isRegen ? '#22c55e' : '#555'} fontSize="4"
          textAnchor="middle" dominantBaseline="central" style={{ ...font, fontWeight: 600 }}>
          BATT
        </text>

        {/* === Node: WHEELS (bottom center) === */}
        <rect x="-14" y="10" width="28" height="11" rx="2"
          fill={isMoving ? 'rgba(224,224,224,0.1)' : 'rgba(80,80,80,0.05)'}
          stroke={isMoving ? '#888' : '#333'}
          strokeWidth="0.5" />
        <text x="0" y="17" fill={isMoving ? '#ccc' : '#555'} fontSize="4"
          textAnchor="middle" dominantBaseline="central" style={{ ...font, fontWeight: 600 }}>
          WHEELS
        </text>

        {/* === Node: A/C (bottom right) === */}
        <rect x="18" y="10" width="18" height="11" rx="2"
          fill={acActive ? 'rgba(0,207,255,0.12)' : 'rgba(80,80,80,0.05)'}
          stroke={acActive ? '#00cfff' : '#333'}
          strokeWidth="0.5" />
        <text x="27" y="14.5" fill={acActive ? '#00cfff' : '#555'} fontSize="3"
          textAnchor="middle" style={{ ...font, fontWeight: 600 }}>
          A/C
        </text>
        {acActive && (
          <text x="27" y="19" fill="#00cfff" fontSize="3" textAnchor="middle" opacity="0.7"
            style={font}>
            {acKw.toFixed(1)}kW
          </text>
        )}

        {/* === Flow arrows === */}

        {/* Engine → Wheels */}
        <line x1="-22" y1="-21" x2="-6" y2="10"
          stroke={engineToWheels ? '#f59e0b' : '#222'}
          strokeWidth={engineToWheels ? '1.2' : '0.5'}
          opacity={engineToWheels ? 0.8 : 0.2}
          strokeDasharray={engineToWheels ? undefined : '2 2'}
          filter={engineToWheels ? 'url(#pf-glow-amber)' : undefined}
        />
        {engineToWheels && (
          <polygon points="-8,8 -4,12 -9,12" fill="#f59e0b" opacity="0.8" />
        )}

        {/* Battery → Wheels */}
        <line x1="22" y1="-21" x2="6" y2="10"
          stroke={batteryToWheels ? '#00cfff' : '#222'}
          strokeWidth={batteryToWheels ? '1.2' : '0.5'}
          opacity={batteryToWheels ? 0.8 : 0.2}
          strokeDasharray={batteryToWheels ? undefined : '2 2'}
          filter={batteryToWheels ? 'url(#pf-glow-blue)' : undefined}
        />
        {batteryToWheels && (
          <polygon points="8,8 4,12 9,12" fill="#00cfff" opacity="0.8" />
        )}

        {/* Wheels → Battery (regen) */}
        <line x1="6" y1="10" x2="22" y2="-21"
          stroke={wheelsToBattery ? '#22c55e' : '#222'}
          strokeWidth={wheelsToBattery ? '1.2' : '0.5'}
          opacity={wheelsToBattery ? 0.8 : 0.15}
          strokeDasharray={wheelsToBattery ? undefined : '2 2'}
          filter={wheelsToBattery ? 'url(#pf-glow-green)' : undefined}
        />
        {wheelsToBattery && (
          <polygon points="20,-19 24,-23 19,-23" fill="#22c55e" opacity="0.8" />
        )}

        {/* Engine → Battery (charging while stopped) */}
        <line x1="-10" y1="-26" x2="10" y2="-26"
          stroke={engineToBattery ? '#f59e0b' : '#222'}
          strokeWidth={engineToBattery ? '1' : '0.4'}
          opacity={engineToBattery ? 0.7 : 0.15}
          strokeDasharray={engineToBattery ? undefined : '2 2'}
        />
        {engineToBattery && (
          <polygon points="9,-28 9,-24 12,-26" fill="#f59e0b" opacity="0.7" />
        )}

        {/* A/C drain line from battery */}
        {acActive && (
          <>
            <line x1="27" y1="-21" x2="27" y2="10"
              stroke="#00cfff" strokeWidth="0.8" opacity="0.4"
              strokeDasharray="1.5 1.5" />
            <polygon points="25.5,8 28.5,8 27,11" fill="#00cfff" opacity="0.4" />
          </>
        )}

        {/* Power value at center */}
        <text x="0" y="-6" fill={isRegen ? '#22c55e' : '#00cfff'} fontSize="8"
          textAnchor="middle" dominantBaseline="central"
          style={{ ...font, fontWeight: 700 }}>
          {Math.abs(kwDraw).toFixed(1)}
        </text>
        <text x="0" y="2" fill={isRegen ? '#22c55e' : '#00cfff'} fontSize="3.5"
          textAnchor="middle" opacity="0.6" style={font}>
          {isRegen ? 'REGEN kW' : 'kW'}
        </text>

        {/* POWER FLOW label */}
        <text x="0" y="29" fill="#444" fontSize="3" textAnchor="middle" style={font}>
          POWER FLOW
        </text>
      </svg>
    </div>
  );
}
