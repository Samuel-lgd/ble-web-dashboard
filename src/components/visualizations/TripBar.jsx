import React from 'react';
import { useTripData } from '../DashboardContext';

/**
 * Trip bar — full-width slim bar at the bottom, spanning all three columns.
 * Shows recording state + live trip KPIs.
 * Pulsing red dot when a trip is active.
 */
export default function TripBar({ onClick }) {
  const trip = useTripData();

  const isRecording = trip !== null;
  const dist    = trip?.distanceKm ?? 0;
  const dur     = trip?.durationSeconds ?? 0;
  const fuel    = trip?.fuelConsumedL ?? 0;
  const cost    = trip?.fuelCostEur ?? 0;
  const avgConso = trip?.avgConsumptionL100km ?? 0;
  const evPct   = trip?.evModePercent ?? 0;
  const regen   = trip?.regenEnergyWh ?? 0;

  const mins = Math.floor(dur / 60);
  const secs = Math.floor(dur % 60);
  const durStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div
      className="h-[28px] flex-shrink-0 flex items-center gap-1.5 px-2 cursor-pointer border-t border-gray-800/50"
      style={{ background: 'linear-gradient(to bottom, #0c0c10, #080810)' }}
      onClick={onClick}
    >
      {/* Recording state indicator */}
      {isRecording ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="trip-rec-dot" />
          <span className="text-[6px] text-red-500/80" style={{ fontFamily: 'Orbitron, monospace' }}>
            REC
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0 opacity-30">
          <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
          <span className="text-[6px] text-gray-600" style={{ fontFamily: 'Orbitron, monospace' }}>
            TRIPS
          </span>
        </div>
      )}

      <div className="w-px h-3 bg-gray-800/80 flex-shrink-0" />

      <Pill label="DIST"  value={`${dist.toFixed(1)} km`}         dim={!isRecording} />
      <Pill label="TIME"  value={durStr}                           dim={!isRecording} />
      <Pill label="FUEL"  value={`${fuel.toFixed(2)} L`}           dim={!isRecording} />
      <Pill label="COST"  value={`€${cost.toFixed(2)}`}            color="#f59e0b" dim={!isRecording} />
      <Pill label="AVG"   value={`${avgConso.toFixed(1)} L/100`}   color="#f97316" dim={!isRecording} />
      <Pill label="EV"    value={`${Math.round(evPct)}%`}          color="#00cfff" dim={!isRecording} />
      <Pill label="REGEN" value={`${Math.round(regen)} Wh`}        color="#22c55e" dim={!isRecording} />
    </div>
  );
}

function Pill({ label, value, color = '#999', dim = false }) {
  return (
    <div className="trip-pill flex items-center gap-1" style={{ opacity: dim ? 0.35 : 1 }}>
      <span className="text-[6px] text-gray-600" style={{ fontFamily: 'Orbitron, monospace' }}>
        {label}
      </span>
      <span className="text-[8px] font-bold" style={{ fontFamily: 'Orbitron, monospace', color }}>
        {value}
      </span>
    </div>
  );
}
