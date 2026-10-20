import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
async function endpoint(clock,myId){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>clock.ms}});
 const owner=f.make(),victim=f.make();
 Object.assign(owner,{nid:1,owner:'a',netLife:0,team:0});Object.assign(victim,{nid:2,owner:'b',netLife:0,team:1,invuln:0});
 owner.pos.set(0,0,0);victim.pos.set(0,0,2);owner.aimDir.set(0,0,1);owner.weapon={...owner.weapon,sub:'burst'};
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const sent=[],session={myId,hostId:'a',isHost:myId==='a',_members:new Map([['a',{}],['b',{}]]),tr:{sendTo:(_to,p)=>{sent.push(JSON.parse(JSON.stringify(p)));return true;},broadcast:p=>{sent.push(JSON.parse(JSON.stringify(p)));return true;}}};
 const match={actors:[owner,victim],state:'playing',time:180,playing:()=>true};
 const nm=new f.NetMatch(session,{id:'native-sub-commit',map:'reef'});nm.bind(match);session.match=nm;f.G.match=match;f.G.netm=nm;
 return {f,nm,owner,victim,sent};
}
for(const mode of ['valid','missing-seed','missing-charge','foreign','expired'])test(`native sub birth playback ${mode} preserves admission boundary`,async()=>{
 const clock={ms:1000},tx=await endpoint(clock,'a'),rx=await endpoint(clock,'b');
 try{
  assert.ok(tx.f.G.projectiles.throwBomb(tx.owner));assert.equal(tx.nm._sendTick(),true);
  const tick=tx.sent.find(p=>p.k==='t'),birth=tick.e.find(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn');assert.ok(birth);
  if(mode==='missing-seed')delete birth[5].seed;if(mode==='missing-charge')delete birth[5].charge;
  rx.nm.onMessage(mode==='foreign'?'foreign':'a',tick);
  tx.nm.sendHit(tx.owner,tx.victim,35,'burst');const hit=tx.sent.find(p=>p.k==='hit');assert.ok(hit);rx.nm.onMessage('a',hit);
  assert.equal(rx.victim.hp,100,'FIFO alone must not authorize a hit');
  assert.equal(rx.nm._combatProvenance?.proofs.get('a')?.length||0,0,'no proof before native playback');
  const elapsed=mode==='expired'?1:.15;clock.ms+=elapsed*1000;rx.f.G.time+=elapsed;
  rx.nm.update(elapsed);
  if(mode==='valid'){
   assert.equal(rx.victim.hp,65);assert.equal(rx.sent.find(p=>p.k==='hit_ack')?.d,35);
   assert.equal(rx.nm._combatProvenance.proofs.get('a').length,1);
   rx.nm.onMessage('a',tick);rx.nm.onMessage('a',hit);assert.equal(rx.victim.hp,65,'duplicate tick/hit do not redamage');
  }else{
   assert.equal(rx.victim.hp,100);assert.equal(rx.sent.filter(p=>p.k==='hit_ack').length,0);
   if(mode!=='expired')assert.equal(rx.nm._combatProvenance?.proofs.get('a')?.length||0,0);
  }
 }finally{tx.nm.dispose();rx.nm.dispose();tx.f.G.projectiles.clear();rx.f.G.projectiles.clear();}
});
