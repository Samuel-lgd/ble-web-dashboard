import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs, useSmoothedValue, GaugeValueReadout, GaugeBezel, GaugeNeedle, GlowFilter } from './gauge-utils.jsx';

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
  const smoothSoc = useSmoothedValue(soc);

  // Battery temp color
  const battTempColor = battTemp > 40 ? '#f97316' : battTemp > 25 ? '#22c55e' : '#3b82f6';

  const kw = (hvVoltage * hvCurrent) / 1000; // positive = charging (regen), negative = discharging (propulsion)

  const isCharging = kw > 0.1;
  const kwAbs = Math.abs(kw);

  const gaugeMin = 40, gaugeMax = 70;
  const socAngle = valueToAngle(Math.max(gaugeMin, Math.min(gaugeMax, smoothSoc)), gaugeMin, gaugeMax);

  // Regen arc spans top semicircle (-90° → +90°): 0 kW parks at 9 o'clock, 20 kW at 3 o'clock
  const kwClamped = isCharging ? Math.min(kwAbs, 20) : 0;
  const kwAngle   = valueToAngle(kwClamped, 0, 20, -90, 90);


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
      <svg viewBox="-55 -55 110 110" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="soc" />
          <linearGradient id="regen-grad">
            <stop offset="0%"   stopColor="#00ee66" />
            <stop offset="100%" stopColor="#77ffcc" />
          </linearGradient>
          <GlowFilter id="regen-glow" stdDeviation={1.5}
            filterUnits="userSpaceOnUse" x="-60" y="-60" width="120" height="120" />
          <linearGradient id="soc-arc-electric" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0066ff" />
            <stop offset="40%" stopColor="#00aaff" />
            <stop offset="100%" stopColor="#00eeff" />
          </linearGradient>
          <GlowFilter id="soc-arc-glow" stdDeviation={1.2}
            colorMatrix="0 0 0 0 0  0 0 0 0 0.667  0 0 0 0 1  0 0 0 0.5 0"
            filterUnits="userSpaceOnUse" x="-60" y="-60" width="120" height="120" />
        </defs>

        {/* Chrome bezel */}
        <GaugeBezel id="soc" outerR={48} innerR={45} />

        {/* Regen arc background track (placeholder) */}
        <path d={describeArc(0, 0, REGEN_R, -90, 90)}
          fill="none" stroke="#0a2015" strokeWidth="2.5" opacity="1" strokeLinecap="round" />

        {/* Main SOC arc track */}
        <path d={describeArc(0, 0, 40, -135, 135)}
          fill="none" stroke="#061020" strokeWidth="3" opacity="0.6" />

        {/* SOC value arc — electric blue with glow */}
        <path d={describeArc(0, 0, 40, -135, socAngle)}
          fill="none" stroke="url(#soc-arc-electric)" strokeWidth="3" strokeLinecap="round"
          opacity="0.85" filter="url(#soc-arc-glow)" />

        {/* Regen arc gauge — filled arc showing current kW */}
        {isCharging && kwClamped > 0.1 && (
          <path d={describeArc(0, 0, REGEN_R, -90, kwAngle)}
            fill="none" stroke="url(#regen-grad)" strokeWidth="2.5" strokeLinecap="round"
            opacity="0.8" filter="url(#regen-glow)" />
        )}

        {/* Regen tick marks */}
        {regenTicks.map(({ v, ox, oy, ix, iy, isMajor }) => (
          <line key={v} x1={ix} y1={iy} x2={ox} y2={oy}
            stroke={'#00cc55' }
            strokeWidth={isMajor ? 0.8 : 0.4}
            opacity={0.6} />
        ))}

        {/* "REGEN" label tucked between arcs at 12 o'clock */}
        <text x="0" y="-22"
          fill={isCharging ? '#00cc55' : '#152515'}
          fontSize="2.6" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron" style={{ letterSpacing: '1.2px' }}>
          REGEN
        </text>

        {/* kW value inside the regen arc zone */}
        <text x="0" y="-16"
          fill={isCharging ? '#00ff88' : '#0f200f'}
          fontSize="5.5" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron" style={{ fontWeight: 700 }}>
          {isCharging ? kwAbs.toFixed(1) : '0'}
        </text>
        <text x="0" y="-11"
          fill={isCharging ? '#009944' : '#0f200f'}
          fontSize="2.8" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron">
          kW
        </text>

        <GaugeNeedle angle={kwAngle} length={30}
          color={isCharging ? '#00ff88' : '#1a3a1a'}
          glowColor={isCharging ? '#00ff88' : '#0a1a0a'}
          glowWidth={4} glowOpacity={isCharging ? 0.22 : 0.08}
          capId="soc" />

        {/* SOC value — large for glanceability */}
        <GaugeValueReadout
          value={smoothSoc.toFixed(1)}
          unit="SOC %"
          yValue={21}
          yUnit={29}
          valueFontSize={15}
          unitFontSize={4}
        />

         {/* Battery temp */}
        <text x="0" y="37" fill={battTempColor} fontSize="5" textAnchor="middle"
          dominantBaseline="central"
          className="font-orbitron" style={{ fontWeight: 700 }}>
          {Math.round(battTemp)}°C
        </text>

      </svg>
    </div>
  );
}
