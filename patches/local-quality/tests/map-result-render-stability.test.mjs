// Regression for the two black/flickering map/result paths:
// 1) body.iw-dio-on must not hide the *expanded* 2D Turf Map;
// 2) Showcase composites its transparent results only from RGBA16F targets.
// The mobile composer uses an R11G11B10F RGB target for Grade (#642), so
// choosing writeBuffer blindly may turn its transparent black pixels opaque.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptShowcaseAlpha, selectShowcaseAlphaTarget } from '../showcase-alpha-adapter.mjs';
import { adaptMinimapResources } from '../minimap-resource-adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';

const source = (rel) => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const replaceOnce = (code, before, after, label) => {
  const index = code.indexOf(before);
  if (index < 0 || code.indexOf(before, index + before.length) !== -1) throw Error('patch conflict: ' + label);
  return code.slice(0, index) + after + code.slice(index + before.length);
};
const THREE = { RGBFormat: 1022, RGBAFormat: 1023, HalfFloatType: 1016, UnsignedInt101111Type: 35899 };
const target = (type, format, w = 960, h = 540) =>
  ({ isWebGLRenderTarget: true, depthBuffer: true, texture: { type, format }, width: w, height: h });

test('mobile packed post target cannot be used as alpha-bearing Results source', () => {
  const packed = target(THREE.UnsignedInt101111Type, THREE.RGBFormat);
  const scene = target(THREE.HalfFloatType, THREE.RGBAFormat);
  const composer = { writeBuffer: packed, renderTarget2: scene };
  assert.equal(selectShowcaseAlphaTarget(THREE, composer, 960, 540), scene,
    'fallback to existing alpha-bearing scene buffer, without allocating another HDR buffer');
  composer.writeBuffer = scene;
  assert.equal(selectShowcaseAlphaTarget(THREE, composer, 960, 540), scene);
});

test('incompatible or missing compositor targets require a separate RGBA offscreen', () => {
  const packed = target(THREE.UnsignedInt101111Type, THREE.RGBFormat);
  const noDepth = { ...target(THREE.HalfFloatType, THREE.RGBAFormat), depthBuffer: false };
  assert.equal(selectShowcaseAlphaTarget(THREE, { writeBuffer: packed, renderTarget2: noDepth }, 960, 540), null);
  assert.equal(selectShowcaseAlphaTarget(THREE, { writeBuffer: packed }, 960, 540), null);
  assert.equal(selectShowcaseAlphaTarget(THREE, { writeBuffer: target(THREE.HalfFloatType, THREE.RGBAFormat, 700, 400) }, 960, 540), null);
  assert.equal(selectShowcaseAlphaTarget(THREE, null, 960, 540), null);
});

test('Showcase source composes exactly one alpha-safe selector at module scope', () => {
  const raw = source('src/game/showcase.js');
  assert.match(raw, /comp && comp\.writeBuffer/);
  const patched = adaptShowcaseAlpha('src/game/showcase.js', raw, replaceOnce);
  assert.match(patched, /const b = selectShowcaseAlphaTarget\(THREE, comp, w, h\);/);
  assert.equal((patched.match(/function selectShowcaseAlphaTarget\(/g) || []).length, 1);
  assert.ok(patched.indexOf('function selectShowcaseAlphaTarget(') < patched.indexOf('export class Showcase'),
    'helper must be at module scope, not accidentally placed inside class body');
  assert.doesNotMatch(patched, /b\.texture\.type !== THREE\.UnsignedByteType/);
  assert.throws(() => adaptShowcaseAlpha('src/game/showcase.js', patched, replaceOnce), /patch conflict/);
  assert.equal(adaptShowcaseAlpha('src/game/minimap.js', raw, replaceOnce), raw);
  const production = adaptQualitySource('src/game/showcase.js', raw);
  assert.match(production, /const b = selectShowcaseAlphaTarget\(THREE, comp, w, h\);/);
  if (vm.SourceTextModule) new vm.SourceTextModule(production, { identifier: 'src/game/showcase.js' });
});

test('explicit Turf Map stays visible on top of dimmer even with diorama CSS active', () => {
  const raw = source('styles/hud.css');
  assert.match(raw, /body\.iw-dio-on \.iw-map,/);
  assert.match(raw, /\.iw-map-dim\.is-on \{ opacity: 1; \}/);
  const patched = adaptMinimapResources('styles/hud.css', raw);
  assert.match(patched, /body\.iw-dio-on \.iw-map:not\(\.is-expanded\),/);
  assert.doesNotMatch(patched, /body\.iw-dio-on \.iw-map,/);
  assert.match(patched, /\.iw-map__canvas \{/);
  assert.throws(() => adaptMinimapResources('styles/hud.css', patched), /minimap patch conflict/);
  const production = adaptQualitySource('styles/hud.css', raw);
  assert.match(production, /body\.iw-dio-on \.iw-map:not\(\.is-expanded\),/);
});

test('hidden corner map remains hidden in diorama and ordinary map modes remain unchanged', () => {
  const raw = source('styles/hud.css');
  const patched = adaptMinimapResources('styles/hud.css', raw);
  const selector = patched.split('\n').find(line => line.includes('body.iw-dio-on .iw-map:not(.is-expanded),'));
  assert.ok(selector?.includes('body.iw-dio-on .iw-xh'));
  assert.ok(selector?.includes('body.iw-dio-on .iw-prompt'));
  assert.ok(selector?.includes('body.iw-dio-on .iw-callouts'));
  assert.match(patched, /\.iw-map\.is-expanded \.iw-map__label \{ opacity: 0; \}/);
  assert.equal(adaptMinimapResources('src/game/showcase.js', 'not map source'), 'not map source');
});
