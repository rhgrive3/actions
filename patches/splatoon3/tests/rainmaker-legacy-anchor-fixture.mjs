// Historical source-only calibration for the support/form correction branches.
// Shoulder carry can make the production arm reachable without those overlays;
// retain the old stress geometry instead of weakening its negative controls.
// Model geometry, support socket, source bank, driver and correction code stay
// current. Only the four audited pre-shoulder anchor/pitch literals are restored.
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

export const LEGACY_RAINMAKER_ANCHOR = 'pre-shoulder pitch.22 x-steep.128 y.83 z.22';
const relativeMotion = 'patches/splatoon3/runtime/ranked/rainmaker-motion.mjs';
const replacements = [
  ['const pitch = .04 * (1 - ready) - .08 * kick;', 'const pitch = .22 * (1 - ready) - .08 * kick;'],
  ['const x = -.09 + .04 * steepAim, y = .91 + .06 * ready + .01 * kick, z = .22 - .02 * ready * (1 - steepAim) - .015 * kick + forwardReach - .06 * steepAim;',
    'const x = -.09 + .128 * steepAim, y = .83 + .06 * ready + .01 * kick, z = .22 - .015 * kick + forwardReach;'],
];

export function legacyRainmakerAnchorTransform(relative, source) {
  if (relative !== relativeMotion) return source;
  for (const [current, historical] of replacements) {
    assert.equal(source.split(current).length, 2, 'Audited current Rainmaker anchor boundary changed: ' + current);
    source = source.replace(current, historical);
  }
  return source;
}

export function sourceLoadedLegacyRainmakerAnchorFixture(options = {}) {
  assert.equal(options.moduleTransform, undefined, 'Legacy anchor calibration owns its explicit test-only transform');
  // Production-pose tests continue to exercise the requested source/emitted
  // target. Historical stress is deliberately labelled source-only.
  return sourceLoadedActorFixture({...options, sourceOnly: true, moduleTransform: legacyRainmakerAnchorTransform});
}
