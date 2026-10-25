import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const defaultModule = new URL('../runtime/kit-trizooka.mjs', import.meta.url);
function verifyEmittedModule(url) {
  const file = fs.realpathSync(url), site = path.resolve(path.dirname(file), '../../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(manifest.build.optimization, 'esbuild-minify');
  assert.equal(digest(JSON.stringify(manifest.files)), manifest.inputHash);
  assert.equal(digest(JSON.stringify(manifest.artifacts)), manifest.contentHash);
  for (const name of ['kit-trizooka.mjs', 'trizooka-collision.mjs']) {
    const rel = 'patches/splatoon3/runtime/' + name, bytes = fs.readFileSync(path.join(site, rel));
    assert.equal(digest(bytes), manifest.artifacts[rel], rel + ' actual emitted artifact');
    assert.deepEqual(fs.readFileSync(path.join(site, '_versions', manifest.build.revision, rel)), bytes, rel + ' revision copy');
  }
  return { contentHash: manifest.contentHash, inputHash: manifest.inputHash };
}
const moduleURL = process.env.KITS_TRIZOOKA_MODULE ? pathToFileURL(path.resolve(process.env.KITS_TRIZOOKA_MODULE)) : defaultModule;
const candidateBuild = process.env.KITS_TRIZOOKA_MODULE ? verifyEmittedModule(moduleURL) : null;
const nativeURL = new URL('./trizooka-collision.mjs', moduleURL);
const production = await import(moduleURL.href), native = await import(nativeURL.href);
const hash = text => createHash('sha256').update(text).digest('hex');
const frozen = fs.readFileSync(new URL('./fixtures/trizooka-orbit-before-scalars-6dacd470.mjs.txt', import.meta.url), 'utf8');
assert.equal(hash(frozen), '5f7735f18eb6529582d2f53786ed88984ae33df2117473a7ae3d83cf04ec440f', 'frozen public-selector oracle');
const nativeFrozen = fs.readFileSync(new URL('./fixtures/trizooka-delta-before-shared-basis-6dacd470.mjs.txt', import.meta.url), 'utf8');
assert.equal(hash(nativeFrozen), '7032ddf4fb6aa48747a90d781bde58714c9c43f043db70e6591a429167bf1fd0', 'frozen native-delta oracle');
export const oldOrbit = new Function('TRIZOOKA_ORBIT', 'VOLLEY_CONFIG', frozen.replace(/export function /g, 'function ') + '\nreturn trizookaOrbitOffset;')
  (production.TRIZOOKA_ORBIT, production.VOLLEY_CONFIG);
export const candidateOrbit = production.trizookaOrbitOffset;
export const candidateDelta = native.kitTrizookaOrbitDelta;
let oldDelta = new Function('isKitProjectile', 'trizookaOrbitOffset', nativeFrozen.replace('export function ', 'function ') + '\nreturn kitTrizookaOrbitDelta;')
  (native.isKitProjectile, oldOrbit);
let oldCalibration = { orbit: production.TRIZOOKA_ORBIT, volley: production.VOLLEY_CONFIG };
let beforeMode = 'frozen-function-oracle', beforeModule = null, beforeNative = null, beforeBuild = null;
if (process.env.KITS_TRIZOOKA_BEFORE_MODULE) {
  const url = pathToFileURL(path.resolve(process.env.KITS_TRIZOOKA_BEFORE_MODULE));
  beforeBuild = verifyEmittedModule(url);
  const before = await import(url.href), collisionURL = new URL('./trizooka-collision.mjs', url);
  const beforeCollision = await import(collisionURL.href);
  oldDelta = beforeCollision.kitTrizookaOrbitDelta;
  oldCalibration = { orbit: before.TRIZOOKA_ORBIT, volley: before.VOLLEY_CONFIG };
  beforeMode = 'paired-actual-modules'; beforeModule = url.href; beforeNative = collisionURL.href;
}
export { oldDelta, oldCalibration, THREE };
export const calibration = { orbit: production.TRIZOOKA_ORBIT, volley: production.VOLLEY_CONFIG };
export const provenance = { module: moduleURL.href, moduleSHA256: hash(fs.readFileSync(moduleURL)),
  candidateBuild, beforeBuild,
  nativeModule: nativeURL.href, nativeSHA256: hash(fs.readFileSync(nativeURL)), beforeMode, beforeModule, beforeNative,
  beforeNativeSHA256: beforeNative ? hash(fs.readFileSync(new URL(beforeNative))) : null,
  frozenBase: '6dacd47095352cfd600f9c83012c71a2f298a460', frozenSHA256: hash(frozen), nativeFrozenSHA256: hash(nativeFrozen) };

export function mathCounts(run) {
  const names = ['hypot', 'sin', 'cos'], original = Object.fromEntries(names.map(name => [name, Math[name]]));
  const count = Object.fromEntries(names.map(name => [name, 0]));
  try {
    for (const name of names) Math[name] = function (...args) { count[name]++; return original[name](...args); };
    return { value: run(), count };
  } finally { for (const name of names) Math[name] = original[name]; }
}
