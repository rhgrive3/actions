import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {combatWorld} from '../../reliability/tests/combat-integration-fixture.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url)));
let worlds=0;
async function world(owner){
  const w=await combatWorld(owner,{network:true});
  const {installWeaponsFidelity}=await import(`../runtime/weapons-fidelity.mjs?wire1150-${++worlds}`);
  installWeaponsFidelity(w,profile);w.attacker.setWeapon('slosher');
  w.G.projectiles=new w.Projectiles(new w.THREE.Scene());
  w.G.projectiles._muzzle=(_a,out)=>out.set(0,1,0);
  return w;
}
function volley(w){w.G.projectiles.fireSlosh(w.attacker,w.WEAPONS.slosher);return w.G.projectiles.list.at(-1);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

for(const amounts of [[70,70],[50,70],[70,50],[30.39,34.31]])test(`#1150 native emitted volley ${amounts} has identical local and online damage`,async t=>{
  const a=await world('A'),b=await world('B'),local=await world('A');
  t.after(()=>{a.dispose();b.dispose();local.dispose();});
  local.victim.owner='A';local.victim.remote=false;
  const p=volley(a),q=volley(local);assert.equal(typeof p.s3DamageGroupId,'string');
  for(const damage of amounts){
    local.applyProjectileHit(local.G.projectiles,q,local.victim,damage,local.victim.pos);
    a.applyProjectileHit(a.G.projectiles,p,a.victim,damage,a.victim.pos);
    const packet=a.wire.at(-1).data;assert.equal(packet.g,p.s3DamageGroupId);assert.equal(packet.l,a.victim.netLife);
    b.net.onMessage('A',packet);b.net.onMessage('A',packet);
  }
  const total=Math.floor(Math.max(...amounts)*10+1e-9)/10;
  close(local.victim.hp,100-total);close(b.victim.hp,100-total);assert.equal(b.victim.alive,true);
  const next=volley(a);assert.notEqual(next.s3DamageGroupId,p.s3DamageGroupId);
  a.applyProjectileHit(a.G.projectiles,next,a.victim,10,a.victim.pos);b.net.onMessage('A',a.wire.at(-1).data);
  close(b.victim.hp,90-total);
});

test('#1150 rejected, forged, reordered, stale-life and restarted-match hits preserve ownership',async t=>{
  const a=await world('A'),b=await world('B');t.after(()=>{a.dispose();b.dispose();});
  const p=volley(a);a.applyProjectileHit(a.G.projectiles,p,a.victim,70,a.victim.pos);const packet=a.wire.at(-1).data;
  b.net.onMessage('forged-peer',packet);assert.equal(b.victim.hp,100);
  b.victim.invuln=1;b.net.onMessage('A',packet);assert.equal(b.victim.hp,100);
  b.victim.invuln=0;b.net.onMessage('A',{...packet,h:packet.h+1,seq:packet.seq+1});assert.equal(b.victim.hp,30);
  b.net.onMessage('A',{...packet,d:50});assert.equal(b.victim.hp,30);
  b.victim.spawnAt(b.victim.pos.clone(),0);b.victim.invuln=0;
  b.net.onMessage('A',packet);assert.equal(b.victim.hp,100,'late request cannot cross the native respawn life');
  b.net.onMessage('A',{...packet,g:undefined,l:b.victim.netLife});assert.equal(b.victim.hp,100);
  b.G.projectiles.clear();assert.equal(b.G.projectiles._s3SlosherOwnerGroups.size,0);
  b.net.onMessage('A',{...packet,h:packet.h+2,seq:packet.seq+2,l:b.victim.netLife});assert.equal(b.victim.hp,30,'new match ledger is independent');
});
