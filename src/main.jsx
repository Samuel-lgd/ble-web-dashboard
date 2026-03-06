import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardProvider } from './components/DashboardContext';
import App from './components/App';
import './index.css';

import { TRANSPORT_MODE } from '../config.js';
import { Store } from '../store.js';
import { TripManager } from './trips/trip-manager.js';
import { POLLING, ELM327 as ELM_CFG } from '../config.js';
import { selectPolledPids } from '../pid-selection.js';

// App entry point. TRANSPORT_MODE controls mock vs real BLE pipeline

const root = createRoot(document.getElementById('app'));

async function bootstrap() {
  const store       = new Store();
  const tripManager = new TripManager(store);

  let adapter, elm, pidManager = null, mockEngineInstance = null, MockPanel = null;

  if (TRANSPORT_MODE === 'mock') {
    // ── Mock mode ────────────────────────────────────────────────────────────
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
    pidManager = new PIDManager(elm, atsh, store);

    const includeAll = POLLING.PROFILE === 'all';
    const { selected, missingKeys, selectedKeys } = selectPolledPids(STANDARD_PIDS, TOYOTA_PIDS, { includeAll });
    pidManager.addPIDs(selected);

    if (!includeAll) {
      console.log(`[POLL] profile=ui selected=${selected.length} keys=${selectedKeys.length}`);
    }
    if (missingKeys.length) {
      console.warn('[POLL] Missing PID definitions for keys:', missingKeys);
    }

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

    elm.onStateChange(async (elmState) => {
      if (elmState === 'ready') {
        // Post-init performance tuning:
        // 1. Set ATST polling ceiling (lower → faster NO DATA detection)
        // 2. One-time FC setup (ATFCSD + ATFCSM persist across ATSH changes)
        try {
          await elm.setPollingTimeout(ELM_CFG.POLL_TIMEOUT_TICKS);
          await atsh.initFlowControl();
        } catch (e) {
          console.warn('[INIT] Post-init tuning partially failed:', e.message);
        }
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
  window.pidManager  = pidManager;

  // Mount React — same component tree regardless of transport mode
  root.render(
    <DashboardProvider
      store={store}
      tripManager={tripManager}
      adapter={adapter}
      elm={elm}
      pidManager={pidManager}
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
