import React from 'react';
import { usePid } from '../DashboardContext';
import { PID_KEYS } from '../../pid-keys.js';
import { pickThresholdBand } from '../ui/thresholds.js';

/**
 * Fuel Level gauge — segmented vertical bar stack, styled like a car fuel indicator.
 * 10 rectangular cells fill bottom-up. Color transitions green→amber→red as fuel drops.
 * Low-fuel: pulsing animation + warning badge below 15%.
 * Distinct visual identity from the thermal arc gauges.
 */

const ZONES = [
  { min: 0,   max: 15,  color: '#ef4444', glow: 'rgba(239,68,68,0.5)',  label: 'CRITIQUE' },
  { min: 15,  max: 30,  color: '#f97316', glow: 'rgba(249,115,22,0.4)', label: 'RÉSERVE'  },
  { min: 30,  max: 100, color: '#22c55e', glow: 'rgba(34,197,94,0.35)', label: 'OK'        },
];

function getZone(pct) {
  return pickThresholdBand(pct, ZONES);
}

/** Return the zone color for a given cell index (0 = bottom). */
function cellZoneColor(cellIndex, numCells) {
  const midPct = ((cellIndex + 0.5) / numCells) * 100;
  if (midPct < 15) return '#ef4444';
  if (midPct < 30) return '#f97316';
  return '#22c55e';
}

/** Minimal fuel-pump silhouette. */
function FuelPumpIcon({ color, size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 24" fill="none">
      {/* Tank body */}
      <rect x="1" y="6" width="12" height="16" rx="1.5" stroke={color} strokeWidth="2" opacity="0.9" />
      {/* Nozzle arm */}
      <path d="M13 9 L17 9 L17 17 L15 17" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {/* Filler cap */}
      <rect x="4" y="2" width="5" height="5" rx="1" stroke={color} strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

const NUM_CELLS = 10;

export default function FuelLevelGauge() {
  const raw = usePid(PID_KEYS.FUEL_TANK_LEVEL);
  const level = raw != null ? Math.max(0, Math.min(100, raw)) : null;
  const displayLevel = level ?? 0;

  const zone = getZone(displayLevel);
  const isLow = displayLevel < 15;
  const filledCells = Math.max(0, Math.round((displayLevel / 100) * NUM_CELLS));

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center py-1 gap-[2px] font-orbitron"
    >
      {isLow && (
        <style>{`
          @keyframes fuel-cell-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.2; }
          }
          .fuel-low-cell { animation: fuel-cell-pulse 0.8s ease-in-out infinite; }
          @keyframes fuel-warn-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
          .fuel-warn-pulse { animation: fuel-warn-pulse 1s ease-in-out infinite; }
        `}</style>
      )}

      {/* Title + pump icon */}
      <div className="flex items-center gap-[3px] shrink-0">
        <span style={{ fontSize: '4.5px', color: '#555', letterSpacing: '1.5px' }}>CARBU</span>
        <div className={isLow ? 'fuel-warn-pulse' : undefined}>
          <FuelPumpIcon color={zone.color} size={9} />
        </div>
      </div>

      {/* F label */}
      <span style={{ fontSize: '4.5px', color: '#666' }}>F</span>

      {/* Segmented cell bar — cell 0 at bottom, fills upward */}
      <div
        className="flex flex-col-reverse gap-[1.5px] w-[60%]"
        style={{ flex: '1 1 0', minHeight: 0 }}
      >
        {Array.from({ length: NUM_CELLS }, (_, i) => {
          const isFilled = i < filledCells;
          const color = cellZoneColor(i, NUM_CELLS);
          const isTopCell = i === filledCells - 1;
          return (
            <div
              key={i}
              className={isFilled && isLow ? 'fuel-low-cell' : undefined}
              style={{
                flex: '1 1 0',
                minHeight: '3px',
                borderRadius: '2px',
                border: `1px solid ${isFilled ? color + '55' : '#1e1e24'}`,
                background: isFilled
                  ? `linear-gradient(90deg, ${color}bb, ${color}ff)`
                  : 'linear-gradient(90deg, #111116, #0d0d12)',
                boxShadow: isFilled
                  ? isTopCell
                    ? `0 0 5px ${color}99, inset 0 1px 0 ${color}44`
                    : `0 0 2px ${color}44`
                  : 'none',
                transition: 'background 0.3s, box-shadow 0.3s',
              }}
            />
          );
        })}
      </div>

      {/* E label */}
      <span style={{ fontSize: '4.5px', color: '#666' }}>E</span>

      {/* Numeric % — fixed-width block prevents layout shift ("0%" … "100%") */}
      <span
        className={isLow ? 'fuel-warn-pulse' : undefined}
        style={{ fontSize: '9px', fontWeight: 700, color: zone.color, lineHeight: 1 }}
      >
        {level != null ? (
          <>
            <span style={{ display: 'inline-block', minWidth: '3ch', textAlign: 'right' }}>
              {Math.round(displayLevel)}
            </span>%
          </>
        ) : '--'}
      </span>

      {/* Zone label */}
      <span
        className={isLow ? 'fuel-warn-pulse' : undefined}
        style={{
          fontSize: '4px',
          color: zone.color,
          letterSpacing: '0.8px',
          padding: '1px 4px',
          border: `0.5px solid ${zone.color}55`,
          borderRadius: '2px',
          background: `${zone.color}18`,
        }}
      >
        {zone.label}
      </span>
    </div>
  );
}
