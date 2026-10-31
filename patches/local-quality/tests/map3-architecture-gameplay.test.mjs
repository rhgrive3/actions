import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitMainShot } from '../../splatoon3/tests/source-fixture.mjs';

// These checks exercise the composed movement, real Level/Physics and new
// connected streets. Friendly ink is the prescribed locomotion condition;
// render/audio/character pose are fixture boundaries, not device evidence.
const extraExports = `
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
  export { NavGraph } from './inkwave-public/src/game/nav.js';
`;
let cached;
async function api() {
  return cached ||= fixture({ fullRuntime: true, productionComposition: true, extraExports });
}
function world(f, id) {
  const layout = f.MAP_LAYOUTS[id], level = new f.Level(layout, f.map3ArtColliders(layout));
  assert.ok(layout.map3Architecture, `${id}: playable architecture is installed`);
  return { layout, level, physics: new f.Physics(level), architecture: layout.map3Architecture };
}
function* samples(points, spacing = .25) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const count = Math.max(1, Math.ceil(Math.hypot(...b.map((n, k) => n - a[k])) / spacing));
    for (let j = i === 1 ? 0 : 1; j <= count; j++) yield a.map((n, k) => n + (b[k] - n) * j / count);
  }
}

test('new connected streets have solid support and human/squid clearance over the entire authored routes', async t => {
  const f = await api();
  let routes = 0, count = 0;
  for (const id of ['tidewater', 'kelpline']) {
    const { architecture, physics } = world(f, id);
    assert.ok(architecture.routes.length >= 4, `${id}: additions must connect multiple routes on both halves`);
    for (const route of architecture.routes) {
      routes++;
      assert.ok(route.points.length >= 3, `${id}/${route.id}: an actual connected route is required`);
      for (const point of samples(route.points)) {
        count++;
        const position = new f.THREE.Vector3(...point);
        const hit = physics.raycast(position.clone().add(new f.THREE.Vector3(0, .15, 0)),
          new f.THREE.Vector3(0, -1, 0), .3, new f.Hit());
        assert.ok(hit.hit && hit.normal.y >= .68 && Math.abs(hit.point.y - point[1]) < 1e-6,
          `${id}/${route.id}: missing actual support ${point}`);
        for (const [radius, lift, height, squid] of [[.35, .35, 1.45, false], [.675, .16, 1.6, true]]) {
          assert.ok(physics.bodyFits(position, radius, lift, height, squid),
            `${id}/${route.id}: body blocked at ${point} (squid=${squid})`);
        }
      }
    }
  }
  t.diagnostic(`${routes} added routes / ${count} sampled supports with human and conservative squid clearance.`);
});

test('composed Actor traverses the added connections while walking, swimming and firing at 30/60/120 Hz', async t => {
  const f = await api(), { G, THREE } = f;
  let traversals = 0, ticks = 0, maximumHeightError = 0;
  for (const id of ['tidewater', 'kelpline']) {
    const { level, physics, architecture } = world(f, id);
    G.level = level; G.physics = physics;
    for (const mode of ['walk', 'swim', 'fire']) for (const hz of [30, 60, 120]) for (const route of architecture.routes) {
      const actor = f.make('shooter');
      delete actor._integrate;
      actor.team = route.team === 'B' ? 1 : 0;
      G.actors = [actor];
      G.paint.sample = () => actor.team + 1;
      actor.intent.squid = mode === 'swim'; actor.intent.fire = mode === 'fire';
      actor.spawnAt(new THREE.Vector3(...route.points[0]), 0);
      let target = 1, elapsed = 0;
      const length = route.points.slice(1).reduce((sum, point, i) => sum + Math.hypot(...point.map((n, k) => n - route.points[i][k])), 0);
      while (target < route.points.length && elapsed < length / 2 + 15) {
        const goal = route.points[target], dx = goal[0] - actor.pos.x, dz = goal[2] - actor.pos.z, distance = Math.hypot(dx, dz);
        if (distance < .18) {
          const error = Math.abs(actor.pos.y - goal[1]); maximumHeightError = Math.max(maximumHeightError, error);
          assert.ok(error < .3, `${id}/${route.id}/${mode}/${hz}: wrong storey ${actor.pos.toArray()} for ${goal}`);
          target++; continue;
        }
        const magnitude = Math.min(1, distance / 1.2);
        actor.intent.move.set(dx / distance * magnitude, 0, dz / distance * magnitude);
        G.time += 1 / hz; actor.update(1 / hz); elapsed += 1 / hz; ticks++;
        assert.ok(actor.alive && Number.isFinite(actor.pos.y) && actor.pos.y > -1.4,
          `${id}/${route.id}/${mode}/${hz}: fell at ${actor.pos.toArray()}`);
      }
      assert.equal(target, route.points.length,
        `${id}/${route.id}/${mode}/${hz}: blocked at ${actor.pos.toArray()} before ${route.points[target]}`);
      traversals++;
    }
  }
  t.diagnostic(`${traversals} composed Actor traversals / ${ticks} ticks; maximum waypoint height error ${maximumHeightError.toFixed(5)} WU.`);
});

test('every added floor has a retained navigation node and real paths to and from both spawns', async t => {
  const f = await api();
  let queries = 0;
  for (const id of ['tidewater', 'kelpline']) {
    const { architecture, level, physics, layout } = world(f, id), nav = new f.NavGraph(level, physics);
    const homes = layout.map3.spawns.map(s => nav.nearest(new f.THREE.Vector3(...s.point)));
    for (const floor of architecture.floors) {
      const node = nav.nodes.find(n => nav.valid[n.id] && Math.abs(n.y - floor.y) < 1e-6 &&
        n.x > floor.rect[0] && n.x < floor.rect[1] && n.z > floor.rect[2] && n.z < floor.rect[3]);
      assert.ok(node, `${id}/${floor.id}: usable floor requires a real navigation node`);
      for (let team = 0; team < 2; team++) for (const [from, to] of [[homes[team], node.id], [node.id, homes[team]]]) {
        assert.ok(nav.path(from, to, team), `${id}/${floor.id}: new floor disconnected for team ${team}`);
        queries++;
      }
    }
    t.diagnostic(`${id}: ${nav.validIds.length} retained navigation nodes, including every added floor.`);
  }
  t.diagnostic(`${queries} directed new-floor/spawn navigation queries.`);
});

test('new architectural walls interrupt actual shot sightlines that were open in the frozen blockout', async t => {
  const f = await api();
  let blocked = 0;
  for (const id of ['tidewater', 'kelpline']) {
    const { layout, architecture, physics } = world(f, id);
    const addedTags = new Set([...architecture.floors, ...architecture.ramps, ...architecture.walls].map(x => x.id));
    const baselineLayout = { ...layout, single: layout.single.filter(b => !addedTags.has(b.tag)), map3Architecture: null, map3Playable: layout.map3 };
    const baseline = new f.Physics(new f.Level(baselineLayout, f.map3ArtColliders(baselineLayout)));
    for (const sightline of architecture.sightlines) for (const mirror of [1, -1]) {
      const position = point => new f.THREE.Vector3(point[0] * mirror, point[1], point[2] * mirror);
      const origin = position(sightline.from), destination = position(sightline.to), delta = destination.clone().sub(origin), length = delta.length();
      delta.normalize();
      const former = baseline.raycast(origin, delta, length, new f.Hit());
      assert.equal(former.hit, false, `${id}/${sightline.id}: negative control must be an originally open line`);
      const hit = physics.raycast(origin, delta, length, new f.Hit());
      const expected = mirror === 1 ? sightline.wallId : sightline.wallId.replace(/^A_/, 'B_');
      assert.ok(hit.hit && layout.single.some(b => b.tag === expected), `${id}/${sightline.id}: wall must exist and interrupt this line`);
      assert.equal(physics.level.blocks[hit.block].tag, expected, `${id}/${sightline.id}: hit the intended solid wall`);
      assert.equal(physics.level.faces[hit.face].paintable, true, 'cover wall must accept ink');
      blocked++;
    }
  }
  t.diagnostic(`${blocked} formerly open, mirrored sightlines now end at a paintable physical wall.`);
});

// Independently chosen attack/approach points, rather than corners taken from
// the wall implementation. The fixture muzzle/pose remains a known boundary;
// admission, projectile travel, Level raycasts and CPU ink ownership are real.
const WALLS = [
  { stage: 'tidewater', tag: 'east_forecourt_screen', start: [7, 1.2, -40], face: [7, 2.9, -42.6], normal: [0, 0, 1], base: 1.2, top: 4.6 },
  { stage: 'kelpline', tag: 'central_transfer_divider', start: [-1, 3.6, -5], face: [-2.6, 5.3, -5], normal: [1, 0, 0], base: 3.6, top: 7 },
];
let cachedPaint;
async function paintApi() {
  return cachedPaint ||= fixture({ fullRuntime: true, realProjectiles: true, productionComposition: true, extraExports });
}
function inkWorld(f, id) {
  const w = world(f, id), { G } = f;
  G.level = w.level; G.physics = w.physics; G.actors = []; G.match.mode = 'turf';
  class CpuPaint extends f.PaintSystem {
    _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; }
    _pushQuad() {} _drawQuads() {}
  }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 2048, maxDensity: 4, cell: .25 });
  G.projectiles.clear();
  return w;
}

test('the installed weapon admission and real projectiles paint the new cover walls on both halves', async t => {
  const f = await paintApi(), { G, THREE } = f;
  f.setRandom(() => .5);
  let impacts = 0;
  for (const scenario of WALLS) {
    inkWorld(f, scenario.stage);
    for (const mirror of [1, -1]) {
      const actor = f.make('shooter'); actor.team = 0;
      actor.pos.set(scenario.start[0] * mirror, scenario.start[1], scenario.start[2] * mirror);
      actor.character.root.position.copy(actor.pos);
      const origin = actor.pos.clone().add(new THREE.Vector3(0, 1.05, .3));
      const target = new THREE.Vector3(scenario.face[0] * mirror, scenario.base + 1.05, scenario.face[2] * mirror);
      actor.aimDir.copy(target).sub(origin).normalize(); actor.aimPoint.copy(target);
      // Actor.update owns the vector from yaw/pitch; setting aimDir alone
      // would be replaced by its default forward angle during admission.
      actor.aimYaw = Math.atan2(actor.aimDir.x, actor.aimDir.z);
      actor.aimPitch = Math.asin(actor.aimDir.y);
      const hit = G.physics.raycast(origin, actor.aimDir, 4, new f.Hit());
      assert.ok(hit.hit && G.level.faces[hit.face].paintable);
      assert.equal(G.level.blocks[hit.block].tag, `${mirror === 1 ? 'A' : 'B'}_${scenario.tag}`);
      assert.equal(G.paint.sampleWorld(hit.face, hit.point), 0);
      emitMainShot(f, actor);
      for (let i = 0; i < 60; i++) { G.time += 1 / 60; G.projectiles.update(1 / 60); G.paint.advanceSimulation(1 / 60); }
      assert.equal(G.paint.sampleWorld(hit.face, hit.point), 1, `${scenario.stage}: real admitted round inks the new wall`);
      impacts++; G.projectiles.clear(); G.actors = [];
    }
  }
  t.diagnostic(`${impacts} admitted-projectile impacts produce ink on the new cover faces.`);
});

test('inked architectural cover can be climbed and crested by the actual squid controller at 30/60/120 Hz', async t => {
  const f = await paintApi(), { G, THREE } = f;
  let climbs = 0;
  for (const scenario of WALLS) {
    inkWorld(f, scenario.stage);
    for (const mirror of [1, -1]) for (const hz of [30, 60, 120]) {
      const face = new THREE.Vector3(scenario.face[0] * mirror, scenario.face[1], scenario.face[2] * mirror);
      const normal = new THREE.Vector3(scenario.normal[0] * mirror, 0, scenario.normal[2] * mirror);
      const hit = G.physics.raycast(face.clone().add(normal), normal.clone().negate(), 2, new f.Hit());
      assert.ok(hit.hit && G.level.faces[hit.face].paintable);
      assert.equal(G.level.blocks[hit.block].tag, `${mirror === 1 ? 'A' : 'B'}_${scenario.tag}`);
      G.paint.splat(face, 3, 0, { face: hit.face, instant: true, seed: .5 });
      for (const y of [scenario.base + .3, scenario.base + .85, scenario.top - .1]) {
        assert.equal(G.paint.sampleWorld(hit.face, new THREE.Vector3(face.x, y, face.z)), 1);
      }
      const actor = f.make('shooter'); delete actor._integrate;
      actor.pos.copy(face).addScaledVector(normal, .7); actor.pos.y = scenario.base;
      actor.intent.squid = true; actor.intent.move.copy(normal).negate();
      G.actors = [actor];
      let climbed = false, crested = false;
      for (let i = 0; i < hz * 6; i++) {
        G.time += 1 / hz; actor.update(1 / hz); climbed ||= actor.climbing;
        const behindFace = actor.pos.clone().sub(face).dot(normal) < -.1;
        if (actor.grounded && actor.pos.y >= scenario.top - .15 && behindFace) { crested = true; break; }
      }
      assert.ok(climbed && crested,
        `${scenario.stage}/${mirror}/${hz}: climbed=${climbed} crested=${crested}, stopped at ${actor.pos.toArray()}`);
      climbs++; G.actors = [];
    }
  }
  t.diagnostic(`${climbs} wall climbs reach the supported wall top under real Actor movement.`);
});

test('new wall approaches leave CameraRig lens and near plane outside solids through turns and jumps', async t => {
  const f = await api(), { G, THREE, CameraRig } = f;
  G.settings = { fov: 82, cameraShake: 0 }; G.mode = 'match';
  let scenarios = 0;
  for (const scenario of WALLS) {
    const { level, physics } = world(f, scenario.stage); G.level = level; G.physics = physics;
    for (const mirror of [1, -1]) for (const hz of [30, 60, 120]) for (const pitch of [-.8, 0, .9]) {
      const position = new THREE.Vector3(scenario.start[0] * mirror, scenario.start[1], scenario.start[2] * mirror);
      const actor = f.make('shooter'); delete actor._integrate;
      G.actors = [actor]; G.paint.sample = () => 1;
      actor.spawnAt(position, 0);
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, .15, 6500), rig = new CameraRig(camera);
      rig.follow(actor, true); rig.pitch = pitch;
      let jumped = false;
      for (let i = 0; i < hz * 3; i++) {
        actor.intent.jump = i === hz;
        G.time += 1 / hz; actor.update(1 / hz); actor.anim.form = actor.form;
        jumped ||= actor.pos.y > position.y + .1;
        rig.yaw = i / hz * Math.PI; rig.update(1 / hz);
        assert.ok(camera.position.toArray().every(Number.isFinite));
        const points = [camera.position, ...[[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, y]) => new THREE.Vector3(x, y, -1).unproject(camera))];
        for (const point of points) {
          const block = level.blocks.find(b => b.solid && !b.grate && level.pointInBlock(b, point, -.005));
          assert.equal(block, undefined,
            `${scenario.stage}/${mirror}/${hz}/${pitch}: camera enters ${block?.tag} at ${point.toArray()}`);
        }
      }
      assert.ok(jumped, 'the approach is tested through an actual jump, not a static camera');
      scenarios++; G.actors = [];
    }
  }
  t.diagnostic(`${scenarios} mirrored new-wall camera scenarios, including near-plane corners and jumps.`);
});

test('new circulation preserves actual opposing-spawn exclusion on both sides at 30/60/120 Hz', async t => {
  const f = await api(), { G, THREE } = f;
  let attempts = 0;
  for (const id of ['tidewater', 'kelpline']) {
    const { level, physics } = world(f, id); G.level = level; G.physics = physics;
    for (const team of [0, 1]) for (const hz of [30, 60, 120]) {
      const actor = f.make('shooter'); delete actor._integrate;
      actor.team = team; G.actors = [actor]; G.paint.sample = () => team + 1;
      const pad = level.spawnPads[1 - team];
      actor.spawnAt(new THREE.Vector3(pad.x + 5.6, pad.y, pad.z), 0);
      actor.intent.move.set(-1, 0, 0);
      for (let i = 0; i < hz * 2; i++) {
        G.time += 1 / hz; actor.update(1 / hz);
        assert.ok(actor.alive && actor.pos.y > pad.y - 1, 'test stays at the protected spawn height');
        assert.ok(Math.hypot(actor.pos.x - pad.x, actor.pos.z - pad.z) >= level.spawnBarrier + f.PLAYER.radius - 1e-5,
          `${id}/team${team}/${hz}: actual movement entered opposing spawn`);
      }
      attempts++; G.actors = [];
    }
  }
  t.diagnostic(`${attempts} opposing-spawn approach attempts retain the existing exclusion volume.`);
});
