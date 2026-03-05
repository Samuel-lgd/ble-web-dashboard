import React, { useState } from 'react';
import Dashboard from './Dashboard';
import TripHistory from './charts/TripHistory';
import DebugView from './DebugView';

export default function App() {
  const [view, setView] = useState('dashboard');

  return (
    <div className="h-full w-full relative carbon-bg">
      {view === 'dashboard' && (
        <Dashboard
          onNavigateTrips={() => setView('trips')}
          onNavigateDebug={() => setView('debug')}
        />
      )}
      {view === 'debug' && <DebugView onBack={() => setView('dashboard')} />}
      {view === 'trips' && <TripHistory onBack={() => setView('dashboard')} />}
    </div>
  );
}
