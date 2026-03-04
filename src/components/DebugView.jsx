import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from './DashboardContext';

/**
 * Debug view — replicates the legacy PID table + raw log in React.
 * Also includes trip history access as requested.
 */
export default function DebugView() {
  const { store, tripManager } = useDashboard();
  const [pids, setPids] = useState({});
  const [trips, setTrips] = useState([]);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    // Subscribe to all store updates
    const handler = (key, entry) => {
      if (!aliveRef.current) return;
      setPids(prev => ({ ...prev, [key]: { value: entry.value, timestamp: entry.timestamp } }));
    };
    store.onChange(handler);

    // Initial load of all current values
    const initial = {};
    for (const key of store.keys()) {
      const entry = store.get(key);
      if (entry) initial[key] = { value: entry.value, timestamp: entry.timestamp };
    }
    setPids(initial);

    // Load trip history
    tripManager.getTrips().then(t => {
      if (aliveRef.current) setTrips(t);
    });

    return () => { aliveRef.current = false; };
  }, [store, tripManager]);

  // Refresh ages periodically
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);

  const sortedKeys = Object.keys(pids).sort();

  return (
    <div className="h-full w-full flex flex-col p-2 overflow-hidden">
      <h2 className="text-sm font-bold text-gray-400 mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
        DEBUG — PID DATA
      </h2>

      <div className="flex-1 overflow-auto trip-scroll">
        <table className="debug-table w-full">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Name</th>
              <th>Value</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {sortedKeys.map(key => {
              const parts = key.split(':');
              const protocol = parts[0];
              const name = parts[parts.length - 1];
              const { value, timestamp } = pids[key];
              const age = timestamp ? ((now - timestamp) / 1000).toFixed(1) + 's' : '--';
              const formatted = value === null ? '--' : (Number.isInteger(value) ? value : (value?.toFixed?.(1) ?? '--'));

              return (
                <tr key={key}>
                  <td>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                      protocol === 'toyota' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'
                    }`}>
                      {protocol === 'toyota' ? 'TOYOTA' : 'STD'}
                    </span>
                  </td>
                  <td className="text-gray-300">{name}</td>
                  <td className="pid-value">{formatted}</td>
                  <td className="text-gray-500">{age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Trip history section */}
      {trips.length > 0 && (
        <div className="mt-2 border-t border-gray-800 pt-1">
          <h3 className="text-xs font-bold text-gray-500 mb-1">TRIP HISTORY ({trips.length})</h3>
          <div className="max-h-[100px] overflow-auto trip-scroll text-[10px]">
            {trips.map(t => (
              <div key={t.id} className="flex gap-2 py-0.5 border-b border-gray-800 text-gray-400">
                <span>{new Date(t.startTime).toLocaleDateString()}</span>
                <span>{(t.stats?.distanceKm ?? 0).toFixed(1)} km</span>
                <span>{(t.stats?.avgConsumptionL100km ?? 0).toFixed(1)} L/100</span>
                <span className="text-amber-500">{(t.stats?.fuelCostEur ?? 0).toFixed(2)}€</span>
                {t.meta?.tags?.map(tag => (
                  <span key={tag} className="text-[8px] px-1 rounded bg-gray-800 text-gray-500">{tag}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
