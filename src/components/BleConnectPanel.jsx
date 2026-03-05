import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from './DashboardContext';

const LOG_COLORS = {
  info: '#4b72a0',
  ok:   '#22c55e',
  err:  '#ef4444',
  warn: '#f59e0b',
  tx:   '#4b5563',
  rx:   '#6b7280',
};

const font = { fontFamily: 'Orbitron, monospace' };

/**
 * Display debug configuration info when ELM327 is ready
 */
function showDebugConfigPrompt(elm, adapter) {
  const elmInfo = elm ? {
    state: elm.state,
    version: elm._version || 'unknown',
    protocol: elm._protocol || 'unknown',
    echo: elm._echo ? 'ON' : 'OFF',
    headers: elm._headers ? 'ON' : 'OFF',
    spaces: elm._spaces ? 'ON' : 'OFF',
    timeout: elm._timeout || 'unknown',
    lineEnding: elm._lineEnding || 'unknown',
  } : {};

  const adapterInfo = adapter ? {
    state: adapter.state,
    deviceName: adapter._device?.name || 'unknown',
    deviceId: adapter._device?.id || 'unknown',
    connected: adapter._connection ? 'YES' : 'NO',
  } : {};

  // Build config string
  let configStr = '═════════════════════════════════════════\n';
  configStr += '🔧 BLE DEVICE DEBUG CONFIG 🔧\n';
  configStr += '═════════════════════════════════════════\n\n';
  
  configStr += 'BLE Adapter:\n';
  for (const [key, val] of Object.entries(adapterInfo)) {
    configStr += `  ${key.padEnd(15)}: ${val}\n`;
  }
  
  configStr += '\nELM327 Configuration:\n';
  for (const [key, val] of Object.entries(elmInfo)) {
    configStr += `  ${key.padEnd(15)}: ${val}\n`;
  }
  
  configStr += '\n═════════════════════════════════════════\n';

  // Show alert with monospace font
  const message = configStr;
  
  // Create a styled modal instead of alert for better display
  console.log(configStr);
  
  // Also try to show in a browser alert (fallback)
  try {
    alert(configStr);
  } catch (e) {
    // Silent fail if alert is not available
  }
}

export default function BleConnectPanel() {
  const { adapter, elm } = useDashboard();
  const [bleState, setBleState] = useState(adapter?.state ?? 'disconnected');
  const [elmState, setElmState] = useState(elm?.state ?? 'idle');
  const [logs, setLogs]         = useState([]);
  const aliveRef  = useRef(true);
  const logsEndRef = useRef(null);

  useEffect(() => {
    aliveRef.current = true;

    adapter?.onStateChange((s) => {
      if (!aliveRef.current) return;
      setBleState(s);
      if (s === 'connecting')    pushLog('info', 'Searching for BLE device…');
      if (s === 'connected')     pushLog('ok',   'BLE connected — initializing ELM327…');
      if (s === 'disconnected')  pushLog('warn', 'BLE disconnected');
    });

    elm?.onStateChange((s) => {
      if (!aliveRef.current) return;
      setElmState(s);
      if (s === 'initializing') pushLog('info', 'ELM327 initialization sequence…');
      if (s === 'ready') {
        pushLog('ok',   'ELM327 ready — polling started');
        // Show debug config prompt when ready
        showDebugConfigPrompt(elm, adapter);
      }
      if (s === 'error')        pushLog('err',  'ELM327 initialization failed');
    });

    elm?.onLog((dir, msg) => {
      if (!aliveRef.current) return;
      pushLog(dir === 'TX' ? 'tx' : 'rx', msg);
    });

    return () => { aliveRef.current = false; };
  }, [adapter, elm]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [logs]);

  const pushLog = (type, text) => {
    setLogs(prev => [...prev.slice(-80), { type, text }]);
  };

  const handleConnect = async () => {
    if (!adapter || bleState === 'connecting') return;
    setLogs([]);
    try {
      await adapter.connect();
    } catch (err) {
      pushLog('err', err?.message ?? String(err));
    }
  };

  const handleDisconnect = () => {
    adapter?.disconnect();
  };

  const statusColor =
    elmState === 'ready'  ? '#22c55e' :
    bleState === 'connected' ? '#f59e0b' :
    bleState === 'connecting' ? '#4b72a0' : '#374151';

  const statusLabel =
    elmState === 'ready'       ? '● READY' :
    bleState === 'connected'   ? '○ ELM…'  :
    bleState === 'connecting'  ? '○ BLE…'  : '○ OFFLINE';

  const isConnecting = bleState === 'connecting' || (bleState === 'connected' && elmState === 'initializing');

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col"
      style={{
        background:  'linear-gradient(to bottom, #0e0e14, #08080c)',
        border:      '1px solid #1a1a1e',
        borderRadius: '6px',
        boxShadow:   'inset 0 1px 3px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.03)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 pt-1 flex-shrink-0">
        <span className="text-[6px] text-amber-700 tracking-wider" style={font}>
          BLE CONNECTION
        </span>
        <span style={{ ...font, fontSize: '7px', color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {/* Log area */}
      <div
        className="flex-1 overflow-auto min-h-0 px-2 py-0.5"
        style={{ scrollbarWidth: 'none' }}
      >
        {logs.length === 0 && (
          <span style={{ fontFamily: 'monospace', fontSize: '8px', color: '#2d3748' }}>
            Awaiting connection…
          </span>
        )}
        {logs.map((log, i) => (
          <div
            key={i}
            style={{
              fontFamily: 'monospace',
              fontSize:   '8px',
              lineHeight: '1.35',
              color:      LOG_COLORS[log.type] ?? '#6b7280',
              whiteSpace: 'pre-wrap',
              wordBreak:  'break-all',
            }}
          >
            {log.text}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      {/* Buttons */}
      <div className="flex gap-1 px-2 pb-1.5 flex-shrink-0">
        {!isConnecting && bleState === 'disconnected' && (
          <button
            onClick={handleConnect}
            className="cluster-nav-btn cluster-nav-btn--cyan"
            style={{ ...font, flex: 1 }}
          >
            CONNECT
          </button>
        )}
        {isConnecting && (
          <button
            disabled
            className="cluster-nav-btn cluster-nav-btn--amber"
            style={{ ...font, flex: 1, opacity: 0.6, cursor: 'default' }}
          >
            CONNECTING…
          </button>
        )}
        {!isConnecting && bleState === 'connected' && (
          <>
            <button
              onClick={handleConnect}
              className="cluster-nav-btn cluster-nav-btn--cyan"
              style={font}
            >
              RECONNECT
            </button>
            <button
              onClick={handleDisconnect}
              className="cluster-nav-btn"
              style={{ ...font, color: '#ef4444', borderColor: '#7f1d1d', backgroundColor: 'rgba(239,68,68,0.08)' }}
            >
              DISCONNECT
            </button>
          </>
        )}
      </div>
    </div>
  );
}
