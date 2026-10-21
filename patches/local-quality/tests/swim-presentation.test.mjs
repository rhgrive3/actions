import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

test('local/remote swim and wall bodies hide immediately for source and fallback; jumps and returns draw again', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4 });
  try {
    const a = await f.make(), c = a.character;
    for (const sourced of [true, false]) {
      c.sourceMotion.setEnabled(sourced);
      for (const hz of [30, 60, 120]) for (const lod of ['hero', 'game', 'far']) for (const local of [true, false]) {
        c.setLod(lod); c.isLocal = local;
        const step = (form, grounded) => {
          a.form = form === 'kid' ? 'kid' : 'squid';
          a.climbing = form === 'climb'; a.submerged = form === 'swim'; a.grounded = grounded;
          a.anim.wallNormal = new f.THREE.Vector3(0, 0, 1);
          f.G.time += 1 / hz; a._finishFrame(1 / hz);
        };
        for (let i = 0; i < hz; i++) step('squid', true);
        assert(c.squid.body.visible, 'dry squid drawn');
        for (const form of ['swim', 'climb']) {
          step(form, form === 'swim');
          assert.equal(c.squid.body.visible, false, 'hidden on first submerged tick: ' + form);
          assert.equal(c.squid.ghost.visible, false);
          for (let i = 0; i < hz / 4; i++) step(form, form === 'swim');
          assert.equal(c.squid.body.visible, false);
        }
        step('squid', false);
        assert(c.squid.body.visible, 'wall exit/airborne squid reappears immediately');
        step('swim', true); step('swim', false);
        assert(c.squid.body.visible, 'dolphin jump reappears');
        for (let i = 0; i < hz; i++) step('kid', true);
        assert(c.kid.visible, 'human return drawn');
      }
    }
  } finally { f.reset(); }
});

test('wake cadence retains elapsed time at 30/60/120 Hz and respects stealth, air and restart', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4 });
  try {
    const a = await f.make(); let count = 0;
    f.G.fx = { wake() { count++; } };
    a.form = 'squid'; a.submerged = true; a.grounded = true; a.vel.set(0, 0, 8);
    for (const hz of [30, 60, 120]) {
      count = 0; a._wakeT = 0;
      for (let i = 0; i < hz * 2; i++) { f.G.time += 1 / hz; a._finishFrame(1 / hz); }
      assert.equal(count, 40, '20 emissions/sec at ' + hz + ' Hz');
    }
    const quiet = () => { const n = count; a._finishFrame(.1); assert.equal(count, n); assert.equal(a._wakeT, 0); };
    a.vel.set(0, 0, 1); quiet(); // Slow swim.
    a.vel.set(0, 0, 8); a.s3.modifiers.ninjaSquid = true;
    a.s3.swimStealth.since = f.G.time - 2; quiet();
    a.s3.modifiers.ninjaSquid = false; a.grounded = false; quiet();
    a.grounded = true; const n = count; a._finishFrame(.025);
    assert.equal(count, n); a._finishFrame(.025); assert.equal(count, n + 1);
  } finally { f.reset(); }
});

test('real FX wake sprays larger moving droplets on both sides and scales with speed', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4, extraExports: "export { FX } from './src/fx/fx.js';" });
  const fx = new f.FX(f.G.scene, { quality: 'high' });
  try {
    const drops = []; fx._spawnDrop = (...args) => drops.push(args);
    const p = new f.THREE.Vector3(), dir = new f.THREE.Vector3(0, 0, 1), col = f.G.teamColors[0];
    fx.wake(p, dir, col, 11.8);
    assert(drops.length >= 7, 'continuous full-speed spray');
    assert(drops.some(d => d[0] < 0 && d[3] < -1));
    assert(drops.some(d => d[0] > 0 && d[3] > 1));
    assert(drops.every(d => d[4] > 3 && d[5] < 0 && d[7] > .05), 'raised, rearward, readable glossy drops');
    const full = drops.length; drops.length = 0; fx.wake(p, dir, col, 3);
    assert(drops.length < full, 'small input has less spray');
  } finally { fx.dispose(); f.reset(); }
});
