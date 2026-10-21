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
      assert.equal(count, 120, '60 fine emissions/sec at ' + hz + ' Hz');
    }
    const quiet = () => { const n = count; a._finishFrame(.1); assert.equal(count, n); assert.equal(a._wakeT, 0); };
    a.vel.set(0, 0, 1); quiet(); // Slow swim.
    a.vel.set(0, 0, 8); a.s3.modifiers.ninjaSquid = true;
    a.s3.swimStealth.since = f.G.time - 2; quiet();
    a.s3.modifiers.ninjaSquid = false; a.grounded = false; quiet();
    a.grounded = true; const n = count; a._finishFrame(1 / 120);
    assert.equal(count, n); a._finishFrame(1 / 120); assert.equal(count, n + 1);
  } finally { f.reset(); }
});

test('real FX wake sheds fine, low, short-lived ink on both sides without bubble glows', async () => {
  const f = await sourceLoadedActorFixture({ random: () => .4, extraExports: "export { FX } from './src/fx/fx.js';" });
  const fx = new f.FX(f.G.scene, { quality: 'high' });
  try {
    const drops = []; fx._spawnDrop = (...args) => drops.push(args);
    const p = new f.THREE.Vector3(), dir = new f.THREE.Vector3(0, 0, 1), col = f.G.teamColors[0];
    fx.wake(p, dir, col, 11.8);
    assert(drops.length >= 2 && drops.length <= 3, 'fine full-speed spray per 60Hz tick');
    assert(drops.some(d => d[0] < 0 && d[3] < -.5));
    assert(drops.some(d => d[0] > 0 && d[3] > .5));
    assert(drops.every(d => d[4] > 0 && d[4] < 1.4 && d[5] > 0 && d[7] < .022 && d[8] < .25), 'small drops carried forward, not large airborne beads');
    assert(drops.every(d => d[1] + d[4] ** 2 / (2 * fx.gravity) < .1), 'crest remains within 10cm of the ink');
    assert.equal(fx.glows.n, 0, 'no additive floating bubbles');
    assert(drops.every(d => (d[11] & 8) && (d[11] & 32)), 'quiet landing and swim-only shading');
    const full = drops.length;
    delete fx._spawnDrop;
    fx.clear();fx.wake(p, dir, col, 11.8);
    fx._spawnDrop(0, 1, 0, 0, 0, 0, col, .02, 1, 1, 1, 0);
    fx._updateDrops(1 / 60);
    const gloss = fx.dGeo.attributes.aColA.array;
    assert.equal(gloss[3], .5, 'wake uses softer ink-coloured shading');
    assert.equal(gloss[(fx.dN - 1) * 4 + 3], 1, 'ordinary attack droplets keep their native shading');
    fx._spawnDrop = (...args) => drops.push(args);
    drops.length = 0; fx.wake(p, dir, col, 3);
    assert(drops.length < full, 'small input has less spray');
    fx.q = .35;drops.length = 0;
    for (let frame = 0; frame < 60; frame++) fx.wake(p, dir, col, 11.8);
    assert(drops.some(d => d[0] < 0) && drops.some(d => d[0] > 0), 'low quality keeps both shoulders');
    drops.length = 0;fx.swimCarve(p, dir, new f.THREE.Vector3(1, 0, 0), col, 1);
    assert(drops.length > 0);
    assert(drops.every(d => d[4] < 1.3 && d[7] < .026 && d[8] <= .28 && (d[11] & 32)), 'turns use the same fine low spray');
  } finally { fx.dispose(); f.reset(); }
});
