import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import {fixture as wireFixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import { sampleSplatlingSpeed } from '../runtime/splatling.mjs';

const DT = 1 / 60;
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
const advance = (a, frames, input = { fire: true }, dt = DT) => {
  a.intent.fire=!!input.fire;
  // These tests count charging/stream phase time, after the separate1F admission.
  if(input.fire&&!a.weaponRunner.charging&&!a.weaponRunner.streaming&&!a.weaponRunner.s3SplatlingHeld&&a.weaponRunner.cooldown<=1e-10)a.weaponRunner.update(DT,input);
  for (let i = 0; i < frames; i++) a.weaponRunner.update(dt, input);
};
const release = a => {a.intent.fire=false;return a.weaponRunner.update(DT, { fire: false });};

test('#209: actual runner has 48/72 ground and 192/288 air stage boundaries', async () => {
  for (const [grounded, first, full] of [[true, 48, 72], [false, 192, 288]]) {
    const f = await fixture(), a = f.make('splatling'); a.grounded = grounded;
    advance(a, first - 1); assert.ok(a.weaponRunner.charge < 2 / 3);
    advance(a, 1); near(a.weaponRunner.charge, 2 / 3);
    advance(a, full - first - 1); assert.ok(a.weaponRunner.charge < 1);
    advance(a, 1); assert.equal(a.weaponRunner.charge, 1);
    assert.equal(a.ink, 100, 'logical reservation does not spend before release');
  }
});

test('#209: takeoff/landing preserve progress, including variable update partitions', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('splatling');
    advance(a, hz / 5, { fire: true }, 1 / hz);
    a.grounded = false; advance(a, hz * 4 / 5, { fire: true }, 1 / hz);
    a.grounded = true; advance(a, hz * 2 / 5, { fire: true }, 1 / hz);
    near(a.weaponRunner.chargeT, .8); near(a.weaponRunner.charge, 2 / 3);
  }
});

test('#254: empty tank completes at quarter speed; air+empty is not 1/16 speed', async () => {
  for (const grounded of [true, false]) {
    const f = await fixture(), a = f.make('splatling'); a.ink = 0; a.grounded = grounded;
    advance(a, 191); assert.ok(a.weaponRunner.charge < 2 / 3);
    advance(a, 1); near(a.weaponRunner.charge, 2 / 3);
    advance(a, 95); assert.ok(a.weaponRunner.charge < 1);
    advance(a, 1); assert.equal(a.weaponRunner.charge, 1);
    release(a); advance(a, 160, { fire: false });
    assert.equal(f.shots.length, 0,'unfunded slow charge cannot emit unpaid rounds'); assert.equal(a.ink, 0);
  }
});

test('#254: affordable boundary only changes rate, never permanently caps progress', async () => {
  for (const ink of [0, 2.8124, 2.8125, 2.8126, 3, 11.25, 22.4999, 22.5]) {
    const f = await fixture(), a = f.make('splatling'); a.ink = ink; a.lastFire = 0;
    a.intent.fire = true;
    f.tick(a, 600);
    assert.equal(a.weaponRunner.charge, 1, `ink=${ink}`);
    near(a.ink, ink, 'no charge-funded regeneration');
    a.intent.squid = true; f.tick(a,7); // preserve the existing6F interruption owner
    assert.equal(a.weaponRunner.charging, false);
    // Actor updates resources before the runner on the cancellation tick;
    // ordinary own-ink recovery is allowed now that the fresh ZL wins.
    assert.ok(a.ink >= ink && a.ink <= ink + f.profile.resources.inkRefillSwim * DT + 1e-8);
  }
});

test('#254: a timestep split at ink exhaustion matches 30/60/120Hz charge progress', async () => {
  const values = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('splatling'); a.ink = 3;
    advance(a, hz, { fire: true }, 1 / hz); values.push(a.weaponRunner.charge);
  }
  near(values[0], values[1]); near(values[1], values[2]);
  assert.ok(values[0] > .1777778);
});

test('#250: reholding ZR cannot change a stream spread sequence or charge it again', async () => {
  const traces = [];
  for (const fire of [false, true]) {
    const f = await fixture(), a = f.make('splatling'), spreads = [];
    f.G.projectiles.fireSplatling = (_a, _w, spread) => spreads.push(spread);
    advance(a, 72); release(a); advance(a, 160, { fire });
    assert.equal(a.weaponRunner.streaming, false); assert.equal(a.weaponRunner.charging, false);
    near(a.ink, 77.5); assert.equal(spreads.length, 40); traces.push(spreads);
    a.grounded = false; assert.ok(a.weaponRunner._spreadDeg(a.weapon) > spreads[0]);
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.ok(traces[0].every(value => value === traces[0][0]));
});

test('#294: cancelled stream returns only prepaid unshot ink, including gear and partial charge', async () => {
  for (const frames of [24, 48, 72]) for (const gear of [false, true]) {
    const f = await fixture(), a = f.make('splatling');
    if (gear) {
      a.s3.loadout = Array.from({ length: 3 }, () => ({ main: 'inkSaverMain', subs: Array(3).fill('inkSaverMain') }));
      a.setWeapon('splatling');
    }
    advance(a, frames); release(a);
    const prepaid = 100 - a.ink, total = a.weaponRunner.s3Spin.shots;
    advance(a, 13, { fire: false }); assert.equal(f.shots.length, 4);
    a.form = 'squid'; release(a);
    near(100 - a.ink, prepaid * 4 / total);
    assert.equal(a.weaponRunner.streaming, false); assert.equal(a.weaponRunner.s3Spin, null);
    release(a); near(100 - a.ink, prepaid * 4 / total, 'no double refund');
  }
});

test('#294: low-ink earned charge can never be converted into extra tank ink', async () => {
  for (const ink of [0, 3, 11.25]) {
    const f = await fixture(), a = f.make('splatling'); a.ink = ink;
    for (let i = 0; i < 3; i++) {
      a.form = 'kid'; advance(a, 288); release(a);
      a.form = 'squid'; release(a);
      near(a.ink, ink); assert.ok(a.ink >= 0 && a.ink <= 100);
    }
  }
});

test('#294: R stops the stream before sub processing; release never revives the old burst', async () => {
  const f = await fixture(), a = f.make('splatling'); let bombs = 0;
  f.G.projectiles.throwBomb = () => bombs++;
  advance(a, 72); release(a); advance(a, 13, { fire: false });
  const before = f.shots.length; assert.equal(before, 4);
  a.weaponRunner.update(DT, { fire: false, sub: true });
  assert.equal(a.weaponRunner.streaming, false); near(a.ink, 97.75);
  for(let i=0;i<5;i++)a.weaponRunner.update(DT,{sub:true});
  a.weaponRunner.update(DT, { fire: false, subReleased: true });
  assert.equal(bombs, 1); near(a.ink, 27.75);
  advance(a, 60, { fire: false }); assert.equal(f.shots.length, before);
  advance(a, 1); assert.equal(a.weaponRunner.charging, true);
});

test('#294: insufficient sub, special, weapon switch, reset and death cannot duplicate a refund', async () => {
  const f = await fixture(), a = f.make('splatling'); let bombs = 0;
  f.G.projectiles.throwBomb = () => bombs++;
  a.ink = 3; advance(a, 288); release(a); advance(a, 13, { fire: false });
  a.weaponRunner.update(DT, { sub: true }); a.weaponRunner.update(DT, { subReleased: true });
  assert.equal(bombs, 0); assert.equal(a.weaponRunner.streaming, false); near(a.ink, .75);
  a.setWeapon('shooter'); near(a.ink, .75); a.reset(); assert.equal(a.ink, 100);
  a.setWeapon('splatling'); a.grounded = true;
  advance(a, 72); release(a); advance(a, 13, { fire: false });
  a.weapon = { ...a.weapon, special: 'storm' }; f.G.projectiles.throwStorm = () => {};
  a._startSpecial(); assert.equal(a.weaponRunner.streaming, false); near(a.ink, 97.75);
  a.specialActive = null; advance(a, 60, { fire: false });
  const count = f.shots.length;
  advance(a, 72); release(a); a.alive = false; a.weaponRunner.onDeath();
  assert.equal(a.weaponRunner.s3Spin, null); a.reset(); assert.equal(a.ink, 100);
  advance(a, 60, { fire: false }); assert.equal(f.shots.length, count);
});

test('30/60/120Hz render partitions yield identical native fixed-tick spin/ink/shot traces', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('splatling'), clock = new FixedClock(), rows = [];
    for (let frame = 0; frame < hz * 5; frame++) clock.advance(1 / hz, dt => {
      const t = rows.length;
      a.grounded = t < 20 || t >= 60;
      a.weaponRunner.update(dt, { fire: t < 102 });
      rows.push([a.weaponRunner.charge, a.ink, f.shots.length]);
    });
    assert.equal(rows.length, 300); traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('#252: speed quantiles have a sourced absolute half-width and center bias, not +/-12 percent', () => {
  near(sampleSplatlingSpeed(126, 7.2, .2, 0), 118.8);
  near(sampleSplatlingSpeed(126, 7.2, .2, 1), 133.2);
  near(sampleSplatlingSpeed(126, 7.2, .2, .5), 126);
  near(sampleSplatlingSpeed(126, 7.2, .2, .75), 127.44);
  near(sampleSplatlingSpeed(126, 7.2, .2, .25), 124.56);
});

test('#252: actual emitted projectiles vary in norm before recording; ghosts use transmitted velocity', async () => {
  const f = await wireFixture({site:`${ROOT}.splat-wire-source`,seed:252,fidelity:true,network:true}), a = f.make('splatling'), system = new f.Projectiles(new f.THREE.Scene());
  a.aimPoint.set(0, 1.05, 80); a.aimDir.set(0, 0, 1); f.G.actors = [a];
  a.nid = 1;
  const net = new f.NetMatch({ myId: 'test' }, {}); f.G.netm = net;
  for (let i = 0; i < 512; i++) system.fireSplatling(a, a.weapon, 0);
  const speeds = system.list.map(p => p.vel.length());
  assert.ok(Math.max(...speeds) - Math.min(...speeds) > 10);
  assert.ok(speeds.every(s => s >= 55.8 - 1e-8 && s <= 70.2 + 1e-8));
  assert.equal(net.out.length, 512);
  for (let i = 0; i < speeds.length; i++) {
    const p = system.list[i], packet = net.out[i];
    for (const [axis, index] of [['x', 8], ['y', 9], ['z', 10]])
      assert.ok(Math.abs(packet[index] - p.vel[axis]) <= .005 + 1e-8, 'native r2 packet quantization');
  }
  const packet = net.out[0], count = net.out.length;
  system.ghostProjectile(a, packet);
  assert.deepEqual(system.list.at(-1).vel.toArray(), packet.slice(8, 11));
  assert.equal(net.out.length, count, 'ghost never resamples or retransmits');
  system.clear();
  a.setWeapon('shooter');
  for (let i = 0; i < 10; i++) system.fireShooter(a, a.weapon, 0);
  assert.ok(system.list.every(p => Math.abs(p.vel.length() - a.weapon.projSpeed) < 1e-8));
});
