import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture, readStage} from './fixture.mjs';
import {convertSource} from '../runtime/source-convert.mjs';

const root = process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const definition = JSON.parse(fs.readFileSync(new URL('../definitions/undertow.json', import.meta.url)));

test('Undertow browser worker conversion equals local source conversion', {skip: !root || !process.env.INKWAVE_NATIVE_STAGE_SOURCE}, () => {
  const source = path.join(process.env.INKWAVE_NATIVE_STAGE_SOURCE, definition.internal);
  const files = Object.fromEntries(fs.readdirSync(path.join(source, 'textures')).map(name => ['textures/' + name, {}]));
  const data = convertSource(definition, fs.readFileSync(path.join(source, definition.internal + '.obj'), 'utf8'), fs.readFileSync(path.join(source, definition.internal + '.mtl'), 'utf8'), files);
  for (const [key, file] of [['vertices', 'vertices'], ['indices', 'indices'], ['triangles', 'collision'], ['normals', 'normals'], ['flags', 'flags'], ['objectIds', 'objects'], ['triangleFace', 'triangleFace'], ['mask', 'mask']]) {
    assert.deepEqual(Buffer.from(data[key].buffer), fs.readFileSync(path.join(root, 'undertow', file + '.bin')), key);
  }
  const order = Array.from(data.order).sort((a, b) => a - b);
  assert.ok(order.every((id, i) => id === i), 'BVH includes every collision triangle exactly once');
  assert.equal(data.manifest.version1130Verified, false);
});

test('Undertow uses revised Pnt/common source surfaces and mutually reachable supported spawns', {skip: !root}, async () => {
  const f = await nativeFixture(), {G, THREE, PLAYER} = f;
  const data = readStage(root, 'undertow'), level = new f.NativeLevel(data), physics = new f.NativePhysics(level);
  assert.equal(data.manifest.internal, 'Vss_Temple01');
  assert.equal(data.manifest.sourceSha256, definition.sourceSha256);
  assert.equal(data.manifest.version1130Verified, false);
  assert.deepEqual(data.manifest.bounds, definition.bounds);
  assert.deepEqual(data.manifest.spawnPads, definition.spawnPads);
  assert.equal(data.manifest.geometry.vertices, 375948);
  assert.equal(data.manifest.geometry.triangles, 259698);
  assert.ok(data.manifest.objects.some(o => /_VarSet_/.test(o.name)), 'keep source rule variants in exact render buffers');
  for (const o of data.manifest.objects) {
    if (/_(Var|Vlf|Vgl|Vcl|Tcl)Set_/.test(o.name)) {
      assert.equal(o.active, false, o.name);
      assert.equal(o.collidable, false, o.name);
      assert.equal(o.paintable, false, o.name);
    }
    if (o.name.startsWith('Fld_BG')) assert.equal(o.collidable, false, o.name);
  }
  G.level = level;
  G.physics = physics;
  class CpuPaint extends f.PaintSystem {_initGPU() {this.quads = 0;} _pushQuad() {}}
  G.paint = new CpuPaint(null, level, {atlasSize: 2048, maxDensity: 4, cell: .25});
  assert.ok(data.manifest.chartMaxPlaneError < .005);
  const support = [];
  for (const pad of level.spawnPads) {
    const h = physics.raycast(pad.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, -1, 0), 4);
    assert.ok(h.hit && h.normal.y > .68, 'upward source support at each pad');
    assert.ok(Math.abs(h.point.y - pad.y) < .12);
    assert.ok(physics.bodyFits(h.point.clone().setY(h.point.y + .01), PLAYER.radius + .04, .32, PLAYER.height, false, .01));
    const object = data.manifest.objects[level.triangleWorld.objectIds[h.triangle]];
    assert.ok(object.active && object.paintable);
    const claimed = G.paint.splat(h.point.clone().addScaledVector(h.normal, .03), 1.5, 0, {seed: .125, instant: true});
    assert.ok(claimed > 0);
    assert.equal(G.paint.sample(h.face, h.u, h.v), 1);
    support.push({position: h.point.toArray(), object: object.name, triangle: h.triangle});
  }
  for (let k = 0; k < G.paint.grid.length; k++) if (G.paint.dead[k]) assert.equal(G.paint.grid[k], 0, 'masked cells stay unowned');

  let wall = null;
  for (const face of level.faces) {
    if (!face.wall || face.sv < 1.5) continue;
    for (const tid of face.triangles.slice(0, 4)) {
      const tri = level.triangleWorld.triangle(tid), point = tri.a.clone().add(tri.b).add(tri.c).multiplyScalar(1 / 3);
      const feet = point.clone().addScaledVector(face.n, PLAYER.radius + .06); feet.y -= .3;
      const h = physics.raycast(feet.clone().add(new THREE.Vector3(0, .3, 0)), face.n.clone().negate(), PLAYER.radius + .35);
      if (!h.hit || h.face !== face.id) continue;
      G.paint.splat(h.point.clone().addScaledVector(h.normal, .03), 2, 0, {seed: .375, instant: true});
      if (G.paint.sample(h.face, h.u, h.v) !== 1) continue;
      const actor = f.make(); actor.pos.copy(feet); actor.intent.move.copy(face.n).negate(); actor.form = 'squid'; actor.climbExit = 0;
      actor._updateClimb(1 / 60, true);
      if (!actor.climbing) continue;
      assert.ok(actor.vel.y > 0);
      G.paint.splat(h.point.clone().addScaledVector(h.normal, .03), 3, 1, {seed: .375, instant: true});
      actor._updateClimb(1 / 60, true);
      assert.equal(actor.climbing, false, 'enemy wall ink releases squid');
      wall = {face: face.id, triangle: tid}; break;
    }
    if (wall) break;
  }
  assert.ok(wall, 'real painted wall permits squid climbing');

  const motion = [];
  for (const hz of [30, 60, 120]) {
    const actor = f.make(); actor._integrate = f.Actor.prototype._integrate; actor.spawnAt(level.spawnPads[0], 0);
    actor.intent.fire = false;
    for (let frame = 0; frame < hz; frame++) {G.time += 1 / hz; actor.update(1 / hz);}
    assert.ok(actor.alive && actor.grounded && Number.isFinite(actor.pos.length()));
    const start = actor.pos.clone(); actor.intent.move.set(0, 0, 1);
    for (let frame = 0; frame < hz; frame++) {G.time += 1 / hz; actor.update(1 / hz);}
    assert.ok(actor.alive && actor.pos.distanceTo(start) > 1, 'actor traverses exported floor at ' + hz + ' Hz');
    motion.push({hz, distance: actor.pos.distanceTo(start), position: actor.pos.toArray(), grounded: actor.grounded});
  }
  G.nav = new f.NavGraph(level, physics);
  const spawnIds = level.spawnPads.map(pad => G.nav.nearest(pad, 1.2));
  const reachable = seed => {
    const seen = new Set([seed]), queue = [seed];
    for (let i = 0; i < queue.length; i++) for (const edge of G.nav.nodes[queue[i]].nb) {
      if (G.nav.valid[edge.to] && !seen.has(edge.to)) {seen.add(edge.to); queue.push(edge.to);}
    }
    return seen;
  };
  assert.ok(reachable(spawnIds[0]).has(spawnIds[1]) && reachable(spawnIds[1]).has(spawnIds[0]), 'spawns share a directed mutual component');
  const approaches = level.spawnPads.map(pad => G.nav.nearest(pad.clone().setZ(pad.z + (pad.z < 0 ? 4 : -4)), 1.2));
  const routes = [G.nav.path(spawnIds[0], approaches[1], 0, 50000), G.nav.path(spawnIds[1], approaches[0], 1, 50000)];
  assert.ok(routes.every(route => route?.length > 20), 'both teams reach the opposing approach outside its spawn barrier');
  const ranked = f.nativeRankedStage(G);
  assert.equal(ranked.version1130Verified, false);
  assert.match(ranked.calibration, /UNVERIFIED/);
  for (const target of [ranked.zones[0].center, ...ranked.rainmaker.goals, ...ranked.clams.spawns]) {
    const id = G.nav.nearest(new THREE.Vector3(...target), 1.2);
    assert.ok(spawnIds.every((seed, team) => G.nav.path(seed, id, team, 50000)), 'ranked target reachable from both spawns: ' + JSON.stringify(target));
  }
  G.match.mode = 'turf'; G.match.opts = {};
  const spawned = f.make();
  assert.equal(f.beginInitialSquidSpawn(spawned), true);
  spawned.intent.fire = true; spawned.update(1 / 60); spawned.intent.fire = false;
  for (let i = 0; i < 75; i++) spawned.update(1 / 60);
  assert.equal(spawned.s3.squidSpawn, undefined);
  assert.equal(spawned.grounded, true);
  const goals = f.nativePaintGoalIds(new f.BotBrain(spawned, 'normal'), G);
  assert.ok(goals.length > 0);
  const report = {id: 'undertow', support, wall, motion, navNodes: G.nav.nodes.length, validNodes: G.nav.validIds.length, spawnRouteNodes: routes.map(route => route.length), paintFaces: level.faces.length, gridCells: G.paint.grid.length, rankedTargetsReachable: true, version1130Verified: false};
  if (process.env.UNDERTOW_NODE_EVIDENCE) {
    fs.mkdirSync(path.dirname(process.env.UNDERTOW_NODE_EVIDENCE), {recursive: true});
    fs.writeFileSync(process.env.UNDERTOW_NODE_EVIDENCE, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report));
});
