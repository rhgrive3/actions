import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeRealm, rangeWorld } from './harness.mjs';

test('#305 low-ink Roller volley hits a real Practice Range target with depleted collision radii', async () => {
  const R = await rangeRealm();
  const { G, Actor, Character, THREE, Projectiles, RangeSession } = R;
  rangeWorld(R);
  G.projectiles = new Projectiles(G.scene);
  const local = new Actor({ team: 0, name: 'depleted Roller', weapon: 'roller', isLocal: true,
    CharacterClass: Character, style: { hair: 0, skin: 0, outfit: 0, eyes: 0 } });
  local.character.actor = local;
  const match = { actors: [local], local, state: 'playing', paused: false,
    canRespawn: () => true, playing: () => true, opts: { range: true } };
  G.actors = match.actors; G.match = match; G.local = local;
  const session = new RangeSession(match, { headless: true }); match.range = session;
  const observed = [];
  const off = R.on('damage', (event) => { observed.push({ type: 'damage', name: event.victim?.name, damage: event.damage }); G.match?.range?.onDamage(event); });
  const offImpact = R.on('weapon:impact', (event) => observed.push({ type: 'impact', kind: event.kind, pos: event.pos?.toArray(), victim: event.victim?.name }));
  try {
    const target = session.targets.find((actor) => actor.rangeTarget.zone === 'gallery' && actor.rangeTarget.z === 5);
    assert.ok(target, 'the normal gallery target is present');
    local.spawnAt(new THREE.Vector3(target.pos.x, 0.05, target.pos.z - 3.5), 0);
    for (let i = 0; i < 20; i++) {
      G.time += 1 / 60; local.update(1 / 60); G.projectiles.update(1 / 60); session.update(1 / 60);
    }
    local.aimYaw = 0;
    local.aimPitch = Math.atan2(target.pos.y + 0.7 - 1.35, target.pos.z - local.pos.z);
    local.aimPoint.set(target.pos.x, target.pos.y + 1, target.pos.z);
    local.ink = 4; local.lastFire = 0;

    const releases = [], fire = G.projectiles.fireFlick;
    G.projectiles.fireFlick = function (...args) {
      const before = this.list.length;
      const result = fire.apply(this, args);
      releases.push(this.list.slice(before));
      return result;
    };
    for (let i = 0; i < 70 && !target.rangeTarget.combo?.total; i++) {
      G.time += 1 / 60; local.intent.fire = true;
      for (const actor of match.actors) actor.update(1 / 60);
      G.projectiles.update(1 / 60); session.update(1 / 60);
    }
    assert.equal(releases.length, 1, 'the admitted low-ink press releases one attack');
    assert.equal(releases[0].length, 4, 'the three reduced main drops and nearest glob use the production emitter');
    for (const projectile of releases[0]) {
      const source = projectile.fidelityRollerUnit.UnitParam.CollisionParam;
      assert.equal(projectile.s3DepletionRound, true);
      assert.equal(projectile.fidelityPlayerCollision.initRadius, source.InitRadiusForPlayer * source.DepletionRate);
      assert.equal(projectile.fidelityFieldCollision.initRadius, source.InitRadiusForField * source.DepletionRate);
    }
    assert.ok(target.rangeTarget.combo?.total > 0, 'the standard Range target receives actual projectile damage: ' + JSON.stringify({
      target: [target.pos.x, target.pos.y, target.pos.z], owner: [local.pos.x, local.pos.y, local.pos.z],
      aim: [local.yaw, local.aimYaw, local.aimPitch], observed,
      globs: releases[0].map((p) => ({ unit: p.fidelityRollerUnitIndex, age: p.age, pos: p.pos?.toArray(), vel: p.vel?.toArray(), dead: p._qualityDead })),
    }));
    assert.equal(session.last.target, target, 'Range records the target hit by the depleted volley');
  } finally { off(); offImpact(); }
});
