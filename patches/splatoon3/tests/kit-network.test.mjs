import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installKitInkVac, INK_VAC_EVENTS as EV } from '../runtime/kit-ink-vac.mjs';
import { installKitNetwork } from '../runtime/kit-network.mjs';
async function setup() {
  const f = await fixture(); installKitInkVac(f, f.profile); installKitNetwork(f);
  f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  const session = myId => ({ myId, isHost: true, _members: new Map() });
  const sender = new f.NetMatch(session('peer-A'), {}), receiver = new f.NetMatch(session('peer-B'), {});
  const make = (nid, owner, remote, team = 0) => { const a = f.make('charger');
    Object.assign(a, { nid, owner, remote, team }); return a; };
  return { f, sender, receiver, make };
}
test('actual NetMatch bind forwards activation and native JSON playback binds replica to sender', async () => {
  const { f, sender, receiver, make } = await setup(), owner = make(1, 'peer-A', false), proxy = make(1, 'peer-A', true);
  owner.weapon = { ...owner.weapon, special: 'inkVac', specialCost: 190 }; owner.special = 190;
  sender.bind({ actors: [owner] }); owner._startSpecial();
  const event = sender.out.find(e => e[1] === 'ev' && e[2] === EV.activation);
  assert.ok(event, 'real bind registered the new event and real native packer recorded it');
  assert.deepEqual(JSON.parse(JSON.stringify(event[3].actor)), { n: 1 });
  receiver.byNid.set(1, proxy); f.G.netm = receiver;
  receiver._play('foreign-peer', JSON.parse(JSON.stringify(event)));
  assert.equal(f.inkVacState(proxy), null, 'foreign peer cannot open the replica');
  receiver._play('peer-A', JSON.parse(JSON.stringify(event)));
  const state = f.inkVacState(proxy); assert.ok(state?.remote); assert.equal(state.serial, event[3].serial);
  const list = f.G.projectiles.list.length;
  receiver._play('peer-A', JSON.parse(JSON.stringify(event)));
  assert.equal(f.inkVacState(proxy), state); assert.equal(f.G.projectiles.list.length, list);
  sender.unsubs.forEach(fn => fn());
});
test('native packed absorption proposal credits only the real owner once and rejects a foreign peer', async () => {
  const { f, sender, receiver, make } = await setup();
  const vac = make(2, 'peer-B', false), shooter = make(3, 'peer-A', false, 1), shooterProxy = make(3, 'peer-A', true, 1);
  vac.weapon = { ...vac.weapon, special: 'inkVac', specialCost: 190 }; vac.special = 190; vac._startSpecial();
  const state = f.inkVacState(vac); receiver.byNid.set(2, vac); receiver.byNid.set(3, shooterProxy);
  f.G.netm = sender;
  sender._onLocalEvent(EV.absorb, { actor: shooter, target: vac, kit: 'inkVac', serial: state.serial, key: '3#p1' });
  assert.equal(sender.out.length, 1); const packet = JSON.parse(JSON.stringify(sender.out[0]));
  f.G.netm = receiver; receiver._play('spoofed-peer', packet); assert.equal(state.charge, 0);
  receiver._play('peer-A', packet); assert.ok(state.charge > 0); const credited = state.charge;
  receiver._play('peer-A', packet); assert.equal(state.charge, credited);
  const malformed = JSON.parse(JSON.stringify(packet)); malformed[3].actor.n = 999;
  receiver._play('peer-A', malformed); assert.equal(state.charge, credited);
});
test('real native projectile step absorbs before the actor and ghost absorption spends no charge', async () => {
  const { f, make } = await setup();
  const { installKitDefense } = await import('../runtime/kit-defense.mjs'); installKitDefense(f);
  const vac = make(1, 'peer-A', false), shooter = make(2, 'peer-B', false, 1);
  vac.pos.set(0, 0, 0); vac.aimDir.set(0, 0, 1);
  vac.weapon = { ...vac.weapon, special: 'inkVac', specialCost: 190 }; vac.special = 190; vac._startSpecial();
  f.G.actors = [vac, shooter]; f.G.physics.segment = () => ({ hit: false });
  const system = f.G.projectiles; let hits = 0; system.applyHit = () => { hits++; };
  const round = ghost => {
    const p = system._new(); Object.assign(p, { owner: shooter, team: 1, type: 'shot', wid: 'shooter',
      damage: ghost ? 0 : 36, size: .15, radius: .3, age: 0, life: 1, straight: 1, grav: 0, drag: 0, trailEvery: 0, ghost });
    p.pos.set(0, 1, 20); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, -1200); return p;
  };
  const first = round(false); assert.equal(system._step(first, 1 / 60), true);
  assert.equal(first.damage, 0); assert.equal(hits, 0); assert.equal(first.age, 1 / 60);
  const state = f.inkVacState(vac), charge = state.charge; assert.ok(charge > 0);
  const ghost = round(true); assert.equal(system._step(ghost, 1 / 60), true);
  assert.equal(hits, 0); assert.equal(state.charge, charge);
});
test('actual native countershot packet restores charge-scaled blast and its ghost cannot paint or damage', async () => {
  const { f, sender, receiver, make } = await setup(), owner = make(1, 'peer-A', false), proxy = make(1, 'peer-A', true);
  sender.byNid.set(1, owner); f.G.netm = sender;
  const p = f.G.projectiles.fireInkVacExhale(owner, { charge: .8 });
  assert.equal(p.s3SpecialWeapon.burstRadius, 10);
  const packet = sender.out.find(e => e[1] === 'p'); assert.ok(packet);
  receiver.byNid.set(1, proxy); f.G.netm = receiver;
  receiver._play('peer-A', JSON.parse(JSON.stringify(packet)));
  const ghost = f.G.projectiles.list.at(-1); assert.ok(ghost.ghost);
  assert.equal(ghost.damage, 0); assert.equal(ghost.s3SpecialWeapon.burstRadius, 10);
  assert.equal(ghost.life, .833); assert.equal(ghost.grav, p.grav);
  let paint = 0, damage = 0, turf = 0;
  f.G.paint.splat = () => { paint++; return 1; };
  f.G.projectiles.applyHit = () => { damage++; }; proxy.addTurf = () => { turf++; };
  const victim = make(2, 'peer-B', false, 1); f.G.actors = [victim];
  f.G.netm = null; // ownership remains intrinsic even if transport was disposed
  f.G.projectiles._blastBurst(ghost, victim.pos, null);
  assert.deepEqual([paint, damage, turf], [0, 0, 0]);
});
