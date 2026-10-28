import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function world(sub = 'bomb', ghost = false) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export { initFxHooks } from './src/fx/fxHooks.js';" });
  const { G, THREE } = f, calls = [];
  G.camera = { position: new THREE.Vector3(0, 5, 0) };
  G.fx = Object.fromEntries(['dangerRing', 'beepPulse', 'mark', 'bombTrail', 'bounceSplash'].map(name =>
    [name, (...args) => calls.push({ name, args: args.map(v => v?.clone ? v.clone() : v) })]));
  let probes = 0, supported = true;
  G.physics.segment = (_a, _b, hit) => { hit.hit = false; return hit; };
  G.physics.raycast = (from, down, length, hit) => {
    probes++; hit.hit = supported && down.y < 0 && from.y <= length;
    if (hit.hit) { hit.point.set(from.x, 0, from.z); hit.normal.set(0, 1, 0); }
    return hit;
  };
  const a = f.make(({ bomb: 'charger', curling: 'roller', autobomb: 'blaster', suction: 'shooter' })[sub]);
  if (ghost) { a.remote = true; G.projectiles.ghostBomb(a, 'bomb', 0, .21, 0, 0, 0, 0, null, sub, 0); }
  else G.projectiles.throwBomb(a);
  const b = G.projectiles.bombs.at(-1), hooks = f.initFxHooks(G);
  assert.ok(b); b.pos.set(0, .21, 0); b.vel.set(0, 0, 0); b.fuse = .8;
  const draw = () => { calls.length = 0; hooks.stamp++; hooks._bombs(G.projectiles, 1 / 60); return calls; };
  return { ...f, b, hooks, calls, draw, probes: () => probes, support: value => { supported = value; } };
}

for (const ghost of [false, true]) test(`Curling has no post-release explosion forecast (${ghost ? 'ghost' : 'owner'})`, async () => {
  const w = await world('curling', ghost), before = JSON.stringify(w.b, (k, v) => k === 'owner' || k === 'group' ? undefined : v);
  w.draw();
  assert.equal(w.calls.filter(c => ['dangerRing', 'beepPulse', 'mark'].includes(c.name)).length, 0);
  assert.equal(w.probes(), 0, 'suppressed Curling cue performs no floor probe');
  assert.equal(JSON.stringify(w.b, (k, v) => k === 'owner' || k === 'group' ? undefined : v), before, 'display leaves the native record unchanged');
});

test('Splat Bomb warning and beep follow rolling, lose unsupported ground and reacquire it without rearming', async () => {
  const w = await world();
  const first = w.draw().find(c => c.name === 'dangerRing');
  assert.deepEqual(Array.from(first.args[0].toArray()), [0, .02, 0]);
  const probes = w.probes(); w.draw(); assert.equal(w.probes(), probes, 'stationary cue reuses support');
  const cached = w.hooks.bombs.get(w.b).cue; w.draw();
  assert.equal(w.hooks.bombs.get(w.b).cue, cached, 'steady draw reuses its cue record');
  w.b.pos.set(3, .21, 4); w.b.beepT = 1;
  w.draw();
  assert.deepEqual(Array.from(w.calls.find(c => c.name === 'dangerRing').args[0].toArray()), [3, .02, 4]);
  assert.deepEqual(Array.from(w.calls.find(c => c.name === 'beepPulse').args[1].toArray()), [3, 0, 4]);
  assert.equal(w.calls.filter(c => c.name === 'bounceSplash').length, 0, 'moving the marker does not repeat arming FX');
  w.support(false); w.b.pos.y = 4; w.b.beepT = 2; w.draw();
  assert.equal(w.calls.some(c => c.name === 'dangerRing'), false, 'ledge exit never leaves a ring at its first landing');
  assert.equal(w.calls.find(c => c.name === 'beepPulse').args[1], null);
  w.support(true); w.b.pos.set(5, .21, 6); w.draw();
  assert.deepEqual(Array.from(w.calls.find(c => c.name === 'dangerRing').args[0].toArray()), [5, .02, 6]);
});

for (const ghost of [false, true]) test(`Autobomb scan starts at actual floor contact and expires before chase (${ghost ? 'ghost' : 'owner'})`, async () => {
  const w = await world('autobomb', ghost), { b, G } = w;
  b.fuse = -1; w.draw(); assert.equal(w.calls.some(c => c.name === 'mark'), false, 'flight/wall rebound has no scan');
  // Use the real installed bomb contact owner, not a manufactured s3Auto.
  G.physics.segment = (_from, to, hit) => { hit.hit = true; hit.point.copy(to).setY(0); hit.normal.set(0, 1, 0); return hit; };
  if (ghost) { b._netPeer = null; }
  b.vel.set(0, -1, 0); G.projectiles._updateBombs(1 / 60);
  assert.ok(b.s3Auto, 'native floor contact starts scan');
  const spec = (b.s3Resolved || b.s3GhostResolved).spec, start = b.s3Auto.startAge;
  w.draw(); const mark = w.calls.find(c => c.name === 'mark');
  assert.ok(mark, 'landing frame has an immediate scan');
  assert.ok(Math.abs(mark.args[3] * .93 - spec.acquireRadius) < 1e-8, 'visible thin rim uses acquisition radius, never explosion radius');
  assert.equal(mark.args[4], 7, 'thin search rim is distinct from danger fill');
  const origin = mark.args[0].toArray();
  b.age = start + 5 / 60; b.pos.x += .1; w.draw();
  assert.deepEqual(w.calls.find(c => c.name === 'mark').args[0].toArray(), origin, 'scan remains at its landing origin');
  b.age = start + spec.rotateFrames / 60; w.draw();
  assert.equal(w.calls.some(c => c.name === 'mark'), false, 'no scan remains after initial rotation');
  G.projectiles.bombs.length = 0; w.draw(); assert.equal(w.hooks.bombs.size, 0, 'retirement frees presentation state');
});

test('Autobomb observed after its search window and removed bombs leave no delayed scan', async () => {
  const w = await world('autobomb');
  w.b.s3Auto = { startAge: 0, phase: 'chasing' }; w.b.age = 1;
  w.draw(); assert.equal(w.calls.some(c => c.name === 'mark'), false);
  w.G.projectiles.clear(); w.draw(); assert.equal(w.hooks.bombs.size, 0);
});
