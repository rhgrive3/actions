import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const hash = source => createHash('sha256').update(source).digest('hex');

// The Clam comparison retains the exact original bomb motion. Later forecast
// owners import two new helpers; expose only those helpers on the old module,
// so their stateMap/sampleRelease calls still use that historical owner.
export const CLAM_PREDICTION_COMPAT = Object.freeze({
  "file": "patches/splatoon3/runtime/bomb-motion.mjs",
  "beforeBase": "3839b61a6c6c4d5ac998b82168f37b802bc55099",
  "beforeSha256": "ae3fb4d73f970e335a622ad76f17ac0b5b860924d39eb76a485958333861374c",
  "ownerCommit": "03a349162165c3496c24011e55bc043656ed93be",
  "ownerSha256": "66a1789fb72419bce483af67bfb9ece2825265902704b97af42ff7f22c877a9e",
  "bridgeSha256": "80ad08c3688137b4b8ac290aa40fc6d4145a4bee7c9107e05d37dbfce8132e20",
  "exports": [
    "stormThrowPosition",
    "bombPredictionPosition"
  ]
});
const forecastExports = [
  `export function stormThrowPosition(a, out) {
  out.copy(a.pos); out.y += 1.45;
  return out;
}`,
  `export function bombPredictionPosition(a, out) {
  const ch=a?.character,value=ch&&stateMap(ch).get(ch);
  if(!a?.weaponRunner?.aimingSub&&!value?.throwing)return out;
  return sampleRelease(a,out);
}`
];
const bridge = '\n// QA-only compatibility for the later prediction importers; historical code above is unchanged.\n'
  + forecastExports.join('\n') + '\n';

export function historicalRuntimeOverlay(file, source, beforeBase, currentSource) {
  const pin = CLAM_PREDICTION_COMPAT;
  if (file !== pin.file || beforeBase !== pin.beforeBase) return { source, compatibility: null };
  assert.equal(hash(source), pin.beforeSha256, 'Exact Clam historical bomb-motion source');
  assert.equal(hash(bridge), pin.bridgeSha256, 'Exact later forecast compatibility exports');
  for (let i = 0; i < forecastExports.length; i++) {
    assert(!source.includes('export function ' + pin.exports[i]), 'Historical namespace has no later forecast export');
    assert.equal(currentSource.split(forecastExports[i]).length, 2, 'Current forecast owner retains exact ' + pin.exports[i]);
  }
  return { source: source + bridge, compatibility: pin };
}
