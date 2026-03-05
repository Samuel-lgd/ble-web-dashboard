import React from 'react';
import SpeedGauge from './SpeedGauge';
import ConsumptionHistory from './ConsumptionHistory';
import RpmGauge from './RpmGauge';
import EngineThermalStatus from './EngineThermalStatus';
import CoolantTempGauge from './CoolantTempGauge';
import AmbientTempBadge from './AmbientTempBadge';
import HvBatterySocGauge from './HvBatterySocGauge';
import PowerFlowDiagram from './PowerFlowDiagram';
import BatteryTempBadge from './BatteryTempBadge';
import Mg2MotorActivity from './Mg2MotorActivity';
import RegenAccelDelta from './RegenAccelDelta';
import TripBar from './TripBar';

export default function Dashboard({ onNavigateTrips }) {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Main 3-column area — reduced padding for max density */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT — Thermal (amber/orange/red palette) */}
        <div className="w-[27%] flex flex-col p-0.5 gap-0.5 min-h-0">
          <div className="flex-[4] min-h-0">
            <RpmGauge />
          </div>
          <div className="flex-[2.5] flex gap-0.5 min-h-0">
            <div className="flex-1 min-h-0">
              <EngineThermalStatus />
            </div>
            <div className="w-[28px] flex flex-col min-h-0">
              <CoolantTempGauge />
            </div>
          </div>
          <AmbientTempBadge />
        </div>

        {/* CENTER — Speed + Avg Consumption */}
        <div className="flex-1 flex flex-col p-0.5 gap-0.5 min-h-0">
          <div className="flex-[5] min-h-0">
            <SpeedGauge />
          </div>
          <div className="flex-[2] min-h-0">
            <ConsumptionHistory />
          </div>
        </div>

        {/* RIGHT — Electric (blue/cyan/green palette) */}
        <div className="w-[27%] flex flex-col p-0.5 gap-0.5 min-h-0">
          <div className="flex-[4] min-h-0">
            <HvBatterySocGauge />
          </div>
          <div className="flex-[2.5] flex gap-0.5 min-h-0">
            <div className="flex-1 min-h-0">
              <PowerFlowDiagram />
            </div>
            <div className="w-[28px] flex flex-col min-h-0">
              <BatteryTempBadge />
            </div>
          </div>
          <div className="flex-[1] flex gap-0.5 min-h-0">
            <div className="flex-1 min-h-0">
              <Mg2MotorActivity />
            </div>
            <div className="flex-1 min-h-0">
              <RegenAccelDelta />
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM — Trip Bar spanning full width */}
      <TripBar onClick={onNavigateTrips} />
    </div>
  );
}
