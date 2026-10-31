import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const extraExports = `
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
  export { dressingFor } from './inkwave-public/src/world/dressing.js';
  export { PropKit } from './inkwave-public/src/world/props.js';
  export { NavGraph } from './inkwave-public/src/game/nav.js';
`;

async function world(stage) {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, productionComposition: true, adaptRuntime: adaptBuildSource, extraExports });
  const { G } = f;
  const kit = new f.PropKit(null, { headless: true });
  const colliders = [...f.dressingFor(stage).flatMap(p => kit.add(p.type, p).colliders),
    ...f.map3ArtColliders(f.MAP_LAYOUTS[stage])];
  assert(f.map3ArtColliders(f.MAP_LAYOUTS[stage]).length > 0, 'exercise the production structural and cover colliders');
  G.level = new f.Level(f.MAP_LAYOUTS[stage], colliders);
  G.physics = new f.Physics(G.level);
  G.nav = new f.NavGraph(G.level, G.physics);
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; } _pushQuad() {} _drawQuads() {} }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 2048, maxDensity: 4, cell: .25 });
  G.match.mode = 'turf';
  return { f, kit };
}

// The previous terrace/dock coordinates belonged to the replaced expanded maps.
// These independent probes now cross the frozen MAP3 ramp toes and upper exits.
const ramps = [
  { stage: 'tidewater', label: 'market west rise', from: [-32, 2.4, -32], to: [-32, 4.8, -17.2] },
  { stage: 'tidewater', label: 'belvedere rise', from: [30, 1.2, -30], to: [30, 3.6, -19] },
  { stage: 'kelpline', label: 'boarding recovery', from: [-40, 0, -16], to: [-26, 3.6, -16] },
  { stage: 'kelpline', label: 'main concourse ascent', from: [0, 3.6, -40], to: [0, 4.8, -52] },
];

for (const stage of ['tidewater', 'kelpline']) test(`${stage}: real actors climb new ramps on both mirrored halves`, async () => {
  const { f, kit } = await world(stage), { G } = f;
  try {
    for (const route of ramps.filter(r => r.stage === stage)) for (const mirror of [1, -1]) for (const hz of [30, 60, 120]) {
      const a = f.make('shooter');
      a._integrate = f.Actor.prototype._integrate;
      a.pos.set(route.from[0] * mirror, route.from[1], route.from[2] * mirror);
      const goal = new f.THREE.Vector3(route.to[0] * mirror, route.to[1], route.to[2] * mirror);
      let reached = false;
      for (let i = 0; i < hz * 8; i++) {
        const dx = goal.x - a.pos.x, dz = goal.z - a.pos.z;
        if (Math.hypot(dx, dz) < .7 && Math.abs(goal.y - a.pos.y) < .35) { reached = true; break; }
        a.intent.move.set(dx, 0, dz).normalize();
        G.time += 1 / hz;
        a.update(1 / hz);
        assert(a.alive && Number.isFinite(a.pos.length()), `${route.label}: invalid actor state`);
      }
      assert(reached, `${route.label}, mirror=${mirror}, ${hz}Hz: stopped at ${a.pos.toArray()}`);
      G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});

test('Kelpline: real Actor stands on the high grate as a kid and falls through as a squid', async () => {
  const { f, kit } = await world('kelpline'), { G } = f;
  try {
    for (const mirror of [1, -1]) {
      const a = f.make('shooter'); a._integrate = f.Actor.prototype._integrate;
      a.pos.set(-26 * mirror, 3.6, -25 * mirror);
      for (let i = 0; i < 60; i++) { G.time += 1 / 60; a.update(1 / 60); }
      assert(a.grounded && a.ground.grate && Math.abs(a.pos.y - 3.6) < .1, 'kid stands on the grate');
      a.intent.squid = true;
      let fell = false;
      for (let i = 0; i < 120; i++) {
        G.time += 1 / 60; a.update(1 / 60);
        if (a.pos.y < 2.9) { fell = true; break; }
      }
      assert.equal(a.form, 'squid');
      assert(fell, 'squid passes through the grate');
      G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});

for (const scenario of [
  { stage: 'tidewater', start: [-2, 0, 0], aim: [-4, 1.05, 0], tag: 'mid_screen' },
  { stage: 'kelpline', start: [14, 2.4, -38], aim: [12, 3.45, -38], tag: 'boarding_rear' },
]) test(`${scenario.stage}: shooter ink reaches the new raised wall`, async () => {
  const { f, kit } = await world(scenario.stage), { G } = f;
  try {
    f.setRandom(() => .5);
    for (const mirror of [1, -1]) {
      const a = f.make('shooter');
      a.pos.set(scenario.start[0] * mirror, scenario.start[1], scenario.start[2] * mirror);
      a.character.root.position.copy(a.pos);
      const aim = new f.THREE.Vector3(scenario.aim[0] * mirror, scenario.aim[1], scenario.aim[2] * mirror);
      const origin = a.pos.clone().add(new f.THREE.Vector3(0, 1.05, .3));
      a.aimDir.copy(aim).sub(origin).normalize(); a.aimPoint.copy(aim);
      const hit = G.physics.raycast(origin, a.aimDir, 3);
      assert(hit.hit && G.level.blocks[hit.block].tag === `${mirror === 1 ? 'A' : 'B'}_${scenario.tag}`, 'shot has an unobstructed horizontal approach to the intended wall');
      assert(G.level.faces[hit.face].paintable, 'wall accepts ink');
      assert.equal(G.paint.sampleWorld(hit.face, hit.point), 0);
      G.projectiles.fireShooter(a, a.weapon, 0);
      for (let i = 0; i < 60; i++) { G.time += 1 / 60; G.projectiles.update(1 / 60); G.paint.advanceSimulation(1 / 60); }
      assert.equal(G.paint.sampleWorld(hit.face, hit.point), 1, 'real projectile leaves friendly ink on the wall');
      G.projectiles.clear(); G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});

const routes = [
  { stage: 'tidewater', label: 'terrace through market to bridge', points: [[-24, 2.4, -34], [-32, 2.4, -34], [-32, 2.4, -30], [-32, 4.8, -18], [-32, 4.8, -17.2], [-28, 4.8, -17.2], [-28, 4.8, -10], [-27, 4.8, -3], [-16, 4.8, -3]], grate: true },
  { stage: 'kelpline', label: 'raised boarding route to side grate', points: [[0, 3.6, -38], [-6, 3.6, -38], [-6, 3.6, -14], [-20, 3.6, -14], [-26, 3.6, -16], [-26, 3.6, -25]], grate: true },
  { stage: 'kelpline', label: 'covered lower service lane', points: [[-26, 1.2, -38], [-26, 1.2, -34], [-26, 0, -28], [-26, 0, -26], [-18, 0, -26], [-18, 0, -16], [-8, 0, -12], [-8, 0, -4]] },
];
for (const route of routes) test(`${route.stage}: real Actor traverses ${route.label}`, async () => {
  const { f, kit } = await world(route.stage), { G } = f;
  try {
    for (const mirror of [1, -1]) for (const hz of [30, 60, 120]) {
      const a = f.make('shooter'); a._integrate = f.Actor.prototype._integrate;
      const point = p => new f.THREE.Vector3(p[0] * mirror, p[1], p[2] * mirror);
      a.pos.copy(point(route.points[0]));
      let sawGrate = false;
      for (const raw of route.points.slice(1)) {
        const goal = point(raw); let reached = false;
        for (let i = 0; i < hz * 10; i++) {
          const dx = goal.x - a.pos.x, dz = goal.z - a.pos.z;
          if (Math.hypot(dx, dz) < .65 && Math.abs(goal.y - a.pos.y) < .4) { reached = true; break; }
          a.intent.move.set(dx, 0, dz).normalize(); G.time += 1 / hz; a.update(1 / hz);
          sawGrate ||= a.grounded && a.ground.grate;
          assert(a.alive && Number.isFinite(a.pos.length()));
        }
        assert(reached, `${route.label}, mirror=${mirror}, ${hz}Hz: failed to reach ${goal.toArray()}, stopped at ${a.pos.toArray()}`);
      }
      if (route.grate) assert(sawGrate, 'kid actually contacted the connecting grate');
      G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});

test('Kelpline: the new overpass grate cannot be inked and a real shot passes through to the lower floor', async () => {
  const { f, kit } = await world('kelpline'), { G } = f;
  try {
    f.setRandom(() => .5);
    for (const mirror of [1, -1]) {
      const a = f.make('shooter'); a.pos.set(-26 * mirror, 3.8, -25 * mirror);
      a.character.root.position.copy(a.pos);
      const origin = a.pos.clone().add(new f.THREE.Vector3(0, 1.05, .3));
      a.aimDir.set(0, -1, 0); a.aimPoint.copy(origin).add(new f.THREE.Vector3(0, -5, 0));
      const grate = G.physics.raycast(origin, a.aimDir, 5);
      const floor = G.physics.raycast(origin, a.aimDir, 5, new f.Hit(), true);
      assert(grate.hit && G.level.blocks[grate.block].tag === `${mirror === 1 ? 'A' : 'B'}_boarding_grate`);
      assert(!G.level.faces[grate.face].paintable, 'grate has no paintable face');
      assert(floor.hit && floor.point.y < .1, 'shot collision skips grate and sees the lower floor');
      assert.equal(G.paint.sampleWorld(floor.face, floor.point), 0);
      G.projectiles.fireShooter(a, a.weapon, 0);
      for (let i = 0; i < 60; i++) { G.time += 1 / 60; G.projectiles.update(1 / 60); G.paint.advanceSimulation(1 / 60); }
      assert.equal(G.paint.sampleWorld(grate.face, grate.point), 0, 'grate remains unpainted');
      assert.equal(G.paint.sampleWorld(floor.face, floor.point), 1, 'real shot inks floor below');
      G.projectiles.clear(); G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});

for (const scenario of [
  { stage: 'tidewater', faceX: -4, z: 0, base: 0, top: 2.4, tag: 'mid_screen' },
  { stage: 'kelpline', faceX: 12, z: -38, base: 2.4, top: 3.6, tag: 'boarding_rear' },
]) test(`${scenario.stage}: squid climbs an inked new wall onto the platform`, async () => {
  const { f, kit } = await world(scenario.stage), { G } = f;
  try {
    for (const mirror of [1, -1]) for (const hz of [30, 60, 120]) {
      const wall = new f.THREE.Vector3(scenario.faceX * mirror, (scenario.base + scenario.top) / 2, scenario.z * mirror);
      const ray = G.physics.raycast(wall.clone().add(new f.THREE.Vector3(1 * mirror, 0, 0)), new f.THREE.Vector3(-mirror, 0, 0), 2);
      assert(ray.hit && G.level.faces[ray.face].paintable);
      assert.equal(G.level.blocks[ray.block].tag, `${mirror === 1 ? 'A' : 'B'}_${scenario.tag}`, 'ink and climb the intended authored wall');
      G.paint.splat(wall, 2, 0, { face: ray.face, instant: true, seed: .5 });
      for (const y of [scenario.base + .3, scenario.base + .85, scenario.top - .1]) {
        assert.equal(G.paint.sampleWorld(ray.face, new f.THREE.Vector3(wall.x, y, wall.z)), 1, `wall ink at y=${y}`);
      }
      const a = f.make('shooter'); a._integrate = f.Actor.prototype._integrate;
      a.pos.set((scenario.faceX + .7) * mirror, scenario.base, scenario.z * mirror);
      a.intent.squid = true; a.intent.move.set(-mirror, 0, 0);
      let climbed = false, reached = false;
      for (let i = 0; i < hz * 6; i++) {
        G.time += 1 / hz; a.update(1 / hz); climbed ||= a.climbing;
        if (a.grounded && a.pos.y >= scenario.top - .15 && (a.pos.x * mirror) < scenario.faceX - .1) { reached = true; break; }
      }
      assert(climbed && reached, `mirror=${mirror}, ${hz}Hz: climbed=${climbed}, stopped at ${a.pos.toArray()}`);
      G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});
