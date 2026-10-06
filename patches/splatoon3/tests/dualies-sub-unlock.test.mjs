import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

async function setup() {
  const f = await fixture(), a = f.make('dualies');
  f.G.actors = [a]; f.G.match.canRespawn = () => false;
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  const ps = new f.Projectiles(new f.THREE.Scene()); f.G.projectiles = ps;
  f.tick(a, 20); a.intent.fire = true; f.tick(a, 3);
  assert.equal(ps.list.length, 1, 'start the lock through a real normal shot');
  assert.equal(a.weaponRunner.s3DualiesPostShot, 4 / 60);
  a.intent.fire = false;
  const paidBefore = a.ink;
  return { ...f, a, ps, paidBefore };
}

test('#853 hold/release before, at, and after unlock throws once at identical fixed ticks', async () => {
  for (const hz of [30, 60, 120]) for (const release of [2, 3, 4, 5]) {
    const f = await setup(), clock = new FixedClock(); let frame = 0, birthTick, paidAtBirth;
    for (let render = 0; render < hz / 2; render++) clock.advance(1 / hz, () => {
      frame++; f.a.intent.sub = frame < release;
      const before = f.ps.bombs.length; f.tick(f.a);
      if (f.ps.bombs.length !== before) { birthTick = frame; paidAtBirth = f.a.ink; }
      if (frame < 4) assert.equal(f.ps.bombs.length, 0, '4F admission stays closed');
    });
    assert.equal(birthTick, Math.max(4, release), `${hz}Hz release ${release}F`);
    assert.equal(f.ps.bombs.length, 1, 'held input/release must not duplicate bomb birth');
    assert.ok(Math.abs(paidAtBirth - (f.paidBefore - f.SUB.bomb.inkCost)) < 1e-8);
    assert.equal(f.a.weaponRunner.s3DualiesSubBuffered, false);
    assert.equal(f.a.weaponRunner.s3DualiesSubReleaseBuffered, false);
    assert.equal(f.a.weaponRunner.aimingSub, false);
    f.ps.clear();
  }
});

test('#853 cancelled buffered sub cannot replay into a new life, weapon, squid or special', async () => {
  for (const cancel of ['reset', 'weapon', 'squid', 'special']) {
    const f = await setup(); f.a.intent.sub = true; f.tick(f.a, 2);
    assert.equal(f.a.weaponRunner.s3DualiesSubBuffered, true);
    if (cancel === 'reset') f.a.weaponRunner.onDeath();
    if (cancel === 'weapon') { f.a.setWeapon('shooter'); f.a.setWeapon('dualies'); }
    if (cancel === 'squid') { f.a.form = 'squid'; f.a.intent.squid = true; }
    if (cancel === 'special') { f.a.specialActive = {}; f.a._updateSpecial = () => {}; }
    f.a.intent.sub = false; f.tick(f.a, 6);
    assert.equal(f.ps.bombs.length, 0, cancel);
    assert.equal(f.a.ink, f.paidBefore, cancel);
    f.ps.clear();
  }
});

test('#853 release with no admitted or buffered hold does not manufacture a throw', async () => {
  const f = await setup(); f.tick(f.a, 4);
  f.a.weaponRunner.update(1 / 60, { sub: false, subReleased: true });
  assert.equal(f.ps.bombs.length, 0);
  assert.equal(f.a.ink, f.paidBefore);
  f.ps.clear();
});

test('#853 owner emits one bomb packet; a remote visual birth spends no ink and emits no packet', async () => {
  const f = await setup(), nm = Object.create(f.NetMatch.prototype);
  Object.assign(nm, { mute: 0, out: [], isMine: () => true });
  f.a.nid = 1; f.G.netm = nm;
  f.a.intent.sub = true; f.tick(f.a, 3);
  f.a.intent.sub = false; f.tick(f.a, 4);
  const wire = nm.out.filter(e => e[1] === 'b');
  assert.equal(wire.length, 1); assert.equal(f.ps.bombs.length, 1);
  const remote = f.make('dualies'); remote.remote = true; remote.nid = 1;
  const beforeInk = remote.ink, e = wire[0];
  f.ps.ghostBomb(remote, ...e.slice(3, 10));
  assert.equal(f.ps.bombs.length, 2);
  assert.equal(f.ps.bombs[1].ghost, true);
  assert.equal(remote.ink, beforeInk);
  assert.equal(nm.out.filter(e => e[1] === 'b').length, 1);
  f.ps.clear();
});
