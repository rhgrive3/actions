import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { preparePaintAncillary } from '../runtime/paint-ownership.mjs';

// Sub-cell ink uses a real circle/ellipse core intersection instead of only
// five fixed points. Ownership is discretized to the existing 0.25 m cells;
// a newly claimed cell must contain a GPU-visible witness.

const SEED = 0.5, R = 2.7;
const source = adaptBuildSource('src/world/paint.js', fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js', import.meta.url),'utf8'));
const shapes = [...source.match(/vec4 kindShape\(float k\) \{[^}]+\}/)[0].matchAll(/return vec4\(([^)]+)\)/g)]
  .map(m=>m[1].split(',').map(Number));

function makePaintWorld(f) {
  const { G, THREE, PaintSystem } = f;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
  const face = { origin: V(-40, 0, -5), u: V(1, 0, 0), v: V(0, 0, 1), n: V(0, 1, 0),
    su: 80, sv: 105, wall: false, turf: true, paintable: true };
  const block = { id: 0, solid: true, grate: false, center: V(0, -1, 47.5), half: V(40, 1, 52.5), axes,
    faces: [0, -1, -1, -1, -1, -1], aabbMin: V(-40, -2, -5), aabbMax: V(40, 0, 100) };
  const level = { faces: [face], blocks: [block], pointInside: () => false,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; out.push(0); return out; } };
  G.level = level;
  G.physics = new f.Physics(level);
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(); G.camera.position.set(0, 3, -4);
  G.teamColors = [new THREE.Color(0xff8a14), new THREE.Color(0x2f5bff)];
  G.actors = []; G.time = 0; G.mode = 'match';

  class CpuPaint extends PaintSystem {
    _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; this.submitted = []; this.drawCalls = 0; }
    _pushQuad(...args) { this.submitted.push({ team: args[9], tn: args[15], dT: args[16], mode: args[17] }); }
    _drawQuads() { this.drawCalls++; this.quads = 0; this.dryMesh.visible = false; }
  }
  const paint = new CpuPaint(null, level, { atlasSize: 4096, maxDensity: 30, cell: 0.25 });
  G.paint = paint;
  G.projectiles = new f.Projectiles(G.scene);
  return { paint, face, V };
}

test('all production ray beads have matching CPU ownership at multiple sizes (#264)', async () => {
  const f = await fixture({ productionComposition:true, fullRuntime:true, realProjectiles:true,
    adaptRuntime:(_rel,code)=>process.env.INKWAVE_PAINT_DOT_BASELINE==='1'
      ? code.replace('return !!paintDotCellWitness(mask, face, x, y, piece);','return false;') : code });
  for(const radius of [.2,.65,2.7]) for(const seed of [.11,.5,.93]) for(const team of [0,1]) {
    const {paint,face,V}=makePaintWorld(f);
    paint.useFixedPaintClock();
    paint.splat(V(0,0,5),radius,team,{seed,kind:'bomb',instant:true});
    const mask=preparePaintAncillary({R:radius,seed,kind:3},face,40,10,0,0,0,0,3,1,{shapes});
    const beads=mask.pieces.filter(p=>p.type===1);
    assert.equal(beads.length,10,'current production bomb retains ten ray-tip beads');
    for(const bead of beads) {
      const i=Math.floor((40+bead.x)/face.cu),j=Math.floor((10+bead.y)/face.cv);
      assert.equal(paint.grid[face.grid+j*face.nu+i],team+1,`R=${radius}, seed=${seed}, bead centre must be owned`);
    }
  }
});

test('removed legacy bomb satellites/spatter stay disabled on both CPU and GPU (#264)',()=>{
  assert.equal(shapes[3][1],0);
  assert.equal(shapes[3][2],0);
  assert.match(source,/shapes: \[\[5, 0, 0, 3\]/);
});

test('owned cells of the bomb stay within the native reach', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { paint, face, V } = makePaintWorld(f);
  const lu0 = 0 - face.origin.x, lv0 = 5 - face.origin.z;
  paint.useFixedPaintClock();
  paint.splat(V(0, 0, 5), R, 0, { seed: SEED, kind: 'bomb' });
  for (let tick = 0; tick < 900 && paint.growing.length > 0; tick++) paint.advanceSimulation(1 / 60);

  // Every owned cell must lie inside the native body/ancillary reach of the bomb (2.75 R plus the
  // largest satellite and dot extent). A stray cell beyond that would mean a rule over-claims.
  let beyond = 0;
  for (let idx = 0; idx < paint.grid.length; idx++) {
    if (!paint.grid[idx]) continue;
    const j = Math.floor(idx / face.nu), i = idx - j * face.nu;
    const d = Math.hypot((i + 0.5) * face.cu - lu0, (j + 0.5) * face.cv - lv0);
    if (d > 2.75 * R + 0.2) beyond++;
  }
  assert.equal(beyond, 0, 'owned cells stay within the native bomb reach');
});
