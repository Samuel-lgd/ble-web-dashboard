import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs, useSmoothedValue, GaugeValueReadout, GaugeBezel, GaugeNeedle, GlowFilter } from './gauge-utils.jsx';

/**
 * HV Battery SOC gauge — large circular with chrome bezel.
 * Range displayed: 40%–70% (Yaris operating window).
 * Needle-based, green palette for SOC, blue for regen. Numeric % with one decimal.
 * Smaller concentric arc showing charge/discharge rate in kW.
 */
export default function HvBatterySocGauge() {
  // ====== COULEURS ======
  // SOC (State of Charge) - Palette verte
  const SOC_COLORS = {
    arc: {
      start: '#00ee66',
      mid: '#22ff88',
      end: '#77ffcc'
    },
    track: '#061010',
    glow: 'rgba(0, 238, 102, 0.5)'
  };

  // Regen - Palette bleue claire
  const REGEN_COLORS = {
    arc: {
      start: '#0066ff',
      mid: '#00aaff',
      end: '#00eeff'
    },
    track: '#0a1520',
    text: '#00aaff',
    textActive: '#00eeff',
    tick: '#0088cc',
    needle: '#00ccff',
    needleInactive: '#1a2a3a',
    glow: 'rgba(0, 170, 255, 0.5)'
  };

  // Température batterie
  const BATT_TEMP_COLORS = {
    hot: '#f97316',
    normal: '#22c55e',
    cold: '#3b82f6'
  };

  const soc = usePid(PID_KEYS.HV_BATTERY_SOC_HR) ?? 55;
  const hvCurrent = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const hvVoltage = usePid(PID_KEYS.HV_BATTERY_VOLTAGE) ?? 200;
  const battTemp = usePid(PID_KEYS.HV_BATT_TEMP_INTAKE) ?? 0;
  const smoothSoc = useSmoothedValue(soc);

  // Battery temp color
  const battTempColor = battTemp > 40 ? BATT_TEMP_COLORS.hot : battTemp > 25 ? BATT_TEMP_COLORS.normal : BATT_TEMP_COLORS.cold;

  const kw = -(hvVoltage * hvCurrent) / 1000; // positive = discharging (propulsion), negative = charging (regen)

  const isDischarging = kw > 0.1;
  const kwAbs = Math.abs(kw);

  const gaugeMin = 40, gaugeMax = 70;
  const socAngle = valueToAngle(Math.max(gaugeMin, Math.min(gaugeMax, smoothSoc)), gaugeMin, gaugeMax);

  // Discharge arc spans top semicircle (-90° → +90°): 0 kW parks at 9 o'clock, 20 kW at 3 o'clock
  const kwClamped = isDischarging ? Math.min(kwAbs, 20) : 0;
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
            <stop offset="0%"   stopColor={REGEN_COLORS.arc.start} />
            <stop offset="50%"  stopColor={REGEN_COLORS.arc.mid} />
            <stop offset="100%" stopColor={REGEN_COLORS.arc.end} />
          </linearGradient>
          <GlowFilter id="regen-glow" stdDeviation={1.5}
            filterUnits="userSpaceOnUse" x="-60" y="-60" width="120" height="120" />
          <linearGradient id="soc-arc-electric" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={SOC_COLORS.arc.start} />
            <stop offset="40%" stopColor={SOC_COLORS.arc.mid} />
            <stop offset="100%" stopColor={SOC_COLORS.arc.end} />
          </linearGradient>
          <GlowFilter id="soc-arc-glow" stdDeviation={1.2}
            colorMatrix="0 0 0 0 0  0 0 0 0 0.8  0 0 0 0 0.4  0 0 0 0.5 0"
            filterUnits="userSpaceOnUse" x="-60" y="-60" width="120" height="120" />
        </defs>

        {/* Chrome bezel */}
        <GaugeBezel id="soc" outerR={48} innerR={45} />

        {/* Regen arc background track (placeholder) */}
        <path d={describeArc(0, 0, REGEN_R, -90, 90)}
          fill="none" stroke={REGEN_COLORS.track} strokeWidth="2.5" opacity="1" strokeLinecap="round" />

        {/* Main SOC arc track */}
        <path d={describeArc(0, 0, 40, -135, 135)}
          fill="none" stroke={SOC_COLORS.track} strokeWidth="3" opacity="0.6" />

        {/* SOC value arc — electric blue with glow */}
        <path d={describeArc(0, 0, 40, -135, socAngle)}
          fill="none" stroke="url(#soc-arc-electric)" strokeWidth="3" strokeLinecap="round"
          opacity="0.85" filter="url(#soc-arc-glow)" />

        {/* Discharge arc gauge — filled arc showing current kW */}
        {isDischarging && kwClamped > 0.1 && (
          <path d={describeArc(0, 0, REGEN_R, -90, kwAngle)}
            fill="none" stroke="url(#regen-grad)" strokeWidth="2.5" strokeLinecap="round"
            opacity="0.8" filter="url(#regen-glow)" />
        )}

        {/* Regen tick marks */}
        {regenTicks.map(({ v, ox, oy, ix, iy, isMajor }) => (
          <line key={v} x1={ix} y1={iy} x2={ox} y2={oy}
            stroke={REGEN_COLORS.tick}
            strokeWidth={isMajor ? 0.8 : 0.4}
            opacity={0.6} />
        ))}

        {/* "DRAIN" label tucked between arcs at 12 o'clock */}
        <text x="0" y="-22"
          fill={isDischarging ? REGEN_COLORS.text : '#152525'}
          fontSize="2.6" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron" style={{ letterSpacing: '1.2px' }}>
          DRAIN
        </text>

        {/* kW value inside the discharge arc zone */}
        <text x="0" y="-16"
          fill={isDischarging ? REGEN_COLORS.textActive : '#0f200f'}
          fontSize="5.5" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron" style={{ fontWeight: 700 }}>
          {isDischarging ? kwAbs.toFixed(1) : '0'}
        </text>
        <text x="0" y="-11"
          fill={isDischarging ? REGEN_COLORS.text : '#0f200f'}
          fontSize="2.8" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron">
          kW
        </text>

        <GaugeNeedle angle={kwAngle} length={28}
          color={isDischarging ? REGEN_COLORS.needle : REGEN_COLORS.needleInactive}
          glowColor={isDischarging ? REGEN_COLORS.needle : '#0a1a0a'}
          glowWidth={4} glowOpacity={isDischarging ? 0.22 : 0.08}
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
