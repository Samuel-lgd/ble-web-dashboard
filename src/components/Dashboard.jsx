import React, { useState, useEffect, useRef } from 'react';
import SpeedGauge from './gauges/SpeedGauge';
import ConsumptionHistory from './charts/ConsumptionHistory';
import EnginePowerGauge from './gauges/EnginePowerGauge';
import EngineThermalStatus from './EngineThermalStatus';
import FuelLevelGauge from './gauges/FuelLevelGauge';
import HvBatterySocGauge from './gauges/HvBatterySocGauge';
import RegenAccelDelta from './RegenAccelDelta';
import BleConnectPanel from './BleConnectPanel';
import { useDashboard } from './DashboardContext';
import { TRANSPORT_MODE } from '../core/config/config.js';

/**
 * Shows BleConnectPanel when BLE mode and not yet connected,
 * otherwise shows normal ConsumptionHistory.
 */
function CenterBottomPanel() {
  const { adapter, elm } = useDashboard();
  const aliveRef = useRef(true);
  const [bleState, setBleState] = useState(adapter?.state ?? 'disconnected');
  const [elmState, setElmState] = useState(elm?.state ?? 'idle');

  useEffect(() => {
    aliveRef.current = true;
    adapter?.onStateChange((s) => {
      if (aliveRef.current) setBleState(s);
    });
    elm?.onStateChange((s) => {
      if (aliveRef.current) setElmState(s);
    });
    return () => { aliveRef.current = false; };
  }, [adapter, elm]);

  const operational = TRANSPORT_MODE === 'mock' ||
    (bleState === 'connected' && elmState === 'ready');

  return operational ? <ConsumptionHistory /> : <BleConnectPanel />;
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
          <div className="flex-[3] min-h-0 flex flex-row items-stretch gap-1.5 px-1.5 pb-1.5">
            <div className="flex-1 min-w-0 overflow-visible">
              <EngineThermalStatus />
            </div>
            <div
              className="min-h-0 overflow-hidden rounded-[4px] shrink-0"
              style={{
                width: '25%',
                background: 'linear-gradient(to bottom, #0e0e14, #08080c)',
                border: '1px solid #1a1a1e',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              <FuelLevelGauge />
            </div>
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
                className="cluster-nav-btn cluster-nav-btn--amber font-orbitron"
              >
                DEBUG
              </button>
              <button
                onClick={onNavigateTrips}
                className="cluster-nav-btn cluster-nav-btn--cyan font-orbitron"
              >
                TRIPS
              </button>
            </div>
          </div>
          <div className="flex-[5] min-h-0 overflow-visible">
            <SpeedGauge />
          </div>

          <div className="flex-[1.5] min-h-0 px-2 pb-2">
            <CenterBottomPanel />
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
