// CSSOM rounds serialized numbers; JS double equality is not a valid CSS gate.
// 0.001 SVG user units is far below one pixel for the 100-unit HUD viewBox.
export function assertRespawnRing(offset, circumference, expectedRatio) {
  const text = String(offset).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(text)) throw Error('Invalid death ring CSS value: ' + text);
  const value = Number.parseFloat(text), expected = circumference * expectedRatio;
  if (!Number.isFinite(circumference) || circumference <= 0 || !Number.isFinite(expectedRatio) || expectedRatio < 0 || expectedRatio > 1 || !Number.isFinite(value) || Math.abs(value - expected) > .001)
    throw Error('Compiled death ring desynchronized: ' + JSON.stringify({ offset, circumference, expectedRatio, value, expected, tolerance: .001 }));
  return value / circumference;
}
