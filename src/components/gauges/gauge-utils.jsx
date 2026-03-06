// SVG gauge utilities: arc paths, needle angles, tick marks, smoothed value interpolation
import { useState, useEffect, useRef } from 'react';

/**
 * Stable font-style reference for Orbitron gauge typography.
 * Use `style={ORBITRON}` in SVG <text> or combine via `{ ...ORBITRON, fontWeight }` .
 * Prefer `className="font-orbitron"` in HTML/SVG elements where no spread is needed.
 */
export const ORBITRON = { fontFamily: 'Orbitron, monospace' };

export const START_ANGLE = -135;
export const END_ANGLE = 135;
export const SWEEP = END_ANGLE - START_ANGLE; // 270°

export function valueToAngle(value, min, max, startAngle = START_ANGLE, endAngle = END_ANGLE) {
  const clamped = Math.max(min, Math.min(max, value));
  return startAngle + ((clamped - min) / (max - min)) * (endAngle - startAngle);
}

export function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export function describeArc(cx, cy, r, startAngle, endAngle) {
  if (Math.abs(endAngle - startAngle) < 0.1) return '';
  const [sx, sy] = polarToXY(cx, cy, r, startAngle);
  const [ex, ey] = polarToXY(cx, cy, r, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} ${sweep} ${ex} ${ey}`;
}

export function generateTicks(min, max, majorStep, minorStep, radius, cx = 0, cy = 0) {
  const ticks = [];
  for (let v = min; v <= max; v += minorStep) {
    const angle = valueToAngle(v, min, max);
    const isMajor = Math.abs(v % majorStep) < 0.001 || Math.abs(v % majorStep - majorStep) < 0.001;
    const innerR = isMajor ? radius - 6 : radius - 3.5;
    const [ox, oy] = polarToXY(cx, cy, radius, angle);
    const [ix, iy] = polarToXY(cx, cy, innerR, angle);
    ticks.push({ v, ox, oy, ix, iy, angle, isMajor });
  }
  return ticks;
}

/**
 * Reusable SVG tick marks renderer for circular gauges.
 * Replaces identical map-over-generateTicks blocks in Rpm, EnginePower, FuelConsumption gauges.
 */
export function TickMarks({
  ticks, labelRadius, min, max,
  fontSize = '4', fill = '#666',
  majorStroke = '#777', minorStroke = '#444',
  majorWidth = 1, minorWidth = 0.5,
  labelFn = (v) => v,
}) {
  return ticks.map(({ v, ox, oy, ix, iy, isMajor }) => (
    <g key={v}>
      <line x1={ix} y1={iy} x2={ox} y2={oy}
        stroke={isMajor ? majorStroke : minorStroke}
        strokeWidth={isMajor ? majorWidth : minorWidth} />
      {isMajor && (
        <text
          x={polarToXY(0, 0, labelRadius, valueToAngle(v, min, max))[0]}
          y={polarToXY(0, 0, labelRadius, valueToAngle(v, min, max))[1]}
          fill={fill} fontSize={fontSize}
          textAnchor="middle" dominantBaseline="central"
          className="font-orbitron">
          {labelFn(v)}
        </text>
      )}
    </g>
  ));
}

export const SHIFT_MAP = { 0: 'P', 1: 'R', 2: 'N', 3: 'D', 4: 'B', 80: 'P', 82: 'R', 78: 'N', 68: 'D', 66: 'B' };

export function shiftLabel(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'string' && val.length === 1) return val;
  return SHIFT_MAP[val] ?? String(val);
}

/** Bezel gradient defs for SVG gauges */
export function BezelDefs({ id = 'bezel' }) {
  return (
    <>
      <radialGradient id={`${id}-face`} cx="50%" cy="48%" r="50%">
        <stop offset="0%" stopColor="#14141a" />
        <stop offset="70%" stopColor="#0a0a0c" />
        <stop offset="100%" stopColor="#050508" />
      </radialGradient>
      <linearGradient id={`${id}-bezel-ring`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4a4a50" />
        <stop offset="25%" stopColor="#2a2a2e" />
        <stop offset="50%" stopColor="#5a5a60" />
        <stop offset="75%" stopColor="#3a3a3e" />
        <stop offset="100%" stopColor="#4a4a50" />
      </linearGradient>
      <radialGradient id={`${id}-cap`} cx="50%" cy="45%" r="50%">
        <stop offset="0%" stopColor="#888" />
        <stop offset="100%" stopColor="#333" />
      </radialGradient>
    </>
  );
}

/** Reusable circular bezel + face + inner shadow. Used by 8+ gauge components. */
export function GaugeBezel({ id, outerR, innerR, outerStrokeWidth = 0.8, shadowStrokeWidth = 1.5 }) {
  return (
    <>
      <circle cx="0" cy="0" r={outerR} fill={`url(#${id}-bezel-ring)`} stroke="#1a1a1c" strokeWidth={outerStrokeWidth} />
      <circle cx="0" cy="0" r={innerR} fill={`url(#${id}-face)`} />
      {shadowStrokeWidth > 0 && (
        <circle cx="0" cy="0" r={innerR} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={shadowStrokeWidth} />
      )}
    </>
  );
}

/**
 * Reusable SVG glow filter. Covers both simple glow (blur + overlay) and
 * tinted glow (blur + color matrix + overlay). Replaces 11+ hand-written
 * filter definitions across gauge/visualization components.
 */
export function GlowFilter({ id, stdDeviation = 1.5, colorMatrix, ...filterAttrs }) {
  return (
    <filter id={id} {...filterAttrs}>
      <feGaussianBlur in="SourceGraphic" stdDeviation={stdDeviation} result="blur" />
      {colorMatrix ? (
        <>
          <feColorMatrix in="blur" type="matrix" values={colorMatrix} result="tinted" />
          <feMerge><feMergeNode in="tinted" /><feMergeNode in="SourceGraphic" /></feMerge>
        </>
      ) : (
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      )}
    </filter>
  );
}

/** Reusable SVG needle with optional glow line and center cap rivet. */
export function GaugeNeedle({
  angle, length = 35, backLength = 4,
  color = '#ff3333', strokeWidth = 1.5,
  glowColor, glowWidth, glowOpacity = 0.2,
  capId, capR = 3, dotR = 1.2,
}) {
  const [nx, ny] = polarToXY(0, 0, length, angle);
  const [nbx, nby] = polarToXY(0, 0, backLength, angle + 180);
  return (
    <>
      <line x1={nbx} y1={nby} x2={nx} y2={ny}
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        className="gauge-needle-line" />
      {glowColor && (
        <line x1={nbx} y1={nby} x2={nx} y2={ny}
          stroke={glowColor} strokeWidth={glowWidth ?? strokeWidth * 2} strokeLinecap="round"
          opacity={glowOpacity} className="gauge-needle-line" />
      )}
      <circle cx="0" cy="0" r={capR} fill={`url(#${capId}-cap)`} stroke="#1a1a1c" strokeWidth="0.3" />
      <circle cx="0" cy="0" r={dotR} fill="#555" />
    </>
  );
}

/**
 * Smoothly animates a numeric value toward its latest target using
 * exponential decay. Automatically measures the interval between target
 * changes (i.e. the effective polling rate) and uses that as the animation
 * duration so the transition always fills the gap between two data points.
 *
 * @param {number} target - The raw/latest value (e.g. from a PID).
 * @returns {number} The interpolated display value.
 */
export function useSmoothedValue(target) {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const targetRef    = useRef(target);
  const durationRef  = useRef(300);          // initial guess

  //   const DURATION = 250;

  // if (target !== targetRef.current) {
  //   targetRef.current = target;
  // }


  // Track last two target-change timestamps to derive the polling interval
  const lastChangeRef = useRef(performance.now());

  // On every target change, measure elapsed since the previous change
  // and use an exponential moving average to smooth the interval estimate.
  if (target !== targetRef.current) {
    const now = performance.now();
    const measured = now - lastChangeRef.current;
    lastChangeRef.current = now;
    targetRef.current = target;

    // EMA with α=0.3 — responsive but not jittery
    if (measured > 30 && measured < 1000) {
      durationRef.current = durationRef.current * 0.7 + measured * 0.3;
    }
  }

  useEffect(() => {
    let frameId;
    let lastTs = null;

    function animate(ts) {
      if (lastTs === null) lastTs = ts;
      const dt  = Math.min(ts - lastTs, 100);
      lastTs = ts;

      const tgt  = targetRef.current;
      const dur  = durationRef.current;
      const cur  = displayedRef.current;
      const diff = tgt - cur;

      if (Math.abs(diff) < 0.001) {
        displayedRef.current = tgt;
        setDisplayed(tgt);
        return;
      }

      const alpha = 1 - Math.exp(-dt / (dur / 3));
      const next  = cur + diff * alpha;
      displayedRef.current = next;
      setDisplayed(next);
      frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [target]);

  return displayed;
}

/**
 * Shared numeric + unit readout used by multiple gauges.
 * Pure presentational helper to keep markup consistent without changing visuals.
 */
export function GaugeValueReadout({
  value,
  unit,
  x = 0,
  yValue,
  yUnit,
  valueFill = '#e0e0e0',
  unitFill = '#555',
  valueFontSize = 12,
  unitFontSize = 4,
  valueWeight = 700,
  textAnchor = 'middle',
}) {
  return (
    <>
      <text x={x} y={yValue} fill={valueFill} fontSize={valueFontSize} textAnchor={textAnchor}
        className="font-orbitron" style={{ fontWeight: valueWeight }}>
        {value}
      </text>
      <text x={x} y={yUnit} fill={unitFill} fontSize={unitFontSize} textAnchor={textAnchor}
        className="font-orbitron">
        {unit}
      </text>
    </>
  );
}
