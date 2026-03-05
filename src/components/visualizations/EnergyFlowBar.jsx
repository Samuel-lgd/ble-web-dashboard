import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';

/**
 * Energy flow bar — thin horizontal band below speed gauge.
 * Left half: thermal consumption (L/100km) in amber.
 * Right half: electric motor draw (kW) in blue.
 * Center divider pulses when both are active (mixed mode).
 */
export default function EnergyFlowBar() {
  const speed = usePid(PID_KEYS.VEHICLE_SPEED) ?? 0;
  const fuelRate = usePid(PID_KEYS.FUEL_RATE) ?? 0;
  const hvCurrent = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const hvVoltage = usePid(PID_KEYS.HV_BATTERY_VOLTAGE) ?? 200;

  const l100km = speed > 5 ? (fuelRate / speed) * 100 : 0;
  const kwDraw = Math.abs(hvVoltage * hvCurrent) / 1000;

  const thermalActive = l100km > 0.1;
  const electricActive = kwDraw > 0.1;
  const mixedMode = thermalActive && electricActive;

  // Bar widths: proportional to value, capped at 50% each side
  const thermalWidth = Math.min(100, (l100km / 15) * 100);
  const electricWidth = Math.min(100, (kwDraw / 30) * 100);

  return (
    <div className="w-full h-full panel-recess flex items-center px-1 gap-0">
      {/* Thermal half */}
      <div className="flex-1 flex items-center gap-1 h-full">
        <div className="flex-1 h-[6px] bg-[#1a1510] rounded-l overflow-hidden relative">
          <div
            className="h-full rounded-l transition-all duration-300"
            style={{
              width: `${thermalWidth}%`,
              background: 'linear-gradient(90deg, #f59e0b, #f97316)',
              boxShadow: thermalActive ? '0 0 6px rgba(245,158,11,0.4)' : 'none',
            }}
          />
        </div>
        <span className="text-[8px] text-amber-400 min-w-[42px] text-right"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          {l100km.toFixed(1)} <span className="text-amber-600 text-[6px]">L/100</span>
        </span>
      </div>

      {/* Center divider */}
      <div
        className={`w-[2px] h-[14px] mx-0.5 rounded ${
          mixedMode ? 'pulse-center bg-white' : 'bg-gray-700'
        }`}
      />

      {/* Electric half */}
      <div className="flex-1 flex items-center gap-1 h-full">
        <span className="text-[8px] text-cyan-400 min-w-[36px] text-left"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          {kwDraw.toFixed(1)} <span className="text-cyan-600 text-[6px]">kW</span>
        </span>
        <div className="flex-1 h-[6px] bg-[#0a1520] rounded-r overflow-hidden relative">
          <div
            className="h-full rounded-r transition-all duration-300 ml-auto"
            style={{
              width: `${electricWidth}%`,
              background: 'linear-gradient(270deg, #00cfff, #22d3ee)',
              boxShadow: electricActive ? '0 0 6px rgba(0,207,255,0.4)' : 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
