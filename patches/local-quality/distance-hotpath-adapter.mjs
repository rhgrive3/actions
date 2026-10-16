// Build-only exact-result distance broad phases. Boundary cases retain the
// original Math.hypot and footprint tests; gameplay thresholds never change.
export function adaptDistanceHotpath(rel, code, once) {
  if (rel === 'src/world/paint.js') {
    if (code.includes('const outer2 = outer * outer, inner2 = inner * inner;')) {
      throw new Error('INKWAVE quality patch conflict (paint distance bounds): already applied');
    }
    // r > .02 on this path. Squaring cannot underflow the thresholds. Overflow
    // and NaN comparisons fall through to the original scaled hypot. The 1e-12
    // relative margins are much larger than rounding in the few multiplies/adds.
    code = once(code, '    const cellA = f.cu * f.cv;',
      `    const cellA = f.cu * f.cv;
    const outer = r * (sourced ? 1 : WOB_MAX) * (1 + 1e-12);
    const inner = r * (sourced ? 1 - 1e-12 : 0.68 - 1e-12);
    const outer2 = outer * outer, inner2 = inner * inner;`, 'paint squared-distance bounds');
    const original = `          const d = Math.hypot(px, py);
          if (d > r * (sourced ? 1 : WOB_MAX)) continue;
          if (sourced && d > r) continue;
          if (!sourced) {
          if (d >= r * 0.68 && d / (r * blobWobble(Math.atan2(py, px), seed)) > 1) continue; // PR1188: GPU body zero crossing
          }`;
    code = once(code, original,
      `          const d2 = px * px + py * py;
          if (d2 > outer2) continue;
          if (!(d2 < inner2)) {
${original}
          }`, 'paint retain exact footprint near boundary');
  }

  return code;
}
