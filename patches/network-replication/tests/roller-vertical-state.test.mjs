import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { fixture } from './roller-clothing-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
// Current open PR #758 uses bits 20–22 for replicated swim visibility.
const FLICK_VERTICAL = 1 << 24;
const FLICK = 1 << 16;
const clone = value => JSON.parse(JSON.stringify(value));

function actor(f, { nid = 7, owner = 'owner', isLocal = false } = {}) {
  const a = f.Character
    ? new f.Actor({ team: 0, name: `network roller ${nid}`, weapon: 'roller', isLocal, CharacterClass: f.Character })
    : f.makeActor({ nid, owner, remote: !isLocal });
  a.nid = nid; a.owner = owner; a.ink = 100; a.grounded = false;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0);
  if (!f.Character) {
    a.isLocal = isLocal;
    a.weaponRunner = new f.WeaponRunner(a);
  }
  return a;
}

function snapshot(sender) {
  let wire;
  sender.s.tr.broadcast = message => { wire = clone(message); };
  sender._sendTick();
  assert.ok(wire, 'NetMatch sent an owner snapshot');
  return wire;
}

function ownerStep(pair, dt, input) {
  pair.owner.clock.advance(dt);
  pair.owner.G.time += dt;
  pair.local.weaponRunner.update(dt, input);
}

function receive(pair, message, dt = 1 / 60) {
  const wire = clone(message);
  pair.receiver.onMessage('owner', wire);
  const peer = pair.receiver.peers.get('owner');
  peer.tr = wire.ts;
  pair.receiver._playEvents();
  pair.receiver._sample(pair.remote, wire.ts, 0);
  pair.receiver.applyRemote(pair.remote, dt);
}

function pose(character) {
  const channels = character.P.slice();
  character._poseFlick(channels, 0.1);
  return channels;
}

test('NetMatch build adaptation keeps reserved remote lifecycle fixes and a collision-free vertical flag', () => {
  const source = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/net/netmatch.js'), 'utf8');
  const installed = adaptSource('src/net/netmatch.js', source);
  assert.ok(installed.includes('flickVertical: 16777216'), 'the vertical flag avoids the open swim-visibility mask');
  assert.equal(FLICK_VERTICAL & ((1 << 20) | (1 << 21) | (1 << 22)), 0, 'the vertical flag does not alias flags used by open replication work');
  assert.ok(installed.includes('victim.alive = false; victim.hp = 0; victim.superJumpGround = null;'), 'remote death cleanup still composes');
  assert.ok(installed.includes('a.superJumpGround = null;\n    a.alive = true; a.hp = PLAYER.hp;'), 'remote respawn cleanup still composes');
});

test('installed NetMatch carries owner-selected vertical Roller state through landing and recovery', async () => {
  const owner = await fixture(), viewer = await fixture({ rollerMotion: true });
  const sender = owner.makeNetMatch(owner.makeSession('owner', 'owner'));
  const receiver = viewer.makeNetMatch(viewer.makeSession('viewer', 'viewer'));
  const local = actor(owner, { isLocal: true }), remote = actor(viewer);
  const remoteTriggers = [];
  const trigger = remote.character.trigger.bind(remote.character);
  remote.character.trigger = (...args) => { remoteTriggers.push(args[0]); return trigger(...args); };
  sender.bind({ actors: [local], state: 'playing', time: 180 });
  receiver.bind({ actors: [remote], state: 'playing', time: 180 });

  const dt = 1 / 60;
  // This transport probe starts from the native accepted-launch event. Natural
  // falls now intentionally select horizontal during the separate #479 grace.
  owner.emit('actor:jump', { actor: local });
  ownerStep({ owner, local }, dt, { fire: true, firePressed: true });
  const airborne = snapshot(sender);
  assert.equal(airborne.a[0].length, 24, 'the existing current actor row shape is unchanged');
  assert.ok(airborne.a[0][10] & FLICK, 'the existing flick bit is retained');
  assert.ok(airborne.a[0][10] & FLICK_VERTICAL, 'airborne owner selection reaches the packet flags');
  assert.equal(local.weaponRunner.s3RollerAttack?.vertical, true);
  assert.equal(local.character.s3RollerFlick?.vertical, true);
  receive({ receiver, remote }, airborne);
  assert.equal(remote.weaponRunner.s3FlickVertical, false,
    'remote vertical mode stays out of the simulated WeaponRunner');
  assert.equal(remote.weaponRunner.s3RollerAttack, null);
  assert.equal(remote.character.s3RollerFlick.vertical, true);
  assert.deepEqual(remoteTriggers.filter(name => name === 'flick'), ['flick']);

  const verticalPose = pose(remote.character);
  const selected = remote.character.s3RollerFlick;
  remote.character.s3RollerFlick = { ...selected, vertical: false };
  const horizontalPose = pose(remote.character);
  remote.character.s3RollerFlick = selected;
  assert.notDeepEqual(verticalPose, horizontalPose, 'the received type selects the installed vertical character pose');

  // Replaying the same snapshot/event must not trigger the remote flick twice.
  receiver.onMessage('owner', clone(airborne));
  receiver.peers.get('owner').tr = airborne.ts;
  receiver._playEvents();
  receiver._sample(remote, airborne.ts, 0);
  receiver.applyRemote(remote, dt);
  assert.deepEqual(remoteTriggers.filter(name => name === 'flick'), ['flick']);

  // #1056: an air-started vertical flick deliberately converts to horizontal
  // when the owner touches down within the first five fixed frames. Advance the
  // accepted swing past that window so this asserts the post-window latch rather
  // than re-testing the documented early-landing conversion.
  for (let i = 0; i < 6; i++) ownerStep({ owner, local }, dt, { fire: true });
  local.grounded = true;
  ownerStep({ owner, local }, dt, { fire: true });
  const landed = snapshot(sender);
  assert.ok(landed.a[0][10] & FLICK_VERTICAL, 'landing does not replace the selected attack type');
  assert.ok(landed.a[0][10] & (1 << 4), 'the same row records the grounded state');
  receive({ receiver, remote }, landed);
  assert.equal(remote.character.s3RollerFlick.vertical, true);

  let frames = 0;
  while (local.weaponRunner.flick >= 0 && frames++ < 180) ownerStep({ owner, local }, dt, { fire: false });
  assert.equal(local.weaponRunner.flick, -1, 'the owner reaches release');
  assert.equal(local.weaponRunner.s3RollerAttack?.released, true, 'vertical mode remains owned through recovery');
  const recovery = snapshot(sender);
  assert.equal(recovery.a[0][10] & FLICK, 0, 'the windup bit ends at release');
  assert.ok(recovery.a[0][10] & FLICK_VERTICAL, 'the vertical selection remains through recovery');
  receive({ receiver, remote }, recovery);
  assert.equal(remote.weaponRunner.s3RollerAttack, null);
  assert.equal(remote.character.s3RollerFlick.vertical, true);
  assert.equal(remote.character.s3RollerFlick.released, true);

  const stale = clone(recovery);
  stale.ts -= 0.01;
  stale.a[0][10] &= ~FLICK_VERTICAL;
  const beforeStale = remote.net.buf.length;
  receiver.onMessage('owner', stale);
  assert.equal(remote.net.buf.length, beforeStale, 'an older opposite-mode snapshot cannot rewind the proxy');
  receiver.peers.get('owner').tr = recovery.ts;
  receiver._sample(remote, recovery.ts, 0);
  receiver.applyRemote(remote, dt);
  assert.equal(remote.weaponRunner.s3FlickVertical, false);
  assert.equal(remote.character.s3RollerFlick.vertical, true);

  // A new grounded flick uses the existing horizontal path and clears only the
  // network-owned vertical presentation state on the proxy.
  local.weaponRunner.reset();
  // #1056 owns landings in the first 5F; test the retained selection after that window.
  for(let i=0;i<6;i++) ownerStep({ owner, local }, dt, { fire: true });
  local.grounded = true;
  ownerStep({ owner, local }, dt, { fire: true, firePressed: true });
  const horizontal = snapshot(sender);
  assert.ok(horizontal.a[0][10] & FLICK);
  assert.equal(horizontal.a[0][10] & FLICK_VERTICAL, 0);
  receive({ receiver, remote }, horizontal);
  assert.equal(remote.weaponRunner.flick, 0);
  assert.equal(remote.weaponRunner.s3FlickVertical, false);
  assert.equal(remote.weaponRunner.s3RollerAttack, null);
  assert.equal(remote.character.s3RollerFlick?.vertical, false);

  local.weaponRunner.reset();
  assert.equal(local.weaponRunner.s3RollerAttack, null, 'owner reset drops its attack selection');
  assert.equal(local.character.s3RollerFlick, null, 'owner reset drops the matching pose state');

  local.grounded = false;
  owner.emit('actor:jump', { actor: local });
  ownerStep({ owner, local }, dt, { fire: true, firePressed: true });
  receive({ receiver, remote }, snapshot(sender));
  assert.equal(remote.character.s3RollerFlick?.vertical, true);
  receiver._remoteSplat(remote, null, 'weapon');
  assert.equal(remote.weaponRunner.s3RollerAttack, null);
  assert.equal(remote.weaponRunner.s3FlickVertical, false);
  assert.equal(remote.character.s3RollerFlick, null);
});
