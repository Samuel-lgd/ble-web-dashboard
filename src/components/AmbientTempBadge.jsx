import React from 'react';
import { usePid } from './DashboardContext';
import { PID_KEYS } from '../pid-keys.js';

/**
 * Ambient temperature — small badge, bottom left corner.
 * °C with a subtle outdoor icon.
 */
export default function AmbientTempBadge() {
  const temp = usePid(PID_KEYS.AMBIENT_AIR_TEMP);
  const display = temp !== null ? `${Math.round(temp)}°C` : '—';

  return (
    <div className="flex flex-col items-center justify-center py-0.5">
      <div className="trip-pill flex items-center gap-0.5 px-1">
        <span className="text-[8px] opacity-50">☀</span>
        <span className="text-[8px] text-gray-400" style={{ fontFamily: 'Orbitron, monospace' }}>
          {display}
        </span>
      </div>
    </div>
  );
}
