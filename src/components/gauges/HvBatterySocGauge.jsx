import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
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
  const battTemp = usePid(PID_KEYS.HV_BATT_TEMP_INTAKE) ?? 0;

  // Battery temp color
  const battTempColor = battTemp > 40 ? '#f97316' : battTemp > 25 ? '#22c55e' : '#3b82f6';

  const kw = (hvVoltage * hvCurrent) / 1000; // positive = charging (regen), negative = discharging (propulsion)
  const isCharging = kw > 0.1;
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
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="soc" />
          <linearGradient id="soc-charge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
          <filter id="soc-regen-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="0 0 0 0 0.133  0 0 0 0 0.773  0 0 0 0 0.369  0 0 0 0.8 0" result="green" />
            <feMerge><feMergeNode in="green" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <linearGradient id="soc-arc-electric" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0066ff" />
            <stop offset="40%" stopColor="#00aaff" />
            <stop offset="100%" stopColor="#00eeff" />
          </linearGradient>
          <filter id="soc-arc-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="0 0 0 0 0  0 0 0 0 0.667  0 0 0 0 1  0 0 0 0.5 0" result="blue" />
            <feMerge><feMergeNode in="blue" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Chrome bezel */}
        <circle cx="0" cy="0" r="48" fill="url(#soc-bezel-ring)" stroke="#1a1a1c" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="45" fill="url(#soc-face)" />
        <circle cx="0" cy="0" r="45" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />

        {/* Main SOC arc track */}
        <path d={describeArc(0, 0, 40, -135, 135)}
          fill="none" stroke="#061020" strokeWidth="3" opacity="0.6" />

        {/* SOC value arc — electric blue with glow */}
        <path d={describeArc(0, 0, 40, -135, needleAngle)}
          fill="none" stroke="url(#soc-arc-electric)" strokeWidth="3" strokeLinecap="round"
          opacity="0.85" filter="url(#soc-arc-glow)" />

        {/* Inner regen arc track */}
        <path d={describeArc(0, 0, 30, -90, 90)}
          fill="none" stroke="#0a120a" strokeWidth="2.5" opacity="0.35" />

        {/* Regen (charge) arc — only shown when charging, with glow */}
        {isCharging && kwAbs > 0.1 && (
          <path d={describeArc(0, 0, 30, -90, kwAngle)}
            fill="none"
            stroke="url(#soc-charge)"
            strokeWidth="2.5" strokeLinecap="round" opacity="0.95"
            filter="url(#soc-regen-glow)" />
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

        {/* Battery temp complication — round, middle top */}
        <circle cx="0" cy="-15" r="8" fill="#0a0a10"
          stroke="#2a2a30" strokeWidth="0.6" />
        <circle cx="0" cy="-15" r="7" fill="none"
          stroke="rgba(0,0,0,0.3)" strokeWidth="0.5" />
        <text x="0" y="-16" fill={battTempColor} fontSize="5" textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {Math.round(battTemp)}°
        </text>
        <text x="0" y="-10" fill="#444" fontSize="2.5" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          BATT
        </text>

        {/* Needle */}
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke="#00aaff" strokeWidth="1.5" strokeLinecap="round"
          className="gauge-needle-line" />
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke="#00ccff" strokeWidth="3" strokeLinecap="round"
          opacity="0.15" className="gauge-needle-line" />
        {/* Center cap */}
        <circle cx="0" cy="0" r="3" fill="url(#soc-cap)" stroke="#1a1a1c" strokeWidth="0.3" />
        <circle cx="0" cy="0" r="1.2" fill="#555" />

        {/* SOC value — large for glanceability */}
        <text x="0" y="21" fill="#e0e0e0" fontSize="15" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {soc.toFixed(1)}
        </text>
        <text x="0" y="29" fill="#555" fontSize="4" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          SOC %
        </text>
      </svg>
    </div>
  );
}
