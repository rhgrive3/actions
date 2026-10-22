import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

for (const hz of [30, 60, 120]) {
  test(`${hz} Hz: both teams wait through the intro and share the local opening launch clock`, async () => {
    const f = await fixture({ fullRuntime: true, productionComposition: true,
      extraExports: "export { Match } from './inkwave-public/src/game/match.js';" });
    const level = new f.Level({ bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 40 },
      spawnPads: [[0, 2.2, 0], [0, 2.2, 18]], spawnBarrier: 4.2,
      single: [{ kind: 'box', min: [-20, -1, -20], max: [20, 0, 40] }], half: [] });
    f.G.level = level; f.G.physics = new f.Physics(level);
    f.G.scene = { add() {}, remove() {} };
    const CharacterClass = f.make().character.constructor;
    const match = new f.Match({ CharacterClass, weapon: 'shooter', difficulty: 'normal', input: {}, rig: {} });
    f.G.match = match;
    match.setup();
    assert.equal(match.actors.length, 8);
    assert.equal(match.actors.filter(a => a.isBot).length, 7);
    const starts = match.actors.map(a => a.pos.clone());
    const targets = match.actors.map(a => ({ ...a.s3.squidSpawn.target }));
    const launches = [];
    let ticks = 0;
    f.on('squidspawn:launch', ({ actor }) => launches.push({ actor, ticks }));
    for (const a of match.actors) {
      // Keep native spawning/collision. This test controls intent and omits rig rendering.
      a._finishFrame = () => {};
      a._spawnBarrier = () => {};
      a.intent.fire = true; // no early launch, including bots deciding to shoot
      if (a.bot) a.bot.update = () => { a.intent.fire = true; a.aimPoint.set(0, 0, 0); };
    }
    const clock = new FixedClock();
    const frame = () => clock.advance(1 / hz, dt => {
      ticks++; f.G.time += dt; match.update(dt);
    });
    match.start();
    for (let i = 0; i < hz * 4; i++) frame();
    for (const [i, a] of match.actors.entries()) {
      assert.equal(a.s3.squidSpawn?.phase, 'aim', `team ${a.team} slot ${a.slot} waits`);
      assert.ok(a.pos.distanceTo(starts[i]) < 1e-9);
      assert.equal(a.s3.spawnArmor, null);
    }
    assert.equal(launches.length, 0, 'no actor launches during the introduction');
    match.setState('playing');
    match.local.intent.fire = false;
    for (let i = 0; i < hz / 2; i++) frame();
    assert.equal(launches.length, 0, 'bots cannot skip the shared opening delay via FIRE');
    for (let i = 0; i < hz / 2; i++) frame();
    assert.equal(launches.length, 8);
    assert.equal(new Set(launches.map(v => v.ticks)).size, 1, 'all eight launch on the same fixed tick');
    for (const [i, a] of match.actors.entries()) {
      assert.equal(a.s3.squidSpawn.phase, 'flight');
      if (a.isBot) for (const k of ['x', 'y', 'z']) assert.equal(a.s3.squidSpawn.to[k], targets[i][k]);
    }
    for (let i = 0; i < hz; i++) frame();
    for (const a of match.actors) {
      assert.equal(a.s3.squidSpawn, undefined);
      assert.equal(a.grounded, true);
      assert.equal(a.ground.hit, true);
      assert.ok(Math.abs(a.pos.y) < 1e-9);
    }
    match.dispose();
  });
}
