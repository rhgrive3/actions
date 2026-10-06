// #893 focused regression: the Flow overflow feet-ink must be gated on the
// qualifying activation/extension EVENT, not on the clamped timer growing.
// Drives the real installed Flow runtime through the real event path.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { createFlow } from '../runtime/flow.mjs';

const cfg = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url))).flow;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const cap = () => ({ ...createFlow(), active: true, remaining: cfg.maxDuration });
// Field-by-field: the paint call is built inside the vm context, so its object
// prototypes differ from host literals and cannot be deep-strict compared.
function assertBurst(call, a) {
  assert.equal(call[1], cfg.paintRadius);
  assert.equal(call[2], a.team);
  assert.equal(call[3].kind, 'trail');
  assert.equal(call[3].seed, 0.5);
}

async function world(mode) {
  const f = await fixture();
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3(0, 0, 20)];
  f.G.physics.groundProbe = (_x, _y, _z, _r, _d, _foot, h) => { h.hit = false; return h; };
  f.G.match.canRespawn = () => false;
  if (mode) f.G.match.mode = mode;
  const a = f.make(), enemy = f.make(), other = f.make();
  enemy.team = 1; other.team = 1;
  const paints = [];
  f.G.paint.splat = (...args) => { paints.push(args); return 0; };
  return { ...f, a, enemy, other, paints };
}

test('#893 active Flow at the 30s cap still emits one overflow burst on a qualifying splat', async () => {
  const f = await world(), a = f.a;
  a.s3.flow = cap();
  f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
  near(a.s3.flow.remaining, cfg.maxDuration, 'the duration cap is preserved');
  assert.equal(a.s3.flow.active, true);
  assert.equal(f.paints.length, 1, 'the capped extension still paints exactly once');
  assertBurst(f.paints[0], a);
  near(f.paints[0][0].y, a.pos.y + 0.15);
});

test('#893 a qualifying assist extension at the cap also emits its own burst', async () => {
  const f = await world(), a = f.a;
  a.s3.flow = cap();
  f.emit('damage', { victim: f.enemy, attacker: a, amount: 30 });
  assert.equal(f.paints.length, 0, 'a damage award is not a qualifying extension event');
  f.emit('splatted', { attacker: f.other, victim: f.enemy, cause: 'weapon' });
  assert.equal(f.paints.length, 1, 'the credited assist still paints at the cap');
  near(a.s3.flow.remaining, cfg.maxDuration);
});

test('#893 successive qualifying splats before a timer decrement each keep their burst', async () => {
  const f = await world(), a = f.a;
  a.s3.flow = cap();
  f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
  f.emit('splatted', { attacker: a, victim: f.other, cause: 'weapon' });
  assert.equal(f.paints.length, 2, 'later same-step events are not lost to the cap');
  near(a.s3.flow.remaining, cfg.maxDuration);
});

test('#893 non-qualifying awards and idle frames never paint while Flow is active', async () => {
  const f = await world(), a = f.a;
  a.s3.flow = cap();
  f.emit('turf', { actor: a, area: 100 });
  f.emit('damage', { victim: f.enemy, attacker: a, amount: 25 });
  f.tick(a, 30);
  assert.equal(f.paints.length, 0, 'no passive per-frame painting is introduced');
  assert.ok(a.s3.flow.active);
  near(a.s3.flow.remaining, cfg.maxDuration - 0.5);
});

test('#893 an extension below the cap still grows the timer and paints once', async () => {
  const f = await world(), a = f.a;
  a.s3.flow = { ...createFlow(), active: true, remaining: cfg.maxDuration - 0.5 };
  f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
  near(a.s3.flow.remaining, cfg.maxDuration);
  assert.equal(f.paints.length, 1);
});

test('#893 pure activation keeps exactly one burst and the inactive path is unchanged', async () => {
  const f = await world(), a = f.a;
  a.s3.flow = { ...createFlow(), score: cfg.threshold };
  f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
  assert.equal(a.s3.flow.active, true);
  near(a.s3.flow.remaining, cfg.duration);
  assert.equal(f.paints.length, 1);
});

test('#893 the burst stays on the existing single paint path and leaves Range state alone', async () => {
  const f = await world('range'), a = f.a, touched = [];
  f.G.match.range = { onDamage: () => touched.push('onDamage'), onSplatted: () => touched.push('onSplatted') };
  a.s3.flow = cap();
  f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
  assert.equal(f.paints.length, 1);
  assertBurst(f.paints[0], a); // same single call shape as the activation burst
  assert.deepEqual(touched, [], 'Flow paint does not reach into the Range session');
});

test('#893 a remote Flow actor keeps exactly one burst per qualifying event', async () => {
  const f = await world(), a = f.a;
  a.remote = true;
  a.s3.flow = cap();
  f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
  assert.equal(f.paints.length, 1, 'no duplicated owner/remote credit');
  assert.equal(a.s3.flow.active, true);
  near(a.s3.flow.remaining, cfg.maxDuration);
  f.emit('splatted', { attacker: a, victim: f.other, cause: 'weapon' });
  assert.equal(f.paints.length, 2);
});

test('#893 the capped burst is event-driven and identical at 30/60/120 Hz', async () => {
  const counts = [];
  for (const hz of [30, 60, 120]) {
    const f = await world(), a = f.a;
    a.s3.flow = cap();
    for (let i = 0; i < hz; i++) {
      f.G.time += 1 / hz; a.update(1 / hz);
      if (i === hz - 1) f.emit('splatted', { attacker: a, victim: f.enemy, cause: 'weapon' });
    }
    counts.push(f.paints.length);
  }
  assert.deepEqual(counts, [1, 1, 1]);
});
