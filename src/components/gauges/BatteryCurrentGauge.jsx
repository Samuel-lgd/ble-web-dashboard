import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs, useSmoothedValue, GaugeValueReadout, GaugeBezel, GaugeNeedle } from './gauge-utils.jsx';

/**
 * Battery current gauge — small circular, bidirectional.
 * Center = 0A. Left = discharging (blue), right = charging (green).
 * Needle. Numeric A below.
 */
export default function BatteryCurrentGauge() {
  const current = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;
  const smoothCurrent = useSmoothedValue(current);

  // Range: -60A (charging) to +60A (discharging), center at 0
  const gaugeMin = -60, gaugeMax = 60;
  const clamped = Math.max(gaugeMin, Math.min(gaugeMax, smoothCurrent));
  const needleAngle = valueToAngle(clamped, gaugeMin, gaugeMax);
  const centerAngle = valueToAngle(0, gaugeMin, gaugeMax);

  const isCharging = smoothCurrent < -0.5;
  const isDischarging = smoothCurrent > 0.5;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-44 -44 88 88" className="w-full h-full">
        <defs>
          <BezelDefs id="curr" />
        </defs>

        {/* Chrome bezel */}
        <GaugeBezel id="curr" outerR={42} innerR={39} outerStrokeWidth={0.6} shadowStrokeWidth={1} />

        {/* Left arc track (charging/green) */}
        <path d={describeArc(0, 0, 35, -135, centerAngle)}
          fill="none" stroke="#0a2010" strokeWidth="2" opacity="0.5" />
        {/* Right arc track (discharging/blue) */}
        <path d={describeArc(0, 0, 35, centerAngle, 135)}
          fill="none" stroke="#0a1520" strokeWidth="2" opacity="0.5" />

        {/* Active arc fill */}
        {isCharging && (
          <path d={describeArc(0, 0, 35, needleAngle, centerAngle)}
            fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        )}
        {isDischarging && (
          <path d={describeArc(0, 0, 35, centerAngle, needleAngle)}
            fill="none" stroke="#00cfff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        )}

        {/* Tick marks */}
        {[-60, -40, -20, 0, 20, 40, 60].map(v => {
          const angle = valueToAngle(v, gaugeMin, gaugeMax);
          const [ox, oy] = polarToXY(0, 0, 37, angle);
          const [ix, iy] = polarToXY(0, 0, 33, angle);
          return (
            <g key={v}>
              <line x1={ix} y1={iy} x2={ox} y2={oy}
                stroke={v === 0 ? '#888' : '#444'} strokeWidth={v === 0 ? 1 : 0.5} />
              <text
                x={polarToXY(0, 0, 28, angle)[0]}
                y={polarToXY(0, 0, 28, angle)[1]}
                fill="#555" fontSize="3.5" textAnchor="middle" dominantBaseline="central"
                className="font-orbitron">
                {Math.abs(v)}
              </text>
            </g>
          );
        })}

        <text x={polarToXY(0, 0, 23, centerAngle)[0]} y={polarToXY(0, 0, 23, centerAngle)[1]}
          fill="#666" fontSize="3" textAnchor="middle" dominantBaseline="central"
          className="font-orbitron">0</text>

        <GaugeNeedle angle={needleAngle} length={32} backLength={3}
          color={isCharging ? '#22c55e' : '#00cfff'}
          strokeWidth={1.2} capId="curr" capR={2.5} dotR={1} />

        {/* Value — 5 fixed slots: " -60.0" … " 60.0" */}
        <GaugeValueReadout
          value={smoothCurrent.toFixed(1)}
          unit="A"
          yValue={14}
          yUnit={19}
          valueFontSize={6}
          unitFontSize={3}
          valueWeight={600}
        />

        <text x="-26" y="30" fill="#22c55e" fontSize="3" textAnchor="middle" opacity="0.5"
          className="font-orbitron">CHG</text>
        <text x="26" y="30" fill="#00cfff" fontSize="3" textAnchor="middle" opacity="0.5"
          className="font-orbitron">DIS</text>
      </svg>
    </div>
  );
}
