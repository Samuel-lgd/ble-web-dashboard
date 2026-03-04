import React from 'react';
import SpeedGauge from './SpeedGauge';
import EnergyFlowBar from './EnergyFlowBar';
import ConsumptionSparkline from './ConsumptionSparkline';
import RpmGauge from './RpmGauge';
import FuelConsumptionGauge from './FuelConsumptionGauge';
import ConsumptionHistory from './ConsumptionHistory';
import CoolantTempGauge from './CoolantTempGauge';
import AmbientTempBadge from './AmbientTempBadge';
import HvBatterySocGauge from './HvBatterySocGauge';
import BatteryCurrentGauge from './BatteryCurrentGauge';
import BatteryTempBadge from './BatteryTempBadge';
import Mg2MotorActivity from './Mg2MotorActivity';
import RegenAccelDelta from './RegenAccelDelta';
import TripBar from './TripBar';

export default function Dashboard({ onNavigateTrips }) {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Main 3-column area */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT — Thermal (amber/orange/red palette) */}
        <div className="w-[27%] flex flex-col p-1 gap-0.5 min-h-0">
          <div className="flex-[3.5] min-h-0">
            <RpmGauge />
          </div>
          <div className="flex-[2] flex gap-0.5 min-h-0">
            <div className="flex-1 min-h-0">
              <FuelConsumptionGauge />
            </div>
            <div className="w-[32px] flex flex-col min-h-0">
              <CoolantTempGauge />
            </div>
          </div>
          <div className="flex-[1.2] flex items-end gap-0.5 min-h-0">
            <div className="flex-1 min-h-0">
              <ConsumptionHistory />
            </div>
            <AmbientTempBadge />
          </div>
        </div>

        {/* CENTER — Speed + Energy */}
        <div className="flex-1 flex flex-col p-1 gap-0.5 min-h-0">
          <div className="flex-[5] min-h-0">
            <SpeedGauge />
          </div>
          <div className="h-[24px] flex-shrink-0">
            <EnergyFlowBar />
          </div>
          <div className="flex-[1.5] min-h-0">
            <ConsumptionSparkline />
          </div>
        </div>

        {/* RIGHT — Electric (blue/cyan/green palette) */}
        <div className="w-[27%] flex flex-col p-1 gap-0.5 min-h-0">
          <div className="flex-[3.5] min-h-0">
            <HvBatterySocGauge />
          </div>
          <div className="flex-[2] flex gap-0.5 min-h-0">
            <div className="flex-1 min-h-0">
              <BatteryCurrentGauge />
            </div>
            <div className="w-[32px] flex flex-col min-h-0">
              <BatteryTempBadge />
            </div>
          </div>
          <div className="flex-[1.2] flex gap-0.5 min-h-0">
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
