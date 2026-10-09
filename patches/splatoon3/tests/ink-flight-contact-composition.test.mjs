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
  assert.match(compiled, /advanceFidelityWallDrop\(this\.system, p, dt\)/, 'retained wall-drop runs on the same head');
  assert.match(compiled, /beginFidelityWallDrop\(this\.system, p, world\)/, 'first wall contact enters the sourced phase');
  assert.match(compiled, /!target && !boss && world\.hit/, 'actor and boss contacts cannot enter wall-drop');
  assert.match(compiled, /import \{ beginFidelityWallDrop, advanceFidelityWallDrop \}/, 'reuses the installed S3 owner');
  assert.throws(() => adaptSource(rel, compiled), /conflict/,
    'duplicate build transforms are rejected, never double-applied');
});
