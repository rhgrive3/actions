import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

// Real composed PaintSystem (CPU grid incl. #264 ancillary ownership) on a flat
// turf face. A splat of radius R claims about pi R^2 and nothing beyond its
// wobbly edge plus short spikes: the source paint radius is the footprint.
// Before the change the decoration reached 1.9-2.5 R and claimed 5-13 % extra.
function level(THREE) {
  const face = { paintable: true, su: 40, sv: 40, turf: true, wall: false, block: null, origin: new THREE.Vector3(-20, 0, -20),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0) };
  const block = { aabbMin: new THREE.Vector3(-20, -0.1, -20), aabbMax: new THREE.Vector3(20, 0.1, 20), faces: [0, -1, -1, -1, -1, -1] };
  face.block = block;
  return { faces: [face], blocks: [block], pointInside: () => false, queryBlocks: () => [0] };
}
function renderer() { let t = null; return { capabilities: { getMaxAnisotropy: () => 1 }, getRenderTarget: () => t, setRenderTarget: v => { t = v; },
  getClearColor: o => o, getClearAlpha: () => 1, setClearColor() {}, clear() {}, render() {} }; }

test('one splat claims ~pi R^2 and stays within ~1.6 R for every blob kind', async () => {
  const f = await fixture(); f.G.netm = null;
  for (const [kind, R] of [['shot', 1.93], ['blast', 3], ['bomb', 5], ['drop', 1], ['line', 1.2], ['trail', 1.5]]) {
    let area = 0, reach = 0; const N = 8;
    for (let s = 0; s < N; s++) {
      const P = new f.PaintSystem(renderer(), level(f.THREE), { atlasSize: 1024, maxDensity: 30, cell: 0.25 });
      P.splat(new f.THREE.Vector3(0, 0.1, 0), R, 0, { seed: (s + 0.5) / N, kind });
      for (let i = 0; i < 400; i++) P.flush(1 / 60);
      const face = P.level.faces[0];
      for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) if (P.grid[face.grid + j * face.nu + i]) {
        area += face.cu * face.cv;
        reach = Math.max(reach, Math.hypot((i + 0.5) * face.cu - 20, (j + 0.5) * face.cv - 20));
      }
    }
    const ratio = area / N / (Math.PI * R * R);
    assert.ok(ratio > 0.9 && ratio < 1.08, `${kind} area ratio ${ratio}`);
    assert.ok(reach / R < 1.65, `${kind} reach ${reach / R} R`);
  }
});
