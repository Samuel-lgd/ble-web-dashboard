import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';
import { pickThresholdBand } from './ui/thresholds.js';
import { polarToXY, BezelDefs, GaugeBezel, GlowFilter } from './gauges/gauge-utils.jsx';

/**
 * Engine thermal status — replaces FuelConsumptionGauge in left column.
 * Shows the full thermal lifecycle of a Toyota hybrid engine:
 *   Cold (<40°C) → Warm-up (40–70°C) → Normal (70–95°C) → Hot (95–105°C) → Critical (>105°C)
 * Each phase has a distinct visual identity. At-a-glance clarity is key for
 * hybrid driving: the engine shuts off once warm.
 */

const PHASES = [
  { label: 'COLD',     min: -Infinity, max: 40,  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  icon: '❄',  desc: 'Warming up' },
  { label: 'WARM-UP',  min: 40,        max: 70,  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '↗',  desc: 'Heating' },
  { label: 'NORMAL',   min: 70,        max: 95,  color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: '✓',  desc: 'Optimal' },
  { label: 'HOT',      min: 95,        max: 105, color: '#f97316', bg: 'rgba(249,115,22,0.15)', icon: '▲',  desc: 'Elevated' },
  { label: 'CRITICAL', min: 105,       max: Infinity, color: '#ef4444', bg: 'rgba(239,68,68,0.18)', icon: '!', desc: 'Alert' },
];

function getPhase(temp) {
  return pickThresholdBand(temp, PHASES);
}

export default function EngineThermalStatus() {
  const temp = usePid(PID_KEYS.COOLANT_TEMP) ?? 0;
  const phase = getPhase(temp);

  // Normalized fill for the vertical progress bar (0–120°C range for display)
  const displayMin = 0, displayMax = 120;
  const clamped = Math.max(displayMin, Math.min(displayMax, temp));
  const fillPct = ((clamped - displayMin) / (displayMax - displayMin)) * 100;

  // Phase zone positions for the bar (as percentages of total bar height)
  const zoneBreaks = [
    { pct: (40 / 120) * 100, color: '#3b82f6' },   // Cold: 0→40
    { pct: (30 / 120) * 100, color: '#f59e0b' },   // Warm-up: 40→70
    { pct: (25 / 120) * 100, color: '#22c55e' },   // Normal: 70→95
    { pct: (10 / 120) * 100, color: '#f97316' },   // Hot: 95→105
    { pct: (15 / 120) * 100, color: '#ef4444' },   // Critical: 105→120
  ];

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="-44 -44 88 88" className="w-full h-full" style={{ overflow: 'visible' }}>
        <defs>
          <BezelDefs id="eng" />
          <GlowFilter id="eng-glow" x="-50%" y="-50%" width="200%" height="200%" />
          <linearGradient id="eng-bar-fill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="33%" stopColor="#f59e0b" />
            <stop offset="58%" stopColor="#22c55e" />
            <stop offset="79%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        {/* Chrome bezel */}
        <GaugeBezel id="eng" outerR={42} innerR={39} outerStrokeWidth={0.6} shadowStrokeWidth={1} />

        {/* Phase indicator ring — 5 segments around the perimeter */}
        {(() => {
          const segments = [];
          const arcRadius = 35;
          const totalSweep = 270; // -135 to +135
          const startAngle = -135;
          let currentAngle = startAngle;

          const zones = [
            { sweep: (40 / 120) * totalSweep, color: '#3b82f6', opacity: 0.3 },
            { sweep: (30 / 120) * totalSweep, color: '#f59e0b', opacity: 0.3 },
            { sweep: (25 / 120) * totalSweep, color: '#22c55e', opacity: 0.3 },
            { sweep: (10 / 120) * totalSweep, color: '#f97316', opacity: 0.3 },
            { sweep: (15 / 120) * totalSweep, color: '#ef4444', opacity: 0.3 },
          ];

          zones.forEach((z, i) => {
            const endAngle = currentAngle + z.sweep;
            const d = `M ${polarToXY(0, 0, arcRadius, currentAngle).join(' ')} A ${arcRadius} ${arcRadius} 0 ${z.sweep > 180 ? 1 : 0} 1 ${polarToXY(0, 0, arcRadius, endAngle).join(' ')}`;
            // Determine if this zone is the active one
            const zoneMinTemp = [0, 40, 70, 95, 105][i];
            const zoneMaxTemp = [40, 70, 95, 105, 120][i];
            const isActive = temp >= zoneMinTemp && temp < zoneMaxTemp;

            segments.push(
              <path key={i} d={d}
                fill="none"
                stroke={z.color}
                strokeWidth={isActive ? "3.5" : "2"}
                strokeLinecap="round"
                opacity={isActive ? 0.9 : 0.2}
                filter={isActive ? "url(#eng-glow)" : undefined}
              />
            );
            currentAngle = endAngle;
          });
          return segments;
        })()}

        {/* Active fill arc from start to current temperature */}
        {temp > 0 && (() => {
          const tempAngle = -135 + (Math.min(clamped, 120) / 120) * 270;
          const d = `M ${polarToXY(0, 0, 35, -135).join(' ')} A 35 35 0 ${tempAngle - (-135) > 180 ? 1 : 0} 1 ${polarToXY(0, 0, 35, tempAngle).join(' ')}`;
          return (
            <path d={d}
              fill="none"
              stroke={phase.color}
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.7"
              filter="url(#eng-glow)"
            />
          );
        })()}

        {/* Temperature marker — small red rectangle on the arc */}
        {(() => {
          const tempAngle = -135 + (Math.min(clamped, 120) / 120) * 270;
          const [mx, my] = polarToXY(0, 0, 35, tempAngle);
          const rad = ((tempAngle - 90) * Math.PI) / 180;
          const rotDeg = tempAngle;
          return (
            <rect
              x={mx - 1} y={my - 3} width="2" height="6" rx="0.5"
              fill="#ef4444" opacity="0.95"
              transform={`rotate(${rotDeg}, ${mx}, ${my})`}
            >
            </rect>
          );
        })()}

        {/* Tick marks at zone boundaries */}
        {[0, 40, 70, 95, 105, 120].map(t => {
          const angle = -135 + (t / 120) * 270;
          const [ox, oy] = polarToXY(0, 0, 38, angle);
          const [ix, iy] = polarToXY(0, 0, 32, angle);
          return (
            <line key={t} x1={ix} y1={iy} x2={ox} y2={oy}
              stroke="#555" strokeWidth="0.6" />
          );
        })}

        {/* Temperature number — large, prominent */}
        <text
          x="0" y="-8"
          fill={phase.color}
          fontSize="14"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-orbitron" style={{ fontWeight: 700 }}
        >
          {Math.round(temp)}°
        </text>

        {/* Phase label — visually distinct */}
        <rect
          x="-18" y="2" width="36" height="11" rx="2"
          fill={phase.bg}
          stroke={phase.color}
          strokeWidth="0.5"
          opacity="0.8"
        />
        <text
          x="0" y="9"
          fill={phase.color}
          fontSize="5"
          textAnchor="middle"
          dominantBaseline="reset-size"
          className="font-orbitron" style={{ fontWeight: 700 }}
        >
          {phase.label}
        </text>

        {/* ENGINE label */}
        <text
          x="0" y="28"
          fill="#555"
          fontSize="3.5"
          textAnchor="middle"
          className="font-orbitron"
        >
          ENGINE TEMP
        </text>
      </svg>
    </div>
  );
}
