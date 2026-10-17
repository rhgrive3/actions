import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const rel = 'src/world/levelMaterial.js';
const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const composed = adaptBuildSource(rel, raw);
const orientation = /normal = normalize\(mat3\(viewMatrix\) \* \(nBase - slope\.x \* T - slope\.y \* Bt\)\) \* faceDirection;/;

test('the production world-normal replacement preserves Three double-sided orientation', () => {
  assert.match(composed, orientation);
  assert.doesNotMatch(composed, /vec3 wn = normalize\(nBase - slope\.x \* T - slope\.y \* Bt\);/);
  assert.match(composed, /clearcoatNormal = normal;/);
  assert.match(composed, /mat\.side = THREE\.DoubleSide;/);
  assert.match(composed, /inkwave-level-v6-quality2/);
});

test('normal orientation adds no texture access or draw and retains native shadow/coverage behavior', () => {
  const withoutOrientation = composed.replace(orientation, '');
  const samples = code => [...code.matchAll(/\btexture(?:2D|Grad|Lod)?\s*\(/g)].length;
  assert.equal(samples(composed), samples(withoutOrientation));
  for (const source of [composed, withoutOrientation]) {
    assert.match(source, /mat\.alphaToCoverage = true;/);
    assert.match(source, /if \(solid < 0\.5\) discard;/);
    assert.match(source, /if \(texlibCoverage\(ts\.albedo\.a, fu \* tl\.y, uTexSize\) < 0\.5 && !vertical\) discard;/);
  }
  // Three provides the sign before this replacement; the custom shader must
  // retain that contract rather than deriving a second camera-facing normal.
  const three = fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js', import.meta.url), 'utf8');
  assert.ok(three.includes('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;'));
  assert.ok(three.includes('normal *= faceDirection;'));
});
