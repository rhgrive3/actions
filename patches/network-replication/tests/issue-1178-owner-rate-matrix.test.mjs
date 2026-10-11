// #1178 (normal path): ordinary 20 Hz owner snapshots must sample into a finite, continuous remote pose
// at 24/30/60/120/144 Hz through the real NetMatch receive path. Malformed-row rejection is covered by
// snapshot-guard.test.mjs; this file only pins the valid path so the guard cannot starve it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const VX = 2;          // owner moves along +x at 2 units/s (consistent velocity field)
const SNAP_DT = 0.05;  // 20 Hz owner snapshots
const LATENCY = 0.08;  // fixed one-way delay: no jitter, so the playback buffer settles
const WARM = 1.5;      // seconds before sampling (buffer fill)
const RUN = 4.0;       // receiver seconds simulated

for (const hz of [24, 30, 60, 120, 144]) {
  test(`#1178 normal 20Hz owner snapshots sample finitely and continuously at ${hz}Hz`, async () => {
    const f = await fixture();
    const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
    const a = f.makeActor({ nid: 7, owner: 'p2', remote: true });
    f.bind(nm, [a]);

    const base = f.clock.now();
    const dt = 1 / hz;
    const frames = Math.round(RUN * hz);
    const samples = [];
    let k = 0;
    for (let i = 0; i < frames; i++) {
      // deliver every owner snapshot whose arrival time (send + latency) has passed
      while (base + k * SNAP_DT + LATENCY <= f.clock.now() + 1e-9) {
        f.tick(nm, 'p2', base + k * SNAP_DT, { a: [f.packActor(a, { x: VX * k * SNAP_DT, vx: VX })] });
        k++;
      }
      f.clock.advance(dt);
      nm.update(dt);
      nm.applyRemote(a, dt);   // what Match.update does for each remote actor
      if (f.clock.now() - base >= WARM) samples.push({ t: f.clock.now(), x: a.pos.x, vx: a.vel.x });
    }

    assert.ok(samples.length > frames / 3, `too few sampled frames at ${hz}Hz: ${samples.length}`);
    for (const s of samples) {
      assert.ok(Number.isFinite(s.x), `remote x non-finite at ${s.t.toFixed(3)}s (${hz}Hz)`);
      assert.ok(Number.isFinite(s.vx), `remote vx non-finite at ${s.t.toFixed(3)}s (${hz}Hz)`);
    }
    // continuous: the pose never steps backwards and advances by about VX per playback second per frame
    const expectStep = VX * dt;
    for (let i = 1; i < samples.length; i++) {
      const step = samples[i].x - samples[i - 1].x;
      assert.ok(step >= -1e-9, `pose moved backwards at ${hz}Hz (step ${step})`);
      assert.ok(Math.abs(step - expectStep) <= expectStep * 0.1 + 1e-6, `step ${step.toFixed(5)} vs ${expectStep.toFixed(5)} at ${hz}Hz`);
    }
    // overall rate matches the owner's velocity
    const span = samples[samples.length - 1].t - samples[0].t;
    const slope = (samples[samples.length - 1].x - samples[0].x) / span;
    assert.ok(Math.abs(slope - VX) <= VX * 0.02, `slope ${slope.toFixed(4)} != ${VX} at ${hz}Hz`);
  });
}
