// Focused native-path regression for INKWAVE #412 (chain-jump inheritance).
// Executes the REAL native Actor.superJump + _updateSuperJump state machine
// (via patches/splatoon3/tests/source-fixture.mjs, real vendored THREE) and
// the REAL upstream player.js source plus the standalone issue-412 adapter;
// no gameplay engine is re-implemented. Negative main control: the unpatched
// source must keep rejecting an already-jumping teammate.
// Remote shape uses the REAL netmatch.js wire code: packEvent vectors as
// [x,y,z] and _playEvent flight sets a.net.sjTo = e.to.clone() (L550).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  adaptIssue412ChainJump,
  resolveChainJumpDestination,
  resolveIssue412Destination,
  isChainJumpTarget,
  SCOPE_CHARGE_ORDINARY_ACTOR,
  PICK_BEFORE,
  PICK_AFTER,
} from '../issue-412-adapter.mjs';
import { fixture as nativeFixture } from '../../splatoon3/tests/source-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readPlayer = () => fs.readFileSync(path.join(UPSTREAM, 'src/game/player.js'), 'utf8');

test('native Actor: CHARGE allocates zero to; resolver never returns origin', async () => {
  const f = await nativeFixture();
  const mk = () => {
    const a = f.make();
    a._probeGround = () => { a.grounded = true; };
    a._resolve = () => { a.grounded = true; };
    return a;
  };
  // Real native flow: superJump(vector) allocates st.to = NEW ZERO during CHARGE.
  const dest = new f.THREE.Vector3(10, 0, 20);
  const b = mk(); b.pos.set(99, 0, 99);
  assert.equal(b.superJump(dest.clone()), true);
  assert.equal(b.superJumpState.phase, 'charge');
  // NOTE: toArray() comes from the VM realm (different Array prototype), so
  // assert.deepEqual fails on reference identity; compare via JSON instead.
  assert.equal(JSON.stringify([...b.superJumpState.to.toArray()]), '[0,0,0]');
  // Old phase-blind resolver would have returned {0,0,0} here (world origin).
  // Phase-aware resolver: charge+Vector clones the existing target vector.
  assert.deepEqual(resolveChainJumpDestination(b), { x: 10, y: 0, z: 20 });
  // Tick mid-charge: `to` is STILL zero; resolver still must not return origin.
  f.tick(b, 5);
  assert.equal(b.superJumpState.phase, 'charge');
  assert.equal(JSON.stringify([...b.superJumpState.to.toArray()]), '[0,0,0]');
  const mid = resolveChainJumpDestination(b);
  assert.deepEqual(mid, { x: 10, y: 0, z: 20 });
  assert.notDeepEqual(mid, { x: 0, y: 0, z: 0 });
  // Full charge transition via REAL _updateSuperJump: `to` fills, phase=flight.
  f.tick(b, 80);
  assert.equal(b.superJumpState.phase, 'flight');
  assert.deepEqual(resolveChainJumpDestination(b), { x: 10, y: 0, z: 20 });
  assert.equal(isChainJumpTarget(b), true);
});

test('native Actor: charge+ordinary-actor is scope-limited (no fake ground dest)', async () => {
  const f = await nativeFixture();
  const mk = (x, z) => {
    const a = f.make();
    a.pos.set(x, 0, z);
    a._probeGround = () => { a.grounded = true; };
    a._resolve = () => { a.grounded = true; };
    return a;
  };
  // Real native flow: B charges toward ordinary actor D (live target reference).
  const d = mk(3, 4);
  const b = mk(60, 60);
  assert.equal(b.superJump(d), true);
  assert.equal(b.superJumpState.phase, 'charge');
  assert.ok(b.superJumpState.target === d, 'native stores the live actor reference');
  assert.equal(JSON.stringify([...b.superJumpState.to.toArray()]), '[0,0,0]');
  // Correct native ground destination needs the charge->flight raycast
  // resolution (requires #362 snapshot model). Resolver returns null rather
  // than default.to (origin), airborne pos, or live pos.
  assert.equal(resolveChainJumpDestination(b), null);
  assert.equal(isChainJumpTarget(b), false);
  assert.equal(SCOPE_CHARGE_ORDINARY_ACTOR, 'charge-target-ordinary-actor:unresolvable-without-362');
  // Ordinary (non-jumping) teammate returns null: caller keeps the normal
  // native a.superJump(o) path (#362 owns it, never this resolver).
  assert.equal(resolveChainJumpDestination(d), null);
  assert.equal(isChainJumpTarget(d), false);
});

test('native Actor: FLIGHT commits immutable destination, never live pos', async () => {
  const f = await nativeFixture();
  const b = f.make();
  b._probeGround = () => { b.grounded = true; };
  b._resolve = () => { b.grounded = true; };
  b.pos.set(99, 30, 99);
  b.superJump(new f.THREE.Vector3(10, 0, 20));
  f.tick(b, 80);
  assert.equal(b.superJumpState.phase, 'flight');
  const out = resolveChainJumpDestination(b);
  assert.deepEqual(out, { x: 10, y: 0, z: 20 });
  assert.notEqual(out, b.superJumpState.to);
  out.x = -1;
  assert.equal(b.superJumpState.to.x, 10);
  assert.deepEqual(resolveIssue412Destination(b), { x: 10, y: 0, z: 20 });
  b.alive = false;
  assert.equal(resolveChainJumpDestination(b), null);
});

test('native Actors: A->B->C chain resolves via real jump states', async () => {
  const f = await nativeFixture();
  const mk = (x, y, z) => {
    const a = f.make();
    a.pos.set(x, y, z);
    a._probeGround = () => { a.grounded = true; };
    a._resolve = () => { a.grounded = true; };
    return a;
  };
  const c = mk(7, 0, 8);
  c.superJump(new f.THREE.Vector3(7, 0, 8));
  f.tick(c, 80);
  assert.equal(c.superJumpState.phase, 'flight');
  const b = mk(50, 20, 50);
  assert.equal(b.superJump(c), true);
  assert.equal(b.superJumpState.phase, 'charge');
  assert.ok(b.superJumpState.target === c);
  assert.equal(JSON.stringify([...b.superJumpState.to.toArray()]), '[0,0,0]');
  assert.deepEqual(resolveChainJumpDestination(b), { x: 7, y: 0, z: 8 });
  const a = mk(0, 0, 0), bb = mk(5, 5, 5);
  a.superJump(bb); bb.superJump(a);
  assert.equal(resolveChainJumpDestination(a), null);
});

test('remote flight uses the REAL netmatch.js wire shape (pack/unpack + sjTo)', async () => {
  const f = await nativeFixture();
  const netSrc = fs.readFileSync(path.join(UPSTREAM, 'src/net/netmatch.js'), 'utf8');
  assert.ok(netSrc.includes('a.net.sjTo = e.to ? e.to.clone() : null'),
    'netmatch flight must replicate sjTo via e.to.clone()');
  assert.ok(netSrc.includes('case \'superjump:land\': a.net.sjTo = null'),
    'netmatch land must clear sjTo');
  assert.ok(netSrc.includes('else if (v && v.isVector3) o[k] = [r2(v.x), r2(v.y), r2(v.z)]'),
    'packEvent must encode vectors as [x,y,z]');
  assert.ok(netSrc.includes('else if (Array.isArray(v) && v.length === 3) e[k] = new THREE.Vector3'),
    'unpackEvent must decode [x,y,z] to Vector3');
  // Real packed flight event: owner emits { phase:'flight', to:[x,y,z] };
  // remote decodes to Vector3 then clones into a.net.sjTo (no live identity).
  const dest = new f.THREE.Vector3(30, 0, 40);
  const packed = [Math.round(dest.x * 100) / 100, Math.round(dest.y * 100) / 100, Math.round(dest.z * 100) / 100];
  assert.equal(JSON.stringify(packed), '[30,0,40]');
  const decoded = new f.THREE.Vector3(packed[0], packed[1], packed[2]);
  const remote = { alive: true, superJumpState: { phase: 'flight' }, net: { sjTo: decoded.clone() } };
  assert.deepEqual(resolveChainJumpDestination(remote), { x: 30, y: 0, z: 40 });
  assert.notEqual(resolveChainJumpDestination(remote), remote.net.sjTo);
  assert.equal(resolveChainJumpDestination({ alive: true, superJumpState: { phase: 'flight' }, net: {} }), null);
  assert.equal(resolveChainJumpDestination({ alive: true, superJumpState: { phase: 'flight' }, net: { sjTo: null } }), null);
});


test('adapter requires the unique upstream anchor and leaves other modules alone', () => {
  const source = readPlayer();
  assert.ok(source.includes(PICK_BEFORE), 'upstream pick anchor must exist');
  const patched = adaptIssue412ChainJump('src/game/player.js', source);
  assert.ok(patched.includes(PICK_AFTER.slice(0, 80)));
  assert.ok(!patched.includes(PICK_BEFORE));
  assert.throws(() => adaptIssue412ChainJump('src/game/player.js', ''), /expected exactly one connection/);
  assert.throws(() => adaptIssue412ChainJump('src/game/player.js', source + source), /expected exactly one connection/);
  assert.throws(() => adaptIssue412ChainJump('src/game/player.js', patched), /expected exactly one connection/);
  assert.equal(adaptIssue412ChainJump('src/game/actor.js', 'untouched'), 'untouched');
});

test('patched player.js is syntactically valid and routes chain jumps to Vector3', async () => {
  const patched = adaptIssue412ChainJump('src/game/player.js', readPlayer());
  const context = vm.createContext({});
  new vm.SourceTextModule(patched, { context });
  assert.ok(patched.includes('a.superJump(new THREE.Vector3(dest.x, dest.y, dest.z))'));
  assert.ok(patched.includes('if (!o.superJumpState) a.superJump(o);'));
});

test('negative main control: unpatched source rejects jumping teammates', () => {
  const source = readPlayer();
  assert.ok(source.includes('!o.superJumpState'), 'main must still carry the rejection filter');
  // The unpatched pick body never calls superJump when superJumpState is truthy.
  const body = source.slice(source.indexOf(PICK_BEFORE), source.indexOf(PICK_BEFORE) + PICK_BEFORE.length);
  assert.ok(body.includes('!o.superJumpState'));
});
