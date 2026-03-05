import React, { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, ReferenceLine } from 'recharts';
import { usePidHistory, useTripData } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Average consumption panel — promoted to a central, prominent component.
 * Trip average L/100km is the dominant element (large numeric).
 * Below it: trend graph of the running trip average over time.
 * Green trend = improving (going down), orange/red = degrading (going up).
 * Visual weight equivalent to primary gauges (RPM, SOC).
 */
export default function ConsumptionHistory() {
  const fuelHistory = usePidHistory(PID_KEYS.FUEL_RATE);
  const speedHistory = usePidHistory(PID_KEYS.VEHICLE_SPEED);
  const trip = useTripData();

  // Trip average from trip manager
  const tripAvg = trip?.avgConsumptionL100km ?? 0;

  // Compute running average trend data from history
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

  // Determine trend direction from last few data points
  const trendDir = useMemo(() => {
    if (data.length < 4) return 0;
    const recent = data.slice(-4);
    const first = recent[0].v;
    const last = recent[recent.length - 1].v;
    return last - first; // negative = improving, positive = degrading
  }, [data]);

  const trendColor = trendDir < -0.1 ? '#22c55e' : trendDir > 0.1 ? '#f97316' : '#f59e0b';
  const trendArrow = trendDir < -0.1 ? '↓' : trendDir > 0.1 ? '↑' : '→';

  const font = { fontFamily: 'Orbitron, monospace' };

  return (
    <div className="w-full h-full panel-recess relative overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-1.5 pt-1 flex-shrink-0">
        <span className="text-[6px] text-amber-700 tracking-wider" style={font}>
          AVG CONSUMPTION
        </span>
        <span className="text-[7px]" style={{ ...font, color: trendColor }}>
          {trendArrow}
        </span>
      </div>

      {/* Large trip average — dominant element */}
      <div className="flex items-baseline justify-center gap-0.5 flex-shrink-0 pt-0.5">
        <span className="text-[22px] font-bold leading-none"
          style={{ ...font, fontWeight: 700, color: '#e0e0e0' }}>
          {tripAvg > 0 ? tripAvg.toFixed(1) : '—'}
        </span>
        <span className="text-[7px] text-amber-600 self-end pb-0.5" style={font}>
          L/100
        </span>
      </div>

      {/* Trend graph — running trip average over time */}
      <div className="flex-1 min-h-0 px-0.5 pb-0.5">
        {data.length > 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} hide />
              {tripAvg > 0 && (
                <ReferenceLine y={tripAvg} stroke="#f59e0b" strokeWidth={0.5}
                  strokeDasharray="2 2" opacity={0.4} />
              )}
              <Line
                type="monotone"
                dataKey="v"
                stroke={trendColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 text-[7px]">
            Collecting data...
          </div>
        )}
      </div>
    </div>
  );
}
