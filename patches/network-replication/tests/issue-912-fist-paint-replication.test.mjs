import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import {
  installTripleSlamFists, tripleSlamFistStamps, FIST_STAMP_RADIUS, FIST_TRAVEL,
} from '../../splatoon3/runtime/triple-slam-fists.mjs';

// #912 two-peer replication: a Triple Splashdown landing on the sender must leave the receiver's CPU
// turf and coverage identical. The fists go through the real PaintSystem and the real NetMatch row
// path; only the Actor shell and the non-paint world (victims, LOS, projectiles) are stubbed.

function paintLevel(THREE, size, origin) {
  const face = {
    paintable: true, su: size, sv: size, turf: true, wall: false, block: null,
    origin: new THREE.Vector3(origin, 0, origin),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0),
  };
  const block = {
    aabbMin: new THREE.Vector3(origin, -0.1, origin), aabbMax: new THREE.Vector3(origin + size, 0.1, origin + size),
    faces: [0, -1, -1, -1, -1, -1],
  };
  face.block = block;
  return { faces: [face], blocks: [block], pointInside: () => false, queryBlocks: () => [0] };
}

function paintRenderer(THREE) {
  let target = null, clear = new THREE.Color(), alpha = 1;
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    getClearColor: out => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value, opacity) => { if (value?.isColor) clear.copy(value); alpha = opacity; },
    clear() {}, render() {},
  };
}

// The level is 40 units wide so a radius-10 footprint is never clipped by the face.
async function client(id, memberIds = ['a', 'b', 'c'], host = 'a') {
  const f = await fixture();
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'fist-paint' });
  const actors = memberIds.map((owner, i) => f.makeActor({ nid: i, owner, remote: id !== owner, team: i % 2, roller: false }));
  f.G.match = f.bind(nm, actors);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, 40, -20), { atlasSize: 1024, maxDensity: 30, cell: 0.25 });
  return { f, nm, session, actors, paint: f.G.paint };
}

function received(event) {
  const copy = JSON.parse(JSON.stringify(event));
  copy._netTick = event._netTick;
  copy._netSeq = event._netSeq;
  return copy;
}

function applyRemote(clientState, from, event) {
  clientState.nm._peer(from);
  clientState.nm._play(from, received(event));
}

// Owner-side Tidal Slam landing through the production installer. Math.random is pinned so the
// sender's seeds (and therefore its CPU cells) are reproducible across runs.
function landFists(sender, team = 1) {
  const G = sender.f.G, THREE = sender.f.THREE;
  G.projectiles = { applyHit() {} };
  G.fx = { explosion() {} };
  G.physics = { los: () => true };
  G.actors = [];
  class Actor {
    constructor() {
      this.alive = true; this.remote = false; this.team = team; this.weapon = { special: 'slam' };
      this.pos = new THREE.Vector3(0, 0, 0); this.yaw = 0; this.superJumpState = null; this.specialActive = null;
      this.turf = 0;
    }
    _startSpecial() { this.specialActive = { id: 'slam' }; }
    _slamImpact() {}
    update(dt) { return dt; }
    reset() { this.specialActive = null; }
    addTurfNoSpecial(amount) { this.turf += amount; }
  }
  installTripleSlamFists({ Actor, G, THREE }, null);
  const actor = new Actor();
  let draw = 0;
  const realRandom = Math.random;
  Math.random = () => (draw++ * 0.618034) % 1;
  try {
    actor._startSpecial(); actor._slamImpact();
    for (let i = 0; i < Math.round(FIST_TRAVEL * 60); i++) actor.update(1 / 60);
  } finally { Math.random = realRandom; }
  return actor;
}

function freshPaint(f, size = 40, origin = -20) {
  const THREE = f.THREE;
  f.G.netm = null;
  return new f.PaintSystem(paintRenderer(THREE), paintLevel(THREE, size, origin), { atlasSize: 1024, maxDensity: 30, cell: 0.25 });
}

test('#912 fist landing: receiver CPU turf and coverage equal the sender after real NetMatch replay', async () => {
  const sender = await client('b'), observer = await client('c');
  const actor = landFists(sender);
  const rows = sender.nm.out.filter(e => e[1] === 's');
  assert.equal(rows.length, 2 * tripleSlamFistStamps(10).length, 'every stamp of both fists is one paint row');
  assert.ok(actor.turf > 0, 'the sender claimed personal turf');
  assert.ok(rows.every(r => r[5] === FIST_STAMP_RADIUS), 'every fist row is at the admissible stamp radius');
  for (const row of rows) applyRemote(observer, 'b', row);
  assert.equal(observer.nm._peer('b')._lastEventSeq, rows.at(-1)._netSeq, 'every stamp is admitted in sender order');
  assert.ok(sender.paint.grid.some(v => v !== 0), 'the sender actually painted');
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid), 'CPU coverage matches the sender');
  assert.deepEqual(Array.from(observer.paint.counts), Array.from(sender.paint.counts), 'turf counts match the sender');
});

test('#912 forged radius-10 row that is not a fist stamp is still rejected by the remote ceiling', async () => {
  const sender = await client('b'), observer = await client('c');
  sender.paint.splat(new sender.f.THREE.Vector3(0, 0.12, 0), 10, 1, { seed: 0.31 });
  const forged = sender.nm.out.at(-1), before = Array.from(observer.paint.grid);
  observer.nm._play('b', received(forged));
  assert.equal(observer.nm._peer('b')._lastEventSeq ?? 0, 0, 'radius-10 row reserves no sequence');
  assert.equal(observer.paint.growing.length, 0, 'radius-10 row queues no GPU growth');
  assert.deepEqual(Array.from(observer.paint.grid), before, 'radius-10 row paints no CPU turf');
});

test('#912 stamp cluster footprint approximates one radius-10 splat (logic measurement, not the game)', async () => {
  const f = await fixture();
  const ref = freshPaint(f);
  const single = ref.splat(new f.THREE.Vector3(0, 0.12, 0), 10, 1, { seed: 0.31 });
  const cluster = freshPaint(f);
  let claimed = 0;
  tripleSlamFistStamps(10).forEach((stamp, k) => {
    const at = new f.THREE.Vector3(stamp.dx, 0.12, stamp.dz);
    claimed += cluster.splat(at, FIST_STAMP_RADIUS, 1, { seed: Number(((k * 0.137) % 1).toFixed(3)) }) || 0;
  });
  let covered = 0, reference = 0;
  for (let k = 0; k < ref.grid.length; k++) {
    if (ref.grid[k] === 0) continue;
    reference++;
    if (cluster.grid[k] !== 0) covered++;
  }
  const ratio = claimed / single;
  assert.ok(ratio > 0.9 && ratio < 1.3, `cluster/single area ${ratio.toFixed(3)}`);
  assert.ok(covered / reference >= 0.9, `coverage of the single footprint ${(covered / reference).toFixed(3)}`);
});
