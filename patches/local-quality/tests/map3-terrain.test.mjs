import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const plain = value => JSON.parse(JSON.stringify(value));
let cachedWorld;
async function world() {
  if (cachedWorld) return cachedWorld;
  const context = vm.createContext({ console, performance }), modules = new Map();
  function load(requested) {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const module = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, module); return module;
  }
  const entry = new vm.SourceTextModule(`
    export { Level } from './src/world/level.js';
    export { MAP_LAYOUTS } from './src/world/maps.js';
    export { MAP3_STAGES, MAP3_SOURCE } from './src/world/stages/map3-data.js';
    export { map3ArtColliders } from './src/world/stages/map3-art.js';
    export { Physics, Hit, GroundHit } from './src/game/physics.js';
    export * as THREE from 'three';
  `, { context, identifier: path.join(SRC, 'map3-test-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice(13))
    : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const api = { ...entry.namespace };
  api.levels = Object.fromEntries(['tidewater', 'kelpline'].map(id => [id, new api.Level(api.MAP_LAYOUTS[id], api.map3ArtColliders(api.MAP_LAYOUTS[id]))]));
  return cachedWorld = api;
}

let cachedProduction;
async function production() {
  if (!cachedProduction) {
    const { fixture } = await import('../../splatoon3/tests/source-fixture.mjs');
    cachedProduction = fixture({ productionComposition: true, fullRuntime: true,
      extraExports: "export { NavGraph } from './inkwave-public/src/game/nav.js';" });
  }
  return cachedProduction;
}

function makeActor(api, team = 0) {
  const actor = api.make('shooter');
  delete actor._integrate; // Restore the composed Actor's real controller.
  actor.team = team;
  api.G.paint.sample = () => actor.team + 1;
  api.G.actors = [actor];
  return actor;
}

function* samples(points, step = .2) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], count = Math.ceil(Math.hypot(...b.map((x, k) => x - a[k])) / step);
    for (let j = i === 1 ? 0 : 1; j <= count; j++) yield a.map((x, k) => x + (b[k] - x) * j / count);
  }
}

test('ordinary public stages preserve every frozen MAP3 coordinate and contain no legacy base floor', async () => {
  const { MAP3_STAGES, MAP3_SOURCE, MAP_LAYOUTS, map3ArtColliders, levels } = await world();
  const bytes = fs.readFileSync(path.join(ROOT, 'docs/stage-redesign/map3/design.json'));
  const design = JSON.parse(bytes);
  assert.equal(MAP3_SOURCE.designSha256, createHash('sha256').update(bytes).digest('hex'));
  for (const source of design.stages) {
    const stage = MAP3_STAGES[source.id], layout = MAP_LAYOUTS[source.id], level = levels[source.id];
    assert.deepEqual(plain(stage), source);
    assert.equal(layout.map3, stage);
    assert.equal(layout.half.length, 0);
    const architecture = layout.map3Architecture;
    const extensionCount = architecture.floors.length + architecture.ramps.length + architecture.walls.length;
    assert.equal(level.blocks.length, stage.floors.length + stage.ramps.length + stage.obstacles.length + extensionCount + map3ArtColliders(layout).length);
    assert.equal(new Set(level.blocks.filter(b => b.tag).map(b => b.tag)).size, stage.floors.length + stage.ramps.length + stage.obstacles.length + extensionCount);
    assert.deepEqual(plain(level.spawnPads.map(p => p.toArray())), source.spawns.map(s => s.point));
    const heights = new Set(stage.floors.filter(f => f.material !== 'grate').map(f => f.y));
    assert.equal(heights.size, stage.id === 'tidewater' ? 5 : 6);
    for (const floor of stage.floors) {
      const b = level.blocks.find(b => b.tag === floor.id);
      assert.ok(b.aabbMin.toArray().every((n, i) => Math.abs(n - [floor.rect[0], floor.bottom, floor.rect[2]][i]) < 1e-9));
      assert.ok(Math.abs(b.aabbMax.y - floor.y) < 1e-9);
      assert.equal(b.grate, floor.material === 'grate');
      assert.equal(b.paint, floor.material !== 'grate');
    }
    assert.equal(level.groundHeight(stage.id === 'tidewater' ? 40 : 43, 0), -Infinity, 'open water has no invisible base slab');
  }
  assert.equal(MAP_LAYOUTS.range.map3, undefined);
  assert.equal(MAP_LAYOUTS.halyard.map3, undefined);
  assert.equal(MAP_LAYOUTS.cargo.map3, undefined);
});

test('real Level ramp OBBs retain exact tops and nominal vertical thickness including the low toe', async () => {
  const { MAP3_STAGES, levels, Physics, Hit, THREE } = await world();
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  for (const stage of Object.values(MAP3_STAGES)) {
    const level = levels[stage.id], physics = new Physics(level);
    for (const ramp of stage.ramps) {
      const b = level.blocks.find(b => b.tag === ramp.id), [x0, x1, z0, z1] = ramp.rect;
      assert.ok(b.axes[1].y >= .68, ramp.id);
      assert.ok(Math.abs(2 * b.half.y / b.axes[1].y - ramp.thickness) < 1e-9, ramp.id + ' vertical thickness');
      for (const t of [.02, .25, .5, .75, .98]) {
        const x = ramp.axis === 'x' ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
        const z = ramp.axis === 'z' ? z0 + (z1 - z0) * t : (z0 + z1) / 2;
        const y = ramp.y0 + (ramp.y1 - ramp.y0) * t;
        const top = physics.raycast(new THREE.Vector3(x, y + .3, z), down, .5, new Hit(), false, [b.id]);
        assert.ok(top.hit && Math.abs(top.point.y - y) < 1e-8, ramp.id + ' actual upper face');
        // Close to a tilted end cap the underside need not cover the same XZ.
        if (t === .5) {
          const bottom = physics.raycast(new THREE.Vector3(x, y - 1, z), up, 1, new Hit(), false, [b.id]);
          assert.ok(bottom.hit && Math.abs(bottom.point.y - (y - ramp.thickness)) < 1e-8, ramp.id + ' actual lower face');
        }
      }
      const run = ramp.axis === 'x' ? x1 - x0 : z1 - z0;
      assert.ok(Math.abs(b.half.z * 2 - Math.hypot(run, ramp.y1 - ramp.y0) - .6) < 1e-8, ramp.id + ' real R toe');
    }
  }
});

test('all 26 nominal routes have real support and body clearance, with independently selected lower/upper layers', async t => {
  const { MAP3_STAGES, levels, Physics, Hit, THREE } = await world();
  let count = 0, routes = 0;
  for (const stage of Object.values(MAP3_STAGES)) {
    const level = levels[stage.id], physics = new Physics(level), down = new THREE.Vector3(0, -1, 0);
    for (const route of stage.routes) {
      routes++;
      for (const p of samples(route.points)) {
        count++;
        const position = new THREE.Vector3(...p);
        const hit = physics.raycast(position.clone().add(new THREE.Vector3(0, .15, 0)), down, .3, new Hit());
        assert.ok(hit.hit && hit.normal.y >= .68 && Math.abs(hit.point.y - p[1]) < 1e-6,
          `${stage.id}/${route.id} actual support ${p}`);
        for (const [radius, lift, height, squid] of [[.35, .35, 1.45, false], [.675, .16, 1.6, true]]) {
          assert.ok(physics.bodyFits(position, radius, lift, height, squid),
            `${stage.id}/${route.id} body overlap r=${radius} ${p}`);
        }
      }
    }
    for (const drop of stage.drops) {
      const p = new THREE.Vector3(...drop.to);
      assert.ok(Math.abs(level.groundHeight(p.x, p.z, p.y + .1) - p.y) < 1e-8, drop.id + ' lower landing');
      assert.ok(physics.bodyFits(p, .675, .16, 1.6, true), drop.id + ' landing body');
    }
  }
  assert.equal(routes, 26);
  t.diagnostic(`${routes} routes / ${count} actual support + human/conservative-squid body samples`);
});

test('actual underpasses retain headroom and real grates distinguish human support from squid drops', async t => {
  const { levels, MAP3_STAGES, Physics, Hit, THREE } = await world();
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  for (const [id, probes] of Object.entries({
    tidewater: [[-25, 0, -12, 4.2], [-16, 0, -3, 4.2], [25, 0, 12, 4.2]],
    kelpline: [[-26, 1.2, -50, 4.2], [-18, 0, -16, 3], [7, 0, 0, 3]],
  })) {
    const level = levels[id], physics = new Physics(level);
    for (const [x, y, z, clearance] of probes) {
      const hit = physics.raycast(new THREE.Vector3(x, y + .01, z), up, 10, new Hit());
      assert.ok(hit.hit && Math.abs(hit.point.y - y - clearance) < 1e-8,
        `${id} underpass ${x},${y},${z}: ${hit.point.y - y} != ${clearance}`);
      assert.ok(physics.bodyFits(new THREE.Vector3(x, y, z), .675, .16, 1.6, true));
    }
    for (const floor of MAP3_STAGES[id].floors.filter(f => f.material === 'grate')) {
      const x = (floor.rect[0] + floor.rect[1]) / 2, z = (floor.rect[2] + floor.rect[3]) / 2;
      const origin = new THREE.Vector3(x, floor.y + .1, z);
      const human = physics.raycast(origin, down, 10, new Hit(), false);
      const squid = physics.raycast(origin, down, 10, new Hit(), true);
      assert.ok(human.hit && Math.abs(human.point.y - floor.y) < 1e-8 && level.blocks[human.block].grate);
      assert.ok(squid.hit && squid.point.y < floor.y - 3 && !level.blocks[squid.block].grate);
      assert.equal(level.blocks[human.block].paint, false);
    }
    t.diagnostic(`${id}: ${probes.length} measured underpasses; two grates have human support / distinct solid squid landings.`);
  }
});

test('composed Actor walks, swims and fires along MAP3 routes at 30/60/120 Hz through real Level and Physics', async t => {
  const { MAP3_STAGES, levels } = await world();
  const api = await production();
  const { G, Physics, THREE } = api;
  let completed = 0, ticks = 0, maximumError = 0;
  for (const stage of Object.values(MAP3_STAGES)) {
    G.level = levels[stage.id]; G.physics = new Physics(G.level); G.actors = [];
    for (const mode of ['walk', 'swim', 'fire']) for (const hz of [30, 60, 120]) for (const route of stage.routes) {
      // These two upper routes intentionally cross mesh; squid continuity there
      // is a drop and separately exercised below, not a walkable bridge claim.
      if (mode === 'swim' && stage.id === 'tidewater' && /^[AB]_market$/.test(route.id)) continue;
      const actor = makeActor(api, route.team === 'B' ? 1 : 0);
      actor.intent.squid = mode === 'swim';
      actor.intent.fire = mode === 'fire';
      actor.spawnAt(new THREE.Vector3(...route.points[0]), 0);
      G.actors = [actor];
      let target = 1, elapsed = 0;
      const length = route.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...p.map((x, k) => x - route.points[i][k])), 0);
      while (target < route.points.length && elapsed < length / 2 + 15) {
        const p = route.points[target], dx = p[0] - actor.pos.x, dz = p[2] - actor.pos.z, distance = Math.hypot(dx, dz);
        if (distance < .18) {
          const error = Math.abs(actor.pos.y - p[1]);
          maximumError = Math.max(maximumError, error);
          assert.ok(error < .3, `${stage.id}/${route.id}/${mode}/${hz} wrong layer at waypoint ${target}: ${actor.pos.toArray()} expected ${p}`);
          target++; continue;
        }
        // Full stick along most of each leg, proportional input near corners.
        // Only intent is authored: acceleration, braking, ground probes, body
        // pushes, slope following and gravity are production Actor behavior.
        const magnitude = Math.min(1, distance / 1.2);
        actor.intent.move.set(dx / distance * magnitude, 0, dz / distance * magnitude);
        G.time += 1 / hz; actor.update(1 / hz); elapsed += 1 / hz; ticks++;
        assert.ok(actor.alive && Number.isFinite(actor.pos.y) && actor.pos.y > -1.4,
          `${stage.id}/${route.id}/${mode}/${hz} route fall ${actor.pos.toArray()}`);
      }
      assert.equal(target, route.points.length,
        `${stage.id}/${route.id}/${mode}/${hz} stalled at ${target}: ${actor.pos.toArray()} target ${route.points[target]}`);
      completed++;
    }
  }
  assert.equal(completed, 228);
  t.diagnostic(`${completed} composed Actor traversals / ${ticks} simulation ticks; maximum waypoint height error ${maximumError.toFixed(5)} WU. Rendering/audio/ink sample are fixtures; no browser/Switch claim.`);
});

test('production NavGraph keeps every MAP3 floor reachable in both directions and resolves all route waypoints on their own layer', async t => {
  const { MAP3_STAGES, MAP_LAYOUTS, map3ArtColliders } = await world();
  const api = await production();
  const { NavGraph, Level, Physics, THREE } = api;
  let paths = 0, legacyMisses = 0;
  for (const stage of Object.values(MAP3_STAGES)) {
    const level = new Level(MAP_LAYOUTS[stage.id], map3ArtColliders(MAP_LAYOUTS[stage.id])), nav = new NavGraph(level, new Physics(level));
    const misses = [];
    assert.equal(level.layout.navPathMaxIter, 12000);
    const spawnNodes = stage.spawns.map(s => nav.nearest(new THREE.Vector3(...s.point)));
    for (const floor of stage.floors) {
      const node = nav.nodes.find(n => nav.valid[n.id] && Math.abs(n.y - floor.y) < 1e-8 &&
        n.x > floor.rect[0] && n.x < floor.rect[1] && n.z > floor.rect[2] && n.z < floor.rect[3]);
      assert.ok(node, `${stage.id}/${floor.id} has actual retained nav nodes`);
      for (let team = 0; team < 2; team++) {
        for (const [from, to, direction] of [[spawnNodes[team], node.id, 'out'], [node.id, spawnNodes[team], 'return']]) {
          if (!nav.path(from, to, team, 6000)) { misses.push({ floor: floor.id, team, direction }); legacyMisses++; }
          assert.ok(nav.path(from, to, team), `${stage.id}/${floor.id} ${direction} team ${team} fits production default budget`);
        }
        paths += 2;
      }
    }
    for (const route of stage.routes) {
      const nodes = route.points.map(p => nav.nearest(new THREE.Vector3(...p)));
      nodes.forEach((id, i) => {
        assert.ok(id >= 0, route.id + ' waypoint node');
        assert.ok(Math.abs(nav.nodes[id].y - route.points[i][1]) < .55, route.id + ' waypoint stays on intended floor');
      });
      for (let i = 1; i < nodes.length; i++) {
        assert.ok(nav.path(nodes[i - 1], nodes[i], route.team === 'B' ? 1 : 0), route.id + ' forward waypoint connection');
        assert.ok(nav.path(nodes[i], nodes[i - 1], route.team === 'B' ? 1 : 0), route.id + ' return waypoint connection');
        paths += 2;
      }
    }
    t.diagnostic(`${stage.id}: ${nav.validIds.length}/${nav.nodes.length} retained nodes; every floor has directed paths to/from both spawns. Legacy 6,000-budget misses now resolved: ${JSON.stringify(misses)}`);
  }
  assert.ok(legacyMisses >= 14, 'baseline sensitivity: original 6,000 budget misses measured remote routes');
  t.diagnostic(`${paths} successful directed A* queries; no claim that BotBrain follows every path without steering errors.`);
});

test('composed Actor drops through grates to the lower floor and dies over actual open water at 30/60/120 Hz', async t => {
  const { MAP3_STAGES, levels } = await world(), api = await production();
  const { G, Physics, THREE } = api;
  let landings = 0, waterDeaths = 0;
  for (const stage of Object.values(MAP3_STAGES)) {
    G.level = levels[stage.id]; G.physics = new Physics(G.level);
    for (const hz of [30, 60, 120]) {
      for (const drop of stage.drops.filter(d => /grate|mesh/.test(d.id))) {
        const a = makeActor(api, drop.id.startsWith('B_') ? 1 : 0);
        a.spawnAt(new THREE.Vector3(...drop.fromPoint), 0);
        assert.ok(a.grounded);
        for (let i = 0; i < hz / 2; i++) { G.time += 1 / hz; a.update(1 / hz); }
        assert.ok(Math.abs(a.pos.y - drop.fromPoint[1]) < 1e-6, 'human remains on grate');
        a.intent.squid = true;
        for (let i = 0; i < hz * 2; i++) { G.time += 1 / hz; a.update(1 / hz); }
        assert.ok(a.alive && a.grounded && Math.abs(a.pos.y - drop.to[1]) < 1e-6, `${stage.id}/${drop.id}/${hz} real squid landing`);
        assert.ok(Math.hypot(a.pos.x - drop.to[0], a.pos.z - drop.to[2]) < .05);
        landings++;
      }
      const a = makeActor(api);
      a.spawnAt(new THREE.Vector3(stage.id === 'tidewater' ? 40 : 43, 1, 0), 0);
      for (let i = 0; i < hz * 2 && a.alive; i++) { G.time += 1 / hz; a.update(1 / hz); }
      assert.equal(a.alive, false, stage.id + ' open water is lethal');
      assert.equal(a.stats.deaths, 1);
      waterDeaths++;
    }
  }
  t.diagnostic(`${landings} real grate landings and ${waterDeaths} actual open-water deaths.`);
});

test('production CameraRig underpasses keep lens and near plane out of solids during grounded turns, looking and jumps', async t => {
  const { levels } = await world(), api = await production();
  const { G, Physics, THREE, CameraRig } = api;
  G.settings = { fov: 82, cameraShake: 0 }; G.mode = 'match';
  const failures = [], cases = [];
  for (const [id, places] of Object.entries({
    tidewater: [[-25, 0, -12], [-16, 0, -3]],
    kelpline: [[-26, 1.2, -50], [-18, 0, -16], [7, 0, 0], [-20.8, 1.2, -51.5]],
  })) {
    G.level = levels[id]; G.physics = new Physics(G.level);
    for (const hz of [30, 60, 120]) for (const place of places) for (const pitch of [-.8, 0, .9]) {
      const a = makeActor(api); a.spawnAt(new THREE.Vector3(...place), 0);
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, .15, 6500), rig = new CameraRig(camera);
      rig.follow(a, true); rig.pitch = pitch;
      let caseFailed = false, jumped = false;
      for (let i = 0; i < hz * 3; i++) {
        a.intent.jump = i === hz;
        G.time += 1 / hz; a.update(1 / hz);
        a.anim.form = a.form;
        jumped ||= a.pos.y > place[1] + .1;
        rig.yaw = (i / hz) * Math.PI; rig.update(1 / hz);
        assert.ok(camera.position.toArray().every(Number.isFinite));
        const points = [camera.position, ...[[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, y]) => new THREE.Vector3(x, y, -1).unproject(camera))];
        if (!caseFailed) for (const p of points) {
          const block = G.level.blocks.find(b => b.solid && !b.grate && G.level.pointInBlock(b, p, -.005));
          if (block) {
            failures.push({ id, hz, place, pitch, time: i / hz, actor: a.pos.toArray(), pivot: rig.pivot.toArray(), lens: camera.position.toArray(), point: p.toArray(), block: block.tag });
            caseFailed = true; break;
          }
        }
      }
      assert.ok(jumped, `${id}/${place}/${hz} actual jump occurred`);
      cases.push({ id, hz, place, pitch });
    }
  }
  t.diagnostic(`${cases.length} camera scenarios; ${failures.length} with geometry intersection. First failures: ${JSON.stringify(failures.slice(0, 5))}`);
  assert.equal(failures.length, 0, 'CameraRig lens/near-plane cannot enter solid MAP3 geometry');
});
