import test from 'node:test';
import assert from 'node:assert/strict';
import { bossVolleyAdmission } from '../runtime/weapons-fidelity.mjs';
const fresh = () => ({ hp:1000, visible:true, invuln:false, dead:false, match:{state:'playing'} });
const attacker = { remote:false };
test('#949 invulnerable, hidden, finished and defeated Boss cannot consume damage-group maximum',()=>{
  const boss=fresh();
  assert.equal(bossVolleyAdmission(boss,attacker,null),true);
  boss.invuln=true; assert.equal(bossVolleyAdmission(boss,attacker,null),false);
  boss.invuln=false; boss.visible=false; assert.equal(bossVolleyAdmission(boss,attacker,null),false);
  boss.visible=true;boss.match.state='finish';assert.equal(bossVolleyAdmission(boss,attacker,null),false);
  boss.match.state='playing';boss.dead=true;assert.equal(bossVolleyAdmission(boss,attacker,null),false);
  boss.dead=false;boss.hp=NaN;assert.equal(bossVolleyAdmission(boss,attacker,null),false);
  boss.hp=1000;assert.equal(bossVolleyAdmission(boss,{remote:true},null),false);
  assert.equal(bossVolleyAdmission(boss,attacker,null),true);
});
test('#949 living crablet routes remain valid across Boss shell immunity',()=>{
  const boss=fresh(), crab={id:3,hp:40,dead:false};
  boss.invuln=true;boss.visible=false;
  assert.equal(bossVolleyAdmission(boss,attacker,crab),true);
  crab.dead=true;assert.equal(bossVolleyAdmission(boss,attacker,crab),false);
  crab.dead=false;crab.hp=0;assert.equal(bossVolleyAdmission(boss,attacker,crab),false);
  crab.hp=40;assert.equal(bossVolleyAdmission(boss,attacker,crab),true);
});
