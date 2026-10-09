import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #906: S3 does not play the ground-entry ink spray when the swim-form transform happens in mid-air.
// The transform decision runs before _surface(), so a groundTeam cached before takeoff must not gate the burst.
async function setup(sample = () => 1) {
  const f = await fixture(), a = f.make('shooter'), bursts = [], sounds = [];
  f.G.fx = { burst: (...args) => bursts.push(args) }; f.G.audio = { play: name => sounds.push(name) };
  f.G.paint.sample = sample; a.isLocal = true;
  return { ...f, a, bursts, sounds };
}
test('#906 grounded own-ink transform still emits the entry burst once', async () => {
  const f = await setup(); f.a.groundTeam = 1; f.a.intent.squid = true; f.tick(f.a);
  assert.equal(f.a.form, 'squid'); assert.equal(f.bursts.length, 1); assert.equal(f.bursts[0][3].count, 8);
});
test('#906 first airborne tick after leaving own ink transforms without a ground burst (stale groundTeam)', async () => {
  const f = await setup(); f.a.grounded = false; f.a.groundTeam = 1; // cached from the pre-jump grounded sample
  f.a.intent.squid = true; f.tick(f.a);
  assert.equal(f.a.form, 'squid'); assert.equal(f.bursts.length, 0); assert.ok(f.sounds.includes('squid_in'), 'transform sound is kept');
  assert.equal(f.a.groundTeam, 0);
});
test('#906 later airborne ticks and dry/enemy surfaces below never emit the own-ink burst', async () => {
  for (const sample of [() => 1, () => 0, () => 2]) {
    const f = await setup(sample); f.a.grounded = false; f.a.groundTeam = 1;
    f.tick(f.a, 3); f.a.intent.squid = true; f.tick(f.a); assert.equal(f.a.form, 'squid'); assert.equal(f.bursts.length, 0);
  }
});
test('#906 the airborne FX event sequence is identical at 30/60/120 render rates', async () => {
  const runs = [];
  for (const hz of [30, 60, 120]) {
    const f = await setup(), clock = new FixedClock(); f.a.grounded = false; f.a.groundTeam = 1; f.a.intent.squid = true;
    for (let i = 0; i < hz / 6; i++) clock.advance(1 / hz, delta => { f.G.time += delta; f.a.update(delta); });
    runs.push([f.bursts.length, f.sounds.join()]);
  }
  assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[2], runs[1]); assert.equal(runs[1][0], 0);
});
