import React from 'react';
import { useTripData } from '../DashboardContext';

/**
 * Trip bar — full-width slim bar at the bottom, spanning all three columns.
 * Shows: Distance, Duration, Fuel used, Cost, Avg consumption, EV%, Regen recovered.
 * Each value in a small recessed pill. Tapping navigates to Trip History.
 */
export default function TripBar({ onClick }) {
  const trip = useTripData();

  const dist = trip?.distanceKm ?? 0;
  const dur = trip?.durationSeconds ?? 0;
  const fuel = trip?.fuelConsumedL ?? 0;
  const cost = trip?.fuelCostEur ?? 0;
  const avgConso = trip?.avgConsumptionL100km ?? 0;
  const evPct = trip?.evModePercent ?? 0;
  const regen = trip?.regenEnergyWh ?? 0;

  const mins = Math.floor(dur / 60);
  const secs = Math.floor(dur % 60);
  const durStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div
      className="h-[26px] flex-shrink-0 flex items-center justify-center gap-1 px-2 cursor-pointer
        border-t border-gray-800/50"
      style={{ background: 'linear-gradient(to bottom, #0c0c10, #080810)' }}
      onClick={onClick}
    >
      <Pill label="DIST" value={`${dist.toFixed(1)} km`} />
      <Pill label="TIME" value={durStr} />
      <Pill label="FUEL" value={`${fuel.toFixed(2)} L`} />
      <Pill label="COST" value={`€${cost.toFixed(2)}`} color="#f59e0b" />
      <Pill label="AVG" value={`${avgConso.toFixed(1)} L/100`} color="#f97316" />
      <Pill label="EV" value={`${Math.round(evPct)}%`} color="#00cfff" />
      <Pill label="REGEN" value={`${Math.round(regen)} Wh`} color="#22c55e" />
    </div>
  );
}

function Pill({ label, value, color = '#999' }) {
  return (
    <div className="trip-pill flex items-center gap-1">
      <span className="text-[6px] text-gray-600" style={{ fontFamily: 'Orbitron, monospace' }}>
        {label}
      </span>
      <span className="text-[8px] font-bold" style={{ fontFamily: 'Orbitron, monospace', color }}>
        {value}
      </span>
    </div>
  );
}
