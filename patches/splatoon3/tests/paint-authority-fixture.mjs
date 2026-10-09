export function makePaintWorld(f, { cell = 0.25, wall = false, occluded = false } = {}) {
  const { G, THREE, PaintSystem } = f;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
  const face = { origin: V(-40, 0, -5), u: V(1, 0, 0), v: V(0, 0, 1), n: V(0, 1, 0),
    su: 80, sv: 105, wall: false, turf: true, paintable: true };
  const block = { id: 0, solid: true, grate: false, center: V(0, -1, 47.5), half: V(40, 1, 52.5), axes,
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: V(-40, -2, -5), aabbMax: V(40, 0, 100) };
  const level = { faces: [face], blocks: [block], pointInside: () => occluded,
    queryBlocks(_x0, _z0, _x1, _z1, out = []) { out.length = 0; for (const b of this.blocks) out.push(b.id); return out; } };
  if (wall) {
    level.faces.push({ origin: V(-40, 0, 8), u: V(1, 0, 0), v: V(0, 1, 0), n: V(0, 0, -1),
      su: 80, sv: 20, wall: true, turf: false, paintable: true });
    level.blocks.push({ id: 1, solid: true, grate: false, center: V(0, 10, 8.5), half: V(40, 10, 0.5), axes,
      faces: [-1, -1, -1, -1, -1, 1], aabbMin: V(-40, 0, 8), aabbMax: V(40, 20, 9) });
  }
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
  const paint = new CpuPaint(null, level, { atlasSize: 4096, maxDensity: 30, cell });
  G.paint = paint;
  G.projectiles = new f.Projectiles(G.scene);
  return { paint, level, face, V };
}

