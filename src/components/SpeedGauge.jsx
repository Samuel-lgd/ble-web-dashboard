import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, shiftLabel, BezelDefs } from './gauge-utils.jsx';

/**
 * Speed gauge — the hero centerpiece.
 * Octagonal bezel shape. Two side arcs: thermal L/100km (left), electric kW (right).
 * Large km/h display. Shift position + EV/HV badge below.
 */
export default function SpeedGauge() {
  const speed = usePid(PID_KEYS.VEHICLE_SPEED) ?? 0;
  const fuelRate = usePid(PID_KEYS.FUEL_RATE) ?? 0;
  const hvCurrent = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const hvVoltage = usePid(PID_KEYS.HV_BATTERY_VOLTAGE) ?? 200;
  const shiftPos = usePid(PID_KEYS.SHIFT_POSITION);
  const evMode = usePid(PID_KEYS.EV_MODE_STATUS);

  // Derived values
  const l100km = speed > 5 ? (fuelRate / speed) * 100 : 0;
  const kwDraw = Math.abs(hvVoltage * hvCurrent) / 1000;

  // Arc ranges: L/100km 0-15, kW 0-30
  const thermalArcEnd = valueToAngle(Math.min(l100km, 15), 0, 15, -135, -5);
  const electricArcEnd = valueToAngle(Math.min(kwDraw, 30), 0, 30, 5, 135);

  const isEv = evMode === 1 || evMode === true;
  const shift = shiftLabel(shiftPos);

  // Octagon points at radius 72
  const octPoints = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 + 22.5) * Math.PI / 180;
    octPoints.push(`${72 * Math.cos(angle)},${72 * Math.sin(angle)}`);
  }
  const octInner = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * 45 + 22.5) * Math.PI / 180;
    octInner.push(`${68 * Math.cos(angle)},${68 * Math.sin(angle)}`);
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-82 -82 164 164" className="w-full h-full max-h-full">
        <defs>
          <BezelDefs id="speed" />
          <linearGradient id="thermal-arc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          <linearGradient id="electric-arc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00cfff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <filter id="glow-amber">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-blue">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Octagonal bezel */}
        <polygon
          points={octPoints.join(' ')}
          fill="url(#speed-bezel-ring)"
          stroke="#1a1a1c"
          strokeWidth="1"
        />
        {/* Inner octagonal face */}
        <polygon
          points={octInner.join(' ')}
          fill="url(#speed-face)"
        />
        {/* Inner shadow */}
        <polygon
          points={octInner.join(' ')}
          fill="none"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="1.5"
        />

        {/* Thermal arc (left) — L/100km intensity */}
        {l100km > 0.1 && (
          <path
            d={describeArc(0, 0, 60, -135, thermalArcEnd)}
            fill="none"
            stroke="url(#thermal-arc)"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.9"
            filter="url(#glow-amber)"
          />
        )}
        {/* Background left arc track */}
        <path
          d={describeArc(0, 0, 60, -135, -5)}
          fill="none"
          stroke="#1a1510"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Electric arc (right) — kW draw intensity */}
        {kwDraw > 0.1 && (
          <path
            d={describeArc(0, 0, 60, 5, electricArcEnd)}
            fill="none"
            stroke="url(#electric-arc)"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.9"
            filter="url(#glow-blue)"
          />
        )}
        {/* Background right arc track */}
        <path
          d={describeArc(0, 0, 60, 5, 135)}
          fill="none"
          stroke="#0a1520"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* Speed tick marks around the inner edge */}
        {[0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map(v => {
          const angle = valueToAngle(v, 0, 200, -135, 135);
          const [ox, oy] = polarToXY(0, 0, 55, angle);
          const [ix, iy] = polarToXY(0, 0, 50, angle);
          return (
            <g key={v}>
              <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="#444" strokeWidth="0.8" />
              {v % 40 === 0 && (
                <text
                  x={polarToXY(0, 0, 45, angle)[0]}
                  y={polarToXY(0, 0, 45, angle)[1]}
                  fill="#555"
                  fontSize="5"
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontFamily: 'Orbitron, monospace' }}
                >
                  {v}
                </text>
              )}
            </g>
          );
        })}

        {/* Large speed number */}
        <text
          x="0"
          y="-6"
          fill="#e0e0e0"
          fontSize="28"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}
        >
          {Math.round(speed)}
        </text>
        <text
          x="0"
          y="12"
          fill="#666"
          fontSize="6"
          textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}
        >
          km/h
        </text>

        {/* Shift position */}
        <text
          x="-16"
          y="28"
          fill="#888"
          fontSize="8"
          textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 600 }}
        >
          {shift}
        </text>

        {/* EV / HV mode badge */}
        <rect
          x="4"
          y="23"
          width="22"
          height="10"
          rx="2"
          fill={isEv ? 'rgba(0,207,255,0.15)' : 'rgba(245,158,11,0.15)'}
          stroke={isEv ? '#00cfff' : '#f59e0b'}
          strokeWidth="0.5"
        />
        <text
          x="15"
          y="29.5"
          fill={isEv ? '#00cfff' : '#f59e0b'}
          fontSize="5.5"
          textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}
        >
          {isEv ? 'EV' : 'HV'}
        </text>

        {/* Arc labels */}
        <text x="-58" y="48" fill="#f59e0b" fontSize="4" textAnchor="start" opacity="0.7"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          {l100km.toFixed(1)} L/100
        </text>
        <text x="58" y="48" fill="#00cfff" fontSize="4" textAnchor="end" opacity="0.7"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          {kwDraw.toFixed(1)} kW
        </text>
      </svg>
    </div>
  );
}
