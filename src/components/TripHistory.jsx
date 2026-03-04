import React, { useState, useEffect } from 'react';
import { useDashboard } from './DashboardContext';

const TAG_COLORS = {
  highway: 'bg-blue-900 text-blue-300',
  city: 'bg-amber-900 text-amber-300',
  'cold-start': 'bg-cyan-900 text-cyan-300',
  'ev-dominant': 'bg-green-900 text-green-300',
  aggressive: 'bg-red-900 text-red-300',
  'long-trip': 'bg-purple-900 text-purple-300',
  'short-trip': 'bg-gray-800 text-gray-400',
  idling: 'bg-yellow-900 text-yellow-300',
};

/**
 * Trip History screen — vertically scrollable list of past trips.
 * Each card shows: date, distance, duration, fuel cost, auto-tags.
 * Tap to expand: full stats + GPX export button.
 * Fuel price setting accessible via gear icon.
 */
export default function TripHistory({ onBack }) {
  const { tripManager, config } = useDashboard();
  const [trips, setTrips] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [fuelPrice, setFuelPrice] = useState(config.get('fuelPricePerLiter'));

  useEffect(() => {
    tripManager.getTrips().then(setTrips);
  }, [tripManager]);

  const handleExport = async (id, format) => {
    try {
      const data = await tripManager.exportTrip(id, format);
      const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trip-${id.slice(0, 8)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleSavePrice = () => {
    config.set('fuelPricePerLiter', parseFloat(fuelPrice) || 1.85);
    setShowSettings(false);
  };

  return (
    <div className="h-full w-full flex flex-col p-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button onClick={onBack}
            className="text-[10px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white bg-black/40"
            style={{ fontFamily: 'Orbitron, monospace' }}>
            ← BACK
          </button>
          <h2 className="text-sm font-bold text-gray-300" style={{ fontFamily: 'Orbitron, monospace' }}>
            TRIP HISTORY
          </h2>
          <span className="text-[10px] text-gray-600">{trips.length} trips</span>
        </div>
        <button onClick={() => setShowSettings(!showSettings)}
          className="text-[12px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-amber-400 bg-black/40">
          ⚙
        </button>
      </div>

      {/* Fuel price settings */}
      {showSettings && (
        <div className="panel-recess p-2 mb-2 flex items-center gap-2">
          <span className="text-[10px] text-gray-400" style={{ fontFamily: 'Orbitron, monospace' }}>
            Fuel €/L:
          </span>
          <input
            type="number"
            step="0.01"
            value={fuelPrice}
            onChange={e => setFuelPrice(e.target.value)}
            className="w-16 bg-black border border-gray-700 text-gray-200 text-[11px] px-1 py-0.5 rounded"
            style={{ fontFamily: 'Orbitron, monospace' }}
          />
          <button onClick={handleSavePrice}
            className="text-[9px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/50 text-amber-400"
            style={{ fontFamily: 'Orbitron, monospace' }}>
            SAVE
          </button>
        </div>
      )}

      {/* Trip list */}
      <div className="flex-1 overflow-auto trip-scroll">
        {trips.length === 0 && (
          <div className="text-center text-gray-600 text-sm mt-8" style={{ fontFamily: 'Orbitron, monospace' }}>
            No trips recorded yet
          </div>
        )}
        {trips.map(trip => {
          const s = trip.stats || {};
          const isExpanded = expanded === trip.id;
          const date = new Date(trip.startTime);

          return (
            <div key={trip.id}
              className="panel-recess mb-1 cursor-pointer transition-colors hover:border-gray-600"
              onClick={() => setExpanded(isExpanded ? null : trip.id)}>
              {/* Summary row */}
              <div className="flex items-center gap-2 p-1.5">
                <span className="text-[10px] text-gray-400 min-w-[60px]"
                  style={{ fontFamily: 'Orbitron, monospace' }}>
                  {date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  {' '}
                  {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[10px] text-gray-200 font-bold min-w-[45px]"
                  style={{ fontFamily: 'Orbitron, monospace' }}>
                  {(s.distanceKm ?? 0).toFixed(1)} km
                </span>
                <span className="text-[10px] text-gray-400 min-w-[38px]"
                  style={{ fontFamily: 'Orbitron, monospace' }}>
                  {Math.floor((s.durationSeconds ?? 0) / 60)}min
                </span>
                <span className="text-[10px] text-amber-400 font-bold min-w-[38px]"
                  style={{ fontFamily: 'Orbitron, monospace' }}>
                  €{(s.fuelCostEur ?? 0).toFixed(2)}
                </span>

                {/* Tags */}
                <div className="flex gap-0.5 flex-wrap flex-1">
                  {(trip.meta?.tags ?? []).map(tag => (
                    <span key={tag}
                      className={`text-[7px] px-1 py-0 rounded font-bold ${TAG_COLORS[tag] ?? 'bg-gray-800 text-gray-500'}`}>
                      {tag}
                    </span>
                  ))}
                </div>

                <span className="text-gray-600 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-gray-800 p-2">
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[9px] mb-2">
                    <Stat label="Avg Speed" value={`${(s.avgSpeedKmh ?? 0).toFixed(0)} km/h`} />
                    <Stat label="Max Speed" value={`${(s.maxSpeedKmh ?? 0).toFixed(0)} km/h`} />
                    <Stat label="Avg L/100" value={`${(s.avgConsumptionL100km ?? 0).toFixed(1)}`} color="#f97316" />
                    <Stat label="Fuel Used" value={`${(s.fuelConsumedL ?? 0).toFixed(3)} L`} />
                    <Stat label="EV Mode" value={`${(s.evModePercent ?? 0).toFixed(0)}%`} color="#00cfff" />
                    <Stat label="Regen" value={`${Math.round(s.regenEnergyWh ?? 0)} Wh`} color="#22c55e" />
                    <Stat label="SOC Δ" value={`${(s.socDelta ?? 0) > 0 ? '+' : ''}${(s.socDelta ?? 0).toFixed(1)}%`} />
                    <Stat label="CO₂" value={`${Math.round(s.co2EmittedGrams ?? 0)}g`} />
                    <Stat label="CO₂ Saved" value={`${Math.round(s.savedCo2Grams ?? 0)}g`} color="#22c55e" />
                  </div>

                  {/* Export buttons */}
                  <div className="flex gap-1">
                    {['gpx', 'csv', 'json'].map(fmt => (
                      <button key={fmt}
                        onClick={e => { e.stopPropagation(); handleExport(trip.id, fmt); }}
                        className="text-[8px] px-2 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-white bg-black/40"
                        style={{ fontFamily: 'Orbitron, monospace' }}>
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color = '#999' }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500" style={{ fontFamily: 'Orbitron, monospace' }}>{label}</span>
      <span className="font-bold" style={{ fontFamily: 'Orbitron, monospace', color }}>{value}</span>
    </div>
  );
}
