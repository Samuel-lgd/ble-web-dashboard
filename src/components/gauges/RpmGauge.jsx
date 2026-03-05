import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, generateTicks, BezelDefs, useSmoothedValue } from './gauge-utils.jsx';

/**
 * RPM gauge — large circular with chrome bezel, analog needle, engraved tick marks.
 * Range 0–6000. Arc zones: normal (amber), high (orange), redline (red).
 */
export default function RpmGauge() {
  const rpm = usePid(PID_KEYS.ENGINE_RPM) ?? 0;
  const smoothRpm = useSmoothedValue(rpm);

  const needleAngle = valueToAngle(smoothRpm, 0, 6000);
  const ticks = generateTicks(0, 6000, 1000, 500, 42);
  const [nx, ny] = polarToXY(0, 0, 36, needleAngle);
  const [nbx, nby] = polarToXY(0, 0, 4, needleAngle + 180);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="rpm" />
          <radialGradient id="rpm-needle-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6644" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ff3333" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Chrome bezel ring */}
        <circle cx="0" cy="0" r="48" fill="url(#rpm-bezel-ring)" stroke="#1a1a1c" strokeWidth="0.8" />
        {/* Gauge face */}
        <circle cx="0" cy="0" r="45" fill="url(#rpm-face)" />
        <circle cx="0" cy="0" r="45" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />

        {/* Arc zones */}
        {/* Normal: 0-4000 -> amber */}
        <path d={describeArc(0, 0, 40, valueToAngle(0, 0, 6000), valueToAngle(4000, 0, 6000))}
          fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.25" strokeLinecap="round" />
        {/* High: 4000-5000 -> orange */}
        <path d={describeArc(0, 0, 40, valueToAngle(4000, 0, 6000), valueToAngle(5000, 0, 6000))}
          fill="none" stroke="#f97316" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
        {/* Redline: 5000-6000 -> red */}
        <path d={describeArc(0, 0, 40, valueToAngle(5000, 0, 6000), valueToAngle(6000, 0, 6000))}
          fill="none" stroke="#ef4444" strokeWidth="2.5" opacity="0.45" strokeLinecap="round" />

        {/* Value arc fill — shows current RPM level */}
        {smoothRpm > 50 && (
          <path
            d={describeArc(0, 0, 40, valueToAngle(0, 0, 6000), needleAngle)}
            fill="none"
            stroke={smoothRpm > 5000 ? '#ef4444' : smoothRpm > 4000 ? '#f97316' : '#f59e0b'}
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
                x={polarToXY(0, 0, 32, valueToAngle(v, 0, 6000))[0]}
                y={polarToXY(0, 0, 32, valueToAngle(v, 0, 6000))[1]}
                fill="#666"
                fontSize="5.2"
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontFamily: 'Orbitron, monospace' }}
              >
                {v / 1000}
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
        <circle cx="0" cy="0" r="3" fill="url(#rpm-cap)" stroke="#1a1a1c" strokeWidth="0.3" />
        <circle cx="0" cy="0" r="1.2" fill="#555" />

        {/* RPM numeric display — large for glanceability */}
        <text x="0" y="21" fill="#e0e0e0" fontSize="14" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {Math.round(smoothRpm)}
        </text>
        <text x="0" y="29" fill="#555" fontSize="4" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          RPM
        </text>
      </svg>
    </div>
  );
}
