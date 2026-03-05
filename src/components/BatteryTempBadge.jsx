import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Battery temperature — compact badge panel.
 * Color shifts blue→green→orange by temperature range.
 */
export default function BatteryTempBadge() {
  const temp = usePid(PID_KEYS.HV_BATT_TEMP_INTAKE) ?? 0;

  // Color by range
  let color = '#3b82f6'; // blue (cold <20°C)
  let bg = 'rgba(59,130,246,0.1)';
  if (temp > 40) { color = '#f97316'; bg = 'rgba(249,115,22,0.1)'; }
  else if (temp > 25) { color = '#22c55e'; bg = 'rgba(34,197,94,0.1)'; }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 py-0.5">
      <span className="text-[5px] text-gray-500 tracking-wider"
        style={{ fontFamily: 'Orbitron, monospace' }}>
        BATT
      </span>

      {/* Thermometer bar */}
      <div className="flex-1 w-[10px] relative my-0.5 rounded-full overflow-hidden"
        style={{
          background: 'linear-gradient(to top, #0a0a0c, #0e0e12)',
          border: '1px solid #222',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}>
        {/* Fill: 10°C to 50°C range */}
        <div
          className="absolute bottom-0 w-full rounded-full transition-all duration-500"
          style={{
            height: `${Math.max(0, Math.min(100, ((temp - 10) / 40) * 100))}%`,
            background: `linear-gradient(to top, ${color}66, ${color})`,
            boxShadow: `0 0 3px ${color}33`,
          }}
        />
      </div>

      <span className="text-[8px] font-bold" style={{ fontFamily: 'Orbitron, monospace', color }}>
        {Math.round(temp)}°
      </span>
    </div>
  );
}
