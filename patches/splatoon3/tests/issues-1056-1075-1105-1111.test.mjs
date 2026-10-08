import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { fixture } from './source-fixture.mjs';
import { isSquidReturnerCeiling } from '../runtime/movement.mjs';
import { runSimulation, installClock } from '../runtime/clock.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const DT = 1 / 60;

test('#1075 ordinary ceilings do not strip armor; only explicit Squid Returner blocks classify', () => {
  const actor = { contacts: { ceiling: true, ceilingBlock: 0 } };
  const physics = { level: { blocks: [{ squidReturner: false }, { squidReturner: true }] } };
  assert.equal(isSquidReturnerCeiling(actor, physics), false, 'ordinary ceiling');
  actor.contacts.ceilingBlock = 1;
  assert.equal(isSquidReturnerCeiling(actor, physics), true, 'explicit Squid Returner');
  actor.contacts.ceiling = false;
  assert.equal(isSquidReturnerCeiling(actor, physics), false, 'block identity alone is not a contact');

  const physicsSource = adaptSource('src/game/physics.js', read('src/game/physics.js'));
  const levelSource = adaptSource('src/world/level.js', read('src/world/level.js'));
  assert.match(physicsSource, /c\.ceilingBlock = -1/);
  assert.match(physicsSource, /c\.ceilingBlock = b\.id/);
  assert.match(levelSource, /squidReturner: !!d\.squidReturner/);
});

async function rollerLanding(frame) {
  const f = await fixture();
  const a = f.make('roller'), r = a.weaponRunner, w = a.weapon;
  a.grounded = false;
  r._roller(DT, { fire: true, firePressed: true }, w);
  assert.equal(r.s3RollerAttack?.vertical, true, 'airborne press starts vertical');
  for (let i = 1; i <= frame; i++) {
    a.grounded = i === frame;
    r._roller(DT, { fire: true, firePressed: false }, w);
  }
  return { f, a, r, w };
}

test('#1056 landing on reference frames 1..5 converts once to horizontal minus-1F startup', async () => {
  for (const frame of [1, 3, 5]) {
    const { r, w } = await rollerLanding(frame);
    assert.equal(r.s3RollerAttack.vertical, false, `frame ${frame}`);
    assert.equal(r.s3FlickVertical, false, `frame ${frame} runner mode`);
    assert.ok(Math.abs(r.s3RollerAttack.windup - (w.flickWindup - DT)) < 1e-10,
      `frame ${frame} uses faster horizontal startup`);
    assert.ok(Math.abs(r.s3RollerAttack.elapsed - frame * DT) < 1e-10,
      'conversion preserves elapsed startup time');
  }
});

test('#1056 landing on frame 6 stays vertical', async () => {
  const { r, w } = await rollerLanding(6);
  assert.equal(r.s3RollerAttack.vertical, true);
  assert.equal(r.s3FlickVertical, true);
  assert.notEqual(r.s3RollerAttack.windup, w.flickWindup - DT);
});


test('#1111 600 no-controller foreground frames allocate no pad-edge scratch Set', () => {
  installClock({ G: { time: 0, net: null } });
  const game = {
    input: { padPressed: new Set(), _padEpoch: 1,
      pollPad() { this.padPressed.clear(); }, endFrame() {} },
    match: null, showcase: null, _padMenus() {},
  };
  for (let i = 0; i < 600; i++) runSimulation(game, DT);
  assert.equal(game.s3Clock._pendingPadEdges, undefined, 'no edges means zero Set constructions');
});

test('#1111 zero-tick carry and epoch switch keep button-edge semantics without repeated Set construction', () => {
  installClock({ G: { time: 0, net: null } });
  const input = { padPressed: new Set(['fire']), _padEpoch: 2,
    pollPad() { this.padPressed.clear(); }, endFrame() {} };
  const game = { input, match: null, showcase: null, _padMenus() {} };
  runSimulation(game, 0);
  assert.equal(input.padPressed.has('fire'), true, 'zero-tick render preserves the edge');
  const scratch = game.s3Clock._pendingPadEdges;
  assert.ok(scratch instanceof Set);
  runSimulation(game, DT / 2);
  assert.equal(game.s3Clock._pendingPadEdges, scratch, 'reuses the exact Set');
  assert.equal(input.padPressed.has('fire'), true);
  runSimulation(game, DT);
  assert.equal(input.padPressed.size, 0, 'tick consumes edge');
  input.padPressed.add('fire');
  input.pollPad = function () { this.padPressed.clear(); this._padEpoch++; };
  runSimulation(game, 0);
  assert.equal(input.padPressed.size, 0, 'epoch change never resurrects a stale edge');
  game.s3Clock.reset();
  assert.equal(scratch.size, 0, 'lifecycle reset clears scratch');
});

test('#1105 idle Roller calls do not swap projectile hit admission', async () => {
  const f = await fixture();
  const a = f.make('roller');
  const p = f.G.projectiles;
  const original = p.applyHit;
  let writes = 0;
  Object.defineProperty(p, 'applyHit', {
    configurable: true,
    get() { return original; },
    set(value) { writes++; assert.equal(typeof value, 'function'); },
  });
  const idle = { fire: false, firePressed: false, squid: false };
  for (let i = 0; i < 60; i++) a.weaponRunner._roller(DT, idle, a.weapon);
  assert.equal(writes, 0, 'idle ticks never install the per-call closure');
  assert.equal(p.applyHit, original);
  delete p.applyHit;
});

test('#1105 non-idle Roller retains authoritative hit-admission interception', async () => {
  const f = await fixture();
  const a = f.make('roller');
  const p = f.G.projectiles;
  const old = p.applyHit;
  let installs = 0;
  Object.defineProperty(p, 'applyHit', {
    configurable: true,
    get() { return this._testHit || old; },
    set(value) { installs++; this._testHit = value; },
  });
  a.weaponRunner._roller(DT, { fire: true, firePressed: true }, a.weapon);
  assert.equal(installs, 2, 'active fire wraps then restores exactly once');
  assert.equal(p.applyHit, old, 'native method restored');
  delete p.applyHit;
});
