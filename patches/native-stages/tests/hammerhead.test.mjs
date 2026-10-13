import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { nativeFixture, readStage } from './fixture.mjs';
const definition = JSON.parse(fs.readFileSync(new URL('../definitions/hammerhead.json', import.meta.url)));
const ROOT = process.env.INKWAVE_NATIVE_STAGE_ASSETS;

test('Hammerhead uses the revised pinned source and keeps retail claims unverified', () => {
  assert.equal(definition.id, 'hammerhead');
  assert.equal(definition.internal, 'Vss_Kaisou04');
  assert.equal(definition.tree, '6b9bb90548f56bfb23321f849b6da64e894cbc04');
  assert.equal(definition.sourceSha256, 'acc6983d529932832fbd9c5bb54c5e96fe43ccf3c9aaf5c21d3ca653af8359de');
  assert.equal(definition.version1130Verified, false);
  assert.match(definition.placementStatus, /inferred|unverified/i);
  const [a, b] = definition.spawnPads;
  assert.deepEqual(b, [-a[0] || 0, a[1], -a[2]]);
});

test('Hammerhead inferred support, directed landing routes and movement at three frame rates', { skip: !ROOT }, async () => {
  const f = await nativeFixture(), { G, THREE, PLAYER } = f;
  const data = readStage(ROOT, 'hammerhead');
  const level = G.level = new f.NativeLevel(data);
  const physics = G.physics = new f.NativePhysics(level);
  class CpuPaint extends f.PaintSystem { _initGPU() { this.quads = 0; } _pushQuad() {} }
  const paint = G.paint = new CpuPaint(null, level, { atlasSize: 2048, maxDensity: 4, cell: .25 });
  assert.equal(level.manifest.sourceSha256, definition.sourceSha256);
  assert.ok(level.manifest.chartMaxPlaneError < .005);
  for (const pattern of definition.sourceSemantics.nonCollidableObjectPatterns) {
    const objects = data.manifest.objects.filter(o => new RegExp(pattern).test(o.name));
    assert.ok(objects.length, pattern + ' matches actual source scenery');
    for (const object of objects) {
      assert.equal(object.collidable, false, object.name + ' scenery collision');
      assert.equal(object.paintable, false, object.name + ' scenery paint');
      assert.equal(object.active, true, 'scenery source rendering retained');
    }
  }
  const supports = level.spawnPads.map(pad => {
    const hit = physics.raycast(pad.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3(0, -1, 0), 4);
    assert.ok(hit.hit && hit.normal.y > .68);
    assert.ok(Math.abs(hit.point.y - pad.y) < .12);
    assert.ok(physics.bodyFits(pad, PLAYER.radius + .04, .32, PLAYER.height));
    assert.ok(paint.splat(hit.point.clone().addScaledVector(hit.normal, .03), 1.5, 0, { seed: .125, instant: true }) > 0);
    assert.equal(paint.sample(hit.face, hit.u, hit.v), 1);
    return { point: hit.point.toArray(), normal: hit.normal.toArray() };
  });
  G.nav = new f.NavGraph(level, physics);
  assert.ok(G.nav.validIds.length > 100);
  const ranked = f.nativeRankedStage(G);
  assert.equal(ranked.version1130Verified, false);
  const center = G.nav.nearest(new THREE.Vector3(...ranked.zones[0].center), 1.2);
  // Use the production helper in the same VM/THREE world as triangle physics.
  level.nativeNav = G.nav;
  const minimapModule = new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-minimap.mjs', import.meta.url), 'utf8'), { context: f.context });
  const threeModule = new vm.SyntheticModule(['Vector3'], function () { this.setExport('Vector3', THREE.Vector3); }, { context: f.context });
  await minimapModule.link(() => threeModule); await minimapModule.evaluate();
  const centerNode = G.nav.nodes[center];
  const roof = level.triangleWorld.ray(new THREE.Vector3(centerNode.x, 50, centerNode.z), new THREE.Vector3(0, -1, 0), 100);
  const collision = data.triangles, collisionBefore = collision.slice(), grid = paint.grid, gridBefore = grid.slice();
  const mapped = minimapModule.namespace.nativeMinimapSupport(level, centerNode.x, centerNode.z);
  assert.ok(roof.point.y > 40, 'source overhead highway remains collidable');
  assert.ok(Math.abs(mapped.point.y - centerNode.y) < .15, 'minimap projects the reachable floor beneath highway');
  assert.equal(data.triangles, collision); assert.deepEqual(collision, collisionBefore);
  assert.equal(paint.grid, grid); assert.deepEqual(grid, gridBefore);
  const minimap = { topmostY: roof.point.y, reachableY: mapped.point.y, centerY: centerNode.y, collisionAndPaintRetained: true };
  const landings = [];
  for (const team of [0, 1]) {
    G.match.mode = 'turf'; G.match.opts = {};
    const actor = f.make(); actor.team = team; actor.spawnAt(level.spawnPads[team], team);
    assert.equal(f.beginInitialSquidSpawn(actor), true);
    assert.ok(actor.s3.squidSpawn.target);
    actor.intent.fire = true; actor.update(1 / 60); actor.intent.fire = false;
    for (let i = 0; i < 90; i++) actor.update(1 / 60);
    assert.equal(actor.s3.squidSpawn, undefined); assert.equal(actor.grounded, true);
    const node = G.nav.nearest(actor.pos, 1.2);
    assert.ok(node >= 0);
    assert.ok(G.nav.path(node, center, team, 50000), 'team ' + team + ' reaches center');
    const returnPath = G.nav.path(center, node, team, 50000);
    landings.push({ team, position: actor.pos.toArray(), node, centerPath: true, returnPath: !!returnPath });
  }
  const rates = [];
  for (const hz of [30, 60, 120]) {
    const actor = f.make(); actor._integrate = f.Actor.prototype._integrate;
    actor.spawnAt(new THREE.Vector3(...ranked.zones[0].center).add(new THREE.Vector3(0, .08, 0)), 0);
    const start = actor.pos.clone(); actor.intent.move.set(0, 0, 1); actor.intent.fire = false;
    for (let i = 0; i < hz; i++) { G.time += 1 / hz; actor.update(1 / hz); }
    assert.equal(actor.alive, true); assert.equal(actor.grounded, true);
    const moved = actor.pos.distanceTo(start); assert.ok(moved > 1 && moved < 12, 'supported movement at ' + hz + ' Hz');
    rates.push({ hz, moved, end: actor.pos.toArray(), grounded: actor.grounded });
  }
  assert.ok(Math.max(...rates.map(r => r.moved)) - Math.min(...rates.map(r => r.moved)) < .5);
  for (let i = 0; i < paint.grid.length; i++) if (paint.dead[i]) assert.equal(paint.grid[i], 0);
  console.log(JSON.stringify({ id: 'hammerhead', supports, landings, rates, minimap, navNodes: G.nav.nodes.length, validNodes: G.nav.validIds.length, maskedCells: paint.dead.reduce((a, b) => a + b, 0), atlas: paint.size, version1130Verified: false }));
});
