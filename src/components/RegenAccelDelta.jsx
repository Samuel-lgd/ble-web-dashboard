import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';
import { BezelDefs, GlowFilter, ORBITRON } from './gauges/gauge-utils.jsx';

/**
 * SOC Delta Tracker — full instrument panel.
 *
 * Event detection based on hvCurrentA:
 *   - Electric accel (drain): current negative (battery discharging)
 *   - Regen (charge): current positive (battery charging)
 *   - Event starts when |current| > threshold, ends when sign flips or returns to ~0
 *
 * Idle state: shows trip SOC delta as dominant value + last 2 events
 * Active state: live delta counter with chrono + history below
 */

const EVENT_TYPES = { IDLE: 'idle', DRAIN: 'drain', CHARGE: 'charge' };
const CURRENT_THRESHOLD = 3; // Amps — ignore sensor noise below this

const FONT = ORBITRON;
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const CYAN = '#00cfff';

export default function RegenAccelDelta() {
  const soc = usePid(PID_KEYS.HV_BATTERY_SOC_HR) ?? 55;
  const hvCurrentA = usePid(PID_KEYS.HV_BATTERY_CURRENT) ?? 0;

  const [eventType, setEventType] = useState(EVENT_TYPES.IDLE);
  const [liveDelta, setLiveDelta] = useState(0);
  const [eventDuration, setEventDuration] = useState(0);
  const [history, setHistory] = useState([]);

  // Trip SOC tracking
  const tripStartSocRef = useRef(soc);
  const tripInitRef = useRef(false);

  // Event state refs (stable across renders)
  const eventStartSocRef = useRef(soc);
  const eventStartTimeRef = useRef(null);
  const chronoRef = useRef(null);
  const eventTypeRef = useRef(EVENT_TYPES.IDLE);

  // Initialize trip start SOC on first real value
  useEffect(() => {
    if (!tripInitRef.current && soc !== null) {
      tripStartSocRef.current = soc;
      tripInitRef.current = true;
    }
  }, [soc]);

  // Chrono ticker — updates duration every 100ms during active events
  const startChrono = useCallback(() => {
    if (chronoRef.current) return;
    chronoRef.current = setInterval(() => {
      if (eventStartTimeRef.current) {
        setEventDuration(Math.floor((Date.now() - eventStartTimeRef.current) / 1000));
      }
    }, 100);
  }, []);

  const stopChrono = useCallback(() => {
    if (chronoRef.current) {
      clearInterval(chronoRef.current);
      chronoRef.current = null;
    }
  }, []);

  useEffect(() => () => stopChrono(), [stopChrono]);

  // Core event detection — driven by hvCurrentA
  useEffect(() => {
    const prevType = eventTypeRef.current;
    const absI = Math.abs(hvCurrentA);

    if (absI < CURRENT_THRESHOLD) {
      // Current near zero — close any active event
      if (prevType !== EVENT_TYPES.IDLE) {
        finalizeEvent(prevType);
      }
      return;
    }

    // Determine direction from current sign
    // Positive current = battery charging = regen
    // Negative current = battery discharging = electric acceleration
    const newType = hvCurrentA > 0 ? EVENT_TYPES.CHARGE : EVENT_TYPES.DRAIN;

    if (prevType === EVENT_TYPES.IDLE) {
      // Start new event
      eventStartSocRef.current = soc;
      eventStartTimeRef.current = Date.now();
      eventTypeRef.current = newType;
      setEventType(newType);
      setLiveDelta(0);
      setEventDuration(0);
      startChrono();
    } else if (newType !== prevType) {
      // Sign flipped — close current event, start new one
      finalizeEvent(prevType);
      eventStartSocRef.current = soc;
      eventStartTimeRef.current = Date.now();
      eventTypeRef.current = newType;
      setEventType(newType);
      setLiveDelta(0);
      setEventDuration(0);
      startChrono();
    } else {
      // Same direction — update live delta
      setLiveDelta(soc - eventStartSocRef.current);
    }
  }, [hvCurrentA, soc]);

  function finalizeEvent(type) {
    stopChrono();
    const delta = soc - eventStartSocRef.current;
    const duration = eventStartTimeRef.current
      ? Math.round((Date.now() - eventStartTimeRef.current) / 1000)
      : 0;

    if (Math.abs(delta) > 0.005 || duration >= 2) {
      setHistory(prev => {
        const entry = { type, delta, duration, ts: Date.now() };
        return [entry, ...prev].slice(0, 2);
      });
    }

    eventTypeRef.current = EVENT_TYPES.IDLE;
    setEventType(EVENT_TYPES.IDLE);
    setLiveDelta(0);
    setEventDuration(0);
    eventStartTimeRef.current = null;
  }

  const isActive = eventType !== EVENT_TYPES.IDLE;
  const isDrain = eventType === EVENT_TYPES.DRAIN;
  const isCharge = eventType === EVENT_TYPES.CHARGE;
  const activeColor = isDrain ? AMBER : GREEN;
  const tripDelta = soc - tripStartSocRef.current;

  const formatDelta = (d) => `${d > 0 ? '+' : ''}${d.toFixed(2)}%`;
  const formatChrono = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  return (
      <svg viewBox="0 0 160 120" className="w-full h-full" style={{ overflow: 'visible' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <BezelDefs id="sdt" />
          <linearGradient id="sdt-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0e0e14" />
            <stop offset="100%" stopColor="#08080c" />
          </linearGradient>

          {/* Green glow for regen */}
          <GlowFilter id="sdt-glow-green" x="-50%" y="-50%" width="200%" height="200%"
            stdDeviation={2} colorMatrix="0 0 0 0 0.133  0 0 0 0 0.773  0 0 0 0 0.263  0 0 0 0.6 0" />
          {/* Amber glow for drain */}
          <GlowFilter id="sdt-glow-amber" x="-50%" y="-50%" width="200%" height="200%"
            stdDeviation={2} colorMatrix="0 0 0 0 0.961  0 0 0 0 0.620  0 0 0 0 0.043  0 0 0 0.6 0" />
          {/* Cyan glow for trip delta */}
          <GlowFilter id="sdt-glow-cyan" x="-50%" y="-50%" width="200%" height="200%"
            stdDeviation={1.5} colorMatrix="0 0 0 0 0  0 0 0 0 0.812  0 0 0 0 1  0 0 0 0.4 0" />

          {/* Animated flow particles — regen (upward), objectBoundingBox so each bar tiles independently */}
          <pattern id="sdt-flow-up" x="0" y="0" width="1" height="0.1" patternUnits="objectBoundingBox">
            <circle cx="1.5" cy="1" r="1" fill={GREEN}>
              <animate attributeName="cy" from="12" to="0" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.7;0" dur="0.8s" repeatCount="indefinite" />
            </circle>
          </pattern>
          {/* Animated flow particles — drain (downward) */}
          <pattern id="sdt-flow-down" x="0" y="0" width="1" height="0.1" patternUnits="objectBoundingBox">
            <circle cx="1.5" cy="11" r="1" fill={AMBER}>
              <animate attributeName="cy" from="0" to="12" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.6;0" dur="0.8s" repeatCount="indefinite" />
            </circle>
          </pattern>
        </defs>

        {/* Instrument background */}
        <rect x="1" y="1" width="158" height="118" rx="6" fill="url(#sdt-face)"
          stroke="#1a1a1e" strokeWidth="0.5" />

        {/* Subtle inner border */}
        <rect x="3" y="3" width="154" height="114" rx="5" fill="none"
          stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />

        {/* ── ACTIVE STATE ── */}
        {isActive && (
          <g>
            {/* Flow animation bars on edges — full height, double lane per side */}
            <rect x="4" y="4" width="3" height="112" rx="1.5"
              fill={isCharge ? 'url(#sdt-flow-up)' : 'url(#sdt-flow-down)'} opacity="0.5" />
            <rect x="9" y="4" width="2" height="112" rx="1"
              fill={isCharge ? 'url(#sdt-flow-up)' : 'url(#sdt-flow-down)'} opacity="0.25" />
            <rect x="149" y="4" width="2" height="112" rx="1"
              fill={isCharge ? 'url(#sdt-flow-up)' : 'url(#sdt-flow-down)'} opacity="0.25" />
            <rect x="153" y="4" width="3" height="112" rx="1.5"
              fill={isCharge ? 'url(#sdt-flow-up)' : 'url(#sdt-flow-down)'} opacity="0.5" />

            {/* Event type label */}
            <text x="80" y="16" textAnchor="middle" fill={activeColor} fontSize="7"
              style={{ ...FONT, fontWeight: 600 }} opacity="0.8"
              className={isCharge ? 'sdt-pulse-green' : 'sdt-pulse-amber'}>
              {isCharge ? '▲ REGEN' : '▼ ELEC ACCEL'}
            </text>

            {/* Live delta — large dominant value with glow */}
            <text x="80" y="46" textAnchor="middle" fill={activeColor} fontSize="24"
              style={{ ...FONT, fontWeight: 900 }}
              filter={isCharge ? 'url(#sdt-glow-green)' : 'url(#sdt-glow-amber)'}>
              {formatDelta(liveDelta)}
            </text>

            {/* Chrono */}
            <text x="80" y="60" textAnchor="middle" fill={activeColor} fontSize="8"
              style={FONT} opacity="0.6">
              {formatChrono(eventDuration)}
            </text>

            {/* Thin separator */}
            <line x1="24" y1="67" x2="136" y2="67" stroke={activeColor} strokeWidth="0.3" opacity="0.2" />
          </g>
        )}

        {/* ── IDLE STATE ── */}
        {!isActive && (
          <g>
            {/* Title */}
            <text x="80" y="14" textAnchor="middle" fill="#555" fontSize="5.5"
              style={{ ...FONT, fontWeight: 500 }}>
              SOC DELTA TRACKER
            </text>

            {/* Trip delta — central dominant value */}
            <text x="80" y="46" textAnchor="middle"
              fill={tripDelta > 0.01 ? GREEN : tripDelta < -0.01 ? AMBER : CYAN}
              fontSize="22" style={{ ...FONT, fontWeight: 900 }}
              filter="url(#sdt-glow-cyan)">
              {formatDelta(tripDelta)}
            </text>

            {/* Sub-label */}
            <text x="80" y="58" textAnchor="middle" fill="#444" fontSize="5" style={FONT}>
              TRIP SOC
            </text>

            {/* Thin separator */}
            <line x1="24" y1="65" x2="136" y2="65" stroke="#222" strokeWidth="0.3" />
          </g>
        )}

        {/* ── HISTORY — always visible ── */}
        <g>
          {history.length === 0 && !isActive && (
            <text x="80" y="82" textAnchor="middle" fill="#333" fontSize="5" style={FONT}>
              no events yet
            </text>
          )}
          {history.map((evt, i) => {
            const y = isActive ? 80 + i * 16 : 78 + i * 16;
            const evtColor = evt.type === EVENT_TYPES.CHARGE ? GREEN : AMBER;
            const icon = evt.type === EVENT_TYPES.CHARGE ? '+' : '−';
            const opacity = 1 - i * 0.35;

            return (
              <g key={evt.ts} opacity={opacity}>
                {/* Row background */}
                <rect x="14" y={y - 7} width="132" height="13" rx="3"
                  fill={evt.type === EVENT_TYPES.CHARGE
                    ? 'rgba(34,197,94,0.04)' : 'rgba(245,158,11,0.04)'}
                  stroke={evt.type === EVENT_TYPES.CHARGE
                    ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)'}
                  strokeWidth="0.4" />

                {/* Icon */}
                <text x="22" y={y + 1} textAnchor="middle" fill={evtColor} fontSize="9"
                  style={{ ...FONT, fontWeight: 700 }}>
                  {icon}
                </text>

                {/* Delta */}
                <text x="72" y={y + 1} textAnchor="middle" fill={evtColor} fontSize="8"
                  style={{ ...FONT, fontWeight: 700 }}>
                  {formatDelta(evt.delta)}
                </text>

                {/* Duration */}
                <text x="126" y={y + 1} textAnchor="middle" fill={evtColor} fontSize="6.5"
                  style={FONT} opacity="0.6">
                  {formatChrono(evt.duration)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
  );
}
