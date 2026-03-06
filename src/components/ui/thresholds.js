/**
 * Selects the first threshold band whose max boundary contains the value.
 * Bands are evaluated in array order and should be sorted by ascending max.
 */
export function pickThresholdBand(value, bands) {
  for (const band of bands) {
    if (value < band.max) return band;
  }
  return bands[bands.length - 1];
}

/**
 * Returns a color based on ascending "greater-than" thresholds.
 * Example: [{ gt: 70, color: 'amber' }, { gt: 95, color: 'red' }]
 */
export function colorByGreaterThan(value, defaultColor, thresholds) {
  let color = defaultColor;
  for (const threshold of thresholds) {
    if (value > threshold.gt) color = threshold.color;
  }
  return color;
}
