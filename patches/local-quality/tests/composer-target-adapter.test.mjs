// #642: the composer ping-pong pair on touch presets stays isolated per effective
// quality preset: R11F_G11F_B10F (float/HDR, 4 bytes per pixel) only when the touch
// preset has msaa/ao/bloom off AND EXT_color_buffer_float can render it, RGBA16F
// otherwise. The pre-fix composition must reconstruct upstream byte-for-byte, and
// the decision must fail closed on any of its four guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptQualitySource, replaceOnce, qualityIdentity } from '../adapter.mjs';
import { adaptComposerTarget, revertComposerTarget } from '../composer-target-adapter.mjs';

const REL = 'src/core/renderer.js';
const read = (rel) => fs.readFileSync('inkwave-public/' + rel, 'utf8');
const BASELINE_LINE =
  '    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';

test('#642 adapter targets only renderer.js and fails closed on drift or duplication', async () => {
  const raw = read(REL);
  assert.ok(raw.includes(BASELINE_LINE), 'upstream still carries the exact baseline line');
  const out = adaptComposerTarget(REL, raw, replaceOnce);
  assert.notEqual(out, raw);
  assert.ok(out.includes('{ ...composerRt, samples }'));
  // The fail-closed guards: touch preset, ao off, bloom off, msaa off, plus the
  // renderability capability probe that keeps RGBA16F as the fallback.
  assert.ok(
    out.includes("const composerRt = this.mobile.touch && !q.ao && !q.bloom && !samples &&\n      r.extensions.has('EXT_color_buffer_float')"),
    'preset + capability gates present verbatim');
  assert.ok(out.includes('? { format: THREE.RGBFormat, type: THREE.UnsignedInt101111Type }'));
  assert.ok(out.includes(': { type: THREE.HalfFloatType };'), 'RGBA16F fallback preserved');
  assert.throws(() => adaptComposerTarget(REL, '', replaceOnce), /conflict/);
  assert.throws(() => adaptComposerTarget(REL, raw + raw, replaceOnce), /conflict/);
  assert.throws(() => adaptComposerTarget(REL, out, replaceOnce), /conflict/);
  for (const p of ['src/config.js', 'src/core/device.js', 'src/core/ctx.js', 'src/main.js']) {
    assert.equal(adaptComposerTarget(p, read(p), replaceOnce), read(p), p + ' untouched');
  }
  assert.ok(qualityIdentity()['composer-target-adapter.mjs'], 'identity covers the adapter');
  assert.ok(adaptQualitySource(REL, raw).includes('THREE.UnsignedInt101111Type'),
    'quality chain wires the composer target isolation');
});

test('#642 pre-fix composition reconstructs upstream byte-for-byte', () => {
  const raw = read(REL);
  const composed = adaptQualitySource(REL, raw);
  assert.ok(composed !== raw);
  assert.ok(!composed.includes(BASELINE_LINE), 'unconditional RGBA16F line is gone');
  assert.equal(revertComposerTarget(composed), raw,
    'reverting the #642 block equals upstream: the only delta is this policy block');
});

test('#642 complete production adapter composition keeps the policy and parses', async () => {
  // Same composition order as scripts/build-inkwave.mjs (the six production layers).
  const { adaptSource } = await import('../../splatoon3/adapter.mjs');
  const { adaptTouchLayout } = await import('../../touch-layout/adapter.mjs');
  const { adaptReliability } = await import('../../reliability/adapter.mjs');
  const { adaptNetworkSource } = await import('../../network-replication/adapter.mjs');
  const { adaptRange } = await import('../../practice-range/adapter.mjs');
  const rel = REL, raw = read(rel);
  const full = adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(
    rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))))));
  assert.equal(full, adaptQualitySource(rel, raw),
    'no other production layer touches renderer.js');
  assert.ok(full.includes('THREE.UnsignedInt101111Type'));
  assert.equal(revertComposerTarget(full), raw);
  if (vm.SourceTextModule) new vm.SourceTextModule(full, { identifier: rel });
});
