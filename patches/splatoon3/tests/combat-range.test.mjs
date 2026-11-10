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
test('on-target reach is measured at the enemy body, not the terrain behind it', () => {
  const original = "    this.inRange = a.aimPoint.distanceTo(a.pos) <= range + 0.5;\n    updateShotGuide(this);";
  const once = (s,old,next)=>{ if(s.split(old).length!==2)throw Error('anchor');return s.replace(old,next); };
  const body = adaptCombatRange('src/game/player.js',original,once).replace('    updateShotGuide(this);','');
  class V { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
    addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
    distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);} }
  const run = ({ best, onTarget, boss = null }) => {
    const ctl = {}, enemy = { id: 'e' };
    const target = onTarget === 'enemy' ? enemy : onTarget === 'boss' ? boss : null;
    const fn = new Function('a','w','range','start','fwd','best','_v','G','PLAYER','hurtboxRadius', `this.onTarget = arguments[10];\n${body}\nreturn this.inRange;`);
    const a = { pos: new V(0,0,0), aimPoint: new V(0,0,30) }; // terrain far behind the enemy
    return fn.call(ctl, a, { kind: 'shooter', combatRange: 11.56 }, 12.9, new V(0,0,0), new V(0,0,1), best, new V(), { boss }, { radius: 0.5 }, () => 0.5, target);
  };
  // enemy axis 11.9 m away: the body surface (11.4 m) is inside 11.56
  assert.equal(run({ best: 11.9, onTarget: 'enemy' }), true);
  // enemy well outside the reach stays out of range
  assert.equal(run({ best: 13, onTarget: 'enemy' }), false);
  // nothing under the crosshair: the terrain hit (30 m) still decides
  assert.equal(run({ best: 30, onTarget: null }), false);
});
