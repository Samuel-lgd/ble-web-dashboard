# BLE OBD2 Dashboard PWA

Web Bluetooth OBD2 dashboard for Toyota Yaris Hybrid 2020 with real-time vehicle data display.
Connects to a Vlinker MC+ (or any ELM327-based BLE adapter) directly from Chrome.

## Development / Mock mode

The dashboard includes a built-in simulation layer that runs without any hardware — no BLE adapter, no car needed. It is the primary way to develop and test UI components.

### Activating mock mode

In `config.js`, set:

```js
export const TRANSPORT_MODE = 'mock'; // 'ble' | 'serial' | 'mock'
```

Start the dev server and open the app. After ~3 seconds (simulated BLE connection delay) the status changes to **ready** and all gauges begin populating with live simulated data. The connection status cycle is identical to a real vehicle connection, so the connect/connecting/initializing/ready UI flow can be tested without hardware.

### Mock control panel

A floating overlay appears in the **bottom-right corner** when mock mode is active:

```
┌─────────────────────────────────────┐
│ MOCK  [city ▾]  [1× ▾]          ✕  │
│ SOC  ──────●──────────  58.2%       │
│ Speed  47 km/h  ↑                   │
│ Engine: ON   EV: OFF   A/C: OFF     │
│ [FORCE REGEN] [FORCE ACCEL]         │
│ [TOGGLE A/C]  [RESET TRIP]          │
└─────────────────────────────────────┘
```

| Control | Purpose |
|---------|---------|
| Scenario dropdown | Switch between city / highway / mixed / stress |
| Speed multiplier | 1× / 2× / 5× — accelerates the simulation clock for trip history testing |
| SOC slider | Override battery state-of-charge in real time |
| Speed readout | Live vehicle speed with direction arrows |
| Engine / EV / A/C badges | Current state at a glance |
| **Force Regen** | Triggers 5 seconds of hard braking / regen immediately |
| **Force Accel** | Triggers 5 seconds of heavy electric acceleration immediately |
| **Toggle A/C** | Toggle the A/C compressor on/off |
| **Reset Trip** | Stop the current trip and start a new one |

Click **✕** to collapse the panel to a small chip; click **MOCK** to re-expand.

### Scenarios

| Scenario | Duration | Description |
|----------|----------|-------------|
| `city` | ~15 min | Urban drive: cold start, EV mode, traffic stops, main road burst |
| `highway` | ~20 min | Motorway: on-ramp surge, 110 km/h cruise, overtaking, exit regen |
| `mixed` | ~25 min | City → national road → highway → urban end; exercises all hybrid states |
| `stress` | — | Rapid state changes: speed 0↔120, engine cycling, A/C toggle, SOC extremes |

All scenarios loop continuously.

### Console API (mock mode)

```js
// Switch scenario at runtime
mockEngine.setScenario('highway');   // 'city' | 'highway' | 'mixed' | 'stress'

// Speed up simulation clock (useful for generating trip history quickly)
mockEngine.setSpeedMultiplier(5);    // 1 | 2 | 5

// Force specific states immediately
mockEngine.forceRegen();             // 5 seconds hard braking
mockEngine.forceAccel();             // 5 seconds heavy acceleration
mockEngine.toggleAC();

// Override battery SOC directly
mockEngine.setSoc(42);               // 40–70 %

// Read current physics state (for debugging)
mockEngine.getState();

// Stop / restart
mockEngine.stop();
mockEngine.start();
```

### Switching to real hardware

Change one line in `config.js`:

```js
export const TRANSPORT_MODE = 'ble'; // was 'mock'
```

The entire mock layer is loaded via dynamic import and is excluded from the production bundle when `TRANSPORT_MODE` is not `'mock'`.

---

## Serving locally

Any static file server works. The simplest option:

```bash
npx serve .
```

Then open the displayed URL in **Chrome** (desktop or Android). Web Bluetooth requires HTTPS or `localhost`.

## Connecting to your adapter

1. Turn on your vehicle ignition (at least ACC).
2. Plug the Vlinker MC+ into the OBD2 port.
3. Open the dashboard in Chrome.
4. Click **Connect** — Chrome will show a BLE device picker.
5. Select your adapter (usually named "OBDII" or "Vlinker").
6. The status will progress: `connecting` → `initializing` → `ready`.
7. Once `ready`, PIDs start polling automatically.

Watch the **Raw Log** panel — it shows every AT command and response, which is essential for debugging.

## Identifying correct BLE UUIDs with nRF Connect

The default UUIDs in `config.js` are:

| Setting | Default | Description |
|---------|---------|-------------|
| `SERVICE_UUID` | `0xFFF0` | Primary GATT service |
| `WRITE_CHARACTERISTIC_UUID` | `0xFFF2` | Send commands here |
| `NOTIFY_CHARACTERISTIC_UUID` | `0xFFF1` | Receive responses here |

If your adapter doesn't appear in the Chrome picker or connection fails:

1. Install **nRF Connect** on your phone (free on Play Store / App Store).
2. Scan for your adapter and connect.
3. Browse the GATT services — look for a service with two characteristics:
   - One with **Write** or **Write Without Response** property → this is your write characteristic.
   - One with **Notify** property → this is your notify characteristic.
4. Note the UUIDs and update `config.js`.

Common alternative UUIDs:
- Service: `0xFFE0`, Write: `0xFFE1`, Notify: `0xFFE1` (shared characteristic)
- Service: `49535343-FE7D-4AE5-8FA9-9FAFD205E455` (some ISSC-based adapters)

## How to add a new standard OBD2 PID

Edit `pids-standard.js` and add an entry to the `STANDARD_PIDS` array:

```js
{
  pid: '0142',            // Mode 01 + PID number
  name: 'Control Module Voltage',
  unit: 'V',
  interval: POLLING.SLOW, // FAST (500ms), NORMAL (1000ms), or SLOW (5000ms)
  protocol: 'standard',
  parse(raw) {
    const b = parseBytes(raw, 2); // 2 = number of data bytes expected
    if (!b) return null;
    return ((b[0] * 256) + b[1]) / 1000;
  },
},
```

That's it. The PID will automatically appear in the grid and start polling.

Standard OBD2 PID formulas are defined in SAE J1979 / ISO 15031-5. A good reference: [OBD-II PIDs on Wikipedia](https://en.wikipedia.org/wiki/OBD-II_PIDs).

## How to add a new Toyota proprietary PID

Toyota uses extended diagnostic modes (0x21 and 0x22) that require targeting a specific ECU via the `ATSH` command. Edit `pids-toyota.js` and add an entry to the `TOYOTA_PIDS` array:

```js
{
  pid: '2101',             // Mode (21 or 22) + sub-PID
  name: 'My Custom PID',
  unit: 'RPM',
  interval: POLLING.NORMAL,
  protocol: 'toyota',
  header: '7E2',           // ECU address (see table below)
  parse(raw) {
    // parseToyotaBytes(raw, echoBytes) extracts data after the response echo.
    // echoBytes = 2 for mode 21 (response: 61 XX ...), 3 for mode 22 (response: 62 XX YY ...)
    const b = parseToyotaBytes(raw, 2);
    if (!b || b.length < 2) return null;
    // Apply your formula here
    return ((b[0] * 256) + b[1]);
  },
},
```

### ECU header reference (Toyota Yaris Hybrid)

| ECU | ATSH Header | Response Header | Description |
|-----|-------------|-----------------|-------------|
| Engine (ICE) | `7E0` | `7E8` | Engine management |
| HV Transaxle | `7E2` | `7EA` | MG1/MG2 motors, power split |
| HV Battery | `7E4` | `7EC` | Battery pack, SOC, temps |

### How header switching works

1. The `ATSHManager` sends `ATSH 7E4` to direct the next request to the HV Battery ECU.
2. It also sends `ATFCSH 7EC` to set the flow control header for multi-frame responses.
3. Your PID command (e.g., `2101`) is then sent and the response comes from that specific ECU.
4. When switching back to standard PIDs, the manager resets to defaults with `ATD`.

This is all automatic — you only need to set the `header` field in your PID definition.

### Finding and verifying Toyota PID formulas

The parse formulas in `pids-toyota.js` are marked with `[VERIFY]` where they need confirmation. To find correct formulas:

1. **OBD Fusion PID packs** — OBD Fusion sells Toyota Hybrid extended PID packs. The PID definitions (command, header, formula) can be inspected in the app's PID editor.

2. **Techstream** — Toyota's official diagnostic tool. Connect via a compatible J2534 interface and use the Data List feature to see live values. Compare Techstream's value against your raw hex response to reverse-engineer the formula.

3. **Torque Pro community PIDs** — Search for Toyota Hybrid PID files shared by the community. These are CSV files with columns: name, short name, mode+PID, equation, min, max, unit, header.

4. **Trial and error** — Send the command, log the raw hex, change a known variable (e.g., rev the engine), and observe which bytes change. Common patterns:
   - Temperature: `byte - 40` (offset)
   - RPM: `(A * 256 + B)` — check if signed (values > 32767 mean negative)
   - Voltage: `(A * 256 + B) / 2` or `/ 10`
   - Current: `(A * 256 + B - 32768) / 100` (signed with offset)

## Trip recording engine

The dashboard includes an automatic trip recording system that captures OBD snapshots, GPS tracks, and computes detailed analytics for every drive.

### How trips are stored

Trips are persisted in the browser's **IndexedDB** database (`obd2_trips`). Each trip contains:

- **Full OBD snapshots** (1 per second by default) — speed, RPM, fuel rate, hybrid battery data, motor torques, and more.
- **GPS route** (if location permission is granted) — latitude, longitude, altitude, and speed at each point.
- **Computed statistics** — distance, fuel consumed, cost, EV mode percentage, regenerative energy recovered, CO2 emissions, and more.
- **Weather data** — fetched from Open-Meteo (free, no API key) at trip end.

Trip summaries (without the large snapshot arrays) are stored separately for fast list rendering. Snapshots older than 7 days are automatically compressed (thinned to 1 per 10 seconds) to save space.

### Auto-start and auto-stop

Trips start and stop automatically based on vehicle state:

- **Auto-start**: When vehicle speed > 0 for 10 consecutive seconds after OBD connection.
- **Auto-stop**: When speed = 0 AND RPM = 0 for 60 consecutive seconds (configurable).

If the BLE connection drops mid-trip, the trip is saved with `"interrupted"` status.

### Exporting a GPX file and opening it in Google Maps

1. Open the browser console (`F12` → Console tab).
2. List your trips:
   ```js
   const trips = await tripManager.getTrips();
   console.table(trips.map(t => ({ id: t.id, start: t.startTime, km: t.stats.distanceKm.toFixed(1) })));
   ```
3. Export a trip as GPX:
   ```js
   await tripManager.exportTrip('paste-trip-id-here', 'gpx');
   ```
4. A `.gpx` file will download. To view it in Google Maps:
   - Go to [Google My Maps](https://www.google.com/maps/d/) and create a new map.
   - Click **Import** and upload the `.gpx` file.
   - Your route will appear on the map with track points.

Other export formats: `'json'` (full trip data) and `'csv'` (OBD snapshots as spreadsheet).

### Changing fuel price

The fuel price used for cost calculations is stored in `localStorage`. To change it:

```js
tripManager.getConfig().set('fuelPricePerLiter', 1.65);  // EUR per liter
```

All configurable settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `fuelPricePerLiter` | `1.85` | EUR per liter, used for cost calculation |
| `fuelType` | `"hybrid"` | Vehicle fuel type |
| `vehicleName` | `"Yaris Hybrid 2020"` | Vehicle identifier |
| `autoStartTrip` | `true` | Enable/disable auto-start |
| `autoStopDelay` | `60` | Seconds of inactivity before auto-stop |
| `snapshotIntervalMs` | `1000` | How often to capture OBD data (ms) |
| `gpsEnabled` | `true` | Enable/disable GPS tracking |
| `weatherEnabled` | `true` | Fetch weather on trip end |

To reset all settings to defaults: `tripManager.getConfig().reset()`.

### Storage quota

The trip engine monitors IndexedDB storage usage. When usage exceeds 80% of the browser's estimated quota, a `trip:storage-warning` event is emitted. You can check storage manually:

```js
const storage = tripManager._storage;
const quota = await storage.checkStorageQuota();
console.log(`Used: ${quota.usedMB.toFixed(1)} MB / ${quota.quotaMB.toFixed(0)} MB (${quota.percentUsed.toFixed(1)}%)`);
```

To free space, delete old trips:

```js
await tripManager.deleteTrip('trip-id-here');
```

### Console API reference

The `tripManager` object is available on `window` for console access:

```js
tripManager.startTrip()           // Manually start recording
tripManager.stopTrip()            // Stop and finalize
tripManager.pauseTrip()           // Pause snapshot collection
tripManager.resumeTrip()          // Resume collection
tripManager.getCurrentTrip()      // Get live trip with stats
await tripManager.getTrips()      // List all trip summaries
await tripManager.getTrip(id)     // Get full trip with snapshots
await tripManager.deleteTrip(id)  // Delete a trip
await tripManager.exportTrip(id, 'json' | 'gpx' | 'csv')
await tripManager.exportAllSummary()  // Download multi-trip CSV
```

## File structure

```
├── index.html          — Single-page app shell
├── main.js             — Legacy entry point (non-React UI), mock-aware
├── config.js           — All constants + TRANSPORT_MODE flag
├── ble-adapter.js      — Web Bluetooth connection layer
├── elm327.js           — ELM327 protocol, command queue, response parsing
├── atsh-manager.js     — ECU header switching for Toyota proprietary PIDs
├── pid-manager.js      — Multi-PID polling rotation engine
├── pids-standard.js    — Standard OBD2 PID definitions
├── pids-toyota.js      — Toyota-specific PID definitions (separate file)
├── store.js            — Reactive data store with 60s rolling history
├── ui.js               — Functional dashboard UI (legacy)
├── manifest.json       — PWA manifest
├── service-worker.js   — Offline shell caching
├── src/
│   ├── main.jsx            — React entry point, mock-aware bootstrap
│   ├── pid-keys.js         — Shared PID key string constants
│   ├── mock/
│   │   ├── mock-engine.js      — MockEngine + MockAdapter + MockELM
│   │   ├── mock-physics.js     — Pure physics functions (noise, RPM, SOC, temps…)
│   │   ├── mock-store-bridge.js — Maps sim state → store.update() calls
│   │   ├── MockControlPanel.jsx — Floating dev overlay (mock mode only)
│   │   └── scenarios/
│   │       ├── scenario-city.js     — Urban ~15 min
│   │       ├── scenario-highway.js  — Motorway ~20 min
│   │       ├── scenario-mixed.js    — Mixed real-world ~25 min
│   │       └── scenario-stress.js  — Rapid state changes for UI stress-testing
│   ├── components/
│   │   ├── App.jsx
│   │   ├── DashboardContext.jsx
│   │   └── … (gauges, sparklines, trip UI)
│   └── trips/
│       ├── trip-types.js       — JSDoc type definitions
│       ├── trip-manager.js     — Main trip orchestrator (start/stop/auto-detect)
│       ├── trip-storage.js     — IndexedDB persistence with auto-compression
│       ├── trip-calculator.js  — Pure stat computation functions
│       ├── trip-exporter.js    — JSON/GPX/CSV export with browser download
│       ├── geo-manager.js      — GPS tracking, GPX generation, reverse geocoding
│       ├── weather-manager.js  — Open-Meteo weather fetching
│       └── config-manager.js   — Persistent user settings (localStorage)
```
