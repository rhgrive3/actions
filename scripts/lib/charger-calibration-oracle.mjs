import { compileFlatSourcedStamp } from './source-paint-oracle.mjs';

// #1651 changes only the flat Charger stamp geometry: lateral WidthHalf uses
// 0.2 world units, the feet-only 1.2 radius no longer widens the first forward
// stamp, and a centred ellipse preserves source DepthHalf. Derive the entire
// new receipt from immutable pre-change physical stamps and frozen profile
// bytes. Never import the production Charger implementation or accept a new
// measured gameplay golden.
export function calibratedChargerStamps(prior) {
  const width = prior.paintPoints.at(-1).radius / 1.5;
  return prior.paintPoints.map((old, i) => {
    const stamp = {...old, center:[...old.center], footprint:'ink-charger'};
    if (i) {
      const radius = width * .2 * (i === prior.paintPoints.length - 1 ? 1.5 : 1);
      const depth = width * (1 + old.stretchAmt);
      const stretch = Math.max(0, depth / radius - 1) * 1.6;
      stamp.radius = radius;
      stamp.stretchAmt = stretch;
      stamp.center[1] = .015;
      stamp.center[2] -= radius * stretch * .375;
    }
    return stamp;
  });
}

export function chargerCalibrationReceipt(prior) {
  const paintPoints = calibratedChargerStamps(prior), cellsXZ = [];
  // Same fixed 80 x 105 m, 0.25 m grid as weapons-fixture; this scalar scan
  // uses frozen profile bytes, never production PaintSystem or culling.
  const grid = new Uint8Array(320 * 420);
  for (const stamp of paintPoints) {
    const owns = compileFlatSourcedStamp(stamp);
    let added = 0;
    for (let j=0;j<420;j++) for (let i=0;i<320;i++) {
      const index=j*320+i;
      if (owns(-40+(i+.5)*.25,-5+(j+.5)*.25)) {
        if (!grid[index]) added++;
        grid[index]=1;
      }
    }
    stamp.area=added*.0625;
  }
  for (let j=0;j<420;j++) for (let i=0;i<320;i++)
    if (grid[j*320+i]) cellsXZ.push([-40+(i+.5)*.25,-5+(j+.5)*.25]);
  return { paintPoints, cellsXZ, area:cellsXZ.length*.0625,
    maxZ:Math.max(...cellsXZ.map(p=>p[1])) };
}
// Floating point vector construction can differ by a final arithmetic ulp.
// Every field is retained; only numeric comparison precision is normalized.
export const normalizedChargerStamps = stamps => JSON.parse(JSON.stringify(stamps,
  (_key,value)=>typeof value==='number'?Math.round(value*1e8)/1e8:value));
