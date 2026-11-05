// Sprinkler spray visual (presentation only, 2026-11-05). The logical drops,
// paint calls, damage and Math.random stream must be identical with and
// without the FX layer; the FX droplet follows the logical launch.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { SPRINKLER, beginSprinkler, stepSprinkler } from '../runtime/kit-sprinkler.mjs';
import { sprinklerSprayVisual, SPRINKLER_SPRAY_VISUAL } from '../runtime/sprinkler-spray-visual.mjs';

function world(withFx, camDistance = 5) {
  const fxCalls = [];
  const fx = withFx ? {
    q: 1, _camPos: new THREE.Vector3(camDistance, 2, 0),
    _near(pos, d) { return this._camPos.distanceToSquared(pos) < d * d; },
    drop(pos, vel, color, o) { fxCalls.push({ kind: 'drop', pos: [pos.x, pos.y, pos.z], vel: [vel.x, vel.y, vel.z], o, color }); },
    mist(pos, vel, color, size, alpha) { fxCalls.push({ kind: 'mist', size, alpha }); },
  } : undefined;
  // Floor at y=0 for drop landings; no actors besides the target.
  const physics = { segment(a, b, hit) { if (b.y <= 0 && a.y > 0) { const k = a.y / (a.y - b.y); hit.hit = true; hit.point = new THREE.Vector3().lerpVectors(a, b, k); hit.normal = new THREE.Vector3(0, 1, 0); return hit; } hit.hit = false; return hit; }, los: () => true };
  const target = { alive: true, team: 1, pos: new THREE.Vector3(2.5, 0, 0), form: 'kid', smoothY: 0 };
  const G = { physics, fx, teamColors: [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')], actors: [target] };
  return { G, fxCalls, target };
}
function run(withFx, frames = 240, camDistance = 5) {
  const { G, fxCalls } = world(withFx, camDistance);
  const paints = [], hits = [];
  const paint = { splat(at, r, team, o) { paints.push([+at.x.toFixed(6), +at.y.toFixed(6), +at.z.toFixed(6), r, team, o.seed]); return r * r; } };
  const projectiles = { applyHit(owner, actor, dmg, cause) { hits.push([dmg, cause]); } };
  const physics = { pointCapsuleDist: (p, c, r, h) => Math.hypot(p.x - c.x, p.z - c.z) - r };
  const player = { radius: .5, height: 1.6, squidHeight: .6 };
  const b = { team: 0, owner: { addTurf() {} }, age: 0, pos: new THREE.Vector3(0, .05, 0), s3Resolved: { spec: SPRINKLER } };
  beginSprinkler(b, new THREE.Vector3(0, 1, 0));
  let random = 0; const native = Math.random; Math.random = () => { random++; return .5; };
  try { for (let i = 0; i < frames; i++) { b.age += 1 / 60; stepSprinkler(b, paint, projectiles, G, physics, player); } }
  finally { Math.random = native; }
  return { paints, hits, drops: b.s3Sprinkler.drops.map(d => [d.pos.x, d.pos.y, d.pos.z, d.life]), fxCalls, random };
}

test('logic is identical with and without the spray visual', () => {
  const off = run(false), on = run(true);
  assert.ok(off.paints.length > 20, 'drops land and paint');
  assert.ok(off.hits.length > 0, 'drops damage the target');
  assert.deepEqual(on.paints, off.paints);
  assert.deepEqual(on.hits, off.hits);
  assert.deepEqual(on.drops, off.drops);
  assert.equal(on.random, off.random, 'the visual consumes no Math.random in the sprinkler step');
  assert.ok(on.fxCalls.some(c => c.kind === 'drop'));
});

test('each logical drop gets one visible droplet on the same launch and gravity, never painting', () => {
  const { fxCalls } = run(true, 60);
  const main = fxCalls.filter(c => c.kind === 'drop' && c.o.size === SPRINKLER_SPRAY_VISUAL.size);
  // First spray at the 30F deployment, then every 4F: 30,34,...,58 -> 8 sprays x 3 arms.
  assert.equal(main.length, 8 * 3);
  for (const c of main) {
    assert.ok(Math.abs(Math.hypot(c.vel[0], c.vel[2]) - SPRINKLER.dropletSpeed) < 1e-9, 'same horizontal launch speed');
    assert.ok(Math.abs(c.vel[1] - SPRINKLER.dropletLift) < 1e-9, 'same lift');
    assert.ok(Math.abs(c.o.gravity * SPRINKLER_SPRAY_VISUAL.baseFxGravity - SPRINKLER.dropletGravity) < 1e-9, 'same gravity');
    assert.equal(c.o.paint, undefined, 'never a painting FX droplet');
    assert.ok(Math.abs(c.pos[1] - .15) < 1e-9, 'from the nozzle');
  }
  // Variation: satellites differ in speed/direction; mist every other spray.
  const sats = fxCalls.filter(c => c.kind === 'drop' && c.o.size === SPRINKLER_SPRAY_VISUAL.satelliteSize);
  assert.ok(sats.length > 4 && sats.length < 24);
  assert.ok(new Set(sats.map(s => Math.hypot(...s.vel).toFixed(3))).size > 3);
  assert.equal(fxCalls.filter(c => c.kind === 'mist').length, 4);
  // Budget: at most 3 main + 3 satellite + 1 mist per spray.
  assert.ok(fxCalls.length <= 8 * 7);
});

test('far from the camera, without FX, or without a team colour: nothing is spawned', () => {
  assert.equal(run(true, 120, 80).fxCalls.length, 0);
  assert.equal(sprinklerSprayVisual({}, { team: 0 }, { pos: new THREE.Vector3(), vel: new THREE.Vector3(), seed: .1 }, SPRINKLER, 0, 0), 0);
  const { G } = world(true); G.teamColors = [];
  assert.equal(sprinklerSprayVisual(G, { team: 0 }, { pos: new THREE.Vector3(), vel: new THREE.Vector3(), seed: .1 }, SPRINKLER, 0, 0), 0);
});
