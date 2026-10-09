// PR1188 Blaster floor-paint harness. Drives the composed production modules
// (native Projectiles + weapons fidelity + flight scheduler + falling splash
// queue) on real Level/Physics geometry and records every paint request.
// CPU area is measured on the production PaintSystem._cpuSplat grid.
import { batchFixture, cpuFloor } from './batch03-fixture.mjs';
import { advanceSplashDrops, splashDepthScale, splashStretch } from '../runtime/blaster-flight-paint.mjs';
import { FixedClock } from '../runtime/clock.mjs';

export { splashDepthScale, splashStretch };
const BOUNDS = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
export const FLOOR = { kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] };

export async function blasterWorld({ blocks = [FLOOR], actorY = 0, aimY = null, seed = .5 } = {}) {
  const f = await batchFixture(), { G, THREE } = f;
  G.level = new f.Level({ bounds: BOUNDS, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single: blocks, half: [] });
  const physics = G.physics = new f.Physics(G.level);
  physics.los = () => true;
  const a = f.make('blaster'); a.isLocal = true; G.camera = new THREE.PerspectiveCamera();
  a.pos.set(0, actorY, 0); a.aimDir.set(0, 0, 1); a.aimPoint.set(0, aimY ?? actorY + 1.05, 100);
  G.actors = [a];
  return { ...f, a, seed, physics };
}

export function fire(w) {
  w.G.projectiles.fireBlaster(w.a, w.a.weapon, 0);
  const p = w.G.projectiles.list.at(-1); p.seed = w.seed; return p;
}

// Fixed 60 Hz simulation fed by an arbitrary render cadence.
export function run(w, hz = 60, seconds = 2) {
  const clock = new FixedClock(), P = w.G.projectiles;
  let frames = 0;
  const idle = () => !P.list.length && !(P._s3SplashDrops || []).length && !(P.s3BlastQueue || []).length &&
    !(P._s3DetachedWallDrops || []).length;
  while (frames < hz * seconds) {
    clock.advance(1 / hz, dt => P.update(dt)); frames++;
    if (idle()) break;
  }
  return frames;
}

// Fall every queued splash to the ground without moving projectiles.
export function settle(w, maxFrames = 600) {
  let n = 0;
  while ((w.G.projectiles._s3SplashDrops || []).length && n < maxFrames) { advanceSplashDrops(w.G.projectiles, 1 / 60, w.G); n++; }
  return n;
}

// Landing receipts written by the production queue (newest 64), in paint order.
export function landings(w) { return [...(w.G.projectiles._s3SplashLandings || [])]; }

export function paintRecords(w) {
  return w.paint.map(e => ({ x: e.point.x, y: e.point.y, z: e.point.z, radius: e.radius,
    stretchAmt: e.opts.stretchAmt ?? 0, stretch: e.opts.stretch ? { x: e.opts.stretch.x, z: e.opts.stretch.z } : null,
    kind: e.opts.kind ?? null, seed: e.opts.seed }));
}

// CPU ownership area of floor-level paint on the production grid (0.25 cells).
export function cpuArea(w, records, options = {}) { return cpuFootprint(w, records, options).area; }
export function cpuFootprint(w, records, { floorY = 0, size = 60, cell = .25, offsetZ = 20 } = {}) {
  const floor = cpuFloor(w, size, cell);
  for (const r of records) {
    const p = new w.THREE.Vector3(r.x, r.y - floorY, r.z - offsetZ);
    floor.splat(p, r.radius, 0, { seed: r.seed, stretchAmt: r.stretchAmt,
      stretch: r.stretch ? new w.THREE.Vector3(r.stretch.x, 0, r.stretch.z) : undefined, kind: r.kind ?? undefined });
  }
  let cells = 0;
  for (let i = 0; i < floor.p.grid.length; i++) if (floor.p.grid[i]) cells++;
  return { area: cells * floor.face.cu * floor.face.cv, x: floor.extent('x'), z: floor.extent('z') };
}

// Flight-splash schedule at an exact projectile height above a flat floor.
// Drives the production scheduler with a straight segment, then the queue.
export async function flightAtHeight(height, { hz = 60, length = 20 } = {}) {
  const { paintBlasterFlight } = await import('../runtime/blaster-flight-paint.mjs');
  const w = await blasterWorld();
  const p = fire(w), s = p.s3BlasterFlightPaint;
  const y = Math.max(height, 1e-3);
  s.last.set(0, y, 0); p.pos.set(0, y, 0);
  const steps = Math.max(1, Math.round(hz * length / 56.7));
  for (let i = 1; i <= steps; i++) {
    p.pos.set(0, y, length * i / steps);
    paintBlasterFlight(w.G, p);
    advanceSplashDrops(w.G.projectiles, 1 / hz, w.G);
  }
  const fallFrames = settle(w);
  return { w, p, spec: s.spec, records: paintRecords(w), fallFrames, landings: landings(w) };
}
