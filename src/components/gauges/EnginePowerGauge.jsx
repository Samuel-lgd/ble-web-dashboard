import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import {
  valueToAngle, describeArc, generateTicks, polarToXY, ORBITRON,
  BezelDefs, useSmoothedValue, GaugeBezel, GaugeNeedle, TickMarks,
  FixedNumericText,
} from './gauge-utils.jsx';

/**
 * Engine Power gauge
 *  – Main gauge  : RPM 0–6 000, needle tracks engine RPM.
 *    Zones — eco (green 0–2 500), normal (amber 2 500–4 000),
 *            high (orange 4 000–5 200), redline (red 5 200–6 000).
 *  – Sub-gauge   : Engine Load 0–100 %, arc fill inset at bottom.
 *    Zones — eco (green 0–40 %), normal (amber 40–70 %),
 *            high (orange 70–85 %), max (red 85–100 %).
 */

const MAX_RPM = 6000;

// Sub-gauge geometry: arch centred at (0, 27), arc radius 10,
// sweep −110° → +110° (angle convention from gauge-utils polarToXY).
const SCX = 0, SCY = 27, SR = 10;
const SUB_A0 = -110, SUB_A1 = 110;

const subAngle = (pct) => valueToAngle(pct, 0, 100, SUB_A0, SUB_A1);

// RPM arc fill colour (informational, not alarmist).
// On a Toyota THS Atkinson engine, 4 000 RPM is routine during acceleration —
// only 4 500+ is genuinely elevated, and true redline starts at 5 500.
const rpmArcColor = (rpm) =>
  rpm >= 5500 ? '#ef4444' :
  rpm >= 4500 ? '#f59e0b' : '#38bdf8';

// Load is purely informational on a hybrid: 80% load at 2 000 RPM is normal
// when the electric motor is assisting. No danger colour coding.
const LOAD_COLOR = '#dd9933';

export default function EnginePowerGauge() {
  const load = usePid(PID_KEYS.ENGINE_LOAD) ?? 0;
  const rpm  = usePid(PID_KEYS.ENGINE_RPM)  ?? 0;

  const smoothLoad = useSmoothedValue(load);
  const smoothRpm  = useSmoothedValue(rpm);

  const needleAngle = valueToAngle(smoothRpm, 0, MAX_RPM);
  const ticks       = generateTicks(0, MAX_RPM, 1000, 200, 42);

  const rpmCol = rpmArcColor(smoothRpm);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="epwr" />
        </defs>

        <GaugeBezel id="epwr" outerR={48} innerR={45} />

        {/* ── RPM arc zones (background) ──
             0–4 500 : bleu neutre — plage normale THS
             4 500–5 500 : ambre — RPM élevé
             5 500–6 000 : rouge — redline réel */}
        <path d={describeArc(0, 0, 40, valueToAngle(0,    0, MAX_RPM), valueToAngle(4500, 0, MAX_RPM))}
          fill="none" stroke="#38bdf8" strokeWidth="2.5" opacity="0.18" strokeLinecap="round" />
        <path d={describeArc(0, 0, 40, valueToAngle(4500, 0, MAX_RPM), valueToAngle(5500, 0, MAX_RPM))}
          fill="none" stroke="#f59e0b" strokeWidth="2.5" opacity="0.30" strokeLinecap="round" />
        <path d={describeArc(0, 0, 40, valueToAngle(5500, 0, MAX_RPM), valueToAngle(MAX_RPM, 0, MAX_RPM))}
          fill="none" stroke="#ef4444" strokeWidth="2.5" opacity="0.45" strokeLinecap="round" />

        {/* RPM live fill arc */}
        {smoothRpm > 80 && (
          <path
            d={describeArc(0, 0, 40, valueToAngle(0, 0, MAX_RPM), needleAngle)}
            fill="none" stroke={rpmCol} strokeWidth="2.5" strokeLinecap="round" opacity="0.65"
          />
        )}

        {/* Tick marks — labels 0–6 (each unit = ×1 000 RPM) */}
        <TickMarks
          ticks={ticks} labelRadius={33}
          min={0} max={MAX_RPM}
          labelFn={(v) => v / 1000}
          fill="#888" fontSize="4"
        />

        {/* Gauge title */}
        <text x="0" y="-18" fill="#555" fontSize="3" textAnchor="middle" style={ORBITRON}>
          ×1000 RPM
        </text>

        {/* Needle — tracks RPM, fixed red */}
        <GaugeNeedle
          angle={needleAngle} length={36}
          color="#ff3333" glowColor="#ff6644" glowOpacity={0.2}
          capId="epwr"
        />

        {/* RPM numeric readout */}
        <FixedNumericText
          text={String(Math.round(smoothRpm))}
          x={0} y={7} fontSize={9.5} fill="#ddd" fontWeight={700}
        />

        {/* ══════════════════════════════════════════
            Sub-gauge: Engine Load %
            Rendered after needle so it overlays at
            extreme RPM when the needle sweeps down.
            ══════════════════════════════════════════ */}

        {/* Sub-gauge inset background */}
        <ellipse cx={SCX} cy={SCY} rx={12} ry={12}
          fill="#060608" stroke="#2a2a2e" strokeWidth="0.6" />

        {/* Sub-gauge background track — couleur neutre unique, pas de code danger */}
        <path d={describeArc(SCX, SCY, SR, subAngle(0), subAngle(100))}
          fill="none" stroke="#f8ab38" strokeWidth="2" opacity="0.15" strokeLinecap="round" />

        {/* Sub-gauge live fill arc */}
        {smoothLoad > 1 && (
          <path
            d={describeArc(SCX, SCY, SR, subAngle(0), subAngle(smoothLoad))}
            fill="none" stroke={LOAD_COLOR} strokeWidth="2" strokeLinecap="round" opacity="0.82"
          />
        )}

        {/* Sub-gauge endpoint tick marks */}
        {[-0, 100].map(v => {
          const a = subAngle(v);
          const [ox, oy] = polarToXY(SCX, SCY, SR + 0.8, a);
          const [ix, iy] = polarToXY(SCX, SCY, SR - 2,   a);
          return <line key={v} x1={ix} y1={iy} x2={ox} y2={oy} stroke="#555" strokeWidth="0.8" />;
        })}

        {/* Sub-gauge label */}
        <text x={SCX} y={SCY - 3.5} fill="#555" fontSize="2.4"
          textAnchor="middle" dominantBaseline="central" style={ORBITRON}>
          LOAD
        </text>

        {/* Sub-gauge load % value */}
        <FixedNumericText
          text={`${Math.round(smoothLoad)}%`}
          x={SCX} y={SCY + 3.5} fontSize={5} fill={LOAD_COLOR} fontWeight={700}
        />
      </svg>
    </div>
  );
}
