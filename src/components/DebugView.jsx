import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from './DashboardContext';
import { STANDARD_PIDS } from '../../pids-standard.js';
import { TOYOTA_PIDS } from '../../pids-toyota.js';

const pidKey = (pid) => `${pid.protocol}:${pid.header || ''}:${pid.pid}:${pid.name}`;

const ALL_PIDS = [...STANDARD_PIDS, ...TOYOTA_PIDS].map(pid => ({
  key: pidKey(pid),
  name: pid.name,
  unit: pid.unit,
  protocol: pid.protocol,
  pid: pid.pid,
  header: pid.header || '',
}));

/**
 * Debug view — shows all defined PIDs with live values from the store.
 */
export default function DebugView({ onBack }) {
  const { store } = useDashboard();
  const [liveValues, setLiveValues] = useState({});
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const handler = (key, entry) => {
      if (!aliveRef.current) return;
      setLiveValues(prev => ({ ...prev, [key]: { value: entry.value, timestamp: entry.timestamp } }));
    };
    store.onChange(handler);

    // Seed with whatever the store already has
    const initial = {};
    for (const key of store.keys()) {
      const entry = store.get(key);
      if (entry) initial[key] = { value: entry.value, timestamp: entry.timestamp };
    }
    setLiveValues(initial);

    return () => { aliveRef.current = false; };
  }, [store]);

  // Refresh ages periodically
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="h-full w-full flex flex-col p-2 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack}
          className="cluster-back-btn"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          ◀ DASH
        </button>
        <h2 className="text-sm font-bold text-gray-400" style={{ fontFamily: 'Orbitron, monospace' }}>
          DEBUG — PID DATA
        </h2>
      </div>

      <div className="flex-1 overflow-auto trip-scroll">
        <table className="debug-table w-full">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>PID</th>
              <th>Name</th>
              <th>Value</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PIDS.map(({ key, name, unit, protocol, pid, header }) => {
              const live = liveValues[key];
              const value = live?.value ?? null;
              const timestamp = live?.timestamp ?? null;
              const age = timestamp ? ((now - timestamp) / 1000).toFixed(1) + 's' : '--';
              const formatted = value === null
                ? '--'
                : (Number.isInteger(value) ? value : (value?.toFixed?.(2) ?? '--'));
              const display = value === null ? '--' : `${formatted}${unit ? ' ' + unit : ''}`;

              return (
                <tr key={key}>
                  <td>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                      protocol === 'toyota' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'
                    }`}>
                      {protocol === 'toyota' ? 'TOYOTA' : 'STD'}
                    </span>
                    {header && (
                      <span className="ml-1 text-[9px] text-gray-500">{header}</span>
                    )}
                  </td>
                  <td className="text-gray-500 font-mono text-[10px]">{pid}</td>
                  <td className="text-gray-300">{name}</td>
                  <td className="pid-value">{display}</td>
                  <td className="text-gray-500">{age}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
