import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const bootstrap = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
const imports = [...bootstrap.matchAll(/^import \{ (\w+) \} from '(.*?)';/gm)].filter(m => m[1] !== 'install');
const extraExports = imports.map(m => `export { ${m[1]} } from './patches/splatoon3/${m[2]}';`).join('\n') + `
export * from './patches/splatoon3/runtime/haunt.mjs';
export * from './patches/splatoon3/runtime/respawn-lifecycle.mjs';
export function saveTestLoadout(value) {
  globalThis.localStorage = { getItem: key => key === 'inkwave.splatoon3.gear.v1' ? JSON.stringify(value) : null };
}`;
const wire = x => JSON.parse(JSON.stringify(x));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

async function pair(t, hz, old = false) {
  let time = 10, holdReceiver = false;
  const mail = { A: [], B: [] };
  async function rig(id) {
    const adapt = (rel, raw) => {
      let code = adaptBuildSource(rel, raw);
      if (old && rel === 'patches/splatoon3/runtime/haunt.mjs') {
        const hook = 'const accepted = a?.remote ? a.net?.lastLife : null;';
        assert.equal(code.split(hook).length, 2, 'counterfactual disables exactly the accepted-life consumer');
        code = code.replace(hook, 'const accepted = null;');
      }
      return code;
    };
    const f = await fixture({ fullRuntime: true, realProjectiles: true, adaptNative: adapt,
      adaptRuntime: adapt, vmPerformance: { now: () => time * 1000 }, extraExports });
    // Run the actual extra bootstrap installers, not only installS3.
    const calls = [...bootstrap.matchAll(/^  (install\w+)\(/gm)];
    assert.equal(calls.length, imports.length);
    for (const [, name] of calls) {
      if (name === 'installQuality') f[name](f.profile);
      else f[name](f.installedRuntime, f.profile);
    }
    const a = f.make(), b = f.make(), c = f.make();
    Object.assign(a, { nid: 1, owner: 'A', team: 0, netLife: 1, isLocal: id === 'A' });
    Object.assign(b, { nid: 2, owner: 'B', team: 1, netLife: 5, isLocal: id === 'B' });
    Object.assign(c, { nid: 3, owner: 'B', team: 1, netLife: 7 });
    if (id === 'A') { a.s3.loadout[1].main = 'haunt'; f.saveTestLoadout(a.s3.loadout); }
    f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3()];
    f.G.physics.groundProbe = (...args) => { args[6].hit = false; return args[6]; };
    f.G.match = { mode: 'turf', state: 'playing', time: 180, playing: () => true, canRespawn: () => true,
      local: id === 'A' ? a : b, actors: [a, b, c] };
    const nm = new f.NetMatch({ myId: id, hostId: 'B', isHost: id === 'B',
      _members: new Map([['A', 1], ['B', 1]]),
      tr: { sendTo() {}, broadcast: d => mail[id === 'A' ? 'B' : 'A'].push(wire(d)) } }, { id: 'haunt-life-order', map: 'reef' });
    nm.bind(f.G.match); t.after(() => nm.dispose());
    return { ...f, a, b, c, nm, clock: new f.FixedClock() };
  }
  const s = await rig('A'), r = await rig('B'), replay = [];
  const native = r.nm.replayHauntEvent;
  r.nm.replayHauntEvent = function (name, e, from) {
    if (name.startsWith('haunt:')) replay.push({ name, target: e.target?.nid, eventLife: e.ownerLife,
      renderedLife: e.actor.netLife, sampledLife: e.actor.net.cur?.life, acceptedLife: e.actor.net.lastLife });
    const result = native.call(this, name, e, from);
    if (name === 'haunt:mark') {
      replay.at(-1).pendingPenalty = r.hauntBasicPenalty(e.target, e.actor);
      // Ordinary tracking/damage queries may run while either target waits
      // for the newest arm; do not destroy a previously armed sibling mark.
      for (const target of [r.b, r.c]) r.hauntBasicPenalty(target, e.actor);
    }
    return result;
  };
  function frames(count = hz) {
    for (let i = 0; i < count; i++) {
      time += 1 / hz;
      for (const [id, f] of [['A', s], ['B', r]]) {
        while (mail[id].length) f.nm.onMessage(id === 'A' ? 'B' : 'A', mail[id].shift());
        if (id === 'B' && holdReceiver) continue;
        // Native Match order: networking samples/replays before fixed Actor updates.
        f.nm.update(1 / hz);
        f.clock.advance(1 / hz, dt => {
          f.G.time += dt;
          if (id === 'A' && f.squidSpawnState(f.a)) { f.a.intent.fire = true; f.a.update(dt); }
          for (const a of f.G.match.actors) if (a.remote) f.nm.applyRemote(a, dt);
        });
      }
    }
  }
  frames();
  return { s, r, replay, frames, hold: value => { holdReceiver = value; } };
}
function respawn(f) {
  f.a.intent.fire = false; f.a.respawn();
  assert.equal(f.squidSpawnState(f.a)?.phase, 'aim', 'real Turf spawnAt/reset creates the new life');
}
function assertPenalty(f, target = f.b) {
  assert.equal(f.hauntBasicPenalty(target, f.a)?.frames, 45);
  target.special = 100; target.splat(f.a, 'shooter');
  near(target.special, 35); near(target.respawnTimer, f.PLAYER.respawnTime + .75);
  assert.equal(target.s3.lastHauntPenalty.frames, 45);
}

test('#351 native JSON owner mark/respawn/arm survives all render/send phases at 30/60/120 Hz', async t => {
  let beforeRendered = 0, beforeSampled = 0;
  for (const hz of [30, 60, 120]) for (const offset of [0, 1, 2, 3, 4, 5]) {
    const p = await pair(t, hz), { s, r, frames, replay } = p;
    s.a.splat(s.b); frames(); assert.equal(r.a.alive, false);
    frames(offset); respawn(s); frames();
    assert.equal(s.hauntBasicPenalty(s.b, s.a)?.frames, 45);
    assert(replay.filter(e => e.name === 'haunt:mark').every(e => e.pendingPenalty === null));
    assertPenalty(r);
    beforeRendered += replay.filter(e => e.name === 'haunt:arm' && e.eventLife > e.renderedLife).length;
    beforeSampled += replay.filter(e => e.name === 'haunt:arm' && e.eventLife > e.sampledLife).length;
  }
  assert(beforeRendered > 0, 'legitimate arm replay precedes rendered Actor life');
  assert(beforeSampled > 0, 'sampled life alone cannot repair snapshot-boundary cases');
});

test('#351 a native two-respawn backlog preserves both different killers at every render rate', async t => {
  for (const hz of [30, 60, 120]) {
    const { s, r, frames, hold, replay } = await pair(t, hz);
    hold(true); s.a.splat(s.b); frames(); respawn(s); frames(hz * 2);
    assert.equal(s.squidSpawnState(s.a), null, 'first native spawn fully landed before the next death');
    s.a.splat(s.c); frames(); respawn(s); frames(hz * 2);
    hold(false); frames();
    assert(replay.some(e => e.name === 'haunt:mark' && e.eventLife === 2 && e.renderedLife === 1 && e.acceptedLife === 3),
      'intermediate mark belongs to an accepted life ahead of rendering');
    assert.equal(s.hauntBasicPenalty(s.b, s.a)?.frames, 45);
    assert.equal(s.hauntBasicPenalty(s.c, s.a)?.frames, 45);
    assertPenalty(r, r.b); assertPenalty(r, r.c);
  }
});

test('#351 historical/future/forged marks cannot replace an armed owner ledger', async t => {
  const { s, r, frames } = await pair(t, 60);
  s.a.splat(s.b); frames(); respawn(s); frames();
  const arm = { actor: r.a, target: r.b, ownerOwner: 'A', targetOwner: 'B', ownerLife: 2, targetLife: 5 };
  assert.equal(r.hauntBasicPenalty(r.b, r.a)?.frames, 45);
  // Rendering may still lag while subsequent authority decisions query the ledger.
  r.a.netLife = 1;
  for (const [name, event, from] of [
    ['haunt:mark', { ...arm, ownerLife: 1 }, 'A'],
    ['haunt:mark', { ...arm, ownerLife: 0 }, 'A'],
    ['haunt:mark', { ...arm, ownerLife: 3 }, 'A'],
    ['haunt:arm', { ...arm, ownerLife: 1 }, 'A'],
    ['haunt:arm', { ...arm, ownerLife: 3 }, 'A'],
    ['haunt:mark', { ...arm, targetLife: 6 }, 'A'],
    ['haunt:mark', { ...arm, ownerOwner: 'X' }, 'A'],
    ['haunt:mark', arm, 'X'],
  ]) {
    assert.equal(r.nm.replayHauntEvent(name, event, from), true);
    assert.equal(r.hauntBasicPenalty(r.b, r.a)?.frames, 45, `${name} malformed/stale replay leaves the current record intact`);
  }
  r.a.netLife = 2; r.b.netLife = 6;
  assert.equal(r.hauntBasicPenalty(r.b, r.a), null, 'new victim life cannot inherit the old mark');
});

test('#351 rendered-life-only counterfactual loses the native arm and applies only base death penalty',
  { skip: !!process.env.INKWAVE_BUILT_SITE }, async t => {
    const { s, r, frames, replay } = await pair(t, 60, true);
    s.a.splat(s.b); frames(); respawn(s); frames();
    assert(replay.some(e => e.name === 'haunt:arm' && e.eventLife > e.renderedLife));
    assert.equal(s.hauntBasicPenalty(s.b, s.a)?.frames, 45);
    assert.equal(r.hauntBasicPenalty(r.b, r.a), null);
    r.b.special = 100; r.b.splat(r.a, 'shooter');
    near(r.b.special, 50); near(r.b.respawnTimer, r.PLAYER.respawnTime);
  });
