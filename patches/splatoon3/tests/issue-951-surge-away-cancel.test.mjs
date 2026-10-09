import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancelSurgeOnAway } from '../runtime/movement.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
test('#951 away-wall path is composed before native detach, but valid wall Roll still has priority', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/actor.js'), 'utf8');
  const code = adaptSource('src/game/actor.js', raw);
  assert.ok(code.includes('if (into < P.climbDetachDot && !wallRollRequested(this, jumpPressed, h.normal))'));
  assert.match(code, /cancelSurgeOnAway\(this\);\s+this\._setClimb\(false\);\s+this\.vel\.set\(h\.normal\.x \* 3\.2/);
});
test('#951 cancelling burst removes exactly its associated action armor', () => {
  const burst = { phase:'burst', time:16/60, armorTime:0.3, armorHP:30 };
  const unrelated = { phase:'roll', armorTime:0.5 };
  const a={s3:{actions:{surge:burst,armor:burst,roll:unrelated},surge:burst,roll:unrelated},anim:{surgeCharge:0.5}};
  assert.equal(cancelSurgeOnAway(a),true);
  assert.equal(a.s3.actions.surge,null);
  assert.equal(a.s3.actions.armor,null);
  assert.equal(a.s3.surge,null);
  assert.equal(a.s3.actions.roll,unrelated);
  assert.equal(a.anim.surgeCharge,0);
  assert.equal(cancelSurgeOnAway(a),false,'repeated detaches are idempotent');
});
test('#951 unrelated armor remains after cancellation', () => {
  const burst={phase:'charge',charge:0.4}, armor={phase:'roll',armorTime:0.3};
  const a={s3:{actions:{surge:burst,armor},surge:burst},anim:{surgeCharge:0.4}};
  cancelSurgeOnAway(a);
  assert.equal(a.s3.actions.armor,armor);
});
