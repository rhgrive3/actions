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
const restored = revertComposerTarget(composed);
const targetLine = 'const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples });';
const passLine = 'this.renderPass = new RenderPass(this.scene, this.camera);';

if (!raw.includes(targetLine) || raw.indexOf(targetLine) > raw.indexOf(passLine)) {
  throw new Error('current public renderer baseline no longer has the expected pre-pipeline composer target');
}
if (!composed.includes('createLazyComposerTarget((state) => {') || !composed.includes('THREE.HalfFloatType')) {
  throw new Error('full production composition lost the lazy HalfFloat composer policy');
}
if (/UnsignedByteType|UnsignedInt101111Type/.test(composed)) {
  throw new Error('unexpected composer target format fallback');
}
if (adaptComposerTarget(rel, restored, replaceOnce) !== composed) {
  throw new Error('composer target adapter does not round-trip the full composition');
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
  targetFormatFallbackPresent: false,
  sourceParse: 'pass',
  roundTrip: 'pass',
}, null, 2));
