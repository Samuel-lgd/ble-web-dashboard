import React, { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { usePidHistory, usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Consumption sparkline — slim area chart showing last 5 minutes of L/100km.
 * Thermal amber color fill. Sits at bottom of center column.
 */
export default function ConsumptionSparkline() {
  const fuelHistory = usePidHistory(PID_KEYS.FUEL_RATE);
  const speedHistory = usePidHistory(PID_KEYS.VEHICLE_SPEED);

  // Compute L/100km data points from the merged history
  const data = useMemo(() => {
    if (!fuelHistory.length || !speedHistory.length) return [];

    // Build a time-aligned L/100km series
    // Use fuelHistory timestamps, find closest speed value
    const speedMap = new Map();
    for (const p of speedHistory) {
      // Round timestamp to nearest 500ms bucket for fuzzy matching
      speedMap.set(Math.round(p.timestamp / 500) * 500, p.value);
    }

    const points = [];
    for (const p of fuelHistory) {
      const bucket = Math.round(p.timestamp / 500) * 500;
      const speed = speedMap.get(bucket) ?? speedMap.get(bucket - 500) ?? speedMap.get(bucket + 500);
      const l100 = speed && speed > 5 ? (p.value / speed) * 100 : 0;
      points.push({ t: p.timestamp, v: Math.min(l100, 30) });
    }

    return points;
  }, [fuelHistory, speedHistory]);

  return (
    <div className="w-full h-full panel-recess relative overflow-hidden">
      <span className="absolute top-0.5 left-1 text-[7px] text-amber-600 z-10"
        style={{ fontFamily: 'Orbitron, monospace' }}>
        L/100km
      </span>
      {data.length > 2 ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 2, bottom: 0, left: 2 }}>
            <YAxis domain={[0, 'auto']} hide />
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke="#f59e0b"
              strokeWidth={1.5}
              fill="url(#sparkFill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600 text-[8px]">
          Waiting for data...
        </div>
      )}
    </div>
  );
}
