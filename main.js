import { BLEAdapter } from './ble-adapter.js';
import { ELM327 } from './elm327.js';
import { ATSHManager } from './atsh-manager.js';
import { PIDManager } from './pid-manager.js';
import { Store } from './store.js';
import { DashboardUI } from './ui.js';
import { STANDARD_PIDS } from './pids-standard.js';
import { TOYOTA_PIDS } from './pids-toyota.js';

/**
 * Application entry point.
 * Wires together all layers: BLE → ELM327 → PIDManager → Store → UI.
 */

const adapter = new BLEAdapter();
const elm = new ELM327(adapter);
const atsh = new ATSHManager(elm);
const store = new Store();
const pidManager = new PIDManager(elm, atsh, store);
const ui = new DashboardUI(store);

// Register PIDs
pidManager.addPIDs(STANDARD_PIDS);
pidManager.addPIDs(TOYOTA_PIDS);

// Render UI
ui.render(document.getElementById('app'));

// Wire ELM327 log to UI
elm.onLog((dir, text) => ui.addLog(dir, text));

// Track combined state: BLE state + ELM327 state
let connected = false;

adapter.onStateChange((bleState) => {
  if (bleState === 'disconnected') {
    connected = false;
    pidManager.stop();
    ui.setStatus('disconnected');
  } else if (bleState === 'connecting') {
    ui.setStatus('connecting');
  }
  // 'connected' BLE state triggers init, handled below
});

elm.onStateChange((elmState) => {
  if (elmState === 'initializing') {
    ui.setStatus('initializing');
  } else if (elmState === 'ready') {
    connected = true;
    ui.setStatus('ready');
    pidManager.start();
  } else if (elmState === 'error') {
    ui.setStatus('error');
  }
});

// Connect button handler
ui.onConnect(async () => {
  if (connected || adapter.state === 'connected') {
    pidManager.stop();
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
