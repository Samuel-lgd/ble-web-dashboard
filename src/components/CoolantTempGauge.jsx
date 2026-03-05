import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Coolant temperature — vertical bar gauge styled like a thermometer.
 * Cold→normal→hot zones in blue→amber→red. Numeric °C. Label "MOTEUR".
 */
export default function CoolantTempGauge() {
  const temp = usePid(PID_KEYS.COOLANT_TEMP) ?? 0;

  // Normalized 0-1 for bar fill (range: 40°C to 120°C displayed)
  const min = 40, max = 120;
  const clamped = Math.max(min, Math.min(max, temp));
  const fillPct = ((clamped - min) / (max - min)) * 100;

  // Color based on temperature
  let barColor = '#3b82f6'; // blue (cold)
  let textColor = '#3b82f6';
  if (temp > 95) { barColor = '#ef4444'; textColor = '#ef4444'; }
  else if (temp > 70) { barColor = '#f59e0b'; textColor = '#f59e0b'; }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 py-0.5">
      {/* Label */}
      <span className="text-[5px] text-gray-500 tracking-wider"
        style={{ fontFamily: 'Orbitron, monospace' }}>
        MOTEUR
      </span>

      {/* Thermometer bar */}
      <div className="flex-1 w-[10px] relative my-0.5 rounded-full overflow-hidden"
        style={{
          background: 'linear-gradient(to top, #0a0a0c, #0e0e12)',
          border: '1px solid #222',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        }}>
        {/* Zone markings */}
        <div className="absolute bottom-0 w-full" style={{ height: '30%', background: 'rgba(59,130,246,0.1)' }} />
        <div className="absolute w-full" style={{ bottom: '30%', height: '40%', background: 'rgba(245,158,11,0.05)' }} />
        <div className="absolute top-0 w-full" style={{ height: '30%', background: 'rgba(239,68,68,0.08)' }} />

        {/* Fill bar */}
        <div
          className="absolute bottom-0 w-full rounded-full transition-all duration-500"
          style={{
            height: `${fillPct}%`,
            background: `linear-gradient(to top, ${barColor}88, ${barColor})`,
            boxShadow: `0 0 4px ${barColor}44`,
          }}
        />

        {/* Tick marks */}
        {[60, 80, 100].map(t => {
          const pos = ((t - min) / (max - min)) * 100;
          return (
            <div key={t} className="absolute w-full flex items-center"
              style={{ bottom: `${pos}%` }}>
              <div className="w-full h-[1px] bg-gray-700 opacity-50" />
            </div>
          );
        })}
      </div>

      {/* Numeric value */}
      <span className="text-[8px] font-bold" style={{ fontFamily: 'Orbitron, monospace', color: textColor }}>
        {Math.round(temp)}°
      </span>
    </div>
  );
}
