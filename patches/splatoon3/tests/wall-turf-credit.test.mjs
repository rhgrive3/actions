import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { floorCoverage } from '../runtime/scoring.mjs';

const setupPaintEnv = async () => fixture();

function makeFace(THREE, { id = 0, turf = true, wall = false, grid = 0, nu = 10, nv = 10, cu = 0.1, cv = 0.1 } = {}) {
  return {
    id, turf, wall, grid, nu, nv, cu, cv, su: nu * cu, sv: nv * cv,
    origin: new THREE.Vector3(0, 0, 0),
    n: wall ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0),
    u: wall ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
    v: wall ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1),
    atlas: { pad: 0, ppm: 10, x: 0, y: 0 }
  };
}

function createPaintSystem(api, faces, totalCells = 200) {
  const ps = Object.create(api.PaintSystem.prototype);
  ps.paintFaces = faces;
  ps.grid = new Uint8Array(totalCells);
  ps.dead = new Uint8Array(totalCells);
  ps.counts = [0, 0];
  ps.version = 0;
  ps.growing = [];
  ps.clock = 0;
  ps.rip = new Float32Array(100);
  ps.ripP = new Float32Array(100);
  ps._ripS = new Float32Array(100);
  ps._qb = [];
  return ps;
}

function createActorMock() {
  return {
    stats: { turf: 0 },
    special: 0,
    specialActive: null,
    specialCost: () => 180,
    specialReady() { return this.special >= this.specialCost(); },
    addTurf(area) {
      if (area <= 0) return;
      this.stats.turf += area;
      if (!this.specialActive) {
        this.special = Math.min(this.specialCost(), this.special + area);
      }
    }
  };
}

test('painting a neutral vertical wall updates paint grid but awards zero claimed area, turf points and special gauge', async () => {
  const api = await setupPaintEnv();
  const wallFace = makeFace(api.THREE, { id: 0, turf: false, wall: true, grid: 0, nu: 10, nv: 10 });
  const ps = createPaintSystem(api, [wallFace], 100);
  const actor = createActorMock();

  // Splat on wall for team 1 (team index 0)
  const claimed = ps._cpuSplat(wallFace, 0.5, 0.5, 0.2, 0, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.equal(claimed, 0, 'wall paint must return 0 claimed area');
  assert.deepEqual(ps.counts, [0, 0], 'wall cells must not increment match counts');
  assert.ok(ps.version > 0, 'paint version must bump when CPU grid changes');

  // Verify CPU grid actually recorded paint for climbing
  const paintedCells = Array.from(ps.grid).filter(v => v === 1).length;
  assert.ok(paintedCells > 0, 'wall cells must be recorded in grid for climbing');

  actor.addTurf(claimed);
  assert.equal(actor.stats.turf, 0, 'actor stats.turf remains 0');
  assert.equal(actor.special, 0, 'actor special remains 0');
});

test('painting an enemy vertical wall changes ink ownership but awards zero claimed area', async () => {
  const api = await setupPaintEnv();
  const wallFace = makeFace(api.THREE, { id: 0, turf: false, wall: true, grid: 0, nu: 10, nv: 10 });
  const ps = createPaintSystem(api, [wallFace], 100);
  const actor = createActorMock();

  // Initially team 2 owns the wall cells
  ps.grid.fill(2); // team 2 = val 2
  const v0 = ps.version;

  // Team 1 claims the wall
  const claimed = ps._cpuSplat(wallFace, 0.5, 0.5, 0.2, 0, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.equal(claimed, 0, 'reclaiming enemy wall awards 0 claimed area');
  assert.deepEqual(ps.counts, [0, 0], 'wall cells must never affect match counts');
  assert.ok(ps.version > v0, 'version must increment on ownership change');

  // Verify cells switched to team 1 (val 1)
  const team1Cells = Array.from(ps.grid).filter(v => v === 1).length;
  assert.ok(team1Cells > 0, 'enemy wall cells successfully switched to team 1');

  actor.addTurf(claimed);
  assert.equal(actor.stats.turf, 0);
  assert.equal(actor.special, 0);
});

test('painting eligible floor awards legitimate claimed area, Turf points, and special gauge', async () => {
  const api = await setupPaintEnv();
  const floorFace = makeFace(api.THREE, { id: 0, turf: true, wall: false, grid: 0, nu: 10, nv: 10, cu: 0.1, cv: 0.1 });
  const ps = createPaintSystem(api, [floorFace], 100);
  const actor = createActorMock();

  const claimed = ps._cpuSplat(floorFace, 0.5, 0.5, 0.2, 0, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.ok(claimed > 0, 'floor paint awards positive claimed area');
  assert.equal(ps.counts[0], Math.round(claimed / (0.1 * 0.1)), 'counts match claimed cell count');

  actor.addTurf(claimed);
  assert.equal(actor.stats.turf, claimed);
  assert.equal(actor.special, claimed);
});

test('repainting own floor awards 0 additional credit; reclaiming enemy floor awards credit once', async () => {
  const api = await setupPaintEnv();
  const floorFace = makeFace(api.THREE, { id: 0, turf: true, wall: false, grid: 0, nu: 10, nv: 10 });
  const ps = createPaintSystem(api, [floorFace], 100);

  // 1. Initial paint by team 1
  const claimed1 = ps._cpuSplat(floorFace, 0.5, 0.5, 0.2, 0, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.ok(claimed1 > 0);

  // 2. Repainting same area with same team 1
  const claimedSame = ps._cpuSplat(floorFace, 0.5, 0.5, 0.2, 0, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.equal(claimedSame, 0, 'repainting own ink yields 0 claimed area');

  // 3. Team 2 reclaims the exact same area
  const countTeam1Before = ps.counts[0];
  const claimedEnemy = ps._cpuSplat(floorFace, 0.5, 0.5, 0.2, 1, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.ok(claimedEnemy > 0, 'reclaiming enemy floor yields positive claimed area');
  assert.equal(ps.counts[0], countTeam1Before - Math.round(claimedEnemy / (0.1 * 0.1)));
  assert.equal(ps.counts[1], Math.round(claimedEnemy / (0.1 * 0.1)));
});

test('buried and occluded dead[k] cells award zero claimed area and counts', async () => {
  const api = await setupPaintEnv();
  const floorFace = makeFace(api.THREE, { id: 0, turf: true, wall: false, grid: 0, nu: 10, nv: 10 });
  const ps = createPaintSystem(api, [floorFace], 100);

  // Mark all cells as dead (e.g. buried under another structure)
  ps.dead.fill(1);

  const claimed = ps._cpuSplat(floorFace, 0.5, 0.5, 0.2, 0, 1, 'blob', 1, 0, 0, 0, 0, false);
  assert.equal(claimed, 0, 'dead cells return zero claimed area');
  assert.deepEqual(ps.counts, [0, 0], 'dead cells never alter match counts');
});

test('mixed floor and wall splat only credits the score-eligible floor area', async () => {
  const api = await setupPaintEnv();
  const wallFace = makeFace(api.THREE, { id: 0, turf: false, wall: true, grid: 0, nu: 10, nv: 10 });
  const floorFace = makeFace(api.THREE, { id: 1, turf: true, wall: false, grid: 100, nu: 10, nv: 10 });
  const ps = createPaintSystem(api, [wallFace, floorFace], 200);

  ps.level = {
    faces: [wallFace, floorFace],
    blocks: [{
      faces: [0, 1, -1, -1, -1, -1],
      aabbMin: new api.THREE.Vector3(-10, -10, -10),
      aabbMax: new api.THREE.Vector3(10, 10, 10)
    }],
    queryBlocks: (_x0, _z0, _x1, _z1, out) => { out.push(0); return out; }
  };

  const claimed = ps.splat(new api.THREE.Vector3(0, 0.2, 0.2), 0.5, 0);
  assert.ok(claimed > 0, 'mixed splat awards positive area for the floor part');

  // Verify wall cells were inked in grid
  const wallCellsInked = Array.from(ps.grid.slice(0, 100)).filter(v => v === 1).length;
  assert.ok(wallCellsInked > 0, 'wall cells were successfully inked on grid');

  // Verify counts only reflects the floor cells
  const floorCellsInked = Array.from(ps.grid.slice(100, 200)).filter(v => v === 1).length;
  assert.equal(ps.counts[0], floorCellsInked, 'match counts match only eligible floor cells');
  assert.ok(Math.abs(claimed - floorCellsInked * (0.1 * 0.1)) < 1e-10, 'claimed matches eligible floor area');

  // Authoritative coverage correctly matches floor only
  const cov = floorCoverage(ps);
  assert.ok(cov[0] > 0);
  assert.equal(cov[1], 0);
});
