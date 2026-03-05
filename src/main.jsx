import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardProvider } from './components/DashboardContext';
import App from './components/App';
import './index.css';

import { TRANSPORT_MODE } from '../config.js';
import { Store } from '../store.js';
import { TripManager } from './trips/trip-manager.js';

/**
 * Application entry point.
 *
 * TRANSPORT_MODE === 'mock':
 *   Loads MockEngine via dynamic import (tree-shakeable in production builds).
 *   MockAdapter + MockELM replace BLEAdapter + ELM327 so DashboardContext
 *   receives the exact same interface it expects from the real pipeline.
 *   MockEngine feeds store.js directly on each simulation tick.
 *
 * TRANSPORT_MODE === 'ble' (default for production):
 *   Identical to original pipeline: BLE → ELM327 → PIDManager → Store.
 *   Zero mock code is included — the dynamic import branch is never executed.
 */

const root = createRoot(document.getElementById('app'));

async function bootstrap() {
  const store       = new Store();
  const tripManager = new TripManager(store);

  let adapter, elm, mockEngineInstance = null, MockPanel = null;

  if (TRANSPORT_MODE === 'mock') {
    // ── Mock mode ────────────────────────────────────────────────────────────
    // Dynamic imports keep all mock code in a separate chunk.
    // In a production build with TRANSPORT_MODE = 'ble', this branch is dead
    // code and Vite/Rollup excludes the mock chunk from the output.
    const [mockModule, panelModule] = await Promise.all([
      import('./mock/mock-engine.js'),
      import('./mock/MockControlPanel.jsx'),
    ]);

    const { MockAdapter, MockELM, MockEngine } = mockModule;
    MockPanel = panelModule.default;

    adapter            = new MockAdapter();
    elm                = new MockELM();
    mockEngineInstance = new MockEngine(store, tripManager, adapter, elm);

    // Seed demo trips (Toulouse ↔ Blagnac) — no-op if already present
    const { seedMockTrips } = await import('./mock/mock-trips-seed.js');
    await seedMockTrips(tripManager._storage);

    // Expose for console debugging
    window.mockEngine = mockEngineInstance;

    mockEngineInstance.start();

  } else {
    // ── Real BLE pipeline ────────────────────────────────────────────────────
    const [
      { BLEAdapter },
      { ELM327 },
      { ATSHManager },
      { PIDManager },
      { STANDARD_PIDS },
      { TOYOTA_PIDS },
    ] = await Promise.all([
      import('../ble-adapter.js'),
      import('../elm327.js'),
      import('../atsh-manager.js'),
      import('../pid-manager.js'),
      import('../pids-standard.js'),
      import('../pids-toyota.js'),
    ]);

    adapter = new BLEAdapter();
    elm     = new ELM327(adapter);

    const atsh       = new ATSHManager(elm);
    const pidManager = new PIDManager(elm, atsh, store);

    pidManager.addPIDs(STANDARD_PIDS);
    pidManager.addPIDs(TOYOTA_PIDS);

    let connected = false;

    adapter.onStateChange((bleState) => {
      if (bleState === 'connected') {
        elm.initialize().catch(() => {});
      }
      if (bleState === 'disconnected') {
        connected = false;
        pidManager.stop();
        tripManager.disableAutoDetect();
      }
    });

    elm.onStateChange((elmState) => {
      if (elmState === 'ready') {
        connected = true;
        pidManager.start();
        tripManager.enableAutoDetect();
      }
    });

    elm.onLog(() => {});
  }

  // Expose shared globals for console debugging
  window.tripManager = tripManager;
  window.store       = store;

  // Mount React — same component tree regardless of transport mode
  root.render(
    <DashboardProvider
      store={store}
      tripManager={tripManager}
      adapter={adapter}
      elm={elm}
    >
      <App />
      {MockPanel && <MockPanel engine={mockEngineInstance} />}
    </DashboardProvider>
  );

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'service-worker.js').catch(() => {});
  }
}

bootstrap();
