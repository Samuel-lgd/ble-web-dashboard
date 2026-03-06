import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { valueToAngle, describeArc, generateTicks, BezelDefs, useSmoothedValue, GaugeValueReadout, GaugeBezel, GaugeNeedle, TickMarks } from './gauge-utils.jsx';

/**
 * RPM gauge — large circular with chrome bezel, analog needle, engraved tick marks.
 * Range 0–6000. Arc zones: normal (amber), high (orange), redline (red).
 */
export default function RpmGauge() {
  const rpm = usePid(PID_KEYS.ENGINE_RPM) ?? 0;
  const smoothRpm = useSmoothedValue(rpm);

  const needleAngle = valueToAngle(smoothRpm, 0, 6000);
  const ticks = generateTicks(0, 6000, 1000, 500, 42);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="rpm" />
        </defs>

        <GaugeBezel id="rpm" outerR={48} innerR={45} />

        {/* Arc zones */}
        {/* Normal: 0-4000 -> amber */}
        <path d={describeArc(0, 0, 40, valueToAngle(0, 0, 6000), valueToAngle(4000, 0, 6000))}
          fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.25" strokeLinecap="round" />
        {/* High: 4000-5000 -> orange */}
        <path d={describeArc(0, 0, 40, valueToAngle(4000, 0, 6000), valueToAngle(5000, 0, 6000))}
          fill="none" stroke="#f97316" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
        {/* Redline: 5000-6000 -> red */}
        <path d={describeArc(0, 0, 40, valueToAngle(5000, 0, 6000), valueToAngle(6000, 0, 6000))}
          fill="none" stroke="#ef4444" strokeWidth="2.5" opacity="0.45" strokeLinecap="round" />

        {/* Value arc fill — shows current RPM level */}
        {smoothRpm > 50 && (
          <path
            d={describeArc(0, 0, 40, valueToAngle(0, 0, 6000), needleAngle)}
            fill="none"
            stroke={smoothRpm > 5000 ? '#ef4444' : smoothRpm > 4000 ? '#f97316' : '#f59e0b'}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.6"
          />
        )}

        {/* Engraved tick marks */}
        <TickMarks ticks={ticks} labelRadius={32} min={0} max={6000}
          fontSize="5.2" labelFn={(v) => v / 1000} />

        <GaugeNeedle angle={needleAngle} length={36} color="#ff3333"
          glowColor="#ff6644" capId="rpm" />

        {/* RPM numeric display — large for glanceability */}
        <GaugeValueReadout
          value={Math.round(smoothRpm)}
          unit="RPM"
          yValue={21}
          yUnit={29}
          valueFontSize={14}
          unitFontSize={4}
        />
      </svg>
    </div>
  );
}
