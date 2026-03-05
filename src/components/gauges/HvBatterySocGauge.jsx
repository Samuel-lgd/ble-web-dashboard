import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs } from './gauge-utils.jsx';

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
  const socAngle = valueToAngle(Math.max(gaugeMin, Math.min(gaugeMax, soc)), gaugeMin, gaugeMax);

  // Regen arc spans top semicircle (-90° → +90°): 0 kW parks at 9 o'clock, 20 kW at 3 o'clock
  const kwClamped = isCharging ? Math.min(kwAbs, 20) : 0;
  const kwAngle   = valueToAngle(kwClamped, 0, 20, -90, 90);
  const [nx, ny]   = polarToXY(0, 0, 30, kwAngle);
  const [nbx, nby] = polarToXY(0, 0, 4, kwAngle + 180);

  const REGEN_R = 32;
  const regenTicks = [0, 5, 10, 15, 20].map(v => {
    const a        = valueToAngle(v, 0, 20, -90, 90);
    const isMajor  = v % 10 === 0;
    const [ox, oy] = polarToXY(0, 0, REGEN_R - 1, a);
    const [ix, iy] = polarToXY(0, 0, REGEN_R - (isMajor ? 5 : 3), a);
    return { v, ox, oy, ix, iy, isMajor };
  });

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="soc" />
          <linearGradient id="regen-grad" gradientUnits="userSpaceOnUse"
            x1="-32" y1="0" x2="32" y2="-32">
            <stop offset="0%"   stopColor="#00ee66" />
            <stop offset="50%"  stopColor="#00ff99" />
            <stop offset="100%" stopColor="#77ffcc" />
          </linearGradient>
          <filter id="regen-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
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
        <path d={describeArc(0, 0, 40, -135, socAngle)}
          fill="none" stroke="url(#soc-arc-electric)" strokeWidth="3" strokeLinecap="round"
          opacity="0.85" filter="url(#soc-arc-glow)" />


        {/* "REGEN" label tucked between arcs at 12 o'clock */}
        <text x="0" y="-22"
          fill={isCharging ? '#00cc55' : '#152515'}
          fontSize="2.6" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', letterSpacing: '1.2px' }}>
          REGEN
        </text>

        {/* kW value inside the regen arc zone */}
        <text x="0" y="-16"
          fill={isCharging ? '#00ff88' : '#0f200f'}
          fontSize="5.5" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {isCharging ? kwAbs.toFixed(1) : '0'}
        </text>
        <text x="0" y="-11"
          fill={isCharging ? '#009944' : '#0f200f'}
          fontSize="2.8" textAnchor="middle" dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          kW
        </text>

        {/* Battery temp */}
        <text x="0" y="37" fill={battTempColor} fontSize="5" textAnchor="middle"
          dominantBaseline="central"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {Math.round(battTemp)}°C
        </text>


        {/* Needle — tracks regen kW */}
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke={isCharging ? '#00ff88' : '#1a3a1a'}
          strokeWidth="1.5" strokeLinecap="round"
          className="gauge-needle-line" />
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke={isCharging ? '#00ff88' : '#0a1a0a'}
          strokeWidth="4" strokeLinecap="round"
          opacity={isCharging ? 0.22 : 0.08}
          className="gauge-needle-line" />
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
