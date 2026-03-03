# BLE OBD2 Dashboard PWA

Web Bluetooth OBD2 dashboard for Toyota Yaris Hybrid 2020 with real-time vehicle data display.
Connects to a Vlinker MC+ (or any ELM327-based BLE adapter) directly from Chrome.

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

## File structure

```
├── index.html          — Single-page app shell
├── main.js             — Entry point, wires all layers together
├── config.js           — All constants and configuration
├── ble-adapter.js      — Web Bluetooth connection layer
├── elm327.js           — ELM327 protocol, command queue, response parsing
├── atsh-manager.js     — ECU header switching for Toyota proprietary PIDs
├── pid-manager.js      — Multi-PID polling rotation engine
├── pids-standard.js    — Standard OBD2 PID definitions
├── pids-toyota.js      — Toyota-specific PID definitions (separate file)
├── store.js            — Reactive data store with 60s rolling history
├── ui.js               — Functional dashboard UI
├── manifest.json       — PWA manifest
└── service-worker.js   — Offline shell caching
```
