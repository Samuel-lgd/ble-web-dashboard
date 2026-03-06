import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, describeArc, generateTicks, BezelDefs, useSmoothedValue, GaugeValueReadout, GaugeBezel, GaugeNeedle, TickMarks } from './gauge-utils.jsx';

/**
 * Fuel consumption gauge — circular, smaller, shows trip average L/100km.
 * Needle-based. Chrome bezel. Amber palette.
 * A/C load overlay: ghost zone on the arc showing A/C consumption penalty.
 */
export default function FuelConsumptionGauge() {
  const speed = usePid(PID_KEYS.VEHICLE_SPEED) ?? 0;
  const fuelRate = usePid(PID_KEYS.FUEL_RATE) ?? 0;
  const acPower = usePid(PID_KEYS.AC_COMPRESSOR_POWER);

  // Current instantaneous L/100km
  const l100km = speed > 5 ? (fuelRate / speed) * 100 : 0;
  // A/C equivalent L/100km penalty: ~0.3 L/h per kW of AC
  const acLh = acPower ? (acPower / 1000) * 0.3 : 0;
  const acL100km = speed > 5 ? (acLh / speed) * 100 : 0;
  const acActive = acPower !== null && acPower > 0;
  const smoothL100km = useSmoothedValue(l100km);
  const smoothAcL100km = useSmoothedValue(acL100km);

  const gaugeMin = 0;
  const gaugeMax = 15;
  const needleAngle = valueToAngle(Math.min(smoothL100km, gaugeMax), gaugeMin, gaugeMax);

  // A/C ghost zone: overlaid dimmed arc on fuel consumption
  const acStart = valueToAngle(Math.max(0, smoothL100km - smoothAcL100km), gaugeMin, gaugeMax);
  const acEnd = valueToAngle(smoothL100km, gaugeMin, gaugeMax);

  const ticks = generateTicks(gaugeMin, gaugeMax, 5, 1, 38);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-44 -44 88 88" className="w-full h-full">
        <defs>
          <BezelDefs id="fuel" />
        </defs>

        {/* Chrome bezel */}
        <GaugeBezel id="fuel" outerR={42} innerR={39} outerStrokeWidth={0.6} shadowStrokeWidth={1} />

        {/* Background arc */}
        <path d={describeArc(0, 0, 35, -135, 135)}
          fill="none" stroke="#1a1510" strokeWidth="2" opacity="0.5" />

        {/* Value arc */}
        {smoothL100km > 0.1 && (
          <path d={describeArc(0, 0, 35, -135, needleAngle)}
            fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        )}

        {/* A/C ghost zone — dimmed overlay showing A/C penalty */}
        {acActive && smoothAcL100km > 0.05 && (
          <path d={describeArc(0, 0, 35, acStart, acEnd)}
            fill="none" stroke="#00cfff" strokeWidth="2.5" opacity="0.25"
            strokeDasharray="1.5 1" />
        )}

        {/* Tick marks */}
        <TickMarks ticks={ticks} labelRadius={30} min={gaugeMin} max={gaugeMax}
          majorStroke="#666" minorStroke="#333" majorWidth={0.8} minorWidth={0.4}
          fill="#555" />

        <GaugeNeedle angle={needleAngle} length={32} backLength={3}
          color="#f59e0b" strokeWidth={1.2} capId="fuel" capR={2.5} dotR={1} />

        {/* Value display */}
        <GaugeValueReadout
          value={smoothL100km.toFixed(1)}
          unit="L/100km"
          yValue={14}
          yUnit={19}
          valueFontSize={7}
          unitFontSize={3}
          valueWeight={600}
        />

        <text x="0" y="-25" fill={acActive ? '#00cfff' : '#222'} fontSize="6" textAnchor="middle"
          opacity={acActive ? 0.8 : 0.2}>
          ❄
        </text>
        {acActive && (
          <text x="0" y="-18" fill="#00cfff" fontSize="3" textAnchor="middle" opacity="0.6"
            className="font-orbitron">
            +{smoothAcL100km.toFixed(1)}
          </text>
        )}
      </svg>
    </div>
  );
}
