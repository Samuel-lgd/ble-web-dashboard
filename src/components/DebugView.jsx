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

const SOC_VALIDATION_PID = TOYOTA_PIDS.find((pid) =>
  pid.protocol === 'toyota' &&
  pid.header === '7E4' &&
  pid.pid === '2101' &&
  pid.name === 'HV Battery SOC (HR)'
);

/**
 * Debug view — shows all defined PIDs with live values from the store.
 */
export default function DebugView({ onBack }) {
  const { store, elm } = useDashboard();
  const [liveValues, setLiveValues] = useState({});
  const [validationRunning, setValidationRunning] = useState(false);
  const [validationLogs, setValidationLogs] = useState([]);
  const [validationSoc, setValidationSoc] = useState(null);
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

  const pushValidationLog = (status, label, details = '') => {
    setValidationLogs((prev) => [...prev, { status, label, details }]);
  };

  const runMockValidation = async () => {
    if (validationRunning) return;

    setValidationRunning(true);
    setValidationLogs([]);
    setValidationSoc(null);

    try {
      if (!elm || typeof elm.send !== 'function') {
        pushValidationLog('FAIL', 'Mock transport unavailable', 'elm.send() not found');
        return;
      }

      if (!SOC_VALIDATION_PID || typeof SOC_VALIDATION_PID.parse !== 'function') {
        pushValidationLog('FAIL', 'SOC parser missing', 'Toyota SOC PID definition not found');
        return;
      }

      const initCommands = ['ATZ', 'ATE0', 'ATL0', 'ATS1', 'ATH1', 'ATSP0', 'ATDP', 'ATAL', 'ATAT2'];

      for (const cmd of initCommands) {
        const res = await elm.send(cmd);
        if (cmd === 'ATDP') {
          const ok = /ISO\s*15765-4|CAN\s*11\s*\/\s*500|11\s*BIT/i.test(String(res || ''));
          pushValidationLog(ok ? 'PASS' : 'FAIL', `Init ${cmd}`, String(res || ''));
          if (!ok) return;
        } else {
          const ok = !/\?|ERROR/i.test(String(res || ''));
          pushValidationLog(ok ? 'PASS' : 'FAIL', `Init ${cmd}`, String(res || ''));
          if (!ok) return;
        }
      }

      const switchCommands = ['ATSH 7E4', 'ATFCSH 7E4', 'ATFCSD 30 00 00', 'ATFCSM 1'];
      for (const cmd of switchCommands) {
        const res = await elm.send(cmd);
        const ok = !/\?|ERROR/i.test(String(res || ''));
        pushValidationLog(ok ? 'PASS' : 'FAIL', `Switch ${cmd}`, String(res || ''));
        if (!ok) return;
      }

      const raw = await elm.send('2101');
      const hasIsoTpFrames = /7EC\s+10\s+[0-9A-F]{2}/i.test(raw) && /7EC\s+21\s+[0-9A-F]{2}/i.test(raw);
      pushValidationLog(hasIsoTpFrames ? 'PASS' : 'FAIL', 'Poll 2101 (multi-frame)', raw);
      if (!hasIsoTpFrames) return;

      const soc = SOC_VALIDATION_PID.parse(raw);
      const socValid = typeof soc === 'number' && !Number.isNaN(soc) && soc >= 0 && soc <= 100;
      if (socValid) {
        setValidationSoc(soc);
        pushValidationLog('PASS', 'SOC parse', `${soc.toFixed(1)} %`);
      } else {
        pushValidationLog('FAIL', 'SOC parse', String(soc));
      }
    } catch (err) {
      pushValidationLog('FAIL', 'Validation exception', err?.message || String(err));
    } finally {
      setValidationRunning(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col p-2 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onBack}
          className="cluster-back-btn"
          style={{ fontFamily: 'Orbitron, monospace' }}>
          ◀ DASH
        </button>
        <button
          onClick={runMockValidation}
          disabled={validationRunning}
          className="cluster-nav-btn cluster-nav-btn--amber"
          style={{ fontFamily: 'Orbitron, monospace', opacity: validationRunning ? 0.6 : 1 }}
        >
          {validationRunning ? 'RUNNING...' : 'RUN MOCK VALIDATION'}
        </button>
        <h2 className="text-sm font-bold text-gray-400" style={{ fontFamily: 'Orbitron, monospace' }}>
          DEBUG — PID DATA
        </h2>
      </div>

      {validationLogs.length > 0 && (
        <div className="mb-2 p-2 rounded border border-gray-700 bg-gray-900/60">
          <div className="text-[10px] text-gray-300 mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
            MOCK VALIDATION LOG
            {validationSoc !== null ? ` — SOC ${validationSoc.toFixed(1)} %` : ''}
          </div>
          <div className="space-y-1 max-h-28 overflow-auto">
            {validationLogs.map((log, idx) => (
              <div key={`${log.label}-${idx}`} className="text-[10px] text-gray-300">
                <span className={log.status === 'PASS' ? 'text-green-400' : 'text-red-400'}>[{log.status}]</span>
                {' '}{log.label}
                {log.details ? ` — ${log.details}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

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
