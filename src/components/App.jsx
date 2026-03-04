import React, { useState } from 'react';
import Dashboard from './Dashboard';
import TripHistory from './TripHistory';
import DebugView from './DebugView';

export default function App() {
  const [view, setView] = useState('dashboard');

  return (
    <div className="h-full w-full relative carbon-bg">
      {/* Navigation toggle — instrument-styled buttons */}
      <div className="absolute top-1 right-1 z-50 flex gap-1">
        <NavBtn active={view === 'dashboard'} onClick={() => setView('dashboard')} label="DASH" />
        <NavBtn active={view === 'debug'} onClick={() => setView('debug')} label="DEBUG" />
        <NavBtn active={view === 'trips'} onClick={() => setView('trips')} label="TRIPS" />
      </div>

      {view === 'dashboard' && <Dashboard onNavigateTrips={() => setView('trips')} />}
      {view === 'debug' && <DebugView />}
      {view === 'trips' && <TripHistory onBack={() => setView('dashboard')} />}
    </div>
  );
}

function NavBtn({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[9px] font-bold tracking-wider rounded border transition-colors ${
        active
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
          : 'bg-black/60 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
      }`}
      style={{ fontFamily: 'Orbitron, monospace' }}
    >
      {label}
    </button>
  );
}
