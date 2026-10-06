import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeRealm, rangeWorld } from './harness.mjs';

test('Practice Range uses the shared swim HP-recovery category for wall climbing', async () => {
  const R = await rangeRealm();
  const { Actor, Character, G, THREE } = R;
  rangeWorld(R);
  R.profile.resources.regenDelay = 0;
  const actor = new Actor({ team: 0, name: 'tester', weapon: 'shooter', isLocal: true,
    CharacterClass: Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  actor.character.actor = actor;
  const match = { actors: [actor], local: actor, state: 'playing', paused: false,
    canRespawn: () => true, opts: { range: true }, playing: () => true };
  G.actors = match.actors; G.match = match; G.local = actor;
  actor.spawnAt(new THREE.Vector3(...R.ZONES.SPAWN), 0);
  actor.form = 'squid'; actor.intent.squid = true; actor.climbing = true; actor.grounded = false;
  actor._updateClimb = () => {}; actor._surface = () => { actor.submerged = false; actor.onEnemy = false; };
  actor._integrate = () => {}; actor._finishFrame = () => {}; actor._spawnBarrier = () => {};
  actor.hp = 50; actor.lastDamage = 99; G.paint.sample = () => 1;
  G.time += 1 / 60; actor.update(1 / 60);
  assert.equal(actor.submerged, false);
  assert.ok(Math.abs(actor.hp - (50 + R.profile.resources.regenRateSwim / 60)) < 1e-8);
});
