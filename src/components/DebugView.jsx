import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from './DashboardContext';
import { PID_KEYS } from '../pids/keys.js';
import {
  UI_POLL_KEYS,
  TRIP_POLL_KEYS,
  DEFAULT_POLL_KEYS,
  buildDemandByKey,
  buildRequestedPidCatalog,
} from '../pids/selection.js';
import {
  getAllAvailablePidEntries,
  getPidDefinitionByKey,
} from '../pids/catalog.js';

const REQUESTED = buildRequestedPidCatalog();
const REQUESTED_SET = new Set(DEFAULT_POLL_KEYS);
const DEMAND_BY_KEY = buildDemandByKey();
const ALL_ENTRIES = getAllAvailablePidEntries().map((entry) => ({
  ...entry,
  consumers: DEMAND_BY_KEY.get(entry.key) || [],
  required: REQUESTED_SET.has(entry.key),
}));
const CONSUMER_LABELS = {
  ui: 'UI',
  trip: 'TRIP',
};
const SOC_VALIDATION_PID = getPidDefinitionByKey(PID_KEYS.HV_BATTERY_SOC_HR);

/**
 * Debug view — shows all defined PIDs with live values from the store.
 */
export default function DebugView({ onBack }) {
  const { store, elm, pidManager } = useDashboard();
  const [liveValues, setLiveValues] = useState({});
  const [pollMetrics, setPollMetrics] = useState(null);
  const [registeredPids, setRegisteredPids] = useState([]);
  const [activePidKeys, setActivePidKeys] = useState(new Set());

  const [expandedPid, setExpandedPid] = useState(null);
  const [showStats, setShowStats] = useState(true);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const aliveRef = useRef(true);
  const requestedByConsumer = {
    ui: UI_POLL_KEYS.length,
    trip: TRIP_POLL_KEYS.length,
  };
  const TRANSPORT_MODE = localStorage.getItem('transportMode') || 'ble';

  useEffect(() => {
    aliveRef.current = true;

    const handler = (key, entry) => {
      if (!aliveRef.current) return;
      setLiveValues(prev => ({ ...prev, [key]: { value: entry.value, timestamp: entry.timestamp } }));
    };
    const unsub = store.onChange(handler);

    // Seed with whatever the store already has
    const initial = {};
    for (const key of store.keys()) {
      const entry = store.get(key);
      if (entry) initial[key] = { value: entry.value, timestamp: entry.timestamp };
    }
    setLiveValues(initial);

    return () => {
      aliveRef.current = false;
      unsub();
    };
  }, [store]);

  useEffect(() => {
    if (!pidManager || typeof pidManager.onMetrics !== 'function') return;
    const handle = (metrics) => setPollMetrics(metrics);
    pidManager.onMetrics(handle);
    if (typeof pidManager.getMetricsSnapshot === 'function') {
      setPollMetrics(pidManager.getMetricsSnapshot());
    }
    if (typeof pidManager.getRegisteredPids === 'function') {
      setRegisteredPids(pidManager.getRegisteredPids());
    }
    if (typeof pidManager.getActivePidKeys === 'function') {
      setActivePidKeys(new Set(pidManager.getActivePidKeys()));
    }
  }, [pidManager]);

  // Refresh ages periodically
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);

  const refreshActiveKeys = () => {
    if (!pidManager || typeof pidManager.getActivePidKeys !== 'function') return;
    setActivePidKeys(new Set(pidManager.getActivePidKeys()));
  };

  const togglePidActive = (key) => {
    if (!pidManager) return;
    const isActive = activePidKeys.has(key);
    if (isActive && typeof pidManager.deactivatePid === 'function') {
      pidManager.deactivatePid(key);
    }
    if (!isActive && typeof pidManager.activatePid === 'function') {
      pidManager.activatePid(key);
    }
    refreshActiveKeys();
  };



  return (
    <div className="h-full w-full flex flex-col p-1 md:p-2 overflow-hidden">
      {/* Header: Title + nav buttons (responsive) */}
      <div className="flex flex-col gap-1 mb-1">
        <div className="flex items-center gap-1">
          <h2 className="text-xs md:text-sm font-bold text-gray-400 flex-1" style={{ fontFamily: 'Orbitron, monospace' }}>
            DEBUG - PID CATALOG
          </h2>
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={onBack}
            className="cluster-back-btn text-xs md:text-sm"
            style={{ fontFamily: 'Orbitron, monospace', padding: '4px 8px' }}>
            ◀ BACK
          </button>
          <button
            onClick={() => {
              const newMode = TRANSPORT_MODE === 'ble' ? 'mock' : 'ble';
              localStorage.setItem('transportMode', newMode);
              window.location.reload();
            }}
            className="cluster-nav-btn cluster-nav-btn--blue text-xs md:text-sm"
            style={{ fontFamily: 'Orbitron, monospace', padding: '4px 8px' }}
          >
            {TRANSPORT_MODE === 'ble' ? '🔵 BLE' : '🎮 MOCK'}
          </button>

          <button
            onClick={() => setShowStats(!showStats)}
            className="cluster-nav-btn cluster-nav-btn--blue text-xs md:text-sm"
            style={{ fontFamily: 'Orbitron, monospace', padding: '4px 8px' }}
          >
            {showStats ? '−' : '+'} STAT
          </button>
        </div>
      </div>

      {/* Stats section (collapsible) */}
      {showStats && (
        <div className="mb-1 p-1 md:p-2 rounded border border-gray-700 bg-gray-900/60 text-[9px] md:text-[10px] text-gray-300">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1 md:gap-2">
            <div><span className="text-gray-500">Defs:</span> <span className="text-cyan-300 font-bold">{ALL_ENTRIES.length}</span></div>
            <div><span className="text-gray-500">Req:</span> <span className="text-cyan-300 font-bold">{DEFAULT_POLL_KEYS.length}</span></div>
            <div><span className="text-gray-500">Registered:</span> <span className="text-cyan-300 font-bold">{registeredPids.length}</span></div>
            <div><span className="text-gray-500">Active:</span> <span className="text-cyan-300 font-bold">{activePidKeys.size}</span></div>
            <div className="md:col-span-2 lg:col-span-2">
              <button
                onClick={() => {
                  if (!pidManager || typeof pidManager.setActivePidKeys !== 'function') return;
                  pidManager.setActivePidKeys(DEFAULT_POLL_KEYS);
                  refreshActiveKeys();
                }}
                className="cluster-nav-btn cluster-nav-btn--blue text-[8px]"
                style={{ fontFamily: 'Orbitron, monospace', padding: '2px 4px' }}
              >
                RESET DEFAULT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Polling metrics (collapsible) */}
      {pollMetrics && (
        <div className="mb-1 p-1 md:p-2 rounded border border-gray-700 bg-gray-900/60">
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="text-[9px] md:text-[10px] text-gray-300 font-bold mb-1"
            style={{ fontFamily: 'Orbitron, monospace' }}
          >
            {showMetrics ? '−' : '+'} POLLING METRICS
          </button>
          {showMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-2 text-[8px] md:text-[9px] text-gray-300">
              <div><span className="text-gray-500">Total:</span> <span className="text-cyan-300">{pollMetrics.pollsTotal}</span></div>
              <div><span className="text-gray-500">OK:</span> <span className="text-green-300">{pollMetrics.pollsOk}</span></div>
              <div><span className="text-gray-500">NoData:</span> <span className="text-amber-300">{pollMetrics.pollsNoData}</span></div>
              <div><span className="text-gray-500">Err:</span> <span className="text-red-300">{pollMetrics.pollsError}</span></div>
              <div><span className="text-gray-500">Avg:</span> <span className="text-cyan-300">{pollMetrics.latencyAvgMs?.toFixed?.(0) ?? '--'}ms</span></div>
              <div><span className="text-gray-500">Max:</span> <span className="text-cyan-300">{pollMetrics.latencyMaxMs ?? '--'}ms</span></div>
              <div><span className="text-gray-500">Hz:</span> <span className="text-cyan-300">{pollMetrics.loopHz?.toFixed?.(1) ?? '--'}</span></div>
              <div><span className="text-gray-500">Sw:</span> <span className="text-amber-300">{pollMetrics.headerSwitches}</span></div>
            </div>
          )}
        </div>
      )}

      {REQUESTED.missingKeys.length > 0 && (
        <div className="mb-1 p-1 md:p-2 rounded border border-red-900 bg-red-950/30">
          <div className="text-[8px] md:text-[9px] text-red-300 mb-0.5" style={{ fontFamily: 'Orbitron, monospace' }}>
            ⚠ MISSING DEF: {REQUESTED.missingKeys.length}
          </div>
          <div className="space-y-0.5 max-h-12 overflow-auto text-[8px] text-red-200">
            {REQUESTED.missingKeys.map((key) => (
              <div key={key}>{key}</div>
            ))}
          </div>
        </div>
      )}

      {/* PID Table - Responsive with expand details */}
      <div className="flex-1 overflow-auto flex flex-col gap-1 md:gap-2">
        {/* Mobile/Compact view */}
        <div className="md:hidden space-y-1">
          {ALL_ENTRIES.map(({ key, name, unit, protocol, pid, header, interval, consumers, required }) => {
            const live = liveValues[key];
            const value = live?.value ?? null;
            const timestamp = live?.timestamp ?? null;
            const age = timestamp ? ((now - timestamp) / 1000).toFixed(0) + 's' : '--';
            const m = pollMetrics?.byPid?.[key];
            const isPolled = registeredPids.some((row) => row.key === key);
            const isActive = activePidKeys.has(key);
            const formatted = value === null ? '--' : (Number.isInteger(value) ? value : (value?.toFixed?.(1) ?? '--'));
            const display = value === null ? '--' : `${formatted}${unit ? ' ' + unit : ''}`;
            const demand = (consumers || []).map((c) => CONSUMER_LABELS[c] || c).join(', ') || '--';
            const isExpanded = expandedPid === key;

            return (
              <div key={key} className="rounded border border-gray-700 bg-gray-900/40 p-1">
                <div className="flex items-center justify-between gap-1 text-[9px]">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-cyan-300">{name}</div>
                    <div className="text-gray-500 text-[8px]">{protocol === 'toyota' ? '🔴 TOY' : '🟢 STD'} {header} {pid}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-cyan-300">{display}</div>
                    <div className="text-gray-500 text-[8px]">{age}</div>
                  </div>
                </div>
                
                <div className="flex gap-0.5 mt-1">
                  <button
                    onClick={() => togglePidActive(key)}
                    disabled={!isPolled}
                    className="cluster-nav-btn"
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '8px',
                      padding: '2px 4px',
                      opacity: isPolled ? 1 : 0.4,
                      flex: 1,
                    }}
                  >
                    {isActive ? '🔴 OFF' : '🟢 ON'}
                  </button>
                  <button
                    onClick={() => setExpandedPid(isExpanded ? null : key)}
                    className="cluster-nav-btn"
                    style={{
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '8px',
                      padding: '2px 4px',
                    }}
                  >
                    {isExpanded ? '−' : '+'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-1 pt-1 border-t border-gray-700 text-[8px] text-gray-400 space-y-0.5">
                    <div><span className="text-gray-500">Polls:</span> {m?.polls ?? 0} | <span className="text-gray-500">OK:</span> {m?.ok ?? 0} | <span className="text-gray-500">Err:</span> {m?.error ?? 0}</div>
                    <div><span className="text-gray-500">Avg:</span> {m?.avgMs?.toFixed?.(0) ?? '--'}ms | <span className="text-gray-500">Hz:</span> {m ? (m.polls / Math.max(1, (now - pollMetrics.startedAt) / 1000)).toFixed(2) : '--'}</div>
                    <div><span className="text-gray-500">Demand:</span> {demand} | <span className="text-gray-500">Req:</span> {required ? 'YES' : 'NO'}</div>
                    <div><span className="text-gray-500">Success:</span> {m ? ((m.ok / m.polls) * 100).toFixed(0) : '--'}% | <span className="text-gray-500">Last:</span> {m?.lastResult || '--'}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop/Full table view */}
        <div className="hidden md:block overflow-x-auto">
          <table className="debug-table w-full text-[9px]">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-900 z-10">Name</th>
                <th>Prot</th>
                <th>PID</th>
                <th>Value</th>
                <th>Age</th>
                <th>Control</th>
                <th>Polls</th>
                <th>OK</th>
                <th>Err</th>
                <th>Avg</th>
                <th>Hz</th>
              </tr>
            </thead>
            <tbody>
              {ALL_ENTRIES.map(({ key, name, unit, protocol, pid, header, interval, consumers, required }) => {
                const live = liveValues[key];
                const value = live?.value ?? null;
                const timestamp = live?.timestamp ?? null;
                const age = timestamp ? ((now - timestamp) / 1000).toFixed(1) + 's' : '--';
                const m = pollMetrics?.byPid?.[key];
                const isPolled = registeredPids.some((row) => row.key === key);
                const isActive = activePidKeys.has(key);
                const formatted = value === null ? '--' : (Number.isInteger(value) ? value : (value?.toFixed?.(2) ?? '--'));
                const display = value === null ? '--' : `${formatted}${unit ? ' ' + unit : ''}`;
                const durationSec = pollMetrics?.startedAt ? Math.max(1, (now - pollMetrics.startedAt) / 1000) : 1;
                const hz = m ? (m.polls / durationSec) : 0;
                const successRate = m && m.polls > 0 ? ((m.ok / m.polls) * 100) : 0;
                const isExpanded = expandedPid === key;

                return (
                  <React.Fragment key={key}>
                    <tr className={isExpanded ? 'bg-gray-800/50' : ''}>
                      <td className="sticky left-0 bg-gray-900 z-10 text-gray-300 font-mono text-[8px]">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setExpandedPid(isExpanded ? null : key)}
                            style={{
                              fontFamily: 'Orbitron, monospace',
                              fontSize: '8px',
                              padding: '1px 4px',
                              minWidth: '24px',
                            }}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          {name}
                        </div>
                      </td>
                      <td>
                        <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                          protocol === 'toyota' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'
                        }`}>
                          {protocol === 'toyota' ? 'TOY' : 'STD'}
                        </span>
                      </td>
                      <td className="text-gray-500 font-mono text-[8px]">{pid}</td>
                      <td className="pid-value font-bold text-cyan-300">{display}</td>
                      <td className="text-gray-500">{age}</td>
                      <td>
                        <button
                          onClick={() => togglePidActive(key)}
                          disabled={!isPolled}
                          className="cluster-nav-btn"
                          style={{
                            fontFamily: 'Orbitron, monospace',
                            fontSize: '7px',
                            padding: '1px 3px',
                            opacity: isPolled ? 1 : 0.4,
                          }}
                        >
                          {isActive ? '✓' : '✗'}
                        </button>
                      </td>
                      <td className="text-gray-400">{m?.polls ?? 0}</td>
                      <td className="text-green-400">{m?.ok ?? 0}</td>
                      <td className="text-red-400">{m?.error ?? 0}</td>
                      <td className="text-cyan-300">{m?.avgMs?.toFixed?.(1) ?? '--'}ms</td>
                      <td className="text-cyan-300">{m ? hz.toFixed(2) : '--'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-900/30 text-[8px]">
                        <td colSpan="11" className="p-2">
                          <div className="grid grid-cols-2 gap-2 bg-gray-900/50 p-1 rounded text-gray-300">
                            <div><span className="text-gray-500">Header:</span> {header}</div>
                            <div><span className="text-gray-500">Interval:</span> {interval}ms</div>
                            <div><span className="text-gray-500">Demand:</span> {(consumers || []).map((c) => CONSUMER_LABELS[c] || c).join(', ') || '--'}</div>
                            <div><span className="text-gray-500">Default:</span> {required ? 'YES' : 'NO'}</div>
                            <div><span className="text-gray-500">Success Rate:</span> {m ? successRate.toFixed(1) : '--'}%</div>
                            <div><span className="text-gray-500">Last:</span> {m?.lastResult || '--'}</div>
                            <div><span className="text-gray-500">Max ms:</span> {m?.maxMs ?? '--'}</div>
                            <div><span className="text-gray-500">Last ms:</span> {m?.lastMs ?? '--'}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info */}
      <div className="mt-1 text-[8px] text-gray-500 text-center">
        {ALL_ENTRIES.length} PIDs | {registeredPids.filter((row) => !REQUESTED_SET.has(row.key)).length} stale
      </div>
    </div>
  );
}
