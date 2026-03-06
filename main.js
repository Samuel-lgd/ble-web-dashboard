import { Store } from './store.js';
import { DashboardUI } from './ui.js';
import { TripManager } from './src/trips/trip-manager.js';
import { TRANSPORT_MODE } from './config.js';
import { POLLING, ELM327 as ELM_CFG } from './config.js';
import { selectPolledPids } from './pid-selection.js';

/**
 * Application entry point (legacy non-React UI).
 *
 * Switches between real BLE pipeline and mock simulation based on
 * TRANSPORT_MODE in config.js. The React entry point (src/main.jsx)
 * contains identical switching logic for the React UI.
 *
 * To use mock mode: set TRANSPORT_MODE = 'mock' in config.js.
 * To connect to a real vehicle: set TRANSPORT_MODE = 'ble'.
 */

const store       = new Store();
const ui          = new DashboardUI(store);
const tripManager = new TripManager(store);

ui.render(document.getElementById('app'));

if (TRANSPORT_MODE === 'mock') {
  // ── Mock mode ────────────────────────────────────────────────────────────
  // Dynamic import so mock code is excluded when TRANSPORT_MODE !== 'mock'.
  import('./src/mock/mock-engine.js').then(({ MockEngine, MockAdapter, MockELM }) => {
    const adapter = new MockAdapter();
    const elm     = new MockELM();
    const mock    = new MockEngine(store, tripManager, adapter, elm);

    // Mirror engine state changes to the legacy UI status bar
    adapter.onStateChange((bleState) => {
      if (bleState === 'connecting') ui.setStatus('connecting');
      if (bleState === 'disconnected') ui.setStatus('disconnected');
    });
    elm.onStateChange((elmState) => {
      if (elmState === 'initializing') ui.setStatus('initializing');
      if (elmState === 'ready')        ui.setStatus('ready');
    });

    window.mockEngine  = mock;
    window.tripManager = tripManager;

    mock.start();
  });

} else {
  // ── Real BLE pipeline ────────────────────────────────────────────────────
  import('./ble-adapter.js').then(({ BLEAdapter }) =>
  import('./elm327.js').then(({ ELM327 }) =>
  import('./atsh-manager.js').then(({ ATSHManager }) =>
  import('./pid-manager.js').then(({ PIDManager }) =>
  import('./pids-standard.js').then(({ STANDARD_PIDS }) =>
  import('./pids-toyota.js').then(({ TOYOTA_PIDS }) => {
    const adapter    = new BLEAdapter();
    const elm        = new ELM327(adapter);
    const atsh       = new ATSHManager(elm);
    const pidManager = new PIDManager(elm, atsh, store);

    const includeAll = POLLING.PROFILE === 'all';
    const { selected, missingKeys } = selectPolledPids(STANDARD_PIDS, TOYOTA_PIDS, { includeAll });
    pidManager.addPIDs(selected);
    if (missingKeys.length) {
      console.warn('[POLL] Missing PID definitions for keys:', missingKeys);
    }

    elm.onLog((dir, text) => ui.addLog(dir, text));

    let connected = false;

    adapter.onStateChange((bleState) => {
      if (bleState === 'disconnected') {
        connected = false;
        pidManager.stop();
        tripManager.disableAutoDetect();
        ui.setStatus('disconnected');
      } else if (bleState === 'connecting') {
        ui.setStatus('connecting');
      }
    });

    elm.onStateChange((elmState) => {
      if (elmState === 'initializing') {
        ui.setStatus('initializing');
      } else if (elmState === 'ready') {
        // Post-init performance tuning (fire-and-forget)
        (async () => {
          try {
            await elm.setPollingTimeout(ELM_CFG.POLL_TIMEOUT_TICKS);
            await atsh.initFlowControl();
          } catch (e) {
            console.warn('[INIT] Post-init tuning partially failed:', e.message);
          }
        })();
        connected = true;
        ui.setStatus('ready');
        pidManager.start();
        tripManager.enableAutoDetect();
      } else if (elmState === 'error') {
        ui.setStatus('error');
      }
    });

    ui.onConnect(async () => {
      if (connected || adapter.state === 'connected') {
        pidManager.stop();
        tripManager.disableAutoDetect();
        adapter.disconnect();
        return;
      }
      try {
        await adapter.connect();
        await elm.initialize();
      } catch (err) {
        ui.addLog('RX', `[ERROR] ${err.message}`);
        ui.setStatus('disconnected');
        adapter.disconnect();
      }
    });

    window.tripManager = tripManager;
  }))))));
}
