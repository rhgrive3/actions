import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dualiesInputGate } from '../runtime/weapon-edgecases.mjs';

test('Dualies post-shot gate is a late-bound view of the current input snapshot', () => {
  const runner = { s3DualiesPostShot: 0, _s3DualiesPreparedInput: { fire: true, sub: true, subReleased: true, aim: 12 } };
  const gate = dualiesInputGate(runner);
  assert.equal(gate.fire, true);
  assert.equal(gate.sub, true);
  assert.equal(gate.subReleased, true);
  runner.s3DualiesPostShot = 1 / 60;
  assert.equal(gate.sub, false);
  assert.equal(gate.subReleased, false);
  assert.equal(gate.fire, true);
  assert.equal(gate.aim, 12);
  // The same cached Proxy must follow a new per-tick snapshot without keeping
  // stale own keys from the previous tick.
  runner._s3DualiesPreparedInput = { fire: false, other: 7, sub: true, subReleased: true };
  assert.deepEqual(Object.keys(gate), ['fire', 'other', 'sub', 'subReleased']);
  assert.equal(gate.aim, undefined);
  assert.equal('other' in gate, true);
  assert.equal('aim' in gate, false);
  runner.s3DualiesPostShot = 0;
  assert.equal(gate.sub, true);
  assert.equal(gate.subReleased, true);
});

test('Dualies gate preserves native input writes and descriptor/enumeration semantics', () => {
  const prepared = { fire: true, sub: true, subReleased: false, aim: 1 };
  const runner = { s3DualiesPostShot: 1, _s3DualiesPreparedInput: prepared };
  const gate = dualiesInputGate(runner);
  assert.deepEqual({ ...gate }, { fire: true, sub: false, subReleased: false, aim: 1 });
  gate.aim = 2;
  assert.equal(prepared.aim, 2);
  assert.equal(Object.getOwnPropertyDescriptor(gate, 'fire').enumerable, true);
});

test('HUD guides do not clone the weapon profile on every simulation advance', () => {
  const path = fileURLToPath(new URL('../runtime/weapons-fidelity.mjs', import.meta.url));
  const source = readFileSync(path, 'utf8');
  assert.doesNotMatch(source, /p\.s3Weapon\s*=\s*\{\s*\.\.\.w\s*\}/);
  assert.match(source, /function computeS3SlosherGuide\(/);
  assert.match(source, /function computeS3BlasterGuide\(/);
  assert.match(source, /s3DualiesGuides\s*=\s*function/);
});
