#!/usr/bin/env node
// PR1188: fixed-condition Blaster (11.3.0 WeaponBlasterMiddle) floor-paint
// receipts from the composed production modules on real Level/Physics and the
// production CPU paint grid. INKWAVE measurements, not Nintendo hardware.
//   node --experimental-vm-modules scripts/measure-blaster-floor-paint.mjs [--out file.json]
import fs from 'node:fs';
import { FLOOR, blasterWorld, fire, run, settle, paintRecords, landings, cpuFootprint, flightAtHeight } from '../patches/splatoon3/tests/blaster-floor-paint-harness.mjs';

const r3 = v => Math.round(v * 1000) / 1000;
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
const result = { schema: 1, weapon: 'WeaponBlasterMiddle 11.3.0', kind: 'INKWAVE composed-module receipts (not hardware)', flightHeights: [], liveRounds: [], terrain: {}, airburst: [], cadence: {} };

for (const h of [0, 2, 3, 3.95, 4, 4.05, 5, 10]) {
  const { w, records, landings: land } = await flightAtHeight(h);
  const area = cpuFootprint(w, records, { offsetZ: 5 }).area;
  result.flightHeights.push({ height: h, splashes: records.length, depth: r3(land[0]?.depth ?? 0),
    fallFrames: Math.max(...land.map(l => l.frames)), releases: land.map(l => r3(l.releaseZ)).sort((a, b) => a - b),
    radii: [...new Set(records.map(r => r.radius))], cpuArea: area });
}
for (const actorY of [0, 2, 4, 10]) {
  const w = await blasterWorld({ actorY }); fire(w); const frames = run(w); settle(w);
  const records = paintRecords(w);
  result.liveRounds.push({ actorY, muzzleHeight: r3(actorY + 1.05), frames, requests: records.length,
    flight: records.filter(r => r.radius === 1.62 || r.radius === 2.43).length,
    timedSphere: records.filter(r => r.radius === 2).length, timedDrop: records.filter(r => r.radius === 3.2).length,
    cpuArea: cpuFootprint(w, records.filter(r => r.y < .2), { offsetZ: 5 }).area });
}
for (const [name, blocks, actorY] of [
  ['ledge 2 WU at z>=4', [FLOOR, { kind: 'box', min: [-10, 0, 4], max: [10, 2, 40] }], 2],
  ['ramp 0->3 over z 2..14', [FLOOR, { kind: 'ramp', low: [0, 0, 2], high: [0, 3, 14], width: 8, thickness: .5 }], 4],
  ['wall at z=6', [FLOOR, { kind: 'box', min: [-10, 0, 6], max: [10, 6, 7] }], 0],
]) {
  const w = await blasterWorld({ blocks, actorY }); fire(w); run(w); settle(w);
  result.terrain[name] = { landings: landings(w).map(l => ({ releaseZ: r3(l.releaseZ), x: r3(l.x), y: r3(l.y), z: r3(l.z),
    normalY: r3(l.normalY), radius: l.radius, depth: r3(l.depth) })),
    requests: paintRecords(w).map(r => ({ y: r3(r.y), z: r3(r.z), radius: r.radius })) };
}
for (const actorY of [-.55, 0, 1, 2, 5, 10]) {
  const w = await blasterWorld({ actorY }); fire(w); run(w); settle(w);
  const records = paintRecords(w), sphere = records.find(r => r.radius === 2), drop = records.find(r => r.radius === 3.2);
  result.airburst.push({ burstHeight: r3(sphere?.y ?? NaN), sphereFloorArea: cpuFootprint(w, [sphere], { offsetZ: sphere.z }).area,
    dropLandedY: r3(drop?.y ?? NaN), dropFloorArea: cpuFootprint(w, [drop], { offsetZ: drop.z }).area });
}
for (const hz of [30, 60, 120]) {
  const w = await blasterWorld({ actorY: 2 }); fire(w); run(w, hz); settle(w);
  result.cadence[hz] = paintRecords(w).map(r => [r3(r.x), r3(r.y), r3(r.z), r.radius]).sort((a, b) => a[2] - b[2] || a[3] - b[3]);
}
result.cadence.identical = JSON.stringify(result.cadence[30]) === JSON.stringify(result.cadence[60]) &&
  JSON.stringify(result.cadence[60]) === JSON.stringify(result.cadence[120]);
const text = JSON.stringify(result, null, 2) + '\n';
if (out) fs.writeFileSync(out, text); else process.stdout.write(text);
