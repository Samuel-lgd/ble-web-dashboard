import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs, useSmoothedValue } from './gauge-utils.jsx';

/**
 * Battery current gauge — small circular, bidirectional.
 * Center = 0A. Left = discharging (blue), right = charging (green).
 * Needle. Numeric A below.
 */
export default function BatteryCurrentGauge() {
  const current = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const smoothCurrent = useSmoothedValue(current);

  // Range: -60A (charging) to +60A (discharging), center at 0
  const gaugeMin = -60, gaugeMax = 60;
  const clamped = Math.max(gaugeMin, Math.min(gaugeMax, smoothCurrent));
  const needleAngle = valueToAngle(clamped, gaugeMin, gaugeMax);
  const centerAngle = valueToAngle(0, gaugeMin, gaugeMax);
  const [nx, ny] = polarToXY(0, 0, 32, needleAngle);
  const [nbx, nby] = polarToXY(0, 0, 3, needleAngle + 180);

  const isCharging = smoothCurrent < -0.5;
  const isDischarging = smoothCurrent > 0.5;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-44 -44 88 88" className="w-full h-full">
        <defs>
          <BezelDefs id="curr" />
        </defs>

        {/* Chrome bezel */}
        <circle cx="0" cy="0" r="42" fill="url(#curr-bezel-ring)" stroke="#1a1a1c" strokeWidth="0.6" />
        <circle cx="0" cy="0" r="39" fill="url(#curr-face)" />
        <circle cx="0" cy="0" r="39" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />

        {/* Left arc track (charging/green) */}
        <path d={describeArc(0, 0, 35, -135, centerAngle)}
          fill="none" stroke="#0a2010" strokeWidth="2" opacity="0.5" />
        {/* Right arc track (discharging/blue) */}
        <path d={describeArc(0, 0, 35, centerAngle, 135)}
          fill="none" stroke="#0a1520" strokeWidth="2" opacity="0.5" />

        {/* Active arc fill */}
        {isCharging && (
          <path d={describeArc(0, 0, 35, needleAngle, centerAngle)}
            fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        )}
        {isDischarging && (
          <path d={describeArc(0, 0, 35, centerAngle, needleAngle)}
            fill="none" stroke="#00cfff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        )}

        {/* Tick marks */}
        {[-60, -40, -20, 0, 20, 40, 60].map(v => {
          const angle = valueToAngle(v, gaugeMin, gaugeMax);
          const [ox, oy] = polarToXY(0, 0, 37, angle);
          const [ix, iy] = polarToXY(0, 0, 33, angle);
          return (
            <g key={v}>
              <line x1={ix} y1={iy} x2={ox} y2={oy}
                stroke={v === 0 ? '#888' : '#444'} strokeWidth={v === 0 ? 1 : 0.5} />
              <text
                x={polarToXY(0, 0, 28, angle)[0]}
                y={polarToXY(0, 0, 28, angle)[1]}
                fill="#555" fontSize="3.5" textAnchor="middle" dominantBaseline="central"
                style={{ fontFamily: 'Orbitron, monospace' }}>
                {Math.abs(v)}
              </text>
            </g>
          );
        })}

        {/* Center mark */}
        <text x={polarToXY(0, 0, 23, centerAngle)[0]} y={polarToXY(0, 0, 23, centerAngle)[1]}
          fill="#666" fontSize="3" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace' }}>0</text>

        {/* Needle */}
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke={isCharging ? '#22c55e' : '#00cfff'}
          strokeWidth="1.2" strokeLinecap="round" className="gauge-needle-line" />
        <circle cx="0" cy="0" r="2.5" fill="url(#curr-cap)" stroke="#1a1a1c" strokeWidth="0.3" />
        <circle cx="0" cy="0" r="1" fill="#555" />

        {/* Value */}
        <text x="0" y="14" fill="#e0e0e0" fontSize="6" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 600 }}>
          {smoothCurrent.toFixed(1)}
        </text>
        <text x="0" y="19" fill="#555" fontSize="3" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>A</text>

        {/* CHG / DIS labels */}
        <text x="-26" y="30" fill="#22c55e" fontSize="3" textAnchor="middle" opacity="0.5"
          style={{ fontFamily: 'Orbitron, monospace' }}>CHG</text>
        <text x="26" y="30" fill="#00cfff" fontSize="3" textAnchor="middle" opacity="0.5"
          style={{ fontFamily: 'Orbitron, monospace' }}>DIS</text>
      </svg>
    </div>
  );
}
