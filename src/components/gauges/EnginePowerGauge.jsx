import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, generateTicks, BezelDefs, useSmoothedValue } from './gauge-utils.jsx';

/**
 * Engine Power gauge — shows OBD2 PID 0104 (Calculated Engine Load) as 0–100%.
 * 0% = engine idle / off, 100% = engine at maximum output.
 * Arc zones: eco (green 0–40%), normal (amber 40–70%), high (orange 70–85%), redline (red 85–100%).
 */
export default function EnginePowerGauge() {
  const load = usePid(PID_KEYS.ENGINE_LOAD) ?? 0;
  const rpm = usePid(PID_KEYS.ENGINE_RPM) ?? 0;
  const smoothLoad = useSmoothedValue(load);
  const smoothRpm = useSmoothedValue(rpm);

  const needleAngle = valueToAngle(smoothLoad, 0, 100);
  const ticks = generateTicks(0, 100, 10, 5, 42);
  const [nx, ny] = polarToXY(0, 0, 36, needleAngle);
  const [nbx, nby] = polarToXY(0, 0, 4, needleAngle + 180);

  const zoneColor =
    smoothLoad >= 85 ? '#ef4444' :
    smoothLoad >= 70 ? '#f97316' :
    smoothLoad >= 40 ? '#f59e0b' :
    '#22c55e';

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="epwr" />
          <radialGradient id="epwr-needle-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6644" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff3333" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Chrome bezel ring */}
        <circle cx="0" cy="0" r="48" fill="url(#epwr-bezel-ring)" stroke="#1a1a1c" strokeWidth="0.8" />
        {/* Gauge face */}
        <circle cx="0" cy="0" r="45" fill="url(#epwr-face)" />
        <circle cx="0" cy="0" r="45" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />

        {/* Arc zones */}
        {/* Eco: 0–40% → green */}
        <path d={describeArc(0, 0, 40, valueToAngle(0, 0, 100), valueToAngle(40, 0, 100))}
          fill="none" stroke="#22c55e" strokeWidth="2.5" opacity="0.25" strokeLinecap="round" />
        {/* Normal: 40–70% → amber */}
        <path d={describeArc(0, 0, 40, valueToAngle(40, 0, 100), valueToAngle(70, 0, 100))}
          fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.30" strokeLinecap="round" />
        {/* High: 70–85% → orange */}
        <path d={describeArc(0, 0, 40, valueToAngle(70, 0, 100), valueToAngle(85, 0, 100))}
          fill="none" stroke="#f97316" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
        {/* Redline: 85–100% → red */}
        <path d={describeArc(0, 0, 40, valueToAngle(85, 0, 100), valueToAngle(100, 0, 100))}
          fill="none" stroke="#ef4444" strokeWidth="2.5" opacity="0.45" strokeLinecap="round" />

        {/* Value arc fill — shows current load level */}
        {smoothLoad > 1 && (
          <path
            d={describeArc(0, 0, 40, valueToAngle(0, 0, 100), needleAngle)}
            fill="none"
            stroke={zoneColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.6"
          />
        )}

        {/* Engraved tick marks */}
        {ticks.map(({ v, ox, oy, ix, iy, isMajor }) => (
          <g key={v}>
            <line x1={ix} y1={iy} x2={ox} y2={oy}
              stroke={isMajor ? '#777' : '#444'}
              strokeWidth={isMajor ? 1 : 0.5} />
            {isMajor && (
              <text
                x={polarToXY(0, 0, 32, valueToAngle(v, 0, 100))[0]}
                y={polarToXY(0, 0, 32, valueToAngle(v, 0, 100))[1]}
                fill="#666"
                fontSize="4"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontFamily: 'Orbitron, monospace' }}
              >
                {v}
              </text>
            )}
          </g>
        ))}

        {/* Needle */}
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke="#ff3333" strokeWidth="1.5" strokeLinecap="round"
          className="gauge-needle-line" />
        {/* Needle glow */}
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke="#ff6644" strokeWidth="3" strokeLinecap="round"
          opacity="0.2" className="gauge-needle-line" />
        {/* Center cap rivet */}
        <circle cx="0" cy="0" r="3" fill="url(#epwr-cap)" stroke="#1a1a1c" strokeWidth="0.3" />
        <circle cx="0" cy="0" r="1.2" fill="#555" />

        {/* RPM numeric display */}
        <text x="0" y="19" fill="#e0e0e0" fontSize="13" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {Math.round(smoothRpm)}
        </text>
        <text x="0" y="27" fill="#555" fontSize="4" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          RPM
        </text>
      </svg>
    </div>
  );
}
