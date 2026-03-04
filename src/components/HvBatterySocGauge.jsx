import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, generateTicks, BezelDefs } from './gauge-utils.jsx';

/**
 * HV Battery SOC gauge — large circular with chrome bezel.
 * Range displayed: 40%–70% (Yaris operating window).
 * Needle-based, electric blue palette. Numeric % with one decimal.
 * Smaller concentric arc showing charge/discharge rate in kW.
 */
export default function HvBatterySocGauge() {
  const soc = usePid(PID_KEYS.HV_BATTERY_SOC_HR) ?? 55;
  const hvCurrent = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const hvVoltage = usePid(PID_KEYS.HV_BATTERY_VOLTAGE) ?? 200;

  const kw = (hvVoltage * hvCurrent) / 1000; // positive = discharging, negative = charging
  const isCharging = kw < -0.1;
  const kwAbs = Math.abs(kw);

  const gaugeMin = 40, gaugeMax = 70;
  const needleAngle = valueToAngle(Math.max(gaugeMin, Math.min(gaugeMax, soc)), gaugeMin, gaugeMax);
  const [nx, ny] = polarToXY(0, 0, 36, needleAngle);
  const [nbx, nby] = polarToXY(0, 0, 4, needleAngle + 180);

  const ticks = generateTicks(gaugeMin, gaugeMax, 10, 5, 42);

  // kW arc: inner ring showing charge/discharge rate (0-20kW range)
  const kwAngle = valueToAngle(Math.min(kwAbs, 20), 0, 20, -90, 90);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full">
        <defs>
          <BezelDefs id="soc" />
          <linearGradient id="soc-charge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="soc-discharge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00cfff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>

        {/* Chrome bezel */}
        <circle cx="0" cy="0" r="48" fill="url(#soc-bezel-ring)" stroke="#1a1a1c" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="45" fill="url(#soc-face)" />
        <circle cx="0" cy="0" r="45" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />

        {/* Main SOC arc track */}
        <path d={describeArc(0, 0, 40, -135, 135)}
          fill="none" stroke="#0a1520" strokeWidth="2.5" opacity="0.5" />

        {/* SOC value arc */}
        <path d={describeArc(0, 0, 40, -135, needleAngle)}
          fill="none" stroke="#00cfff" strokeWidth="2.5" opacity="0.5" strokeLinecap="round" />

        {/* Inner kW arc track */}
        <path d={describeArc(0, 0, 30, -90, 90)}
          fill="none" stroke="#111" strokeWidth="1.5" opacity="0.4" />

        {/* kW value arc */}
        {kwAbs > 0.1 && (
          <path d={describeArc(0, 0, 30, -90, kwAngle)}
            fill="none"
            stroke={isCharging ? 'url(#soc-charge)' : 'url(#soc-discharge)'}
            strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
        )}

        {/* Tick marks */}
        {ticks.map(({ v, ox, oy, ix, iy, isMajor }) => (
          <g key={v}>
            <line x1={ix} y1={iy} x2={ox} y2={oy}
              stroke={isMajor ? '#666' : '#333'} strokeWidth={isMajor ? 0.8 : 0.4} />
            {isMajor && (
              <text
                x={polarToXY(0, 0, 35, valueToAngle(v, gaugeMin, gaugeMax))[0]}
                y={polarToXY(0, 0, 35, valueToAngle(v, gaugeMin, gaugeMax))[1]}
                fill="#555" fontSize="4" textAnchor="middle" dominantBaseline="central"
                style={{ fontFamily: 'Orbitron, monospace' }}>
                {v}
              </text>
            )}
          </g>
        ))}

        {/* Needle */}
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke="#00cfff" strokeWidth="1.5" strokeLinecap="round"
          className="gauge-needle-line" />
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke="#00cfff" strokeWidth="3" strokeLinecap="round"
          opacity="0.15" className="gauge-needle-line" />
        {/* Center cap */}
        <circle cx="0" cy="0" r="3" fill="url(#soc-cap)" stroke="#1a1a1c" strokeWidth="0.3" />
        <circle cx="0" cy="0" r="1.2" fill="#555" />

        {/* SOC value */}
        <text x="0" y="16" fill="#e0e0e0" fontSize="8" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {soc.toFixed(1)}
        </text>
        <text x="0" y="21.5" fill="#555" fontSize="3.5" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          SOC %
        </text>

        {/* kW label */}
        <text x="0" y="28" fill={isCharging ? '#22c55e' : '#00cfff'} fontSize="3.5" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          {isCharging ? '⚡' : '▼'} {kwAbs.toFixed(1)} kW
        </text>
      </svg>
    </div>
  );
}
