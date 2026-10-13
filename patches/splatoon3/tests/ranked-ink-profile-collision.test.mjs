import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

async function rig({ wallOffset = null, ghost = false, remote = false, decayed = false } = {}) {
  const f = await fixture({ fullRuntime: true, adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource,
    extraExports: `
      export { installRankedCombat } from './patches/splatoon3/runtime/ranked/combat.mjs';
      export { damageAt } from './inkwave-public/src/game/inkFlight.js';
    ` });
  f.installRankedCombat({ ...f.installedRuntime, G: f.G });
  const owner = f.make('shooter');
  Object.assign(owner, { nid: 'owner', slot: 0, remote });
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = system;
  const match = f.G.match = { mode: 'rainmaker', state: 'playing', rankedBarrierHits: [],
    playing: () => true, actors: [owner], ranked: { rule: { state: { pos: [0, 0, 0], carrier: null,
      barrier: { active: true, balance: 0, max: 1000 } } } } };
  // Exercise the production-composed head integrator. Only the geometric
  // boundary is an analytic vertical plane; no damage/candidate hook is stubbed.
  f.G.physics.segment = (from, to, hit) => {
    hit.hit = false;
    if (wallOffset === null) return hit;
    const plane = startZ + wallOffset;
    if (from.z <= plane && to.z >= plane) {
      hit.hit = true;
      const t = (plane - from.z) / (to.z - from.z);
      hit.point.copy(from).lerp(to, t);
      hit.dist = from.distanceTo(hit.point);
      hit.normal.set(0, 0, -1);
      hit.face = 0; hit.block = 0;
    }
    return hit;
  };
  const p = system._new();
  Object.assign(p, { owner, team: owner.team, type: 'round', wid: 'shooter', s3Weapon: owner.weapon, ghost });
  p.pos.set(0, 1, -2); p.prev.copy(p.pos); p.start.copy(p.pos); p.vel.set(0, 0, 30);
  assert.equal(system.inkFlight.configure(p, 'shooter', 0, 0.125), true);
  const startZ = -(1.5 + p.size) - 0.2;
  p.pos.z = startZ; p.prev.copy(p.pos); p.start.copy(p.pos);
  if (decayed) {
    p.inkFrame = p.inkProfile.damage.startFrame + 4;
    p.age = p.inkFrame / 60;
    p.inkPhase = 2;
  }
  return { f, system, match, p, owner };
}

test('profile-guided shooter head damages the shield with its native decayed damage', async () => {
  const { f, system, match, p } = await rig({ decayed: true });
  assert.equal(system._step(p, 1 / 60), true);
  assert.equal(match.rankedBarrierHits.length, 1);
  const amount = match.rankedBarrierHits[0].damage;
  assert.equal(amount, f.damageAt(p.inkProfile, p.age));
  assert.ok(amount > 0 && amount < p.inkProfile.damage.max);
});

test('nearer shield retires the real head before a later wall can start wall-drop', async () => {
  const { system, match, p } = await rig({ wallOffset: 0.38 });
  assert.equal(system._step(p, 1 / 60), true);
  assert.equal(match.rankedBarrierHits.length, 1);
  assert.ok(!p.fidelityWallDrop, 'the farther wall cannot steal the first shield contact');
});

test('nearer solid wall blocks shield damage and retains its native wall-drop', async () => {
  const { system, match, p } = await rig({ wallOffset: 0.08 });
  assert.equal(system._step(p, 1 / 60), false);
  assert.equal(match.rankedBarrierHits.length, 0);
  assert.ok(p.fidelityWallDrop, 'the real shooter wall-drop remains active');
});

test('ghost and remote-owned profile heads cannot queue authoritative shield damage', async () => {
  for (const options of [{ ghost: true }, { remote: true }]) {
    const { system, match, p } = await rig(options);
    assert.equal(system._step(p, 1 / 60), true, 'visual head stops at the shield');
    assert.equal(match.rankedBarrierHits.length, 0);
  }
});

test('an enemy capsule before the shield receives the native head damage first', async () => {
  const { f, system, match, p } = await rig();
  const victim = f.make('shooter');
  victim.team = 1;
  victim.pos.set(0, 0, p.pos.z + 0.1);
  match.actors.push(victim);
  const hp = victim.hp;
  assert.equal(system._step(p, 1 / 60), true);
  assert.ok(victim.hp < hp);
  assert.equal(match.rankedBarrierHits.length, 0);
});

test('a local guest profile hit sends one shield event to the current host', async () => {
  const { f, system, match, p } = await rig();
  const sent = [];
  f.G.netm = { isHost: false, cfg: { id: 'current-match' },
    s: { hostId: 'current-host', tr: { sendTo: (id, hit) => sent.push({ id, hit }) } } };
  assert.equal(system._step(p, 1 / 60), true);
  assert.equal(match.rankedBarrierHits.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, 'current-host');
  assert.equal(sent[0].hit.match, 'current-match');
  assert.equal(sent[0].hit.id, 'owner');
  assert.equal(sent[0].hit.seq, 1);
});
