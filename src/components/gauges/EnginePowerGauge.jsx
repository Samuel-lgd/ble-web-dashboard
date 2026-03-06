import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, describeArc, generateTicks, BezelDefs, useSmoothedValue, GaugeValueReadout, GaugeBezel, GaugeNeedle, TickMarks } from './gauge-utils.jsx';

/**
 * Engine Power gauge — shows OBD2 PID 0104 (Calculated Engine Load) as 0–100%.
 * 0% = engine idle / off, 100% = engine at maximum output.
 * Arc zones: eco (green 0–40%), normal (amber 40–70%), high (orange 70–85%), redline (red 85–100%).
 */
export default function EnginePowerGauge() {
  const load = usePid(PID_KEYS.ENGINE_LOAD) ?? 0;
  const rpm = usePid(PID_KEYS.ENGINE_RPM) ?? 0;
  const smoothLoad = useSmoothedValue(load);
  const smoothRpm = useSmoothedValue(rpm);

  const needleAngle = valueToAngle(smoothLoad, 0, 100);
  const ticks = generateTicks(0, 100, 10, 5, 42);

  const zoneColor =
    smoothLoad >= 85 ? '#ef4444' :
    smoothLoad >= 70 ? '#f97316' :
    smoothLoad >= 40 ? '#f59e0b' :
    '#22c55e';

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="epwr" />
        </defs>

        <GaugeBezel id="epwr" outerR={48} innerR={45} />

        {/* Arc zones */}
        {/* Eco: 0–40% → green */}
        <path d={describeArc(0, 0, 40, valueToAngle(0, 0, 100), valueToAngle(40, 0, 100))}
          fill="none" stroke="#22c55e" strokeWidth="2.5" opacity="0.25" strokeLinecap="round" />
        {/* Normal: 40–70% → amber */}
        <path d={describeArc(0, 0, 40, valueToAngle(40, 0, 100), valueToAngle(70, 0, 100))}
          fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.30" strokeLinecap="round" />
        {/* High: 70–85% → orange */}
        <path d={describeArc(0, 0, 40, valueToAngle(70, 0, 100), valueToAngle(85, 0, 100))}
          fill="none" stroke="#f97316" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
        {/* Redline: 85–100% → red */}
        <path d={describeArc(0, 0, 40, valueToAngle(85, 0, 100), valueToAngle(100, 0, 100))}
          fill="none" stroke="#ef4444" strokeWidth="2.5" opacity="0.45" strokeLinecap="round" />

        {/* Value arc fill — shows current load level */}
        {smoothLoad > 1 && (
          <path
            d={describeArc(0, 0, 40, valueToAngle(0, 0, 100), needleAngle)}
            fill="none"
            stroke={zoneColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.6"
          />
        )}

        {/* Engraved tick marks */}
        <TickMarks ticks={ticks} labelRadius={32} min={0} max={100} />

        <GaugeNeedle angle={needleAngle} length={36} color="#ff3333"
          glowColor="#ff6644" capId="epwr" />

        {/* Engine power % label */}
        <text x="0" y="-12" fill="#555" fontSize="4" textAnchor="middle"
          className="font-orbitron">
          LOAD %
        </text>

        {/* RPM numeric display */}
        <GaugeValueReadout
          value={Math.round(smoothRpm)}
          unit="RPM"
          yValue={19}
          yUnit={27}
          valueFontSize={13}
          unitFontSize={4}
        />
      </svg>
    </div>
  );
}
