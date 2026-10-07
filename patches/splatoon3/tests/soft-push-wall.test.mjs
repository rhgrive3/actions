import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';

// #928: Match's actor soft push wrote the correction straight into pos after collision, so the local actor (which takes
// 100% of a remote overlap online) could be moved past the midplane of a thin wall and resolved out the far side.
// The real Match.update, Physics and Kelpline Terminal are used; actors are minimal (the push reads only pos/alive/remote/form).
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
async function load(adapt = adaptSource) {
  const context = vm.createContext({ console, performance }), modules = new Map();
  const resolve = (spec, from) => spec === 'three' ? path.join(UPSTREAM, 'vendor/three/build/three.module.js') : (file => {
    if (file.startsWith(path.join(ROOT, 'inkwave-public/'))) file = path.join(UPSTREAM, path.relative(path.join(ROOT, 'inkwave-public'), file));
    if (file.startsWith(path.join(UPSTREAM, 'patches/'))) file = path.join(ROOT, path.relative(UPSTREAM, file));
    if (file.startsWith(path.join(ROOT, 'src/'))) file = path.join(UPSTREAM, path.relative(ROOT, file));
    return file;
  })(path.resolve(path.dirname(from), spec));
  const get = file => {
    if (modules.has(file)) return modules.get(file);
    const text = fs.readFileSync(file, 'utf8'), inside = file.startsWith(UPSTREAM + path.sep);
    const mod = new vm.SourceTextModule(inside ? adapt(path.relative(UPSTREAM, file), text) : text, { context, identifier: file });
    modules.set(file, mod); return mod;
  };
  const root = new vm.SourceTextModule(`
    export * from './inkwave-public/src/core/ctx.js'; export * from './inkwave-public/src/config.js';
    export * from './inkwave-public/src/game/match.js'; export * from './inkwave-public/src/game/physics.js';
    export { Level } from './inkwave-public/src/world/level.js'; export { KELPLINE } from './inkwave-public/src/world/maps.js';
    export * as THREE from 'three';`, { context, identifier: path.join(ROOT, 'soft-push-entry.mjs') });
  await root.link((spec, from) => get(resolve(spec, from.identifier))); await root.evaluate();
  return { ...root.namespace };
}
function world(api) {
  const { G, THREE, Level, Physics, KELPLINE, Match, PLAYER } = api;
  G.level = new Level(KELPLINE); G.physics = new Physics(G.level); G.netm = { applyRemote() {} };
  const actor = (x, y, z, remote = false) => ({ alive: true, remote, form: 'kid', pos: new THREE.Vector3(x, y, z), update() {} });
  const step = (actors, dt = 1 / 60) => Match.prototype.update.call({ paused: false, stateT: 0, state: 'intro', actors }, dt);
  // body resolution exactly as Actor._resolve calls it (grounded, kid)
  const resolve = a => G.physics.collideBody(a.pos, PLAYER.radius, PLAYER.stepUp, PLAYER.height, { groundNormal: new THREE.Vector3(), wallNormal: new THREE.Vector3() }, true, false);
  // a flat, clear stretch of ground: the body fits at x-1 .. x+1 on the same z
  const open = (z0 = 20) => { for (let z = z0; z < 44; z += 2) for (let x = -20; x <= 20; x += 2) {
    const y = G.level.groundHeight(x, z, 0.6); if (y !== 0) continue;
    if ([-1, -0.5, 0, 0.5, 1].every(o => G.physics.bodyFits(new THREE.Vector3(x + o, 0, z), PLAYER.radius, PLAYER.stepUp, PLAYER.height) && G.level.groundHeight(x + o, z, 0.6) === 0)) return [x, z]; }
    throw new Error('no open ground'); };
  return { ...api, actor, step, resolve, open };
}
const WALL_FACE = -23.6;
test('#928 Kelpline: online local tangent to the 0.4 m side-deck wall (and its mirror) is not tunneled by a remote overlap', async () => {
  const w = world(await load()), tangent = WALL_FACE + w.PLAYER.radius;     // -23.22
  for (const [s, z] of [[1, -15], [-1, 15]]) {   // the half layout is point-mirrored: the other wall is x=+23.6..24, z=8.6..22
    const local = w.actor(s * tangent, 2.0, z), remote = w.actor(s * (tangent + 0.01), 2.0, z, true);
    w.step([local, remote]);
    assert.ok(s * local.pos.x >= tangent - 1e-6, `z=${z}: local ${local.pos.x} was pushed into the wall`);
    assert.equal(remote.pos.x, s * (tangent + 0.01), 'remote authoritative actor is never moved');
    for (let i = 0; i < 5; i++) { w.resolve(local); w.step([local, remote]); w.resolve(local); }
    assert.ok(s * local.pos.x > WALL_FACE, 'never ends up beyond the wall');
  }
});
test('#928 control: unpatched soft push does tunnel the same setup', async () => {
  const stock = (rel, code) => adaptSource(rel, code).replace(/softPushActor\(G\.physics, PLAYER, (\w), (.+?), (.+?)\);/g, (_m, v, x, z) => `${v}.pos.x += ${x}; ${v}.pos.z += ${z};`);
  const w = world(await load(stock)), tangent = WALL_FACE + w.PLAYER.radius;
  const local = w.actor(tangent, 2.0, -15), remote = w.actor(tangent + 0.01, 2.0, -15, true);
  w.step([local, remote]);
  assert.ok(local.pos.x < -23.8, `stock push moved the local past the wall midplane (x=${local.pos.x})`);
  w.resolve(local);   // the next body resolution does not return it to the gameplay side of the wall
  assert.ok(!(local.pos.x >= tangent - 1e-6 && local.pos.y < 2.1), `resolved back onto the deck side (x=${local.pos.x}, y=${local.pos.y})`);
});
test('#928 squid form and offline pairs stay world-valid; open-space push is unchanged', async () => {
  const w = world(await load()), r = w.PLAYER.radius;
  // squid body against the same wall
  const sq = w.actor(WALL_FACE + r, 2.0, -12), other = w.actor(WALL_FACE + r + 0.01, 2.0, -12, true); sq.form = 'squid';
  w.step([sq, other]); assert.ok(sq.pos.x >= WALL_FACE + r - 1e-6);
  // offline pair against the wall: each side gets half the correction and neither enters it
  const a = w.actor(WALL_FACE + r, 2.0, -18), b = w.actor(WALL_FACE + r + 0.01, 2.0, -18); w.step([a, b]);
  assert.ok(a.pos.x >= WALL_FACE + r - 1e-6 && b.pos.x > a.pos.x);
  // open space (centre of the ground): online local gives the full overlap, offline splits it symmetrically, remote fixed
  const d = 0.1, want = r * 1.7 - d;
  const [ox, oz] = w.open();
  const l = w.actor(ox, 0, oz), rem = w.actor(ox + d, 0, oz, true); w.step([l, rem]);
  assert.ok(Math.abs((rem.pos.x - l.pos.x) - r * 1.7) < 1e-9); assert.equal(rem.pos.x, ox + d); assert.ok(Math.abs(l.pos.x - (ox - want)) < 1e-9);
  const p = w.actor(ox, 0, oz), q = w.actor(ox + d, 0, oz); w.step([p, q]);
  assert.ok(Math.abs((ox - p.pos.x) - want / 2) < 1e-9 && Math.abs((q.pos.x - ox - d) - want / 2) < 1e-9);
});
test('#928 coincident actors keep the d2 guard (no NaN) and the result is independent of the render rate', async () => {
  const w = world(await load()), [ox, oz] = w.open(), a = w.actor(ox, 0, oz), b = w.actor(ox, 0, oz, true); w.step([a, b]);
  assert.ok(Number.isFinite(a.pos.x) && a.pos.x === ox);
  const results = [];
  for (const hz of [30, 60, 120]) {   // position correction is per fixed tick, not per elapsed time
    const l = w.actor(WALL_FACE + w.PLAYER.radius, 2.0, -15), r = w.actor(WALL_FACE + w.PLAYER.radius + 0.01, 2.0, -15, true);
    w.step([l, r], 1 / hz); results.push(l.pos.x);
  }
  assert.deepEqual(results, [results[0], results[0], results[0]]);
});
