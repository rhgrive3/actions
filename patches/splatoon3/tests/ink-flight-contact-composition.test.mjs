import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';

const rel = 'src/game/inkFlightRuntime.js';
const native = fs.readFileSync(new URL('../../../inkwave-public/src/game/inkFlightRuntime.js', import.meta.url), 'utf8');

test('#656/#929/#939 production InkFlight bridge retains sourced teammate contact without replacing head/drop motion', () => {
  const compiled = adaptSource(rel, native);
  assert.match(compiled, /Number\.isFinite\(p\.fidelityFriendThrough\)/);
  assert.match(compiled, /previousAge \+ INK_DT \* t/);
  assert.match(compiled, /target\.team !== p\.team/);
  assert.match(compiled, /advanceInkFrame\(p, p\.inkProfile\)/, 'head uses the existing source integrator');
  assert.match(compiled, /this\.emitAlong\(p, length, stop/, 'intermediate paint remains owned by InkFlight');
  assert.match(compiled, /if \(target\)/);
  assert.ok(!compiled.includes('if (!actor.alive || actor.team === p.team) continue;'));
  assert.throws(() => adaptSource(rel, compiled), /ink flight S3 team contact eligibility/,
    'duplicate build transforms are rejected, never double-applied');
});
