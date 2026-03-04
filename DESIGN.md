# DESIGN.md — Visual Design Decisions

## Visual Identity: Aftermarket Gauge Cluster

The dashboard emulates a high-end aftermarket gauge cluster with analog soul and digital precision. Every component must feel physically real.

---

## Color Architecture

### Thermal / Left Column (Amber-Orange-Red)
- **Primary amber**: `#f59e0b` — gauge arcs, labels, fuel values
- **Hot orange**: `#f97316` — elevated RPM, trend lines
- **Redline red**: `#ef4444` — RPM redline zone, overheat warnings
- **Background tint**: `#1a1510` — inactive thermal arc tracks

### Electric / Right Column (Blue-Cyan-Green)
- **Primary electric blue**: `#00cfff` — SOC needle, discharge arcs, kW values
- **Soft cyan**: `#22d3ee` — secondary electric accents
- **Regen green**: `#22c55e` — charging arcs, regen indicators, positive SOC deltas
- **Background tint**: `#0a1520` — inactive electric arc tracks

### Neutral / Shared
- **Gauge face**: `#0a0a0c` with `radial-gradient` vignette (center `#14141a` → edge `#050508`)
- **Chrome bezel**: `conic-gradient` with alternating `#2a2a2e` to `#5a5a60` — simulates brushed metal catching light at different angles
- **Body background**: `#0a0a0c` with CSS `repeating-linear-gradient` grid at 2px intervals and 1.2% white opacity — simulates subtle carbon fiber weave

---

## Chrome Bezel Technique

Every circular gauge uses a layered bezel system:

1. **Outer SVG circle** — filled with `linearGradient` (`#4a4a50` ↔ `#2a2a2e` ↔ `#5a5a60`) to simulate directional light reflecting off a chrome ring
2. **Thin stroke** — `#1a1a1c` 1px border for edge definition
3. **Inner face circle** — ~4px smaller radius, filled with `radialGradient` for the matte black gauge face
4. **Inner shadow** — `rgba(0,0,0,0.3)` 1.5px stroke on the face circle creates a recessed depth effect

For the speed gauge, the bezel is **octagonal** (8-point polygon) instead of circular to give the hero element distinctive character while maintaining the metallic finish treatment.

---

## Needle Implementation

All needles are SVG `<line>` elements with:
- **Material**: Colored stroke (red for RPM, amber for fuel, cyan for electric gauges)
- **Width**: 1.2–1.5px for sharpness
- **Tail**: Short 3-4px extension past center for counterbalance realism
- **Glow layer**: Second overlapping line at 3px width, 15-20% opacity, same color — creates soft luminous halo
- **Animation**: CSS `transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)` applied via `.gauge-needle-line` class — smooth deceleration mimics physical needle inertia
- **Center cap/rivet**: Two concentric circles — outer `radialGradient` (#888→#333) for brushed metal cap, inner #555 1.2px circle for rivet screw detail

---

## Tick Mark System

Generated programmatically via `generateTicks()` in `gauge-utils.js`:
- **Major ticks**: Every 1000 RPM / 10% SOC / 5 L/100km — 0.8px stroke, `#666-#777` color, 6px length
- **Minor ticks**: Subdivisions — 0.4-0.5px stroke, `#333-#444` color, 3.5px length
- **Labels**: Orbitron font at 4-4.5px on major ticks only, `#555-#666` color — subtle but readable
- **Engraved feel**: Colors are deliberately dark/recessed to look etched into the face rather than printed on top

---

## Typography

- **Numeric values**: Orbitron (Google Fonts) at weight 600-900 — geometric, technical feel
- **Labels**: Orbitron at weight 400 for smaller labels (RPM, km/h, L/100km)
- **UI chrome** (nav buttons, trip pills): Orbitron for branding consistency
- **Debug view / body text**: Inter for readability at small sizes

---

## Speed Gauge — Octagonal Hero

The center speed display breaks from circular convention:
- **Shape**: Regular octagon at radius 72, rotated 22.5° so flat edges are horizontal/vertical
- **Dual arcs**: L/100km (thermal amber, left side -135° to -5°) and kW draw (electric blue, right side 5° to 135°)
- **Speed numerals**: 28px Orbitron, 700 weight — dominates the visual hierarchy
- **Tick marks**: Light marks at 20 km/h intervals along inner octagon edge
- **Shift position + EV/HV badge**: Below speed numeral, shift letter at 8px + colored bordered pill

---

## Panel Recess Effect

Used by sparkline charts, delta tracker, and trim panels:
```css
background: linear-gradient(145deg, #08080a, #0e0e12);
border: 1px solid #1a1a1e;
box-shadow: inset 0 1px 3px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.02);
```
Creates a subtle 3D inset — the panel appears to sit below the gauge surface.

---

## Energy Flow Bar

Horizontal split showing thermal vs electric real-time draw:
- **Left half**: Amber bar grows right proportional to L/100km (0-15 range = 0-100% width)
- **Right half**: Blue bar grows left proportional to kW draw (0-30 range = 0-100% width)
- **Center divider**: 2px white line that pulses (`animation: pulse-glow 1.2s ease-in-out infinite`) when both thermal and electric are active simultaneously (mixed mode)
- **Bar height**: 6px with matching color `box-shadow` glow when active

---

## Regen/Acceleration Delta Tracker

The most unique component — a live SOC delta stopwatch:
- **Active state**: Numeric counter with `.counter-live` pulsing animation (opacity oscillation at 0.6s)
- **Drain events**: Amber `⚡` icon, negative percentage
- **Charge events**: Green `♻` icon, positive percentage
- **Event detection**: Monitors SOC changes; 3s of stability triggers lock + history push
- **History strip**: Last 3 events as compact pills with icon + delta + duration, opacity decreasing for older events

---

## A/C Load Indicator

Integrated into the fuel consumption gauge as a "ghost zone":
- **When A/C active**: Dashed cyan arc (`strokeDasharray: 1.5 1`) overlaid on fuel gauge at 25% opacity
- **Arc span**: Represents L/100km equivalent penalty (AC power W → approximate L/h → L/100km at current speed)
- **Snowflake icon**: Positioned above gauge center — full cyan when A/C on, near-invisible `#222` when off
- **Penalty label**: `+X.X` in cyan below snowflake when active

---

## Coolant & Battery Temperature Bars

Vertical thermometer-style gauges:
- **Container**: 10px wide rounded capsule with inset shadow
- **Zone tinting**: Bottom 30% blue (cold), middle 40% amber (normal), top 30% red (hot)
- **Fill bar**: Gradient from translucent to solid in the zone's color, height proportional to temp
- **Glow**: Subtle colored box-shadow on fill bar matching current zone

---

## Trip Bar

Full-width bottom strip using recessed pill design:
- **Background**: `linear-gradient(to bottom, #0c0c10, #080810)` with top border
- **Each stat**: `.trip-pill` with inset shadow — label in 6px gray + value in 8px colored Orbitron
- **Color coding**: Cost in amber, avg consumption in orange, EV% in cyan, regen in green
- **Interaction**: Full strip is clickable, navigates to trip history

---

## Layout Proportions (844×390px landscape)

```
Left column:  27% (≈228px)  — thermal gauges
Center:       46% (≈388px)  — speed hero + energy bar + sparkline
Right column: 27% (≈228px)  — electric gauges
Bottom strip: 26px fixed    — trip bar
```

Vertical distribution within columns uses `flex-grow` ratios:
- Large gauge: flex 3.5 (≈55% of column height)
- Medium gauges: flex 2 (≈30%)
- Small panels: flex 1.2 (≈15%)
