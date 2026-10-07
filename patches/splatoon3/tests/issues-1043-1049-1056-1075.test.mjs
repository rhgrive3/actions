import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';
import { isSquidReturnerCeiling } from '../runtime/movement.mjs';
import { blasterSplashExposed } from '../runtime/weapons.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const DT = 1 / 60;

test('#1075 ordinary ceilings do not strip armor; only explicit Squid Returner blocks classify', () => {
  const actor = { contacts: { ceiling: true, ceilingBlock: 0 } };
  const physics = { level: { blocks: [{ squidReturner: false }, { squidReturner: true }] } };
  assert.equal(isSquidReturnerCeiling(actor, physics), false, 'ordinary ceiling');
  actor.contacts.ceilingBlock = 1;
  assert.equal(isSquidReturnerCeiling(actor, physics), true, 'explicit Squid Returner');
  actor.contacts.ceiling = false;
  assert.equal(isSquidReturnerCeiling(actor, physics), false, 'block identity alone is not a contact');

  const physicsSource = adaptSource('src/game/physics.js', read('src/game/physics.js'));
  const levelSource = adaptSource('src/world/level.js', read('src/world/level.js'));
  assert.match(physicsSource, /c\.ceilingBlock = -1/);
  assert.match(physicsSource, /c\.ceilingBlock = b\.id/);
  assert.match(levelSource, /squidReturner: !!d\.squidReturner/);
});

async function rollerLanding(frame) {
  const f = await fixture();
  const a = f.make('roller'), r = a.weaponRunner, w = a.weapon;
  a.grounded = false;
  r._roller(DT, { fire: true, firePressed: true }, w);
  assert.equal(r.s3RollerAttack?.vertical, true, 'airborne press starts vertical');
  for (let i = 1; i <= frame; i++) {
    a.grounded = i === frame;
    r._roller(DT, { fire: true, firePressed: false }, w);
  }
  return { f, a, r, w };
}

test('#1056 landing on reference frames 1..5 converts once to horizontal minus-1F startup', async () => {
  for (const frame of [1, 3, 5]) {
    const { r, w } = await rollerLanding(frame);
    assert.equal(r.s3RollerAttack.vertical, false, `frame ${frame}`);
    assert.equal(r.s3FlickVertical, false, `frame ${frame} runner mode`);
    assert.ok(Math.abs(r.s3RollerAttack.windup - (w.flickWindup - DT)) < 1e-10,
      `frame ${frame} uses faster horizontal startup`);
    assert.ok(Math.abs(r.s3RollerAttack.elapsed - frame * DT) < 1e-10,
      'conversion preserves elapsed startup time');
  }
});

test('#1056 landing on frame 6 stays vertical', async () => {
  const { r, w } = await rollerLanding(6);
  assert.equal(r.s3RollerAttack.vertical, true);
  assert.equal(r.s3FlickVertical, true);
  assert.notEqual(r.s3RollerAttack.windup, w.flickWindup - DT);
});

test('#1049 Blaster flight splash uses the pinned 3..10 drop-height window instead of native 4u cutoff', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url), 'utf8'));
  const splash = profile.weaponsFidelityCompletion.weapons.blaster.SplashPaintParam;
  assert.equal(splash.DepthMaxDropHeight, 3);
  assert.equal(splash.DepthMinDropHeight, 10);

  const fidelity = fs.readFileSync(new URL('../runtime/weapons-fidelity.mjs', import.meta.url), 'utf8');
  assert.match(fidelity, /p\.s3SplashDropFull=splash\.DepthMaxDropHeight/);
  assert.match(fidelity, /p\.s3SplashDropMax=splash\.DepthMinDropHeight/);

  const composed = adaptSource('src/game/weapons.js', read('src/game/weapons.js'));
  assert.match(composed, /const dropProbe = p\.type === 'blast'.*p\.s3SplashDropMax/s);
  assert.match(composed, /G\.physics\.raycast\(p\.pos, DOWN, dropProbe, _hit2, true\)/);
});

class V {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new V(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}

test('#1043 Blaster splash admits an exposed capsule edge even when the center ray is covered', () => {
  const center = new V(0, 0.8, -3);
  const actor = { pos: new V(0, 0, 0), smoothY: 0, form: 'kid' };
  const player = { radius: 0.5, height: 1.8, squidHeight: 0.8 };
  const sampled = [];
  const physics = {
    los(_from, to) {
      sampled.push([to.x, to.y, to.z]);
      return Math.abs(to.x) > 0.2; // narrow cover blocks center, not capsule silhouette.
    },
  };
  assert.equal(blasterSplashExposed(physics, center, actor, player), true);
  assert.ok(sampled.some(p => Math.abs(p[0]) > 0.2), 'side of the collision capsule was sampled');
});

test('#1043 fully sealed cover still blocks Blaster splash', () => {
  const center = new V(0, 0.8, -3);
  const actor = { pos: new V(0, 0, 0), smoothY: 0, form: 'kid' };
  const player = { radius: 0.5, height: 1.8, squidHeight: 0.8 };
  let rays = 0;
  assert.equal(blasterSplashExposed({ los() { rays++; return false; } }, center, actor, player), false);
  assert.equal(rays, 9, 'three heights by three lateral capsule samples');
});

test('#1043/#1060 composed Blaster burst keeps damage but not generic floor stamp', () => {
  const composed = adaptSource('src/game/weapons.js', read('src/game/weapons.js'));
  const a = composed.indexOf('  _blastBurst(p, at, direct) {');
  const b = composed.indexOf('\n  _updateBombs(dt) {', a);
  assert.ok(a >= 0 && b > a);
  const burst = composed.slice(a, b);
  assert.match(burst, /blasterSplashExposed/);
  assert.match(burst, /blasterBurstDamage|distanceDamage/);
  assert.doesNotMatch(burst, /paint under the burst/);
  assert.doesNotMatch(burst, /w\.impactRadius/);
});
