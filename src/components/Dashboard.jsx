import React from 'react';
import SpeedGauge from './gauges/SpeedGauge';
import ConsumptionHistory from './charts/ConsumptionHistory';
import EnginePowerGauge from './gauges/EnginePowerGauge';
import EngineThermalStatus from './badges/EngineThermalStatus';
import HvBatterySocGauge from './gauges/HvBatterySocGauge';
import RegenAccelDelta from './visualizations/RegenAccelDelta';

function TripPill({ label, value, color = '#999' }) {
  return (
    <div className="trip-pill flex items-center gap-1">
      <span className="text-[6px] text-gray-600" style={{ fontFamily: 'Orbitron, monospace' }}>{label}</span>
      <span className="text-[8px] font-bold" style={{ fontFamily: 'Orbitron, monospace', color }}>{value}</span>
    </div>
  );
}

export default function Dashboard({ onNavigateTrips, onNavigateDebug }) {
  return (
    <div className="h-full w-full flex flex-col dashboard-panel">
      {/* Main 3-column area — edge-to-edge, no padding */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Radial vignette — pushes depth toward the edges */}
        <div className="dashboard-vignette" />

        {/* LEFT — Thermal zone (amber/orange/red palette) */}
        <div className="w-[28%] flex flex-col gap-px min-h-0 zone-thermal relative">
          <span className="zone-label zone-label-thermal">THERMAL</span>
          <div className="flex-[5] min-h-0 overflow-visible">
            <EnginePowerGauge />
          </div>
          <div className="flex-[3] min-h-0 overflow-visible">
            <EngineThermalStatus />
          </div>
        </div>

        {/* Engraved seam — thermal / center boundary */}
        <div className="zone-divider zone-divider-thermal" />

        {/* CENTER — Speed + Nav row + Avg Consumption */}
        <div className="flex-1 flex flex-col gap-px min-h-0 zone-center">
                    {/* Nav row: [DEBUG · TRIPS] — */}
          <div className="relative flex items-center px-3 py-1 shrink-0 z-10">
            {/* Left — dist & cost stacked */}
            {/* Center — absolutely positioned so it's always dead-center */}
            <div className="absolute left-1/2 -translate-x-1/2 flex gap-40 top-2 opacity-80">
              <button
                onClick={onNavigateDebug}
                className="cluster-nav-btn cluster-nav-btn--amber"
                style={{ fontFamily: 'Orbitron, monospace' }}
              >
                DEBUG
              </button>
              <button
                onClick={onNavigateTrips}
                className="cluster-nav-btn cluster-nav-btn--cyan"
                style={{ fontFamily: 'Orbitron, monospace' }}
              >
                TRIPS
              </button>
            </div>
          </div>
          <div className="flex-[5] min-h-0 overflow-visible">
            <SpeedGauge />
          </div>

          <div className="flex-[1.5] min-h-0 px-2 pb-2">
            <ConsumptionHistory />
          </div>
        </div>

        {/* Engraved seam — center / electric boundary */}
        <div className="zone-divider zone-divider-electric" />

        {/* RIGHT — Electric zone (blue/cyan/green palette) */}
        <div className="w-[28%] flex flex-col gap-px min-h-0 zone-electric relative">
          <span className="zone-label zone-label-electric">ENERGY</span>
          <div className="flex-[5] min-h-0 overflow-visible">
            <HvBatterySocGauge />
          </div>
          <div className="flex-[3.5] min-h-0 overflow-visible p-2">
            <RegenAccelDelta />
          </div>
        </div>
      </div>
    </div>
  );
}
