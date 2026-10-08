// #1153: a friendly deployed Big Bubbler is an independent Super Jump receiver.
//
// Runs the ACTUAL production composition + full runtime, deploys the dome
// through the real native special path, then reads the same HUD target list the
// map and diorama use. This is the composed-artifact proof, not a unit stub.
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({
  productionComposition: true, fullRuntime: true, realProjectiles: true,
  extraExports: "export { HUD } from './inkwave-public/src/ui/hud.js';\n"
    + "export { PlayerController } from './inkwave-public/src/game/player.js';\n"
    + "export { bigBubblerDomes, bigBubblerRemoteDomes, replayBigBubbler, resetBigBubblerReplay } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';\n"
    + "export { bubblerJumpTargets, bubblerTargetLive, bubblerTargetGround, bubblerTargetDescriptor } from './patches/splatoon3/runtime/bubbler-jump-target.mjs';\n",
});

const V = f.THREE.Vector3;
f.G.scene = new f.THREE.Scene();
f.G.projectiles = new f.Projectiles(f.G.scene);
const block = { id: 0, solid: true, center: new V(0, -0.5, 0), half: new V(400, 0.5, 400),
  axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)], faces: [-1, -1, 0, -1, -1, -1],
  aabbMin: new V(-400, -1, -400), aabbMax: new V(400, 0, 400) };
const level = {
  blocks: [block], faces: [{ origin: new V(-400, 0, -400), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
  hasRails: false, groundHeight: () => 0, pointInside: () => false,
  spawnPads: [new V(), new V(300, 0, 300)], spawnBarrier: 1,
  queryBlocks: (_x, _z, _a, _b, out) => { out.length = 0; out.push(0); return out; },
};
f.G.level = level;
f.G.physics = new f.Physics(level);

function deploy(team, x) {
  const owner = f.make('roller');
  owner.team = team;
  owner.pos.set(x, 0, 0);
  owner.weapon = { ...owner.weapon, special: 'bubbler', specialCost: 180 };
  owner.special = owner.specialCost();
  owner._startSpecial();
  for (let i = 0; i < 240; i++) f.G.projectiles.update(1 / 60);
  return owner;
}

const owner = deploy(0, 0);
const dome = f.bigBubblerDomes().find((d) => d.team === 0);
assert.ok(dome, 'the installed runtime deploys a friendly dome');
assert.equal(dome.dead, false);

const me = f.make('shooter');
me.team = 0;
me.pos.set(0, 0, -10);
owner.pos.set(20, 0, 0); // displace the owner far from the dome
f.G.match.local = me;
f.G.match.playing = () => true;
f.G.game = { minimap: { w: 100, h: 100, toCanvas: (x, z, out) => { out.x = x + 50; out.y = z + 50; return out; } } };

// ---- model: stable identity + live location, independent of the owner position
const model = f.bubblerJumpTargets(me);
assert.equal(model.length, 1, 'exactly one friendly live dome is a receiver');
assert.equal(model[0].domeId, dome.id);
assert.equal(model[0].serial, dome.serial);
assert.equal(model[0].team, 0);
assert.deepEqual([model[0].pos.x, model[0].pos.z], [dome.pos.x, dome.pos.z]);
assert.notDeepEqual([model[0].pos.x, model[0].pos.z], [owner.pos.x, owner.pos.z], 'never the displaced owner position');
assert.equal(f.bubblerTargetGround(model[0]), dome.pos, 'the legal ground target is the dome base');
assert.equal(f.bubblerTargetLive(model[0], me), true);

// ---- HUD: the composed _beaconTargets now carries the dome, after owner displacement
const targets = f.HUD.prototype._beaconTargets.call({ _local: () => me, lab: null });
const real = targets.filter(Boolean);
assert.ok(real.some((t) => t.domeId === dome.id || t.deployable?.id === dome.id),
  'the full composition exposes the live friendly deployed Bubbler as a target');
assert.equal(targets.length > 4, true, 'the receiver appends; the four fixed slots stay');
assert.ok(targets[3] && targets[3].home === true, 'the home position keeps slot 3');
const allySlot = targets[0];
assert.ok(allySlot === null || allySlot.home !== true, 'no ally slot was replaced by a dome');

// ---- enemy dome is never a receiver
const enemy = deploy(1, 0);
assert.equal(enemy.team, 1);
assert.equal(f.bubblerJumpTargets(me).length, 1, 'an enemy dome is not a friendly receiver');

// ---- two friendly domes are two independent receivers
const owner2 = deploy(0, 0);
const model2 = f.bubblerJumpTargets(me);
assert.equal(model2.length, 2, 'two friendly domes are two receivers');
assert.equal(new Set(model2.map((t) => t.domeId)).size, 2, 'each receiver has a distinct stable id');

// ---- actual full composed native Super Jump commits the dome base, not the owner
const jumper = f.make('shooter');
jumper.team = 0; jumper.pos.set(0, 0, -10); jumper.grounded = true; jumper.ground.hit = true;
f.G.match.local = jumper;
const recv = f.bubblerJumpTargets(jumper).find((t) => t.domeId === dome.id);
assert.ok(recv, 'a receiver is present before the jump');
assert.equal(jumper.canSuperJump(), true);
assert.equal(jumper.superJump(recv), true, 'the native Super Jump admits the deployed-Bubbler receiver');
assert.equal(jumper.superJumpState?.receiver?.domeId, dome.id, 'the receiver identity rides the native jump state');
const committed = jumper.superJumpState.to;
assert.ok(Math.abs(committed.x - dome.pos.x) < 1e-6 && Math.abs(committed.y - dome.pos.y) < 1e-6
  && Math.abs(committed.z - dome.pos.z) < 1e-6,
  'the committed destination is the dome base, never the displaced owner at x=20');
for (let i = 0; i < 60 * 4 && jumper.superJumpState; i++) { f.G.time += 1 / 60; jumper.update(1 / 60); }
assert.equal(jumper.superJumpState, null, 'the native Super Jump completes');
assert.ok(Math.hypot(jumper.pos.x - dome.pos.x, jumper.pos.z - dome.pos.z) < 8,
  'the jumper lands at the dome base');
assert.ok(Math.abs(jumper.pos.x - owner.pos.x) > 5, 'and definitively not at the displaced owner');

// ---- collapse mid-charge voids the jump (charge-frame re-verify)
const jumper2 = f.make('shooter');
jumper2.team = 0; jumper2.pos.set(0, 0, -10); jumper2.grounded = true; jumper2.ground.hit = true;
const recv2 = f.bubblerJumpTargets(jumper2)[0];
assert.equal(jumper2.superJump(recv2), true);
recv2.dome.dead = true; // collapse AFTER admission
for (let i = 0; i < 60 * 2 && jumper2.superJumpState; i++) { f.G.time += 1 / 60; jumper2.update(1 / 60); }
assert.equal(jumper2.superJumpState, null, 'a receiver collapsed after admission voids the jump');
assert.ok(Math.hypot(jumper2.pos.x, jumper2.pos.z + 10) < 1.5, 'the jumper never flew to a vanished structure');

// ---- repeated selection spends nothing
const hp0 = dome.hp, field0 = dome.fieldHp;
for (let i = 0; i < 3; i++) { const t = f.bubblerJumpTargets(me)[0]; assert.ok(t); f.bubblerTargetLive(t, me); f.bubblerTargetGround(t); }
assert.equal(dome.hp, hp0, 'repeated selection does not consume HP');
assert.equal(dome.fieldHp, field0, 'repeated selection does not consume the weak-point budget');

// ---- collapse invalidates the receiver
dome.dead = true;
assert.equal(f.bubblerTargetLive(model[0], me), false, 'a collapsed dome is no longer live');
const after = f.HUD.prototype._beaconTargets.call({ _local: () => me, lab: null }).filter(Boolean);
assert.equal(after.some((t) => t.domeId === dome.id), false, 'a collapsed dome leaves the HUD target list');

// ================= defect regressions (parent review) =================

// ---- Bug 1: a shrinking receiver list must HIDE the stale higher-index icons
const stubEl = () => ({ style: {}, classList: { _s: new Set(), remove(c) { this._s.delete(c); }, toggle(c, v) { if (v) this._s.add(c); else this._s.delete(c); } }, querySelector: () => ({ textContent: '' }) });
const hudStub = { _map: { hover: -1 }, _bcnExtra: [], _mkBubblerBeacon() { return stubEl(); } };
const twoRecv = [null, null, null, null, { x: 0.1, y: 0.1, ok: true, domeId: 'A' }, { x: 0.2, y: 0.2, ok: true, domeId: 'B' }];
f.HUD.prototype._updBubblerBeacons.call(hudStub, 100, 100, twoRecv, true);
assert.equal(hudStub._bcnExtra.length, 6, 'two receiver icons were built');
assert.notEqual(hudStub._bcnExtra[5].style.display, 'none', 'the second receiver icon is visible');
const oneRecv = [null, null, null, null, { x: 0.1, y: 0.1, ok: true, domeId: 'A' }];
f.HUD.prototype._updBubblerBeacons.call(hudStub, 100, 100, oneRecv, true);
assert.equal(hudStub._bcnExtra[5].style.display, 'none', 'a shrunk receiver list hides the stale higher-index icon');
assert.equal(hudStub._bcnExtra[4].style.display, '', 'the remaining receiver stays visible');

// ---- Bug 4: an ACTUAL replicated remote friendly dome is a receiver
const remoteDep = f.replayBigBubbler('deploy', null, { domeId: '0:n9:4', team: 0, pos: [30, 0, 0], t: 0, hp: 30720, fieldHp: 15360, serial: 4 });
assert.equal(remoteDep.ok, true, 'the real runtime ingests a replicated friendly dome');
assert.equal(f.bigBubblerRemoteDomes().length, 1);
const remoteTargets = f.bubblerJumpTargets(me);
const rt = remoteTargets.find((t) => t.domeId === '0:n9:4');
assert.ok(rt, 'the replicated friendly dome is a Super Jump receiver');
assert.equal(f.bubblerTargetLive(rt, me), true);
assert.ok(Math.abs(rt.pos.x - 30) < 1e-6, 'the receiver location is the replicated dome position');
assert.ok(f.HUD.prototype._beaconTargets.call({ _local: () => me, lab: null }).filter(Boolean).some((t) => t.domeId === '0:n9:4'),
  'the replicated receiver reaches the composed HUD target list');

// enemy replicated dome is never a receiver
f.replayBigBubbler('deploy', null, { domeId: '1:n9:5', team: 1, pos: [40, 0, 0], t: 0, hp: 30720, fieldHp: 15360, serial: 5 });
assert.equal(f.bubblerJumpTargets(me).some((t) => t.domeId === '1:n9:5'), false, 'an enemy replicated dome is not a receiver');

// exact activation identity + finite coords
assert.equal(f.bubblerTargetLive({ ...rt, domeId: '0:n9:999' }, me), false, 'a stale activation id is not live');
assert.equal(f.bubblerTargetLive({ ...rt, serial: 999 }, me), false, 'a stale serial is not live');
assert.equal(f.bubblerTargetLive({ ...rt, team: 1 }, me), false, 'a stale team is not live');
const savedX = rt.dome.pos.x;
rt.dome.pos.x = NaN;
assert.equal(f.bubblerTargetLive(rt, me), false, 'non-finite coordinates are not live');
rt.dome.pos.x = savedX;
assert.equal(f.bubblerTargetLive(rt, me), true, 'restoring the coordinates makes it live again');

// disposal clears the receiver
f.resetBigBubblerReplay('test-dispose');
assert.equal(f.bubblerTargetLive(rt, me), false, 'a disposed activation is no longer live');
assert.equal(f.bubblerJumpTargets(me).some((t) => t.domeId === '0:n9:4'), false, 'a disposed receiver leaves the target list');

// dedupe: the SAME activation in both pools is exactly one receiver, local wins
const synthDome = (id, serial, team) => ({ id, serial, team, dead: false, pos: { x: 0, y: 0, z: 0 }, owner: null });
const localDome = synthDome('0:x:1', 1, 0), replicateDome = synthDome('0:x:1', 1, 0);
const deduped = f.bubblerJumpTargets(me, { local: [localDome], remote: [replicateDome] });
assert.equal(deduped.length, 1, 'one activation is one receiver even when replicated into both pools');
assert.equal(deduped[0].dome, localDome, 'the authoritative local structure wins the dedupe');

// ---- Bug 3: admission rejects an enemy/invalid receiver immediately
const a3 = f.make('shooter'); a3.team = 0; a3.pos.set(0, 0, -10); a3.grounded = true; a3.ground.hit = true;
const enemyLocal = f.bigBubblerDomes().find((d) => d.team === 1 && !d.dead);
assert.ok(enemyLocal, 'the enemy dome is still deployed');
assert.equal(a3.superJump(f.bubblerTargetDescriptor(enemyLocal)), false, 'an enemy receiver is refused at direct admission');
assert.equal(a3.superJumpState, null, 'and no jump state is created');
assert.equal(f.bubblerTargetDescriptor(enemyLocal).pos.isVector3, true, 'the rejected descriptor carried a real Vector3 position');
// The actor must also be carried INTO superJumpTarget: with a non-Vector3 position the
// earlier guard is bypassed, so only the actor-aware liveness check can refuse it.
const enemyNoVec = { bubblerTarget: true, dome: enemyLocal, domeId: enemyLocal.id, serial: enemyLocal.serial, team: 1, home: false, name: 'x', pos: { x: 5, y: 0, z: 0 } };
assert.equal(a3.superJump(enemyNoVec), false, 'an enemy receiver is refused even when its position bypasses the Vector3 guard');
assert.equal(a3.superJumpState, null, 'and still no jump state is created');

// ---- Bug 2: the dead/respawn queue preserves the receiver identity
const deadA = f.make('shooter'); deadA.team = 0; deadA.pos.set(0, 0, -10); deadA.alive = false; deadA.grounded = false;
const ctrl = Object.assign(Object.create(f.PlayerController.prototype),
  { a: deadA, input: { navigationDevice: 'pad', lastDevice: 'pad' }, menuBlocked: false, navigationEnabled: true, mapHeld: true, pendingRespawnJump: null });
const recvQ = f.bubblerJumpTargets(me)[0];
assert.ok(recvQ, 'a live friendly receiver is available to queue');
assert.equal(ctrl.validMapJumpTarget(recvQ), true, 'the receiver is a valid queued target');
assert.equal(ctrl.requestMapJump(recvQ), true, 'the dead/respawn path accepts the receiver');
assert.equal(ctrl.pendingRespawnJump?.receiver, recvQ, 'the queued respawn keeps the receiver IDENTITY, not a stale ground vector');
recvQ.dome.dead = true;
assert.equal(ctrl.validMapJumpTarget(ctrl.pendingRespawnJump.receiver), false, 'a collapse during the wait invalidates the queued receiver');
recvQ.dome.dead = false;
assert.equal(ctrl.validMapJumpTarget(ctrl.pendingRespawnJump.receiver), true, 'and it is valid again once the structure lives');

console.log(JSON.stringify({ result: 'friendly live deployed Bubbler is an independent HUD/diorama Super Jump receiver; enemy/collapsed/stale/disposed excluded; stale icons hidden; respawn queue keeps identity; repeat selection spends nothing', domeId: dome.id }));
