import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {adaptSource} from '../adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {adaptNetworkSource} from '../../network-replication/adapter.mjs';
import {FixedClock, STEP} from '../runtime/clock.mjs';

// #269 arms on first terrain contact; #723 advances the remaining timer only
// while contacting/supporting terrain. These are different requirements.
// Evidence and the rejected wall-clock acceptance clause are recorded in
// reports/issue-batch-05/research/issue-269.md. No Nintendo bounce law is assumed.
const compose = (rel, source) => adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel,
    adaptTouchLayout(rel, adaptSource(rel, source)))));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const surfaces = [
  ['floor', [0, 1, 0]], ['wall-x', [-1, 0, 0]],
  ['wall-z', [0, 0, 1]], ['ceiling', [0, -1, 0]],
  ['50-degree slope', [0, Math.cos(50*Math.PI/180), Math.sin(50*Math.PI/180)]],
  ['70-degree slope', [0, Math.cos(70*Math.PI/180), Math.sin(70*Math.PI/180)]],
];

async function world({ghost = false, upwardOnly = false} = {}) {
  let mutations = 0;
  const adapt = (rel, source) => {
    const adapted = compose(rel, source);
    if (!upwardOnly || rel !== 'src/game/weapons.js') return adapted;
    const needle = 'if (b.fuse < 0) { b.fuse = SUB.bomb.fuse;';
    assert.equal(adapted.split(needle).length - 1, 1, 'negative-control arming site');
    mutations++;
    return adapted.replace(needle,
      'if (hit.normal.y > 0.6 && b.fuse < 0) { b.fuse = SUB.bomb.fuse;');
  };
  const f = await fixture({adapt});
  f.installSubSpecialFidelity(f, f.profile);
  const {G, THREE} = f, V = (...v) => new THREE.Vector3(...v);
  Object.assign(G, {scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    actors: [], audio: null, fx: null, boss: null, netm: null});
  G.level = {blocks: [], faces: [], queryBlocks(_a, _b, _c, _d, out) {
    out.length = 0; this.blocks.forEach((_block, i) => out.push(i)); return out;
  }};
  G.physics = new f.Physics(G.level);
  const ps = G.projectiles = new f.Projectiles(G.scene);
  ps.throwBomb(f.make());
  const bomb = ps.bombs[0];
  assert.ok(bomb, 'native throw creates a bomb');
  bomb.fuse = -1;
  delete bomb.s3FuseNormal;
  if (ghost) Object.assign(bomb, {ghost: true, _netPeer: {sim: -1, tr: 0, lastTs: 0},
    _netBornTick: 0, _netBorn: 0, _netSteps: 0});
  let ticks = 0, explosions = 0, releases = 0;
  const release = ps._releaseBomb;
  ps._releaseBomb = function(b) { releases++; return release.call(this, b); };
  ps._explodeBomb = () => { explosions++; };
  function step() {
    if (ghost) bomb._netPeer.sim = ticks;
    ps._updateBombs(STEP);
    ticks++;
  }
  const origin = V(0, 5, 0);
  function surface(normal) {
    const n = V(...normal).normalize();
    const x = Math.abs(n.x) > .9 ? V(0, 0, 1) : V(1, 0, 0);
    x.addScaledVector(n, -x.dot(n)).normalize();
    const z = x.clone().cross(n).normalize();
    G.level.blocks.length = 0;
    G.level.blocks.push({id: 0, solid: true, grate: false,
      center: origin.clone().addScaledVector(n, -.1), half: V(20, .1, 20),
      axes: [x, n, z], faces: []});
    bomb.pos.copy(origin).addScaledVector(n, .01);
    bomb.vel.copy(n).multiplyScalar(-3);
    bomb.vel.y += f.SUB.bomb.gravity * STEP;
    return n;
  }
  function airborne() { bomb.pos.set(1000, 1000, 1000); bomb.vel.set(0, 0, 0); }
  function floorSupport() { bomb.pos.set(0, 5.21, 0); bomb.vel.set(0, 0, 0); }
  return {bomb, ps, surface, airborne, floorSupport, step,
    result: () => ({ticks, explosions, releases}), mutations: () => mutations};
}

for (const ghost of [false, true]) {
  for (const [name, normal] of surfaces) {
    test(`#269 ${ghost ? 'ghost' : 'owner'} first ${name} contact arms without resetting on later contacts`, async () => {
      const w = await world({ghost});
      const expectedNormal = w.surface(normal);
      w.step();
      near(w.bomb.fuse, 1 - STEP);
      near(w.bomb.s3FuseNormal.distanceTo(expectedNormal), 0);
      const remaining = w.bomb.fuse;
      w.airborne();
      for (let i = 0; i < 30; i++) w.step();
      near(w.bomb.fuse, remaining);
      assert.equal(w.result().explosions, 0);
      w.surface([0, 1, 0]);
      w.step();
      near(w.bomb.fuse, 1 - 2*STEP);
      assert.equal(w.result().explosions, 0);
      w.ps.clear();
    });
  }
  for (const hz of [30, 60, 120]) {
    test(`#269/#723 ${ghost ? 'ghost' : 'owner'} ${hz}Hz spends 60 contact ticks, not 60 elapsed ticks`, async () => {
      const w = await world({ghost}), clock = new FixedClock();
      w.surface([-1, 0, 0]);
      const simulate = () => {
        const tick = w.result().ticks;
        if (tick === 1) w.airborne();
        if (tick === 31) w.surface([0, 1, 0]);
        if (tick > 31) w.floorSupport();
        w.step();
      };
      for (let frame = 0; frame < hz; frame++) clock.advance(1/hz, simulate);
      assert.deepEqual(w.result(), {ticks: 60, explosions: 0, releases: 0});
      near(w.bomb.fuse, .5);
      for (let frame = 0; frame < hz/2; frame++) clock.advance(1/hz, simulate);
      assert.deepEqual(w.result(), {ticks: 90, explosions: 1, releases: 1});
      assert.equal(w.ps.bombs.length, 0);
    });
  }
}

test('#269 negative control reintroduces only upward-normal arming and reproduces the wall defect', async () => {
  const w = await world({upwardOnly: true});
  w.surface([-1, 0, 0]);
  w.step();
  assert.equal(w.mutations(), 1);
  near(w.bomb.fuse, -1);
  w.surface([0, 1, 0]);
  w.step();
  near(w.bomb.fuse, 1 - STEP);
  w.ps.clear();
});
