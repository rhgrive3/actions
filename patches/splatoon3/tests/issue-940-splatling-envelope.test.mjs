import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FixedClock } from '../runtime/clock.mjs';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
async function setup() {
  const f = await fixture({ composeProductionAdapters: true }), a = f.make('splatling');
  f.G.actors = [a]; f.G.boss = null; f.G.netm = null;
  f.G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  f.G.physics = new f.Physics(f.G.level);
  const ps = f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 100);
  return { ...f, a, ps };
}
test('#940 maximum Splatling envelope and jump recovery do not use generic bloom or spreadFirst', async () => {
  const f = await setup(), { a } = f, r = a.weaponRunner;
  const source = f.profile.weaponsFidelityCompletion.weapons.splatling.WeaponParam;
  assert.equal(a.weapon.spreadGround, source.Stand_DegSwerve);
  assert.equal(a.weapon.spreadAir, source.Jump_DegSwerve);
  for (const bloom of [0, .4, 1]) for (const first of [undefined, .1, .6, .9]) {
    r.bloom = bloom; a.weapon.spreadFirst = first;
    for (const [grounded, age, expected] of [[true, null, 3.3], [false, null, 7], [false, 25, 7], [true, 47.5, 5.15], [true, 70, 3.3]]) {
      a.grounded = grounded; a.s3SplatlingJumpAgeFrames = age;
      close(r._spreadDeg(a.weapon), expected);
    }
  }
});
test('#940 native launch reaches the full horizontal envelope while preserving pitch and four RNG draws', async () => {
  const f = await setup(), { a, ps } = f;
  for (const [grounded, horizontal] of [[true, 3.3], [false, 7]]) for (const azimuth of [0, .25]) {
    a.grounded = grounded;
    const draws = [.5, 1 - 1e-12, azimuth, .5]; let count = 0;
    f.setRandom(() => { count++; return draws.shift() ?? .5; });
    ps.fireSplatling(a, a.weapon, a.weaponRunner._spreadDeg(a.weapon));
    const p = ps.list.at(-1);
    const angle = azimuth === 0 ? Math.abs(Math.atan2(p.vel.x, p.vel.z)) : Math.abs(Math.atan2(p.vel.y, Math.hypot(p.vel.x, p.vel.z)));
    close(angle * 180 / Math.PI, azimuth === 0 ? horizontal : 1.6);
    assert.equal(count, 4, 'no unverified bias-as-probability draw is inserted');
    ps.clear();
  }
});
test('#940 released stream has no Shooter recovery; other families retain theirs', async () => {
  const f = await setup(), { a } = f;
  a.weaponRunner.bloom = .7; a.weaponRunner.update(1 / 60, { fire: false });
  close(a.weaponRunner.bloom, .7); close(a.weaponRunner.spread, 3.3);
  const shooter = f.make('shooter'); shooter.weaponRunner.bloom = .7;
  shooter.weaponRunner.update(1 / 60, { fire: false });
  assert.ok(shooter.weaponRunner.bloom < .7);
});
test('#940 first, second, fifteenth and final seeded stream bullets agree at 30/60/120Hz with released or reheld ZR', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) for (const held of [false, true]) {
    const f = await setup(), { a, ps } = f, r = a.weaponRunner;
    a.intent.fire = true;
    for (let i = 0; i < 73; i++) r.update(1 / 60, { fire: true });
    assert.equal(r.charge, 1);
    a.intent.fire = false; r.update(1 / 60, { fire: false });
    const rows = [], push = ps._push; let frame = 0, seed = 940;
    f.setRandom(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; });
    ps._push = function (p) { rows.push([frame, r.spread, ...Array.from(p.vel.toArray()), p.seed]); return push.call(this, p); };
    const clock = new FixedClock(); a.intent.fire = held;
    for (let render = 0; render < hz * 3; render++) clock.advance(1 / hz, dt => { frame++; if (r.streaming) r.update(dt, { fire: held }); });
    assert.equal(rows.length, 40); close(a.ink, 77.5);
    for (const i of [0, 1, 14, 39]) { assert.equal(rows[i][0], 1 + i * 4); close(rows[i][1], 3.3); }
    traces.push(rows);
  }
  for (const rows of traces.slice(1)) assert.deepEqual(rows, traces[0]);
});
test('#940 release-recovery guard fails closed on upstream anchor drift', () => {
  const raw = fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8');
  const anchor = 'if (!inp.fire) this.bloom = Math.max(0, this.bloom - dt / (w.bloomRecover ?? 0.28));';
  assert.throws(() => adaptSource('src/game/weapons.js', raw.replace(anchor, '')), /conflict/);
  assert.throws(() => adaptSource('src/game/weapons.js', raw + '\n' + anchor), /conflict/);
});
