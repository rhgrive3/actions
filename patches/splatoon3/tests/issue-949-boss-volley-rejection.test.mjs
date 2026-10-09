import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bossBudgetEligible } from '../runtime/weapons-fidelity.mjs';
import { groupDamage } from '../runtime/weapons.mjs';

const attacker={remote:false,alive:true};
function boss(){
  const b={visible:true,dead:false,invuln:false,hp:1000,
    match:{state:'playing'},crabs:new Map()};
  b.crabs.set(3,{id:3,hp:50,dead:false});
  return b;
}
test('#949 invulnerable/hidden/dead/wrong-phase Boss does not debit Slosher budget',()=>{
  const b=boss(),budget=new Map();
  for(const [k,value] of [['invuln',true],['visible',false],['dead',true],['hp',0]]){
    const prev=b[k];b[k]=value;
    assert.equal(bossBudgetEligible(b,null,attacker),false,k);
    const admitted=bossBudgetEligible(b,null,attacker)?groupDamage(budget,b,80):0;
    assert.equal(admitted,0);
    assert.equal(budget.size,0);
    b[k]=prev;
  }
  b.match.state='finish';assert.equal(bossBudgetEligible(b,null,attacker),false);
  b.match.state='playing';
  assert.equal(bossBudgetEligible(b,null,attacker),true);
  assert.equal(groupDamage(budget,b,80),80);
  assert.equal(groupDamage(budget,b,100),20);
});
test('#949 crablet accepted only for current live positive finite HP record',()=>{
  const b=boss(),c=b.crabs.get(3);
  assert.equal(bossBudgetEligible(b,c,attacker),true);
  c.dead=true;assert.equal(bossBudgetEligible(b,c,attacker),false);
  c.dead=false;c.hp=Infinity;assert.equal(bossBudgetEligible(b,c,attacker),false);
  c.hp=50;b.crabs.set(3,{...c});assert.equal(bossBudgetEligible(b,c,attacker),false);
  assert.equal(bossBudgetEligible(b,null,{remote:true}),false);
});
test('#949 actual fidelity Boss impact checks eligibility before groupDamage',()=>{
  const source=fs.readFileSync(fileURLToPath(new URL('../runtime/weapons-fidelity.mjs',import.meta.url)),'utf8');
  const start=source.indexOf("Projectiles.prototype._bossImpact=function");
  assert.ok(start>0);
  const body=source.slice(start,source.indexOf('Projectiles.prototype._blastBurst',start));
  assert.match(body,/eligible=w.kind!==\x27slosher\x27\|\|bossBudgetEligible/);
  assert.match(body,/eligible\?groupDamage\(/);
  assert.ok(body.indexOf('eligible?groupDamage')<body.indexOf('context.G.boss.hit'));
});
