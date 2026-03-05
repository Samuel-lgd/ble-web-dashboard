import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * MockControlPanel — floating dev overlay visible only in mock mode.
 *
 * Renders in the bottom-right corner, collapsible.
 * Provides live readouts and controls to drive the MockEngine without
 * waiting for the scenario to naturally reach a specific state.
 *
 * @param {{ engine: import('./mock-engine.js').MockEngine }} props
 */
export default function MockControlPanel({ engine }) {
  const [collapsed, setCollapsed] = useState(true);
  const [state, setState] = useState(engine.getState());
  const rafRef = useRef(null);

  // Poll engine state every 250ms for live readouts
  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (!alive) return;
      setState(engine.getState());
      rafRef.current = setTimeout(tick, 250);
    };
    rafRef.current = setTimeout(tick, 250);

    return () => {
      alive = false;
      clearTimeout(rafRef.current);
    };
  }, [engine]);

  const handleScenario = useCallback((e) => {
    engine.setScenario(e.target.value);
  }, [engine]);

  const handleMultiplier = useCallback((e) => {
    engine.setSpeedMultiplier(Number(e.target.value));
  }, [engine]);

  const handleSocChange = useCallback((e) => {
    engine.setSoc(Number(e.target.value));
  }, [engine]);

  const handleForceRegen = useCallback(() => engine.forceRegen(), [engine]);
  const handleForceAccel = useCallback(() => engine.forceAccel(), [engine]);
  const handleToggleAC   = useCallback(() => engine.toggleAC(),   [engine]);
  const handleResetTrip  = useCallback(() => {
    try { engine._tripManager.stopTrip(); } catch (_) {}
    try { engine._tripManager.startTrip(); } catch (_) {}
  }, [engine]);

  const engineBadgeColor = state.engineOn ? '#22c55e' : '#666';
  const evBadgeColor     = state.evMode   ? '#00cfff' : '#666';
  const acBadgeColor     = state.acOn     ? '#f59e0b' : '#555';

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={styles.collapseBtn}
        title="Expand mock controls"
      >
        MOCK
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      {/* Header row */}
      <div style={styles.headerRow}>
        <span style={styles.title}>MOCK</span>

        {/* Scenario selector */}
        <select
          value={engine.scenarioName}
          onChange={handleScenario}
          style={styles.select}
        >
          {engine.scenarioNames.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        {/* Speed multiplier */}
        <select
          defaultValue="1"
          onChange={handleMultiplier}
          style={styles.select}
        >
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="5">5×</option>
        </select>

        <button onClick={() => setCollapsed(true)} style={styles.closeBtn}>✕</button>
      </div>

      {/* SOC slider */}
      <div style={styles.row}>
        <span style={styles.label}>SOC</span>
        <input
          type="range"
          min="40"
          max="70"
          step="0.5"
          value={state.hvSocPercent.toFixed(1)}
          onChange={handleSocChange}
          style={styles.slider}
        />
        <span style={styles.value}>{state.hvSocPercent.toFixed(1)}%</span>
      </div>

      {/* Speed readout */}
      <div style={styles.row}>
        <span style={styles.label}>Speed</span>
        <span style={styles.bigValue}>{Math.round(state.speedKmh)} km/h</span>
        <span style={{ ...styles.arrow, opacity: state.accelerationMs2 > 0.2 ? 1 : 0.2 }}>↑</span>
        <span style={{ ...styles.arrow, opacity: state.accelerationMs2 < -0.2 ? 1 : 0.2 }}>↓</span>
      </div>

      {/* Engine / EV badges */}
      <div style={styles.row}>
        <Badge color={engineBadgeColor} label={`Engine: ${state.engineOn ? 'ON' : 'OFF'}`} />
        <Badge color={evBadgeColor}     label={`EV: ${state.evMode ? 'ON' : 'OFF'}`} />
        <Badge color={acBadgeColor}     label={`A/C: ${state.acOn ? 'ON' : 'OFF'}`} />
      </div>

      {/* Action buttons */}
      <div style={styles.buttonRow}>
        <CtrlButton onClick={handleForceRegen}  label="FORCE REGEN" color="#00cfff" />
        <CtrlButton onClick={handleForceAccel}  label="FORCE ACCEL" color="#22c55e" />
        <CtrlButton onClick={handleToggleAC}    label="TOGGLE A/C"  color="#f59e0b" />
        <CtrlButton onClick={handleResetTrip}   label="RESET TRIP"  color="#ef4444" />
      </div>
    </div>
  );
}

function Badge({ color, label }) {
  return (
    <span style={{ ...styles.badge, borderColor: color, color }}>
      {label}
    </span>
  );
}

function CtrlButton({ onClick, label, color }) {
  return (
    <button onClick={onClick} style={{ ...styles.ctrlBtn, borderColor: color, color }}>
      {label}
    </button>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const BASE = {
  fontFamily: 'monospace',
  fontSize:   '10px',
};

const styles = {
  panel: {
    ...BASE,
    position:        'fixed',
    bottom:          '8px',
    right:           '8px',
    zIndex:          9999,
    background:      'rgba(13,17,23,0.95)',
    border:          '1px solid #30363d',
    borderRadius:    '6px',
    padding:         '6px 8px',
    minWidth:        '240px',
    maxWidth:        '290px',
    boxShadow:       '0 4px 16px rgba(0,0,0,0.6)',
    backdropFilter:  'blur(6px)',
    color:           '#c9d1d9',
    display:         'flex',
    flexDirection:   'column',
    gap:             '4px',
  },
  collapseBtn: {
    ...BASE,
    position:   'fixed',
    bottom:     '8px',
    right:      '8px',
    zIndex:     9999,
    background: 'rgba(13,17,23,0.9)',
    border:     '1px solid #30363d',
    borderRadius: '6px',
    padding:    '10px 18px',
    fontSize:   '13px',
    color:      '#f59e0b',
    cursor:     'pointer',
    fontWeight: 'bold',
  },
  headerRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         '4px',
    borderBottom: '1px solid #21262d',
    paddingBottom: '4px',
    marginBottom: '2px',
  },
  title: {
    color:       '#f59e0b',
    fontWeight:  'bold',
    letterSpacing: '1px',
    flexShrink:  0,
  },
  select: {
    ...BASE,
    background:  '#161b22',
    color:       '#c9d1d9',
    border:      '1px solid #30363d',
    borderRadius: '3px',
    padding:     '1px 3px',
    flex:        1,
    cursor:      'pointer',
  },
  closeBtn: {
    ...BASE,
    background:  'transparent',
    border:      '1px solid #30363d',
    borderRadius: '4px',
    color:       '#888',
    cursor:      'pointer',
    padding:     '4px 8px',
    fontSize:    '14px',
    flexShrink:  0,
  },
  row: {
    display:     'flex',
    alignItems:  'center',
    gap:         '5px',
  },
  label: {
    color:    '#8b949e',
    minWidth: '36px',
  },
  value: {
    color:   '#c9d1d9',
    minWidth: '44px',
    textAlign: 'right',
  },
  bigValue: {
    color:      '#e6edf3',
    fontSize:   '12px',
    fontWeight: 'bold',
    flex:       1,
  },
  slider: {
    flex:       1,
    accentColor: '#00cfff',
    cursor:     'pointer',
  },
  arrow: {
    fontSize:  '12px',
    transition: 'opacity 0.2s',
  },
  badge: {
    border:       '1px solid',
    borderRadius: '3px',
    padding:      '1px 5px',
    fontSize:     '9px',
    letterSpacing: '0.5px',
  },
  buttonRow: {
    display:    'flex',
    flexWrap:   'wrap',
    gap:        '3px',
    marginTop:  '2px',
    borderTop:  '1px solid #21262d',
    paddingTop: '4px',
  },
  ctrlBtn: {
    ...BASE,
    background:   'transparent',
    border:       '1px solid',
    borderRadius: '3px',
    padding:      '2px 6px',
    cursor:       'pointer',
    letterSpacing: '0.3px',
    fontWeight:   'bold',
    fontSize:     '9px',
  },
};
