import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptSource } from '../adapter.mjs';
import { adaptAgent3WeaponPhysics } from '../agent3-weapon-physics-adapter.mjs';
import {
  installAgent3WeaponPhysics,
  rollerBodyOverlap,
  slosherWallDropPlan,
  beginAgent3SlosherWallDrop,
  stepAgent3SlosherWallDrop,
} from '../runtime/agent3-weapon-physics.mjs';

const root = new URL('../../../', import.meta.url);
const profile = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/profile.json', root)));
const source = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');

function replaceOnce(sourceText, before, after, label) {
  const first = sourceText.indexOf(before);
  if (first < 0 || sourceText.indexOf(before, first + before.length) >= 0) throw new Error('conflict ' + label);
  return sourceText.slice(0, first) + after + sourceText.slice(first + before.length);
}

test('production adapter owns only Slosher wall-drop and Roller body admission', () => {
  const out = adaptSource('src/game/weapons.js', source);
  assert.match(out, /agent3-weapon-physics\.mjs/);
  assert.match(out, /stepAgent3SlosherWallDrop\(this, p, dt\)/);
  assert.match(out, /beginAgent3SlosherWallDrop\(this, p, hit\)/);
  assert.match(out, /agent3RollerBodyContact\(a, e, hs\)/);
  assert.doesNotMatch(out, /lat < w\.rollWidth \/ 2 \+ 0\.35/);
});

test('adapter remains composable after another wall-drop layer wraps staged movement', () => {
  const synthetic = `      if (fidelityWallDropDone === null) {\n      advanceFidelityProjectile(p, dt);\n      }\n` +
    `        if (hit.hit) {\n          if (beginFidelityWallDrop(this, p, hit)) return false;\n          this._impact(p, hit);\n          dead = true;\n        }\n` +
    `      if (fwd > -0.2 && fwd < 1.35 && lat < w.rollWidth / 2 + 0.35 && Math.abs(dy) < 1.2 && hs > 1.0) {`;
  const out = adaptAgent3WeaponPhysics('src/game/weapons.js', synthetic, replaceOnce);
  assert.match(out, /beginFidelityWallDrop/);
  assert.match(out, /beginAgent3SlosherWallDrop/);
  assert.match(out, /stepAgent3SlosherWallDrop/);
  assert.match(out, /agent3RollerBodyContact/);
});

test('Roller body contact consumes pinned WidthHalf/Radius, not rolling paint width', () => {
  const body = profile.weaponsFidelityCompletion.weapons.roller.BodyParam.CollisionParam;
  assert.equal(body.WidthHalf, 1.4);
  assert.equal(body.Radius, .4);
  assert.equal(rollerBodyOverlap(.5, 0, 0, 2, body, .38), true, 'center');
  assert.equal(rollerBodyOverlap(.5, 1.35, 0, 2, body, .38), true, 'reported clipped edge');
  assert.equal(rollerBodyOverlap(.5, 1.4, 0, 2, body, .38), true, 'body edge');
  assert.equal(rollerBodyOverlap(.5, 1.779, 0, 2, body, .38), true, 'inside body + native player radius');
  assert.equal(rollerBodyOverlap(.5, 1.781, 0, 2, body, .38), false, 'outside body + native player radius');
  assert.equal(rollerBodyOverlap(1.36, 0, 0, 2, body, .38), false, 'existing longitudinal gate retained');
});

test('Slosher wall-drop plan retains pinned phases and configured 4/1 wall-hit branches', () => {
  const units = profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit;
  const zero = slosherWallDropPlan(units[0], 0, .125);
  assert.ok(zero.main.firstFrames >= 20 && zero.main.firstFrames <= 40);
  assert.equal(zero.main.secondFrames, 20);
  assert.ok(zero.main.lastFrames >= 15 && zero.main.lastFrames <= 35);
  assert.deepEqual(zero.main.paint, { shock: 2, fall: 1, ground: .7 });
  const one = slosherWallDropPlan(units[1], 0, .25);
  assert.deepEqual(one, slosherWallDropPlan(units[1], 0, .25), 'fixed seed is deterministic');
  assert.equal(one.wallHits.length, 4);
  assert.ok(one.wallHits.every(x => x.secondFrames === 10 && x.paint.shock === .9 && x.paint.fall === .65 && x.paint.ground === .4));
  assert.ok(one.wallHits.every(x => x.spawn.FirstDistance === 2.4 && x.spawn.BetweenDistance === 1.3 && x.spawn.DistanceXZRate === 1.333333 && x.spawn.VelocityMinusYRate === .45));
  const two = slosherWallDropPlan(units[2], 3, .5);
  assert.equal(two.wallHits.length, 1);
  assert.equal(slosherWallDropPlan(units[2], 2, .5).wallHits.length, 0);
  assert.equal(two.main.gravity, .008 * 3600);
});

test('Slosher wall state paints shock/fall/ground authoritatively and ghosts never repaint', () => {
  class Hit {
    constructor() { this.hit = false; this.normal = new THREE.Vector3(); this.point = new THREE.Vector3(); this.block = -1; this.face = -1; }
  }
  class Projectiles { _new() { return {}; } clear() {} }
  const paints = [];
  const G = {
    paint: { splat(pos, radius, team, opts) { paints.push({ pos: pos.clone(), radius, team, opts }); return 1; } },
    physics: {
      level: { blocks: [], faces: [] },
      segment(from, to, out) {
        out.hit = false;
        if (from.y > 0 && to.y <= 0) {
          const t = from.y / (from.y - to.y);
          out.hit = true;
          out.point.copy(from).lerp(to, t);
          out.normal.set(0, 1, 0);
        }
        return out;
      },
    },
    fx: null,
  };
  installAgent3WeaponPhysics({ Projectiles, PLAYER: { radius: .38 }, THREE, Hit, G, emit() {} }, profile);
  const unit = profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit[1];
  const owner = { color: new THREE.Color(), turf: 0, addTurf(area) { this.turf += area; } };
  const make = ghost => ({
    type: 'slosh', fidelitySloshUnit: unit, fidelitySloshIndex: 0, seed: .25,
    vel: new THREE.Vector3(0, -1, 8), pos: new THREE.Vector3(0, 2.5, 2.9), prev: new THREE.Vector3(0, 2.5, 2.9),
    owner, team: 0, ghost, age: 0, trailEvery: 1,
  });
  const wall = { hit: true, point: new THREE.Vector3(0, 2.5, 3), normal: new THREE.Vector3(0, 0, -1), block: -1, face: -1 };
  const system = {};
  const p = make(false);
  assert.equal(beginAgent3SlosherWallDrop(system, p, wall), true);
  assert.equal(p.agent3SlosherWallDrop.tracks.length, 5);
  let done = false;
  for (let i = 0; i < 180 && !done; i++) done = stepAgent3SlosherWallDrop(system, p, 1 / 60);
  assert.equal(done, true);
  const radii = paints.map(x => x.radius);
  for (const radius of [2.585, .9, 1, .65, .7, .4]) assert.ok(radii.some(x => Math.abs(x - radius) < 1e-9), 'paint radius ' + radius);
  assert.ok(owner.turf > 0);
  const before = paints.length;
  const ghost = make(true);
  assert.equal(beginAgent3SlosherWallDrop(system, ghost, wall), true);
  for (let i = 0; i < 30; i++) stepAgent3SlosherWallDrop(system, ghost, 1 / 60);
  assert.equal(paints.length, before);
});
