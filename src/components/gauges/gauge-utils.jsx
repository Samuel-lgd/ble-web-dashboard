/**
 * SVG gauge utility functions.
 * Shared math for arc paths, needle angles, tick marks.
 */

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

/** SVG needle with center cap rivet */
export function Needle({ angle, length = 35, cx = 0, cy = 0, color = '#ff3333' }) {
  const [tx, ty] = polarToXY(cx, cy, length, angle);
  const [bx, by] = polarToXY(cx, cy, 4, angle + 180);
  return (
    <g className="gauge-needle-line" style={{ transform: `rotate(0deg)` }}>
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="url(#needle-glow)" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
      <circle cx={cx} cy={cy} r="3.5" fill="url(#bezel-cap)" stroke="#222" strokeWidth="0.5" />
      <circle cx={cx} cy={cy} r="1.5" fill="#555" />
    </g>
  );
}

/** Reusable SVG circular gauge shell with chrome bezel */
export function GaugeShell({ size = 100, children, className = '' }) {
  const r = size / 2;
  return (
    <svg viewBox={`${-r} ${-r} ${size} ${size}`} className={`w-full h-full ${className}`}>
      <defs>
        <BezelDefs id="bezel" />
        <radialGradient id="needle-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6666" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ff3333" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Outer bezel ring */}
      <circle cx="0" cy="0" r={r - 1} fill="url(#bezel-bezel-ring)" stroke="#1a1a1c" strokeWidth="1" />
      {/* Inner face circle */}
      <circle cx="0" cy="0" r={r - 4} fill="url(#bezel-face)" />
      {/* Subtle inner shadow */}
      <circle cx="0" cy="0" r={r - 4} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
      {children}
    </svg>
  );
}
