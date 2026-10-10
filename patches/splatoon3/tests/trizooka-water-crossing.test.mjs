import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const DT = 1 / 60;

// #1164 residual: a live Trizooka owner that crosses the lethal unsupported-water
// boundary during movement must die on that fixed tick, exactly once, with no
// volley after the death tick, for every fire state and every render rate.
async function setup() {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const a = f.make('shooter'); a.invuln = 0; a.hp = 100; a.ink = 80;
  a.special = a.specialCost();
  f.G.physics.collideBody = () => false;
  f.G.physics.groundProbe = (_x, _y, _z, _up, _down, _r, h) => { h.hit = true; h.y = 0; h.face = 0; h.normal.set(0, 1, 0); return h; };
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  f.G.paint.sample = () => 2;
  a.intent.special = true; a._resolve = () => {};
  return { ...f, a, step() { f.tick(a); a.intent.special = false; } };
}

// Activates on supported ground, then places the owner just above the lethal
// line with a downward velocity over unsupported water.
async function crossing(scenario, hz, hitch = false) {
  const h = await setup(); h.step();
  const a = h.a;
  assert.equal(a.specialActive?.id, 'trizooka', 'Trizooka must be active before the crossing');
  a.pos.set(0, h.PLAYER.fallDeathY + 0.02, 0); a.vel.set(0, -2, 0); a.grounded = false;
  h.G.level.groundHeight = () => -Infinity;
  const s = a.s3Trizooka;
  if (scenario === 'armed-buffered') { s.t = 10; s.armed = true; s.gateAt = 0; s.bufferedShot = true; }
  if (scenario === 'active-held') { s.t = 10; s.armed = true; s.gateAt = 0; s.shots = 1; s.repeatAt = 0; s.fireHeld = true; }
  const clock = new FixedClock(), frames = hitch ? [0.05, 1 / hz, 1 / hz, 0.2, 1 / hz] : [1 / hz];
  const deathTicks = []; let ticks = 0, volleyAfterDeath = 0, specialAfterDeath = false;
  const deathsBefore = a.stats.deaths, projBefore = h.G.projectiles.list.length;
  for (let fr = 0; fr < hz * 2; fr++) {
    clock.advance(frames[fr % frames.length], () => {
      const wasAlive = a.alive, projBeforeTick = h.G.projectiles.list.length;
      a.intent.fire = scenario === 'active-held' || (scenario === 'armed-buffered' && ticks === 0);
      h.tick(a);
      ticks++;
      if (wasAlive && !a.alive) deathTicks.push(ticks);
      if (!a.alive && h.G.projectiles.list.length > projBeforeTick && deathTicks.at(-1) !== ticks) volleyAfterDeath++;
      if (!a.alive && a.specialActive) specialAfterDeath = true;
    });
  }
  return { deaths: a.stats.deaths - deathsBefore, deathTicks, volleyAfterDeath, specialAfterDeath, alive: a.alive,
    projectiles: h.G.projectiles.list.length - projBefore };
}

test('#1164 Trizooka owner water death publishes one packet and the remote applies it without a second splat', async () => {
  const h = await setup(), g = await setup(), wire = [];
  h.step();
  assert.equal(h.a.specialActive?.id, 'trizooka');
  const session = id => ({ myId: id, hostId: 'A', isHost: id === 'A', _members: new Map([['A', 'A'], ['B', 'B']]),
    tr: { broadcast: data => wire.push(JSON.parse(JSON.stringify(data))) } });
  h.a.nid = g.a.nid = 7; h.a.owner = g.a.owner = 'A'; h.a.isLocal = true; g.a.remote = true;
  const ownerSplats = [], remoteSplats = [];
  h.on('splatted', e => ownerSplats.push(e)); g.on('splatted', e => remoteSplats.push(e));
  h.a.pos.set(0, h.PLAYER.fallDeathY + 0.02, 0); h.a.vel.set(0, -2, 0); h.a.grounded = false;
  h.G.level.groundHeight = () => -Infinity;
  const owner = new h.NetMatch(session('A'), { map: 'tidewater' }), remote = new g.NetMatch(session('B'), { map: 'tidewater' });
  try {
    owner.bind({ actors: [h.a], state: 'playing', time: 180 });
    remote.bind({ actors: [g.a], state: 'playing', time: 180 });
    h.step();
    assert.equal(h.a.alive, false);
    assert.equal(ownerSplats.length, 1, 'owner emits one environmental splat');
    assert.equal(ownerSplats[0].cause, 'water');
    assert.equal(ownerSplats[0].attacker ?? null, null, 'water death has no kill credit');
    owner._sendTick();
    const packet = wire.at(-1);
    assert.equal(packet.a[0][10] & 1, 0, 'packet carries the dead flag');
    remote.onMessage('A', packet);
    remote.peers.get('A').tr = packet.ts;
    remote._playEvents(); remote._sample(g.a, packet.ts, DT); remote.applyRemote(g.a, DT);
    assert.equal(g.a.alive, false);
    assert.equal(g.a.hp, 0);
    assert.ok(remoteSplats.length <= 1, 'remote application does not splat more than once');
    assert.equal(remoteSplats.filter(e => e.attacker).length, 0, 'remote path invents no kill credit');
    for (let i = 0; i < 5; i++) { owner._sendTick(); remote.onMessage('A', wire.at(-1)); }
    assert.equal(ownerSplats.length, 1, 'no duplicate owner splat from later ticks');
  } finally { owner.dispose(); remote.dispose(); }
});

for (const scenario of ['unfired', 'armed-buffered', 'active-held']) {
  test(`#1164 Trizooka ${scenario} owner crossing lethal water dies once on the first fixed tick at every render rate`, async () => {
    let first = null;
    for (const hz of [30, 60, 120]) {
      const r = await crossing(scenario, hz);
      assert.equal(r.alive, false);
      assert.equal(r.deaths, 1, `${hz}Hz exactly one environmental death`);
      assert.deepEqual(r.deathTicks, [1], `${hz}Hz death on the first fixed tick`);
      assert.equal(r.specialAfterDeath, false, `${hz}Hz special cancelled by the death`);
      assert.equal(r.volleyAfterDeath, 0, `${hz}Hz no volley after the death tick`);
      const key = { deaths: r.deaths, deathTicks: r.deathTicks, projectiles: r.projectiles };
      if (first) assert.deepEqual(key, first, `${hz}Hz outcome matches 30Hz`); else first = key;
    }
    const hitch = await crossing(scenario, 60, true);
    assert.equal(hitch.deaths, 1, 'rendering hitch keeps one death');
    assert.deepEqual(hitch.deathTicks, [1], 'rendering hitch keeps the first-tick death');
    assert.equal(hitch.volleyAfterDeath, 0);
    assert.deepEqual({ deaths: hitch.deaths, deathTicks: hitch.deathTicks, projectiles: hitch.projectiles }, first);
  });
}
