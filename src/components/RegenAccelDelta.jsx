import React, { useState, useEffect, useRef } from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Regen / Acceleration Delta tracker.
 * Tracks SOC delta during active events:
 * - Electric acceleration: downward counter in amber (-0.X%)
 * - Regen braking: upward counter in green (+0.X%)
 * - When event ends (SOC stable 3s): value locks into history strip
 * - Shows last 3 events as compact labeled pills
 * Feels like a stopwatch — urgent, live, resetting each event.
 */

const EVENT_TYPES = { IDLE: 'idle', DRAIN: 'drain', CHARGE: 'charge' };
const STABLE_THRESHOLD_MS = 3000;
const SOC_CHANGE_THRESHOLD = 0.05; // minimum SOC change per update to consider active

export default function RegenAccelDelta() {
  const soc = usePid(PID_KEYS.HV_BATTERY_SOC_HR) ?? 55;

  const [eventType, setEventType] = useState(EVENT_TYPES.IDLE);
  const [liveDelta, setLiveDelta] = useState(0);
  const [eventStart, setEventStart] = useState(null);
  const [history, setHistory] = useState([]); // last 3 completed events

  const prevSocRef = useRef(soc);
  const stableStartRef = useRef(null);
  const eventStartSocRef = useRef(soc);
  const eventStartTimeRef = useRef(null);

  useEffect(() => {
    const prevSoc = prevSocRef.current;
    const diff = soc - prevSoc;
    prevSocRef.current = soc;

    if (Math.abs(diff) < 0.001) {
      // SOC stable
      if (eventType !== EVENT_TYPES.IDLE) {
        if (stableStartRef.current === null) {
          stableStartRef.current = Date.now();
        } else if (Date.now() - stableStartRef.current > STABLE_THRESHOLD_MS) {
          // Event ended — lock and record
          const duration = eventStartTimeRef.current
            ? Math.round((Date.now() - eventStartTimeRef.current) / 1000)
            : 0;
          const delta = soc - eventStartSocRef.current;

          if (Math.abs(delta) > 0.01) {
            setHistory(prev => {
              const entry = {
                type: eventType,
                delta: delta,
                duration,
                ts: Date.now(),
              };
              return [entry, ...prev].slice(0, 3);
            });
          }

          setEventType(EVENT_TYPES.IDLE);
          setLiveDelta(0);
          stableStartRef.current = null;
          eventStartTimeRef.current = null;
        }
      }
      return;
    }

    // SOC changing
    stableStartRef.current = null;

    if (diff < -SOC_CHANGE_THRESHOLD) {
      // Draining (acceleration)
      if (eventType !== EVENT_TYPES.DRAIN) {
        setEventType(EVENT_TYPES.DRAIN);
        eventStartSocRef.current = prevSoc;
        eventStartTimeRef.current = Date.now();
      }
      setLiveDelta(soc - eventStartSocRef.current);
    } else if (diff > SOC_CHANGE_THRESHOLD) {
      // Charging (regen)
      if (eventType !== EVENT_TYPES.CHARGE) {
        setEventType(EVENT_TYPES.CHARGE);
        eventStartSocRef.current = prevSoc;
        eventStartTimeRef.current = Date.now();
      }
      setLiveDelta(soc - eventStartSocRef.current);
    }
  }, [soc]);

  const isActive = eventType !== EVENT_TYPES.IDLE;
  const isDrain = eventType === EVENT_TYPES.DRAIN;
  const isCharge = eventType === EVENT_TYPES.CHARGE;

  return (
    <div className="w-full h-full panel-recess flex flex-col p-1 gap-0.5">
      {/* Live counter — stopwatch feel */}
      <div className={`flex-1 flex flex-col items-center justify-center ${isActive ? 'counter-live' : ''}`}>
        {isActive ? (
          <>
            <span className="text-[7px] tracking-wider"
              style={{
                fontFamily: 'Orbitron, monospace',
                color: isDrain ? '#f59e0b' : '#22c55e',
              }}>
              {isDrain ? '⚡ ACCEL' : '♻ REGEN'}
            </span>
            <span className="text-[14px] font-bold"
              style={{
                fontFamily: 'Orbitron, monospace',
                fontWeight: 900,
                color: isDrain ? '#f59e0b' : '#22c55e',
              }}>
              {liveDelta > 0 ? '+' : ''}{liveDelta.toFixed(2)}%
            </span>
          </>
        ) : (
          <span className="text-[7px] text-gray-600" style={{ fontFamily: 'Orbitron, monospace' }}>
            SOC DELTA
          </span>
        )}
      </div>

      {/* History strip — last 3 events as compact pills */}
      <div className="flex flex-col gap-0.5">
        {history.map((evt, i) => (
          <div key={evt.ts} className="flex items-center gap-0.5 text-[6px]"
            style={{ opacity: 1 - i * 0.25 }}>
            <span style={{
              fontFamily: 'Orbitron, monospace',
              color: evt.type === EVENT_TYPES.DRAIN ? '#f59e0b' : '#22c55e',
            }}>
              {evt.type === EVENT_TYPES.DRAIN ? '⚡' : '♻'}
            </span>
            <span className="trip-pill text-[6px]" style={{
              fontFamily: 'Orbitron, monospace',
              color: evt.type === EVENT_TYPES.DRAIN ? '#f59e0b' : '#22c55e',
              padding: '0 3px',
            }}>
              {evt.delta > 0 ? '+' : ''}{evt.delta.toFixed(2)}% · {evt.duration}s
            </span>
          </div>
        ))}
        {history.length === 0 && (
          <span className="text-[6px] text-gray-700 text-center" style={{ fontFamily: 'Orbitron, monospace' }}>
            no events
          </span>
        )}
      </div>
    </div>
  );
}
