import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// A deliberately low cosmetic socket reproduces the native rig failure.
// Check the real runner and delayed-birth owner, retaining the source launch
// speed/lift and obstruction guard. This is not a retail muzzle measurement.
for (const id of ['s3-slosher-double', 's3-slosher-double-01', 's3-slosher-double-02'])
  test(id + ' body-relative horizontal launch is independent of the low animated rim', async () => {
    const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, vmMathRandom: () => .5 });
    const { G, THREE } = f, a = f.make(id), p = G.projectiles;
    G.physics.segment = (_a, _b, hit) => { hit.hit = false; return hit; };
    a.pos.set(0, 10, 0); a.character.root.position.copy(a.pos);
    a.character.getMuzzle = out => out.copy(a.pos).add(new THREE.Vector3(0, .35, .6));
    a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 10.35, 60); a.vel.set(0, 0, 0);
    const births = [];
    G.netm = { recProj(round) { births.push({ position: round.start.toArray(), velocity: round.vel.toArray(), unit: round.catalog.descriptor.unit, index: round.catalog.index }); } };
    a.intent.fire = true;
    for (let i = 0; !p.list.length && i < 60; i++) f.tick(a);
    a.intent.fire = false;
    assert.equal(p.list.length, 16, 'source two streams retain all eight fragments');
    for (let i = 0; i < 30; i++) { G.time += 1 / 60; p.update(1 / 60); }
    assert.equal(births.length, 16, 'every delayed fragment reaches its real birth');
    for (const b of births) {
      assert.ok(Math.abs(b.position[1] - 11.05) < 1e-8, 'birth stays on body-level aim instead of cosmetic .35 rim');
      assert.ok(Math.abs(b.position[2] - .3) < 1e-8);
      const unit = a.weapon.catalogRecord.parameters.UnitGroupParam.Unit[b.unit];
      const speed = (unit.SpawnSpeedGround + b.index * (unit.AfterOffsetSpawnSpeed || 0)) * 60;
      assert.ok(Math.abs(Math.hypot(b.velocity[0], b.velocity[2]) - speed) < 1e-8);
      assert.ok(Math.abs(b.velocity[1] - speed * unit.AddSpawnSpeedYRateByXZ) < 1e-8, 'source lift retained');
    }
  });

test('posed native Dread Wringer keeps both streams on body-level launch at 30/60/120 Hz', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    includeCharacter: true, vmMathRandom: () => .5 });
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
  G.physics.segment = (_a, _b, hit) => { hit.hit = false; return hit; };
  let oracle;
  for (const hz of [30, 60, 120]) {
    G.projectiles.clear(); G.time = 0;
    const a = new f.Actor({ team: 0, name: 'Dread origin', weapon: 's3-slosher-double', isLocal: true, CharacterClass: f.Character });
    a.character.actor = a; a.character.onEvent = null; a._integrate = () => {}; a._spawnBarrier = () => {};
    a.pos.set(0, 10, 0); a.grounded = a.ground.hit = true; a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 11.05, 60);
    a.intent.fire = true; G.actors = [a];
    const births = [], clock = new f.FixedClock();
    G.netm = { recProj(p) { births.push([p.catalog.descriptor.unit, p.catalog.index, ...p.start.toArray(), ...p.vel.toArray()]); } };
    for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
      G.time += dt; a.update(dt);
      if (G.projectiles.list.length) a.intent.fire = false;
      G.projectiles.update(dt);
    });
    assert.equal(births.length, 16);
    assert.ok(births.every(b => Math.abs(b[3] - 11.05) < 1e-8));
    const signature = JSON.parse(JSON.stringify(births));
    if (oracle) assert.deepEqual(signature, oracle, hz + ' Hz fixed-clock birth equivalence'); else oracle = signature;
    a.character.dispose();
  }
});
