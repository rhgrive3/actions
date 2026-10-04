// Focused native-path regression for INKWAVE #412 (chain-jump inheritance).
// Uses the real upstream player.js source plus the standalone issue-412 adapter;
// no gameplay engine is re-implemented. Negative main control: the unpatched
// source must keep rejecting an already-jumping teammate.
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
  PICK_BEFORE,
  PICK_AFTER,
} from '../issue-412-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readPlayer = () => fs.readFileSync(path.join(UPSTREAM, 'src/game/player.js'), 'utf8');

const v3 = (x, y, z) => ({ x, y, z, isVector3: true, clone() { return v3(this.x, this.y, this.z); } });
const liveActor = (over = {}) => ({
  alive: true,
  pos: v3(over.x ?? 1, over.y ?? 0, over.z ?? 2),
  superJumpState: null,
  ...over,
});

test('pure resolver inherits committed destination, never live pos', () => {
  const dest = v3(10, 0, 20);
  const jumper = liveActor({ pos: v3(99, 30, 99), superJumpState: { phase: 'flight', to: dest } });
  const out = resolveChainJumpDestination(jumper);
  assert.deepEqual(out, { x: 10, y: 0, z: 20 });
  assert.notEqual(out, dest);
  // Mutating the returned snapshot must not move the committed destination.
  out.x = -1;
  assert.equal(dest.x, 10);
});

test('pure resolver follows A->B->C chain and rejects cycles/dead targets', () => {
  const destC = v3(7, 0, 8);
  const c = liveActor({ pos: v3(7, 0, 8), superJumpState: { phase: 'flight', to: destC } });
  const b = liveActor({ pos: v3(50, 20, 50), superJumpState: { phase: 'charge', target: c } });
  assert.deepEqual(resolveChainJumpDestination(b), { x: 7, y: 0, z: 8 });
  // Charge-phase hop without a committed destination stays null (no live pos).
  const d = liveActor({ pos: v3(3, 0, 4), superJumpState: null });
  const e = liveActor({ pos: v3(60, 10, 60), superJumpState: { phase: 'charge', target: d } });
  assert.equal(resolveChainJumpDestination(e), null);
  // Cycle A->B->A is invalid, not live-tracked.
  const a = liveActor({ pos: v3(0, 0, 0) });
  const bb = liveActor({ pos: v3(5, 5, 5) });
  a.superJumpState = { phase: 'charge', target: bb };
  bb.superJumpState = { phase: 'charge', target: a };
  assert.equal(resolveChainJumpDestination(a), null);
  // Dead teammate stays unselectable even with jump state.
  assert.equal(resolveChainJumpDestination(liveActor({ alive: false, superJumpState: { phase: 'flight', to: destC } })), null);
  // Ordinary (non-jumping) teammate returns null: caller keeps the normal path.
  assert.equal(resolveChainJumpDestination(liveActor()), null);
  assert.equal(isChainJumpTarget(b), true);
  assert.equal(isChainJumpTarget(liveActor()), false);
  assert.deepEqual(resolveIssue412Destination(b), { x: 7, y: 0, z: 8 });
});

test('pure resolver honors remote snapshot sjTo without live identity', () => {
  const remote = { alive: true, superJumpState: { phase: 'flight' }, net: { sjTo: v3(30, 0, 40) } };
  assert.deepEqual(resolveChainJumpDestination(remote), { x: 30, y: 0, z: 40 });
  const remoteNoDest = { alive: true, superJumpState: { phase: 'flight' }, net: {} };
  assert.equal(resolveChainJumpDestination(remoteNoDest), null);
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
