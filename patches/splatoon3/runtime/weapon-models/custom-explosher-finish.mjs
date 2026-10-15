// Restore the already-authored Custom Explosher can finish against the current
// base builder's olive and recessed-panel colors. No geometry or markings added.
import { THREE } from './kit.mjs';
import { MODELS } from './sloshers.mjs';
const pairs = [
  [new THREE.Color('#59632f'), new THREE.Color('#c3b38d')],
  [new THREE.Color('#435128'), new THREE.Color('#978762')],
];
export function finishCustomExplosher(d) {
  const source = d.body;
  if (!source?.attributes.color) return d;
  const out = source.clone(), color = out.attributes.color;
  for (let i = 0; i < color.count; i++) {
    const pair = pairs.find(([a]) => Math.abs(color.getX(i)-a.r)<1e-6 && Math.abs(color.getY(i)-a.g)<1e-6 && Math.abs(color.getZ(i)-a.b)<1e-6);
    if (pair) color.setXYZ(i, pair[1].r, pair[1].g, pair[1].b);
  }
  // The base builder returns fresh geometry, as in the existing variant finish.
  source.dispose();
  d.body = out;
  return d;
}

const base = MODELS['s3-slosher-washtub'];
export const FOLLOWUP_MODELS = Object.freeze({
  Slosher_Washtub_01: Object.freeze({
    ...base, sourceRow: 'Slosher_Washtub_01', baseId: 's3-slosher-washtub',
    name: 'Custom Explosher',
    build(d) { return finishCustomExplosher(base.build(d)); },
  }),
});
