import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const extraExports = `
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { dressingFor } from './inkwave-public/src/world/dressing.js';
  export { PropKit } from './inkwave-public/src/world/props.js';
  export { NavGraph } from './inkwave-public/src/game/nav.js';
`;

async function world(stage) {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, productionComposition: true, adaptRuntime: adaptBuildSource, extraExports });
  const { G } = f;
  const kit = new f.PropKit(null, { headless: true });
  const colliders = f.dressingFor(stage).flatMap(p => kit.add(p.type, p).colliders);
  G.level = new f.Level(f.MAP_LAYOUTS[stage], colliders);
  G.physics = new f.Physics(G.level);
  G.nav = new f.NavGraph(G.level, G.physics);
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; } _pushQuad() {} _drawQuads() {} }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 2048, maxDensity: 4, cell: .25 });
  G.match.mode = 'turf';
  return { f, kit };
}

// These routes exercise new raised terrain, including the actual transition
// from the yard through a ramp onto its platform, on both mirrored halves.
const ramps = [
  { stage: 'tidewater', label: 'west terrace', from: [-24.5, 0, -35.5], to: [-24.5, 2.2, -28.5] },
  { stage: 'tidewater', label: 'east terrace', from: [23.5, 0, -33.3], to: [23.5, 1.8, -25] },
  { stage: 'kelpline', label: 'rear loading dock', from: [-28.5, 0, -64.5], to: [-28.5, 1.8, -58] },
  { stage: 'kelpline', label: 'yard shelf', from: [-8.5, 0, -50.5], to: [-8.5, 1.6, -43.5] },
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
      a.pos.set(27 * mirror, 2.2, -28 * mirror);
      for (let i = 0; i < 60; i++) { G.time += 1 / 60; a.update(1 / 60); }
      assert(a.grounded && a.ground.grate && Math.abs(a.pos.y - 2.2) < .1, 'kid stands on the grate');
      a.intent.squid = true;
      let fell = false;
      for (let i = 0; i < 120; i++) {
        G.time += 1 / 60; a.update(1 / 60);
        if (a.pos.y < 1.5) { fell = true; break; }
      }
      assert.equal(a.form, 'squid');
      assert(fell, 'squid passes through the grate');
      G.actors.splice(G.actors.indexOf(a), 1);
    }
  } finally { kit.dispose(); }
});

for (const scenario of [
  { stage: 'tidewater', start: [-19, 0, -25], aim: [-21, 1.05, -25], tag: 'plaza-west-terrace' },
  { stage: 'kelpline', start: [-23, 0, -58], aim: [-25, 1.05, -58], tag: 'terminal-rear-dock' },
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
      assert(hit.hit && G.level.blocks[hit.block].tag === scenario.tag, 'shot has an unobstructed horizontal approach to the intended wall');
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
  { stage: 'tidewater', label: 'terrace to overlook', points: [[-24.5, 0, -35.5], [-24.5, 2.2, -29], [-24, 2.2, -20], [-26, 2.2, -18], [-26, 1.4, -9]] },
  { stage: 'kelpline', label: 'raised loading route', points: [[28.5, 0, -51.5], [27, 2.2, -44], [27, 2.2, -33], [27, 2.2, -28], [27, 2.2, -24]], grate: true },
  { stage: 'kelpline', label: 'covered lower lane', points: [[27, 0, -44], [27, 0, -38.5], [27, 0, -31.5], [27, 0, -27.5]] },
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
      const a = f.make('shooter'); a.pos.set(27 * mirror, 3, -28 * mirror);
      a.character.root.position.copy(a.pos);
      const origin = a.pos.clone().add(new f.THREE.Vector3(0, 1.05, .3));
      a.aimDir.set(0, -1, 0); a.aimPoint.copy(origin).add(new f.THREE.Vector3(0, -5, 0));
      const grate = G.physics.raycast(origin, a.aimDir, 5);
      const floor = G.physics.raycast(origin, a.aimDir, 5, new f.Hit(), true);
      assert(grate.hit && G.level.blocks[grate.block].tag === 'terminal-overpass-grate');
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
  { stage: 'tidewater', faceX: -21, z: -25, top: 2.2 },
  { stage: 'kelpline', faceX: -25, z: -58, top: 1.8 },
]) test(`${scenario.stage}: squid climbs an inked new wall onto the platform`, async () => {
  const { f, kit } = await world(scenario.stage), { G } = f;
  try {
    for (const mirror of [1, -1]) for (const hz of [30, 60, 120]) {
      const wall = new f.THREE.Vector3(scenario.faceX * mirror, scenario.top / 2, scenario.z * mirror);
      const ray = G.physics.raycast(wall.clone().add(new f.THREE.Vector3(1 * mirror, 0, 0)), new f.THREE.Vector3(-mirror, 0, 0), 2);
      assert(ray.hit && G.level.faces[ray.face].paintable);
      G.paint.splat(wall, 2, 0, { face: ray.face, instant: true, seed: .5 });
      for (const y of [.3, .85, scenario.top - .1]) {
        assert.equal(G.paint.sampleWorld(ray.face, new f.THREE.Vector3(wall.x, y, wall.z)), 1, `wall ink at y=${y}`);
      }
      const a = f.make('shooter'); a._integrate = f.Actor.prototype._integrate;
      a.pos.set((scenario.faceX + .7) * mirror, 0, scenario.z * mirror);
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
