import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs } from './gauge-utils.jsx';

/**
 * Speed gauge — the hero centerpiece.
 * Octagonal bezel shape. Two side arcs with graduated ticks:
 *   Left arc: L/100km (0-30), amber, with tick marks along the arc.
 *   Right arc: kW (0-30), electric blue, with tick marks along the arc.
 * The colored fill on each arc IS the indicator — no separate needle.
 * Large km/h display centered. Numeric L/100 and kW flanking the speed.
 * EV/HV mode badge centered below speed.
 */
export default function SpeedGauge() {
  const speed = usePid(PID_KEYS.VEHICLE_SPEED) ?? 0;
  const fuelRate = usePid(PID_KEYS.FUEL_RATE) ?? 0;
  const hvCurrent = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const hvVoltage = usePid(PID_KEYS.HV_BATTERY_VOLTAGE) ?? 200;
  const evMode = usePid(PID_KEYS.EV_MODE_STATUS);

  // Derived values
  const l100km = speed > 5 ? (fuelRate / speed) * 100 : 0;
  const kwDraw = Math.abs(hvVoltage * hvCurrent) / 1000;

  // Arc ranges: L/100km 0-30, kW 0-30
  const thermalMax = 30;
  const electricMax = 30;
  const thermalArcEnd = valueToAngle(Math.min(l100km, thermalMax), 0, thermalMax, -135, -5);
  const electricArcEnd = valueToAngle(Math.min(kwDraw, electricMax), 0, electricMax, 135, 5);

  const isEv = evMode === 1 || evMode === true;

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

  // Thermal tick values (L/100km): 0, 5, 10, 15, 20, 25, 30
  const thermalTicks = [0, 5, 10, 15, 20, 25, 30];
  // Electric tick values (kW): 0, 5, 10, 15, 20, 25, 30
  const electricTicks = [0, 5, 10, 15, 20, 25, 30];

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

        {/* Background left arc track */}
        <path
          d={describeArc(0, 0, 60, -135, -5)}
          fill="none"
          stroke="#1a1510"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.5"
        />
        {/* Thermal arc fill (left) — L/100km intensity */}
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

        {/* Background right arc track */}
        <path
          d={describeArc(0, 0, 60, 135, 5)}
          fill="none"
          stroke="#0a1520"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.5"
        />
        {/* Electric arc fill (right) — kW draw intensity */}
        {kwDraw > 0.1 && (
          <path
            d={describeArc(0, 0, 60, 135, electricArcEnd)}
            fill="none"
            stroke="url(#electric-arc)"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.9"
            filter="url(#glow-blue)"
          />
        )}

        {/* Thermal (left) arc tick marks — L/100km */}
        {thermalTicks.map(v => {
          const angle = valueToAngle(v, 0, thermalMax, -135, -5);
          const isMajor = v % 10 === 0;
          const [ox, oy] = polarToXY(0, 0, 56, angle);
          const [ix, iy] = polarToXY(0, 0, isMajor ? 52 : 54, angle);
          return (
            <g key={`t-${v}`}>
              <line x1={ix} y1={iy} x2={ox} y2={oy}
                stroke={isMajor ? '#f59e0b' : '#665520'}
                strokeWidth={isMajor ? 0.8 : 0.4}
                opacity={isMajor ? 0.6 : 0.4} />
              {isMajor && (
                <text
                  x={polarToXY(0, 0, 49, angle)[0]}
                  y={polarToXY(0, 0, 49, angle)[1]}
                  fill="#f59e0b"
                  fontSize="3.5"
                  textAnchor="middle"
                  dominantBaseline="central"
                  opacity="0.5"
                  style={{ fontFamily: 'Orbitron, monospace' }}
                >
                  {v}
                </text>
              )}
            </g>
          );
        })}

        {/* Electric (right) arc tick marks — kW */}
        {electricTicks.map(v => {
          const angle = valueToAngle(v, 0, electricMax, 135, 5);
          const isMajor = v % 10 === 0;
          const [ox, oy] = polarToXY(0, 0, 56, angle);
          const [ix, iy] = polarToXY(0, 0, isMajor ? 52 : 54, angle);
          return (
            <g key={`e-${v}`}>
              <line x1={ix} y1={iy} x2={ox} y2={oy}
                stroke={isMajor ? '#00cfff' : '#1a4050'}
                strokeWidth={isMajor ? 0.8 : 0.4}
                opacity={isMajor ? 0.6 : 0.4} />
              {isMajor && (
                <text
                  x={polarToXY(0, 0, 49, angle)[0]}
                  y={polarToXY(0, 0, 49, angle)[1]}
                  fill="#00cfff"
                  fontSize="3.5"
                  textAnchor="middle"
                  dominantBaseline="central"
                  opacity="0.5"
                  style={{ fontFamily: 'Orbitron, monospace' }}
                >
                  {v}
                </text>
              )}
            </g>
          );
        })}

        {/* Live L/100km — left of speed, amber
        <text
          x="-28"
          y="-8"
          fill="#f59e0b"
          fontSize="9"
          textAnchor="end"
          dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 600 }}
        >
          {l100km.toFixed(1)}
        </text>
        <text
          x="-28"
          y="1"
          fill="#f59e0b"
          fontSize="3.5"
          textAnchor="end"
          opacity="0.6"
          style={{ fontFamily: 'Orbitron, monospace' }}
        >
          L/100
        </text> */}

        {/* Large speed number — centered */}
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

        {/* Live kW — right of speed, electric blue
        <text
          x="28"
          y="-8"
          fill="#00cfff"
          fontSize="9"
          textAnchor="start"
          dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 600 }}
        >
          {kwDraw.toFixed(1)}
        </text>
        <text
          x="28"
          y="1"
          fill="#00cfff"
          fontSize="3.5"
          textAnchor="start"
          opacity="0.6"
          style={{ fontFamily: 'Orbitron, monospace' }}
        >
          kW
        </text> */}

        {/* EV / HV mode badge — centered below speed, more prominent */}
        <rect
          x="-14"
          y="20"
          width="28"
          height="13"
          rx="3"
          fill={isEv ? 'rgba(0,207,255,0.2)' : 'rgba(245,158,11,0.2)'}
          stroke={isEv ? '#00cfff' : '#f59e0b'}
          strokeWidth="0.8"
        />
        <text
          x="0"
          y="28"
          fill={isEv ? '#00cfff' : '#f59e0b'}
          fontSize="8"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}
        >
          {isEv ? 'EV' : 'HV'}
        </text>
      </svg>
    </div>
  );
}
