import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { adaptSource } from '../patches/splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../patches/touch-layout/adapter.mjs';
import { adaptReliability } from '../patches/reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce } from '../patches/local-quality/adapter.mjs';
import { adaptNetworkSource } from '../patches/network-replication/adapter.mjs';
import { adaptRange } from '../patches/practice-range/adapter.mjs';
import { adaptComposerTarget, revertComposerTarget } from '../patches/local-quality/composer-target-adapter.mjs';

const rel = 'src/core/renderer.js';
const raw = fs.readFileSync(new URL(`../inkwave-public/${rel}`, import.meta.url), 'utf8');
const composed = adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(
  rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))))));
const lazyOnly = adaptComposerTarget(rel, raw, replaceOnce);
const restored = revertComposerTarget(lazyOnly);
const targetLine = 'const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';
const passLine = 'this.renderPass = new RenderPass(this.scene, this.camera);';

if (!raw.includes(targetLine) || raw.indexOf(targetLine) > raw.indexOf(passLine)) {
  throw new Error('current public renderer baseline no longer has the expected pre-pipeline composer target');
}
if (!composed.includes('createLazyComposerTarget((state) => {') || !composed.includes('THREE.HalfFloatType')) {
  throw new Error('full production composition lost the lazy HalfFloat composer policy');
}
if (/UnsignedByteType/.test(composed) ||
    !composed.includes('type: THREE.UnsignedInt101111Type') ||
    !composed.includes('configureComposerColorTargets(THREE, composer, composerColorTarget)') ||
    !composed.includes('composerColorTarget.options')) {
  throw new Error('full production composition lost the guarded packed Grade target or HDR fallback');
}
if (adaptComposerTarget(rel, restored, replaceOnce) !== lazyOnly) {
  throw new Error('lazy target adapter does not round-trip its own composition');
}
if (!vm.SourceTextModule) throw new Error('run with --experimental-vm-modules to parse the full composition');
new vm.SourceTextModule(composed, { identifier: rel });

console.log(JSON.stringify({
  source: rel,
  rawSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  fullCompositionSha256: crypto.createHash('sha256').update(composed).digest('hex'),
  productionLayers: ['splatoon3', 'touch-layout', 'reliability', 'local-quality', 'network-replication', 'practice-range'],
  baselineTargetBeforePassPipeline: true,
  fullCompositionUsesLazyHalfFloatTargets: true,
  guardedPackedGradeWithHalfFloatFallback: true,
  sourceParse: 'pass',
  roundTrip: 'pass',
}, null, 2));
