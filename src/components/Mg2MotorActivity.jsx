import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';
import { valueToAngle, polarToXY, describeArc, BezelDefs } from './gauge-utils.jsx';

/**
 * MG2 Motor activity — arc gauge showing drive motor torque output in Nm.
 * Electric blue when driving. Green when in regen (arc inverts direction).
 * Clearest indicator of what the electric motor is doing moment to moment.
 */
export default function Mg2MotorActivity() {
  const mg2Torque = usePid(PID_KEYS.MG2_TORQUE) ?? 0;
  const regenTorque = usePid(PID_KEYS.REGEN_BRAKE_TORQUE) ?? 0;

  const isRegen = regenTorque > 2 || mg2Torque < -2;
  const torqueAbs = isRegen ? regenTorque : Math.abs(mg2Torque);
  const gaugeMax = 160; // Nm max for MG2

  // Arc: from center to value
  const centerAngle = 0; // 12 o'clock
  const arcExtent = (Math.min(torqueAbs, gaugeMax) / gaugeMax) * 120; // max 120° sweep

  // Drive: arc extends right (clockwise). Regen: arc extends left (counter-clockwise).
  const arcStart = isRegen ? centerAngle - arcExtent : centerAngle;
  const arcEnd = isRegen ? centerAngle : centerAngle + arcExtent;

  const color = isRegen ? '#22c55e' : '#00cfff';
  const label = isRegen ? 'REGEN' : 'DRIVE';

  return (
    <div className="w-full h-full panel-recess flex flex-col items-center justify-center p-0.5">
      <svg viewBox="-36 -36 72 72" className="w-full flex-1">
        <defs>
          <BezelDefs id="mg2" />
        </defs>

        {/* Mini bezel */}
        <circle cx="0" cy="0" r="34" fill="url(#mg2-bezel-ring)" stroke="#1a1a1c" strokeWidth="0.5" />
        <circle cx="0" cy="0" r="31" fill="url(#mg2-face)" />

        {/* Background arc track */}
        <path d={describeArc(0, 0, 26, -120, 120)}
          fill="none" stroke="#111" strokeWidth="3" opacity="0.4" strokeLinecap="round" />

        {/* Active arc */}
        {torqueAbs > 1 && (
          <path d={describeArc(0, 0, 26, arcStart, arcEnd)}
            fill="none" stroke={color} strokeWidth="3" opacity="0.7" strokeLinecap="round" />
        )}

        {/* Center marker */}
        {(() => {
          const [cx, cy] = polarToXY(0, 0, 26, centerAngle);
          return <circle cx={cx} cy={cy} r="1" fill="#666" />;
        })()}

        {/* Torque value */}
        <text x="0" y="2" fill="#e0e0e0" fontSize="8" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 700 }}>
          {Math.round(torqueAbs)}
        </text>
        <text x="0" y="9" fill="#555" fontSize="3" textAnchor="middle"
          style={{ fontFamily: 'Orbitron, monospace' }}>Nm</text>

        {/* Mode label */}
        <text x="0" y="18" fill={color} fontSize="3.5" textAnchor="middle" opacity="0.7"
          style={{ fontFamily: 'Orbitron, monospace', fontWeight: 600 }}>
          MG2 {label}
        </text>
      </svg>
    </div>
  );
}
