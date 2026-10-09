import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptCombatRange } from '../combat-range-adapter.mjs';

test('Splattershot range distinct from matchmaking metadata', () => {
  const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url)));
  const s = profile.weapons.shooter;
  assert.equal(s.range, 12.9);
  assert.equal(s.matchmakingRange, 12.9);
  assert.equal(s.combatRange, 11.56);
  assert.ok(s.combatRange < s.range);
});
test('build-only reticle patch leaves other weapons and strict anchors', () => {
  const original = "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n    updateShotGuide(this);";
  const once = (s,old,next)=>{ if(s.split(old).length!==2)throw Error('anchor');return s.replace(old,next); };
  const got = adaptCombatRange('src/game/player.js',original,once);
  assert.match(got,/isShooterRange/);
  assert.match(got,/isShooterRange \? 0 : 0\.5/);
  assert.equal(adaptCombatRange('src/ui/menus.js',original,once),original);
  assert.throws(()=>adaptCombatRange('src/game/player.js','different',once),/anchor/);
});
