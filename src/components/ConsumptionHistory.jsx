import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { usePidHistory, usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Consumption history — small panel, last 10 minutes of L/100km as line graph.
 * Shows trend: is driving getting more or less efficient over time?
 */
export default function ConsumptionHistory() {
  const fuelHistory = usePidHistory(PID_KEYS.FUEL_RATE);
  const speedHistory = usePidHistory(PID_KEYS.VEHICLE_SPEED);

  const data = useMemo(() => {
    if (!fuelHistory.length || !speedHistory.length) return [];

    const speedMap = new Map();
    for (const p of speedHistory) {
      speedMap.set(Math.round(p.timestamp / 1000) * 1000, p.value);
    }

    const points = [];
    let runningFuel = 0;
    let runningDist = 0;
    let prevTime = null;

    for (const p of fuelHistory) {
      const bucket = Math.round(p.timestamp / 1000) * 1000;
      const speed = speedMap.get(bucket) ?? speedMap.get(bucket - 1000) ?? speedMap.get(bucket + 1000) ?? 0;

      if (prevTime !== null) {
        const dtH = (p.timestamp - prevTime) / 3600000;
        if (dtH > 0 && dtH < 0.01) {
          runningFuel += p.value * dtH;
          runningDist += speed * dtH;
        }
      }
      prevTime = p.timestamp;

      const avgL100 = runningDist > 0.01 ? (runningFuel / runningDist) * 100 : 0;
      points.push({ t: p.timestamp, v: Math.min(avgL100, 20) });
    }

    return points;
  }, [fuelHistory, speedHistory]);

  return (
    <div className="w-full h-full panel-recess relative overflow-hidden">
      <span className="absolute top-0 left-0.5 text-[6px] text-amber-700 z-10"
        style={{ fontFamily: 'Orbitron, monospace' }}>
        TREND
      </span>
      {data.length > 2 ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 2, bottom: 0, left: 2 }}>
            <YAxis domain={[0, 'auto']} hide />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#f97316"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-700 text-[7px]">
          ...
        </div>
      )}
    </div>
  );
}
